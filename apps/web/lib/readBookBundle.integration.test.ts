/**
 * readBookBundle.integration.test.ts — behaviour spec for the serialization boundary.
 *
 * Integration test (CLAUDE.md §2): exercises `readBookBundle` against a real
 * Payload instance and a real Docker Postgres, not a mock - it is the one
 * function this repository trusts to turn Payload rows into a `BookBundle`,
 * so its test must prove that boundary against the real thing. Named
 * `*.integration.test.ts` so it runs only under the `integration` Vitest
 * project (see ../../../vitest.config.ts), never in `npm run verify`
 * (pre-commit).
 *
 * Uses `getTestPayload()` (`./testPayload.js`), not `getPayload()` directly:
 * every integration test file connects to the isolated `diary_test`
 * database, never the developer's own dev database (Task 10/11 review round
 * 1, finding 2 - see that module's header). `beforeAll` seeds via
 * `../scripts/seed.js`'s `seed()` directly, rather than assuming a previous
 * test file already ran it - `seed()` is idempotent (its own header), so
 * calling it here is safe regardless of run order and does not depend on
 * `seed.integration.test.ts` having run first.
 *
 * Fixture journeys created directly by this file (the exclusion tests) use a
 * `test-` slug prefix, matching `collections.integration.test.ts`'s own
 * convention, so they cannot collide with the ten real seeded slugs, and are
 * deleted in `afterAll`.
 */
import sharp from 'sharp'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { getPayload } from './payload.js'
import { getTestPayload } from './testPayload.js'
import { readBookBundle } from './readBookBundle.js'
import { seed } from '../scripts/seed.js'

const SETUP_TIMEOUT_MS = 60_000

describe('readBookBundle', () => {
  let payload: Awaited<ReturnType<typeof getTestPayload>>

  beforeAll(async () => {
    payload = await getTestPayload()
    await seed(payload)
  }, SETUP_TIMEOUT_MS)

  it('returns the seeded ten journeys as thirty-three reading-sequence pages', async () => {
    const bundle = await readBookBundle()

    expect(bundle.pages).toHaveLength(33)
    // BookBundle carries no `journeys` field of its own (packages/domain/src/bookBundle.ts) -
    // `contents` has exactly one entry per journey (deriveContents), so its length is the
    // same fact the handoff's own wording ("ten journeys") is checking.
    expect(bundle.contents).toHaveLength(10)
  })

  it('resolves each slot to a derivative URL, never an original', async () => {
    // Payload's own URL convention for this app is `/api/media/file/<name>.<ext>`
    // for the ORIGINAL and `/api/media/file/<name>-<width>x<height>.<ext>` for
    // every named derivative tier (thumb/tile/frame/hero/hero2x) - verified
    // directly against a seeded media doc's `sizes` map. The tier's own NAME
    // never appears in the URL, only its configured width/height, so the
    // faithful version of "matches one of the five tiers" is comparing each
    // slot's `src` against the actual populated `sizes.<tier>.url` values for
    // its own media item, not pattern-matching a tier name that is not there.
    const media = await payload.find({ collection: 'media', pagination: false, limit: 5000, depth: 0 })
    const derivativeUrlsById = new Map(
      media.docs.map((doc) => [
        doc.id,
        { original: doc.url, derivatives: Object.values(doc.sizes ?? {}).map((size) => size.url) },
      ]),
    )

    const bundle = await readBookBundle()
    const slots = bundle.pages.flatMap((page) =>
      page.kind === 'notes' || page.kind === 'frames-i' || page.kind === 'frames-ii' ? (page.slots ?? []) : [],
    )

    expect(slots.length).toBeGreaterThan(0)
    const knownDerivativeUrls = new Set(
      [...derivativeUrlsById.values()].flatMap((entry) => entry.derivatives).filter((url) => url !== null),
    )
    const knownOriginalUrls = new Set([...derivativeUrlsById.values()].map((entry) => entry.original))

    for (const slot of slots) {
      expect(knownOriginalUrls.has(slot.src)).toBe(false)
      expect(knownDerivativeUrls.has(slot.src)).toBe(true)
    }
  })

  it('carries the focal point of each slot through, so a portrait is not cropped through the head', async () => {
    const bundle = await readBookBundle()
    const notes = bundle.pages.find((page) => page.kind === 'notes')
    const slot = notes?.kind === 'notes' ? notes.slots?.[0] : undefined

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- vitest types `expect.any` as `any`; `toMatchObject` still type-checks the surrounding assertion.
    expect(slot).toMatchObject({ focalX: expect.any(Number), focalY: expect.any(Number) })
  })

  it('sets depth explicitly rather than letting Payload walk the graph', async () => {
    // CLAUDE.md §7: select only the fields needed, set depth explicitly. A
    // default depth here pulls every relationship on every page load.
    const spy = vi.spyOn(await getPayload(), 'find')

    await readBookBundle()

    expect(spy.mock.calls.length).toBeGreaterThan(0)
    for (const call of spy.mock.calls) {
      expect(call[0]).toHaveProperty('depth')
    }

    spy.mockRestore()
  })

  it('issues a fixed, small number of Payload queries regardless of journey/page count (no N+1)', async () => {
    const findSpy = vi.spyOn(await getPayload(), 'find')
    const findGlobalSpy = vi.spyOn(await getPayload(), 'findGlobal')

    await readBookBundle()

    // One find for journeys, one for pages, one for media - never one per
    // journey or per page (CLAUDE.md §6).
    expect(findSpy.mock.calls.length).toBe(3)
    // One findGlobal for `book` (journeyOrderMode).
    expect(findGlobalSpy.mock.calls.length).toBe(1)

    findSpy.mockRestore()
    findGlobalSpy.mockRestore()
  })

  describe('excludes soft-deleted and archived journeys from the book', () => {
    const FIXTURE_SLUGS = ['test-readbookbundle-deleted', 'test-readbookbundle-archived']

    afterAll(async () => {
      for (const slug of FIXTURE_SLUGS) {
        const found = await payload.find({ collection: 'journeys', where: { slug: { equals: slug } } })
        for (const doc of found.docs) {
          await payload.delete({ collection: 'journeys', id: doc.id })
        }
      }
    })

    it('omits a soft-deleted journey', async () => {
      await payload.create({
        collection: 'journeys',
        data: {
          name: 'Deleted Trip',
          place: 'Nowhere',
          slug: 'test-readbookbundle-deleted',
          dates: '1 - 2 January 2025',
          startsOn: '2025-01-01T00:00:00.000Z',
          deletedAt: new Date().toISOString(),
          _status: 'published',
        },
      })

      const bundle = await readBookBundle()

      expect(bundle.pages.some((page) => 'slug' in page && page.slug === 'test-readbookbundle-deleted')).toBe(false)
      expect(bundle.contents).toHaveLength(10)
    })

    it('omits an archived journey', async () => {
      await payload.create({
        collection: 'journeys',
        data: {
          name: 'Archived Trip',
          place: 'Nowhere',
          slug: 'test-readbookbundle-archived',
          dates: '1 - 2 January 2025',
          startsOn: '2025-01-01T00:00:00.000Z',
          archived: true,
          _status: 'published',
        },
      })

      const bundle = await readBookBundle()

      expect(bundle.pages.some((page) => 'slug' in page && page.slug === 'test-readbookbundle-archived')).toBe(false)
      expect(bundle.contents).toHaveLength(10)
    })
  })

  describe('journey order follows the book global\'s journeyOrderMode', () => {
    afterEach(async () => {
      // Restore the default so later tests (and other files sharing this
      // database) see the same order they would against a freshly seeded book.
      await payload.updateGlobal({ slug: 'book', data: { journeyOrderMode: 'manual' } })
    })

    it('sorts oldest-first when journeyOrderMode is "oldest"', async () => {
      await payload.updateGlobal({ slug: 'book', data: { journeyOrderMode: 'oldest' } })
      const journeys = await payload.find({
        collection: 'journeys',
        pagination: false,
        limit: 1000,
        sort: 'startsOn',
        where: { and: [{ deletedAt: { equals: null } }, { archived: { not_equals: true } }] },
      })
      const expectedSlugOrder = journeys.docs.map((doc) => doc.slug)

      const bundle = await readBookBundle()

      expect(bundle.contents.map((entry) => entry.slug)).toEqual(expectedSlugOrder)
    })

    it('sorts newest-first when journeyOrderMode is "newest", the reverse of "oldest"', async () => {
      await payload.updateGlobal({ slug: 'book', data: { journeyOrderMode: 'newest' } })
      const journeys = await payload.find({
        collection: 'journeys',
        pagination: false,
        limit: 1000,
        sort: '-startsOn',
        where: { and: [{ deletedAt: { equals: null } }, { archived: { not_equals: true } }] },
      })
      const expectedSlugOrder = journeys.docs.map((doc) => doc.slug)

      const bundle = await readBookBundle()

      expect(bundle.contents.map((entry) => entry.slug)).toEqual(expectedSlugOrder)
    })
  })

  describe('boundary validation', () => {
    const FIXTURE_SLUGS = ['test-readbookbundle-no-startson', 'test-readbookbundle-mismatched-title']

    afterEach(async () => {
      for (const slug of FIXTURE_SLUGS) {
        const found = await payload.find({ collection: 'journeys', where: { slug: { equals: slug } } })
        for (const doc of found.docs) {
          const pages = await payload.find({ collection: 'pages', where: { journey: { equals: doc.id } } })
          for (const page of pages.docs) await payload.delete({ collection: 'pages', id: page.id })
          await payload.delete({ collection: 'journeys', id: doc.id })
        }
      }
    })

    it('throws when a published, non-deleted journey is missing startsOn', async () => {
      // CLAUDE.md §7: a free-text `dates` must always travel with a sortable
      // `startsOn`. `journeys.startsOn` is not `required: true` in the schema
      // (apps/web/collections/journeys.ts) precisely because an editor may
      // not have filled it in yet - but the boundary this function guards
      // must not silently sort such a journey wrong, so it fails loudly instead.
      await payload.create({
        collection: 'journeys',
        data: {
          name: 'No Start Date',
          place: 'Nowhere',
          slug: 'test-readbookbundle-no-startson',
          dates: 'sometime in spring',
          _status: 'published',
        },
      })

      await expect(readBookBundle()).rejects.toThrow(/startsOn/)
    })

    it('skips a page whose title does not match Notes/Frames I/Frames II, rather than merging it wrongly', async () => {
      const journey = await payload.create({
        collection: 'journeys',
        data: {
          name: 'Mismatched Title Trip',
          place: 'Nowhere',
          slug: 'test-readbookbundle-mismatched-title',
          dates: '1 - 2 January 2025',
          startsOn: '2025-01-01T00:00:00.000Z',
          _status: 'published',
        },
      })
      await payload.create({
        collection: 'pages',
        data: { journey: journey.id, kind: 'notes', title: 'Extra', order: 0, _status: 'published' },
      })

      const bundle = await readBookBundle()
      const notes = bundle.pages.find(
        (page) => page.kind === 'notes' && page.slug === 'test-readbookbundle-mismatched-title',
      )

      expect(notes?.kind === 'notes' ? notes.slots : undefined).toBeUndefined()
    })

    it('throws when a slot resolves to media with no derivative of any tier, rather than falling back to the original', async () => {
      // Every one of Payload's five image sizes needs a source at least as
      // large as its own target dimensions (thumb's 400x400 is the smallest);
      // a 100x100 upload is genuinely too small to generate ANY of them - not
      // a contrived mock, the same `sharp`-backed pipeline the seed itself uses.
      const tinyPng = await sharp({
        create: { width: 100, height: 100, channels: 3, background: { r: 200, g: 200, b: 200 } },
      })
        .png()
        .toBuffer()
      const media = await payload.create({
        collection: 'media',
        data: { kind: 'still', alt: 'too small for any derivative', order: 0 },
        file: { data: tinyPng, mimetype: 'image/png', name: 'too-small.png', size: tinyPng.length },
      })
      const journey = await payload.create({
        collection: 'journeys',
        data: {
          name: 'Mismatched Title Trip',
          place: 'Nowhere',
          slug: 'test-readbookbundle-mismatched-title',
          dates: '1 - 2 January 2025',
          startsOn: '2025-01-01T00:00:00.000Z',
          _status: 'published',
        },
      })
      await payload.create({
        collection: 'pages',
        data: {
          journey: journey.id,
          kind: 'notes',
          title: 'Notes',
          order: 0,
          slots: [{ role: 'hero', media: media.id, caption: '', focalX: 50, focalY: 50 }],
          _status: 'published',
        },
      })

      await expect(readBookBundle()).rejects.toThrow(/no derivative of any tier/)

      await payload.delete({ collection: 'media', id: media.id })
    })

    it('defaults a slot with no role to "frame", since pages.slots.role carries no schema default', async () => {
      const anyMedia = await payload.find({ collection: 'media', limit: 1, depth: 0 })
      const someMediaId = anyMedia.docs[0]?.id
      if (someMediaId === undefined) throw new Error('expected at least one seeded media item')

      const journey = await payload.create({
        collection: 'journeys',
        data: {
          name: 'Mismatched Title Trip',
          place: 'Nowhere',
          slug: 'test-readbookbundle-mismatched-title',
          dates: '1 - 2 January 2025',
          startsOn: '2025-01-01T00:00:00.000Z',
          _status: 'published',
        },
      })
      await payload.create({
        collection: 'pages',
        data: {
          journey: journey.id,
          kind: 'notes',
          title: 'Notes',
          order: 0,
          // No `role` - apps/web/collections/pages.ts's `slots.role` field
          // carries no `defaultValue`, unlike `focalX`/`focalY`, so this is a
          // genuinely reachable null, not one Payload's own schema forecloses.
          slots: [{ media: someMediaId, caption: '', focalX: 50, focalY: 50 }],
          _status: 'published',
        },
      })

      const bundle = await readBookBundle()
      const notes = bundle.pages.find(
        (page) => page.kind === 'notes' && page.slug === 'test-readbookbundle-mismatched-title',
      )

      expect(notes?.kind === 'notes' ? notes.slots?.[0]?.role : undefined).toBe('frame')
    })
  })
})
