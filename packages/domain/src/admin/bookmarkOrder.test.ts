import { describe, expect, it } from 'vitest'
import { deriveContents, derivePages } from '../bookBundle'
import { aJourney } from '../testing/factories'
import {
  BOOKMARK_PAGE_SPANS,
  moveBookmark,
  numberBookmarkPages,
  type BookmarkRow,
  type BookmarkRowKind,
} from './bookmarkOrder'

/**
 * One row of SCREENS.md §2.6's list, named the way the screen names it.
 * @param id - The row's own id — a journey's row id, or the fixed row's word.
 * @param kind - Which of the four kinds of row this is.
 * @returns The row.
 */
const aBookmark = (id: string, kind: BookmarkRowKind): BookmarkRow => ({ id, kind })

describe('moveBookmark', () => {
  it('refuses to move the cover, which is fixed', () => {
    const rows = [aBookmark('cover', 'cover'), aBookmark('tokyo', 'journey'), aBookmark('about', 'about')]

    expect(moveBookmark(rows, 'cover', 'down')).toEqual(rows)
  })

  it('refuses to move a journey past a fixed row', () => {
    const rows = [aBookmark('cover', 'cover'), aBookmark('contents', 'contents'), aBookmark('tokyo', 'journey')]

    expect(moveBookmark(rows, 'tokyo', 'up')).toEqual(rows)
  })

  it('refuses to move a journey past the fixed row BELOW it', () => {
    const rows = [aBookmark('contents', 'contents'), aBookmark('tokyo', 'journey'), aBookmark('about', 'about')]

    expect(moveBookmark(rows, 'tokyo', 'down')).toEqual(rows)
  })

  it('swaps two journeys, by id', () => {
    const rows = [aBookmark('contents', 'contents'), aBookmark('tokyo', 'journey'), aBookmark('lisbon', 'journey')]

    expect(moveBookmark(rows, 'lisbon', 'up').map((row) => row.id)).toEqual(['contents', 'lisbon', 'tokyo'])
  })

  it('swaps two journeys downward as well as upward', () => {
    const rows = [aBookmark('contents', 'contents'), aBookmark('tokyo', 'journey'), aBookmark('lisbon', 'journey')]

    expect(moveBookmark(rows, 'tokyo', 'down').map((row) => row.id)).toEqual(['contents', 'lisbon', 'tokyo'])
  })

  it('leaves the order alone when the id names no row', () => {
    const rows = [aBookmark('cover', 'cover'), aBookmark('tokyo', 'journey')]

    expect(moveBookmark(rows, 'kyoto', 'up')).toEqual(rows)
  })

  it('refuses to move a journey off the end of the list, where there is no row at all', () => {
    const rows = [aBookmark('tokyo', 'journey'), aBookmark('lisbon', 'journey')]

    expect(moveBookmark(rows, 'lisbon', 'down')).toEqual(rows)
  })
})

describe('BOOKMARK_PAGE_SPANS', () => {
  it('gives a journey the three pages `derivePages` derives for one, and every fixed row one', () => {
    // READ OFF `derivePages`, not typed in: a fourth journey page kind added
    // there without this constant moving would put every "p. {n}" on the
    // screen one page out from the book it describes.
    const journeyPages = derivePages([aJourney({ slug: 'tokyo' })]).filter(
      (page) => page.kind !== 'cover' && page.kind !== 'contents' && page.kind !== 'about',
    )

    expect(BOOKMARK_PAGE_SPANS).toEqual({ cover: 1, contents: 1, journey: journeyPages.length, about: 1 })
  })
})

describe('numberBookmarkPages', () => {
  it('numbers the rows from one, a page each for the fixed rows and three for a journey', () => {
    const rows = [
      aBookmark('cover', 'cover'),
      aBookmark('contents', 'contents'),
      aBookmark('tokyo', 'journey'),
      aBookmark('lisbon', 'journey'),
      aBookmark('about', 'about'),
    ]

    expect(numberBookmarkPages(rows).map((row) => row.pageNumber)).toEqual([1, 2, 3, 6, 9])
  })

  it('keeps every field the caller’s own row carried', () => {
    const rows = [{ id: 'tokyo', kind: 'journey' as const, name: 'Tokyo' }]

    expect(numberBookmarkPages(rows)[0]).toEqual({ id: 'tokyo', kind: 'journey', name: 'Tokyo', pageNumber: 1 })
  })

  it('agrees page for page with the contents index the diary derives for the same journeys', () => {
    // THE WHOLE REASON THIS FUNCTION IS IN THE DOMAIN. "p. {n}" is derived,
    // never stored (DATA_MODEL.md, "Derived, not stored"), and the number the
    // admin prints has to be the number the reader turns to — so it is checked
    // against `deriveContents`, which is what the book's own Contents page is
    // built from, rather than against arithmetic repeated in this file.
    const journeys = [aJourney({ slug: 'tokyo' }), aJourney({ slug: 'lisbon' }), aJourney({ slug: 'oslo' })]
    const rows = [
      aBookmark('cover', 'cover'),
      aBookmark('contents', 'contents'),
      ...journeys.map((journey) => aBookmark(journey.slug, 'journey')),
      aBookmark('about', 'about'),
    ]

    const numbered = numberBookmarkPages(rows).filter((row) => row.kind === 'journey')

    expect(numbered.map((row) => row.pageNumber)).toEqual(
      deriveContents(derivePages(journeys)).map((entry) => entry.pageNumber),
    )
  })
})
