/**
 * readBookScreen.integration.test.ts — behaviour spec for SCREENS.md §2.6's read.
 *
 * Integration test (CLAUDE.md §2): the questions here are Payload's. What a
 * `findGlobal` returns for a column an editor has never set, what a `sort` by a
 * nullable date column does to ten rows, and whether the list this screen draws
 * is the SAME list the public book prints, are answers only a real Payload and
 * a real database give.
 *
 * ═══ "p. {n}" IS CHECKED AGAINST THE BOOK, NOT AGAINST ARITHMETIC ═══
 *
 * The case that matters reads `readBookBundle` — what `/p/<n>` renders from —
 * and compares its contents entries to the numbers this screen prints. The two
 * are computed by different code down different paths (`derivePages` plus
 * `deriveContents` there, `numberBookmarkPages` here), so agreement is
 * evidence rather than a tautology.
 *
 * ═══ THIS FILE WRITES THE `book` GLOBAL, SO IT PUTS IT BACK ═══
 *
 * Changing `journeyOrderMode` is the only way to exercise the sort, and that
 * column is one row for the whole database. It is restored in `afterEach` and
 * again in `beforeAll`, so a mutation run leaves the database as it found it
 * (standing orders §9).
 *
 * Depends on: vitest, payload (types), `readBookBundle` (../readBookBundle),
 * `getTestPayload` (../testPayload), `seed` (../../scripts/seed), `adminScope`,
 * `saveBookSettings` (./bookMutations) and this module.
 */
import { GALLERY_THUMB_SIZE } from '@travel-diary/domain/gallery'
import { userId, type UserId } from '@travel-diary/domain/ids'
import type { Payload } from 'payload'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { seed } from '../../scripts/seed'
import { bookGlobalSeed } from '../../scripts/seed-data'
import { readBookBundle } from '../readBookBundle'
import { getTestPayload } from '../testPayload'
import { adminScope, type AdminScope } from './adminScope'
import { readBookScreen } from './readBookScreen'

/** What every row this file writes carries, so cleanup can find them all. */
const MARKER = 'test-read-book-screen'

/** A password that is not one: this account is never signed in to. */
const NOT_A_PASSWORD = 'not-a-real-password'

/** `seed()` rasterises ninety-plus placeholders on a cold database. */
const SETUP_TIMEOUT_MS = 180_000

/** The `flipDurationMs` the seeded database holds, which is the column's own default. */
const SEEDED_FLIP_MS = 800

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
 * The `book` global exactly as `seed()` leaves it.
 * @returns Nothing.
 */
const restoreBookGlobal = async (): Promise<void> => {
  await payload.updateGlobal({
    slug: 'book',
    data: {
      contentsNote: bookGlobalSeed.contentsNote,
      coverCloth: bookGlobalSeed.coverCloth,
      journeyOrderMode: 'manual',
      flipDurationMs: SEEDED_FLIP_MS,
      galleryThumbPx: GALLERY_THUMB_SIZE.default,
      showDecorations: true,
      showRibbon: true,
      showCounter: true,
    },
  })
}

beforeAll(async () => {
  payload = await getTestPayload()
  await seed(payload)
  await payload.delete({ collection: 'journeys', where: { slug: { like: MARKER } } })
  await payload.delete({ collection: 'users', where: { email: { like: MARKER } } })
  const account = await payload.create({
    collection: 'users',
    data: { email: `${MARKER}@example.test`, password: NOT_A_PASSWORD },
  })
  scope = await adminScope({ user: anAccount(String(account.id)) })
  await restoreBookGlobal()
}, SETUP_TIMEOUT_MS)

afterAll(async () => {
  await restoreBookGlobal()
  await payload.delete({ collection: 'journeys', where: { slug: { like: MARKER } } })
  await payload.delete({ collection: 'users', where: { email: { like: MARKER } } })
})

afterEach(restoreBookGlobal)

describe('readBookScreen — the bookmark list', () => {
  it('opens with Cover and Contents and ends with About, which is where the book puts those pages', async () => {
    const view = await readBookScreen(payload, scope)

    expect([view.rows[0]?.kind, view.rows[1]?.kind, view.rows[view.rows.length - 1]?.kind]).toEqual([
      'cover',
      'contents',
      'about',
    ])
  })

  it('draws one row per journey the book contains, and three more', async () => {
    const view = await readBookScreen(payload, scope)
    const bundle = await readBookBundle()

    expect(view.rows.filter((row) => row.kind === 'journey')).toHaveLength(bundle.contents.length)
  })

  it('prints the page each journey actually opens at, as the diary’s own contents index has it', async () => {
    // THE CASE THIS SCREEN EXISTS TO GET RIGHT. Both sides are derived and
    // neither is arithmetic written in this file: `deriveContents` walks the
    // reading sequence, `numberBookmarkPages` walks the list.
    const view = await readBookScreen(payload, scope)
    const bundle = await readBookBundle()

    expect(view.rows.filter((row) => row.kind === 'journey').map((row) => row.pageNumber)).toEqual(
      bundle.contents.map((entry) => entry.pageNumber),
    )
  })

  it('numbers Cover 1 and Contents 2, which is what the book prints on them', async () => {
    const view = await readBookScreen(payload, scope)

    expect([view.rows[0]?.pageNumber, view.rows[1]?.pageNumber]).toEqual([1, 2])
  })

  it('numbers About as the last page of the book, not as a page of its own', async () => {
    const view = await readBookScreen(payload, scope)
    const bundle = await readBookBundle()

    expect(view.rows[view.rows.length - 1]?.pageNumber).toBe(bundle.pages.length)
  })

  it('names every journey row by its row id, never by its slug', async () => {
    // CLAUDE.md §0.9, and the arrows post these ids straight to
    // `saveBookmarkOrder`, which matches them against `journeys.id`.
    const view = await readBookScreen(payload, scope)
    const journeys = view.rows.filter((row) => row.kind === 'journey')

    expect(journeys.every((row) => /^\d+$/u.test(row.id))).toBe(true)
  })

  it('paints each journey row’s square in that journey’s own accent', async () => {
    const view = await readBookScreen(payload, scope)
    const journeys = view.rows.filter((row) => row.kind === 'journey')

    expect(journeys.every((row) => /^#[0-9a-f]{6}$/iu.test(row.tint))).toBe(true)
  })

  it('falls back to the fixed rows’ tint for a journey whose accent was cleared', async () => {
    // `journeys.furniture.accent` has a `defaultValue`, so this is the state a
    // row written outside the editor reaches — and a square with no colour at
    // all would be an invisible row rather than a visible one.
    const created = await payload.create({
      collection: 'journeys',
      ...scope,
      data: {
        name: `${MARKER} no accent`,
        place: 'Nowhere',
        slug: `${MARKER}-no-accent`,
        dates: '1 – 2 January 2025',
        _status: 'published',
        furniture: { accent: null },
      },
    })

    const view = await readBookScreen(payload, scope)
    const row = view.rows.find((candidate) => candidate.id === String(created.id))

    await payload.delete({ collection: 'journeys', ...scope, id: created.id })

    expect(row?.tint).toBe('#8a7a5f')
  })

  it('lists the journeys in the same order the book reads them', async () => {
    const view = await readBookScreen(payload, scope)
    const bundle = await readBookBundle()

    expect(view.rows.filter((row) => row.kind === 'journey').map((row) => row.name)).toEqual(
      bundle.contents.map((entry) => entry.name),
    )
  })
})

describe('readBookScreen — the journey order mode', () => {
  it('re-sorts the list with the book when the mode changes, rather than keeping its own order', async () => {
    const asArranged = (await readBookScreen(payload, scope)).rows.map((row) => row.name)

    await payload.updateGlobal({ slug: 'book', ...scope, data: { journeyOrderMode: 'oldest' } })
    const oldestFirst = await readBookScreen(payload, scope)
    const bundle = await readBookBundle()

    expect({
      moved: oldestFirst.rows.map((row) => row.name).join() !== asArranged.join(),
      matchesTheBook:
        oldestFirst.rows
          .filter((row) => row.kind === 'journey')
          .map((row) => row.name)
          .join() === bundle.contents.map((entry) => entry.name).join(),
    }).toEqual({ moved: true, matchesTheBook: true })
  })

  it('offers the arrows while the book is arranged by hand', async () => {
    expect((await readBookScreen(payload, scope)).arrangeable).toBe(true)
  })

  it('withholds the arrows under Newest first, where a press would write a column the book ignores', async () => {
    await payload.updateGlobal({ slug: 'book', ...scope, data: { journeyOrderMode: 'newest' } })

    expect((await readBookScreen(payload, scope)).arrangeable).toBe(false)
  })

  it('withholds them under Oldest first as well, which is the other half of the same rule', async () => {
    await payload.updateGlobal({ slug: 'book', ...scope, data: { journeyOrderMode: 'oldest' } })

    expect((await readBookScreen(payload, scope)).arrangeable).toBe(false)
  })
})

describe('readBookScreen — the settings card', () => {
  it('reads back the settings the book holds', async () => {
    const view = await readBookScreen(payload, scope)

    expect(view.settings).toEqual({
      contentsNote: bookGlobalSeed.contentsNote,
      journeyOrderMode: 'manual',
      coverCloth: bookGlobalSeed.coverCloth,
      flipDurationMs: SEEDED_FLIP_MS,
      galleryThumbPx: GALLERY_THUMB_SIZE.default,
      showDecorations: true,
      showRibbon: true,
      showCounter: true,
    })
  })

  it('falls back to the column’s own defaults for a book that has cleared every one of them', async () => {
    // None of these columns is `required: true`, so an editor clearing one is an
    // ordinary state — and a card drawn from `undefined` would post `undefined`
    // straight back to a parse that refuses it. Every field is cleared in one
    // case rather than one case each: the behaviour is a single mapping.
    await payload.updateGlobal({
      slug: 'book',
      data: {
        contentsNote: null,
        coverCloth: null,
        journeyOrderMode: null,
        flipDurationMs: null,
        galleryThumbPx: null,
        showDecorations: null,
        showRibbon: null,
        showCounter: null,
      },
    })

    expect((await readBookScreen(payload, scope)).settings).toEqual({
      contentsNote: '',
      journeyOrderMode: 'manual',
      coverCloth: '',
      flipDurationMs: SEEDED_FLIP_MS,
      galleryThumbPx: GALLERY_THUMB_SIZE.default,
      showDecorations: true,
      showRibbon: true,
      showCounter: true,
    })
  })
})
