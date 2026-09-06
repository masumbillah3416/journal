/**
 * sessions.access.integration.test.ts — the `sessions` access rule, asserted
 * ACROSS two accounts against a real Payload and a real Postgres.
 *
 * Integration test (CLAUDE.md §2). It has its own file rather than a case in
 * `collections.integration.test.ts` for two reasons: that file is already
 * nine hundred lines, and the rule here is a different shape from the three
 * server-only collections it guards. Those refuse everybody; this one narrows
 * every operation to the caller's own rows, because the account screen's
 * "Where you are signed in" list and its Revoke button legitimately read and
 * write them.
 *
 * EVERY CASE IS CROSS-ACCOUNT, AND THAT IS THE WHOLE POINT. The defect this
 * file was written for is that `sessions` declared no `access` block at all,
 * so Payload's `defaultAccess` — "signed in, or refused" — applied to all four
 * operations and any signed-in user could read, update and delete every OTHER
 * user's session rows. A suite with one account cannot detect that class of
 * bug at all: every assertion it can make is satisfied by "signed in", which
 * is exactly what the broken configuration granted. So there are two accounts
 * here, each with a session of its own, and the assertions are about what one
 * can do to the other's row.
 *
 * THE ROWS ARE REAL, for the reason `collections.integration.test.ts` records
 * beside its own guards: an `update` or `delete` aimed at an id that does not
 * exist is refused for being absent rather than for being forbidden, so a
 * guard written against `id: '1'` passes with or without the rule.
 *
 * Uses `getTestPayload()`, not `getPayload()` directly, so this file connects
 * to the isolated `diary_test` database rather than a developer's own — see
 * that module's header.
 * Depends on: vitest, ../lib/testPayload.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getTestPayload } from '../lib/testPayload'

/** The prefix both fixture accounts' addresses carry, so `afterAll` finds exactly them. */
const FIXTURE_EMAIL_PREFIX = 'test-sessions-access-'

/** The first fixture account's address. */
const ALICE_EMAIL = `${FIXTURE_EMAIL_PREFIX}alice@example.com`

/** The second fixture account's address. */
const BOB_EMAIL = `${FIXTURE_EMAIL_PREFIX}bob@example.com`

/** The marker every fixture session row carries, so `afterAll` can find them all. */
const FIXTURE_DEVICE = 'test-sessions-access-device'

/** How far into the future a fixture session's expiry is set. */
const FIXTURE_LIFETIME_MS = 60 * 60_000

/** The shared test Payload instance, assigned by `beforeAll`. */
let payload: Awaited<ReturnType<typeof getTestPayload>>

/** The first account, and the caller every cross-account case acts as. */
let alice: Awaited<ReturnType<typeof anAccount>>

/** The second account, whose rows Alice must not be able to touch. */
let bob: Awaited<ReturnType<typeof anAccount>>

/** Alice's own session row, the control the ownership cases pass against. */
let aliceSession: Awaited<ReturnType<typeof aSessionFor>>

/** Bob's session row, the one every refusal case is aimed at. */
let bobSession: Awaited<ReturnType<typeof aSessionFor>>

/**
 * Creates one fixture account.
 *
 * A function rather than an inline `payload.create` so its type is inferred
 * for the `user:` argument below without this file naming any of Payload's
 * generated types — the same shape `collections.integration.test.ts` uses.
 * @param email - The address to create it under.
 * @returns The created account.
 */
const anAccount = async (email: string) =>
  payload.create({ collection: 'users', data: { email, password: 'not-a-real-password' } })

/**
 * Creates one session row belonging to `account`.
 *
 * The hash is a fixed stand-in rather than a real one: nothing here
 * authenticates: `apps/web/lib/auth/sessions.integration.test.ts` is where
 * what goes IN the column is asserted, and this file is about who may see and
 * change the row.
 * @param account - The row id of the account the session belongs to.
 * @param marker - A value unique to this row, so an assertion can name it.
 * @returns The created row.
 */
const aSessionFor = async (account: number, marker: string) =>
  payload.create({
    collection: 'sessions',
    data: {
      user: account,
      tokenHash: `${marker}-${'0'.repeat(64)}`.slice(0, 64),
      expiresAt: new Date(Date.now() + FIXTURE_LIFETIME_MS).toISOString(),
      device: FIXTURE_DEVICE,
    },
  })

/** Removes every row and account this file creates, at both ends of the run. */
const removeFixtures = async (): Promise<void> => {
  const sessions = await payload.find({
    collection: 'sessions',
    where: { device: { equals: FIXTURE_DEVICE } },
    limit: 100,
  })
  for (const row of sessions.docs) await payload.delete({ collection: 'sessions', id: row.id })

  for (const email of [ALICE_EMAIL, BOB_EMAIL]) {
    const accounts = await payload.find({ collection: 'users', where: { email: { equals: email } } })
    for (const account of accounts.docs) await payload.delete({ collection: 'users', id: account.id })
  }
}

beforeAll(async () => {
  payload = await getTestPayload()
  // Cleaned at BOTH ends: `users.email` is unique, so a row left behind by an
  // interrupted run would fail inside the fixture rather than in the
  // assertion it was written for.
  await removeFixtures()
  alice = await anAccount(ALICE_EMAIL)
  bob = await anAccount(BOB_EMAIL)
  aliceSession = await aSessionFor(alice.id, 'alice')
  bobSession = await aSessionFor(bob.id, 'bob')
})

afterAll(async () => {
  await removeFixtures()
})

describe('the sessions access rule', () => {
  it('shows a signed-in reader their own session, so the account screen has something to list', async () => {
    const found = await payload.find({ collection: 'sessions', overrideAccess: false, user: alice })

    expect(found.docs.map((row) => row.id)).toEqual([aliceSession.id])
  })

  it('withholds another account\'s session from a signed-in reader, so one holder cannot enumerate another\'s devices', async () => {
    const found = await payload.find({
      collection: 'sessions',
      overrideAccess: false,
      user: alice,
      where: { id: { equals: bobSession.id } },
    })

    expect(found.docs).toHaveLength(0)
  })

  it('refuses a revoke aimed at another account\'s session, so Revoke cannot sign somebody else out', async () => {
    const attempt = payload.update({
      collection: 'sessions',
      id: bobSession.id,
      overrideAccess: false,
      user: alice,
      data: { revokedAt: new Date().toISOString() },
    })

    await expect(attempt).rejects.toThrow()
  })

  it('refuses a delete aimed at another account\'s session, so the list cannot be cleared from outside', async () => {
    const attempt = payload.delete({
      collection: 'sessions',
      id: bobSession.id,
      overrideAccess: false,
      user: alice,
    })

    await expect(attempt).rejects.toThrow()

    // The row is still there. A `delete` refused for the WRONG reason - a
    // row that was already gone - would satisfy the rejection above and say
    // nothing about the rule.
    const survivor = await payload.findByID({ collection: 'sessions', id: bobSession.id })
    expect(survivor.id).toBe(bobSession.id)
  })

  it('lets a signed-in reader revoke their own session, because otherwise the rule has locked out the account screen', async () => {
    // The positive control. Every refusal above is satisfied by a collection
    // that refuses everybody, which is what the three server-only collections
    // do and what this one must NOT do.
    const revoked = await payload.update({
      collection: 'sessions',
      id: aliceSession.id,
      overrideAccess: false,
      user: alice,
      data: { revokedAt: new Date().toISOString() },
    })

    expect(revoked.revokedAt).not.toBeNull()
  })

  it('refuses to create a session row through the API, so a session cannot be forged', async () => {
    const attempt = payload.create({
      collection: 'sessions',
      overrideAccess: false,
      user: alice,
      data: {
        user: alice.id,
        tokenHash: 'f'.repeat(64),
        expiresAt: new Date(Date.now() + FIXTURE_LIFETIME_MS).toISOString(),
        device: FIXTURE_DEVICE,
      },
    })

    await expect(attempt).rejects.toThrow()
  })

  it('refuses a signed-out read outright, since a session list belongs to somebody', async () => {
    // A flat rejection rather than an empty page, and the difference is the
    // access function's two arms: with no caller there is no row set to
    // narrow to, so it answers `false` and Payload refuses the operation
    // before it queries anything.
    const attempt = payload.find({ collection: 'sessions', overrideAccess: false })

    await expect(attempt).rejects.toThrow()
  })

  it('refuses a signed-out delete of a real session row', async () => {
    const attempt = payload.delete({ collection: 'sessions', id: bobSession.id, overrideAccess: false })

    await expect(attempt).rejects.toThrow()
  })

  it('never returns the token hash, even on the reader\'s own row', async () => {
    const found = await payload.find({
      collection: 'sessions',
      overrideAccess: false,
      user: alice,
      where: { id: { equals: aliceSession.id } },
    })

    expect(found.docs[0]).not.toHaveProperty('tokenHash')
  })

  it('ignores a write to the token hash on the reader\'s own row, so a session cannot be re-pointed', async () => {
    const forged = 'a'.repeat(64)

    await payload.update({
      collection: 'sessions',
      id: aliceSession.id,
      overrideAccess: false,
      user: alice,
      data: { tokenHash: forged },
    })

    // Read back WITH override, since the field is unreadable through the API
    // - the question is what the database holds, not what the API shows.
    const stored = await payload.findByID({ collection: 'sessions', id: aliceSession.id })
    expect(stored.tokenHash).not.toBe(forged)
  })

  it('ignores a write to the expiry on the reader\'s own row, so nobody can extend their own session', async () => {
    const before = await payload.findByID({ collection: 'sessions', id: aliceSession.id })
    const aYearOut = new Date(Date.now() + 365 * 24 * 60 * 60_000).toISOString()

    await payload.update({
      collection: 'sessions',
      id: aliceSession.id,
      overrideAccess: false,
      user: alice,
      data: { expiresAt: aYearOut },
    })

    const after = await payload.findByID({ collection: 'sessions', id: aliceSession.id })
    expect(after.expiresAt).toBe(before.expiresAt)
  })
})
