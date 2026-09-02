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
 * Uses `getTestPayload()` (`./testPayload`), not `getPayload()` directly:
 * every integration test file connects to the isolated `diary_test`
 * database, never the developer's own dev database (Task 10/11 review round
 * 1, finding 2 - see that module's header). `beforeAll` seeds via
 * `../scripts/seed`'s `seed()` directly, rather than assuming a previous
 * test file already ran it - `seed()` is idempotent (its own header), so
 * calling it here is safe regardless of run order and does not depend on
 * `seed.integration.test.ts` having run first.
 *
 * Fixture journeys created directly by this file (the exclusion tests) use a
 * `test-` slug prefix, matching `collections.integration.test.ts`'s own
 * convention, so they cannot collide with the ten real seeded slugs, and are
 * deleted in `afterAll`/`afterEach`.
 *
 * Task 6 review, fix round 1 adds coverage for four findings: page-to-slot
 * matching by `kind`+`order` rather than free-text `title` (finding 1); a
 * missing `startsOn` degrading rather than throwing, with a structured log
 * line proving the degrade is visible (finding 2); four schema-defaulted
 * fields (`hiddenFromBookmarks`, `furniture.accent`, `journeyOrderMode`,
 * slot `focalX`/`focalY`) falling back correctly when explicitly `null`,
 * not just `undefined` (finding 3); and a draft journey's exclusion, which
 * was previously correct but unproven (finding 4).
 *
 * Task 11 (the About page, SCREENS.md §1.6) adds the `about` global's own
 * cases: its content carried through verbatim, its portrait resolved to a
 * derivative at the `hero` tier, its focal point taken from the MEDIA ITEM
 * (the one placement in the diary with no slot to override it), and every
 * field degrading rather than throwing when an editor clears it.
 */
import { coverCloths } from '@travel-diary/tokens/colour'
import sharp from 'sharp'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { getPayload } from './payload'
import { getTestPayload } from './testPayload'
import { readBookBundle } from './readBookBundle'
import { seed } from '../scripts/seed'
import { aboutGlobalSeed, bookGlobalSeed, journeySeeds } from '../scripts/seed-data'

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

  it('carries the book global’s cover and contents copy through, verbatim from the seed', async () => {
    const bundle = await readBookBundle()

    expect(bundle.chrome).toEqual({
      title: bookGlobalSeed.title,
      subtitle: bookGlobalSeed.subtitle,
      owner: bookGlobalSeed.owner,
      coverCloth: bookGlobalSeed.coverCloth,
      yearsShown: bookGlobalSeed.yearsShown,
      contentsNote: bookGlobalSeed.contentsNote,
      showDecorations: true,
    })
  })

  describe('degrades cleared book-global fields rather than failing the whole book', () => {
    // None of these fields is `required: true`, so an editor clearing one is
    // an ordinary state, not a corrupted row. Every field is cleared in one
    // case rather than one field per case: the behaviour under test is a
    // single mapping (`toBookChrome`), and five near-identical cases would
    // assert the same thing five times while each paying a global write.
    afterEach(async () => {
      await payload.updateGlobal({
        slug: 'book',
        data: {
          title: bookGlobalSeed.title,
          subtitle: bookGlobalSeed.subtitle,
          owner: bookGlobalSeed.owner,
          coverCloth: bookGlobalSeed.coverCloth,
          yearsShown: bookGlobalSeed.yearsShown,
          contentsNote: bookGlobalSeed.contentsNote,
          showDecorations: true,
        },
      })
    })

    it('empties every cleared text field, so a page omits the line rather than printing an empty label', async () => {
      await payload.updateGlobal({
        slug: 'book',
        data: { title: null, subtitle: null, owner: null, yearsShown: null, contentsNote: null },
      })

      const bundle = await readBookBundle()

      expect([
        bundle.chrome.title,
        bundle.chrome.subtitle,
        bundle.chrome.owner,
        bundle.chrome.yearsShown,
        bundle.chrome.contentsNote,
      ]).toEqual(['', '', '', '', ''])
    })

    it('falls back to the handoff’s default cloth, since an empty colour would paint no cloth at all', async () => {
      await payload.updateGlobal({ slug: 'book', data: { coverCloth: null } })

      const bundle = await readBookBundle()

      expect(bundle.chrome.coverCloth).toBe(coverCloths[0])
    })

    it('keeps decorations on when the flag is cleared, matching the schema default', async () => {
      await payload.updateGlobal({ slug: 'book', data: { showDecorations: null } })

      const bundle = await readBookBundle()

      expect(bundle.chrome.showDecorations).toBe(true)
    })

    it('turns decorations off when an editor actually unticks them', async () => {
      await payload.updateGlobal({ slug: 'book', data: { showDecorations: false } })

      const bundle = await readBookBundle()

      expect(bundle.chrome.showDecorations).toBe(false)
    })
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

  it('carries a journey’s Notes-page content through, verbatim from the seed', async () => {
    const bundle = await readBookBundle()
    const lisbonSeed = journeySeeds.find((journey) => journey.slug === 'lisbon')
    const lisbon = bundle.pages.find((page) => page.kind === 'notes' && page.slug === 'lisbon')

    // SCREENS.md §1.3's copy is final (CLAUDE.md §9, Pass 3): asserted
    // against the seed constant itself, so a paraphrase anywhere between
    // Payload and the page fails here rather than shipping.
    expect(lisbon).toMatchObject({
      weather: lisbonSeed?.weather,
      mood: lisbonSeed?.mood,
      weatherGlyph: lisbonSeed?.weatherGlyph,
      highlights: lisbonSeed?.highlights,
      note: lisbonSeed?.note,
      tally: lisbonSeed?.tally,
      signoff: lisbonSeed?.signoff,
      stampCountry: lisbonSeed?.stampCountry,
      stampValue: lisbonSeed?.stampValue,
    })
  })

  it('counts a journey’s gallery from its media rather than reading a stored total', async () => {
    const bundle = await readBookBundle()
    const lisbon = bundle.pages.find((page) => page.kind === 'notes' && page.slug === 'lisbon')
    const journeys = await payload.find({ collection: 'journeys', where: { slug: { equals: 'lisbon' } }, limit: 1 })
    const media = await payload.count({
      collection: 'media',
      where: { journey: { equals: journeys.docs[0]?.id } },
    })

    // CLAUDE.md §7: media counts are DERIVED. The seed gives every journey
    // nine stills and no clips, so the census must add up to the collection's
    // own count for that journey rather than to a number anybody stored.
    const gallery = lisbon?.kind === 'notes' ? lisbon.gallery : undefined
    expect(gallery).toBeDefined()
    expect((gallery?.photographs ?? 0) + (gallery?.clips ?? 0)).toBe(media.totalDocs)
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

    // One find for journeys, one for pages, one for the slots' media and one
    // for the gallery census - never one per journey or per page (CLAUDE.md §6).
    // The About page's portrait costs NO query of its own: its media id joins
    // the slot-media query's `where: { id: { in: [...] } }` batch.
    expect(findSpy.mock.calls.length).toBe(4)
    // Two findGlobals: `book` (the sort mode and the seven chrome fields come
    // out of the SAME read, never a second one) and `about`.
    expect(findGlobalSpy.mock.calls.length).toBe(2)

    findSpy.mockRestore()
    findGlobalSpy.mockRestore()
  })

  it('carries the about global’s content through, verbatim from the seed', async () => {
    const bundle = await readBookBundle()

    // SCREENS.md §1.6's copy is final (CLAUDE.md §9, Pass 3) - asserted
    // against the seed's own strings rather than retyped here, so a
    // paraphrase in either place fails.
    expect(bundle.about.paragraphs).toEqual(aboutGlobalSeed.paragraphs)
    expect(bundle.about.kit).toEqual(aboutGlobalSeed.kit)
    expect(bundle.about.replyTo).toBe(aboutGlobalSeed.replyTo)
  })

  it('resolves the about portrait to a derivative URL captioned by the global', async () => {
    const bundle = await readBookBundle()

    expect(bundle.about.portrait).toMatchObject({
      role: 'hero',
      caption: aboutGlobalSeed.portraitCaption,
    })
    // Never `media.url`, the original (CLAUDE.md §7, "Always a derivative
    // tier"): every derivative Payload writes carries its dimensions in the
    // filename, and an original does not.
    expect(bundle.about.portrait?.src).toMatch(/-\d+x\d+\.\w+$/)
  })

  it('takes the about portrait’s focal point from the media item, which is the only place it can live', async () => {
    // DATA_MODEL.md: "`media.focalPoint` is the default; the slot overrides
    // it." The `about` global holds a bare `upload` with no slot on it, so
    // the media item's own focal point IS the portrait's - and without this,
    // the admin's focal-point picker is decorative on this page.
    const bundle = await readBookBundle()

    expect(bundle.about.portrait).toMatchObject({
      focalX: aboutGlobalSeed.portraitFocal.x,
      focalY: aboutGlobalSeed.portraitFocal.y,
    })
  })

  describe('degrades cleared about-global fields rather than failing the whole book', () => {
    afterEach(async () => {
      const portrait = await payload.find({
        collection: 'media',
        depth: 0,
        limit: 1,
        where: { alt: { equals: 'PORTRAIT' } },
      })
      const portraitId = portrait.docs[0]?.id
      await payload.updateGlobal({
        slug: 'about',
        data: {
          portrait: portraitId ?? null,
          portraitCaption: aboutGlobalSeed.portraitCaption,
          paragraphs: aboutGlobalSeed.paragraphs.map((text) => ({ text })),
          kit: aboutGlobalSeed.kit.map((text) => ({ text })),
          replyTo: aboutGlobalSeed.replyTo,
        },
      })
    })

    it('empties every cleared field, so the page omits the block rather than printing an empty heading', async () => {
      await payload.updateGlobal({
        slug: 'about',
        // The two array fields are cleared to `[]` rather than to `null`:
        // Payload's own drizzle adapter throws on a null array here
        // ("Cannot use 'in' operator to search for '$push' in null"), and an
        // editor deleting every row in the admin leaves `[]` in any case.
        data: { portrait: null, portraitCaption: null, paragraphs: [], kit: [], replyTo: null },
      })

      const bundle = await readBookBundle()

      expect(bundle.about).toEqual({ portrait: undefined, paragraphs: [], kit: [], replyTo: '' })
    })

    it('drops a paragraph or kit line whose text an editor cleared, rather than printing a blank line', async () => {
      await payload.updateGlobal({
        slug: 'about',
        data: {
          paragraphs: [{ text: 'Kept.' }, { text: null }, { text: '' }],
          kit: [{ text: null }, { text: 'Kept too.' }, { text: '' }],
        },
      })

      const bundle = await readBookBundle()

      expect(bundle.about.paragraphs).toEqual(['Kept.'])
      expect(bundle.about.kit).toEqual(['Kept too.'])
    })
  })

  describe('excludes soft-deleted, archived and draft journeys from the book', () => {
    const FIXTURE_SLUGS = ['test-readbookbundle-deleted', 'test-readbookbundle-archived', 'test-readbookbundle-draft']

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

    it('omits a draft journey via an explicit _status filter (Task 6 review, finding 4)', async () => {
      // Finding 4 as originally raised assumed `find()` without `draft: true`
      // already excludes drafts, because a draft-only document's `journeys`
      // table row genuinely does not exist (only the versions table holds
      // it). Verified directly against Postgres that assumption is only half
      // right: Payload's Local API `find()` still surfaces a draft-only
      // document (with `_status: 'draft'` on the result) even without
      // `draft: true` - so an explicit `_status: 'published'` filter, not a
      // comment, is what actually keeps a draft journey out of the public book.
      const created = await payload.create({
        collection: 'journeys',
        data: {
          name: 'Draft Trip',
          place: 'Nowhere',
          slug: 'test-readbookbundle-draft',
          dates: '1 - 2 January 2025',
          startsOn: '2025-01-01T00:00:00.000Z',
        },
        draft: true,
      })
      expect(created._status).toBe('draft')
      // Confirms find() without draft:true would otherwise have surfaced it,
      // proving the explicit filter below is load-bearing, not decorative.
      const withoutStatusFilter = await payload.find({
        collection: 'journeys',
        where: { slug: { equals: 'test-readbookbundle-draft' } },
      })
      expect(withoutStatusFilter.docs[0]?._status).toBe('draft')

      const bundle = await readBookBundle()

      expect(bundle.contents.some((entry) => entry.slug === 'test-readbookbundle-draft')).toBe(false)
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

  describe('matches a page to its slot by kind and order, not by title (Task 6 review, finding 1)', () => {
    const FIXTURE_SLUGS = ['test-readbookbundle-kind-order']

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

    it('keeps a page\'s slots after its title is renamed to something matching none of Notes/Frames I/Frames II', async () => {
      const anyMedia = await payload.find({ collection: 'media', limit: 1, depth: 0 })
      const someMediaId = anyMedia.docs[0]?.id
      if (someMediaId === undefined) throw new Error('expected at least one seeded media item')

      const journey = await payload.create({
        collection: 'journeys',
        data: {
          name: 'Kind Order Trip',
          place: 'Nowhere',
          slug: 'test-readbookbundle-kind-order',
          dates: '1 - 2 January 2025',
          startsOn: '2025-01-01T00:00:00.000Z',
          _status: 'published',
        },
      })
      // Exactly the scenario finding 1 describes: an editor renamed the page,
      // so its `title` matches none of 'Notes'/'Frames I'/'Frames II'. `kind`
      // and `order` - not `title` - are what this module now matches on.
      await payload.create({
        collection: 'pages',
        data: {
          journey: journey.id,
          kind: 'notes',
          title: 'An editor renamed this page',
          order: 0,
          slots: [{ role: 'hero', media: someMediaId, caption: 'still here after the rename', focalX: 50, focalY: 50 }],
          _status: 'published',
        },
      })

      const bundle = await readBookBundle()
      const notes = bundle.pages.find((page) => page.kind === 'notes' && page.slug === 'test-readbookbundle-kind-order')

      expect(notes?.kind === 'notes' ? notes.slots?.[0]?.caption : undefined).toBe('still here after the rename')
    })

    it('assigns frames-i/frames-ii by ascending order, not by title text or creation order', async () => {
      const anyMedia = await payload.find({ collection: 'media', limit: 1, depth: 0 })
      const someMediaId = anyMedia.docs[0]?.id
      if (someMediaId === undefined) throw new Error('expected at least one seeded media item')

      const journey = await payload.create({
        collection: 'journeys',
        data: {
          name: 'Kind Order Trip',
          place: 'Nowhere',
          slug: 'test-readbookbundle-kind-order',
          dates: '1 - 2 January 2025',
          startsOn: '2025-01-01T00:00:00.000Z',
          _status: 'published',
        },
      })
      // Titles and creation order deliberately reversed from `order`, so a
      // title-based, alphabetical or insertion-order match would swap these.
      await payload.create({
        collection: 'pages',
        data: {
          journey: journey.id,
          kind: 'frames',
          title: 'Zzz Created First, Ordered Second',
          order: 5,
          slots: [{ role: 'frame', media: someMediaId, caption: 'second frames page', focalX: 50, focalY: 50 }],
          _status: 'published',
        },
      })
      await payload.create({
        collection: 'pages',
        data: {
          journey: journey.id,
          kind: 'frames',
          title: 'Aaa Created Second, Ordered First',
          order: 1,
          slots: [{ role: 'frame', media: someMediaId, caption: 'first frames page', focalX: 50, focalY: 50 }],
          _status: 'published',
        },
      })

      const bundle = await readBookBundle()
      const framesI = bundle.pages.find((page) => page.kind === 'frames-i' && page.slug === 'test-readbookbundle-kind-order')
      const framesII = bundle.pages.find((page) => page.kind === 'frames-ii' && page.slug === 'test-readbookbundle-kind-order')

      expect(framesI?.kind === 'frames-i' ? framesI.slots?.[0]?.caption : undefined).toBe('first frames page')
      expect(framesII?.kind === 'frames-ii' ? framesII.slots?.[0]?.caption : undefined).toBe('second frames page')
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
          name: 'Kind Order Trip',
          place: 'Nowhere',
          slug: 'test-readbookbundle-kind-order',
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
          name: 'Kind Order Trip',
          place: 'Nowhere',
          slug: 'test-readbookbundle-kind-order',
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
      const notes = bundle.pages.find((page) => page.kind === 'notes' && page.slug === 'test-readbookbundle-kind-order')

      expect(notes?.kind === 'notes' ? notes.slots?.[0]?.role : undefined).toBe('frame')
    })
  })

  describe('a missing startsOn degrades rather than throws (Task 6 review, finding 2)', () => {
    const JOURNEY_SLUG = 'test-readbookbundle-no-startson'

    afterEach(async () => {
      const found = await payload.find({ collection: 'journeys', where: { slug: { equals: JOURNEY_SLUG } } })
      for (const doc of found.docs) await payload.delete({ collection: 'journeys', id: doc.id })
    })

    it('renders a journey missing startsOn instead of excluding it or failing the whole book', async () => {
      // CLAUDE.md §7: a free-text `dates` must always travel with a sortable
      // `startsOn`. `journeys.startsOn` is not `required: true` in the schema
      // (apps/web/collections/journeys.ts) precisely because an editor may
      // not have filled it in yet - an ordinary editorial state, not a
      // corrupted row, on a statically-rendered public page. Excluding the
      // journey would reintroduce finding 1's silent-vanishing problem in a
      // different place, and throwing would turn one blank field into an
      // outage of the other nine journeys - so this asserts neither happens.
      await payload.create({
        collection: 'journeys',
        data: {
          name: 'No Start Date',
          place: 'Nowhere',
          slug: JOURNEY_SLUG,
          dates: 'sometime in spring',
          _status: 'published',
        },
      })

      const bundle = await readBookBundle()

      expect(bundle.contents.map((entry) => entry.slug)).toContain(JOURNEY_SLUG)
      expect(bundle.contents).toHaveLength(11)
    })

    it('logs a single structured warning naming the journey slug, never the document, when startsOn is missing', async () => {
      const distinctivePlace = 'a place that must never appear in the log line'
      await payload.create({
        collection: 'journeys',
        data: {
          name: 'No Start Date',
          place: distinctivePlace,
          slug: JOURNEY_SLUG,
          dates: 'sometime in spring',
          _status: 'published',
        },
      })
      const warnSpy = vi.spyOn(payload.logger, 'warn')

      await readBookBundle()

      // Cast away Pino's overloaded `warn` signature rather than `any`
      // (CLAUDE.md §3.1): every real call here passes a merging object first.
      const calls = warnSpy.mock.calls as unknown as [Record<string, unknown>, string][]
      const call = calls.find(([mergingObject]) => mergingObject.journeySlug === JOURNEY_SLUG)
      expect(call).toBeDefined()

      const [mergingObject, message] = call ?? [{}, '']
      // Structured and narrow: only the slug, nothing else - never the
      // journey document itself (CLAUDE.md §7: never log the whole document).
      expect(mergingObject).toEqual({ journeySlug: JOURNEY_SLUG })
      expect(message).toMatch(/startsOn/)
      expect(JSON.stringify([mergingObject, message])).not.toContain(distinctivePlace)

      warnSpy.mockRestore()
    })
  })

  describe('fields with a schema default fall back correctly when explicitly null, not just undefined (Task 6 review, finding 3)', () => {
    const JOURNEY_SLUG = 'test-readbookbundle-explicit-null'

    afterEach(async () => {
      const found = await payload.find({ collection: 'journeys', where: { slug: { equals: JOURNEY_SLUG } } })
      for (const doc of found.docs) {
        const pages = await payload.find({ collection: 'pages', where: { journey: { equals: doc.id } } })
        for (const page of pages.docs) await payload.delete({ collection: 'pages', id: page.id })
        // The census fixtures below attach media to this journey; they are
        // removed with it, or `seed.integration.test.ts`'s own row counts
        // would inherit them.
        const media = await payload.find({ collection: 'media', where: { journey: { equals: doc.id } } })
        for (const item of media.docs) await payload.delete({ collection: 'media', id: item.id })
        await payload.delete({ collection: 'journeys', id: doc.id })
      }
      await payload.updateGlobal({ slug: 'book', data: { journeyOrderMode: 'manual' } })
    })

    it('falls back to false when hiddenFromBookmarks is explicitly null, not just undefined', async () => {
      // Payload's `defaultValue` fills a field only when it is `undefined` at
      // write time; an explicit `null` - an ordinary PATCH from a script or a
      // future admin control - bypasses it entirely (Task 6 review, finding 3).
      const created = await payload.create({
        collection: 'journeys',
        data: {
          name: 'Explicit Null Trip',
          place: 'Nowhere',
          slug: JOURNEY_SLUG,
          dates: '1 - 2 January 2025',
          startsOn: '2025-01-01T00:00:00.000Z',
          _status: 'published',
        },
      })
      await payload.update({ collection: 'journeys', id: created.id, data: { hiddenFromBookmarks: null } })
      // Verifies the premise rather than assuming it: the stored value really
      // is `null`, not silently coerced back to the schema default.
      const stored = await payload.findByID({ collection: 'journeys', id: created.id, depth: 0 })
      expect(stored.hiddenFromBookmarks).toBeNull()

      const bundle = await readBookBundle()

      expect(bundle.bookmarks.some((tab) => tab.slug === JOURNEY_SLUG)).toBe(true)
    })

    it('falls back to the schema default accent when furniture.accent is explicitly null', async () => {
      const created = await payload.create({
        collection: 'journeys',
        data: {
          name: 'Explicit Null Trip',
          place: 'Nowhere',
          slug: JOURNEY_SLUG,
          dates: '1 - 2 January 2025',
          startsOn: '2025-01-01T00:00:00.000Z',
          _status: 'published',
        },
      })
      await payload.update({ collection: 'journeys', id: created.id, data: { furniture: { accent: null } } })
      const stored = await payload.findByID({ collection: 'journeys', id: created.id, depth: 0 })
      expect(stored.furniture?.accent).toBeNull()

      const bundle = await readBookBundle()
      const bookmarkTab = bundle.bookmarks.find((tab) => tab.slug === JOURNEY_SLUG)

      expect(bookmarkTab?.accent).toBe('#3d817e')
    })

    it('degrades every unfilled Notes-page field rather than failing the whole book', async () => {
      // A journey an editor has created but not yet written up: no weather,
      // no mood, no glyph, no highlights, no note, no tally, no furniture.
      // The page must still render, so each field narrows to an empty value
      // and `Notes.tsx` omits the element (see `toDomainJourney`).
      const created = await payload.create({
        collection: 'journeys',
        data: {
          name: 'Explicit Null Trip',
          place: 'Nowhere',
          slug: JOURNEY_SLUG,
          dates: '1 - 2 January 2025',
          startsOn: '2025-01-01T00:00:00.000Z',
          _status: 'published',
        },
      })
      await payload.update({
        collection: 'journeys',
        id: created.id,
        // `highlights` and `tally` are left alone rather than set to `null`:
        // Payload's Drizzle adapter cannot write `null` to an array field
        // ("Cannot use 'in' operator to search for '$push' in null"), and an
        // array an editor has never filled in comes back as `[]` from
        // `find()` anyway, which is the state this case is about.
        data: {
          weather: null,
          mood: null,
          weatherGlyph: null,
          note: null,
          furniture: { signoff: null, stampCountry: null, stampValue: null },
        },
      })

      const bundle = await readBookBundle()
      const notes = bundle.pages.find((page) => page.kind === 'notes' && page.slug === JOURNEY_SLUG)

      expect(notes).toMatchObject({
        weather: '',
        mood: '',
        // The schema's own default, not an empty string: the glyph is drawn
        // in CSS from a fixed set of three, so there is no "no glyph" state.
        weatherGlyph: 'sun',
        highlights: [],
        note: '',
        tally: [],
        signoff: '',
        stampCountry: '',
        stampValue: '',
        // A journey with no media of its own still counts, at zero.
        gallery: { photographs: 0, clips: 0 },
      })
    })

    it('empties a half-filled tally cell rather than printing "undefined" on the ticket', async () => {
      // Both halves of a tally row are optional in the schema, so an editor
      // who adds a row and fills only one side is an ordinary state. All four
      // rows are supplied because the array itself is `minRows: 4, maxRows: 4`.
      const created = await payload.create({
        collection: 'journeys',
        data: {
          name: 'Explicit Null Trip',
          place: 'Nowhere',
          slug: JOURNEY_SLUG,
          dates: '1 - 2 January 2025',
          startsOn: '2025-01-01T00:00:00.000Z',
          tally: [{ key: 'Days' }, { value: '12' }, { key: 'Rolls shot', value: '9' }, { key: 'Bowls', value: '11' }],
          _status: 'published',
        },
      })
      expect(created.tally?.[0]?.value).toBeFalsy()

      const bundle = await readBookBundle()
      const notes = bundle.pages.find((page) => page.kind === 'notes' && page.slug === JOURNEY_SLUG)

      expect(notes).toMatchObject({
        tally: [
          { key: 'Days', value: '' },
          { key: '', value: '12' },
          { key: 'Rolls shot', value: '9' },
          { key: 'Bowls', value: '11' },
        ],
      })
    })

    it('counts a clip as a clip and everything else as a photograph in the gallery census', async () => {
      const created = await payload.create({
        collection: 'journeys',
        data: {
          name: 'Explicit Null Trip',
          place: 'Nowhere',
          slug: JOURNEY_SLUG,
          dates: '1 - 2 January 2025',
          startsOn: '2025-01-01T00:00:00.000Z',
          _status: 'published',
        },
      })
      // Built with the same `sharp` the media pipeline uses, not a contrived
      // mock. `kind` is what the census reads; the file itself is a still in
      // both cases because this suite has no transcode pipeline to produce a
      // real clip, and the census never opens the file.
      const png = await sharp({
        create: { width: 100, height: 100, channels: 3, background: { r: 180, g: 180, b: 180 } },
      })
        .png()
        .toBuffer()
      for (const [kind, name] of [
        ['still', 'census-still.png'],
        ['clip', 'census-clip.png'],
      ] as const) {
        await payload.create({
          collection: 'media',
          data: { journey: created.id, kind, alt: `census ${kind}`, order: 0 },
          file: { data: png, mimetype: 'image/png', name, size: png.length },
        })
      }

      const bundle = await readBookBundle()
      const notes = bundle.pages.find((page) => page.kind === 'notes' && page.slug === JOURNEY_SLUG)

      expect(notes).toMatchObject({ gallery: { photographs: 1, clips: 1 } })
    })

    it('falls back to "manual" ordering when the book global\'s journeyOrderMode is explicitly null', async () => {
      await payload.updateGlobal({ slug: 'book', data: { journeyOrderMode: null } })
      const storedBook = await payload.findGlobal({ slug: 'book', depth: 0 })
      expect(storedBook.journeyOrderMode).toBeNull()

      // Must not throw, and must still produce a complete book.
      const bundle = await readBookBundle()

      expect(bundle.contents).toHaveLength(10)
    })

    it('falls back to 50 when a slot\'s focalX/focalY are explicitly null', async () => {
      const anyMedia = await payload.find({ collection: 'media', limit: 1, depth: 0 })
      const someMediaId = anyMedia.docs[0]?.id
      if (someMediaId === undefined) throw new Error('expected at least one seeded media item')

      const journey = await payload.create({
        collection: 'journeys',
        data: {
          name: 'Explicit Null Trip',
          place: 'Nowhere',
          slug: JOURNEY_SLUG,
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
          slots: [{ role: 'hero', media: someMediaId, caption: '', focalX: null, focalY: null }],
          _status: 'published',
        },
      })

      const bundle = await readBookBundle()
      const notes = bundle.pages.find((page) => page.kind === 'notes' && page.slug === JOURNEY_SLUG)
      const slot = notes?.kind === 'notes' ? notes.slots?.[0] : undefined

      expect(slot).toMatchObject({ focalX: 50, focalY: 50 })
    })
  })
})
