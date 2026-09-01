import { MAX_SCALE } from '@travel-diary/tokens/geometry'
import { describe, expect, it } from 'vitest'
import { bookScale } from './bookScale.js'

describe('bookScale', () => {
  it('is 1 when the area is exactly the design box', () => {
    expect(bookScale({ width: 1300, height: 860 })).toBe(1)
  })

  it('fits by width when the area is proportionally wider than tall', () => {
    // 650/1300 = 0.5, 860/860 = 1 -> the smaller wins, so the book fits.
    expect(bookScale({ width: 650, height: 860 })).toBeCloseTo(0.5, 6)
  })

  it('fits by height when the area is proportionally taller than wide', () => {
    expect(bookScale({ width: 1300, height: 430 })).toBeCloseTo(0.5, 6)
  })

  it('caps at 1.7 so the chrome outside the transform does not look undersized', () => {
    // A 4K viewport would otherwise scale the book ~2.4x while the bookmark
    // rail and bottom bar stay at fixed size.
    expect(bookScale({ width: 3840, height: 2160 })).toBe(MAX_SCALE)
  })

  it('never returns a negative or zero scale for a degenerate area', () => {
    expect(bookScale({ width: 0, height: 0 })).toBeGreaterThan(0)
  })
})
