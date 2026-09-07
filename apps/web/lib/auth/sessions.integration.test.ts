/**
 * sessions.integration.test.ts — session rows, rotation on sign-in, and
 * revocation, asserted against a real Postgres.
 *
 * Integration test (CLAUDE.md §2), not a unit test, and not optional. The
 * lifecycle arithmetic is already covered by
 * `packages/domain/src/auth/session.test.ts`; what is left to prove is
 * exactly what a mock cannot say anything about — that the identifier stored
 * is a hash and not the token, that a superseded identifier is refused by a
 * row somebody could actually go and look at, and that the Revoke button on
 * the account screen reaches the same row an authentication reads.
 *
 * THE TWO TRAPS THIS FILE IS SHAPED AROUND, both recorded in the task brief
 * because both have produced tests that passed with the mechanism deleted:
 *
 *   1. A ROTATION TEST THAT ONLY ASSERTS "A NEW IDENTIFIER EXISTS" PASSES
 *      WHILE THE OLD ONE STILL AUTHENTICATES. So every rotation case here
 *      asserts the OLD identifier is refused, and names the refusal. The
 *      difference is measurable: returning the previous identifier instead of
 *      minting one fails these cases and no others (see the task report).
 *   2. A REVOCATION TEST THAT CHECKS A FIELD WAS SET PASSES WHILE NOTHING
 *      READS THAT FIELD. So no case here asserts on `revokedAt`. Each one
 *      revokes and then attempts to AUTHENTICATE, which is the only question
 *      that matters about a revoked session.
 *
 * "KEEP ME SIGNED IN" IS ASSERTED FROM THREE SIDES, because "the session
 * lasts longer" is satisfied by the wrong implementation — a longer-lived
 * token — as readily as by the right one. The row's `expires_at` is read out
 * of Postgres and compared against the two lifetimes; the identifier itself
 * is compared byte-for-byte in shape between a remembered and an ordinary
 * sign-in; and a remembered row is then aged past its expiry, after which the
 * same long-lived identifier stops working. Only a row-governed lifetime
 * passes all three.
 *
 * REVOCATION IS EXERCISED THROUGH THE ACCOUNT SCREEN'S OWN ROUTE as well as
 * through this module. `SECURITY.md` asks for real rows so that "Revoke" and
 * "Sign out everywhere" are not decorative, and the account screen revokes by
 * updating the row through Payload with the signed-in reader's own access
 * (`apps/web/collections/sessions.ts`). A test that only ever revoked through
 * this module would not notice if those two paths stopped meeting.
 *
 * Uses `getTestPayload()`, not `getPayload()` directly, so this file connects
 * to the isolated `diary_test` database rather than a developer's own — see
 * that module's header.
 * Depends on: vitest, ./sessions, ../testPayload, `@travel-diary/domain`.
 */
import { REMEMBERED_SESSION_LIFETIME_MS, SESSION_LIFETIME_MS } from '@travel-diary/domain/auth/session'
import { type SessionId, type UserId, sessionId, userId } from '@travel-diary/domain/ids'
import { isOk } from '@travel-diary/domain/result'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getTestPayload } from '../testPayload'
import { type SessionService, createSessionService } from './sessions'

/** The prefix every fixture account's address carries, so `afterAll` finds exactly them. */
const FIXTURE_EMAIL_PREFIX = 'test-session-service-'

/** The `device` value every fixture row carries, for the same reason. */
const FIXTURE_DEVICE = 'test-session-service-device'

/** The `location` label every fixture row carries. A place name, never an address. */
const FIXTURE_LOCATION = 'Reykjavik, Iceland'

/** Distinguishes one fixture account from the next within a run. */
let fixtureCount = 0

/** The shared test Payload instance, assigned by `beforeAll`. */
let payload: Awaited<ReturnType<typeof getTestPayload>>

/** The service under test, built over the same Payload instance and a real clock. */
let sessions: SessionService

/**
 * Creates a fixture account no other case in this run is using.
 *
 * One account per case rather than one shared between them (CLAUDE.md §2.3):
 * "sign out everywhere" revokes every row an account has, so two cases
 * sharing an account would sign each other out and the failure would read as
 * a bug in the service.
 * @returns The created account, and its branded id.
 */
const anAccount = async (): Promise<{ row: number; id: UserId }> => {
  fixtureCount += 1
  const created = await payload.create({
    collection: 'users',
    data: { email: `${FIXTURE_EMAIL_PREFIX}${String(fixtureCount)}@example.com`, password: 'not-a-real-password' },
  })
  const branded = userId(String(created.id))
  /* c8 ignore next -- `userId` refuses only an empty string, which `String` of a row id never is */
  if (!isOk(branded)) throw new Error('the fixture account id is empty')
  return { row: created.id, id: branded.value }
}

/**
 * A branded identifier for a session that was never issued.
 *
 * Stands in for the pre-auth identifier a browser carries into sign-in, which
 * has no `sessions` row of its own — see `apps/web/collections/otpChallenges.ts`
 * for why an unauthenticated visitor is deliberately not given one.
 * @param label - What this identifier stands for, so a failure names it.
 * @returns The branded id.
 */
const anUnissuedIdentifier = (label: string): SessionId => {
  fixtureCount += 1
  const branded = sessionId(`${label}-${String(fixtureCount)}`)
  /* c8 ignore next -- a prefixed counter is never the empty string `sessionId` refuses */
  if (!isOk(branded)) throw new Error('the fixture session id is empty')
  return branded.value
}

/**
 * Starts a session for `account`, with the fixture's device and location.
 *
 * @param account - The account to sign in.
 * @param options - Whether the reader asked to stay signed in, and whatever
 *   identifier the browser arrived with.
 * @returns The issued session.
 */
const aSessionFor = async (
  account: UserId,
  options: { keepSignedIn?: boolean; previous?: SessionId } = {},
): Promise<{ session: SessionId; cookie: string; expiresAt: number }> => {
  const issued = await sessions.startSession({
    user: account,
    previous: options.previous ?? null,
    keepSignedIn: options.keepSignedIn ?? false,
    device: FIXTURE_DEVICE,
    location: FIXTURE_LOCATION,
  })
  if (!isOk(issued)) throw new Error(`the fixture session was refused: ${issued.error}`)
  return issued.value
}

/**
 * The `expires_at` Postgres holds for a session, in epoch milliseconds.
 *
 * Read out of the database rather than taken from what the service returned:
 * the claim under test is about the ROW's lifetime, and a service that
 * reported one figure and stored another would satisfy an assertion on its
 * own return value.
 * @param session - The identifier the row was issued under.
 * @returns The stored expiry.
 */
const storedExpiryOf = async (session: SessionId): Promise<number> => {
  const { rows } = await payload.db.pool.query<{ expires_at: Date }>(
    `SELECT expires_at FROM sessions WHERE token_hash = encode(digest($1, 'sha256'), 'hex')`,
    [session],
  )
  return rows.reduce((latest, row) => Math.max(latest, row.expires_at.getTime()), Number.NEGATIVE_INFINITY)
}

/**
 * Moves a session's stored expiry into the past.
 *
 * The honest stand-in for waiting out a thirty-day lifetime: the row is what
 * the lifetime lives in, which is the very claim these cases exist to make.
 * @param session - The identifier the row was issued under.
 */
const ageSessionPastItsExpiry = async (session: SessionId): Promise<void> => {
  await payload.db.pool.query(
    `UPDATE sessions SET expires_at = now() - interval '1 minute'
      WHERE token_hash = encode(digest($1, 'sha256'), 'hex')`,
    [session],
  )
}

/**
 * The row id of the one session an account holds.
 *
 * The two review-round cases below reach for Payload's own update path, which
 * addresses a row by id rather than by the identifier this service works in -
 * that is the whole point of them, since it is the path the Account screen
 * reaches these rows by. Folded rather than indexed so there is no arm no test
 * could take.
 * @param account - The account's row id.
 * @returns The session row's id, or 0 when the account holds none.
 */
const onlySessionRowOf = async (account: number): Promise<number> => {
  const { rows } = await payload.db.pool.query<{ id: number }>(`SELECT id FROM sessions WHERE user_id = $1`, [account])
  return rows.reduce((highest, found) => Math.max(highest, found.id), 0)
}

/**
 * How many session rows an account holds, live or dead.
 * @param account - The account's row id.
 * @returns The row count.
 */
const sessionCountOf = async (account: number): Promise<number> => {
  const { rows } = await payload.db.pool.query<{ held: number }>(
    `SELECT count(*)::int AS held FROM sessions WHERE user_id = $1`,
    [account],
  )
  return rows.reduce((total, row) => total + row.held, 0)
}

/**
 * Empties the table of everything the sweep would take, before a sweep case.
 *
 * The sweep takes the OLDEST dead rows by id and stops at `PRUNE_SWEEP_ROWS`.
 * Another file's leftovers ahead of this file's fixtures would fill that batch
 * and leave the fixtures behind — a case that failed for a reason that has
 * nothing to do with the behaviour.
 */
const clearDeadSessions = async (): Promise<void> => {
  await payload.db.pool.query(`DELETE FROM sessions WHERE expires_at <= now() OR revoked_at IS NOT NULL`)
}

/**
 * Removes every row and account this file creates, at both ends of the run.
 *
 * Sessions go first and are matched by their OWNER as well as by the device
 * marker: `sessions.user_id` is `NOT NULL` while its foreign key is
 * `ON DELETE set null`, so a session left pointing at a fixture account makes
 * the account's own delete fail the constraint - and one case here writes a
 * row with no device label at all to prove a null one is accepted.
 */
const removeFixtures = async (): Promise<void> => {
  await payload.db.pool.query(
    `DELETE FROM sessions
      WHERE device = $1 OR user_id IN (SELECT id FROM users WHERE email LIKE $2)`,
    [FIXTURE_DEVICE, `${FIXTURE_EMAIL_PREFIX}%`],
  )
  await payload.db.pool.query(`DELETE FROM users WHERE email LIKE $1`, [`${FIXTURE_EMAIL_PREFIX}%`])
}

beforeAll(async () => {
  payload = await getTestPayload()
  // `pgcrypto` gives this file's own probes a `digest()` with which to find a
  // row by the identifier it was issued under, WITHOUT importing the module
  // under test's hashing. A probe that reused it would agree with the service
  // by construction and could never catch it storing the wrong thing.
  await payload.db.pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto')
  sessions = createSessionService({ payload, now: Date.now })
  // Cleaned at BOTH ends: fixture addresses are derived from a counter and so
  // repeat run to run, and a run has to be able to start from whatever an
  // interrupted one left behind.
  await removeFixtures()
})

afterAll(async () => {
  await removeFixtures()
})

describe('starting a session', () => {
  it('names the account a live session belongs to', async () => {
    const account = await anAccount()
    const issued = await aSessionFor(account.id)

    const authenticated = await sessions.authenticate(issued.session)

    expect(authenticated).toEqual({ ok: true, value: { user: account.id } })
  })

  it('refuses an identifier no row was ever issued for', async () => {
    const refused = await sessions.authenticate(anUnissuedIdentifier('never-issued'))

    expect(refused).toEqual({ ok: false, error: 'unknown' })
  })

  it('refuses to sign in an account id that is not a row id at all', async () => {
    const notARow = userId('definitely-not-a-row-id')
    /* c8 ignore next -- a non-empty literal is never the empty string `userId` refuses */
    if (!isOk(notARow)) throw new Error('the fixture account id is empty')

    const refused = await sessions.startSession({
      user: notARow.value,
      previous: null,
      keepSignedIn: false,
      device: FIXTURE_DEVICE,
      location: FIXTURE_LOCATION,
    })

    expect(refused).toEqual({ ok: false, error: 'unknown-account' })
  })

  it('refuses to sign in a row id no account holds', async () => {
    const absent = userId('2000000000')
    /* c8 ignore next -- a non-empty literal is never the empty string `userId` refuses */
    if (!isOk(absent)) throw new Error('the fixture account id is empty')

    const refused = await sessions.startSession({
      user: absent.value,
      previous: null,
      keepSignedIn: false,
      device: FIXTURE_DEVICE,
      location: FIXTURE_LOCATION,
    })

    expect(refused).toEqual({ ok: false, error: 'unknown-account' })
  })

  it('stores only a hash of the identifier, never the identifier itself', async () => {
    const account = await anAccount()
    const issued = await aSessionFor(account.id)

    const { rows } = await payload.db.pool.query<{ token_hash: string }>(
      `SELECT token_hash FROM sessions WHERE user_id = $1`,
      [account.row],
    )

    expect(rows.map((row) => row.token_hash)).not.toContain(issued.session)
    // And the hash is what a lookup actually finds the row by, so "it stored
    // something else" is not confused with "it stored nothing useful".
    expect(await storedExpiryOf(issued.session)).toBeGreaterThan(0)
  })

  it('records a session with no device and no location, since the account screen shows what it knows', async () => {
    // Both columns are nullable and both are bound straight into the INSERT,
    // so a `null` reaching the driver is a path the fixtures above never take
    // - and an untested path that throws at runtime is exactly the shape of
    // defect this suite exists to prevent.
    const account = await anAccount()

    const issued = await sessions.startSession({
      user: account.id,
      previous: null,
      keepSignedIn: false,
      device: null,
      location: null,
    })
    /* c8 ignore next -- a session for a freshly created account is never refused; the guard unwraps the Result */
    if (!isOk(issued)) throw new Error(`the session was refused: ${issued.error}`)

    expect(await sessions.authenticate(issued.value.session)).toEqual({ ok: true, value: { user: account.id } })
  })

  it('hands back a cookie carrying the identifier under the admin cookie policy', async () => {
    const account = await anAccount()
    const issued = await aSessionFor(account.id)

    // The attributes themselves are asserted one by one in
    // `packages/domain/src/auth/session.test.ts`; what this pins is that the
    // service issues the policy's cookie rather than assembling one of its
    // own that happens to look similar.
    expect(issued.cookie).toContain(issued.session)
    expect(issued.cookie.split('; ')).toEqual(expect.arrayContaining(['HttpOnly', 'Secure', 'SameSite=Lax']))
  })

  it('stamps last seen on the row when a session authenticates, so the account screen can say when', async () => {
    const account = await anAccount()
    const issued = await aSessionFor(account.id)

    await sessions.authenticate(issued.session)

    const { rows } = await payload.db.pool.query<{ last_seen_at: Date | null }>(
      `SELECT last_seen_at FROM sessions WHERE user_id = $1`,
      [account.row],
    )
    expect(rows.map((row) => row.last_seen_at)).not.toContain(null)
  })
})

describe('rotation on sign-in', () => {
  it('issues an identifier different from the one the browser arrived with', async () => {
    const account = await anAccount()
    const preAuth = anUnissuedIdentifier('pre-auth')

    const issued = await aSessionFor(account.id, { previous: preAuth })

    expect(issued.session).not.toBe(preAuth)
  })

  it('leaves the pre-auth identifier authenticating nothing, since it never named a row', async () => {
    const account = await anAccount()
    const preAuth = anUnissuedIdentifier('pre-auth')

    await aSessionFor(account.id, { previous: preAuth })

    expect(await sessions.authenticate(preAuth)).toEqual({ ok: false, error: 'unknown' })
  })

  it('stops the previous identifier authenticating the moment a new one is issued', async () => {
    // The case the brief names: an identifier that WAS working, and must stop
    // the instant sign-in supersedes it. A rotation that merely returns a new
    // identifier passes every other case in this file and fails this one.
    const account = await anAccount()
    const first = await aSessionFor(account.id)
    expect(await sessions.authenticate(first.session)).toEqual({ ok: true, value: { user: account.id } })

    const second = await aSessionFor(account.id, { previous: first.session })

    expect(await sessions.authenticate(first.session)).toEqual({ ok: false, error: 'revoked' })
    expect(await sessions.authenticate(second.session)).toEqual({ ok: true, value: { user: account.id } })
  })

  it("supersedes only the identifier presented, leaving the account's other devices signed in", async () => {
    // Rotation is not "sign out everywhere" wearing a different name: a
    // reader signing in on a laptop must not lose the phone in their pocket.
    const account = await anAccount()
    const phone = await aSessionFor(account.id)
    const laptop = await aSessionFor(account.id)

    await aSessionFor(account.id, { previous: laptop.session })

    expect(await sessions.authenticate(phone.session)).toEqual({ ok: true, value: { user: account.id } })
  })
})

describe('keep me signed in', () => {
  it('gives a remembered sign-in a longer-lived row than an ordinary one', async () => {
    const account = await anAccount()
    const startedAt = Date.now()

    const remembered = await aSessionFor(account.id, { keepSignedIn: true })

    // Compared against the stored column, not the returned figure, and with a
    // minute of slack for the round trip - the claim is the ORDER of
    // magnitude, since an implementation that lengthened the token instead
    // would leave this column at the short lifetime.
    const stored = await storedExpiryOf(remembered.session)
    expect(stored - startedAt).toBeGreaterThan(REMEMBERED_SESSION_LIFETIME_MS - 60_000)
  })

  it('gives an ordinary sign-in the short lifetime, so the long one is a choice and not the default', async () => {
    const account = await anAccount()
    const startedAt = Date.now()

    const ordinary = await aSessionFor(account.id)

    const stored = await storedExpiryOf(ordinary.session)
    expect(stored - startedAt).toBeGreaterThan(SESSION_LIFETIME_MS - 60_000)
    expect(stored - startedAt).toBeLessThan(SESSION_LIFETIME_MS + 60_000)
  })

  it('hands the browser the same shape of identifier either way, so the lifetime is not inside the token', async () => {
    const account = await anAccount()

    const ordinary = await aSessionFor(account.id)
    const remembered = await aSessionFor(account.id, { keepSignedIn: true })

    expect(remembered.session.length).toBe(ordinary.session.length)
    // A JWT carries its own expiry in a dot-separated payload. An opaque
    // identifier has nothing to carry one in, which is the whole of
    // `SECURITY.md`'s "not a longer JWT".
    expect(remembered.session).not.toContain('.')
  })

  it('refuses a remembered session whose row has been aged past its expiry, so the row is what decides', async () => {
    // The assertion that separates "a longer-lived row" from "a longer-lived
    // token": the identifier and its cookie are untouched and still say
    // thirty days, and the session is refused anyway.
    const account = await anAccount()
    const remembered = await aSessionFor(account.id, { keepSignedIn: true })

    await ageSessionPastItsExpiry(remembered.session)

    expect(await sessions.authenticate(remembered.session)).toEqual({ ok: false, error: 'expired' })
  })
})

describe('keeping the table bounded', () => {
  it('deletes dead sessions belonging to OTHER accounts when one is started', async () => {
    // THE CROSS-KEY HALF. A prune scoped to the account being written bounds
    // this table by the number of accounts ever seen rather than by anything
    // — ruling F33's finding for `sign_in_attempts`, and blocker B4's for
    // this table, which had no cleanup at all.
    await clearDeadSessions()
    const stale = await anAccount()
    const expired = await aSessionFor(stale.id)
    await ageSessionPastItsExpiry(expired.session)
    const revoked = await aSessionFor(stale.id)
    await sessions.revokeSession({ session: revoked.session, owner: stale.id })
    const writer = await anAccount()

    await aSessionFor(writer.id)

    expect(await sessionCountOf(stale.row)).toBe(0)
  })

  it('leaves a live session of another account alone, because it can still authenticate', async () => {
    // The sweep's condition is exactly `sessionState`'s two refusals, read
    // from the same two columns. A sweep one day wider than that is a reader
    // signed out with no cause.
    await clearDeadSessions()
    const bystander = await anAccount()
    const live = await aSessionFor(bystander.id)
    const writer = await anAccount()

    await aSessionFor(writer.id)

    expect(await sessions.authenticate(live.session)).toEqual({ ok: true, value: { user: bystander.id } })
  })

  it('still supersedes the identifier the browser arrived with when its row is already dead', async () => {
    // The row being superseded is excluded from the sweep, so the `UPDATE`
    // and the `DELETE` in one statement are never two commands racing over
    // one row. Without the exclusion this is undefined behaviour rather than
    // a decision anybody made.
    await clearDeadSessions()
    const account = await anAccount()
    const carried = await aSessionFor(account.id)
    await ageSessionPastItsExpiry(carried.session)

    const replacement = await aSessionFor(account.id, { previous: carried.session })

    // `'revoked'` rather than `'unknown'` is the point: the row was SUPERSEDED
    // by the `UPDATE`, not removed by the `DELETE`. Either answer refuses the
    // identifier, so an assertion that only said "refused" would pass whether
    // or not the two commands had collided over it.
    expect(await sessions.authenticate(carried.session)).toEqual({ ok: false, error: 'revoked' })
    expect(await sessions.authenticate(replacement.session)).toEqual({ ok: true, value: { user: account.id } })
  })
})

describe('revocation', () => {
  it('refuses a session revoked through this module, immediately', async () => {
    const account = await anAccount()
    const issued = await aSessionFor(account.id)

    const revoked = await sessions.revokeSession({ session: issued.session, owner: account.id })

    expect(revoked).toEqual({ ok: true, value: undefined })
    expect(await sessions.authenticate(issued.session)).toEqual({ ok: false, error: 'revoked' })
  })

  it('refuses to un-revoke a session by writing revokedAt back to null through the API', async () => {
    // FOUND BY REVIEW, ROUND 1. Revocation used to be an ordinary field write
    // by the row's owner, which meant the owner could write it back. Measured
    // before the fix: a session answering `{ ok: false, error: 'revoked' }`
    // answered `{ ok: true, value: { user: '106' } }` again after one PATCH.
    // Revoke is decorative against the one person most motivated to undo it,
    // and this is cross-account for a reason that is easy to miss: the account
    // holder and the thief holding a stolen session are the SAME principal as
    // far as this collection is concerned, so "only the owner can write it" is
    // not a restriction on the attacker at all.
    const account = await anAccount()
    const issued = await aSessionFor(account.id)
    const reader = await payload.findByID({ collection: 'users', id: account.row })
    await sessions.revokeSession({ session: issued.session, owner: account.id })
    expect(await sessions.authenticate(issued.session)).toEqual({ ok: false, error: 'revoked' })

    await payload.update({
      collection: 'sessions',
      id: await onlySessionRowOf(account.row),
      overrideAccess: false,
      user: reader,
      data: { revokedAt: null },
    })

    expect(await sessions.authenticate(issued.session)).toEqual({ ok: false, error: 'revoked' })
  })

  it('refuses to re-point a session at another account, so an owner cannot escalate into one', async () => {
    // FOUND BY REVIEW, ROUND 1, and the sharper of the two: `user` is the very
    // field the ownership predicate READS to decide ownership, so leaving it
    // writable let the holder of one account rewrite whose session their own
    // row is. Measured before the fix: Alice moved her row's `user` from 104
    // to Bob's 105 and her UNCHANGED identifier then authenticated as
    // `{ user: '105' }`. Cross-account by construction - a single-account
    // fixture has no other account to escalate into, which is exactly why the
    // first round of tests here did not see it.
    const mine = await anAccount()
    const theirs = await anAccount()
    const issued = await aSessionFor(mine.id)
    const reader = await payload.findByID({ collection: 'users', id: mine.row })

    await payload.update({
      collection: 'sessions',
      id: await onlySessionRowOf(mine.row),
      overrideAccess: false,
      user: reader,
      data: { user: theirs.row },
    })

    // The identifier is untouched. What it names must still be my account.
    expect(await sessions.authenticate(issued.session)).toEqual({ ok: true, value: { user: mine.id } })
  })

  it("refuses every one of an account's sessions after signing out everywhere", async () => {
    const account = await anAccount()
    const phone = await aSessionFor(account.id)
    const laptop = await aSessionFor(account.id)
    const desk = await aSessionFor(account.id)

    const swept = await sessions.revokeAllSessions({ owner: account.id })

    expect(swept).toEqual({ revoked: 3 })
    for (const issued of [phone, laptop, desk]) {
      expect(await sessions.authenticate(issued.session)).toEqual({ ok: false, error: 'revoked' })
    }
  })

  it('signs out only the account asked for, so one reader cannot sign another out', async () => {
    const mine = await anAccount()
    const theirs = await anAccount()
    const myself = await aSessionFor(mine.id)
    const somebodyElse = await aSessionFor(theirs.id)

    await sessions.revokeAllSessions({ owner: mine.id })

    expect(await sessions.authenticate(myself.session)).toEqual({ ok: false, error: 'revoked' })
    expect(await sessions.authenticate(somebodyElse.session)).toEqual({ ok: true, value: { user: theirs.id } })
  })

  it('refuses to revoke a session belonging to another account, and leaves it working', async () => {
    const mine = await anAccount()
    const theirs = await anAccount()
    const somebodyElse = await aSessionFor(theirs.id)

    const refused = await sessions.revokeSession({ session: somebodyElse.session, owner: mine.id })

    expect(refused).toEqual({ ok: false, error: 'unknown' })
    expect(await sessions.authenticate(somebodyElse.session)).toEqual({ ok: true, value: { user: theirs.id } })
  })

  it('refuses to revoke on behalf of an account id that is not a row id at all', async () => {
    // The brand promises a non-empty string, not a Payload id, so a caller
    // can hand over something that is neither. Answering the refusal here is
    // what stops `Number('nonsense')` reaching the driver as NaN and escaping
    // past the `Result` contract as a raw query error.
    const account = await anAccount()
    const issued = await aSessionFor(account.id)
    const notARow = userId('definitely-not-a-row-id')
    /* c8 ignore next -- a non-empty literal is never the empty string `userId` refuses */
    if (!isOk(notARow)) throw new Error('the fixture account id is empty')

    const refused = await sessions.revokeSession({ session: issued.session, owner: notARow.value })

    expect(refused).toEqual({ ok: false, error: 'unknown' })
    expect(await sessions.authenticate(issued.session)).toEqual({ ok: true, value: { user: account.id } })
  })

  it('signs nothing out for an account id that is not a row id at all', async () => {
    const notARow = userId('definitely-not-a-row-id')
    /* c8 ignore next -- a non-empty literal is never the empty string `userId` refuses */
    if (!isOk(notARow)) throw new Error('the fixture account id is empty')

    const swept = await sessions.revokeAllSessions({ owner: notARow.value })

    expect(swept).toEqual({ revoked: 0 })
  })

  it('reports a second revocation of the same session as unknown, since there is nothing left to revoke', async () => {
    const account = await anAccount()
    const issued = await aSessionFor(account.id)
    await sessions.revokeSession({ session: issued.session, owner: account.id })

    const again = await sessions.revokeSession({ session: issued.session, owner: account.id })

    expect(again).toEqual({ ok: false, error: 'unknown' })
  })
})
