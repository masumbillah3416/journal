/**
 * resetScreen.test.ts — which state each reset screen is in, decided here so
 * that neither route component has to decide anything.
 *
 * WHY THESE CASES MATTER MORE THAN THEY LOOK. Both functions exist to keep a
 * branch OUT of a Next.js page component: `app/(admin)/admin/reset/page.tsx`
 * and `.../reset/[token]/page.tsx` cannot be run by either Vitest project, and
 * the second sits under a bracketed directory where `@vitest/coverage-v8`'s
 * ignore hints do not hold (CLAUDE.md §2.1). A branch left in either file is a
 * branch nothing can measure; a branch here is gated at 100%.
 * Depends on: vitest, ./resetScreen.
 */
import { describe, expect, it } from 'vitest'
import { newPasswordView, resetRequestView } from './resetScreen'

describe('resetRequestView', () => {
  it('is the pending state when the screen was not told an address', () => {
    expect(resetRequestView(undefined)).toEqual({ kind: 'pending' })
  })

  it('is the sent state, naming an already-masked address exactly as it arrived', () => {
    // The value the reset endpoint redirects with is `maskEmail`'s own output,
    // and masking it a second time must not eat the two characters it keeps.
    // This was two cases until the Task 9 review, and the second asserted a
    // strict subset of this one's `toEqual` - it could not fail while this
    // passed, so it was a line of coverage rather than a behaviour.
    expect(resetRequestView('he•••@wanderings.travel')).toEqual({
      kind: 'sent',
      maskedTo: 'he•••@wanderings.travel',
    })
  })

  it('masks an address that arrived unmasked rather than printing it', () => {
    // Nothing this repository writes produces such a URL, and a hand-typed one
    // must still not put a whole address on the screen (CLAUDE.md §7).
    expect(resetRequestView('hello@wanderings.travel')).toEqual({
      kind: 'sent',
      maskedTo: 'he•••@wanderings.travel',
    })
  })

  it('prints bullets alone for a value that is not an address at all', () => {
    expect(resetRequestView('<b>anything</b>')).toEqual({ kind: 'sent', maskedTo: '•••' })
  })

  it('is the sent state even for an empty value, because the reader was sent here', () => {
    // `?sent=` with nothing after it is still an answer to "was it sent", and
    // the screen says so with bullets rather than falling back to the form.
    expect(resetRequestView('')).toEqual({ kind: 'sent', maskedTo: '•••' })
  })
})

describe('newPasswordView', () => {
  it('is the form for a live link the endpoint has said nothing about', () => {
    expect(newPasswordView('live', undefined)).toBe('form')
  })

  it('is the rejected state when the endpoint refused the password', () => {
    expect(newPasswordView('live', 'rejected')).toBe('rejected')
  })

  it('is the expired state for a link that can no longer be spent', () => {
    expect(newPasswordView('spent', undefined)).toBe('expired')
  })

  it('is still the expired state when the address bar asks for the form', () => {
    // The query value is the reader's; the link's state is a fact. A form
    // drawn for a spent token is a password typed for nothing.
    expect(newPasswordView('spent', 'rejected')).toBe('expired')
  })

  it('is the form for a value it does not recognise, rather than an error nobody caused', () => {
    expect(newPasswordView('live', 'anything-else')).toBe('form')
  })
})
