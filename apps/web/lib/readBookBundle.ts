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
 * Four Payload queries, always, regardless of how many journeys or pages
 * exist (CLAUDE.md §6, no N+1):
 *   1. `findGlobal('book')` - only `journeyOrderMode`, to choose how the
 *      journeys below are sorted before `derivePages` sees them.
 *   2. `find('journeys')` - every published, non-deleted, non-archived
 *      journey, in one query, sorted per (1).
 *   3. `find('pages')` - every one of those journeys' pages together
 *      (`where: journey in [...]`), not one query per journey.
 *   4. `find('media')` - every media item referenced by any slot in (3)
 *      together (`where: id in [...]`), not one query per slot or per page.
 * Every one of the four sets `depth: 0` explicitly (CLAUDE.md §7: a default
 * depth walks the whole relationship graph on every request) - relationships
 * are resolved by hand from (3)'s raw `journey`/`slots[].media` ids and (4)'s
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
 * `Journey.startsOn` (widened onto the domain type by this task, per Task 5
 * review's carry-forward) is validated here, not merely typed: a published,
 * non-deleted journey missing `startsOn` fails loudly rather than silently
 * sorting wrong (CLAUDE.md §7: "validate at the boundary, then trust the
 * type inside").
 *
 * Depends on: getPayload (./payload.js); Journey, BookPage, Slot, BookBundle,
 * derivePages, deriveContents, deriveBookmarks (@travel-diary/domain/bookBundle);
 * journeyId (@travel-diary/domain/ids); the generated Payload types.
 */
import type { BookBundle, BookPage, Journey, Slot, SlotRole } from '@travel-diary/domain/bookBundle'
import { deriveBookmarks, deriveContents, derivePages } from '@travel-diary/domain/bookBundle'
import { journeyId } from '@travel-diary/domain/ids'
import type { Journey as PayloadJourney, Media as PayloadMedia, Page as PayloadPage } from '../payload-types.js'
import { getPayload } from './payload.js'

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
  'id' | 'slug' | 'name' | 'place' | 'dates' | 'startsOn' | 'hiddenFromBookmarks' | 'furniture'
>

/** The exact shape `find('pages')`'s own `select` below returns. */
type SelectedPageDoc = Pick<PayloadPage, 'id' | 'journey' | 'title' | 'slots'>

/** The exact shape `find('media')`'s own `select` below returns. */
type SelectedMediaDoc = Pick<PayloadMedia, 'id' | 'sizes' | 'alt' | 'caption'>

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
 * Converts a Payload `journeys` row into the domain `Journey` shape, brands
 * its id, and validates `startsOn` is present.
 * @param doc - A `journeys` document from `find`, already filtered to
 *   published, non-deleted, non-archived rows.
 * @returns The domain {@link Journey}.
 * @throws {Error} When `doc.id` cannot be branded (never happens for an id
 *   Payload itself generated), or `startsOn` is missing (CLAUDE.md §7: a
 *   free-text `dates` must always travel with a sortable `startsOn`).
 */
const toDomainJourney = (doc: SelectedJourneyDoc): Journey => {
  const brandedId = journeyId(String(doc.id))
  if (!brandedId.ok) throw new Error(brandedId.error)

  if (doc.startsOn === null || doc.startsOn === undefined) {
    throw new Error(
      `journey "${doc.slug}" has dates "${doc.dates}" but no startsOn - CLAUDE.md §7 requires every free-text ` +
        'dates string to travel with a sortable counterpart',
    )
  }

  return {
    id: brandedId.value,
    slug: doc.slug,
    name: doc.name,
    place: doc.place,
    dates: doc.dates,
    startsOn: doc.startsOn,
    hiddenFromBookmarks: doc.hiddenFromBookmarks ?? false,
    furniture: { accent: doc.furniture?.accent ?? '#3d817e' },
  }
}

/** Maps a `pages` row's `title` to the {@link BookPage} kind `derivePages` gave that journey's page. */
const kindForPageTitle = (title: string | null | undefined): 'notes' | 'frames-i' | 'frames-ii' | undefined => {
  if (title === 'Notes') return 'notes'
  if (title === 'Frames I') return 'frames-i'
  if (title === 'Frames II') return 'frames-ii'
  return undefined
}

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
 * Merges each notes/frames-i/frames-ii {@link BookPage} with its resolved
 * slots, matched to the Payload `pages` row of the same journey and kind.
 * Cover, Contents and About pass through unchanged - they carry no slots.
 * @param pages - `derivePages`'s output, the 33-page reading sequence.
 * @param pagesByJourneyAndKind - Every journey's pages, keyed by `${journeyId}:${kind}`.
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
 * Assembles the diary's `BookBundle` from Payload: the reading sequence
 * (Cover, Contents, each journey's three pages with their resolved photo
 * slots, About), the Contents index, and the bookmark rail. See this
 * module's own header for the four-query shape and depth/select policy.
 * @returns The full {@link BookBundle}.
 * @throws {Error} When a journey included in the book is missing `startsOn`,
 *   or a slot's media has no derivative of any tier - both boundary
 *   invariants this function enforces rather than passing through broken.
 */
export const readBookBundle = async (): Promise<BookBundle> => {
  const payload = await getPayload()

  const book = await payload.findGlobal({ slug: 'book', depth: 0, select: { journeyOrderMode: true } })
  const sort = sortForJourneyOrderMode(book.journeyOrderMode ?? 'manual')

  const journeysResult = await payload.find({
    collection: 'journeys',
    depth: 0,
    pagination: false,
    limit: 1000,
    sort,
    where: { and: [{ deletedAt: { equals: null } }, { archived: { not_equals: true } }] },
    select: {
      slug: true,
      name: true,
      place: true,
      dates: true,
      startsOn: true,
      hiddenFromBookmarks: true,
      furniture: true,
    },
  })
  const journeys = journeysResult.docs.map(toDomainJourney)
  const journeyNumericIds = journeysResult.docs.map((doc) => doc.id)

  const pagesResult = await payload.find({
    collection: 'pages',
    depth: 0,
    pagination: false,
    limit: 5000,
    where: { journey: { in: journeyNumericIds } },
    select: { journey: true, title: true, slots: true },
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

  const pagesByJourneyAndKind = new Map(
    pagesResult.docs.flatMap((page): [string, SelectedPageDoc][] => {
      const journeyNumericId = typeof page.journey === 'number' ? page.journey : page.journey.id
      const kind = kindForPageTitle(page.title)
      return kind === undefined ? [] : [[`${String(journeyNumericId)}:${kind}`, page]]
    }),
  )

  const pages = withSlots(derivePages(journeys), pagesByJourneyAndKind, mediaById)

  return {
    pages,
    contents: deriveContents(pages),
    bookmarks: deriveBookmarks(pages),
  }
}
