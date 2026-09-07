/**
 * otpService — issues and verifies the six-digit sign-in code, entirely on
 * the server.
 *
 * This module is the whole of `SECURITY.md`'s first prototype hole. The
 * prototype (`Travel Diary Login.dc.html`) generated the code in the browser,
 * held the expected value in component state and compared it there, which is
 * a demonstration of the interaction rather than authentication: anybody
 * could read the expected code out of the page. Nothing about the code
 * crosses to the client here — it is generated with a CSPRNG, stored only as
 * a hash, delivered through the Mailer port, and compared server-side.
 *
 * PATTERNS (CLAUDE.md §3.3). Repository: this is the only place an
 * `otpChallenges` row is read or written, so nothing above it learns what a
 * Payload row looks like. Ports & Adapters: delivery is the injected
 * {@link MailerPort}, never a concrete mailer. Result type: both operations
 * return a `Result`, so a caller cannot reach a user id without handling the
 * refusal. Value objects: `UserId` and `SessionId` are branded, so binding a
 * challenge to the wrong one of them is a compile error.
 *
 * EVERY LIMIT HERE IS ENFORCED BY THE DATABASE, NOT BY THIS PROCESS. That is
 * the difference between a limit and the appearance of one, and it is why
 * three of the queries below are hand-written SQL rather than Local API
 * calls. An earlier version of this module read `attempts`, compared it in
 * JavaScript, spent ~30ms deriving a scrypt key, then wrote `attempts + 1`
 * back. Twelve guesses fired at once all read the same zero: all twelve were
 * evaluated, the stored counter finished at two, and the correct code still
 * worked afterwards. Two simultaneous correct codes both redeemed the same
 * challenge. Ten simultaneous requests all sent a code. A three-attempt
 * budget, single use and an hourly ceiling each fall to a parallel burst, and
 * an attacker who can fan out does not need three guesses against a million
 * combinations. The three fixes, each pinned by a `Promise.all` test in
 * `otpService.integration.test.ts`:
 *
 *   1. **The attempt is CLAIMED before the code is compared** — one
 *      conditional `UPDATE ... SET attempts = attempts + 1 WHERE attempts <
 *      MAX_ATTEMPTS AND consumed_at IS NULL AND created_at > <floor>
 *      RETURNING ...`. Postgres locks the row for the duration of that one
 *      statement and re-evaluates the `WHERE` against the committed version,
 *      so concurrent claimants serialise and see each other's increments.
 *      Zero rows returned is an ANSWER, not an error: the row is re-read to
 *      say which of exhausted/consumed/expired it was.
 *   2. **Consumption is claimed the same way** — `UPDATE ... WHERE
 *      consumed_at IS NULL RETURNING id`. Zero rows means another request won
 *      the race, so this one reports `'consumed'`.
 *   3. **`issueChallenge` serialises its count-and-insert per account** with
 *      a **transaction-scoped**, **timeout-bounded** Postgres advisory lock,
 *      because counting rows and then inserting one cannot be made atomic by
 *      a single statement under READ COMMITTED — each racer's `count(*)`
 *      simply cannot see the others' uncommitted rows. Transaction-scoped so
 *      the server releases it on commit, rollback or disconnect rather than
 *      it depending on a statement of ours reaching the database; bounded so
 *      a request queued behind a stalled holder fails instead of holding a
 *      connection out of a pool of ten indefinitely. See the comment at the
 *      lock itself.
 *
 * CLAIM-THEN-COMPARE, NOT A LOCK HELD ACROSS THE COMPARISON, and both halves
 * of that are deliberate. A guess must cost an attempt even if this process
 * dies mid-verification, or a crash loop becomes free guesses. And holding a
 * row lock across ~30ms of scrypt would tie up a database connection per
 * guess, which is its own denial-of-service lever. For the same reason
 * {@link issueChallenge} derives its hash OUTSIDE the advisory lock, so the
 * lock spans a count and an insert (sub-millisecond) rather than the
 * derivation.
 *
 * THE TWO STORED HASHES ARE DELIBERATELY DIFFERENT ALGORITHMS. `sessionHash`
 * is SHA-256, because it is the LOOKUP KEY — it must be deterministic and
 * indexable, and a session identifier is high-entropy, so there is no
 * dictionary to run against it. `codeHash` is scrypt with a per-row salt,
 * because a six-digit code is only a million values and a SHA-256 of one
 * falls to a laptop the moment the database leaks. `codeHash` is never
 * looked up by: the row is found by `sessionHash`, and only then is the
 * candidate code derived and compared. See
 * `docs/adr/0015-otp-challenge-hashing.md`.
 *
 * ═══ THE TABLE IS BOUNDED BY A SWEEP, AND `expiresAt` IS NOT WHAT BOUNDS IT ═══
 *
 * Every `issueChallenge` also deletes a bounded batch of rows older than
 * `RESEND_WINDOW_MS`, from any account, oldest first — the same cross-key
 * sweep `rateLimit.ts` uses and the same one number
 * (`PRUNE_SWEEP_ROWS`, @travel-diary/domain/auth/retention). Rows are only
 * ever created here, so a table that sweeps up to fifty per insert drains
 * faster than it fills, with no scheduler that has to be up.
 *
 * THE SWEEP KEYS ON `created_at`, AND THIS COMMENT USED TO SAY OTHERWISE.
 * Phase 2 ruling F14 kept the `expiresAt` column on the ground that it "earns
 * its place as a purge index (`DELETE WHERE expiresAt < now`, one indexed
 * query)", and this header and `apps/web/collections/otpChallenges.ts` both
 * stated that purge as though it existed. It did not: no such query was ever
 * written, the column carries no index, and the table grew without bound —
 * blocker B4 of Phase 2's final review. The ruling was also wrong on the
 * merits, which is worth more than the correction: a challenge is unusable
 * after EXPIRY_MS (five minutes) but is still COUNTED by the hourly ceiling
 * for RESEND_WINDOW_MS (one hour), so a purge keyed on `expires_at` would
 * delete rows the mailbomb cap is still counting.  `created_at` is the column
 * the retention question is actually about, and it is the column the two
 * queries that read a window already use.
 *
 * INVARIANT — `expiresAt` IS NEVER READ, BY ANYTHING. Not to decide validity,
 * not to purge. It is written as `createdAt + EXPIRY_MS` because
 * `DATA_MODEL.md`'s `otpChallenges` section declares the field and this
 * repository transcribes that schema faithfully; every decision derives
 * expiry from `created_at` and `EXPIRY_MS` instead — in the claim's own
 * `WHERE`, and in `challengeState` on the re-read. Two sources of truth for
 * one fact (CLAUDE.md §7) would make `EXPIRY_MS` decorative and would let a
 * bad write to `expiresAt` silently extend a challenge's life. Pinned by the
 * "decides expiry from createdAt" test, which moves the stored column a year
 * into the future and still expects the challenge to be expired.
 *
 * INVARIANT — NOTHING HERE EVER LOGS, RETURNS OR THROWS THE CODE. The code
 * exists in exactly two places: the local `code` binding in
 * `issueChallenge`, and the body of the message handed to the mailer. It is
 * never interpolated into an error, a log line or a returned value
 * (CLAUDE.md §7).
 *
 * Depends on: `payload` (the Local API instance, injected) and its Postgres
 * pool, the Mailer port, `node:crypto`, and
 * `@travel-diary/domain`'s `challengeState`, `canResend`, `EXPIRY_MS`,
 * `MAX_ATTEMPTS`, `PRUNE_SWEEP_ROWS`, `maskEmail`, the branded ids and
 * `Result`.
 */
import { createHash, randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto'
import { maskEmail } from '@travel-diary/domain/auth/mask'
import {
  type ChallengeState,
  EXPIRY_MS,
  MAX_ATTEMPTS,
  type ResendRefusal,
  canResend,
  challengeState,
} from '@travel-diary/domain/auth/otpChallenge'
import { PRUNE_SWEEP_ROWS } from '@travel-diary/domain/auth/retention'
import { type SessionId, type UserId, userId } from '@travel-diary/domain/ids'
import { type Result, err, isOk, ok } from '@travel-diary/domain/result'
import type { Payload } from 'payload'
import type { MailerPort } from '../ports/mailer'

/** How many decimal digits a sign-in code has (SCREENS.md §3.2: six cells). */
const CODE_DIGITS = 6

/** One past the largest six-digit code, so `randomInt` covers `000000`–`999999`. */
const CODE_UPPER_BOUND = 10 ** CODE_DIGITS

/** Bytes of per-row salt mixed into every `codeHash`. */
const SALT_BYTES = 16

/** Bytes of derived key every `codeHash` ends with. */
const KEY_BYTES = 32

/** Hex characters the salt occupies at the front of a stored `codeHash`. */
const SALT_HEX_LENGTH = SALT_BYTES * 2

/**
 * scrypt's cost parameters.
 *
 * Safe to change without a migration, unlike most stored-hash parameters:
 * a challenge lives five minutes (see {@link EXPIRY_MS}), so no row hashed
 * with the previous parameters can outlive a deploy. That is why the stored
 * value carries only `salt || key` and not the parameters themselves — a
 * self-describing format would be an extension point with no second caller
 * (CLAUDE.md §4).
 */
const SCRYPT_COST = { N: 16_384, r: 8, p: 1 } as const

/**
 * The rolling window `HOURLY_RESEND_CAP` counts within.
 *
 * The domain's cap names the hour in its own documentation but leaves the
 * window to whoever queries the history, since the domain never queries
 * anything. This is that query's half of the same rule.
 */
const RESEND_WINDOW_MS = 60 * 60_000

/**
 * The first half of the advisory-lock key `issueChallenge` serialises on; the
 * second half is the account id, so two accounts never contend.
 *
 * Postgres advisory locks share one global two-integer namespace across the
 * whole database, so this number's only job is to be a value no other part of
 * this application uses. It is arbitrary and stable, and it must stay stable:
 * changing it while a deploy is half-rolled-out would leave old and new
 * processes locking different keys, which is a silently unserialised window.
 */
export const ISSUE_LOCK_NAMESPACE = 831

/**
 * How long a request will wait for another request's hold on the same
 * account's lock before giving up.
 *
 * Generous by three orders of magnitude against what the critical section
 * actually costs — one indexed `count(*)` and one `INSERT`, sub-millisecond —
 * so it never fires on honest contention, including the ten-deep burst
 * `otpService.integration.test.ts` fires at one account. It is a ceiling on
 * pathology, not a tuning knob: see the comment at the `SET LOCAL` below for
 * why an unbounded wait is the worse failure.
 */
const ISSUE_LOCK_TIMEOUT_MS = 3_000

/** Why {@link OtpService.issueChallenge} refused to issue or send a code. */
export type IssueFailure = ResendRefusal | 'unknown-account' | 'delivery-failed'

/** Why {@link OtpService.verifyChallenge} refused a code. */
export type VerifyFailure = 'invalid' | 'expired' | 'exhausted' | 'consumed'

/** What {@link createOtpService} needs from the world outside this module. */
export interface OtpServiceDependencies {
  /** The Payload Local API instance the `otpChallenges` and `users` rows live behind. */
  readonly payload: Payload
  /** Where a code is delivered. The port, never a concrete adapter. */
  readonly mailer: MailerPort
  /**
   * The current instant, in epoch milliseconds. Injected rather than read
   * from `Date.now()` inside the logic (CLAUDE.md §2.3), so expiry, cooldown
   * and the hourly window are all testable without waiting.
   */
  readonly now: () => number
}

/** What the code screen prints, and nothing more. */
export interface PendingChallenge {
  /** Where the code went, masked. Never the whole address (`SCREENS.md` §3.2). */
  readonly maskedTo: string
  /** When the code was issued, in epoch milliseconds — the countdown's origin. */
  readonly issuedAt: number
  /** How many guesses have already been spent against it. */
  readonly attemptsSpent: number
  /** How many the reader is allowed in total. */
  readonly attemptsAllowed: number
}

/** Issues and verifies one-time sign-in codes. */
export interface OtpService {
  /**
   * Generates a code, stores its hash bound to `session`, and mails it.
   *
   * @param user - The account signing in.
   * @param session - The PRE-AUTH session that started the sign-in. The
   *   challenge is bound to it, so a code issued for one browser cannot be
   *   redeemed in another (`SECURITY.md`).
   * @param ip - The requesting address, recorded on the row for abuse review.
   * @returns `ok` with the masked address the code went to — never the code,
   *   and never the full address — or `err` naming the refusal. The resend
   *   cooldown and hourly ceiling hold under concurrent requests, not merely
   *   sequential ones: the count and the insert are serialised per account.
   */
  issueChallenge(user: UserId, session: SessionId, ip: string): Promise<Result<{ maskedTo: string }, IssueFailure>>

  /**
   * Checks `code` against the challenge bound to `session`, consuming it on
   * success and spending one attempt on every evaluated guess.
   *
   * The attempt is spent BEFORE the comparison and by the database, so
   * simultaneous guesses cannot exceed {@link MAX_ATTEMPTS} between them and
   * simultaneous correct codes cannot both redeem one challenge.
   *
   * @param session - The session the code must have been issued for.
   * @param code - The six digits the reader typed.
   * @returns `ok` with the account the challenge belongs to, or `err` naming
   *   why the code was refused. `'invalid'` covers both a wrong code and a
   *   session with no challenge at all, deliberately: distinguishing them
   *   would tell an attacker which sessions have a live challenge.
   */
  verifyChallenge(session: SessionId, code: string): Promise<Result<{ userId: UserId }, VerifyFailure>>

  /**
   * What the code screen has to print, for the browser holding `session`.
   *
   * ═══ WHY THIS IS A SEPARATE READ, AND WHAT IT DELIBERATELY OMITS ═══
   *
   * `/admin/sign-in/code` drew `SCREENS.md` §3.2 against nothing for two
   * tasks: a fixed bullet run where the masked address belongs, a countdown
   * measured from the instant the document was drawn, and a hard-coded
   * `attemptsSpent={0}` (`docs/deviations.md` §33). Everything it needed was
   * in the row this reads.
   *
   * IT RETURNS NO CODE AND NO ACCOUNT. The address comes back MASKED, derived
   * from the `users` row inside this module and never returned whole; the
   * account id is not in the result at all, because this value is rendered
   * into a page. {@link OtpService.challengeAccount} is the server-only
   * lookup, and it exists separately for exactly that reason.
   *
   * IT DESCRIBES A CHALLENGE THAT CAN NO LONGER BE ANSWERED, rather than
   * pretending there is none. A reader who has spent all three guesses, or
   * waited out the five minutes, gets the same masked address, the real
   * counter and the real issue instant — see the implementation for why that
   * leaks nothing and what it cost when it did not. A REDEEMED challenge is
   * the exception and answers `null`.
   *
   * @param session - The identifier the browser is carrying.
   * @returns The four values the screen prints, or `null` when this browser
   *   holds no challenge at all or one already redeemed — which is what a
   *   reader who typed the address gets, and is not distinguishable by them
   *   from the other reason.
   */
  pendingChallenge(session: SessionId): Promise<PendingChallenge | null>

  /**
   * The account a live challenge belongs to.
   *
   * SERVER-ONLY, AND NOTHING MAY RETURN IT TO A READER. It exists so
   * `POST /admin/sign-in/code/verify` can spend `rateLimit.ts`'s per-account
   * code window, which needs a `UserId` and which had no caller at all until
   * this landed (phase ruling F45 — a mechanism nothing calls is not
   * enforcement). An earlier version of this module's header said no such
   * lookup was offered; what that reasoning was actually about is the HTTP
   * SURFACE, and that is where it is now honoured — every refusal the code
   * endpoint gives is one answer, whether or not a challenge exists.
   *
   * @param session - The identifier the browser is carrying.
   * @returns The account, or `null` when this browser holds no live challenge.
   */
  challengeAccount(session: SessionId): Promise<UserId | null>

  /**
   * Issues a fresh code for the challenge `session` already holds.
   *
   * The account is resolved from the challenge INSIDE this module, so no
   * caller has to hold it — which is what makes a resend endpoint possible
   * without the browser naming an account it has not authenticated as.
   *
   * WHATEVER STATE THAT CHALLENGE IS IN. `SECURITY.md` §3 asks for three
   * attempts "then invalidate it and FORCE A RESEND", so the one call that
   * exists to be made after a challenge dies must not require a live one. It
   * did until Phase 2 Task 11's fix round; see the implementation.
   *
   * @param session - The identifier the browser is carrying.
   * @param ip - The requesting address, recorded on the new row.
   * @returns `ok` with the masked address, or `err` naming the refusal.
   *   `'unknown-account'` covers a browser that has never been sent a code,
   *   which is the same answer a resend for a deleted account gets: a reader
   *   with nothing to resend has nothing to resend.
   */
  resendChallenge(session: SessionId, ip: string): Promise<Result<{ maskedTo: string }, IssueFailure>>
}

/**
 * What a claimed attempt hands back: enough to check the code and, if it
 * matches, to consume the row and name its owner.
 */
interface ClaimedAttempt {
  readonly id: number
  readonly user_id: number
  readonly code_hash: string
}

/** What the code screen's read needs off a challenge row, plus the address to mask. */
interface LiveChallenge {
  readonly attempts: string | null
  readonly consumed_at: Date | null
  readonly created_at: Date
  readonly email: string
}

/** The same three facts, plus the account, for the server-only lookup. */
interface OwnedChallenge {
  readonly user_id: number
  readonly attempts: string | null
  readonly consumed_at: Date | null
  readonly created_at: Date
}

/** The three facts `challengeState` needs, read back after a claim was refused. */
interface RefusedChallenge {
  readonly attempts: string
  readonly consumed_at: Date | null
  readonly created_at: Date
}

/** One row of the account's recent issuing history. */
interface IssueHistory {
  readonly sent_this_hour: number
  readonly last_sent_at: Date | null
}

/**
 * How a lifecycle state is reported to a caller who offered a code.
 *
 * A total mapping rather than a chain of `if`s, so there is no branch and no
 * unreachable arm. `'valid'` maps to `'invalid'`, which is the fail-closed
 * answer to the one race that can produce it: a concurrent
 * {@link OtpService.issueChallenge} inserting a NEWER challenge for the same
 * session between a refused claim and the re-read below. The code offered was
 * never compared against that new row, so it has not been accepted — and
 * saying `'invalid'` rather than trusting the fresh row is the difference
 * between a refusal and an accidental bypass.
 */
const REFUSAL_FOR_STATE: Record<ChallengeState, VerifyFailure> = {
  valid: 'invalid',
  expired: 'expired',
  exhausted: 'exhausted',
  consumed: 'consumed',
}

/**
 * SHA-256 of a session identifier, hex encoded.
 *
 * @param session - The pre-auth session id.
 * @returns 64 hex characters — the value stored in and looked up by
 *   `otpChallenges.sessionHash`.
 */
const hashSession = (session: SessionId): string => createHash('sha256').update(session).digest('hex')

/**
 * Derives a scrypt key from a code and a salt.
 *
 * THE `c8 ignore` BELOW IS THE LAST RESORT, NOT THE FIRST CHOICE, AND HERE IS
 * WHAT WAS TRIED. (1) `promisify(scrypt)` — which would have no error arm at
 * all — was written and reverted: `@types/node` declares no `__promisify__`
 * overload for `scrypt` (unlike `randomBytes` and the keypair generators), so
 * `promisify` falls back to its generic form and the derived key arrives as
 * `unknown`, which would cost an assertion on a secret-bearing buffer to
 * recover from. (2) Reaching the arm from a test was tried and cannot be
 * done without changing the module under test: `scrypt` invokes its callback
 * with an error only for cost parameters it rejects or a memory limit it
 * exceeds, and {@link SCRYPT_COST} and {@link KEY_BYTES} are module
 * constants — no value a CALLER supplies (`code`, `salt`) can make it fail,
 * since `scrypt` accepts a password of any length and a salt of any length.
 * Mocking `node:crypto` to force it would be mocking to prove a mock. (3) A
 * branch-free settle (`resolve(error === null ? derived : ...)`) is the same
 * branch spelled differently.
 *
 * Revisit if `@types/node` gains a `scrypt.__promisify__` declaration: the
 * arm disappears entirely at that point, and so should this comment.
 *
 * @param code - The six digits, as generated or as typed.
 * @param salt - This row's salt.
 * @returns The {@link KEY_BYTES}-byte derived key.
 */
const deriveKey = (code: string, salt: Buffer): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scrypt(code, salt, KEY_BYTES, SCRYPT_COST, (error, derived) => {
      /* c8 ignore start -- see this function's own comment for the three things tried before excusing this arm */
      if (error !== null) {
        reject(error)
        return
      }
      /* c8 ignore stop */
      resolve(derived)
    })
  })

/**
 * The six digits, drawn from the CSPRNG.
 *
 * `crypto.randomInt` is what `SECURITY.md` requires and `Math.random` is what
 * it forbids: `Math.random` is a seeded, non-cryptographic generator whose
 * future output is recoverable from a handful of observed values, which for
 * a sign-in code means an attacker who requests two codes of their own can
 * predict everyone else's. A swap to `Math.random` passes every functional
 * test in this repository — the result is still six digits, still hashes,
 * still verifies — so `otpService.integration.test.ts` asserts on this
 * function's own source that `randomInt` is the source, the same structural
 * technique used for {@link codeMatches}'s constant-time comparison and for
 * the same reason: the property is invisible to behaviour.
 *
 * @returns Six decimal digits, zero-padded, uniformly distributed over all
 *   1,000,000 values (`randomInt` rejects modulo bias internally).
 */
const generateCode = (): string => String(randomInt(CODE_UPPER_BOUND)).padStart(CODE_DIGITS, '0')

/**
 * Whether `candidate` is the code `stored` was derived from.
 *
 * CONSTANT TIME IS THE POINT OF THIS FUNCTION. A byte-at-a-time `===` returns
 * as soon as two bytes differ, so the time it takes reports how many leading
 * bytes matched — repeated against a fixed hash that is a byte-by-byte oracle
 * for the answer. `timingSafeEqual` always reads both buffers to the end. The
 * `otpService.integration.test.ts` case "compares the stored hash with a
 * constant-time comparison, not with ===" reads this function's own source
 * and fails if the call is replaced; see the long comment above it for why
 * that assertion is structural rather than a timing measurement.
 *
 * `expected` is copied into a fixed-size buffer rather than length-checked:
 * every `codeHash` this module writes is exactly `SALT_HEX_LENGTH` hex
 * characters of salt followed by {@link KEY_BYTES} bytes of key, so a row of
 * any other shape is corrupt, and normalising the length makes such a row
 * simply fail to match instead of throwing out of `timingSafeEqual` — the
 * fail-closed outcome, reached without a branch no test could ever take.
 *
 * @param stored - The `codeHash` column: salt hex, then key hex.
 * @param candidate - The code to check.
 * @returns Whether the two derive to the same key.
 */
const codeMatches = async (stored: string, candidate: string): Promise<boolean> => {
  const salt = Buffer.from(stored.slice(0, SALT_HEX_LENGTH), 'hex')
  const expected = Buffer.alloc(KEY_BYTES)
  Buffer.from(stored.slice(SALT_HEX_LENGTH), 'hex').copy(expected)
  const derived = await deriveKey(candidate, salt)
  return timingSafeEqual(expected, derived)
}

/**
 * The Payload row id an account's branded {@link UserId} names.
 *
 * @param user - The branded id.
 * @returns The numeric row id, or `undefined` when `user` is not one. The
 *   brand only promises a non-empty string, so a caller *can* hand over
 *   something that is not a Payload id — and the alternative to answering
 *   `undefined` here is `Number('nonsense')` reaching the driver as `NaN` and
 *   escaping as a raw `Failed query: … params: NaN`, past the `Result`
 *   contract and into whatever surfaces it.
 */
const accountRowId = (user: UserId): number | undefined => {
  const parsed = Number(user)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined
}

/**
 * The branded account id a challenge row belongs to.
 *
 * @param rawId - The row's `user_id` column.
 * @returns The branded {@link UserId}.
 */
const accountOf = (rawId: number): UserId => {
  const branded = userId(String(rawId))
  /* c8 ignore start -- `userId` refuses only an empty or whitespace-only string and `String` of a number is neither, so this guard cannot fire. It was not merely assumed: the constructor was read, and the only input reaching it is `user_id`, a `NOT NULL integer` column. The guard exists because the constructor returns a Result that has to be unwrapped, not because a row can be nameless; revisit if `userId` ever rejects more than emptiness. */
  if (!isOk(branded)) throw new Error('an otpChallenges row has no account id')
  /* c8 ignore stop */
  return branded.value
}

/**
 * Builds the OTP service over an injected Payload, mailer and clock.
 *
 * @param dependencies - See {@link OtpServiceDependencies}.
 * @returns The service. A factory rather than module-level functions so
 *   nothing here holds mutable state between calls (CLAUDE.md §3.3 rejects
 *   singletons that do) and so the clock and the mailer are the caller's
 *   choice rather than this module's.
 * @example
 * const otp = createOtpService({ payload, mailer, now: Date.now })
 * const issued = await otp.issueChallenge(user, session, request.ip)
 */
export const createOtpService = ({ payload, mailer, now }: OtpServiceDependencies): OtpService => ({
  async issueChallenge(user, session, ip) {
    const issuedAt = now()

    const accountId = accountRowId(user)
    if (accountId === undefined) return err('unknown-account')

    const accounts = await payload.find({
      collection: 'users',
      where: { id: { equals: accountId } },
      limit: 1,
      depth: 0,
    })
    const account = accounts.docs[0]
    if (account === undefined) return err('unknown-account')

    // Derived BEFORE the lock is taken. ~30ms of scrypt inside a lock held
    // per account would serialise a burst into a queue rather than refusing
    // it, and would hold a database connection for the duration. The cost of
    // deriving a hash this call may then be refused for is real but bounded:
    // it is one derivation per request, and Task 4's per-account and per-IP
    // rate limiting is what bounds the number of requests.
    const code = generateCode()
    const salt = randomBytes(SALT_BYTES)
    const derived = await deriveKey(code, salt)

    const client = await payload.db.pool.connect()
    let refusal: ResendRefusal | undefined
    try {
      await client.query('BEGIN')
      try {
        // TRANSACTION-SCOPED, AND BOUNDED. Both halves are corrections to a
        // session-scoped `pg_advisory_lock`/`pg_advisory_unlock` pair, and
        // both are about what happens when something goes wrong rather than
        // when it goes right.
        //
        // `pg_advisory_xact_lock` is released by Postgres on COMMIT or
        // ROLLBACK, and on the connection dropping — by the server, not by a
        // statement we have to successfully send. A session-scoped lock is
        // only released by our own `pg_advisory_unlock`, so any path that
        // cannot run that statement leaves the lock held on a POOLED
        // connection, which outlives the request: every later issue for that
        // account then waits on a lock owned by a request three ago, and the
        // symptom is a hang with no visible cause.
        //
        // `lock_timeout` bounds the wait a request behind the lock will
        // accept. Unbounded, one stalled holder does not delay one request:
        // it holds a connection out of a pool of ten (see
        // `apps/web/payload.config.ts`) for as long as it lasts, and ten such
        // waits is the whole application stopped. A timeout turns that into a
        // failed request, which is recoverable. `SET LOCAL`, so the setting
        // reverts with this transaction rather than riding the pooled
        // connection into whatever runs next; interpolated rather than bound
        // because Postgres's `SET` takes no parameters, and the value is a
        // module constant, never caller input.
        //
        // A timeout surfaces as a thrown Postgres error rather than one of
        // the four `IssueFailure` refusals, deliberately: a reader can act on
        // 'cooldown', and there is nothing they can do about database
        // contention. Inventing a fifth refusal would put a message about our
        // infrastructure on the sign-in screen (CLAUDE.md §3.1 — exceptions
        // stay exceptional). See docs/adr/0015-otp-challenge-hashing.md.
        await client.query(`SET LOCAL lock_timeout = '${String(ISSUE_LOCK_TIMEOUT_MS)}ms'`)
        await client.query('SELECT pg_advisory_xact_lock($1, $2)', [ISSUE_LOCK_NAMESPACE, accountId])
        // One query answers both halves of the resend rule: how many codes
        // this account has already had in the rolling hour, and when the most
        // recent of them was sent. Inside the lock, because a count taken
        // outside it is a count of what the other racers had not committed
        // yet.
        const history = await client.query<IssueHistory>(
          `SELECT count(*)::int AS sent_this_hour, max(created_at) AS last_sent_at
             FROM otp_challenges
            WHERE user_id = $1 AND created_at > $2`,
          [accountId, new Date(issuedAt - RESEND_WINDOW_MS)],
        )
        // `count(*)`/`max()` with no GROUP BY always return exactly one row,
        // but `noUncheckedIndexedAccess` cannot know that. Folding over the
        // rows says the same thing as reading `rows[0]` without a defensive
        // `?.` whose empty arm no test can ever take - the same shape
        // `apps/web/lib/migrate.ts` uses for its own single-row count. The
        // `??` inside the fold is not that kind of arm: `max()` really is
        // NULL on an account's first code and a Date on every resend, and
        // both cases are exercised.
        const sentThisHour = history.rows.reduce((total, row) => total + row.sent_this_hour, 0)
        const lastSentAt = history.rows.reduce<Date | null>((latest, row) => row.last_sent_at ?? latest, null)
        const allowed = lastSentAt === null ? ok(undefined) : canResend(lastSentAt.getTime(), issuedAt, sentThisHour)

        if (allowed.ok) {
          // The row is written BEFORE the send, so a code that reaches a
          // reader always has a challenge behind it. A row whose send then
          // fails is dead weight that still counts against the resend cap —
          // failing closed on the mailbomb ceiling is the right side to err
          // on. `created_at` is written explicitly, from the same instant as
          // `expires_at`, so this module's `expiresAt === createdAt +
          // EXPIRY_MS` invariant is exact rather than approximately true.
          // ONE STATEMENT, TWO EFFECTS, and the second is what bounds the
          // table. The `DELETE` clears a batch of rows — from ANY account —
          // whose `created_at` is older than the rolling hour the count above
          // reads, oldest first; the `INSERT` then writes this challenge. A
          // data-modifying CTE cannot see another's rows, so the sweep can
          // never touch the row being written.
          //
          // THE FLOOR IS THE RESEND WINDOW, NOT THE CHALLENGE'S OWN LIFE, and
          // that is the whole reason this purge does not key on `expires_at`
          // the way two comments in this repository used to claim it did. A
          // challenge is unusable after EXPIRY_MS (five minutes) but is still
          // COUNTED by the hourly ceiling for RESEND_WINDOW_MS (one hour), so
          // `DELETE WHERE expires_at < now()` would delete rows the mailbomb
          // cap is still counting and hand a reader an unlimited supply of
          // codes fifty-five minutes early. Nothing reads a row older than the
          // window: not `challengeState`, not `verifyChallenge`, not
          // `pendingChallenge`, not this count.
          await client.query(
            `WITH aged AS (
               SELECT id FROM otp_challenges
                WHERE created_at <= $7
                ORDER BY id
                LIMIT $8
             ),
             swept AS (
               DELETE FROM otp_challenges WHERE id IN (SELECT id FROM aged)
             )
             INSERT INTO otp_challenges
               (user_id, code_hash, session_hash, expires_at, attempts, ip, created_at, updated_at)
             VALUES ($1, $2, $3, $4, 0, $5, $6, $6)`,
            [
              accountId,
              salt.toString('hex') + derived.toString('hex'),
              hashSession(session),
              new Date(issuedAt + EXPIRY_MS),
              ip,
              new Date(issuedAt),
              new Date(issuedAt - RESEND_WINDOW_MS),
              PRUNE_SWEEP_ROWS,
            ],
          )
        } else {
          refusal = allowed.error
        }
        await client.query('COMMIT')
      } catch (error) {
        // The lock is already released by the ROLLBACK itself; this is here
        // so the CONNECTION goes back to the pool without an open, aborted
        // transaction on it. The error is rethrown untouched - it is an
        // unexpected database failure, not one of the refusals a caller
        // handles.
        await client.query('ROLLBACK')
        throw error
      }
    } finally {
      client.release()
    }

    if (refusal !== undefined) return err(refusal)

    const delivery = await mailer.send({
      to: account.email,
      subject: 'Your travel diary sign-in code',
      // INVARIANT — THIS BODY CARRIES EXACTLY ONE RUN OF DIGITS, THE CODE.
      // The "never writes the code to the log" and "never returns the code"
      // assertions read the issued code back out of this body and then check
      // that those digits appear nowhere else. Add "expires in 5 minutes"
      // here and the outbox reader can pick up the wrong number, and the leak
      // detectors start passing or failing for reasons that have nothing to
      // do with a leak. "five minutes" is spelled out for that reason, not
      // for style. This copy is ours, not the handoff's — see
      // docs/deviations.md §26.
      text: `${code}\n\nThat code signs you in to the travel diary. It expires in five minutes.\nIf you did not ask for it, nothing has happened and you can ignore this.`,
    })
    if (!delivery.ok) return err('delivery-failed')

    return ok({ maskedTo: maskEmail(account.email) })
  },

  async verifyChallenge(session, code) {
    const checkedAt = now()
    const sessionHash = hashSession(session)
    // `created_at`, never the stored `expires_at` — see this module's header.
    // `challengeState` treats a challenge as valid while elapsed time is
    // strictly under EXPIRY_MS, so the floor below is strictly exclusive too.
    const expiryFloor = new Date(checkedAt - EXPIRY_MS)

    // THE CLAIM. One statement: find this session's newest challenge, and if
    // it is still claimable, spend an attempt on it and hand back what is
    // needed to check the code. `COALESCE` so a row whose counter was never
    // written reads as none spent rather than as NULL, which would make every
    // comparison against it neither true nor false and quietly render the row
    // unusable.
    const claim = await payload.db.pool.query<ClaimedAttempt>(
      `UPDATE otp_challenges
          SET attempts = COALESCE(attempts, 0) + 1, updated_at = now()
        WHERE id = (
                SELECT id FROM otp_challenges
                 WHERE session_hash = $1
                 ORDER BY created_at DESC
                 LIMIT 1
              )
          AND COALESCE(attempts, 0) < $2
          AND consumed_at IS NULL
          AND created_at > $3
      RETURNING id, user_id, code_hash`,
      [sessionHash, MAX_ATTEMPTS, expiryFloor],
    )
    const claimed = claim.rows[0]

    if (claimed === undefined) {
      // Nothing was claimable. Re-read the row to say WHY, rather than
      // reporting one refusal for four different situations.
      const refused = await payload.db.pool.query<RefusedChallenge>(
        `SELECT COALESCE(attempts, 0) AS attempts, consumed_at, created_at
           FROM otp_challenges
          WHERE session_hash = $1
          ORDER BY created_at DESC
          LIMIT 1`,
        [sessionHash],
      )
      const row = refused.rows[0]
      // No challenge for this session at all reads as `'invalid'`, the same
      // refusal a wrong code gets: a distinct error here would tell an
      // attacker which sessions currently hold a live challenge.
      if (row === undefined) return err('invalid')

      return err(
        REFUSAL_FOR_STATE[
          challengeState(
            {
              createdAt: row.created_at.getTime(),
              // `attempts` is a Postgres `numeric`, which the driver hands
              // back as a string to avoid silently rounding values wider than
              // a JS number.
              attempts: Number(row.attempts),
              consumedAt: row.consumed_at === null ? null : row.consumed_at.getTime(),
            },
            checkedAt,
          )
        ],
      )
    }

    if (!(await codeMatches(claimed.code_hash, code))) return err('invalid')

    // THE CONSUMPTION, claimed the same way the attempt was. Single use has to
    // survive the request that spent it — and, as of the concurrency fix, the
    // request racing it: two simultaneous correct codes both reach this line,
    // and `consumed_at IS NULL` is what decides which of them signs in.
    const consumed = await payload.db.pool.query<{ id: number }>(
      `UPDATE otp_challenges
          SET consumed_at = $2, updated_at = now()
        WHERE id = $1 AND consumed_at IS NULL
      RETURNING id`,
      [claimed.id, new Date(checkedAt)],
    )
    if (consumed.rows.length === 0) return err('consumed')

    return ok({ userId: accountOf(claimed.user_id) })
  },

  async pendingChallenge(session) {
    const readAt = now()

    // One row, one join, three columns and an address. The address is read
    // here and masked before it leaves; nothing above this module ever sees it
    // whole. `depth` does not apply - this is the pool, not the Local API.
    const found = await payload.db.pool.query<LiveChallenge>(
      `SELECT c.attempts, c.consumed_at, c.created_at, u.email
         FROM otp_challenges c
         JOIN users u ON u.id = c.user_id
        WHERE c.session_hash = $1
        ORDER BY c.created_at DESC
        LIMIT 1`,
      [hashSession(session)],
    )
    const row = found.rows[0]
    if (row === undefined) return null

    // The DOMAIN decides whether the challenge is still answerable, from
    // `created_at` and the counter - the same function `verifyChallenge`'s
    // re-read uses, so the screen and the endpoint cannot disagree about
    // whether a code is live. `expires_at` is a purge index and is not read
    // here either (this module's INVARIANT).
    const state = challengeState(
      {
        // `Number(null)` is 0, which is exactly what a row whose counter was
        // never written means - so there is no `?? 0` here and no branch for a
        // test to have to invent a NULL column to reach.
        attempts: Number(row.attempts),
        consumedAt: row.consumed_at === null ? null : row.consumed_at.getTime(),
        createdAt: row.created_at.getTime(),
      },
      readAt,
    )
    // A REDEEMED CHALLENGE IS THE ONE STATE THAT STAYS A PLACEHOLDER, and the
    // other two are described rather than hidden. Until Phase 2 Task 11's fix
    // round this read `state !== 'valid'`, so a reader who had spent all three
    // guesses — or waited out the five minutes — was shown the screen a
    // browser holding NOTHING gets: three bullets where the address they were
    // told to check had been, a counter back at zero, and (because the caller
    // substitutes the render instant for a missing `issuedAt`) a five-minute
    // expiry and a thirty-second resend cooldown that restarted on every
    // reload. Four faces of one decision, all found in a browser and none by
    // any test here (docs/qa/2026-09-07-sign-in-sweep.md, SIGNIN-001..004).
    //
    // Describing them leaks nothing. The oracle this module withholds is
    // whether a given browser holds a live challenge, and the only browser
    // that can reach this answer is the one presenting the identifier the
    // challenge was bound to — which is to say, the browser that was sent the
    // code and has just typed three wrong ones into it. It learns nothing it
    // did not supply. A CONSUMED challenge is different and stays `null`: the
    // browser that spent it was handed a session in the same request and no
    // longer presents this identifier, so there is no reader to inform.
    if (state === 'consumed') return null

    return {
      maskedTo: maskEmail(row.email),
      issuedAt: row.created_at.getTime(),
      attemptsSpent: Number(row.attempts),
      attemptsAllowed: MAX_ATTEMPTS,
    }
  },

  async challengeAccount(session) {
    const readAt = now()

    const found = await payload.db.pool.query<OwnedChallenge>(
      `SELECT user_id, attempts, consumed_at, created_at
         FROM otp_challenges
        WHERE session_hash = $1
        ORDER BY created_at DESC
        LIMIT 1`,
      [hashSession(session)],
    )
    const row = found.rows[0]
    if (row === undefined) return null

    const state = challengeState(
      {
        // `Number(null)` is 0, which is exactly what a row whose counter was
        // never written means - so there is no `?? 0` here and no branch for a
        // test to have to invent a NULL column to reach.
        attempts: Number(row.attempts),
        consumedAt: row.consumed_at === null ? null : row.consumed_at.getTime(),
        createdAt: row.created_at.getTime(),
      },
      readAt,
    )
    // A CONSUMED OR EXHAUSTED CHALLENGE NAMES NOBODY. The account is returned
    // for one purpose - spending the code endpoint's per-account window - and
    // a challenge that can no longer be answered has no guess left to meter.
    return state === 'valid' ? accountOf(row.user_id) : null
  },

  async resendChallenge(session, ip) {
    // WHATEVER STATE THE CHALLENGE IS IN, which is the difference between
    // "invalidate it and force a resend" (`SECURITY.md` §3) and a dead end.
    // This resolved the account through `challengeAccount` until Phase 2 Task
    // 11's fix round — and that method answers `null` for anything that is not
    // `'valid'`, correctly, because its one job is metering a guess that can
    // still be made. So the instant a reader spent their third guess, the only
    // way forward stopped working: "Send a new code" mailed nothing and said
    // nothing (SIGNIN-004). The two questions are different and now have
    // different reads.
    //
    // It is still bounded, and by the same three things it always was: the
    // caller must present an identifier a challenge was actually issued to,
    // the thirty-second cooldown and the hourly ceiling below both apply, and
    // nothing here names an account the request supplied.
    const found = await payload.db.pool.query<{ user_id: number }>(
      `SELECT user_id
         FROM otp_challenges
        WHERE session_hash = $1
        ORDER BY created_at DESC
        LIMIT 1`,
      [hashSession(session)],
    )
    const row = found.rows[0]
    // ONE REFUSAL FOR "NO CHALLENGE AT ALL", and it is the same word a resend
    // for a deleted account gets: a reader who has never been sent a code has
    // nothing to resend, and saying which of the two it was would tell an
    // unauthenticated caller whether this browser holds one.
    if (row === undefined) return err('unknown-account')
    const account = accountOf(row.user_id)

    // The cooldown, the hourly ceiling and the delivery are `issueChallenge`'s,
    // unchanged: a resend is an issue for an account this module resolved
    // rather than one a caller named.
    return this.issueChallenge(account, session, ip)
  },
})
