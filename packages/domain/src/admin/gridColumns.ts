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
