import { describe, expect, it } from 'vitest'
import { DESIGN_BOX, MAX_SCALE, geometry } from './geometry'

describe('geometry tokens', () => {
  it('fixes the design box at the handoff-authored size', () => {
    expect(DESIGN_BOX).toEqual({ width: 1300, height: 860 })
  })

  it('caps book scaling at the handoff value', () => {
    expect(MAX_SCALE).toBe(1.7)
  })

  it('is frozen, so a caller cannot mutate the shared design box', () => {
    expect(Object.isFrozen(DESIGN_BOX)).toBe(true)
  })

  it('exposes the handoff radius scale', () => {
    expect(geometry.radius).toEqual({
      control: '2px',
      card: '3px',
      pageFace: '2px 9px 9px 2px',
      bookBoard: '7px 16px 16px 7px',
    })
  })

  it('exposes the handoff admin card padding range', () => {
    expect(geometry.adminCardPadding).toEqual({ min: '18px 20px 20px', max: '20px 22px 22px' })
  })

  it('exposes the handoff grid gaps', () => {
    expect(geometry.gap).toEqual({ adminCards: 20, cardInner: 14, tileGrid: 12 })
  })
})
