/**
 * collections.integration.test.ts — collection schema behaviour against real Postgres.
 *
 * Integration test (CLAUDE.md §2): exercises the structural rules from
 * DATA_MODEL.md that are painful to retrofit onto a collection with existing
 * rows — soft delete, drafts, the `highlights` cap and `tally`'s text values —
 * plus the two collections that declare access control, against a real
 * Payload instance and a real Docker Postgres, not a mock.
 * Named `*.integration.test.ts` so it runs only under the `integration` Vitest
 * project (see vitest.config.ts), never in `npm run verify` (pre-commit).
 *
 * The last TWO cases are the Migration suite of CLAUDE.md §2, one per shape
 * of migration this repository has: the journey case covers a migration that
 * creates tables, and the `otpChallenges` case covers one that adds a column
 * and an index to a table that already exists. They are separate because they
 * fail differently - see the comment on the second.
 *
 * The first of them replaced one named
 * "runs down and up again without loss" that seeded nothing and compared
 * nothing: it called `runMigrateDown()` and `runMigrateUp()`, asserted neither
 * threw, and asserted a subsequent `find()` was defined. Both halves of its
 * name were unearned. Worse, `migrateDown()` rolls back only the last BATCH,
 * so whether the initial migration's `down()` — the one that drops every
 * table, and the one carrying a hand-fixed statement order — ran at all
 * depended on whether the two migrations had been applied together.
 *
 * The replacement writes a journey whose values span plain columns, a group's
 * column prefix and both ordered array tables; rolls every migration back to
 * zero, so the initial migration's `down()` runs regardless of batch history;
 * asserts the tables are genuinely gone; re-applies; and asserts the same
 * values round-trip through the rebuilt schema. Data is NOT expected to
 * survive — `DROP TABLE` destroys rows, and that is what reversibility means
 * here: the schema comes back able to hold what it held before.
 *
 * Verified to fail when the behaviour is broken (CLAUDE.md §2.3), twice:
 * deleting `DROP TABLE "journeys" CASCADE` from the initial migration's
 * `down()` fails it ("cannot drop type enum_journeys_weather_glyph because
 * other objects depend on it"), and restoring the generator's original
 * statement order in the add_jobs migration's `down()` fails it with the exact
 * bug that hand-fix exists to prevent ("constraint
 * payload_locked_documents_rels_jobs_fk ... does not exist").
 *
 * Fixture slugs are prefixed `test-` (`test-tokyo`, not `tokyo`) so they
 * cannot collide with the real ten journeys `apps/web/scripts/seed.ts`
 * creates in the same database (Task 11) - `journeys.slug` is unique, and
 * this file's journeys are schema fixtures, not meant to represent any real
 * trip. `afterAll` deletes them, since `seed.integration.test.ts`'s own
 * assertions count every row in the shared `journeys` collection and a
 * fixture left behind here would inflate that count in whichever file runs
 * second.
 *
 * Uses `getTestPayload()` (`apps/web/lib/testPayload.js`), not `getPayload()`
 * directly: every integration test file connects to an isolated `diary_test`
 * database, never the developer's own dev database (Task 10/11 review
 * finding 2) - see that module's header.
 */
import type { MigrateUpArgs } from '@payloadcms/db-postgres'
import { Client } from 'pg'
import { type PayloadRequest, readMigrationFiles } from 'payload'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { env } from '../lib/env'
import { appliedMigrationCount, runMigrateDownToZero, runMigrateUp } from '../lib/migrate'
import { getPayload } from '../lib/payload'
import { getTestPayload } from '../lib/testPayload'

const FIXTURE_SLUGS = ['test-tokyo', 'test-bergen', 'test-lisbon', 'test-reversibility']

/** The `alt` values the two media access fixtures are created with, so `afterAll` can find and delete them. */
const FIXTURE_MEDIA_ALTS = ['test-access-visible', 'test-access-hidden', 'test-access-hidden-editor']

/** The editor fixture's email, so `afterAll` can remove the account the access tests sign in as. */
const FIXTURE_USER_EMAIL = 'test-access-editor@example.com'

/**
 * A real, uploadable PNG for the media access fixtures - built with the same
 * `sharp` the media pipeline itself uses rather than a hand-rolled byte
 * string, so what Payload stores is a genuine image. A factory, not a shared
 * buffer (CLAUDE.md §2.3): two uploads must not share one.
 * @returns A 100x100 grey PNG.
 */
const aTinyPng = (): Promise<Buffer> =>
  sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 200, g: 200, b: 200 } } })
    .png()
    .toBuffer()

/**
 * The journey the reversibility test writes, rolls the whole schema out from
 * under, and writes again. Deliberately spans all three shapes the initial
 * migration creates: plain columns on `journeys`, a grouped column prefix
 * (`furniture_*`), and the two ordered array tables (`journeys_highlights`,
 * `journeys_tally`) - a rollback that restored only the parent table would
 * pass an assertion built on scalars alone.
 *
 * A factory, not a shared literal (CLAUDE.md §2.3): the test writes it twice,
 * and a shared object would let the first write's Payload-assigned ids leak
 * into the second.
 */
const aReversibilityJourney = (): {
  name: string
  place: string
  slug: string
  dates: string
  weather: string
  mood: string
  note: string
  furniture: { signoff: string; stampCountry: string; stampValue: string }
  highlights: { text: string }[]
  tally: { key: string; value: string }[]
} => ({
  name: 'Reykjavik',
  place: 'Iceland',
  slug: 'test-reversibility',
  dates: '4 - 12 February 2026',
  weather: 'SLEET 2C',
  mood: 'WIND BITTEN',
  note: 'Nineteen hours of blue dusk and one hour that counted as daylight.',
  furniture: { signoff: 'lopapeysa, permanently', stampCountry: 'ISLAND', stampValue: '285 KR' },
  highlights: [{ text: 'black sand at Reynisfjara' }, { text: 'the 3am geothermal soak' }],
  tally: [
    { key: 'GEYSERS', value: 'three' },
    { key: 'WOOL JUMPERS', value: 'plenty' },
    { key: 'DAYLIGHT HOURS', value: 'uncounted' },
    { key: 'PUFFINS', value: 'none, wrong season' },
  ],
})

/**
 * Which of `names` currently exist as tables in the test database's `public`
 * schema. Asked directly of Postgres rather than of Payload, because after a
 * full rollback there is no schema left for Payload to answer from.
 * @param names - Table names to look for.
 * @returns The subset that exists, sorted, so an assertion reads as a set.
 */
const existingTablesAmong = async (names: readonly string[]): Promise<string[]> => {
  const client = new Client({ connectionString: env.DATABASE_URL })
  await client.connect()
  try {
    const { rows } = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
      [[...names]],
    )
    return rows.map((row) => row.table_name).sort()
  } finally {
    await client.end()
  }
}

/**
 * The marker every fixture row the access-guard cases create carries, so
 * `afterAll` can find them all and no other suite's rows are ever matched.
 *
 * Those cases must operate on REAL rows. An `update` or `delete` aimed at an
 * id that does not exist is refused by Payload for being absent rather than
 * for being forbidden, so a guard written against `id: '1'` passes whether or
 * not the access rule exists — which is how the missing `delete` predicate
 * survived a test named for it.
 */
const GUARD_FIXTURE_MARKER = 'test-access-guard'

/** The account the access-guard cases sign in as, so `afterAll` can remove it. */
const GUARD_EDITOR_EMAIL = 'test-access-guard-editor@example.com'

/** The four operations a server-only collection must refuse, whoever asks. */
interface GuardedOperations {
  readonly read: () => Promise<unknown>
  readonly create: () => Promise<unknown>
  readonly update: () => Promise<unknown>
  readonly delete: () => Promise<unknown>
}

/**
 * Which of the four operations a caller was actually allowed to perform.
 *
 * Reports the operations that SUCCEEDED rather than asserting each rejection
 * separately, for two reasons. A failure then names the leak ("delete") rather
 * than saying one of four assertions failed. And every promise is given its
 * handler in the same tick it is created, so none is ever left
 * rejected-and-unhandled while another settles - the latent race recorded on
 * the `Promise.all` below.
 * @param operations - The four attempts to make, each already carrying
 *   `overrideAccess: false` and whichever caller is under test.
 * @returns The names of the operations that were permitted, sorted. An empty
 *   array is the only passing answer for a server-only collection.
 */
const operationsAllowedBy = async (operations: GuardedOperations): Promise<(keyof GuardedOperations)[]> => {
  const names = ['read', 'create', 'update', 'delete'] as const
  const outcomes = await Promise.all(
    names.map((name) =>
      operations[name]().then(
        () => name,
        () => undefined,
      ),
    ),
  )
  return outcomes.filter((name): name is keyof GuardedOperations => name !== undefined).sort()
}

/** The migration whose own reversibility the last case below asserts. */
const SESSION_HASH_MIGRATION = '20260905_202028_add_otp_session_hash'

/** The email the OTP migration fixture's account uses, so `afterAll` can remove it. */
const FIXTURE_REVERSIBILITY_EMAIL = 'test-otp-reversibility@example.com'

/** A stand-in SHA-256 hex value for the fixture challenge's session binding. */
const FIXTURE_SESSION_HASH = 'f'.repeat(64)

/**
 * A challenge row for the `sessionHash` reversibility case.
 *
 * A factory, not a shared literal (CLAUDE.md §2.3): the test writes it twice,
 * either side of a full schema rollback, and a shared object would let the
 * first write's Payload-assigned id leak into the second. The hashes are
 * fixed stand-ins rather than real ones - this case is about the column
 * surviving a rollback, and `apps/web/lib/auth/otpService.integration.test.ts`
 * is where what goes IN the column is asserted.
 * @param account - The id of the user the challenge belongs to.
 * @returns The row's data.
 */
const anOtpChallengeFor = (account: number): {
  user: number
  codeHash: string
  sessionHash: string
  expiresAt: string
} => ({
  user: account,
  codeHash: 'a'.repeat(96),
  sessionHash: FIXTURE_SESSION_HASH,
  expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
})

/**
 * Which of the `session_hash` column and its index currently exist.
 *
 * Asked of `information_schema` rather than of Payload, and asked for the
 * COLUMN rather than the table: this migration adds a column to a table it
 * did not create, so "the table is gone" says nothing about whether its
 * `down()` did anything at all.
 * @returns `['column', 'index']` when both exist, a subset otherwise, sorted
 *   so an assertion reads as a set.
 */
const sessionHashSchema = async (): Promise<string[]> => {
  const client = new Client({ connectionString: env.DATABASE_URL })
  await client.connect()
  try {
    const column = await client.query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'otp_challenges' AND column_name = 'session_hash'`,
    )
    const index = await client.query(
      `SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = 'otp_challenges_session_hash_idx'`,
    )
    return [...column.rows.map(() => 'column'), ...index.rows.map(() => 'index')].sort()
  } finally {
    await client.end()
  }
}

/** The migration that adds the sliding window's own table (Phase 2 Task 4). */
const SIGN_IN_ATTEMPTS_MIGRATION = '20260905_230601_add_sign_in_attempts'

/**
 * Which of the five schema artefacts `20260905_230601_add_sign_in_attempts`
 * is responsible for currently exist.
 *
 * All five, not just the table: this migration creates two Postgres enum
 * types and adds a column and an index to `payload_locked_documents_rels`
 * besides, and a `down()` that dropped the table alone would leave a database
 * its own `up()` could not be re-applied to - which is the failure the
 * generated statement order produced for `add_jobs` and the reason that file
 * carries a hand-fixed `down()`.
 * @returns The names of the artefacts that exist, sorted, so an assertion
 *   reads as a set.
 */
const signInAttemptsSchema = async (): Promise<string[]> => {
  const client = new Client({ connectionString: env.DATABASE_URL })
  await client.connect()
  try {
    const found = await client.query<{ artefact: string }>(
      `SELECT 'table' AS artefact FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'sign_in_attempts'
       UNION ALL
       SELECT 'index' FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = 'dimension_endpoint_subject_attemptedAt_idx'
       UNION ALL
       SELECT 'dimension-type' FROM pg_type WHERE typname = 'enum_sign_in_attempts_dimension'
       UNION ALL
       SELECT 'endpoint-type' FROM pg_type WHERE typname = 'enum_sign_in_attempts_endpoint'
       UNION ALL
       SELECT 'locked-documents-column' FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'payload_locked_documents_rels'
          AND column_name = 'sign_in_attempts_id'`,
    )
    return found.rows.map((row) => row.artefact).sort()
  } finally {
    await client.end()
  }
}

/** Every artefact `signInAttemptsSchema` looks for, when the migration is applied. */
const SIGN_IN_ATTEMPTS_SCHEMA = [
  'dimension-type',
  'endpoint-type',
  'index',
  'locked-documents-column',
  'table',
]

/**
 * Runs one migration's own `up()` or `down()`, outside Payload's batch
 * bookkeeping.
 *
 * `payload.db.migrateDown()` rolls back a whole BATCH, and every migration in
 * this repository is applied in one batch, so it cannot reverse a single
 * migration - which is precisely what a per-migration reversibility assertion
 * needs. Running one migration's own `up`/`down` is the narrowest way to ask
 * "does THIS migration's down() undo THIS migration's up()".
 *
 * The functions come from Payload's own `readMigrationFiles`, NOT from an
 * `import` of the migration module, and that is deliberate. A static import
 * makes Vitest transform and register a SECOND instance of a file Payload
 * also loads straight off disk, and `@vitest/coverage-v8` then merges two
 * unrelated range sets into one nonsensical report: measured, the file's
 * branch coverage fell from 100% to 60% with a synthetic "branch" map
 * spanning its own import lines, purely from adding the import. Asking
 * Payload for the same functions it runs itself keeps one instance and one
 * honest measurement.
 * @param name - The migration's name, as `payload_migrations` records it.
 * @param direction - Which of the two to run.
 * @param payload - The test Payload instance, for its Drizzle handle.
 */
const runMigrationDirection = async (
  name: string,
  direction: 'up' | 'down',
  payload: Awaited<ReturnType<typeof getPayload>>,
): Promise<void> => {
  const files = await readMigrationFiles({ payload })
  const migration = files.find((file) => file.name === name)
  if (migration === undefined) throw new Error(`no migration on disk named ${name}`)
  const run: (args: MigrateUpArgs) => Promise<void> = direction === 'up' ? migration.up : migration.down
  await run({
    db: payload.db.drizzle,
    payload,
    // Cast justified: this migration's signature destructures `req` and its
    // body never reads it (it is declared `_req`), so the alternative is
    // assembling a whole PayloadRequest to hand to a discarded parameter.
    req: {} as PayloadRequest,
  })
}

/** The three tables a journey's own fields, highlights and tally live in. */
const JOURNEY_TABLES = ['journeys', 'journeys_highlights', 'journeys_tally'] as const

describe('collections', () => {
  let payload: Awaited<ReturnType<typeof getPayload>>
  /** The signed-in caller the three access-guard cases share. */
  let guardEditor: Awaited<ReturnType<typeof aGuardEditor>>

  /**
   * Creates the signed-in caller the access-guard cases use.
   *
   * A function rather than an inline `payload.create` so the account's type is
   * inferred for the `user:` argument below, without this file having to name
   * any of Payload's generated types - `payload.create`'s own signature is
   * generic over the collection slug, so there is no way to write that type
   * down here without naming the generated `User`. The return type is
   * therefore inferred rather than annotated, which is what makes
   * `Awaited<ReturnType<typeof aGuardEditor>>` above say the right thing. It
   * lives inside the describe because it needs the `payload` binding above,
   * unlike the module-level helpers that open a `pg` client of their own.
   * @returns The created account.
   */
  const aGuardEditor = async () =>
    payload.create({
      collection: 'users',
      data: { email: GUARD_EDITOR_EMAIL, password: 'not-a-real-password' },
    })

  /** Removes every row and account the access-guard cases create. */
  const removeGuardFixtures = async (): Promise<void> => {
    const jobs = await payload.find({ collection: 'jobs', where: { mediaId: { equals: GUARD_FIXTURE_MARKER } } })
    for (const doc of jobs.docs) await payload.delete({ collection: 'jobs', id: doc.id })

    const attempts = await payload.find({
      collection: 'signInAttempts',
      where: { subject: { equals: GUARD_FIXTURE_MARKER } },
    })
    for (const doc of attempts.docs) await payload.delete({ collection: 'signInAttempts', id: doc.id })

    const editors = await payload.find({ collection: 'users', where: { email: { equals: GUARD_EDITOR_EMAIL } } })
    for (const doc of editors.docs) {
      // Challenges first: `otp_challenges.user_id` is NOT NULL and Payload's
      // delete hook nulls the relationship rather than cascading, so removing
      // the account while a challenge still points at it fails the constraint.
      const challenges = await payload.find({ collection: 'otpChallenges', where: { user: { equals: doc.id } } })
      for (const challenge of challenges.docs) await payload.delete({ collection: 'otpChallenges', id: challenge.id })
      await payload.delete({ collection: 'users', id: doc.id })
    }
  }

  beforeAll(async () => {
    payload = await getTestPayload()
    // Repairs the ONE inconsistent state this file's own reversibility case
    // can leave behind, and nothing else: `session_hash` dropped while
    // `payload_migrations` still records its migration as applied, which
    // `getTestPayload()`'s own `runMigrateUp()` cannot fix because it has
    // nothing pending to apply. The `finally` in that case makes this
    // unreachable in the ordinary way; it exists for the way a `finally`
    // cannot cover, which is the worker being killed outright between the
    // `down` and the `up`. Narrow on purpose: it re-runs one migration's own
    // `up()` when the schema and the bookkeeping disagree in exactly this
    // way, so it cannot mask a migration that genuinely failed to apply.
    if ((await sessionHashSchema()).length === 0) {
      await runMigrationDirection(SESSION_HASH_MIGRATION, 'up', payload)
    }

    // Cleaned at BOTH ends, and the editor minted ONCE: `users.email` is
    // unique, so a row left behind by an interrupted run - or a second case
    // minting the same address - fails inside the fixture rather than in the
    // assertion it was written for.
    await removeGuardFixtures()
    guardEditor = await aGuardEditor()
  })

  afterAll(async () => {
    await removeGuardFixtures()
    // "test-marrakech" is deliberately absent: that test's create() is
    // expected to reject (the highlights-cap case), so no row ever exists.
    for (const slug of FIXTURE_SLUGS) {
      const found = await payload.find({ collection: 'journeys', where: { slug: { equals: slug } } })
      for (const doc of found.docs) {
        await payload.delete({ collection: 'journeys', id: doc.id })
      }
    }
    // The two media access fixtures, for the same reason the journeys are
    // removed: `seed.integration.test.ts` counts rows in the shared
    // collections, and a fixture left behind here inflates whichever file
    // runs second.
    for (const alt of FIXTURE_MEDIA_ALTS) {
      const found = await payload.find({ collection: 'media', where: { alt: { equals: alt } } })
      for (const doc of found.docs) {
        await payload.delete({ collection: 'media', id: doc.id })
      }
    }
    const editors = await payload.find({ collection: 'users', where: { email: { equals: FIXTURE_USER_EMAIL } } })
    for (const doc of editors.docs) {
      await payload.delete({ collection: 'users', id: doc.id })
    }
    // The OTP reversibility case creates one account either side of the
    // rollback, and the rollback destroys the first - so the address is
    // matched rather than a single id remembered. Its challenge row goes
    // FIRST: `otp_challenges.user_id` is NOT NULL, and Payload's own delete
    // hook nulls the relationship rather than cascading, so removing the
    // account while a challenge still points at it fails the constraint.
    const otpFixtures = await payload.find({
      collection: 'users',
      where: { email: { equals: FIXTURE_REVERSIBILITY_EMAIL } },
    })
    for (const doc of otpFixtures.docs) {
      const challenges = await payload.find({
        collection: 'otpChallenges',
        where: { user: { equals: doc.id } },
      })
      for (const challenge of challenges.docs) {
        await payload.delete({ collection: 'otpChallenges', id: challenge.id })
      }
      await payload.delete({ collection: 'users', id: doc.id })
    }
  })

  it('soft-deletes journeys rather than removing rows', async () => {
    const created = await payload.create({
      collection: 'journeys',
      data: { name: 'Tokyo', place: 'Japan', slug: 'test-tokyo', dates: '12 - 24 March 2025' },
    })

    await payload.update({
      collection: 'journeys',
      id: created.id,
      data: { deletedAt: new Date().toISOString() },
    })
    const found = await payload.findByID({ collection: 'journeys', id: created.id })

    expect(found.deletedAt).not.toBeNull()
  })

  it('keeps drafts separate from published versions', async () => {
    const created = await payload.create({
      collection: 'journeys',
      data: { name: 'Bergen', place: 'Norway', slug: 'test-bergen', dates: '3 - 9 June 2025' },
      draft: true,
    })

    expect(created._status).toBe('draft')
  })

  it('caps highlights at four, because a fifth breaks the notes page rhythm', async () => {
    const attempt = payload.create({
      collection: 'journeys',
      data: {
        name: 'Marrakech',
        place: 'Morocco',
        slug: 'test-marrakech',
        dates: '1 - 8 May 2025',
        highlights: [{ text: 'a' }, { text: 'b' }, { text: 'c' }, { text: 'd' }, { text: 'e' }],
      },
    })

    await expect(attempt).rejects.toThrow()
  })

  it('stores tally values as text, because several journeys say "plenty"', async () => {
    const created = await payload.create({
      collection: 'journeys',
      data: {
        name: 'Lisbon',
        place: 'Portugal',
        slug: 'test-lisbon',
        dates: '2 - 11 April 2025',
        tally: [
          { key: 'PASTEIS', value: 'nineteen' },
          { key: 'TRAMS', value: 'plenty' },
          { key: 'STEPS', value: 'uncounted' },
          { key: 'RAIN', value: 'none' },
        ],
      },
    })

    expect(created.tally?.[1]?.value).toBe('plenty')
  })

  // THE THREE SERVER-ONLY COLLECTIONS - `jobs`, `otpChallenges` and
  // `signInAttempts` - declare an access rule of their own, and every other
  // collection inherits Payload's default ("signed in, or refused").
  // `overrideAccess: false` is what makes Payload run those rules at all: the
  // Local API defaults to `true`, so nothing in this suite ever executed them
  // and the one part of the schema with a deliberate access rule was the one
  // part whose rule was unmeasured.
  //
  // EACH CASE NOW ASSERTS ALL FOUR OPERATIONS, AND FOR A SIGNED-IN CALLER AS
  // WELL AS A SIGNED-OUT ONE. The version this replaces asserted read, create
  // and update for a signed-out caller only, and was named "so nobody can
  // clear or forge their own window" while checking two thirds of that - which
  // is exactly how a missing `delete` predicate survived beside it. Payload
  // applies `defaultAccess` to any operation an access block omits, so `delete`
  // fell through to "any signed-in user", and a limiter whose subject can
  // delete its own rows is not a limiter. The signed-out half of each case
  // could never have caught it: `defaultAccess` refuses a signed-out caller
  // anyway.
  //
  // THE ROWS ARE REAL. An `update` or `delete` aimed at an id that does not
  // exist is refused for being absent rather than for being forbidden, so a
  // guard written against `id: '1'` passes with or without the rule.
  it('refuses every operation on jobs, signed in or out, because the queue is reached only through the adapter', async () => {
    const row = await payload.create({
      collection: 'jobs',
      data: { kind: 'transcode', mediaId: GUARD_FIXTURE_MARKER, status: 'queued' },
    })
    const editor = guardEditor

    const signedOut = await operationsAllowedBy({
      read: () => payload.find({ collection: 'jobs', overrideAccess: false }),
      create: () =>
        payload.create({
          collection: 'jobs',
          overrideAccess: false,
          data: { kind: 'transcode', mediaId: GUARD_FIXTURE_MARKER, status: 'queued' },
        }),
      update: () =>
        payload.update({ collection: 'jobs', id: row.id, overrideAccess: false, data: { status: 'failed' } }),
      delete: () => payload.delete({ collection: 'jobs', id: row.id, overrideAccess: false }),
    })
    const signedIn = await operationsAllowedBy({
      read: () => payload.find({ collection: 'jobs', overrideAccess: false, user: editor }),
      create: () =>
        payload.create({
          collection: 'jobs',
          overrideAccess: false,
          user: editor,
          data: { kind: 'transcode', mediaId: GUARD_FIXTURE_MARKER, status: 'queued' },
        }),
      update: () =>
        payload.update({
          collection: 'jobs',
          id: row.id,
          overrideAccess: false,
          user: editor,
          data: { status: 'failed' },
        }),
      delete: () => payload.delete({ collection: 'jobs', id: row.id, overrideAccess: false, user: editor }),
    })

    expect({ signedOut, signedIn }).toEqual({ signedOut: [], signedIn: [] })
  })

  // `media` is the one collection a signed-out reader MUST be able to read.
  // Payload's default access predicate is "logged in", and it gates the
  // upload file route as well as the REST route - so with no rule of its own,
  // every photograph in the public diary answered 403 and the page rendered
  // with empty frames and nothing in the console but "Failed to load
  // resource" (found by `e2e/notes.spec.ts` on the first page in the book to
  // display a photograph at all). These two cases are the regression guard,
  // and they are a pair on purpose: the collection has to be readable AND
  // still has to withhold what an editor hid, since SECURITY.md's whole
  // objection to direct media URLs is that they "invite enumeration of
  // everything in the bucket, including anything marked hidden".
  it('serves a media item to an unauthenticated reader, so the public diary can show a photograph', async () => {
    const visible = await payload.create({
      collection: 'media',
      data: { kind: 'still', alt: 'test-access-visible', order: 0 },
      file: { data: await aTinyPng(), mimetype: 'image/png', name: 'test-access-visible.png', size: 1 },
    })

    const read = await payload.find({
      collection: 'media',
      overrideAccess: false,
      where: { id: { equals: visible.id } },
    })

    expect(read.docs).toHaveLength(1)
  })

  it('withholds a hidden media item from an unauthenticated reader, so hiding one is not merely cosmetic', async () => {
    const concealed = await payload.create({
      collection: 'media',
      data: { kind: 'still', alt: 'test-access-hidden', order: 0, hidden: true },
      file: { data: await aTinyPng(), mimetype: 'image/png', name: 'test-access-hidden.png', size: 1 },
    })

    const asReader = await payload.find({
      collection: 'media',
      overrideAccess: false,
      where: { id: { equals: concealed.id } },
    })
    const asServer = await payload.find({ collection: 'media', where: { id: { equals: concealed.id } } })

    expect(asReader.docs).toHaveLength(0)
    // The row is still there — it is hidden from readers, not deleted.
    expect(asServer.docs).toHaveLength(1)
  })

  it('shows a hidden media item to a signed-in editor, so the admin is not lying about what exists', async () => {
    const concealed = await payload.create({
      collection: 'media',
      data: { kind: 'still', alt: 'test-access-hidden-editor', order: 0, hidden: true },
      file: { data: await aTinyPng(), mimetype: 'image/png', name: 'test-access-hidden-editor.png', size: 1 },
    })
    const editor = await payload.create({
      collection: 'users',
      data: { email: 'test-access-editor@example.com', password: 'not-a-real-password' },
    })

    // `overrideAccess: false` WITH a user is what an admin request is; the
    // two cases above are what a signed-out reader is.
    const asEditor = await payload.find({
      collection: 'media',
      overrideAccess: false,
      user: editor,
      where: { id: { equals: concealed.id } },
    })

    expect(asEditor.docs).toHaveLength(1)
  })

  it('refuses every operation on otpChallenges, signed in or out, so a code hash is neither enumerable nor resettable', async () => {
    const account = guardEditor
    const row = await payload.create({ collection: 'otpChallenges', data: anOtpChallengeFor(account.id) })

    const signedOut = await operationsAllowedBy({
      read: () => payload.find({ collection: 'otpChallenges', overrideAccess: false }),
      create: () =>
        payload.create({ collection: 'otpChallenges', overrideAccess: false, data: anOtpChallengeFor(account.id) }),
      update: () =>
        payload.update({ collection: 'otpChallenges', id: row.id, overrideAccess: false, data: { attempts: 0 } }),
      delete: () => payload.delete({ collection: 'otpChallenges', id: row.id, overrideAccess: false }),
    })
    const signedIn = await operationsAllowedBy({
      read: () => payload.find({ collection: 'otpChallenges', overrideAccess: false, user: account }),
      create: () =>
        payload.create({
          collection: 'otpChallenges',
          overrideAccess: false,
          user: account,
          data: anOtpChallengeFor(account.id),
        }),
      update: () =>
        payload.update({
          collection: 'otpChallenges',
          id: row.id,
          overrideAccess: false,
          user: account,
          data: { attempts: 0 },
        }),
      delete: () => payload.delete({ collection: 'otpChallenges', id: row.id, overrideAccess: false, user: account }),
    })

    // A signed-in `delete` here is the sharpest of the four: it would let the
    // holder of an account throw away the attempt counter that limits guesses
    // against their own challenge.
    expect({ signedOut, signedIn }).toEqual({ signedOut: [], signedIn: [] })
  })

  it('rebuilds every table a journey, its highlights and its tally need, after rolling all migrations back to zero and re-applying them', async () => {
    const written = await payload.create({ collection: 'journeys', data: aReversibilityJourney() })
    const captured = {
      name: written.name,
      place: written.place,
      dates: written.dates,
      weather: written.weather,
      mood: written.mood,
      note: written.note,
      signoff: written.furniture?.signoff,
      stampValue: written.furniture?.stampValue,
      highlights: (written.highlights ?? []).map((highlight) => highlight.text),
      tally: (written.tally ?? []).map((row) => `${row.key ?? ''}=${row.value ?? ''}`),
    }

    // To zero, not one batch: `migrateDown()` rolls back only the LAST batch,
    // so whether the initial migration's own down() runs at all depends on
    // whether the two migrations happened to be applied together. Looping to
    // zero makes it run regardless - it is the only thing that exercises that
    // file's DROP path, including its hand-fixed statement order.
    await runMigrateDownToZero()

    // THE `finally` IS THE POINT OF THIS BLOCK, NOT TIDINESS - the same
    // reasoning as the two per-migration cases below, arrived at here later
    // than it should have been. Between the rollback above and the re-apply
    // below, `diary_test` has no schema at all. Either assertion inside the
    // block can fail, and without the `finally` that failure stops being a red
    // test and becomes a session in which nothing can be verified: every later
    // file in this project connects to an empty database, and the damage
    // presents as a broken fixture several files away from the test that
    // caused it. Documenting that hazard, which is what the previous revision
    // did, is not the same as closing it.
    //
    // What the `finally` covers is an ASSERTION failing while the schema is
    // sound - the ordinary red-test case - after which the re-apply succeeds
    // and the database heals itself. What it cannot cover is a `down()` that
    // leaves artefacts behind, because then the re-apply legitimately fails on
    // the collision; that case still needs the hand repair `docs/testing.md`
    // §9 describes, and no arrangement of this test can avoid it.
    try {
      // Asserted here, mid-test, rather than with the rest below -
      // deliberately. Payload's own migrate() calls process.exit(1) when a
      // migration fails, so a rollback that left a table behind would kill
      // this worker on the re-apply, before any assertion could name what went
      // wrong. These two lines are what turn a broken down() into a readable
      // test failure instead of a dead process.
      expect(await appliedMigrationCount()).toBe(0)
      expect(await existingTablesAmong(JOURNEY_TABLES)).toEqual([])
    } finally {
      await runMigrateUp()
    }

    const restored = await payload.create({ collection: 'journeys', data: aReversibilityJourney() })

    expect({
      name: restored.name,
      place: restored.place,
      dates: restored.dates,
      weather: restored.weather,
      mood: restored.mood,
      note: restored.note,
      signoff: restored.furniture?.signoff,
      stampValue: restored.furniture?.stampValue,
      highlights: (restored.highlights ?? []).map((highlight) => highlight.text),
      tally: (restored.tally ?? []).map((row) => `${row.key ?? ''}=${row.value ?? ''}`),
    }).toEqual(captured)
  })

  // The `session_hash` column added by `20260905_202028_add_otp_session_hash`
  // (Phase 2 Task 3, docs/deviations.md §25) gets its own case, and that case
  // rolls back THAT MIGRATION ALONE rather than reusing the roll-to-zero
  // above. The first version of it did reuse it, and was worthless: a
  // reviewer replaced the migration's `down()` with a no-op and every test
  // here still passed. Rolling to zero means the INITIAL migration's
  // `DROP TABLE` removes `otp_challenges` outright, so "the column is gone"
  // was true whatever this migration's `down()` did - and the assertion was
  // on the TABLE, which the initial migration rebuilds, not on the column.
  //
  // This version calls the migration file's own `up()` and `down()` directly
  // and asserts on the COLUMN and its INDEX, which is the only pair of facts
  // this migration is responsible for. Verified by mutation: replacing
  // `down()` with a no-op fails it (see the task report).
  it('drops and restores only the otpChallenges session binding when its own migration is reversed', async () => {
    expect(await sessionHashSchema()).toEqual(['column', 'index'])

    await runMigrationDirection(SESSION_HASH_MIGRATION, 'down', payload)
    // THE `finally` IS THE POINT OF THIS BLOCK, NOT TIDINESS. Between the
    // `down` above and the `up` below, `diary_test` is in a state
    // `payload_migrations` does not describe: the column is gone while the
    // bookkeeping still records the migration as applied, so the next run's
    // `runMigrateUp()` is a no-op and EVERY subsequent integration run fails
    // against a database with no way to repair itself. Without this, one
    // failing assertion in here stops being a red test and becomes a session
    // in which nothing at all can be verified - and the damage presents as a
    // broken fixture, several files away from the test that caused it. The
    // version this replaced rolled every migration to zero, which was
    // worthless as a test (see below) but was at least self-healing; the
    // narrower test must not buy its precision with that blast radius.
    try {
      expect(await sessionHashSchema()).toEqual([])
      // The table itself must survive: this migration adds a column to a table
      // it did not create, so a `down()` that took the table with it would be a
      // different and much worse kind of reversible.
      expect(await existingTablesAmong(['otp_challenges'])).toEqual(['otp_challenges'])
    } finally {
      await runMigrationDirection(SESSION_HASH_MIGRATION, 'up', payload)
    }

    expect(await sessionHashSchema()).toEqual(['column', 'index'])
    // And the rebuilt column still holds what it is for. A migration that
    // restored a column of the wrong type or nullability would satisfy every
    // assertion above and fail the first time anything wrote to it.
    const account = await payload.create({
      collection: 'users',
      data: { email: FIXTURE_REVERSIBILITY_EMAIL, password: 'not-a-real-password' },
    })
    const restored = await payload.create({ collection: 'otpChallenges', data: anOtpChallengeFor(account.id) })

    expect(restored.sessionHash).toBe(FIXTURE_SESSION_HASH)
  })

  it('refuses every operation on signInAttempts, signed in or out, so nobody can clear or forge their own window', async () => {
    const attempted = new Date().toISOString()
    const row = await payload.create({
      collection: 'signInAttempts',
      data: { dimension: 'ip', endpoint: 'code', subject: GUARD_FIXTURE_MARKER, attemptedAt: attempted },
    })
    const editor = guardEditor

    const signedOut = await operationsAllowedBy({
      read: () => payload.find({ collection: 'signInAttempts', overrideAccess: false }),
      create: () =>
        payload.create({
          collection: 'signInAttempts',
          overrideAccess: false,
          data: { dimension: 'ip', endpoint: 'code', subject: GUARD_FIXTURE_MARKER, attemptedAt: attempted },
        }),
      update: () =>
        payload.update({
          collection: 'signInAttempts',
          id: row.id,
          overrideAccess: false,
          data: { endpoint: 'password' },
        }),
      delete: () => payload.delete({ collection: 'signInAttempts', id: row.id, overrideAccess: false }),
    })
    const signedIn = await operationsAllowedBy({
      read: () => payload.find({ collection: 'signInAttempts', overrideAccess: false, user: editor }),
      create: () =>
        payload.create({
          collection: 'signInAttempts',
          overrideAccess: false,
          user: editor,
          data: { dimension: 'ip', endpoint: 'code', subject: GUARD_FIXTURE_MARKER, attemptedAt: attempted },
        }),
      update: () =>
        payload.update({
          collection: 'signInAttempts',
          id: row.id,
          overrideAccess: false,
          user: editor,
          data: { endpoint: 'password' },
        }),
      delete: () => payload.delete({ collection: 'signInAttempts', id: row.id, overrideAccess: false, user: editor }),
    })

    // `delete` is the operation this collection cannot afford to leak: a
    // signed-in caller who can remove their own rows has no rate limit at all,
    // and every one of the bursts in `rateLimit.integration.test.ts` would
    // still pass.
    expect({ signedOut, signedIn }).toEqual({ signedOut: [], signedIn: [] })
  })

  // The sliding window's own table gets the same per-migration treatment the
  // `session_hash` column above does, and for the same reason: rolling every
  // migration to zero would drop this table as a side effect of the INITIAL
  // migration's `DROP TABLE`s, so it would say nothing about whether THIS
  // migration's `down()` did anything. This case runs that migration's own
  // `up()`/`down()` and asserts on all five artefacts it is responsible for -
  // the table, its compound index, its two enum types, and the column it adds
  // to `payload_locked_documents_rels`. Verified by mutation: replacing
  // `down()` with a no-op fails it (see the task report).
  it('drops and restores the whole sign-in attempt window, enum types included, when its own migration is reversed', async () => {
    expect(await signInAttemptsSchema()).toEqual(SIGN_IN_ATTEMPTS_SCHEMA)

    await runMigrationDirection(SIGN_IN_ATTEMPTS_MIGRATION, 'down', payload)
    // THE `finally` IS THE POINT OF THIS BLOCK, NOT TIDINESS - see the
    // otpChallenges case above. Between the `down` and the `up`, `diary_test`
    // is in a state `payload_migrations` does not describe, and the next
    // run's `runMigrateUp()` would be a no-op against a database with no way
    // to repair itself.
    try {
      expect(await signInAttemptsSchema()).toEqual([])
    } finally {
      await runMigrationDirection(SIGN_IN_ATTEMPTS_MIGRATION, 'up', payload)
    }

    expect(await signInAttemptsSchema()).toEqual(SIGN_IN_ATTEMPTS_SCHEMA)
    // And the rebuilt table still holds what it is for. A migration that
    // restored a column of the wrong type, or an enum missing a value, would
    // satisfy every assertion above and fail the first time anything wrote.
    const restored = await payload.create({
      collection: 'signInAttempts',
      data: { dimension: 'account', endpoint: 'password', subject: 'test-reversibility', attemptedAt: new Date().toISOString() },
    })
    await payload.delete({ collection: 'signInAttempts', id: restored.id })

    expect(restored.dimension).toBe('account')
  })
})
