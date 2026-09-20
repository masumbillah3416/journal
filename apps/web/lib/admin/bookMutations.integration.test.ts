/**
 * bookMutations.integration.test.ts — behaviour spec for SCREENS.md §2.6's two
 * writes.
 *
 * Integration test (CLAUDE.md §2): every property here is Payload's or
 * Postgres's. Whether a global write MERGES or replaces, whether a per-row
 * `order` write on a VERSIONED collection reaches the live row without
 * publishing a pending draft, and whether either of them is what the public
 * book then reads, are answers only a real Payload and a real database give.
 *
 * ═══ THE SETTINGS ARE READ BACK THROUGH THE DIARY'S OWN READER ═══
 *
 * The case that matters does not `findGlobal` the value it has just written —
 * it calls `readBookBundle`, which is what `/p/<n>` itself renders from. A test
 * that read the column back would agree with itself about a column the diary
 * might not read; `galleryMutations.integration.test.ts` avoids the same shape
 * one screen along.
 *
 * ═══ THIS FILE WRITES SHARED GLOBALS AND SHARED ROWS, SO IT PUTS THEM BACK ═══
 *
 * `book` is one row for the whole database, and
 * `readBookBundle.integration.test.ts` asserts its contents against
 * `bookGlobalSeed`. Every case here therefore restores the global, and
 * `saveBookmarkOrder` — which renumbers EVERY journey in the book, the ten
 * seeded ones included — captures every `order` in `beforeAll` and writes them
 * back in `afterAll`. Standing orders §9: the database is not a scratchpad, and
 * that applies to the test one too, because the next file in the run reads it.
 *
 * Uses `getTestPayload()` rather than `getPayload()` for its own writes, like
 * every integration file here; `readBookBundle` opens the same instance.
 * Depends on: vitest, payload (types), zod (the refusal cases),
 * `FLIP_DURATION_MS` (@travel-diary/domain/flip), `GALLERY_THUMB_SIZE`
 * (@travel-diary/domain/gallery), `userId` (@travel-diary/domain/ids),
 * `readBookBundle` (../readBookBundle), `getTestPayload` (../testPayload),
 * `seed`/`bookGlobalSeed` (../../scripts/…), `adminScope` and this module.
 */
import { FLIP_DURATION_MS } from '@travel-diary/domain/flip'
import { GALLERY_THUMB_SIZE } from '@travel-diary/domain/gallery'
import { userId, type UserId } from '@travel-diary/domain/ids'
import type { Payload } from 'payload'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { ZodError } from 'zod'
import { seed } from '../../scripts/seed'
import { bookGlobalSeed } from '../../scripts/seed-data'
import { readBookBundle } from '../readBookBundle'
import { getTestPayload } from '../testPayload'
import { adminScope, type AdminScope } from './adminScope'
import {
  BOOK_JOURNEYS_QUERY,
  MAX_BOOK_JOURNEYS,
  saveBookSettings,
  saveBookmarkOrder,
  type BookSettings,
} from './bookMutations'

/** What every row this file writes carries, so cleanup can find them all. */
const MARKER = 'test-book-mutations'

/** A password that is not one: this account is never signed in to. */
const NOT_A_PASSWORD = 'not-a-real-password'

/** `seed()` rasterises ninety-plus placeholders on a cold database. */
const SETUP_TIMEOUT_MS = 180_000

/** The `flipDurationMs` the seeded database holds, which is the column's own default. */
const SEEDED_FLIP_MS = 800

let payload: Payload
let scope: AdminScope
/** Every journey in the book and the `order` it had before this file ran. */
let placesBefore: readonly { readonly id: number; readonly order: number | null }[] = []

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
 * The `book` global exactly as `seed()` leaves it.
 *
 * WRITTEN IN `beforeAll` AS WELL AS `afterEach`, which is not belt and braces:
 * a MUTATION run against this file leaves whatever the mutated write put there,
 * and the next honest run would then fail on a column nothing in it touched.
 * Restoring first makes the file self-healing, which is what standing orders §9
 * actually asks for — the database is left as it was found, including when the
 * thing that dirtied it was a deliberate red.
 * @returns Nothing.
 */
const restoreBookGlobal = async (): Promise<void> => {
  await payload.updateGlobal({
    slug: 'book',
    data: {
      title: bookGlobalSeed.title,
      subtitle: bookGlobalSeed.subtitle,
      owner: bookGlobalSeed.owner,
      yearsShown: bookGlobalSeed.yearsShown,
      contentsNote: bookGlobalSeed.contentsNote,
      coverCloth: bookGlobalSeed.coverCloth,
      journeyOrderMode: 'manual',
      flipDurationMs: SEEDED_FLIP_MS,
      galleryThumbPx: GALLERY_THUMB_SIZE.default,
      showDecorations: true,
    },
  })
}

/**
 * The settings the seeded book has, as the screen would post them.
 * @param overrides - What this case is changing.
 * @returns A complete settings payload.
 */
const theSettings = (overrides: Partial<BookSettings> = {}): BookSettings => ({
  contentsNote: bookGlobalSeed.contentsNote,
  journeyOrderMode: 'manual',
  coverCloth: bookGlobalSeed.coverCloth,
  flipDurationMs: SEEDED_FLIP_MS,
  galleryThumbPx: GALLERY_THUMB_SIZE.default,
  showDecorations: true,
  showRibbon: true,
  showCounter: true,
  ...overrides,
})

/**
 * Every journey the book contains, in the order `journeys.order` puts them.
 * @returns The row ids, first page first.
 */
const bookJourneyIds = async (): Promise<readonly number[]> => {
  const found = await payload.find({ ...BOOK_JOURNEYS_QUERY, ...scope, sort: 'order', select: { order: true } })
  return found.docs.map((doc) => doc.id)
}

/**
 * Removes every row this file has ever written.
 *
 * RUN BEFORE AS WELL AS AFTER, for {@link restoreBookGlobal}'s reason: a
 * mutation run leaves the fixture journey behind, `journeys.slug` is `unique`,
 * and the next honest run then fails on a validation error rather than on
 * anything it is about.
 * @returns Nothing.
 */
const clean = async (): Promise<void> => {
  await payload.delete({ collection: 'journeys', where: { slug: { like: MARKER } } })
  await payload.delete({ collection: 'users', where: { email: { like: MARKER } } })
}

beforeAll(async () => {
  payload = await getTestPayload()
  await seed(payload)
  await clean()
  const account = await payload.create({
    collection: 'users',
    data: { email: `${MARKER}@example.test`, password: NOT_A_PASSWORD },
  })
  scope = await adminScope({ user: anAccount(String(account.id)) })

  const found = await payload.find({ ...BOOK_JOURNEYS_QUERY, ...scope, sort: 'order', select: { order: true } })
  // `?? null` rather than the column's own `number | null | undefined`:
  // `exactOptionalPropertyTypes` makes `undefined` a different instruction from
  // `null` on the way back in, and "the column was not selected" is not one of
  // the two states this restore has to reproduce.
  placesBefore = found.docs.map((doc) => ({ id: doc.id, order: doc.order ?? null }))
  await restoreBookGlobal()
}, SETUP_TIMEOUT_MS)

afterAll(async () => {
  await clean()
  for (const place of placesBefore) {
    await payload.update({ collection: 'journeys', ...scope, depth: 0, id: place.id, data: { order: place.order } })
  }
})

describe('saveBookSettings', () => {
  afterEach(restoreBookGlobal)

  it('prints the contents note the book screen saved, on the diary’s own contents page', async () => {
    await saveBookSettings(payload, scope, theSettings({ contentsNote: 'kept in a drawer, mostly' }))

    const bundle = await readBookBundle()

    expect(bundle.chrome.contentsNote).toBe('kept in a drawer, mostly')
  })

  it('leaves the cover’s own copy alone, because a global update merges rather than replaces', async () => {
    // THE PROPERTY THIS FILE EXISTS FOR. §2.6's card writes six of the twelve
    // columns on one global and §2.7's card writes four more of them, so if
    // `updateGlobal` replaced the document instead of merging into it, saving
    // the contents note would blank the cover title — on a screen that draws
    // no error at all (docs/deviations.md §60).
    await saveBookSettings(payload, scope, theSettings({ contentsNote: 'a second note' }))

    const bundle = await readBookBundle()

    expect({ title: bundle.chrome.title, owner: bundle.chrome.owner }).toEqual({
      title: bookGlobalSeed.title,
      owner: bookGlobalSeed.owner,
    })
  })

  it('reorders the book when the journey order mode changes, which is that column’s whole job', async () => {
    const asArranged = (await readBookBundle()).contents.map((entry) => entry.slug)

    await saveBookSettings(payload, scope, theSettings({ journeyOrderMode: 'oldest' }))
    const oldestFirst = (await readBookBundle()).contents.map((entry) => entry.slug)

    expect({ same: oldestFirst.join() === asArranged.join(), count: oldestFirst.length }).toEqual({
      same: false,
      count: asArranged.length,
    })
  })

  it('accepts the briskest page turn the slider offers', async () => {
    await expect(
      saveBookSettings(payload, scope, theSettings({ flipDurationMs: FLIP_DURATION_MS.min })),
    ).resolves.toBeUndefined()
  })

  it('refuses the first page turn below it', async () => {
    await expect(
      saveBookSettings(payload, scope, theSettings({ flipDurationMs: FLIP_DURATION_MS.min - 1 })),
    ).rejects.toThrow(ZodError)
  })

  it('accepts the most languid page turn the slider offers', async () => {
    await expect(
      saveBookSettings(payload, scope, theSettings({ flipDurationMs: FLIP_DURATION_MS.max })),
    ).resolves.toBeUndefined()
  })

  it('refuses the first page turn above it', async () => {
    await expect(
      saveBookSettings(payload, scope, theSettings({ flipDurationMs: FLIP_DURATION_MS.max + 1 })),
    ).rejects.toThrow(ZodError)
  })

  it('accepts the densest gallery thumbnail the slider offers', async () => {
    await expect(
      saveBookSettings(payload, scope, theSettings({ galleryThumbPx: GALLERY_THUMB_SIZE.min })),
    ).resolves.toBeUndefined()
  })

  it('refuses the first gallery thumbnail below it', async () => {
    await expect(
      saveBookSettings(payload, scope, theSettings({ galleryThumbPx: GALLERY_THUMB_SIZE.min - 1 })),
    ).rejects.toThrow(ZodError)
  })

  it('accepts the most generous gallery thumbnail the slider offers', async () => {
    await expect(
      saveBookSettings(payload, scope, theSettings({ galleryThumbPx: GALLERY_THUMB_SIZE.max })),
    ).resolves.toBeUndefined()
  })

  it('refuses the first gallery thumbnail above it', async () => {
    await expect(
      saveBookSettings(payload, scope, theSettings({ galleryThumbPx: GALLERY_THUMB_SIZE.max + 1 })),
    ).rejects.toThrow(ZodError)
  })

  it('refuses a journey order nobody offered, rather than listing the ones it knows are bad', async () => {
    const posted = { ...theSettings(), journeyOrderMode: 'shuffled' } as unknown as BookSettings

    await expect(saveBookSettings(payload, scope, posted)).rejects.toThrow(ZodError)
  })

  it('refuses a cover cloth that is not a colour, because the value is interpolated into CSS', async () => {
    await expect(
      saveBookSettings(payload, scope, theSettings({ coverCloth: 'red); background: url(http://evil' })),
    ).rejects.toThrow(ZodError)
  })
})

describe('saveBookmarkOrder', () => {
  it('starts from a book of more than two journeys, so a rotation is not the identity', async () => {
    // THE FIXTURE'S OWN SHAPE, ASSERTED. With fewer than two journeys every
    // case below holds against a write that does nothing at all.
    expect((await bookJourneyIds()).length).toBeGreaterThan(2)
  })

  it('writes an order the public book reads back, so the admin list and the diary agree', async () => {
    const before = await bookJourneyIds()
    const rotated = [...before.slice(1), ...before.slice(0, 1)]

    await saveBookmarkOrder(payload, scope, rotated.map(String))

    expect(await bookJourneyIds()).toEqual(rotated)
  })

  it('moves the contents index the reader sees, not merely a column', async () => {
    const before = (await readBookBundle()).contents.map((entry) => entry.slug)
    const ids = await bookJourneyIds()

    await saveBookmarkOrder(payload, scope, [...ids.slice(1), ...ids.slice(0, 1)].map(String))

    const after = (await readBookBundle()).contents.map((entry) => entry.slug)
    expect({ first: after[0], same: after.join() === before.join() }).toEqual({ first: before[1], same: false })
  })

  it('touches only the journeys that moved, not the whole book', async () => {
    // ONE WRITE PER ROW THAT MOVED. On a versioned collection every write mints
    // a version row, so re-saving the order a book already has must be a read
    // and nothing else — measured by the `updatedAt` of a journey that did not
    // move, which is the same instrument `galleryMutations.integration.test.ts`
    // uses one screen along.
    const ids = await bookJourneyIds()
    const watched = ids[0] ?? 0
    const before = await payload.findByID({ collection: 'journeys', ...scope, depth: 0, id: watched })

    await saveBookmarkOrder(payload, scope, ids.map(String))

    const after = await payload.findByID({ collection: 'journeys', ...scope, depth: 0, id: watched })
    expect(after.updatedAt).toBe(before.updatedAt)
  })

  it('refuses an order that omits a journey the book has', async () => {
    const ids = await bookJourneyIds()

    await expect(saveBookmarkOrder(payload, scope, ids.slice(1).map(String))).rejects.toThrow(
      /must name each of them exactly once/u,
    )
  })

  it('refuses an order that names one journey twice', async () => {
    const ids = await bookJourneyIds()

    await expect(saveBookmarkOrder(payload, scope, [...ids.map(String), String(ids[0])])).rejects.toThrow(
      /distinct journeys/u,
    )
  })

  it('refuses an order naming a journey the book does not contain', async () => {
    const ids = await bookJourneyIds()

    await expect(saveBookmarkOrder(payload, scope, [...ids.slice(1).map(String), '99999999'])).rejects.toThrow(
      /must name each of them exactly once/u,
    )
  })

  it('refuses an id that is not a row id at all, rather than asking Postgres about NaN', async () => {
    await expect(saveBookmarkOrder(payload, scope, ['nonsense'])).rejects.toThrow(ZodError)
  })

  it('refuses an order with no journeys in it, which is a write with no subject', async () => {
    await expect(saveBookmarkOrder(payload, scope, [])).rejects.toThrow(ZodError)
  })

  it('takes an order exactly as long as the cap as far as the book, which is then what refuses it', async () => {
    // THE PERMITTED SIDE OF THE CAP, and it is pinned by the error it does NOT
    // throw. A list of `MAX_BOOK_JOURNEYS` ids is inside the parse, so the
    // refusal has to come from the bijection instead — which is how this case
    // tells "the cap let it through" apart from "something refused it".
    const tooMany = Array.from({ length: MAX_BOOK_JOURNEYS }, (_, index) => String(index + 1))

    await expect(saveBookmarkOrder(payload, scope, tooMany)).rejects.toThrow(/must name each of them exactly once/u)
  })

  it('refuses the first order longer than the cap before it asks the database anything', async () => {
    const past = Array.from({ length: MAX_BOOK_JOURNEYS + 1 }, (_, index) => String(index + 1))

    await expect(saveBookmarkOrder(payload, scope, past)).rejects.toThrow(ZodError)
  })

  it('never publishes a journey’s pending draft, which is the trap this collection has already sprung', async () => {
    // Payload's `updateByID` merges into the NEWEST VERSION whatever `draft`
    // says, so a one-line `update({ data: { order } })` here would write an
    // author's unpublished rewrite into the live row and stamp it
    // `_status: 'draft'` — one press of Archive did exactly that on this
    // collection in Task 4. Asserted from BOTH sides: the published row still
    // says what a reader sees, and the draft is still reachable, because a
    // write that discarded the draft outright would satisfy the first alone.
    const created = await payload.create({
      collection: 'journeys',
      ...scope,
      data: {
        name: `${MARKER} published`,
        place: 'Patagonia',
        slug: `${MARKER}-draft-safety`,
        dates: '2 – 15 March 2025',
        _status: 'published',
      },
    })
    await payload.update({
      collection: 'journeys',
      ...scope,
      id: created.id,
      draft: true,
      data: { name: `${MARKER} unpublished rewrite` },
    })

    const ids = await bookJourneyIds()
    await saveBookmarkOrder(payload, scope, [String(created.id), ...ids.filter((id) => id !== created.id).map(String)])

    const live = await payload.findByID({ collection: 'journeys', ...scope, depth: 0, id: created.id })
    const newest = await payload.findByID({ collection: 'journeys', ...scope, depth: 0, draft: true, id: created.id })

    expect({ status: live._status, live: live.name, draft: newest.name, place: live.order }).toEqual({
      status: 'published',
      live: `${MARKER} published`,
      draft: `${MARKER} unpublished rewrite`,
      place: 0,
    })

    await payload.delete({ collection: 'journeys', ...scope, id: created.id })
  })
})
