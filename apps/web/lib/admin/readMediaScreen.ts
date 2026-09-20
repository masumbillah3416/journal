/**
 * readMediaScreen — everything SCREENS.md §2.4 draws, in three queries.
 *
 * ═══ THREE QUERIES, WHATEVER THE SIZE OF THE LIBRARY ═══
 *
 * The media, the pages that hold it, and the journeys the dropzone's select
 * offers. The obvious spelling of "and is this one used anywhere" is a read
 * per tile, which is the N+1 CLAUDE.md §6 forbids and which nothing about a
 * ten-journey seed would make visible: `readMediaScreen.integration.test.ts`
 * pins the collections asked about, in order, and takes the reading again with
 * more media in the library.
 *
 * ═══ THIS IS THE ONE SCREEN THAT IS NOT KEYED BY JOURNEY ═══
 *
 * CLAUDE.md §7 keys everything by journey id, and every other admin read here
 * does. §2.4's grid is the library — "Add to — {journey}" is a destination for
 * an upload, not a filter on the list — so the media read is unscoped and each
 * row carries the journey it belongs to instead. Said out loud because a read
 * with no journey clause is the shape §7 exists to make suspicious, and the
 * reason it is right here is that the screen's subject is the library itself.
 *
 * ═══ THE PAGES READ IS OF THE MAIN ROWS, AND THAT IS NOT AN OVERSIGHT ═══
 *
 * `pages` carries `versions: { drafts: true }`, so `readJourneyEditor` passes
 * `draft: true` to see the author's unpublished work. Placement does not need
 * it: `slotMutations.ts`'s four writes all go through `pageMutations.ts`'s
 * `writePageFields`, which writes the live row AND the pending draft in the
 * same call, so the two agree about which photograph is in which cell. Reading
 * main rows also avoids the orphan versions `draft: true` answers with
 * (`readJourneyEditor.ts`'s header, EDITOR-001) — a version whose page row is
 * gone would otherwise contribute placements for a page nobody can open.
 *
 * ═══ THE SEARCH IS SQL AND THE CHIPS ARE MEMORY, DELIBERATELY ═══
 *
 * A filename search is a `like` on a column, so it narrows the query and fewer
 * rows cross the wire (CLAUDE.md §7). Two of the five chips cannot be a `where`
 * at all — `unused` is a fact about an array column on another collection — so
 * all five are applied in memory, together, by
 * `@travel-diary/domain/admin/mediaFilters`. One chip in SQL and four in memory
 * would be two mechanisms for one control row.
 *
 * ═══ WHAT IS NOT PAGINATED, AND WHY THAT IS BOUNDED ═══
 *
 * The media read is `pagination: false`. Design spec §12 puts the corpus at
 * "~100 assets per journey" and the handoff at ten journeys, so this is a
 * thousand narrow rows at the top of the range — and the DOM cost, which is
 * the one CLAUDE.md §6 actually gates, is bounded separately by `MediaGrid`'s
 * virtualization. §2.4 draws no pager, and inventing one is inventing UI the
 * design does not give (CLAUDE.md §4). If the library ever outgrows that, the
 * change is a `limit` here and a control there, together.
 *
 * PATTERNS (CLAUDE.md §3.3): Repository — one module owns how this screen's
 * data is fetched and shaped, and no component sees a Payload document. DTO:
 * {@link MediaScreenView} is the screen's shape, not three collections'.
 *
 * INVARIANT — every row in {@link MediaScreenView.rows} survives both the
 * search and the chip, and `total` counts what the SEARCH admitted, before the
 * chip narrowed it. So "{n} of {total}" is a true sentence about the chip's
 * effect on what the author is looking at, rather than about the whole
 * library: with a search typed, the library's own size is not on this screen
 * at all, because the rows outside the search never crossed the wire.
 * Depends on: `MediaFilter`/`MediaTile`/`matchesMediaFilter`/`MEDIA_FILTERS`
 * (@travel-diary/domain/admin/mediaFilters), `clipDuration`
 * (@travel-diary/domain/gallery), the id brands (@travel-diary/domain/ids),
 * `payload` (types), `AdminScope` (./adminScope).
 */
import type { MediaFilter, MediaTile } from '@travel-diary/domain/admin/mediaFilters'
import { MEDIA_FILTERS, matchesMediaFilter } from '@travel-diary/domain/admin/mediaFilters'
import { clipDuration } from '@travel-diary/domain/gallery'
import { isRowId, journeyId, mediaId, type JourneyId, type MediaId } from '@travel-diary/domain/ids'
import type { Payload } from 'payload'
import type { AdminScope } from './adminScope'

/** What the screen's `searchParams` amount to. */
export interface MediaQuery {
  /** The filename search box's text, trimmed to what was typed. */
  readonly search: string
  /** The pressed chip. `everything` when none is. */
  readonly filter: MediaFilter
}

/** One tile in SCREENS.md §2.4's grid. */
export interface MediaRow extends MediaTile {
  /** The media row, branded. Every bulk action posts these. */
  readonly id: MediaId
  /** The name beneath the tile, in Courier 9.5px. */
  readonly filename: string
  /** The `thumb` derivative's URL, or `null` for an original with no tier. */
  readonly thumbSrc: string | null
  /** What the tile's image says it is, for a reader who cannot see it. */
  readonly alt: string
  /**
   * `'0:24'` for a clip, `null` for a still — the duration chip.
   *
   * THERE IS NO `journey` FIELD, and that is deliberate. §2.4's tile draws a
   * tick box, an "In book" chip, a duration chip and a filename, and nothing
   * that names the journey — so the column is not selected either. A field
   * fetched for no reader is the one `readJourneyEditor.ts`'s `PoolItem`
   * removed for the same reason (CLAUDE.md §3.2, §4, §7). `moveMedia` learns
   * the destination from the author, not from the tile.
   */
  readonly duration: string | null
}

/** One option in the dropzone's "Add to — {journey}" select. */
export interface JourneyChoice {
  /** The journey, branded. The upload's slot request is keyed by it. */
  readonly id: JourneyId
  /** What the option prints. */
  readonly name: string
}

/** Everything SCREENS.md §2.4 draws. */
export interface MediaScreenView {
  /** The tiles the search and the chip admit, in the library's own order. */
  readonly rows: readonly MediaRow[]
  /** How many rows the library holds before either narrowed it. */
  readonly total: number
  /** Every journey an upload can be added to, by name. */
  readonly journeys: readonly JourneyChoice[]
}

/** What one Next.js `searchParams` entry can be. */
type SearchParam = string | readonly string[] | undefined

/**
 * The first value of a `searchParams` entry.
 *
 * Next.js hands an array when the key repeats (`?q=a&q=b`), which is an
 * address anybody can type. `readJourneysScreen.ts` carries the same helper
 * with the same reason — the house treatment for a three-line narrowing, as
 * `orNull` and `rowsOf` already are across the mutation modules.
 * @param value - The entry as Next.js parsed it.
 * @returns The single value, or `undefined` when there is none.
 */
const firstOf = (value: SearchParam): string | undefined => (typeof value === 'string' ? value : value?.[0])

/**
 * The query one address describes.
 *
 * AN UNKNOWN CHIP IS `everything`, not a refusal: `?filter=nonsense` is an
 * address anybody can type, and a 500 for a typo in a query string is worse
 * than the default grid. The offered list is the domain's own, so the chips
 * drawn and the chips accepted cannot drift.
 * @param params - Next.js's own `searchParams`, already awaited.
 * @returns The search text and the chip.
 * @example
 * mediaQuery({ q: 'tokyo', filter: 'clips' }) // { search: 'tokyo', filter: 'clips' }
 */
export const mediaQuery = (params: Readonly<Record<string, SearchParam>>): MediaQuery => {
  const filter = firstOf(params['filter'])
  const offered = MEDIA_FILTERS.find((chip) => chip === filter)
  return { search: firstOf(params['q']) ?? '', filter: offered ?? 'everything' }
}

/**
 * The `thumb` derivative's URL, or `null`.
 *
 * NEVER THE ORIGINAL (CLAUDE.md §6): a grid of a thousand 4000px uploads is
 * the whole library on the wire. An upload too small for the tier has no
 * `thumb` at all, and answering `null` is what keeps the original off it — the
 * tile draws an empty square instead. `readJourneyEditor.ts` answers its pool
 * the same way for the same reason.
 * @param sizes - The derivative map as Payload returned it.
 * @returns The URL, or `null` when there is no such derivative.
 */
const thumbOf = (sizes: { readonly thumb?: { readonly url?: string | null } } | undefined): string | null => {
  const url = sizes?.thumb?.url
  return typeof url === 'string' ? url : null
}

/**
 * A relationship field's row id.
 *
 * Every read here is `depth: 0`, so Payload hands back a bare id — but the
 * generated type still allows the whole document, and a cast that guessed
 * wrong would count no placements at all, silently, which is the arm that
 * decides the `unused` chip. `readJourneyEditor.ts`'s `mediaRowOf` is the same
 * guard one module along.
 * @param value - The relationship as Payload returned it.
 * @returns The row id, or `undefined` when the field is empty.
 */
const rowIdOf = (value: number | { readonly id: number } | null | undefined): number | undefined => {
  if (typeof value === 'number') return value
  /* c8 ignore next -- unreachable at `depth: 0`; see above */
  return value?.id
}

/**
 * How many page slots hold each media row, keyed by the media row id.
 *
 * ONE PASS OVER EVERY PAGE'S `slots`, NOT A QUERY PER TILE. The map is built
 * once and read once per row, so the cost is the number of placements rather
 * than the number of photographs times the number of pages.
 * @param pages - The `pages` rows, with their `slots` arrays.
 * @returns A count per media row id. A row nothing holds is absent, which the
 *   caller reads as zero.
 */
const placementsIn = (
  pages: readonly { readonly slots?: readonly { readonly media?: number | { readonly id: number } | null }[] | null }[],
): ReadonlyMap<number, number> => {
  const counts = new Map<number, number>()
  for (const page of pages) {
    /* c8 ignore next -- Payload answers `[]` for an array field with no rows, never null; the fallback is the type obligation `readJourneyEditor.ts` carries with the same reason. */
    for (const slot of page.slots ?? []) {
      const media = rowIdOf(slot.media)
      if (media === undefined) continue
      counts.set(media, (counts.get(media) ?? 0) + 1)
    }
  }
  return counts
}

/**
 * Everything SCREENS.md §2.4's screen draws.
 *
 * @param payload - The Local API instance. A parameter so the query count is
 *   observable; `readJourneysScreen.ts` gives the reason at length.
 * @param scope - The hoisted {@link AdminScope}, spread into every query.
 * @param query - The search and the chip, from {@link mediaQuery}.
 * @returns The tiles, the library's size, and the journeys an upload can go to.
 * @throws From Payload, when a read is refused by the access rules the scope
 *   switches on — a bug in the guard that admitted the session, not a state a
 *   screen can draw.
 * @example
 * const view = await readMediaScreen(await getPayload(), scope, { search: '', filter: 'everything' })
 */
export const readMediaScreen = async (
  payload: Payload,
  scope: AdminScope,
  query: MediaQuery,
): Promise<MediaScreenView> => {
  const search = query.search.trim()

  const [media, pages, journeys] = await Promise.all([
    payload.find({
      collection: 'media',
      ...scope,
      depth: 0,
      pagination: false,
      sort: 'order',
      select: { filename: true, alt: true, kind: true, durationSec: true, inBook: true, sizes: true },
      // THE SEARCH IS ON THE FILENAME, which is what §2.4's box says it
      // searches and the only text a tile prints. `caption` is not searched
      // here because the grid does not show one; the Galleries screen is where
      // captions are read.
      ...(search === '' ? {} : { where: { filename: { like: search } } }),
    }),
    payload.find({
      collection: 'pages',
      ...scope,
      depth: 0,
      pagination: false,
      // The ONLY column this read wants. Every other field of a page is
      // another screen's (CLAUDE.md §7: select narrowly).
      select: { slots: true },
    }),
    payload.find({
      collection: 'journeys',
      ...scope,
      depth: 0,
      pagination: false,
      sort: 'name',
      select: { name: true },
      // A trashed journey is not somewhere an upload can go.
      where: { deletedAt: { exists: false } },
    }),
  ])

  const placements = placementsIn(pages.docs)

  const rows = media.docs.flatMap((row): readonly MediaRow[] => {
    // `media` carries no `versions` block, so it has no orphan versions to
    // drop. The guard is here so one function has one spelling of "is this a
    // row" — `readJourneyEditor.ts`'s pool loop says the same.
    /* c8 ignore next */
    if (!isRowId(row.id)) return []
    const branded = mediaId(String(row.id))
    /* c8 ignore next -- as above: a positive integer is never an empty string */
    if (!branded.ok) return []

    return [
      {
        id: branded.value,
        // A row Payload stored always has one; the fallback is the type
        // obligation `exactOptionalPropertyTypes` imposes, not a state.
        /* c8 ignore next */
        filename: row.filename ?? '',
        thumbSrc: thumbOf(row.sizes),
        alt: row.alt ?? '',
        kind: row.kind === 'clip' ? 'clip' : 'still',
        duration: row.kind === 'clip' ? clipDuration(row.durationSec ?? undefined) : null,
        inBook: row.inBook === true,
        placements: placements.get(row.id) ?? 0,
      },
    ]
  })

  return {
    rows: rows.filter((row) => matchesMediaFilter(row, query.filter)),
    total: rows.length,
    journeys: journeys.docs.flatMap((journey): readonly JourneyChoice[] => {
      const branded = journeyId(String(journey.id))
      /* c8 ignore next -- Postgres mints integer ids, so the brand cannot refuse one */
      if (!branded.ok) return []
      return [{ id: branded.value, name: journey.name }]
    }),
  }
}
