/**
 * slotMutations.integration.test.ts — what SCREENS.md §2.3's photo slots do to
 * the database, and the one property the phase's second exit criterion rests on.
 *
 * ═══ THE PROPERTY: A FOCAL POINT SET HERE MOVES THE CROP THE DIARY RENDERS ═══
 *
 * Design spec §5.2: "If this is not wired through to rendering, the admin
 * control is decorative. It is a Phase 4 exit criterion for exactly that
 * reason." The last case in this file is the DATA half of that — two reads of
 * `readBookBundle`, the production mapper, around one call — and Task 15 is the
 * pixel half. Nothing in it asserts a literal that the action was also given:
 * the two sides of `expect(beforeSlot).not.toEqual(afterSlot)` are the same
 * mapper against the same database, before and after.
 *
 * ═══ AND IT IS A LIVE-ROW WRITE ON A VERSIONED COLLECTION ═══
 *
 * `pages` carries `versions: { drafts: true }`, and Payload's `updateByID`
 * merges into the NEWEST VERSION whatever `draft` says (`updateByID.js:79`).
 * Phase 4 Task 4 paid two review rounds for that on `journeys`. The slot writes
 * are structural — §2.3's slot controls have no Save of their own, and the
 * public book reads `pages.slots` off the `pages` table — so they go through
 * `pageMutations.ts`'s `writePageFields`, and BOTH directions are asserted:
 *
 *   - THE LIVE ROW TAKES THE WRITE AND KEEPS ITS `_status`. A slot control that
 *     published a page the author had not finished is Task 4's defect again.
 *   - THE PENDING DRAFT'S OWN SLOTS SURVIVE. `slots` is an ARRAY, and the
 *     live row's and the draft's can differ — which is why `writePageFields`
 *     takes a function of the document rather than one literal for both sides.
 *
 * WHAT PRODUCED EACH SIDE: the live row is read with a plain `findByID`, which
 * reads the `pages` table; the pending draft with `draft: true`, which reads
 * `_pages_v`. Two tables, two statements.
 *
 * Uses `getTestPayload()` rather than `getPayload()`, like every integration
 * file here, so these rows land in the isolated `diary_test` database — and
 * `readBookBundle` reaches the same database.
 *
 * Every row it writes carries {@link MARKER} in its slug, alt or email and is
 * deleted before and after the run: before, because a previous crashed run
 * would otherwise collide with the unique index on `slug`.
 *
 * Depends on: vitest, node:buffer, sharp, payload (types),
 * @travel-diary/domain/admin/pageSlots, @travel-diary/domain/bookBundle,
 * @travel-diary/domain/ids, ../readBookBundle, ../testPayload, ./adminScope,
 * ./slotMutations.
 */
import { HIGHEST_SLOT_CELL } from '@travel-diary/domain/admin/pageSlots'
import type { JourneyPage, Slot } from '@travel-diary/domain/bookBundle'
import { journeyId, userId, type UserId } from '@travel-diary/domain/ids'
import type { Payload } from 'payload'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from '../../payload-types'
import { readBookBundle } from '../readBookBundle'
import { getTestPayload } from '../testPayload'
import { adminScope, type AdminScope } from './adminScope'
import {
  clearSlotRow,
  readSlotMedia,
  readSlotPoint,
  readSlotRef,
  readSlotText,
  setSlotFocalRow,
  setSlotMediaRow,
  setSlotTextRow,
} from './slotMutations'

/** What every row this file writes carries, so cleanup can find them all. */
const MARKER = 'test-slot-mutations'

/** A password that is not one: this account is never signed in to. */
const NOT_A_PASSWORD = 'not-a-real-password'

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
 * The `FormData` a slot control's own form posts.
 *
 * FORM DATA, NOT AN OBJECT LITERAL: the only thing that ever calls these parses
 * is a `<form action={…}>`, so an object fixture would be a shape no client
 * produces (standing orders, species 4). `slot` carries the branded
 * `${page}:${cell}` key the pane renders, which is the one field naming the
 * target — see `slotMutations.ts`'s header.
 * @param fields - Overrides for the control's own values.
 * @returns The form body.
 */
const aSlotForm = (fields: Readonly<Record<string, string>> = {}): FormData => {
  const form = new FormData()
  const all: Record<string, string> = {
    journey: '1',
    slot: '7:2',
    media: '11',
    focalX: '12',
    focalY: '87',
    caption: 'The bridge, from below',
    alt: 'An iron bridge seen from the river path',
    ...fields,
  }
  for (const [name, value] of Object.entries(all)) form.append(name, value)
  return form
}

/** Removes every row this file has ever written. */
const clean = async (): Promise<void> => {
  await payload.delete({ collection: 'journeys', where: { slug: { like: MARKER } } })
  await payload.delete({ collection: 'media', where: { alt: { like: MARKER } } })
  await payload.delete({ collection: 'users', where: { email: { like: MARKER } } })
}

/**
 * A photograph the public diary would serve.
 *
 * `state: 'ready'` IS THE FIXTURE'S POINT, not boilerplate. The column defaults
 * to `'processing'`, and `readBookBundle`'s slot fallback answers `src: null`
 * for a row whose bytes are withheld — so a fixture that took the default would
 * be a photograph the book cannot draw, and every case below would pass against
 * an empty frame.
 * @param label - What distinguishes this row's alt text from the others'.
 * @returns The media row id.
 */
const aPhotograph = async (label: string): Promise<number> => {
  const png = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: '#3d817e' } })
    .png()
    .toBuffer()
  const created = await payload.create({
    collection: 'media',
    ...scope,
    data: { kind: 'still', alt: `${MARKER} ${label}`, order: 0, state: 'ready' },
    file: { data: png, mimetype: 'image/png', name: `${MARKER}-${label}.png`, size: png.length },
  })
  return created.id
}

/**
 * A published journey with one published frames page.
 *
 * PUBLISHED, because `readBookBundle` partitions the pages query by `_status`
 * and gives the faces the published rows only — a draft fixture would make
 * every bundle assertion below pass against a page nobody can see.
 * @param label - What distinguishes this journey's slug from the others'.
 * @returns The journey's and the frames page's row ids.
 */
const aPublishedFramesPage = async (label: string): Promise<{ journey: number; page: number }> => {
  const journey = await payload.create({
    collection: 'journeys',
    ...scope,
    data: {
      name: `${MARKER} ${label}`,
      place: 'Portugal',
      slug: `${MARKER}-${label}`,
      dates: '28 Oct – 6 Nov 2025',
      startsOn: '2025-10-28T00:00:00.000Z',
      _status: 'published',
    },
  })
  // A notes page first, because `groupPagesByJourneyAndKind` gives `frames-i`
  // to the journey's first `kind: 'frames'` row by `order` — this one.
  await payload.create({
    collection: 'pages',
    ...scope,
    data: { journey: journey.id, kind: 'notes', title: 'Notes', order: 0, _status: 'published' },
  })
  const page = await payload.create({
    collection: 'pages',
    ...scope,
    data: { journey: journey.id, kind: 'frames', title: 'Frames I', order: 1, _status: 'published' },
  })
  return { journey: journey.id, page: page.id }
}

/**
 * One cell of a journey's Frames I page, as the public book renders it.
 *
 * KEYED ON THE JOURNEY'S ROW ID. `BookPage` is a union, so the lookup narrows
 * on `kind` first; it must not then reach for the slug, because the editor lets
 * the author rewrite it (`notesMutations.integration.test.ts` re-keyed its own
 * helper for that reason).
 * @param journey - The journey's row id.
 * @param cell - Which slot.
 * @returns The slot, or `undefined` when the book does not hold it.
 */
const slotOf = async (journey: number, cell: number): Promise<Slot | undefined> => {
  const bundle = await readBookBundle()
  const branded = journeyId(String(journey))
  if (!branded.ok) throw new Error(branded.error)
  const page = bundle.pages.find(
    (candidate): candidate is JourneyPage => candidate.kind === 'frames-i' && candidate.journeyId === branded.value,
  )
  return page?.slots?.[cell]
}

/**
 * The page as the public book reads it — the `pages` table row.
 * @param page - The row id.
 * @returns The live row.
 */
const liveRow = async (page: number): Promise<Page> =>
  payload.findByID({ collection: 'pages', id: page, ...scope, depth: 0 })

/**
 * The page as the editor reads it — the newest row of `_pages_v`.
 * @param page - The row id.
 * @returns The newest version.
 */
const newestVersion = async (page: number): Promise<Page> =>
  payload.findByID({ collection: 'pages', id: page, ...scope, depth: 0, draft: true })

beforeAll(async () => {
  payload = await getTestPayload()
  const account = await payload.create({
    collection: 'users',
    data: { email: `${MARKER}@example.test`, password: NOT_A_PASSWORD },
  })
  scope = await adminScope({ user: anAccount(String(account.id)) })
  await clean()
}, 180_000)

afterAll(async () => {
  await clean()
})

describe('the slot parses', () => {
  it('reads the target a tile posts as one key, so page and cell cannot disagree', () => {
    expect(readSlotMedia(aSlotForm())).toEqual({ journey: 1, page: 7, cell: 2, media: 11 })
  })

  it('reads the point a focal click posts', () => {
    expect(readSlotPoint(aSlotForm())).toEqual({ journey: 1, page: 7, cell: 2, point: { x: 12, y: 87 } })
  })

  it('reads the caption and the alt text a slot’s fields post', () => {
    expect(readSlotText(aSlotForm())).toEqual({
      journey: 1,
      page: 7,
      cell: 2,
      caption: 'The bridge, from below',
      alt: 'An iron bridge seen from the river path',
    })
  })

  it('reads the target Clear posts, which carries nothing else', () => {
    expect(readSlotRef(aSlotForm())).toEqual({ journey: 1, page: 7, cell: 2 })
  })

  it('admits the last cell any pane draws', () => {
    // THE PERMITTED SIDE of the gate, read off the domain's own table rather
    // than written down — so a fifth frame added there moves this case with it.
    expect(readSlotRef(aSlotForm({ slot: `7:${String(HIGHEST_SLOT_CELL)}` })).cell).toBe(HIGHEST_SLOT_CELL)
  })

  it('refuses the first cell past it, which no pane draws', () => {
    expect(() => readSlotRef(aSlotForm({ slot: `7:${String(HIGHEST_SLOT_CELL + 1)}` }))).toThrow()
  })

  it('refuses a negative cell, which is what a minus sign in the key would be', () => {
    expect(() => readSlotRef(aSlotForm({ slot: '7:-1' }))).toThrow()
  })

  it('refuses a key that is not a page and a cell at all', () => {
    expect(() => readSlotRef(aSlotForm({ slot: 'nonsense' }))).toThrow()
    expect(() => readSlotRef(aSlotForm({ slot: '7' }))).toThrow()
  })

  it('refuses a page that is past what a row id can be, so nothing reaches the driver as NaN', () => {
    // `9007199254740993` is where `Number` stops telling one integer from the
    // next, so an unguarded parse would ask Postgres about a DIFFERENT row.
    expect(() => readSlotRef(aSlotForm({ slot: '9007199254740993:0' }))).toThrow()
  })

  it('refuses a media id that is not a row id', () => {
    expect(() => readSlotMedia(aSlotForm({ media: 'nonsense' }))).toThrow()
  })

  it('admits both ends of the focal range, which is where a corner click lands', () => {
    expect(readSlotPoint(aSlotForm({ focalX: '0', focalY: '100' })).point).toEqual({ x: 0, y: 100 })
  })

  it('refuses a point outside the frame, on either side', () => {
    expect(() => readSlotPoint(aSlotForm({ focalX: '-0.1' }))).toThrow()
    expect(() => readSlotPoint(aSlotForm({ focalY: '100.1' }))).toThrow()
  })

  it('refuses a point that is not a number, which is what NaN reaching CSS would be', () => {
    expect(() => readSlotPoint(aSlotForm({ focalX: 'NaN' }))).toThrow()
  })
})

describe('setSlotMediaRow', () => {
  it('puts the photograph in the cell the key named, and pads the cells before it', async () => {
    const { page } = await aPublishedFramesPage('padding')
    const photograph = await aPhotograph('padding')

    await setSlotMediaRow(payload, scope, page, 2, photograph)

    const rows = (await liveRow(page)).slots ?? []
    expect(rows).toHaveLength(3)
    expect(rows[2]?.media).toBe(photograph)
    // THE PADDED CELLS ARE REAL ROWS WITH NO PHOTOGRAPH, not a shorter array:
    // the cell index IS the cell of the layout, so cell 2 must be the third
    // row or the public page draws it in the first frame.
    expect(rows.slice(0, 2).map((row) => row.media)).toEqual([null, null])
    expect(rows.map((row) => row.role)).toEqual(['frame', 'frame', 'frame'])
  })

  it('re-centres the cell, so a crop chosen for the last photograph is not kept for this one', async () => {
    // DATA_MODEL.md: the focal point is "the slot's own override for THIS
    // placement". A stale one is invisible to the author, because the pill
    // reads a number either way.
    const { page } = await aPublishedFramesPage('replace-focal')
    await setSlotFocalRow(payload, scope, page, 0, { x: 12, y: 87 })

    await setSlotMediaRow(payload, scope, page, 0, await aPhotograph('replace-focal'))

    const row = (await liveRow(page)).slots?.[0]
    expect({ x: row?.focalX, y: row?.focalY }).toEqual({ x: 50, y: 50 })
  })

  it('refuses a cell the page’s own pane does not draw', async () => {
    const { page } = await aPublishedFramesPage('notes-cell')
    const notes = await payload.find({
      collection: 'pages',
      ...scope,
      depth: 0,
      where: { and: [{ journey: { equals: (await liveRow(page)).journey } }, { kind: { equals: 'notes' } }] },
    })
    const notesPage = notes.docs[0]?.id
    expect(notesPage).toBeDefined()

    // A NOTES PAGE HAS TWO CELLS, a frames page four — so cell 2 is inside the
    // parse's gate and outside THIS page's pane. The parse cannot know which,
    // because the key carries no kind; the write reads the row and does.
    await expect(setSlotMediaRow(payload, scope, Number(notesPage), 2, 1)).rejects.toThrow(/does not draw/u)
  })
})

describe('setSlotTextRow', () => {
  it('writes the caption and the alt text the slot’s own fields carry', async () => {
    const { page } = await aPublishedFramesPage('text')

    await setSlotTextRow(payload, scope, page, 0, { caption: 'Alfama, from a step', alt: 'A tiled stair' })

    const row = (await liveRow(page)).slots?.[0]
    expect({ caption: row?.caption, alt: row?.alt }).toEqual({ caption: 'Alfama, from a step', alt: 'A tiled stair' })
  })
})

describe('clearSlotRow', () => {
  it('empties the cell in place, so the cell after it does not move up', async () => {
    // THE DEFECT THIS EXISTS TO PREVENT: `FramesI.tsx` reads
    // `page.slots?.[position]`, so a clear that SPLICED the row would draw the
    // second photograph in the first frame — a change to a page the author did
    // not touch.
    const { page } = await aPublishedFramesPage('clear')
    const first = await aPhotograph('clear-first')
    const second = await aPhotograph('clear-second')
    await setSlotMediaRow(payload, scope, page, 0, first)
    await setSlotMediaRow(payload, scope, page, 1, second)

    await clearSlotRow(payload, scope, page, 0)

    const rows = (await liveRow(page)).slots ?? []
    expect(rows).toHaveLength(2)
    expect(rows[0]?.media).toBeNull()
    expect(rows[1]?.media).toBe(second)
  })

  it('returns the cell to centre, so the next photograph is not cropped for the last one', async () => {
    const { page } = await aPublishedFramesPage('clear-focal')
    await setSlotFocalRow(payload, scope, page, 0, { x: 12, y: 87 })

    await clearSlotRow(payload, scope, page, 0)

    const row = (await liveRow(page)).slots?.[0]
    expect({ x: row?.focalX, y: row?.focalY }).toEqual({ x: 50, y: 50 })
  })
})

describe('setSlotFocalRow', () => {
  it('writes the live row and leaves it published, so a reader is not shown a draft', async () => {
    const { page } = await aPublishedFramesPage('status')

    await setSlotFocalRow(payload, scope, page, 0, { x: 12, y: 87 })

    expect((await liveRow(page))._status).toBe('published')
  })

  it('keeps the pending draft’s own slots, which one literal for both sides would discard', async () => {
    // THE CASE THAT MAKES `writePageFields` TAKE A FUNCTION. The author has an
    // unpublished caption on cell 1; the focal write touches cell 0. Written
    // from one literal, the second write would put the LIVE row's slots into
    // the draft and the caption would be gone.
    const { page } = await aPublishedFramesPage('draft-slots')
    await setSlotMediaRow(payload, scope, page, 1, await aPhotograph('draft-slots'))
    await payload.update({
      collection: 'pages',
      id: page,
      ...scope,
      draft: true,
      data: { slots: [{ role: 'frame' }, { role: 'frame', caption: 'not published yet' }] },
    })

    await setSlotFocalRow(payload, scope, page, 0, { x: 12, y: 87 })

    const draft = await newestVersion(page)
    expect(draft._status).toBe('draft')
    expect(draft.slots?.[1]?.caption).toBe('not published yet')
    expect({ x: draft.slots?.[0]?.focalX, y: draft.slots?.[0]?.focalY }).toEqual({ x: 12, y: 87 })
  })

  it('moves the crop the diary renders, which is why the control is not decorative', async () => {
    const { journey, page } = await aPublishedFramesPage('exit-criterion')
    await setSlotMediaRow(payload, scope, page, 0, await aPhotograph('exit-criterion'))

    const beforeSlot = await slotOf(journey, 0)

    await setSlotFocalRow(payload, scope, page, 0, { x: 12, y: 87 })

    const afterSlot = await slotOf(journey, 0)

    // The left sides are two reads of the same production mapper against the
    // same database, before and after one write. Nothing here asserts a
    // literal the write was given AND the assertion was given.
    expect(beforeSlot).toBeDefined()
    expect(beforeSlot).not.toEqual(afterSlot)
    expect(afterSlot?.focalX).toBe(12)
    expect(afterSlot?.focalY).toBe(87)
  })
})
