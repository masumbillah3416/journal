/**
 * admin/bookmarkOrder — SCREENS.md §2.6's one rule: "Cover, Contents and About
 * are fixed and refuse to move."
 *
 * ═══ PATTERN (CLAUDE.md §3.3) ═══
 *
 * None of the seven. One total function over a list.
 *
 * ═══ THE LIST IS ALSO THE ORDER OF THE BOOK ═══
 *
 * §2.6's own line. The rows a reader drags are the bookmark rail, and the
 * bookmark rail is `deriveBookmarks`'s output over `derivePages`'s reading
 * sequence — so Cover sits first, Contents second and About last BECAUSE
 * `derivePages` puts them there, not because this module sorts them. That is
 * why "fixed" here is a refusal rather than a clamp: a journey allowed past
 * Contents would be written to `journeys.order`, come back through
 * `derivePages` at exactly the place it started, and leave the author pressing
 * an arrow that appears to do nothing.
 *
 * ═══ EVERY ROW IS NAMED BY ITS ID, NEVER BY ITS POSITION ═══
 *
 * CLAUDE.md §0.9. {@link moveBookmark} is handed the moved row's id, so the
 * arrow a reader pressed cannot be resolved against a list that has changed
 * under it — an id that names no row changes nothing, which is what a stale
 * render's arrow now does instead of moving whichever row happens to be at
 * that index.
 *
 * ═══ TWO DIFFERENT RULES, AND BOTH DIRECTIONS OF EACH ═══
 *
 * The MOVED row must be a journey (Cover, Contents and About refuse), and the
 * row it would swap with must be a journey too (a journey refuses to cross
 * one). The second is the one with a boundary at each end of the list:
 * `contents` is fixed above every journey and `about` is fixed below every
 * journey, and an implementation that guarded only the row above passes every
 * upward case there is.
 *
 * INVARIANT — the answer is always a permutation of the rows handed in, of the
 * same length, with the SAME kinds at the first two and last positions. The
 * only edit this module makes is a swap of two adjacent journeys; an edit that
 * spliced instead would have to re-establish that.
 * Depends on: `JOURNEY_PAGE_KINDS` (../bookBundle), for the one fact behind
 * the "p. {n}" this screen prints — how many pages a journey is.
 */
import { JOURNEY_PAGE_KINDS } from '../bookBundle'

/** Which of the four kinds of row in SCREENS.md §2.6's list this is. */
export type BookmarkRowKind = 'cover' | 'contents' | 'journey' | 'about'

/**
 * What the rule below needs to know about one row.
 *
 * NOT EVERYTHING A ROW DRAWS. The name, the place, the tint square and the
 * derived "p. {n}" are `apps/web/lib/admin/readBookScreen.ts`'s, which extends
 * this — the same line `frameOrder.ts`'s {@link Frame} draws one screen along.
 */
export interface BookmarkRow {
  /**
   * The row's own id: a journey's row id, or the fixed row's own word.
   *
   * A PLAIN STRING RATHER THAN A `JourneyId`, because three of the four kinds
   * are not journeys at all — Cover and About are globals and Contents has no
   * row anywhere (docs/deviations.md §5), so there is no id to brand.
   */
  readonly id: string
  /** Which kind of row, which is the whole of what decides whether it moves. */
  readonly kind: BookmarkRowKind
}

/**
 * Moves one journey one place up or down the list, or refuses.
 *
 * ═══ GENERIC OVER THE CALLER'S ROW, DELIBERATELY ═══
 *
 * `frameOrder.ts`'s `reorderFrames` reason, unchanged: the screen's rows carry
 * a name, a place and a page number this module has no business knowing about,
 * and a signature answering bare {@link BookmarkRow}s would make the caller
 * re-join its own rows to the answer by id — a second place for the
 * arrangement to be decided.
 *
 * @param rows - The list as it stands, in the order the book reads it.
 * @param id - The row whose arrow was pressed.
 * @param direction - Which arrow.
 * @returns The new order, or the order unchanged. Unchanged when the id names
 *   no row, when the named row is Cover, Contents or About, when the row it
 *   would swap with is one of those, and when there is no row that way at all.
 *
 *   A REFUSAL RETURNS THE VERY ARRAY IT WAS HANDED, and that is part of the
 *   contract rather than an accident of the implementation: it is how a caller
 *   tells "this arrow would do nothing" from "this arrow would swap two rows"
 *   without re-deriving the rule. `BookmarkOrder.tsx` draws a disabled button
 *   on `answer === rows`, and `bookmarkOrder.test.ts` pins both halves.
 * @example
 * moveBookmark(rows, '7', 'up') // journey 7 now sits before the journey above it
 */
export const moveBookmark = <T extends BookmarkRow>(
  rows: readonly T[],
  id: string,
  direction: 'up' | 'down',
): readonly T[] => {
  const subject = rows.find((row) => row.id === id)
  // FOUND, THEN LOCATED — rather than `findIndex` and an index lookup, which
  // under `noUncheckedIndexedAccess` needs a second `undefined` check that no
  // input can reach and that nothing could therefore cover.
  if (subject === undefined || subject.kind !== 'journey') return rows

  const at = rows.indexOf(subject)
  const to = direction === 'up' ? at - 1 : at + 1
  const neighbour = rows[to]
  // BOTH ENDS, AND THE END OF THE ARRAY. `contents` above and `about` below are
  // the two fixed rows a journey can be asked to cross; `undefined` is the
  // list that has neither, which is every list this module is handed in a test
  // and none it is handed by the screen.
  if (neighbour === undefined || neighbour.kind !== 'journey') return rows

  return rows.map((row, index) => {
    if (index === at) return neighbour
    if (index === to) return subject
    return row
  })
}

/**
 * How many pages of the book each kind of row covers.
 *
 * THE JOURNEY'S SPAN IS READ OFF {@link JOURNEY_PAGE_KINDS}, not typed here:
 * "a journey is three pages" is `derivePages`'s decision, and a fourth kind
 * added there would otherwise leave every "p. {n}" on this screen one page out
 * from the book it describes. The three fixed rows are one page each because
 * `derivePages` emits exactly one `{ kind: 'cover' }`, one `'contents'` and
 * one `'about'`.
 */
export const BOOKMARK_PAGE_SPANS: Readonly<Record<BookmarkRowKind, number>> = Object.freeze({
  cover: 1,
  contents: 1,
  journey: JOURNEY_PAGE_KINDS.length,
  about: 1,
})

/** One row of the list, with the 1-based page the book opens it at. */
export type NumberedBookmarkRow<T extends BookmarkRow> = T & {
  /** The page a reader turns to, the number SCREENS.md §2.6 prints as "p. {n}". */
  readonly pageNumber: number
}

/**
 * The same rows, each carrying the page the book opens it at.
 *
 * DERIVED, NEVER STORED (DATA_MODEL.md, "Derived, not stored"): nothing in the
 * database holds a page number, because a journey moved one place up changes
 * the page of every journey after it. This walks the list the way `derivePages`
 * walks its own, so the number printed beside a row is the number a reader
 * turns to — `bookmarkOrder.test.ts` compares it against `deriveContents`'s own
 * entries for the same journeys, which is what the book's Contents page prints.
 *
 * @param rows - The list in the order the book reads it, fixed rows included.
 * @returns The same rows, in the same order, each with its `pageNumber`.
 * @example
 * numberBookmarkPages(rows)[2]?.pageNumber // 3 — the first journey's notes page
 */
export const numberBookmarkPages = <T extends BookmarkRow>(rows: readonly T[]): readonly NumberedBookmarkRow<T>[] => {
  let page = 1

  return rows.map((row) => {
    const numbered = { ...row, pageNumber: page }
    page += BOOKMARK_PAGE_SPANS[row.kind]
    return numbered
  })
}
