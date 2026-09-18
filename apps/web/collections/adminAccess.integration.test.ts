/**
 * adminAccess.integration.test.ts — the access rules on `users`, `journeys`,
 * `pages` and the three globals, asserted against a real Payload and a real
 * Postgres.
 *
 * Integration test (CLAUDE.md §2). Its own file rather than a case in
 * `collections.integration.test.ts` for the reason
 * `sessions.access.integration.test.ts` states: that file is already nine
 * hundred lines, and the rule here is a different shape from the flat
 * refusals it guards.
 *
 * THE `users` CASES ARE CROSS-ACCOUNT, AND THAT IS THE WHOLE POINT. The
 * defect this file was written for is that `users` declared no `access` block,
 * so Payload's `defaultAccess` — "signed in, or refused" — applied to every
 * operation and any signed-in account could `PATCH` any other account's row.
 * `sealedUserAuth.ts` does not close it: that module seals the seven POST
 * AUTH endpoints, and `PATCH /api/users/<id>` was never in its scope. A suite
 * with one account cannot see this class of defect at all, because everything
 * the broken configuration granted was granted to "signed in".
 *
 * THE ROWS ARE REAL. An `update` or `delete` aimed at an id that does not
 * exist is refused for being ABSENT rather than for being forbidden, so a
 * guard written against an invented id passes with or without the rule
 * (docs/deviations.md §28).
 *
 * Uses `getTestPayload()`, not `getPayload()` directly, so this file connects
 * to the isolated `diary_test` database rather than a developer's own — see
 * that module's header.
 * Depends on: vitest, ../lib/testPayload, ./users.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { TypedUser } from 'payload'
import { getTestPayload } from '../lib/testPayload'
import { ownAccountOnly, Users } from './users'

/** The marker every row this file creates carries, so cleanup can find them. */
const MARKER = 'test-admin-access'

/** The operations Payload routes on a collection, and the sweep compares. */
const COLLECTION_OPERATIONS = ['read', 'create', 'update', 'delete'] as const

/** The two a global has; there is nothing to create or delete. */
const GLOBAL_OPERATIONS = ['read', 'update'] as const

/** The shared test Payload instance, assigned by `beforeAll`. */
let payload: Awaited<ReturnType<typeof getTestPayload>>

/** The account every cross-account case acts as. */
let accountA: TypedUser

/** The account whose row every refusal case is aimed at. */
let accountB: TypedUser

/**
 * Creates one fixture account.
 *
 * `overrideAccess` is left at its Local API default of `true`: the accounts
 * are fixtures, not the subject.
 * @param local - The local part appended to the marker, so the two differ.
 * @returns The created account, shaped as the caller argument Payload wants.
 */
const anAccount = async (local: string): Promise<TypedUser> => {
  const created = await payload.create({
    collection: 'users',
    data: { email: `${MARKER}-${local}@example.test`, password: 'not-a-real-password' },
  })
  return { ...created, collection: 'users' }
}

/**
 * Removes every row this file creates, at both ends of the run.
 *
 * The journey is cleaned as well as the accounts, and not for tidiness:
 * `journeys.slug` is `unique`, so a row left behind by a case that failed
 * before its own delete would fail the NEXT run inside the fixture rather
 * than in the assertion it was written for.
 */
const removeFixtures = async (): Promise<void> => {
  await payload.delete({ collection: 'users', where: { email: { like: MARKER } } })
  await payload.delete({ collection: 'journeys', where: { slug: { like: MARKER } } })
}

beforeAll(async () => {
  payload = await getTestPayload()
  // Cleaned at BOTH ends: `users.email` is unique, so a row left behind by an
  // interrupted run would fail inside the fixture rather than in the
  // assertion it was written for.
  await removeFixtures()
  accountA = await anAccount('a')
  accountB = await anAccount('b')
})

afterAll(async () => {
  await removeFixtures()
})

describe('users, across two accounts', () => {
  it('refuses one account the ability to turn off another account’s second factor', async () => {
    // The refusal and the value are produced by two different things: Payload
    // decides the first, Postgres holds the second. Asserting only that the
    // call threw would pass against a rule that threw AFTER writing.
    await expect(
      payload.update({
        collection: 'users',
        id: accountB.id,
        overrideAccess: false,
        user: accountA,
        data: { otpRequired: false },
      }),
    ).rejects.toThrow()

    const afterwards = await payload.findByID({ collection: 'users', id: accountB.id, depth: 0 })
    expect(afterwards.otpRequired).toBe(true)
  })

  it('narrows a listing to the caller’s own row rather than refusing it', async () => {
    const found = await payload.find({ collection: 'users', overrideAccess: false, user: accountA, depth: 0 })

    // The left side comes from Postgres through Payload's access layer; the
    // right side is the id the create call returned. Neither is typed twice.
    expect(found.docs.map((doc) => doc.id)).toEqual([accountA.id])
  })

  it('refuses an account creation through the API, because this diary has one author', async () => {
    await expect(
      payload.create({
        collection: 'users',
        overrideAccess: false,
        user: accountA,
        data: { email: `${MARKER}-c@example.test`, password: 'not-a-real-password' },
      }),
    ).rejects.toThrow()
  })

  it('leaves every field of another account’s row untouched by any update A can make', async () => {
    // The field list is enumerated from the config rather than written here,
    // so a field Phase 4 adds to `users` is swept the day it lands. This is
    // the shape sessions.access.integration.test.ts uses, for the same reason.
    //
    // AND IT IS THE SANITISED LIST, NOT THE SIX NAMES `users.ts` DECLARES.
    // Payload mutates a collection's `fields` array IN PLACE when it
    // sanitises the config, so by the time `beforeAll` has bootstrapped
    // Payload this reads sixteen names, the ten injected ones among them —
    // `email`, `salt`, `hash`, `resetPasswordToken`, `resetPasswordExpiration`,
    // `loginAttempts`, `lockUntil`, `createdAt`, `updatedAt` and the `sessions`
    // join. Measured, not assumed: printed from a real bootstrapped Payload
    // before this comment was written. Those are exactly the fields
    // docs/deviations.md §29 records as having carried no access rule on
    // `sessions`, so sweeping them is the point rather than a side effect.
    const writable = Users.fields.flatMap((field) =>
      'name' in field && typeof field.name === 'string' ? [field.name] : [],
    )
    expect(writable.length).toBeGreaterThan(0)

    const before = await payload.findByID({ collection: 'users', id: accountB.id, depth: 0 })
    const attempts = await Promise.allSettled(
      writable.map((name) =>
        payload.update({
          collection: 'users',
          id: accountB.id,
          overrideAccess: false,
          user: accountA,
          data: { [name]: 'changed-by-the-other-account' },
        }),
      ),
    )
    const after = await payload.findByID({ collection: 'users', id: accountB.id, depth: 0 })

    expect(attempts.filter((outcome) => outcome.status === 'fulfilled')).toEqual([])
    // COMPARED BY VALUE, NOT BY IDENTITY, and that is a correction this run
    // earned: `sessions` is a join field, so the two reads return two
    // different empty arrays and `!==` reported it changed on a row nothing
    // had touched. A comparison that flags an unchanged field is a comparison
    // that would have been silenced rather than trusted.
    const changed = writable.filter(
      (name) =>
        JSON.stringify(before[name as keyof typeof before]) !== JSON.stringify(after[name as keyof typeof after]),
    )
    expect(changed).toEqual([])
  })

  // THE DELETE CASE IS LAST, AND THAT IS ORDERING RATHER THAN TASTE. Vitest
  // runs cases in declaration order, so with this one ahead of the sweep the
  // red run's succeeding delete removed account B and the sweep then failed
  // with `NotFound` — a cascade, not a finding. Measured: that is exactly what
  // the first red run printed. Last, every case above it still has a row.
  it('refuses an account deletion through the API, on a row that really exists', async () => {
    // The row is real on purpose: a delete aimed at an id that does not exist
    // is refused for being ABSENT rather than for being forbidden, which is
    // how the missing `delete` predicate on the server-only collections
    // survived beside a passing test (docs/deviations.md §28).
    await expect(
      payload.delete({ collection: 'users', id: accountB.id, overrideAccess: false, user: accountA }),
    ).rejects.toThrow()

    const stillThere = await payload.findByID({ collection: 'users', id: accountB.id, depth: 0 })
    expect(stillThere.id).toBe(accountB.id)
  })
})

describe('the content collections and globals, for a caller with no session', () => {
  it('refuses to read a journey', async () => {
    await expect(payload.find({ collection: 'journeys', overrideAccess: false })).rejects.toThrow()
  })

  it('refuses to read a page', async () => {
    await expect(payload.find({ collection: 'pages', overrideAccess: false })).rejects.toThrow()
  })

  it('refuses to update the book global', async () => {
    await expect(
      payload.updateGlobal({ slug: 'book', overrideAccess: false, data: { title: 'not by this caller' } }),
    ).rejects.toThrow()
  })

  it('refuses to update the site global', async () => {
    await expect(
      payload.updateGlobal({ slug: 'site', overrideAccess: false, data: { name: 'not by this caller' } }),
    ).rejects.toThrow()
  })

  it('refuses to update the about global', async () => {
    await expect(
      payload.updateGlobal({ slug: 'about', overrideAccess: false, data: { replyTo: 'nobody@example.test' } }),
    ).rejects.toThrow()
  })
})

describe('the content collections and globals, for the signed-in author', () => {
  it('lets the author read and write a journey, so the editor is not locked out by its own rule', async () => {
    const created = await payload.create({
      collection: 'journeys',
      overrideAccess: false,
      user: accountA,
      data: { name: MARKER, place: MARKER, slug: `${MARKER}-journey`, dates: 'one day' },
    })
    const updated = await payload.update({
      collection: 'journeys',
      id: created.id,
      overrideAccess: false,
      user: accountA,
      data: { place: 'somewhere else' },
    })

    expect(updated.place).toBe('somewhere else')

    await payload.delete({ collection: 'journeys', id: created.id, overrideAccess: false, user: accountA })
  })
})

// THE SWEEP, AND IT IS INVERTED ON PURPOSE (CLAUDE.md §0, standing orders
// species 6). A case that lists the six objects this task touched passes the
// seventh nobody listed. This one asks the opposite question of EVERY
// collection and global the config carries: is any operation still on the
// default Payload fills a missing rule in with? A collection added in Task 5
// without a block fails here the day it lands, and nobody has to remember it.
//
// IT CANNOT BE A CHECK THAT AN `access` KEY EXISTS, and that is measured
// rather than assumed: Payload's sanitiser FILLS EVERY MISSING OPERATION with
// `defaultAccess`, so `Object.keys(collection.access)` is the same five names
// on a collection with a block and on one without. Such a case would pass
// against the exact defect this task exists to close.
describe('the access rules as a whole, swept from the sanitised config', () => {
  it('leaves no collection or global of this repository on the default Payload fills in', () => {
    // `payload-migrations` is Payload's own and declares no access, so every
    // slot in its sanitised block holds the very function a missing rule is
    // filled with — one object, shared. That reference is PRODUCED BY PAYLOAD
    // in this process; it is not a name this test wrote down, which is the
    // whole reason the identity comparison below means anything.
    const inherited = payload.config.collections.find((entry) => entry.slug === 'payload-migrations')?.access.read
    expect(inherited).toBeDefined()

    const ours = payload.config.collections.filter((entry) => !entry.slug.startsWith('payload-'))
    // Guards against a filter that silently matched nothing, which would make
    // the assertion below true and empty.
    expect(ours.length).toBeGreaterThan(0)
    expect(payload.config.globals.length).toBeGreaterThan(0)

    const onTheDefault = [
      ...ours.flatMap((collection) =>
        COLLECTION_OPERATIONS.filter((operation) => collection.access[operation] === inherited).map(
          (operation) => `${collection.slug}.${operation}`,
        ),
      ),
      ...payload.config.globals.flatMap((global) =>
        GLOBAL_OPERATIONS.filter((operation) => global.access[operation] === inherited).map(
          (operation) => `${global.slug}.${operation}`,
        ),
      ),
    ]

    // `unlock` is deliberately not swept. Payload fills it on every
    // collection but routes it only on an auth one, and the only auth
    // collection here is `users` — whose `POST /api/users/unlock` is sealed by
    // ./sealedUserAuth.ts, so the slot it fills is unreachable.
    expect(onTheDefault).toEqual([])
  })

  it('runs this module’s own ownAccountOnly on users, rather than a rule that merely looks like it', () => {
    const users = payload.config.collections.find((entry) => entry.slug === 'users')

    expect(users?.access.read).toBe(ownAccountOnly)
    expect(users?.access.update).toBe(ownAccountOnly)
  })
})
