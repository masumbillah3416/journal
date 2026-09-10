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
 * The FIVE reversibility cases are the Migration suite of CLAUDE.md §2, one
 * per migration on disk after the initial one: the journey case covers the
 * migration that creates tables (and rolls every migration to zero to reach
 * it), and the `otpChallenges`, `signInAttempts`, `sessions` and `media`
 * cases each roll back ONE migration and assert on exactly the artefacts that
 * migration is responsible for. They are separate because they fail
 * differently - see the comment on each.
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
import { randomUUID } from 'node:crypto'
import type { MigrateUpArgs } from '@payloadcms/db-postgres'
import { Client } from 'pg'
import { type PayloadRequest, readMigrationFiles } from 'payload'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { env } from '../lib/env'
import { appliedMigrationCount, runMigrateDownToZero, runMigrateUp } from '../lib/migrate'
import { getPayload } from '../lib/payload'
import { getTestPayload } from '../lib/testPayload'

/**
 * The slug prefix every cover-hook journey is minted under, and the entry in
 * `FIXTURE_SLUGS` that removes all of them. Prefixed `test-` like every other
 * fixture slug, so no seeded journey can match it.
 */
const FIXTURE_COVER_SLUG_PREFIX = 'test-cover-'

/**
 * What `afterAll` sweeps the `journeys` collection by. Entries are matched as
 * PREFIXES, not whole slugs, which is what lets the last one stand for every
 * journey the cover-hook cases mint: `journeys.slug` is unique and those cases
 * need several journeys at once, so their slugs cannot be literals.
 */
const FIXTURE_SLUGS = ['test-tokyo', 'test-bergen', 'test-lisbon', 'test-reversibility', FIXTURE_COVER_SLUG_PREFIX]

/** The `alt` values the two media access fixtures are created with, so `afterAll` can find and delete them. */
const FIXTURE_MEDIA_ALTS = ['test-access-visible', 'test-access-hidden', 'test-access-hidden-editor']

/**
 * The `alt` value every media row the Phase 3 fixtures upload carries. One
 * value rather than one per case so `afterAll`'s existing loop over
 * `FIXTURE_MEDIA_ALTS` removes them all, and no second cleanup path exists to
 * forget.
 */
const FIXTURE_MEDIA_STATE_ALT = 'test-media-state'

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
 * A journey for the cover-hook cases: the shape `aReversibilityJourney()`
 * returns, with a slug of its own.
 *
 * The slug is minted per call rather than fixed because these cases need two
 * journeys at once and `journeys.slug` is unique - two of them sharing a
 * literal would fail inside the fixture rather than in the assertion it was
 * written for, and a slug left behind by an interrupted run would fail the
 * next one. `afterAll` removes them all by the shared prefix.
 * @param overrides - Fields to replace; `slug` is the only one a case pins.
 * @returns The journey's create data.
 */
const aCoverFixtureJourney = (
  overrides: Partial<{ readonly slug: string }> = {},
): ReturnType<typeof aReversibilityJourney> => ({
  ...aReversibilityJourney(),
  slug: `${FIXTURE_COVER_SLUG_PREFIX}${randomUUID()}`,
  ...overrides,
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
const anOtpChallengeFor = (
  account: number,
): {
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

/** The migration that gives a session row a lifetime of its own (Phase 2 Task 6). */
const SESSION_EXPIRY_MIGRATION = '20260906_004937_add_session_expiry'

/** The email the session-expiry fixture's account uses, so `afterAll` can remove it. */
const FIXTURE_SESSION_EXPIRY_EMAIL = 'test-session-expiry@example.com'

/** The `device` value the session-expiry fixture row carries, so `afterAll` can find it. */
const FIXTURE_SESSION_DEVICE = 'test-session-expiry-device'

/**
 * Which of the `expires_at` column and the `token_hash` index currently
 * exist.
 *
 * Asked of `information_schema` rather than of Payload, and asked for the
 * COLUMN and the INDEX rather than for the table: this migration adds both to
 * a table it did not create, so "the table is gone" would say nothing about
 * whether its `down()` did anything at all — the same trap the `session_hash`
 * case above records.
 * @returns `['column', 'index']` when both exist, a subset otherwise, sorted
 *   so an assertion reads as a set.
 */
const sessionExpirySchema = async (): Promise<string[]> => {
  const client = new Client({ connectionString: env.DATABASE_URL })
  await client.connect()
  try {
    const found = await client.query<{ artefact: string }>(
      `SELECT 'column' AS artefact FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'sessions' AND column_name = 'expires_at'
       UNION ALL
       SELECT 'index' FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = 'sessions_token_hash_idx'`,
    )
    return found.rows.map((row) => row.artefact).sort()
  } finally {
    await client.end()
  }
}

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
const SIGN_IN_ATTEMPTS_SCHEMA = ['dimension-type', 'endpoint-type', 'index', 'locked-documents-column', 'table']

/** The migration that gives a media row a processing state (Phase 3 Task 5). */
const MEDIA_STATE_MIGRATION = '20260910_171154_add_media_state'

/**
 * Which of the artefacts `MEDIA_STATE_MIGRATION` is responsible for exist.
 *
 * The enum type as well as the columns: a `down()` that dropped the columns
 * and left `enum_media_state` behind would satisfy a column-only assertion
 * and then fail its own re-apply with "type already exists" - the failure the
 * hand-fixed statement order in `add_jobs` exists to prevent. And the `media`
 * table itself, because this migration adds to a table it did not create.
 * @returns The artefacts that exist, sorted, so an assertion reads as a set.
 */
const mediaStateSchema = async (): Promise<string[]> => {
  const client = new Client({ connectionString: env.DATABASE_URL })
  await client.connect()
  try {
    const found = await client.query<{ artefact: string }>(
      `SELECT 'state-column' AS artefact FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'media' AND column_name = 'state'
       UNION ALL
       SELECT 'reason-column' FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'media' AND column_name = 'failure_reason'
       UNION ALL
       SELECT 'state-type' FROM pg_type WHERE typname = 'enum_media_state'
       UNION ALL
       SELECT 'media-table' FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'media'`,
    )
    return found.rows.map((row) => row.artefact).sort()
  } finally {
    await client.end()
  }
}

/** Every artefact `mediaStateSchema` looks for, when the migration is applied. */
const MEDIA_STATE_SCHEMA = ['media-table', 'reason-column', 'state-column', 'state-type']

/** What `mediaStateSchema` returns when this migration's `down()` has run: the table alone. */
const MEDIA_STATE_SCHEMA_ROLLED_BACK = ['media-table']

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

/**
 * Rolls one migration down, reads the schema it left behind, and puts it back.
 *
 * ═══ WHY THE PROBE IS CAPTURED RATHER THAN ASSERTED IN PLACE ═══
 *
 * The four cases below used to assert INSIDE a `try` whose `finally`
 * re-applied the migration. Between the `down` and the `up`, `diary_test` is
 * in a state `payload_migrations` does not describe, so the re-apply is not
 * tidiness: without it, one failing assertion leaves a database the next
 * run's `runMigrateUp()` cannot repair, because it has nothing pending to
 * apply. That part was right and is unchanged.
 *
 * What was wrong is what the failure then SAYS. A `down()` that leaves
 * artefacts behind - the exact mutation these cases exist to catch - makes
 * the re-apply collide (`type "enum_media_state" already exists`), and a
 * `finally` that throws REPLACES the error from the `try`. So the mutation's
 * report named the collision rather than the assertion diff, and Task 5's
 * report recorded that masking as intrinsic. It is not: capture the probe,
 * re-apply tolerantly, assert afterwards, and the same mutation reports
 * `expected [ Array(4) ] to deeply equal [ 'media-table' ]`.
 *
 * The tolerance is NARROW rather than a swallow (CLAUDE.md §3.1): the
 * re-apply's failure is accepted only when the schema is back in its applied
 * state anyway, which is the one situation a collision means. Anything else
 * is re-thrown, because a repair that did not repair must not be quiet.
 * @param migration - The migration's name, as `payload_migrations` records it.
 * @param payload - The test Payload instance.
 * @param probe - `read` gathers whatever the caller wants to assert about the
 *   rolled-back schema; `whenApplied` is what `read` answers once the
 *   migration is back, and the only answer a collision is tolerated for.
 * @returns What `read` answered while the migration was rolled back.
 */
const acrossItsOwnRollback = async <T>(
  migration: string,
  payload: Awaited<ReturnType<typeof getPayload>>,
  probe: { readonly read: () => Promise<T>; readonly whenApplied: T },
): Promise<T> => {
  await runMigrationDirection(migration, 'down', payload)
  try {
    return await probe.read()
  } finally {
    try {
      await runMigrationDirection(migration, 'up', payload)
    } catch (reapplyFailure) {
      if (JSON.stringify(await probe.read()) !== JSON.stringify(probe.whenApplied)) throw reapplyFailure
    }
  }
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

  /**
   * Creates one media row for the cover-hook cases.
   *
   * The filename is minted per call because Payload derives the stored file's
   * name from it, and two fixtures uploading `cover.png` would collide in the
   * media directory rather than in an assertion. `alt` is the shared fixture
   * value, so `afterAll`'s one media loop removes these too.
   * @param input - The journey the row belongs to (`null` for none, which is a
   *   case of its own) and whether it is that journey's cover.
   * @returns The created media row.
   */
  const createFixtureMedia = async (input: { readonly journey: number | null; readonly isCover: boolean }) => {
    const png = await aTinyPng()
    return payload.create({
      collection: 'media',
      data: { journey: input.journey, isCover: input.isCover, alt: FIXTURE_MEDIA_STATE_ALT },
      file: { data: png, mimetype: 'image/png', name: `test-cover-${randomUUID()}.png`, size: png.length },
    })
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
    // The same narrow repair for the same narrow hazard, for the session
    // expiry case below: `expires_at` dropped while `payload_migrations`
    // still records its migration as applied. Reachable only by the worker
    // being killed outright between that case's `down` and its `up`, which
    // is the one way a `finally` cannot cover.
    if ((await sessionExpirySchema()).length === 0) {
      await runMigrationDirection(SESSION_EXPIRY_MIGRATION, 'up', payload)
    }
    // And once more for the media state case: its two columns and its enum
    // type dropped while `payload_migrations` still records the migration as
    // applied. Compared against the rolled-back set rather than emptiness,
    // because `media` is a table this migration did not create, so it is
    // still there when this migration's own artefacts are not.
    if (JSON.stringify(await mediaStateSchema()) === JSON.stringify(MEDIA_STATE_SCHEMA_ROLLED_BACK)) {
      await runMigrationDirection(MEDIA_STATE_MIGRATION, 'up', payload)
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
    // Matched with `like` - Payload's case-insensitive contains - rather than
    // `equals`, so the one `test-cover-` entry sweeps every journey the
    // cover-hook cases minted a unique slug for. Every entry starts `test-`,
    // so the ten real seeded journeys cannot match.
    for (const slug of FIXTURE_SLUGS) {
      const found = await payload.find({ collection: 'journeys', where: { slug: { like: slug } } })
      for (const doc of found.docs) {
        await payload.delete({ collection: 'journeys', id: doc.id })
      }
    }
    // The two media access fixtures, for the same reason the journeys are
    // removed: `seed.integration.test.ts` counts rows in the shared
    // collections, and a fixture left behind here inflates whichever file
    // runs second.
    for (const alt of [...FIXTURE_MEDIA_ALTS, FIXTURE_MEDIA_STATE_ALT]) {
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
    // The session-expiry case's own fixtures, cleared for the same reason and
    // in the same order: `sessions.user_id` is NOT NULL, so the session row
    // goes before the account it points at.
    const sessionFixtures = await payload.find({
      collection: 'sessions',
      where: { device: { equals: FIXTURE_SESSION_DEVICE } },
    })
    for (const row of sessionFixtures.docs) {
      await payload.delete({ collection: 'sessions', id: row.id })
    }
    const sessionAccounts = await payload.find({
      collection: 'users',
      where: { email: { equals: FIXTURE_SESSION_EXPIRY_EMAIL } },
    })
    for (const doc of sessionAccounts.docs) {
      await payload.delete({ collection: 'users', id: doc.id })
    }

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

  it('clears isCover on the journeys other media when a new cover is set', async () => {
    const journey = await payload.create({ collection: 'journeys', data: aCoverFixtureJourney() })
    const first = await createFixtureMedia({ journey: journey.id, isCover: true })
    const second = await createFixtureMedia({ journey: journey.id, isCover: false })
    // The fixture really did set a cover: without this, a `createFixtureMedia`
    // that silently dropped `isCover` would leave the assertion below passing
    // on a row that was never the cover in the first place.
    expect(first.isCover).toBe(true)

    await payload.update({ collection: 'media', id: second.id, data: { isCover: true } })

    const reread = await payload.findByID({
      collection: 'media',
      id: first.id,
      depth: 0,
      select: { isCover: true },
    })

    expect(reread.isCover).toBe(false)
  })

  it('leaves another journeys cover alone, because a cover belongs to one journey', async () => {
    // CLAUDE.md §7: key everything by journey id. A hook that cleared every
    // isCover in the collection would be the sixth defect of the family the
    // handoff already records five of, and the case above cannot see the
    // difference - with one journey, its media are also all the media.
    const mine = await payload.create({ collection: 'journeys', data: aCoverFixtureJourney() })
    const theirs = await payload.create({ collection: 'journeys', data: aCoverFixtureJourney() })
    const theirCover = await createFixtureMedia({ journey: theirs.id, isCover: true })
    const myNewCover = await createFixtureMedia({ journey: mine.id, isCover: false })
    expect(theirCover.isCover).toBe(true)

    await payload.update({ collection: 'media', id: myNewCover.id, data: { isCover: true } })

    const reread = await payload.findByID({
      collection: 'media',
      id: theirCover.id,
      depth: 0,
      select: { isCover: true },
    })

    expect(reread.isCover).toBe(true)
  })

  it('clears the previous cover when the update is made at depth 0, where a journey is an id', async () => {
    // The mirror of the first case rather than a duplicate of it: at depth 0
    // Payload hands the hook `doc.journey` as an id, and above 0 as a
    // populated journey. A hook that read only the object shape would clear
    // nothing here, and one that read only the id shape would clear nothing
    // there - both sides are pinned, because the cases written first
    // exercised only one of them.
    const journey = await payload.create({ collection: 'journeys', data: aCoverFixtureJourney() })
    const outgoing = await createFixtureMedia({ journey: journey.id, isCover: true })
    const incoming = await createFixtureMedia({ journey: journey.id, isCover: false })
    expect(outgoing.isCover).toBe(true)

    await payload.update({ collection: 'media', id: incoming.id, depth: 0, data: { isCover: true } })

    const reread = await payload.findByID({
      collection: 'media',
      id: outgoing.id,
      depth: 0,
      select: { isCover: true },
    })

    expect(reread.isCover).toBe(false)
  })

  it('leaves every cover alone when the new cover belongs to no journey at all', async () => {
    // `journey` is optional on `media`, so `isCover` can be set on a row that
    // belongs to nothing. "Clear the other media in no journey" must not
    // become "clear the other media", which is the one way this hook could
    // reach a journey nobody named.
    const journey = await payload.create({ collection: 'journeys', data: aCoverFixtureJourney() })
    const cover = await createFixtureMedia({ journey: journey.id, isCover: true })
    const orphan = await createFixtureMedia({ journey: null, isCover: false })
    expect(cover.isCover).toBe(true)

    await payload.update({ collection: 'media', id: orphan.id, data: { isCover: true } })

    const reread = await payload.findByID({
      collection: 'media',
      id: cover.id,
      depth: 0,
      select: { isCover: true },
    })

    expect(reread.isCover).toBe(true)
  })

  it('leaves the journeys cover alone when a sibling is edited without touching isCover', async () => {
    // The hook fires on EVERY change to a media row, not only on a cover
    // being set. Without the isCover guard, editing a caption anywhere in a
    // journey would quietly clear that journey's cover - and none of the
    // cases above can see that, because each of them sets isCover to true.
    const journey = await payload.create({ collection: 'journeys', data: aCoverFixtureJourney() })
    const cover = await createFixtureMedia({ journey: journey.id, isCover: true })
    const sibling = await createFixtureMedia({ journey: journey.id, isCover: false })
    expect(cover.isCover).toBe(true)

    await payload.update({ collection: 'media', id: sibling.id, data: { caption: 'nineteen tarts, no regrets' } })

    const reread = await payload.findByID({
      collection: 'media',
      id: cover.id,
      depth: 0,
      select: { isCover: true },
    })

    expect(reread.isCover).toBe(true)
  })

  it('rewrites only the media that was actually the cover, never the rest of the journey', async () => {
    // What the isCover-equals-true clause in the `where` is FOR. Measured by
    // mutation: dropping that clause leaves every other case in this file
    // green, because the guard on the changed doc is what bounds the
    // recursion - the clause is what keeps the write narrow (CLAUDE.md §6, no
    // needless writes and no N+1), and `updatedAt` is how a needless write
    // shows. Without it, setting a cover rewrites every row in the journey.
    const journey = await payload.create({ collection: 'journeys', data: aCoverFixtureJourney() })
    const outgoing = await createFixtureMedia({ journey: journey.id, isCover: true })
    const bystander = await createFixtureMedia({ journey: journey.id, isCover: false })
    const incoming = await createFixtureMedia({ journey: journey.id, isCover: false })

    await payload.update({ collection: 'media', id: incoming.id, data: { isCover: true } })

    // The hook DID run - the old cover is cleared - so an untouched bystander
    // below means the write was narrow, not that nothing happened at all.
    const cleared = await payload.findByID({
      collection: 'media',
      id: outgoing.id,
      depth: 0,
      select: { isCover: true },
    })
    expect(cleared.isCover).toBe(false)
    const reread = await payload.findByID({
      collection: 'media',
      id: bystander.id,
      depth: 0,
      select: { updatedAt: true },
    })

    expect(reread.updatedAt).toBe(bystander.updatedAt)
  })

  it('leaves another journeyless rows cover flag alone, because no journey is not a journey', async () => {
    // The other half of the no-journey guard. Without it the hook would run a
    // `journey IS NULL` query and reach across every row that belongs to
    // nothing - rows with no gallery to be the cover of, and no journey id to
    // be keyed by (CLAUDE.md §7). "No journey" is not a group.
    const firstOrphan = await createFixtureMedia({ journey: null, isCover: true })
    const secondOrphan = await createFixtureMedia({ journey: null, isCover: false })
    expect(firstOrphan.isCover).toBe(true)

    await payload.update({ collection: 'media', id: secondOrphan.id, data: { isCover: true } })

    const reread = await payload.findByID({
      collection: 'media',
      id: firstOrphan.id,
      depth: 0,
      select: { isCover: true },
    })

    expect(reread.isCover).toBe(true)
  })

  it('settles rather than recursing when the hook clears a sibling', async () => {
    // An afterChange that updates siblings fires afterChange for each sibling,
    // so the hook has to reach a fixed point rather than a stack overflow.
    const journey = await payload.create({ collection: 'journeys', data: aCoverFixtureJourney() })
    await createFixtureMedia({ journey: journey.id, isCover: true })
    const next = await createFixtureMedia({ journey: journey.id, isCover: false })

    await expect(payload.update({ collection: 'media', id: next.id, data: { isCover: true } })).resolves.toBeDefined()
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

    // The re-apply is not tidiness and the probe is not asserted in place:
    // see `acrossItsOwnRollback`. Between the `down` and the `up`,
    // `diary_test` is in a state `payload_migrations` does not describe, so a
    // failing assertion in here would otherwise stop being a red test and
    // become a session in which nothing at all can be verified - with the
    // damage presenting as a broken fixture several files away.
    const rolledBack = await acrossItsOwnRollback(SESSION_HASH_MIGRATION, payload, {
      read: async () => ({ binding: await sessionHashSchema(), tables: await existingTablesAmong(['otp_challenges']) }),
      whenApplied: { binding: ['column', 'index'], tables: ['otp_challenges'] },
    })

    // The column and the index are gone; the TABLE is not. This migration adds
    // a column to a table it did not create, so a `down()` that took the table
    // with it would be a different and much worse kind of reversible.
    expect(rolledBack).toEqual({ binding: [], tables: ['otp_challenges'] })
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

    // Probe captured, re-apply tolerant, assertion afterwards - see
    // `acrossItsOwnRollback` for why the older shape reported the re-apply's
    // collision instead of the diff.
    const rolledBack = await acrossItsOwnRollback(SIGN_IN_ATTEMPTS_MIGRATION, payload, {
      read: signInAttemptsSchema,
      whenApplied: SIGN_IN_ATTEMPTS_SCHEMA,
    })

    expect(rolledBack).toEqual([])
    expect(await signInAttemptsSchema()).toEqual(SIGN_IN_ATTEMPTS_SCHEMA)
    // And the rebuilt table still holds what it is for. A migration that
    // restored a column of the wrong type, or an enum missing a value, would
    // satisfy every assertion above and fail the first time anything wrote.
    const restored = await payload.create({
      collection: 'signInAttempts',
      data: {
        dimension: 'account',
        endpoint: 'password',
        subject: 'test-reversibility',
        attemptedAt: new Date().toISOString(),
      },
    })
    await payload.delete({ collection: 'signInAttempts', id: restored.id })

    expect(restored.dimension).toBe('account')
  })

  // The session row's lifetime column and the index its authentication reads
  // by (Phase 2 Task 6, docs/deviations.md §30) get the same per-migration
  // treatment as the two cases above, and for the same reason: rolling every
  // migration to zero would take `sessions` with it as a side effect of the
  // INITIAL migration's `DROP TABLE`, so it would say nothing about whether
  // THIS migration's `down()` did anything. This case runs that migration's
  // own `up()`/`down()` and asserts on the two artefacts it is responsible
  // for. Verified by mutation: replacing `down()` with a no-op fails it (see
  // the task report).
  it('drops and restores the session lifetime column and its lookup index when its own migration is reversed', async () => {
    expect(await sessionExpirySchema()).toEqual(['column', 'index'])

    // Probe captured, re-apply tolerant, assertion afterwards - see
    // `acrossItsOwnRollback`.
    const rolledBack = await acrossItsOwnRollback(SESSION_EXPIRY_MIGRATION, payload, {
      read: async () => ({ lifetime: await sessionExpirySchema(), tables: await existingTablesAmong(['sessions']) }),
      whenApplied: { lifetime: ['column', 'index'], tables: ['sessions'] },
    })

    // The table itself must survive: this migration adds a column and an index
    // to a table it did not create, so a `down()` that took the table with it
    // would be a different and much worse kind of reversible.
    expect(rolledBack).toEqual({ lifetime: [], tables: ['sessions'] })
    expect(await sessionExpirySchema()).toEqual(['column', 'index'])
    // And the rebuilt column still holds what it is for. A migration that
    // restored it nullable, or of the wrong type, would satisfy every
    // assertion above and fail the first time a session was issued.
    const account = await payload.create({
      collection: 'users',
      data: { email: FIXTURE_SESSION_EXPIRY_EMAIL, password: 'not-a-real-password' },
    })
    const expiresAt = new Date(Date.now() + 60 * 60_000).toISOString()
    const session = await payload.create({
      collection: 'sessions',
      data: { user: account.id, tokenHash: 'e'.repeat(64), expiresAt, device: FIXTURE_SESSION_DEVICE },
    })

    expect(session.expiresAt).toBe(expiresAt)
  })

  // The media row's processing state and its failure reason (Phase 3 Task 5)
  // get the same per-migration treatment as the three cases above, and for
  // the same reason: a roll to zero would drop `media` as a side effect of
  // the INITIAL migration, so it would say nothing about whether THIS
  // migration's `down()` did anything. Verified by mutation: replacing
  // `down()` with a comment fails it (see the task report).
  it('rolls the media state column and its enum type down and back up, with the table and its rows intact', async () => {
    const png = await aTinyPng()
    const existing = await payload.create({
      collection: 'media',
      data: { alt: FIXTURE_MEDIA_STATE_ALT },
      file: { data: png, mimetype: 'image/png', name: 'state-reversibility.png', size: png.length },
    })

    expect(await mediaStateSchema()).toEqual(MEDIA_STATE_SCHEMA)

    // THIS IS THE CASE THAT SHOWED THE OLDER SHAPE MASKING ITS OWN DIFF. With
    // `down()` replaced by a comment, the assertion failed - and then the
    // `finally`'s re-apply threw `type "enum_media_state" already exists`,
    // which replaced it, so the mutation's report named the collision rather
    // than the schema. Captured probe, tolerant re-apply, assertion
    // afterwards: the same mutation now reports
    // `expected [ Array(4) ] to deeply equal [ 'media-table' ]`. See
    // `acrossItsOwnRollback`.
    const rolledBack = await acrossItsOwnRollback(MEDIA_STATE_MIGRATION, payload, {
      read: mediaStateSchema,
      whenApplied: MEDIA_STATE_SCHEMA,
    })

    // The columns and the type are gone; the table and the row are not. A
    // `down()` that took `media` with it would be a much worse kind of
    // reversible - every photograph in the diary.
    expect(rolledBack).toEqual(MEDIA_STATE_SCHEMA_ROLLED_BACK)
    expect(await mediaStateSchema()).toEqual(MEDIA_STATE_SCHEMA)
    // And the row that predates the rollback still reads back through the
    // rebuilt schema: this migration adds columns rather than tables, so
    // nothing here is allowed to cost a photograph.
    const survived = await payload.findByID({
      collection: 'media',
      id: existing.id,
      depth: 0,
      select: { alt: true },
    })

    expect(survived.alt).toBe(FIXTURE_MEDIA_STATE_ALT)
  })
})
