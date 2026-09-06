import { describe, expect, it } from 'vitest'
import { formatCountdown, secondsRemaining } from './otpCountdown'

/** A five-minute window, the length of a real challenge's life. */
const FIVE_MINUTES_MS = 300_000

describe('secondsRemaining', () => {
  it('reports the whole window at the instant it starts', () => {
    expect(secondsRemaining({ startedAt: 1_000, now: 1_000, windowMs: FIVE_MINUTES_MS })).toBe(300)
  })

  it('counts down a second for each second that passes', () => {
    expect(secondsRemaining({ startedAt: 1_000, now: 61_000, windowMs: FIVE_MINUTES_MS })).toBe(240)
  })

  it('rounds a part-second up, so a window is never reported as over while it is still running', () => {
    // 299.5s left. Rounding down would print "4:59" while 5:00 was still true,
    // and would print "0:00" for the whole of the final second.
    expect(secondsRemaining({ startedAt: 0, now: 500, windowMs: FIVE_MINUTES_MS })).toBe(300)
  })

  it('reports one second while the last second is still running', () => {
    expect(secondsRemaining({ startedAt: 0, now: 299_500, windowMs: FIVE_MINUTES_MS })).toBe(1)
  })

  it('reports nothing left once the window has closed', () => {
    expect(secondsRemaining({ startedAt: 0, now: FIVE_MINUTES_MS, windowMs: FIVE_MINUTES_MS })).toBe(0)
  })

  it('stays at nothing left long after the window has closed, rather than going negative', () => {
    expect(secondsRemaining({ startedAt: 0, now: 10 * FIVE_MINUTES_MS, windowMs: FIVE_MINUTES_MS })).toBe(0)
  })

  it('reports no more than the whole window when the clock is behind the start', () => {
    // Ordinary skew between two machines. A reader must not be shown six
    // minutes left on a five-minute code.
    expect(secondsRemaining({ startedAt: 10_000, now: 0, windowMs: FIVE_MINUTES_MS })).toBe(300)
  })

  it('reports nothing left when the start is not a real instant', () => {
    expect(secondsRemaining({ startedAt: Number.NaN, now: 0, windowMs: FIVE_MINUTES_MS })).toBe(0)
  })

  it('reports nothing left when the clock is not a real instant', () => {
    // NaN, not Infinity: an infinite instant already falls out of the
    // subtraction as "the window closed long ago" and would pass with the
    // guard deleted, so it would prove nothing about the guard.
    expect(secondsRemaining({ startedAt: 0, now: Number.NaN, windowMs: FIVE_MINUTES_MS })).toBe(0)
  })

  it('measures the thirty-second resend window as readily as the five-minute one', () => {
    expect(secondsRemaining({ startedAt: 0, now: 5_000, windowMs: 30_000 })).toBe(25)
  })
})

describe('formatCountdown', () => {
  it('prints five minutes as the handoff writes it', () => {
    expect(formatCountdown(300)).toBe('5:00')
  })

  it('pads the seconds to two digits', () => {
    expect(formatCountdown(61)).toBe('1:01')
  })

  it('prints a sub-minute remainder with a leading zero minute', () => {
    expect(formatCountdown(59)).toBe('0:59')
  })

  it('prints an exhausted window as zero', () => {
    expect(formatCountdown(0)).toBe('0:00')
  })

  it('prints minutes above ten without truncating them', () => {
    expect(formatCountdown(3_599)).toBe('59:59')
  })
})
