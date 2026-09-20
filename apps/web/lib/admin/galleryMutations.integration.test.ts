/**
 * galleryMutations.integration.test.ts — behaviour spec for SCREENS.md §2.5's
 * five writes.
 *
 * Integration test (CLAUDE.md §2): every property here is Payload's or
 * Postgres's. Whether a per-row `order` write really becomes the order the
 * PUBLIC gallery reads back, whether `z.coerce.number()` keeps `NaN` out of
 * the driver, and whether a row nobody moved keeps its `updatedAt`, are
 * answers only a real Payload and a real database give.
 *
 * ═══ THE ORDER IS READ BACK THROUGH THE DIARY'S OWN READER ═══
 *
 * The case that matters here does not count `media` rows with a `where`
 * written in this file — it calls `readGalleryBundle`, which is what
 * `/gallery/<slug>` itself renders from. A test that spelled the rule again
 * would agree with itself about a rule the diary does not use, which is the
 * shape `mediaMutations.integration.test.ts` already avoids one module along.
 *
 * ═══ THE SEED IS ASSERTED BEFORE IT IS REVERSED ═══
 *
 * "Reverse the frames and read the reversal back" holds against a write that
 * does NOTHING whenever there are fewer than two frames, because the reversal
 * of a one-element list is that list. So the fixture's own shape is a case:
 * three frames, with three DISTINCT `order` values. The guard is then a
 * property of this file rather than of whatever the fixture happens to
 * contain.
 *
 * Uses `getTestPayload()` rather than `getPayload()` for its own writes, like
 * every integration file here; `readGalleryBundle` opens the same instance.
 * Depends on: vitest, payload (types), sharp (the fixtures' bytes), zod (the
 * refusal cases), @travel-diary/domain/ids, ../readGalleryBundle,
 * ../testPayload, ./adminScope, ./galleryMutations.
 */
import { userId, type UserId } from '@travel-diary/domain/ids'
import type { Payload } from 'payload'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ZodError } from 'zod'
import { readGalleryBundle } from '../readGalleryBundle'
import { getTestPayload } from '../testPayload'
import { adminScope, type AdminScope } from './adminScope'
import {
  MAX_GALLERY_FRAMES,
  applyBulkCaptions,
  setFrameFlags,
  setFrameOrder,
  setFrameText,
  setPosterAt,
} from './galleryMutations'

/** What every row this file writes carries, so cleanup can find them all. */
const MARKER = 'test-gallery-mutations'

/** A password that is not one: this account is never signed in to. */
const NOT_A_PASSWORD = 'not-a-real-password'

/** How many frames the fixture journey holds. Three, so a reversal is not the identity. */
const FIXTURE_FRAMES = 3

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
 * A published journey of this file's own, which the public gallery can read.
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
      place: 'Patagonia',
      slug,
      dates: '2 – 15 March 2025',
      _status: 'published',
    },
  })
  return { id: created.id, slug }
}

/**
 * A ready media row in a journey, with a real derivative behind it.
 * @param journey - The journey it belongs to.
 * @param label - What distinguishes this row; it becomes part of the filename.
 * @param order - The `media.order` column it starts at.
 * @param extra - The clip columns, for the one case that needs them.
 * @returns The media row's id.
 */
const aFrame = async (
  journey: number,
  label: string,
  order: number,
  extra: { readonly kind?: 'still' | 'clip'; readonly durationSec?: number } = {},
): Promise<number> => {
  const png = await sharp({ create: { width: 800, height: 800, channels: 3, background: { r: 7, g: 7, b: 7 } } })
    .png()
    .toBuffer()
  const created = await payload.create({
    collection: 'media',
    ...scope,
    data: {
      journey,
      alt: `${MARKER} ${label}`,
      state: 'ready',
      order,
      kind: extra.kind ?? 'still',
      ...(extra.durationSec === undefined ? {} : { durationSec: extra.durationSec }),
    },
    file: { data: png, mimetype: 'image/png', name: `${MARKER}-${label}-${String(order)}.png`, size: png.length },
  })
  return created.id
}

/**
 * A journey with {@link FIXTURE_FRAMES} frames, arranged 0, 1, 2.
 * @param label - What distinguishes this fixture from the others here.
 * @returns The journey and its frame ids, in the arrangement they start in.
 */
const aGallery = async (
  label: string,
): Promise<{ readonly id: number; readonly slug: string; readonly frames: readonly number[] }> => {
  const journey = await aJourney(label)
  const frames: number[] = []
  for (let index = 0; index < FIXTURE_FRAMES; index += 1) {
    frames.push(await aFrame(journey.id, label, index))
  }
  return { ...journey, frames }
}

/**
 * One media row as Payload holds it now.
 * @param id - The row id.
 * @returns The row.
 */
const readBack = async (id: number): Promise<Record<string, unknown>> =>
  (await payload.findByID({ collection: 'media', ...scope, depth: 0, id })) as unknown as Record<string, unknown>

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

describe('setFrameOrder', () => {
  it('starts from a gallery of three frames with three distinct orders, so a reversal is not the identity', async () => {
    // THE FIXTURE'S OWN SHAPE, ASSERTED. With fewer than two frames the case
    // below would hold against a `setFrameOrder` that wrote nothing at all.
    const seeded = await aGallery('seed-shape')
    const bundle = await readGalleryBundle(seeded.slug)
    const orders = await Promise.all(seeded.frames.map(async (id) => (await readBack(id))['order']))

    expect({
      frames: bundle?.frames.length,
      distinctOrders: new Set(orders).size,
    }).toEqual({ frames: FIXTURE_FRAMES, distinctOrders: FIXTURE_FRAMES })
  })

  it('writes an order the gallery route reads back, so the admin and the diary agree on first', async () => {
    const seeded = await aGallery('round-trip')
    const before = await readGalleryBundle(seeded.slug)
    expect(before?.frames.length).toBe(FIXTURE_FRAMES)
    const reversed = [...(before?.frames ?? [])].reverse().map((frame) => frame.id)

    await setFrameOrder(payload, scope, String(seeded.id), reversed)

    const after = await readGalleryBundle(seeded.slug)

    // Left: the diary's own bundle reader, after the write. Right: the list the
    // action was given. The mapper in between is production code.
    expect(after?.frames.map((frame) => frame.id)).toEqual(reversed)
  })

  it('leaves a frame that did not move untouched, rather than rewriting the whole gallery', async () => {
    // CLAUDE.md §6. A drag of one tile changes the span it crossed; `updatedAt`
    // on a row outside that span is what says so, and it is Postgres's own
    // answer rather than a count this file kept.
    const seeded = await aGallery('narrow-write')
    const [first, second, third] = seeded.frames
    if (first === undefined || second === undefined || third === undefined) throw new Error('fixture')
    const untouched = (await readBack(third))['updatedAt']

    await setFrameOrder(payload, scope, String(seeded.id), [String(second), String(first), String(third)])

    expect({ third: (await readBack(third))['updatedAt'], firstOrder: (await readBack(first))['order'] }).toEqual({
      third: untouched,
      firstOrder: 1,
    })
  })

  it('refuses an arrangement naming a frame that is not in the journey, rather than writing the rest', async () => {
    // Standing orders, species 6: refuse what is not recognised. A partial
    // arrangement written silently is a gallery whose order nobody asked for.
    const seeded = await aGallery('stranger')
    const other = await aGallery('stranger-other')
    const mine = seeded.frames.map(String)
    const strangerId = other.frames[0]
    if (strangerId === undefined) throw new Error('fixture')
    const orderBefore = (await readBack(seeded.frames[0] ?? 0))['order']

    await expect(setFrameOrder(payload, scope, String(seeded.id), [String(strangerId), ...mine])).rejects.toThrow(
      /names 4 of the 3 frames/u,
    )

    expect((await readBack(seeded.frames[0] ?? 0))['order']).toBe(orderBefore)
  })

  it('refuses an arrangement that swaps one of the journey’s frames for a stranger, at the same count', async () => {
    // THE DIRECTION THE TWO COUNTS ALONE CANNOT SEE. A list of the right LENGTH
    // that names a frame from another gallery has the same size as the journey's
    // own set, so only membership catches it — which is what the `some` clause
    // is for, and what the other stranger case (a list one too long) does not
    // reach.
    const seeded = await aGallery('swapped')
    const other = await aGallery('swapped-other')
    const [, second, third] = seeded.frames
    const strangerId = other.frames[0]
    if (second === undefined || third === undefined || strangerId === undefined) throw new Error('fixture')

    await expect(
      setFrameOrder(payload, scope, String(seeded.id), [String(strangerId), String(second), String(third)]),
    ).rejects.toThrow(/names 3 of the 3 frames/u)

    const orders = await Promise.all(seeded.frames.map(async (id) => (await readBack(id))['order']))
    expect(orders).toEqual([0, 1, 2])
  })

  it('refuses an arrangement that names only SOME of the journey’s frames', async () => {
    // MEDIUM-2 (task-9-review.md). "One for one" is a bijection and the check
    // tested one direction of it: a subset finds exactly as many rows as it
    // names, so a three-frame gallery given two ids was ACCEPTED and left
    // `orders [0, 1, 0]` — two frames sharing zero, and `GALLERY_FRAME_SORT`
    // then deciding the public cover by an id tiebreak. Not reachable from the
    // grid, which always sends the whole arrangement; reachable from the Server
    // Action, which is the `POST` endpoint this module parses for.
    const seeded = await aGallery('partial')
    const [first, second, third] = seeded.frames
    if (first === undefined || second === undefined || third === undefined) throw new Error('fixture')

    await expect(setFrameOrder(payload, scope, String(seeded.id), [String(third), String(second)])).rejects.toThrow(
      /names 2 of the 3 frames/u,
    )

    const orders = await Promise.all(seeded.frames.map(async (id) => (await readBack(id))['order']))
    expect(orders).toEqual([0, 1, 2])
  })

  it('arranges a gallery whose journey also holds a decorative scrap, which is not one of its frames', async () => {
    // THE OTHER SIDE OF THE SAME COUNT. The arrangement is checked against the
    // journey's GALLERY FRAMES, not against its `media` rows — so a Notes page's
    // ephemera scrap must not make every arrangement of that journey refuse.
    // This is the case that fails if the count is taken from the wrong set.
    const seeded = await aGallery('with-scrap')
    const scrap = await aFrame(seeded.id, 'scrap', 9)
    await payload.create({
      collection: 'pages',
      ...scope,
      data: {
        journey: seeded.id,
        kind: 'notes',
        title: `${MARKER} with-scrap notes`,
        order: 0,
        layout: 'text-spread',
        slots: [{ role: 'ephemera' as const, media: scrap }],
        _status: 'published',
      },
    })
    const reversed = [...seeded.frames].reverse().map(String)

    await setFrameOrder(payload, scope, String(seeded.id), reversed)

    const orders = await Promise.all(seeded.frames.map(async (id) => (await readBack(id))['order']))
    expect(orders).toEqual([2, 1, 0])
  })

  it('refuses an arrangement that names the same frame twice', async () => {
    const seeded = await aGallery('repeat')
    const first = seeded.frames[0]
    if (first === undefined) throw new Error('fixture')

    await expect(setFrameOrder(payload, scope, String(seeded.id), [String(first), String(first)])).rejects.toThrow(
      /lists 2 ids but only 1 distinct frames/u,
    )
  })

  it('refuses a list of no frames at all, which is a write with no subject', async () => {
    await expect(setFrameOrder(payload, scope, '1', [])).rejects.toBeInstanceOf(ZodError)
  })

  it('accepts an arrangement of exactly the largest list it allows', async () => {
    // THE LAST ACCEPTED VALUE. Built from the constant, so the boundary follows
    // it wherever it is moved. The ids are strangers, so this stops at the
    // journey check rather than at the cap — which is the point: the parse let
    // it through.
    const list = Array.from({ length: MAX_GALLERY_FRAMES }, (_unused, index) => String(index + 1))

    await expect(setFrameOrder(payload, scope, '1', list)).rejects.not.toBeInstanceOf(ZodError)
  })

  it('refuses the first list longer than it allows', async () => {
    // THE FIRST REFUSED VALUE, from the same constant.
    const list = Array.from({ length: MAX_GALLERY_FRAMES + 1 }, (_unused, index) => String(index + 1))

    await expect(setFrameOrder(payload, scope, '1', list)).rejects.toBeInstanceOf(ZodError)
  })

  it('refuses a frame id that is not a number, rather than letting NaN reach the driver', async () => {
    await expect(setFrameOrder(payload, scope, '1', ['nonsense'])).rejects.toBeInstanceOf(ZodError)
  })

  it('refuses a journey that is not a number', async () => {
    await expect(setFrameOrder(payload, scope, 'nonsense', ['1'])).rejects.toBeInstanceOf(ZodError)
  })
})

describe('setFrameText', () => {
  it('writes the caption the public gallery prints and the alt a reader hears', async () => {
    const seeded = await aGallery('text')
    const frame = seeded.frames[0]
    if (frame === undefined) throw new Error('fixture')

    await setFrameText(payload, scope, String(frame), 'The last morning', 'A quiet street at dawn')

    const bundle = await readGalleryBundle(seeded.slug)
    const written = bundle?.frames.find((row) => String(row.id) === String(frame))

    expect({ caption: written?.caption, alt: written?.alt }).toEqual({
      caption: 'The last morning',
      alt: 'A quiet street at dawn',
    })
  })

  it('clears a caption when the author empties the field, which is a thing an author can want', async () => {
    const seeded = await aGallery('clear-text')
    const frame = seeded.frames[0]
    if (frame === undefined) throw new Error('fixture')
    await setFrameText(payload, scope, String(frame), 'Something', 'Something')

    await setFrameText(payload, scope, String(frame), '', '')

    expect((await readBack(frame))['caption']).toBe('')
  })

  it('refuses a frame id that is not a number', async () => {
    await expect(setFrameText(payload, scope, 'nonsense', '', '')).rejects.toBeInstanceOf(ZodError)
  })
})

describe('setFrameFlags', () => {
  it('takes a hidden frame out of the public gallery and puts it back', async () => {
    // THE SECURITY-RELEVANT HALF, through the diary's own reader: `hidden` is
    // what `galleryFrameWhere` excludes for every public caller, and this
    // screen is the only one that can set or clear it.
    const seeded = await aGallery('hidden')
    const frame = seeded.frames[0]
    if (frame === undefined) throw new Error('fixture')

    await setFrameFlags(payload, scope, String(frame), { hidden: true, inBook: false })
    const withheld = await readGalleryBundle(seeded.slug)

    await setFrameFlags(payload, scope, String(frame), { hidden: false, inBook: true })
    const restored = await readGalleryBundle(seeded.slug)

    expect({
      withheld: withheld?.frames.length,
      restored: restored?.frames.length,
      inBook: (await readBack(frame))['inBook'],
    }).toEqual({ withheld: FIXTURE_FRAMES - 1, restored: FIXTURE_FRAMES, inBook: true })
  })

  it('refuses a toggle that is not a boolean, which no panel can send and a POST can', async () => {
    const seeded = await aGallery('flags-refusal')
    const frame = seeded.frames[0]
    if (frame === undefined) throw new Error('fixture')

    await expect(
      setFrameFlags(payload, scope, String(frame), { hidden: 'yes', inBook: false } as unknown as {
        hidden: boolean
        inBook: boolean
      }),
    ).rejects.toBeInstanceOf(ZodError)
  })
})

describe('setPosterAt', () => {
  it('writes a clip’s poster timestamp, which nothing in this repository wrote before', async () => {
    // THE CLIP HALF OF §2.5 CANNOT BE PRODUCED BY THE UPLOAD PATH ON THIS
    // MACHINE: `MEDIA_PIPELINE=worker` is refused at boot because `ffmpeg` and
    // `ffprobe` are absent, so the row is written with `kind: 'clip'` directly.
    // What that leaves unproven is the PIPELINE, not this column.
    const seeded = await aGallery('poster')
    const clip = await aFrame(seeded.id, 'poster-clip', 9, { kind: 'clip', durationSec: 24 })

    await setPosterAt(payload, scope, String(clip), 11)

    expect((await readBack(clip))['posterAt']).toBe(11)
  })

  it('clears the poster back to the first frame', async () => {
    const seeded = await aGallery('poster-clear')
    const clip = await aFrame(seeded.id, 'poster-clear-clip', 9, { kind: 'clip', durationSec: 24 })
    await setPosterAt(payload, scope, String(clip), 11)

    await setPosterAt(payload, scope, String(clip), null)

    expect((await readBack(clip))['posterAt']).toBeNull()
  })

  it('accepts a poster at the very start of the clip', async () => {
    // THE LAST ACCEPTED VALUE on the low side of the bound.
    const seeded = await aGallery('poster-zero')
    const clip = await aFrame(seeded.id, 'poster-zero-clip', 9, { kind: 'clip', durationSec: 24 })

    await setPosterAt(payload, scope, String(clip), 0)

    expect((await readBack(clip))['posterAt']).toBe(0)
  })

  it('refuses a poster before the start of the clip', async () => {
    // THE FIRST REFUSED VALUE. A negative second is not a frame of anything.
    await expect(setPosterAt(payload, scope, '1', -1)).rejects.toBeInstanceOf(ZodError)
  })

  it('refuses a poster that is not a finite number', async () => {
    await expect(setPosterAt(payload, scope, '1', Number.POSITIVE_INFINITY)).rejects.toBeInstanceOf(ZodError)
  })
})

describe('applyBulkCaptions', () => {
  it('writes one caption per frame, which is what a panel of separate inputs means', async () => {
    const seeded = await aGallery('bulk')
    const [first, second] = seeded.frames
    if (first === undefined || second === undefined) throw new Error('fixture')

    await applyBulkCaptions(payload, scope, [
      { id: String(first), caption: 'Dawn over the lake' },
      { id: String(second), caption: 'The road out' },
    ])

    expect([(await readBack(first))['caption'], (await readBack(second))['caption']]).toEqual([
      'Dawn over the lake',
      'The road out',
    ])
  })

  it('leaves a row the author never filled in alone, so nothing is cleared by submitting the panel', async () => {
    // §2.5: "Anything left empty keeps its file name for now." The inputs are
    // placeholder-hinted rather than pre-filled, so an untouched row arrives
    // empty — and writing `''` to it would clear a caption the author never
    // looked at.
    const seeded = await aGallery('bulk-blank')
    const [first, second] = seeded.frames
    if (first === undefined || second === undefined) throw new Error('fixture')
    await setFrameText(payload, scope, String(second), 'Kept', 'Kept')

    await applyBulkCaptions(payload, scope, [
      { id: String(first), caption: 'Written' },
      { id: String(second), caption: '   ' },
    ])

    expect([(await readBack(first))['caption'], (await readBack(second))['caption']]).toEqual(['Written', 'Kept'])
  })

  it('refuses a panel with no rows at all', async () => {
    await expect(applyBulkCaptions(payload, scope, [])).rejects.toBeInstanceOf(ZodError)
  })

  it('accepts exactly the largest panel it allows', async () => {
    // THE LAST ACCEPTED VALUE, built from the constant. Every caption is blank,
    // so the parse is what this case is about and nothing is written.
    const rows = Array.from({ length: MAX_GALLERY_FRAMES }, (_unused, index) => ({
      id: String(index + 1),
      caption: '',
    }))

    await expect(applyBulkCaptions(payload, scope, rows)).resolves.toBeUndefined()
  })

  it('refuses the first panel longer than it allows', async () => {
    const rows = Array.from({ length: MAX_GALLERY_FRAMES + 1 }, (_unused, index) => ({
      id: String(index + 1),
      caption: '',
    }))

    await expect(applyBulkCaptions(payload, scope, rows)).rejects.toBeInstanceOf(ZodError)
  })

  it('refuses a row whose id is not a number', async () => {
    await expect(applyBulkCaptions(payload, scope, [{ id: 'nonsense', caption: 'x' }])).rejects.toBeInstanceOf(ZodError)
  })
})
