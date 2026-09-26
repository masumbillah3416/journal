/**
 * readPendingChanges.integration.test.ts — what "waiting to go out" is, asked
 * of a real Postgres rather than of a stub.
 *
 * Integration test (CLAUDE.md §2), against a real Payload. The whole question
 * this module answers is "which rows have a newer version than the one the
 * public book reads", and that is a fact about two pairs of tables —
 * `journeys` and `_journeys_v`, `pages` and `_pages_v`. A mocked store would
 * answer it by agreeing with the mock: Payload does not write the main row
 * when it saves a draft, which is the property every case here turns on and
 * the one a stub cannot have.
 *
 * ═══ THE BASELINE IS BUILT, NOT ASSUMED ═══
 *
 * Every case that asserts a journey is NOT waiting creates it PUBLISHED and
 * asserts that before touching it. The alternative the plan offered — publish
 * everything first and call the result quiet — is only a baseline if an empty
 * selection publishes the world, which is the one thing this screen must never
 * do.
 *
 * Uses `getTestPayload()`, so these rows land in the isolated `diary_test`
 * database. Every row carries {@link MARKER} in its slug, title or email and
 * is deleted before and after the run — before, because a previous crashed run
 * would otherwise collide with the unique index on `slug`.
 * Depends on: vitest, payload (types), @travel-diary/domain/ids, ../testPayload,
 * ./adminScope, ./readPendingChanges.
 */
import { journeyId, userId, type UserId } from '@travel-diary/domain/ids'
import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getTestPayload } from '../testPayload'
import { adminScope, type AdminScope } from './adminScope'
import { QUERIES_PER_READ, readPendingChanges } from './readPendingChanges'

/** What every row this file writes carries, so cleanup can find them all. */
const MARKER = 'test-pending-changes'

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
 * Removes every row this file has ever written.
 *
 * THE PAGES ARE FOUND THROUGH THEIR JOURNEYS, not through their own titles:
 * one case deliberately creates a page with NO title, and a cleanup keyed on
 * the title would leave it behind for the next run to find.
 */
const clean = async (): Promise<void> => {
  const mine = await payload.find({
    collection: 'journeys',
    depth: 0,
    pagination: false,
    select: {},
    where: { slug: { like: MARKER } },
  })
  const ids = mine.docs.map((journey) => journey.id)
  if (ids.length > 0) await payload.delete({ collection: 'pages', where: { journey: { in: ids } } })
  await payload.delete({ collection: 'journeys', where: { slug: { like: MARKER } } })
  await payload.delete({ collection: 'users', where: { email: { like: MARKER } } })
}

/**
 * A journey, in the publication state the case needs.
 * @param label - What distinguishes this journey's slug from the others'.
 * @param status - Published, or never published at all.
 * @returns The journey's row id.
 */
const aJourney = async (label: string, status: 'published' | 'draft'): Promise<number> => {
  const created = await payload.create({
    collection: 'journeys',
    ...scope,
    data: {
      name: `${MARKER} ${label}`,
      place: 'Japan',
      slug: `${MARKER}-${label}`,
      dates: '3 - 9 Mar 2025',
      startsOn: '2025-03-03T00:00:00.000Z',
      note: 'the published note',
      _status: status,
    },
  })
  return created.id
}

/**
 * A published page of a journey.
 * @param journey - The journey's row id.
 * @param label - What distinguishes this page's title.
 * @returns The page's row id.
 */
const aPage = async (journey: number, label: string): Promise<number> => {
  const created = await payload.create({
    collection: 'pages',
    ...scope,
    data: { journey, kind: 'notes', title: `${MARKER} ${label}`, order: 0, _status: 'published' },
  })
  return created.id
}

/**
 * Saves an unpublished edit to a journey, the way SCREENS.md §2.3's Save draft
 * does — one `draft: true` write, which leaves the live row where it is.
 * @param journey - The journey's row id.
 */
const editJourney = async (journey: number): Promise<void> => {
  await payload.update({
    collection: 'journeys',
    id: journey,
    ...scope,
    draft: true,
    data: { note: 'a line that was not there' },
  })
}

/**
 * The ids of everything currently waiting to go out.
 * @returns One id per pending change.
 */
const waitingIds = async (): Promise<readonly string[]> =>
  (await readPendingChanges(payload, scope)).map((change) => change.id)

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

describe('readPendingChanges', () => {
  it('reports a journey as waiting once it has been edited after publishing, and not before', async () => {
    const journey = await aJourney('edited-after-publishing', 'published')

    // THE BASELINE IS THE FIXTURE'S OWN STATE, asserted rather than produced
    // by a publish of nothing: a journey created published has no newer
    // version than the one the book reads.
    const quiet = await waitingIds()

    await editJourney(journey)
    const noisy = await waitingIds()

    expect(quiet).not.toContain(`journey:${String(journey)}`)
    expect(noisy).toContain(`journey:${String(journey)}`)
  })

  it('reports a journey that has never been published, because no reader has seen any of it', async () => {
    const journey = await aJourney('never-published', 'draft')

    expect(await waitingIds()).toContain(`journey:${String(journey)}`)
  })

  it('reports a page whose newest version is a draft, separately from its journey', async () => {
    const journey = await aJourney('page-edited', 'published')
    const page = await aPage(journey, 'notes')

    const quiet = await waitingIds()
    await payload.update({
      collection: 'pages',
      id: page,
      ...scope,
      draft: true,
      data: { title: `${MARKER} notes-edited` },
    })
    const noisy = await waitingIds()

    expect(quiet).not.toContain(`page:${String(page)}`)
    expect(noisy).toContain(`page:${String(page)}`)
    // AND NOT ITS JOURNEY. A page edit is not a journey edit, and a screen
    // that conflated them would publish the journey's own pending text when
    // the author ticked a page.
    expect(noisy).not.toContain(`journey:${String(journey)}`)
  })

  it('names a page that has no title of its own, rather than printing a gap', async () => {
    // `title` is not `required` on the collection (DATA_MODEL.md), so a page
    // with none is a state an author can really produce — the editor's "Add
    // page with this layout" creates one before it is named.
    const journey = await aJourney('untitled', 'published')
    const created = await payload.create({
      collection: 'pages',
      ...scope,
      data: { journey, kind: 'notes', order: 1, _status: 'published' },
    })
    await payload.update({ collection: 'pages', id: created.id, ...scope, draft: true, data: { order: 2 } })

    const change = (await readPendingChanges(payload, scope)).find((row) => row.id === `page:${String(created.id)}`)

    expect(change?.location).toBe(`${MARKER} untitled · A page`)
  })

  it('keys every change to the journey it belongs to, so a path can be computed for it', async () => {
    const journey = await aJourney('keyed', 'published')
    const page = await aPage(journey, 'keyed-page')
    await payload.update({ collection: 'pages', id: page, ...scope, draft: true, data: { order: 3 } })

    const branded = journeyId(String(journey))
    if (!branded.ok) throw new Error(branded.error)
    const change = (await readPendingChanges(payload, scope)).find((row) => row.id === `page:${String(page)}`)

    // THE JOURNEY AND ITS SLUG, because `affectedPaths` addresses the book by
    // journey id (CLAUDE.md §0.9) and the gallery by slug. A change that knew
    // only its own row could name no path at all.
    expect({ journey: change?.journey, slug: change?.slug }).toEqual({
      journey: branded.value,
      slug: `${MARKER}-keyed`,
    })
  })

  it('says nothing about a journey whose published row is the newest thing there is', async () => {
    const journey = await aJourney('quiet', 'published')

    expect(await waitingIds()).not.toContain(`journey:${String(journey)}`)
  })

  it('says nothing about a journey whose draft has since been published, because that draft is no longer its newest version', async () => {
    // THE CASE THE `latest` FLAG EXISTS FOR, and it was added because the
    // mutation that drops that flag left every other case in this file green:
    // a journey created published has exactly ONE version, so an older draft
    // never exists to be wrongly counted. This is the production sequence —
    // draft, then publish — which leaves a draft version behind that is no
    // longer the latest one, and the row must drop off the list.
    const journey = await aJourney('published-again', 'published')
    await editJourney(journey)
    const waiting = await waitingIds()

    await payload.update({ collection: 'journeys', id: journey, ...scope, data: { _status: 'published' } })
    const afterPublishing = await waitingIds()

    expect(waiting).toContain(`journey:${String(journey)}`)
    expect(afterPublishing).not.toContain(`journey:${String(journey)}`)
  })

  it('leaves an archived journey off the list, because the book does not hold it either', async () => {
    const journey = await aJourney('archived', 'published')
    await editJourney(journey)
    const beforeArchiving = await waitingIds()

    await payload.update({ collection: 'journeys', id: journey, ...scope, data: { archived: true } })
    const afterArchiving = await waitingIds()

    // BOTH SIDES. The row is pending while it is on the shelf's near side and
    // absent once it is archived, so this cannot pass by never finding it.
    expect(beforeArchiving).toContain(`journey:${String(journey)}`)
    expect(afterArchiving).not.toContain(`journey:${String(journey)}`)
  })

  it('asks the database a fixed number of questions however many journeys there are', async () => {
    const find = vi.spyOn(payload, 'find')
    const findVersions = vi.spyOn(payload, 'findVersions')

    await readPendingChanges(payload, scope)
    const asked = [
      ...find.mock.calls.map(([options]) => options.collection),
      ...findVersions.mock.calls.map(([options]) => `${options.collection} versions`),
    ]

    const extra = await aJourney('extra-one', 'draft')
    await aPage(extra, 'extra-page')
    await aJourney('extra-two', 'published')

    find.mockClear()
    findVersions.mockClear()
    await readPendingChanges(payload, scope)
    const askedWithThreeMore = [
      ...find.mock.calls.map(([options]) => options.collection),
      ...findVersions.mock.calls.map(([options]) => `${options.collection} versions`),
    ]

    // The two spies are read one after the other, so the `find` calls come
    // first and the `findVersions` calls after them — this is the order the
    // READING is assembled in, not the order the module issues them.
    expect(asked).toEqual(['journeys', 'pages', 'journeys versions', 'pages versions'])
    expect(askedWithThreeMore).toEqual(asked)
    expect(askedWithThreeMore).toHaveLength(QUERIES_PER_READ)

    find.mockRestore()
    findVersions.mockRestore()
  })

  it('runs every query under the scope it was handed, with Payload access rules on', async () => {
    const find = vi.spyOn(payload, 'find')
    const findVersions = vi.spyOn(payload, 'findVersions')

    await readPendingChanges(payload, scope)

    // IDENTITY, not equality: every call must carry the very object the caller
    // hoisted, or the module is resolving a scope per query — one `users`
    // lookup each, which is the N+1 CLAUDE.md §6 forbids.
    const calls = [...find.mock.calls, ...findVersions.mock.calls]
    expect(calls).toHaveLength(QUERIES_PER_READ)
    expect(calls.every(([options]) => options.user === scope.user)).toBe(true)

    find.mockRestore()
    findVersions.mockRestore()
  })
})
