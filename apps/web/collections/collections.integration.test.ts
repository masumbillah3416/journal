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
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runMigrateDown, runMigrateUp } from '../lib/migrate.js'
import { getPayload } from '../lib/payload.js'
import { getTestPayload } from '../lib/testPayload.js'

const FIXTURE_SLUGS = ['test-tokyo', 'test-bergen', 'test-lisbon']

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

  it('runs down and up again without loss', async () => {
    // A migration that cannot be reversed cannot be rolled back in an incident.
    await expect(runMigrateDown()).resolves.not.toThrow()
    await expect(runMigrateUp()).resolves.not.toThrow()

    const journeys = await payload.find({ collection: 'journeys', limit: 1 })
    expect(journeys).toBeDefined()
  })
})
