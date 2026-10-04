import { describe, expect, it } from 'vitest'

import { cookieValueFor, hashReaderPassword, readerPasswordMatches } from './readerPassword'

describe('the stored reader password', () => {
  it('matches the password it was made from', async () => {
    const stored = await hashReaderPassword('tokyo 2019')

    expect(await readerPasswordMatches('tokyo 2019', stored)).toBe(true)
  })

  it('does not match a different one, which is what stops the first case being vacuous', async () => {
    const stored = await hashReaderPassword('tokyo 2019')

    expect(await readerPasswordMatches('tokyo 2018', stored)).toBe(false)
  })

  it('hashes the same password to two different strings, because the salt is per-write', async () => {
    expect(await hashReaderPassword('tokyo 2019')).not.toBe(await hashReaderPassword('tokyo 2019'))
  })

  it('answers false for a stored value this repository did not write, rather than throwing', async () => {
    expect(await readerPasswordMatches('tokyo 2019', 'not-a-stored-hash')).toBe(false)
  })

  // THE OTHER SHAPE OF MALFORMED, and the one that reaches further in: this
  // names the right scheme and a real salt, so it passes the split and gets
  // as far as the comparison. `timingSafeEqual` THROWS on a length mismatch,
  // so without the length check above it this is a 500 on every page of the
  // book rather than a closed door.
  it('answers false for a stored value whose key is the wrong length, where timingSafeEqual would throw', async () => {
    const truncated = `scrypt$${'ab'.repeat(16)}$${'cd'.repeat(8)}`

    expect(await readerPasswordMatches('tokyo 2019', truncated)).toBe(false)
  })

  // REVIEW FOCUS 2. The cookie carries a value derived from the STORED HASH,
  // and the salt changes on every write - so saving a new password, or the
  // same one again, retires every cookie in the wild. There is no session
  // table to sweep and no reader to log out.
  it('derives a different cookie value after the password is saved again, so old cookies die', async () => {
    const before = cookieValueFor(await hashReaderPassword('tokyo 2019'))
    const after = cookieValueFor(await hashReaderPassword('tokyo 2019'))

    expect(after).not.toBe(before)
  })

  it('derives the same cookie value for one stored hash, so a reader is not evicted at random', async () => {
    const stored = await hashReaderPassword('tokyo 2019')

    expect(cookieValueFor(stored)).toBe(cookieValueFor(stored))
  })

  it('never puts the stored hash in the cookie, which would hand a reader the thing to crack', async () => {
    const stored = await hashReaderPassword('tokyo 2019')

    expect(cookieValueFor(stored)).not.toContain(stored)
  })
})
