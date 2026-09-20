/**
 * admin/mediaFilters — SCREENS.md §2.4's five filter chips, as one predicate.
 *
 * ═══ PATTERN (CLAUDE.md §3.3) ═══
 *
 * None of the seven. One total function from a chip and a row to a yes or no.
 * A Strategy map of five closures would be an abstraction with one caller.
 *
 * ═══ WHY THE PREDICATE IS HERE AND NOT IN THE PAYLOAD QUERY ═══
 *
 * The chips narrow a list the screen has already fetched: `readMediaScreen`
 * reads the library once and the pages that hold it once, and `placements` is
 * counted from the second against the first. `in-the-book` could be a `where`
 * clause; `unused` could not, because "no page slot holds it" is a fact about
 * an array column on another collection. Putting one chip in SQL and one in
 * memory would make the five chips two mechanisms, and only one of them
 * testable without a database.
 *
 * ═══ WHAT `unused` MEANS, BECAUSE §2.4 DOES NOT SAY ═══
 *
 * **Nothing in the diary points at it**: no page slot holds it AND it is not
 * marked for the book. The alternative reading — "not in the book" alone —
 * would call a photograph that is printed on a Frames page unused, which is
 * the opposite of what an author asking "what have I not used?" wants to hear.
 * Recorded in `docs/deviations.md`.
 *
 * ═══ AND `in-the-book` IS THE COLUMN, NOT THE PLACEMENT ═══
 *
 * `media.inBook` is a checkbox on the row. It says the photograph is IN the
 * book and nothing about where; a page slot says where and nothing about the
 * book. §2.4 is the first screen in this repository that writes `inBook` at
 * all ("Add to book") and the first that DISPLAYS it per tile (the "In book"
 * chip) — `docs/deviations.md` §63 records that the journey editor's pool
 * spent its one piece of per-tile state on placement instead, leaving the
 * eyebrow counting a column no tile showed. This chip and that chip are what
 * make the count legible again.
 *
 * ═══ INVARIANT A FUTURE EDIT COULD BREAK ═══
 *
 * `everything` matches every row, including one the other four would refuse.
 * It is the default chip, so a row that fell out of it would be a row the
 * author cannot see at all.
 * Depends on: nothing. Pure.
 */

/** The five chips SCREENS.md §2.4 draws, in the order it draws them. */
export type MediaFilter = 'everything' | 'stills' | 'clips' | 'in-the-book' | 'unused'

/**
 * The chips, in the order the control row prints them.
 *
 * A LIST RATHER THAN A UNION READ TWICE: the component maps this, and the
 * address parser matches against it, so the chips drawn and the chips accepted
 * cannot drift.
 */
export const MEDIA_FILTERS: readonly MediaFilter[] = ['everything', 'stills', 'clips', 'in-the-book', 'unused']

/**
 * What a chip decides on.
 *
 * NOT EVERYTHING A TILE DRAWS. The filename, the thumbnail and the duration
 * chip are `apps/web/lib/admin/readMediaScreen.ts`'s, which extends this — the
 * predicate below reads three fields and naming more of them here would put a
 * URL in the domain package.
 */
export interface MediaTile {
  /** Whether the row is a still or a clip — the `stills`/`clips` chips. */
  readonly kind: 'still' | 'clip'
  /** The `media.inBook` column — the `in-the-book` chip and the tile's chip. */
  readonly inBook: boolean
  /** How many page slots across the diary hold this photograph. */
  readonly placements: number
}

/**
 * Whether one row survives one chip.
 *
 * @param row - The row's three filterable facts. See {@link MediaTile}.
 * @param filter - The pressed chip.
 * @returns Whether the grid draws the row.
 * @example
 * matchesMediaFilter({ kind: 'clip', inBook: false, placements: 0 }, 'unused') // true
 */
export const matchesMediaFilter = (row: MediaTile, filter: MediaFilter): boolean => {
  switch (filter) {
    case 'stills':
      return row.kind === 'still'
    case 'clips':
      return row.kind === 'clip'
    case 'in-the-book':
      return row.inBook
    case 'unused':
      return !row.inBook && row.placements === 0
    // `everything` is the default arm rather than a case of its own, so a
    // sixth chip added to the union without a case here fails `tsc` on the
    // `switch`'s exhaustiveness rather than silently matching everything.
    case 'everything':
      return true
  }
}
