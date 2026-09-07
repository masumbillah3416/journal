/**
 * otpChallenge — the lifecycle of a one-time sign-in code: when a challenge
 * is still usable, and when a resend may be sent.
 *
 * Repository pattern seam (CLAUDE.md §3.3): {@link ChallengeRecord} is
 * deliberately narrower than the row a later task persists. The stored row
 * also carries the code's hash, the user id and the session id; this type
 * names only the three fields this module's pure logic needs to decide a
 * state. A function that received the hash alongside the fields it actually
 * reads would invite a test (or a log line) that prints a secret it never
 * needed. Structural typing means the fuller persisted row satisfies this
 * type without conversion — the domain never learns what a stored row looks
 * like, and nothing is lost by narrowing what crosses the seam.
 *
 * STATE PRECEDENCE — an invariant, not an incidental order. {@link
 * challengeState} checks in this order, and any two or all three of these
 * conditions may hold at the same instant: `'consumed'`, then `'exhausted'`,
 * then `'expired'`, then falls through to `'valid'`. The order runs from
 * most to least specific: consumed means the code worked and was actually
 * spent; exhausted means it was deliberately invalidated by three wrong
 * guesses; expired means it merely aged out with no such event. A consumed
 * code replayed after its window has also closed is still, and more usefully,
 * "already used" rather than "expired"; an exhausted challenge that has also
 * aged out is still "deliberately invalidated" rather than "merely old". This
 * is pinned by four tests in `otpChallenge.test.ts` that each construct a
 * fixture where more than one condition holds — consumed+exhausted,
 * consumed+expired, exhausted+expired, and all three — asserting the one
 * outcome this ordering demands each time. Swapping any two adjacent checks
 * makes at least one of those four fail (verified: swapping the consumed and
 * exhausted checks breaks the consumed+exhausted and all-three cases).
 * 100% branch coverage alone does not guard this — every branch running once
 * each says nothing about which one wins when several are true together,
 * which is exactly why these four fixtures exist.
 *
 * WHY `attempts >= MAX_ATTEMPTS`, NOT `>`. `attempts` counts wrong guesses
 * already spent. Three is the whole budget (SECURITY.md §3: "Max 3 attempts
 * per challenge, then invalidate it"), so once a third wrong guess has been
 * spent — `attempts === MAX_ATTEMPTS` — no fourth guess may be offered, and
 * the state must already read `'exhausted'` at that count, not one guess
 * later. Comparing with `>` instead would let `attempts === MAX_ATTEMPTS`
 * still read `'valid'`, silently turning a three-attempt limit into a
 * four-attempt one — exactly the off-by-one the exhaustion test in
 * `otpChallenge.test.ts` exists to catch. That test alone only pins one side
 * of the threshold, though: `otpChallenge.test.ts` also pins
 * `attempts === MAX_ATTEMPTS - 1` as `'valid'`, so a threshold shifted one
 * guess too early — refusing the last attempt a reader is actually still
 * owed — fails too, not only a threshold shifted one guess too late.
 *
 * A FUTURE `createdAt` READS AS `'valid'`, DELIBERATELY, NOT FAILED CLOSED.
 * `now < createdAt` clamps the elapsed time at zero rather than going
 * negative or throwing. This is an availability choice, not an oversight:
 * ordinary clock skew of a few milliseconds between application servers can
 * put `now` slightly behind `createdAt` for a perfectly legitimate challenge,
 * and rejecting that reader's real code as `'expired'` over skew is a real
 * cost with no attacker on the other end of it. The one way a *malicious*
 * future `createdAt` could matter — stretching a challenge's life by writing
 * a large value — already requires write access to the `otpChallenges` table,
 * and an attacker who already has that access would simply overwrite
 * `codeHash` with their own value instead of bothering to move a clock
 * forward; clamping this case does not close any door that matters.
 *
 * A NON-FINITE `createdAt` OR `now`, THOUGH, FAILS CLOSED TO `'expired'`.
 * `NaN` or `Infinity` here means a bad date parse upstream, not a clock
 * running a little fast or slow — there is no legitimate reader on the other
 * end of a broken timestamp, only a bug. Falling through to `'valid'` (which
 * `now - createdAt` compared against `EXPIRY_MS` would otherwise do, since
 * every comparison against `NaN` is false) would let that bug hand out a
 * sign-in that never should have been valid at all.
 *
 * Depends on: Result, ok and err, from ../result.
 */
import { type Result, err, ok } from '../result'

/** How long a challenge remains usable after it is issued (five minutes, SECURITY.md §3). */
export const EXPIRY_MS = 5 * 60_000

/** How many wrong guesses a challenge tolerates before it is exhausted (SECURITY.md §3). */
export const MAX_ATTEMPTS = 3

/** The minimum gap between one resend and the next (thirty seconds, SECURITY.md §3). */
export const RESEND_COOLDOWN_MS = 30_000

/**
 * The most resends one address may receive in a rolling hour.
 *
 * SECURITY.md §3 names only "an hourly ceiling" and leaves the number
 * unstated. Five is the number this module uses. The thirty-second cooldown
 * alone still lets an attacker aim 120 mails an hour at one victim's inbox —
 * the mailbomb this ceiling exists to stop — while five is generous enough
 * to cover the honest cases a real reader hits: mail arriving slowly, one
 * mistyped address corrected on a retry, one code that landed in a spam
 * folder.
 */
export const HOURLY_RESEND_CAP = 5

/**
 * The persisted facts a challenge's lifecycle is decided from — nothing
 * more. See the module header for why this is narrower than the row a later
 * task actually stores.
 */
export interface ChallengeRecord {
  /** Epoch milliseconds when the challenge was issued. */
  readonly createdAt: number
  /** How many wrong guesses have been spent against this challenge. */
  readonly attempts: number
  /** Epoch milliseconds when the challenge was used, or `null` if it has not been. */
  readonly consumedAt: number | null
}

/** The lifecycle states a challenge can be in at a given instant. */
export type ChallengeState = 'valid' | 'expired' | 'consumed' | 'exhausted'

/** Why {@link canResend} refused to allow another resend. */
export type ResendRefusal = 'cooldown' | 'hourly-cap'

/**
 * Decides which lifecycle state a challenge is in at a given instant.
 *
 * @param challenge - The challenge's persisted facts (or any fuller row that
 *   structurally contains them — see the module header).
 * @param now - The current instant, in epoch milliseconds. Always the
 *   caller's injected clock (CLAUDE.md §2.3), never read from inside this
 *   function.
 * @returns `'consumed'` if the challenge has been used, else `'exhausted'`
 *   if its attempt budget is spent, else `'expired'` once
 *   {@link EXPIRY_MS} has elapsed since `createdAt` — or immediately, if
 *   `createdAt` or `now` is not a finite number — else `'valid'`. A future
 *   `createdAt` (ordinary clock skew) clamps elapsed time at zero rather
 *   than reading as expired; see the module header for why that is safe.
 * @example
 * challengeState(aChallenge({ createdAt: 0, attempts: 0 }), 4 * 60_000) // 'valid'
 * challengeState(aChallenge({ createdAt: 0 }), EXPIRY_MS) // 'expired' — the boundary itself has already expired
 */
export const challengeState = (challenge: ChallengeRecord, now: number): ChallengeState => {
  if (challenge.consumedAt !== null) return 'consumed'
  if (challenge.attempts >= MAX_ATTEMPTS) return 'exhausted'
  if (!Number.isFinite(challenge.createdAt) || !Number.isFinite(now)) return 'expired'

  const elapsedMs = Math.max(0, now - challenge.createdAt)
  if (elapsedMs >= EXPIRY_MS) return 'expired'
  return 'valid'
}

/**
 * Decides whether another sign-in code may be sent to the same address.
 *
 * @param lastSentAt - Epoch milliseconds when the most recent code was sent.
 * @param now - The current instant, in epoch milliseconds. Always the
 *   caller's injected clock, never read from inside this function.
 * @param sentThisHour - How many codes have already been sent to this
 *   address in the current rolling hour, before this one. Expected to be a
 *   non-negative integer — anything else is treated as the cap already
 *   having been reached; see the why-comment on the guard below.
 * @returns `ok(undefined)` when a resend may proceed; otherwise `err` with
 *   `'cooldown'` when {@link RESEND_COOLDOWN_MS} has not yet elapsed since
 *   `lastSentAt`, or `'hourly-cap'` when `sentThisHour` has already reached
 *   {@link HOURLY_RESEND_CAP} — checked only once the cooldown has cleared,
 *   since the cap is the stricter of the two limits when both would refuse —
 *   or when `sentThisHour`, `lastSentAt` or `now` is not a sane value (see
 *   below).
 * @example
 * canResend(0, 29_000, 1) // { ok: false, error: 'cooldown' }
 * canResend(0, RESEND_COOLDOWN_MS, 1) // { ok: true, value: undefined }
 */
export const canResend = (lastSentAt: number, now: number, sentThisHour: number): Result<void, ResendRefusal> => {
  // FAIL CLOSED ON A NONSENSICAL COUNT OR CLOCK. This is the hourly mailbomb
  // ceiling — the one limit standing between a counting bug and an attacker
  // getting unlimited resends aimed at one inbox. A `sentThisHour` that is
  // negative, fractional, or NaN, or a `lastSentAt`/`now` that is not finite,
  // means the caller's bookkeeping is broken, not that resends should be
  // unlimited: every comparison against NaN is false, so `sentThisHour >=
  // HOURLY_RESEND_CAP` would silently read as "under the cap" for a NaN or
  // negative count, and the ceiling would be disabled by arithmetic rather
  // than by any code that says so. Reporting `'hourly-cap'` for all of these
  // — the stricter of the two refusals — keeps a limiter that fails open
  // from being a limiter in name only.
  //
  // THE GUARD'S OWN `>= 0` BOUNDARY IS PINNED SEPARATELY FROM THE BRANCH.
  // Every fixture that exercises this guard (1, 1.5, -1, NaN, Infinity)
  // happens to run both sides of `>= 0` without ever supplying the value
  // that actually matters: `sentThisHour === 0`, the first resend of an
  // hour and the single most common call this function will ever receive.
  // `otpChallenge.test.ts` pins that value directly, so mutating `>= 0` to
  // `> 0` — which leaves every other fixture green — is still caught.
  const sentThisHourIsSane = Number.isInteger(sentThisHour) && sentThisHour >= 0
  if (!sentThisHourIsSane || !Number.isFinite(lastSentAt) || !Number.isFinite(now)) return err('hourly-cap')

  if (now - lastSentAt < RESEND_COOLDOWN_MS) return err('cooldown')
  // As with `attempts` above, `otpChallenge.test.ts` pins both sides of this
  // threshold: `sentThisHour === HOURLY_RESEND_CAP` refused, and
  // `sentThisHour === HOURLY_RESEND_CAP - 1` — the last resend a reader is
  // actually still owed — allowed.
  if (sentThisHour >= HOURLY_RESEND_CAP) return err('hourly-cap')
  return ok(undefined)
}
