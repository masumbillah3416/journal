import { describe, expect, it } from 'vitest'

import { cookieValueFor, hashReaderPassword } from './readerPassword'
import { attemptUnlock } from './unlockAttempt'

describe('one submission of the reader password', () => {
  it('admits the right password, and says what the cookie must carry', async () => {
    const stored = await hashReaderPassword('tokyo 2019')

    expect(await attemptUnlock('tokyo 2019', stored)).toEqual({
      kind: 'admitted',
      cookieValue: cookieValueFor(stored),
    })
  })

  it('refuses a different password, which is what stops the first case being vacuous', async () => {
    const stored = await hashReaderPassword('tokyo 2019')

    expect(await attemptUnlock('tokyo 2018', stored)).toEqual({ kind: 'wrong' })
  })

  // NOT 'wrong'. A reader who pressed the button without typing is told to
  // type, not told they got it wrong - and no `scrypt` is spent finding out.
  it('calls an empty submission empty rather than wrong', async () => {
    const stored = await hashReaderPassword('tokyo 2019')

    expect(await attemptUnlock('   ', stored)).toEqual({ kind: 'empty' })
  })

  it('refuses everyone when no password is stored, without reaching the comparison', async () => {
    expect(await attemptUnlock('tokyo 2019', null)).toEqual({ kind: 'wrong' })
  })

  it('refuses everyone when the column is an empty string, which Payload writes for a cleared field', async () => {
    expect(await attemptUnlock('tokyo 2019', '')).toEqual({ kind: 'wrong' })
  })

  // THE EVICTION PROPERTY, ASKED AT THIS LAYER TOO. The cookie a reader is
  // handed is derived from the stored hash, so the SAME password saved again
  // hands out a different one - which is what retires the cookies already in
  // the wild. A constant salt would make these two equal and evict nobody.
  it('hands out a different cookie after the same password is saved again', async () => {
    const before = await attemptUnlock('tokyo 2019', await hashReaderPassword('tokyo 2019'))
    const after = await attemptUnlock('tokyo 2019', await hashReaderPassword('tokyo 2019'))

    expect(before).not.toEqual(after)
  })
})
