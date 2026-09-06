/**
 * logSafety.integration.test.ts — the one SECURITY.md-adjacent promise that is
 * made by every module on the sign-in surface and owned by none of them:
 * nothing this surface hands to a log carries a secret, a code, a token or a
 * whole email address (CLAUDE.md §7).
 *
 * Integration test (CLAUDE.md §2), against a real Payload, a real Postgres and
 * the real mailer, because the claim is about a WHOLE JOURNEY rather than a
 * function. Each service already asserts its own call site — `otpService`'s
 * suite checks that the mailer's terminal line carries no code, `signIn`'s
 * that the credential-store report names neither address nor password. What
 * neither can see is the union: a code issued by one module and printed by
 * another, a reset token minted by Payload and echoed by a third, a session
 * identifier written out by whatever logs last. This file drives the surface
 * end to end and reads every sink at once.
 *
 * ═══ THE TWO SINKS, AND WHY THEY ARE THE WHOLE SET ═══
 *
 * 1. `payload.logger` — Payload's own pino instance, which this repository's
 *    server code logs through and which Payload itself logs through. All six
 *    of its levels are recorded here, not just `error`: a leak does not care
 *    what severity it was filed under.
 * 2. The mailer's terminal line. `console-mailer.ts` pushes the same string to
 *    `logLines` and to the terminal, so reading `logLines` reads what was
 *    printed.
 *
 * THERE IS NO THIRD, AND THAT IS ENFORCED RATHER THAN ASSUMED:
 * `eslint.config.js` sets `no-console: 'error'` repository-wide with exactly
 * one path-scoped exception, `apps/web/lib/adapters/console-mailer.ts` — the
 * sink above. A module that started writing to the terminal on its own would
 * fail `npm run lint`, which is inside `npm run verify` and therefore inside
 * the pre-commit hook. That is also why this file does not patch `console`:
 * doing so would need the very override whose absence is the guarantee.
 *
 * ═══ THE CAPTURE IS PROVED LIVE BEFORE IT IS BELIEVED ═══
 *
 * "The log contains no code" is trivially true of a log nothing wrote, and
 * this phase has found fifteen tests passing with their mechanism deleted. So
 * the transcript is only ever read through {@link theLogTheSurfaceWrote},
 * which refuses to hand it over unless BOTH sinks are in it — the mailer's
 * masked line and the credential-store report. Delete the drive, break a spy
 * or reorder `beforeAll`, and every case in this file fails at once rather
 * than passing vacuously.
 *
 * ═══ THE FIXTURES ARE DIGIT-FREE ON PURPOSE ═══
 *
 * The code assertions say "no six-digit run appears here at all", which is
 * only a statement about the CODE if nothing else in the transcript could
 * contribute six digits. The fixture domain, the local parts and the labels
 * are therefore letters only — the same load-bearing property, for the same
 * reason, as `otpService.integration.test.ts`'s.
 *
 * PATTERNS (CLAUDE.md §3.3): Factory for every fixture, with no shared mutable
 * account or address; the recording of the logger is a spy on an injected
 * collaborator's sink, not a mock of anything this repository owns.
 *
 * Uses `getTestPayload()`, not `getPayload()` directly, so this file connects
 * to the isolated `diary_test` database rather than a developer's own.
 * Depends on: vitest, node:crypto, ./signIn, ./otpService, ./sessions,
 * ./passwordReset, ./rateLimit, ./testing/otpProbes,
 * ../adapters/console-mailer, ../testPayload, `@travel-diary/domain`.
 */
import { createHash, randomBytes } from 'node:crypto'
import { type SessionId, sessionId, userId } from '@travel-diary/domain/ids'
import { isOk } from '@travel-diary/domain/result'
import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createConsoleMailer } from '../adapters/console-mailer'
import { getTestPayload } from '../testPayload'
import { createOtpService } from './otpService'
import { createPasswordResetService } from './passwordReset'
import { createSignInRateLimiter } from './rateLimit'
import { createSessionService } from './sessions'
import { createSignInService } from './signIn'
import { readCodeFromOutbox, scatteredCodePattern } from './testing/otpProbes'

/**
 * Every fixture address this file creates belongs to this domain, and it
 * carries no digit. See the module header for why that is load-bearing.
 */
const FIXTURE_EMAIL_DOMAIN = 'log-safety-fixture.example'

/**
 * The requesting addresses this file spends windows from — RFC 2544's
 * benchmarking block, reserved and never routed.
 *
 * A FOURTH BLOCK, DISJOINT FROM THE OTHER THREE, because `afterAll` deletes
 * `sign_in_attempts` rows by address prefix: `signIn`'s suite has TEST-NET-1
 * (`192.0.2.`), `rateLimit`'s TEST-NET-2 (`198.51.100.`) and
 * `passwordReset`'s TEST-NET-3 (`203.0.113.`). Two suites sharing a prefix
 * delete each other's rows, which is how Task 5 review round 1 found this.
 */
const FIXTURE_IP_PREFIX = '198.18.0.'

/** How many host addresses a `/24` block actually has. */
const USABLE_HOSTS_IN_A_SLASH_24 = 254

/** The password the fixture account is created with. */
const CORRECT_PASSWORD = 'the-one-this-account-was-created-with'

/** What the drive offers instead, to reach the wrong-password branch. */
const WRONG_PASSWORD = 'not-the-one-this-account-was-created-with'

/** The origin the reset service is told to build links against. */
const ADMIN_ORIGIN = 'https://diary.example'

/** The wrong guess the drive spends against the challenge before the right one. */
const A_WRONG_GUESS = 'aaabbb'

/** Every level Payload's logger exposes. A leak is a leak at any of them. */
const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const

/** How many leading characters of a token a truncated log line would print. */
const A_TRUNCATED_PREFIX = 8

/**
 * The one line `signIn.ts` writes when the credential store cannot answer.
 *
 * Repeated here rather than imported, and deliberately: the constant is not
 * exported, and a test that imported it would still pass on the day the string
 * became empty — which is the shape of pinned-against-itself assertion this
 * phase has found four times. The two subjects below are re-typed for the same
 * reason.
 */
const CREDENTIAL_STORE_REPORT = 'sign-in could not be decided: the credential store did not answer'

/**
 * The subject the mailer prints for the one-time code, and the one it prints
 * for the reset link.
 *
 * BOTH ARE REQUIRED, SEPARATELY, and that is finding 8 of this task's review.
 * The guard used to ask only whether the fixture domain appeared anywhere in
 * the transcript — which the RESET line satisfies on its own. So a regression
 * that silenced the OTP mail's line specifically would have left the guard
 * green and "never writes the one-time code" asserting a negative over a
 * transcript that no longer contained the sink the code travels through. A
 * vacuous case, produced by the very guard written to prevent vacuous cases.
 */
const OTP_MAIL_SUBJECT = 'Your travel diary sign-in code'
const RESET_MAIL_SUBJECT = 'A way back in to your travel diary'

/** Distinguishes one fixture from the next within a single run. */
let fixtureCount = 0

/** Counts requesting addresses separately, so accounts cannot exhaust the /24. */
let fixtureIpCount = 0

/** Every `sign_in_attempts.subject` this file's addresses hashed to. */
const fixtureAddressKeys: string[] = []

/**
 * The `subject` the password endpoint counts a sign-in address under.
 * @param address - The normalised sign-in address.
 * @returns 64 hex characters.
 */
const addressKey = (address: string): string => createHash('sha256').update(address).digest('hex')

/**
 * A digit-free label, derived from a counter.
 * @param count - The fixture's ordinal within this run.
 * @returns Two lowercase letters, unique for the first 676 fixtures.
 */
const alphabeticLabel = (count: number): string =>
  String.fromCharCode(97 + Math.floor(count / 26)) + String.fromCharCode(97 + (count % 26))

/**
 * A requesting address no other case in this run is using.
 * @returns An address from this file's own block, unique within this run.
 * @throws If this file outgrows its block — loud rather than silently reusing
 *   an address and spending another case's budget.
 */
const anIp = (): string => {
  fixtureIpCount += 1
  if (fixtureIpCount > USABLE_HOSTS_IN_A_SLASH_24) {
    throw new Error('this suite has outgrown its address block')
  }
  return `${FIXTURE_IP_PREFIX}${String(fixtureIpCount)}`
}

/** Everything one journey produced that must never appear in a log. */
interface DrivenSecrets {
  /** The account's whole address. */
  readonly email: string
  /** Its local part alone — the identifying half of it. */
  readonly localPart: string
  /** The six digits the mailer delivered. */
  readonly code: string
  /** The reset token Payload minted, read out of the delivered link. */
  readonly resetToken: string
  /** The identifier the completed session is held by. */
  readonly session: SessionId
  /** The pre-auth identifier the challenge was bound to. */
  readonly preAuthSession: SessionId
}

/** The shared test Payload instance, assigned by `beforeAll`. */
let payload: Payload

/** What the two sinks recorded while the drive ran. */
let transcript = ''

/** The secrets the drive produced. */
let secrets: DrivenSecrets

/**
 * A `Payload` whose `login` rejects the way a database outage does.
 *
 * A proxy rather than a spread, for the reason `signIn.integration.test.ts`
 * gives: spreading a class instance drops its prototype, and hand-building one
 * means writing forty members to change one. Everything else — the pool, and
 * the logger this file is recording — is the real instance.
 * @returns The stand-in.
 */
const aPayloadWhoseCredentialStoreIsDown = (): Payload =>
  new Proxy(payload, {
    get: (target, property, receiver): unknown =>
      property === 'login'
        ? () => Promise.reject(new Error('the connection to the database was terminated unexpectedly'))
        : Reflect.get(target, property, receiver),
  })

/**
 * The transcript, refused unless both sinks are demonstrably in it.
 *
 * THE GUARD IS THE POINT. Every assertion in this file is a negative, and a
 * negative holds trivially over an empty string. Reading the transcript only
 * through here means a drive that silently stopped producing log output fails
 * every case rather than passing all of them.
 * @returns Everything both sinks recorded, as one string.
 * @throws If either sink is missing from it. The message names the missing
 *   sink and never echoes what it searched.
 */
const theLogTheSurfaceWrote = (): string => {
  if (!transcript.includes(OTP_MAIL_SUBJECT)) throw new Error('the one-time code’s mail line was not captured')
  if (!transcript.includes(RESET_MAIL_SUBJECT)) throw new Error('the reset link’s mail line was not captured')
  if (!transcript.includes(CREDENTIAL_STORE_REPORT)) throw new Error('the operator report was not captured')
  return transcript
}

/** Deletes every row this file wrote, in an order the foreign keys allow. */
const removeFixtures = async (): Promise<void> => {
  await payload.db.pool.query(`DELETE FROM sign_in_attempts WHERE subject LIKE $1 OR subject = ANY($2)`, [
    `${FIXTURE_IP_PREFIX}%`,
    fixtureAddressKeys,
  ])
  const accounts = await payload.find({
    collection: 'users',
    where: { email: { like: FIXTURE_EMAIL_DOMAIN } },
    limit: 500,
    depth: 0,
  })
  for (const account of accounts.docs) {
    // Challenges and sessions first: both columns are `NOT NULL` and Payload's
    // own delete tries to null them out rather than cascade, so the account
    // delete below fails on the constraint if either row survives it.
    await payload.db.pool.query(`DELETE FROM otp_challenges WHERE user_id = $1`, [account.id])
    await payload.db.pool.query(`DELETE FROM sessions WHERE user_id = $1`, [account.id])
    await payload.delete({ collection: 'users', id: account.id })
  }
}

/**
 * Signs in, takes the second factor, holds and revokes a session, asks for a
 * reset link and survives a credential-store outage — with both sinks
 * recording throughout.
 *
 * ONE DRIVE SHARED BY EVERY CASE, deliberately: the claim under test is about
 * the union of what a whole journey wrote, and six separate journeys would
 * each be asserted against their own smaller union. The transcript it produces
 * is read only through {@link theLogTheSurfaceWrote}.
 * @returns Everything the journey produced that must never be logged.
 * @throws If any step of the journey refuses — a drive that half-ran would
 *   leave a shorter transcript that the negatives below would still pass over.
 */
const driveTheWholeSurface = async (): Promise<DrivenSecrets> => {
  const mailer = createConsoleMailer({ isDevelopment: false })
  const limiter = createSignInRateLimiter({ payload })
  const sessions = createSessionService({ payload, now: Date.now })
  const otp = createOtpService({ payload, mailer, now: Date.now })
  const signIn = createSignInService({ payload, otp, sessions, limiter, now: Date.now })
  const reset = createPasswordResetService({ payload, mailer, limiter, adminOrigin: ADMIN_ORIGIN })

  fixtureCount += 1
  const localPart = `reader-${alphabeticLabel(fixtureCount)}`
  const email = `${localPart}@${FIXTURE_EMAIL_DOMAIN}`
  fixtureAddressKeys.push(addressKey(email))

  fixtureCount += 1
  const unknownEmail = `nobody-${alphabeticLabel(fixtureCount)}@${FIXTURE_EMAIL_DOMAIN}`
  fixtureAddressKeys.push(addressKey(unknownEmail))

  // THE SHAPE `browserSession.ts` ACTUALLY MINTS — 32 CSPRNG bytes, base64url
  // — rather than a readable label. Two reasons, and the second is this
  // phase's most expensive lesson. A truncation check over `pre-auth-ab` is
  // asking whether the log contains the fixed string `pre-auth`, which is not
  // a secret and tells nobody anything; over a real identifier it is the
  // assertion it claims to be. And a fixture that does not look like what
  // production produces is how the two blockers of this phase were missed.
  const brandedSession = sessionId(randomBytes(32).toString('base64url'))
  if (!isOk(brandedSession)) throw new Error('the fixture session id is empty')
  const preAuthSession = brandedSession.value

  const created = await payload.create({
    collection: 'users',
    data: { email, password: CORRECT_PASSWORD, otpRequired: true },
  })
  const brandedUser = userId(String(created.id))
  if (!isOk(brandedUser)) throw new Error('the fixture account has no id')

  const aRequest = (
    address: string,
    password: string,
  ): Parameters<ReturnType<typeof createSignInService>['signIn']>[0] => ({
    email: address,
    password,
    browserSession: preAuthSession,
    keepSignedIn: false,
    ip: anIp(),
    device: null,
    location: null,
  })

  const recorded: string[] = []
  const spies = LOG_LEVELS.map((level) =>
    vi.spyOn(payload.logger, level).mockImplementation((...parts: readonly unknown[]): void => {
      recorded.push(JSON.stringify(parts))
    }),
  )

  try {
    // An address that names nothing, then one that does with the wrong
    // password: the two refusals the surface must not tell apart, and two
    // chances to name an address in a log.
    await signIn.signIn(aRequest(unknownEmail, WRONG_PASSWORD))
    await signIn.signIn(aRequest(email, WRONG_PASSWORD))

    // The correct password, which issues and mails a code.
    await signIn.signIn(aRequest(email, CORRECT_PASSWORD))
    const code = readCodeFromOutbox(mailer)

    // A wrong guess, then the right one — both evaluated server-side.
    await otp.verifyChallenge(preAuthSession, A_WRONG_GUESS)
    const verified = await otp.verifyChallenge(preAuthSession, code)
    if (!isOk(verified)) throw new Error('the drive could not spend its own code')

    const issued = await sessions.startSession({
      user: verified.value.userId,
      previous: preAuthSession,
      keepSignedIn: false,
      device: null,
      location: null,
    })
    if (!isOk(issued)) throw new Error('the drive could not start a session')
    await sessions.authenticate(issued.value.session)
    await sessions.revokeSession({ session: issued.value.session, owner: verified.value.userId })

    // A reset link for the same account, which mints a token Payload owns.
    await reset.requestPasswordReset({ email, ip: anIp() })
    const delivered = mailer.sent.at(-1)
    if (delivered === undefined) throw new Error('the drive sent no reset link')
    const minted = /\/admin\/reset\/([0-9a-f]+)\b/u.exec(delivered.text)?.[1]
    if (minted === undefined) throw new Error('the drive’s reset message carries no link')

    // The one branch that writes to `payload.logger` at all, which is what
    // makes the recording above demonstrably live.
    await createSignInService({
      payload: aPayloadWhoseCredentialStoreIsDown(),
      otp,
      sessions,
      limiter,
      now: Date.now,
    }).signIn(aRequest(email, CORRECT_PASSWORD))

    return { email, localPart, code, resetToken: minted, session: issued.value.session, preAuthSession }
  } finally {
    for (const spy of spies) spy.mockRestore()
    transcript = [...recorded, ...mailer.logLines].join('\n')
  }
}

beforeAll(async () => {
  payload = await getTestPayload()
  await removeFixtures()
  secrets = await driveTheWholeSurface()
})

afterAll(async () => {
  await removeFixtures()
})

describe('what a whole sign-in journey writes to a log', () => {
  it('writes every line the negatives below are about, so none of them is vacuous', () => {
    // The guard made explicit. The five cases after this one read the
    // transcript through the same check, so a drive that stopped logging fails
    // all six rather than passing five — and each MESSAGE is named separately,
    // because a transcript that lost only the OTP line would still carry the
    // fixture domain and would still have satisfied the single check this
    // replaced.
    expect(transcript).toContain(OTP_MAIL_SUBJECT)
    expect(transcript).toContain(RESET_MAIL_SUBJECT)
    expect(transcript).toContain(CREDENTIAL_STORE_REPORT)
  })

  it('never writes the account’s address, in whole or by its local part', () => {
    const log = theLogTheSurfaceWrote()

    expect(log).not.toContain(secrets.email)
    // The local part alone is the identifying half: the mailer prints one
    // character of it, so a line carrying the whole thing has leaked the
    // address whether or not the `@` came with it.
    expect(log).not.toContain(secrets.localPart)
  })

  it('never writes the one-time code', () => {
    const log = theLogTheSurfaceWrote()

    expect(log).not.toContain(secrets.code)
    // Three strengths, for the reason `otpService.integration.test.ts` gives:
    // a line printing the code spaced or hyphenated has leaked all of it while
    // matching no six-digit run, and the fixtures are digit-free so any six
    // digits at all would be a finding.
    expect(log).not.toMatch(scatteredCodePattern(secrets.code))
    expect(log).not.toMatch(/\d{6}/)
  })

  it('never writes the reset token, in whole or truncated', () => {
    const log = theLogTheSurfaceWrote()

    expect(log).not.toContain(secrets.resetToken)
    // A line printing the first characters of a token has narrowed it from 40
    // hex characters to 32, which a `toContain` on the whole value misses.
    expect(log).not.toContain(secrets.resetToken.slice(0, A_TRUNCATED_PREFIX))
  })

  it('never writes a session identifier, in whole or truncated', () => {
    const log = theLogTheSurfaceWrote()

    expect(log).not.toContain(secrets.session)
    expect(log).not.toContain(secrets.session.slice(0, A_TRUNCATED_PREFIX))
    // The pre-auth identifier is a secret too: the challenge is bound to it,
    // so a log carrying it hands over the half of the second factor that is
    // not the code. Truncated as well as whole — the case is named "in whole
    // or truncated" and covered two of its three values until this task's
    // review said so.
    expect(log).not.toContain(secrets.preAuthSession)
    expect(log).not.toContain(secrets.preAuthSession.slice(0, A_TRUNCATED_PREFIX))
  })

  it('never writes a password', () => {
    const log = theLogTheSurfaceWrote()

    expect(log).not.toContain(CORRECT_PASSWORD)
    expect(log).not.toContain(WRONG_PASSWORD)
  })
})
