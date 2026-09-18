/**
 * pageRail.test.ts — behaviour spec for SCREENS.md §2.3's ↑ ↓, which is where
 * CLAUDE.md §0.9 bites: address rows by id, never by array position.
 *
 * Unit test (CLAUDE.md §2): a pure function over a list. That the WRITE then
 * reaches Postgres one row at a time is `pageMutations.integration.test.ts`'s,
 * and that the rail draws the tool row is `PageRail.test.tsx`'s.
 *
 * ═══ WHY THE LAST CASE SORTS THE INPUT DIFFERENTLY ═══
 *
 * "By id, not by index" cannot be killed by a one-line mutation: a positional
 * implementation and an id-based one agree on every list that arrives already
 * in `order`, which is every list the screen hands over. The case that tells
 * them apart feeds the SAME pages in a different sequence and requires the same
 * answer — which a `pages[index]` lookup cannot give.
 *
 * `pageId` answers a `Result`, so {@link anId} unwraps it: an unwrapped call
 * would compare a page's id against `{ ok: true, value: … }` and never match,
 * which is how a case that guards nothing gets written.
 *
 * Depends on: vitest, ../ids, ../testing/factories, ./pageRail.
 */
import { describe, expect, it } from 'vitest'
import { pageId, type PageId } from '../ids'
import { aRailPage } from '../testing/factories'
import { movePage } from './pageRail'

/**
 * A branded page id.
 * @param raw - The id as Postgres would spell it.
 * @returns The branded id.
 */
const anId = (raw: string): PageId => {
  const built = pageId(raw)
  if (!built.ok) throw new Error(built.error)
  return built.value
}

describe('movePage', () => {
  it('swaps a page with its neighbour, identified by id rather than by where it sits', () => {
    const pages = [aRailPage('a', 0), aRailPage('b', 1), aRailPage('c', 2)]

    expect(movePage(pages, anId('b'), 'up').map((page) => page.id)).toEqual([anId('b'), anId('a'), anId('c')])
  })

  it('swaps a page with the one below it when asked to move down', () => {
    const pages = [aRailPage('a', 0), aRailPage('b', 1), aRailPage('c', 2)]

    expect(movePage(pages, anId('b'), 'down').map((page) => page.id)).toEqual([anId('a'), anId('c'), anId('b')])
  })

  it('leaves the first page alone when asked to move it up, rather than wrapping', () => {
    const pages = [aRailPage('a', 0), aRailPage('b', 1)]

    expect(movePage(pages, anId('a'), 'up')).toEqual(pages)
  })

  it('leaves the last page alone when asked to move it down, rather than wrapping', () => {
    const pages = [aRailPage('a', 0), aRailPage('b', 1)]

    expect(movePage(pages, anId('b'), 'down')).toEqual(pages)
  })

  it('renumbers order so no two pages share one, which is what the book reads', () => {
    const moved = movePage([aRailPage('a', 0), aRailPage('b', 5), aRailPage('c', 9)], anId('c'), 'up')

    expect(moved.map((page) => page.order)).toEqual([0, 1, 2])
  })

  it('returns the list unchanged for an id it does not hold, rather than throwing at a screen', () => {
    const pages = [aRailPage('a', 0)]

    expect(movePage(pages, anId('missing'), 'down')).toEqual(pages)
  })

  it('moves the same page whatever order the list arrives in', () => {
    const ascending = [aRailPage('a', 0), aRailPage('b', 1), aRailPage('c', 2)]
    const shuffled = [ascending[2], ascending[0], ascending[1]].flatMap((page) => (page ? [page] : []))

    expect(movePage(shuffled, anId('a'), 'down').find((page) => page.id === anId('a'))?.order).toBe(
      movePage(ascending, anId('a'), 'down').find((page) => page.id === anId('a'))?.order,
    )
  })

  it('carries every page’s own title and kind through the move, changing only the order', () => {
    const pages = [aRailPage('a', 0, { title: 'Notes', kind: 'notes' }), aRailPage('b', 1, { title: 'Frames I' })]

    expect(movePage(pages, anId('b'), 'up')).toEqual([
      { id: anId('b'), title: 'Frames I', kind: 'frames', order: 0 },
      { id: anId('a'), title: 'Notes', kind: 'notes', order: 1 },
    ])
  })
})
