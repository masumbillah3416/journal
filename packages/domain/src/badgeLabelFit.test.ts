import { describe, expect, it } from 'vitest'
import { BADGE_LABEL_AVAILABLE_TEXT_PX, BADGE_LABEL_SIZE, badgeLabelFontSize } from './badgeLabelFit'

describe('badgeLabelFontSize', () => {
  it('renders the handoff default 11px for a short label, e.g. the seeded "WIDE EYED"', () => {
    // SCREENS.md §1.3: "Courier 11px .08em". 9 characters (including the
    // space) fits comfortably under the 78px available for text.
    expect(badgeLabelFontSize('WIDE EYED')).toBe(BADGE_LABEL_SIZE.max)
  })

  it('holds every seeded weather label at 11px — the longest is 9 characters', () => {
    // CLEAR 14C, CRISP 12C and HUMID 24C are the seed's longest weather
    // lines, all 9 characters. None of them needs to step down.
    expect(badgeLabelFontSize('CLEAR 14C')).toBe(BADGE_LABEL_SIZE.max)
    expect(badgeLabelFontSize('CRISP 12C')).toBe(BADGE_LABEL_SIZE.max)
    expect(badgeLabelFontSize('HUMID 24C')).toBe(BADGE_LABEL_SIZE.max)
  })

  it('steps a 10-character label down rather than leaving it a pixel over', () => {
    // 10 x 7.9 = 79px, one pixel past the 78px available at 11px.
    expect(badgeLabelFontSize('A'.repeat(10))).toBe(10.5)
  })

  it('steps the seeded "OVERWHELMED" (Marrakech’s mood, 11 characters) down to 9.5px', () => {
    // The exact case this function exists for: measured in the pinned
    // container at 11px, "OVERWHELMED" is 105px against a 96px badge — 9px
    // over. 78 x 11 / (11 x 7.9) = 9.87, floored to the nearest half pixel.
    expect(badgeLabelFontSize('OVERWHELMED')).toBe(9.5)
  })

  it('floors a very long label at the minimum rather than shrinking it to illegibility', () => {
    expect(badgeLabelFontSize('A'.repeat(30))).toBe(BADGE_LABEL_SIZE.min)
  })

  it('holds a wildly long label at the minimum, never below it', () => {
    expect(badgeLabelFontSize('A'.repeat(200))).toBe(BADGE_LABEL_SIZE.min)
  })

  it('returns the maximum for an empty label rather than a division-by-zero result', () => {
    expect(badgeLabelFontSize('')).toBe(BADGE_LABEL_SIZE.max)
  })
})

describe('BADGE_LABEL_SIZE', () => {
  it('clamps between an 8px floor and the handoff’s designed 11px', () => {
    expect(BADGE_LABEL_SIZE).toEqual({ min: 8, max: 11 })
  })
})

describe('BADGE_LABEL_AVAILABLE_TEXT_PX', () => {
  it('is the 96px inner circle less the 18px of stated padding', () => {
    expect(BADGE_LABEL_AVAILABLE_TEXT_PX).toBe(78)
  })
})
