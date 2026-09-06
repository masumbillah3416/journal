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
 * unwrap. Value objects: the code endpoint's account is a branded `UserId`,
 * so an address cannot be passed where an account belongs.
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
 * THE PRUNE RIDES ALONG WITH THE INSERT, AND IT IS NOT ONLY THIS KEY'S. Rows
 * older than the window can affect no future decision, so each write deletes
 * this key's aged rows AND a bounded batch of aged rows from any other key
 * ({@link PRUNE_SWEEP_ROWS}). The second half is what makes the table's bound
 * real: a key-scoped prune alone bounds growth by the number of distinct keys
 * ever seen, not by the window, and a spray from many addresses is precisely
 * the traffic that manufactures keys. With the sweep, cleanup is eventually
 * complete, per-request work stays constant, and no scheduler has to be up for
 * either to hold.
 *
 * ONE RESIDUAL RACE IS ACCEPTED AND NAMED, RATHER THAN HIDDEN. Postgres READ
 * COMMITTED cannot see another transaction's uncommitted row, so an attempt
 * whose INSERT is still in flight is invisible to a racer's rank query. Each
 * statement here is its own autocommit statement — the row is committed the
 * moment the INSERT returns, one round trip before the ranking query is even
 * sent — so the window in which this can happen is shorter than a round trip,
 * and the error is always over-admission, never a refusal below the limit.
 *
 * ITS WORST CASE IS NOT "ONE OR TWO", WHICH IS WHAT THIS COMMENT USED TO SAY.
 * One or two is what was MEASURED. The BOUND is the number of inserts that can
 * be in flight with a lower id than yours at the moment you rank, minus one:
 * `pool max - 1` for a single process (nine, with `pg`'s default pool of ten),
 * and `invocations x pool max - 1` on the serverless target, limited only by
 * the server's `max_connections`. The acceptance still stands — the
 * three-guess challenge budget and the five-attempt account lockout bind long
 * before any of that matters — but a measurement written as a bound is how the
 * next reader sizing a limit against it gets it wrong by an order of magnitude.
 *
 * The alternative is a per-key lock, which buys exactness with a held
 * connection per attempt: the same denial-of-service lever `otpService.ts`
 * rejects for its own comparison path. See ADR 0016.
 *
 * NOTHING HERE LOGS, AND THAT IS A REQUIREMENT RATHER THAN AN OMISSION. A
 * refusal is one word, and no value this module returns carries a subject at
 * all. ONE ROW HOLDS ONE SUBJECT: an IP, or an account id, or a hashed
 * address, never two of them — and the `account` dimension's subject is a row
 * id on the code endpoint and a SHA-256 of the claimed address on the password
 * endpoint, so no cleartext address is ever written beside an IP.
 *
 * THAT IS A STATEMENT ABOUT A ROW, NOT A CLAIM OF UNLINKABILITY, and the
 * difference matters to anyone relying on it. One request writes two rows
 * within a millisecond of each other, so anybody reading this table can
 * correlate an IP with the subject recorded beside it in time. What the split
 * buys is that no single row is a record of "this address, from this
 * address", and that a dump of the `account` dimension is not a list of
 * addresses. It does not make the pairing unrecoverable, and nothing here
 * should be described as if it did.
 *
 * Depends on: `payload` (the Local API instance, injected) and its Postgres
 * pool, `node:crypto`, and `@travel-diary/domain`'s `admitsAttempt`, the three
 * limits, the window, `UserId` and `Result`.
 */
import { createHash } from 'node:crypto'
import {
  ACCOUNT_CODE_ATTEMPT_LIMIT,
  ADDRESS_PASSWORD_ATTEMPT_LIMIT,
  IP_ATTEMPT_LIMIT,
  type RateRefusal,
  SIGN_IN_WINDOW_MS,
  admitsAttempt,
} from '@travel-diary/domain/auth/rateWindow'
import type { UserId } from '@travel-diary/domain/ids'
import type { Result } from '@travel-diary/domain/result'
import type { Payload } from 'payload'

/**
 * How many aged rows belonging to OTHER keys each write also clears.
 *
 * A key-scoped prune alone does not bound this table, and the first version of
 * this module claimed it did. Pruning only the key being written bounds growth
 * by the number of DISTINCT KEYS ever seen, not by the window: an address that
 * makes one attempt and never returns leaves its row behind for good, and a
 * spray from many addresses — the threat this limiter exists for — is exactly
 * the traffic that manufactures keys. Measured before it was fixed: three aged
 * rows for one address survived a write against a different address.
 *
 * So every write also sweeps a bounded batch of aged rows from anywhere in the
 * table, oldest first, which makes cleanup eventually complete while
 * per-request work stays constant. Fifty because it is comfortably more than
 * the keys one sign-in burst can create, so the sweep drains faster than
 * ordinary traffic fills it, and small enough that the extra `DELETE` stays a
 * few indexed rows rather than a scan a reader waits on.
 *
 * A scheduled job was the other option and was not taken: Phase 0's queue
 * exists, but a limiter whose table grows without bound whenever the scheduler
 * is down has an availability dependency it does not need. See ADR 0016.
 */
const PRUNE_SWEEP_ROWS = 50

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
   * Records one password attempt and says whether it is admitted, against
   * BOTH windows.
   *
   * THE SECOND SUBJECT IS THE ADDRESS THE REQUEST CLAIMED, NOT THE ACCOUNT IT
   * NAMES, and that is the whole reason this endpoint can be counted at all
   * (phase ruling F43). At the password step the account is not yet known —
   * and half the requests name no account. Keying on a row id would leave the
   * miss path doing strictly less work than the hit path, which is an
   * enumeration oracle inside the limiter, on exactly the branch
   * `apps/web/lib/auth/signIn.ts` exists to make indistinguishable.
   *
   * Payload's `maxLoginAttempts: 5` / `lockTime: 15m` is still what
   * `SECURITY.md` §3 assigns the per-ACCOUNT password limit to, and this
   * window does not restate it: it is set above five so the lockout always
   * binds first for an address that names an account
   * ({@link ADDRESS_PASSWORD_ATTEMPT_LIMIT}). What it governs is the address
   * Payload has no row to lock.
   *
   * @param request - The requesting address, and the sign-in address it
   *   claimed. `email` must already be normalised — lower-cased and trimmed,
   *   as Payload's own login operation normalises it — because the key is a
   *   hash and two spellings of one address would otherwise hold two budgets.
   *   Normalising here as well would be a second source of truth for it
   *   (CLAUDE.md §7); `signIn.ts` normalises once, for the lookup and for
   *   this, and its suite is where the property is proved.
   * @returns `ok` only when the attempt is within both the requesting
   *   address's and the claimed address's budget; otherwise
   *   `err('rate-limited')`. Both attempts are recorded either way — a
   *   dimension that stopped counting once another refused would let a caller
   *   spend one budget for free by exhausting the other first.
   */
  admitPasswordAttempt(request: { readonly ip: string; readonly email: string }): Promise<Result<void, RateRefusal>>

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
  admitCodeAttempt(request: { readonly ip: string; readonly account: UserId }): Promise<Result<void, RateRefusal>>
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
 * SHA-256 of a normalised sign-in address, hex encoded.
 *
 * The same choice, for the same reason, as `otpService.ts`'s and
 * `sessions.ts`'s `sessionHash`: this is a LOOKUP KEY, so it must be
 * deterministic and indexable, and it is never compared against a secret.
 * What it buys here is that `sign_in_attempts` — a table that already holds
 * raw IP addresses — never holds a sign-in address beside one (CLAUDE.md §7).
 *
 * It is NOT a defence against an attacker who has the table and wants to know
 * whether one particular address was tried: an address is guessable, so
 * hashing it is not hiding it. It stops the table being a list of addresses.
 *
 * @param address - The normalised sign-in address.
 * @returns 64 hex characters — the value stored in and looked up by `subject`.
 */
const hashAddress = (address: string): string => createHash('sha256').update(address).digest('hex')

/**
 * Records an attempt against one key and decides whether it is admitted.
 *
 * @param pool - The Postgres pool behind the injected Payload instance.
 * @param key - Which window to count in, and its limit.
 * @returns `ok` while the recorded attempt's rank is within the limit,
 *   `err('rate-limited')` otherwise.
 */
const admitAttempt = async (pool: Payload['db']['pool'], key: AttemptKey): Promise<Result<void, RateRefusal>> => {
  // ONE STATEMENT, THREE EFFECTS, and the third is what makes the table's
  // bound real rather than aspirational. The first `DELETE` clears everything
  // older than the window for THIS key. The second clears a bounded batch of
  // aged rows belonging to ANY OTHER key, oldest first — see
  // {@link PRUNE_SWEEP_ROWS} for why a key-scoped prune alone is not enough.
  // The `INSERT` then records this attempt. A data-modifying CTE cannot see
  // another's rows, which is exactly what is wanted: neither prune can remove
  // the row being written, and the sweep's `NOT (...)` keeps the two deletes
  // disjoint rather than relying on how Postgres resolves two commands
  // touching one row.
  const recorded = await pool.query<RecordedAttempt>(
    `WITH aged_here AS (
       DELETE FROM sign_in_attempts
        WHERE dimension = $1 AND endpoint = $2 AND subject = $3
          AND attempted_at <= clock_timestamp() - ($4::double precision * interval '1 millisecond')
     ),
     aged_elsewhere AS (
       SELECT id FROM sign_in_attempts
        WHERE attempted_at <= clock_timestamp() - ($4::double precision * interval '1 millisecond')
          AND NOT (dimension = $1 AND endpoint = $2 AND subject = $3)
        ORDER BY id
        LIMIT $5
     ),
     swept AS (
       DELETE FROM sign_in_attempts WHERE id IN (SELECT id FROM aged_elsewhere)
     )
     INSERT INTO sign_in_attempts (dimension, endpoint, subject, attempted_at, created_at, updated_at)
     VALUES ($1, $2, $3, clock_timestamp(), clock_timestamp(), clock_timestamp())
     RETURNING id, attempted_at`,
    [key.dimension, key.endpoint, key.subject, SIGN_IN_WINDOW_MS, PRUNE_SWEEP_ROWS],
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
 * const admitted = await limiter.admitPasswordAttempt({ ip: request.ip, email })
 */
export const createSignInRateLimiter = ({ payload }: SignInRateLimiterDependencies): SignInRateLimiter => ({
  async admitPasswordAttempt({ ip, email }) {
    // BOTH are awaited before either is read, for the same reason as
    // `admitCodeAttempt` below: short-circuiting on the first refusal would
    // stop recording the other dimension's attempt.
    const byRequestingAddress = await admitAttempt(payload.db.pool, {
      dimension: 'ip',
      endpoint: 'password',
      subject: ip,
      limit: IP_ATTEMPT_LIMIT,
    })
    const byClaimedAddress = await admitAttempt(payload.db.pool, {
      dimension: 'account',
      endpoint: 'password',
      subject: hashAddress(email),
      limit: ADDRESS_PASSWORD_ATTEMPT_LIMIT,
    })

    return byRequestingAddress.ok ? byClaimedAddress : byRequestingAddress
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
