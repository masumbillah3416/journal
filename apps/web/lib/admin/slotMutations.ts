/**
 * slotMutations — what SCREENS.md §2.3's photo slots do to the database, and
 * the Zod parses that stand between a `POST` and them.
 *
 * ═══ WHY THE DECISIONS ARE HERE AND NOT IN `actions.ts` ═══
 *
 * `pageMutations.ts`'s reason, unchanged: a `'use server'` module is dispatched
 * under an opaque action id and needs a request context no Vitest project has,
 * so it carries a whole-file `c8 ignore` — and anything DECIDED behind one is
 * decided where nothing measures it. Zod schemas cannot sit at the top level of
 * a `'use server'` module either (`eslint-rules/guarded-server-actions.js`
 * rule 4). So the parses and the writes live here, behind a `Payload`
 * parameter, executed by `slotMutations.integration.test.ts`.
 *
 * ═══ ONE FIELD NAMES THE TARGET, AND IT IS THE BRANDED `SlotKey` ═══
 *
 * Every control posts `slot=${page}:${cell}` — the same string the pane holds
 * its focal points under (`@travel-diary/domain/admin/focalPoint`'s
 * `slotKeyFor`). A form carrying `page` and `cell` as two fields can be posted
 * with a cell from one slot and a page from another; one field cannot. The
 * `journey` alongside it is trusted for NOTHING BUT A CACHE ADDRESS, exactly as
 * `pageMutations.ts`'s `PAGE_REF` says: every write below derives what it needs
 * from the PAGE ROW.
 *
 * ═══ THE CELL IS CHECKED TWICE, AND THE TWO CHECKS ARE DIFFERENT QUESTIONS ═══
 *
 * The parse refuses a cell no pane draws AT ALL — `HIGHEST_SLOT_CELL`, derived
 * from `@travel-diary/domain/admin/pageSlots`, so a fifth frame added there
 * widens it without this file being edited. The WRITE then refuses a cell THIS
 * PAGE's pane does not draw, because a notes page has two cells and a frames
 * page four and the key carries no kind. A parse cannot answer the second
 * question without a query, and a write that did not ask it would let a `POST`
 * put a third photograph on a Notes page, where nothing renders it.
 *
 * ═══ THESE ARE LIVE-ROW WRITES ON A VERSIONED COLLECTION ═══
 *
 * §2.3's slot controls have no Save of their own — the pane's "Save draft" is
 * the Notes fields' — and the public book reads `pages.slots` off the `pages`
 * table, so a slot write is structural in exactly the way `order` and `layout`
 * are. All four go through `pageMutations.ts`'s {@link writePageFields}, which
 * is the two-write shape `journeyMutations.ts`'s `writeJourneyFlag` arrived at.
 * Read that header before changing anything here.
 *
 * WHAT IS NEW HERE is that `slots` is an ARRAY the write patches ONE CELL of,
 * and the live row's array and the pending draft's can differ. `writePageFields`
 * therefore takes a function of the document being written, and every patch
 * below is applied to that document's own slots — handed one literal, the
 * second write would put the live row's slots into the draft and discard a
 * placement the author had not published.
 *
 * ═══ THE ARRAY IS PADDED, NEVER SPLICED ═══
 *
 * A cell's index IS its cell of the layout: `FramesI.tsx` reads
 * `page.slots?.[position]`. So writing cell 2 of a page with no slots creates
 * three rows, and clearing cell 0 empties it IN PLACE. A splice would draw the
 * second photograph in the first frame — a change to a page the author did not
 * touch.
 *
 * PATTERNS (CLAUDE.md §3.3): Repository — the collection's shape stops here and
 * the screen's actions speak in pages, cells and points.
 *
 * INVARIANT — after any write here, `slots.length > cell`, every row from 0 to
 * `cell` exists, and each carries the role its cell plays per
 * `slotRolesFor(page.kind)`.
 * Depends on: zod, `payload` (types), `FocalPoint`
 * (@travel-diary/domain/admin/focalPoint), `HIGHEST_SLOT_CELL`/`slotRolesFor`
 * (@travel-diary/domain/admin/pageSlots), `SlotRole`
 * (@travel-diary/domain/bookBundle), `isRowId` (@travel-diary/domain/ids),
 * `AdminScope` (./adminScope), `writePageFields`/`SlotRows`
 * (./pageMutations), `Page` (../../payload-types).
 */
import type { FocalPoint } from '@travel-diary/domain/admin/focalPoint'
import { HIGHEST_SLOT_CELL, slotRolesFor } from '@travel-diary/domain/admin/pageSlots'
import type { SlotRole } from '@travel-diary/domain/bookBundle'
import { isRowId } from '@travel-diary/domain/ids'
import type { Payload } from 'payload'
import { z } from 'zod'
import type { Page } from '../../payload-types'
import type { AdminScope } from './adminScope'
import { writePageFields, type SlotRows } from './pageMutations'

/** One row of a page's `slots` array. */
type SlotRow = SlotRows[number]

/**
 * A row id, as a form sends one.
 *
 * `pageMutations.ts`'s `ROW_ID`, and for its reasons: `z.coerce.number()`
 * because a form body is text, then the domain's own `isRowId`, which refuses
 * `NaN`, `0` and everything past 2^53 where `Number` stops telling one integer
 * from the next.
 */
const ROW_ID = z.coerce.number().refine(isRowId, { message: 'not a row id' })

/**
 * The `${page}:${cell}` key every slot control posts.
 *
 * REFUSES BY SHAPE FIRST. The regex admits two runs of digits and a colon and
 * nothing else, so a minus sign, a decimal point, an empty half and a second
 * colon are all refused without this file having had to list them (standing
 * orders, species 6). What survives is then two numbers, each with its own gate:
 * the page through {@link ROW_ID}, the cell against the domain's own
 * `HIGHEST_SLOT_CELL`.
 */
const SLOT_TARGET = z
  .string()
  .regex(/^\d+:\d+$/u, { message: 'not a slot key' })
  .transform((raw) => {
    const halves = raw.split(':')
    // The regex above guarantees both halves; `noUncheckedIndexedAccess`
    // cannot see that, and CLAUDE.md §0.8 bans the `!` that would hide it.
    /* c8 ignore next 2 */
    return { page: halves[0] ?? '', cell: halves[1] ?? '' }
  })
  .pipe(
    z.object({
      page: z.string().transform(Number).refine(isRowId, { message: 'not a row id' }),
      cell: z
        .string()
        .transform(Number)
        .refine((cell) => Number.isInteger(cell) && cell >= 0 && cell <= HIGHEST_SLOT_CELL, {
          message: 'no pane draws that cell',
        }),
    }),
  )

/**
 * A focal component, as the pane's hidden field sends one.
 *
 * BOTH ENDS ARE THE FRAME'S OWN. `focalPointFrom` clamps to `[0, 100]` before
 * the field is written, so a value outside it did not come from a click on a
 * slot — and `background-position: 140%` is a crop of nothing. `z.coerce`
 * turns `'NaN'` into `NaN`, which `min`/`max` refuse, so the one value CSS
 * silently drops cannot reach the column.
 */
const FOCAL = z.coerce.number().min(0).max(100)

/** What a pool tile posts to place a photograph. */
const SLOT_MEDIA = z.object({ journey: ROW_ID, slot: SLOT_TARGET, media: ROW_ID })

/** What a click on a slot posts. */
const SLOT_POINT = z.object({ journey: ROW_ID, slot: SLOT_TARGET, focalX: FOCAL, focalY: FOCAL })

/** What a slot's caption and alt fields post. */
const SLOT_TEXT = z.object({ journey: ROW_ID, slot: SLOT_TARGET, caption: z.string(), alt: z.string() })

/** What Clear posts, which is the target and nothing else. */
const SLOT_REF = z.object({ journey: ROW_ID, slot: SLOT_TARGET })

/** A parsed target: which editor to revalidate, which page and which cell. */
interface SlotRef {
  /** The journey's row id — the cache address, trusted for nothing else. */
  readonly journey: number
  /** The page's row id. */
  readonly page: number
  /** Which cell of that page's pane. */
  readonly cell: number
}

/**
 * The photograph a pool tile asks to place, and where.
 * @param form - The body the browser posted.
 * @returns The target and the media row id.
 * @throws {z.ZodError} When the key is not `${page}:${cell}`, the cell is one no
 *   pane draws, or either id is not a row id.
 * @example
 * readSlotMedia(form) // { journey: 1, page: 7, cell: 2, media: 11 }
 */
export const readSlotMedia = (form: FormData): SlotRef & { readonly media: number } => {
  const { journey, slot, media } = SLOT_MEDIA.parse(Object.fromEntries(form))
  return { journey, ...slot, media }
}

/**
 * The point a click on a slot names, and where.
 * @param form - The body the browser posted.
 * @returns The target and the focal point.
 * @throws {z.ZodError} When the key is malformed or either component is outside
 *   the frame.
 * @example
 * readSlotPoint(form) // { journey: 1, page: 7, cell: 2, point: { x: 12, y: 87 } }
 */
export const readSlotPoint = (form: FormData): SlotRef & { readonly point: FocalPoint } => {
  const { journey, slot, focalX, focalY } = SLOT_POINT.parse(Object.fromEntries(form))
  return { journey, ...slot, point: { x: focalX, y: focalY } }
}

/**
 * The caption and alt text a slot's own fields carry, and where.
 * @param form - The body the browser posted.
 * @returns The target and both strings.
 * @throws {z.ZodError} When the key is malformed or either field is absent.
 * @example
 * readSlotText(form) // { journey: 1, page: 7, cell: 2, caption: '…', alt: '…' }
 */
export const readSlotText = (form: FormData): SlotRef & { readonly caption: string; readonly alt: string } => {
  const { journey, slot, caption, alt } = SLOT_TEXT.parse(Object.fromEntries(form))
  return { journey, ...slot, caption, alt }
}

/**
 * The slot Clear was pressed on.
 * @param form - The body the browser posted.
 * @returns The target.
 * @throws {z.ZodError} When the key is malformed.
 * @example
 * readSlotRef(form) // { journey: 1, page: 7, cell: 2 }
 */
export const readSlotRef = (form: FormData): SlotRef => {
  const { journey, slot } = SLOT_REF.parse(Object.fromEntries(form))
  return { journey, ...slot }
}

/**
 * A cell with nothing in it, carrying the part that cell plays.
 *
 * THE ROLE IS THE CELL'S, NOT AN AUTHOR'S CHOICE. §2.3 gives a Notes page a
 * hero and an ephemera scrap and a Frames page four frames; no control lets an
 * author change which is which. It matters past the pane: `readBookBundle.ts`
 * picks a derivative ladder by `role`, and `EphemeraSlot.tsx` finds its slot by
 * it, so a padded row with no role would resolve to the wrong tier.
 * @param role - What part the cell plays.
 * @returns An empty row, centred.
 */
const emptyCell = (role: SlotRole): SlotRow => ({
  role,
  media: null,
  caption: null,
  alt: null,
  focalX: 50,
  focalY: 50,
})

/**
 * One document's slots, with one cell patched and the cells before it padded.
 *
 * @param doc - The page document being written — the live row or the pending
 *   draft, each patched from its own array. See this module's header.
 * @param cell - Which cell.
 * @param roles - What each cell of this page plays.
 * @param patch - What to do to that cell's row.
 * @returns The whole array, ready for `data.slots`.
 */
const patchedSlots = (
  doc: Page,
  cell: number,
  roles: readonly SlotRole[],
  role: SlotRole,
  patch: (row: SlotRow) => SlotRow,
): SlotRows => {
  // Payload answers `[]` for an array field with no rows, never null or
  // undefined, so the fallback is unreachable — written rather than cast
  // because the generated type allows one, exactly as `pageMutations.ts`'s
  // `rowsOf` does. The directive is on its own line and NOT inside the block
  // above, because the scanner reads `c8 ignore next` line by line and does
  // not see it inside a comment that wraps (measured: it reported this line
  // uncovered until the directive was moved out).
  /* c8 ignore next */
  const rows: SlotRows = [...(doc.slots ?? [])]
  // PADDED FROM THE TABLE'S OWN SLICE rather than by indexing it per step: the
  // cells between what is stored and the one being written are all inside
  // `roles` (the caller has already refused a cell past its end), and a slice
  // says so to the type system where an index does not.
  for (const padded of roles.slice(rows.length, cell)) rows.push(emptyCell(padded))
  rows[cell] = patch({ ...(rows[cell] ?? emptyCell(role)), role })
  return rows
}

/**
 * Applies one change to one cell of one page, on both sides of the version
 * split.
 *
 * @param payload - The Local API instance.
 * @param scope - The hoisted {@link AdminScope}.
 * @param page - The page's row id.
 * @param cell - Which cell of that page's pane.
 * @param patch - What to do to that cell's row.
 * @throws When the page's own pane does not draw that cell, and from Payload
 *   when the id names no row or a write is refused.
 */
const writeSlot = async (
  payload: Payload,
  scope: AdminScope,
  page: number,
  cell: number,
  patch: (row: SlotRow) => SlotRow,
): Promise<void> => {
  const live = await payload.findByID({ collection: 'pages', id: page, ...scope, depth: 0 })
  const roles = slotRolesFor(live.kind)
  // THE SECOND OF THE TWO CELL CHECKS — see this module's header. The parse
  // knows what any pane draws; only a read knows what THIS page's pane draws.
  // Asked as "what part does this cell play?" rather than as a length
  // comparison, because the answer is what the write needs next.
  const role = roles[cell]
  if (role === undefined) {
    throw new Error(`a ${live.kind} page does not draw cell ${String(cell)}`)
  }

  await writePageFields(payload, scope, live, (doc) => ({ slots: patchedSlots(doc, cell, roles, role, patch) }))
}

/**
 * Puts a photograph in a slot.
 *
 * THE CELL RETURNS TO CENTRE. A focal point is "the slot's own override for
 * THIS placement" (DATA_MODEL.md) — a crop chosen for one photograph frames a
 * different one arbitrarily, and the author cannot see that it is stale because
 * the pill reads a number either way. `clearSlotRow` re-centres for the same
 * reason.
 * @param payload - The Local API instance.
 * @param scope - The hoisted {@link AdminScope}.
 * @param page - The page's row id.
 * @param cell - Which cell.
 * @param media - The media row id.
 * @throws When the page's pane does not draw that cell, and from Payload when
 *   either id names no row or the write is refused.
 * @example
 * await setSlotMediaRow(payload, scope, 7, 2, 11)
 */
export const setSlotMediaRow = async (
  payload: Payload,
  scope: AdminScope,
  page: number,
  cell: number,
  media: number,
): Promise<void> => {
  await writeSlot(payload, scope, page, cell, (row) => ({ ...row, media, focalX: 50, focalY: 50 }))
}

/**
 * Writes the focal point a click on a slot named.
 *
 * THE CONTROL THE PHASE'S SECOND EXIT CRITERION IS ABOUT. Design spec §5.2:
 * "If this is not wired through to rendering, the admin control is decorative."
 * `slotMutations.integration.test.ts`'s last case is the data half of that.
 * @param payload - The Local API instance.
 * @param scope - The hoisted {@link AdminScope}.
 * @param page - The page's row id.
 * @param cell - Which cell.
 * @param point - Where in the frame, as two percentages.
 * @throws When the page's pane does not draw that cell, and from Payload when
 *   the id names no row or the write is refused.
 * @example
 * await setSlotFocalRow(payload, scope, 7, 2, { x: 12, y: 87 })
 */
export const setSlotFocalRow = async (
  payload: Payload,
  scope: AdminScope,
  page: number,
  cell: number,
  point: FocalPoint,
): Promise<void> => {
  await writeSlot(payload, scope, page, cell, (row) => ({ ...row, focalX: point.x, focalY: point.y }))
}

/**
 * Writes a slot's caption and alt text.
 *
 * THE SLOT'S OWN, NOT THE MEDIA ROW'S. `readBookBundle.ts` falls back to the
 * media item's `caption`/`alt` where the slot has none, so an empty field here
 * restores that fallback rather than blanking the photograph's description.
 * @param payload - The Local API instance.
 * @param scope - The hoisted {@link AdminScope}.
 * @param page - The page's row id.
 * @param cell - Which cell.
 * @param text - The caption and the alt text, as the fields carry them.
 * @throws When the page's pane does not draw that cell, and from Payload when
 *   the id names no row or the write is refused.
 * @example
 * await setSlotTextRow(payload, scope, 7, 2, { caption: 'Alfama', alt: 'A tiled stair' })
 */
export const setSlotTextRow = async (
  payload: Payload,
  scope: AdminScope,
  page: number,
  cell: number,
  text: { readonly caption: string; readonly alt: string },
): Promise<void> => {
  await writeSlot(payload, scope, page, cell, (row) => ({ ...row, caption: text.caption, alt: text.alt }))
}

/**
 * Empties a slot, keeping its cell.
 *
 * IN PLACE, NEVER A SPLICE — see this module's header: the index is the cell of
 * the layout, and removing the row would move every photograph after it into
 * the frame before.
 * @param payload - The Local API instance.
 * @param scope - The hoisted {@link AdminScope}.
 * @param page - The page's row id.
 * @param cell - Which cell.
 * @throws When the page's pane does not draw that cell, and from Payload when
 *   the id names no row or the write is refused.
 * @example
 * await clearSlotRow(payload, scope, 7, 2)
 */
export const clearSlotRow = async (payload: Payload, scope: AdminScope, page: number, cell: number): Promise<void> => {
  // EMPTIED FIELD BY FIELD RATHER THAN REPLACED BY AN EMPTY ROW: the row keeps
  // its own Payload array-row id and its role, so Payload updates it in place
  // instead of dropping one row and inserting another at the same position.
  await writeSlot(payload, scope, page, cell, (row) => ({
    ...row,
    media: null,
    caption: null,
    alt: null,
    focalX: 50,
    focalY: 50,
  }))
}
