/**
 * codeScreen.test.ts — what the one-time-code step prints for a given address
 * bar.
 *
 * Pure function under test, no I/O. The cases that matter are the two the
 * module exists for — a guess that was never judged and a resend that sent
 * nothing were both answered with silence — and the one about what does NOT
 * draw a notice, since this value arrives in a query string anybody can type.
 *
 * Depends on: vitest, ./codeScreen.
 */
import { describe, expect, it } from 'vitest'
import {
  CODE_UNJUDGED_MESSAGE,
  CODE_UNJUDGED_STATE,
  CODE_UNSENT_MESSAGE,
  CODE_UNSENT_STATE,
  codeStepNotice,
} from './codeScreen'

describe('codeStepNotice', () => {
  it('says nothing to a reader who has just arrived from the password step', () => {
    expect(codeStepNotice(undefined)).toBeNull()
  })

  it('explains a guess the rate limiter would not judge', () => {
    // Finding 6. This path spends no challenge attempt, so everything the
    // screen derives from the spent count was unchanged and the reader saw the
    // page they had just submitted from — including a reader who typed the
    // CORRECT code.
    expect(codeStepNotice(CODE_UNJUDGED_STATE)).toBe(CODE_UNJUDGED_MESSAGE)
  })

  it('explains a resend that sent nothing', () => {
    // Finding 14. The button disables itself on a cooldown measured from THIS
    // browser's challenge while the server counts the account's whole hour, so
    // past the ceiling it renders enabled and did nothing when pressed.
    expect(codeStepNotice(CODE_UNSENT_STATE)).toBe(CODE_UNSENT_MESSAGE)
  })

  it('says nothing for a state nothing writes', () => {
    // `?state=` is typed by anybody. A screen that treated any value as a
    // notice would let a link put a message on the code step.
    expect(codeStepNotice('anything-else')).toBeNull()
    expect(codeStepNotice('')).toBeNull()
    expect(codeStepNotice('refused')).toBeNull()
  })

  it('keeps the two messages distinct, so neither word can quietly draw the other', () => {
    expect(CODE_UNJUDGED_MESSAGE).not.toBe(CODE_UNSENT_MESSAGE)
  })

  it('names no address, no account, no code and no deadline in either message', () => {
    // What a forged `?state=` can put on the screen is exactly these two
    // strings, so what they say is what a stranger learns.
    for (const said of [CODE_UNJUDGED_MESSAGE.toLowerCase(), CODE_UNSENT_MESSAGE.toLowerCase()]) {
      for (const word of ['@', 'account', 'email', 'address', 'minute', 'hour', 'second']) {
        expect(said, `a code-step notice must not say "${word}"`).not.toContain(word)
      }
      expect(/\d/u.test(said), 'a code-step notice must carry no number').toBe(false)
    }
  })
})
