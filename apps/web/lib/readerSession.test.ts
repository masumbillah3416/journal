import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

import { cookieValueFor } from './readerPassword'
import { readerIsAdmitted, readerMustUnlock } from './readerSession'

const STORED = `scrypt$00112233445566778899aabbccddeeff$${'ab'.repeat(64)}`

describe('whether a reader is admitted', () => {
  it('admits one carrying the value this stored hash derives', () => {
    expect(readerIsAdmitted(`td-reader=${cookieValueFor(STORED)}`, STORED)).toBe(true)
  })

  it('refuses one carrying a value derived from a different stored hash', () => {
    const other = `scrypt$ffeeddccbbaa99887766554433221100$${'cd'.repeat(64)}`

    expect(readerIsAdmitted(`td-reader=${cookieValueFor(other)}`, STORED)).toBe(false)
  })

  it('refuses a header with no cookie at all', () => {
    expect(readerIsAdmitted(null, STORED)).toBe(false)
  })

  // THE LESSON apps/web/lib/auth/browserSession.ts ALREADY LEARNED, applied
  // here: a scan for the name inside the header matches `not-td-reader=` too,
  // and would read a cookie an attacker chose the name of.
  it('is not fooled by a cookie whose name ends with the one it wants', () => {
    expect(readerIsAdmitted(`not-td-reader=${cookieValueFor(STORED)}`, STORED)).toBe(false)
  })

  it('finds the cookie when it is not the first in the header', () => {
    expect(readerIsAdmitted(`other=1; td-reader=${cookieValueFor(STORED)}; third=3`, STORED)).toBe(true)
  })

  // THE CASE THAT MAKES `startsWith` LOAD-BEARING, and the reason the one
  // above it is not enough. A matcher that merely CONTAINS the name finds
  // this attacker-named pair first, fails on it, and never reaches the real
  // cookie behind it - so the attack is not admission, it is locking a
  // legitimate reader out of a diary by setting a cookie on it.
  it('admits a legitimate cookie that follows one an attacker named to shadow it', () => {
    expect(readerIsAdmitted(`not-td-reader=junk; td-reader=${cookieValueFor(STORED)}`, STORED)).toBe(true)
  })

  // THE CASE THAT MAKES THE EMPTY-COLUMN GUARD LOAD-BEARING. Without it an
  // empty column is hashed like any other value, and a cookie carrying what
  // THAT derives would be admitted to a book whose password was cleared.
  it('refuses a cookie minted against an empty column, which is what a cleared password would derive', () => {
    expect(readerIsAdmitted(`td-reader=${cookieValueFor('')}`, '')).toBe(false)
  })

  it('refuses everyone when no password is stored, so an unset column is not an open door', () => {
    expect(readerIsAdmitted(`td-reader=${cookieValueFor(STORED)}`, null)).toBe(false)
  })

  it('refuses everyone when the column is an empty string, which Payload writes for a cleared field', () => {
    expect(readerIsAdmitted(`td-reader=${cookieValueFor(STORED)}`, '')).toBe(false)
  })

  it('refuses a cookie carrying an empty value, which is how a browser sends a cleared one', () => {
    expect(readerIsAdmitted('td-reader=', STORED)).toBe(false)
  })
})

describe('whether this request must be sent to the unlock page', () => {
  const closed = { passwordProtect: true, indexGalleries: true, readerPasswordHash: STORED } as const
  const open = { passwordProtect: false, indexGalleries: true, readerPasswordHash: STORED } as const

  it('sends a stranger to unlock when the book is closed', () => {
    expect(readerMustUnlock(closed, null)).toBe(true)
  })

  it('lets a reader who typed the password straight through', () => {
    expect(readerMustUnlock(closed, `td-reader=${cookieValueFor(STORED)}`)).toBe(false)
  })

  // THE HALF THAT STOPS THE FIRST BEING THE WHOLE RULE. An open book asks
  // nobody for anything, so a reader with no cookie must not be redirected -
  // a gate that sent every reader to `/unlock` would also pass the first case.
  it('lets a stranger read an open book, cookie or no cookie', () => {
    expect([readerMustUnlock(open, null), readerMustUnlock(open, 'td-reader=rubbish')]).toEqual([false, false])
  })

  it('sends a stranger to unlock when the book is closed and the password was cleared', () => {
    expect(readerMustUnlock({ ...closed, readerPasswordHash: null }, `td-reader=${cookieValueFor(STORED)}`)).toBe(true)
  })
})

describe('how the cookie is compared', () => {
  // THE HOUSE RULE, AND IT IS STATED WHERE IT IS BROKEN RATHER THAN WHERE IT
  // IS KEPT. `apps/web/lib/media/uploadToken.ts:13` says a signature is
  // "compared with `timingSafeEqual` over equal-length buffers, never with
  // `===`", and this module carries the same kind of value — an HMAC a
  // stranger supplies and controls. The property cannot be observed from
  // outside the function, so it is asserted against the source, which is the
  // treatment `otpService.integration.test.ts` already gives its own
  // comparison.
  it('uses timingSafeEqual rather than ===, as every other HMAC comparison here does', async () => {
    const source = await readFile(new URL('./readerSession.ts', import.meta.url), 'utf8')

    expect(source).toContain('timingSafeEqual(')
    expect(source, 'an HMAC compared with === leaks its prefix through timing').not.toMatch(
      /=== cookieValueFor\(|cookieValueFor\([^)]*\) ===/u,
    )
  })
})
