/**
 * readCodeScreen — what `/admin/sign-in/code` is told about the challenge the
 * browser in front of it is actually holding.
 *
 * ═══ WHAT THIS CLOSES ═══
 *
 * `SCREENS.md` §3.2 names three things the screen prints that only a stored
 * challenge can answer: the masked address a code went to, when it was issued
 * (the `{m:ss}` countdown's origin), and how many guesses have been spent. For
 * three tasks the route passed a fixed bullet run, `Date.now()` at render, and
 * a hard-coded zero — a complete second-factor screen drawn against nothing
 * (`docs/deviations.md` §33). This is the read that ends that.
 *
 * IT DRAWS THE PLACEHOLDER RATHER THAN REFUSING, when the browser holds no
 * challenge at all. That is deliberate and it is not a gap: a reader who types
 * the address gets `SCREENS.md` §3.2 with `maskEmail('')`'s three bullets —
 * which echoes nothing and names nobody. Refusing instead would make the
 * screen's own response an oracle for whether a given browser holds a
 * challenge, which is what `verifyChallenge`'s single `'invalid'` refusal
 * spends three database statements to withhold.
 *
 * A BROWSER WHOSE CHALLENGE IS SPENT OR EXPIRED IS NOT THAT READER, and it
 * used to be treated as one. `pendingChallenge` answered `null` for anything
 * that was not `'valid'`, so a reader who had just typed three wrong codes was
 * shown the screen a stranger gets: the address they were told to check
 * replaced by bullets, the counter back at zero, and — because the placeholder
 * substitutes `renderedAt` for a missing issue instant — a five-minute expiry
 * and a thirty-second resend cooldown that both restarted on every reload.
 * Four faces of one decision (docs/qa/2026-09-07-sign-in-sweep.md,
 * SIGNIN-001..004). It leaks nothing to describe them: only the browser
 * holding the identifier the challenge was bound to can reach this answer, and
 * it is the browser that was sent the code.
 *
 * IT READS THE COOKIE, WHICH IS WHY THE ROUTE IS DYNAMIC. `/admin/sign-in/code`
 * rendered `○ (Static)` until fix round 1, so `Date.now()` was evaluated at
 * BUILD time and the countdown read 0:00 for every reader five minutes after a
 * deploy — invisible in development, where every request re-renders. The route
 * now declares `dynamic = 'force-dynamic'`, and `cookies()` would force it in
 * any case; `codeScreenRoute.test.ts` fails if that declaration goes.
 *
 * PATTERNS (CLAUDE.md §3.3). Repository at one remove: the screen never learns
 * what an `otpChallenges` row looks like, and the masking happens inside
 * `otpService` rather than here — this module maps one `PendingChallenge` onto
 * the three props the pane takes, and supplies the three the pane needs when
 * there is none.
 *
 * INVARIANT — NOTHING HERE SEES A CODE, AN ACCOUNT OR A WHOLE ADDRESS.
 * `pendingChallenge` returns none of them (CLAUDE.md §7).
 *
 * IT TAKES THE `Cookie` HEADER RATHER THAN READING IT. `next/headers`' `cookies()`
 * throws outside a request context, so a module that called it could be run by
 * no test at all — and this module's whole job is the thing worth testing. The
 * route reads the header and passes it, exactly as `guard.ts`'s
 * `authenticateAdminRequest` is handed one.
 *
 * Depends on: `maskEmail` (@travel-diary/domain/auth/mask), ./browserSession,
 * ./services.
 */
import { maskEmail } from '@travel-diary/domain/auth/mask'
import { readBrowserSession } from './browserSession'
import { signInServices } from './services'

/** What the one-time-code pane needs printing. */
export interface CodeScreenContent {
  /** Where the code went, masked — or three bullets when there is no challenge. */
  readonly maskedAddress: string
  /** The countdown's origin, in epoch milliseconds. */
  readonly issuedAt: number
  /** How many guesses have been spent against the live challenge. */
  readonly attemptsSpent: number
}

/**
 * The address the screen prints when this browser holds no live challenge.
 *
 * `maskEmail('')` — three bullets and nothing else, which is that function's
 * own fallback for input it cannot mask. It echoes no part of any address,
 * which is what makes drawing it safer than refusing.
 */
export const NO_PENDING_ADDRESS = maskEmail('')

/**
 * What the code screen should print for the request being rendered.
 *
 * @param cookieHeader - The request's `Cookie` header, or `null` when it sent
 *   none.
 * @param renderedAt - The current instant, in epoch milliseconds. Injected
 *   (CLAUDE.md §2.3) so the placeholder's countdown is the caller's clock
 *   rather than one read inside here — and so a test can pin it.
 * @returns The three values the pane takes: the live challenge's when there is
 *   one, and a placeholder that names nobody when there is not.
 * @example
 * const content = await readCodeScreen((await cookies()).toString(), Date.now())
 */
export const readCodeScreen = async (cookieHeader: string | null, renderedAt: number): Promise<CodeScreenContent> => {
  const carried = readBrowserSession(cookieHeader)
  if (carried === null) return { maskedAddress: NO_PENDING_ADDRESS, issuedAt: renderedAt, attemptsSpent: 0 }

  const { otp } = await signInServices()
  const pending = await otp.pendingChallenge(carried)
  if (pending === null) return { maskedAddress: NO_PENDING_ADDRESS, issuedAt: renderedAt, attemptsSpent: 0 }

  // NO CLAMP ON `attemptsSpent`, and its absence is still deliberate — for a
  // different reason than when this note was first written. One was written
  // here, guarding against a count above the ceiling making the pane print a
  // negative number of guesses left, and it was unreachable because an
  // exhausted challenge answered `null`. That `null` was itself the defect
  // (SIGNIN-001), and `pendingChallenge` now reports the exhausted challenge —
  // so `attemptsSpent` reaches `MAX_ATTEMPTS` here, which is exactly the value
  // `CodeStep`'s "Three wrong codes" message is keyed on. A clamp would still
  // be wrong: the service never returns more than the ceiling, because the
  // count is claimed by a conditional UPDATE that refuses above it.
  return {
    maskedAddress: pending.maskedTo,
    issuedAt: pending.issuedAt,
    attemptsSpent: pending.attemptsSpent,
  }
}
