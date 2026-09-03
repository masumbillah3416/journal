import { describe, expect, it } from 'vitest'
import { addressedPageIndex, pagePath } from './pageAddress'

describe('addressedPageIndex', () => {
  it('turns the first page number a reader sees into the first leaf index', () => {
    expect(addressedPageIndex('1', 33)).toBe(0)
  })

  it('turns a mid-book page number into its zero-based leaf index', () => {
    expect(addressedPageIndex('3', 33)).toBe(2)
  })

  it('turns the last page number into the last leaf index', () => {
    expect(addressedPageIndex('33', 33)).toBe(32)
  })

  it('refuses a page number past the end of the book rather than clamping to the last leaf', () => {
    expect(addressedPageIndex('999', 33)).toBeNull()
  })

  it('refuses the page number one past the last real page', () => {
    expect(addressedPageIndex('34', 33)).toBeNull()
  })

  it('refuses page zero, since the first page a reader sees is page one', () => {
    expect(addressedPageIndex('0', 33)).toBeNull()
  })

  it('refuses a page number that is not a number at all', () => {
    expect(addressedPageIndex('tokyo', 33)).toBeNull()
  })

  it('refuses a signed page number, since a page number is never signed', () => {
    expect(addressedPageIndex('-4', 33)).toBeNull()
  })

  it('refuses a fractional page number, since pages are whole', () => {
    expect(addressedPageIndex('2.7', 33)).toBeNull()
  })

  it('refuses an empty page number', () => {
    expect(addressedPageIndex('', 33)).toBeNull()
  })

  it('refuses a page number padded with a leading zero, which is a different address', () => {
    expect(addressedPageIndex('03', 33)).toBeNull()
  })

  it('refuses every address in a book with no pages at all, rather than returning a negative index', () => {
    expect(addressedPageIndex('1', 0)).toBeNull()
  })
})

describe('pagePath', () => {
  it('addresses the first leaf as the first page a reader sees', () => {
    expect(pagePath(0)).toBe('/p/1')
  })

  it('addresses a mid-book leaf as the page number printed on it', () => {
    expect(pagePath(2)).toBe('/p/3')
  })

  it('round-trips every leaf of the book back to itself', () => {
    // The two directions are the same translation read forwards and
    // backwards; an off-by-one in either would show up here rather than as a
    // reader landing one page away from the link they shared.
    const total = 33
    const leaves = Array.from({ length: total }, (_unused, leafIndex) => leafIndex)

    expect(leaves.map((leafIndex) => addressedPageIndex(pagePath(leafIndex).slice('/p/'.length), total))).toEqual(
      leaves,
    )
  })
})
