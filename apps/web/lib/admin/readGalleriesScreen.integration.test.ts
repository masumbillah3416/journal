/**
 * readGalleriesScreen.integration.test.ts — behaviour spec for everything
 * SCREENS.md §2.5 draws, in a fixed number of queries.
 *
 * Integration test (CLAUDE.md §2): every property here is Payload's or
 * Postgres's. Whether the diary's own `where` and sort really produce the same
 * arrangement on the admin's grid as under `/gallery/<slug>`, whether a slot's
 * `media` comes back as an id or a document at `depth: 0`, whether a small
 * upload has a `thumb` derivative at all, and — the one CLAUDE.md §6 gates —
 * whether the screen costs a fixed number of queries or one per journey, are
 * answers only a real Payload and a real database give.
 *
 * ═══ THE ARRANGEMENT IS COMPARED AGAINST THE DIARY'S OWN READER ═══
 *
 * The case that says the admin and the diary agree on "first" does not spell
 * the sort again — it reads the same journey through `readGalleryBundle`,
 * which is what `/gallery/<slug>` renders from, and compares the two lists.
 * A test that re-derived the order would agree with itself about a rule the
 * diary does not use.
 *
 * ═══ THE ONE PLACE THE TWO READERS DELIBERATELY DISAGREE ═══
 *
 * A hidden frame. §2.5 draws a "Hidden" chip on it and the toggle that puts it
 * back, so this screen has to list what every public caller withholds. Both
 * sides are asserted in the same case, because the value of the decision is
 * the difference rather than either half.
 *
 * ═══ THIS SCREEN READS EVERY JOURNEY, SO THE ASSERTIONS ARE SCOPED TO THE
 *     FIXTURE ═══
 *
 * `diary_test` is shared by every integration file and the seed writes ten
 * journeys into it, so a case asserting on the whole select would be asserting
 * about other files' rows. Every case here picks its own journey out of the
 * result by id.
 *
 * Uses `getTestPayload()` rather than `getPayload()`, like every integration
 * file here.
 * Depends on: vitest, payload (types), sharp (the fixtures' bytes),
 * @travel-diary/domain/ids, ../readGalleryBundle, ../testPayload, ./adminScope,
 * ./readGalleriesScreen.
 */
import { journeyId, type JourneyId, type UserId, userId } from '@travel-diary/domain/ids'
import type { Payload } from 'payload'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { readGalleryBundle } from '../readGalleryBundle'
import { getTestPayload } from '../testPayload'
import { adminScope, type AdminScope } from './adminScope'
import { readGalleriesScreen, type GalleriesView } from './readGalleriesScreen'

/** What every row this file writes carries, so cleanup can find them all. */
const MARKER = 'test-galleries-screen'

/** A password that is not one: this account is never signed in to. */
const NOT_A_PASSWORD = 'not-a-real-password'

/**
 * How many questions the screen asks, whatever the size of the diary.
 *
 * THREE: the journeys the select offers, the pages that name the decorative
 * scraps, and every gallery frame in the diary. Each is one query over the
 * whole collection, not one per journey.
 */
const QUERIES_PER_READ = 3

let payload: Payload
let scope: AdminScope

/**
 * A branded account id for a row id.
 * @param raw - The id as a session would spell it.
 * @returns The branded id.
 */
const anAccount = (raw: string): UserId => {
  const built = userId(raw)
  if (!built.ok) throw new Error(built.error)
  return built.value
}

/**
 * A branded journey id for a row id.
 * @param raw - The id as Postgres spells it.
 * @returns The branded id.
 */
const aJourneyId = (raw: number): JourneyId => {
  const built = journeyId(String(raw))
  if (!built.ok) throw new Error(built.error)
  return built.value
}

/** Removes every row this file has ever written. */
const clean = async (): Promise<void> => {
  const journeys = await payload.find({
    collection: 'journeys',
    where: { slug: { like: MARKER } },
    pagination: false,
    depth: 0,
  })
  for (const journey of journeys.docs) {
    await payload.delete({ collection: 'pages', where: { journey: { equals: journey.id } } })
    await payload.delete({ collection: 'media', where: { journey: { equals: journey.id } } })
  }
  await payload.delete({ collection: 'journeys', where: { slug: { like: MARKER } } })
  await payload.delete({ collection: 'users', where: { email: { like: MARKER } } })
}

/**
 * A published journey of this file's own.
 * @param label - What distinguishes this journey's slug from the others'.
 * @returns The journey's row id and slug.
 */
const aJourney = async (label: string): Promise<{ readonly id: number; readonly slug: string }> => {
  const slug = `${MARKER}-${label}`
  const created = await payload.create({
    collection: 'journeys',
    ...scope,
    data: {
      name: `${MARKER} ${label}`,
      place: 'Iceland',
      slug,
      dates: '8 – 19 May 2025',
      _status: 'published',
    },
  })
  return { id: created.id, slug }
}

/**
 * A media row with a real derivative behind it.
 *
 * 800px square by default, which is wide enough for the `thumb` tier Payload
 * configures — so a case asking about `thumbSrc` is asking about a derivative
 * that exists rather than about a fallback.
 * @param journey - The journey it belongs to.
 * @param label - What distinguishes this row; it becomes part of the filename.
 * @param fields - The columns a case cares about.
 * @returns The media row's id.
 */
const aFrame = async (
  journey: number,
  label: string,
  fields: {
    readonly order?: number | null
    readonly hidden?: boolean
    readonly state?: 'processing' | 'ready' | 'failed'
    readonly capturedAt?: string
    readonly caption?: string
    readonly size?: number
    /** `null` for a row nobody has described — which is every upload until an author does. */
    readonly alt?: string | null
    readonly kind?: 'still' | 'clip'
    readonly durationSec?: number
  } = {},
): Promise<number> => {
  const size = fields.size ?? 800
  const png = await sharp({ create: { width: size, height: size, channels: 3, background: { r: 6, g: 6, b: 6 } } })
    .png()
    .toBuffer()
  const created = await payload.create({
    collection: 'media',
    ...scope,
    data: {
      journey,
      alt: fields.alt === undefined ? `${MARKER} ${label}` : fields.alt,
      state: fields.state ?? 'ready',
      order: fields.order === undefined ? 0 : fields.order,
      hidden: fields.hidden ?? false,
      kind: fields.kind ?? 'still',
      ...(fields.durationSec === undefined ? {} : { durationSec: fields.durationSec }),
      ...(fields.capturedAt === undefined ? {} : { capturedAt: fields.capturedAt }),
      ...(fields.caption === undefined ? {} : { caption: fields.caption }),
    },
    file: { data: png, mimetype: 'image/png', name: `${MARKER}-${label}.png`, size: png.length },
  })
  return created.id
}

/**
 * A page whose one slot prints the given media as the decorative scrap.
 * @param journey - The journey the page belongs to.
 * @param label - What distinguishes this page.
 * @param scrap - The media row the Notes page prints as ephemera.
 */
const aNotesPageWithScrap = async (journey: number, label: string, scrap: number): Promise<void> => {
  await payload.create({
    collection: 'pages',
    ...scope,
    data: {
      journey,
      kind: 'notes',
      title: `${MARKER} ${label}`,
      order: 0,
      layout: 'text-spread',
      slots: [{ role: 'ephemera' as const, media: scrap }],
      _status: 'published',
    },
  })
}

/**
 * The screen, read for one journey.
 * @param journey - The journey's row id, or `null` for the default.
 * @returns The view.
 */
const read = async (journey: number | null): Promise<GalleriesView> =>
  readGalleriesScreen(payload, scope, journey === null ? null : aJourneyId(journey))

beforeAll(async () => {
  payload = await getTestPayload()
  const account = await payload.create({
    collection: 'users',
    data: { email: `${MARKER}@example.test`, password: NOT_A_PASSWORD },
  })
  scope = await adminScope({ user: anAccount(String(account.id)) })
  await clean()
})

afterAll(async () => {
  await clean()
})

describe('readGalleriesScreen', () => {
  it('draws the journey’s frames in the order the public gallery reads them', async () => {
    // THE DIARY'S OWN READER ON THE RIGHT. `GALLERY_FRAME_SORT` is `order`
    // then `id`, and both readers take it from `../galleryFrames` — this is
    // what makes "the first frame is the gallery cover" one sentence about two
    // screens rather than two sentences that happen to agree.
    const journey = await aJourney('order')
    await aFrame(journey.id, 'order-c', { order: 2 })
    await aFrame(journey.id, 'order-a', { order: 0 })
    await aFrame(journey.id, 'order-b', { order: 1 })

    const view = await read(journey.id)
    const bundle = await readGalleryBundle(journey.slug)

    expect(view.frames.map((frame) => frame.id)).toEqual(bundle?.frames.map((frame) => frame.id))
  })

  it('lists a hidden frame that every public reader withholds, because this is the screen that can unhide it', async () => {
    // BOTH SIDES IN ONE CASE, because the value of the decision is the
    // difference. `galleryFrameWhere`'s `hidden` clause is a security
    // requirement for the three public callers (SECURITY.md); §2.5 draws the
    // chip and the toggle that clears it.
    const journey = await aJourney('hidden')
    await aFrame(journey.id, 'hidden-visible', { order: 0 })
    await aFrame(journey.id, 'hidden-withheld', { order: 1, hidden: true })

    const view = await read(journey.id)
    const bundle = await readGalleryBundle(journey.slug)

    expect({
      admin: view.frames.length,
      adminHidden: view.frames.filter((frame) => frame.hidden).length,
      diary: bundle?.frames.length,
    }).toEqual({ admin: 2, adminHidden: 1, diary: 1 })
  })

  it('still withholds the decorative scrap, which is not a gallery frame for anybody', async () => {
    const journey = await aJourney('scrap')
    await aFrame(journey.id, 'scrap-frame', { order: 0 })
    const scrap = await aFrame(journey.id, 'scrap-texture', { order: 1 })
    await aNotesPageWithScrap(journey.id, 'scrap-notes', scrap)

    const view = await read(journey.id)

    expect(view.frames.map((frame) => frame.filename)).toEqual([`${MARKER}-scrap-frame.png`])
  })

  it('still withholds a row the pipeline has not finished, which has no derivative to draw', async () => {
    const journey = await aJourney('unfinished')
    await aFrame(journey.id, 'unfinished-ready', { order: 0 })
    await aFrame(journey.id, 'unfinished-processing', { order: 1, state: 'processing' })

    const view = await read(journey.id)

    expect(view.frames.map((frame) => frame.filename)).toEqual([`${MARKER}-unfinished-ready.png`])
  })

  it('counts each journey’s frames by the same rule the grid draws, not by its media rows', async () => {
    // "{name} — {n} frames". A count of `media` rows would include the scrap
    // and everything the pipeline has not finished, so the number beside the
    // name would not be the number of tiles.
    const journey = await aJourney('count')
    await aFrame(journey.id, 'count-one', { order: 0 })
    await aFrame(journey.id, 'count-two', { order: 1 })
    const scrap = await aFrame(journey.id, 'count-scrap', { order: 2 })
    await aNotesPageWithScrap(journey.id, 'count-notes', scrap)
    await aFrame(journey.id, 'count-unfinished', { order: 3, state: 'failed' })

    const view = await read(journey.id)
    const rows = await payload.count({ collection: 'media', where: { journey: { equals: journey.id } } })

    expect({
      offered: view.journeys.find((choice) => choice.id === aJourneyId(journey.id))?.frames,
      mediaRows: rows.totalDocs,
    }).toEqual({ offered: 2, mediaRows: 4 })
  })

  it('offers a journey with no frames at all, rather than dropping it out of the select', async () => {
    const journey = await aJourney('empty')

    const view = await read(journey.id)

    expect({
      frames: view.frames,
      offered: view.journeys.find((choice) => choice.id === aJourneyId(journey.id))?.frames,
      selected: view.journey,
    }).toEqual({ frames: [], offered: 0, selected: aJourneyId(journey.id) })
  })

  it('falls back to the first journey when the address names one that is not there', async () => {
    // `?journey=999999` is an address anybody can type, and a trashed journey
    // is one anybody can still have bookmarked. A 500 for either is worse than
    // the default grid.
    const view = await readGalleriesScreen(payload, scope, aJourneyId(999_999))

    expect({ selected: view.journey, isFirst: view.journey === view.journeys[0]?.id }).toEqual({
      selected: view.journeys[0]?.id,
      isFirst: true,
    })
  })

  it('takes the first journey when the address names none at all', async () => {
    const view = await read(null)

    expect(view.journey).toBe(view.journeys[0]?.id)
  })

  it('does not offer a trashed journey, which has no gallery to arrange', async () => {
    const journey = await aJourney('trashed')
    await payload.update({
      collection: 'journeys',
      ...scope,
      id: journey.id,
      data: { deletedAt: new Date().toISOString() },
    })

    const view = await read(null)

    expect(view.journeys.filter((choice) => choice.id === aJourneyId(journey.id))).toEqual([])
  })

  it('answers no thumbnail for an upload too small for the tier, rather than falling back to the original', async () => {
    // CLAUDE.md §6: always a derivative tier, never an original. A 120px
    // upload has no `thumb`, and answering `null` is what keeps the original
    // off a grid of 136px tiles.
    const journey = await aJourney('tiny')
    await aFrame(journey.id, 'tiny-one', { order: 0, size: 120 })

    const view = await read(journey.id)

    expect(view.frames.map((frame) => ({ thumb: frame.thumbSrc, preview: frame.previewSrc }))).toEqual([
      { thumb: null, preview: `/api/media/file/${MARKER}-tiny-one-120x120.png` },
    ])
  })

  it('hands the panel every column its file line and its fields print', async () => {
    // WHAT PRODUCED THIS SHAPE: an 800px PNG uploaded through Payload, so
    // `width`, `height` and `filesize` are what Payload measured rather than
    // what this file wrote down.
    const journey = await aJourney('columns')
    await aFrame(journey.id, 'columns-one', { order: 0, capturedAt: '2025-03-01T09:00:00.000Z', caption: 'Dawn' })

    const [frame] = (await read(journey.id)).frames

    expect({
      width: frame?.width,
      height: frame?.height,
      hasSize: (frame?.filesize ?? 0) > 0,
      caption: frame?.caption,
      capturedAt: frame?.capturedAt?.slice(0, 10),
      kind: frame?.kind,
      posterAt: frame?.posterAt,
      durationSec: frame?.durationSec,
      order: frame?.order,
    }).toEqual({
      width: 800,
      height: 800,
      hasSize: true,
      caption: 'Dawn',
      capturedAt: '2025-03-01',
      kind: 'still',
      posterAt: null,
      durationSec: null,
      order: 0,
    })
  })

  it('answers the panel’s empty defaults for a frame nobody has described, captioned, dated or arranged', async () => {
    // WHAT PRODUCES THIS SHAPE: an upload the author has not opened yet.
    // `alt`, `caption`, `capturedAt` (no EXIF) and `order` are all null in the
    // row Payload wrote, and the panel has to draw something for each.
    const journey = await aJourney('bare')
    await aFrame(journey.id, 'bare-one', { order: null, alt: null })

    const [frame] = (await read(journey.id)).frames

    expect({
      alt: frame?.alt,
      caption: frame?.caption,
      capturedAt: frame?.capturedAt,
      order: frame?.order,
    }).toEqual({ alt: '', caption: '', capturedAt: null, order: 0 })
  })

  it('answers no preview at all for a row with no image derivative, which is what a clip is', async () => {
    // WHAT PRODUCES THIS SHAPE: a row whose stored bytes are not an image, so
    // Payload's resizing produces no tier at all — which is exactly a clip.
    // The clip PIPELINE cannot run on this machine (`MEDIA_PIPELINE=worker` is
    // refused at boot without `ffmpeg`/`ffprobe`), so the bytes are written
    // directly; what that leaves unproven is the pipeline, not this arm.
    const journey = await aJourney('no-derivative')
    const bytes = Buffer.concat([
      Buffer.from([0, 0, 0, 0x18]),
      Buffer.from('ftypmp42'),
      Buffer.from([0, 0, 0, 0]),
      Buffer.from('mp42isom'),
    ])
    await payload.create({
      collection: 'media',
      ...scope,
      data: { journey: journey.id, alt: `${MARKER} clipish`, state: 'ready', order: 0, kind: 'clip', durationSec: 24 },
      file: { data: bytes, mimetype: 'video/mp4', name: `${MARKER}-no-derivative.mp4`, size: bytes.length },
    })

    const [frame] = (await read(journey.id)).frames

    expect({ thumb: frame?.thumbSrc, preview: frame?.previewSrc }).toEqual({ thumb: null, preview: null })
  })

  it('reports a clip as a clip, with the length §2.5’s filmstrip divides', async () => {
    // THE CLIP HALF CANNOT COME FROM THE UPLOAD PATH ON THIS MACHINE:
    // `MEDIA_PIPELINE=worker` is refused at boot because `ffmpeg`/`ffprobe` are
    // absent, so the row is written with `kind: 'clip'` directly. What that
    // leaves unproven is the PIPELINE, not this read — and under CLAUDE.md
    // §7.1 that is UNRESOLVED rather than routed anywhere else.
    const journey = await aJourney('clip')
    await aFrame(journey.id, 'clip-one', { order: 0, kind: 'clip', durationSec: 24 })

    const [frame] = (await read(journey.id)).frames

    expect({ kind: frame?.kind, durationSec: frame?.durationSec }).toEqual({ kind: 'clip', durationSec: 24 })
  })

  it(`costs ${String(QUERIES_PER_READ)} queries whatever the size of the diary (no N+1)`, async () => {
    // CLAUDE.md §6. The obvious spelling of "{n} frames" beside each option is
    // a `count` per journey, and a ten-journey seed would never make that
    // visible. The reading is taken again below with another journey in the
    // diary.
    const journey = await aJourney('queries')
    await aFrame(journey.id, 'queries-one', { order: 0 })
    const findSpy = vi.spyOn(payload, 'find')

    await read(journey.id)
    const first = findSpy.mock.calls.length

    const second = await aJourney('queries-two')
    await aFrame(second.id, 'queries-two-one', { order: 0 })
    findSpy.mockClear()
    await read(journey.id)

    expect({ first, afterAnotherJourney: findSpy.mock.calls.length }).toEqual({
      first: QUERIES_PER_READ,
      afterAnotherJourney: QUERIES_PER_READ,
    })

    findSpy.mockRestore()
  })

  it('sets depth explicitly on every query, so no default walks the relationship graph', async () => {
    // CLAUDE.md §7. A relationship resolved to a whole document is the wire
    // cost nobody asked for, and `rowIdOf` above assumes it never happens.
    const findSpy = vi.spyOn(payload, 'find')

    await read(null)

    expect(findSpy.mock.calls.length).toBeGreaterThan(0)
    for (const call of findSpy.mock.calls) expect(call[0]).toHaveProperty('depth', 0)

    findSpy.mockRestore()
  })
})
