/**
 * rateWindow.test.ts — the sliding window on sign-in attempts, asserted
 * before it exists.
 *
 * Every case here names its own arithmetic in literals rather than reaching
 * for a fixture factory: the numbers ARE the behaviour under test, and a
 * factory whose every field each case overrides would hide the one thing a
 * reader needs to see. Time is a parameter throughout (CLAUDE.md §2.3) —
 * nothing in this file or the module it covers reads a clock.
 */
import { describe, expect, it } from 'vitest'
import {
  ACCOUNT_CODE_ATTEMPT_LIMIT,
  IP_ATTEMPT_LIMIT,
  SIGN_IN_WINDOW_MS,
  admitsAttempt,
} from './rateWindow'

describe('admitsAttempt', () => {
  it('admits an attempt whose rank is under the limit', () => {
    const decision = admitsAttempt({ attemptsAt: [200, 700], at: 700, windowMs: 1_000, limit: 3 })

    expect(decision).toEqual({ ok: true, value: undefined })
  })

  it('admits the attempt whose rank is exactly the limit, the last one a reader is still owed', () => {
    // Pins the threshold from the side the refusal case cannot: a limiter
    // shifted one attempt too strict refuses this and passes every other
    // case here.
    const decision = admitsAttempt({ attemptsAt: [200, 700], at: 700, windowMs: 1_000, limit: 2 })

    expect(decision).toEqual({ ok: true, value: undefined })
  })

  it('refuses the attempt whose rank passes the limit', () => {
    const decision = admitsAttempt({ attemptsAt: [200, 700, 900], at: 900, windowMs: 1_000, limit: 2 })

    expect(decision).toEqual({ ok: false, error: 'rate-limited' })
  })

  it('admits again once the oldest attempt falls out of the window', () => {
    // The same three earlier attempts as the refusal above, judged from a
    // later instant: 200 now sits outside the window, so this attempt's rank
    // is two rather than three. This is the whole of "sliding".
    const decision = admitsAttempt({ attemptsAt: [200, 700, 1_300], at: 1_300, windowMs: 1_000, limit: 2 })

    expect(decision).toEqual({ ok: true, value: undefined })
  })

  it('drops an attempt exactly one window old, so the window is half-open at its floor', () => {
    const decision = admitsAttempt({ attemptsAt: [0, 1_000], at: 1_000, windowMs: 1_000, limit: 1 })

    expect(decision).toEqual({ ok: true, value: undefined })
  })

  it('keeps an attempt one millisecond inside the window, so the floor is not off by one', () => {
    const decision = admitsAttempt({ attemptsAt: [0, 999], at: 999, windowMs: 1_000, limit: 1 })

    expect(decision).toEqual({ ok: false, error: 'rate-limited' })
  })

  it('ignores attempts recorded after this one, so a burst is refused in arrival order', () => {
    // The rank rule, and the reason this module counts at-or-before rather
    // than counting the window: three simultaneous attempts against a limit
    // of two must admit the first two and refuse the third, not refuse all
    // three or admit all three.
    const decision = admitsAttempt({ attemptsAt: [100, 200, 300], at: 200, windowMs: 1_000, limit: 2 })

    expect(decision).toEqual({ ok: true, value: undefined })
  })

  it('refuses when the attempt being decided is not among the recorded attempts', () => {
    // A rank of zero means the caller counted without first recording, which
    // is the read-then-count shape this module exists to make impossible.
    const decision = admitsAttempt({ attemptsAt: [], at: 700, windowMs: 1_000, limit: 2 })

    expect(decision).toEqual({ ok: false, error: 'rate-limited' })
  })

  it('refuses when the instant being judged is not a finite number', () => {
    const decision = admitsAttempt({ attemptsAt: [700], at: Number.NaN, windowMs: 1_000, limit: 2 })

    expect(decision).toEqual({ ok: false, error: 'rate-limited' })
  })

  it('refuses when the window is infinite, which would otherwise put every attempt ever made inside it', () => {
    // The other guard nothing else implies: an infinite window puts the
    // floor at negative infinity, so every recorded attempt counts and the
    // window stops sliding. Verified by mutation — see the task report.
    const decision = admitsAttempt({ attemptsAt: [700], at: 700, windowMs: Number.POSITIVE_INFINITY, limit: 2 })

    expect(decision).toEqual({ ok: false, error: 'rate-limited' })
  })

  it('refuses when the window is negative', () => {
    const decision = admitsAttempt({ attemptsAt: [700], at: 700, windowMs: -1, limit: 2 })

    expect(decision).toEqual({ ok: false, error: 'rate-limited' })
  })

  it('refuses with a window of zero length, because even the attempt itself is already outside it', () => {
    // A window of no length is a sane value with a degenerate meaning, not a
    // nonsensical one: every attempt, this one included, has already aged out
    // of it. Named for the outcome rather than as a guard boundary, because
    // the outcome is the same on both sides of `windowMs >= 0`.
    const decision = admitsAttempt({ attemptsAt: [700], at: 700, windowMs: 0, limit: 1 })

    expect(decision).toEqual({ ok: false, error: 'rate-limited' })
  })

  it('refuses when the limit is infinite, which would otherwise satisfy every comparison against it', () => {
    // One of the two guards nothing else in this module implies: without
    // `Number.isInteger`, an infinite limit admits every rank, which is a
    // limiter that has quietly turned itself off.
    const decision = admitsAttempt({ attemptsAt: [700], at: 700, windowMs: 1_000, limit: Number.POSITIVE_INFINITY })

    expect(decision).toEqual({ ok: false, error: 'rate-limited' })
  })

  it('refuses when the limit is negative', () => {
    const decision = admitsAttempt({ attemptsAt: [700], at: 700, windowMs: 1_000, limit: -1 })

    expect(decision).toEqual({ ok: false, error: 'rate-limited' })
  })

  it('refuses when the limit is fractional', () => {
    const decision = admitsAttempt({ attemptsAt: [700], at: 700, windowMs: 1_000, limit: 1.5 })

    expect(decision).toEqual({ ok: false, error: 'rate-limited' })
  })

  it('refuses when the limit is zero, because no attempt can rank below one', () => {
    // Pins `limit >= 0`'s zero side: a limit of zero is a sane value that
    // admits nothing, not a nonsensical one, and mutating the guard to
    // `> 0` would still refuse here — so the case is about the OUTCOME
    // being a refusal for the ordinary reason, alongside the fractional and
    // negative cases which refuse for the nonsensical one.
    const decision = admitsAttempt({ attemptsAt: [700], at: 700, windowMs: 1_000, limit: 0 })

    expect(decision).toEqual({ ok: false, error: 'rate-limited' })
  })

  it('refuses when any recorded attempt is not a finite number', () => {
    const decision = admitsAttempt({ attemptsAt: [200, Number.NaN, 700], at: 700, windowMs: 1_000, limit: 3 })

    expect(decision).toEqual({ ok: false, error: 'rate-limited' })
  })
})

describe('the limits SECURITY.md leaves unnumbered', () => {
  it('counts a quarter of an hour as the window on both endpoints', () => {
    expect(SIGN_IN_WINDOW_MS).toBe(15 * 60_000)
  })

  it('allows one address twenty attempts per window, far past a household and far below a brute force', () => {
    expect(IP_ATTEMPT_LIMIT).toBe(20)
  })

  it('allows one account ten code attempts per window, a backstop below what the per-challenge limits already permit', () => {
    expect(ACCOUNT_CODE_ATTEMPT_LIMIT).toBe(10)
  })
})
