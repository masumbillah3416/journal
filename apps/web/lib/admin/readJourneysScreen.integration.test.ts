/**
 * readJourneysScreen.integration.test.ts — behaviour spec for the rows
 * SCREENS.md §2.2's table prints.
 *
 * Integration test (CLAUDE.md §2): every property here is Postgres's. Whether a
 * page count is the database's or a loaded list's length, whether a trashed
 * journey leaves the list, what a `LIKE` matches, whether a draft saved over a
 * published journey reads back as `edited`, and — the one that matters for
 * CLAUDE.md §6 — whether the screen costs a fixed number of queries or one per
 * row, are answers only a real Payload and a real database give. The version
 * question in particular: Payload does NOT write the main collection row when
 * it saves a draft (`collections/operations/utilities/update.js`,
 * `if (!isSavingDraft)`), so `_status` on that row is the PUBLISHED state and
 * the newer draft exists only in the versions table. A mocked store would have
 * agreed with whatever this file assumed about that.
 *
 * WHAT PRODUCED EACH SIDE OF THE COUNT COMPARISON, because "two queries, one
 * truth" is easy to write and easy to get wrong: the left side is the number
 * this module derived from ONE grouped query over every journey at once, and
 * the right side is a `SELECT count(*)` scoped to the one journey. Two
 * different statements, two different shapes, one fact.
 *
 * Uses `getTestPayload()` rather than `getPayload()`, like every integration
 * file here, so these rows land in the isolated `diary_test` database.
 *
 * Every row it writes carries {@link MARKER} in its slug, alt text or email and
 * is deleted before and after the run: before, because a previous crashed run
 * would otherwise collide with the unique index on `slug`.
 *
 * Depends on: vitest, payload (types), sharp (the cover fixture's bytes),
 * @travel-diary/domain/ids, ../testPayload, ./adminScope, ./readJourneysScreen.
 */
import { journeyId, userId, type JourneyId, type UserId } from '@travel-diary/domain/ids'
import type { Payload } from 'payload'
import sharp from 'sharp'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { getTestPayload } from '../testPayload'
import { adminScope } from './adminScope'
import { readJourneysScreen } from './readJourneysScreen'

/** What every row this file writes carries, so cleanup can find them all. */
const MARKER = 'test-journeys-screen'

/** A password that is not one: this account is never signed in to. */
const NOT_A_PASSWORD = 'not-a-real-password'

/**
 * How many questions the screen asks, whatever the row count.
 *
 * FOUR, NOT THREE. The plan said three — journeys, pages, media — and that
 * predates the measurement above: the `edited` chip needs the versions table,
 * because a draft saved over a published journey leaves the main row untouched.
 * It is still a constant rather than one query per journey, which is the whole
 * of the CLAUDE.md §6 claim.
 */
const QUERIES_PER_READ = 4

let payload: Payload
let author: UserId

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
 * `journeyId` answers a `Result`, so an unwrapped call would compare a row's
 * id against `{ ok: true, value: … }` and never match — which is how a case
 * that guards nothing gets written.
 * @param raw - The id as Postgres spells it.
 * @returns The branded id.
 */
const aJourneyId = (raw: string | number): JourneyId => {
  const built = journeyId(String(raw))
  if (!built.ok) throw new Error(built.error)
  return built.value
}

/** What a journey fixture says about itself. */
interface JourneyFixture {
  /** What distinguishes this row's slug from the others'. */
  readonly label: string
  /** Where the journey went, which the search matches on beside the name. */
  readonly place: string
  /** Whether it has been published, or is still a draft. */
  readonly status: 'draft' | 'published'
  /** Whether it sits on the archive shelf. */
  readonly archived: boolean
}

/**
 * Creates one journey for a case to read back.
 *
 * Every field is stated rather than defaulted: a case about drafts cannot rest
 * on what Payload does with an absent `_status`.
 * @param fixture - See {@link JourneyFixture}.
 * @returns The created row's id.
 */
const aJourney = async ({ label, place, status, archived }: JourneyFixture): Promise<number> => {
  const created = await payload.create({
    collection: 'journeys',
    data: {
      name: `${MARKER} ${label}`,
      place,
      slug: `${MARKER}-${label}`,
      dates: '12 – 24 March 2025',
      archived,
      _status: status,
    },
  })
  return created.id
}

/**
 * An image large enough for Payload to derive a `thumb` from.
 *
 * 500px square, not the 100px `ingestProbes.ts` uses: `thumb` is a 400x400
 * crop with no `withoutEnlargement`, so Payload OMITS it for a smaller
 * original — and a cover fixture with no `thumb` would let the cover case pass
 * against `null` for the wrong reason.
 * @returns The encoded PNG's bytes.
 */
const aCoverablePng = async (): Promise<Buffer> =>
  sharp({ create: { width: 500, height: 500, channels: 3, background: { r: 180, g: 140, b: 90 } } })
    .png()
    .toBuffer()

/**
 * Attaches one media row to a journey.
 * @param journey - The journey row's id.
 * @param isCover - Whether this is the journey's cover.
 * @returns The created media row's id.
 */
const aMediaRow = async (journey: number, isCover: boolean): Promise<number> => {
  const png = await aCoverablePng()
  const created = await payload.create({
    collection: 'media',
    data: { journey, isCover, alt: `${MARKER} still`, state: 'ready' },
    file: {
      data: png,
      mimetype: 'image/png',
      name: `${MARKER}-${String(journey)}-${isCover ? 'cover' : 'plain'}.png`,
      size: png.length,
    },
  })
  return created.id
}

/**
 * Attaches one page to a journey.
 * @param journey - The journey row's id.
 * @param order - Where it sits in the journey.
 */
const aPage = async (journey: number, order: number): Promise<void> => {
  await payload.create({
    collection: 'pages',
    data: { journey, kind: 'notes', order, title: `${MARKER} page ${String(order)}` },
  })
}

/** Removes every row this file has ever written. */
const clean = async (): Promise<void> => {
  await payload.delete({ collection: 'media', where: { alt: { like: MARKER } } })
  await payload.delete({ collection: 'pages', where: { title: { like: MARKER } } })
  await payload.delete({ collection: 'journeys', where: { slug: { like: MARKER } } })
  await payload.delete({ collection: 'users', where: { email: { like: MARKER } } })
}

/** The published journey with pages, media and a cover — the one most cases read. */
let seeded: number

beforeAll(async () => {
  payload = await getTestPayload()
  await clean()
  const account = await payload.create({
    collection: 'users',
    data: { email: `${MARKER}@example.test`, password: NOT_A_PASSWORD },
  })
  author = anAccount(String(account.id))

  seeded = await aJourney({ label: 'seville', place: 'Spain', status: 'published', archived: false })
  await aPage(seeded, 0)
  await aPage(seeded, 1)
  await aMediaRow(seeded, true)
  await aMediaRow(seeded, false)
}, 120_000)

afterEach(() => {
  vi.restoreAllMocks()
})

afterAll(async () => {
  await clean()
})

describe('readJourneysScreen', () => {
  it('reports each journey’s page and media counts from the database, not from a loaded list', async () => {
    const scope = await adminScope({ user: author })
    const rows = await readJourneysScreen(payload, scope, { search: '', filter: 'all' })
    const row = rows.find((candidate) => candidate.id === aJourneyId(seeded))

    // `payload.count` is a `SELECT count(*)` over one journey; the row's own
    // number came out of ONE grouped query over every journey at once. Two
    // statements, two shapes, one fact.
    const pages = await payload.count({ collection: 'pages', ...scope, where: { journey: { equals: seeded } } })
    const media = await payload.count({ collection: 'media', ...scope, where: { journey: { equals: seeded } } })

    expect(pages.totalDocs).toBeGreaterThan(0)
    expect(media.totalDocs).toBeGreaterThan(0)
    expect(row?.pages).toBe(pages.totalDocs)
    expect(row?.media).toBe(media.totalDocs)
  })

  it('counts only its own journey’s pages, so one journey’s tally is never another’s', async () => {
    // The grouped query returns every journey's rows in one answer, so the
    // tallying is this module's to get wrong — a version that counted the
    // whole result for every journey passes the case above whenever there is
    // only one journey with pages.
    const scope = await adminScope({ user: author })
    const other = await aJourney({ label: 'empty', place: 'Nowhere', status: 'draft', archived: false })

    const rows = await readJourneysScreen(payload, scope, { search: '', filter: 'all' })

    expect(rows.find((row) => row.id === aJourneyId(other))?.pages).toBe(0)
    expect(rows.find((row) => row.id === aJourneyId(seeded))?.pages).toBeGreaterThan(0)
  })

  it('hides a trashed journey from the list, because the list is not the trash screen', async () => {
    const scope = await adminScope({ user: author })
    const doomed = await aJourney({ label: 'trashed', place: 'Iceland', status: 'published', archived: false })
    const before = await readJourneysScreen(payload, scope, { search: '', filter: 'all' })

    await payload.update({
      collection: 'journeys',
      id: doomed,
      ...scope,
      data: { deletedAt: new Date().toISOString() },
    })
    const after = await readJourneysScreen(payload, scope, { search: '', filter: 'all' })

    expect(before.map((row) => row.id)).toContain(aJourneyId(doomed))
    expect(after.map((row) => row.id)).not.toContain(aJourneyId(doomed))
  })

  it('matches the search against the name and the place, which is what the author types', async () => {
    const scope = await adminScope({ user: author })

    const byPlace = await readJourneysScreen(payload, scope, { search: 'Spain', filter: 'all' })
    const byName = await readJourneysScreen(payload, scope, { search: 'seville', filter: 'all' })

    expect(byPlace.map((row) => row.id)).toContain(aJourneyId(seeded))
    expect(byName.map((row) => row.id)).toContain(aJourneyId(seeded))
    // Both halves: a search that matched everything would satisfy the two
    // above without matching anything in particular.
    expect(
      (await readJourneysScreen(payload, scope, { search: 'Reykjavik', filter: 'all' })).map((row) => row.id),
    ).not.toContain(aJourneyId(seeded))
  })

  it('reads a draft saved over a published journey as edited, which no main row records', async () => {
    const scope = await adminScope({ user: author })
    const edited = await aJourney({ label: 'edited', place: 'Portugal', status: 'published', archived: false })

    const asPublished = await readJourneysScreen(payload, scope, { search: '', filter: 'all' })
    await payload.update({
      collection: 'journeys',
      id: edited,
      ...scope,
      draft: true,
      data: { name: `${MARKER} edited again` },
    })
    const asEdited = await readJourneysScreen(payload, scope, { search: '', filter: 'all' })

    expect(asPublished.find((row) => row.id === aJourneyId(edited))?.status).toBe('published')
    expect(asEdited.find((row) => row.id === aJourneyId(edited))?.status).toBe('edited')
  })

  it('selects by the status chip the screen was given, including the one no column stores', async () => {
    const scope = await adminScope({ user: author })
    const shelved = await aJourney({ label: 'archived', place: 'Norway', status: 'published', archived: true })

    const all = await readJourneysScreen(payload, scope, { search: '', filter: 'all' })
    const archived = await readJourneysScreen(payload, scope, { search: '', filter: 'archived' })
    const published = await readJourneysScreen(payload, scope, { search: '', filter: 'published' })

    expect(all.map((row) => row.id)).toContain(aJourneyId(shelved))
    expect(archived.map((row) => row.id)).toEqual([aJourneyId(shelved)])
    expect(published.map((row) => row.id)).not.toContain(aJourneyId(shelved))
  })

  it('resolves the cover to its thumb derivative and never to the original', async () => {
    const scope = await adminScope({ user: author })

    const rows = await readJourneysScreen(payload, scope, { search: '', filter: 'all' })
    const row = rows.find((candidate) => candidate.id === aJourneyId(seeded))

    // The right side is Payload's own derivative URL for the cover row, read
    // back out of the collection rather than spelled here. The second
    // assertion is what makes the first non-vacuous: the ORIGINAL's URL is a
    // different string, and serving it is the §6 defect this guards.
    const cover = await payload.find({
      collection: 'media',
      ...scope,
      depth: 0,
      where: { and: [{ journey: { equals: seeded } }, { isCover: { equals: true } }] },
    })
    const original = cover.docs[0]?.url
    const thumb = cover.docs[0]?.sizes?.thumb?.url

    expect(thumb).toBeTruthy()
    expect(row?.coverSrc).toBe(thumb)
    expect(row?.coverSrc).not.toBe(original)
  })

  it('answers null for a journey with no cover, rather than picking a photograph', async () => {
    const scope = await adminScope({ user: author })
    const bare = await aJourney({ label: 'coverless', place: 'Wales', status: 'draft', archived: false })
    await aMediaRow(bare, false)

    const rows = await readJourneysScreen(payload, scope, { search: '', filter: 'all' })

    expect(rows.find((row) => row.id === aJourneyId(bare))?.coverSrc).toBeNull()
  })

  it('asks nothing more once the search has matched no journey at all', async () => {
    // The grouped queries take `{ journey: { in: ids } }`, and an empty `ids`
    // is three statements Postgres runs for an answer that cannot hold a row.
    const scope = await adminScope({ user: author })
    const find = vi.spyOn(payload, 'find')
    const findVersions = vi.spyOn(payload, 'findVersions')

    const rows = await readJourneysScreen(payload, scope, { search: 'no-journey-is-called-this', filter: 'all' })

    expect(rows).toEqual([])
    expect(find.mock.calls.map(([options]) => options.collection)).toEqual(['journeys'])
    expect(findVersions).not.toHaveBeenCalled()
  })

  it('draws no thumbnail for a cover too small to have one, rather than reaching for the original', async () => {
    // Payload omits a width-only-and-height tier whose target exceeds the
    // source, so a 100px original has no `thumb` at all
    // (`apps/web/collections/media.ts`'s `imageSizes`). The row still has a
    // cover; what it has no derivative for is the 44px square, and answering
    // `null` is what keeps a 4000px original off the wire.
    const scope = await adminScope({ user: author })
    const tiny = await aJourney({ label: 'tinycover', place: 'Faroes', status: 'draft', archived: false })
    const png = await sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 10, g: 10, b: 10 } } })
      .png()
      .toBuffer()
    await payload.create({
      collection: 'media',
      data: { journey: tiny, isCover: true, alt: `${MARKER} still`, state: 'ready' },
      file: { data: png, mimetype: 'image/png', name: `${MARKER}-tiny-cover.png`, size: png.length },
    })

    const rows = await readJourneysScreen(payload, scope, { search: '', filter: 'all' })

    expect(rows.find((row) => row.id === aJourneyId(tiny))?.media).toBe(1)
    expect(rows.find((row) => row.id === aJourneyId(tiny))?.coverSrc).toBeNull()
  })

  it('asks the database a fixed number of questions however many journeys there are', async () => {
    // Both sides are real. The left is the collections Payload was actually
    // asked about, in order; the right is what this module states it costs.
    // The equality between the two readings is what catches an N+1: a
    // per-journey query makes the second reading longer than the first.
    const scope = await adminScope({ user: author })
    const find = vi.spyOn(payload, 'find')
    const findVersions = vi.spyOn(payload, 'findVersions')

    await readJourneysScreen(payload, scope, { search: '', filter: 'all' })
    const asked = [
      ...find.mock.calls.map(([options]) => options.collection),
      ...findVersions.mock.calls.map(([options]) => `${options.collection} versions`),
    ]

    await aJourney({ label: 'extra-one', place: 'Peru', status: 'draft', archived: false })
    await aJourney({ label: 'extra-two', place: 'Chile', status: 'published', archived: false })
    await aJourney({ label: 'extra-three', place: 'Bolivia', status: 'published', archived: true })

    find.mockClear()
    findVersions.mockClear()
    await readJourneysScreen(payload, scope, { search: '', filter: 'all' })
    const askedWithThreeMore = [
      ...find.mock.calls.map(([options]) => options.collection),
      ...findVersions.mock.calls.map(([options]) => `${options.collection} versions`),
    ]

    expect(asked).toEqual(['journeys', 'pages', 'media', 'journeys versions'])
    expect(askedWithThreeMore).toEqual(asked)
    expect(askedWithThreeMore).toHaveLength(QUERIES_PER_READ)
  })

  it('runs every query under the scope it was handed, with Payload’s access rules on', async () => {
    const scope = await adminScope({ user: author })
    const find = vi.spyOn(payload, 'find')
    const findVersions = vi.spyOn(payload, 'findVersions')

    await readJourneysScreen(payload, scope, { search: '', filter: 'all' })

    // IDENTITY, not equality: every call must carry the very object the caller
    // hoisted. A module that called `adminScope` itself, once per query, would
    // hand over freshly-read rows that compare equal field by field and are
    // one `users` lookup each — the N+1 CLAUDE.md §7 forbids.
    const calls = [...find.mock.calls, ...findVersions.mock.calls]
    expect(calls).toHaveLength(QUERIES_PER_READ)
    expect(calls.every(([options]) => options.user === scope.user)).toBe(true)
  })
})
