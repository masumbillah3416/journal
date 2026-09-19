/**
 * notesMutations.integration.test.ts — what SCREENS.md §2.3's Notes pane does
 * to the database, and the one property that makes it a journey editor rather
 * than a second store.
 *
 * ═══ THE PROPERTY: WHAT THE EDITOR SAVED IS WHAT THE DIARY READS BACK ═══
 *
 * The two sides of the last case in this file are the ACTION'S INPUT — a
 * `FormData` of the shape the pane's own `<form>` posts — and `readBookBundle`'s
 * output, which is what the public book renders from. Nothing in between is
 * written by the test: no fixture sets `highlights` on a row, and no assertion
 * reads a column. A save that landed in a column the bundle does not read, or
 * in a version the bundle does not see, fails here.
 *
 * ═══ AND IT IS A DRAFT SAVE, ON A VERSIONED COLLECTION ═══
 *
 * `journeys` carries `versions: { drafts: true }`, and Payload's `updateByID`
 * fetches the document it merges into with `getLatestCollectionVersion`, which
 * is passed no `published` key — so the merge source is the NEWEST VERSION
 * whatever `draft` says (`updateByID.js:79`). Phase 4 Task 4 paid two review
 * rounds for that on this very collection: one press of Archive wrote the
 * author's unpublished rewrite into the live row and took the journey out of
 * the public book.
 *
 * `writeNotesDraft` is a DRAFT write, so the trap runs the other way and both
 * directions are asserted here:
 *
 *   - THE LIVE ROW MUST NOT MOVE. A reader with the book open is looking at the
 *     published row; a Save draft that published the author's half-finished
 *     notes would be Task 4's defect with a different button on it.
 *   - THE PENDING DRAFT'S OTHER EDITS MUST SURVIVE. The merge source is the
 *     newest version, so a field the author changed earlier and has not
 *     published is carried through rather than reverted to the published value.
 *
 * WHAT PRODUCED EACH SIDE OF THOSE COMPARISONS: the live row is read with a
 * plain `findByID`, which reads the `journeys` table; the pending draft is read
 * with `draft: true`, which reads `_journeys_v`. Two tables, two statements, and
 * a case fails if either moves.
 *
 * Uses `getTestPayload()` rather than `getPayload()`, like every integration
 * file here, so these rows land in the isolated `diary_test` database — and
 * `readBookBundle` reaches the same database, because this project's
 * `DATABASE_URL` names it.
 *
 * Every row it writes carries {@link MARKER} in its slug or email and is
 * deleted before and after the run: before, because a previous crashed run
 * would otherwise collide with the unique index on `slug`.
 *
 * Depends on: vitest, payload (types), @travel-diary/domain/admin/highlights,
 * @travel-diary/domain/bookBundle, @travel-diary/domain/ids, ../readBookBundle,
 * ../testPayload, ./adminScope, ./notesMutations.
 */
import { MAX_HIGHLIGHTS } from '@travel-diary/domain/admin/highlights'
import { TALLY_ROWS, type JourneyPage } from '@travel-diary/domain/bookBundle'
import { journeyId, userId, type UserId } from '@travel-diary/domain/ids'
import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Journey } from '../../payload-types'
import { readBookBundle } from '../readBookBundle'
import { getTestPayload } from '../testPayload'
import { adminScope, type AdminScope } from './adminScope'
import { readNotes, writeNotesDraft } from './notesMutations'

/** What every row this file writes carries, so cleanup can find them all. */
const MARKER = 'test-notes-mutations'

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
 * The `FormData` the Notes pane's own form posts.
 *
 * FORM DATA, NOT AN OBJECT LITERAL, and every field the pane renders is here by
 * default: the only thing that ever calls this parse is a `<form action={…}>`,
 * so an object fixture would be a shape no client produces — and a fixture
 * naming only the fields a case cares about would exercise a parse the browser
 * never sends (standing orders, species 4).
 *
 * A value given as an array is appended once per element, which is what a
 * browser does with four inputs sharing one name.
 * @param fields - Overrides for the pane's own values.
 * @returns The form body.
 */
const aNotesForm = (fields: Readonly<Record<string, string | readonly string[]>> = {}): FormData => {
  const form = new FormData()
  const all: Record<string, string | readonly string[]> = {
    journey: '1',
    location: 'Tokyo',
    dates: '3 – 9 Mar 2025',
    weather: 'CLEAR 14C',
    mood: 'WIDE EYED',
    weatherGlyph: 'sun',
    note: 'Tokyo is loud in a way that never quite becomes noise.',
    signoff: 'twelve days, one corner of it',
    stampCountry: 'NIPPON',
    stampValue: '120',
    accent: '#3d817e',
    slug: `${MARKER}-tokyo`,
    highlightId: ['one'],
    highlightText: ['First train at 05:40'],
    tallyKey: ['Days', 'Trains', 'Tarts', 'Rain'],
    tallyValue: ['12', 'plenty', '19', 'uncounted'],
    ...fields,
  }
  for (const [name, value] of Object.entries(all)) {
    for (const one of typeof value === 'string' ? [value] : value) form.append(name, one)
  }
  return form
}

/** Removes every row this file has ever written. */
const clean = async (): Promise<void> => {
  await payload.delete({ collection: 'journeys', where: { slug: { like: MARKER } } })
  await payload.delete({ collection: 'users', where: { email: { like: MARKER } } })
}

/**
 * A published journey, as a reader is looking at it right now.
 *
 * PUBLISHED, because that is the state both traps need: a live row carrying
 * content the public book renders. A draft-only fixture would let a write that
 * published the author's work pass for the wrong reason.
 * @param label - What distinguishes this journey's slug from the others'.
 * @returns The journey's row id.
 */
const aPublishedJourney = async (label: string): Promise<number> => {
  const created = await payload.create({
    collection: 'journeys',
    ...scope,
    data: {
      name: `${MARKER} ${label}`,
      place: 'Japan',
      slug: `${MARKER}-${label}`,
      dates: '3 – 9 Mar 2025',
      startsOn: '2025-03-03T00:00:00.000Z',
      note: 'the published note',
      highlights: [{ text: 'the published highlight' }],
      tally: [
        { key: 'Days', value: '12' },
        { key: 'Trains', value: 'plenty' },
        { key: 'Tarts', value: '19' },
        { key: 'Rain', value: 'uncounted' },
      ],
      _status: 'published',
    },
  })
  return created.id
}

/**
 * The journey as the public book reads it — the `journeys` table row.
 * @param journey - The row id.
 * @returns The live row.
 */
const liveRow = async (journey: number): Promise<Journey> =>
  payload.findByID({ collection: 'journeys', id: journey, ...scope, depth: 0 })

/**
 * The journey as the editor reads it — the newest row of `_journeys_v`.
 * @param journey - The row id.
 * @returns The newest version.
 */
const newestVersion = async (journey: number): Promise<Journey> =>
  payload.findByID({ collection: 'journeys', id: journey, ...scope, depth: 0, draft: true })

/**
 * Publishes whatever the newest version holds.
 *
 * TASK 11 OWNS THE REAL ACTION. Until it lands, this is the same write that
 * action will make — `_status: 'published'`, through the scope — and Task 11
 * replaces this helper's body with a call to it. It is a helper rather than an
 * inline line so there is one place to make that change.
 * @param journey - The row id.
 */
const publishJourney = async (journey: number): Promise<void> => {
  await payload.update({ collection: 'journeys', id: journey, ...scope, data: { _status: 'published' } })
}

/**
 * The Notes page one journey contributes to the public book.
 *
 * KEYED ON THE JOURNEY'S ID, NOT ON ITS SLUG, and that is the second version of
 * this helper. `BookPage` is a union — Cover, Contents and About carry no
 * journey at all — so the lookup has to narrow on `kind` first; what it must not
 * do is then reach for the slug, because **the pane under test lets the author
 * rewrite the slug**, and a case that rewrote it would silently find nothing and
 * pass its `?.` all the way to an `undefined`. `JourneyPageInfo` declares
 * `journeyId` as its first field, so once `kind === 'notes'` has narrowed the
 * union the id is right there.
 *
 * (The brief's own snippet had this right and would not have compiled anyway:
 * `journeyId()` is a fallible constructor answering a `Result`, so comparing its
 * return value with a `JourneyId` compares a branded string with `{ ok, value }`.
 * The first version of this helper mistook that for the field being absent.)
 * @param journey - The journey's row id.
 * @returns Its Notes page, or `undefined` when the book does not hold it.
 */
const notesPageFor = async (journey: number): Promise<JourneyPage | undefined> => {
  const bundle = await readBookBundle()
  const branded = journeyId(String(journey))
  if (!branded.ok) throw new Error(branded.error)
  return bundle.pages.find((page): page is JourneyPage => page.kind === 'notes' && page.journeyId === branded.value)
}

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

describe('readNotes', () => {
  it('reads every field the pane posts, so nothing the author typed is dropped on the way', () => {
    const { journey, notes } = readNotes(aNotesForm({ journey: '42' }))

    expect({ journey, ...notes }).toEqual({
      journey: 42,
      name: 'Tokyo',
      dates: '3 – 9 Mar 2025',
      weather: 'CLEAR 14C',
      mood: 'WIDE EYED',
      weatherGlyph: 'sun',
      highlights: [{ id: 'one', text: 'First train at 05:40' }],
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
      accent: '#3d817e',
      slug: `${MARKER}-tokyo`,
    })
  })

  it('refuses a journey that is not a row id, so nothing reaches the driver as NaN', () => {
    expect(() => readNotes(aNotesForm({ journey: 'nonsense' }))).toThrow()
  })

  it('refuses a weather glyph the book has no mark for', () => {
    expect(() => readNotes(aNotesForm({ weatherGlyph: 'snow' }))).toThrow()
  })

  it('refuses an accent that is not a plain hex colour, which is what keeps it out of a CSS declaration', () => {
    expect(() => readNotes(aNotesForm({ accent: 'red),url(//elsewhere/x' }))).toThrow()
  })

  it('accepts the six-digit hex colour every swatch actually posts', () => {
    expect(readNotes(aNotesForm({ accent: '#A15A4E' })).notes.accent).toBe('#A15A4E')
  })

  it('refuses a gallery address that is not a slug', () => {
    expect(() => readNotes(aNotesForm({ slug: '../../admin' }))).toThrow()
  })

  it('refuses a highlight list whose ids and texts do not line up, rather than zipping them wrongly', () => {
    expect(() => readNotes(aNotesForm({ highlightId: ['one', 'two'], highlightText: ['only one line'] }))).toThrow()
  })

  it('refuses a highlight posted as a file rather than as text', () => {
    const form = aNotesForm({ highlightId: ['one'], highlightText: [] })
    form.append('highlightText', new File([], 'not-a-line.txt'))

    expect(() => readNotes(form)).toThrow()
  })

  it('refuses an operation it does not recognise, rather than ignoring it', () => {
    expect(() => readNotes(aNotesForm({ op: 'publish' }))).toThrow()
  })

  it('refuses an operation that names no row', () => {
    expect(() => readNotes(aNotesForm({ op: 'remove:' }))).toThrow()
  })

  it('drops a line the author emptied, because the schema will not store one', () => {
    const { notes } = readNotes(aNotesForm({ highlightId: ['one', 'two'], highlightText: ['kept', '   '] }))

    expect(notes.highlights).toEqual([{ id: 'one', text: 'kept' }])
  })

  it('adds a line on “Add highlight”, keeping everything else the author had typed', () => {
    const { notes } = readNotes(aNotesForm({ op: 'add', highlightText: ['half-finished'] }))

    expect(notes.highlights.map((row) => row.text)).toEqual(['half-finished', 'A new line'])
  })

  it('refuses to add a fifth line, which is the cap enforced where the button is pressed', () => {
    const four = ['a', 'b', 'c', 'd']
    const { notes } = readNotes(aNotesForm({ op: 'add', highlightId: four, highlightText: four }))

    expect(notes.highlights).toHaveLength(MAX_HIGHLIGHTS)
  })

  it('removes the line the × was pressed on, addressed by id', () => {
    const { notes } = readNotes(
      aNotesForm({ op: 'remove:two', highlightId: ['one', 'two', 'three'], highlightText: ['a', 'b', 'c'] }),
    )

    expect(notes.highlights.map((row) => row.id)).toEqual(['one', 'three'])
  })

  it('moves a line up the list, addressed by id', () => {
    const { notes } = readNotes(
      aNotesForm({ op: 'up:two', highlightId: ['one', 'two', 'three'], highlightText: ['a', 'b', 'c'] }),
    )

    expect(notes.highlights.map((row) => row.id)).toEqual(['two', 'one', 'three'])
  })

  it('moves a line down the list, addressed by id', () => {
    const { notes } = readNotes(
      aNotesForm({ op: 'down:two', highlightId: ['one', 'two', 'three'], highlightText: ['a', 'b', 'c'] }),
    )

    expect(notes.highlights.map((row) => row.id)).toEqual(['one', 'three', 'two'])
  })

  it('refuses a highlight list longer than the cap, which the pane can never draw but a POST can send', () => {
    // THE SYMMETRIC TWIN OF `refuses one cell more than the ticket has`. The
    // `add` button cannot produce this — `addHighlight` refuses at the cap — but
    // a crafted body can, and so can a second tab whose form was rendered before
    // another tab added a line. Without this the five pairs parse cleanly, reach
    // Payload, and come back as a `maxRows` validation error naming a row index,
    // on a page that draws no error at all.
    const five = ['a', 'b', 'c', 'd', 'e']

    expect(() => readNotes(aNotesForm({ highlightId: five, highlightText: five }))).toThrow()
  })

  it('accepts a list exactly at the cap, so the refusal above is a cap and not a ceiling of its own', () => {
    const atTheCap = Array.from({ length: MAX_HIGHLIGHTS }, (_unused, index) => String(index))

    expect(readNotes(aNotesForm({ highlightId: atTheCap, highlightText: atTheCap })).notes.highlights).toHaveLength(
      MAX_HIGHLIGHTS,
    )
  })

  it('accepts exactly the number of tally cells the ticket has', () => {
    const cells = Array.from({ length: TALLY_ROWS }, (_unused, index) => String(index))

    expect(readNotes(aNotesForm({ tallyKey: cells, tallyValue: cells })).notes.tally).toHaveLength(TALLY_ROWS)
  })

  it('refuses one cell fewer than the ticket has, because the schema refuses it too', () => {
    const cells = Array.from({ length: TALLY_ROWS - 1 }, (_unused, index) => String(index))

    expect(() => readNotes(aNotesForm({ tallyKey: cells, tallyValue: cells }))).toThrow()
  })

  it('refuses one cell more than the ticket has, because the schema refuses it too', () => {
    const cells = Array.from({ length: TALLY_ROWS + 1 }, (_unused, index) => String(index))

    expect(() => readNotes(aNotesForm({ tallyKey: cells, tallyValue: cells }))).toThrow()
  })
})

describe('writeNotesDraft', () => {
  it('leaves the published row exactly where it was, because Save draft publishes nothing', async () => {
    const journey = await aPublishedJourney('live-row')
    const { notes } = readNotes(
      aNotesForm({
        journey: String(journey),
        slug: `${MARKER}-live-row`,
        highlightId: ['one'],
        highlightText: ['the unpublished highlight'],
        note: 'the unpublished note',
      }),
    )

    await writeNotesDraft(payload, scope, journey, notes)

    const live = await liveRow(journey)
    expect({
      status: live._status,
      note: live.note,
      highlights: (live.highlights ?? []).map((row) => row.text),
    }).toEqual({
      status: 'published',
      note: 'the published note',
      highlights: ['the published highlight'],
    })
  })

  it('carries a pending draft’s other edits through, rather than reverting them to the published value', async () => {
    const journey = await aPublishedJourney('pending')
    await payload.update({
      collection: 'journeys',
      id: journey,
      ...scope,
      draft: true,
      data: { place: 'Japan, mostly Tokyo' },
    })

    const { notes } = readNotes(aNotesForm({ journey: String(journey), slug: `${MARKER}-pending` }))
    await writeNotesDraft(payload, scope, journey, notes)

    const newest = await newestVersion(journey)
    expect({ place: newest.place, status: newest._status, note: newest.note }).toEqual({
      place: 'Japan, mostly Tokyo',
      status: 'draft',
      note: 'Tokyo is loud in a way that never quite becomes noise.',
    })
  })

  it('keeps the unpublished note out of the public book until it is published', async () => {
    const journey = await aPublishedJourney('unpublished')
    const { notes } = readNotes(
      aNotesForm({
        journey: String(journey),
        slug: `${MARKER}-unpublished`,
        highlightId: ['one'],
        highlightText: ['not published yet'],
      }),
    )
    await writeNotesDraft(payload, scope, journey, notes)

    const notesPage = await notesPageFor(journey)

    expect(notesPage?.highlights).toEqual(['the published highlight'])
  })

  it('puts a saved highlight where readBookBundle finds it, because the editor is not a second store', async () => {
    const journey = await aPublishedJourney('bundle')
    const { notes } = readNotes(
      aNotesForm({
        journey: String(journey),
        slug: `${MARKER}-bundle`,
        highlightId: ['one'],
        highlightText: ['nineteen tarts, no regrets'],
      }),
    )

    await writeNotesDraft(payload, scope, journey, notes)
    await publishJourney(journey)

    const notesPage = await notesPageFor(journey)

    expect(notesPage?.highlights).toContain('nineteen tarts, no regrets')
  })

  it('puts every other field the pane saved where the book reads it too, gallery address included', async () => {
    // THE SLUG IS REWRITTEN HERE ON PURPOSE. It is a field this pane lets the
    // author change, and `notesPageFor` keys on the journey's id precisely so a
    // case like this one still finds its page afterwards — a slug-keyed lookup
    // would find nothing and pass every `?.` in the assertion below.
    const journey = await aPublishedJourney('whole')
    const { notes } = readNotes(
      aNotesForm({
        journey: String(journey),
        slug: `${MARKER}-whole-renamed`,
        location: 'Kyoto',
        weatherGlyph: 'haze',
        accent: '#a06b3e',
        signoff: 'nineteen tarts, no regrets',
      }),
    )

    await writeNotesDraft(payload, scope, journey, notes)
    await publishJourney(journey)

    const notesPage = await notesPageFor(journey)

    expect({
      name: notesPage?.name,
      weather: notesPage?.weather,
      mood: notesPage?.mood,
      weatherGlyph: notesPage?.weatherGlyph,
      note: notesPage?.note,
      tally: notesPage?.tally,
      signoff: notesPage?.signoff,
      stampCountry: notesPage?.stampCountry,
      stampValue: notesPage?.stampValue,
      accent: notesPage?.accent,
    }).toEqual({
      name: 'Kyoto',
      weather: 'CLEAR 14C',
      mood: 'WIDE EYED',
      weatherGlyph: 'haze',
      note: 'Tokyo is loud in a way that never quite becomes noise.',
      tally: [
        { key: 'Days', value: '12' },
        { key: 'Trains', value: 'plenty' },
        { key: 'Tarts', value: '19' },
        { key: 'Rain', value: 'uncounted' },
      ],
      signoff: 'nineteen tarts, no regrets',
      stampCountry: 'NIPPON',
      stampValue: '120',
      accent: '#a06b3e',
    })
    expect(notesPage?.slug).toBe(`${MARKER}-whole-renamed`)
  })
})
