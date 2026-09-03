/**
 * seed.integration.test.ts — behaviour spec for the prototype content seed.
 *
 * Integration test (CLAUDE.md §2): creates real `journeys`, `pages` and
 * `media` rows, and the `book`/`about` globals, against the real Docker
 * Postgres via the Payload Local API. Named `*.integration.test.ts` so it
 * runs only under the `integration` Vitest project (see
 * ../../../vitest.config.ts), never in `npm run verify` (pre-commit).
 *
 * Uses `getTestPayload()` (`../lib/testPayload`), not `getPayload()`
 * directly: every integration test file connects to an isolated `diary_test`
 * database, never the developer's own dev database (Task 10/11 review round
 * 1, finding 2) - see that module's header for why and how.
 *
 * Every photo slot's `stripedPlaceholder` SVG is rasterised to a real PNG
 * upload (see seed.ts's own header for why), which makes the *first* call to
 * `seed()` here - ninety-plus media items across ten journeys and the About
 * portrait - noticeably slower than vitest's 5s default; every later call is
 * idempotent lookups only. `SEED_TEST_TIMEOUT_MS` covers the slow first call
 * generously.
 *
 * `beforeAll` deletes the ten journeys (and their pages/media) before the
 * suite runs, rather than assuming a clean database: this file's own
 * assertions - and this repo's `vitest.integration.config.ts` coverage pass,
 * which needs seed.ts's create-a-new-row branches actually exercised, not
 * just its found-existing-row ones - would otherwise depend on whether a
 * previous run (or `npm run db:seed` itself) already seeded this same
 * database, which is exactly the kind of history-dependent test CLAUDE.md
 * §2.3 warns against ("a test that has never failed is unproven"). This is
 * safe precisely because it runs against the isolated `diary_test` database,
 * never a real developer's own data.
 *
 * Cover, Contents and About are not `pages` rows (Task 10/11 review round 1,
 * finding 1 - see seed.ts's own header, "CORRECTION", and
 * docs/deviations.md §5), so this file asserts thirty stored `pages` rows
 * and the two globals' content, not "thirty-three pages". The handoff's
 * 33-page reading sequence - Cover + Contents + thirty journey pages + About
 * - is a derived view `bookBundle` assembles in Phase 1 from those thirty
 * rows plus the two globals; it belongs to Phase 1's own test suite, not
 * this one, and is not faked here by counting something that is not a page.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { getTestPayload } from '../lib/testPayload'
import { seed } from './seed'
import { aboutGlobalSeed, bookGlobalSeed, journeySeeds } from './seed-data'

const SEED_TEST_TIMEOUT_MS = 60_000

describe('seed', () => {
  let payload: Awaited<ReturnType<typeof getTestPayload>>

  beforeAll(async () => {
    payload = await getTestPayload()

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

    // The About portrait belongs to no journey, so the loop above never
    // reaches it - deleted separately for the same determinism reason.
    const portraits = await payload.find({ collection: 'media', where: { alt: { equals: 'PORTRAIT' } } })
    for (const portrait of portraits.docs) {
      await payload.delete({ collection: 'media', id: portrait.id })
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
    'creates thirty pages - three per journey, and no rows for Cover, Contents or About',
    async () => {
      await seed(payload)

      const pages = await payload.find({ collection: 'pages', limit: 200 })
      // 10 journeys x 3 (Notes, Frames I, Frames II) = 30 stored rows.
      // Cover, Contents and About are not pages - see this file's own header.
      expect(pages.totalDocs).toBe(10 * 3)
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
    "populates the book global with the cover screen's verbatim content",
    async () => {
      await seed(payload)

      const book = await payload.findGlobal({ slug: 'book' })
      expect(book.title).toBe(bookGlobalSeed.title)
      expect(book.subtitle).toBe(bookGlobalSeed.subtitle)
      expect(book.owner).toBe(bookGlobalSeed.owner)
      expect(book.coverCloth).toBe(bookGlobalSeed.coverCloth)
      expect(book.yearsShown).toBe(bookGlobalSeed.yearsShown)
      expect(book.contentsNote).toBe(bookGlobalSeed.contentsNote)
    },
    SEED_TEST_TIMEOUT_MS,
  )

  it(
    "populates the about global with the about screen's verbatim content",
    async () => {
      await seed(payload)

      const about = await payload.findGlobal({ slug: 'about' })
      expect(about.portrait).toBeTruthy()
      expect(about.portraitCaption).toBe(aboutGlobalSeed.portraitCaption)
      expect(about.paragraphs?.map((p) => p.text)).toEqual(aboutGlobalSeed.paragraphs)
      expect(about.kit?.map((k) => k.text)).toEqual(aboutGlobalSeed.kit)
      expect(about.replyTo).toBe(aboutGlobalSeed.replyTo)
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
