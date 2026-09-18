/**
 * pageMutations — what SCREENS.md §2.3's page rail does to the database, and
 * the Zod parses that stand between a `POST` and it.
 *
 * ═══ WHY THE DECISIONS ARE HERE AND NOT IN `actions.ts` ═══
 *
 * The reason `journeyMutations.ts` gives one screen along: a `'use server'`
 * module is dispatched by Next.js under an opaque action id and needs a request
 * context no Vitest project has, so it carries a whole-file `c8 ignore` — and
 * anything DECIDED behind one is decided where nothing measures it. So the
 * actions module is the guard and the wiring, and everything with a branch in
 * it lives here, behind a `Payload` parameter, executed by
 * `pageMutations.integration.test.ts`. Zod schemas cannot sit at the top level
 * of a `'use server'` module either — `eslint-rules/guarded-server-actions.js`
 * rule 4 — which is the same conclusion reached from the other direction.
 *
 * ═══ THE TRAP: `pages` IS A VERSIONED COLLECTION, LIKE `journeys` ═══
 *
 * Payload's `updateByID` fetches the document it merges into with
 * `getLatestCollectionVersion`, which is passed no `published` key, so its
 * `where` is `latest: true` and the merge source is the NEWEST VERSION whatever
 * `draft` says (`updateByID.js:79`). On `journeys` that cost Task 4 two review
 * rounds: one press of Archive wrote the author's unpublished rewrite into the
 * live row and took the journey out of the public book.
 *
 * Every operation here was reasoned about against a page with pending draft
 * edits, and the answers differ per operation rather than uniformly:
 *
 *   - `addPageRow` and `copyPageRow` CREATE. There is no document to merge
 *     into, so the trap cannot apply — but `copyPageRow` reads its source with
 *     `draft: true`, because the editor shows the author's working copy and a
 *     "Copy" that duplicated the published row instead would silently discard
 *     whatever they were looking at.
 *   - `deletePageRow` DELETES. Nothing is merged.
 *   - `reorderPageRows` and `setPageLayoutRow` UPDATE, and both go through
 *     {@link writePageFields}, which is the two-write shape
 *     `journeyMutations.ts`'s `writeJourneyFlag` arrived at.
 *
 * {@link writePageFields} IS NOT SHARED WITH `writeJourneyFlag`, and that is a
 * decision rather than an oversight: Payload types `update`'s `data` per
 * collection slug, so one helper over both would need a generic whose `data`
 * resolves to a union the generated types refuse — and CLAUDE.md §0.8 bans the
 * `any` that would paper over it. The two headers cite each other instead.
 *
 * ═══ ONE WRITE PER PAGE THAT MOVED, BECAUSE PAYLOAD HAS NO BULK POSITION
 *     UPDATE ═══
 *
 * There is no `updateMany` over per-row values in the Local API, so renumbering
 * is a loop: this is not an oversight and not an N+1 of the kind CLAUDE.md §6
 * forbids, which is a query per row of a LIST BEING READ. It is bounded by the
 * pages of one journey and writes only the rows whose place actually changed —
 * a swap moves two, whatever the rail's length — because on a versioned
 * collection every write mints a version row.
 *
 * PATTERNS (CLAUDE.md §3.3): Repository — the collection's shape stops here and
 * the screen's actions speak in pages and row ids.
 *
 * INVARIANT — a journey always has at least one page. `deletePageRow` refuses
 * the last one, which is `Travel Diary Admin.dc.html`'s own `delPage`
 * (`if (list.length <= 1) return`), and without it a published journey could be
 * left as an entry in the contents with nothing behind it.
 * Depends on: zod, `payload` (types), `LAYOUTS`/`PageLayout`
 * (@travel-diary/domain/admin/layoutGlyphs), `AdminScope` (./adminScope),
 * `Page` (../../payload-types).
 */
import { LAYOUTS, type PageLayout } from '@travel-diary/domain/admin/layoutGlyphs'
import type { Payload } from 'payload'
import { z } from 'zod'
import type { Page } from '../../payload-types'
import type { AdminScope } from './adminScope'

/**
 * A layout the picker actually offers.
 *
 * AN INVERSION, NOT AN ENUMERATION: the value has to be one the domain's own
 * `LAYOUTS` names, so a fifth layout added there is admitted here without this
 * file being edited, and a sixth invented by a `POST` is refused without this
 * file having to have predicted it.
 */
const LAYOUT = z.enum(LAYOUTS)

/** What the "+ Add page with this layout" form carries. */
const NEW_PAGE = z.object({ journey: z.coerce.number().int().positive(), layout: LAYOUT })

/** What a glyph button's form carries. */
const PAGE_LAYOUT_REF = z.object({ page: z.coerce.number().int().positive(), layout: LAYOUT })

/**
 * What the tool row's Copy and Delete carry.
 *
 * `z.coerce.number()` and then `int().positive()`, for `journeyMutations.ts`'s
 * reason: a row id is a positive integer, and `'nonsense'` coerces to `NaN`,
 * which `int()` refuses. Without this the value reaches Postgres as `NaN` and
 * escapes as a raw `Failed query`.
 */
const PAGE_REF = z.object({ page: z.coerce.number().int().positive() })

/**
 * What ↑ and ↓ carry: the journey, and the whole new sequence of page ids.
 *
 * THE WHOLE SEQUENCE, NOT "THIS PAGE, ONE PLACE UP". The new order is computed
 * on the server by `@travel-diary/domain/admin/pageRail`'s `movePage` while the
 * rail is rendered, so each arrow is a plain `<form>` carrying its own outcome
 * and the screen ships no JavaScript for it.
 *
 * THE REPEATED-ID REFUSAL IS NOT DEFENSIVENESS. A list naming one page twice
 * would write two places to one row and leave another row with the place of a
 * page that moved — which the book reads as an arbitrary sequence rather than
 * as an error.
 */
const PAGE_ORDER = z.object({
  journey: z.coerce.number().int().positive(),
  pages: z
    .string()
    .transform((raw) => raw.split(',').map(Number))
    .pipe(
      z
        .array(z.number().int().positive())
        .min(1)
        .refine((ids) => new Set(ids).size === ids.length, { message: 'a page is named twice' }),
    ),
})

/**
 * The journey and layout the add form sends.
 * @param form - The body the browser posted.
 * @returns The journey's row id and the layout to create the page with.
 * @throws {z.ZodError} When the journey is not a row id or the layout is one no
 *   picker offers.
 * @example
 * readNewPage(form) // { journey: 42, layout: 'four-up' }
 */
export const readNewPage = (form: FormData): { readonly journey: number; readonly layout: PageLayout } =>
  NEW_PAGE.parse(Object.fromEntries(form))

/**
 * The page and layout a glyph button sends.
 * @param form - The body the browser posted.
 * @returns The page's row id and the layout pressed.
 * @throws {z.ZodError} When either field is absent or outside its type.
 * @example
 * readPageLayoutRef(form) // { page: 7, layout: 'full-bleed' }
 */
export const readPageLayoutRef = (form: FormData): { readonly page: number; readonly layout: PageLayout } =>
  PAGE_LAYOUT_REF.parse(Object.fromEntries(form))

/**
 * The page a tool-row button was pressed on.
 * @param form - The body the browser posted.
 * @returns The page's row id.
 * @throws {z.ZodError} When the field is absent or is not a positive integer.
 * @example
 * readPageRef(form) // 7
 */
export const readPageRef = (form: FormData): number => PAGE_REF.parse(Object.fromEntries(form)).page

/**
 * The journey and the whole new page sequence an arrow sends.
 * @param form - The body the browser posted.
 * @returns The journey's row id and the page row ids, in their new order.
 * @throws {z.ZodError} When the list is empty, holds something that is not a
 *   row id, or names one page twice.
 * @example
 * readPageOrder(form) // { journey: 3, pages: [7, 5, 9] }
 */
export const readPageOrder = (form: FormData): { readonly journey: number; readonly pages: readonly number[] } =>
  PAGE_ORDER.parse(Object.fromEntries(form))

/**
 * A field's value, or `null`.
 *
 * `exactOptionalPropertyTypes` refuses an explicit `undefined` where Payload's
 * generated `data` type says `string | null`, so every optional field a copy
 * carries over has to be narrowed — `journeyMutations.ts` carries the same
 * helper for the same obligation.
 * @param value - What the source row held.
 * @returns The value, or `null` where there was none.
 */
const orNull = <Value>(value: Value | null | undefined): Value | null => value ?? null

/**
 * An array field's rows.
 *
 * Payload answers `[]` for an array field with no rows rather than `null`, so
 * the fallback is unreachable against today's collection — it is written rather
 * than cast because the generated type allows `null` and a future `select` or
 * `depth` could produce one, and it carries the `c8 ignore` CLAUDE.md §2.1 asks
 * for in place of a branch nothing can cover. `journeyMutations.ts` carries the
 * same helper for the same reason.
 * @param value - The array field as the source row held it.
 * @returns Its rows.
 */
const rowsOf = <Value>(value: readonly Value[] | null | undefined): readonly Value[] =>
  /* c8 ignore next -- see above: Payload answers `[]`, never null or undefined */
  value ?? []

/**
 * The place after the last page of a rail.
 *
 * A `reduce` rather than `rail.at(-1)`, so there is no arm for the empty rail
 * and none for a rail whose `order` values have gaps in them — a delete leaves
 * one, and the highest place is what the next page has to clear either way.
 * @param rail - The journey's pages.
 * @returns The `order` a page added to the end takes.
 */
const nextPlace = (rail: readonly Page[]): number => rail.reduce((last, page) => Math.max(last, page.order), -1) + 1

/**
 * The journey a page belongs to, as a row id.
 *
 * Every read here is `depth: 0`, so Payload hands back a bare id — but the TYPE
 * still allows the whole document, and a cast that guessed wrong would file the
 * page under the wrong journey rather than fail. The refusing arm is what an
 * accidental `depth: 1` would land in.
 * @param page - The page as Payload returned it.
 * @returns The journey's row id.
 * @throws When the relationship was populated, which is a bug in the read above
 *   it rather than a state a screen can draw.
 */
const journeyOf = (page: Page): number => {
  if (typeof page.journey !== 'number') throw new Error('the page was read with a populated journey')
  return page.journey
}

/**
 * The pages of one journey, in the order the rail draws them.
 *
 * FULL DOCUMENTS, NO `select`: what comes back is the merge source for
 * {@link writePageFields}, so a narrow read would write `null` over every
 * column it did not ask for.
 * @param payload - The Local API instance.
 * @param scope - The hoisted {@link AdminScope}.
 * @param journey - The journey's row id.
 * @returns Its pages, ascending by `order`.
 */
const pagesOf = async (payload: Payload, scope: AdminScope, journey: number): Promise<readonly Page[]> => {
  const found = await payload.find({
    collection: 'pages',
    ...scope,
    depth: 0,
    pagination: false,
    sort: 'order',
    where: { journey: { equals: journey } },
  })
  return found.docs
}

/**
 * Writes columns to a page's LIVE row without publishing anything.
 *
 * ═══ WHY THIS IS TWO WRITES AND NOT ONE `payload.update` ═══
 *
 * The same shape, and the same reasoning, as `journeyMutations.ts`'s
 * `writeJourneyFlag` — read that header before changing either. `order` and
 * `layout` are structural: the rail applies them in one click, with no Save,
 * and the public book reads them off the `pages` table. But `pages` carries
 * `versions: { drafts: true }`, and `payload.update` merges into the NEWEST
 * VERSION, which for a page the author has a draft open on is their unpublished
 * text. A one-line `payload.update({ data: { order } })` would write that text
 * into the live row and stamp it `_status: 'draft'`.
 *
 * FIRST, the live row is written from ITS OWN content plus the fields, so the
 * merge has nothing of the draft's left to win with and `_status` stays where
 * it was. SECOND, when the newest version is a draft, that draft is saved again
 * with the same fields on it — because the first write made a non-draft version
 * the latest one, and `@payloadcms/drizzle`'s `createVersion` clears `latest`
 * on every other row, which would leave the author's pending text no longer
 * reachable through `draft: true` at all.
 *
 * THE SECOND WRITE IS CONDITIONED ON THE NEWEST VERSION BEING A DRAFT, not on
 * the live row being published: a page that has never gone out has its edits
 * only in that draft too.
 *
 * THE COST, stated rather than hidden: one extra read per page written, and two
 * version rows instead of one where a draft is pending.
 * @param payload - The Local API instance.
 * @param scope - The hoisted {@link AdminScope}.
 * @param live - The page's live row, already read.
 * @param fields - The columns being written.
 * @throws From Payload, when a write is refused by the access rules.
 */
const writePageFields = async (
  payload: Payload,
  scope: AdminScope,
  live: Page,
  fields: { readonly order: number } | { readonly layout: PageLayout },
): Promise<void> => {
  const newest = await payload.findByID({ collection: 'pages', id: live.id, ...scope, depth: 0, draft: true })

  await payload.update({ collection: 'pages', id: live.id, ...scope, data: { ...live, ...fields } })

  if (newest._status === 'draft') {
    await payload.update({
      collection: 'pages',
      id: live.id,
      ...scope,
      draft: true,
      data: { ...newest, ...fields },
    })
  }
}

/**
 * Adds a page to the end of a journey's rail.
 *
 * AT THE END, AND ALWAYS A FRAMES PAGE, which is `Travel Diary Admin.dc.html`'s
 * own `addPage`: it pushes, and names the page `'Frames ' + (frames + 1)`. A
 * journey has one notes page and the rest are frames, so the button that adds
 * one adds a frames page.
 *
 * A DRAFT, for the reason the create panel's line gives one screen along: a
 * page nobody has put anything on is not something to publish. See
 * `docs/deviations.md` §56 for what the public book currently does with one.
 * @param payload - The Local API instance.
 * @param scope - The hoisted {@link AdminScope}.
 * @param journey - The journey's row id.
 * @param layout - The layout the picker had selected.
 * @returns The new page's row id.
 * @throws From Payload, when the write is refused by the access rules.
 * @example
 * await addPageRow(payload, scope, 42, 'four-up')
 */
export const addPageRow = async (
  payload: Payload,
  scope: AdminScope,
  journey: number,
  layout: PageLayout,
): Promise<number> => {
  const pages = await pagesOf(payload, scope, journey)
  const frames = pages.filter((page) => page.kind === 'frames').length

  const created = await payload.create({
    collection: 'pages',
    ...scope,
    draft: true,
    data: {
      journey,
      kind: 'frames',
      title: `Frames ${String(frames + 1)}`,
      order: nextPlace(pages),
      layout,
    },
  })
  return created.id
}

/**
 * Copies a page, as a draft, into the place immediately after its source.
 *
 * IMMEDIATELY AFTER, which is the prototype's `dupePage`
 * (`list.splice(i + 1, 0, …)`) — a copy of the first page appearing at the
 * bottom of a nine-page rail is a copy the author has to go and find. The pages
 * after it are renumbered by {@link reorderPageRows}, which writes only the
 * rows that moved.
 *
 * THE SOURCE IS READ WITH `draft: true`, so what is copied is what the editor
 * was showing. A copy of the published row would silently discard the author's
 * pending edits at the moment they asked for a duplicate of them.
 *
 * THE SLOT ROW IDS ARE STRIPPED. Payload gives every array row an `id` of its
 * own, and handing the SOURCE's ids to a create asks it to insert rows that
 * already exist — measured on `journeyMutations.ts`, where it fails as `The
 * following field is invalid: id` rather than as anything that names the array.
 * @param payload - The Local API instance.
 * @param scope - The hoisted {@link AdminScope}.
 * @param page - The row id to copy.
 * @returns The copy's row id.
 * @throws From Payload, when the id names no row or a write is refused.
 * @example
 * await copyPageRow(payload, scope, 7)
 */
export const copyPageRow = async (payload: Payload, scope: AdminScope, page: number): Promise<number> => {
  const source = await payload.findByID({ collection: 'pages', id: page, ...scope, depth: 0, draft: true })
  const journey = journeyOf(source)
  const rail = await pagesOf(payload, scope, journey)

  const created = await payload.create({
    collection: 'pages',
    ...scope,
    draft: true,
    data: {
      journey,
      kind: source.kind,
      title: `${source.title ?? 'Page'} (copy)`,
      // THE END OF THE RAIL, AND THEN THE SEQUENCE BELOW MOVES IT. Creating it
      // at `source.order + 1` instead would tie with the page already there,
      // and which of the two a `sort: 'order'` then returns first is Postgres's
      // choice rather than this module's — measured: a mutation that dropped
      // the sequence entirely still passed, because the tie happened to break
      // the right way. `order` is `required` on the collection, so a create
      // with no place at all is refused.
      order: nextPlace(rail),
      layout: orNull(source.layout),
      slots: rowsOf(source.slots).map((slot) => ({
        role: orNull(slot.role),
        media: orNull(slot.media),
        caption: orNull(slot.caption),
        alt: orNull(slot.alt),
        focalX: orNull(slot.focalX),
        focalY: orNull(slot.focalY),
      })),
    },
  })

  const sequence = [...rail.flatMap((row) => (row.id === page ? [page, created.id] : [row.id]))]
  await reorderPageRows(payload, scope, journey, sequence)

  return created.id
}

/**
 * Removes a page from a journey.
 *
 * A HARD DELETE, AND THAT IS THE DATA MODEL'S OWN ANSWER rather than an
 * omission of CLAUDE.md §7's soft delete. `DATA_MODEL.md` scopes the 30-day
 * trash to journeys — "`deletedAt` on journeys" — and declares no such column
 * on `pages`, whose own line is "Pages are rows, not a fixed triple — the admin
 * can add, duplicate, reorder and delete them". SCREENS.md §2.10's trash lists
 * journeys, not pages.
 *
 * THE LAST PAGE IS REFUSED, which is the prototype's `delPage`. It throws
 * rather than returning quietly because the rail does not draw a Delete that
 * does nothing: the tool row hides it on a journey with one page, so reaching
 * this is a `POST` nobody's browser sent.
 * @param payload - The Local API instance.
 * @param scope - The hoisted {@link AdminScope}.
 * @param page - The row id to remove.
 * @throws When it is the journey's only page, and from Payload when the id
 *   names no row or the delete is refused.
 * @example
 * await deletePageRow(payload, scope, 7)
 */
export const deletePageRow = async (payload: Payload, scope: AdminScope, page: number): Promise<void> => {
  const doomed = await payload.findByID({ collection: 'pages', id: page, ...scope, depth: 0 })
  // `payload.count`, never `find({ limit: 0 })` — in Payload that means NO
  // limit, so the query runs with no `LIMIT` clause and hydrates every row to
  // read one integer (`readNavCounts.ts` carries the same note).
  const held = await payload.count({ collection: 'pages', ...scope, where: { journey: { equals: journeyOf(doomed) } } })
  if (held.totalDocs <= 1) throw new Error('a journey keeps at least one page')

  await payload.delete({ collection: 'pages', id: page, ...scope })
}

/**
 * Writes a journey's pages into the sequence given.
 *
 * THE LIST MUST BE EXACTLY THE JOURNEY'S PAGES, and a list that is not is
 * refused rather than applied. The sequence is computed while the rail is
 * rendered, so a second tab that added or deleted a page in between submits a
 * stale one — and renumbering a stale list gives two pages the same `order`,
 * which the book reads as an arbitrary sequence rather than as an error. This
 * is the read-modify-write window `writeJourneyFlag`'s header records as
 * harmless while no editor screen existed; this is the editor screen, so the
 * window is closed here by refusing the write rather than left open.
 *
 * ONLY THE ROWS THAT MOVED ARE WRITTEN. Every write on a versioned collection
 * mints a version row, and a swap moves two pages whatever the rail's length.
 * @param payload - The Local API instance.
 * @param scope - The hoisted {@link AdminScope}.
 * @param journey - The journey whose rail this is.
 * @param pages - Its page row ids, in their new order.
 * @throws When `pages` is not exactly the journey's pages, and from Payload
 *   when a write is refused.
 * @example
 * await reorderPageRows(payload, scope, 42, [9, 7, 5])
 */
export const reorderPageRows = async (
  payload: Payload,
  scope: AdminScope,
  journey: number,
  pages: readonly number[],
): Promise<void> => {
  const rail = await pagesOf(payload, scope, journey)
  const held = new Set(rail.map((page) => page.id))
  const asked = new Set(pages)
  if (asked.size !== held.size || [...asked].some((id) => !held.has(id))) {
    throw new Error('the submitted order is not this journey’s pages')
  }

  const byId = new Map(rail.map((page) => [page.id, page]))
  for (const [order, id] of pages.entries()) {
    const live = byId.get(id)
    // Unreachable while the set comparison above holds, and written rather
    // than asserted because CLAUDE.md §0.8 bans the `!` that would hide it.
    /* c8 ignore next */
    if (live === undefined) continue
    if (live.order === order) continue
    await writePageFields(payload, scope, live, { order })
  }
}

/**
 * Writes the layout a glyph button was pressed on.
 *
 * IT APPLIES AT ONCE, with no Save. `Travel Diary Admin.dc.html`'s picker sets
 * the layout for the current page and stamps "saved just now" in the same
 * breath, and §2.3's box has no button of its own but "+ Add page with this
 * layout".
 * @param payload - The Local API instance.
 * @param scope - The hoisted {@link AdminScope}.
 * @param page - The page's row id.
 * @param layout - The layout pressed.
 * @throws From Payload, when the id names no row or a write is refused.
 * @example
 * await setPageLayoutRow(payload, scope, 7, 'full-bleed')
 */
export const setPageLayoutRow = async (
  payload: Payload,
  scope: AdminScope,
  page: number,
  layout: PageLayout,
): Promise<void> => {
  const live = await payload.findByID({ collection: 'pages', id: page, ...scope, depth: 0 })
  await writePageFields(payload, scope, live, { layout })
}
