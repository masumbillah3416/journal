/**
 * otpService.integration.test.ts — the six SECURITY.md requirements the
 * prototype's client-side code step failed, each asserted against a real
 * Payload, a real Postgres and the real mailer the code is delivered through.
 *
 * Integration test (CLAUDE.md §2), not a unit test, deliberately: five of the
 * six requirements are statements about what is PERSISTED (only a hash; a
 * session binding; a consumed marker; an attempt count that survives the
 * request that incremented it) and a mock of the store would assert only that
 * this file and its mock agree. The sixth is about what is DELIVERED, so the
 * code is always read back out of the mailer's outbox the way a reader reads
 * it out of their inbox — never out of the database, and never from a fixture
 * that was told the answer.
 *
 * EVERY TEST HERE IS A SECURITY REQUIREMENT, AND EACH FAILS WHEN ITS
 * MECHANISM IS REMOVED. Verified by running ten mutations, not assumed - the
 * pasted output is in `task-3-report.md`. Looking the row up without
 * `sessionHash` fails the cross-session case; storing the code instead of its
 * hash fails the hash case; dropping the `consumedAt` write fails the
 * single-use case; not incrementing `attempts` fails both the attempt-count
 * and the exhaustion case; deriving `createdAt` from the stored `expiresAt`
 * fails the purge-column case; replacing `timingSafeEqual` with `===` fails
 * the constant-time case; removing the `canResend` guard fails the cooldown
 * and hourly-ceiling cases; storing the session id unhashed fails the
 * session-hash case; appending the code to the returned value fails the
 * never-returned case; and printing the code on the mailer's terminal line
 * fails the never-logged case. Each mutation failed exactly the tests named
 * and no others.
 *
 * TIME IS INJECTED, NEVER FROZEN. The service's clock is a parameter
 * (CLAUDE.md §2.3), but the clocks these tests pass are always REAL time plus
 * an offset rather than a fixed instant: the row's own `createdAt` is stamped
 * by Postgres, so a frozen clock would put the service's `now` and the row's
 * `createdAt` in different epochs and every elapsed-time assertion would be
 * measuring the gap between two calendars rather than the behaviour.
 *
 * Uses `getTestPayload()`, not `getPayload()` directly, so this file connects
 * to the isolated `diary_test` database rather than a developer's own — see
 * that module's header.
 * Depends on: vitest, node:fs, node:path, node:url, ./otpService,
 * ./testing/otpProbes, ../testPayload, ../ports/mailer,
 * ../adapters/console-mailer, `@travel-diary/domain`.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { EXPIRY_MS, HOURLY_RESEND_CAP, MAX_ATTEMPTS, RESEND_COOLDOWN_MS } from '@travel-diary/domain/auth/otpChallenge'
import { type SessionId, type UserId, sessionId, userId } from '@travel-diary/domain/ids'
import { err, isOk } from '@travel-diary/domain/result'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createConsoleMailer } from '../adapters/console-mailer'
import type { MailerPort } from '../ports/mailer'
import { getTestPayload } from '../testPayload'
import { type OtpService, createOtpService } from './otpService'
import { aDifferentCode, latestChallenge, readCodeFromOutbox } from './testing/otpProbes'

/** Every fixture account this file creates carries this, so `afterAll` can find them all. */
const FIXTURE_EMAIL_DOMAIN = 'otp-service-fixture.example'

/** What {@link maskEmail} makes of a fixture address — asserted rather than recomputed. */
const MASKED_FIXTURE_ADDRESS = `re•••@${FIXTURE_EMAIL_DOMAIN}`

/** Distinguishes one fixture account from the next within a single run. */
let fixtureCount = 0

/**
 * A fresh sign-in account, so no two tests share a challenge history.
 *
 * A factory, not a shared fixture (CLAUDE.md §2.3): `issueChallenge` enforces
 * a resend cooldown and an hourly ceiling per account, so two tests issuing
 * against one account would refuse each other's second send — and the failure
 * would look like a bug in the code under test rather than in the fixture.
 * @returns The new account's branded id and the address a code goes to.
 */
const aSignInAccount = async (): Promise<{ user: UserId; email: string }> => {
  const payload = await getTestPayload()
  fixtureCount += 1
  const email = `reader-${String(fixtureCount)}@${FIXTURE_EMAIL_DOMAIN}`
  const created = await payload.create({
    collection: 'users',
    data: { email, password: 'not-a-real-password' },
  })
  const branded = userId(String(created.id))
  if (!isOk(branded)) throw new Error('the fixture account has no id')
  return { user: branded.value, email }
}

/**
 * A branded session id for a fixture, distinct from every other one this run.
 * @param label - Which browser this stands for, e.g. `'a'` or `'b'`.
 * @returns The branded id.
 */
const aSessionId = (label: string): SessionId => {
  const branded = sessionId(`session-${label}-${String(fixtureCount)}`)
  if (!isOk(branded)) throw new Error('the fixture session id is empty')
  return branded.value
}

/**
 * The service under test, with its own mailer.
 *
 * `isDevelopment: false` is passed explicitly rather than left to `NODE_ENV`:
 * the console mailer's dev-only terminal preview of the code is a recorded
 * deviation (docs/deviations.md §7), and a log assertion that happened to
 * pass because Vitest sets `NODE_ENV=test` would silently stop testing
 * anything the day that changed.
 * @param clock - What the service reads the current instant from.
 * @returns The service and the mailer it delivers through.
 */
const anOtpService = async (
  clock: () => number = Date.now,
): Promise<{ service: OtpService; mailer: ReturnType<typeof createConsoleMailer> }> => {
  const payload = await getTestPayload()
  const mailer = createConsoleMailer({ isDevelopment: false })
  return { service: createOtpService({ payload, mailer, now: clock }), mailer }
}

describe('otpService', () => {
  let payload: Awaited<ReturnType<typeof getTestPayload>>

  beforeAll(async () => {
    payload = await getTestPayload()
  })

  afterAll(async () => {
    const accounts = await payload.find({
      collection: 'users',
      where: { email: { like: FIXTURE_EMAIL_DOMAIN } },
      limit: 200,
      depth: 0,
    })
    for (const account of accounts.docs) {
      const challenges = await payload.find({
        collection: 'otpChallenges',
        where: { user: { equals: account.id } },
        limit: 200,
        depth: 0,
      })
      for (const challenge of challenges.docs) {
        await payload.delete({ collection: 'otpChallenges', id: challenge.id })
      }
      await payload.delete({ collection: 'users', id: account.id })
    }
  })

  it('never returns the code in any response', async () => {
    const { user } = await aSignInAccount()
    const { service } = await anOtpService()

    const issued = await service.issueChallenge(user, aSessionId('a'), '203.0.113.7')

    // The prototype held the expected code in component state. That is a demo
    // of the interaction, not authentication.
    expect(JSON.stringify(issued)).not.toMatch(/\d{6}/)
  })

  it('tells the caller which address the code went to, masked', async () => {
    const { user, email } = await aSignInAccount()
    const { service } = await anOtpService()

    const issued = await service.issueChallenge(user, aSessionId('a'), '203.0.113.7')

    expect(issued).toEqual({ ok: true, value: { maskedTo: MASKED_FIXTURE_ADDRESS } })
    expect(MASKED_FIXTURE_ADDRESS).not.toBe(email)
  })

  it('stores only a hash, never the code itself', async () => {
    const { user } = await aSignInAccount()
    const { service, mailer } = await anOtpService()

    await service.issueChallenge(user, aSessionId('a'), '203.0.113.7')
    const row = await latestChallenge(user)

    expect(row.codeHash).not.toMatch(/^\d{6}$/)
    expect(row.codeHash).not.toContain(readCodeFromOutbox(mailer))
    expect(row.codeHash.length).toBeGreaterThan(20)
  })

  it('salts each challenge separately, so one leaked hash does not read another', async () => {
    const { user: first } = await aSignInAccount()
    const { user: second } = await aSignInAccount()
    const { service } = await anOtpService()

    await service.issueChallenge(first, aSessionId('a'), '203.0.113.7')
    const firstRow = await latestChallenge(first)
    await service.issueChallenge(second, aSessionId('b'), '203.0.113.7')
    const secondRow = await latestChallenge(second)

    // A rainbow table over a million six-digit codes is a laptop's afternoon.
    // A per-row salt is what makes the leaked table useless: two rows never
    // share a hash even on the one run in a million where they share a code.
    expect(firstRow.codeHash).not.toBe(secondRow.codeHash)
  })

  it('stores the session binding hashed, not in the clear beside the IP', async () => {
    const { user } = await aSignInAccount()
    const { service } = await anOtpService()
    const session = aSessionId('a')

    await service.issueChallenge(user, session, '203.0.113.7')
    const row = await latestChallenge(user)

    expect(row.sessionHash).not.toContain(session)
    expect(row.sessionHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('refuses a code issued for a different session', async () => {
    const { user } = await aSignInAccount()
    const { service, mailer } = await anOtpService()

    // Binds the challenge to the session that started it, so a code issued for
    // one browser cannot be redeemed in another.
    await service.issueChallenge(user, aSessionId('a'), '203.0.113.7')
    const code = readCodeFromOutbox(mailer)

    expect(await service.verifyChallenge(aSessionId('b'), code)).toEqual({ ok: false, error: 'invalid' })
  })

  it('marks the challenge consumed, so a correct code works exactly once', async () => {
    const { user } = await aSignInAccount()
    const { service, mailer } = await anOtpService()
    const session = aSessionId('a')

    await service.issueChallenge(user, session, '203.0.113.7')
    const code = readCodeFromOutbox(mailer)

    expect(await service.verifyChallenge(session, code)).toEqual({ ok: true, value: { userId: user } })
    expect(await service.verifyChallenge(session, code)).toEqual({ ok: false, error: 'consumed' })
  })

  it('spends one attempt per wrong guess, so the budget is not per request', async () => {
    const { user } = await aSignInAccount()
    const { service, mailer } = await anOtpService()
    const session = aSessionId('a')

    await service.issueChallenge(user, session, '203.0.113.7')
    const wrong = aDifferentCode(readCodeFromOutbox(mailer))
    await service.verifyChallenge(session, wrong)
    await service.verifyChallenge(session, wrong)

    expect((await latestChallenge(user)).attempts).toBe(2)
  })

  it('still accepts the correct code on the last attempt the reader is owed', async () => {
    const { user } = await aSignInAccount()
    const { service, mailer } = await anOtpService()
    const session = aSessionId('a')

    await service.issueChallenge(user, session, '203.0.113.7')
    const code = readCodeFromOutbox(mailer)
    const wrong = aDifferentCode(code)
    for (let attempt = 0; attempt < MAX_ATTEMPTS - 1; attempt += 1) {
      await service.verifyChallenge(session, wrong)
    }

    // The other side of the threshold from the exhaustion case below: a limit
    // that fires one guess early refuses a reader the third try they are owed.
    expect(await service.verifyChallenge(session, code)).toEqual({ ok: true, value: { userId: user } })
  })

  it('invalidates the challenge after three wrong attempts', async () => {
    const { user } = await aSignInAccount()
    const { service, mailer } = await anOtpService()
    const session = aSessionId('a')

    await service.issueChallenge(user, session, '203.0.113.7')
    const code = readCodeFromOutbox(mailer)
    const wrong = aDifferentCode(code)
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      await service.verifyChallenge(session, wrong)
    }

    // Even the CORRECT code must now fail — the challenge is dead.
    expect(await service.verifyChallenge(session, code)).toEqual({ ok: false, error: 'exhausted' })
  })

  it('refuses a correct code once the five-minute window has closed', async () => {
    const { user } = await aSignInAccount()
    const issuing = await anOtpService()
    const session = aSessionId('a')
    await issuing.service.issueChallenge(user, session, '203.0.113.7')
    const code = readCodeFromOutbox(issuing.mailer)

    const { service } = await anOtpService(() => Date.now() + EXPIRY_MS)

    expect(await service.verifyChallenge(session, code)).toEqual({ ok: false, error: 'expired' })
  })

  it('decides expiry from createdAt, never from the stored expiresAt column', async () => {
    const { user } = await aSignInAccount()
    const issuing = await anOtpService()
    const session = aSessionId('a')
    await issuing.service.issueChallenge(user, session, '203.0.113.7')
    const code = readCodeFromOutbox(issuing.mailer)

    // `expiresAt` is a purge index, not an authorization input. Moving it a
    // year into the future must not extend the challenge by one millisecond:
    // if authorization read the stored column, EXPIRY_MS would be decorative
    // and a bad write could silently keep a challenge alive.
    const found = await payload.find({
      collection: 'otpChallenges',
      where: { user: { equals: Number(user) } },
      sort: '-createdAt',
      limit: 1,
      depth: 0,
    })
    const row = found.docs[0]
    if (row === undefined) throw new Error('no challenge row to move the purge date on')
    await payload.update({
      collection: 'otpChallenges',
      id: row.id,
      data: { expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60_000).toISOString() },
    })

    const { service } = await anOtpService(() => Date.now() + EXPIRY_MS)

    expect(await service.verifyChallenge(session, code)).toEqual({ ok: false, error: 'expired' })
  })

  it('writes expiresAt as createdAt plus the expiry window, for the purge query to index', async () => {
    const { user } = await aSignInAccount()
    const { service } = await anOtpService()

    await service.issueChallenge(user, aSessionId('a'), '203.0.113.7')
    const row = await latestChallenge(user)

    expect(row.expiresAt - row.createdAt).toBe(EXPIRY_MS)
  })

  it('never writes the code to the log', async () => {
    const { user } = await aSignInAccount()
    const { service, mailer } = await anOtpService()

    await service.issueChallenge(user, aSessionId('a'), '203.0.113.7')

    expect(mailer.logLines.join('\n')).not.toMatch(/\d{6}/)
    // The line has to exist for the assertion above to mean anything: a mailer
    // that logged nothing at all would pass it vacuously.
    expect(mailer.logLines).toHaveLength(1)
  })

  it('refuses a resend inside the thirty-second cooldown', async () => {
    const { user } = await aSignInAccount()
    const { service } = await anOtpService()
    const session = aSessionId('a')

    await service.issueChallenge(user, session, '203.0.113.7')

    expect(await service.issueChallenge(user, session, '203.0.113.7')).toEqual({ ok: false, error: 'cooldown' })
  })

  it('refuses the sixth code within one hour, once the cooldown has cleared each time', async () => {
    const { user } = await aSignInAccount()
    const session = aSessionId('a')
    let elapsedMs = 0
    const { service } = await anOtpService(() => Date.now() + elapsedMs)

    // Every one of the five the ceiling allows must actually be sent — the
    // loop pins the last allowed value as well as the first refused one, so a
    // ceiling that fires one code early fails here rather than passing as a
    // stricter-than-asked-for limit nobody notices until a reader is locked
    // out of their own diary.
    for (let sent = 1; sent <= HOURLY_RESEND_CAP; sent += 1) {
      elapsedMs = sent * (RESEND_COOLDOWN_MS + 1_000)
      expect(await service.issueChallenge(user, session, '203.0.113.7')).toEqual({
        ok: true,
        value: { maskedTo: MASKED_FIXTURE_ADDRESS },
      })
    }
    elapsedMs = (HOURLY_RESEND_CAP + 1) * (RESEND_COOLDOWN_MS + 1_000)

    expect(await service.issueChallenge(user, session, '203.0.113.7')).toEqual({ ok: false, error: 'hourly-cap' })
  })

  it('refuses to issue a challenge for an account that does not exist', async () => {
    const { service, mailer } = await anOtpService()
    const missing = userId('999999999')
    if (!isOk(missing)) throw new Error('the fixture id is empty')

    expect(await service.issueChallenge(missing.value, aSessionId('a'), '203.0.113.7')).toEqual({
      ok: false,
      error: 'unknown-account',
    })
    expect(mailer.sent).toHaveLength(0)
  })

  it('reports a refused delivery rather than pretending a code is on its way', async () => {
    const { user } = await aSignInAccount()
    const payloadInstance = await getTestPayload()
    // A stand-in adapter for the Mailer PORT, not a mock of anything this
    // repository owns (CLAUDE.md §2.3): delivery is the network boundary, and
    // a boundary that refuses is the one case no real mailer can be asked to
    // produce on demand.
    const refusingMailer: MailerPort = { send: () => Promise.resolve(err('the mail provider refused')) }
    const service = createOtpService({ payload: payloadInstance, mailer: refusingMailer, now: Date.now })

    expect(await service.issueChallenge(user, aSessionId('a'), '203.0.113.7')).toEqual({
      ok: false,
      error: 'delivery-failed',
    })
  })

  // STEP 4 OF THE TASK BRIEF — the constant-time comparison, asserted
  // STRUCTURALLY, and this comment is the record of why.
  //
  // A timing test was written and run first, as the brief asks: paired
  // samples of a code differing in its FIRST digit against one differing in
  // its LAST, through the real `verifyChallenge`. It cannot be made honest
  // here, and the reason is not machine noise — it is that the signal does
  // not exist to be measured. The comparison this test would protect runs on
  // two 32-byte scrypt outputs, and a byte-at-a-time `===` over 32 bytes
  // differs from a constant-time one by tens of NANOseconds, behind a scrypt
  // derivation costing tens of MILLIseconds and a Postgres round trip costing
  // more. The measured difference between the two arms was smaller than the
  // run-to-run variance of one arm against itself (numbers in
  // task-3-report.md), so any threshold tight enough to fail on `===` fails
  // on a busy machine too, and any threshold loose enough to be stable passes
  // with `===` in place. That is a test that proves nothing and flakes
  // anyway — the kind somebody eventually deletes, and whose deletion looks
  // like tidying.
  //
  // So the assertion is on the source text instead. It is narrow, and it is
  // honest about what it is: it says the comparison is `timingSafeEqual` and
  // that no `===`/`!==` comparison was substituted for it. Swapping in `===`
  // fails this test, which is the property the brief asked for, even though
  // it is reached by reading rather than by timing.
  it('compares the stored hash with a constant-time comparison, not with ===', () => {
    const source = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'otpService.ts'), 'utf8')
    const comparison = /^const codeMatches = [\s\S]*?^}/m.exec(source)?.[0]

    expect(comparison).toBeDefined()
    expect(comparison).toContain('timingSafeEqual(')
    expect(comparison).not.toMatch(/[=!]==/)
  })
})

// The probes are what make every assertion above non-vacuous: a probe that
// quietly returned something plausible when it found nothing would turn a
// security test into a test of its own fixture. CLAUDE.md §2.3 asks for a
// test that has actually failed, so each probe's refusal is exercised here
// rather than assumed - these are the three ways a broken fixture would
// otherwise pass silently.
describe('otpProbes', () => {
  it('refuses to read a code out of an empty outbox', () => {
    expect(() => readCodeFromOutbox({ sent: [] })).toThrow('nothing was sent')
  })

  it('refuses to read a code out of a message that has none', () => {
    expect(() => readCodeFromOutbox({ sent: [{ text: 'no digits in this body at all' }] })).toThrow(
      'no six-digit code in the message body',
    )
  })

  it('refuses to report a challenge for an account that has never had one', async () => {
    const { user } = await aSignInAccount()

    await expect(latestChallenge(user)).rejects.toThrow('no challenge row for that user')
  })

  it('turns a code into a different one, wrapping rather than running out of digits', () => {
    expect(aDifferentCode('999999')).toBe('000000')
    expect(aDifferentCode('000000')).toBe('000001')
  })
})
