import { describe, expect, it } from 'vitest'
import { composite, contrastRatio } from './contrast'

describe('contrastRatio', () => {
  it('reports the maximum ratio for black on white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 2)
  })

  it('reports the minimum ratio for a colour against itself', () => {
    expect(contrastRatio('#736247', '#736247')).toBeCloseTo(1, 2)
  })

  it('is symmetric — order of the pair does not change the ratio', () => {
    expect(contrastRatio('#736247', '#fbf6e9')).toBeCloseTo(contrastRatio('#fbf6e9', '#736247'), 6)
  })
})

describe('composite', () => {
  it('flattens a translucent overlay onto its base', () => {
    // 50% black over white is mid grey.
    expect(composite('#000000', 0.5, '#ffffff')).toBe('#808080')
  })

  it('returns the base when the overlay is fully transparent', () => {
    expect(composite('#000000', 0, '#fbf6e9')).toBe('#fbf6e9')
  })

  it('returns the overlay when it is fully opaque', () => {
    expect(composite('#a34434', 1, '#fbf6e9')).toBe('#a34434')
  })
})
