import { describe, expect, it } from 'vitest'
import { pageIndexFromParam } from './pageAddress'

describe('pageIndexFromParam', () => {
  it('turns the first page number a reader sees into the first leaf index', () => {
    expect(pageIndexFromParam('1', 33)).toBe(0)
  })

  it('turns a mid-book page number into its zero-based leaf index', () => {
    expect(pageIndexFromParam('3', 33)).toBe(2)
  })

  it('turns the last page number into the last leaf index', () => {
    expect(pageIndexFromParam('33', 33)).toBe(32)
  })

  it('clamps a page number past the end of the book to the last leaf', () => {
    expect(pageIndexFromParam('999', 33)).toBe(32)
  })

  it('clamps a page number below the first page to the first leaf', () => {
    expect(pageIndexFromParam('0', 33)).toBe(0)
  })

  it('reads a page number that is not a number at all as the first leaf', () => {
    expect(pageIndexFromParam('tokyo', 33)).toBe(0)
  })

  it('reads a signed page number as the first leaf, since a page number is never signed', () => {
    expect(pageIndexFromParam('-4', 33)).toBe(0)
  })

  it('reads a fractional page number as the first leaf, since pages are whole', () => {
    expect(pageIndexFromParam('2.7', 33)).toBe(0)
  })

  it('reads an empty page number as the first leaf', () => {
    expect(pageIndexFromParam('', 33)).toBe(0)
  })

  it('returns the first leaf for a book with no pages at all, rather than a negative index', () => {
    expect(pageIndexFromParam('1', 0)).toBe(0)
  })
})
