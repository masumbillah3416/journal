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
 * STILL THREE AFTER TASK 6. The Notes pane edits journey-level columns —
 * `highlights`, `note`, `tally` and `furniture` are on `journeys`, not on
 * `pages` (DATA_MODEL.md) — so they are SELECTED in the journey read rather than
 * fetched by a read of their own. The `select` below is wider than the rail
 * needs and the query count is unchanged, which is the trade CLAUDE.md §7 asks
 * for in both directions: fetch narrowly, and never one query per screen part.
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
 * non-empty string, and `String(null)` is one.
 *
 * ═══ THE RULE, STATED CORRECTLY THIS TIME ═══
 *
 * **A `draft: true` read answers from the versions table whatever the
 * collection.** It is the same API and the same `versions.drafts` config for
 * `journeys` as for `pages`, and an orphaned JOURNEY version comes back with
 * `id: null` exactly as a page's does — measured, with a journey created and its
 * main row removed through `payload.db.deleteOne`:
 *
 * ```text
 * PROBE journeys bySlug(draft)= [{"id":null,"name":"…"}]  byId(draft)= []  plain(no draft)= []
 * ```
 *
 * So THE JOURNEY READ BELOW IS SAFE FOR A DIFFERENT REASON THAN THE ONE THIS
 * HEADER GAVE FOR A ROUND. Its `where` is keyed on `id`, which resolves to the
 * version's `parent`, and a `parent` of `null` cannot equal a positive row id —
 * which is why `byId(draft)` above is empty while `bySlug(draft)` is not.
 *
 * **Any `draft: true` read keyed on a field other than `id` must guard with
 * `isRowId`.** That is the sentence Tasks 6 and 7 need: a pages read filtered by
 * `kind` for the editing pane, a journeys read by `slug` for a nicer address, a
 * "recently edited" list — each of them meets the orphans, and the earlier
 * wording would have told their author they could not.
 *
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
 * {@link JourneyEditorView} is the screen's shape, not three collections'. Its
 * `notes` field is `notesMutations.ts`'s own {@link JourneyNotes} rather than a
 * second interface, so the shape the pane RENDERS and the shape it SAVES cannot
 * drift apart.
 *
 * INVARIANT — `pages` is ascending by `order` and never empty for a journey the
 * admin made, because `pageMutations.ts` refuses to delete the last page. It
 * CAN be empty for a journey created outside that path, and the rail draws that
 * as a rail with no cards rather than throwing.
 * Depends on: `clipDuration` (@travel-diary/domain/gallery), `PageLayout`
 * (@travel-diary/domain/admin/layoutGlyphs), `RailPage`
 * (@travel-diary/domain/admin/pageRail), `Highlight`
 * (@travel-diary/domain/admin/highlights), `TALLY_ROWS`/`TallyCell`/
 * `WeatherGlyph` (@travel-diary/domain/bookBundle), the id brands
 * (@travel-diary/domain/ids), `payload` (types), `AdminScope` (./adminScope),
 * `JourneyNotes` (./notesMutations).
 */
import type { Highlight } from '@travel-diary/domain/admin/highlights'
import { type PageLayout } from '@travel-diary/domain/admin/layoutGlyphs'
import type { RailPage } from '@travel-diary/domain/admin/pageRail'
import { TALLY_ROWS, type TallyCell, type WeatherGlyph } from '@travel-diary/domain/bookBundle'
import { clipDuration } from '@travel-diary/domain/gallery'
import { isRowId, journeyId, mediaId, pageId, rowId, type JourneyId, type MediaId } from '@travel-diary/domain/ids'
import type { Payload } from 'payload'
import type { AdminScope } from './adminScope'
import type { JourneyNotes } from './notesMutations'

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
  /**
   * What the tile's alt text says.
   *
   * THE ONLY TEXT A POOL TILE CARRIES. `caption` was selected, mapped and
   * documented here and read by nothing: §2.3's pool tiles have no caption —
   * that is §2.4's media grid — so it was a column fetched for no reader
   * (CLAUDE.md §3.2, §4, §7). Removed rather than kept "for Task 7", which
   * would have had the next author build a tick box around a field that was
   * never drawn.
   */
  readonly alt: string
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
  /**
   * Everything SCREENS.md §2.3's Notes pane draws.
   *
   * THE SAME SHAPE THE SAVE TAKES — `notesMutations.ts`'s {@link JourneyNotes},
   * not a second interface. A field the pane could render and not save, or save
   * and not render, would need two shapes to exist; one shape means adding a
   * field is one edit.
   *
   * It is JOURNEY-LEVEL and is carried whatever page is selected: `highlights`,
   * `note`, `tally` and `furniture` are columns on `journeys`, not on `pages`
   * (DATA_MODEL.md), and the read is the same read either way.
   */
  readonly notes: JourneyNotes
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
 * A text column as the pane's input needs it.
 *
 * EVERY ONE OF THESE COLUMNS IS NULLABLE, and a `<input value={undefined}>` is
 * an uncontrolled input rather than an empty one — so the read answers `''`
 * here and the pane never has to.
 * @param value - The column as Payload returned it.
 * @returns Its text, or the empty string.
 */
const textOf = (value: string | null | undefined): string => value ?? ''

/**
 * An array field's rows.
 *
 * Payload answers `[]` for an array field with no rows rather than `null`, so
 * the fallback is unreachable against today's collection — it is written rather
 * than cast because the generated type allows `null` and a future `select` or
 * `depth` could produce one. `pageMutations.ts` carries the same helper with
 * the same reason.
 * @param value - The array field as the row held it.
 * @returns Its rows.
 */
const rowsOf = <Value>(value: readonly Value[] | null | undefined): readonly Value[] =>
  /* c8 ignore next -- see above: Payload answers `[]`, never null or undefined */
  value ?? []

/**
 * Which glyph the weather card draws as pressed.
 *
 * The column is a `select` with a `'sun'` default, so Payload fills it on every
 * create and the fallback is for a row written before that default existed
 * rather than for a value the pane can produce — and `'sun'` is what the schema
 * would have given it.
 * @param glyph - The column as Payload returned it.
 * @returns The glyph.
 */
const glyphOf = (glyph: WeatherGlyph | null | undefined): WeatherGlyph =>
  /* c8 ignore next -- see above: the schema default fills this on every create */
  glyph ?? 'sun'

/**
 * The journey's accent, never the empty string.
 *
 * {@link glyphOf}'s treatment, one field along and for a sharper reason. The
 * column carries `defaultValue: '#3d817e'`, so this is for a row whose
 * `furniture` was explicitly cleared rather than one that never had it — and
 * `textOf`'s `''` is not a colour. Handed one, `Furniture.tsx`'s `swatchesFor`
 * draws the exact broken swatch it exists to prevent: an invalid
 * `linear-gradient(160deg, , …)` the browser drops, with its radio checked
 * because `'' === ''`, and a form that then posts an accent `notesMutations.ts`
 * refuses.
 *
 * THE LITERAL IS THE SCHEMA'S, and `readJourneyEditor.integration.test.ts`
 * reads the collection's own `defaultValue` rather than writing `#3d817e` a
 * second time, so the two cannot drift.
 * @param accent - The column as Payload returned it.
 * @returns The accent, or the schema's default where there is none.
 */
const accentOf = (accent: string | null | undefined): string =>
  accent === null || accent === undefined || accent === '' ? '#3d817e' : accent

/**
 * The highlight rows, each carrying the id its `×` and its grip address.
 *
 * BY ID, NEVER BY POSITION (CLAUDE.md §0.9): Payload's own array-row id is what
 * the pane posts back, so the control acts on the row the author pressed rather
 * than on whichever row is now in that slot.
 * @param rows - The `highlights` array as Payload returned it.
 * @returns The rows, in the order they are stored.
 */
const highlightsOf = (
  rows: readonly { readonly text: string; readonly id?: string | null }[] | null | undefined,
): readonly Highlight[] =>
  rowsOf(rows).flatMap((row, index): readonly Highlight[] => {
    const id = row.id
    // Payload's Postgres adapter mints an id for every array row, so this arm
    // is unreachable; the generated type allows `null`, and the answer is a
    // position rather than a dropped row, because dropping it would hide a
    // line the author wrote.
    /* c8 ignore next */
    if (typeof id !== 'string' || id === '') return [{ id: `row-${String(index)}`, text: row.text }]
    return [{ id, text: row.text }]
  })

/**
 * The tally ticket, always `TALLY_ROWS` cells.
 *
 * A FIXED GRID, NOT A LIST. `apps/web/collections/journeys.ts` sets `minRows`
 * AND `maxRows`, and SCREENS.md §2.3's pane draws four rows whatever the journey
 * holds — so a journey stored before that rule, or one created by a path that
 * wrote none, still gets four inputs rather than a pane the author cannot fill.
 * @param rows - The `tally` array as Payload returned it.
 * @returns Exactly `TALLY_ROWS` cells.
 */
const tallyOf = (
  rows: readonly { readonly key?: string | null; readonly value?: string | null }[] | null | undefined,
): readonly TallyCell[] =>
  Array.from({ length: TALLY_ROWS }, (_unused, index) => {
    const cell = rowsOf(rows)[index]
    return { key: textOf(cell?.key), value: textOf(cell?.value) }
  })

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
    // WIDER THAN THE RAIL NEEDS, AND STILL ONE QUERY. Task 6's Notes pane edits
    // journey-level columns, so they are selected here rather than read again:
    // `readJourneyEditor.integration.test.ts` pins the query count at three,
    // and a second read for the pane would fail it.
    select: {
      name: true,
      place: true,
      slug: true,
      dates: true,
      weather: true,
      mood: true,
      weatherGlyph: true,
      highlights: true,
      note: true,
      tally: true,
      furniture: true,
    },
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
      select: { alt: true, kind: true, durationSec: true, inBook: true, sizes: true },
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
    notes: {
      name: journey.name,
      dates: journey.dates,
      weather: textOf(journey.weather),
      mood: textOf(journey.mood),
      weatherGlyph: glyphOf(journey.weatherGlyph),
      highlights: highlightsOf(journey.highlights),
      note: textOf(journey.note),
      tally: tallyOf(journey.tally),
      signoff: textOf(journey.furniture?.signoff),
      stampCountry: textOf(journey.furniture?.stampCountry),
      stampValue: textOf(journey.furniture?.stampValue),
      accent: accentOf(journey.furniture?.accent),
      slug: journey.slug,
    },
    pages: railPages,
    pool,
    inBook: pool.filter((item) => item.inBook).length,
  }
}
