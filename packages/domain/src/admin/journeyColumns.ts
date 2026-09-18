/**
 * journeyColumns — SCREENS.md §2.2's column ladder: which of the journeys
 * table's eight columns a width has room for, in the order the grid lists them.
 *
 * ═══ AN ORDERED TABLE, SO THE LADDER CANNOT GROW A HOLE ═══
 *
 * §2.2 drops columns "by priority as width falls", which reads as four
 * independent rules and is in fact one: every column has a width it appears
 * from, and a set is everything at or under the current width. Written that
 * way, "a wider table never shows fewer columns" is true by construction
 * rather than by four rules agreeing — and the ORDER is the table's own, so
 * the tracks and the headings cannot be listed in one order and the cells in
 * another.
 *
 * THE ORDER IS THE DESIGN'S GRID, NOT THE PRIORITY ORDER. `Travel Diary
 * Admin.dc.html`'s `jCols` builds the row's `grid-template-columns` as
 * thumb · name · dates · pages · media · status · edited · actions, and the
 * headings above it in the same sequence. `dates` is the LAST column to appear
 * and the third to be drawn; sorting this table by `from` would put every data
 * cell under the wrong heading at every width but the widest.
 *
 * NOTHING IN PRODUCTION CALLS THIS AT RENDER TIME, for the reason
 * `./breakpoints.ts`'s header sets out at length: a server render has never
 * seen a viewport, and the admin surface buys its CLAUDE.md §6 headroom by
 * shipping no client JavaScript for chrome. `journeys.module.css` is what ACTS
 * on these four numbers, in media queries; this is the spelling that can be
 * REVIEWED, and `JourneyTable.test.tsx` reads the stylesheet off disk and asks
 * this module what it says one pixel either side of each boundary. A caller
 * that genuinely needs the set at render time needs a client component or a
 * measured cookie, and must justify that against §6 first.
 *
 * EVERY WIDTH IS A LOWER BOUND, INCLUSIVE — `≥`, never `>`. SCREENS.md §2.2
 * writes "+720px: pages 52px", so 720 shows `pages` and 719 does not, which is
 * `journeyColumns.test.ts`'s second case from both sides.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. One table and one filter.
 * Depends on: nothing.
 */

/** One column of SCREENS.md §2.2's table. */
export type JourneyColumn = 'thumb' | 'name' | 'pages' | 'edited' | 'media' | 'dates' | 'status' | 'actions'

/** A column, and the width it appears from. */
interface ColumnRung {
  /** Which column. */
  readonly column: JourneyColumn
  /** The narrowest width that shows it. `0` for a column no width drops. */
  readonly from: number
}

/**
 * The eight columns in the order the grid declares its tracks, each with the
 * width it appears from.
 *
 * The four `0` rungs are SCREENS.md §2.2's base — `48px | minmax(0,1.7fr) |
 * 96px (status) | minmax(0,104px) (actions)` — which no width drops, so a
 * narrow table is still a table.
 */
const LADDER: readonly ColumnRung[] = [
  { column: 'thumb', from: 0 },
  { column: 'name', from: 0 },
  { column: 'dates', from: 1000 },
  { column: 'pages', from: 720 },
  { column: 'media', from: 880 },
  { column: 'status', from: 0 },
  { column: 'edited', from: 800 },
  { column: 'actions', from: 0 },
]

/**
 * Every column the table has, in grid order.
 *
 * Derived from {@link LADDER} rather than typed again, so a rung added without
 * a place in the grid is impossible rather than merely caught.
 */
export const JOURNEY_COLUMNS: readonly JourneyColumn[] = LADDER.map((rung) => rung.column)

/**
 * The columns a width has room for.
 *
 * @param width - The table's own width in CSS pixels, not the viewport's.
 * @returns The surviving columns, in the order the grid declares its tracks.
 * @example
 * visibleJourneyColumns(320) // ['thumb', 'name', 'status', 'actions']
 */
export const visibleJourneyColumns = (width: number): readonly JourneyColumn[] =>
  LADDER.filter((rung) => width >= rung.from).map((rung) => rung.column)
