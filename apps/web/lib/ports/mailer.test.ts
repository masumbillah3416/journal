/**
 * mailer.test.ts — unit tests for the Mailer port's own pure helpers.
 *
 * `validateEmailAddress` and `maskEmailAddress` are exercised indirectly by
 * every adapter's contract suite (mailer-contract.ts), but that suite only
 * ever calls `maskEmailAddress` on an address that already passed
 * validation. These tests cover the two functions' own edge cases directly,
 * since both are exported port-level behaviour, not private adapter detail.
 */
import { describe, expect, it } from 'vitest'
import { maskEmailAddress, validateEmailAddress } from './mailer'

describe('validateEmailAddress', () => {
  it('accepts a well-formed address', () => {
    expect(validateEmailAddress('reader@example.com')).toEqual({ ok: true, value: 'reader@example.com' })
  })

  it('rejects an address with no @', () => {
    expect(validateEmailAddress('not-an-email').ok).toBe(false)
  })

  it('rejects an address with no domain suffix', () => {
    expect(validateEmailAddress('reader@example').ok).toBe(false)
  })
})

describe('maskEmailAddress', () => {
  it('keeps the first character of the local part and the whole domain', () => {
    expect(maskEmailAddress('masum@example.com')).toBe('m***@example.com')
  })

  it('falls back to a fully-masked placeholder for an address with no @', () => {
    // Defensive: every real caller validates first, but the function is
    // exported port-level behaviour and must not throw on malformed input.
    expect(maskEmailAddress('not-an-email')).toBe('***')
  })
})
