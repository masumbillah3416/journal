/**
 * adminScope.integration.test.ts — behaviour spec for the one scope every
 * admin read and write is made under.
 *
 * Integration test (CLAUDE.md §2): the property is not "the object has two
 * keys" — that is a restatement of the type. It is that a call made WITH this
 * scope is refused by the rules Phase 4 Task 1 wrote onto the collections, and
 * the same call made WITHOUT it is not. Only a real Payload over a real
 * Postgres can answer that, because the refusal is Payload's and the rule is
 * `apps/web/collections/users.ts`'s.
 *
 * Uses `getTestPayload()` rather than `getPayload()` directly, like every
 * other integration file here, so the rows below are written to the isolated
 * `diary_test` database (see `apps/web/lib/testPayload.ts`). `adminScope`
 * itself calls `getPayload()`, which is the same memoised instance
 * `getTestPayload()` bootstraps — so the module under test reaches the test
 * database without knowing anything about tests.
 *
 * Every row it creates carries {@link MARKER} in its email and is deleted
 * before and after the run: before, because a previous crashed run would
 * otherwise collide with the unique index on `email`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'
import { userId } from '@travel-diary/domain/ids'
import type { UserId } from '@travel-diary/domain/ids'
import { getTestPayload } from '../testPayload'
import { adminScope } from './adminScope'

/** What every row this file writes carries, so cleanup can find them all. */
const MARKER = 'test-admin-scope'

/** A password that is not one: these accounts are never signed in to. */
const NOT_A_PASSWORD = 'not-a-real-password'

let payload: Payload
let other: number

/**
 * A branded account id for a row id.
 *
 * `userId` answers a `Result`; a session only ever carries the brand, which is
 * exactly why `adminScope` has to resolve the row itself.
 * @param raw - The id as the session spells it.
 * @returns The branded id.
 */
const anAccount = (raw: string): UserId => {
  const built = userId(raw)
  if (!built.ok) throw new Error(built.error)
  return built.value
}

/** What Payload answered when it refused a call, reduced to what is asserted. */
interface Refusal {
  /** Payload's own class name for the refusal — `Forbidden`, `NotFound`. */
  readonly name: string
  /** The HTTP status that class carries. */
  readonly status: number
}

/**
 * The refusal a call produced.
 *
 * `rejects.toThrow()` passes for ANY throw, so a misspelled collection would
 * satisfy the access-control cases below. This reads the error through
 * `unknown` and narrows it (CLAUDE.md §0.8 — `expect.objectContaining` returns
 * `any`), and turns "it resolved" into a failure that says so.
 * @param call - The Local API call expected to be refused.
 * @returns The refusal's class name and status.
 * @throws When the call resolved, or threw something that is not one of
 *   Payload's errors.
 */
const refusalOf = async (call: Promise<unknown>): Promise<Refusal> => {
  try {
    await call
  } catch (error: unknown) {
    if (error instanceof Error && 'status' in error && typeof error.status === 'number') {
      return { name: error.name, status: error.status }
    }
    throw new Error(`refused with something that is not one of Payload's errors: ${String(error)}`)
  }
  throw new Error('the call was not refused at all')
}

/**
 * Creates one account for a case to act on or against.
 * @param name - What distinguishes this account's email from the others'.
 * @returns The created row.
 */
const anAccountRow = async (name: string) =>
  payload.create({
    collection: 'users',
    data: { email: `${MARKER}-${name}@example.test`, password: NOT_A_PASSWORD },
  })

/** Removes every row this file has ever written. */
const clean = async (): Promise<void> => {
  await payload.delete({ collection: 'users', where: { email: { like: MARKER } } })
}

beforeAll(async () => {
  payload = await getTestPayload()
  await clean()
  other = (await anAccountRow('other')).id
}, 60_000)

afterAll(async () => {
  await clean()
})

describe('adminScope', () => {
  it('carries the account the session names, read from the row rather than from the brand', async () => {
    const mine = await anAccountRow('mine')

    const scope = await adminScope({ user: anAccount(String(mine.id)) })

    // `email` is the load-bearing half. The session carried the id and nothing
    // else, so an address on the left can only have come out of the row — a
    // scope that merely re-branded its argument would answer `undefined` here.
    expect(scope.user.email).toBe(`${MARKER}-mine@example.test`)
    expect(scope.user.id).toBe(mine.id)
    expect(scope.user.collection).toBe('users')
  })

  it('makes Payload refuse a write the guard alone would have allowed', async () => {
    const mine = await anAccountRow('refuse')
    const scope = await adminScope({ user: anAccount(String(mine.id)) })

    // Same call, twice, differing only in the scope. Without it Payload runs
    // with access control off and the write lands on somebody else's account;
    // with it, Task 1's `ownAccountOnly` refuses. If the first half ever stops
    // succeeding, this case has stopped measuring what it claims to.
    const withoutScope = await payload.update({
      collection: 'users',
      id: other,
      data: { notifyWeekly: true },
    })
    expect(withoutScope.notifyWeekly).toBe(true)

    // `Forbidden` by name, not any throw: a misspelled collection, a scope
    // carrying a user Payload cannot find, or the row having vanished would
    // all satisfy a bare `rejects.toThrow()` and none of them is access
    // control. Measured: Payload answers `Forbidden`, status 403.
    const refusal = await refusalOf(
      payload.update({ collection: 'users', id: other, ...scope, data: { notifyWeekly: false } }),
    )
    expect(refusal).toEqual({ name: 'Forbidden', status: 403 })

    // Read back from the table, not from the rejected call's own answer.
    const afterwards = await payload.findByID({ collection: 'users', id: other, depth: 0 })
    expect(afterwards.notifyWeekly).toBe(true)
  })

  it('still lets the account write its OWN row, so the refusal above is a rule and not a wall', async () => {
    const mine = await anAccountRow('permit')
    const scope = await adminScope({ user: anAccount(String(mine.id)) })

    // THE PERMITTED SIDE. Without this, a scope carrying a user Payload judges
    // as nobody — a wrong id, a missing `collection`, an empty object — refuses
    // the case above exactly as `ownAccountOnly` does, and every admin screen
    // built on it would be dead rather than guarded.
    await payload.update({ collection: 'users', id: mine.id, ...scope, data: { notifyWeekly: true } })

    const afterwards = await payload.findByID({ collection: 'users', id: mine.id, depth: 0 })
    expect(afterwards.notifyWeekly).toBe(true)
  })

  it('refuses a session whose brand names no row, rather than querying with NaN', async () => {
    await expect(adminScope({ user: anAccount('nonsense') })).rejects.toThrow(
      'the admitted session names no account row',
    )
  })

  it('refuses a session whose brand names a row that is gone, rather than inventing a user', async () => {
    const gone = await anAccountRow('gone')
    await payload.delete({ collection: 'users', id: gone.id })

    // NOT the message above: the brand is a perfectly good row id, so the
    // refusal has to come from the lookup rather than from the guard in front
    // of it. Distinguishing them is what keeps the guard from being credited
    // with a refusal Payload made.
    // Measured: Payload answers `NotFound`, status 404 — a different refusal
    // from the guard's own, which is the point.
    expect(await refusalOf(adminScope({ user: anAccount(String(gone.id)) }))).toEqual({
      name: 'NotFound',
      status: 404,
    })
  })
})
