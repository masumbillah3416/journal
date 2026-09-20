/**
 * readMediaScreen.integration.test.ts — behaviour spec for everything
 * SCREENS.md §2.4 draws, in a fixed number of queries.
 *
 * Integration test (CLAUDE.md §2): every property here is Payload's or
 * Postgres's. Whether a `like` on `filename` narrows the rows that cross the
 * wire, whether a slot's `media` comes back as an id or a document at
 * `depth: 0`, whether a small upload has a `thumb` derivative at all, and —
 * the one CLAUDE.md §6 gates — whether the screen costs a fixed number of
 * queries or one per tile, are answers only a real Payload and a real database
 * give.
 *
 * ═══ THIS SCREEN'S READ IS NOT SCOPED TO A JOURNEY, SO THE ASSERTIONS ARE
 *     SCOPED TO THE FIXTURE ═══
 *
 * `diary_test` is shared by every integration file and the seed writes ten
 * journeys' worth of media into it, so a case that asserted on the whole grid
 * would be asserting about other files' rows. Every case here therefore either
 * SEARCHES for this file's own marker — which is the production narrowing, not
 * a test-only one — or picks its own rows out of the result by id. The two
 * cases about `total` use the search for exactly that reason, and what they
 * then compare is the chip's effect, which is what `total` is for.
 *
 * Uses `getTestPayload()` rather than `getPayload()`, like every integration
 * file here.
 * Depends on: vitest, payload (types), sharp (the fixtures' bytes),
 * @travel-diary/domain/ids, ../testPayload, ./adminScope, ./readMediaScreen.
 */
import { mediaId, userId, type MediaId, type UserId } from '@travel-diary/domain/ids'
import type { Payload } from 'payload'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getTestPayload } from '../testPayload'
import { adminScope, type AdminScope } from './adminScope'
import { mediaQuery, readMediaScreen, type MediaRow } from './readMediaScreen'

/** What every row this file writes carries, so cleanup and the search can find them. */
const MARKER = 'test-media-screen'

/** A password that is not one: this account is never signed in to. */
const NOT_A_PASSWORD = 'not-a-real-password'

/**
 * How many questions the screen asks, whatever the size of the library.
 *
 * THREE: the media, the pages that hold it, and the journeys the dropzone
 * offers. Each is one query over the whole collection, not one per row.
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
 * A branded media id for a row id.
 * @param raw - The id as Postgres spells it.
 * @returns The branded id.
 */
const aMediaId = (raw: number): MediaId => {
  const built = mediaId(String(raw))
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
 * @returns The journey's row id.
 */
const aJourney = async (label: string): Promise<number> => {
  const created = await payload.create({
    collection: 'journeys',
    ...scope,
    data: {
      name: `${MARKER} ${label}`,
      place: 'Japan',
      slug: `${MARKER}-${label}`,
      dates: '3 – 14 April 2025',
      _status: 'published',
    },
  })
  return created.id
}

/**
 * A media row with a real derivative behind it.
 *
 * 800px square, which is wide enough for the `thumb` tier Payload configures —
 * so a case asking about `thumbSrc` is asking about a derivative that exists
 * rather than about a fallback.
 * @param journey - The journey it belongs to.
 * @param label - What distinguishes this row; it becomes part of the filename.
 * @param fields - `inBook`, for a clip `kind` and `durationSec`, and `size`
 *   for a case that wants an original too small for a tier.
 * @returns The media row's id.
 */
const aMediaRow = async (
  journey: number,
  label: string,
  fields: {
    readonly inBook?: boolean
    readonly kind?: 'still' | 'clip'
    readonly durationSec?: number
    readonly size?: number
  } = {},
): Promise<number> => {
  const size = fields.size ?? 800
  const png = await sharp({ create: { width: size, height: size, channels: 3, background: { r: 9, g: 9, b: 9 } } })
    .png()
    .toBuffer()
  const created = await payload.create({
    collection: 'media',
    ...scope,
    data: {
      journey,
      alt: `${MARKER} ${label}`,
      state: 'ready',
      inBook: fields.inBook ?? false,
      kind: fields.kind ?? 'still',
      ...(fields.durationSec === undefined ? {} : { durationSec: fields.durationSec }),
    },
    file: { data: png, mimetype: 'image/png', name: `${MARKER}-${label}.png`, size: png.length },
  })
  return created.id
}

/**
 * A page holding the given media in its cells.
 * @param journey - The journey the page belongs to.
 * @param label - What distinguishes this page.
 * @param held - One media row id per cell, in cell order.
 * @returns The page's row id.
 */
const aPageHolding = async (journey: number, label: string, held: readonly (number | null)[]): Promise<number> => {
  const created = await payload.create({
    collection: 'pages',
    ...scope,
    data: {
      journey,
      kind: 'frames',
      title: `${MARKER} ${label}`,
      order: 0,
      layout: 'four-up',
      slots: held.map((media) => ({ role: 'frame' as const, media })),
      _status: 'published',
    },
  })
  return created.id
}

/** Only this file's own rows, so a shared database cannot decide a case. */
const mine = (rows: readonly MediaRow[]): readonly MediaRow[] => rows.filter((row) => row.filename.includes(MARKER))

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

describe('mediaQuery', () => {
  it('reads the search and the chip out of the address', () => {
    expect(mediaQuery({ q: 'tokyo', filter: 'clips' })).toEqual({ search: 'tokyo', filter: 'clips' })
  })

  it('falls back to Everything for a chip nobody offers, rather than refusing the address', () => {
    expect(mediaQuery({ filter: 'nonsense' })).toEqual({ search: '', filter: 'everything' })
  })

  it('takes the first value when the key repeats, which is an address anybody can type', () => {
    expect(mediaQuery({ q: ['first', 'second'], filter: ['stills', 'clips'] })).toEqual({
      search: 'first',
      filter: 'stills',
    })
  })

  it('answers the default for an address with no query string at all', () => {
    expect(mediaQuery({})).toEqual({ search: '', filter: 'everything' })
  })
})

describe('readMediaScreen', () => {
  it('draws a tile per media row, with the filename Payload stored it under', async () => {
    const journey = await aJourney('tiles')
    const row = await aMediaRow(journey, 'one')

    const view = await readMediaScreen(payload, scope, { search: MARKER, filter: 'everything' })

    // The left side is what the read answered; the right side is the id
    // Postgres minted, and the filename is Payload's own naming rather than
    // the name this file passed — `getSafeFileName` may have changed it.
    const found = view.rows.find((tile) => tile.id === aMediaId(row))
    expect(found?.filename).toContain(`${MARKER}-one`)
  })

  it('serves the thumb derivative, never the original, so a grid is not the library on the wire', async () => {
    const journey = await aJourney('thumbs')
    const row = await aMediaRow(journey, 'sized')
    const stored = await payload.findByID({
      collection: 'media',
      id: row,
      depth: 0,
      select: { url: true, sizes: true },
    })

    const view = await readMediaScreen(payload, scope, { search: MARKER, filter: 'everything' })
    const found = view.rows.find((tile) => tile.id === aMediaId(row))

    // BOTH SIDES COME OFF THE ROW PAYLOAD WROTE: the tile's URL is the `thumb`
    // tier's, and it is not the row's own `url`, which is the original.
    expect(found?.thumbSrc).toBe(stored.sizes?.thumb?.url)
    expect(found?.thumbSrc).not.toBe(stored.url)
  })

  it('counts how many page cells hold each photograph', async () => {
    const journey = await aJourney('placed')
    const once = await aMediaRow(journey, 'once')
    const twice = await aMediaRow(journey, 'twice')
    const never = await aMediaRow(journey, 'never')
    await aPageHolding(journey, 'first', [once, twice])
    await aPageHolding(journey, 'second', [twice])

    const view = await readMediaScreen(payload, scope, { search: MARKER, filter: 'everything' })
    const placements = new Map(view.rows.map((tile) => [tile.id, tile.placements]))

    // Three different counts from one pass over the pages, so a helper that
    // answered a constant fails on two of the three.
    expect(placements.get(aMediaId(once))).toBe(1)
    expect(placements.get(aMediaId(twice))).toBe(2)
    expect(placements.get(aMediaId(never))).toBe(0)
  })

  it('counts nothing for a cell the author cleared, which keeps its row in the array', async () => {
    // `slotMutations.ts` empties a cell IN PLACE rather than splicing it, so a
    // page the author has cleared a frame on carries a slot row whose `media`
    // is null. A placement count that did not skip it would credit whichever
    // photograph happened to be next.
    const journey = await aJourney('cleared')
    const kept = await aMediaRow(journey, 'clearedkept')
    await aPageHolding(journey, 'clearedpage', [null, kept])

    const view = await readMediaScreen(payload, scope, { search: `${MARKER}-cleared`, filter: 'everything' })

    expect(view.rows.map((tile) => tile.placements)).toEqual([1])
  })

  it('reads a row with no alt text as the empty string, rather than leaving the image undescribed', async () => {
    // Every column but the file is optional on `media`, and the seed wrote
    // rows before `alt` was asked for. An `undefined` here reaches the tile's
    // `alt` attribute and React drops it, which is an image with NO alt rather
    // than an image with an empty one — a different thing to a screen reader.
    const journey = await aJourney('noalt')
    const row = await payload.create({
      collection: 'media',
      ...scope,
      data: { journey, state: 'ready' },
      file: {
        data: await sharp({ create: { width: 800, height: 800, channels: 3, background: { r: 1, g: 1, b: 1 } } })
          .png()
          .toBuffer(),
        mimetype: 'image/png',
        name: `${MARKER}-noalt.png`,
        size: 1,
      },
    })

    const view = await readMediaScreen(payload, scope, { search: `${MARKER}-noalt`, filter: 'everything' })

    expect(view.rows.find((tile) => tile.id === aMediaId(row.id))?.alt).toBe('')
  })

  it('prints no duration for a clip whose length nothing has measured yet', async () => {
    // A `worker` ingest creates the row at `state: 'processing'` with no
    // `durationSec` — the probe has not run. The chip must be absent rather
    // than read `0:00`, which would be a measurement nobody took.
    const journey = await aJourney('unmeasured')
    const clip = await aMediaRow(journey, 'unmeasured', { kind: 'clip' })

    const view = await readMediaScreen(payload, scope, { search: `${MARKER}-unmeasured`, filter: 'everything' })

    expect(view.rows.find((tile) => tile.id === aMediaId(clip))?.duration).toBeNull()
  })

  it('draws no thumbnail for an upload too small to have the tier', async () => {
    // Payload omits a derivative whose target exceeds the source, so a 100px
    // original has no `thumb` at all (`apps/web/collections/media.ts`'s
    // `imageSizes`). `null` is what keeps the 100px ORIGINAL off the wire in
    // its place — the tile draws an empty square.
    const journey = await aJourney('tiny')
    const tiny = await aMediaRow(journey, 'tiny', { size: 100 })

    const view = await readMediaScreen(payload, scope, { search: `${MARKER}-tiny`, filter: 'everything' })

    expect(view.rows.find((tile) => tile.id === aMediaId(tiny))?.thumbSrc).toBeNull()
  })

  it('reads In book off the media row’s own column', async () => {
    const journey = await aJourney('inbook')
    const marked = await aMediaRow(journey, 'marked', { inBook: true })
    const unmarked = await aMediaRow(journey, 'unmarked', { inBook: false })

    const view = await readMediaScreen(payload, scope, { search: MARKER, filter: 'everything' })
    const flags = new Map(view.rows.map((tile) => [tile.id, tile.inBook]))

    expect(flags.get(aMediaId(marked))).toBe(true)
    expect(flags.get(aMediaId(unmarked))).toBe(false)
  })

  it('prints a clip’s duration and a still’s nothing', async () => {
    const journey = await aJourney('clips')
    const clip = await aMediaRow(journey, 'clip', { kind: 'clip', durationSec: 24 })
    const still = await aMediaRow(journey, 'still')

    const view = await readMediaScreen(payload, scope, { search: MARKER, filter: 'everything' })
    const durations = new Map(view.rows.map((tile) => [tile.id, tile.duration]))

    expect(durations.get(aMediaId(clip))).toBe('0:24')
    expect(durations.get(aMediaId(still))).toBeNull()
  })

  it('narrows the rows by filename, in the query rather than in memory', async () => {
    const journey = await aJourney('search')
    await aMediaRow(journey, 'reykjavik')
    await aMediaRow(journey, 'sapporo')

    const view = await readMediaScreen(payload, scope, { search: `${MARKER}-reykjavik`, filter: 'everything' })

    // The rows outside the search never crossed the wire, so `total` is what
    // the search admitted — which is what makes this a SQL narrowing rather
    // than a filter over everything.
    expect(view.rows.map((tile) => tile.filename.includes('reykjavik'))).toEqual([true])
    expect(view.total).toBe(1)
  })

  it('narrows the rows with the chip and leaves the total where the search put it', async () => {
    const journey = await aJourney('chip')
    await aMediaRow(journey, 'chipstill')
    await aMediaRow(journey, 'chipclip', { kind: 'clip', durationSec: 8 })

    const everything = await readMediaScreen(payload, scope, { search: `${MARKER}-chip`, filter: 'everything' })
    const clips = await readMediaScreen(payload, scope, { search: `${MARKER}-chip`, filter: 'clips' })

    expect(everything.rows).toHaveLength(2)
    expect(clips.rows).toHaveLength(1)
    // `total` is unchanged by the chip, which is what makes "{n} of {total}" a
    // sentence about the chip rather than a restatement of the row count.
    expect(clips.total).toBe(everything.total)
  })

  it('hides a photograph a page holds from the Unused chip', async () => {
    const journey = await aJourney('used')
    const held = await aMediaRow(journey, 'usedheld')
    const loose = await aMediaRow(journey, 'usedloose')
    await aPageHolding(journey, 'holder', [held])

    const view = await readMediaScreen(payload, scope, { search: `${MARKER}-used`, filter: 'unused' })

    expect(view.rows.map((tile) => tile.id)).toEqual([aMediaId(loose)])
  })

  it('offers every live journey to the dropzone and no trashed one', async () => {
    const live = await aJourney('offered')
    const trashed = await aJourney('trashed')
    await payload.update({
      collection: 'journeys',
      id: trashed,
      ...scope,
      data: { deletedAt: new Date().toISOString() },
    })

    const view = await readMediaScreen(payload, scope, { search: MARKER, filter: 'everything' })
    const offered = view.journeys.map((choice) => choice.id)

    expect(offered.map(String)).toContain(String(live))
    expect(offered.map(String)).not.toContain(String(trashed))
  })

  it('asks the database a fixed number of questions however much media there is', async () => {
    const journey = await aJourney('cost')
    await aMediaRow(journey, 'costone')
    const find = vi.spyOn(payload, 'find')

    await readMediaScreen(payload, scope, { search: MARKER, filter: 'everything' })
    const asked = find.mock.calls.map(([options]) => options.collection)

    await aMediaRow(journey, 'costtwo')
    await aMediaRow(journey, 'costthree')

    find.mockClear()
    await readMediaScreen(payload, scope, { search: MARKER, filter: 'everything' })
    const askedWithTwoMore = find.mock.calls.map(([options]) => options.collection)

    expect(asked).toEqual(['media', 'pages', 'journeys'])
    expect(askedWithTwoMore).toEqual(asked)
    expect(askedWithTwoMore).toHaveLength(QUERIES_PER_READ)
    find.mockRestore()
  })

  it('runs every query under the scope it was handed, with Payload’s access rules on', async () => {
    const find = vi.spyOn(payload, 'find')

    await readMediaScreen(payload, scope, { search: MARKER, filter: 'everything' })

    // IDENTITY, not equality: every call must carry the very object the caller
    // hoisted. A module that called `adminScope` itself, once per query, would
    // hand over freshly-read rows that compare equal field by field and are
    // one `users` lookup each.
    expect(find.mock.calls).toHaveLength(QUERIES_PER_READ)
    expect(find.mock.calls.every(([options]) => options.user === scope.user)).toBe(true)
    find.mockRestore()
  })

  it('shows the whole library when nothing is searched for, not only this file’s rows', async () => {
    // The screen's ordinary state, and the one every case above deliberately
    // avoids: with no search the grid is the library, so this asserts about
    // the shape of that rather than about a count a shared database owns.
    const journey = await aJourney('library')
    await aMediaRow(journey, 'libraryone')

    const view = await readMediaScreen(payload, scope, { search: '', filter: 'everything' })

    expect(mine(view.rows).length).toBeGreaterThan(0)
    expect(view.total).toBe(view.rows.length)
    expect(view.total).toBeGreaterThanOrEqual(mine(view.rows).length)
  })
})
