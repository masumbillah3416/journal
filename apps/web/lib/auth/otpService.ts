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
 * INVARIANT — `expiresAt` IS A PURGE INDEX AND IS NEVER READ TO DECIDE
 * VALIDITY. It is written as `createdAt + EXPIRY_MS` so a purge can be one
 * indexed `DELETE WHERE expires_at < now()`. Authorization asks
 * `challengeState` instead, which derives expiry from `createdAt` and the
 * domain's {@link EXPIRY_MS}. Two sources of truth for one fact (CLAUDE.md
 * §7) would make `EXPIRY_MS` decorative and would let a bad write to
 * `expiresAt` silently extend a challenge's life. Relied upon at
 * {@link createOtpService}'s `verifyChallenge`, which selects `createdAt` and
 * never `expiresAt`; pinned by the "decides expiry from createdAt" test,
 * which moves the stored column a year into the future and still expects the
 * challenge to be expired.
 *
 * INVARIANT — NOTHING HERE EVER LOGS, RETURNS OR THROWS THE CODE. The code
 * exists in exactly two places: the local `code` binding in
 * `issueChallenge`, and the body of the message handed to the mailer. It is
 * never interpolated into an error, a log line or a returned value
 * (CLAUDE.md §7).
 *
 * Depends on: `payload` (the Local API instance, injected), the Mailer port,
 * `node:crypto`, and `@travel-diary/domain`'s `challengeState`, `canResend`,
 * `EXPIRY_MS`, `maskEmail`, the branded ids and `Result`.
 */
import { createHash, randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto'
import {
  EXPIRY_MS,
  type ResendRefusal,
  canResend,
  challengeState,
} from '@travel-diary/domain/auth/otpChallenge'
import { maskEmail } from '@travel-diary/domain/auth/mask'
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
   *   and never the full address — or `err` naming the refusal.
   */
  issueChallenge(user: UserId, session: SessionId, ip: string): Promise<Result<{ maskedTo: string }, IssueFailure>>

  /**
   * Checks `code` against the challenge bound to `session`, consuming it on
   * success and spending one attempt on failure.
   *
   * @param session - The session the code must have been issued for.
   * @param code - The six digits the reader typed.
   * @returns `ok` with the account the challenge belongs to, or `err` naming
   *   why the code was refused. `'invalid'` covers both a wrong code and a
   *   session with no challenge at all, deliberately: distinguishing them
   *   would tell an attacker which sessions have a live challenge.
   */
  verifyChallenge(session: SessionId, code: string): Promise<Result<{ userId: UserId }, VerifyFailure>>
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
 * @param code - The six digits, as typed or as generated.
 * @param salt - This row's salt.
 * @returns The {@link KEY_BYTES}-byte derived key.
 */
const deriveKey = (code: string, salt: Buffer): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scrypt(code, salt, KEY_BYTES, SCRYPT_COST, (error, derived) => {
      if (error === null) {
        resolve(derived)
        return
      }
      /* c8 ignore next -- scrypt reports an error only for invalid cost parameters or a memory limit, and the parameters here are module constants; reaching this would mean changing SCRYPT_COST, not exercising a path a caller can take */
      reject(error)
    })
  })

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
 * The branded account id a challenge row belongs to.
 *
 * @param owner - The row's `user` relationship value.
 * @returns The branded {@link UserId}.
 */
const accountOf = (owner: number | { id: number }): UserId => {
  /* c8 ignore next -- every query in this module sets `depth: 0`, so Payload returns the relationship's id and never the populated row; this narrowing satisfies the generated type rather than handling a case that can occur */
  const rawId = typeof owner === 'number' ? owner : owner.id
  const branded = userId(String(rawId))
  /* c8 ignore next 2 -- `userId` refuses only an empty or whitespace-only string, and `String` of a number is neither; the guard exists because the constructor returns a Result, not because this row can be nameless */
  if (!isOk(branded)) throw new Error('an otpChallenges row has no account id')
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

    const accounts = await payload.find({
      collection: 'users',
      where: { id: { equals: Number(user) } },
      limit: 1,
      depth: 0,
    })
    const account = accounts.docs[0]
    if (account === undefined) return err('unknown-account')

    // One query answers both halves of the resend rule: `totalDocs` is how
    // many codes this account has already had in the rolling hour, and the
    // single returned row is the most recent of them.
    const history = await payload.find({
      collection: 'otpChallenges',
      where: {
        user: { equals: Number(user) },
        createdAt: { greater_than: new Date(issuedAt - RESEND_WINDOW_MS).toISOString() },
      },
      sort: '-createdAt',
      limit: 1,
      depth: 0,
    })
    const mostRecent = history.docs[0]
    if (mostRecent !== undefined) {
      const allowed = canResend(Date.parse(mostRecent.createdAt), issuedAt, history.totalDocs)
      if (!allowed.ok) return err(allowed.error)
    }

    // `randomInt` is the CSPRNG SECURITY.md requires. `Math.random` is
    // seeded, predictable, and would make every code guessable from a
    // handful of observed ones.
    const code = String(randomInt(CODE_UPPER_BOUND)).padStart(CODE_DIGITS, '0')
    const salt = randomBytes(SALT_BYTES)
    const derived = await deriveKey(code, salt)

    // The row is written BEFORE the send, so a code that reaches a reader
    // always has a challenge behind it. A row whose send then fails is dead
    // weight that still counts against the resend cap — failing closed on
    // the mailbomb ceiling is the right side to err on.
    await payload.create({
      collection: 'otpChallenges',
      data: {
        user: Number(user),
        codeHash: salt.toString('hex') + derived.toString('hex'),
        sessionHash: hashSession(session),
        // Written from the same instant as `createdAt` so the invariant in
        // this module's header — `expiresAt === createdAt + EXPIRY_MS` — is
        // exact rather than approximately true.
        createdAt: new Date(issuedAt).toISOString(),
        expiresAt: new Date(issuedAt + EXPIRY_MS).toISOString(),
        attempts: 0,
        ip,
      },
      depth: 0,
    })

    const delivery = await mailer.send({
      to: account.email,
      subject: 'Your travel diary sign-in code',
      text: `${code}\n\nThat code signs you in to the travel diary. It expires in five minutes.\nIf you did not ask for it, nothing has happened and you can ignore this.`,
    })
    if (!delivery.ok) return err('delivery-failed')

    return ok({ maskedTo: maskEmail(account.email) })
  },

  async verifyChallenge(session, code) {
    const checkedAt = now()

    const found = await payload.find({
      collection: 'otpChallenges',
      where: { sessionHash: { equals: hashSession(session) } },
      sort: '-createdAt',
      limit: 1,
      depth: 0,
    })
    const challenge = found.docs[0]
    // No challenge for this session reads as `'invalid'`, the same refusal a
    // wrong code gets: a distinct error here would tell an attacker which
    // sessions currently hold a live challenge.
    if (challenge === undefined) return err('invalid')

    const consumedAt = challenge.consumedAt ?? null
    // Read once, used twice: `attempts` is declared with `defaultValue: 0`,
    // so the nullish fallback is for the generated type rather than for a row
    // this module can produce, and repeating it would repeat an arm no test
    // can reach.
    const spentAttempts = challenge.attempts ?? 0
    const state = challengeState(
      {
        // `createdAt`, never the stored `expiresAt` — see this module's header.
        createdAt: Date.parse(challenge.createdAt),
        attempts: spentAttempts,
        consumedAt: consumedAt === null ? null : Date.parse(consumedAt),
      },
      checkedAt,
    )
    if (state !== 'valid') return err(state)

    if (!(await codeMatches(challenge.codeHash, code))) {
      await payload.update({
        collection: 'otpChallenges',
        id: challenge.id,
        data: { attempts: spentAttempts + 1 },
        depth: 0,
      })
      return err('invalid')
    }

    // Consumption is a write, not a flag held in memory: single use has to
    // survive the request that spent it, or a replayed code works twice.
    await payload.update({
      collection: 'otpChallenges',
      id: challenge.id,
      data: { consumedAt: new Date(checkedAt).toISOString() },
      depth: 0,
    })

    return ok({ userId: accountOf(challenge.user) })
  },
})
