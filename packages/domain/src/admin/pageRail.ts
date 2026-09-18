/**
 * pageRail — the list SCREENS.md §2.3's left column draws, and what its ↑ ↓
 * do to it.
 *
 * ═══ BY ID, NEVER BY POSITION (CLAUDE.md §0.9) ═══
 *
 * The rail's arrows are pressed on a CARD, and the card knows its page's id.
 * The list around it arrives from a query whose sort is the database's, so the
 * index of a page in that array is an accident of the read: a module that took
 * an index would move a different page the moment two rows shared an `order`,
 * a sort changed, or a filter dropped one. So {@link movePage} takes an id,
 * finds the page by it, and sorts by the page's OWN `order` before it swaps —
 * which is the property `pageRail.test.ts`'s last case pins by feeding the same
 * pages in a different sequence.
 *
 * ═══ ORDER IS RENUMBERED, NOT SWAPPED ═══
 *
 * A swap of two `order` values preserves whatever gaps and duplicates the rows
 * already had, and duplicates are what the book reads as an arbitrary order.
 * The whole sequence is renumbered from 0 instead, so "no two pages share an
 * order" is true after every move rather than true if it was true before.
 *
 * THE COST, stated: renumbering means the caller writes EVERY page's `order`,
 * not two. `apps/web/lib/admin/pageMutations.ts` does that in one loop and says
 * why there is no cheaper spelling.
 *
 * A MOVE THAT CANNOT HAPPEN ANSWERS THE LIST IT WAS GIVEN — the first page
 * asked to go up, the last asked to go down, an id the list does not hold.
 * Refusing by returning the input is what lets the rail render the arrows
 * unconditionally: the end of the list is not an error state, and a throw would
 * reach a screen with no way to draw it.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. One pure list transform.
 * Depends on: PageId, from ../ids.
 */
import type { PageId } from '../ids'

/** One card in SCREENS.md §2.3's page rail. */
export interface RailPage {
  /** The page, branded. Every operation addresses this and never an index. */
  readonly id: PageId
  /** The name the card prints in Caveat 24px — "Frames I". */
  readonly title: string
  /** Which kind of page it is, which the meta line prints in Courier 9px. */
  readonly kind: 'notes' | 'frames'
  /** Where it sits in the journey, from 0. Renumbered by {@link movePage}. */
  readonly order: number
}

/** Which way one of SCREENS.md §2.3's two arrows moves a page. */
export type MoveDirection = 'up' | 'down'

/**
 * The pages in the order the book reads them.
 *
 * A COPY, always: `Array.prototype.sort` mutates, and mutating a caller's list
 * would make a read-only-looking function rewrite the array a screen is
 * rendering from.
 * @param pages - The rail's pages, in whatever order they arrived.
 * @returns The same pages, ascending by `order`.
 */
const byOrder = (pages: readonly RailPage[]): readonly RailPage[] =>
  [...pages].sort((one, two) => one.order - two.order)

/**
 * The pages after one of them has moved a place.
 *
 * @param pages - Every page of the journey, in any order.
 * @param id - The page whose arrow was pressed.
 * @param direction - Which arrow.
 * @returns The pages in their new sequence, renumbered from 0 — or `pages`
 *   itself when the move cannot happen (the end of the list, or an id the list
 *   does not hold).
 * @example
 * movePage(pages, pageOne, 'down') // [second, first, third], orders 0, 1, 2
 */
export const movePage = (pages: readonly RailPage[], id: PageId, direction: MoveDirection): readonly RailPage[] => {
  const sorted = byOrder(pages)
  const from = sorted.findIndex((page) => page.id === id)
  const to = direction === 'up' ? from - 1 : from + 1
  // One guard for three refusals: `findIndex` answers -1 for an id the list
  // does not hold, which puts `to` out of bounds for either direction, and the
  // ends of the list do the same.
  if (from === -1 || to < 0 || to >= sorted.length) return pages

  const moved = [...sorted]
  const mover = sorted[from]
  const neighbour = sorted[to]
  // Unreachable while the bounds check above holds — both indices are inside
  // the array it measured — and written rather than asserted because
  // CLAUDE.md §0.8 bans the `!` that would hide it.
  /* c8 ignore next */
  if (mover === undefined || neighbour === undefined) return pages
  moved[to] = mover
  moved[from] = neighbour

  return moved.map((page, order) => ({ ...page, order }))
}
