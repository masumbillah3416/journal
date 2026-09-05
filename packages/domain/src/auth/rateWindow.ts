/**
 * rateWindow — the sliding window on sign-in attempts: whether the attempt
 * just recorded is one this key is still allowed to make.
 *
 * `SECURITY.md` §3 requires "a sliding window on both the password and code
 * endpoints", per account *and* per IP, and numbers none of it. The three
 * constants below are this project's numbers, each with its reasoning at the
 * declaration. The mechanism is one function, and it is deliberately shaped
 * around a rank rather than around a count.
 *
 * PATTERN (CLAUDE.md §3.3): Result type. The decision is a value a caller
 * must unwrap, not an exception and not a bare boolean, so a caller cannot
 * reach "allowed" without having handled "refused".
 *
 * COUNT BY RANK, NOT BY READ-THEN-COUNT — the whole point of this module.
 * The obvious limiter reads how many attempts a key has made, decides, and
 * then records the attempt. That is a read-check-write, and this repository
 * has already measured what it costs: twelve guesses fired at once all read
 * the same attempt count and all twelve were evaluated against a three-guess
 * budget (`docs/adr/0015-otp-challenge-hashing.md`). So the caller records
 * its own attempt FIRST and then asks this function where that attempt
 * ranks: {@link admitsAttempt} counts the recorded attempts at or before the
 * one being judged, within the window, and admits it while that rank is at
 * or below the limit. Nothing here decides whether to record — the recording
 * already happened — so there is no window between the check and the write
 * for a racer to slip through, and a burst is refused in arrival order
 * instead of being admitted or refused all together.
 *
 * TIES ARE COUNTED ON BOTH SIDES, WHICH IS WHY THE CALLER'S CLOCK MATTERS.
 * `at` is compared with `<=`, so two attempts stamped with the identical
 * instant each count the other and both take the higher rank. That is the
 * fail-closed side of a tie — two attempts sharing a rank would let a limit
 * of N admit N+1 — and it is why `apps/web/lib/auth/rateLimit.ts` stamps its
 * rows with Postgres's `clock_timestamp()` rather than `now()`, which is the
 * transaction start time and would make every attempt in one transaction tie.
 *
 * THE CALLER MAY TRUNCATE `attemptsAt`, AND ONLY FROM THE OLD END. Nothing
 * below the newest `limit + 1` attempts changes the answer, so a caller that
 * reads only those gets the same decision from a bounded read. Truncating
 * the NEW end instead would lower a rank that should have been refused.
 *
 * FAIL CLOSED ON A NONSENSICAL WINDOW, LIMIT OR TIMESTAMP. The precedent is
 * `canResend` in ./otpChallenge, and the reason is the same: every
 * comparison against `NaN` is false, so a limiter that simply evaluated its
 * arithmetic would read a broken clock or a broken count as "under the
 * limit" and disable itself silently, in the one code path that never
 * appears in a log.
 *
 * Depends on: Result, ok and err, from ../result.
 */
import { type Result, err, ok } from '../result'

/**
 * The span the sliding window covers, on both endpoints and in both
 * dimensions (fifteen minutes).
 *
 * It matches `users.lockTime`, deliberately: the cooling-off an account
 * lockout imposes and the window an address's attempts age out of are the
 * same quarter of an hour, so a reader who has waited out one has waited out
 * the other, and there is only one number for them to be told.
 */
export const SIGN_IN_WINDOW_MS = 15 * 60_000

/**
 * The most attempts one address may make against a single endpoint per
 * window.
 *
 * `SECURITY.md` names the per-IP window and leaves the number unstated.
 * Twenty is generous on purpose: an office or a household behind one NAT is
 * a single address to us, and several people signing in — with the mistyped
 * passwords and resent codes that go with it — must not trip a limit meant
 * for an attacker. Twenty attempts in a quarter of an hour is far past what
 * that traffic needs, and far below what brute force is worth: against six
 * digits it is twenty guesses out of a million, and against a password it is
 * slower than a person typing carefully.
 *
 * Counted SEPARATELY on the password endpoint and the code endpoint, so
 * exhausting one does not spend the other's budget — they are different
 * secrets with different keyspaces, and a reader who has fumbled their
 * password is not thereby out of code attempts.
 */
export const IP_ATTEMPT_LIMIT = 20

/**
 * The most code attempts one account may take per window, from any address.
 *
 * A backstop, not a limit a reader can reach. The per-challenge budget is
 * three guesses (`MAX_ATTEMPTS`) and resends are capped at five an hour
 * (`HOURLY_RESEND_CAP`), which already holds one account near eighteen code
 * attempts an hour by the only route a real reader has. Ten in fifteen
 * minutes sits below that for an attacker requesting fresh challenges from
 * many addresses — the spray a per-IP limit alone cannot see — while leaving
 * the honest reader, who cannot outrun the thirty-second resend cooldown,
 * well clear of it.
 *
 * There is no equivalent constant for the PASSWORD endpoint per account, and
 * that is deliberate rather than an omission: `SECURITY.md` §3 assigns that
 * job to Payload's own `maxLoginAttempts: 5` / `lockTime: 15m` on the `users`
 * collection, and a second limiter beside it would be two sources of truth
 * for one rule (CLAUDE.md §7).
 */
export const ACCOUNT_CODE_ATTEMPT_LIMIT = 10

/** Why {@link admitsAttempt} refused. One reason, because a caller may act on no other. */
export type RateRefusal = 'rate-limited'

/** The question {@link admitsAttempt} answers: where one recorded attempt ranks. */
export interface AttemptWindow {
  /**
   * When the attempts recorded against this key happened, in epoch
   * milliseconds, INCLUDING the one being judged. Order does not matter, and
   * the caller may supply only the newest `limit + 1` of them at or before
   * `at` — see the module header.
   */
  readonly attemptsAt: readonly number[]
  /**
   * The instant of the attempt being judged, in epoch milliseconds. Always
   * the timestamp its own recorded row carries, never a separately-read
   * clock: the two must agree, or the attempt cannot find itself.
   */
  readonly at: number
  /** How far back the window reaches from {@link at}. */
  readonly windowMs: number
  /** The most attempts this key may make within one window. */
  readonly limit: number
}

/**
 * Decides whether the attempt at `at` is one this key is still allowed.
 *
 * @param attempt - The recorded attempts, the instant being judged, the
 *   window and the limit. See {@link AttemptWindow}.
 * @returns `ok(undefined)` when the attempt's rank — how many recorded
 *   attempts fall within the window at or before it — is between one and
 *   `limit` inclusive; otherwise `err('rate-limited')`. Also
 *   `err('rate-limited')` when the attempt cannot find its own record, or
 *   when `at`, `windowMs`, `limit` or any recorded timestamp is not a sane
 *   value: see the module header for why a limiter must fail closed on
 *   arithmetic it cannot trust.
 * @example
 * admitsAttempt({ attemptsAt: [200, 700], at: 700, windowMs: 1_000, limit: 2 }) // ok
 * admitsAttempt({ attemptsAt: [200, 700, 900], at: 900, windowMs: 1_000, limit: 2 }) // err
 */
export const admitsAttempt = ({ attemptsAt, at, windowMs, limit }: AttemptWindow): Result<void, RateRefusal> => {
  // TWO OF THESE FOUR CONDITIONS ARE LOAD-BEARING ON THEIR OWN; THE REST
  // RESTATE, AT THE BOUNDARY, WHAT THE RANK-ZERO RULE BELOW ALSO HAPPENS TO
  // ENFORCE. Both halves were checked rather than assumed, because a guard
  // that cannot be broken is a guard no test can prove.
  //
  // Load-bearing — each one FAILS OPEN if removed, verified by mutation (see
  // the task report): an infinite `windowMs` puts the floor at negative
  // infinity, so every attempt ever recorded counts as in-window and the
  // window stops sliding; an infinite or fractional `limit` satisfies
  // `rank <= limit` for every rank, which is a limiter switched off by
  // arithmetic. A non-finite entry in `attemptsAt` is the third: it fails
  // every in-window comparison, so it silently LOWERS the rank of the very
  // attempt being judged.
  //
  // Restated rather than required — a non-finite `at`, a negative
  // `windowMs`, or a negative `limit` each already end in a refusal without
  // these clauses (a NaN or infinite `at` makes every comparison against the
  // floor false; a negative window puts the floor above `at`; a negative
  // limit is below every rank). They are written anyway so the fail-closed
  // outcome is a decision stated where a reader will hit it rather than a
  // by-product of the arithmetic underneath — which a later change to that
  // arithmetic could remove without anything failing.
  const windowIsSane = Number.isFinite(windowMs) && windowMs >= 0
  const limitIsSane = Number.isInteger(limit) && limit >= 0
  if (!Number.isFinite(at) || !windowIsSane || !limitIsSane) return err('rate-limited')
  if (attemptsAt.some((recorded) => !Number.isFinite(recorded))) return err('rate-limited')

  // Half-open at the floor and closed at `at`: an attempt exactly one window
  // old has aged out, matching how `challengeState` treats an expiry
  // boundary, while an attempt sharing this one's instant still counts (see
  // the module header on ties).
  const floor = at - windowMs
  const rank = attemptsAt.reduce((counted, recorded) => (recorded > floor && recorded <= at ? counted + 1 : counted), 0)

  // A rank of zero is not "no attempts yet" — the attempt being judged is
  // itself one of `attemptsAt`, so zero means the caller asked before it
  // recorded, which is the read-then-count order this module exists to
  // prevent. Refusing is the fail-closed reading of a caller that is not
  // holding up the contract.
  if (rank === 0) return err('rate-limited')
  return rank <= limit ? ok(undefined) : err('rate-limited')
}
