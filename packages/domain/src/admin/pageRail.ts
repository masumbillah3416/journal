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
 * PATTERNS (CLAUDE.md §3.3): none of the seven. Pure functions over one list.
 * Depends on: PageId, from ../ids; PageLayout, from ./layoutGlyphs.
 */
import type { PageId } from '../ids'
import type { PageLayout } from './layoutGlyphs'

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

/**
 * The page a `?page=` address selects, or the one the rail opens on.
 *
 * AN INVERSION, NOT AN ENUMERATION (CLAUDE.md §3.3's rejected anti-pattern, and
 * `readJourneysScreen.ts`'s chip parse next door): `?page=999` and
 * `?page=<a page of another journey>` are addresses anybody can type, and
 * trusting either would open a rail with no card selected and a tool row
 * pointing at a row this journey does not hold. The requested value has to BE
 * one of the pages given, or it is ignored.
 *
 * A REPEATED PARAMETER ARRIVES AS AN ARRAY — `?page=a&page=b`, and a form
 * posted twice — which is a shape a browser really does produce, so the first
 * value is taken rather than the whole thing coerced to a string.
 * @param pages - The journey's pages, in the order the rail draws them.
 * @param requested - The `page` search parameter, exactly as Next.js hands it over.
 * @returns The selected page's id, the first page's when the request names
 *   none of them, or `null` for a journey with no pages at all.
 * @example
 * selectedPage(pages, '7') // the page whose id is '7', if the journey holds it
 */
export const selectedPage = (
  pages: readonly RailPage[],
  requested: string | readonly string[] | undefined,
): PageId | null => {
  const asked = typeof requested === 'string' ? requested : requested?.[0]
  const held = pages.find((page) => page.id === asked)
  return held?.id ?? pages[0]?.id ?? null
}

/**
 * Which layout the picker draws as pressed for a page.
 *
 * A PAGE CAN HAVE NO LAYOUT — the column is optional on the collection, and a
 * page created outside `pageMutations.ts` has none — and the picker has to
 * press something, or all four buttons read as unchosen. The fallbacks are the
 * prototype's own (`Travel Diary Admin.dc.html`: `curPage.type === 'notes' ?
 * 'Text spread' : 'Three up'`), which are also the layouts a new journey's
 * three pages are created with.
 * @param page - The page, with whatever its `layout` column holds.
 * @returns The layout to draw as active.
 * @example
 * activeLayout({ kind: 'notes', layout: null }) // 'text-spread'
 */
export const activeLayout = (page: {
  readonly kind: 'notes' | 'frames'
  readonly layout: PageLayout | null
}): PageLayout => page.layout ?? (page.kind === 'notes' ? 'text-spread' : 'three-up')
