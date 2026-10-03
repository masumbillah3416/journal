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
 * database, never the developer's own dev database (see that module's
 * header). `beforeAll` seeds via
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
 * Four behaviours here are easy to lose and each has its own block:
 * page-to-slot matching by `kind`+`order` rather than free-text `title`; a
 * missing `startsOn` degrading rather than throwing, with a structured log
 * line proving the degrade is visible; four schema-defaulted fields
 * (`hiddenFromBookmarks`, `furniture.accent`, `journeyOrderMode`, slot
 * `focalX`/`focalY`) falling back correctly when explicitly `null`, not just
 * `undefined`; and a draft journey's exclusion.
 *
 * Task 11 (the About page, SCREENS.md §1.6) adds the `about` global's own
 * cases: its content carried through verbatim, its portrait resolved to a
 * derivative at the `hero` tier, its focal point taken from the MEDIA ITEM
 * (the one placement in the diary with no slot to override it), and every
 * field degrading rather than throwing when an editor clears it.
 */
import type { Slot } from '@travel-diary/domain/bookBundle'
import { coverCloths } from '@travel-diary/tokens/colour'
import sharp from 'sharp'
import { aClip } from './adapters/contract/media-fixtures'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { getPayload } from './payload'
import { getTestPayload } from './testPayload'
import { ephemeraMediaIds, galleryFrameWhere } from './galleryFrames'
import { readBookBundle } from './readBookBundle'
import { readGalleryBundle } from './readGalleryBundle'
import { Media } from '../collections/media'
import type { Media as MediaDoc } from '../payload-types'
import { seed } from '../scripts/seed'
import { aboutGlobalSeed, bookGlobalSeed, journeySeeds } from '../scripts/seed-data'

/**
 * What a `beforeAll` that calls `seed()` is given.
 *
 * 180,000ms, the number `readGalleryBundle.integration.test.ts` and
 * `readGalleryDownload.integration.test.ts` already use for the same call. This
 * file had 60,000, and 60,000 is not enough: the first `seed()` of a run
 * rasterises ninety-plus placeholder PNGs and was **measured at 56,393ms on an
 * idle authoring host** — 6% of margin — so it holds when this file is run
 * alone and fails when it is run as part of `npm run verify:full`, which is
 * exactly what happened. A budget that only holds in isolation is a one-sided
 * one; see `apps/web/scripts/seed.integration.test.ts`'s header for both
 * numbers. Only ONE file in a run pays this: `seed()` is idempotent, so every
 * caller after the first finds the rows already there.
 */
const SETUP_TIMEOUT_MS = 180_000

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
    // every named derivative tier - verified directly against a seeded media
    // doc's `sizes` map. The tier's own NAME never appears in the URL, only its
    // configured width/height, so the faithful version of "matches one of the
    // configured tiers" is comparing each
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
      // A CELL WITH NOTHING IN IT IS NOT A LADDER'S ANSWER. `Slot.src` is
      // `null` for an empty cell, a media row the pipeline has not finished
      // and a hidden one (Phase 4 Task 7), and none of those is the question
      // this case asks — which is whether a RESOLVED slot ever names an
      // original. The seeded book has no such cell, which the count below
      // keeps honest.
      if (slot.src === null) continue
      expect(knownOriginalUrls.has(slot.src)).toBe(false)
      expect(knownDerivativeUrls.has(slot.src)).toBe(true)
    }
    expect(slots.filter((slot) => slot.src !== null).length, 'every seeded slot resolved to nothing').toBeGreaterThan(0)
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
    const journeyNumericId = journeys.docs[0]?.id
    const pages = await payload.find({
      collection: 'pages',
      depth: 0,
      pagination: false,
      limit: 5000,
      where: { journey: { equals: journeyNumericId } },
      select: { slots: true },
    })
    const media = await payload.count({
      collection: 'media',
      where: galleryFrameWhere([Number(journeyNumericId)], ephemeraMediaIds(pages.docs)),
    })

    // CLAUDE.md §7: media counts are DERIVED. So the census must add up to the
    // collection's own live count of that journey's GALLERY FRAMES rather than
    // to a number anybody stored - and "gallery frame" is one rule, held in
    // `lib/galleryFrames.ts`, not a filter each reader restates.
    const gallery = lisbon?.kind === 'notes' ? lisbon.gallery : undefined
    expect(gallery).toBeDefined()
    expect((gallery?.photographs ?? 0) + (gallery?.clips ?? 0)).toBe(media.totalDocs)
  })

  it('counts exactly the frames the gallery grid shows, so a page footer cannot contradict it', async () => {
    // PH1-002's third face. The footer's census and the grid were two separate
    // derivations of "this journey's photographs", and the census was the one
    // that counted the Notes page's decorative ephemera scrap - so the page
    // said "9 photographs ... in the gallery" over a grid of eight. This is the
    // cross-module invariant that keeps the two honest; it is asserted against
    // the real reader rather than against a number, so neither can drift alone.
    const bundle = await readBookBundle()
    const grid = await readGalleryBundle('lisbon')
    const notes = bundle.pages.find((page) => page.kind === 'notes' && page.slug === 'lisbon')
    const census = notes?.kind === 'notes' ? notes.gallery : undefined

    expect(grid?.frames.length).toBeGreaterThan(0)
    expect((census?.photographs ?? 0) + (census?.clips ?? 0)).toBe(grid?.frames.length)
  })

  it('leaves a hidden photograph out of the census, as every other reader of the gallery does', async () => {
    // The census was the one caller that never applied the `hidden` filter.
    // Nothing in the seed is hidden, so no fixture could have shown it: this
    // hides a real row, reads the census, and puts it back.
    const journeys = await payload.find({ collection: 'journeys', where: { slug: { equals: 'lisbon' } }, limit: 1 })
    const journeyNumericId = journeys.docs[0]?.id
    const before = await readBookBundle()
    const censusOf = (source: Awaited<ReturnType<typeof readBookBundle>>): number => {
      const notes = source.pages.find((page) => page.kind === 'notes' && page.slug === 'lisbon')
      const gallery = notes?.kind === 'notes' ? notes.gallery : undefined
      return (gallery?.photographs ?? 0) + (gallery?.clips ?? 0)
    }
    const frames = await payload.find({
      collection: 'media',
      depth: 0,
      limit: 1,
      sort: ['-order'],
      where: { and: [{ journey: { equals: journeyNumericId } }, { hidden: { not_equals: true } }] },
      select: { order: true },
    })
    const victim = frames.docs[0]?.id
    expect(victim).toBeDefined()

    try {
      await payload.update({ collection: 'media', id: Number(victim), data: { hidden: true } })
      // `readBookBundle` and `readGalleryBundle` are both wrapped in React's
      // `cache`, which dedupes within a request - so this reads them through a
      // fresh call rather than trusting the memoized one.
      const after = await readBookBundle()
      expect(censusOf(after)).toBe(censusOf(before) - 1)
    } finally {
      await payload.update({ collection: 'media', id: Number(victim), data: { hidden: false } })
    }
  })

  it('leaves a photograph the pipeline has not finished out of the census, as the grid and the handler do', async () => {
    // THE CENSUS IS THE THIRD DOOR `galleryFrameWhere` CLOSES, and it was the
    // one `ee6bd3f` left without a behavioural case: the grid and the download
    // handler each got one, and this got the shared call and a unit case on the
    // filter's shape. `hidden` has its twin directly above, written for exactly
    // the same reason - the census was the one caller that had never applied
    // it. A row that is not `ready` may be holding bytes nothing has stripped,
    // so the number printed on the Notes page must not count it.
    //
    // Deliberately a copy of the `hidden` case with the field changed, so what
    // it proves is comparable to what that one proves (Task 8 final review, N6).
    const journeys = await payload.find({ collection: 'journeys', where: { slug: { equals: 'lisbon' } }, limit: 1 })
    const journeyNumericId = journeys.docs[0]?.id
    const before = await readBookBundle()
    const censusOf = (source: Awaited<ReturnType<typeof readBookBundle>>): number => {
      const notes = source.pages.find((page) => page.kind === 'notes' && page.slug === 'lisbon')
      const gallery = notes?.kind === 'notes' ? notes.gallery : undefined
      return (gallery?.photographs ?? 0) + (gallery?.clips ?? 0)
    }
    const frames = await payload.find({
      collection: 'media',
      depth: 0,
      limit: 1,
      sort: ['-order'],
      where: { and: [{ journey: { equals: journeyNumericId } }, { hidden: { not_equals: true } }] },
      select: { order: true },
    })
    const victim = frames.docs[0]?.id
    expect(victim).toBeDefined()

    try {
      await payload.update({ collection: 'media', id: Number(victim), data: { state: 'processing' } })
      const after = await readBookBundle()
      expect(censusOf(after)).toBe(censusOf(before) - 1)
    } finally {
      await payload.update({ collection: 'media', id: Number(victim), data: { state: 'ready' } })
    }
  })

  it('gives a drafted page no place in the book, so an unpublished page cannot take a published one’s', async () => {
    // ═══ WHAT THIS IS ACTUALLY ABOUT, WHICH IS NOT "A BLANK PAGE APPEARS" ═══
    //
    // The reading sequence is derived from JOURNEYS, so a fourth page row adds
    // no face. What a fourth row CAN do is take a face away from the row that
    // had it: `groupPagesByJourneyAndKind` gives `frames-i` and `frames-ii` to
    // the first two `kind: 'frames'` rows BY `order`. So a drafted frames page
    // ordered between the two published ones becomes `frames-ii`, and the
    // published Frames II stops being drawn at all.
    //
    // Reachable in one click from the journey editor (Phase 4 Task 5): Copy on
    // Frames I lands its duplicate at Frames II's place, as a draft.
    // `docs/deviations.md` §56 described the consequence as a blank page being
    // added; this is the measurement that says what it really is.
    const journeys = await payload.find({ collection: 'journeys', where: { slug: { equals: 'lisbon' } }, limit: 1 })
    const journeyNumericId = journeys.docs[0]?.id
    expect(journeyNumericId).toBeDefined()
    const framesOf = (source: Awaited<ReturnType<typeof readBookBundle>>): number => {
      const page = source.pages.find((candidate) => candidate.kind === 'frames-ii' && candidate.slug === 'lisbon')
      return page?.kind === 'frames-ii' ? (page.slots?.length ?? 0) : -1
    }
    const before = await readBookBundle()
    expect(framesOf(before)).toBeGreaterThan(0)

    // The published Frames II's own place, so the intruder sits between the two.
    const published = await payload.find({
      collection: 'pages',
      depth: 0,
      pagination: false,
      sort: 'order',
      where: { and: [{ journey: { equals: journeyNumericId } }, { kind: { equals: 'frames' } }] },
      select: { order: true },
    })
    const second = published.docs[1]
    expect(second).toBeDefined()

    const intruder = await payload.create({
      collection: 'pages',
      draft: true,
      data: {
        journey: Number(journeyNumericId),
        kind: 'frames',
        title: 'Frames I (copy)',
        order: Number(second?.order) - 0.5,
        layout: 'three-up',
      },
    })
    try {
      const after = await readBookBundle()
      expect(framesOf(after)).toBe(framesOf(before))
    } finally {
      await payload.delete({ collection: 'pages', id: intruder.id })
    }
  })

  it('still excludes a drafted page’s ephemera scrap from the census, which the page filter must not undo', async () => {
    // THE OTHER HALF OF THE SAME QUERY, and the reason the fix above is a
    // partition rather than a `where` clause. `pagesResult.docs` is read twice:
    // once for the book's faces, which must see published rows only, and once
    // by `ephemeraMediaIds` for the gallery census, which must see ALL of them.
    // `galleryFrames.ts` says so in its own header: a scrap that reappeared in
    // the gallery whenever an editor unpublished a page would be the same defect
    // with a harder reproduction.
    //
    // So this case fails if the filter is ever applied to the whole query
    // instead of to the consumers that need it.
    const journeys = await payload.find({ collection: 'journeys', where: { slug: { equals: 'lisbon' } }, limit: 1 })
    const journeyNumericId = journeys.docs[0]?.id
    expect(journeyNumericId).toBeDefined()
    const censusOf = (source: Awaited<ReturnType<typeof readBookBundle>>): number => {
      const notes = source.pages.find((page) => page.kind === 'notes' && page.slug === 'lisbon')
      const gallery = notes?.kind === 'notes' ? notes.gallery : undefined
      return (gallery?.photographs ?? 0) + (gallery?.clips ?? 0)
    }
    const before = await readBookBundle()

    // A frame the census counts today, about to be named as ephemera by a page
    // nobody has published.
    const frames = await payload.find({
      collection: 'media',
      depth: 0,
      limit: 1,
      sort: ['-order'],
      where: { and: [{ journey: { equals: journeyNumericId } }, { hidden: { not_equals: true } }] },
      select: { order: true },
    })
    const scrap = frames.docs[0]?.id
    expect(scrap).toBeDefined()

    const drafted = await payload.create({
      collection: 'pages',
      draft: true,
      data: {
        journey: Number(journeyNumericId),
        kind: 'notes',
        title: 'An unpublished page holding a scrap',
        order: 900,
        layout: 'text-spread',
        slots: [{ role: 'ephemera', media: Number(scrap) }],
      },
    })
    try {
      const after = await readBookBundle()
      expect(censusOf(after)).toBe(censusOf(before) - 1)
    } finally {
      await payload.delete({ collection: 'pages', id: drafted.id })
    }
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

    it('empties a cleared portrait caption while keeping the portrait it belongs to', async () => {
      // Cleared INDEPENDENTLY of the portrait, which is the case the
      // all-fields-cleared test above cannot reach: with no portrait there is
      // no slot to put a caption on, so that case never exercises this
      // fallback at all.
      await payload.updateGlobal({ slug: 'about', data: { portraitCaption: null } })

      const bundle = await readBookBundle()

      expect(bundle.about.portrait?.caption).toBe('')
      expect(bundle.about.portrait?.src).not.toBeUndefined()
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

  describe('the about portrait’s focal point, which lives on the media row', () => {
    /** Finds the seeded portrait's media row by the label the seed stashes in `alt`. */
    const portraitMediaId = async (): Promise<number> => {
      const found = await payload.find({
        collection: 'media',
        depth: 0,
        limit: 1,
        where: { alt: { equals: 'PORTRAIT' } },
      })
      const id = found.docs[0]?.id
      if (id === undefined) throw new Error('the seed did not create the about portrait')
      return id
    }

    afterEach(async () => {
      await payload.update({
        collection: 'media',
        id: await portraitMediaId(),
        data: { focalX: aboutGlobalSeed.portraitFocal.x, focalY: aboutGlobalSeed.portraitFocal.y },
      })
    })

    it('falls back to the centre when the media row’s focalX/focalY are explicitly null', async () => {
      // `media.focalPoint` has no schema `defaultValue` of its own, and an
      // explicit `null` is an ordinary PATCH - so a portrait whose picker has
      // never been touched must render centred rather than at `NaN%`.
      await payload.update({
        collection: 'media',
        id: await portraitMediaId(),
        data: { focalX: null, focalY: null },
      })

      const bundle = await readBookBundle()

      expect(bundle.about.portrait).toMatchObject({ focalX: 50, focalY: 50 })
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

  describe("journey order follows the book global's journeyOrderMode", () => {
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

    it("keeps a page's slots after its title is renamed to something matching none of Notes/Frames I/Frames II", async () => {
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
      const framesI = bundle.pages.find(
        (page) => page.kind === 'frames-i' && page.slug === 'test-readbookbundle-kind-order',
      )
      const framesII = bundle.pages.find(
        (page) => page.kind === 'frames-ii' && page.slug === 'test-readbookbundle-kind-order',
      )

      expect(framesI?.kind === 'frames-i' ? framesI.slots?.[0]?.caption : undefined).toBe('first frames page')
      expect(framesII?.kind === 'frames-ii' ? framesII.slots?.[0]?.caption : undefined).toBe('second frames page')
    })

    it('throws when a slot resolves to media with no derivative of any tier, rather than falling back to the original', async () => {
      // NO RASTER UPLOAD CAN BE THIS FIXTURE ANY MORE. It was a 100x100 PNG,
      // "genuinely too small to generate ANY of them" - true while every tier
      // needed a source at least its own size, and false since MED-001's fix
      // gave `frame` `withoutEnlargement: true`, which exists precisely so
      // that no original is too small for an uncropped derivative. A clip is
      // what is left: Payload's `canResizeImage` refuses a video mime type, so
      // the row carries no `sizes` at all - and a clip in a book slot is a
      // real state, since `pages.slots[].media` relates to the whole `media`
      // collection. `aClip()` writes a real container where ffmpeg exists and
      // an `ftyp` header where it does not; neither is resizable, which is the
      // only property this fixture needs.
      const clip = Buffer.from(await aClip())
      const media = await payload.create({
        collection: 'media',
        // `state: 'ready'` IS LOAD-BEARING SINCE PHASE 4 TASK 7. The column
        // defaults to `'processing'`, and `slotsFor` now answers `src: null`
        // for a row a reader is not served — so a fixture taking the default
        // would draw an empty frame and never reach `derivativeUrlFor` at all.
        // What this case is about is a READY row with no derivative, which is
        // the one operational mistake the throw exists for: a deploy that
        // changes `imageSizes` without running `npm run media:rederive`.
        data: { kind: 'clip', alt: 'a clip has no image derivative', order: 0, state: 'ready' },
        file: { data: clip, mimetype: 'video/mp4', name: 'no-derivative.mp4', size: clip.length },
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

      // CLEANED UP IN A `finally`, AND THE RESTORE IS NOT OPTIONAL. This row
      // belongs to no journey, so no `afterAll` in this file sweeps it, and
      // `../scripts/seed.integration.test.ts` counts the states of EVERY media
      // row in the shared test database. A case that throws before an
      // unconditional delete therefore fails a different file, in a later run,
      // with a message about the seed. Measured rather than imagined: it
      // happened during an earlier fix's own mutation testing, when this row
      // took `state`'s `processing` default.
      try {
        await expect(readBookBundle()).rejects.toThrow(/no derivative of any tier/)
      } finally {
        await payload.delete({ collection: 'media', id: media.id })
      }
    })

    it('prints a wide photograph in a slot whole, not cropped to a square', async () => {
      // MED-001 (`docs/qa/2026-09-08-media-pipeline-sweep.md`) reached the
      // sweep through the lightbox and the download, and the SWEEP DID NOT
      // WALK THIS ONE - it is the third consumer of the same fall-through.
      // `DERIVATIVE_PREFERENCE`'s ephemera list read `['tile', 'frame',
      // 'thumb']`, so a 1200x560 ticket stub was served as an 800x800 centre
      // crop: 560 of its 1200 pixels of width, blown back across a wide strip,
      // with the editor's focal point choosing between what was left.
      //
      // THE ASSERTION IS ON THE DERIVATIVE'S STORED SHAPE, not on which tier
      // was chosen, so a future ladder that gets there another way stays
      // green.
      const wide = await sharp({ create: { width: 1200, height: 560, channels: 3, background: '#7e3d81' } })
        .png()
        .toBuffer()
      const media = await payload.create({
        collection: 'media',
        // `state: 'ready'` for the reason the case above gives: an unserved
        // row draws an empty frame, and this case is about which DERIVATIVE a
        // served one resolves to.
        data: { kind: 'still', alt: 'a wide ticket stub', order: 0, state: 'ready' },
        file: { data: wide, mimetype: 'image/png', name: 'wide-ephemera.png', size: wide.length },
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
          slots: [{ role: 'ephemera', media: media.id, caption: '', focalX: 50, focalY: 50 }],
          _status: 'published',
        },
      })

      // The delete is in a `finally` for the reason the case above gives: this
      // row belongs to no journey, nothing else sweeps it, and a failure here
      // would leave a `processing` row that fails
      // `../scripts/seed.integration.test.ts` instead.
      try {
        const bundle = await readBookBundle()
        const notes = bundle.pages.find(
          (page) => page.kind === 'notes' && page.slug === 'test-readbookbundle-kind-order',
        )
        const slot =
          notes?.kind === 'notes' ? notes.slots?.find((candidate) => candidate.role === 'ephemera') : undefined
        const stored = await payload.findByID({ collection: 'media', id: media.id, depth: 0, select: { sizes: true } })
        const served = Object.values(stored.sizes ?? {}).find((size) => size.url === slot?.src)

        // Two sentinels: a page that did not resolve, and a `src` that is not
        // one of this row's own derivatives - either would make the shape
        // assertion vacuous.
        expect(slot, 'the ephemera slot did not resolve at all').toBeDefined()
        expect(served, 'the slot’s src is not one of the row’s own derivatives').toBeDefined()
        expect({ width: served?.width, height: served?.height }).toEqual({ width: 1200, height: 560 })
      } finally {
        await payload.delete({ collection: 'media', id: media.id })
      }
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
          // `state: 'ready'`: the census counts gallery frames, and
          // `galleryFrames.ts` withholds a row the pipeline has not finished.
          data: { journey: created.id, kind, alt: `census ${kind}`, order: 0, state: 'ready' },
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

    it("falls back to 50 when a slot's focalX/focalY are explicitly null", async () => {
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

  describe('a slot whose photograph cannot be served — Phase 3’s withSlots residual', () => {
    /** What every row this block writes carries, so `afterEach` can find them all. */
    const RESIDUAL_SLUG = 'test-readbookbundle-unserved-slot'

    /**
     * The states `apps/web/collections/media.ts` configures, read off the
     * collection rather than written down.
     *
     * AN INVERSION, NOT A LIST (standing orders, species 6). A fourth state
     * added to the schema is covered by the case below on the commit that adds
     * it, and what would then have to be thought about is whether the access
     * rule and the bundle agree about it.
     * @returns Every option `state` offers.
     */
    const configuredStates = (): readonly NonNullable<MediaDoc['state']>[] => {
      const field = Media.fields.find((candidate) => 'name' in candidate && candidate.name === 'state')
      if (field === undefined || field.type !== 'select') throw new Error('media has no `state` select any more')
      return field.options.map((option) => (typeof option === 'string' ? asState(option) : asState(option.value)))
    }

    /**
     * One of the schema's `state` options, as the generated type spells it.
     *
     * The collection's own options ARE that union — `payload-types.ts` is
     * generated from this very field — but a `CollectionConfig`'s `options`
     * are typed as plain strings, so the narrowing has to be asked for rather
     * than assumed. It REFUSES rather than casts: an option the generated type
     * does not know about means the two have drifted, which is the thing the
     * case below exists to catch.
     * @param option - One of the field's options.
     * @returns The same value, narrowed.
     * @throws {Error} When the option is not one the generated type knows.
     */
    const asState = (option: string): NonNullable<MediaDoc['state']> => {
      if (option === 'processing' || option === 'ready' || option === 'failed') return option
      throw new Error(`media.state offers '${option}', which payload-types.ts does not know about`)
    }

    /**
     * Whether a signed-out reader can see a media row at all — which is whether
     * Payload will serve its bytes at `/api/media/file/<name>` and every
     * derivative of it.
     *
     * THE AUTHORITY, ASKED RATHER THAN RESTATED. `readBookBundle`'s own
     * predicate is a second spelling of `collections/media.ts`'s `read` rule,
     * and two spellings of one rule is how one of them drifts. This runs the
     * real rule, with no user, so the case below compares the bundle against
     * the thing the bundle is trying to agree with.
     * @param media - The media row id.
     * @returns Whether an anonymous read returns it.
     */
    const servedToAReader = async (media: number): Promise<boolean> => {
      const found = await payload.find({
        collection: 'media',
        overrideAccess: false,
        depth: 0,
        where: { id: { equals: media } },
      })
      return found.docs.length === 1
    }

    /**
     * A published journey with one published notes page carrying the slots given.
     *
     * THE SLOTS ARE WRITTEN DIRECTLY, and the shape is the one
     * `apps/web/lib/admin/slotMutations.ts`'s `setSlotMediaRow` writes — one
     * row per cell, padded, never spliced, which its own suite pins. What this
     * block is about is what `readBookBundle` does with such a row, so the
     * producer is cited rather than run.
     * @param slots - The page's slots, in cell order.
     */
    const aPageWithSlots = async (
      slots: readonly { readonly role: 'hero' | 'ephemera' | 'frame'; readonly media?: number }[],
    ): Promise<void> => {
      const journey = await payload.create({
        collection: 'journeys',
        data: {
          name: 'Unserved Slot Trip',
          place: 'Nowhere',
          slug: RESIDUAL_SLUG,
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
          slots: slots.map((slot) => ({ role: slot.role, media: slot.media ?? null, focalX: 50, focalY: 50 })),
          _status: 'published',
        },
      })
    }

    /**
     * A media row in one particular state.
     * @param state - The `state` column's value.
     * @param label - What distinguishes this row from the others.
     * @returns The media row id.
     */
    const aMediaRowAt = async (state: NonNullable<MediaDoc['state']>, label: string): Promise<number> => {
      const png = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: '#a34434' } })
        .png()
        .toBuffer()
      const created = await payload.create({
        collection: 'media',
        data: { kind: 'still', alt: `${RESIDUAL_SLUG} ${label}`, order: 0, state },
        file: { data: png, mimetype: 'image/png', name: `${RESIDUAL_SLUG}-${label}.png`, size: png.length },
      })
      return created.id
    }

    /** Removes this block's journey and its pages, between states and after each case. */
    const removeTheFixture = async (): Promise<void> => {
      const found = await payload.find({ collection: 'journeys', where: { slug: { equals: RESIDUAL_SLUG } } })
      for (const doc of found.docs) {
        const pages = await payload.find({ collection: 'pages', where: { journey: { equals: doc.id } } })
        for (const page of pages.docs) await payload.delete({ collection: 'pages', id: page.id })
        await payload.delete({ collection: 'journeys', id: doc.id })
      }
    }

    /**
     * The notes page this block's journey contributes to the book.
     * @returns Its slots.
     */
    const slotsOfTheFixture = async (): Promise<readonly Slot[] | undefined> => {
      const bundle = await readBookBundle()
      const notes = bundle.pages.find((page) => page.kind === 'notes' && page.slug === RESIDUAL_SLUG)
      return notes?.kind === 'notes' ? notes.slots : undefined
    }

    afterEach(async () => {
      await removeTheFixture()
      await payload.delete({ collection: 'media', where: { alt: { like: RESIDUAL_SLUG } } })
    })

    it('draws an empty frame for a slot whose media is not ready, rather than a src that 403s', async () => {
      // Not `toBeUndefined()` on the whole slot: dropping the slot is what the
      // comment in `readBookBundle.ts` says takes the WHOLE BOOK down. The slot
      // survives with no source.
      const processing = await aMediaRowAt('processing', 'processing')
      await aPageWithSlots([{ role: 'hero', media: processing }])

      expect((await slotsOfTheFixture())?.[0]?.src).toBeNull()
    })

    it('gives a slot a source exactly when a signed-out reader could fetch it', async () => {
      // THE AGREEMENT, OVER EVERY STATE THE SCHEMA OFFERS. Each side is
      // produced by a different thing: the left by `collections/media.ts`'s own
      // `read` rule run with no user, the right by the production mapper. A
      // fourth state, or a change to either rule, breaks this rather than
      // leaving the book quietly serving an image that 403s.
      const states = configuredStates()
      expect(states.length, 'the media collection offers no states to compare').toBeGreaterThan(0)

      for (const state of states) {
        const media = await aMediaRowAt(state, state)
        await aPageWithSlots([{ role: 'hero', media }])

        const served = await servedToAReader(media)
        const src = (await slotsOfTheFixture())?.[0]?.src

        expect(src !== null, `state ${state}: served=${String(served)} but src=${String(src)}`).toBe(served)

        await removeTheFixture()
      }
    })

    it('serves a row whose state is NULL, which is every row written before the column existed', async () => {
      // THE PERMITTED SIDE OF THE SAME GATE, and the one with the largest
      // blast radius: `20260910_171154_add_media_state` deliberately did not
      // backfill (docs/deviations.md §48), so NULL means "ingested before
      // there was a state to record". A fallback that refused it would take
      // the whole public diary dark, and every OTHER case in this block would
      // still pass — the seeded rows are all `ready`.
      const media = await aMediaRowAt('ready', 'null-state')
      await payload.update({ collection: 'media', id: media, data: { state: null } })
      const stored = await payload.findByID({ collection: 'media', id: media, depth: 0 })
      expect(stored.state, 'the column would not take a NULL, so this case proves nothing').toBeNull()
      await aPageWithSlots([{ role: 'hero', media }])

      expect((await slotsOfTheFixture())?.[0]?.src).not.toBeNull()
    })

    it('draws an empty frame for a hidden photograph, which is the other half of the same rule', async () => {
      const media = await aMediaRowAt('ready', 'hidden')
      await payload.update({ collection: 'media', id: media, data: { hidden: true } })
      await aPageWithSlots([{ role: 'hero', media }])

      expect((await slotsOfTheFixture())?.[0]?.src).toBeNull()
    })

    it('keeps an empty cell, so the photograph after it is not drawn in the frame before', async () => {
      // THE WHOLE-BOOK COST OF DROPPING THE ROW. `FramesI.tsx` reads
      // `page.slots?.[position]`, and the admin's Clear empties a cell in place
      // (`slotMutations.ts`). A `slotsFor` that skipped the empty row would
      // hand this page's ONE photograph to cell 0 — the author cleared the hero
      // and the scrap moved into it.
      const scrap = await aMediaRowAt('ready', 'second-cell')
      await aPageWithSlots([{ role: 'hero' }, { role: 'ephemera', media: scrap }])

      const slots = await slotsOfTheFixture()

      expect(slots).toHaveLength(2)
      expect(slots?.[0]?.src).toBeNull()
      expect(slots?.[1]?.role).toBe('ephemera')
      expect(slots?.[1]?.src).not.toBeNull()
    })
  })
})
