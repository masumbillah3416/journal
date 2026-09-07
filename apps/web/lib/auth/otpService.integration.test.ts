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
 * MECHANISM IS REMOVED. Verified by running nineteen mutations, not assumed -
 * the pasted output is in `task-3-report.md`, and every one failed exactly
 * the cases named below and no others. Dropping `session_hash` from the
 * claim's lookup fails the two binding cases; storing the code instead of its
 * hash fails the hash case; dropping the `consumed_at` write fails single
 * use; not incrementing `attempts` fails the attempt-count, exhaustion and
 * parallel-guess cases; deriving `created_at` from the stored `expires_at`
 * fails the purge-column case; replacing `timingSafeEqual` with `===` fails
 * the constant-time case; swapping `randomInt` for `Math.random` fails the
 * CSPRNG case; removing the `canResend` guard fails all three resend cases;
 * storing the session id unhashed fails the session-hash case; appending the
 * code to the returned value fails the never-returned case; printing the code
 * on the mailer's terminal line fails the never-logged case; removing the
 * advisory lock fails the ceiling burst; widening the claim's
 * `MAX_ATTEMPTS` ceiling fails the exhaustion and parallel-guess cases;
 * dropping the `consumed_at IS NULL` guard from the consumption fails the
 * parallel-redemption case; dropping the `COALESCE` fails the null-count
 * case; and letting a non-numeric id through fails the not-an-account case.
 * Making the advisory lock session-scoped again without its compensating
 * unlock fails the lock-leak case and the ceiling burst; dropping
 * `lock_timeout` fails the bounded-wait case; dropping the lock entirely
 * fails both of those.
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
import { ISSUE_LOCK_NAMESPACE, type OtpService, createOtpService } from './otpService'
import {
  aDifferentCode,
  challengeCountSince,
  latestChallenge,
  readCodeFromOutbox,
  scatteredCodePattern,
} from './testing/otpProbes'

/**
 * Every fixture account this file creates carries this, so `afterAll` can find
 * them all — and it is **deliberately free of digits**, as is the local part
 * every account is given (see {@link aSignInAccount}).
 *
 * That is a load-bearing property, not an accident of naming. The leak
 * assertions in this file say "no digit appears here at all", which is only a
 * meaningful statement about the CODE if nothing else in the string could
 * contribute one. Put a digit in this domain and those assertions still pass,
 * but they stop testing what they claim to.
 */
const FIXTURE_EMAIL_DOMAIN = 'otp-service-fixture.example'

/** What `maskEmail` makes of a fixture address — asserted rather than recomputed. */
const MASKED_FIXTURE_ADDRESS = `re•••@${FIXTURE_EMAIL_DOMAIN}`

/** The requesting address every case records on its challenge row. */
const FIXTURE_IP = '203.0.113.7'

/** One rolling hour, for the ceiling assertions. */
const HOUR_MS = 60 * 60_000

/**
 * How many wrong guesses the parallel-burst case fires at once. Four times
 * the attempt budget, so an unserialised read-check-write is caught by a wide
 * margin rather than by one lucky interleaving.
 */
const PARALLEL_GUESSES = 12

/** How many simultaneous requests race for the hourly ceiling's last slot. */
const PARALLEL_ISSUES = 10

/** Distinguishes one fixture account from the next within a single run. */
let fixtureCount = 0

/**
 * A digit-free label for a fixture address, derived from a counter.
 *
 * Two letters rather than the count itself: `reader-12@…` would put digits in
 * an address the leak assertions need to be digit-free (see
 * {@link FIXTURE_EMAIL_DOMAIN}), and a digit smuggled in through a fixture
 * name is exactly the way those assertions would quietly stop meaning
 * anything.
 * @param count - The fixture's ordinal within this run.
 * @returns Two lowercase letters, unique for the first 676 fixtures.
 */
const alphabeticLabel = (count: number): string =>
  String.fromCharCode(97 + Math.floor(count / 26)) + String.fromCharCode(97 + (count % 26))

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
  const email = `reader-${alphabeticLabel(fixtureCount)}@${FIXTURE_EMAIL_DOMAIN}`
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
  const branded = sessionId(`session-${label}-${alphabeticLabel(fixtureCount)}`)
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

/**
 * Deletes every account this file creates, and their challenges.
 *
 * Challenges go first: `otp_challenges.user_id` is `NOT NULL` and Payload's
 * delete hook nulls the relationship rather than cascading, so removing an
 * account while a challenge still points at it fails the constraint.
 * @param payload - The test Payload instance.
 */
const removeFixtureAccounts = async (payload: Awaited<ReturnType<typeof getTestPayload>>): Promise<void> => {
  const accounts = await payload.find({
    collection: 'users',
    where: { email: { like: FIXTURE_EMAIL_DOMAIN } },
    limit: 500,
    depth: 0,
  })
  for (const account of accounts.docs) {
    const challenges = await payload.find({
      collection: 'otpChallenges',
      where: { user: { equals: account.id } },
      limit: 500,
      depth: 0,
    })
    for (const challenge of challenges.docs) {
      await payload.delete({ collection: 'otpChallenges', id: challenge.id })
    }
    await payload.delete({ collection: 'users', id: account.id })
  }
}

/**
 * Writes a challenge row aged into the past, without going through the service.
 *
 * The service will not write a row for an instant of the caller's choosing —
 * it stamps `created_at` from its own clock inside the advisory lock — and the
 * claim under test is about rows that are already old. So this inserts one
 * directly, with the shape `issueChallenge` writes.
 * @param user - Whose challenge it is.
 * @param ageMs - How far in the past to stamp `created_at`.
 */
const anAgedChallenge = async (user: UserId, ageMs: number): Promise<void> => {
  const createdAt = new Date(Date.now() - ageMs)
  await payload.db.pool.query(
    `INSERT INTO otp_challenges (user_id, code_hash, session_hash, expires_at, attempts, ip, created_at, updated_at)
     VALUES ($1, 'not-a-real-hash', $2, $3, 0, $4, $5, $5)`,
    [
      accountRowId(user),
      `aged-${String(accountRowId(user))}-${String(ageMs)}`,
      new Date(createdAt.getTime() + EXPIRY_MS),
      FIXTURE_IP,
      createdAt,
    ],
  )
}

/**
 * How many challenge rows an account holds.
 * @param user - The account.
 * @returns The row count.
 */
const challengeCountFor = async (user: UserId): Promise<number> => {
  const { rows } = await payload.db.pool.query<{ held: number }>(
    `SELECT count(*)::int AS held FROM otp_challenges WHERE user_id = $1`,
    [accountRowId(user)],
  )
  return rows.reduce((total, row) => total + row.held, 0)
}

/**
 * Empties the table of everything the sweep would take, before a sweep case.
 *
 * The sweep takes the OLDEST rows by id and stops at
 * `PRUNE_SWEEP_ROWS`. Another file's leftovers ahead of this file's fixtures
 * would fill that batch and leave the fixtures behind — a case that failed
 * for a reason that has nothing to do with the behaviour. Clearing them makes
 * the batch this file's own.
 */
const clearAgedChallenges = async (): Promise<void> => {
  await payload.db.pool.query(`DELETE FROM otp_challenges WHERE created_at <= now() - interval '1 hour'`)
}

/**
 * The Payload row id behind a fixture's branded {@link UserId}.
 * @param user - The branded id, which for a fixture is always numeric.
 * @returns The numeric row id.
 */
const accountRowId = (user: UserId): number => Number(user)

/**
 * How many advisory locks are currently held on an account's issue key.
 *
 * Read straight out of `pg_locks` rather than inferred from behaviour: a
 * leaked advisory lock is invisible from the outside for as long as the pool
 * keeps handing the leaking connection back to the same caller, since advisory
 * locks are re-entrant within one session.
 * @param accountId - The account whose lock key to look for.
 * @returns The number of matching lock rows, across every session.
 */
const advisoryLocksHeldFor = async (accountId: number): Promise<number> => {
  const held = await payload.db.pool.query<{ locks: string }>(
    `SELECT count(*) AS locks FROM pg_locks
      WHERE locktype = 'advisory' AND classid = $1 AND objid = $2`,
    [ISSUE_LOCK_NAMESPACE, accountId],
  )
  return held.rows.reduce((total, row) => total + Number(row.locks), 0)
}

/** The shared test Payload instance, assigned by the file-level `beforeAll`. */
let payload: Awaited<ReturnType<typeof getTestPayload>>

// FILE-LEVEL, not inside `describe('otpService')`, and that is the fix for a
// real leak rather than a stylistic preference: Vitest runs a describe's
// `afterAll` when THAT describe's tests finish, so a cleanup hook inside the
// first describe ran before the `otpProbes` describe below had created its
// own fixture account - which was then left in the shared `diary_test`
// database every single run. Found by counting: cleanup reported 23 accounts
// where 24 existed, every time, and the survivor was always the last one
// created.
beforeAll(async () => {
  payload = await getTestPayload()
  // Cleaned at BOTH ends, not just after. Fixture addresses are derived from
  // a counter, so they repeat run to run - and `users.email` is unique, so a
  // single row left behind by an interrupted run makes the NEXT run fail
  // inside a fixture factory, with "the following field is invalid: email"
  // and no hint that the cause is a crash days ago. A run has to be able to
  // start from whatever the last one left.
  await removeFixtureAccounts(payload)
})

afterAll(async () => {
  await removeFixtureAccounts(payload)
})

/**
 * The service's own source text, for the two properties no behavioural test
 * can observe: that the comparison is constant-time, and that the code comes
 * from the CSPRNG. See the comments on those two cases for why each is
 * asserted structurally rather than measured.
 * @returns The contents of `otpService.ts`.
 */
const readServiceSource = (): string =>
  readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'otpService.ts'), 'utf8')

describe('otpService', () => {
  it('never returns the code in any response', async () => {
    const { user } = await aSignInAccount()
    const { service, mailer } = await anOtpService()

    const issued = await service.issueChallenge(user, aSessionId('a'), FIXTURE_IP)
    const serialised = JSON.stringify(issued)

    // The prototype held the expected code in component state. That is a demo
    // of the interaction, not authentication.
    //
    // Three assertions, weakest to strongest, because a leak detector that is
    // easy to slip past is worse than none - it reads like a guarantee. A bare
    // six-digit run misses `1 2 3 4 5 6` and misses a code split across a
    // separator; the scattered pattern catches those; and the last one holds
    // only because the fixture address is deliberately digit-free
    // (FIXTURE_EMAIL_DOMAIN), which makes ANY digit in this response
    // necessarily the code's.
    expect(serialised).not.toMatch(/\d{6}/)
    expect(serialised).not.toMatch(scatteredCodePattern(readCodeFromOutbox(mailer)))
    expect(serialised).not.toMatch(/[0-9]/)
  })

  it('tells the caller which address the code went to, masked', async () => {
    const { user, email } = await aSignInAccount()
    const { service } = await anOtpService()

    const issued = await service.issueChallenge(user, aSessionId('a'), FIXTURE_IP)

    expect(issued).toEqual({ ok: true, value: { maskedTo: MASKED_FIXTURE_ADDRESS } })
    expect(MASKED_FIXTURE_ADDRESS).not.toBe(email)
  })

  it('stores only a hash, never the code itself', async () => {
    const { user } = await aSignInAccount()
    const { service, mailer } = await anOtpService()

    await service.issueChallenge(user, aSessionId('a'), FIXTURE_IP)
    const row = await latestChallenge(user)

    expect(row.codeHash).not.toMatch(/^\d{6}$/)
    expect(row.codeHash).not.toContain(readCodeFromOutbox(mailer))
    expect(row.codeHash.length).toBeGreaterThan(20)
  })

  it('salts each challenge separately, so one leaked hash does not read another', async () => {
    const { user: first } = await aSignInAccount()
    const { user: second } = await aSignInAccount()
    const { service } = await anOtpService()

    await service.issueChallenge(first, aSessionId('a'), FIXTURE_IP)
    const firstRow = await latestChallenge(first)
    await service.issueChallenge(second, aSessionId('b'), FIXTURE_IP)
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

    await service.issueChallenge(user, session, FIXTURE_IP)
    const row = await latestChallenge(user)

    expect(row.sessionHash).not.toContain(session)
    expect(row.sessionHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('accepts the code in the session it was issued for', async () => {
    const { user } = await aSignInAccount()
    const { service, mailer } = await anOtpService()
    const session = aSessionId('a')

    await service.issueChallenge(user, session, FIXTURE_IP)
    const code = readCodeFromOutbox(mailer)

    // The positive half of the binding, paired with the refusal below on
    // purpose. Alone, the refusal is satisfied by a service that refuses
    // EVERYTHING - a lookup keyed on a constant, or a binding that never
    // matches, passes it and fails no other case in this file.
    expect(await service.verifyChallenge(session, code)).toEqual({ ok: true, value: { userId: user } })
  })

  it('refuses a code issued for a different session', async () => {
    const { user } = await aSignInAccount()
    const { service, mailer } = await anOtpService()

    // Binds the challenge to the session that started it, so a code issued for
    // one browser cannot be redeemed in another.
    await service.issueChallenge(user, aSessionId('a'), FIXTURE_IP)
    const code = readCodeFromOutbox(mailer)

    expect(await service.verifyChallenge(aSessionId('b'), code)).toEqual({ ok: false, error: 'invalid' })
  })

  it('marks the challenge consumed, so a correct code works exactly once', async () => {
    const { user } = await aSignInAccount()
    const { service, mailer } = await anOtpService()
    const session = aSessionId('a')

    await service.issueChallenge(user, session, FIXTURE_IP)
    const code = readCodeFromOutbox(mailer)

    expect(await service.verifyChallenge(session, code)).toEqual({ ok: true, value: { userId: user } })
    expect(await service.verifyChallenge(session, code)).toEqual({ ok: false, error: 'consumed' })
  })

  it('spends one attempt per wrong guess, so the budget is not per request', async () => {
    const { user } = await aSignInAccount()
    const { service, mailer } = await anOtpService()
    const session = aSessionId('a')

    await service.issueChallenge(user, session, FIXTURE_IP)
    const wrong = aDifferentCode(readCodeFromOutbox(mailer))
    await service.verifyChallenge(session, wrong)
    await service.verifyChallenge(session, wrong)

    expect((await latestChallenge(user)).attempts).toBe(2)
  })

  it('still accepts the correct code on the last attempt the reader is owed', async () => {
    const { user } = await aSignInAccount()
    const { service, mailer } = await anOtpService()
    const session = aSessionId('a')

    await service.issueChallenge(user, session, FIXTURE_IP)
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

    await service.issueChallenge(user, session, FIXTURE_IP)
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
    await issuing.service.issueChallenge(user, session, FIXTURE_IP)
    const code = readCodeFromOutbox(issuing.mailer)

    const { service } = await anOtpService(() => Date.now() + EXPIRY_MS)

    expect(await service.verifyChallenge(session, code)).toEqual({ ok: false, error: 'expired' })
  })

  it('decides expiry from createdAt, never from the stored expiresAt column', async () => {
    const { user } = await aSignInAccount()
    const issuing = await anOtpService()
    const session = aSessionId('a')
    await issuing.service.issueChallenge(user, session, FIXTURE_IP)
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

  it('writes expiresAt as createdAt plus the expiry window, which is the only thing it is for', async () => {
    // The column is `DATA_MODEL.md`'s and is read by nothing — not
    // authorization, and not the purge, which keys on `created_at`. This case
    // says the stored value is the derived one, so a reader of the table is
    // not misled by it.
    const { user } = await aSignInAccount()
    const { service } = await anOtpService()

    await service.issueChallenge(user, aSessionId('a'), FIXTURE_IP)
    const row = await latestChallenge(user)

    expect(row.expiresAt - row.createdAt).toBe(EXPIRY_MS)
  })

  it('sweeps aged challenges belonging to OTHER accounts, so the table is bounded by the window', async () => {
    // THE CROSS-KEY HALF, which is the half that was missing. A prune scoped
    // to the account being written bounds this table by the number of
    // accounts ever seen rather than by the retention window — ruling F33's
    // finding for `sign_in_attempts`, and B4's for this table.
    await clearAgedChallenges()
    const stale = await aSignInAccount()
    const writer = await aSignInAccount()
    await anAgedChallenge(stale.user, 2 * HOUR_MS)
    await anAgedChallenge(stale.user, 3 * HOUR_MS)
    const { service } = await anOtpService()

    await service.issueChallenge(writer.user, aSessionId('sweeper'), FIXTURE_IP)

    expect(await challengeCountFor(stale.user)).toBe(0)
  })

  it('leaves a challenge inside the resend window alone, because the hourly ceiling still counts it', async () => {
    // THE CASE THAT REFUSES THE OBVIOUS PURGE. `DELETE WHERE expires_at <
    // now()` reads correctly and is wrong: a challenge is unusable after five
    // minutes but is still counted by the hourly mailbomb ceiling for an
    // hour, so that purge hands a reader an unlimited supply of codes
    // fifty-five minutes early. The row below is long expired and well inside
    // the window.
    await clearAgedChallenges()
    const stale = await aSignInAccount()
    const writer = await aSignInAccount()
    await anAgedChallenge(stale.user, 30 * 60_000)
    const { service } = await anOtpService()

    await service.issueChallenge(writer.user, aSessionId('sweeper'), FIXTURE_IP)

    expect(await challengeCountFor(stale.user)).toBe(1)
  })

  it('never writes the code to the log', async () => {
    const { user } = await aSignInAccount()
    const { service, mailer } = await anOtpService()

    await service.issueChallenge(user, aSessionId('a'), FIXTURE_IP)
    const printed = mailer.logLines.join('\n')

    // Same three strengths as the never-returned case above, and for the same
    // reason: a line that printed the code spaced or hyphenated has leaked all
    // of it while matching no six-digit run.
    expect(printed).not.toMatch(/\d{6}/)
    expect(printed).not.toMatch(scatteredCodePattern(readCodeFromOutbox(mailer)))
    expect(printed).not.toMatch(/[0-9]/)
    // The line has to exist for the assertions above to mean anything: a mailer
    // that logged nothing at all would pass them vacuously.
    expect(mailer.logLines).toHaveLength(1)
  })

  it('refuses a resend inside the thirty-second cooldown', async () => {
    const { user } = await aSignInAccount()
    const { service } = await anOtpService()
    const session = aSessionId('a')

    await service.issueChallenge(user, session, FIXTURE_IP)

    expect(await service.issueChallenge(user, session, FIXTURE_IP)).toEqual({ ok: false, error: 'cooldown' })
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
      expect(await service.issueChallenge(user, session, FIXTURE_IP)).toEqual({
        ok: true,
        value: { maskedTo: MASKED_FIXTURE_ADDRESS },
      })
    }
    elapsedMs = (HOURLY_RESEND_CAP + 1) * (RESEND_COOLDOWN_MS + 1_000)

    expect(await service.issueChallenge(user, session, FIXTURE_IP)).toEqual({ ok: false, error: 'hourly-cap' })
  })

  // THE PARALLEL CASES. Every assertion above this point fires one request at
  // a time, and a limit that holds one request at a time can still be nothing
  // at all: read the counter, think for thirty milliseconds, write the
  // counter back, and a dozen racers all read the same zero. Six digits is a
  // million combinations, and an attacker who can fan out does not need three
  // guesses. These three cases are the same three limits as above - the
  // attempt budget, single use, and the resend ceiling - asked the only
  // question that matters for a limit: does it hold when the requests arrive
  // together?
  //
  // `Promise.all` over one service instance is a real burst here, not a
  // simulated one: each call is its own round trip to the same Postgres, so
  // the interleaving is the database's, not the test's.

  it('evaluates only three of a dozen simultaneous wrong guesses, and kills the challenge', async () => {
    const { user } = await aSignInAccount()
    const { service, mailer } = await anOtpService()
    const session = aSessionId('a')
    await service.issueChallenge(user, session, FIXTURE_IP)
    const code = readCodeFromOutbox(mailer)
    const wrong = aDifferentCode(code)

    const outcomes = await Promise.all(
      Array.from({ length: PARALLEL_GUESSES }, () => service.verifyChallenge(session, wrong)),
    )

    // Exactly MAX_ATTEMPTS guesses may be evaluated - those come back
    // 'invalid', having actually been compared. Every other racer must be
    // turned away as 'exhausted' without its code ever being checked.
    expect(outcomes.filter((outcome) => !outcome.ok && outcome.error === 'invalid')).toHaveLength(MAX_ATTEMPTS)
    expect(outcomes.filter((outcome) => !outcome.ok && outcome.error === 'exhausted')).toHaveLength(
      PARALLEL_GUESSES - MAX_ATTEMPTS,
    )
    expect(Number((await latestChallenge(user)).attempts)).toBe(MAX_ATTEMPTS)
    // And the challenge is dead afterwards, not merely bruised.
    expect(await service.verifyChallenge(session, code)).toEqual({ ok: false, error: 'exhausted' })
  })

  it('lets exactly one of two simultaneous correct codes redeem the challenge', async () => {
    const { user } = await aSignInAccount()
    const { service, mailer } = await anOtpService()
    const session = aSessionId('a')
    await service.issueChallenge(user, session, FIXTURE_IP)
    const code = readCodeFromOutbox(mailer)

    const outcomes = await Promise.all([service.verifyChallenge(session, code), service.verifyChallenge(session, code)])

    expect(outcomes.filter((outcome) => outcome.ok)).toEqual([{ ok: true, value: { userId: user } }])
    expect(outcomes.filter((outcome) => !outcome.ok && outcome.error === 'consumed')).toHaveLength(1)
  })

  it('never issues more than the hourly ceiling, however many requests race for the last slot', async () => {
    const { user } = await aSignInAccount()
    const session = aSessionId('a')
    let elapsedMs = 0
    const { service } = await anOtpService(() => Date.now() + elapsedMs)

    // Four codes sent one at a time, each past the previous cooldown, so the
    // account arrives at the burst one short of its ceiling.
    for (let sent = 1; sent < HOURLY_RESEND_CAP; sent += 1) {
      elapsedMs = sent * (RESEND_COOLDOWN_MS + 1_000)
      await service.issueChallenge(user, session, FIXTURE_IP)
    }
    elapsedMs = HOURLY_RESEND_CAP * (RESEND_COOLDOWN_MS + 1_000)

    const outcomes = await Promise.all(
      Array.from({ length: PARALLEL_ISSUES }, () => service.issueChallenge(user, session, FIXTURE_IP)),
    )

    // One of the burst may win the fifth and last slot; the rest are refused,
    // and the account must never end the hour holding more codes than the
    // ceiling allows. Counting the ROWS, not the successes, is the point: a
    // count-then-insert that is not serialised reports refusals it did not
    // actually apply.
    expect(outcomes.filter((outcome) => outcome.ok)).toHaveLength(1)
    expect(await challengeCountSince(user, Date.now() + elapsedMs - HOUR_MS)).toBe(HOURLY_RESEND_CAP)
  })

  // ═══ SECURITY.md §3's "then invalidate it and FORCE A RESEND" ═══
  //
  // The invalidation was proved three tasks ago; the forcing was not, and it
  // did not work. `challengeAccount` answers `null` for any challenge that is
  // not `'valid'` — correctly, since its one job is metering a guess that can
  // still be made — and `resendChallenge` was resolving the account through
  // it, so the moment a reader spent their third guess the only way forward
  // stopped working. Found in the browser (docs/qa/2026-09-07-sign-in-sweep.md,
  // SIGNIN-004), not by any of the 350 integration cases.
  it('issues a fresh code once every guess is gone, which is what forcing a resend means', async () => {
    const { user } = await aSignInAccount()
    let elapsedMs = 0
    const { service, mailer } = await anOtpService(() => Date.now() + elapsedMs)
    const session = aSessionId('a')
    await service.issueChallenge(user, session, FIXTURE_IP)
    const wrong = aDifferentCode(readCodeFromOutbox(mailer))
    for (let spent = 0; spent < MAX_ATTEMPTS; spent += 1) await service.verifyChallenge(session, wrong)
    elapsedMs = RESEND_COOLDOWN_MS + 1_000

    const resent = await service.resendChallenge(session, FIXTURE_IP)

    // The message is asserted as well as the answer: an `ok` that mailed
    // nothing would leave the reader exactly as stuck.
    expect(resent).toEqual({ ok: true, value: { maskedTo: MASKED_FIXTURE_ADDRESS } })
    expect(mailer.sent).toHaveLength(2)
    // And the new code works, which is the whole point of forcing one.
    expect(await service.verifyChallenge(session, readCodeFromOutbox(mailer))).toEqual({
      ok: true,
      value: { userId: user },
    })
  })

  it('issues one once the code has expired, so waiting out the five minutes is not a dead end', async () => {
    const { user } = await aSignInAccount()
    let elapsedMs = 0
    const { service, mailer } = await anOtpService(() => Date.now() + elapsedMs)
    const session = aSessionId('a')
    await service.issueChallenge(user, session, FIXTURE_IP)
    elapsedMs = EXPIRY_MS + 1_000

    expect(await service.resendChallenge(session, FIXTURE_IP)).toEqual({
      ok: true,
      value: { maskedTo: MASKED_FIXTURE_ADDRESS },
    })
    expect(mailer.sent).toHaveLength(2)
  })

  it('still refuses a resend for a browser that has never been sent a code', async () => {
    // The other half of the case above. Resolving the account whatever the
    // challenge's state must not become resolving it when there is no
    // challenge — that would be an unauthenticated caller putting mail in
    // somebody's inbox by presenting any identifier at all.
    const { service, mailer } = await anOtpService()

    // A label of its own: `aSessionId` keys on the account counter, and this
    // case creates no account, so 'a' would be the identifier the case above
    // left a challenge under.
    expect(await service.resendChallenge(aSessionId('never-sent'), FIXTURE_IP)).toEqual({
      ok: false,
      error: 'unknown-account',
    })
    expect(mailer.sent).toHaveLength(0)
  })

  it('reports an exhausted challenge to the screen rather than none, with the instant it was issued', async () => {
    // SIGNIN-001 and SIGNIN-002. An exhausted challenge answered `null`, so
    // the screen drew the SAME placeholder a browser holding nothing gets:
    // three bullets where the address was, a counter back at zero, and an
    // `issuedAt` of the render instant — which restarted the five minutes and
    // the thirty-second resend cooldown on every reload.
    const { user } = await aSignInAccount()
    const { service, mailer } = await anOtpService()
    const session = aSessionId('a')
    await service.issueChallenge(user, session, FIXTURE_IP)
    const issued = (await latestChallenge(user)).createdAt
    const wrong = aDifferentCode(readCodeFromOutbox(mailer))
    for (let spent = 0; spent < MAX_ATTEMPTS; spent += 1) await service.verifyChallenge(session, wrong)

    const pending = await service.pendingChallenge(session)

    expect(pending).toEqual({
      maskedTo: MASKED_FIXTURE_ADDRESS,
      issuedAt: issued,
      attemptsSpent: MAX_ATTEMPTS,
      attemptsAllowed: MAX_ATTEMPTS,
    })
  })

  it('reports an expired challenge with the instant it was issued, not the instant it was read', async () => {
    const { user } = await aSignInAccount()
    const { service } = await anOtpService(() => Date.now() + EXPIRY_MS + 1_000)
    const session = aSessionId('a')
    // Issued under the REAL clock, so the row is genuinely older than the
    // service reading it: `issueChallenge` stamps `created_at` in Postgres,
    // and the reader's clock is the one that has moved on.
    const { service: issuer } = await anOtpService()
    await issuer.issueChallenge(user, session, FIXTURE_IP)
    const issued = (await latestChallenge(user)).createdAt

    const pending = await service.pendingChallenge(session)

    expect(pending?.issuedAt).toBe(issued)
    expect(pending?.attemptsSpent).toBe(0)
  })

  it('reports nothing for a challenge that has already been redeemed', async () => {
    // A consumed challenge is the one state that stays a placeholder: the
    // browser that spent it was handed a session in the same request, so it no
    // longer presents this identifier at all, and describing it would be
    // describing a sign-in that has already happened.
    const { user } = await aSignInAccount()
    const { service, mailer } = await anOtpService()
    const session = aSessionId('a')
    await service.issueChallenge(user, session, FIXTURE_IP)
    await service.verifyChallenge(session, readCodeFromOutbox(mailer))

    expect(await service.pendingChallenge(session)).toBeNull()
  })

  it('refuses to issue a challenge for an account that does not exist', async () => {
    const { service, mailer } = await anOtpService()
    const missing = userId('999999999')
    if (!isOk(missing)) throw new Error('the fixture id is empty')

    expect(await service.issueChallenge(missing.value, aSessionId('a'), FIXTURE_IP)).toEqual({
      ok: false,
      error: 'unknown-account',
    })
    expect(mailer.sent).toHaveLength(0)
  })

  it('treats a challenge whose attempt count was never written as having spent none', async () => {
    const { user } = await aSignInAccount()
    const { service, mailer } = await anOtpService()
    const session = aSessionId('a')
    await service.issueChallenge(user, session, FIXTURE_IP)
    const code = readCodeFromOutbox(mailer)

    // A NULL attempt count is not a row this module writes - it always writes
    // zero - but it is a row the database can hold, and SQL's answer to
    // `NULL < 3` is neither true nor false. Without the COALESCE in the claim,
    // such a row matches nothing, and a reader with a perfectly good code is
    // told their challenge is invalid forever. Zero, not MAX_ATTEMPTS, is the
    // right reading: a counter that was never written records no guess spent.
    const found = await payload.find({
      collection: 'otpChallenges',
      where: { user: { equals: Number(user) } },
      sort: '-createdAt',
      limit: 1,
      depth: 0,
    })
    const row = found.docs[0]
    if (row === undefined) throw new Error('no challenge row to clear the attempt count on')
    await payload.update({ collection: 'otpChallenges', id: row.id, data: { attempts: null } })

    expect(await service.verifyChallenge(session, code)).toEqual({ ok: true, value: { userId: user } })
  })

  // THE TWO LOCK CASES. `issueChallenge` serialises its count-and-insert on a
  // Postgres advisory lock, and an advisory lock is a shared, database-wide
  // resource: the failure modes that matter are not "does it serialise" (the
  // ceiling burst above answers that) but "what happens when the request
  // holding it does not finish normally", and "what happens to the request
  // waiting behind one". Both are latent - neither shows up in a green suite,
  // and both present, later and elsewhere, as a hang nobody can trace.

  it('releases the lock when the request holding it fails, so the next one is not blocked', async () => {
    const { user } = await aSignInAccount()
    const session = aSessionId('a')
    // A clock that answers NaN is an unexpected fault injected through an
    // already-injected dependency, rather than a hook added to the service to
    // make it breakable. It survives every earlier check and fails INSIDE the
    // critical section: `new Date(NaN - RESEND_WINDOW_MS)` reaches Postgres as
    // a malformed timestamp on the very first statement after the lock is
    // taken. That it throws rather than returning a Result is the point -
    // the guarantee being tested is about UNEXPECTED failures, which are the
    // only ones that can leak a lock.
    const faulting = await anOtpService(() => Number.NaN)
    await expect(faulting.service.issueChallenge(user, session, FIXTURE_IP)).rejects.toThrow()

    // Asked of `pg_locks` directly, and this is the assertion that actually
    // discriminates. Going only through the service does NOT: the pool hands
    // the just-released connection straight back, and an advisory lock is
    // re-entrant within one session, so a request that inherits the leaking
    // connection sails past a lock that is still held - which is precisely
    // why a leaked lock is a production hang rather than a test failure. The
    // consequence for the NEXT request is asserted below as well, because
    // that is what a reader experiences, but the lock table is what proves it.
    expect(await advisoryLocksHeldFor(accountRowId(user))).toBe(0)

    // Same account, so the same lock key.
    const { service } = await anOtpService()

    expect(await service.issueChallenge(user, session, FIXTURE_IP)).toEqual({
      ok: true,
      value: { maskedTo: MASKED_FIXTURE_ADDRESS },
    })
  })

  it('gives up rather than waiting forever when another request holds the lock', async () => {
    const { user } = await aSignInAccount()
    const { service } = await anOtpService()
    const accountId = accountRowId(user)

    // Hold the account's lock from outside the service, the way a stalled
    // sibling request would. The pool defaults to ten connections
    // (apps/web/payload.config.ts), so an unbounded wait here is not one slow
    // request - it is a connection held out of a pool of ten for as long as
    // the holder lasts, and ten of them is the whole application stopped.
    const holder = await payload.db.pool.connect()
    try {
      await holder.query('BEGIN')
      await holder.query('SELECT pg_advisory_xact_lock($1, $2)', [ISSUE_LOCK_NAMESPACE, accountId])

      // Bounded: `lock_timeout` turns the wait into a refusal. It surfaces as
      // a thrown Postgres error rather than one of the four Result refusals,
      // deliberately - see the module header. A reader can act on 'cooldown';
      // there is nothing they can do about database contention, and inventing
      // a fifth refusal for it would put a message on the sign-in screen that
      // describes our infrastructure.
      await expect(service.issueChallenge(user, aSessionId('a'), FIXTURE_IP)).rejects.toThrow(/lock timeout/i)
    } finally {
      await holder.query('ROLLBACK')
      holder.release()
    }
  })

  it('refuses to issue a challenge for an id that is not an account id at all', async () => {
    const { service, mailer } = await anOtpService()
    // `UserId` is branded on non-emptiness alone, so a caller CAN hand over a
    // string that is not a Payload row id. Before this was guarded, it reached
    // the driver as `NaN` and came back as a raw `Failed query: ... params:
    // NaN` - an exception past the Result contract, with SQL in it, for
    // whatever surfaces the error to decide what to do with.
    const notAnId = userId('not-a-payload-id')
    if (!isOk(notAnId)) throw new Error('the fixture id is empty')

    expect(await service.issueChallenge(notAnId.value, aSessionId('a'), FIXTURE_IP)).toEqual({
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

    expect(await service.issueChallenge(user, aSessionId('a'), FIXTURE_IP)).toEqual({
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
    const source = readServiceSource()
    const comparison = /^const codeMatches = [\s\S]*?^}/m.exec(source)?.[0]

    expect(comparison).toBeDefined()
    expect(comparison).toContain('timingSafeEqual(')
    expect(comparison).not.toMatch(/[=!]==/)
  })

  // The CSPRNG is `SECURITY.md`'s FIRST required bullet and the one property
  // in this file that no behavioural test can see: swap `crypto.randomInt`
  // for `Math.random` and every other case here still passes, because the
  // result is still six digits, still hashes, still verifies, and still
  // arrives in the outbox. What changes is invisible from outside and total -
  // `Math.random` is a seeded, non-cryptographic generator whose future
  // output is recoverable from a handful of observed values, so an attacker
  // who requests two codes for their own account can predict everyone
  // else's. The same structural technique as the constant-time case above,
  // for the same reason, and verified the same way: mutating the generator
  // fails this and nothing else.
  it('draws the code from the CSPRNG, not from Math.random', () => {
    const source = readServiceSource()
    const generator = /^const generateCode = .*$/m.exec(source)?.[0]

    expect(generator).toBeDefined()
    expect(generator).toContain('randomInt(')
    expect(generator).not.toContain('Math.random')
    // The identifier alone is not enough - a local `randomInt` shadowing the
    // import would satisfy the line above and be any generator at all.
    expect(source).toMatch(/^import \{[^}]*\brandomInt\b[^}]*\} from 'node:crypto'$/m)
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
