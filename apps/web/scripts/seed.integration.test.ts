/**
 * seed.integration.test.ts — behaviour spec for the prototype content seed.
 *
 * Integration test (CLAUDE.md §2): creates real `journeys`, `pages` and
 * `media` rows against the real Docker Postgres via the Payload Local API,
 * so it needs DATABASE_URL. Named `*.integration.test.ts` so it runs only
 * under the `integration` Vitest project (see ../../../vitest.config.ts),
 * never in `npm run verify` (pre-commit).
 *
 * Every photo slot's `stripedPlaceholder` SVG is rasterised to a real PNG
 * upload (see seed.ts's own header for why), which makes the *first* call to
 * `seed()` here - ninety media items across ten journeys - noticeably slower
 * than vitest's 5s default; every later call is idempotent lookups only.
 * `SEED_TEST_TIMEOUT_MS` covers the slow first call generously.
 *
 * `beforeAll` deletes the ten journeys (and their pages/media) before the
 * suite runs, rather than assuming a clean database: this file's own
 * assertions - and this repo's `vitest.integration.config.ts` coverage pass,
 * which needs seed.ts's create-a-new-row branches actually exercised, not
 * just its found-existing-row ones - would otherwise depend on whether a
 * previous run (or `npm run db:seed` itself) already seeded this same
 * database, which is exactly the kind of history-dependent test CLAUDE.md
 * §2.3 warns against ("a test that has never failed is unproven").
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { getPayload } from '../lib/payload.js'
import { seed } from './seed.js'
import { journeySeeds } from './seed-data.js'

const SEED_TEST_TIMEOUT_MS = 60_000

describe('seed', () => {
  let payload: Awaited<ReturnType<typeof getPayload>>

  beforeAll(async () => {
    payload = await getPayload()

    for (const { slug } of journeySeeds) {
      const found = await payload.find({ collection: 'journeys', where: { slug: { equals: slug } } })
      const journey = found.docs[0]
      if (!journey) continue

      const pages = await payload.find({ collection: 'pages', where: { journey: { equals: journey.id } } })
      for (const page of pages.docs) {
        await payload.delete({ collection: 'pages', id: page.id })
      }
      const media = await payload.find({ collection: 'media', where: { journey: { equals: journey.id } } })
      for (const item of media.docs) {
        await payload.delete({ collection: 'media', id: item.id })
      }
      await payload.delete({ collection: 'journeys', id: journey.id })
    }
  }, SEED_TEST_TIMEOUT_MS)

  it(
    'creates the ten journeys the prototype ships with',
    async () => {
      await seed(payload)

      const journeys = await payload.find({ collection: 'journeys', limit: 100 })
      expect(journeys.totalDocs).toBe(10)
    },
    SEED_TEST_TIMEOUT_MS,
  )

  it(
    'creates thirty-three pages - Cover, Contents, About, and three per journey',
    async () => {
      await seed(payload)

      const pages = await payload.find({ collection: 'pages', limit: 200 })
      // 3 global + (10 journeys x 3) = 33, matching the handoff's stated scale.
      expect(pages.totalDocs).toBe(3 + 10 * 3)
    },
    SEED_TEST_TIMEOUT_MS,
  )

  it(
    'gives every journey exactly four tally metrics',
    async () => {
      await seed(payload)

      const journeys = await payload.find({ collection: 'journeys', limit: 100 })
      for (const journey of journeys.docs) {
        expect(journey.tally).toHaveLength(4)
      }
    },
    SEED_TEST_TIMEOUT_MS,
  )

  it(
    'keeps the handoff copy verbatim',
    async () => {
      await seed(payload)

      const lisbon = await payload.find({
        collection: 'journeys',
        where: { slug: { equals: 'lisbon' } },
      })
      // The voice is deliberate and final. If this ever needs changing, the
      // handoff changed - not the seed. (The prototype's own ledger writes
      // the count as the numeral "19", not the word "nineteen" - "nineteen
      // tarts, no regrets" is the sign-off's wording, not the tally's; this
      // asserts the tally's own verbatim value rather than the sign-off's.)
      const custardTarts = lisbon.docs[0]?.tally?.find((entry) => entry.key === 'Custard tarts')
      expect(custardTarts).toMatchObject({ value: '19' })
      expect(lisbon.docs[0]?.furniture?.signoff).toBe('nineteen tarts, no regrets')
    },
    SEED_TEST_TIMEOUT_MS,
  )

  it(
    'is idempotent, so re-seeding does not duplicate a journey',
    async () => {
      await seed(payload)
      await seed(payload)

      const journeys = await payload.find({ collection: 'journeys', limit: 100 })
      expect(journeys.totalDocs).toBe(10)
    },
    SEED_TEST_TIMEOUT_MS,
  )
})
