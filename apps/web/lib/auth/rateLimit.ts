/**
 * rateLimit — the sliding window `SECURITY.md` §3 requires on the password
 * and code endpoints, per account and per IP, enforced by Postgres.
 *
 * This is the layer above the one-time-code lifecycle. `otpService.ts` bounds
 * what one CHALLENGE can absorb (three guesses, a thirty-second resend
 * cooldown, five sends an hour); this module bounds what one ADDRESS and one
 * ACCOUNT can attempt at all, so an attacker who simply asks for a fresh
 * challenge each time meets a ceiling rather than an unlimited supply of
 * three-guess budgets.
 *
 * PATTERNS (CLAUDE.md §3.3). Repository: this is the only place a
 * `signInAttempts` row is written or read, so nothing above it learns what
 * the table looks like. Result type: a decision is a value a caller must
 * unwrap. Value objects: the account is a branded `UserId`, so an address
 * cannot be passed where an account belongs.
 *
 * THE WINDOW LIVES IN POSTGRES, NOT IN THIS PROCESS, AND THAT IS THE WHOLE
 * DESIGN (`docs/adr/0016-rate-limit-window-storage.md`). The obvious
 * implementation — a `Map` of key to timestamps — is correct on a machine
 * that runs one process and wrong on the host this application deploys to.
 * Vercel (`docs/adr/0001-hosting-and-cost.md`) runs serverless invocations,
 * each with its own memory, so an attacker cycling instances never meets a
 * refusal — while every local test passes, because locally there is one
 * process. A limiter green in CI and absent in production is worse than
 * none, because nobody looks at it again.
 *
 * EVERY ATTEMPT IS RECORDED FIRST AND RANKED SECOND. This is the direct
 * carry-over from the concurrency defect measured one task ago: a limiter
 * that reads a count, decides, and then writes has a read-check-write window
 * in which every racer reads the same number, and twelve parallel guesses
 * were evaluated against a three-guess budget that way
 * (`docs/adr/0015-otp-challenge-hashing.md`). So {@link admitAttempt} inserts
 * its own row, then asks how many rows for that key stand at or before its
 * own, and is admitted while that rank is at or below the limit. It needs no
 * lock, it is fair under a burst — the first N of an arriving burst are
 * admitted and the rest refused, rather than all or none — and there is no
 * moment between the check and the write for a racer to occupy.
 *
 * THE ROW IS STAMPED WITH `clock_timestamp()`, NEVER `now()`. `now()` is the
 * transaction start time, identical for every statement in one transaction,
 * so a burst inside one transaction would tie on the very column the window
 * is measured over. `clock_timestamp()` reads the wall clock at the moment
 * the row is written.
 *
 * RANK IS ORDERED BY `id`, NOT BY THE TIMESTAMP. The column is
 * `timestamp(3)`, so two attempts a hundred microseconds apart can land on
 * the same millisecond, and two attempts sharing a rank would let a limit of
 * N admit N+1. `id` comes from a sequence: unique, and handed out in the
 * order the rows are inserted, which is the same order `clock_timestamp()`
 * stamps them in. The timestamp decides only whether an attempt is still
 * inside the window — which is `packages/domain/src/auth/rateWindow.ts`'s
 * job, not this module's.
 *
 * THE READ IS BOUNDED, AND ONLY FROM THE OLD END. It asks for the newest
 * `limit + 1` rows at or before this one, because nothing beyond that can
 * change the answer: if an in-window attempt is not among them, then
 * `limit + 1` newer attempts are, and every one of those is in-window too.
 * The window floor is deliberately NOT applied in SQL — the domain owns the
 * window arithmetic, and applying it in both places would mean neither could
 * be broken by itself, which is a pair of tests that can no longer fail.
 *
 * THE PRUNE RIDES ALONG WITH THE INSERT. Anything older than the window for
 * the key being touched can affect no future decision, so it is deleted in
 * the same statement that records the new attempt. The table therefore stays
 * bounded without a scheduler, and the cost falls on the key that is
 * generating the rows.
 *
 * ONE RESIDUAL RACE IS ACCEPTED AND NAMED, RATHER THAN HIDDEN. Postgres
 * READ COMMITTED cannot see another transaction's uncommitted row, so an
 * attempt whose INSERT is still in flight is invisible to a racer's rank
 * query. Each statement here is its own autocommit statement — the row is
 * committed the moment the INSERT returns, one round trip before the
 * ranking query is even sent — so the window in which this can happen is
 * shorter than a round trip, and its worst case is admitting one or two
 * attempts past the limit under a burst, never refusing one below it. The
 * alternative is a per-key lock, which buys exactness with a held connection
 * per attempt: the same denial-of-service lever `otpService.ts` rejects for
 * its own comparison path. See ADR 0016.
 *
 * NOTHING HERE LOGS, AND THAT IS A REQUIREMENT RATHER THAN AN OMISSION. An
 * address and an account are never present in the same row, and never
 * appear together in any value this module returns: a refusal is one word.
 *
 * Depends on: `payload` (the Local API instance, injected) and its Postgres
 * pool, and `@travel-diary/domain`'s `admitsAttempt`, the two limits, the
 * window, `UserId` and `Result`.
 */
import {
  ACCOUNT_CODE_ATTEMPT_LIMIT,
  IP_ATTEMPT_LIMIT,
  type RateRefusal,
  SIGN_IN_WINDOW_MS,
  admitsAttempt,
} from '@travel-diary/domain/auth/rateWindow'
import type { UserId } from '@travel-diary/domain/ids'
import type { Result } from '@travel-diary/domain/result'
import type { Payload } from 'payload'

/** Which of `SECURITY.md`'s two sliding windows an attempt is counted in. */
type AttemptDimension = 'ip' | 'account'

/** Which sign-in step an attempt was made against. Counted separately. */
type SignInEndpoint = 'password' | 'code'

/** What {@link createSignInRateLimiter} needs from the world outside this module. */
export interface SignInRateLimiterDependencies {
  /** The Payload Local API instance the `signInAttempts` rows live behind. */
  readonly payload: Payload
}

/** Records and judges sign-in attempts against `SECURITY.md`'s two windows. */
export interface SignInRateLimiter {
  /**
   * Records one password attempt from `ip` and says whether it is admitted.
   *
   * There is no account parameter, deliberately: `SECURITY.md` §3 assigns the
   * per-account password limit to Payload's own `maxLoginAttempts: 5` /
   * `lockTime: 15m`, so this endpoint keeps only the per-address window. It
   * is also the endpoint at which the account is not yet known — answering
   * differently for an address that named a real account than for one that
   * did not is the user enumeration the same section forbids.
   *
   * @param request - The requesting address.
   * @returns `ok` when the attempt is one this address may still make,
   *   `err('rate-limited')` otherwise. The attempt is recorded either way.
   */
  admitPasswordAttempt(request: { readonly ip: string }): Promise<Result<void, RateRefusal>>

  /**
   * Records one code attempt and says whether it is admitted, against BOTH
   * windows.
   *
   * @param request - The requesting address and the account the code was
   *   issued for.
   * @returns `ok` only when the attempt is within both the address's and the
   *   account's budget; otherwise `err('rate-limited')`. Both attempts are
   *   recorded either way — a dimension that stopped counting once another
   *   refused would let a caller spend one budget for free by exhausting the
   *   other first.
   */
  admitCodeAttempt(request: {
    readonly ip: string
    readonly account: UserId
  }): Promise<Result<void, RateRefusal>>
}

/** One key's window: which rows it counts, and how many of them it allows. */
interface AttemptKey {
  readonly dimension: AttemptDimension
  readonly endpoint: SignInEndpoint
  readonly subject: string
  readonly limit: number
}

/** The row a recorded attempt hands back: its place in the sequence, and its instant. */
interface RecordedAttempt {
  readonly id: number
  readonly attempted_at: Date
}

/** One of the recent attempts a rank is counted from. */
interface RankedAttempt {
  readonly attempted_at: Date
}

/**
 * Records an attempt against one key and decides whether it is admitted.
 *
 * @param pool - The Postgres pool behind the injected Payload instance.
 * @param key - Which window to count in, and its limit.
 * @returns `ok` while the recorded attempt's rank is within the limit,
 *   `err('rate-limited')` otherwise.
 */
const admitAttempt = async (pool: Payload['db']['pool'], key: AttemptKey): Promise<Result<void, RateRefusal>> => {
  // ONE STATEMENT, TWO EFFECTS. The `DELETE` clears everything older than the
  // window for this key — rows that can change no future decision — and the
  // `INSERT` records this attempt. A data-modifying CTE cannot see the other
  // half's rows, which is exactly what is wanted here: the prune cannot
  // remove the row being written.
  const recorded = await pool.query<RecordedAttempt>(
    `WITH pruned AS (
       DELETE FROM sign_in_attempts
        WHERE dimension = $1 AND endpoint = $2 AND subject = $3
          AND attempted_at <= clock_timestamp() - ($4::double precision * interval '1 millisecond')
     )
     INSERT INTO sign_in_attempts (dimension, endpoint, subject, attempted_at, created_at, updated_at)
     VALUES ($1, $2, $3, clock_timestamp(), clock_timestamp(), clock_timestamp())
     RETURNING id, attempted_at`,
    [key.dimension, key.endpoint, key.subject, SIGN_IN_WINDOW_MS],
  )
  // An `INSERT ... RETURNING` of one row returns exactly one row or throws,
  // but `noUncheckedIndexedAccess` cannot know that. These two folds are
  // TOTAL — no `?.`, no guard, no arm no test could take — and they fail
  // closed if the impossible happens anyway: with no row, `mineId` is 0, so
  // the ranking query below matches nothing and the rank is zero, and
  // `mineAt` is negative infinity, which `admitsAttempt` refuses outright.
  // The refusal is the domain's, stated once, rather than a second copy of
  // it here that nothing could ever exercise.
  const mineId = recorded.rows.reduce((highest, row) => Math.max(highest, row.id), 0)
  const mineAt = recorded.rows.reduce(
    (latest, row) => Math.max(latest, row.attempted_at.getTime()),
    Number.NEGATIVE_INFINITY,
  )

  // The newest `limit + 1` attempts standing at or before this one. Ordered
  // and bounded by `id` for the reasons in the module header: the sequence
  // breaks the ties a millisecond-precision timestamp leaves, and nothing
  // older than these rows can change the answer.
  const recent = await pool.query<RankedAttempt>(
    `SELECT attempted_at FROM sign_in_attempts
      WHERE dimension = $1 AND endpoint = $2 AND subject = $3 AND id <= $4
      ORDER BY id DESC
      LIMIT $5`,
    [key.dimension, key.endpoint, key.subject, mineId, key.limit + 1],
  )

  return admitsAttempt({
    attemptsAt: recent.rows.map((row) => row.attempted_at.getTime()),
    at: mineAt,
    windowMs: SIGN_IN_WINDOW_MS,
    limit: key.limit,
  })
}

/**
 * Builds the sign-in rate limiter over an injected Payload instance.
 *
 * @param dependencies - See {@link SignInRateLimiterDependencies}.
 * @returns The limiter. A factory rather than module-level functions so
 *   nothing here holds state between calls — the state is the table
 *   (CLAUDE.md §3.3 rejects singletons that hold mutable state).
 * @example
 * const limiter = createSignInRateLimiter({ payload })
 * const admitted = await limiter.admitPasswordAttempt({ ip: request.ip })
 */
export const createSignInRateLimiter = ({ payload }: SignInRateLimiterDependencies): SignInRateLimiter => ({
  async admitPasswordAttempt({ ip }) {
    return admitAttempt(payload.db.pool, {
      dimension: 'ip',
      endpoint: 'password',
      subject: ip,
      limit: IP_ATTEMPT_LIMIT,
    })
  },

  async admitCodeAttempt({ ip, account }) {
    // BOTH are awaited before either is read. Short-circuiting on the first
    // refusal would stop recording the other dimension's attempt, so an
    // attacker who had already exhausted one address's budget could grind an
    // account's window for free.
    const byAddress = await admitAttempt(payload.db.pool, {
      dimension: 'ip',
      endpoint: 'code',
      subject: ip,
      limit: IP_ATTEMPT_LIMIT,
    })
    const byAccount = await admitAttempt(payload.db.pool, {
      dimension: 'account',
      endpoint: 'code',
      subject: account,
      limit: ACCOUNT_CODE_ATTEMPT_LIMIT,
    })

    return byAddress.ok ? byAccount : byAddress
  },
})
