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
import type { Session } from '../payload-types'
import { Sessions } from './sessions'

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

/**
 * Removes every row and account this file creates, at both ends of the run.
 *
 * SESSIONS ARE MATCHED BY OWNER, NOT BY THE DEVICE MARKER, and that is not
 * tidiness. The per-field sweep below attempts to write every field, `device`
 * among them, so under a mutation that lets one through, the marker this
 * cleanup used to key on is the very value the test just changed - the row
 * then survives, and deleting its account fails on `sessions.user_id`, which
 * is `NOT NULL` while its foreign key is `ON DELETE set null`
 * (`docs/data-model.md`). Measured: one mutation run left a `probe-device` row
 * behind and the whole file was skipped on the next run with a not-null
 * violation, several cases away from the mutation that caused it. Raw SQL
 * rather than Payload's own delete, so the order is ours and one statement
 * clears both possibilities.
 */
const removeFixtures = async (): Promise<void> => {
  await payload.db.pool.query(
    `DELETE FROM sessions
      WHERE device = $1 OR user_id IN (SELECT id FROM users WHERE email LIKE $2)`,
    [FIXTURE_DEVICE, `${FIXTURE_EMAIL_PREFIX}%`],
  )
  await payload.db.pool.query(`DELETE FROM users WHERE email LIKE $1`, [`${FIXTURE_EMAIL_PREFIX}%`])
}

/**
 * Every field name the `sessions` collection declares.
 *
 * Read off the collection config rather than written out here - see the sweep
 * case for why. `name` is narrowed rather than asserted: Payload's field union
 * includes presentational entries (rows, tabs) that carry none, and this
 * collection has none today, so filtering is how a future one is skipped
 * instead of crashing the sweep.
 * @returns The declared field names, in declaration order.
 */
const writableFieldNames = (): string[] =>
  Sessions.fields.flatMap((field) => ('name' in field ? [field.name] : []))

/** The instant every date-typed field is probed with. Far outside any fixture's own values. */
const PROBE_INSTANT = '2030-01-01T00:00:00.000Z'

/**
 * A value to attempt writing into `field`, guaranteed to differ from what the
 * fixture row holds.
 *
 * `user` is probed with the OTHER account, which is what makes the sweep
 * cross-account for the one field where that matters: re-pointing a row at
 * another account is escalation, not merely an unwanted edit.
 * @param field - The field's declared name.
 * @returns The probe value.
 * @throws If the collection declares a field this function has no probe for -
 *   deliberately loud, since a silently unprobed field is an unswept one.
 */
const probeValueFor = (field: string): unknown => {
  if (field === 'user') return bob.id
  const declared = Sessions.fields.find((entry) => 'name' in entry && entry.name === field)
  if (declared === undefined) throw new Error(`no such field on sessions: ${field}`)
  if (declared.type === 'date') return PROBE_INSTANT
  if (declared.type === 'text') return `probe-${field}`
  throw new Error(`no probe value for a ${declared.type} field on sessions: ${field}`)
}

/**
 * Every column Postgres holds for one session row, bar `updated_at`.
 *
 * `SELECT *` rather than a named list, so a column a future field adds is
 * compared without anybody remembering to add it. `updated_at` is dropped
 * because Payload stamps it on any accepted update, which is not a field write
 * and would make the comparison fail for the wrong reason - which is also why
 * `updatedAt` is the one field whose refusal this sweep cannot prove
 * load-bearing. See the comment at that field in `sessions.ts`; it is measured
 * and stated there rather than left to be assumed here.
 * @param row - The session row's id.
 * @returns The row as a plain record.
 */
const storedRow = async (row: number): Promise<Record<string, unknown>> => {
  const { rows } = await payload.db.pool.query<Record<string, unknown>>(`SELECT * FROM sessions WHERE id = $1`, [row])
  return rows.reduce<Record<string, unknown>>(
    (found, current) => ({
      ...found,
      ...Object.fromEntries(Object.entries(current).filter(([column]) => column !== 'updated_at')),
    }),
    {},
  )
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

  it('refuses any update aimed at another account row, so nothing about somebody else session is reachable', async () => {
    const attempt = payload.update({
      collection: 'sessions',
      id: bobSession.id,
      overrideAccess: false,
      user: alice,
      data: { device: 'somebody-else-device' },
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

  it('accepts an update aimed at the reader own row, so it is the field rules that refuse and not the collection', async () => {
    // The positive control, and it changed shape in review round 1. It used to
    // revoke through this path, which is precisely the hole that round found:
    // revocation is now server-side (`revokeSession`). What is left for the
    // collection-level rule to buy is that an owner's own request is ADMITTED
    // rather than rejected outright - which is what keeps the field-level
    // predicates below reachable, and what distinguishes this collection from
    // the three that refuse everybody.
    const accepted = await payload.update({
      collection: 'sessions',
      id: aliceSession.id,
      overrideAccess: false,
      user: alice,
      data: { device: FIXTURE_DEVICE },
    })

    expect(accepted.id).toBe(aliceSession.id)
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
  // THE PER-FIELD SWEEP, and it exists because review round 1 found two holes
  // this file's first version could not have seen. Those cases enumerated
  // OPERATIONS - read, create, update, delete - and asserted the right ones
  // were refused. Both escapes were fields inside an operation that was
  // correctly permitted: `user`, which the ownership predicate itself reads,
  // and `revokedAt`, which decides whether a revoked session stays revoked.
  //
  // THE FIELD LIST COMES FROM THE COLLECTION, NOT FROM A LITERAL HERE. A field
  // added to `Sessions` tomorrow is probed by this case the day it lands, and
  // the case fails until somebody decides it is deliberately writable. A
  // hand-written list would have to be remembered, and the whole lesson of this
  // round is that a list somebody has to remember is a list that goes stale.
  //
  // THE SNAPSHOT IS `SELECT *`, for the same reason: it compares every COLUMN,
  // including any a future field adds, rather than the ones a reader thought to
  // name. `updated_at` is excluded because Payload stamps it on any accepted
  // update, which is not a field write.
  it('leaves every column of the reader own row untouched by any update they can make', async () => {
    const before = await storedRow(aliceSession.id)

    for (const field of writableFieldNames()) {
      await payload.update({
        collection: 'sessions',
        id: aliceSession.id,
        overrideAccess: false,
        user: alice,
        // Typed as the collection's own document rather than cast: the case
        // is deliberately generic over the field LIST, but each value it sends
        // still has to be one the collection could hold. `probeValueFor`
        // covers every field type declared here and throws loudly on one it
        // does not, so a field added with a new type fails here rather than
        // being silently unprobed.
        data: { [field]: probeValueFor(field) } satisfies Partial<Session>,
      })
    }

    expect(await storedRow(aliceSession.id)).toEqual(before)
  })

})
