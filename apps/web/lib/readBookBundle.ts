/**
 * readBookBundle — the serialization boundary between Payload and the diary.
 *
 * Repository pattern (CLAUDE.md §3.3): the ONLY place a Payload row becomes
 * diary data. The diary client never learns what a Payload collection looks
 * like - it reads a typed `BookBundle` (`@travel-diary/domain/bookBundle`)
 * and nothing else. This module's own logic is limited to fetching, filtering,
 * sorting and shaping Payload rows into that type; the actual 33-page
 * assembly - Cover, Contents, each journey's three pages, About - is Task 5's
 * `derivePages`/`deriveContents`/`deriveBookmarks`, reused here verbatim
 * (docs/deviations.md §5: Cover/Contents/About are not `pages` rows).
 *
 * Five Payload queries, always, regardless of how many journeys, pages or
 * photographs exist (CLAUDE.md §6, no N+1):
 *   1. `findGlobal('book')` - `journeyOrderMode`, to choose how the journeys
 *      below are sorted before `derivePages` sees them, plus the seven
 *      editor-supplied fields the Cover and Contents pages print
 *      ({@link toBookChrome}). One query, not two: the same global row
 *      already had to be read for the sort order.
 *   2. `find('journeys')` - every published, non-deleted, non-archived
 *      journey, in one query, sorted per (1). This is also where the Notes
 *      page's own content comes from (SCREENS.md §1.3: the weather and mood
 *      lines, the highlights, the note, the tally ticket, the sign-off and
 *      the postage stamp) - all of it lives on the journey row, so it costs
 *      no query of its own.
 *   3. `find('media')` - the gallery census: `journey` and `kind` only, for
 *      every media row of every journey in the book, so each page's footer
 *      count is DERIVED (CLAUDE.md §7) rather than stored. Two columns for
 *      the whole book, not one query per journey.
 *   4. `find('pages')` - every one of those journeys' pages together
 *      (`where: journey in [...]`), not one query per journey.
 *   5. `find('media')` - every media item referenced by any slot in (4)
 *      together (`where: id in [...]`), not one query per slot or per page.
 *      Separate from (3) deliberately: this one carries each row's whole
 *      `sizes` derivative map, which a census must never pay for.
 * Every one of the five sets `depth: 0` explicitly (CLAUDE.md §7: a default
 * depth walks the whole relationship graph on every request) - relationships
 * are resolved by hand from (4)'s raw `journey`/`slots[].media` ids and (5)'s
 * batch, not by Payload's own population. Every query also selects only the
 * fields this module reads (CLAUDE.md §7).
 *
 * Slots resolve to a DERIVATIVE url, never `media.url` (the original) -
 * {@link derivativeUrlFor} walks a role-ordered preference list over
 * `media.sizes` and never falls back to the original. Each slot's own
 * `focalX`/`focalY` travels through unchanged (DATA_MODEL.md: "Focal point
 * lives on the slot, not the media item") - the media item's own focal point
 * is never consulted, matching the slot schema's `defaultValue: 50` (a slot
 * always carries a definite value).
 *
 * A `pages` row is matched to its {@link BookPage} by `kind` + `order`
 * (Task 6 review, finding 1), never by `title`: `title` is free text an
 * editor can rename at any time, `kind` is a fixed enum and `order` is the
 * field DATA_MODEL.md built for sequencing, so a rename can never silently
 * drop a page's photos the way matching on `title` could.
 *
 * `Journey.startsOn` (widened onto the domain type by this task, per Task 5
 * review's carry-forward) DEGRADES rather than throws when a published,
 * non-deleted journey is missing it (Task 6 review, finding 2, reversing
 * this module's original throw-on-missing behaviour): `journeys.startsOn`
 * is not `required: true` in the schema, so a blank field is an ordinary
 * editorial state, not a corrupted row, and this function renders a
 * statically-generated public page - throwing would turn one editor's blank
 * field into an outage of the other nine journeys. `toDomainJourney` falls
 * back to the journey's own `createdAt` (always present, never null) as a
 * deterministic secondary sort key, and logs a single structured warning
 * naming the journey's slug via `payload.logger` - visible, not silent -
 * without ever logging the journey document itself.
 *
 * Depends on: getPayload (./payload); Journey, BookPage, Slot, BookBundle,
 * BookChrome, derivePages, deriveContents, deriveBookmarks
 * (@travel-diary/domain/bookBundle); journeyId (@travel-diary/domain/ids);
 * coverCloths (@travel-diary/tokens/colour), for the one chrome field whose
 * empty value would render nothing at all; the generated Payload types.
 */
import type {
  BookBundle,
  BookChrome,
  BookPage,
  GalleryCounts,
  Journey,
  Slot,
  SlotRole,
} from '@travel-diary/domain/bookBundle'
import { deriveBookmarks, deriveContents, derivePages } from '@travel-diary/domain/bookBundle'
import { journeyId } from '@travel-diary/domain/ids'
import { coverCloths } from '@travel-diary/tokens/colour'
import type {
  Book as PayloadBook,
  Journey as PayloadJourney,
  Media as PayloadMedia,
  Page as PayloadPage,
} from '../payload-types'
import { getPayload } from './payload'

/** `book.journeyOrderMode`'s three values, transcribed from DATA_MODEL.md's globals section. */
type JourneyOrderMode = 'manual' | 'newest' | 'oldest'

/**
 * The exact shape `find('journeys')`'s own `select` below returns - a
 * `Pick`, not the full generated `Journey`, so this module's types are
 * honest about which fields it actually asked Payload for (CLAUDE.md §7:
 * select only the fields needed).
 */
type SelectedJourneyDoc = Pick<
  PayloadJourney,
  | 'id'
  | 'slug'
  | 'name'
  | 'place'
  | 'dates'
  | 'startsOn'
  | 'createdAt'
  | 'hiddenFromBookmarks'
  | 'furniture'
  | 'weather'
  | 'mood'
  | 'weatherGlyph'
  | 'highlights'
  | 'note'
  | 'tally'
>

/**
 * The exact shape the gallery-census `find('media')` below returns: two
 * columns, no `sizes` blob. It is a separate query from the slot-media one
 * precisely so that counting a journey's gallery never drags every media
 * row's derivative map across the wire (CLAUDE.md §7, no over-fetching).
 */
type CensusMediaDoc = Pick<PayloadMedia, 'journey' | 'kind'>

/** The exact shape `find('pages')`'s own `select` below returns. */
type SelectedPageDoc = Pick<PayloadPage, 'id' | 'journey' | 'kind' | 'order' | 'slots'>

/**
 * The exact shape `findGlobal('book')`'s own `select` below returns - the
 * sort mode plus the seven fields the Cover and Contents pages print.
 */
type SelectedBookGlobal = Pick<
  PayloadBook,
  'journeyOrderMode' | 'title' | 'subtitle' | 'owner' | 'coverCloth' | 'yearsShown' | 'contentsNote' | 'showDecorations'
>

/** The exact shape `find('media')`'s own `select` below returns. */
type SelectedMediaDoc = Pick<PayloadMedia, 'id' | 'sizes' | 'alt' | 'caption'>

/**
 * The slice of Payload's own logger this module writes to - a minimal,
 * duck-typed interface rather than importing Pino's types, since a single
 * `warn` call is the only thing this module asks of it.
 */
interface StructuredLogger {
  warn: (mergingObject: Record<string, unknown>, message: string) => void
}

/**
 * The Payload `sort` value for a given {@link JourneyOrderMode}. `'order'` is
 * the admin's manual drag order (secondary `createdAt` for journeys that
 * share no explicit order, so the sort is still deterministic); `'newest'`/
 * `'oldest'` sort by the sortable `startsOn` this task carries alongside
 * `dates`.
 * @param mode - The book global's configured order mode.
 * @returns A Payload `sort` value for `find('journeys')`.
 */
const sortForJourneyOrderMode = (mode: JourneyOrderMode): string[] => {
  switch (mode) {
    case 'newest':
      return ['-startsOn']
    case 'oldest':
      return ['startsOn']
    case 'manual':
      return ['order', 'createdAt']
  }
}

/**
 * Which derivative tiers to try, in preference order, for a slot's role.
 * Every list ends in `'thumb'`, the one tier the seed's placeholder images
 * (all ≤ 1200px) are guaranteed to generate — Payload omits a tier whose
 * target width exceeds the source image's own width (see
 * `getImageResizeAction`), so `frame`/`hero`/`hero2x` are legitimately absent
 * for those fixtures and real, larger production photos are what actually
 * exercises the top of each list.
 */
const DERIVATIVE_PREFERENCE: Readonly<Record<SlotRole, readonly (keyof NonNullable<SelectedMediaDoc['sizes']>)[]>> = {
  hero: ['hero2x', 'hero', 'frame', 'tile', 'thumb'],
  frame: ['frame', 'hero', 'tile', 'thumb'],
  ephemera: ['tile', 'frame', 'thumb'],
}

/**
 * Resolves a media item to a derivative URL, never the original.
 * @param media - The slot's media item (only `sizes` is read).
 * @param role - The slot's role, choosing which tiers to prefer.
 * @returns The first available derivative URL in {@link DERIVATIVE_PREFERENCE}'s order for `role`.
 * @throws {Error} When `media` has no derivative of any tier — a media
 *   pipeline defect (every real upload generates at least `thumb`), not a
 *   condition a caller should silently paper over with the original.
 */
const derivativeUrlFor = (media: SelectedMediaDoc, role: SlotRole): string => {
  for (const tier of DERIVATIVE_PREFERENCE[role]) {
    const url = media.sizes?.[tier]?.url
    if (url !== null && url !== undefined) return url
  }
  throw new Error(`media ${String(media.id)} has no derivative of any tier - never falling back to the original`)
}

/**
 * Converts a Payload `journeys` row into the domain `Journey` shape and
 * brands its id. A missing `startsOn` DEGRADES rather than fails the whole
 * book (Task 6 review, finding 2): it falls back to the journey's own
 * `createdAt` as a deterministic secondary sort key, and a single
 * structured warning naming the journey's slug is logged so the gap is
 * diagnosable rather than silent - never the document itself.
 * @param doc - A `journeys` document from `find`, already filtered to
 *   published, non-deleted, non-archived rows.
 * @param logger - Where the degrade warning is written (`payload.logger`).
 * @returns The domain {@link Journey}.
 * @throws {Error} When `doc.id` cannot be branded - never happens for an id
 *   Payload itself generated, so this is an invariant guard, not a
 *   condition callers are expected to handle.
 */
const toDomainJourney = (doc: SelectedJourneyDoc, gallery: GalleryCounts, logger: StructuredLogger): Journey => {
  const brandedId = journeyId(String(doc.id))
  if (!brandedId.ok) throw new Error(brandedId.error)

  if (doc.startsOn === null || doc.startsOn === undefined) {
    logger.warn(
      { journeySlug: doc.slug },
      'journey has no startsOn; degrading to createdAt as its sort key rather than failing the whole book',
    )
  }
  const startsOn = doc.startsOn ?? doc.createdAt

  return {
    id: brandedId.value,
    slug: doc.slug,
    name: doc.name,
    place: doc.place,
    dates: doc.dates,
    startsOn,
    hiddenFromBookmarks: doc.hiddenFromBookmarks ?? false,
    // Every Notes-page field below is nullable in the schema (none is
    // `required: true`), so an editor who has not filled one in yet is an
    // ordinary state, not a corrupted row: each narrows to an empty string,
    // empty list or the schema's own default, and `Notes.tsx` omits the
    // element rather than printing an empty badge or a bullet with no line
    // after it - the same policy `toBookChrome` applies to the cover.
    weather: doc.weather ?? '',
    mood: doc.mood ?? '',
    weatherGlyph: doc.weatherGlyph ?? 'sun',
    highlights: (doc.highlights ?? []).map((highlight) => highlight.text),
    note: doc.note ?? '',
    tally: (doc.tally ?? []).map((cell) => ({ key: cell.key ?? '', value: cell.value ?? '' })),
    gallery,
    furniture: {
      accent: doc.furniture?.accent ?? '#3d817e',
      signoff: doc.furniture?.signoff ?? '',
      stampCountry: doc.furniture?.stampCountry ?? '',
      stampValue: doc.furniture?.stampValue ?? '',
    },
  }
}

/**
 * Tallies each journey's gallery from a flat census of media rows.
 * `kind` is set by the media pipeline rather than by an author and is
 * nullable until it runs, so anything that is not explicitly a clip counts as
 * a photograph - the reader-facing line says "photographs and clips", and an
 * unclassified still is a photograph, not a third category.
 * @param census - Every media row belonging to any journey in the book, with only `journey` and `kind` selected.
 * @returns Each journey's counts, keyed by its numeric Payload id. A journey with no media at all is absent.
 */
const galleryCountsByJourney = (census: readonly CensusMediaDoc[]): ReadonlyMap<number, GalleryCounts> => {
  const counts = new Map<number, { photographs: number; clips: number }>()
  for (const item of census) {
    if (item.journey === null || item.journey === undefined) continue
    const journeyNumericId = typeof item.journey === 'number' ? item.journey : item.journey.id
    const running = counts.get(journeyNumericId) ?? { photographs: 0, clips: 0 }
    if (item.kind === 'clip') running.clips += 1
    else running.photographs += 1
    counts.set(journeyNumericId, running)
  }
  return counts
}

/** An empty census, for a journey whose media have not been uploaded yet. */
const NO_GALLERY: GalleryCounts = { photographs: 0, clips: 0 }

/**
 * Resolves one `pages` row's slots into the domain {@link Slot} shape.
 * @param page - A `pages` document (raw, `depth: 0` - `slots[].media` is a numeric id).
 * @param mediaById - Every media item any slot in the whole book references, keyed by id.
 * @returns The page's slots, in stored order. A slot whose media id is not
 *   found in `mediaById` (should never happen - every slot's media id came
 *   from this same query's `where`) is skipped rather than thrown, since a
 *   missing photo is not a reason to fail the whole book.
 */
const slotsFor = (page: SelectedPageDoc, mediaById: ReadonlyMap<number, SelectedMediaDoc>): readonly Slot[] =>
  (page.slots ?? []).flatMap((slot): Slot[] => {
    const role = slot.role ?? 'frame'
    const mediaId = typeof slot.media === 'number' ? slot.media : (slot.media?.id ?? undefined)
    const media = mediaId === undefined ? undefined : mediaById.get(mediaId)
    if (media === undefined) return []

    return [
      {
        role,
        src: derivativeUrlFor(media, role),
        alt: slot.alt ?? media.alt ?? '',
        caption: slot.caption ?? media.caption ?? '',
        focalX: slot.focalX ?? 50,
        focalY: slot.focalY ?? 50,
      },
    ]
  })

/**
 * Groups a book's `pages` rows by journey, and within each journey maps
 * each row onto the {@link BookPage} kind `derivePages` gave that position -
 * `'notes'` for the row of `kind: 'notes'`, `'frames-i'`/`'frames-ii'` for
 * the `kind: 'frames'` rows in ascending `order` - rather than by `title`
 * (Task 6 review, finding 1). `title` is free text an editor can rename
 * without warning; `kind` is a fixed enum and `order` is the field
 * DATA_MODEL.md built for sequencing, so neither can silently drift the way
 * matching on `title` could. A journey with more than two `kind: 'frames'`
 * rows contributes only its first two by `order` - `BookPage` has no third
 * frames slot to hold a row beyond that.
 * @param pageDocs - Every page in the book, from `find('pages')`.
 * @returns Every page keyed by `${journeyNumericId}:${kind}`.
 */
const groupPagesByJourneyAndKind = (pageDocs: readonly SelectedPageDoc[]): ReadonlyMap<string, SelectedPageDoc> => {
  const byJourney = new Map<number, SelectedPageDoc[]>()
  for (const page of pageDocs) {
    const journeyNumericId = typeof page.journey === 'number' ? page.journey : page.journey.id
    const journeyPages = byJourney.get(journeyNumericId)
    if (journeyPages === undefined) byJourney.set(journeyNumericId, [page])
    else journeyPages.push(page)
  }

  const byJourneyAndKind = new Map<string, SelectedPageDoc>()
  for (const [journeyNumericId, journeyPages] of byJourney) {
    const sortedByOrder = [...journeyPages].sort((a, b) => a.order - b.order)
    let framesSeen = 0
    for (const page of sortedByOrder) {
      if (page.kind === 'notes') {
        byJourneyAndKind.set(`${String(journeyNumericId)}:notes`, page)
        continue
      }
      if (framesSeen === 0) byJourneyAndKind.set(`${String(journeyNumericId)}:frames-i`, page)
      else if (framesSeen === 1) byJourneyAndKind.set(`${String(journeyNumericId)}:frames-ii`, page)
      framesSeen += 1
    }
  }
  return byJourneyAndKind
}

/**
 * Merges each notes/frames-i/frames-ii {@link BookPage} with its resolved
 * slots, matched to the Payload `pages` row of the same journey and kind.
 * Cover, Contents and About pass through unchanged - they carry no slots.
 * @param pages - `derivePages`'s output, the 33-page reading sequence.
 * @param pagesByJourneyAndKind - Every journey's pages, keyed by `${journeyId}:${kind}` (see {@link groupPagesByJourneyAndKind}).
 * @param mediaById - Every media item any slot references, keyed by id.
 * @returns The same reading sequence, with `slots` attached where a matching row exists.
 */
const withSlots = (
  pages: readonly BookPage[],
  pagesByJourneyAndKind: ReadonlyMap<string, SelectedPageDoc>,
  mediaById: ReadonlyMap<number, SelectedMediaDoc>,
): readonly BookPage[] =>
  pages.map((page): BookPage => {
    if (page.kind !== 'notes' && page.kind !== 'frames-i' && page.kind !== 'frames-ii') return page

    const match = pagesByJourneyAndKind.get(`${page.journeyId}:${page.kind}`)
    if (match === undefined) return page

    return { ...page, slots: slotsFor(match, mediaById) }
  })

/**
 * Narrows the `book` global's optional text fields into the definite
 * {@link BookChrome} the pages read. Every one of them is nullable in the
 * schema (none is `required: true`), so an editor clearing a field is an
 * ordinary state rather than a corrupted row - each becomes `''`, and
 * `Cover.tsx` omits the line rather than printing a label with nothing after
 * it. `coverCloth` is the one field with a non-empty fallback: it is a
 * background colour, and an empty string would render no cloth at all, so it
 * falls back to the handoff's default cloth (`coverCloths`' first entry).
 * @param doc - The `book` global, as `findGlobal` returns it.
 * @returns The chrome the Cover and Contents pages print.
 */
const toBookChrome = (doc: SelectedBookGlobal): BookChrome => ({
  title: doc.title ?? '',
  subtitle: doc.subtitle ?? '',
  owner: doc.owner ?? '',
  coverCloth: doc.coverCloth ?? coverCloths[0],
  yearsShown: doc.yearsShown ?? '',
  contentsNote: doc.contentsNote ?? '',
  showDecorations: doc.showDecorations ?? true,
})

/**
 * Assembles the diary's `BookBundle` from Payload: the reading sequence
 * (Cover, Contents, each journey's three pages with their resolved photo
 * slots, About), the Contents index, and the bookmark rail. See this
 * module's own header for the four-query shape and depth/select policy.
 * @returns The full {@link BookBundle}.
 * @throws {Error} When a slot's media has no derivative of any tier - a
 *   boundary invariant this function enforces rather than passing through
 *   broken. A missing `startsOn` no longer throws (Task 6 review, finding
 *   2) - see {@link toDomainJourney}.
 */
export const readBookBundle = async (): Promise<BookBundle> => {
  const payload = await getPayload()

  const book = await payload.findGlobal({
    slug: 'book',
    depth: 0,
    select: {
      journeyOrderMode: true,
      title: true,
      subtitle: true,
      owner: true,
      coverCloth: true,
      yearsShown: true,
      contentsNote: true,
      showDecorations: true,
    },
  })
  const sort = sortForJourneyOrderMode(book.journeyOrderMode ?? 'manual')

  const journeysResult = await payload.find({
    collection: 'journeys',
    depth: 0,
    pagination: false,
    limit: 1000,
    sort,
    // Explicit `_status: 'published'` (Task 6 review, finding 4 - corrected,
    // not merely documented): finding 4 as originally raised assumed `find()`
    // without `draft: true` already excludes drafts, because a draft-only
    // journey's `journeys` table row genuinely does not exist (verified
    // directly against Postgres - only the versions table holds it). But
    // Payload's Local API `find()` does not read the main table alone for a
    // `versions.drafts`-enabled collection; it surfaces the current state of
    // every document, draft-only ones included, with `_status: 'draft'` on
    // the result (verified the same way: a draft-only fixture journey came
    // back from `find()` with no `draft: true` passed). Without this filter,
    // an unpublished draft would appear in the public book.
    where: {
      and: [
        { _status: { equals: 'published' } },
        { deletedAt: { equals: null } },
        { archived: { not_equals: true } },
      ],
    },
    select: {
      slug: true,
      name: true,
      place: true,
      dates: true,
      startsOn: true,
      createdAt: true,
      hiddenFromBookmarks: true,
      furniture: true,
      weather: true,
      mood: true,
      weatherGlyph: true,
      highlights: true,
      note: true,
      tally: true,
    },
  })
  const journeyNumericIds = journeysResult.docs.map((doc) => doc.id)

  // The gallery census: one query for the whole book, two columns wide. It
  // is deliberately NOT folded into the slot-media query below - that one is
  // keyed by the slot media ids and carries every row's `sizes` map, and
  // widening it to "every media row of every journey" to save a round trip
  // would pull a derivative map per photograph for a number this page prints
  // as two integers (CLAUDE.md §7, fetch narrowly).
  const censusResult = await payload.find({
    collection: 'media',
    depth: 0,
    pagination: false,
    limit: 20_000,
    where: { journey: { in: journeyNumericIds } },
    select: { journey: true, kind: true },
  })
  const galleryByJourney = galleryCountsByJourney(censusResult.docs)

  const journeys = journeysResult.docs.map((doc) =>
    toDomainJourney(doc, galleryByJourney.get(doc.id) ?? NO_GALLERY, payload.logger),
  )

  const pagesResult = await payload.find({
    collection: 'pages',
    depth: 0,
    pagination: false,
    limit: 5000,
    where: { journey: { in: journeyNumericIds } },
    select: { journey: true, kind: true, order: true, slots: true },
  })

  const mediaIds = [
    ...new Set(
      pagesResult.docs.flatMap((page) =>
        (page.slots ?? []).flatMap((slot) => (typeof slot.media === 'number' ? [slot.media] : [])),
      ),
    ),
  ]
  // `where: { id: { in: [] } }` is a valid, cheap query that returns zero
  // docs (verified against Postgres directly) - no special-casing an empty
  // `mediaIds` saves a query in a "book with no photos at all" case that
  // never occurs in practice, at the cost of an untestable branch.
  const mediaResult = await payload.find({
    collection: 'media',
    depth: 0,
    pagination: false,
    limit: 5000,
    where: { id: { in: mediaIds } },
    select: { sizes: true, alt: true, caption: true },
  })
  const mediaById = new Map(mediaResult.docs.map((doc) => [doc.id, doc]))

  const pagesByJourneyAndKind = groupPagesByJourneyAndKind(pagesResult.docs)

  const pages = withSlots(derivePages(journeys), pagesByJourneyAndKind, mediaById)

  return {
    pages,
    contents: deriveContents(pages),
    bookmarks: deriveBookmarks(pages),
    chrome: toBookChrome(book),
  }
}
