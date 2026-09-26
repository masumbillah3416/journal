/**
 * readOverview.integration.test.ts — what SCREENS.md §2.1's four cards say,
 * asked of a real Postgres rather than of a stub.
 *
 * Integration test (CLAUDE.md §2), against a real Payload. Three of the
 * properties here exist only in a database:
 *
 * 1. **The stat grid's figures are Postgres's, not literals.** Each one is
 *    compared with an independent `payload.find` over the same question — a
 *    different mechanism, not a second reading of the same counter. A grid
 *    asserting against literals would pass with every figure wired to the
 *    wrong column, which is what Task 12's prescribed mutation exists to show.
 * 2. **`photographs + clips` is every row in the media library**, which is the
 *    number the rail prints beside the Media button. That is a fact about how
 *    Postgres answers `kind not_equals 'clip'` on a column the ingest pipeline
 *    writes — a row it has not reached has no kind at all.
 * 3. **The Overview and the Publish screen report the same waiting set.** Both
 *    read `readPendingChanges`, and "waiting" is a fact about `_journeys_v`
 *    and `_pages_v` that no stub can have: Payload does not write the main row
 *    when it saves a draft.
 *
 * Uses `getTestPayload()`, so these rows land in the isolated `diary_test`
 * database. Every row carries {@link MARKER} in its slug, title, filename or
 * email and is deleted before and after the run — before, because a previous
 * crashed run would otherwise collide with the unique index on `slug`.
 *
 * WHAT THE FIGURES ARE COMPARED AGAINST, because "two queries, one truth" is
 * easy to write and easy to get wrong: every assertion below is a DELTA across
 * a write this file makes, or a comparison against a `find` this file issues
 * itself. `diary_test` is shared and seeded, so an absolute figure would be a
 * statement about whatever else has run.
 * Depends on: vitest, payload (types), sharp, @travel-diary/domain/ids,
 * ../testPayload, ./adminScope, ./readNavCounts, ./readPendingChanges,
 * ./readOverview.
 */
import { userId, type UserId } from '@travel-diary/domain/ids'
import type { Payload } from 'payload'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getTestPayload } from '../testPayload'
import { adminScope, type AdminScope } from './adminScope'
import { readNavCounts } from './readNavCounts'
import { readPendingChanges } from './readPendingChanges'
import { LATELY_SHOWN, QUERIES_PER_READ, readOverview } from './readOverview'

/** What every row this file writes carries, so cleanup can find them all. */
const MARKER = 'test-read-overview'

/** A password that is not one: this account is never signed in to. */
const NOT_A_PASSWORD = 'not-a-real-password'

/**
 * How many rows the waiting comparison must hold before it can see a trim.
 *
 * A cap or a slice smaller than the list is invisible to a comparison of two
 * lists that are both shorter than it. Six rows are written against this
 * figure, which is comfortably past the largest trim a card is likely to grow.
 */
const ENOUGH_TO_SEE_A_TRIM = 4

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
 * The pages and media are found through their JOURNEYS rather than through
 * their own titles: a case creates a page with no title at all, and a cleanup
 * keyed on the title would leave it behind for the next run to find.
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
  if (ids.length > 0) {
    await payload.delete({ collection: 'pages', where: { journey: { in: ids } } })
    await payload.delete({ collection: 'media', where: { journey: { in: ids } } })
  }
  await payload.delete({ collection: 'journeys', where: { slug: { like: MARKER } } })
  await payload.delete({ collection: 'users', where: { email: { like: MARKER } } })
}

/** How a journey fixture describes itself. */
interface JourneyFixture {
  /** What distinguishes this row's slug from the others'. */
  readonly label: string
  /** Published, or never published at all. */
  readonly status?: 'published' | 'draft'
  /** Whether it is on the shelf. */
  readonly archived?: boolean
  /** Whether it is withheld from the book's bookmark rail. */
  readonly hiddenFromBookmarks?: boolean
}

/**
 * A journey of this file's own.
 * @param fixture - See {@link JourneyFixture}.
 * @returns The journey's row id.
 */
const aJourney = async ({
  label,
  status = 'published',
  archived = false,
  hiddenFromBookmarks = false,
}: JourneyFixture): Promise<number> => {
  const created = await payload.create({
    collection: 'journeys',
    ...scope,
    data: {
      name: `${MARKER} ${label}`,
      place: 'Iceland',
      slug: `${MARKER}-${label}`,
      dates: '8 - 19 May 2025',
      archived,
      hiddenFromBookmarks,
      _status: status,
    },
  })
  return created.id
}

/**
 * A page of a journey.
 * @param journey - The journey's row id.
 * @param label - What distinguishes this page's title, or `null` for a page
 *   nobody has named.
 * @param status - Published, or never published.
 * @returns The page's row id.
 */
const aPage = async (
  journey: number,
  label: string | null,
  status: 'published' | 'draft' = 'published',
): Promise<number> => {
  const created = await payload.create({
    collection: 'pages',
    ...scope,
    data: {
      journey,
      kind: 'notes',
      ...(label === null ? {} : { title: `${MARKER} ${label}` }),
      order: 0,
      _status: status,
    },
  })
  return created.id
}

/** The columns a frame fixture sets. */
interface FrameFixture {
  /** What distinguishes this row; it becomes part of the filename. */
  readonly label: string
  /** Where it sits in the gallery. */
  readonly order?: number
  /** A still or a clip. */
  readonly kind?: 'still' | 'clip'
  /** A clip's chosen poster timestamp, or `undefined` for none. */
  readonly posterAt?: number
  /** Its caption, or `undefined` for a frame nobody has captioned. */
  readonly caption?: string
  /** Its alt text; `null` for a row nobody has described. */
  readonly alt?: string | null
  /** Whether an editor has placed it in the book. */
  readonly inBook?: boolean
  /** Whether an editor has taken it out of the public gallery. */
  readonly hidden?: boolean
}

/**
 * A media row with a real derivative behind it.
 * @param journey - The journey it belongs to.
 * @param fixture - See {@link FrameFixture}.
 * @returns The media row's id.
 */
const aFrame = async (
  journey: number,
  { label, order = 0, kind = 'still', posterAt, caption, alt, inBook = false, hidden = false }: FrameFixture,
): Promise<number> => {
  const png = await sharp({ create: { width: 800, height: 800, channels: 3, background: { r: 6, g: 6, b: 6 } } })
    .png()
    .toBuffer()
  const created = await payload.create({
    collection: 'media',
    ...scope,
    data: {
      journey,
      alt: alt === undefined ? `${MARKER} ${label}` : alt,
      state: 'ready',
      order,
      hidden,
      inBook,
      kind,
      ...(posterAt === undefined ? {} : { posterAt }),
      ...(caption === undefined ? {} : { caption }),
    },
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
}, 180_000)

afterAll(async () => {
  vi.restoreAllMocks()
  await clean()
})

describe('readOverview', () => {
  it('counts the journeys Postgres holds, not a length the caller already had', async () => {
    const before = await readOverview(payload, scope)
    await aJourney({ label: 'counted' })
    const after = await readOverview(payload, scope)

    // The left side is this module's figure; the right side is how many rows
    // Payload actually hands back for the same question. Two mechanisms, one
    // truth.
    const live = await payload.find({
      collection: 'journeys',
      ...scope,
      depth: 0,
      pagination: false,
      where: { deletedAt: { exists: false } },
    })

    expect(after.stats[0]?.value).toBe(String(live.docs.length))
    expect(Number(after.stats[0]?.value)).toBe(Number(before.stats[0]?.value) + 1)
  })

  it('counts the pages of live journeys against the rows Postgres holds', async () => {
    const journey = await aJourney({ label: 'with-pages' })
    const before = await readOverview(payload, scope)
    await aPage(journey, 'notes-one')
    await aPage(journey, 'notes-two')
    const after = await readOverview(payload, scope)

    expect(Number(after.stats[1]?.value)).toBe(Number(before.stats[1]?.value) + 2)
  })

  it('counts every photograph and every clip, and the two together are the whole library', async () => {
    // THE INVARIANT THIS SCREEN'S TWO MEDIA NUMBERS REST ON, and the reason
    // `photographs` is spelled `kind not_equals 'clip'`: the rail prints the
    // library total beside its Media button, so a grid whose two figures did
    // not sum to it would put two numbers on one screen describing the same
    // thing differently.
    const journey = await aJourney({ label: 'library' })
    await aFrame(journey, { label: 'still-one' })
    await aFrame(journey, { label: 'clip-one', kind: 'clip', order: 1 })

    const view = await readOverview(payload, scope)
    const counts = await readNavCounts(payload, scope)

    expect(Number(view.stats[2]?.value) + Number(view.stats[3]?.value)).toBe(counts.media)
  })

  it('says how many photographs are placed in the book, from the column rather than from a guess', async () => {
    const journey = await aJourney({ label: 'in-book' })
    const before = await readOverview(payload, scope)
    // TWO, not one: the note spells a count of one as "one placed in the book"
    // (`overviewStats.ts`), so a fixture that could leave the total at exactly
    // one would be asserting against the wrong branch of the sentence.
    await aFrame(journey, { label: 'placed', inBook: true })
    await aFrame(journey, { label: 'placed-too', inBook: true, order: 1 })
    const after = await readOverview(payload, scope)

    const placed = await payload.find({
      collection: 'media',
      ...scope,
      depth: 0,
      pagination: false,
      where: { and: [{ kind: { not_equals: 'clip' } }, { inBook: { equals: true } }] },
    })

    expect(after.stats[2]?.note).toBe(`${String(placed.docs.length)} placed in the book`)
    expect(after.stats[2]?.note).not.toBe(before.stats[2]?.note)
  })

  it('says how many clips have a poster frame chosen, counting only clips', async () => {
    const journey = await aJourney({ label: 'posters' })
    const before = await readOverview(payload, scope)
    await aFrame(journey, { label: 'with-poster', kind: 'clip', posterAt: 3 })
    // A STILL WITH A posterAt IS NOT A CLIP WITH A POSTER. Without this row the
    // case would pass for a count that forgot its `kind` clause.
    await aFrame(journey, { label: 'still-with-poster', posterAt: 3, order: 1 })
    const after = await readOverview(payload, scope)

    expect(Number(after.stats[3]?.note.split(' ')[0])).toBe(Number(before.stats[3]?.note.split(' ')[0]) + 1)
  })

  it('reports exactly what the Publish screen reports, because it is the same read', async () => {
    // SCREENS.md §2.1's "Waiting to go out" and §2.8's Changes card are one
    // list drawn twice. Two screens counting the same thing differently is the
    // defect `journeyStatus.ts` exists to avoid.
    //
    // THE FIXTURE WRITES MORE ROWS THAN ANY PLAUSIBLE TRIM WOULD KEEP, and
    // that is the whole reason for the `ENOUGH_TO_SEE_A_TRIM` assertion below.
    // Measured: with a draft journey and one draft page, a `waiting.slice(0, 3)`
    // substituted into `readOverview` left this case GREEN — the two lists were
    // short enough to be equal after the slice. A comparison can only see a
    // difference its fixture is large enough to contain.
    const journey = await aJourney({ label: 'waiting', status: 'draft' })
    for (const label of ['one', 'two', 'three', 'four', 'five']) await aPage(journey, `waiting-${label}`, 'draft')

    const view = await readOverview(payload, scope)
    const publishScreen = await readPendingChanges(payload, scope)

    expect(view.waiting.length).toBeGreaterThan(ENOUGH_TO_SEE_A_TRIM)
    expect(view.waiting).toEqual(publishScreen)
    expect(view.waiting.map((change) => change.id)).toContain(`journey:${String(journey)}`)
  })

  it('summarises the book from what a reader would find, not from what the author has', async () => {
    const journey = await aJourney({ label: 'summary' })
    const before = await readOverview(payload, scope)
    await aPage(journey, 'published-page')
    // A DRAFT PAGE IS NOT IN THE BOOK. Without this row the case would pass for
    // a summary counting every page of every journey.
    await aPage(journey, 'draft-page-summary', 'draft')
    const after = await readOverview(payload, scope)

    const pagesBefore = Number(before.book.summary.split(' ')[0])
    expect(Number(after.book.summary.split(' ')[0])).toBe(pagesBefore + 1)
  })

  it('leaves an archived journey out of the bookmark count, because a shelf is not a stage', async () => {
    const before = await readOverview(payload, scope)
    await aJourney({ label: 'shelved', archived: true })
    const after = await readOverview(payload, scope)

    const bookmarksOf = (summary: string): number => Number(summary.split(' · ')[1]?.split(' ')[0])
    expect(bookmarksOf(after.book.summary)).toBe(bookmarksOf(before.book.summary))
  })

  it('leaves a journey withheld from the rail out of the bookmark count too', async () => {
    const before = await readOverview(payload, scope)
    await aJourney({ label: 'unbookmarked', hiddenFromBookmarks: true })
    const after = await readOverview(payload, scope)

    const bookmarksOf = (summary: string): number => Number(summary.split(' · ')[1]?.split(' ')[0])
    expect(bookmarksOf(after.book.summary)).toBe(bookmarksOf(before.book.summary))
  })

  it('counts a journey with a frame in it as a gallery that is open', async () => {
    const before = await readOverview(payload, scope)
    const journey = await aJourney({ label: 'gallery-open' })
    // A JOURNEY WITH NO FRAME IS NOT AN OPEN GALLERY, which is what this pair
    // shows: the figure does not move until the frame lands.
    const withEmptyGallery = await readOverview(payload, scope)
    await aFrame(journey, { label: 'the-frame' })
    const after = await readOverview(payload, scope)

    const galleriesOf = (summary: string): number => Number(summary.split(' · ')[2]?.split(' ')[0])
    expect(galleriesOf(withEmptyGallery.book.summary)).toBe(galleriesOf(before.book.summary))
    expect(galleriesOf(after.book.summary)).toBe(galleriesOf(before.book.summary) + 1)
  })

  it('takes the book’s own title and years from the global the cover screen writes', async () => {
    const book = await payload.findGlobal({ slug: 'book', ...scope, depth: 0 })
    const view = await readOverview(payload, scope)

    expect([view.book.title, view.book.years]).toEqual([book.title ?? '', book.yearsShown ?? ''])
  })

  it('prompts for the first clip with no poster, by its own id and its own journey', async () => {
    const journey = await aJourney({ label: 'needs-poster' })
    await aFrame(journey, { label: 'posterless', kind: 'clip', order: 0, caption: 'a clip', alt: 'a clip' })

    const view = await readOverview(payload, scope)
    const prompt = view.needsALook.find((candidate) => candidate.kind === 'pick-posters')
    const url = new URL(prompt?.href ?? '', 'https://example.test')

    // The frame named is a row that really has no poster — asked of Postgres
    // rather than of the prompt's own text.
    const named = await payload.findByID({
      collection: 'media',
      ...scope,
      depth: 0,
      id: Number(url.searchParams.get('frame')),
    })
    expect(named.posterAt ?? null).toBeNull()
    expect(named.kind).toBe('clip')
  })

  it('prompts for uncaptioned frames, and stops once every frame has a caption', async () => {
    const journey = await aJourney({ label: 'captions' })
    const frame = await aFrame(journey, { label: 'uncaptioned', alt: 'described' })

    const before = await readOverview(payload, scope)
    expect(before.needsALook.some((prompt) => prompt.kind === 'caption-them')).toBe(true)

    // Every other frame this run has written is captioned in the same pass, so
    // the prompt's disappearance is about the column rather than about order.
    await payload.update({
      collection: 'media',
      ...scope,
      where: { and: [{ journey: { equals: journey } }] },
      data: { caption: 'written' },
    })
    const after = await readOverview(payload, scope)

    expect(before.needsALook.find((prompt) => prompt.kind === 'caption-them')?.href).toContain('captionAll=1')
    expect(
      after.needsALook.some((prompt) => prompt.kind === 'caption-them' && prompt.href.includes(String(frame))),
    ).toBe(false)
  })

  it('prompts for a frame nobody has described, on the screen that writes alt text', async () => {
    const journey = await aJourney({ label: 'needs-alt' })
    await aFrame(journey, { label: 'undescribed', alt: null, caption: 'captioned' })

    const view = await readOverview(payload, scope)
    const prompt = view.needsALook.find((candidate) => candidate.kind === 'no-alt-text')
    const url = new URL(prompt?.href ?? '', 'https://example.test')

    const named = await payload.findByID({
      collection: 'media',
      ...scope,
      depth: 0,
      id: Number(url.searchParams.get('frame')),
    })
    expect(named.alt ?? '').toBe('')
    expect(url.pathname).toBe('/admin/galleries')
  })

  it('names a page nobody has titled rather than printing a blank in the Lately card', async () => {
    const journey = await aJourney({ label: 'untitled' })
    await aPage(journey, null)

    const view = await readOverview(payload, scope)

    expect(view.lately[0]?.what).toBe(`A page, in ${MARKER} untitled`)
  })

  it('lists what changed most recently, newest first, and never more than the card holds', async () => {
    const journey = await aJourney({ label: 'lately' })
    await aPage(journey, 'lately-page')

    const view = await readOverview(payload, scope)

    expect(view.lately.length).toBeLessThanOrEqual(LATELY_SHOWN)
    // The journey written last is the newest thing in the diary, so it leads.
    expect(view.lately[0]?.what).toContain(`${MARKER} lately`)
  })

  it('fills the Lately card to its cap rather than stopping short of it', async () => {
    // The OTHER side of the cap: a boundary pinned only from above is satisfied
    // by a card that draws nothing (standing orders, species 2).
    const journey = await aJourney({ label: 'lately-many' })
    for (const label of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) await aPage(journey, `lately-${label}`)

    expect((await readOverview(payload, scope)).lately).toHaveLength(LATELY_SHOWN)
  })

  it('keys every Lately row by its collection and row id, never by its place in the list', async () => {
    const view = await readOverview(payload, scope)

    expect(new Set(view.lately.map((row) => row.id)).size).toBe(view.lately.length)
    expect(view.lately.every((row) => /^(journey|page|media):[1-9]\d*$/u.test(row.id))).toBe(true)
  })

  it('costs a fixed number of queries, however many journeys and frames there are (CLAUDE.md §6)', async () => {
    const find = vi.spyOn(payload, 'find')
    const count = vi.spyOn(payload, 'count')
    const findGlobal = vi.spyOn(payload, 'findGlobal')
    const findVersions = vi.spyOn(payload, 'findVersions')
    const total = (): number =>
      find.mock.calls.length + count.mock.calls.length + findGlobal.mock.calls.length + findVersions.mock.calls.length

    await readOverview(payload, scope)
    const withWhatIsThere = total()

    const journey = await aJourney({ label: 'n-plus-one' })
    await aPage(journey, 'n-plus-one-page')
    await aFrame(journey, { label: 'n-plus-one-frame' })

    find.mockClear()
    count.mockClear()
    findGlobal.mockClear()
    findVersions.mockClear()
    await readOverview(payload, scope)

    expect([withWhatIsThere, total()]).toEqual([QUERIES_PER_READ, QUERIES_PER_READ])
  })
})
