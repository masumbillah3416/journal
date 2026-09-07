/**
 * signInScreen.test.ts — which state the password step draws for a given
 * address bar.
 *
 * Pure function under test, no I/O. The cases that matter are the ones about
 * what does NOT draw a refusal: this value arrives in a query string anybody
 * can type, so a `state` the endpoint never writes must draw the ordinary
 * form rather than an error box a reader cannot explain.
 *
 * Depends on: vitest, ./signInScreen.
 */
import { describe, expect, it } from 'vitest'
import {
  PASSWORD_CODE_UNSENT_MESSAGE,
  PASSWORD_CODE_UNSENT_STATE,
  PASSWORD_REFUSED_MESSAGE,
  PASSWORD_REFUSED_STATE,
  passwordStepView,
} from './signInScreen'

describe('passwordStepView', () => {
  it('draws the plain form for a reader who has just arrived', () => {
    expect(passwordStepView(undefined)).toEqual({ kind: 'form' })
  })

  it('draws the refusal for the one state the endpoint writes', () => {
    expect(passwordStepView(PASSWORD_REFUSED_STATE)).toEqual({
      kind: 'refused',
      message: PASSWORD_REFUSED_MESSAGE,
    })
  })

  it('draws the plain form for a state nothing writes', () => {
    // `?state=` is typed by anybody. A view that treated any value as a
    // refusal would let a link put an error box on the sign-in screen.
    expect(passwordStepView('anything-else')).toEqual({ kind: 'form' })
    expect(passwordStepView('')).toEqual({ kind: 'form' })
  })

  it('draws its own message when the password was right and the code was not sent', () => {
    // BLOCKER B1. This state used to be folded into the credential refusal, so
    // resubmitting a CORRECT password inside the thirty-second resend cooldown
    // was answered "Those details did not let you in." — and past the hourly
    // ceiling, every correct submission for the rest of the hour was.
    expect(passwordStepView(PASSWORD_CODE_UNSENT_STATE)).toEqual({
      kind: 'refused',
      message: PASSWORD_CODE_UNSENT_MESSAGE,
    })
  })

  it('keeps the two messages distinct, so neither word can quietly draw the other', () => {
    // The two states share a view KIND, which is what the screen needs — one
    // error box — and is also how a later edit could point both rows of the
    // lookup at one message and undo B1's fix with nothing failing.
    expect(PASSWORD_CODE_UNSENT_MESSAGE).not.toBe(PASSWORD_REFUSED_MESSAGE)
    expect(passwordStepView(PASSWORD_REFUSED_STATE)).not.toEqual(passwordStepView(PASSWORD_CODE_UNSENT_STATE))
  })

  it('offers exactly one refusal state a caller without the password can reach', () => {
    // THE FIRST VERSION OF THIS CASE WAS A TAUTOLOGY (fix round 1, finding 6):
    // `expect(view(X)).toEqual(view(X))` under a name about anti-enumeration.
    // What actually holds the property is that the module exposes ONE state
    // word for every answer a wrong password, an unknown address, a locked
    // account and a spent window can produce, so this counts them. The
    // code-unsent word is excluded from the count deliberately and not by
    // oversight: `signIn.ts` only reaches it once the password has been
    // ACCEPTED, so an attacker cannot provoke it — the case in
    // `signInEndpoints.integration.test.ts` that drives all four credential
    // refusals through the real endpoint is what holds that.
    const refusalStates = ['refused', 'rejected', 'too-many', 'locked', 'code-not-sent', 'unknown'].filter(
      (state) => passwordStepView(state).kind === 'refused',
    )

    expect(refusalStates).toEqual([PASSWORD_REFUSED_STATE])
  })

  it('names neither which field was wrong nor whether the address exists', () => {
    // The message a reader is shown is the whole of what an attacker learns
    // from the screen, so it says none of these. Case-insensitive throughout -
    // the first version mixed a case-sensitive scan in with these, which was
    // strictly weaker for no reason (fix round 1, finding 7).
    const said = PASSWORD_REFUSED_MESSAGE.toLowerCase()

    for (const word of ['password', 'account', 'email', 'address', 'exist', 'locked', 'attempt']) {
      expect(said, `the refusal message must not say "${word}"`).not.toContain(word)
    }
  })

  it('never names an address in the message a reader with the right password sees either', () => {
    // This one MAY say "password" — its reader has just supplied a correct
    // one, so there is nobody left to tell. What it still must not do is name
    // the address the code was going to, which is the value `maskEmail` exists
    // to keep off this screen.
    const said = PASSWORD_CODE_UNSENT_MESSAGE.toLowerCase()

    for (const word of ['account', 'email', 'address', '@']) {
      expect(said, `the code-unsent message must not say "${word}"`).not.toContain(word)
    }
    expect(said).toContain('password')
  })
})
