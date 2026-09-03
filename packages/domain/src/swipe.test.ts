import { describe, expect, it } from 'vitest'
import { SWIPE_HORIZONTAL_RATIO, SWIPE_MIN_DISTANCE_PX, shouldTurnPage } from './swipe'

describe('shouldTurnPage', () => {
  it('turns on a clear horizontal swipe', () => {
    expect(shouldTurnPage({ dx: -80, dy: 10 })).toBe('forward')
  })

  it('turns backward on a rightward swipe', () => {
    expect(shouldTurnPage({ dx: 80, dy: 10 })).toBe('backward')
  })

  it('ignores a swipe shorter than the 60px threshold', () => {
    expect(shouldTurnPage({ dx: -59, dy: 0 })).toBe(null)
  })

  it('commits at exactly the threshold, which is the distance the handoff names', () => {
    expect(shouldTurnPage({ dx: -SWIPE_MIN_DISTANCE_PX, dy: 0 })).toBe('forward')
  })

  it('ignores a short swipe in the backward direction too', () => {
    expect(shouldTurnPage({ dx: 59, dy: 0 })).toBe(null)
  })

  it('ignores a mostly-vertical drag, so scrolling never turns a page', () => {
    // 80px across but 60px down: 80 < 1.4 x 60, so it is a scroll.
    expect(shouldTurnPage({ dx: -80, dy: 60 })).toBe(null)
  })

  it('turns on a diagonal that clears the 1.4 ratio', () => {
    expect(shouldTurnPage({ dx: -80, dy: 40 })).toBe('forward')
  })

  it('commits on a forward diagonal exactly at the ratio', () => {
    // 70 === 1.4 x 50 - the boundary itself belongs to the turn.
    expect(shouldTurnPage({ dx: -70, dy: 50 })).toBe('forward')
  })

  it('refuses a forward diagonal one pixel inside the ratio', () => {
    // 69 < 1.4 x 50. The pair either side of the boundary is the whole point
    // of this rule: it is the clause that separates a swipe from a scroll.
    expect(shouldTurnPage({ dx: -69, dy: 50 })).toBe(null)
  })

  it('commits on a backward diagonal exactly at the ratio', () => {
    expect(shouldTurnPage({ dx: 70, dy: 50 })).toBe('backward')
  })

  it('refuses a backward diagonal one pixel inside the ratio', () => {
    expect(shouldTurnPage({ dx: 69, dy: 50 })).toBe(null)
  })

  it('reads an upward drag exactly as it reads a downward one', () => {
    // The vertical clause is about how diagonal the gesture is, not which way
    // the reader's thumb travelled, so both signs of dy are the same swipe.
    expect(shouldTurnPage({ dx: -80, dy: -60 })).toBe(null)
    expect(shouldTurnPage({ dx: -80, dy: -40 })).toBe('forward')
  })

  it('refuses a backward swipe that is mostly vertical', () => {
    expect(shouldTurnPage({ dx: 80, dy: -60 })).toBe(null)
  })

  it('refuses a straight vertical scroll', () => {
    expect(shouldTurnPage({ dx: 0, dy: 300 })).toBe(null)
  })

  it('refuses a long scroll that drifted sideways', () => {
    expect(shouldTurnPage({ dx: 20, dy: 400 })).toBe(null)
  })

  it('refuses a scroll that drifted sideways past the distance threshold', () => {
    // Both clauses matter, and this is the case that proves the second one
    // does: 90px is over the threshold, and it is still a scroll.
    expect(shouldTurnPage({ dx: 90, dy: 400 })).toBe(null)
  })

  it('refuses a gesture that did not move at all', () => {
    expect(shouldTurnPage({ dx: 0, dy: 0 })).toBe(null)
  })

  it('ignores the vertical entirely when a swipe is flat', () => {
    expect(shouldTurnPage({ dx: 200, dy: 0 })).toBe('backward')
  })

  it('states the two constants the handoff gives it', () => {
    expect({ distance: SWIPE_MIN_DISTANCE_PX, ratio: SWIPE_HORIZONTAL_RATIO }).toEqual({ distance: 60, ratio: 1.4 })
  })
})
