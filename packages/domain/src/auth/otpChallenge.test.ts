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
})
