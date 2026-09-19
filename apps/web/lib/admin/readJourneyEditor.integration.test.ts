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
import { isRowId, journeyId, userId, type JourneyId, type UserId } from '@travel-diary/domain/ids'
import type { Payload } from 'payload'
import sharp from 'sharp'
import { slotRolesFor } from '@travel-diary/domain/admin/pageSlots'
import { aClip } from '../adapters/contract/media-fixtures'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { Journeys } from '../../collections/journeys'
import { getTestPayload } from '../testPayload'
import { adminScope, type AdminScope } from './adminScope'
import { readJourneyEditor } from './readJourneyEditor'

/**
 * The accent `apps/web/collections/journeys.ts` gives a journey that names none.
 *
 * READ OFF THE COLLECTION, not written down: the point of the case that uses it
 * is that the read answers what the SCHEMA would have, so a literal here would
 * let the two drift and still pass.
 */
const SCHEMA_ACCENT = ((): string => {
  const furniture = Journeys.fields.find((field) => 'name' in field && field.name === 'furniture')
  const accent =
    furniture && 'fields' in furniture
      ? furniture.fields.find((field) => 'name' in field && field.name === 'accent')
      : undefined
  if (accent === undefined || !('defaultValue' in accent) || typeof accent.defaultValue !== 'string') {
    throw new Error('the journeys collection no longer defaults the accent')
  }
  return accent.defaultValue
})()

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
  // THE SAFETY NET FOR THE ORPHANS THIS FILE MAKES ON PURPOSE. Four cases below
  // remove a page's main row through the adapter, which leaves a `_pages_v` row
  // no `where` over `journey` can reach, and each sweeps up after itself. This
  // is what covers the case that FAILS before reaching its own sweep — which is
  // not hypothetical: one mutation run left an orphan behind and the two cases
  // after it failed on a count that was not theirs. `diary_test` is shared by
  // every integration file, and nothing else in the repository creates one.
  await payload.db.deleteVersions({ collection: 'pages', where: { parent: { exists: false } } })
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

  it('answers the schema’s own accent for a journey whose furniture was never written', async () => {
    // WHAT AN EMPTY ONE COSTS, which is why this is a read-side fallback and not
    // a component-side one. `Furniture.tsx` draws a swatch for any accent the
    // five do not offer, so that a stored colour is not silently dropped by a
    // save about something else — and handed `''` it drew exactly the broken
    // swatch it exists to prevent: `linear-gradient(160deg, , …)` is an invalid
    // declaration a browser drops, its radio checked because `'' === ''`, and
    // the form then posts `accent=''` which `notesMutations.ts` refuses.
    //
    // `glyphOf` already falls back to the schema's own default for the same
    // reason one field along, so this is that treatment, not a new one.
    const { journey } = await aJourneyWithPages('noaccent', ['Notes'])
    await payload.update({
      collection: 'journeys',
      id: journey,
      ...scope,
      data: { furniture: { accent: null } },
    })

    const view = await readJourneyEditor(payload, scope, aJourneyId(journey))

    expect(view?.notes.accent).toBe(SCHEMA_ACCENT)
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
    // string. The developer's own `diary` holds THREE SUCH PAGES — Cover,
    // Contents and About — and eighteen version rows between them, six each:
    // measured, because `docs/runbook.md` says "three orphaned `_pages_v` rows"
    // and means three pages. The rail drew three phantom cards, all of them
    // "selected" at once because they shared the id.
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

    // AND THE ORPHAN IS REMOVED HERE, because nothing else in this file can
    // reach it: `clean()` deletes pages by their `journey`, and this version's
    // parent page no longer exists. `diary_test` is shared by every integration
    // file in the run, and a row this file invents on purpose is this file's to
    // take away. The developer's own `diary` keeps its orphans deliberately
    // (`docs/runbook.md`); that is the only place they belong.
    //
    // WHAT A LEFTOVER WOULD AND WOULD NOT HAVE DONE, because this comment got it
    // wrong once and the wrong version shipped. Every `draft: true` read of
    // `pages` in the rest of the run WOULD have seen it, as a document with
    // `id: null` — that is this file's own subject, and the two cases below pin
    // it. A PLAIN read would NOT, which is the rule `docs/runbook.md` states and
    // the rule `readJourneyEditor.ts`'s header turns on. An earlier version of
    // these lines claimed the opposite and blamed a `seed.integration.test.ts`
    // page-count failure on it. The review measured that claim and it is false:
    // with an orphan deliberately left in place, `creates thirty pages` passes.
    // **That count failure is UNATTRIBUTED**, and saying so is the point — the
    // shape still to look for is a real extra `pages` MAIN row surviving
    // somebody's cleanup, and a plausible mechanism would close the question
    // wrongly.
    //
    // BY "HAS NO PARENT", NOT BY THE PAGE'S ID, and that is not a convenience:
    // `_pages_v.parent_id` is `ON DELETE set null`
    // (`apps/web/migrations/20260831_154311_initial.ts`), so by the time this
    // line runs the row no longer remembers which page it belonged to. Asking
    // for `parent: { equals: doomed.id }` matches nothing — pinned by the last
    // case below rather than asserted here. "Every page version whose page is
    // gone" is both the reachable predicate and the exact set that must not
    // survive this file.
    await payload.db.deleteVersions({ collection: 'pages', where: { parent: { exists: false } } })

    // Asserted rather than assumed: a cleanup nothing checks is a cleanup that
    // can stop working silently, and the way this one fails is in another file,
    // minutes later, as a number nobody can attribute.
    const left = await payload.findVersions({
      collection: 'pages',
      ...scope,
      depth: 0,
      pagination: false,
      where: { parent: { exists: false } },
    })
    expect(left.docs).toEqual([])
  })

  it('is invisible to a plain read, which is why the rule is about draft reads and not about orphans', async () => {
    // THE CORRECTION, MADE EXECUTABLE. The comment above this pair used to say a
    // plain `payload.find({ collection: 'pages' })` answers with an orphaned
    // version as a document, and blamed another file's page count on it. It does
    // not. This case and the next are the review's probe landed, so the rule
    // `readJourneyEditor.ts`'s header turns on -- "a `draft: true` read answers
    // from the versions table whatever the collection" -- is pinned from BOTH
    // sides rather than restated. An edit that inverts them fails here.
    const { journey } = await aJourneyWithPages('plain-read', ['Notes'])
    const held = await payload.find({ collection: 'pages', ...scope, depth: 0, limit: 500 })

    await payload.db.deleteOne({ collection: 'pages', where: { journey: { equals: journey } } })

    const after = await payload.find({ collection: 'pages', ...scope, depth: 0, limit: 500 })

    expect(after.totalDocs).toBe(held.totalDocs - 1)
    expect(after.docs.filter((page) => !isRowId(page.id))).toEqual([])

    await payload.db.deleteVersions({ collection: 'pages', where: { parent: { exists: false } } })
  })

  it('is visible to a draft read, as a document with no row behind it', async () => {
    // The other side, and the one that makes `isRowId` necessary at all: the
    // same fixture, the same removal, read the way this module reads.
    const { journey } = await aJourneyWithPages('draft-read', ['Notes'])
    await payload.db.deleteOne({ collection: 'pages', where: { journey: { equals: journey } } })

    const drafted = await payload.find({ collection: 'pages', ...scope, depth: 0, limit: 500, draft: true })

    expect(drafted.docs.filter((page) => !isRowId(page.id))).toHaveLength(1)

    await payload.db.deleteVersions({ collection: 'pages', where: { parent: { exists: false } } })
  })

  it('cannot be addressed by the page it belonged to, because the version lost its parent', async () => {
    // WHY THE CLEANUP'S KEY IS WHAT IT IS, measured rather than argued.
    // `_pages_v.parent_id` is `ON DELETE set null`, so the predicate the obvious
    // spelling would use matches nothing -- which is how the first attempt at
    // that cleanup passed its own run and left the row behind.
    const { pages } = await aJourneyWithPages('orphan-key', ['Notes'])
    const doomed = pages[0]
    if (doomed === undefined) throw new Error('the fixture made no page')
    await payload.db.deleteOne({ collection: 'pages', where: { id: { equals: doomed } } })

    const byId = await payload.findVersions({
      collection: 'pages',
      ...scope,
      depth: 0,
      pagination: false,
      where: { parent: { equals: doomed } },
    })
    const byNoParent = await payload.findVersions({
      collection: 'pages',
      ...scope,
      depth: 0,
      pagination: false,
      where: { parent: { exists: false } },
    })

    expect(byId.docs).toEqual([])
    expect(byNoParent.docs.map((version) => version.parent)).toEqual([null])

    await payload.db.deleteVersions({ collection: 'pages', where: { parent: { exists: false } } })
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

describe('readJourneyEditor’s slot cells', () => {
  it('draws two cells for a Notes page and four for a Frames page, whatever the row holds', async () => {
    // THE PANE'S ARITHMETIC, NOT THE ARRAY'S. Both pages here were created
    // with no `slots` at all, which is what `addPageRow` writes — so a read
    // that answered `slots.length` would give the author no cells to fill.
    const { journey } = await aJourneyWithPages('cellcount', ['Notes', 'Frames I'])

    const view = await readJourneyEditor(payload, scope, aJourneyId(journey))

    expect(view?.pages.map((page) => page.slots.length)).toEqual([
      slotRolesFor('notes').length,
      slotRolesFor('frames').length,
    ])
  })

  it('keys every cell by its page and its cell, which is the defect §2.3 names', async () => {
    // "Tokyo/Frames I must not share Tokyo/Frames II" — so no two cells in one
    // journey may carry the same key, and a key built from the cell alone
    // would give the two frames pages four collisions.
    const { journey } = await aJourneyWithPages('cellkeys', ['Frames I', 'Frames II'])

    const view = await readJourneyEditor(payload, scope, aJourneyId(journey))
    const keys = (view?.pages ?? []).flatMap((page) => page.slots.map((slot) => slot.key))

    expect(keys.length).toBe(slotRolesFor('frames').length * 2)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('carries a stored cell’s photograph, words and focal point', async () => {
    const { journey, pages } = await aJourneyWithPages('cellcontent', ['Frames I'])
    const media = await aPoolItem(journey, 'cellcontent', false, 1600)
    await payload.update({
      collection: 'pages',
      id: Number(pages[0]),
      ...scope,
      data: {
        slots: [{ role: 'frame', media, caption: 'Alfama, from a step', alt: 'A tiled stair', focalX: 12, focalY: 87 }],
      },
    })

    const view = await readJourneyEditor(payload, scope, aJourneyId(journey))
    const slot = view?.pages[0]?.slots[0]

    expect({ caption: slot?.caption, alt: slot?.alt, focal: slot?.focal, media: slot?.media }).toEqual({
      caption: 'Alfama, from a step',
      alt: 'A tiled stair',
      focal: { x: 12, y: 87 },
      media: String(media),
    })
  })

  it('previews a cell from an UNCROPPED derivative, because that is what the focal point aims at', async () => {
    // WHAT PRODUCED THE RIGHT SIDE: the media row's own `sizes` map, read back
    // from the database. A preview drawn from `thumb` — a 400x400 centre crop
    // — would let an author aim at pixels the book's own ladder never sees.
    const { journey, pages } = await aJourneyWithPages('cellpreview', ['Frames I'])
    const media = await aPoolItem(journey, 'cellpreview', false, 1600)
    await payload.update({
      collection: 'pages',
      id: Number(pages[0]),
      ...scope,
      data: { slots: [{ role: 'frame', media }] },
    })

    const row = await payload.findByID({ collection: 'media', id: media, depth: 0 })
    const view = await readJourneyEditor(payload, scope, aJourneyId(journey))

    expect(row.sizes?.frame?.url, 'the fixture generated no frame tier, so this case proves nothing').toBeTruthy()
    expect(view?.pages[0]?.slots[0]?.previewSrc).toBe(row.sizes?.frame?.url)
  })

  it('draws an empty cell for a slot with no photograph in it', async () => {
    const { journey } = await aJourneyWithPages('cellempty', ['Frames I'])

    const view = await readJourneyEditor(payload, scope, aJourneyId(journey))
    const slot = view?.pages[0]?.slots[0]

    expect({ media: slot?.media, previewSrc: slot?.previewSrc, caption: slot?.caption, alt: slot?.alt }).toEqual({
      media: null,
      previewSrc: null,
      caption: '',
      alt: '',
    })
  })

  it('centres a cell the author has never clicked, which is the column’s own default', async () => {
    const { journey } = await aJourneyWithPages('cellcentre', ['Frames I'])

    const view = await readJourneyEditor(payload, scope, aJourneyId(journey))

    expect(view?.pages[0]?.slots[0]?.focal).toEqual({ x: 50, y: 50 })
  })

  it('draws an empty cell for a row with no uncropped derivative at all', async () => {
    // NO RASTER UPLOAD CAN BE THIS FIXTURE, and the first version of this case
    // tried to be one: a 100x100 PNG, "too small for any uncropped tier". That
    // was true before MED-001's fix and false since — `frame` carries
    // `withoutEnlargement: true` precisely so no original is too small for an
    // uncropped derivative, and the sentinel below is what said so. A CLIP is
    // what is left: Payload's `canResizeImage` refuses a video mime type, so
    // the row carries no `sizes` at all, and `pages.slots[].media` relates to
    // the whole `media` collection. `readBookBundle.integration.test.ts` uses
    // the same fixture for the same reason.
    const { journey, pages } = await aJourneyWithPages('cellnotier', ['Frames I'])
    const clip = Buffer.from(await aClip())
    const media = await payload.create({
      collection: 'media',
      data: { journey, kind: 'clip', alt: `${MARKER} cellnotier`, state: 'ready' },
      file: { data: clip, mimetype: 'video/mp4', name: `${MARKER}-cellnotier.mp4`, size: clip.length },
    })
    await payload.update({
      collection: 'pages',
      id: Number(pages[0]),
      ...scope,
      data: { slots: [{ role: 'frame', media: media.id }] },
    })

    const row = await payload.findByID({ collection: 'media', id: media.id, depth: 0 })
    const view = await readJourneyEditor(payload, scope, aJourneyId(journey))

    expect(row.sizes?.frame?.url, 'the fixture DID generate a frame tier, so this case proves nothing').toBeFalsy()
    expect(view?.pages[0]?.slots[0]?.previewSrc).toBeNull()
    // AND THE CELL IS STILL THERE, with its photograph named: the author has
    // to be able to see which row will not draw, and Clear it.
    expect(view?.pages[0]?.slots[0]?.media).toBe(String(media.id))
  })

  it('says a clip loops and a still does not, which is §2.3’s motion badge', async () => {
    const { journey, pages } = await aJourneyWithPages('cellmotion', ['Frames I'])
    const still = await aPoolItem(journey, 'cellmotion-still', false, 1600)
    const clip = await aPoolItem(journey, 'cellmotion-clip', false, 1600)
    await payload.update({ collection: 'media', id: clip, ...scope, data: { kind: 'clip' } })
    await payload.update({
      collection: 'pages',
      id: Number(pages[0]),
      ...scope,
      data: {
        slots: [
          { role: 'frame', media: still },
          { role: 'frame', media: clip },
        ],
      },
    })

    const view = await readJourneyEditor(payload, scope, aJourneyId(journey))

    expect(view?.pages[0]?.slots.map((slot) => slot.loops)).toEqual([false, true, false, false])
  })

  it('does not draw a stored row past the last cell its pane has', async () => {
    // A notes page has two cells. A third stored row — which Copy from a
    // frames page can produce — is a row the public book never renders, so
    // offering it here would be a frame that saves and never prints.
    const { journey, pages } = await aJourneyWithPages('cellextra', ['Notes'])
    const media = await aPoolItem(journey, 'cellextra', false, 1600)
    await payload.update({
      collection: 'pages',
      id: Number(pages[0]),
      ...scope,
      data: {
        slots: [
          { role: 'hero', media },
          { role: 'ephemera', media },
          { role: 'frame', media },
        ],
      },
    })

    const view = await readJourneyEditor(payload, scope, aJourneyId(journey))

    expect(view?.pages[0]?.slots.map((slot) => slot.role)).toEqual(slotRolesFor('notes'))
  })
})
