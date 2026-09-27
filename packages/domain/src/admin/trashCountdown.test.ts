/**
 * trashCountdown.test.ts — SCREENS.md §2.10's "goes for good in 30 days",
 * counted from the instant a journey was thrown away.
 * Depends on: vitest, ./trashCountdown.
 */
import { describe, expect, it } from 'vitest'
import { TRASH_WINDOW_DAYS, daysUntilGone, goesForGoodLine } from './trashCountdown'

/** One day, in milliseconds — the unit every case below counts in. */
const DAY = 24 * 60 * 60 * 1_000

/** The instant the fixture journey was thrown away. */
const THROWN_AWAY = '2026-09-01T09:00:00.000Z'

/** {@link THROWN_AWAY} as a number, so a case can add days to it. */
const AT = Date.parse(THROWN_AWAY)

describe('daysUntilGone', () => {
  it('gives the whole window on the day it was thrown away', () => {
    expect(daysUntilGone(THROWN_AWAY, AT)).toBe(30)
  })

  it('gives one day on the twenty-ninth, which is the last day the row is still listed', () => {
    expect(daysUntilGone(THROWN_AWAY, AT + 29 * DAY)).toBe(1)
  })

  it('still gives one day a millisecond before the window closes, which is the last value that is not zero', () => {
    // THE PERMITTED SIDE OF THE BOUNDARY §2.10 turns on. A version flooring
    // instead of rounding up reports 0 here, and the screen tells an author
    // a journey is gone on the day they can still put it back.
    expect(daysUntilGone(THROWN_AWAY, AT + 30 * DAY - 1)).toBe(1)
  })

  it('gives none at exactly thirty days, which is the first instant the row is past the window', () => {
    expect(daysUntilGone(THROWN_AWAY, AT + 30 * DAY)).toBe(0)
  })

  it('gives none rather than a negative number for a row already past the window', () => {
    expect(daysUntilGone(THROWN_AWAY, AT + 45 * DAY)).toBe(0)
  })

  it('counts from the window constant, so the boundary moves when the window does', () => {
    // A module with a literal thirty passes every case above. This one asks
    // the same question one day either side of the CONSTANT, so a hard-coded
    // window fails the moment §2.10's thirty days becomes some other number.
    expect([
      daysUntilGone(THROWN_AWAY, AT + (TRASH_WINDOW_DAYS - 1) * DAY),
      daysUntilGone(THROWN_AWAY, AT + TRASH_WINDOW_DAYS * DAY),
    ]).toEqual([1, 0])
  })

  it('refuses a stamp that is not an instant rather than counting from a silent NaN', () => {
    // `deletedAt` arrives from Postgres through Payload, and the TYPE allows
    // any string. Arithmetic on `NaN` produces `NaN`, which React renders as
    // the word "NaN" beside a Delete for good button.
    expect(daysUntilGone('not a date', AT)).toBe(0)
  })
})

describe('goesForGoodLine', () => {
  it('writes §2.10’s own line for a journey with days left', () => {
    expect(goesForGoodLine(30)).toBe('goes for good in 30 days')
  })

  it('writes the singular on the last day, because “in 1 days” is not a sentence', () => {
    expect(goesForGoodLine(1)).toBe('goes for good in 1 day')
  })

  it('names no mechanism once the window has closed, because there is no sweep', () => {
    // The Task 13 review's F6. This asserted "goes for good on the next
    // sweep", which named a job that does not exist: nothing in this
    // repository removes a journey but an author pressing Delete for good.
    expect(goesForGoodLine(0)).toBe('still here until you delete it')
  })

  it('promises no sweep in any line it can print, at any number of days', () => {
    // THE WHOLE POPULATION, not the one line that was wrong. A future edit
    // that reintroduced the word anywhere in this module's copy fails here.
    const everyLine = [0, 1, 2, TRASH_WINDOW_DAYS].map((days) => goesForGoodLine(days))

    expect(everyLine.filter((line) => line.includes('sweep'))).toEqual([])
  })
})
