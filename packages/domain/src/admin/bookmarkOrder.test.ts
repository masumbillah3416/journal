import { describe, expect, it } from 'vitest'
import { moveBookmark, type BookmarkRow, type BookmarkRowKind } from './bookmarkOrder'

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
