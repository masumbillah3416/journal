/**
 * readJourneyEditor.integration.test.ts — behaviour spec for everything
 * SCREENS.md §2.3's editor draws, in a fixed number of queries.
 *
 * Integration test (CLAUDE.md §2): every property here is Payload's or
 * Postgres's. Whether a page read with `draft: true` comes back as the author's
 * unpublished rewrite or as the published row, whether a trashed journey is
 * still reachable by its address, whether a derivative exists for a small
 * upload, and — the one that matters for CLAUDE.md §6 — whether the screen
 * costs a fixed number of queries or one per page, are answers only a real
 * Payload and a real database give.
 *
 * WHAT PRODUCED EACH SIDE OF THE QUERY-COUNT COMPARISON: the left side is the
 * collections Payload was actually asked about, in order, and the right side is
 * what this module states it costs. The equality between two readings taken
 * with different numbers of pages in the journey is what catches an N+1.
 *
 * Uses `getTestPayload()` rather than `getPayload()`, like every integration
 * file here, so these rows land in the isolated `diary_test` database.
 *
 * Depends on: vitest, payload (types), sharp (the pool fixture's bytes),
 * @travel-diary/domain/ids, ../testPayload, ./adminScope, ./readJourneyEditor.
 */
import { TALLY_ROWS } from '@travel-diary/domain/bookBundle'
import { journeyId, userId, type JourneyId, type UserId } from '@travel-diary/domain/ids'
import type { Payload } from 'payload'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getTestPayload } from '../testPayload'
import { adminScope, type AdminScope } from './adminScope'
import { readJourneyEditor } from './readJourneyEditor'

/** What every row this file writes carries, so cleanup can find them all. */
const MARKER = 'test-journey-editor'

/** A password that is not one: this account is never signed in to. */
const NOT_A_PASSWORD = 'not-a-real-password'

/**
 * How many questions the editor asks, whatever the page or pool count.
 *
 * THREE: the journey, its pages, its media. The pages and the media are one
 * query each over the whole journey, not one per row, which is the whole of
 * the CLAUDE.md §6 claim.
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
 *
 * `journeyId` answers a `Result`, so an unwrapped call would hand the module
 * `{ ok: true, value: … }` and never match a row.
 * @param raw - The id as Postgres spells it.
 * @returns The branded id.
 */
const aJourneyId = (raw: string | number): JourneyId => {
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
    // BY JOURNEY, NOT BY `alt`: one fixture here is a media row with no alt
    // text at all, which a predicate over `alt` cannot find.
    await payload.delete({ collection: 'media', where: { journey: { equals: journey.id } } })
  }
  await payload.delete({ collection: 'journeys', where: { slug: { like: MARKER } } })
  await payload.delete({ collection: 'users', where: { email: { like: MARKER } } })
}

/**
 * A published journey with one published page per title.
 * @param label - What distinguishes this journey's slug from the others'.
 * @param titles - One page per title, ordered from 0.
 * @returns The journey's row id and its pages' row ids, in order.
 */
const aJourneyWithPages = async (
  label: string,
  titles: readonly string[],
): Promise<{ readonly journey: number; readonly pages: readonly number[] }> => {
  const journey = await payload.create({
    collection: 'journeys',
    ...scope,
    data: {
      name: `${MARKER} ${label}`,
      place: 'Norway',
      slug: `${MARKER}-${label}`,
      dates: '12 – 24 March 2025',
      _status: 'published',
    },
  })
  const pages: number[] = []
  for (const [order, title] of titles.entries()) {
    const page = await payload.create({
      collection: 'pages',
      ...scope,
      data: {
        journey: journey.id,
        kind: title === 'Notes' ? 'notes' : 'frames',
        title,
        order,
        layout: title === 'Notes' ? 'text-spread' : 'four-up',
        _status: 'published',
      },
    })
    pages.push(page.id)
  }
  return { journey: journey.id, pages }
}

/**
 * A media row in a journey's pool, with a real derivative behind it.
 * @param journey - The journey it belongs to.
 * @param label - What distinguishes this row from the others.
 * @param inBook - Whether the pool tile is ticked.
 * @param size - The square the original is generated at.
 * @returns The media row's id.
 */
const aPoolItem = async (journey: number, label: string, inBook: boolean, size = 800): Promise<number> => {
  const png = await sharp({ create: { width: size, height: size, channels: 3, background: { r: 9, g: 9, b: 9 } } })
    .png()
    .toBuffer()
  const created = await payload.create({
    collection: 'media',
    data: { journey, alt: `${MARKER} ${label}`, caption: `${label} caption`, inBook, state: 'ready' },
    file: { data: png, mimetype: 'image/png', name: `${MARKER}-${label}.png`, size: png.length },
  })
  return created.id
}

beforeAll(async () => {
  payload = await getTestPayload()
  const account = await payload.create({
    collection: 'users',
    data: { email: `${MARKER}@example.test`, password: NOT_A_PASSWORD },
  })
  scope = await adminScope({ user: anAccount(String(account.id)) })
  await clean()
}, 120_000)

afterAll(async () => {
  await clean()
})

describe('readJourneyEditor', () => {
  it('reads the journey’s pages in the order the book reads them', async () => {
    const { journey, pages } = await aJourneyWithPages('order', ['Notes', 'Frames I', 'Frames II'])

    const view = await readJourneyEditor(payload, scope, aJourneyId(journey))

    expect(view?.pages.map((page) => String(page.id))).toEqual(pages.map(String))
    expect(view?.pages.map((page) => page.order)).toEqual([0, 1, 2])
  })

  it('sorts by each page’s own place rather than by when it was created', async () => {
    // Written back to front on purpose: without a sort clause Payload orders by
    // the collection's default, which puts these two the other way round — so
    // the case above, whose rows were created in order, would still pass.
    const { journey } = await aJourneyWithPages('resort', [])
    const later = await payload.create({
      collection: 'pages',
      ...scope,
      data: { journey, kind: 'frames', title: 'Second', order: 1, _status: 'published' },
    })
    const earlier = await payload.create({
      collection: 'pages',
      ...scope,
      data: { journey, kind: 'frames', title: 'First', order: 0, _status: 'published' },
    })

    const view = await readJourneyEditor(payload, scope, aJourneyId(journey))

    expect(view?.pages.map((page) => String(page.id))).toEqual([String(earlier.id), String(later.id)])
  })

  it('carries each page’s layout, which is what the picker draws as active', async () => {
    const { journey } = await aJourneyWithPages('layouts', ['Notes', 'Frames I'])

    const view = await readJourneyEditor(payload, scope, aJourneyId(journey))

    expect(view?.pages.map((page) => page.layout)).toEqual(['text-spread', 'four-up'])
  })

  it('shows the author’s unpublished draft, because that is what they are editing', async () => {
    const { journey, pages } = await aJourneyWithPages('draft', ['Notes'])
    const page = pages[0]
    if (page === undefined) throw new Error('the fixture made no page')
    await payload.update({
      collection: 'pages',
      id: page,
      ...scope,
      draft: true,
      data: { title: 'Notes, rewritten' },
    })

    const view = await readJourneyEditor(payload, scope, aJourneyId(journey))

    expect(view?.pages.map((page) => page.title)).toEqual(['Notes, rewritten'])
  })

  it('shows the journey’s own pending draft too, because the notes page edits its fields', async () => {
    // `highlights`, `note`, `tally` and `furniture` are columns on `journeys`,
    // not on `pages` (DATA_MODEL.md), so Task 6's Save draft writes the JOURNEY
    // as a draft. A read of the main row would show the author a published copy
    // of what they had just typed into.
    const { journey } = await aJourneyWithPages('journeydraft', ['Notes'])
    await payload.update({
      collection: 'journeys',
      id: journey,
      ...scope,
      draft: true,
      data: { name: `${MARKER} journeydraft, renamed in a draft` },
    })

    const view = await readJourneyEditor(payload, scope, aJourneyId(journey))

    expect(view?.name).toBe(`${MARKER} journeydraft, renamed in a draft`)
  })

  it('carries every field the Notes pane edits, so the pane renders what the database holds', async () => {
    const { journey } = await aJourneyWithPages('notes', ['Notes'])
    await payload.update({
      collection: 'journeys',
      id: journey,
      ...scope,
      data: {
        weather: 'CLEAR 14C',
        mood: 'WIDE EYED',
        weatherGlyph: 'haze',
        highlights: [{ text: 'First train at 05:40' }],
        note: 'Tokyo is loud in a way that never quite becomes noise.',
        tally: [
          { key: 'Days', value: '12' },
          { key: 'Trains', value: 'plenty' },
          { key: 'Tarts', value: '19' },
          { key: 'Rain', value: 'uncounted' },
        ],
        furniture: {
          signoff: 'twelve days, one corner of it',
          stampCountry: 'NIPPON',
          stampValue: '120',
          accent: '#a06b3e',
        },
      },
    })

    const view = await readJourneyEditor(payload, scope, aJourneyId(journey))

    expect({ ...view?.notes, highlights: view?.notes.highlights.map((row) => row.text) }).toEqual({
      name: `${MARKER} notes`,
      dates: '12 – 24 March 2025',
      weather: 'CLEAR 14C',
      mood: 'WIDE EYED',
      weatherGlyph: 'haze',
      highlights: ['First train at 05:40'],
      note: 'Tokyo is loud in a way that never quite becomes noise.',
      tally: [
        { key: 'Days', value: '12' },
        { key: 'Trains', value: 'plenty' },
        { key: 'Tarts', value: '19' },
        { key: 'Rain', value: 'uncounted' },
      ],
      signoff: 'twelve days, one corner of it',
      stampCountry: 'NIPPON',
      stampValue: '120',
      accent: '#a06b3e',
      slug: `${MARKER}-notes`,
    })
  })

  it('gives each highlight the id its × and its grip address, rather than a position', async () => {
    const { journey } = await aJourneyWithPages('hlids', ['Notes'])
    await payload.update({
      collection: 'journeys',
      id: journey,
      ...scope,
      data: { highlights: [{ text: 'one' }, { text: 'two' }] },
    })

    const view = await readJourneyEditor(payload, scope, aJourneyId(journey))
    const ids = (view?.notes.highlights ?? []).map((row) => row.id)

    expect(new Set(ids).size === ids.length && ids.every((id) => id.length > 0)).toBe(true)
  })

  it('draws the tally as a fixed grid, so a journey that stored none still has its cells', async () => {
    const { journey } = await aJourneyWithPages('notally', ['Notes'])

    const view = await readJourneyEditor(payload, scope, aJourneyId(journey))

    expect(view?.notes.tally).toEqual(Array.from({ length: TALLY_ROWS }, () => ({ key: '', value: '' })))
  })

  it('answers a journey with nothing typed into it with empty strings, never with undefined', async () => {
    const { journey } = await aJourneyWithPages('blank', ['Notes'])

    const view = await readJourneyEditor(payload, scope, aJourneyId(journey))

    expect({
      weather: view?.notes.weather,
      mood: view?.notes.mood,
      weatherGlyph: view?.notes.weatherGlyph,
      note: view?.notes.note,
      signoff: view?.notes.signoff,
      stampCountry: view?.notes.stampCountry,
      stampValue: view?.notes.stampValue,
      highlights: view?.notes.highlights,
    }).toEqual({
      weather: '',
      mood: '',
      weatherGlyph: 'sun',
      note: '',
      signoff: '',
      stampCountry: '',
      stampValue: '',
      highlights: [],
    })
  })

  it('names the journey the rail’s eyebrow prints', async () => {
    const { journey } = await aJourneyWithPages('name', ['Notes'])

    const view = await readJourneyEditor(payload, scope, aJourneyId(journey))

    expect(view?.name).toBe(`${MARKER} name`)
  })

  it('answers null for a journey that is not there, rather than throwing at a screen', async () => {
    expect(await readJourneyEditor(payload, scope, aJourneyId(2_000_000_000))).toBeNull()
  })

  it('answers null for an id that is not a row id at all', async () => {
    expect(await readJourneyEditor(payload, scope, aJourneyId('nonsense'))).toBeNull()
  })

  it('answers null for a journey in the trash, which must not be editable', async () => {
    const { journey } = await aJourneyWithPages('trashed', ['Notes'])
    await payload.update({
      collection: 'journeys',
      id: journey,
      ...scope,
      data: { deletedAt: new Date().toISOString() },
    })

    expect(await readJourneyEditor(payload, scope, aJourneyId(journey))).toBeNull()
  })

  it('reads the journey’s pool, with a thumbnail per tile', async () => {
    const { journey } = await aJourneyWithPages('pool', ['Notes'])
    await aPoolItem(journey, 'one', true)
    await aPoolItem(journey, 'two', false)

    const view = await readJourneyEditor(payload, scope, aJourneyId(journey))

    expect(view?.pool).toHaveLength(2)
    expect(view?.pool.every((item) => item.thumbSrc !== null)).toBe(true)
  })

  it('counts how many of the pool are in the book, which the eyebrow prints', async () => {
    const { journey } = await aJourneyWithPages('inbook', ['Notes'])
    await aPoolItem(journey, 'kept', true)
    await aPoolItem(journey, 'spare', false)
    await aPoolItem(journey, 'other', false)

    const view = await readJourneyEditor(payload, scope, aJourneyId(journey))

    expect(view?.inBook).toBe(1)
    expect(view?.pool).toHaveLength(3)
  })

  it('leaves out a version whose page row is gone, rather than drawing a card nothing can act on', async () => {
    // THE DEFECT A BROWSER SWEEP FOUND AND NO FIXTURE HERE COULD
    // (`docs/qa/2026-09-19-journey-editor-sweep.md`, EDITOR-001). Reading with
    // `draft: true` makes Payload answer from `_pages_v`, and a version row
    // whose parent page is gone comes back as a document with `id: null` — which
    // `pageId(String(null))` brands happily, because `'null'` is a non-empty
    // string. The developer's own `diary` holds three such rows and the rail
    // drew three phantom cards, all of them "selected" at once because they
    // shared the id.
    //
    // THE FIXTURE IS THE REAL SHAPE, not an invented one: the main row is
    // removed through the adapter's own `deleteOne`, which is what leaves
    // versions behind. `payload.delete` — what `deletePageRow` calls — takes the
    // versions with it, which is measured by the case after this one.
    const { journey } = await aJourneyWithPages('orphan', ['Notes', 'Frames I'])
    const pages = await payload.find({
      collection: 'pages',
      ...scope,
      depth: 0,
      pagination: false,
      sort: 'order',
      where: { journey: { equals: journey } },
    })
    const doomed = pages.docs[1]
    if (doomed === undefined) throw new Error('the fixture made no second page')
    await payload.db.deleteOne({ collection: 'pages', where: { id: { equals: doomed.id } } })

    const view = await readJourneyEditor(payload, scope, aJourneyId(journey))

    expect(view?.pages.map((page) => page.title)).toEqual(['Notes'])
    expect(view?.pages.map((page) => String(page.id))).toEqual([String(pages.docs[0]?.id)])
  })

  it('still shows every page whose row is really there, so the guard above drops nothing real', async () => {
    // The permitted side of the same boundary: a page deleted the way the editor
    // deletes one leaves no version behind, and the pages that remain are drawn.
    const { journey, pages } = await aJourneyWithPages('orphan-control', ['Notes', 'Frames I'])
    const doomed = pages[1]
    if (doomed === undefined) throw new Error('the fixture made no second page')
    await payload.delete({ collection: 'pages', id: doomed, ...scope })

    const view = await readJourneyEditor(payload, scope, aJourneyId(journey))

    expect(view?.pages.map((page) => page.title)).toEqual(['Notes'])
  })

  it('names an untitled page rather than drawing a card with no name on it', async () => {
    // `title` is optional on the collection, and a page created outside
    // `pageMutations.ts` can have none — the card would otherwise be a blank
    // rectangle nobody can tell from its neighbour.
    const { journey } = await aJourneyWithPages('untitled', [])
    await payload.create({
      collection: 'pages',
      ...scope,
      data: { journey, kind: 'frames', order: 0, _status: 'published' },
    })

    const view = await readJourneyEditor(payload, scope, aJourneyId(journey))

    expect(view?.pages.map((page) => page.title)).toEqual(['Untitled'])
  })

  it('puts a duration chip on a clip and none on a still', async () => {
    const { journey } = await aJourneyWithPages('clip', [])
    const png = await sharp({ create: { width: 400, height: 400, channels: 3, background: { r: 1, g: 1, b: 1 } } })
      .png()
      .toBuffer()
    await payload.create({
      collection: 'media',
      data: { journey, kind: 'clip', durationSec: 24, state: 'ready', alt: `${MARKER} clipone` },
      file: { data: png, mimetype: 'image/png', name: `${MARKER}-clipone.png`, size: png.length },
    })
    await payload.create({
      collection: 'media',
      data: { journey, kind: 'clip', state: 'ready', alt: `${MARKER} cliptwo` },
      file: { data: png, mimetype: 'image/png', name: `${MARKER}-cliptwo.png`, size: png.length },
    })
    await aPoolItem(journey, 'stillone', false)

    const view = await readJourneyEditor(payload, scope, aJourneyId(journey))

    // A clip whose length was never measured prints NO chip rather than
    // `0:00` — `clipDuration`'s own decision, and the `?? undefined` here is
    // what lets a `null` column reach it as the `undefined` it expects.
    expect(view?.pool.find((item) => item.alt.endsWith('cliptwo'))?.duration).toBeNull()
    // Found by alt rather than by place: `media.order` is empty on both, so
    // which one Postgres returns first is its choice and not this module's.
    expect(view?.pool.find((item) => item.alt.endsWith('clipone'))?.duration).toBe('0:24')
    expect(view?.pool.find((item) => item.alt.endsWith('stillone'))?.duration).toBeNull()
  })

  it('reads a media row with no alt as empty text, never as undefined', async () => {
    const { journey } = await aJourneyWithPages('bare', [])
    const png = await sharp({ create: { width: 400, height: 400, channels: 3, background: { r: 2, g: 2, b: 2 } } })
      .png()
      .toBuffer()
    await payload.create({
      collection: 'media',
      data: { journey, state: 'ready' },
      file: { data: png, mimetype: 'image/png', name: `${MARKER}-bare.png`, size: png.length },
    })

    const view = await readJourneyEditor(payload, scope, aJourneyId(journey))

    expect(view?.pool[0]).toMatchObject({ alt: '' })
  })

  it('draws no thumbnail for an upload too small to have one, rather than reaching for the original', async () => {
    // Payload omits a tier whose target exceeds the source, so a 100px original
    // has no `thumb` at all (`apps/web/collections/media.ts`'s `imageSizes`).
    const { journey } = await aJourneyWithPages('tiny', ['Notes'])
    await aPoolItem(journey, 'tiny', false, 100)

    const view = await readJourneyEditor(payload, scope, aJourneyId(journey))

    expect(view?.pool[0]?.thumbSrc).toBeNull()
  })

  it('leaves another journey’s media out of this journey’s pool', async () => {
    const mine = await aJourneyWithPages('mine', ['Notes'])
    const theirs = await aJourneyWithPages('theirs', ['Notes'])
    await aPoolItem(mine.journey, 'mineone', false)
    await aPoolItem(theirs.journey, 'theirsone', false)

    const view = await readJourneyEditor(payload, scope, aJourneyId(mine.journey))

    expect(view?.pool.map((item) => item.alt)).toEqual([`${MARKER} mineone`])
  })

  it('asks the database a fixed number of questions however many pages there are', async () => {
    const { journey } = await aJourneyWithPages('cost', ['Notes', 'Frames I'])
    const find = vi.spyOn(payload, 'find')

    await readJourneyEditor(payload, scope, aJourneyId(journey))
    const asked = find.mock.calls.map(([options]) => options.collection)

    await payload.create({
      collection: 'pages',
      ...scope,
      data: { journey, kind: 'frames', title: 'Frames II', order: 2, _status: 'published' },
    })
    await payload.create({
      collection: 'pages',
      ...scope,
      data: { journey, kind: 'frames', title: 'Frames III', order: 3, _status: 'published' },
    })

    find.mockClear()
    await readJourneyEditor(payload, scope, aJourneyId(journey))
    const askedWithTwoMore = find.mock.calls.map(([options]) => options.collection)

    expect(asked).toEqual(['journeys', 'pages', 'media'])
    expect(askedWithTwoMore).toEqual(asked)
    expect(askedWithTwoMore).toHaveLength(QUERIES_PER_READ)
    find.mockRestore()
  })

  it('asks nothing more once the journey is not there', async () => {
    const find = vi.spyOn(payload, 'find')

    await readJourneyEditor(payload, scope, aJourneyId(2_000_000_001))

    expect(find.mock.calls.map(([options]) => options.collection)).toEqual(['journeys'])
    find.mockRestore()
  })

  it('runs every query under the scope it was handed, with Payload’s access rules on', async () => {
    const { journey } = await aJourneyWithPages('scope', ['Notes'])
    const find = vi.spyOn(payload, 'find')

    await readJourneyEditor(payload, scope, aJourneyId(journey))

    // IDENTITY, not equality: every call must carry the very object the caller
    // hoisted. A module that called `adminScope` itself, once per query, would
    // hand over freshly-read rows that compare equal field by field and are one
    // `users` lookup each.
    expect(find.mock.calls).toHaveLength(QUERIES_PER_READ)
    expect(find.mock.calls.every(([options]) => options.user === scope.user)).toBe(true)
    find.mockRestore()
  })
})
