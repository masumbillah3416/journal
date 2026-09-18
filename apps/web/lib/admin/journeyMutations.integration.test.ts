/**
 * journeyMutations.integration.test.ts — what the Journeys screen's four
 * actions actually do to the database.
 *
 * Integration test (CLAUDE.md §2): every property here is Payload's or
 * Postgres's. Whether a create lands as a draft, whether a unique index refuses
 * a second "Kyoto", whether a copied page keeps its slots, and — the one that
 * matters most — whether a soft delete leaves the row where the trash screen
 * can find it, are all answers a stub would give by agreeing with itself.
 *
 * THE SOFT DELETE IS ASSERTED FROM BOTH SIDES, because only one of them is the
 * point. A `payload.delete` would satisfy "the list no longer shows it" — which
 * is why the case below reads the ROW back afterwards and requires it to be
 * there with a `deletedAt` on it.
 *
 * Uses `getTestPayload()` rather than `getPayload()`, like every integration
 * file here, so these rows land in the isolated `diary_test` database.
 *
 * Depends on: vitest, payload (types), @travel-diary/domain/ids, ../testPayload,
 * ./adminScope, ./journeyMutations, ./readJourneysScreen.
 */
import { userId, type UserId } from '@travel-diary/domain/ids'
import type { Payload } from 'payload'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Journeys } from '../../collections/journeys'
import { getTestPayload } from '../testPayload'
import { adminScope, type AdminScope } from './adminScope'
import {
  createJourneyRow,
  duplicateJourneyRow,
  NEW_JOURNEY_PAGES,
  readJourneyRef,
  readNewJourney,
  softDeleteJourney,
  toggleJourneyArchived,
} from './journeyMutations'
import { readJourneysScreen } from './readJourneysScreen'

/** What every row this file writes carries, so cleanup can find them all. */
const MARKER = 'test-journey-mutations'

/**
 * The journey columns a copy is DEFINED not to carry, each with its reason.
 *
 * ═══ AN EXCLUSION LIST, SO THE CARRY LIST IS INVERTED ═══
 *
 * `duplicateJourneyRow` used to be judged by cases that each named the fields
 * they checked, so the two it silently dropped — `order` and
 * `hiddenFromBookmarks` — passed every one of them (review round 1, finding 3).
 * That is the enumeration CLAUDE.md §3.3's rejected anti-patterns and this
 * repository's standing orders both say to invert: a field added to
 * `apps/web/collections/journeys.ts` by a later task now fails the case below
 * until somebody decides about it, rather than being dropped in silence.
 *
 * THE LAST THREE ARE PAYLOAD'S OWN, and they are named rather than filtered out
 * by shape: `sanitizeCollection` MUTATES the imported config and appends
 * `updatedAt`, `createdAt` and `_status` to `fields`, so the derivation below
 * does reach them once Payload has booted. Measured — the first version of this
 * case said they were "not in the collection's own field list at all" and
 * failed on all three.
 */
const NOT_COPIED: Readonly<Record<string, string>> = {
  name: 'the copy is "<name> (copy)"',
  slug: 'unique on the collection; the copy takes a free one',
  archived: 'a copy starts off the archive shelf, whatever the source was on',
  deletedAt: 'a copy starts out of the trash, whatever the source was in',
  createdAt: "Payload's own; the copy is new",
  updatedAt: "Payload's own; the copy is new",
  _status: 'a copy is always a draft, whatever the source was',
}

/**
 * The three fields `createJourneyRow` sets from the create panel's own inputs.
 *
 * They are not in the fixture literal below because the fixture is an UPDATE
 * over an already-created journey, and the sentinel has to count them as
 * written — `name` is a `NOT_COPIED` exception, and `place` and `dates` are
 * carried and set.
 */
const SET_BY_CREATE: readonly string[] = ['name', 'place', 'dates']

/**
 * Every field `apps/web/collections/journeys.ts` declares, by name.
 *
 * Read off the collection config rather than written down, which is the whole
 * point: this is the list that grows when a task adds a field.
 */
const DECLARED_FIELDS: readonly string[] = Journeys.fields.flatMap((field) =>
  'name' in field && typeof field.name === 'string' ? [field.name] : [],
)

/**
 * A value with every array row's own `id` removed.
 *
 * Payload mints an `id` per array row, so a copy's rows can never equal the
 * source's by identity — what has to match is everything else.
 * @param value - A field's value as Payload returned it.
 * @returns The same value with `id` dropped from every object in it.
 */
const withoutRowIds = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(withoutRowIds)
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== 'id')
        .map(([key, nested]) => [key, withoutRowIds(nested)]),
    )
  }
  return value
}

/** A password that is not one: this account is never signed in to. */
const NOT_A_PASSWORD = 'not-a-real-password'

let payload: Payload
let scope: AdminScope

/**
 * Rows whose NAME cannot carry {@link MARKER}, so `clean` cannot find them.
 *
 * One case needs a journey whose name holds no letter or digit at all — the
 * only input `slugStem` answers with the empty string — so it cannot also hold
 * the marker. Its id is remembered here instead.
 */
const strays: number[] = []

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
 * The `FormData` a browser would send from the create panel.
 *
 * FORM DATA, NOT AN OBJECT LITERAL, and that is the point rather than
 * incidental: the only thing that ever calls `readNewJourney` is a
 * `<form action={createJourney}>`, so an object fixture would be a shape no
 * client produces — and the parse it exercises would not be the one that runs.
 * @param fields - What the three inputs hold.
 * @returns The form body.
 */
const aForm = (fields: Readonly<Record<string, string>>): FormData => {
  const form = new FormData()
  for (const [name, value] of Object.entries(fields)) form.append(name, value)
  return form
}

/** Removes every row this file has ever written. */
const clean = async (): Promise<void> => {
  await payload.delete({ collection: 'media', where: { alt: { like: MARKER } } })
  const journeys = await payload.find({
    collection: 'journeys',
    where: { name: { like: MARKER } },
    pagination: false,
    depth: 0,
  })
  for (const journey of journeys.docs) {
    await payload.delete({ collection: 'pages', where: { journey: { equals: journey.id } } })
  }
  await payload.delete({ collection: 'journeys', where: { name: { like: MARKER } } })
  await payload.delete({ collection: 'users', where: { email: { like: MARKER } } })
}

beforeAll(async () => {
  payload = await getTestPayload()
  await clean()
  const account = await payload.create({
    collection: 'users',
    data: { email: `${MARKER}@example.test`, password: NOT_A_PASSWORD },
  })
  scope = await adminScope({ user: anAccount(String(account.id)) })
}, 120_000)

afterAll(async () => {
  for (const id of strays) {
    await payload.delete({ collection: 'pages', where: { journey: { equals: id } } })
    await payload.delete({ collection: 'journeys', id })
  }
  await clean()
})

describe('readNewJourney', () => {
  it('reads the three fields the panel sends', () => {
    expect(readNewJourney(aForm({ name: ' Kyoto ', place: 'Japan', dates: '28 Oct – 6 Nov 2026' }))).toEqual({
      name: 'Kyoto',
      place: 'Japan',
      dates: '28 Oct – 6 Nov 2026',
    })
  })

  it('refuses a field that is only whitespace, which `required` in the browser never sees', () => {
    // A Server Action is a POST endpoint anybody with the action id can reach
    // (`guard.ts`'s header), so the input is untrusted even though the guard
    // admitted the caller. `required` on the input is a convenience, not this.
    expect(() => readNewJourney(aForm({ name: '   ', place: 'Japan', dates: 'one day' }))).toThrow()
  })

  it('refuses a body missing a field outright, rather than creating half a journey', () => {
    expect(() => readNewJourney(aForm({ name: 'Kyoto', place: 'Japan' }))).toThrow()
  })
})

describe('readJourneyRef', () => {
  it('reads the row id the strip’s hidden field carries', () => {
    expect(readJourneyRef(aForm({ journey: '42' }))).toBe(42)
  })

  it('refuses anything that is not a row id, so nothing reaches the driver as NaN', () => {
    expect(() => readJourneyRef(aForm({ journey: 'nonsense' }))).toThrow()
    expect(() => readJourneyRef(aForm({ journey: '0' }))).toThrow()
    expect(() => readJourneyRef(aForm({ journey: '-3' }))).toThrow()
    expect(() => readJourneyRef(aForm({ journey: '1.5' }))).toThrow()
  })
})

describe('createJourneyRow', () => {
  it('creates the journey as a draft, which is what the panel’s own line promises', async () => {
    const id = await createJourneyRow(payload, scope, { name: `${MARKER} Kyoto`, place: 'Japan', dates: 'one week' })

    const row = await payload.findByID({ collection: 'journeys', id, ...scope, depth: 0 })
    expect(row._status).toBe('draft')
    expect(row.archived).toBe(false)
    expect((await readJourneysScreen(payload, scope, { search: `${MARKER} Kyoto`, filter: 'all' }))[0]?.status).toBe(
      'draft',
    )
  })

  it('creates the three pages the panel says it creates, in the order the editor opens them', async () => {
    // The panel prints "three pages are created — notes, then two of frames".
    // This is that sentence, asked of the database.
    const id = await createJourneyRow(payload, scope, { name: `${MARKER} Lisbon`, place: 'Portugal', dates: 'a week' })

    const pages = await payload.find({
      collection: 'pages',
      ...scope,
      depth: 0,
      pagination: false,
      sort: 'order',
      where: { journey: { equals: id } },
    })

    expect(pages.docs.map((page) => [page.title, page.kind])).toEqual(
      NEW_JOURNEY_PAGES.map((page) => [page.title, page.kind]),
    )
    expect(pages.docs.map((page) => page.kind)).toEqual(['notes', 'frames', 'frames'])
  })

  it('gives a journey whose name has no letters or digits a slug of its own', async () => {
    // `slugStem` answers the empty string for a name of pure punctuation, and
    // an empty slug would make every such journey collide with every other —
    // on a column the collection declares `unique`. The name cannot carry the
    // marker (that would give it letters), so the row is cleaned up by id.
    const first = await createJourneyRow(payload, scope, { name: '———', place: 'Nowhere', dates: 'a day' })
    strays.push(first)
    const second = await createJourneyRow(payload, scope, { name: '!!!', place: 'Nowhere', dates: 'a day' })
    strays.push(second)

    const slugs = await Promise.all(
      [first, second].map(
        async (id) => (await payload.findByID({ collection: 'journeys', id, ...scope, depth: 0 })).slug,
      ),
    )
    expect(slugs.every((slug) => slug !== '')).toBe(true)
    expect(new Set(slugs).size).toBe(2)
  })

  it('does not collide with a journey that already has that name, which the unique index would refuse', async () => {
    const first = await createJourneyRow(payload, scope, { name: `${MARKER} Same`, place: 'Spain', dates: 'a day' })
    const second = await createJourneyRow(payload, scope, { name: `${MARKER} Same`, place: 'Spain', dates: 'a day' })

    const slugs = await Promise.all(
      [first, second].map(
        async (id) => (await payload.findByID({ collection: 'journeys', id, ...scope, depth: 0 })).slug,
      ),
    )
    expect(new Set(slugs).size).toBe(2)
  })
})

describe('duplicateJourneyRow', () => {
  it('copies the journey and its pages, always as drafts and never under the same slug', async () => {
    const source = await createJourneyRow(payload, scope, {
      name: `${MARKER} Bergen`,
      place: 'Norway',
      dates: '3 – 9 June 2025',
    })
    await payload.update({ collection: 'journeys', id: source, ...scope, data: { _status: 'published' } })
    // The SOURCE's pages are published too, which is what makes the assertion
    // about the copies' `_status` below load-bearing: a page created with no
    // `draft` flag takes the field's own `draft` default, so copying an
    // already-draft page proves nothing about the flag.
    await payload.update({
      collection: 'pages',
      ...scope,
      where: { journey: { equals: source } },
      data: { _status: 'published' },
    })

    const copy = await duplicateJourneyRow(payload, scope, source)

    const [original, duplicated] = await Promise.all(
      [source, copy].map((id) => payload.findByID({ collection: 'journeys', id, ...scope, depth: 0 })),
    )
    const pages = await payload.find({
      collection: 'pages',
      ...scope,
      depth: 0,
      pagination: false,
      where: { journey: { equals: copy } },
    })

    expect(copy).not.toBe(source)
    expect(duplicated?.name).toBe(`${original?.name ?? ''} (copy)`)
    expect(duplicated?.place).toBe('Norway')
    expect(duplicated?.slug).not.toBe(original?.slug)
    // The copy is a draft even though the source was published — a duplicate
    // that went out the moment it was made would publish an unedited copy of
    // somebody's journey.
    expect(duplicated?._status).toBe('draft')
    expect(pages.docs).toHaveLength(NEW_JOURNEY_PAGES.length)
    expect(pages.docs.every((page) => page._status === 'draft')).toBe(true)
  })

  it('carries each page’s slots over, with row ids of their own rather than the source’s', async () => {
    // THE SLOTS ARE THE PAGE. A copy that dropped them would leave the author
    // three empty spreads that look like a journey until they open one — and a
    // copy that carried the SOURCE's array row ids over would ask Payload to
    // create rows that already exist.
    const source = await createJourneyRow(payload, scope, { name: `${MARKER} Slots`, place: 'Japan', dates: 'a week' })
    const pages = await payload.find({
      collection: 'pages',
      ...scope,
      depth: 0,
      pagination: false,
      sort: 'order',
      where: { journey: { equals: source } },
    })
    const frames = pages.docs[1]
    if (frames === undefined) throw new Error('the fixture journey has no second page')
    const png = await sharp({ create: { width: 60, height: 60, channels: 3, background: { r: 9, g: 9, b: 9 } } })
      .png()
      .toBuffer()
    const photograph = (
      await payload.create({
        collection: 'media',
        ...scope,
        data: { journey: source, alt: `${MARKER} still`, state: 'ready' },
        file: { data: png, mimetype: 'image/png', name: `${MARKER}-slot.png`, size: png.length },
      })
    ).id
    await payload.update({
      collection: 'pages',
      id: frames.id,
      ...scope,
      data: {
        // One slot with every field set and one with none of them: both arms of
        // every fallback in the copy, from a shape the editor really produces
        // (a slot is added before a photograph is dropped into it).
        slots: [
          { role: 'hero', media: photograph, caption: 'Rain on the fjord', alt: 'A wet wharf', focalX: 30, focalY: 70 },
          {},
        ],
      },
    })
    // A page with neither title nor layout, which is what an editor that adds a
    // page before naming it leaves behind.
    await payload.create({
      collection: 'pages',
      ...scope,
      data: { journey: source, kind: 'frames', order: 9 },
    })

    const copy = await duplicateJourneyRow(payload, scope, source)

    const copied = await payload.find({
      collection: 'pages',
      ...scope,
      depth: 0,
      pagination: false,
      sort: 'order',
      where: { journey: { equals: copy } },
    })
    const copiedFrames = copied.docs[1]
    expect(
      copiedFrames?.slots?.map((slot) => [slot.role, slot.media, slot.caption, slot.alt, slot.focalX, slot.focalY]),
    ).toEqual([
      ['hero', photograph, 'Rain on the fjord', 'A wet wharf', 30, 70],
      [null, null, null, null, 50, 50],
    ])
    expect(copiedFrames?.slots?.every((slot) => !frames.slots?.some((original) => original.id === slot.id))).toBe(true)
    expect(copied.docs).toHaveLength(NEW_JOURNEY_PAGES.length + 1)
  })

  it('carries the journey’s own furniture over, so a copy is not a blank page', async () => {
    const source = await createJourneyRow(payload, scope, { name: `${MARKER} Full`, place: 'Iceland', dates: 'a week' })
    await payload.update({
      collection: 'journeys',
      id: source,
      ...scope,
      data: {
        startsOn: '2025-05-02T00:00:00.000Z',
        weather: 'CLEAR 14C',
        mood: 'WIDE EYED',
        weatherGlyph: 'haze',
        note: 'The heat organises the day for you.',
        highlights: [{ text: 'Orange trees everywhere' }],
        // The fourth entry is EMPTY on purpose: `tally` is `minRows: 4`, and a
        // journey the author has not finished counting leaves a row blank.
        tally: [
          { key: 'Days', value: '7' },
          { key: 'Kilometres walked', value: '48' },
          { key: 'Rolls shot', value: '3' },
          {},
        ],
      },
    })

    const copy = await duplicateJourneyRow(payload, scope, source)

    const copied = await payload.findByID({ collection: 'journeys', id: copy, ...scope, depth: 0 })
    expect([copied.weather, copied.mood, copied.weatherGlyph, copied.note]).toEqual([
      'CLEAR 14C',
      'WIDE EYED',
      'haze',
      'The heat organises the day for you.',
    ])
    expect(copied.highlights?.map((highlight) => highlight.text)).toEqual(['Orange trees everywhere'])
    expect(copied.tally?.map((entry) => [entry.key, entry.value])).toEqual([
      ['Days', '7'],
      ['Kilometres walked', '48'],
      ['Rolls shot', '3'],
      [null, null],
    ])
  })

  it('carries every column the collection declares that a copy is not defined to drop', async () => {
    // REVIEW ROUND 1, FINDING 3, and the case is written the way the finding
    // asks: the fields come from the COLLECTION, the exceptions are named with
    // their reasons, and everything else has to match. `order` and
    // `hiddenFromBookmarks` were the two being dropped; a field added tomorrow
    // fails here rather than being dropped in silence.
    //
    // THE SENTINEL IS BUILT FROM THE FIXTURE'S OWN KEYS, NOT FROM NULL-NESS,
    // and that is fix round 2's finding 2. Asking whether the source's value is
    // null is blind to every field with a `defaultValue` — Payload fills those
    // on the copy as well as on the source, so the sentinel stayed quiet and
    // the comparison passed two equal defaults. Three of this collection's
    // fields are like that, INCLUDING `hiddenFromBookmarks`, one of the two the
    // inversion was written to protect: the reviewer stopped the copy carrying
    // it, removed it from the fixture, and all eighteen cases passed. Keyed on
    // the fixture instead, a field added to the collection fails whatever its
    // default.
    //
    // EVERY VALUE BELOW DIFFERS FROM THE FIELD'S OWN DEFAULT, for the same
    // reason: a fixture that set `weatherGlyph: 'sun'` would compare two
    // defaults even with the sentinel satisfied.
    const scope2 = scope
    const written = {
      startsOn: '2025-06-04T00:00:00.000Z',
      order: 7,
      hiddenFromBookmarks: true,
      weather: 'RAIN 9C',
      mood: 'SOAKED',
      weatherGlyph: 'haze' as const,
      furniture: { signoff: 'until next time', stampCountry: 'ISLAND', stampValue: '2.10', accent: '#a06b3e' },
      highlights: [{ text: 'Rain on the fjord' }],
      note: 'The weather organises the day for you.',
      tally: [
        { key: 'Days', value: '7' },
        { key: 'Kilometres walked', value: '48' },
        { key: 'Rolls shot', value: '3' },
        { key: 'Rainy days', value: '5' },
      ],
    }
    const source = await createJourneyRow(payload, scope2, {
      name: `${MARKER} Whole`,
      place: 'Iceland',
      dates: '4 – 11 June 2025',
    })
    await payload.update({ collection: 'journeys', id: source, ...scope2, data: written })

    const copy = await duplicateJourneyRow(payload, scope2, source)
    const [original, duplicated] = await Promise.all(
      [source, copy].map(async (id): Promise<Record<string, unknown>> => ({
        // `Promise.all` over a two-element map gives `Journey | undefined`,
        // and every read below is by a name the collection supplies rather
        // than one this file invented — so the widening is to a record of
        // unknowns, narrowed by the comparison itself, not a cast to a shape.
        ...(await payload.findByID({ collection: 'journeys', id, ...scope2, depth: 0 })),
      })),
    )
    const carried = DECLARED_FIELDS.filter((field) => !(field in NOT_COPIED))

    // THE SENTINEL, and it is the half that makes this inverting rather than
    // decorative: every carried field must be one the fixture ACTUALLY WRITES,
    // or the comparison below compares two defaults and passes for a field the
    // copy drops. A field added to the collection lands here first.
    expect(
      carried.filter((field) => !(field in written) && !SET_BY_CREATE.includes(field)),
      'the fixture above does not write every field the journeys collection declares, so the comparison below would pass over them',
    ).toEqual([])

    expect(carried.map((field) => [field, withoutRowIds((duplicated as Record<string, unknown>)[field])])).toEqual(
      carried.map((field) => [field, withoutRowIds((original as Record<string, unknown>)[field])]),
    )
  })

  it('starts the copy off the shelf and out of the trash, whatever the source was in', async () => {
    // The other side of {@link NOT_COPIED}: the four exceptions are exceptions
    // because a copy is DEFINED to differ, not because nobody looked.
    const scope2 = scope
    const source = await createJourneyRow(payload, scope2, { name: `${MARKER} Shelved`, place: 'Peru', dates: 'a day' })
    await payload.update({
      collection: 'journeys',
      id: source,
      ...scope2,
      data: { archived: true, deletedAt: new Date().toISOString() },
    })

    const copy = await duplicateJourneyRow(payload, scope2, source)

    const duplicated = await payload.findByID({ collection: 'journeys', id: copy, ...scope2, depth: 0 })
    expect(duplicated.archived).toBe(false)
    expect(duplicated.deletedAt ?? null).toBeNull()
  })

  it('leaves the source journey’s own pages where they were, rather than moving them', async () => {
    const source = await createJourneyRow(payload, scope, { name: `${MARKER} Oslo`, place: 'Norway', dates: 'a week' })
    const before = await payload.count({ collection: 'pages', ...scope, where: { journey: { equals: source } } })

    await duplicateJourneyRow(payload, scope, source)

    const after = await payload.count({ collection: 'pages', ...scope, where: { journey: { equals: source } } })
    expect(after.totalDocs).toBe(before.totalDocs)
  })
})

describe('toggleJourneyArchived', () => {
  it('puts a journey on the shelf and takes it off again, which is what one button has to do', async () => {
    const id = await createJourneyRow(payload, scope, { name: `${MARKER} Shelf`, place: 'Wales', dates: 'a day' })

    await toggleJourneyArchived(payload, scope, id)
    const shelved = await payload.findByID({ collection: 'journeys', id, ...scope, depth: 0 })

    await toggleJourneyArchived(payload, scope, id)
    const back = await payload.findByID({ collection: 'journeys', id, ...scope, depth: 0 })

    expect(shelved.archived).toBe(true)
    expect(back.archived).toBe(false)
  })
})

describe('the two flag writes, over a journey with a pending draft', () => {
  // FIX-ROUND-2 FINDING 1. `archived` and `deletedAt` are operational flags on
  // a collection with `versions.drafts` on, and Payload's `update` merges the
  // change into the LATEST VERSION — which, for a journey in the `edited`
  // state, is the author's unpublished rewrite. So one press of Archive used to
  // write that rewrite into the main row and mark it `draft`: the journey left
  // the public book and the only way back was to publish the half-finished
  // text. `softDeleteJourney` is the same two lines, so the §2.10 trash round
  // trip did it too.
  //
  // Both cases here assert the SAME three facts, because all three have to
  // hold: what the public book reads is unchanged, the journey is still
  // published, and the pending draft is still pending.

  /**
   * A published journey with an unpublished rewrite waiting on top of it.
   * @param label - What distinguishes this fixture's slug from the others'.
   * @returns The row id, and the name the public book still shows.
   */
  const aJourneyWithAPendingDraft = async (label: string): Promise<{ id: number; published: string }> => {
    const published = `${MARKER} ${label}`
    const id = await createJourneyRow(payload, scope, { name: published, place: 'Spain', dates: '2 – 9 May 2025' })
    await payload.update({ collection: 'journeys', id, ...scope, data: { _status: 'published' } })
    await payload.update({
      collection: 'journeys',
      id,
      ...scope,
      draft: true,
      data: { name: `${published} REWRITTEN`, place: 'Andalusia' },
    })
    return { id, published }
  }

  it('archives without publishing the author’s draft, and unarchives back to edited', async () => {
    const { id, published } = await aJourneyWithAPendingDraft('archivedraft')
    const before = await readJourneysScreen(payload, scope, { search: published, filter: 'all' })

    await toggleJourneyArchived(payload, scope, id)
    const shelved = await payload.findByID({ collection: 'journeys', id, ...scope, depth: 0 })
    await toggleJourneyArchived(payload, scope, id)
    const after = await readJourneysScreen(payload, scope, { search: published, filter: 'all' })

    expect(before[0]?.status).toBe('edited')
    // What the public book reads. `readBookBundle.ts` selects
    // `_status: { equals: 'published' }`, so both halves of this decide whether
    // the journey is still in the book at all.
    expect(shelved.name).toBe(published)
    expect(shelved._status).toBe('published')
    expect(shelved.archived).toBe(true)
    // And the author's rewrite is still waiting, rather than published or lost.
    expect(after[0]?.status).toBe('edited')
    expect(after[0]?.name).toBe(published)
  })

  it('trashes without publishing the author’s draft either', async () => {
    const { id, published } = await aJourneyWithAPendingDraft('trashdraft')

    await softDeleteJourney(payload, scope, id)

    const trashed = await payload.findByID({ collection: 'journeys', id, ...scope, depth: 0 })
    expect(trashed.deletedAt).not.toBeNull()
    expect(trashed.name).toBe(published)
    expect(trashed._status).toBe('published')
    // The pending draft survives the trip to the trash, because §2.10 restores
    // a journey whole and a restore that published the rewrite would be the
    // same defect one screen along.
    const newest = await payload.findVersions({
      collection: 'journeys',
      ...scope,
      depth: 0,
      pagination: false,
      where: { and: [{ parent: { equals: id } }, { latest: { equals: true } }] },
    })
    expect(newest.docs[0]?.version._status).toBe('draft')
  })

  it('leaves a never-published journey’s newest draft as the newest draft', async () => {
    // The other side of the same inference. Nothing writes the main row of a
    // journey that has never gone out either, so a flag write that took the
    // main row's stale content and made it the newest version would throw away
    // every draft save since the journey was created.
    const id = await createJourneyRow(payload, scope, {
      name: `${MARKER} nevergonearchive`,
      place: 'Wales',
      dates: 'a day',
    })
    await payload.update({
      collection: 'journeys',
      id,
      ...scope,
      draft: true,
      data: { name: `${MARKER} nevergonearchive REWRITTEN` },
    })

    await toggleJourneyArchived(payload, scope, id)

    const newest = await payload.findVersions({
      collection: 'journeys',
      ...scope,
      depth: 0,
      pagination: false,
      where: { and: [{ parent: { equals: id } }, { latest: { equals: true } }] },
    })
    expect(newest.docs[0]?.version.name).toBe(`${MARKER} nevergonearchive REWRITTEN`)
    expect(newest.docs[0]?.version.archived).toBe(true)
  })
})

describe('softDeleteJourney', () => {
  it('soft-deletes a journey, leaving the row where the trash screen can find it', async () => {
    const id = await createJourneyRow(payload, scope, { name: `${MARKER} Doomed`, place: 'Iceland', dates: 'a day' })

    await softDeleteJourney(payload, scope, id)

    // BOTH HALVES. A `payload.delete` would satisfy the second on its own, and
    // the trash screen would have nothing to restore.
    const row = await payload.findByID({ collection: 'journeys', id, ...scope, depth: 0 })
    expect(row.deletedAt).not.toBeNull()
    expect(row.deletedAt).not.toBeUndefined()
    expect(
      (await readJourneysScreen(payload, scope, { search: `${MARKER} Doomed`, filter: 'all' })).map((r) => r.name),
    ).toEqual([])
  })

  it('leaves the journey’s pages alone, because the trash restores a journey whole', async () => {
    const id = await createJourneyRow(payload, scope, { name: `${MARKER} Kept`, place: 'Iceland', dates: 'a day' })

    await softDeleteJourney(payload, scope, id)

    const pages = await payload.count({ collection: 'pages', ...scope, where: { journey: { equals: id } } })
    expect(pages.totalDocs).toBe(NEW_JOURNEY_PAGES.length)
  })
})
