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
import { PASSWORD_REFUSED_MESSAGE, PASSWORD_REFUSED_STATE, passwordStepView } from './signInScreen'

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

  it('says one thing for every reason a sign-in can be refused', () => {
    // The anti-enumeration property, at the last layer that could break it: an
    // unknown address, a wrong password and a locked account are one refusal in
    // `signIn.ts`, one response in `signInEndpoints.ts`, and there is exactly
    // one message here for them to arrive at. A second refusal state added to
    // this module would need a second `state` value in the endpoint, which is
    // where the assertion about identical responses would then fail.
    expect(passwordStepView(PASSWORD_REFUSED_STATE)).toEqual(passwordStepView(PASSWORD_REFUSED_STATE))
    expect(PASSWORD_REFUSED_MESSAGE).not.toContain('password')
    expect(PASSWORD_REFUSED_MESSAGE).not.toContain('account')
  })

  it('names neither which field was wrong nor whether the address exists', () => {
    // The message a reader is shown is the whole of what an attacker learns
    // from the screen, so it says neither.
    expect(PASSWORD_REFUSED_MESSAGE.toLowerCase()).not.toContain('email')
    expect(PASSWORD_REFUSED_MESSAGE.toLowerCase()).not.toContain('exist')
    expect(PASSWORD_REFUSED_MESSAGE.toLowerCase()).not.toContain('locked')
  })
})
