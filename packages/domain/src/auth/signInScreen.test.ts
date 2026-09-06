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

  it('offers exactly one refusal state, so nothing can tell two reasons apart', () => {
    // THE FIRST VERSION OF THIS CASE WAS A TAUTOLOGY (fix round 1, finding 6):
    // `expect(view(X)).toEqual(view(X))` under a name about anti-enumeration.
    // What actually holds the property is that the module exposes ONE state
    // word, so this counts them: every value that is not that word draws the
    // plain form, which is what makes a second refusal impossible to add here
    // without also adding a `state` the endpoint would have to write.
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
})
