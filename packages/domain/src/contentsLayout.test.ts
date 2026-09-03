import { describe, expect, it } from 'vitest'
import { CONTENTS_ROWS_PER_COLUMN, contentsLayout, isMultiColumn } from './contentsLayout'

describe('contentsLayout', () => {
  it('keeps a single journey in one column', () => {
    expect(contentsLayout(1)).toEqual({ columns: 1, rows: 1 })
  })

  it('keeps eleven entries in one column, the last count that fits', () => {
    expect(contentsLayout(11)).toEqual({ columns: 1, rows: 11 })
  })

  it('breaks into two columns at twelve entries', () => {
    expect(contentsLayout(12)).toEqual({ columns: 2, rows: 6 })
  })

  it('balances the rows across the columns rather than filling the first', () => {
    // 23 entries over 3 columns is 8 rows each, not 11 + 11 + 1.
    expect(contentsLayout(23)).toEqual({ columns: 3, rows: 8 })
  })

  it('fills both columns to eleven rows at twenty-two entries', () => {
    expect(contentsLayout(22)).toEqual({ columns: 2, rows: 11 })
  })

  it('lays thirty-one entries out as three columns of eleven rows', () => {
    // SCREENS.md §1.2 states "Verified: 31 entries render as 4 columns x 8 rows"
    // immediately below the formula that cannot produce it - see this module's
    // header and docs/deviations.md §9. The formula is what is implemented, so
    // this test pins the formula's real output.
    expect(contentsLayout(31)).toEqual({ columns: 3, rows: 11 })
  })

  it('reaches four columns at thirty-four entries', () => {
    expect(contentsLayout(34)).toEqual({ columns: 4, rows: 9 })
  })

  it('still describes a valid one-by-one grid for an empty index', () => {
    // `repeat(0, 1fr)` is not a legal grid track list, so an index with no
    // entries must still describe a grid the browser accepts.
    expect(contentsLayout(0)).toEqual({ columns: 1, rows: 1 })
  })
})

describe('CONTENTS_ROWS_PER_COLUMN', () => {
  it('is the handoff’s eleven rows per column', () => {
    expect(CONTENTS_ROWS_PER_COLUMN).toBe(11)
  })
})

describe('isMultiColumn', () => {
  it('is false for a single-column index, where the meta line is shown', () => {
    expect(isMultiColumn(contentsLayout(11))).toBe(false)
  })

  it('is true for a two-column index, where the meta line is hidden', () => {
    expect(isMultiColumn(contentsLayout(12))).toBe(true)
  })
})
