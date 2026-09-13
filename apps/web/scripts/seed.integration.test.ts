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

  it(
    'marks every media row it writes ready, which is what keeps the public diary lit',
    async () => {
      // ═══ THE HIGHEST-CONSEQUENCE LINE IN `seed.ts`, AND IT HAD NO CASE ═══
      //
      // `media.state` defaults to `processing`, and both
      // `collections/media.ts`'s reader rule and `lib/galleryFrames.ts`
      // withhold a row that is not `ready` from an unauthenticated reader -
      // the file route, the gallery grid, the census and the download handler.
      // A seed that omitted `state` would write ten journeys of photographs
      // that no signed-out reader can see, and every Vitest project would stay
      // green: the bundle readers are asserted against here with access
      // overridden. What would break is the running site.
      //
      // Counted rather than sampled, and asserted as a MAP so a failure names
      // the state it found rather than a boolean.
      await seed(payload)

      const media = await payload.find({ collection: 'media', limit: 500, depth: 0, select: { state: true } })
      const byState = media.docs.reduce<Record<string, number>>(
        (counted, row) => ({ ...counted, [String(row.state)]: (counted[String(row.state)] ?? 0) + 1 }),
        {},
      )
      expect({ states: Object.keys(byState).sort(), anyRowsAtAll: media.totalDocs > 0 }).toEqual({
        states: ['ready'],
        anyRowsAtAll: true,
      })
    },
    SEED_TEST_TIMEOUT_MS,
  )

  it(
    'writes a media row it has to CREATE as ready, not only one it updates',
    async () => {
      // THE CREATE PATH, PINNED ON ITS OWN. The case above cannot pin it: by
      // the time it runs, every row exists, so `seed` takes the update path for
      // all of them and a create that had lost `state` would still be repaired
      // before the assertion looked. Watched - removing `state` from both
      // creates leaves that case green and this one red.
      //
      // ═══ WHY IT BORROWS A SEEDED ROW RATHER THAN MAKING ITS OWN ═══
      //
      // The create path is `upsertSlotMedia`, which is not exported and is
      // keyed by (journey, alt). A row this case invented would be a row `seed`
      // never looks at, so `seed` would take no path at all over it. The only
      // way to make `seed` CREATE is to remove something `seed` owns.
      //
      // SO IT PUTS IT BACK, AND THE RESTORATION IS ASSERTED RATHER THAN
      // ASSUMED. The second `seed` call is both the act and the teardown: it
      // remakes the row, renumbers nothing else, and rewrites the page slots
      // that named the old id (`upsertJourneyPage` writes `slots` in full). The
      // count assertion is what makes this case safe to MOVE - it was
      // previously safe only because it sat second-to-last with a re-seed after
      // it, which is a shared mutable fixture held together by ordering
      // (CLAUDE.md §2.3, Task 8 round 3 item 3). It now leaves the store as it
      // found it, and fails if it does not.
      await seed(payload)
      const before = await payload.count({ collection: 'media' })
      const existing = await payload.find({
        collection: 'media',
        limit: 1,
        depth: 0,
        where: { journey: { exists: true } },
        select: { alt: true },
      })
      const borrowed = existing.docs[0]
      if (borrowed === undefined) throw new Error('the seed wrote no journey media to remove and remake')
      const label = borrowed.alt ?? ''
      await payload.delete({ collection: 'media', id: borrowed.id })

      await seed(payload)

      const remade = await payload.find({
        collection: 'media',
        limit: 1,
        depth: 0,
        where: { alt: { equals: label } },
        select: { state: true },
      })
      const after = await payload.count({ collection: 'media' })
      expect({
        found: remade.totalDocs,
        state: remade.docs[0]?.state,
        storeRestored: after.totalDocs === before.totalDocs,
      }).toEqual({ found: 1, state: 'ready', storeRestored: true })
    },
    SEED_TEST_TIMEOUT_MS,
  )

  it(
    'returns a media row to ready on a re-seed, so an existing store is repaired rather than needing a wipe',
    async () => {
      // THE UPDATE PATH, which is the half a reader would most plausibly delete
      // as a redundant write ("create already sets it"). Every row an earlier
      // seed wrote took the `processing` default, and `upsertSlotMedia` returns
      // early for a row that exists - so without `state` on that update, a
      // developer's store stays dark through any number of re-seeds. Forcing a
      // row back to `processing` is exactly the state such a store is in.
      await seed(payload)
      const before = await payload.find({ collection: 'media', limit: 1, depth: 0 })
      const victim = before.docs[0]
      if (victim === undefined) throw new Error('the seed wrote no media to force back to processing')
      await payload.update({ collection: 'media', id: victim.id, data: { state: 'processing' } })

      await seed(payload)

      const after = await payload.findByID({
        collection: 'media',
        id: victim.id,
        depth: 0,
        select: { state: true },
      })
      expect(after.state).toBe('ready')
    },
    SEED_TEST_TIMEOUT_MS,
  )
})
