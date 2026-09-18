/**
 * pageMutations.integration.test.ts — what SCREENS.md §2.3's page rail actually
 * does to the database.
 *
 * Integration test (CLAUDE.md §2): every property here is Payload's or
 * Postgres's, and the one that matters most cannot be reasoned about at all.
 * `pages` carries `versions: { drafts: true }`, and Payload's `updateByID`
 * fetches the document it merges into with `getLatestCollectionVersion`, which
 * is passed no `published` flag — so the merge source is the NEWEST VERSION
 * whatever `draft` says (`node_modules/payload/dist/collections/operations/
 * updateByID.js:79`). Phase 4 Task 4 paid two review rounds to learn that on
 * `journeys`: one press of Archive wrote the author's unpublished rewrite into
 * the live row and took the journey out of the public book.
 *
 * ═══ SO THE TRAP CASES ARE THE POINT OF THIS FILE ═══
 *
 * Every operation here that UPDATES a page — the renumbering behind ↑ ↓, and
 * the layout picker — is asserted against a page that has a pending draft, from
 * both sides: the live row must keep its published content, and the pending
 * draft must still be there and still be the latest version afterwards. A
 * mocked store would have agreed with whatever this file assumed about either.
 *
 * WHAT PRODUCED EACH SIDE OF THOSE COMPARISONS: the live row is read back with
 * a plain `findByID`, which reads the `pages` table; the pending draft is read
 * with `draft: true`, which reads `_pages_v`. Two different tables, two
 * different statements, and the case fails if either one moves.
 *
 * Uses `getTestPayload()` rather than `getPayload()`, like every integration
 * file here, so these rows land in the isolated `diary_test` database.
 *
 * Every row it writes carries {@link MARKER} in its slug or email and is
 * deleted before and after the run: before, because a previous crashed run
 * would otherwise collide with the unique index on `slug`.
 *
 * Depends on: vitest, payload (types), @travel-diary/domain/admin/layoutGlyphs,
 * @travel-diary/domain/ids, ../../collections/pages, ../testPayload,
 * ./adminScope, ./pageMutations.
 */
import { LAYOUTS } from '@travel-diary/domain/admin/layoutGlyphs'
import { userId, type UserId } from '@travel-diary/domain/ids'
import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { Pages } from '../../collections/pages'
import type { Page } from '../../payload-types'
import { getTestPayload } from '../testPayload'
import { adminScope, type AdminScope } from './adminScope'
import {
  addPageRow,
  copyPageRow,
  deletePageRow,
  readNewPage,
  readPageLayoutRef,
  readPageOrder,
  readPageRef,
  reorderPageRows,
  setPageLayoutRow,
} from './pageMutations'

/** What every row this file writes carries, so cleanup can find them all. */
const MARKER = 'test-page-mutations'

/** A password that is not one: this account is never signed in to. */
const NOT_A_PASSWORD = 'not-a-real-password'

/**
 * The page columns a copy is DEFINED not to carry, each with its reason.
 *
 * AN EXCLUSION LIST, SO THE CARRY LIST IS INVERTED — the treatment
 * `journeyMutations.integration.test.ts` adopted after a copy silently dropped
 * two fields that every case naming its own fields had passed. A column added
 * to `apps/web/collections/pages.ts` by a later task fails the case below until
 * somebody decides about it.
 *
 * The last three are Payload's own: `sanitizeCollection` MUTATES the imported
 * config and appends `updatedAt`, `createdAt` and `_status` to `fields`, so the
 * derivation below does reach them once Payload has booted.
 */
const NOT_COPIED: Readonly<Record<string, string>> = {
  title: 'the copy is "<title> (copy)"',
  order: 'the copy sits immediately after its source, so it takes the next place',
  createdAt: "Payload's own; the copy is new",
  updatedAt: "Payload's own; the copy is new",
  _status: 'a copy is always a draft, whatever the source was',
}

/**
 * Every field `apps/web/collections/pages.ts` declares, by name.
 *
 * Read off the collection config rather than written down, which is the whole
 * point: this is the list that grows when a task adds a field.
 */
const DECLARED_FIELDS: readonly string[] = Pages.fields.flatMap((field) =>
  'name' in field && typeof field.name === 'string' ? [field.name] : [],
)

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
 * The `FormData` a browser would send from one of the rail's forms.
 *
 * FORM DATA, NOT AN OBJECT LITERAL: the only thing that ever calls these parses
 * is a `<form action={…}>`, so an object fixture would be a shape no client
 * produces — and the parse it exercised would not be the one that runs.
 * @param fields - What the form's inputs hold.
 * @returns The form body.
 */
const aForm = (fields: Readonly<Record<string, string>>): FormData => {
  const form = new FormData()
  for (const [name, value] of Object.entries(fields)) form.append(name, value)
  return form
}

/** A value with every array row's own `id` removed. */
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
  }
  await payload.delete({ collection: 'journeys', where: { slug: { like: MARKER } } })
  await payload.delete({ collection: 'users', where: { email: { like: MARKER } } })
}

/**
 * A journey with `titles.length` published pages, in the order given.
 *
 * PUBLISHED, because that is the state the trap needs: a page whose live row
 * carries content a reader is looking at right now. A draft-only fixture would
 * let every write pass for the wrong reason.
 * @param label - What distinguishes this journey's slug from the others'.
 * @param titles - One published page per title, ordered from 0.
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
        layout: 'three-up',
        slots: [{ role: 'frame', caption: `${title} caption`, alt: `${title} alt`, focalX: 40, focalY: 60 }],
        _status: 'published',
      },
    })
    pages.push(page.id)
  }
  return { journey: journey.id, pages }
}

/**
 * Saves an unpublished draft over a published page.
 *
 * This is the state the whole file exists for: the live row still carries what
 * a reader sees, and the author's newer text lives only in `_pages_v`.
 * @param page - The page's row id.
 * @param title - What the draft renames it to.
 */
const aPendingDraft = async (page: number, title: string): Promise<void> => {
  await payload.update({ collection: 'pages', id: page, ...scope, draft: true, data: { title } })
}

/**
 * The page as the public book reads it — the `pages` table row.
 * @param page - The page's row id.
 * @returns The live row.
 */
const liveRow = async (page: number): Promise<Page> =>
  payload.findByID({ collection: 'pages', id: page, ...scope, depth: 0 })

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

describe('addPageRow', () => {
  it('puts the new page after every page the journey already has', async () => {
    const { journey, pages } = await aJourneyWithPages('add-end', ['Notes', 'Frames I'])

    const added = await addPageRow(payload, scope, journey, 'four-up')

    const rail = await payload.find({
      collection: 'pages',
      ...scope,
      depth: 0,
      pagination: false,
      sort: 'order',
      where: { journey: { equals: journey } },
    })
    expect(rail.docs.map((page) => page.id)).toEqual([...pages, added])
    expect(rail.docs.map((page) => page.order)).toEqual([0, 1, 2])
  })

  it('names it after the frames pages the journey already holds, as the design does', async () => {
    // `Travel Diary Admin.dc.html`'s `addPage`: `'Frames ' + (frames + 1)`.
    const { journey } = await aJourneyWithPages('add-name', ['Notes', 'Frames I', 'Frames II'])

    const added = await addPageRow(payload, scope, journey, 'three-up')

    expect((await liveRow(added)).title).toBe('Frames 3')
  })

  it('gives it the layout the picker had selected, not the collection’s default', async () => {
    const { journey } = await aJourneyWithPages('add-layout', ['Notes'])

    const added = await addPageRow(payload, scope, journey, 'full-bleed')

    expect((await liveRow(added)).layout).toBe('full-bleed')
  })

  it('creates it as a draft, so a page nobody has filled in is not born published', async () => {
    // WHAT MAKES THIS FAIL, measured, because half a mutation does not. On
    // CREATE Payload sets `isSavingDraft` from the `draft` argument alone and
    // never consults `data._status` (`collections/operations/create.js:49`), so
    // `draft: true` OVERRIDES a published status — and with `draft` removed the
    // `_status` field's own default is still `'draft'`. Each half alone leaves
    // this green; both together print `published` here. That asymmetry is the
    // reason `draft: true` is written at all: it is what refuses a `_status` a
    // later edit might put in the data.
    const { journey } = await aJourneyWithPages('add-draft', ['Notes'])

    const added = await addPageRow(payload, scope, journey, 'three-up')

    expect((await liveRow(added))._status).toBe('draft')
  })

  it('starts the rail at 0 for a journey that has no pages at all', async () => {
    // Reachable: `payload.create` on `journeys` makes no pages, and only
    // `createJourneyRow` promises three. A journey imported or seeded without
    // them would otherwise get a page at `NaN`.
    const bare = await payload.create({
      collection: 'journeys',
      ...scope,
      data: { name: `${MARKER} add-empty`, place: 'Chile', slug: `${MARKER}-add-empty`, dates: 'one week' },
    })

    const added = await addPageRow(payload, scope, bare.id, 'three-up')

    expect((await liveRow(added)).order).toBe(0)
    expect((await liveRow(added)).title).toBe('Frames 1')
  })
})

describe('copyPageRow', () => {
  it('copies a page with nothing on it, rather than writing `undefined` into its columns', async () => {
    // A page with no title, no layout and no slots: `exactOptionalPropertyTypes`
    // refuses an explicit `undefined` where the generated type says
    // `string | null`, so every optional column goes through `orNull` — and
    // this is the fixture that takes those arms.
    const journey = await payload.create({
      collection: 'journeys',
      ...scope,
      data: { name: `${MARKER} copy-bare`, place: 'Chile', slug: `${MARKER}-copy-bare`, dates: 'one week' },
    })
    const bare = await payload.create({
      collection: 'pages',
      ...scope,
      data: { journey: journey.id, kind: 'frames', order: 0 },
    })
    await payload.create({
      collection: 'pages',
      ...scope,
      data: { journey: journey.id, kind: 'frames', order: 1 },
    })

    const copy = await copyPageRow(payload, scope, bare.id)

    const after = await liveRow(copy)
    expect(after.title).toBe('Page (copy)')
    expect(after.layout).toBeNull()
    expect(after.slots ?? []).toEqual([])
    expect(after.order).toBe(1)
  })

  it('puts the copy immediately after its source, not at the end of the rail', async () => {
    const { journey, pages } = await aJourneyWithPages('copy-place', ['Notes', 'Frames I', 'Frames II'])
    const source = pages[1]
    if (source === undefined) throw new Error('the fixture made no second page')

    const copy = await copyPageRow(payload, scope, source)

    const rail = await payload.find({
      collection: 'pages',
      ...scope,
      depth: 0,
      pagination: false,
      sort: 'order',
      where: { journey: { equals: journey } },
    })
    expect(rail.docs.map((page) => page.id)).toEqual([pages[0], source, copy, pages[2]])
    expect(rail.docs.map((page) => page.order)).toEqual([0, 1, 2, 3])
  })

  it('carries every page column a copy is not defined to drop', async () => {
    const { pages } = await aJourneyWithPages('copy-fields', ['Notes', 'Frames I'])
    const source = pages[1]
    if (source === undefined) throw new Error('the fixture made no second page')

    const copy = await copyPageRow(payload, scope, source)

    const before = await liveRow(source)
    const after = await liveRow(copy)
    const carried = DECLARED_FIELDS.filter((field) => !(field in NOT_COPIED))
    expect(carried.length).toBeGreaterThan(0)
    for (const field of carried) {
      expect(withoutRowIds(after[field as keyof typeof after]), `the copy dropped ${field}`).toEqual(
        withoutRowIds(before[field as keyof typeof before]),
      )
    }
  })

  it('titles the copy after its source, so the rail does not print the same name twice', async () => {
    const { pages } = await aJourneyWithPages('copy-title', ['Notes'])
    const source = pages[0]
    if (source === undefined) throw new Error('the fixture made no page')

    const copy = await copyPageRow(payload, scope, source)

    expect((await liveRow(copy)).title).toBe('Notes (copy)')
  })

  it('mints the copy’s own slot row ids rather than asking Payload to insert the source’s', async () => {
    const { pages } = await aJourneyWithPages('copy-slots', ['Frames I'])
    const source = pages[0]
    if (source === undefined) throw new Error('the fixture made no page')

    const copy = await copyPageRow(payload, scope, source)

    const before = (await liveRow(source)).slots ?? []
    const after = (await liveRow(copy)).slots ?? []
    expect(after).toHaveLength(before.length)
    expect(after.map((slot) => slot.id)).not.toEqual(before.map((slot) => slot.id))
  })

  it('creates the copy as a draft even when the source is published', async () => {
    const { pages } = await aJourneyWithPages('copy-draft', ['Frames I'])
    const source = pages[0]
    if (source === undefined) throw new Error('the fixture made no page')

    const copy = await copyPageRow(payload, scope, source)

    expect((await liveRow(source))._status).toBe('published')
    expect((await liveRow(copy))._status).toBe('draft')
  })

  it('copies what the editor was showing — the author’s pending draft, not the published row', async () => {
    const { pages } = await aJourneyWithPages('copy-pending', ['Frames I'])
    const source = pages[0]
    if (source === undefined) throw new Error('the fixture made no page')
    await aPendingDraft(source, 'Frames I, rewritten')

    const copy = await copyPageRow(payload, scope, source)

    expect((await liveRow(copy)).title).toBe('Frames I, rewritten (copy)')
  })
})

describe('deletePageRow', () => {
  it('takes the page out of the journey', async () => {
    const { journey, pages } = await aJourneyWithPages('delete-one', ['Notes', 'Frames I'])
    const doomed = pages[1]
    if (doomed === undefined) throw new Error('the fixture made no second page')

    await deletePageRow(payload, scope, doomed)

    const rail = await payload.find({
      collection: 'pages',
      ...scope,
      depth: 0,
      pagination: false,
      where: { journey: { equals: journey } },
    })
    expect(rail.docs.map((page) => page.id)).toEqual([pages[0]])
  })

  it('refuses to delete a journey’s only page, so no journey is left with none', async () => {
    // `Travel Diary Admin.dc.html`'s `delPage`: `if (list.length <= 1) return`.
    const { journey, pages } = await aJourneyWithPages('delete-last', ['Notes'])
    const only = pages[0]
    if (only === undefined) throw new Error('the fixture made no page')

    await expect(deletePageRow(payload, scope, only)).rejects.toThrow()

    const rail = await payload.count({ collection: 'pages', ...scope, where: { journey: { equals: journey } } })
    expect(rail.totalDocs).toBe(1)
  })
})

describe('reorderPageRows', () => {
  it('writes the order the list arrives in, whatever the rows held before', async () => {
    const { journey, pages } = await aJourneyWithPages('order-write', ['Notes', 'Frames I', 'Frames II'])
    const [first, second, third] = pages
    if (first === undefined || second === undefined || third === undefined) throw new Error('short fixture')

    await reorderPageRows(payload, scope, journey, [third, first, second])

    const rail = await payload.find({
      collection: 'pages',
      ...scope,
      depth: 0,
      pagination: false,
      sort: 'order',
      where: { journey: { equals: journey } },
    })
    expect(rail.docs.map((page) => page.id)).toEqual([third, first, second])
    expect(rail.docs.map((page) => page.order)).toEqual([0, 1, 2])
  })

  it('leaves the author’s unpublished draft out of the live row, which is the trap Task 4 paid for', async () => {
    const { journey, pages } = await aJourneyWithPages('order-trap', ['Notes', 'Frames I'])
    const [first, second] = pages
    if (first === undefined || second === undefined) throw new Error('short fixture')
    await aPendingDraft(first, 'Notes, rewritten and not published')

    await reorderPageRows(payload, scope, journey, [second, first])

    const live = await liveRow(first)
    // The live row took the new place and NOTHING else: not the draft's title,
    // and not the draft's `_status`. A plain `payload.update` writes both,
    // because the document it merges into is the newest version.
    expect(live.order).toBe(1)
    expect(live.title).toBe('Notes')
    expect(live._status).toBe('published')
  })

  it('keeps the pending draft the latest version, so the editor still opens on it', async () => {
    const { journey, pages } = await aJourneyWithPages('order-latest', ['Notes', 'Frames I'])
    const [first, second] = pages
    if (first === undefined || second === undefined) throw new Error('short fixture')
    await aPendingDraft(first, 'Notes, still being written')

    await reorderPageRows(payload, scope, journey, [second, first])

    // `draft: true` reads `_pages_v` through `getLatestCollectionVersion`. The
    // draft has to be there AND have the new place on it, or the next
    // renumbering would merge a stale order back over this one.
    const newest = await payload.findByID({ collection: 'pages', id: first, ...scope, depth: 0, draft: true })
    expect(newest.title).toBe('Notes, still being written')
    expect(newest._status).toBe('draft')
    expect(newest.order).toBe(1)
  })

  it('refuses a list that is not exactly the journey’s pages, rather than renumbering half of them', async () => {
    // A stale form: another tab added a page after this one was rendered, so
    // the submitted list is short. Renumbering it would give two pages the same
    // order, which the book reads as an arbitrary sequence.
    const { journey, pages } = await aJourneyWithPages('order-stale', ['Notes', 'Frames I', 'Frames II'])
    const [first, second] = pages
    if (first === undefined || second === undefined) throw new Error('short fixture')

    await expect(reorderPageRows(payload, scope, journey, [second, first])).rejects.toThrow()

    const rail = await payload.find({
      collection: 'pages',
      ...scope,
      depth: 0,
      pagination: false,
      sort: 'order',
      where: { journey: { equals: journey } },
    })
    expect(rail.docs.map((page) => page.id)).toEqual(pages)
  })

  it('writes only the pages whose place actually changed', async () => {
    // Every write on a versioned collection mints a version row, so a
    // renumbering that rewrote all of them would cost a row per page per press
    // of ↑. A swap moves two.
    const { journey, pages } = await aJourneyWithPages('order-writes', ['Notes', 'Frames I', 'Frames II'])
    const [first, second, third] = pages
    if (first === undefined || second === undefined || third === undefined) throw new Error('short fixture')
    const update = vi.spyOn(payload, 'update')

    await reorderPageRows(payload, scope, journey, [second, first, third])

    expect(update.mock.calls.map(([options]) => options.id)).toEqual([second, first])
    update.mockRestore()
  })
})

describe('setPageLayoutRow', () => {
  it('writes the layout the picker was pressed on', async () => {
    const { pages } = await aJourneyWithPages('layout-write', ['Frames I'])
    const page = pages[0]
    if (page === undefined) throw new Error('the fixture made no page')

    await setPageLayoutRow(payload, scope, page, 'text-spread')

    expect((await liveRow(page)).layout).toBe('text-spread')
  })

  it('leaves the author’s unpublished draft out of the live row', async () => {
    const { pages } = await aJourneyWithPages('layout-trap', ['Frames I'])
    const page = pages[0]
    if (page === undefined) throw new Error('the fixture made no page')
    await aPendingDraft(page, 'Frames I, rewritten and not published')

    await setPageLayoutRow(payload, scope, page, 'four-up')

    const live = await liveRow(page)
    expect(live.layout).toBe('four-up')
    expect(live.title).toBe('Frames I')
    expect(live._status).toBe('published')
  })

  it('carries the new layout onto the pending draft too, so the two cannot disagree', async () => {
    const { pages } = await aJourneyWithPages('layout-draft', ['Frames I'])
    const page = pages[0]
    if (page === undefined) throw new Error('the fixture made no page')
    await aPendingDraft(page, 'Frames I, still being written')

    await setPageLayoutRow(payload, scope, page, 'full-bleed')

    const newest = await payload.findByID({ collection: 'pages', id: page, ...scope, depth: 0, draft: true })
    expect(newest.title).toBe('Frames I, still being written')
    expect(newest.layout).toBe('full-bleed')
  })
})

describe('the parses', () => {
  it('reads the journey and the layout the add form sends', () => {
    expect(readNewPage(aForm({ journey: '42', layout: 'four-up' }))).toEqual({ journey: 42, layout: 'four-up' })
  })

  it('refuses a layout no picker offers, rather than writing it to the column', () => {
    expect(() => readNewPage(aForm({ journey: '42', layout: 'six-up' }))).toThrow()
  })

  it('admits every layout the domain names, so the two cannot drift apart', () => {
    for (const layout of LAYOUTS) {
      expect(readNewPage(aForm({ journey: '42', layout })).layout).toBe(layout)
    }
  })

  it('reads the page and the layout the picker sends', () => {
    expect(readPageLayoutRef(aForm({ page: '7', layout: 'full-bleed' }))).toEqual({ page: 7, layout: 'full-bleed' })
  })

  it('reads the page a tool-row button names', () => {
    expect(readPageRef(aForm({ page: '7' }))).toBe(7)
  })

  it('refuses a page reference that is not a row id, rather than sending NaN to the driver', () => {
    expect(() => readPageRef(aForm({ page: 'nonsense' }))).toThrow()
  })

  it('reads the whole ordered list the arrows send', () => {
    expect(readPageOrder(aForm({ journey: '3', pages: '7,5,9' }))).toEqual({ journey: 3, pages: [7, 5, 9] })
  })

  it('refuses a list naming one page twice, which would leave another with no place', () => {
    expect(() => readPageOrder(aForm({ journey: '3', pages: '7,5,7' }))).toThrow()
  })

  it('refuses an empty list, rather than renumbering nothing and reporting success', () => {
    expect(() => readPageOrder(aForm({ journey: '3', pages: '' }))).toThrow()
  })
})
