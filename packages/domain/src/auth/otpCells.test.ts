import { describe, expect, it } from 'vitest'
import { distributePaste, nextCell } from './otpCells'

describe('distributePaste', () => {
  it('fills every cell from the first when a full-length code is pasted', () => {
    expect(distributePaste('123456', 3, 6)).toEqual(['1', '2', '3', '4', '5', '6'])
  })

  it('fills from the focused cell when a fragment is pasted', () => {
    expect(distributePaste('45', 3, 6)).toEqual(['', '', '', '4', '5', ''])
  })

  it('strips non-digits, so a code copied with spaces or dashes still lands', () => {
    expect(distributePaste('12-34 56', 0, 6)).toEqual(['1', '2', '3', '4', '5', '6'])
  })

  it('ignores overflow rather than throwing', () => {
    expect(distributePaste('1234567890', 0, 6)).toEqual(['1', '2', '3', '4', '5', '6'])
  })

  it('returns unchanged cells when the paste contains no digits', () => {
    expect(distributePaste('hello', 0, 6)).toEqual(['', '', '', '', '', ''])
  })

  it('ignores overflow from a fragment paste too, not only a full-length one', () => {
    // Pasting starting at cell 5 (the last cell) of 6 with three digits must
    // not throw or wrap around — only the last cell can take a digit.
    expect(distributePaste('789', 5, 6)).toEqual(['', '', '', '', '', '7'])
  })
})

describe('nextCell', () => {
  it('advances to the next cell when a digit is typed', () => {
    expect(nextCell('digit', 2, 6, { cellIsEmpty: false })).toBe(3)
  })

  it('does not advance past the last cell when typing', () => {
    expect(nextCell('digit', 5, 6, { cellIsEmpty: false })).toBe(5)
  })

  it('retreats on Backspace when the current cell is already empty', () => {
    expect(nextCell('backspace', 3, 6, { cellIsEmpty: true })).toBe(2)
  })

  it('does not retreat past the first cell on Backspace', () => {
    expect(nextCell('backspace', 0, 6, { cellIsEmpty: true })).toBe(0)
  })

  it('stays put on Backspace when the current cell is filled, so the clear-in-place lands first', () => {
    expect(nextCell('backspace', 3, 6, { cellIsEmpty: false })).toBe(3)
  })

  it('moves left with the left arrow', () => {
    expect(nextCell('left', 3, 6, { cellIsEmpty: false })).toBe(2)
  })

  it('does not move left past the first cell', () => {
    expect(nextCell('left', 0, 6, { cellIsEmpty: false })).toBe(0)
  })

  it('moves right with the right arrow', () => {
    expect(nextCell('right', 3, 6, { cellIsEmpty: false })).toBe(4)
  })

  it('does not move right past the last cell', () => {
    expect(nextCell('right', 5, 6, { cellIsEmpty: false })).toBe(5)
  })
})
