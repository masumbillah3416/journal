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
 * Depends on: vitest, sharp (a real image, because `media` is an upload
 * collection and Payload will not create a row without bytes),
 * ../lib/testPayload, ./users.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import sharp from 'sharp'
import type { SanitizedCollectionConfig, SanitizedGlobalConfig, TypedUser } from 'payload'
import { getTestPayload } from '../lib/testPayload'
import { ownAccountOnly, Users } from './users'

/** The marker every row this file creates carries, so cleanup can find them. */
const MARKER = 'test-admin-access'

/** Every access operation this sweep knows how to look at. */
type SweptOperation = 'read' | 'create' | 'update' | 'delete' | 'readVersions' | 'unlock' | 'admin'

/** The subset of those a global's access object can hold. */
type SweptGlobalOperation = 'read' | 'update' | 'readVersions'

/**
 * One sanitised `access` object, read as a plain record.
 *
 * THE DECLARED TYPE LIES THE SAME WAY `auth` DOES, and this is the second
 * place this file has to work around it: Payload types every key of `access`
 * as a present `Access`, while `readVersions` and `admin` are never filled and
 * really are `undefined`. Comparing the declared type against `undefined` is
 * "the types have no overlap" to ESLint - correct about the type, wrong about
 * the object - so the comparison is made against `unknown` instead, which is
 * what CLAUDE.md §0.8 asks for in the first place.
 * @param access - A sanitised collection's or global's access object.
 * @returns The same entries, typed as what they are: unknown until checked.
 */
const rulesOf = (access: object): Record<string, unknown> => ({ ...access })

/**
 * Whether this collection counts login attempts, and so routes `unlock`.
 *
 * The same lie, one field over: `SanitizedCollectionConfig['auth']` is typed
 * `Auth`, and at runtime a collection with no `auth` block carries the boolean
 * `false`. Measured - eleven of the twelve sanitised collections in this
 * config hold `false`, and only `users` holds an object.
 * @param collection - One entry of the sanitised `payload.config.collections`.
 * @returns Whether `unlock` is an operation this collection can route.
 */
const countsLoginAttempts = (collection: SanitizedCollectionConfig): boolean => {
  const auth: unknown = collection.auth
  if (typeof auth !== 'object' || auth === null || !('maxLoginAttempts' in auth)) return false
  const attempts: unknown = auth.maxLoginAttempts
  return typeof attempts === 'number' && attempts > 0
}

/** The four Payload routes on every collection, whatever else it declares. */
const ALWAYS_ROUTED: readonly SweptOperation[] = ['read', 'create', 'update', 'delete']

/** The two a global always has; there is nothing to create or delete. */
const GLOBAL_OPERATIONS: readonly SweptGlobalOperation[] = ['read', 'update']

/**
 * The operations Payload can route on one collection.
 *
 * DECIDED FROM THE COLLECTION'S OWN SANITISED CONFIG, NEVER FROM ITS SLUG.
 * `readVersions` exists exactly where `versions` is enabled, `unlock` exactly
 * where an auth collection counts login attempts, and `admin` on the one
 * collection `config.admin.user` names — so a collection that gains versions
 * tomorrow is swept for `readVersions` the day it does, with nobody editing a
 * list here.
 * @param collection - One entry of the sanitised `payload.config.collections`.
 * @param adminUserSlug - `payload.config.admin.user`.
 * @returns The operation names applicable to this collection.
 */
const routedOperations = (collection: SanitizedCollectionConfig, adminUserSlug: string): readonly SweptOperation[] => [
  ...ALWAYS_ROUTED,
  ...(collection.versions ? (['readVersions'] as const) : []),
  ...(countsLoginAttempts(collection) ? (['unlock'] as const) : []),
  ...(collection.slug === adminUserSlug ? (['admin'] as const) : []),
]

/**
 * The operations Payload can route on one global.
 * @param global - One entry of the sanitised `payload.config.globals`.
 * @returns The operation names applicable to this global.
 */
const routedGlobalOperations = (global: SanitizedGlobalConfig): readonly SweptGlobalOperation[] => [
  ...GLOBAL_OPERATIONS,
  ...(global.versions ? (['readVersions'] as const) : []),
]

/** The shared test Payload instance, assigned by `beforeAll`. */
let payload: Awaited<ReturnType<typeof getTestPayload>>

/** The account every cross-account case acts as. */
let accountA: TypedUser

/** The account whose row every refusal case is aimed at. */
let accountB: TypedUser

/** The journey the `pages` and `media` fixtures hang off; neither can exist without one. */
let fixtureJourney: number

/**
 * The address one fixture account is created under.
 *
 * A function rather than two literals, so the account the `unlock` case aims
 * at and the account `beforeAll` created are the same address BY
 * CONSTRUCTION - not because two places in this file were typed to agree.
 * @param local - The local part, which is what distinguishes the accounts.
 * @returns The address.
 */
const addressOf = (local: string): string => `${MARKER}-${local}@example.test`

/** The password every fixture account is created with, and signed in with below. */
const FIXTURE_PASSWORD = 'not-a-real-password'

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
    data: { email: addressOf(local), password: FIXTURE_PASSWORD },
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
  // Children before parents: `pages.journey` and `media.journey` point at a
  // journey row, so deleting the journey first fails on the foreign key.
  await payload.delete({ collection: 'pages', where: { title: { like: MARKER } } })
  await payload.delete({ collection: 'media', where: { alt: { like: MARKER } } })
  await payload.delete({ collection: 'journeys', where: { slug: { like: MARKER } } })
}

/**
 * A real 100x100 PNG.
 *
 * `media` is an upload collection: Payload refuses a row with no bytes, so a
 * fixture here has to be an actual image rather than a record that claims to
 * be one. Generated rather than committed, which is the shape
 * `collections.integration.test.ts` already uses.
 * @returns The encoded PNG.
 */
const aTinyPng = (): Promise<Buffer> =>
  sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 200, g: 200, b: 200 } } })
    .png()
    .toBuffer()

/**
 * Creates one fixture journey, with access control left off.
 *
 * The journey is a fixture for the `pages` and `media` cases below, not their
 * subject - neither collection can hold a row without one.
 * @param slugSuffix - Distinguishes this journey from the other fixtures'.
 * @returns The created row's id.
 */
const aJourney = async (slugSuffix: string): Promise<number> => {
  const created = await payload.create({
    collection: 'journeys',
    data: { name: MARKER, place: MARKER, slug: `${MARKER}-${slugSuffix}`, dates: 'one day' },
  })
  return created.id
}

beforeAll(async () => {
  payload = await getTestPayload()
  // Cleaned at BOTH ends: `users.email` is unique, so a row left behind by an
  // interrupted run would fail inside the fixture rather than in the
  // assertion it was written for.
  await removeFixtures()
  accountA = await anAccount('a')
  accountB = await anAccount('b')
  fixtureJourney = await aJourney('fixtures')
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
        data: { email: addressOf('c'), password: FIXTURE_PASSWORD },
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

  // THE READ HALF OF EACH GLOBAL, which the update cases above do not reach:
  // Payload judges `read` and `update` with two different predicates, and a
  // suite that only ever writes leaves the one every admin screen calls first
  // unexercised.
  it('refuses to read the book global', async () => {
    await expect(payload.findGlobal({ slug: 'book', overrideAccess: false })).rejects.toThrow()
  })

  it('refuses to read the site global', async () => {
    await expect(payload.findGlobal({ slug: 'site', overrideAccess: false })).rejects.toThrow()
  })

  it('refuses to read the about global', async () => {
    await expect(payload.findGlobal({ slug: 'about', overrideAccess: false })).rejects.toThrow()
  })

  // THE OTHER ARM OF `ownAccountOnly`. Every `users` case above has a caller,
  // so the branch that answers `false` with none had never run - and it is the
  // arm that decides what an anonymous HTTP caller gets from `/api/users`.
  it('refuses to list the accounts at all, since an account row belongs to somebody', async () => {
    await expect(payload.find({ collection: 'users', overrideAccess: false })).rejects.toThrow()
  })

  it('refuses to create a page', async () => {
    await expect(
      payload.create({
        collection: 'pages',
        overrideAccess: false,
        data: { journey: fixtureJourney, kind: 'notes', title: MARKER, order: 1 },
      }),
    ).rejects.toThrow()
  })

  it('refuses to create a media item', async () => {
    const png = await aTinyPng()

    await expect(
      payload.create({
        collection: 'media',
        overrideAccess: false,
        data: { alt: MARKER },
        file: { data: png, mimetype: 'image/png', name: `${MARKER}-refused.png`, size: png.length },
      }),
    ).rejects.toThrow()
  })

  // VERSION HISTORY IS A SEPARATE OPERATION WITH A SEPARATE PREDICATE, and
  // until review round 1 neither collection had one. `read` says nothing about
  // `readVersions`: narrow `journeys.read` to a per-author rule tomorrow and
  // every case above still passes while `GET /api/journeys/versions` keeps
  // handing every draft of every journey to any signed-in caller.
  it("refuses a journey's version history", async () => {
    await expect(
      payload.findVersions({ collection: 'journeys', overrideAccess: false, depth: 0, limit: 1 }),
    ).rejects.toThrow()
  })

  it("refuses a page's version history", async () => {
    await expect(
      payload.findVersions({ collection: 'pages', overrideAccess: false, depth: 0, limit: 1 }),
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

  it('lets the author read and write a page, so the page editor is not locked out by its own rule', async () => {
    const created = await payload.create({
      collection: 'pages',
      overrideAccess: false,
      user: accountA,
      data: { journey: fixtureJourney, kind: 'notes', title: MARKER, order: 2 },
    })
    const updated = await payload.update({
      collection: 'pages',
      id: created.id,
      overrideAccess: false,
      user: accountA,
      data: { order: 3 },
    })

    expect(updated.order).toBe(3)

    await payload.delete({ collection: 'pages', id: created.id, overrideAccess: false, user: accountA })
  })

  it('lets the author change and remove a media item, so the media screen is not locked out by its own rule', async () => {
    const png = await aTinyPng()
    // Created with access control OFF: `media.create` is asserted by the
    // signed-out case above, and what this case is about is the two
    // predicates that need a row to exist before anything can reach them.
    const created = await payload.create({
      collection: 'media',
      data: { alt: MARKER, journey: fixtureJourney },
      file: { data: png, mimetype: 'image/png', name: `${MARKER}-author.png`, size: png.length },
    })
    const updated = await payload.update({
      collection: 'media',
      id: created.id,
      overrideAccess: false,
      user: accountA,
      data: { caption: 'changed by the author' },
    })

    expect(updated.caption).toBe('changed by the author')

    await payload.delete({ collection: 'media', id: created.id, overrideAccess: false, user: accountA })
  })

  it("lets the author read a journey's version history, so the Publish screen's editions are not locked out", async () => {
    // `versions: { drafts: true }` means creating the fixture journey wrote a
    // version row for it. The row this asserts on is therefore one THIS FILE
    // caused Payload to write, matched by the parent id `beforeAll` was handed
    // - not a row that happened to be in the database.
    const found = await payload.findVersions({
      collection: 'journeys',
      overrideAccess: false,
      user: accountA,
      depth: 0,
      where: { parent: { equals: fixtureJourney } },
    })

    expect(found.docs.map((doc) => doc.parent)).toEqual([fixtureJourney])
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
// THE TWO OPERATIONS PAYLOAD NEVER FILLS IN. Review round 1's F4 and F5, and
// both are BEHAVIOURAL cases rather than config assertions because the sweep
// alone cannot prove them: it asks whether a rule is the object Payload would
// have filled in, so a lookalike behaving exactly like the default passes it.
// Measured - replacing `unlock: () => false` with an inline
// `({ req: { user } }) => Boolean(user)` left the sweep green. These two cases
// are what fails.
describe('users, on the two operations Payload leaves undeclared', () => {
  it("refuses one account the ability to clear another account's lockout counter", async () => {
    // The address is a real account's - `beforeAll` created it - so the
    // refusal is for being FORBIDDEN rather than for naming nobody
    // (docs/deviations.md §28). `unlock` is the operation that undoes
    // SECURITY.md §3's cooling-off period.
    await expect(
      payload.unlock({
        collection: 'users',
        // `password` is in Payload's type for this operation and is ignored
        // by it - `unlockOperation` reads only the address. Passed so the
        // call typechecks without an assertion.
        data: { email: addressOf('b'), password: FIXTURE_PASSWORD },
        overrideAccess: false,
        // `unlock` takes its caller through `req`, not through a `user`
        // option as the CRUD operations do - Payload's own
        // `Options<AuthCollectionSlug>` has no `user` key. Same principal,
        // different door.
        req: { user: accountA },
      }),
    ).rejects.toThrow()
  })

  it('grants no Payload admin access to an account holding a real Payload token', async () => {
    // Signed in through the LOCAL API deliberately: `sealedUserAuth.ts` seals
    // the HTTP endpoint, not this operation, so this is the strongest caller
    // that can exist - one holding a genuine Payload JWT. That even it is
    // refused `/cms` is docs/deviations.md §42's decision written as a rule
    // instead of resting on the seal.
    const signedIn = await payload.login({
      collection: 'users',
      data: { email: addressOf('a'), password: FIXTURE_PASSWORD },
    })
    const authenticated = await payload.auth({
      headers: new Headers({ Authorization: `JWT ${signedIn.token ?? ''}` }),
    })

    // The token really is account A's. Without this, the assertion below would
    // pass just as well against a request nothing authenticated.
    expect(authenticated.user?.id).toBe(accountA.id)
    expect(authenticated.permissions.canAccessAdmin).not.toBe(true)
  })
})

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

    // UNDECLARED COUNTS, AND THAT IS REVIEW ROUND 1's CORRECTION (F1). The
    // first version of this sweep compared identity against `inherited` alone,
    // which silently assumed every routed operation gets filled. TWO DO NOT:
    // `addDefaultsToCollectionConfig` fills exactly `create`, `delete`, `read`,
    // `unlock` and `update`, so `readVersions` and `admin` stay `undefined` —
    // and `executeAccess` then runs its OWN hardcoded `if (req.user) return
    // true`, a second copy of the default reached through a door an identity
    // comparison cannot look through. Measured at the time: `journeys` and
    // `pages` both carry `versions: { drafts: true }`, both had
    // `access.readVersions === undefined`, and a signed-in
    // `payload.findVersions` on `journeys` returned 160 rows under no rule
    // this repository wrote. So the test is `undefined` OR `inherited`: the
    // first catches an operation Payload leaves alone, the second one it
    // fills, and the sweep keeps working whichever Payload does next.
    const onTheDefault = [
      ...ours.flatMap((collection) =>
        routedOperations(collection, payload.config.admin.user)
          .filter((operation) => {
            const rule = rulesOf(collection.access)[operation]
            return rule === undefined || rule === inherited
          })
          .map((operation) => `${collection.slug}.${operation}`),
      ),
      ...payload.config.globals.flatMap((global) =>
        routedGlobalOperations(global)
          .filter((operation) => {
            const rule = rulesOf(global.access)[operation]
            return rule === undefined || rule === inherited
          })
          .map((operation) => `${global.slug}.${operation}`),
      ),
    ]

    // NO OPERATION IS EXCLUDED ANY MORE. `unlock` used to be, on the grounds
    // that `POST /api/users/unlock` is sealed — which was true, incomplete
    // (what keeps `unlockUser` out of the GraphQL schema is a SECOND decision,
    // `graphQL: { disableMutations: true }`) and, either way, an exception
    // list on the guard built to refuse exception lists. `users` declares
    // `unlock` and `admin` instead, so this assertion means what its name says.
    expect(onTheDefault).toEqual([])
  })

  it('runs this module’s own ownAccountOnly on users, rather than a rule that merely looks like it', () => {
    const users = payload.config.collections.find((entry) => entry.slug === 'users')

    expect(users?.access.read).toBe(ownAccountOnly)
    expect(users?.access.update).toBe(ownAccountOnly)
  })
})
