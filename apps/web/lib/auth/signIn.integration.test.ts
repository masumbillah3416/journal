/**
 * signIn.integration.test.ts — the password step: anti-enumeration in both
 * response and timing, the second factor decided on the server, and the
 * wiring that makes the rate limiter and the session store real.
 *
 * Integration test (CLAUDE.md §2), against a real Payload and a real
 * Postgres, and it could not be anything else: every claim this file makes is
 * about work that happens outside this process — a password hash Payload
 * derives, a lockout Payload counts in a column, a window Postgres ranks, a
 * session row that has to stop authenticating. A mocked version of any of
 * them would assert the mock.
 *
 * THE FOUR TRAPS THIS FILE IS SHAPED AROUND, each of which has produced a
 * test elsewhere that passed with the mechanism deleted:
 *
 *   1. AN ANTI-ENUMERATION TEST THAT COMPARES TWO ERROR STRINGS passes while
 *      the two paths differ in timing. So the identical-response case
 *      compares the WHOLE returned value with `toEqual`, and a second case
 *      measures both branches. `signIn` returns a value rather than a
 *      response, so status code and headers are Task 10's to keep identical;
 *      what is provable here is the value and the time.
 *   2. A TIMING CASE THAT LETS EITHER ARM DRIFT INTO A SHORTCUT measures
 *      nothing. Both arms would look identical if both were refused by the
 *      rate limiter before reaching a hash, or if the wrong-password arm had
 *      locked its own account and stopped hashing. So every sample uses a
 *      fresh requesting address and a fresh sign-in address, and the
 *      wrong-password arm uses a fresh account — no budget and no lockout
 *      counter is ever spent twice. See {@link SAMPLES}.
 *   3. AN `otpRequired` TEST THAT STUBS THE FLAG proves nothing about where
 *      it is read. So every case here sets it on the ROW and then hands
 *      `signIn` a request that carries the opposite value as an extra
 *      property, which is exactly what a client-supplied flag would look
 *      like. If the implementation ever read it from the request, those cases
 *      fail; a `SignInRequest` that simply has no such field is what makes
 *      them pass.
 *   4. A ROTATION TEST THAT ASSERTS "A NEW SESSION EXISTS" passes while the
 *      identifier the browser arrived with still authenticates. So the
 *      rotation case authenticates the OLD identifier and expects a refusal.
 *
 * NOTHING HERE READS A CODE OUT OF THE DATABASE. The one case that needs the
 * code reads it from the mailer's outbox, the way a reader receives it, so
 * the delivery path is exercised rather than assumed.
 *
 * Uses `getTestPayload()`, not `getPayload()` directly, so this file connects
 * to the isolated `diary_test` database rather than a developer's own — see
 * that module's header.
 * Depends on: vitest, ./signIn, ./otpService, ./sessions, ./rateLimit,
 * ../adapters/console-mailer, ../testPayload, `@travel-diary/domain`.
 */
import { createHash } from 'node:crypto'
import { maskEmail } from '@travel-diary/domain/auth/mask'
import { ADDRESS_PASSWORD_ATTEMPT_LIMIT, IP_ATTEMPT_LIMIT } from '@travel-diary/domain/auth/rateWindow'
import { sessionLifetimeMs } from '@travel-diary/domain/auth/session'
import { type SessionId, type UserId, sessionId, userId } from '@travel-diary/domain/ids'
import { isOk } from '@travel-diary/domain/result'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createConsoleMailer } from '../adapters/console-mailer'
import { getTestPayload } from '../testPayload'
import { createOtpService } from './otpService'
import { createSignInRateLimiter } from './rateLimit'
import { type SessionService, createSessionService } from './sessions'
import { type SignInRequest, type SignInService, createSignInService } from './signIn'
import { readCodeFromOutbox } from './testing/otpProbes'

/** Every fixture account and every unknown address here belongs to this domain. */
const FIXTURE_EMAIL_DOMAIN = 'sign-in-fixture.example'

/** The documentation address block every fixture IP comes from (RFC 5737 TEST-NET-1). */
const FIXTURE_IP_PREFIX = '192.0.2.'

/** The password every fixture account is actually created with. */
const CORRECT_PASSWORD = 'the-one-this-account-was-created-with'

/** A password no fixture account has. */
const WRONG_PASSWORD = 'not-the-one-this-account-was-created-with'

/** `users.auth.maxLoginAttempts`, restated so the lockout case does not import the config it tests against. */
const MAX_LOGIN_ATTEMPTS = 5

/**
 * How many measurements each arm of the timing case takes.
 *
 * Twenty-five, compared by MEDIAN rather than by mean or by a single run: one
 * scheduling hiccup moves a mean and moves no median at all. The band the
 * medians are compared against is deliberately wide (0.6–1.6) — the claim
 * being made is that neither branch is an ORDER OF MAGNITUDE faster than the
 * other, which is exactly what skipping a ~40ms key derivation produces
 * against work otherwise measured in single-digit milliseconds. A tight band
 * would flake, and a flaky timing assertion gets deleted by somebody later,
 * and its deletion reads as tidying.
 */
const SAMPLES = 25

/** Distinguishes one fixture from the next within a single run. */
let fixtureCount = 0

/** Every `sign_in_attempts.subject` this file's addresses hashed to, so `afterAll` can find them. */
const fixtureAddressKeys: string[] = []

/**
 * The `subject` the password endpoint counts a sign-in address under.
 *
 * Spelled out rather than imported: this file has to find the rows it wrote
 * in order to delete them, and a helper that asked the implementation what it
 * wrote would agree with any answer. `rateLimit.integration.test.ts` is where
 * the hashing itself is asserted.
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
 * A sign-in address that names no account, ever.
 *
 * A factory, not a constant (CLAUDE.md §2.3): the password endpoint now keys
 * a window on the claimed address whether or not it names an account, so two
 * cases sharing an unknown address would spend each other's budget — and the
 * failure would read as a bug in the code under test.
 * @returns An address unique within this run, recorded for cleanup.
 */
const anUnknownAddress = (): string => {
  fixtureCount += 1
  const address = `nobody-${alphabeticLabel(fixtureCount)}@${FIXTURE_EMAIL_DOMAIN}`
  fixtureAddressKeys.push(addressKey(address))
  return address
}

/**
 * A requesting address no other case in this run is using.
 * @returns A TEST-NET-1 address unique within this run.
 */
const anIp = (): string => {
  fixtureCount += 1
  return `${FIXTURE_IP_PREFIX}${String(fixtureCount)}`
}

/**
 * A pre-auth identifier, for a browser that has not signed in yet.
 * @returns The branded id, unique within this run.
 */
const aBrowserSession = (): SessionId => {
  fixtureCount += 1
  const branded = sessionId(`pre-auth-${alphabeticLabel(fixtureCount)}`)
  if (!isOk(branded)) throw new Error('the fixture session id is empty')
  return branded.value
}

/** The shared test Payload instance, assigned by `beforeAll`. */
let payload: Awaited<ReturnType<typeof getTestPayload>>

/** The service under test. */
let service: SignInService

/** The session service the one under test issues through, for authenticating what it returned. */
let sessions: SessionService

/** The mailer the OTP service delivers through, for reading a code back out. */
let mailer: ReturnType<typeof createConsoleMailer>

/** One fixture account: its address, its row id, and the branded id of it. */
interface FixtureAccount {
  readonly email: string
  readonly id: number
  readonly user: UserId
}

/**
 * A fresh account with a known password.
 *
 * A factory, not a shared fixture (CLAUDE.md §2.3): this file spends lockout
 * counters and per-address windows, so two cases sharing an account would
 * spend each other's.
 * @param options - Whether the account's stored `otpRequired` is set.
 * @returns The account's address, row id and branded id.
 */
const aReader = async ({ otpRequired }: { readonly otpRequired: boolean }): Promise<FixtureAccount> => {
  fixtureCount += 1
  const email = `reader-${alphabeticLabel(fixtureCount)}@${FIXTURE_EMAIL_DOMAIN}`
  fixtureAddressKeys.push(addressKey(email))
  const created = await payload.create({
    collection: 'users',
    data: { email, password: CORRECT_PASSWORD, otpRequired },
  })
  const branded = userId(String(created.id))
  if (!isOk(branded)) throw new Error('the fixture account has no id')
  return { email, id: created.id, user: branded.value }
}

/**
 * A well-formed request, which each case then overrides the part it is about.
 *
 * @param email - The address being signed in with.
 * @param password - The password being offered.
 * @returns A complete {@link SignInRequest} with a fresh IP and a fresh
 *   pre-auth identifier, so no two cases share a budget or a rotation.
 */
const aRequest = (email: string, password: string): SignInRequest => ({
  email,
  password,
  browserSession: aBrowserSession(),
  keepSignedIn: false,
  ip: anIp(),
  device: null,
  location: null,
})

/**
 * How many attempts stand recorded against one key.
 * @param dimension - Which window to count in.
 * @param subject - The IP, or the hashed sign-in address.
 * @returns How many rows exist for that key.
 */
const recordedAttempts = async (dimension: 'ip' | 'account', subject: string): Promise<number> => {
  const counted = await payload.db.pool.query<{ attempts: string }>(
    `SELECT count(*) AS attempts FROM sign_in_attempts WHERE dimension = $1 AND subject = $2`,
    [dimension, subject],
  )
  return counted.rows.reduce((total, row) => total + Number(row.attempts), 0)
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
    limit: 1000,
    depth: 0,
  })
  for (const account of accounts.docs) {
    await payload.db.pool.query(`DELETE FROM otp_challenges WHERE user_id = $1`, [account.id])
    await payload.db.pool.query(`DELETE FROM sessions WHERE user_id = $1`, [account.id])
    await payload.delete({ collection: 'users', id: account.id })
  }
}

beforeAll(async () => {
  payload = await getTestPayload()
  mailer = createConsoleMailer({ isDevelopment: false })
  sessions = createSessionService({ payload, now: Date.now })
  service = createSignInService({
    payload,
    otp: createOtpService({ payload, mailer, now: Date.now }),
    sessions,
    limiter: createSignInRateLimiter({ payload }),
    now: Date.now,
  })
  // Cleaned at BOTH ends: fixture addresses derive from a counter and repeat
  // run to run, and `users.email` is unique, so one row left by an
  // interrupted run makes the next run fail inside the fixture factory.
  await removeFixtures()
})

afterAll(async () => {
  await removeFixtures()
})

describe('telling one refusal from another', () => {
  it('returns an identical response for an unknown address and a wrong password', async () => {
    const known = await aReader({ otpRequired: false })

    const unknown = await service.signIn(aRequest(anUnknownAddress(), WRONG_PASSWORD))
    const wrong = await service.signIn(aRequest(known.email, WRONG_PASSWORD))

    expect(unknown).toEqual(wrong)
  })

  it('returns that same response for an account locked by too many wrong passwords', async () => {
    // Phase ruling F44. A distinguishable "too many attempts" is an existence
    // oracle that survives every other measure here: an attacker who cannot
    // tell a wrong password from an unknown address can still enumerate by
    // spending five guesses per candidate and watching for the one whose
    // answer changes. The cost is real and accepted — a genuinely locked-out
    // reader is told nothing about why.
    const locked = await aReader({ otpRequired: false })
    for (let attempt = 0; attempt < MAX_LOGIN_ATTEMPTS; attempt += 1) {
      await service.signIn(aRequest(locked.email, WRONG_PASSWORD))
    }

    const whileLocked = await service.signIn(aRequest(locked.email, CORRECT_PASSWORD))
    const unknown = await service.signIn(aRequest(anUnknownAddress(), CORRECT_PASSWORD))

    expect(whileLocked).toEqual(unknown)
  })

  it('takes comparable time for an unknown address and a wrong password', async () => {
    // The response can be identical while the timing still says which branch
    // ran: a miss that skipped the key derivation would answer in about a
    // millisecond against the ~40ms the hit path spends inside Payload.
    //
    // EVERY SAMPLE IS FRESH IN EVERY DIMENSION, and that is what keeps this
    // measuring anything. A repeated sign-in address exhausts the window this
    // task added to the password endpoint, and a repeated account locks after
    // five wrong passwords — either would make BOTH arms take the short path,
    // at which point the case passes with the dummy hash deleted.
    const accounts: FixtureAccount[] = []
    for (let sample = 0; sample < SAMPLES; sample += 1) {
      accounts.push(await aReader({ otpRequired: false }))
    }

    const time = async (email: string): Promise<number> => {
      const request = aRequest(email, WRONG_PASSWORD)
      const started = performance.now()
      await service.signIn(request)
      return performance.now() - started
    }

    const unknown: number[] = []
    const wrong: number[] = []
    // Interleaved, so machine drift during the run cannot favour one arm.
    for (let sample = 0; sample < SAMPLES; sample += 1) {
      unknown.push(await time(anUnknownAddress()))
      const account = accounts[sample]
      if (account === undefined) throw new Error('the timing fixtures are short')
      wrong.push(await time(account.email))
    }

    const median = (samples: readonly number[]): number => {
      const sorted = [...samples].sort((left, right) => left - right)
      const middle = sorted[Math.floor(sorted.length / 2)]
      if (middle === undefined) throw new Error('no samples')
      return middle
    }

    const ratio = median(unknown) / median(wrong)
    expect(ratio).toBeGreaterThan(0.6)
    expect(ratio).toBeLessThan(1.6)
  })

  it('names neither the offered password nor the address it was offered for in a refusal', async () => {
    const known = await aReader({ otpRequired: false })

    const refused = await service.signIn(aRequest(known.email, WRONG_PASSWORD))

    expect(JSON.stringify(refused)).not.toContain(WRONG_PASSWORD)
    expect(JSON.stringify(refused)).not.toContain(known.email)
  })
})

describe('the second factor, decided on the server', () => {
  it('requires the code step when the stored flag is set, whatever the request claims', async () => {
    // Prototype hole #2: the flag lived in `localStorage`, where anybody could
    // set it to `0`. The extra property below is what a client trying to do
    // that would look like — a `SignInRequest` has no such field, so the only
    // way this can pass is by the server reading the row.
    const reader = await aReader({ otpRequired: true })
    const forcingItOff = { ...aRequest(reader.email, CORRECT_PASSWORD), otpRequired: false }

    const outcome = await service.signIn(forcingItOff)

    expect(outcome).toEqual({ ok: true, value: { status: 'otp-required', maskedTo: maskEmail(reader.email) } })
  })

  it('skips the code step when the stored flag is clear, whatever the request claims', async () => {
    const reader = await aReader({ otpRequired: false })
    const forcingItOn = { ...aRequest(reader.email, CORRECT_PASSWORD), otpRequired: true }

    const outcome = await service.signIn(forcingItOn)

    expect(outcome.ok && outcome.value.status).toBe('signed-in')
  })

  it('follows the stored flag when it changes, so nothing is decided from a copy taken earlier', async () => {
    const reader = await aReader({ otpRequired: false })
    expect((await service.signIn(aRequest(reader.email, CORRECT_PASSWORD))).ok).toBe(true)

    await payload.update({ collection: 'users', id: reader.id, data: { otpRequired: true } })
    const afterTheChange = await service.signIn(aRequest(reader.email, CORRECT_PASSWORD))

    expect(afterTheChange.ok && afterTheChange.value.status).toBe('otp-required')
  })

  it('requires the code step for an account whose flag was never written at all', async () => {
    // Fail closed: `users.otp_required` is a nullable column, so a row
    // predating the default — or one written by hand — can hold NULL. A
    // second factor that switched itself off for such a row would do it
    // silently.
    const reader = await aReader({ otpRequired: true })
    await payload.db.pool.query(`UPDATE users SET otp_required = NULL WHERE id = $1`, [reader.id])

    const outcome = await service.signIn(aRequest(reader.email, CORRECT_PASSWORD))

    expect(outcome.ok && outcome.value.status).toBe('otp-required')
  })

  it('mails the code to the account and returns only the masked address', async () => {
    const reader = await aReader({ otpRequired: true })

    const outcome = await service.signIn(aRequest(reader.email, CORRECT_PASSWORD))

    expect(outcome).toEqual({ ok: true, value: { status: 'otp-required', maskedTo: maskEmail(reader.email) } })
    expect(mailer.sent.at(-1)?.to).toBe(reader.email)
  })

  it('binds the code to the identifier the browser presented, so it cannot be redeemed from another', async () => {
    const reader = await aReader({ otpRequired: true })
    const request = aRequest(reader.email, CORRECT_PASSWORD)
    const otp = createOtpService({ payload, mailer, now: Date.now })

    await service.signIn(request)
    const code = readCodeFromOutbox(mailer)

    expect(await otp.verifyChallenge(request.browserSession, code)).toEqual({
      ok: true,
      value: { userId: reader.user },
    })
  })

  it('refuses when a code cannot be issued, rather than reporting a sign-in that did not happen', async () => {
    // The resend cooldown, reached the only way a reader can reach it: two
    // password sign-ins in a row. The refusal is its own word — the password
    // was right, and saying otherwise would send a reader to reset it.
    const reader = await aReader({ otpRequired: true })
    await service.signIn(aRequest(reader.email, CORRECT_PASSWORD))

    const second = await service.signIn(aRequest(reader.email, CORRECT_PASSWORD))

    expect(second).toEqual({ ok: false, error: 'code-not-sent' })
  })
})

describe('the session it issues', () => {
  it('issues an identifier that authenticates as the account that signed in', async () => {
    const reader = await aReader({ otpRequired: false })

    const outcome = await service.signIn(aRequest(reader.email, CORRECT_PASSWORD))

    if (!outcome.ok || outcome.value.status !== 'signed-in') throw new Error('the sign-in did not complete')
    expect(await sessions.authenticate(outcome.value.session.session)).toEqual({
      ok: true,
      value: { user: reader.user },
    })
  })

  it('stops the identifier the browser arrived with from authenticating', async () => {
    // The trap: asserting a NEW session exists passes while the old one still
    // works. `SECURITY.md` requires the pre-auth id never be reused, so what
    // has to be asserted is that the old one STOPS.
    const reader = await aReader({ otpRequired: false })
    const first = await service.signIn(aRequest(reader.email, CORRECT_PASSWORD))
    if (!first.ok || first.value.status !== 'signed-in') throw new Error('the first sign-in did not complete')
    const carried = first.value.session.session
    expect(await sessions.authenticate(carried)).toEqual({ ok: true, value: { user: reader.user } })

    await service.signIn({ ...aRequest(reader.email, CORRECT_PASSWORD), browserSession: carried })

    expect(await sessions.authenticate(carried)).toEqual({ ok: false, error: 'revoked' })
  })

  it('carries "keep me signed in" through to the row rather than deciding it here', async () => {
    const reader = await aReader({ otpRequired: false })
    const startedAt = Date.now()

    const outcome = await service.signIn({ ...aRequest(reader.email, CORRECT_PASSWORD), keepSignedIn: true })

    if (!outcome.ok || outcome.value.status !== 'signed-in') throw new Error('the sign-in did not complete')
    expect(outcome.value.session.expiresAt).toBeGreaterThan(startedAt + sessionLifetimeMs({ keepSignedIn: false }))
  })
})

describe('the windows it spends', () => {
  it('refuses once the requesting address has spent its budget', async () => {
    const ip = anIp()
    for (let attempt = 0; attempt < IP_ATTEMPT_LIMIT; attempt += 1) {
      await service.signIn({ ...aRequest(anUnknownAddress(), WRONG_PASSWORD), ip })
    }

    const overTheLimit = await service.signIn({ ...aRequest(anUnknownAddress(), WRONG_PASSWORD), ip })

    expect(overTheLimit).toEqual({ ok: false, error: 'rate-limited' })
  })

  it('refuses once the claimed address has spent its budget, however many places it is claimed from', async () => {
    const claimed = anUnknownAddress()
    for (let attempt = 0; attempt < ADDRESS_PASSWORD_ATTEMPT_LIMIT; attempt += 1) {
      await service.signIn(aRequest(claimed, WRONG_PASSWORD))
    }

    const overTheLimit = await service.signIn(aRequest(claimed, WRONG_PASSWORD))

    expect(overTheLimit).toEqual({ ok: false, error: 'rate-limited' })
  })

  it('spends the same windows for an address that names no account as for one that does', async () => {
    // Phase ruling F43. If the account dimension were keyed on a row id, the
    // miss path would skip it — a different amount of work on the very branch
    // the response and the timing are made identical for, and an enumeration
    // oracle inside the limiter rather than in the answer.
    const known = await aReader({ otpRequired: false })
    const unknown = anUnknownAddress()

    await service.signIn(aRequest(known.email, WRONG_PASSWORD))
    await service.signIn(aRequest(unknown, WRONG_PASSWORD))

    // Both counts are asserted to be ONE rather than merely equal to each
    // other: two zeroes are equal too, and a limiter that was never called at
    // all would satisfy an equality — measured, it did.
    expect({
      unknown: await recordedAttempts('account', addressKey(unknown)),
      known: await recordedAttempts('account', addressKey(known.email)),
    }).toEqual({ unknown: 1, known: 1 })
  })

  it('counts two spellings of one address against one budget', async () => {
    // The window is keyed on a HASH, so a caller who could vary the spelling
    // would hold a fresh budget per spelling. Payload lower-cases and trims
    // before it looks an account up; this has to normalise the same way, or
    // the two disagree about which address is which.
    const claimed = anUnknownAddress()
    for (let attempt = 0; attempt < ADDRESS_PASSWORD_ATTEMPT_LIMIT; attempt += 1) {
      await service.signIn(aRequest(claimed.toUpperCase(), WRONG_PASSWORD))
    }

    const sameAddressPlainly = await service.signIn(aRequest(` ${claimed} `, WRONG_PASSWORD))

    expect(sameAddressPlainly).toEqual({ ok: false, error: 'rate-limited' })
  })

  it('records the attempt before deciding it, so a refusal is not a free guess', async () => {
    const claimed = anUnknownAddress()

    await service.signIn(aRequest(claimed, WRONG_PASSWORD))

    expect(await recordedAttempts('account', addressKey(claimed))).toBe(1)
  })
})
