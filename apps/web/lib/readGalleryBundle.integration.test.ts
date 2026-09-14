/**
 * readGalleryBundle.integration.test.ts — behaviour spec for the gallery's
 * serialization boundary.
 *
 * Integration test (CLAUDE.md §2): exercises `readGalleryBundle` against a
 * real Payload instance and a real Docker Postgres, not a mock - it is the
 * one function this repository trusts to turn `media` rows into a
 * `GalleryBundle`, so its test must prove that boundary against the real
 * thing. Named `*.integration.test.ts` so it runs only under the
 * `integration` Vitest project, never in `npm run verify` (pre-commit).
 *
 * TWO CASES HERE ARE SECURITY REQUIREMENTS RATHER THAN BEHAVIOURS:
 *   - `omits a frame an editor has hidden`. `collections/media.ts` withholds
 *     a hidden row from an unauthenticated READER, but this module runs
 *     through the Local API with no user, where access control is overridden
 *     by default - so the exclusion has to be in the query, and a test that
 *     did not create a hidden row would never notice if it were dropped.
 *     SECURITY.md's objection to direct media URLs is exactly that they
 *     "invite enumeration of everything in the bucket, including anything
 *     marked hidden".
 *   - `points every download at a handler of ours rather than at the store`.
 *     Same section, the sentence after it.
 *
 * Fixture journeys created by this file use a `test-` slug prefix, matching
 * `collections.integration.test.ts`'s convention, so they cannot collide with
 * the ten real seeded slugs, and are deleted in `afterAll`.
 * Depends on: sharp (to make real uploads Payload will derive sizes from),
 * vitest, ./testPayload, ./readGalleryBundle, ../scripts/seed.
 */
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getPayload } from './payload'
import { readGalleryBundle } from './readGalleryBundle'
import { getTestPayload } from './testPayload'
import { seed } from '../scripts/seed'

const SETUP_TIMEOUT_MS = 180_000

/**
 * The seeded journey whose full gallery SCREENS.md §1.8 was verified against.
 *
 * `docs/deviations.md` §20 seeds the prototype's own count of 61 media rows for
 * Patagonia. SIXTY of them are photographs: the sixty-first is the Notes page's
 * ephemera scrap, which PH1-002 took out of the grid because it is a texture
 * rather than one of the journey's frames (`docs/deviations.md` §13.4, and
 * `lib/galleryFrames.ts`'s header). §1.8's verification bar is "must stay
 * square and unsqueezed at 40+", which sixty still clears, and §1.9's
 * `003 / 061` is that counter's three-digit FORMAT, which `060` still is.
 */
const VERIFIED_GALLERY = { slug: 'patagonia', frames: 60 }

describe('readGalleryBundle', () => {
  let payload: Awaited<ReturnType<typeof getTestPayload>>

  beforeAll(async () => {
    payload = await getTestPayload()
    await seed(payload)
  }, SETUP_TIMEOUT_MS)

  it('returns every photograph of the journey SCREENS.md §1.8 records the grid as verified with', async () => {
    const bundle = await readGalleryBundle(VERIFIED_GALLERY.slug)

    expect(bundle?.frames).toHaveLength(VERIFIED_GALLERY.frames)
  })

  it('omits the Notes page’s ephemera scrap, which is a texture rather than one of the journey’s photographs', async () => {
    // PH1-002. The scrap is an ordinary `media` row with the journey on it, so
    // the gallery's `where` clause admitted it and it became frame 004 of every
    // journey - captionless, counted in the "n photos" census and downloadable.
    // `docs/deviations.md` §13.4 already settles what it is ("a texture behind
    // tape rather than a photograph with a subject"), which is exactly why it
    // does not belong in a grid of the journey's photographs. What identifies it
    // is the `pages` slot that prints it, since `role` lives on the slot and not
    // on the media row.
    const bundle = await readGalleryBundle(VERIFIED_GALLERY.slug)
    const pages = await payload.find({
      collection: 'pages',
      depth: 0,
      pagination: false,
      limit: 5000,
      where: { journey: { equals: Number(bundle?.journey.id) } },
      select: { slots: true },
    })
    const ephemeraIds = new Set(
      pages.docs.flatMap((page) =>
        (page.slots ?? [])
          .filter((slot) => slot.role === 'ephemera')
          .map((slot) => String(typeof slot.media === 'number' ? slot.media : slot.media?.id)),
      ),
    )

    // The fixture has to actually contain one, or this test passes vacuously.
    expect(ephemeraIds.size).toBe(1)
    expect(bundle?.frames.filter((frame) => ephemeraIds.has(String(frame.id)))).toEqual([])
  })

  it('carries the journey’s own header content through', async () => {
    const bundle = await readGalleryBundle(VERIFIED_GALLERY.slug)

    expect(bundle?.journey).toMatchObject({ slug: 'patagonia', name: 'Patagonia', place: 'Chile' })
  })

  it('numbers the grid’s minimum tile track from the book global', async () => {
    const bundle = await readGalleryBundle(VERIFIED_GALLERY.slug)

    expect(bundle?.thumbSize).toBe(200)
  })

  it('resolves every tile to a derivative, never to the uploaded original', async () => {
    const bundle = await readGalleryBundle(VERIFIED_GALLERY.slug)
    const originals = await payload.find({
      collection: 'media',
      depth: 0,
      pagination: false,
      limit: 20_000,
      where: { journey: { equals: bundle?.journey.id } },
      select: { url: true },
    })
    const originalUrls = new Set(originals.docs.map((doc) => doc.url))

    expect(bundle?.frames.filter((frame) => originalUrls.has(frame.tileSrc))).toEqual([])
    expect(bundle?.frames.filter((frame) => originalUrls.has(frame.fullSrc))).toEqual([])
  })

  it('offers every tile derivative the row carries, with the width Payload actually generated', async () => {
    // PH1-003. The `w` descriptor has to be the DERIVATIVE's own width, not the
    // ladder's configured target: Payload skips a tier whose target exceeds the
    // source, and preserves aspect ratio, so a tier's real width is a property
    // of the file. A descriptor that lied would make the browser's choice worse
    // than no choice. The seeded gallery placeholders are 900px squares, so
    // Payload generates `thumb` (400), ADR 0013's `grid` (700) and `tile`
    // (800), and nothing above them.
    const bundle = await readGalleryBundle(VERIFIED_GALLERY.slug)
    const frames = bundle?.frames ?? []

    expect(frames).not.toEqual([])
    // Every frame, not just the first: a `w` descriptor missing from one row is
    // a wrong choice on one tile, which is exactly the kind of gap a
    // spot-check misses.
    expect(frames.filter((frame) => !/^\S+ 400w, \S+ 700w, \S+ 800w$/.test(frame.tileSrcSet))).toEqual([])
    // The `src` stays the smallest, for a browser that reads no `srcset`.
    expect(frames.filter((frame) => !frame.tileSrcSet.startsWith(`${frame.tileSrc} 400w`))).toEqual([])
  })

  it('offers the grid tier as a srcset candidate, with its own width descriptor', async () => {
    // A tier the row carries but the srcset never names is a tier the browser
    // cannot choose - which is the whole of ADR 0013 Option 3 undone by an
    // omission in one array.
    const bundle = await readGalleryBundle(VERIFIED_GALLERY.slug)
    const frame = bundle?.frames[0]

    expect(frame?.tileSrcSet).toContain('700w')
  })

  it('points every download at a handler of ours rather than at the store', async () => {
    const bundle = await readGalleryBundle(VERIFIED_GALLERY.slug)

    expect(bundle?.frames.filter((frame) => !frame.downloadHref.startsWith('/gallery/patagonia/download/'))).toEqual([])
    expect(bundle?.frames.filter((frame) => frame.downloadHref.includes('/api/media/file/'))).toEqual([])
  })

  it('reads every frame as a photograph, since no clip can exist while video is deferred', async () => {
    const bundle = await readGalleryBundle(VERIFIED_GALLERY.slug)

    expect(bundle?.frames.filter((frame) => frame.kind !== 'still')).toEqual([])
  })

  it('answers with nothing at all for a slug naming no journey, so the route can 404', async () => {
    expect(await readGalleryBundle('no-such-journey')).toBeNull()
  })

  it('costs three queries whatever the size of the gallery (no N+1)', async () => {
    // CLAUDE.md §6. Sixty-one frames must not be sixty-one queries, and this
    // is the case that would notice if a future edit resolved anything per
    // frame. Spied on the same shared Payload instance the module itself
    // opens, exactly as `readBookBundle.integration.test.ts` does.
    const findSpy = vi.spyOn(await getPayload(), 'find')
    const findGlobalSpy = vi.spyOn(await getPayload(), 'findGlobal')

    await readGalleryBundle(VERIFIED_GALLERY.slug)

    // One find for the journey, one for the pages that say which of its media
    // are decorative, one for the media itself; one findGlobal for the book's
    // tile size. The pages query is over three rows and does not grow with the
    // sixty it filters - see `lib/galleryFrames.ts`.
    expect(findSpy.mock.calls.length).toBe(3)
    expect(findGlobalSpy.mock.calls.length).toBe(1)

    findSpy.mockRestore()
    findGlobalSpy.mockRestore()
  })

  it('sets depth explicitly on every query, so no default walks the relationship graph', async () => {
    const findSpy = vi.spyOn(await getPayload(), 'find')

    await readGalleryBundle('marrakech')

    expect(findSpy.mock.calls.length).toBeGreaterThan(0)
    for (const call of findSpy.mock.calls) expect(call[0]).toHaveProperty('depth')

    findSpy.mockRestore()
  })

  describe('against a journey this suite owns', () => {
    let journeyId: number

    beforeAll(async () => {
      const journey = await payload.create({
        collection: 'journeys',
        data: {
          name: 'Test Gallery',
          place: 'Nowhere',
          slug: 'test-gallery',
          dates: '1 - 2 Jan 2020',
          _status: 'published',
        },
      })
      journeyId = journey.id

      /** A real upload, large enough for Payload to derive at least a `thumb` from. */
      const upload = async (label: string, size: number, extra: Record<string, unknown> = {}): Promise<void> => {
        const png = await sharp({
          create: { width: size, height: size, channels: 3, background: '#3d817e' },
        })
          .png()
          .toBuffer()
        await payload.create({
          collection: 'media',
          // `state: 'ready'`: these are finished uploads, and the gallery's
          // filter withholds a row that is not (`galleryFrames.ts`). The
          // field's default is `processing`.
          data: { journey: journeyId, kind: 'still', alt: label, caption: label, state: 'ready', ...extra },
          file: { data: png, mimetype: 'image/png', name: `${label}.png`, size: png.length },
        })
      }

      await upload('test-visible', 900, { order: 0, focalX: 30, focalY: 72 })
      await upload('test-hidden', 900, { order: 1, hidden: true })
      await upload('test-withheld', 900, { order: 2, allowDownload: false })
      // Smaller than the smallest derivative tier (400px), so Payload
      // generates none at all - the unprocessed-upload case.
      await upload('test-no-derivative', 100, { order: 3 })
      // A row the pipeline has not finished. Its stored bytes may be an
      // un-stripped original - that is what `MEDIA_PIPELINE=worker` records,
      // and `worker` is the only mode that writes this state (`inline`
      // creates at `ready` and a refusal creates no row at all).
      await upload('test-processing', 900, { order: 4, state: 'processing' })
      // Wide enough for `thumb` (400) and too narrow for ADR 0013's `grid`
      // (700), so Payload derives exactly ONE tier for it. That is the only
      // way to reach the refused side of `tileSrcSet`'s two-candidate
      // threshold, and before the `grid` rung existed there was no width
      // between 400 and 800 that could express it.
      await upload('test-one-derivative', 500, { order: 5 })
    }, SETUP_TIMEOUT_MS)

    afterAll(async () => {
      await payload.delete({ collection: 'media', where: { journey: { equals: journeyId } } })
      await payload.delete({ collection: 'journeys', where: { slug: { equals: 'test-gallery' } } })
    })

    it('omits a frame an editor has hidden', async () => {
      const bundle = await readGalleryBundle('test-gallery')

      expect(bundle?.frames.map((frame) => frame.alt)).not.toContain('test-hidden')
    })

    it('offers one candidate per derivative for a row carrying several', async () => {
      // `test-visible` is a 900px upload, so Payload derives `thumb`, `grid`
      // and `tile` for it - the accepted side of `tileSrcSet`'s two-candidate
      // threshold, and a count that moves when the ladder does.
      const bundle = await readGalleryBundle('test-gallery')
      const visible = bundle?.frames.find((frame) => frame.alt === 'test-visible')

      expect(visible?.tileSrcSet.split(', ')).toHaveLength(3)
    })

    it('offers no srcset for a row carrying a single derivative, since one candidate is not a choice', async () => {
      // THE REFUSED SIDE OF THE SAME THRESHOLD, which nothing pinned until the
      // `grid` rung made a one-tier row expressible: `test-one-derivative` is
      // 500px, so it clears `thumb` and nothing else. The row is still listed -
      // it has a derivative - it simply has no choice to offer, and the grid
      // omits the attribute rather than printing a single-entry list on every
      // one of sixty tiles. `test-no-derivative` is the case below this one:
      // no tier at all, and omitted from the gallery entirely.
      const bundle = await readGalleryBundle('test-gallery')
      const narrow = bundle?.frames.find((frame) => frame.alt === 'test-one-derivative')

      expect(narrow?.tileSrcSet).toBe('')
    })

    it('omits a frame with no derivative rather than failing the whole gallery', async () => {
      const bundle = await readGalleryBundle('test-gallery')

      expect(bundle?.frames.map((frame) => frame.alt)).not.toContain('test-no-derivative')
      expect(bundle?.frames.map((frame) => frame.alt)).toContain('test-visible')
    })

    it('omits a frame the pipeline has not finished, since its bytes may be an unstripped original', async () => {
      // THIS READER OVERRIDES ACCESS, so `Media.access.read`'s own `state`
      // clause never runs for it; the filter in `galleryFrames.ts` is what
      // closes this door, and it is the same one the download handler and the
      // census share (Task 8 fix review, N1). The positive control is in the
      // same assertion: a finished frame IS listed, so an empty grid cannot
      // pass this.
      const bundle = await readGalleryBundle('test-gallery')

      const listed = bundle?.frames.map((frame) => frame.alt) ?? []
      expect({ unfinished: listed.includes('test-processing'), finished: listed.includes('test-visible') }).toEqual({
        unfinished: false,
        finished: true,
      })
    })

    it('still lists a frame whose state is null, which is what every pre-migration row reads as', async () => {
      // ═══ THE OTHER DIRECTION OF THE SAME CLAUSE, AND THE HIGHER-CONSEQUENCE
      //     ONE ═══
      //
      // `galleryFrameWhere` admits `{ state: { exists: false } }` because
      // `20260910_171154_add_media_state` deliberately did not backfill
      // (`docs/deviations.md` §48), so every row in a store written before that
      // column reads NULL. The unit case asserts the clause's SHAPE. Nothing
      // asserted that Payload's `exists: false` actually returns those rows
      // through a real query - and if it did not, every photograph in an
      // existing public diary would leave the grid at once (Task 8 final
      // review, N6).
      //
      // The `state` is nulled and put back, rather than a fixture created
      // NULL, so this reads the same row the case above reads as `ready`.
      const nulled = await payload.update({
        collection: 'media',
        where: { alt: { equals: 'test-visible' } },
        data: { state: null },
      })

      try {
        const bundle = await readGalleryBundle('test-gallery')

        // `includes` rather than `expect.arrayContaining`, which vitest types
        // as `any` and which this repository's lint rules refuse. `updated` is
        // in the same assertion as the positive control on the setup: if the
        // update matched no row, the case would be asking about a photograph it
        // never changed.
        const listed = bundle?.frames.map((frame) => frame.alt) ?? []
        expect({ listedWhileNull: listed.includes('test-visible'), rowsNulled: nulled.docs.length }).toEqual({
          listedWhileNull: true,
          rowsNulled: 1,
        })
      } finally {
        await payload.update({
          collection: 'media',
          where: { alt: { equals: 'test-visible' } },
          data: { state: 'ready' },
        })
      }
    })

    it('shows a frame the editor has withheld a download for, without offering the download', async () => {
      const bundle = await readGalleryBundle('test-gallery')
      const withheld = bundle?.frames.find((frame) => frame.alt === 'test-withheld')

      expect(withheld).toBeDefined()
      expect(withheld?.downloadable).toBe(false)
    })

    it('takes the crop from the media item’s own focal point, which is the only one a gallery frame has', async () => {
      const bundle = await readGalleryBundle('test-gallery')
      const visible = bundle?.frames.find((frame) => frame.alt === 'test-visible')

      expect(visible).toMatchObject({ focalX: 30, focalY: 72 })
    })

    it('closes the gallery of a journey an editor unpublishes, rather than merely unlinking it', async () => {
      await payload.update({
        collection: 'journeys',
        where: { slug: { equals: 'test-gallery' } },
        data: { _status: 'draft' },
      })

      const bundle = await readGalleryBundle('test-gallery')

      await payload.update({
        collection: 'journeys',
        where: { slug: { equals: 'test-gallery' } },
        data: { _status: 'published' },
      })
      expect(bundle).toBeNull()
    })

    it('closes the gallery of a journey an editor has archived', async () => {
      await payload.update({
        collection: 'journeys',
        where: { slug: { equals: 'test-gallery' } },
        data: { archived: true },
      })

      const bundle = await readGalleryBundle('test-gallery')

      await payload.update({
        collection: 'journeys',
        where: { slug: { equals: 'test-gallery' } },
        data: { archived: false },
      })
      expect(bundle).toBeNull()
    })

    it('closes the gallery of a soft-deleted journey', async () => {
      await payload.update({
        collection: 'journeys',
        where: { slug: { equals: 'test-gallery' } },
        data: { deletedAt: new Date().toISOString() },
      })

      const bundle = await readGalleryBundle('test-gallery')

      await payload.update({
        collection: 'journeys',
        where: { slug: { equals: 'test-gallery' } },
        data: { deletedAt: null },
      })
      expect(bundle).toBeNull()
    })
  })
})
