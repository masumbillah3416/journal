/**
 * contentsLayout — how many columns and rows the Contents index flows into.
 *
 * Pure function, and logic rather than styling because the answer changes the
 * page's CONTENT, not only its appearance: SCREENS.md §1.2 hides each entry's
 * meta line ("Garamond italic 17px, **hidden** in multi-column") and shrinks
 * its name from 36px to 27px the moment a second column appears, so the
 * column count decides what a reader is shown. Deriving it here, once, keeps
 * that decision testable and out of the component
 * (`apps/web/components/pages/Contents.tsx`), which only reads the result.
 *
 * SCREENS.md §1.2's own formula, verbatim:
 *
 *     gridAutoFlow: column
 *     columns = ceil(entryCount / 11)
 *     gridTemplateColumns: repeat(columns, 1fr)
 *     gridTemplateRows: repeat(ceil(count / columns), 1fr)
 *     columnGap: 34px
 *
 * HANDOFF-DEVIATION: SCREENS.md §1.2 closes with "Verified: 31 entries render
 * as 4 columns x 8 rows with zero overflow", which the formula immediately
 * above it cannot produce for any entry count at all - `columns = 4` requires
 * 34-44 entries, while `rows = 8` requires 29-32, and those ranges do not
 * overlap. For 31 entries the formula gives 3 columns of 11 rows. The formula
 * is implemented, because it is stated as the algorithm, it is what the
 * handoff's own prototype runs (`Travel Diary.dc.html`:
 * `Math.max(1, Math.ceil(contents.length / 11))`), and it is the reading under
 * which the handoff's other stated case (11 entries in one column) also holds.
 * See docs/deviations.md §9.
 *
 * Pattern: pure function over a value object (CLAUDE.md §3.3).
 * Depends on nothing.
 */

/** The most rows the handoff puts in one column before opening another. SCREENS.md §1.2. */
export const CONTENTS_ROWS_PER_COLUMN = 11

/** The grid the Contents body flows its entries into. */
export interface ContentsGrid {
  /** How many columns the entries flow across. Never below 1. */
  readonly columns: number
  /** How many rows each column holds. Never below 1. */
  readonly rows: number
}

/**
 * The column-flow grid for an index of `entryCount` journeys.
 *
 * @param entryCount - How many {@link ContentsEntry} rows the index holds.
 * @returns The column and row counts to hand `grid-template-columns` and
 *   `grid-template-rows`. Both are at least 1, because `repeat(0, 1fr)` is
 *   not a legal grid track list and an index with no entries still has to
 *   describe a grid the browser accepts.
 * @example
 * contentsLayout(11) // { columns: 1, rows: 11 } - the seeded book
 * contentsLayout(12) // { columns: 2, rows: 6 }
 */
export const contentsLayout = (entryCount: number): ContentsGrid => {
  const columns = Math.max(1, Math.ceil(entryCount / CONTENTS_ROWS_PER_COLUMN))

  return { columns, rows: Math.max(1, Math.ceil(entryCount / columns)) }
}

/**
 * Whether the index is in the compact, multi-column mode SCREENS.md §1.2
 * describes - the mode in which each entry's name drops to 27px and its meta
 * line is hidden outright.
 *
 * @param grid - The grid from {@link contentsLayout}.
 * @returns `true` once there is more than one column.
 * @example
 * isMultiColumn(contentsLayout(12)) // true - meta lines are hidden
 */
export const isMultiColumn = (grid: ContentsGrid): boolean => grid.columns > 1
