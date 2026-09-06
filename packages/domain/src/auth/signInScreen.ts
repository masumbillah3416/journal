/**
 * signInScreen — which state SCREENS.md §3.1's password step draws, read from
 * the one thing the endpoint above it can put in an address.
 *
 * The sibling of `./resetScreen.ts` and built the same way, for the same
 * reason: `POST /admin/sign-in/password` answers with a `303` rather than a
 * rendered body — a `POST` that renders leaves a resubmittable form in the
 * browser's history — so whatever the reader needs to be told has to survive a
 * redirect, and the only place it can survive is the query string. This module
 * is the one place that value is interpreted.
 *
 * ═══ ONE REFUSAL, WITH ONE MESSAGE, AND THAT IS THE POINT ═══
 *
 * `signIn.ts` answers an unknown address, a wrong password and a locked
 * account with the same value, in the same time (`SECURITY.md` §3, phase
 * ruling F44). `signInEndpoints.ts` answers all of them — and its two other
 * refusals besides — with one identical response. This module is the last
 * layer that could undo that, and it cannot: there is one refusal state and
 * one message, so a screen that distinguished two reasons would first need a
 * second `state` word, which is where the integration suite's
 * identical-response cases would fail.
 *
 * WHAT THE MESSAGE SAYS AND WHAT IT MUST NOT. It names neither field, neither
 * the address's existence nor a lockout, and it never echoes anything the
 * reader typed — the value that reaches this module is a fixed word chosen by
 * the endpoint, not text from the request.
 *
 * HANDOFF-DEVIATION: `Travel Diary Login.dc.html` never refuses a sign-in —
 * its `submit()` always succeeds after a 700ms pause — so SCREENS.md §3.1's
 * "an error box when needed" has no copy behind it for a refusal that comes
 * from the server. {@link PASSWORD_REFUSED_MESSAGE} is therefore ours, written
 * in the register of the two client-side messages the prototype does have
 * ("That does not look like an email address.", "Enter your password to carry
 * on."). Recorded in docs/deviations.md.
 *
 * A VALUE NOBODY WROTE DRAWS THE ORDINARY FORM. The query string is typed by
 * anybody, so anything but the one word this module knows is treated as a
 * reader who has just arrived — the same fail-to-the-plain-state rule
 * `resetScreen.ts`'s own reads apply.
 *
 * Depends on: nothing.
 */

/** The `state` value `POST /admin/sign-in/password` writes for every refusal. */
export const PASSWORD_REFUSED_STATE = 'refused'

/**
 * What a reader is told when a sign-in was refused.
 *
 * "Those details" rather than "your password" or "that address": naming either
 * would say which of them was wrong, and saying an address is unknown is the
 * enumeration the whole password step is built to avoid. See this module's
 * header for the HANDOFF-DEVIATION this copy is.
 */
export const PASSWORD_REFUSED_MESSAGE = 'Those details did not let you in.'

/** Which state the password step draws. */
export type PasswordStepView =
  /** The ordinary form: no error box. */
  | { readonly kind: 'form' }
  /** The form with the error box above the button, saying one thing. */
  | { readonly kind: 'refused'; readonly message: string }

/**
 * Which state the password step is in.
 *
 * @param state - The `state` query value: the word the endpoint redirected
 *   with, or `undefined` when the reader arrived at the form.
 * @returns The refusal for the one word the endpoint writes, and the plain
 *   form for everything else — including a `state` somebody typed.
 * @example
 * passwordStepView(undefined) // { kind: 'form' }
 * passwordStepView('refused') // { kind: 'refused', message: … }
 */
export const passwordStepView = (state: string | undefined): PasswordStepView =>
  state === PASSWORD_REFUSED_STATE ? { kind: 'refused', message: PASSWORD_REFUSED_MESSAGE } : { kind: 'form' }
