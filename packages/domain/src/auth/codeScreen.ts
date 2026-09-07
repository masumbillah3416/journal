/**
 * codeScreen — what SCREENS.md §3.2's one-time-code step is told about the
 * submission it has just been redirected back from.
 *
 * The sibling of `./signInScreen.ts`, built the same way and for the same
 * reason: both `POST`s the pane makes answer with a `303`, so whatever the
 * reader needs to be told has to survive a redirect, and the query string is
 * the only place it can survive. This module is the one place that value is
 * interpreted.
 *
 * ═══ WHY IT EXISTS: THE SCREEN COULD ONLY SAY ONE THING ═══
 *
 * Everything the code screen told a reader was derived from `attemptsSpent`,
 * the count of guesses the server had spent. That is exactly right for a wrong
 * code and says nothing at all about the two answers that spend no guess:
 *
 *   - **A guess the rate limiter refused.** `POST /admin/sign-in/code/verify`
 *     answered `303` back to this screen without touching the challenge, so
 *     the counter had not moved and no message appeared. A reader who typed
 *     the CORRECT code was returned a page identical to the one they had just
 *     submitted from — the pressed button did nothing, visibly.
 *   - **A resend that sent nothing.** Inside the thirty-second cooldown, past
 *     `HOURLY_RESEND_CAP`, or with a mailer that declined, "Send a new code"
 *     was answered with the same silent `303`. The cooldown the button
 *     disables itself by is measured from the challenge bound to THIS browser,
 *     while the server's ceiling counts every challenge the ACCOUNT has had in
 *     the hour, so the button is enabled and inert whenever those disagree.
 *
 * Phase 2's final review calls these findings 6 and 14 and groups them with
 * blocker B1 as one class: every refusal that is not "wrong password" or
 * "wrong code" was rendered either as a lie or as silence. This module is the
 * "or as silence" half.
 *
 * ═══ WHY SAYING THESE THINGS LEAKS NOTHING ═══
 *
 * `verifyChallenge` deliberately answers one word for a wrong code and for a
 * browser holding no challenge at all, so that nothing says which browsers
 * hold a live challenge. These two notices do not weaken that, because the
 * screen already answers it: `readCodeScreen` prints the masked address and
 * the spent count for a browser holding a live challenge, and three bullets
 * with a zero for one that is not — a difference the SIGNIN-001..004 fix
 * introduced deliberately, on the ground that only the browser the challenge
 * was bound to can reach that answer at all. Neither notice names an address,
 * an account, a code, a count or a deadline. Both say the same thing to a
 * stranger who forges the query value as to the reader they were written for,
 * which is the property that makes a query-string message safe.
 *
 * PATTERNS (CLAUDE.md §3.3). None of the seven, and its sibling says the same:
 * two words, two messages, and a total mapping from a query value onto a
 * message or nothing.
 *
 * HANDOFF-DEVIATION: `SCREENS.md` §3.2 gives the pane an error box and one
 * message for it — the wrong-code copy — and gives the resend a cooldown label
 * and no refusal copy at all. Both messages below are therefore ours, written
 * in the register of the prototype's own ("That code is not right. 2 attempts
 * left."). Recorded in docs/deviations.md.
 *
 * A VALUE NOBODY WROTE SAYS NOTHING. Anything but the two words this module
 * knows draws no notice — the same fail-to-the-plain-state rule
 * `./signInScreen.ts` and `./resetScreen.ts` apply.
 *
 * Depends on: nothing.
 */

/**
 * The `state` value `POST /admin/sign-in/code/verify` writes when the guess
 * was not judged at all.
 *
 * Its own word rather than silence: the alternative was a screen that answered
 * a pressed button with a page identical to the one it was pressed on.
 */
export const CODE_UNJUDGED_STATE = 'wait'

/**
 * What a reader is told when their guess was not judged.
 *
 * No count and no deadline, for the reason `signIn.ts` gives about lockout
 * copy: the window's length is a defensive parameter and a message naming it
 * tells whoever is spending it exactly when to resume. "A moment" is the
 * truthful instruction — the window is fifteen minutes and it slides, so
 * waiting is the only thing that helps.
 */
export const CODE_UNJUDGED_MESSAGE = 'Too many tries just now. Wait a moment, then enter the code again.'

/**
 * The `state` value `POST /admin/sign-in/code/resend` writes when no new code
 * went out.
 *
 * ONE WORD FOR EVERY REASON, deliberately: the cooldown, the hourly ceiling, a
 * mailer that declined, and a browser holding no challenge to resend all write
 * this. A reader can act on all four the same way, and a word per reason would
 * be four things to say where the truth is one.
 */
export const CODE_UNSENT_STATE = 'unsent'

/** What a reader is told when "Send a new code" sent none. */
export const CODE_UNSENT_MESSAGE = 'No new code was sent. Wait a moment, then ask again.'

/**
 * The message each `state` word the two endpoints write draws.
 *
 * A lookup rather than a chain of comparisons, so the pairing of word to
 * message is one table a reader can check against the endpoints, and adding a
 * third word is visibly adding a row rather than editing a condition.
 */
const CODE_NOTICES: Readonly<Record<string, string>> = {
  [CODE_UNJUDGED_STATE]: CODE_UNJUDGED_MESSAGE,
  [CODE_UNSENT_STATE]: CODE_UNSENT_MESSAGE,
}

/**
 * What the code step should print above its button, beyond what the spent
 * count already says.
 *
 * @param state - The `state` query value: the word an endpoint redirected
 *   with, or `undefined` when the reader arrived from the password step.
 * @returns The message for either word the endpoints write, and `null` for
 *   everything else — including a `state` somebody typed.
 * @example
 * codeStepNotice(undefined) // null
 * codeStepNotice('wait') // 'Too many tries just now. …'
 * codeStepNotice('unsent') // 'No new code was sent. …'
 */
export const codeStepNotice = (state: string | undefined): string | null => {
  const notice = state === undefined ? undefined : CODE_NOTICES[state]
  return notice ?? null
}
