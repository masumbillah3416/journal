/**
 * collections.integration.test.ts — collection schema behaviour against real Postgres.
 *
 * Integration test (CLAUDE.md §2): exercises the structural rules from
 * DATA_MODEL.md that are painful to retrofit onto a collection with existing
 * rows — soft delete, drafts, the `highlights` cap and `tally`'s text values —
 * against a real Payload instance and a real Docker Postgres, not a mock.
 * Named `*.integration.test.ts` so it runs only under the `integration` Vitest
 * project (see vitest.config.ts), never in `npm run verify` (pre-commit).
 *
 * The last case is the Migration suite of CLAUDE.md §2. It replaced one named
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
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { env } from '../lib/env.js'
import { appliedMigrationCount, runMigrateDownToZero, runMigrateUp } from '../lib/migrate.js'
import { getPayload } from '../lib/payload.js'
import { getTestPayload } from '../lib/testPayload.js'

const FIXTURE_SLUGS = ['test-tokyo', 'test-bergen', 'test-lisbon', 'test-reversibility']

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

/** The three tables a journey's own fields, highlights and tally live in. */
const JOURNEY_TABLES = ['journeys', 'journeys_highlights', 'journeys_tally'] as const

describe('collections', () => {
  let payload: Awaited<ReturnType<typeof getPayload>>

  beforeAll(async () => {
    payload = await getTestPayload()
  })

  afterAll(async () => {
    // "test-marrakech" is deliberately absent: that test's create() is
    // expected to reject (the highlights-cap case), so no row ever exists.
    for (const slug of FIXTURE_SLUGS) {
      const found = await payload.find({ collection: 'journeys', where: { slug: { equals: slug } } })
      for (const doc of found.docs) {
        await payload.delete({ collection: 'journeys', id: doc.id })
      }
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

    // Asserted here, mid-test, rather than with the rest below - deliberately.
    // Payload's own migrate() calls process.exit(1) when a migration fails, so
    // a rollback that left a table behind would kill this worker on the
    // re-apply two lines down, before any assertion could name what went
    // wrong. These two lines are what turn a broken down() into a readable
    // test failure instead of a dead process.
    expect(await appliedMigrationCount()).toBe(0)
    expect(await existingTablesAmong(JOURNEY_TABLES)).toEqual([])

    await runMigrateUp()
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
})
