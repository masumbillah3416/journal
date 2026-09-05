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
 * STATE PRECEDENCE. {@link challengeState} checks consumption first, then
 * exhaustion, then expiry, then falls through to `'valid'`. Consumption and
 * exhaustion are checked ahead of expiry deliberately: both can become true
 * before the five-minute window closes, and once true they are the more
 * specific fact about why the code cannot be used again — a consumed code
 * replayed after its window has also closed is still, and more usefully,
 * "already used" rather than "expired" (see the "consumed before expired"
 * test in `otpChallenge.test.ts`).
 *
 * WHY `attempts >= MAX_ATTEMPTS`, NOT `>`. `attempts` counts wrong guesses
 * already spent. Three is the whole budget (SECURITY.md §3: "Max 3 attempts
 * per challenge, then invalidate it"), so once a third wrong guess has been
 * spent — `attempts === MAX_ATTEMPTS` — no fourth guess may be offered, and
 * the state must already read `'exhausted'` at that count, not one guess
 * later. Comparing with `>` instead would let `attempts === MAX_ATTEMPTS`
 * still read `'valid'`, silently turning a three-attempt limit into a
 * four-attempt one — exactly the off-by-one the exhaustion test in
 * `otpChallenge.test.ts` exists to catch.
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
 *   {@link EXPIRY_MS} has elapsed since `createdAt`, else `'valid'`.
 * @example
 * challengeState(aChallenge({ createdAt: 0, attempts: 0 }), 4 * 60_000) // 'valid'
 * challengeState(aChallenge({ createdAt: 0 }), EXPIRY_MS) // 'expired' — the boundary itself has already expired
 */
export const challengeState = (challenge: ChallengeRecord, now: number): ChallengeState => {
  if (challenge.consumedAt !== null) return 'consumed'
  if (challenge.attempts >= MAX_ATTEMPTS) return 'exhausted'
  if (now - challenge.createdAt >= EXPIRY_MS) return 'expired'
  return 'valid'
}

/**
 * Decides whether another sign-in code may be sent to the same address.
 *
 * @param lastSentAt - Epoch milliseconds when the most recent code was sent.
 * @param now - The current instant, in epoch milliseconds. Always the
 *   caller's injected clock, never read from inside this function.
 * @param sentThisHour - How many codes have already been sent to this
 *   address in the current rolling hour, before this one.
 * @returns `ok(undefined)` when a resend may proceed; otherwise `err` with
 *   `'cooldown'` when {@link RESEND_COOLDOWN_MS} has not yet elapsed since
 *   `lastSentAt`, or `'hourly-cap'` when `sentThisHour` has already reached
 *   {@link HOURLY_RESEND_CAP} — checked only once the cooldown has cleared,
 *   since the cap is the stricter of the two limits when both would refuse.
 * @example
 * canResend(0, 29_000, 1) // { ok: false, error: 'cooldown' }
 * canResend(0, RESEND_COOLDOWN_MS, 1) // { ok: true, value: undefined }
 */
export const canResend = (lastSentAt: number, now: number, sentThisHour: number): Result<void, ResendRefusal> => {
  if (now - lastSentAt < RESEND_COOLDOWN_MS) return err('cooldown')
  if (sentThisHour >= HOURLY_RESEND_CAP) return err('hourly-cap')
  return ok(undefined)
}
