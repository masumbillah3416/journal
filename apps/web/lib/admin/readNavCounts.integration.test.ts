/**
 * readNavCounts.integration.test.ts — behaviour spec for the four numbers the
 * rail prints beside its buttons.
 *
 * Integration test (CLAUDE.md §2): every property here is Postgres's. Whether a
 * trashed journey leaves the journeys count, whether a draft is what the
 * unpublished chip counts, and — the one that matters for CLAUDE.md §6 —
 * whether the rail's numbers cost a fixed number of queries or one per row, are
 * all answers only a real database gives.
 *
 * WHAT PRODUCED EACH SIDE OF THE FIRST COMPARISON, because "two queries, one
 * truth" is easy to write and easy to get wrong: the left side is a
 * `SELECT count(*)`, and the right side is the LENGTH OF THE ROWS PAYLOAD
 * ACTUALLY RETURNED. Comparing two `totalDocs` values would compare two
 * readings of the same counter and would pass for a count of the wrong table.
 *
 * Uses `getTestPayload()` rather than `getPayload()`, like every integration
 * file here, so these rows land in the isolated `diary_test` database.
 * `adminScope` itself calls `getPayload()`, which is the same memoised instance
 * `getTestPayload()` bootstraps.
 *
 * Every row it writes carries {@link MARKER} in its slug or email and is
 * deleted before and after the run: before, because a previous crashed run
 * would otherwise collide with the unique index on `slug`.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import { userId } from '@travel-diary/domain/ids'
import type { UserId } from '@travel-diary/domain/ids'
import { getTestPayload } from '../testPayload'
import { adminScope } from './adminScope'
import { readNavCounts } from './readNavCounts'

/** What every row this file writes carries, so cleanup can find them all. */
const MARKER = 'test-nav-counts'

/** A password that is not one: this account is never signed in to. */
const NOT_A_PASSWORD = 'not-a-real-password'

/** How many queries the four counts are allowed to cost, whatever the row count. */
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

/** What a journey fixture says about itself. */
interface JourneyFixture {
  /** What distinguishes this row's slug from the others'. */
  readonly name: string
  /** Whether it has been published, or is still a draft. */
  readonly status: 'draft' | 'published'
  /** When it was moved to the trash, or `null` for a live journey. */
  readonly deletedAt: string | null
}

/**
 * Creates one journey for a case to count.
 *
 * @param fixture - See {@link JourneyFixture}. Every field is stated rather
 *   than defaulted: a case about drafts cannot rest on what Payload does with
 *   an absent `_status`.
 * @returns The created row's id.
 */
const aJourney = async ({ name, status, deletedAt }: JourneyFixture): Promise<number> => {
  const created = await payload.create({
    collection: 'journeys',
    data: {
      name: `${MARKER} ${name}`,
      place: 'Nowhere',
      slug: `${MARKER}-${name}`,
      dates: 'one day',
      _status: status,
      ...(deletedAt === null ? {} : { deletedAt }),
    },
  })
  return created.id
}

/** Removes every row this file has ever written. */
const clean = async (): Promise<void> => {
  await payload.delete({ collection: 'journeys', where: { slug: { like: MARKER } } })
  await payload.delete({ collection: 'users', where: { email: { like: MARKER } } })
}

beforeAll(async () => {
  payload = await getTestPayload()
  await clean()
  const account = await payload.create({
    collection: 'users',
    data: { email: `${MARKER}@example.test`, password: NOT_A_PASSWORD },
  })
  author = anAccount(String(account.id))
}, 60_000)

afterEach(() => {
  vi.restoreAllMocks()
})

afterAll(async () => {
  await clean()
})

describe('readNavCounts', () => {
  it('counts the live journeys Postgres actually holds, not a length the caller already had', async () => {
    const scope = await adminScope({ user: author })
    await aJourney({ name: 'counted', status: 'published', deletedAt: null })

    const counts = await readNavCounts(payload, scope)

    // The left side is a `SELECT count(*)`; the right side is how many rows
    // Payload actually handed back for the same question. Two mechanisms, one
    // truth — `pagination: false` so the right side is every row, not a page.
    const all = await payload.find({
      collection: 'journeys',
      ...scope,
      pagination: false,
      depth: 0,
      where: { deletedAt: { exists: false } },
    })

    expect(counts.journeys).toBe(all.docs.length)
  })

  it('excludes trashed journeys from the journeys count and counts them under trash instead', async () => {
    const scope = await adminScope({ user: author })
    const before = await readNavCounts(payload, scope)

    await aJourney({ name: 'trashed', status: 'published', deletedAt: new Date().toISOString() })
    const after = await readNavCounts(payload, scope)

    expect(after.journeys).toBe(before.journeys)
    expect(after.trashed).toBe(before.trashed + 1)
  })

  it('counts a draft under unpublished and a published journey under neither', async () => {
    const scope = await adminScope({ user: author })
    const before = await readNavCounts(payload, scope)

    await aJourney({ name: 'draft', status: 'draft', deletedAt: null })
    const withDraft = await readNavCounts(payload, scope)

    await aJourney({ name: 'published', status: 'published', deletedAt: null })
    const withBoth = await readNavCounts(payload, scope)

    expect(withDraft.unpublished).toBe(before.unpublished + 1)
    expect(withBoth.unpublished).toBe(withDraft.unpublished)
    // Both are live journeys either way, so the journeys count sees two more.
    expect(withBoth.journeys).toBe(before.journeys + 2)
  })

  it('does not call a journey in the trash unpublished, because the trash is not a queue to go out', async () => {
    const scope = await adminScope({ user: author })
    const before = await readNavCounts(payload, scope)

    await aJourney({ name: 'trashed-draft', status: 'draft', deletedAt: new Date().toISOString() })
    const after = await readNavCounts(payload, scope)

    expect(after.unpublished).toBe(before.unpublished)
    expect(after.trashed).toBe(before.trashed + 1)
  })

  it('counts media against the rows the library actually holds', async () => {
    const scope = await adminScope({ user: author })

    const counts = await readNavCounts(payload, scope)
    const all = await payload.find({ collection: 'media', ...scope, pagination: false, depth: 0 })

    expect(counts.media).toBe(all.docs.length)
  })

  it('costs four counts and loads no rows, however many journeys there are (CLAUDE.md §6)', async () => {
    const scope = await adminScope({ user: author })
    const count = vi.spyOn(payload, 'count')
    const find = vi.spyOn(payload, 'find')

    await readNavCounts(payload, scope)
    const withWhatIsThere = count.mock.calls.length + find.mock.calls.length
    // `find` hydrates rows; `count` is a `SELECT count(*)`. Zero is what makes
    // "without loading them" a measurement rather than a sentence — and it is
    // what fails if a count is ever spelled `find({ limit: 0 })`, which in
    // Payload means no limit at all.
    expect(find).not.toHaveBeenCalled()

    await aJourney({ name: 'extra-one', status: 'draft', deletedAt: null })
    await aJourney({ name: 'extra-two', status: 'published', deletedAt: null })
    await aJourney({ name: 'extra-three', status: 'published', deletedAt: new Date().toISOString() })

    count.mockClear()
    find.mockClear()
    await readNavCounts(payload, scope)
    const withThreeMore = count.mock.calls.length + find.mock.calls.length
    expect(find).not.toHaveBeenCalled()

    // Both halves matter. The equality catches a per-row query; the number
    // catches a fixed cost that is nonetheless four reads of the whole table.
    expect(withThreeMore).toBe(withWhatIsThere)
    expect(withThreeMore).toBe(QUERIES_PER_READ)
  })

  it('runs every count under the scope it was handed, with Payload access control on', async () => {
    const scope = await adminScope({ user: author })
    const count = vi.spyOn(payload, 'count')

    await readNavCounts(payload, scope)

    // Not a restatement of the type: it is the CALL SITES that are asserted. A
    // count that dropped the spread would reach Payload with the rules off and
    // no user, which is what Task 2 exists to stop.
    expect(count.mock.calls.every(([options]) => options.overrideAccess === false)).toBe(true)
    // IDENTITY, not equality: every call must carry the very object the caller
    // hoisted. A module that called `adminScope` itself, once per count, would
    // hand over four freshly-read rows that compare equal field by field and
    // are four `users` lookups — the N+1 CLAUDE.md §7 forbids, and the defect
    // the plan's own line taught until a review caught it.
    expect(count.mock.calls.every(([options]) => options.user === scope.user)).toBe(true)
  })
})
