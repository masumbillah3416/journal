import { typeScale } from '@travel-diary/tokens/type'
import { describe, expect, it } from 'vitest'
import {
  CAVEAT_EM_PER_CHARACTER,
  CHIP_COVER_TITLE_AVAILABLE_PX,
  CHIP_COVER_TITLE_SIZE,
  COVER_TITLE_AVAILABLE_PX,
  COVER_TITLE_SIZE,
  fitChipTitleSize,
  fitMobileTitleSize,
  fitPreviewTitleSize,
  fitTitleSize,
  MOBILE_COVER_TITLE_SIZE,
  PREVIEW_COVER_TITLE_AVAILABLE_PX,
  PREVIEW_COVER_TITLE_SIZE,
} from './coverTitle'

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

describe('fitMobileTitleSize', () => {
  it('renders the handoff default title "Wanderings" at the size the prototype draws it', () => {
    // The prototype's own mobile formula, floor(260 / (10 x 0.4)) = 65.
    expect(fitMobileTitleSize('Wanderings')).toBe(65)
  })

  it('shrinks a longer title so it still fits the phone', () => {
    // floor(260 / (20 x 0.4)) = 32, held at the 38px floor.
    expect(fitMobileTitleSize('a'.repeat(20))).toBe(38)
  })

  it('holds a short title at the mobile maximum, not the book cover’s 124px', () => {
    // floor(260 / (3 x 0.4)) = 216, clamped to 74 - a 124px title would be
    // the desktop cover's size printed on a 390px screen.
    expect(fitMobileTitleSize('Rio')).toBe(74)
  })

  it('returns the mobile maximum for an empty title rather than a division-by-zero result', () => {
    expect(fitMobileTitleSize('')).toBe(74)
  })

  it('never falls below the floor, however long the title', () => {
    expect(fitMobileTitleSize('a'.repeat(400))).toBe(38)
  })
})

describe('MOBILE_COVER_TITLE_SIZE', () => {
  it('clamps between the prototype’s 38px floor and its 74px mobile maximum', () => {
    expect(MOBILE_COVER_TITLE_SIZE).toEqual({ min: 38, max: 74 })
  })
})

/**
 * The longest title `fitPreviewTitleSize` can still fit inside the admin
 * preview's box, in characters.
 *
 * A MEASURED BOUNDARY, not a design figure: the answer is already
 * {@link PREVIEW_COVER_TITLE_SIZE}.min at 30 characters and cannot go lower, so
 * the width model crosses {@link PREVIEW_COVER_TITLE_AVAILABLE_PX} at 33
 * (33 x 0.4 x 11 = 145.2 against 144). Written here as a literal so the two
 * cases either side of it move together and neither can be satisfied by reading
 * the function it is guarding (CLAUDE.md §2.3).
 */
const LONGEST_FITTING_TITLE = 32

describe('fitPreviewTitleSize', () => {
  it('renders the handoff default title at the size the admin prototype draws it', () => {
    // The prototype's own preview call, `fitTitle(144, 36, …)`:
    // floor(0.9 x 144 / (10 x 0.4)) = 32.
    expect(fitPreviewTitleSize('Wanderings')).toBe(32)
  })

  it('holds a short title at the preview maximum, not the cover’s 124px', () => {
    // floor(0.9 x 144 / (3 x 0.4)) = 108, clamped to 36 — a 124px title would
    // be four fifths of the height of a 224px preview.
    expect(fitPreviewTitleSize('Rio')).toBe(36)
  })

  it('still returns the maximum at the exact length the upper clamp last engages', () => {
    // 9 characters: floor(36) = 36, which is the maximum itself.
    expect(fitPreviewTitleSize('a'.repeat(9))).toBe(36)
  })

  it('drops below the maximum at the first length past the upper clamp boundary', () => {
    // 10 characters: floor(32.4) = 32, the first value the clamp lets through.
    expect(fitPreviewTitleSize('a'.repeat(10))).toBe(32)
  })

  it('still returns the formula result at the exact length the lower clamp last allows', () => {
    // 29 characters: floor(11.17) = 11, which is the minimum itself.
    expect(fitPreviewTitleSize('a'.repeat(29))).toBe(11)
  })

  it('floors a very long title at the minimum rather than truncating it', () => {
    // 30 characters would compute 10; the clamp holds it at 11. Pinned as a
    // literal rather than as the constant it guards (CLAUDE.md §2.3).
    expect(fitPreviewTitleSize('a'.repeat(30))).toBe(11)
  })

  it('returns the maximum for an empty title rather than a division-by-zero result', () => {
    expect(fitPreviewTitleSize('')).toBe(36)
  })

  it('keeps every title up to the length the floor can still hold inside the box', () => {
    // THE FITTING PROPERTY ITSELF, which no jsdom case can assert: jsdom
    // performs no layout, so nothing there measures text against a boundary.
    // Here it is a property of the function — the module's own width model
    // (`length x CAVEAT_EM_PER_CHARACTER x fitted`) against the box the title
    // has — DRIVEN OVER THE WHOLE RANGE rather than sampled at one length,
    // because a single input proves nothing about a clamped formula.
    const escaped = Array.from({ length: LONGEST_FITTING_TITLE }, (_, index) => index + 1).filter((length) => {
      const fitted = fitPreviewTitleSize('a'.repeat(length))
      return length * CAVEAT_EM_PER_CHARACTER * fitted > PREVIEW_COVER_TITLE_AVAILABLE_PX
    })

    expect(escaped).toEqual([])
  })

  it('shrinks a title that needs shrinking, rather than holding it at the designed size', () => {
    // The other half of "fits": a title the box cannot hold at the maximum comes
    // back SMALLER than the maximum. Without this, a function that returned the
    // floor for everything would satisfy the case above.
    expect(fitPreviewTitleSize('a'.repeat(LONGEST_FITTING_TITLE))).toBeLessThan(PREVIEW_COVER_TITLE_SIZE.max)
  })

  it('stops fitting one character past the floor’s reach, which the stylesheet’s ellipsis then catches', () => {
    // THE HONEST END OF THE PROPERTY, and it is not a defect. SCREENS.md §1.1
    // says the clamp's floor is where fitting stops and calls the ellipsis "a
    // last-resort floor only": past this length the answer is already
    // `PREVIEW_COVER_TITLE_SIZE.min` and cannot go lower, so the width model
    // leaves the box. Pinned so that nobody reads the case above as a promise
    // the module does not make.
    const past = LONGEST_FITTING_TITLE + 1
    const fitted = fitPreviewTitleSize('a'.repeat(past))

    expect({
      atTheFloor: fitted === PREVIEW_COVER_TITLE_SIZE.min,
      insideTheBox: past * CAVEAT_EM_PER_CHARACTER * fitted <= PREVIEW_COVER_TITLE_AVAILABLE_PX,
    }).toEqual({ atTheFloor: true, insideTheBox: false })
  })
})

describe('PREVIEW_COVER_TITLE_SIZE', () => {
  it('clamps between the admin prototype’s own 11px floor and its 36px maximum', () => {
    expect(PREVIEW_COVER_TITLE_SIZE).toEqual({ min: 11, max: 36 })
  })
})

describe('PREVIEW_COVER_TITLE_AVAILABLE_PX', () => {
  it('is the 172px preview less its own 14px side padding, which is what the prototype passes', () => {
    expect(PREVIEW_COVER_TITLE_AVAILABLE_PX).toBe(144)
  })
})

/**
 * The longest title `fitChipTitleSize` can still fit inside SCREENS.md §2.1's
 * 78x104px cloth chip, in characters.
 *
 * A MEASURED BOUNDARY, exactly as {@link LONGEST_FITTING_TITLE} is for the
 * preview: the answer is already {@link CHIP_COVER_TITLE_SIZE}.min at 13
 * characters and cannot go lower, so the width model crosses
 * {@link CHIP_COVER_TITLE_AVAILABLE_PX} at 15 (15 x 0.4 x 11 = 66 against 62).
 * Written here as a literal so the two cases either side of it move together
 * and neither can be satisfied by reading the function it is guarding
 * (CLAUDE.md §2.3).
 */
const LONGEST_FITTING_CHIP_TITLE = 14

describe('fitChipTitleSize', () => {
  it('renders the handoff default title at the size the admin prototype draws it in the chip', () => {
    // The prototype's own chip call, `fitTitle(62, 19, {})`:
    // floor(0.9 x 62 / (10 x 0.4)) = 13.
    expect(fitChipTitleSize('Wanderings')).toBe(13)
  })

  it('holds a short title at the chip maximum, not the preview’s 36px', () => {
    // floor(0.9 x 62 / (3 x 0.4)) = 46, clamped to 19 — a 36px title would be
    // a third of the height of a 104px chip.
    expect(fitChipTitleSize('Rio')).toBe(19)
  })

  it('still clamps at the last length the formula overshoots the maximum', () => {
    // 6 characters: the formula answers floor(23.25) = 23, so the CLAMP is what
    // returns 19 here. This is the case that moves when CHIP_COVER_TITLE_SIZE
    // .max moves, which is what makes it a boundary rather than a sample —
    // `a'.repeat(7)` below does not move with it, and an assertion that cannot
    // move with the constant it claims to pin is pinning nothing (standing
    // orders, species 2).
    expect(fitChipTitleSize('a'.repeat(6))).toBe(19)
  })

  it('takes the formula’s own answer at the first length it fits under the maximum', () => {
    // 7 characters: floor(19.92) = 19, which the clamp never touches — it is
    // the maximum by arithmetic rather than by clamping. The permitted side of
    // the boundary above.
    expect(fitChipTitleSize('a'.repeat(7))).toBe(19)
  })

  it('drops below the maximum at the first length the formula does', () => {
    // 8 characters: floor(17.43) = 17.
    expect(fitChipTitleSize('a'.repeat(8))).toBe(17)
  })

  it('takes the formula’s own answer at the last length it stays above the floor', () => {
    // 12 characters: floor(11.62) = 11, which is the minimum itself — reached
    // by arithmetic, not by the clamp. The permitted side of the floor.
    expect(fitChipTitleSize('a'.repeat(12))).toBe(11)
  })

  it('floors a very long title at the minimum rather than truncating it', () => {
    // 13 characters would compute 10; the clamp holds it at 11. Pinned as a
    // literal rather than as the constant it guards (CLAUDE.md §2.3).
    expect(fitChipTitleSize('a'.repeat(13))).toBe(11)
  })

  it('returns the maximum for an empty title rather than a division-by-zero result', () => {
    expect(fitChipTitleSize('')).toBe(19)
  })

  it('keeps every title up to the length the floor can still hold inside the chip', () => {
    // THE FITTING PROPERTY ITSELF, driven over the whole range rather than
    // sampled — the same shape `fitPreviewTitleSize`'s carries, against this
    // box. It is the number the defect moves: a chip drawn with the PREVIEW's
    // fitter answers 32px for a ten-character title, which this model puts at
    // 128px wide inside 62px of room, and `overview.module.css`'s ellipsis
    // would hide every pixel of the overflow.
    const escaped = Array.from({ length: LONGEST_FITTING_CHIP_TITLE }, (_, index) => index + 1).filter((length) => {
      const fitted = fitChipTitleSize('a'.repeat(length))
      return length * CAVEAT_EM_PER_CHARACTER * fitted > CHIP_COVER_TITLE_AVAILABLE_PX
    })

    expect(escaped).toEqual([])
  })

  it('shrinks a title that needs shrinking, rather than holding it at the designed size', () => {
    // The other half of "fits": without this, a function that returned the
    // floor for everything would satisfy the case above.
    expect(fitChipTitleSize('a'.repeat(LONGEST_FITTING_CHIP_TITLE))).toBeLessThan(CHIP_COVER_TITLE_SIZE.max)
  })

  it('stops fitting one character past the floor’s reach, which the stylesheet’s ellipsis then catches', () => {
    // THE HONEST END OF THE PROPERTY, and it is not a defect — SCREENS.md
    // §1.1's ellipsis is "a last-resort floor only". Pinned so that nobody
    // reads the case above as a promise the module does not make.
    const past = LONGEST_FITTING_CHIP_TITLE + 1
    const fitted = fitChipTitleSize('a'.repeat(past))

    expect({
      atTheFloor: fitted === CHIP_COVER_TITLE_SIZE.min,
      insideTheBox: past * CAVEAT_EM_PER_CHARACTER * fitted <= CHIP_COVER_TITLE_AVAILABLE_PX,
    }).toEqual({ atTheFloor: true, insideTheBox: false })
  })

  it('is a narrower fit than the preview’s at the same title, because the chip is a narrower box', () => {
    // THE TWO-OF-THE-THING-BEING-DISTINGUISHED CASE (standing order 14). A
    // chip drawn through `fitPreviewTitleSize` is the defect this fitter
    // exists to prevent, and only a comparison holding BOTH answers can say
    // the chip took its own.
    expect(fitChipTitleSize('Wanderings')).toBeLessThan(fitPreviewTitleSize('Wanderings'))
  })
})

describe('CHIP_COVER_TITLE_SIZE', () => {
  it('clamps between the admin prototype’s own 11px floor and its 19px chip maximum', () => {
    expect(CHIP_COVER_TITLE_SIZE).toEqual({ min: 11, max: 19 })
  })
})

describe('CHIP_COVER_TITLE_AVAILABLE_PX', () => {
  it('is the 78px chip less its own 8px side padding, which is what the prototype passes', () => {
    expect(CHIP_COVER_TITLE_AVAILABLE_PX).toBe(62)
  })
})
