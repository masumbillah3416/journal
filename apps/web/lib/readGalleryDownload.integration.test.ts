/**
 * readGalleryDownload.integration.test.ts — what the download action will and
 * will not serve.
 *
 * Integration test (CLAUDE.md §2), against a real Payload, a real Postgres
 * and the real files on disk - because half of what this module does is read
 * bytes back out of the store the `media` collection wrote them to, and a
 * mock of that store would prove nothing about the one defect that has
 * already happened here once (Task 10: the seed and the dev server resolved
 * `staticDir` against different working directories, and every photograph
 * answered 500).
 *
 * THE REFUSALS ARE THE POINT OF THE FILE. SECURITY.md's objection to direct
 * media URLs is that they "invite enumeration of everything in the bucket,
 * including anything marked hidden", so a handler of ours is only an
 * improvement if it refuses what the bucket would have exposed. Four cases
 * below are that: a frame from another journey, a hidden frame, a frame whose
 * download the editor withheld, and a journey that is not published. Each has
 * to fail, and each has to fail the SAME way - a handler whose messages
 * distinguished them would be the oracle the rule exists to close.
 * Depends on: sharp, vitest, ./testPayload, ./readGalleryDownload, ../scripts/seed.
 */
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readGalleryDownload } from './readGalleryDownload'
import { getTestPayload } from './testPayload'
import { seed } from '../scripts/seed'

const SETUP_TIMEOUT_MS = 180_000

describe('readGalleryDownload', () => {
  let payload: Awaited<ReturnType<typeof getTestPayload>>
  let journeyId: number
  let otherJourneyId: number
  const ids: Record<string, string> = {}

  beforeAll(async () => {
    payload = await getTestPayload()
    await seed(payload)

    const journey = await payload.create({
      collection: 'journeys',
      data: {
        name: 'Test Download',
        place: 'Nowhere',
        slug: 'test-download',
        dates: '1 - 2 Jan 2020',
        _status: 'published',
      },
    })
    journeyId = journey.id

    const other = await payload.create({
      collection: 'journeys',
      data: {
        name: 'Test Elsewhere',
        place: 'Nowhere',
        slug: 'test-elsewhere',
        dates: '1 - 2 Jan 2020',
        _status: 'published',
      },
    })
    otherJourneyId = other.id

    /** A real 900px upload, so Payload derives real `thumb` and `tile` files on disk. */
    const upload = async (label: string, owner: number, extra: Record<string, unknown> = {}): Promise<void> => {
      const png = await sharp({ create: { width: 900, height: 900, channels: 3, background: '#a34434' } })
        .png()
        .toBuffer()
      const created = await payload.create({
        collection: 'media',
        data: { journey: owner, kind: 'still', alt: label, caption: label, ...extra },
        file: { data: png, mimetype: 'image/png', name: `${label}.png`, size: png.length },
      })
      ids[label] = String(created.id)
    }

    await upload('dl-first', journeyId, { order: 0 })
    await upload('dl-second', journeyId, { order: 1 })
    await upload('dl-hidden', journeyId, { order: 2, hidden: true })
    await upload('dl-withheld', journeyId, { order: 3, allowDownload: false })
    await upload('dl-elsewhere', otherJourneyId, { order: 0 })
    // PH1-002. `role` lives on the `pages` slot, not on the media row, so the
    // only thing that makes a media item the Notes page's decorative scrap is
    // a slot printing it as one. The row itself is an ordinary upload.
    await upload('dl-ephemera', journeyId, { order: 4 })
    await payload.create({
      collection: 'pages',
      data: {
        journey: journeyId,
        kind: 'notes',
        order: 0,
        slots: [{ role: 'ephemera', media: Number(ids['dl-ephemera']) }],
      },
    })
  }, SETUP_TIMEOUT_MS)

  afterAll(async () => {
    await payload.delete({ collection: 'pages', where: { journey: { in: [journeyId, otherJourneyId] } } })
    await payload.delete({ collection: 'media', where: { journey: { in: [journeyId, otherJourneyId] } } })
    await payload.delete({ collection: 'journeys', where: { slug: { in: ['test-download', 'test-elsewhere'] } } })
  })

  it('serves a derivative’s real bytes', async () => {
    const result = await readGalleryDownload('test-download', ids['dl-first'] ?? '')

    expect(result.ok).toBe(true)
    expect(result.ok && result.value.bytes.byteLength).toBeGreaterThan(0)
  })

  it('serves it under a type from the allowlist, not a stored string passed through', async () => {
    const result = await readGalleryDownload('test-download', ids['dl-first'] ?? '')

    expect(result.ok && result.value.contentType).toBe('image/png')
  })

  it('names the file for the journey and the frame’s number, never for the stored key', async () => {
    const result = await readGalleryDownload('test-download', ids['dl-second'] ?? '')

    // Second of the three visible frames (the hidden one is not counted at
    // all), so `002` - the same number the lightbox printed.
    expect(result.ok && result.value.filename).toBe('test-download-002.png')
  })

  it('refuses a frame belonging to another journey, so the slug is not decoration', async () => {
    const result = await readGalleryDownload('test-download', ids['dl-elsewhere'] ?? '')

    expect(result.ok).toBe(false)
  })

  it('refuses a frame an editor has hidden', async () => {
    const result = await readGalleryDownload('test-download', ids['dl-hidden'] ?? '')

    expect(result.ok).toBe(false)
  })

  it('refuses a frame whose download the editor has withheld', async () => {
    const result = await readGalleryDownload('test-download', ids['dl-withheld'] ?? '')

    expect(result.ok).toBe(false)
  })

  it('refuses the Notes page’s ephemera scrap, so a page texture cannot be saved as a photograph', async () => {
    // PH1-002. The gallery grid no longer lists the scrap, and this handler is
    // the second, independent derivation of "the journey's frames" - it recounts
    // the same query to number the filename. If only the grid excluded it, the
    // address stayed live (`200 · attachment; filename="patagonia-004.png"`) and
    // every filename after it named the wrong frame.
    const result = await readGalleryDownload('test-download', ids['dl-ephemera'] ?? '')

    expect(result.ok).toBe(false)
  })

  it('refuses an id that names no media at all', async () => {
    const result = await readGalleryDownload('test-download', '99999999')

    expect(result.ok).toBe(false)
  })

  it('refuses a slug that names no published journey', async () => {
    const result = await readGalleryDownload('no-such-journey', ids['dl-first'] ?? '')

    expect(result.ok).toBe(false)
  })

  it('refuses every one of them with the same message, so it is not an enumeration oracle', async () => {
    const refusals = await Promise.all([
      readGalleryDownload('test-download', ids['dl-elsewhere'] ?? ''),
      readGalleryDownload('test-download', ids['dl-hidden'] ?? ''),
      readGalleryDownload('test-download', ids['dl-withheld'] ?? ''),
      readGalleryDownload('test-download', ids['dl-ephemera'] ?? ''),
      readGalleryDownload('test-download', '99999999'),
      readGalleryDownload('no-such-journey', ids['dl-first'] ?? ''),
    ])

    expect(new Set(refusals.map((refusal) => (refusal.ok ? 'ok' : refusal.error))).size).toBe(1)
  })

  it('refuses a download from a journey an editor unpublishes', async () => {
    await payload.update({
      collection: 'journeys',
      where: { slug: { equals: 'test-download' } },
      data: { _status: 'draft' },
    })

    const result = await readGalleryDownload('test-download', ids['dl-first'] ?? '')

    await payload.update({
      collection: 'journeys',
      where: { slug: { equals: 'test-download' } },
      data: { _status: 'published' },
    })
    expect(result.ok).toBe(false)
  })
})
