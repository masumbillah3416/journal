import { describe, expect, it } from 'vitest'
import { aChallenge } from '../testing/factories'
import { EXPIRY_MS, HOURLY_RESEND_CAP, MAX_ATTEMPTS, RESEND_COOLDOWN_MS, canResend, challengeState } from './otpChallenge'

describe('challengeState', () => {
  it('is valid inside the five-minute window with attempts remaining', () => {
    expect(challengeState(aChallenge({ createdAt: 0, attempts: 0 }), 4 * 60_000)).toBe('valid')
  })

  it('expires exactly at five minutes, not after', () => {
    expect(challengeState(aChallenge({ createdAt: 0 }), EXPIRY_MS)).toBe('expired')
  })

  it('is exhausted at three attempts, so a fourth guess cannot be offered', () => {
    // Six digits is a million combinations. Without this the limit is cosmetic.
    expect(challengeState(aChallenge({ attempts: MAX_ATTEMPTS }), 0)).toBe('exhausted')
  })

  it('is consumed once used, so a code cannot be replayed', () => {
    expect(challengeState(aChallenge({ consumedAt: 1_000 }), 2_000)).toBe('consumed')
  })

  it('reports consumed before expired when both are true', () => {
    // Ordering matters for the message the reader sees; consumption is the
    // more specific fact.
    expect(challengeState(aChallenge({ consumedAt: 1_000, createdAt: 0 }), EXPIRY_MS + 1)).toBe('consumed')
  })

  it('reports consumed before exhausted when both are true', () => {
    // Consumption means the code worked and was spent — the most specific
    // fact available, and it must win even when the attempt budget is also
    // spent.
    expect(challengeState(aChallenge({ consumedAt: 1_000, attempts: MAX_ATTEMPTS }), 2_000)).toBe('consumed')
  })

  it('reports exhausted before expired when both are true and the code was never consumed', () => {
    // Exhaustion means the challenge was deliberately invalidated by three
    // wrong guesses — more specific than merely having aged out.
    expect(challengeState(aChallenge({ attempts: MAX_ATTEMPTS, createdAt: 0 }), EXPIRY_MS)).toBe('exhausted')
  })

  it('reports consumed when all three conditions hold at once', () => {
    expect(
      challengeState(aChallenge({ consumedAt: 1_000, attempts: MAX_ATTEMPTS, createdAt: 0 }), EXPIRY_MS + 1),
    ).toBe('consumed')
  })

  it('clamps elapsed time at zero when createdAt is in the future, so ordinary clock skew between servers does not expire a legitimate challenge', () => {
    expect(challengeState(aChallenge({ createdAt: 10_000, attempts: 0, consumedAt: null }), 5_000)).toBe('valid')
  })

  it('fails closed to expired when createdAt is not finite, since that means a bad date parse rather than a usable timestamp', () => {
    expect(challengeState(aChallenge({ createdAt: Number.NaN }), 0)).toBe('expired')
  })

  it('fails closed to expired when now is not finite', () => {
    expect(challengeState(aChallenge({ createdAt: 0 }), Number.NaN)).toBe('expired')
  })
})

describe('canResend', () => {
  it('refuses inside the thirty-second cooldown', () => {
    expect(canResend(0, 29_000, 1)).toEqual({ ok: false, error: 'cooldown' })
  })

  it('allows exactly at thirty seconds', () => {
    expect(canResend(0, RESEND_COOLDOWN_MS, 1)).toEqual({ ok: true, value: undefined })
  })

  it('refuses past the hourly ceiling even when the cooldown has passed', () => {
    expect(canResend(0, 60_000, HOURLY_RESEND_CAP)).toEqual({ ok: false, error: 'hourly-cap' })
  })

  it('fails closed when sentThisHour is negative, so a counting bug cannot become unlimited resends', () => {
    expect(canResend(0, 60_000, -1)).toEqual({ ok: false, error: 'hourly-cap' })
  })

  it('fails closed when sentThisHour is not an integer', () => {
    expect(canResend(0, 60_000, 1.5)).toEqual({ ok: false, error: 'hourly-cap' })
  })

  it('fails closed when sentThisHour is NaN, because every comparison against NaN is false', () => {
    expect(canResend(0, 60_000, Number.NaN)).toEqual({ ok: false, error: 'hourly-cap' })
  })

  it('fails closed when sentThisHour is Infinity', () => {
    expect(canResend(0, 60_000, Number.POSITIVE_INFINITY)).toEqual({ ok: false, error: 'hourly-cap' })
  })

  it('fails closed when lastSentAt is not finite', () => {
    expect(canResend(Number.NaN, 60_000, 1)).toEqual({ ok: false, error: 'hourly-cap' })
  })

  it('fails closed when now is not finite', () => {
    expect(canResend(0, Number.POSITIVE_INFINITY, 1)).toEqual({ ok: false, error: 'hourly-cap' })
  })
})
