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
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { MEDIA_DIR } from '../collections/media'
import { createLocalStorage } from './adapters/local-storage'
import { getPayload } from './payload'
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
    // THE ONE INCONSISTENT STATE THIS FILE CAN LEAVE BEHIND, repaired
    // narrowly and nowhere else - the same shape `collections.integration.test.ts`'s
    // migration repairs take. `withPasswordProtect`'s `finally` covers every
    // ordinary failure; what it cannot cover is the worker being killed
    // outright between the set and the restore, and `site` is a global the
    // seed does not write, so a `true` left behind would survive into every
    // later run of every file. Measured rather than imagined: mutating that
    // `finally` away left the flag on, and the next run's own `before`
    // snapshot then restored it to `true` for ever.
    await payload.updateGlobal({ slug: 'site', depth: 0, data: { passwordProtect: false } })

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
        // `state: 'ready'` because these fixtures ARE finished uploads: the
        // gallery's own filter withholds a row the pipeline has not finished
        // (`galleryFrames.ts`), and the field's default is `processing`, so a
        // fixture that omitted it would be testing the wrong row.
        data: { journey: owner, kind: 'still', alt: label, caption: label, state: 'ready', ...extra },
        file: { data: png, mimetype: 'image/png', name: `${label}.png`, size: png.length },
      })
      ids[label] = String(created.id)
    }

    await upload('dl-first', journeyId, { order: 0 })
    await upload('dl-second', journeyId, { order: 1 })
    await upload('dl-hidden', journeyId, { order: 2, hidden: true })
    await upload('dl-withheld', journeyId, { order: 3, allowDownload: false })
    await upload('dl-elsewhere', otherJourneyId, { order: 0 })
    // A row the pipeline has not finished. Under `MEDIA_PIPELINE=worker` its
    // stored bytes are the un-stripped original; a crashed `inline` upload
    // leaves the same state. This handler serves bytes, so it is one of the
    // four public doors the state filter has to close.
    await upload('dl-processing', journeyId, { order: 5, state: 'processing' })
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

  /**
   * The frame every case that is not about a refusal reads.
   *
   * A helper rather than `ids['dl-first']` at each call site so the cases
   * below say WHICH frame they mean rather than which key they index.
   * @returns The first visible frame's id, as the URL would carry it.
   */
  const aSeededFrameId = (): string => ids['dl-first'] ?? ''

  /**
   * Runs `body` with `site.passwordProtect` set, and puts it back afterwards.
   *
   * The restore is in a `finally` and is not optional: the global is shared by
   * every case in this file and by every file in the run, so a case that left
   * the site gated would silently change what the cases after it measure.
   * @param gated - What to set the flag to for the duration.
   * @param body - The assertion to run while it is set.
   */
  const withPasswordProtect = async (gated: boolean, body: () => Promise<void>): Promise<void> => {
    const before = await payload.findGlobal({ slug: 'site', depth: 0, select: { passwordProtect: true } })
    await payload.updateGlobal({ slug: 'site', depth: 0, data: { passwordProtect: gated } })
    try {
      await body()
    } finally {
      await payload.updateGlobal({
        slug: 'site',
        depth: 0,
        data: { passwordProtect: before.passwordProtect ?? false },
      })
    }
  }

  /**
   * A frame whose widest derivative is ADR 0013's `grid` rung.
   *
   * 750px square: wide enough for `thumb` (400) and `grid` (700), too narrow
   * for `tile` (800) and everything above it. Payload skips a size whose
   * target exceeds the source, so this is the only shape that puts `grid` at
   * the head of `DOWNLOAD_TIERS`' preference order.
   * @returns The frame's id and the bytes of both derivatives it carries.
   */
  const aRowWithOnlyTheSmallTiers = async (): Promise<{
    readonly id: string
    readonly gridBytes: Buffer
    readonly thumbBytes: Buffer
  }> => {
    const png = await sharp({ create: { width: 750, height: 750, channels: 3, background: '#4a6b3c' } })
      .png()
      .toBuffer()
    const created = await payload.create({
      collection: 'media',
      data: { journey: journeyId, kind: 'still', alt: 'dl-narrow', caption: 'dl-narrow', state: 'ready', order: 6 },
      file: { data: png, mimetype: 'image/png', name: 'dl-narrow.png', size: png.length },
    })
    ids['dl-narrow'] = String(created.id)
    const store = createLocalStorage(MEDIA_DIR)
    const read = async (filename: string | null | undefined): Promise<Buffer> => {
      const bytes = await store.get(filename ?? '')
      if (!bytes.ok) throw new Error(`the fixture's own derivative is not in the store: ${bytes.error}`)
      return Buffer.from(bytes.value)
    }
    return {
      id: String(created.id),
      gridBytes: await read(created.sizes?.grid?.filename),
      thumbBytes: await read(created.sizes?.thumb?.filename),
    }
  }

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

  it('refuses a frame the pipeline has not finished, whose bytes may be an unstripped original', async () => {
    // THE DOOR THE COLLECTION'S OWN `read` RULE DOES NOT COVER. This reader
    // runs through the Local API with no user, so `Media.access.read` - and
    // with it its `state` clause - never executes; what closes it is
    // `galleryFrames.ts`'s own filter, which this handler shares with the grid
    // and the census (Task 8 fix review, N1).
    const result = await readGalleryDownload('test-download', ids['dl-processing'] ?? '')

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

  it('marks every download uncacheable once the whole book is password protected', async () => {
    // SECURITY.md: "The `password the whole book` setting must gate
    // server-side." A gate the CDN never heard about is a client-side check
    // wearing a server's clothes.
    await withPasswordProtect(true, async () => {
      const attachment = await readGalleryDownload('test-download', aSeededFrameId())

      expect(attachment.ok ? attachment.value.cacheControl : null).toBe('private, no-store')
    })
  })

  it('marks an ungated download cacheable by a shared cache', async () => {
    // DELIBERATELY AFTER THE GATED CASE, which is what makes
    // `withPasswordProtect`'s restore a mechanism rather than a hope: run it
    // first and nothing in this file would notice a `finally` that stopped
    // putting the flag back. Vitest runs `it`s in declaration order, so this
    // case reads the global the case above was responsible for restoring.
    const attachment = await readGalleryDownload('test-download', aSeededFrameId())

    expect(attachment.ok ? attachment.value.cacheControl : null).toBe('public, max-age=3600')
  })

  it('reads the site global exactly once per download, so the header costs no extra round trip', async () => {
    const spy = vi.spyOn(await getPayload(), 'findGlobal')

    await readGalleryDownload('test-download', aSeededFrameId())

    expect(spy.mock.calls).toHaveLength(1)
    expect(spy.mock.calls[0]?.[0]).toMatchObject({ depth: 0, select: { passwordProtect: true } })
    spy.mockRestore()
  })

  it('serves the grid derivative when it is the largest tier a row carries', async () => {
    // ADR 0013's rung is a DOWNLOAD tier as well as a gallery one. Before it
    // joined `DOWNLOAD_TIERS` the handler fell past it to the 400px `thumb`,
    // which answers `ok` too - so `ok` alone would assert nothing here, and
    // the bytes are compared instead.
    const narrow = await aRowWithOnlyTheSmallTiers()

    const attachment = await readGalleryDownload('test-download', narrow.id)

    // The sentinel: two derivatives that happened to be byte-identical would
    // make the assertion below pass whichever one was served.
    expect(narrow.gridBytes.length).not.toBe(narrow.thumbBytes.length)
    expect(attachment.ok ? Buffer.from(attachment.value.bytes) : null).toEqual(narrow.gridBytes)
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
