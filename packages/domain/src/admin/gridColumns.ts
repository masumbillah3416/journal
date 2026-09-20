/**
 * admin/gridColumns — the number behind SCREENS.md §2.4's
 * `repeat(auto-fill, minmax(calc(1120/columns)px, 1fr))`.
 *
 * ═══ THE ARITHMETIC IS MEASURED OFF THE PROTOTYPE, NOT DERIVED ═══
 *
 * `Travel Diary Admin.dc.html` line 2187 computes the track as
 * `'repeat(auto-fill, minmax(' + Math.round(1120 / cols) + 'px, 1fr))'`. It
 * ROUNDS. At the default of six columns that is 187px and a floor would be
 * 186px, so the two are not interchangeable and the one this repository draws
 * is the one the design draws. Written down here rather than in a stylesheet
 * because a number in CSS cannot say where it came from.
 *
 * ═══ WHERE `columns` COMES FROM, STATED PLAINLY ═══
 *
 * From nothing an author can press. `mediaColumns` is a prototype PROP — a
 * `range` editor in the design tool's own panel, `min: 3, max: 8, default: 6`,
 * in its "Chrome" section — and §2.4 draws no control for it. So
 * `apps/web/app/(admin)/admin/media/page.tsx` passes
 * {@link DEFAULT_GRID_COLUMNS} and nothing else does. Inventing a slider would
 * be inventing UI the design does not give (CLAUDE.md §4).
 *
 * The clamp is therefore not defending against a control; it is the prop's own
 * declared range, expressed where a future control would have to pass through
 * it. That is why it is two named constants and a case on each side rather
 * than a comment.
 *
 * ═══ PATTERN (CLAUDE.md §3.3) ═══
 *
 * None of the seven. One pure function of one number.
 * Depends on: nothing.
 */

/** The fewest columns the design's own prop offers. */
export const MIN_GRID_COLUMNS = 3

/** The most columns the design's own prop offers. */
export const MAX_GRID_COLUMNS = 8

/** What the prop defaults to, and the only value the screen passes today. */
export const DEFAULT_GRID_COLUMNS = 6

/**
 * The width the grid divides between its columns, in CSS pixels.
 *
 * The prototype's literal. It is the content width the media grid is laid out
 * against, not a viewport: `auto-fill` then fits as many tracks of the
 * resulting minimum as the real container holds, which is why a narrower
 * window draws fewer columns without this number changing.
 */
export const GRID_BASIS_PX = 1120

/**
 * The minimum track width for a grid of `columns` columns.
 *
 * @param columns - How many columns the grid is laid out for. Clamped to
 *   {@link MIN_GRID_COLUMNS}–{@link MAX_GRID_COLUMNS}, so a value outside the
 *   design's own range cannot produce a track outside it either.
 * @returns The `minmax()` minimum, in whole CSS pixels.
 * @example
 * gridMinimum(6) // 187
 * gridMinimum(99) // 140, the same as gridMinimum(8)
 */
export const gridMinimum = (columns: number): number => {
  const clamped = Math.min(Math.max(columns, MIN_GRID_COLUMNS), MAX_GRID_COLUMNS)
  return Math.round(GRID_BASIS_PX / clamped)
}

/**
 * The gap between tiles, in CSS pixels — SCREENS.md §2.4's own `gap: 14px`.
 *
 * Here as well as in `media.module.css` because a windowed grid has to convert
 * rows to pixels, and only a stylesheet can draw a gap. The two spellings are
 * PINNED to each other: `MediaGrid.test.tsx` reads the `gap` out of that file
 * and compares it with this, so a change to one fails a test rather than a
 * screenshot.
 */
export const GRID_GAP_PX = 14

/**
 * How many tiles the grid draws before it starts windowing.
 *
 * Design spec §12 and CLAUDE.md §6: "The gallery grid virtualizes past 100
 * tiles — the design tops out at ~100 assets per journey, which is exactly the
 * threshold where a naive grid starts to hurt." The Media screen is the grid
 * that can exceed it, because it lists every journey's media rather than one
 * journey's.
 */
export const VIRTUAL_THRESHOLD = 100

/**
 * How many tiles a windowed grid draws at once.
 *
 * Larger than {@link VIRTUAL_THRESHOLD} on purpose: the first grid that
 * windows at all has 101 rows, and a window smaller than the threshold would
 * make that grid draw FEWER tiles than a 100-row one — a visible step at the
 * exact size the threshold was chosen to be comfortable at. At the default six
 * columns this is twenty rows, which is several screens.
 */
export const VIRTUAL_WINDOW = 120

/**
 * How many rows of tiles are drawn above the first one in view.
 *
 * Small and non-zero: scrolling upward must not reveal a gap before the next
 * measurement lands, and every overscanned row is DOM the budget pays for.
 */
export const OVERSCAN_ROWS = 2

/** Which slice of the rows a windowed grid draws. */
export interface GridWindow {
  /** The index of the first row drawn. */
  readonly start: number
  /** One past the index of the last row drawn. */
  readonly end: number
}

/**
 * Which tiles to draw, given how far the grid has scrolled past the viewport.
 *
 * ═══ WHY THIS IS PURE AND NOT INSIDE THE COMPONENT ═══
 *
 * It is arithmetic with four branches, and jsdom has no layout: a component
 * that decided this inline would be decided where every measurement is zero,
 * so the only case anybody could write is the unmeasured one. Here the
 * measurements are parameters, so "the window moves with the scroll" is a case
 * rather than a hope. `MediaGrid.tsx` measures and calls this.
 *
 * ═══ AN UNMEASURED GRID DRAWS THE FIRST WINDOW ═══
 *
 * `rowHeight` and `columns` are zero before the first layout — and in jsdom
 * forever. The answer then is the first {@link VIRTUAL_WINDOW} tiles, which is
 * correct for a grid at the top of its scroll and is what the browser paints
 * before the first measurement arrives.
 *
 * @param input - `total` is how many rows the grid has; `scrolledPast` is how
 *   many pixels of the grid are above the top of the viewport, never negative;
 *   `rowHeight` is one row of tiles including its gap, and `columns` how many
 *   tiles a row holds — both `0` when nothing has been measured yet.
 * @returns The half-open slice to draw. `end - start` never exceeds
 *   {@link VIRTUAL_WINDOW}, whatever `total` is, which is the property the
 *   DOM budget rests on.
 * @example
 * virtualWindow({ total: 1200, scrolledPast: 0, rowHeight: 0, columns: 0 }) // { start: 0, end: 120 }
 */
export const virtualWindow = (input: {
  readonly total: number
  readonly scrolledPast: number
  readonly rowHeight: number
  readonly columns: number
}): GridWindow => {
  // A grid the design's own size is drawn whole: windowing a hundred tiles
  // costs two spacers and a scroll listener to save nothing.
  if (input.total <= VIRTUAL_THRESHOLD) return { start: 0, end: input.total }

  const last = Math.max(0, input.total - VIRTUAL_WINDOW)
  if (input.rowHeight <= 0 || input.columns <= 0) return { start: 0, end: Math.min(input.total, VIRTUAL_WINDOW) }

  const firstRowInView = Math.floor(Math.max(0, input.scrolledPast) / input.rowHeight)
  // The start is pinned to a ROW boundary, never to a tile: a window starting
  // mid-row would shift every tile after it one place to the left, which is
  // the positional defect CLAUDE.md §0.9 is about, drawn.
  const start = Math.min(Math.max(0, (firstRowInView - OVERSCAN_ROWS) * input.columns), last)
  return { start, end: Math.min(input.total, start + VIRTUAL_WINDOW) }
}
