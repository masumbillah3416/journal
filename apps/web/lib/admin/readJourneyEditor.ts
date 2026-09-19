/**
 * readJourneyEditor — everything SCREENS.md §2.3's journey editor draws, in a
 * fixed number of queries.
 *
 * ═══ THREE QUERIES, NEVER ONE PER PAGE ═══
 *
 * The journey, then its pages and its media pool together. The obvious spelling
 * of "and what is on each page" is a read inside the map, which is the N+1
 * CLAUDE.md §6 forbids and which nothing about a three-page seed would make
 * visible. `readJourneyEditor.integration.test.ts` pins the collections asked
 * about, in order, and takes the same reading again with two more pages in the
 * journey.
 *
 * ═══ IT READS DRAFTS, AND THAT IS THE WHOLE POINT OF THE SCREEN ═══
 *
 * `journeys` and `pages` both carry `versions: { drafts: true }`, and Payload
 * does not write the main row when it saves a draft — so the author's
 * unpublished work exists ONLY in the versions table. An editor that read the
 * main rows would show a reader's copy of the book while the author typed into
 * something else, and Task 6's Save draft would appear to do nothing. So both
 * reads pass `draft: true`, and `apps/web/lib/admin/pageMutations.ts`'s
 * `copyPageRow` reads its source the same way for the same reason.
 *
 * THE `where` STILL RUNS AGAINST THE MAIN ROW, which is what makes the trash
 * check below mean anything: `draft: true` swaps the DOCUMENTS for their newest
 * versions after the query has selected them. `deletedAt` is written to the
 * main row by `journeyMutations.ts`'s `writeJourneyFlag`, so it is the main
 * row's copy that decides whether a journey is in the bin — the same column the
 * trash screen reads.
 *
 * THE RAIL'S SEQUENCE IS `sort: 'order'`, WHICH ORDERS THE MAIN ROWS. What
 * comes back under `draft: true` is each page's newest version, which carries
 * its own `order`, so in principle the clause and the values could disagree.
 * They cannot in practice: `pageMutations.ts`'s `writePageFields` writes the
 * place to the live row AND to the pending draft in the same call, for exactly
 * this reason. A second, in-memory sort was written here first and then removed
 * — nothing this repository can do to a page makes the two `order`s differ, so
 * it was a line no case could fail on, and an unfailable line is the species
 * these standing orders exist to stop.
 *
 * ═══ AND A VERSION WHOSE PAGE IS GONE IS NOT A PAGE ═══
 *
 * The cost of reading drafts, found by a browser sweep and not by anything here
 * (`docs/qa/2026-09-19-journey-editor-sweep.md`, EDITOR-001). `draft: true`
 * answers from `_pages_v`, and the `where` below matches a VERSION's `journey`
 * field — so a version row whose parent page has been removed still matches,
 * and comes back as a document with `id: null`. On the developer's own database
 * that was three phantom cards on the seeded Tokyo journey, all three drawn as
 * selected because they shared the id `'null'`, with arrows posting a sequence
 * Zod then refused.
 *
 * `isRowId` is the guard, and the brand is not: a brand only promises a
 * non-empty string, and `String(null)` is one. THE JOURNEY READ NEEDS NO SUCH
 * GUARD and does not have one — its `where` is `id: { equals: row }`, which
 * `draft: true` still runs against the main table, so an orphan cannot match it.
 * `media` carries no `versions` block at all, and is guarded anyway, because two
 * spellings of "is this a row" in one function is how the next one gets missed.
 *
 * ═══ A MISSING OR TRASHED JOURNEY IS `null`, NOT A THROW ═══
 *
 * `/admin/journeys/999` is an address anybody can type, and a trashed journey
 * is one an author can still have open in a second tab. Both are 404s rather
 * than 500s, so this answers `null` and the route calls `notFound()`.
 * `readJourneysScreen.ts`'s invariant — every row it returns is live — has the
 * same reason: a journey that has been thrown away must not be editable.
 *
 * THE PAYLOAD INSTANCE IS A PARAMETER so the query count is observable, and THE
 * SCOPE IS HANDED IN, NOT FETCHED, because `adminScope` reads the account's row
 * and a module that called it per query would be three `users` lookups per
 * request. Both are `readJourneysScreen.ts`'s reasons, unchanged.
 *
 * PATTERNS (CLAUDE.md §3.3): Repository — one module owns how this screen's
 * data is fetched and shaped, and no component sees a Payload document. DTO:
 * {@link JourneyEditorView} is the screen's shape, not three collections'.
 *
 * INVARIANT — `pages` is ascending by `order` and never empty for a journey the
 * admin made, because `pageMutations.ts` refuses to delete the last page. It
 * CAN be empty for a journey created outside that path, and the rail draws that
 * as a rail with no cards rather than throwing.
 * Depends on: `clipDuration` (@travel-diary/domain/gallery), `PageLayout`
 * (@travel-diary/domain/admin/layoutGlyphs), `RailPage`
 * (@travel-diary/domain/admin/pageRail), the id brands (@travel-diary/domain/ids),
 * `payload` (types), `AdminScope` (./adminScope).
 */
import { type PageLayout } from '@travel-diary/domain/admin/layoutGlyphs'
import type { RailPage } from '@travel-diary/domain/admin/pageRail'
import { clipDuration } from '@travel-diary/domain/gallery'
import { isRowId, journeyId, mediaId, pageId, rowId, type JourneyId, type MediaId } from '@travel-diary/domain/ids'
import type { Payload } from 'payload'
import type { AdminScope } from './adminScope'

/**
 * One card in the rail, plus the layout the picker draws as active.
 *
 * It EXTENDS the domain's {@link RailPage} rather than restating it, so
 * `movePage` takes one of these unchanged. The layout is here and not in the
 * domain type because the rail's ↑ ↓ have no use for it and the picker has no
 * use for anything else.
 */
export interface EditorPage extends RailPage {
  /** The layout this page is laid out with, or `null` where none was chosen. */
  readonly layout: PageLayout | null
}

/** One tile in SCREENS.md §2.3's journey pool. */
export interface PoolItem {
  /** The media row, branded. */
  readonly id: MediaId
  /** The `thumb` derivative's URL, or `null` for an original with no tier. */
  readonly thumbSrc: string | null
  /** What the tile's alt text says. */
  readonly alt: string
  /** The caption beneath it, as the author wrote it. */
  readonly caption: string
  /** `'0:24'` for a clip, `null` for a still — the duration chip. */
  readonly duration: string | null
  /** Whether the tile is ticked: this photograph is in the book. */
  readonly inBook: boolean
}

/** Everything SCREENS.md §2.3's three columns draw. */
export interface JourneyEditorView {
  /** The journey, branded. Every form on the screen carries this. */
  readonly id: JourneyId
  /** The name the rail's eyebrow prints: "Pages in {journey}". */
  readonly name: string
  /** Where the journey went, which the screen's crumb prints. */
  readonly place: string
  /** The rail's cards, ascending by `order`. */
  readonly pages: readonly EditorPage[]
  /** The pool's tiles, in the library's own order. */
  readonly pool: readonly PoolItem[]
  /** How many of the pool are in the book — the "{n} of {total}" eyebrow. */
  readonly inBook: number
}

/**
 * What marks a journey as moved to the trash.
 *
 * `deletedAt` is a plain indexed date column rather than Payload's own `trash`
 * feature, so nothing excludes these rows automatically and this query has to
 * say which side of the line it wants (`readJourneysScreen.ts` says the same).
 */
const LIVE = { deletedAt: { exists: false } } as const

/**
 * A page's layout, narrowed to one the picker offers.
 *
 * The column is a `select` with four options, so Payload's generated type is
 * already that union — this exists to turn its `undefined` into the `null` the
 * view declares, without an assertion CLAUDE.md §0.8 bans.
 * @param layout - The column as Payload returned it.
 * @returns The layout, or `null` where the column is empty.
 */
const layoutOf = (layout: PageLayout | null | undefined): PageLayout | null => layout ?? null

/**
 * The `thumb` derivative's URL, or `null`.
 *
 * NEVER THE ORIGINAL (CLAUDE.md §6): a 2-column tile grid drawn from 4000px
 * uploads is the whole media library on the wire for one sidebar. An upload too
 * small for the tier has no `thumb` at all, and answering `null` is what keeps
 * the original off the wire — the tile draws an empty square instead.
 * @param sizes - The derivative map as Payload returned it.
 * @returns The URL, or `null` when there is no such derivative.
 */
const thumbOf = (sizes: { readonly thumb?: { readonly url?: string | null } } | undefined): string | null => {
  const url = sizes?.thumb?.url
  return typeof url === 'string' ? url : null
}

/**
 * Everything SCREENS.md §2.3's editor draws for one journey.
 *
 * @param payload - The Local API instance the rows live behind. A parameter so
 *   the query count is observable; see this module's header.
 * @param scope - The hoisted {@link AdminScope}, spread into every query.
 * @param id - The journey being edited, branded.
 * @returns The screen's data, or `null` when the address names no live journey.
 * @throws From Payload, when a read is refused by the access rules the scope
 *   switches on — a bug in the guard that admitted the session, not a state a
 *   screen can draw.
 * @example
 * const scope = await adminScope(session)
 * const view = await readJourneyEditor(await getPayload(), scope, journey)
 * if (view === null) notFound()
 */
export const readJourneyEditor = async (
  payload: Payload,
  scope: AdminScope,
  id: JourneyId,
): Promise<JourneyEditorView | null> => {
  const row = rowId(id)
  // Nothing to ask: `/admin/journeys/nonsense` is an address anybody can type,
  // and `Number('nonsense')` reaching the driver escapes as a raw `Failed
  // query` rather than as this screen's own 404.
  if (row === undefined) return null

  const found = await payload.find({
    collection: 'journeys',
    ...scope,
    depth: 0,
    draft: true,
    limit: 1,
    pagination: false,
    select: { name: true, place: true },
    where: { and: [{ id: { equals: row } }, LIVE] },
  })
  const journey = found.docs[0]
  if (journey === undefined) return null

  const [pages, media] = await Promise.all([
    payload.find({
      collection: 'pages',
      ...scope,
      depth: 0,
      draft: true,
      pagination: false,
      sort: 'order',
      select: { title: true, kind: true, order: true, layout: true },
      where: { journey: { equals: row } },
    }),
    payload.find({
      collection: 'media',
      ...scope,
      depth: 0,
      pagination: false,
      sort: 'order',
      select: { alt: true, caption: true, kind: true, durationSec: true, inBook: true, sizes: true },
      where: { journey: { equals: row } },
    }),
  ])

  const railPages = pages.docs.flatMap((page): readonly EditorPage[] => {
    // A VERSION WHOSE PAGE ROW IS GONE. See this module's header: the brand
    // cannot refuse it, because `String(null)` is a non-empty string.
    if (!isRowId(page.id)) return []
    const branded = pageId(String(page.id))
    // Unreachable once the line above has held — a positive integer is never an
    // empty string — and a `flatMap` rather than a `!` because CLAUDE.md §0.8
    // bans the assertion that would hide it.
    /* c8 ignore next */
    if (!branded.ok) return []
    return [
      {
        id: branded.value,
        title: page.title ?? 'Untitled',
        kind: page.kind,
        order: page.order,
        layout: layoutOf(page.layout),
      },
    ]
  })

  const pool = media.docs.flatMap((item): readonly PoolItem[] => {
    // `media` carries no `versions` block, so it has no orphans to drop. The
    // guard is here so one function has one spelling of "is this a row", not
    // because this arm is reachable today — hence the ignore, on its own line
    // because the scanner reads `c8 ignore next` line by line and does not see
    // it inside a block comment that wraps (measured: it reported this line
    // uncovered until the directive was moved out).
    /* c8 ignore next */
    if (!isRowId(item.id)) return []
    const branded = mediaId(String(item.id))
    /* c8 ignore next -- as above: a positive integer is never an empty string */
    if (!branded.ok) return []
    return [
      {
        id: branded.value,
        thumbSrc: thumbOf(item.sizes),
        alt: item.alt ?? '',
        caption: item.caption ?? '',
        duration: item.kind === 'clip' ? clipDuration(item.durationSec ?? undefined) : null,
        inBook: item.inBook === true,
      },
    ]
  })

  const branded = journeyId(String(journey.id))
  /* c8 ignore next -- as above: Postgres mints integer ids */
  if (!branded.ok) return null

  return {
    id: branded.value,
    name: journey.name,
    place: journey.place,
    pages: railPages,
    pool,
    inBook: pool.filter((item) => item.inBook).length,
  }
}
