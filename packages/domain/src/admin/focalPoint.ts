/**
 * focalPoint — SCREENS.md §2.3's focal point: the formula a click on a slot
 * becomes, the pill that reads it back, and the key each one is held under.
 *
 * ═══ TWO NUMBERS, NEVER THE STRING `"x y"` ═══
 *
 * §2.3 describes the prototype's own representation ("stored as `"x y"`,
 * applied as `background-position: x% y%`"). `DATA_MODEL.md` is the field-list
 * authority and gives `pages.slots[].focalX` and `focalY` as `number` with
 * `defaultValue: 50`, which is also what `apps/web/collections/pages.ts` has
 * held since the first migration. So the pair is the stored shape and the
 * string is COMPOSED AT RENDER — see `docs/deviations.md`. A string would put
 * two numbers behind one parse on every read, and make "is this centred?" a
 * text comparison.
 *
 * ═══ THE CLAMP AND THE ZERO-SIZE GUARD ARE BOTH LOAD-BEARING ═══
 *
 * The clamp is §2.3's own formula: a pointer that leaves the slot mid-drag
 * reports a `clientX` outside the rect, and an unclamped percentage reaches
 * `background-position` as a crop nobody can see. The zero-size guard is not in
 * §2.3 and is the more dangerous of the two: an element behind `display: none`
 * measures `0x0`, the division is `NaN`, and `background-position: NaN% NaN%`
 * is an invalid declaration a browser DROPS SILENTLY — a focal point that
 * appears to save and does nothing.
 *
 * PATTERNS (CLAUDE.md §3.3): Value object — {@link FocalPoint} is a pair with
 * its own constructor and its own equality question ({@link isCentred}), and
 * nothing outside this module builds one from arithmetic.
 *
 * INVARIANT — every {@link FocalPoint} this module returns has both components
 * in `[0, 100]` and neither is `NaN`. {@link focalPointFrom} is the only
 * constructor, and both guards are in it.
 * Depends on: `slotKey`, `PageId`, `SlotKey` (../ids).
 */
import { slotKey, type PageId, type SlotKey } from '../ids'

/** Where in a slot's frame the photograph is anchored, as two percentages. */
export interface FocalPoint {
  /** Horizontal anchor, `0`–`100`, straight into `background-position`'s first value. */
  readonly x: number
  /** Vertical anchor, `0`–`100`. */
  readonly y: number
}

/** What the schema stores for a slot nobody has clicked (`pages.slots[].focalX`'s `defaultValue`). */
const CENTRE = 50

/** A click, in the coordinate space `MouseEvent` reports. */
interface ClickPoint {
  /** `MouseEvent.clientX` — viewport pixels. */
  readonly clientX: number
  /** `MouseEvent.clientY` — viewport pixels. */
  readonly clientY: number
}

/** A slot's frame, in the shape `Element.getBoundingClientRect()` returns. */
interface FrameRect {
  /** The frame's left edge, in the same space as {@link ClickPoint.clientX}. */
  readonly left: number
  /** The frame's top edge. */
  readonly top: number
  /** The frame's width in CSS pixels — `0` for an element that is not displayed. */
  readonly width: number
  /** The frame's height in CSS pixels. */
  readonly height: number
}

/**
 * One axis of §2.3's formula, with both of its guards.
 *
 * ONE FUNCTION FOR BOTH AXES rather than two spellings of the same three
 * operations: the first version of this guarded `width` only, which left `y` as
 * `NaN` for a collapsed row while the zero-WIDTH case passed.
 * @param offset - How far into the frame the click landed, in pixels.
 * @param extent - The frame's size along this axis.
 * @returns The percentage, clamped to `[0, 100]`.
 */
const axis = (offset: number, extent: number): number =>
  extent <= 0 ? 0 : Math.min(100, Math.max(0, (offset / extent) * 100))

/**
 * The focal point a click on a slot names.
 *
 * @param click - The pointer position, in `MouseEvent` coordinates.
 * @param rect - The slot's frame, from `getBoundingClientRect()`.
 * @returns The point, both components in `[0, 100]`.
 * @example
 * focalPointFrom({ clientX: 150, clientY: 100 }, { left: 100, top: 50, width: 100, height: 100 })
 * // { x: 50, y: 50 }
 */
export const focalPointFrom = (click: ClickPoint, rect: FrameRect): FocalPoint => ({
  x: axis(click.clientX - rect.left, rect.width),
  y: axis(click.clientY - rect.top, rect.height),
})

/**
 * Whether a point is the centre the schema defaults to.
 *
 * WHY THE PILL NEEDS THIS AT ALL: `focalX`/`focalY` are `number` columns with a
 * `defaultValue` of 50, so a slot the author has never clicked arrives as
 * `{ x: 50, y: 50 }` and not as `null`. §2.3's pill reads "centred — click to
 * focus" for exactly that slot, so the question "is this the default?" has to
 * be asked somewhere — here, once, rather than as `=== 50` twice in a component.
 * @param point - The stored point.
 * @returns Whether both components are the schema's centre.
 * @example
 * isCentred({ x: 50, y: 50 }) // true
 */
export const isCentred = (point: FocalPoint): boolean => point.x === CENTRE && point.y === CENTRE

/**
 * What §2.3's focal-point pill prints.
 *
 * @param point - The point, or `null` where the slot has none set.
 * @returns The pill's text, verbatim from SCREENS.md §2.3.
 * @example
 * focalPointLabel({ x: 25.4, y: 29.6 }) // 'focus 25% 30%'
 */
export const focalPointLabel = (point: FocalPoint | null): string =>
  point === null ? 'centred — click to focus' : `focus ${String(Math.round(point.x))}% ${String(Math.round(point.y))}%`

/**
 * The key one slot's focal point is held under.
 *
 * KEYED BY PAGE AND BY CELL, WHICH IS THE DEFECT §2.3 NAMES: "Tokyo/Frames I
 * must not share Tokyo/Frames II." A pane holding `Record<number, FocalPoint>`
 * keyed on the cell alone shows page two's frames at page one's crops, which is
 * one of the five defects `DATA_MODEL.md` attributes to per-journey state held
 * in one global value (CLAUDE.md §0.9).
 *
 * THE CELL IS AN INDEX AND THAT IS NOT §0.9's "array position". A slot's index
 * IS its identity here: it is which cell of the page's layout this is, the
 * public `FramesI.tsx` reads `page.slots?.[position]` by the same number, and
 * `apps/web/lib/admin/slotMutations.ts` never splices the array — a cleared
 * slot keeps its row so the cell after it does not move.
 * @param page - The page the slot is on.
 * @param cell - The slot's index in `pages.slots`.
 * @returns The branded key, `${page}:${cell}`.
 * @example
 * slotKeyFor(pageId, 3) // '12:3'
 */
export const slotKeyFor = (page: PageId, cell: number): SlotKey => {
  const built = slotKey(`${page}:${String(cell)}`)
  // Unreachable: the composition always holds the colon, so it is never the
  // empty string the brand refuses. Written rather than asserted because
  // CLAUDE.md §0.8 bans the `!` that would hide it.
  /* c8 ignore next */
  if (!built.ok) throw new Error(built.error)
  return built.value
}
