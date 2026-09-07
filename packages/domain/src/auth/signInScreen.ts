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
 * ═══ ONE REFUSAL FOR EVERY CREDENTIAL ANSWER, AND ONE FOR AFTERWARDS ═══
 *
 * `signIn.ts` answers an unknown address, a wrong password and a locked
 * account with the same value, in the same time (`SECURITY.md` §3, phase
 * ruling F44). `signInEndpoints.ts` answers all of them — and `'rate-limited'`
 * besides — with one identical response, {@link PASSWORD_REFUSED_STATE}. This
 * module is the last layer that could undo that, and it cannot: those four
 * share one word and one message, so a screen that distinguished two of them
 * would first need a second `state` word for a credential refusal, which is
 * where the integration suite's identical-response cases would fail.
 *
 * ═══ THE FIFTH ANSWER IS NOT A CREDENTIAL ANSWER, AND SAYING SO IS A FIX ═══
 *
 * `'code-not-sent'` is reachable ONLY on the far side of a password that was
 * ACCEPTED — `signIn.ts` returns it after `checkPassword` said `'accepted'`,
 * when `issueChallenge` refuses (the thirty-second cooldown, the hourly
 * ceiling, a mailer that declined). It was folded into the credential refusal
 * until Phase 2's final review, so a reader who resubmitted a CORRECT password
 * inside the cooldown was told "Those details did not let you in." — and past
 * `HOURLY_RESEND_CAP` every correct submission for the rest of the hour said
 * it. `signIn.ts`'s own TSDoc on that refusal states why it must not happen:
 * telling a reader whose password was correct that it was not sends them to
 * reset a password that works. Blocker B1.
 *
 * IT DOES NOT WEAKEN THE PROPERTY, and the reason is worth stating precisely
 * rather than asserting. Anti-enumeration is about what an attacker learns
 * WITHOUT the password. This word is unreachable without it: every path that
 * does not reach Payload's own comparison, and every path where that
 * comparison refuses, returns `'invalid-credentials'`. So the four answers
 * that must be indistinguishable still are, and the one that is only ever seen
 * by somebody who has already authenticated says something true to them.
 *
 * WHAT EACH MESSAGE SAYS AND WHAT IT MUST NOT.
 * {@link PASSWORD_REFUSED_MESSAGE} names neither field, neither the address's
 * existence nor a lockout. {@link PASSWORD_CODE_UNSENT_MESSAGE} may say the
 * password was right, because its reader has just proved it, and it must still
 * not name an address. Neither ever echoes anything the reader typed — the
 * value that reaches this module is a fixed word chosen by the endpoint, not
 * text from the request.
 *
 * HANDOFF-DEVIATION: `Travel Diary Login.dc.html` never refuses a sign-in —
 * its `submit()` always succeeds after a 700ms pause — so SCREENS.md §3.1's
 * "an error box when needed" has no copy behind it for a refusal that comes
 * from the server. {@link PASSWORD_REFUSED_MESSAGE} and
 * {@link PASSWORD_CODE_UNSENT_MESSAGE} are therefore ours, written in the
 * register of the two client-side messages the prototype does have ("That does
 * not look like an email address.", "Enter your password to carry on.").
 * Recorded in docs/deviations.md.
 *
 * This module implements none of CLAUDE.md §3.3's named patterns, and says so
 * rather than leaving a reader to wonder - the same declaration its sibling
 * `./resetScreen.ts` makes. It is two words, two messages and a total mapping
 * from a query value onto two view states; a Value object would be the closest
 * fit and would earn nothing, because there is no second kind of `state` this
 * could be confused with.
 *
 * A VALUE NOBODY WROTE DRAWS THE ORDINARY FORM. The query string is typed by
 * anybody, so anything but the two words this module knows is treated as a
 * reader who has just arrived — the same fail-to-the-plain-state rule
 * `resetScreen.ts`'s own reads apply. Neither word is worth forging: one draws
 * a message every wrong password already draws, and the other draws a message
 * that tells its reader to wait.
 *
 * Depends on: nothing.
 */

/**
 * The `state` value `POST /admin/sign-in/password` writes for every refusal
 * that a caller without the password can provoke.
 *
 * All four of them: an unknown address, a wrong password, a locked account and
 * a spent rate-limit window. See this module's header for why the fifth
 * refusal is not one of these.
 */
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

/**
 * The `state` value the endpoint writes when the password was ACCEPTED and the
 * code could not be sent.
 *
 * Its own word rather than {@link PASSWORD_REFUSED_STATE}, because the screen
 * has to say something different: see this module's header for the defect that
 * sharing one word produced, and for why a second word here costs the
 * anti-enumeration property nothing.
 */
export const PASSWORD_CODE_UNSENT_STATE = 'code-unsent'

/**
 * What a reader is told when their password was right and no code went out.
 *
 * It says the password was right, which nothing else on this screen may say —
 * this reader has just proved it, so there is nobody to tell. It names no
 * address, gives no count and no deadline: the reasons are a thirty-second
 * cooldown, an hourly ceiling and a mailer that declined, and a reader can act
 * on all three by waiting. See this module's header for the HANDOFF-DEVIATION
 * this copy is.
 */
export const PASSWORD_CODE_UNSENT_MESSAGE =
  'Your password was right, but the code could not be sent. Try again shortly.'

/** Which state the password step draws. */
export type PasswordStepView =
  /** The ordinary form: no error box. */
  | { readonly kind: 'form' }
  /** The form with the error box above the button, saying one thing. */
  | { readonly kind: 'refused'; readonly message: string }

/**
 * The message each `state` word the endpoint writes draws.
 *
 * A lookup rather than a chain of comparisons, so the pairing of word to
 * message is one table a reader can check against the endpoint, and adding a
 * third word is visibly adding a row rather than editing a condition.
 */
const REFUSAL_MESSAGES: Readonly<Record<string, string>> = {
  [PASSWORD_REFUSED_STATE]: PASSWORD_REFUSED_MESSAGE,
  [PASSWORD_CODE_UNSENT_STATE]: PASSWORD_CODE_UNSENT_MESSAGE,
}

/**
 * Which state the password step is in.
 *
 * @param state - The `state` query value: the word the endpoint redirected
 *   with, or `undefined` when the reader arrived at the form.
 * @returns The refusal for either word the endpoint writes, and the plain form
 *   for everything else — including a `state` somebody typed.
 * @example
 * passwordStepView(undefined) // { kind: 'form' }
 * passwordStepView('refused') // { kind: 'refused', message: 'Those details did not let you in.' }
 * passwordStepView('code-unsent') // { kind: 'refused', message: 'Your password was right, …' }
 */
export const passwordStepView = (state: string | undefined): PasswordStepView => {
  const message = state === undefined ? undefined : REFUSAL_MESSAGES[state]
  return message === undefined ? { kind: 'form' } : { kind: 'refused', message }
}
