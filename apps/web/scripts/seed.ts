/**
 * seed — idempotent seed of the ten prototype journeys and their thirty-three pages.
 *
 * Factory pattern (CLAUDE.md §3.3, "Factory: test fixtures, seed data"): builds
 * `journeys`, `media` and `pages` documents from `seed-data.ts`'s typed
 * constant, upserting by a natural key (a journey's `slug`; a page's
 * `journey` + `title`; a media item's `journey` + the placeholder label
 * stashed in `alt`) so running it twice leaves the same ten journeys and
 * thirty-three pages, not twenty and sixty-six.
 *
 * Every photo slot gets a real `media` document whose file is a PNG
 * rasterisation (via `sharp`, already a dependency of this app) of
 * `stripedPlaceholder`'s SVG (Task 10), labelled with the slot it stands in
 * for (e.g. "TOKYO A1") — `media.upload.mimeTypes` accepts real image files
 * only, and `pages.slots[].media` is a relationship to one, so a rasterised
 * upload is the only way to attach a placeholder without a schema change.
 *
 * HANDOFF-DEVIATION: `pages.kind` is `'notes' | 'frames'` and `pages.journey`
 * is required (apps/web/collections/pages.ts) — there is no first-class way
 * to store a page that belongs to the whole book rather than one journey.
 * The three global pages (Cover, Contents, About) are seeded as `kind:
 * 'notes'` pages on the first journey, ordered before every journey page.
 * See docs/deviations.md §5 for the full rationale and the schema change a
 * follow-up task should make instead.
 *
 * Journeys and pages are created published (`_status: 'published'`), not
 * left as Payload's default draft, since Phase 1's rendering tests read this
 * seeded content and a real diary only renders published journeys.
 *
 * Depends on: `payload` (the collections from Task 6), `sharp`,
 * `stripedPlaceholder` (Task 10), `journeyAccents` from `@travel-diary/tokens`,
 * `journeyId`/`pageId` from `@travel-diary/domain/ids` (Task 4), and
 * `journeySeeds` from `./seed-data.js`.
 */
import type { Payload } from 'payload'
import sharp from 'sharp'
import { journeyId, pageId } from '@travel-diary/domain/ids'
import type { Result } from '@travel-diary/domain/result'
import { journeyAccents } from '@travel-diary/tokens/colour'
import type { Journey, Media, Page } from '../payload-types.js'
import { stripedPlaceholder } from './placeholder.js'
import { journeySeeds, type JourneySeed } from './seed-data.js'

/** Design-box dimensions for each slot role, lifted from the prototype (Task 11 brief). */
const SLOT_SIZE = {
  hero: { width: 1200, height: 900 },
  ephemera: { width: 1200, height: 560 },
  frame: { width: 1000, height: 800 },
} as const

/** Every journey page comes in this fixed order: Notes, Frames I, Frames II. */
const PAGE_TITLES = ['Notes', 'Frames I', 'Frames II'] as const

/** The three pages that belong to the book as a whole, not to one journey. */
const GLOBAL_PAGE_TITLES = ['Cover', 'Contents', 'About'] as const

/**
 * Derives a journey's short uppercase code from its name, e.g. `'Tokyo'` ->
 * `'TOKYO'`, matching the prototype's own `code` field and Task 10's example
 * labels ("TOKYO A1", "BERGEN HERO").
 * @param name - The journey's display name.
 */
const codeOf = (name: string): string => name.toUpperCase().replace(/[^A-Z]/g, '')

/** Three-letter month prefix -> zero-based month index, for {@link parseStartsOn}. */
const MONTH_INDEX: Readonly<Record<string, number>> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
}

/**
 * Derives the sortable `startsOn` date CLAUDE.md §7 requires alongside every
 * free-text `dates` string, by parsing the range's start. Handles both forms
 * the ten journeys use: `"D – D Month YYYY"` (the month/year come from the
 * end) and `"D Month – D Month YYYY"` (Kyoto's `"28 Oct – 6 Nov 2025"` - the
 * start supplies its own month, the end still supplies the year).
 * @param dates - The journey's free-text date range.
 * @returns An ISO date string for the range's start, or `undefined` if
 *   `dates` is not in either recognised form (left for an editor to fill in
 *   by hand, per CLAUDE.md's "leave it empty" rule, rather than guessed at).
 */
const parseStartsOn = (dates: string): string | undefined => {
  const [startPart, endPart] = dates.split('–').map((part) => part.trim())
  if (startPart === undefined || endPart === undefined) return undefined

  const endMatch = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(endPart)
  const endYear = endMatch?.[3]
  const endMonthName = endMatch?.[2]
  if (endYear === undefined || endMonthName === undefined) return undefined

  const startDayOnly = /^(\d{1,2})$/.exec(startPart)
  const startDayAndMonth = /^(\d{1,2})\s+([A-Za-z]+)$/.exec(startPart)
  const startDay = startDayOnly?.[1] ?? startDayAndMonth?.[1]
  const startMonthName = startDayAndMonth?.[2] ?? endMonthName
  /* c8 ignore next -- every one of the ten real journeys' `dates` strings
   * matches `startDayOnly` or `startDayAndMonth`; this guards a third,
   * unrecognised form rather than throwing. */
  if (startDay === undefined) return undefined

  const month = MONTH_INDEX[startMonthName.slice(0, 3).toLowerCase()]
  /* c8 ignore next -- every real journey's month name is a full English
   * month name or a recognised three-letter abbreviation (Kyoto's "Oct"/
   * "Nov"); this guards an unrecognised month name rather than throwing. */
  if (month === undefined) return undefined

  return new Date(Date.UTC(Number(endYear), month, Number(startDay))).toISOString()
}

/**
 * Picks a journey's accent tint: its own explicit prototype value if it has
 * one, otherwise a round-robin over `packages/tokens`' five `journeyAccents`
 * by position in the seed list.
 * @param seedJourney - The journey's seed data.
 * @param index - Its position in `journeySeeds`.
 */
const accentFor = (seedJourney: JourneySeed, index: number): string =>
  // `noUncheckedIndexedAccess` cannot see that `index % journeyAccents.length`
  // is always in bounds; the fallback to index 0 is unreachable in practice
  // (journeyAccents is a fixed 5-element tuple) but keeps the return type
  // `string`, not `string | undefined`, without a banned `!` assertion.
  seedJourney.accent ?? journeyAccents[index % journeyAccents.length] ?? journeyAccents[0]

/**
 * Unwraps a branding {@link Result}, throwing if it fails. This cannot
 * happen for an id Payload itself just generated (branding only rejects
 * empty/whitespace-only input), but the brand is real, not decorative — it
 * is the seam (CLAUDE.md's value-objects rule) where a bare Payload id
 * becomes the domain's `JourneyId`/`PageId`, so a `JourneyId` can never be
 * passed where a `PageId` belongs.
 * @param result - The branding function's `Result`.
 * @throws {Error} When `result` is an `err` — an invariant violation, not a
 *   condition callers of `seed` are expected to handle.
 */
const brandOrThrow = <T>(result: Result<T, string>): T => {
  /* c8 ignore next -- see this function's own note: unreachable for an id
   * Payload itself just generated. */
  if (!result.ok) throw new Error(result.error)
  return result.value
}

/**
 * Renders a `stripedPlaceholder` SVG to a PNG buffer Payload's upload
 * collection can store — `media.upload.mimeTypes` does not include
 * `image/svg+xml` (SECURITY.md: SVG uploads are rejected outright).
 * @param label - The slot label drawn on the placeholder, e.g. `"TOKYO A1"`.
 * @param tint - The journey's accent colour.
 * @param size - The placeholder's pixel dimensions.
 */
const renderPlaceholderPng = async (
  label: string,
  tint: string,
  size: { readonly width: number; readonly height: number },
): Promise<Buffer> => {
  const dataUri = stripedPlaceholder({ label, tint, width: size.width, height: size.height })
  const svg = decodeURIComponent(dataUri.slice('data:image/svg+xml,'.length))
  return sharp(Buffer.from(svg)).png().toBuffer()
}

/**
 * Finds or creates the one `media` document for a photo slot, keyed by
 * `journey` + the placeholder label stashed in `alt` (the prototype supplies
 * no real alt text for these slots, so `alt` is free to serve as the natural
 * idempotency key rather than duplicating `caption`).
 * @param payload - The Payload instance.
 * @param journeyNumericId - The owning journey's Payload id.
 * @param label - The slot's placeholder label, e.g. `"TOKYO A1"`.
 * @param caption - The slot's real caption, verbatim from the prototype (empty for ephemera).
 * @param tint - The journey's accent colour.
 * @param size - The placeholder's pixel dimensions.
 * @param order - The slot's position among its journey's media.
 * @returns The `media` document's Payload id.
 */
const upsertSlotMedia = async (
  payload: Payload,
  journeyNumericId: Journey['id'],
  label: string,
  caption: string,
  tint: string,
  size: { readonly width: number; readonly height: number },
  order: number,
): Promise<Media['id']> => {
  const existing = await payload.find({
    collection: 'media',
    where: { and: [{ journey: { equals: journeyNumericId } }, { alt: { equals: label } }] },
    limit: 1,
  })
  const found = existing.docs[0]
  if (found) return found.id

  const png = await renderPlaceholderPng(label, tint, size)
  const filename = `${label.toLowerCase().replace(/\s+/g, '-')}.png`
  const created = await payload.create({
    collection: 'media',
    data: { journey: journeyNumericId, kind: 'still', caption, alt: label, order },
    file: { data: png, mimetype: 'image/png', name: filename, size: png.length },
  })
  return created.id
}

/** One page slot ready to hand to `payload.create`/`payload.update`. */
interface SeededSlot {
  readonly role: 'hero' | 'ephemera' | 'frame'
  readonly media: Media['id']
  readonly caption: string
  readonly focalX: number
  readonly focalY: number
}

/**
 * Builds the Notes page's two slots (hero, ephemera), creating their media.
 * @param payload - The Payload instance.
 * @param journeyNumericId - The owning journey's Payload id.
 * @param code - The journey's uppercase code, e.g. `'TOKYO'`.
 * @param seedJourney - The journey's seed data.
 * @param tint - The journey's accent colour.
 */
const buildNotesSlots = async (
  payload: Payload,
  journeyNumericId: Journey['id'],
  code: string,
  seedJourney: JourneySeed,
  tint: string,
): Promise<readonly SeededSlot[]> => {
  const heroMedia = await upsertSlotMedia(
    payload,
    journeyNumericId,
    `${code} HERO`,
    seedJourney.heroCaption,
    tint,
    SLOT_SIZE.hero,
    0,
  )
  // The prototype's ephemera strip carries no caption of its own - it is a
  // decorative texture, not a photograph with a subject to describe.
  const ephemeraMedia = await upsertSlotMedia(
    payload,
    journeyNumericId,
    `${code} EPHEMERA`,
    '',
    tint,
    SLOT_SIZE.ephemera,
    1,
  )
  return [
    { role: 'hero', media: heroMedia, caption: seedJourney.heroCaption, focalX: 50, focalY: 50 },
    { role: 'ephemera', media: ephemeraMedia, caption: '', focalX: 50, focalY: 50 },
  ]
}

/**
 * Builds one Frames page's slots, creating their media.
 * @param payload - The Payload instance.
 * @param journeyNumericId - The owning journey's Payload id.
 * @param code - The journey's uppercase code, e.g. `'TOKYO'`.
 * @param captions - This page's captions, in slot order.
 * @param slotPrefix - `'A'` for Frames I, `'B'` for Frames II, matching the prototype.
 * @param tint - The journey's accent colour.
 */
const buildFramesSlots = async (
  payload: Payload,
  journeyNumericId: Journey['id'],
  code: string,
  captions: readonly string[],
  slotPrefix: 'A' | 'B',
  tint: string,
): Promise<readonly SeededSlot[]> => {
  const slots: SeededSlot[] = []
  for (const [index, caption] of captions.entries()) {
    const label = `${code} ${slotPrefix}${String(index + 1)}`
    const media = await upsertSlotMedia(payload, journeyNumericId, label, caption, tint, SLOT_SIZE.frame, index)
    slots.push({ role: 'frame', media, caption, focalX: 50, focalY: 50 })
  }
  return slots
}

/**
 * Finds or creates one journey's page (Notes, Frames I or Frames II), keyed
 * by `journey` + `title`.
 * @param payload - The Payload instance.
 * @param journeyNumericId - The owning journey's Payload id.
 * @param title - The page's title, e.g. `'Frames I'`.
 * @param order - The page's position in the book's overall reading order.
 * @param layout - The grid layout this page's slot count implies.
 * @param slots - The page's photo slots.
 * @returns The page's Payload id.
 */
const upsertJourneyPage = async (
  payload: Payload,
  journeyNumericId: Journey['id'],
  title: string,
  order: number,
  layout: 'three-up' | 'four-up' | 'full-bleed' | 'text-spread',
  slots: readonly SeededSlot[],
): Promise<Page['id']> => {
  const kind: 'notes' | 'frames' = title === 'Notes' ? 'notes' : 'frames'
  const existing = await payload.find({
    collection: 'pages',
    where: { and: [{ journey: { equals: journeyNumericId } }, { title: { equals: title } }] },
    limit: 1,
  })
  const found = existing.docs[0]
  // Payload's generated `data` type wants a mutable `slots` array; `slots`
  // itself stays `readonly` at every call site per CLAUDE.md §3.1 (prefer
  // immutable data), so it is copied here, at the one seam that needs mutability.
  const data = {
    journey: journeyNumericId,
    kind,
    title,
    order,
    layout,
    slots: [...slots],
    _status: 'published' as const,
  }
  if (found) {
    const updated = await payload.update({ collection: 'pages', id: found.id, data })
    return updated.id
  }
  const created = await payload.create({ collection: 'pages', data })
  return created.id
}

/**
 * Finds or creates one of the three book-wide pages (Cover, Contents, About).
 * See this module's own HANDOFF-DEVIATION note and docs/deviations.md §5:
 * these are seeded on `firstJourneyNumericId` because `pages.journey` is
 * required and there is no book-level home for them in the current schema.
 * @param payload - The Payload instance.
 * @param firstJourneyNumericId - The first seeded journey's Payload id.
 * @param title - `'Cover'`, `'Contents'` or `'About'`.
 * @param order - The page's position in the book's overall reading order (0–2).
 * @returns The page's Payload id.
 */
const upsertGlobalPage = async (
  payload: Payload,
  firstJourneyNumericId: Journey['id'],
  title: (typeof GLOBAL_PAGE_TITLES)[number],
  order: number,
): Promise<Page['id']> => {
  const existing = await payload.find({
    collection: 'pages',
    where: { and: [{ journey: { equals: firstJourneyNumericId } }, { title: { equals: title } }] },
    limit: 1,
  })
  const found = existing.docs[0]
  // HANDOFF-DEVIATION: attached to the first journey rather than left
  // journey-less, because `pages.journey` is required. See this module's
  // header and docs/deviations.md §5.
  const data = {
    journey: firstJourneyNumericId,
    kind: 'notes' as const,
    title,
    order,
    slots: [],
    _status: 'published' as const,
  }
  if (found) {
    const updated = await payload.update({ collection: 'pages', id: found.id, data })
    return updated.id
  }
  const created = await payload.create({ collection: 'pages', data })
  return created.id
}

/**
 * Finds or creates one journey, keyed by its unique `slug`.
 * @param payload - The Payload instance.
 * @param seedJourney - The journey's seed data.
 * @param accent - The accent tint assigned to this journey (see {@link accentFor}).
 * @returns The journey's Payload id.
 */
const upsertJourney = async (payload: Payload, seedJourney: JourneySeed, accent: string): Promise<Journey['id']> => {
  const data = {
    name: seedJourney.name,
    place: seedJourney.place,
    slug: seedJourney.slug,
    dates: seedJourney.dates,
    startsOn: parseStartsOn(seedJourney.dates) ?? null,
    weather: seedJourney.weather,
    mood: seedJourney.mood,
    weatherGlyph: seedJourney.weatherGlyph,
    furniture: {
      signoff: seedJourney.signoff,
      stampCountry: seedJourney.stampCountry,
      stampValue: seedJourney.stampValue,
      accent,
    },
    highlights: seedJourney.highlights.map((text) => ({ text })),
    note: seedJourney.note,
    tally: seedJourney.tally.map(({ key, value }) => ({ key, value })),
    _status: 'published' as const,
  }

  const existing = await payload.find({
    collection: 'journeys',
    where: { slug: { equals: seedJourney.slug } },
    limit: 1,
  })
  const found = existing.docs[0]
  if (found) {
    const updated = await payload.update({ collection: 'journeys', id: found.id, data })
    return updated.id
  }
  const created = await payload.create({ collection: 'journeys', data })
  return created.id
}

/**
 * Seeds the ten journeys the prototype ships with, their thirty-three pages
 * (three per journey, plus the book's Cover, Contents and About), and every
 * photo slot's placeholder media. Upserts throughout, so calling this twice
 * leaves the same ten journeys and thirty-three pages.
 * @param payload - The Payload instance to seed.
 */
export const seed = async (payload: Payload): Promise<void> => {
  let firstJourneyNumericId: Journey['id'] | undefined

  for (const [index, seedJourney] of journeySeeds.entries()) {
    const accent = accentFor(seedJourney, index)
    const journeyNumericId = await upsertJourney(payload, seedJourney, accent)
    firstJourneyNumericId ??= journeyNumericId
    // Branded and discarded here deliberately: this is the seam where a bare
    // Payload id becomes this journey's JourneyId (see brandOrThrow's own
    // note). Nothing downstream in this module needs the branded value
    // itself, since every call below re-keys by the Payload id Payload's own
    // relationship fields expect - but the brand still runs, so a malformed
    // id would fail loudly here rather than silently reach a page or a
    // media document.
    brandOrThrow(journeyId(String(journeyNumericId)))

    const code = codeOf(seedJourney.name)

    const notesSlots = await buildNotesSlots(payload, journeyNumericId, code, seedJourney, accent)
    const frameOneSlots = await buildFramesSlots(
      payload,
      journeyNumericId,
      code,
      seedJourney.frameOneCaptions,
      'A',
      accent,
    )
    const frameTwoSlots = await buildFramesSlots(
      payload,
      journeyNumericId,
      code,
      seedJourney.frameTwoCaptions,
      'B',
      accent,
    )

    const baseOrder = GLOBAL_PAGE_TITLES.length + index * PAGE_TITLES.length
    const notesPageId = await upsertJourneyPage(
      payload,
      journeyNumericId,
      'Notes',
      baseOrder,
      'text-spread',
      notesSlots,
    )
    brandOrThrow(pageId(String(notesPageId)))
    const frameOnePageId = await upsertJourneyPage(
      payload,
      journeyNumericId,
      'Frames I',
      baseOrder + 1,
      'three-up',
      frameOneSlots,
    )
    brandOrThrow(pageId(String(frameOnePageId)))
    const frameTwoPageId = await upsertJourneyPage(
      payload,
      journeyNumericId,
      'Frames II',
      baseOrder + 2,
      'four-up',
      frameTwoSlots,
    )
    brandOrThrow(pageId(String(frameTwoPageId)))
  }

  /* c8 ignore next -- journeySeeds is a non-empty literal in seed-data.ts, so
   * the loop above always runs at least once and sets this. */
  if (firstJourneyNumericId === undefined) return

  for (const [index, title] of GLOBAL_PAGE_TITLES.entries()) {
    const globalPageId = await upsertGlobalPage(payload, firstJourneyNumericId, title, index)
    brandOrThrow(pageId(String(globalPageId)))
  }
}
