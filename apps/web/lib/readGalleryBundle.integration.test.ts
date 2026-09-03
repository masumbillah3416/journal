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

/** The seeded journey whose full sixty-one-frame gallery SCREENS.md §1.8 verified against. */
const VERIFIED_GALLERY = { slug: 'patagonia', frames: 61 }

describe('readGalleryBundle', () => {
  let payload: Awaited<ReturnType<typeof getTestPayload>>

  beforeAll(async () => {
    payload = await getTestPayload()
    await seed(payload)
  }, SETUP_TIMEOUT_MS)

  it('returns the sixty-one frames SCREENS.md §1.8 records the grid as verified with', async () => {
    const bundle = await readGalleryBundle(VERIFIED_GALLERY.slug)

    expect(bundle?.frames).toHaveLength(VERIFIED_GALLERY.frames)
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

  it('points every download at a handler of ours rather than at the store', async () => {
    const bundle = await readGalleryBundle(VERIFIED_GALLERY.slug)

    expect(
      bundle?.frames.filter((frame) => !frame.downloadHref.startsWith('/gallery/patagonia/download/')),
    ).toEqual([])
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

    // One find for the journey, one for its media; one findGlobal for the
    // book's tile size.
    expect(findSpy.mock.calls.length).toBe(2)
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
          data: { journey: journeyId, kind: 'still', alt: label, caption: label, ...extra },
          file: { data: png, mimetype: 'image/png', name: `${label}.png`, size: png.length },
        })
      }

      await upload('test-visible', 900, { order: 0, focalX: 30, focalY: 72 })
      await upload('test-hidden', 900, { order: 1, hidden: true })
      await upload('test-withheld', 900, { order: 2, allowDownload: false })
      // Smaller than the smallest derivative tier (400px), so Payload
      // generates none at all - the unprocessed-upload case.
      await upload('test-no-derivative', 100, { order: 3 })
    }, SETUP_TIMEOUT_MS)

    afterAll(async () => {
      await payload.delete({ collection: 'media', where: { journey: { equals: journeyId } } })
      await payload.delete({ collection: 'journeys', where: { slug: { equals: 'test-gallery' } } })
    })

    it('omits a frame an editor has hidden', async () => {
      const bundle = await readGalleryBundle('test-gallery')

      expect(bundle?.frames.map((frame) => frame.alt)).not.toContain('test-hidden')
    })

    it('omits a frame with no derivative rather than failing the whole gallery', async () => {
      const bundle = await readGalleryBundle('test-gallery')

      expect(bundle?.frames.map((frame) => frame.alt)).not.toContain('test-no-derivative')
      expect(bundle?.frames.map((frame) => frame.alt)).toContain('test-visible')
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
