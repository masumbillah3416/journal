import { typeScale } from '@travel-diary/tokens/type'
import { describe, expect, it } from 'vitest'
import { COVER_TITLE_AVAILABLE_PX, COVER_TITLE_SIZE, fitTitleSize } from './coverTitle'

describe('fitTitleSize', () => {
  it('renders the handoff default title "Wanderings" at its designed 124px', () => {
    // SCREENS.md §1.1's table gives the cover title as "Caveat 124px / .9" for
    // the seeded title, so the formula must land exactly there for it.
    expect(fitTitleSize('Wanderings', COVER_TITLE_AVAILABLE_PX)).toBe(typeScale.diary.coverTitle)
  })

  it('caps a one-word title at the maximum rather than growing it past the design size', () => {
    // 5 characters computes 497px unclamped; the cap is what holds it at 124.
    expect(fitTitleSize('Kyoto', COVER_TITLE_AVAILABLE_PX)).toBe(124)
  })

  it('shrinks a mid-length title to the floored formula result', () => {
    // 30 characters: floor(0.9 x 1106 / (30 x 0.4)) = floor(82.95) = 82.
    expect(fitTitleSize('a'.repeat(30), COVER_TITLE_AVAILABLE_PX)).toBe(82)
  })

  it('still returns the maximum at the exact length the upper clamp last engages', () => {
    // 20 characters: floor(124.425) = 124, which is the maximum itself.
    expect(fitTitleSize('a'.repeat(20), COVER_TITLE_AVAILABLE_PX)).toBe(124)
  })

  it('drops below the maximum at the first length past the upper clamp boundary', () => {
    // 21 characters: floor(118.49...) = 118, the first value the clamp lets through.
    expect(fitTitleSize('a'.repeat(21), COVER_TITLE_AVAILABLE_PX)).toBe(118)
  })

  it('still returns the formula result at the exact length the lower clamp last allows', () => {
    // 65 characters: floor(38.28) = 38, which is the minimum itself.
    expect(fitTitleSize('a'.repeat(65), COVER_TITLE_AVAILABLE_PX)).toBe(38)
  })

  it('floors a very long title at the minimum rather than truncating it', () => {
    // 66 characters would compute 37; the clamp holds it at 38. Pinned as a
    // literal, not as COVER_TITLE_SIZE.min - an assertion that reads the
    // constant it is guarding moves with it and can never fail (CLAUDE.md §2.3).
    expect(fitTitleSize('a'.repeat(66), COVER_TITLE_AVAILABLE_PX)).toBe(38)
  })

  it('holds a wildly long title at the minimum, never below it', () => {
    expect(fitTitleSize('a'.repeat(400), COVER_TITLE_AVAILABLE_PX)).toBe(38)
  })

  it('returns the maximum for an empty title rather than a division-by-zero result', () => {
    expect(fitTitleSize('', COVER_TITLE_AVAILABLE_PX)).toBe(124)
  })

  it('scales with the space available, not only with the title length', () => {
    // Half the width halves the unclamped result: floor(0.9 x 553 / 12) = 41.
    expect(fitTitleSize('a'.repeat(30), 553)).toBe(41)
  })
})

describe('COVER_TITLE_SIZE', () => {
  it('clamps between the prototype’s 38px floor and the handoff’s designed 124px', () => {
    expect(COVER_TITLE_SIZE).toEqual({ min: 38, max: 124 })
  })
})

describe('COVER_TITLE_AVAILABLE_PX', () => {
  it('is the page area inside the design box less the cover column padding', () => {
    // 1300 design box - 36px/18px page-area inset - 2 x 70px cover padding.
    expect(COVER_TITLE_AVAILABLE_PX).toBe(1106)
  })
})
