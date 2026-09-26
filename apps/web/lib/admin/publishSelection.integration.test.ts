/**
 * publishSelection.integration.test.ts — what SCREENS.md §2.8's primary button
 * does to the database, and the design spec §8 property that makes it worth
 * doing: "on-demand revalidation of affected paths only".
 *
 * ═══ THE TWO SIDES OF THE PUBLISH CASE ═══
 *
 * The left is the string the action was ASKED to publish; the right is what
 * `readBookBundle` — the diary's own production mapper — reads back out of
 * Postgres. Nothing in between is written by this file: no fixture sets a
 * published note, and no assertion reads a column. A publish that landed in a
 * version the book does not see fails here.
 *
 * ═══ AND WHY THE REVALIDATION CASE COMPARES WHAT IT COMPARES ═══
 *
 * The plan's own version of it asked `affectedPaths` for the right-hand side
 * — the same function the module under test calls, over the same bundle. Both
 * sides would have come from one call, which proves the module defers to the
 * pure function and nothing about which paths it names (standing orders, §12:
 * the Task 10 cover preview, three times over).
 *
 * So the right-hand side here is built from the BOOK'S OWN PAGE LIST, keyed by
 * journey id, with no call to `affectedPaths` in it. That makes three separate
 * mutations fail: deleting the path computation (the answer is empty),
 * widening it to every path (Lisbon's pages appear), and computing it over the
 * whole pending list instead of the selection (Lisbon's pages appear).
 *
 * Uses `getTestPayload()`, so these rows land in the isolated `diary_test`
 * database, and `readBookBundle` reaches the same one because this project's
 * `DATABASE_URL` names it. Every row carries {@link MARKER} and is deleted
 * before and after the run.
 * Depends on: vitest, payload (types), @travel-diary/domain/ids,
 * @travel-diary/domain/pageAddress, ../readBookBundle, ../testPayload,
 * ./adminScope, ./publishSelection, ./readPendingChanges.
 */
import type { JourneyPage } from '@travel-diary/domain/bookBundle'
import { journeyId, userId, type JourneyId, type UserId } from '@travel-diary/domain/ids'
import { pagePath } from '@travel-diary/domain/pageAddress'
import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { readBookBundle } from '../readBookBundle'
import { getTestPayload } from '../testPayload'
import { adminScope, type AdminScope } from './adminScope'
import { publishSelection, readEdition, readSelection, restoreEdition, revertChange } from './publishSelection'
import { EDITIONS_SHOWN, readEditions, readPendingChanges } from './readPendingChanges'

/** What every row this file writes carries, so cleanup can find them all. */
const MARKER = 'test-publish-selection'

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
 * A branded journey id for a row id.
 * @param raw - The row id.
 * @returns The branded id.
 */
const aJourneyId = (raw: number): JourneyId => {
  const built = journeyId(String(raw))
  if (!built.ok) throw new Error(built.error)
  return built.value
}

/** Removes every row this file has ever written. */
const clean = async (): Promise<void> => {
  await payload.delete({ collection: 'pages', where: { title: { like: MARKER } } })
  await payload.delete({ collection: 'journeys', where: { slug: { like: MARKER } } })
  await payload.delete({ collection: 'users', where: { email: { like: MARKER } } })
}

/**
 * A published journey, as a reader is looking at it right now.
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
      dates: '3 - 9 Mar 2025',
      startsOn: '2025-03-03T00:00:00.000Z',
      note: `${label}, as published`,
      _status: 'published',
    },
  })
  return created.id
}

/**
 * Saves an unpublished edit, the way SCREENS.md §2.3's Save draft does.
 * @param journey - The journey's row id.
 * @param note - The line the author typed.
 */
const editJourney = async (journey: number, note: string): Promise<void> => {
  await payload.update({ collection: 'journeys', id: journey, ...scope, draft: true, data: { note } })
}

/**
 * The note the public book prints for one journey.
 *
 * THROUGH `readBookBundle`, which is the diary's own reader: the case's right
 * side is what a reader would see, not a column this file chose to look at.
 * @param journey - The journey's row id.
 * @returns The note, or `undefined` when the book does not hold the journey.
 */
const publishedNote = async (journey: number): Promise<string | undefined> => {
  const bundle = await readBookBundle()
  const branded = aJourneyId(journey)
  return bundle.pages.find((page): page is JourneyPage => 'journeyId' in page && page.journeyId === branded)?.note
}

/**
 * Every `/p/<n>` one journey's pages occupy in the book as it stands.
 * @param journey - The journey's row id.
 * @returns Its page paths, read off the book's own page list — never off
 *   `affectedPaths`, which is the thing under test.
 */
const pagePathsOf = async (journey: number): Promise<readonly string[]> => {
  const bundle = await readBookBundle()
  const branded = aJourneyId(journey)
  return bundle.pages.flatMap((page, index) =>
    'journeyId' in page && page.journeyId === branded ? [pagePath(index)] : [],
  )
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

describe('publishSelection', () => {
  it('publishes what was ticked and leaves what was not, in the same call', async () => {
    const tokyo = await aPublishedJourney('tokyo')
    const lisbon = await aPublishedJourney('lisbon')
    await editJourney(tokyo, 'tokyo, edited')
    await editJourney(lisbon, 'lisbon, edited')

    await publishSelection(payload, scope, [`journey:${String(tokyo)}`])

    expect(await publishedNote(tokyo)).toBe('tokyo, edited')
    expect(await publishedNote(lisbon)).not.toBe('lisbon, edited')
  })

  it('names the paths the published journey occupies, the contents page and its gallery, and no path of the journey left behind', async () => {
    const kyoto = await aPublishedJourney('kyoto')
    const porto = await aPublishedJourney('porto')
    await editJourney(kyoto, 'kyoto, edited')
    await editJourney(porto, 'porto, edited')

    const kyotoPages = await pagePathsOf(kyoto)
    const portoPages = await pagePathsOf(porto)
    const revalidated = await publishSelection(payload, scope, [`journey:${String(kyoto)}`])

    // EVERY SIDE OF THIS IS BUILT FROM THE BOOK, not from `affectedPaths`.
    expect(revalidated).toEqual(expect.arrayContaining([...kyotoPages]))
    expect(revalidated).toContain(`/gallery/${MARKER}-kyoto`)
    expect(revalidated).toContain(pagePath(1))
    expect(revalidated.filter((path) => portoPages.includes(path))).toEqual([])
    expect(revalidated).not.toContain(`/gallery/${MARKER}-porto`)
  })

  it('publishes nothing and revalidates nothing for an empty selection', async () => {
    // THE WORST DEFAULT THIS SCREEN COULD HAVE. An empty array is a selection
    // of nothing, never a selection of everything — both halves asserted, so
    // an implementation that published the world here fails on the note and an
    // implementation that revalidated the book fails on the paths.
    const bergen = await aPublishedJourney('bergen')
    await editJourney(bergen, 'bergen, edited')

    const find = vi.spyOn(payload, 'find')
    const update = vi.spyOn(payload, 'update')
    const revalidated = await publishSelection(payload, scope, [])
    const asked = [find.mock.calls.length, update.mock.calls.length]
    find.mockRestore()
    update.mockRestore()

    expect(revalidated).toEqual([])
    expect(await publishedNote(bergen)).toBe('bergen, as published')
    // AND IT ASKS NOTHING. Without this the early return is unprovable: the
    // selection-is-empty guard and the nothing-was-still-waiting guard both
    // answer `[]`, so removing the first one left every other assertion here
    // green (watched). A press of an inert button costs no statement at all.
    expect(asked).toEqual([0, 0])
  })

  it('ignores an id that is no longer waiting, because the form it came from is a render old', async () => {
    const seville = await aPublishedJourney('seville')
    await editJourney(seville, 'seville, edited')
    await publishSelection(payload, scope, [`journey:${String(seville)}`])

    // Published once already: the second press of a stale form has nothing to
    // publish and no path to invalidate.
    expect(await publishSelection(payload, scope, [`journey:${String(seville)}`])).toEqual([])
  })

  it('publishes the live half of a selection whose other half has gone stale', async () => {
    // THE MIXED PRESS, which is the only way the per-id skip inside the write
    // loop is reachable: a selection in which some ids are still waiting and
    // some are not. With both halves stale the loop never runs, and with
    // neither stale it never skips.
    const nara = await aPublishedJourney('nara')
    const kobe = await aPublishedJourney('kobe')
    await editJourney(nara, 'nara, edited')
    await publishSelection(payload, scope, [`journey:${String(nara)}`])
    await editJourney(kobe, 'kobe, edited')

    const naraPages = await pagePathsOf(nara)
    const kobePages = await pagePathsOf(kobe)
    const revalidated = await publishSelection(payload, scope, [`journey:${String(nara)}`, `journey:${String(kobe)}`])

    expect(await publishedNote(kobe)).toBe('kobe, edited')
    expect(revalidated).toEqual(expect.arrayContaining([...kobePages]))
    expect(revalidated.filter((path) => naraPages.includes(path))).toEqual([])
  })

  it.each([
    ['media:12', 'a kind no collection here can hold a draft of'],
    ['journey:012', 'a second spelling of one row id'],
    ['', 'an empty body'],
  ])('refuses %s — %s — rather than publishing something else', async (posted) => {
    await expect(publishSelection(payload, scope, [posted])).rejects.toThrow(/publishSelection/u)
  })
})

describe('readSelection and readEdition', () => {
  it('reads every ticked box, not only the last one', () => {
    // FORM DATA, NOT AN OBJECT LITERAL, and the reason is the whole of this
    // function: the Changes card posts one `change` field PER TICKED ROW, and
    // `Object.fromEntries` keeps only the last of a repeated name — which would
    // publish one change out of four and look like it worked.
    const form = new FormData()
    for (const id of ['journey:11', 'page:41', 'journey:12']) form.append('change', id)

    expect(readSelection(form)).toEqual(['journey:11', 'page:41', 'journey:12'])
  })

  it('drops an entry that arrived as a file rather than a string', () => {
    // A shape a crafted `POST` really sends. It is dropped here and would have
    // been refused by the parse anyway, which is the belt this braces.
    const form = new FormData()
    form.append('change', 'journey:11')
    form.append('change', new File([], 'not-an-id'))

    expect(readSelection(form)).toEqual(['journey:11'])
  })

  it('answers an empty selection for a body with no ticks in it', () => {
    expect(readSelection(new FormData())).toEqual([])
  })

  it('reads the edition id the Editions card posted', () => {
    const form = new FormData()
    form.append('edition', '904')

    expect(readEdition(form)).toBe('904')
  })

  it('answers an empty id for a body that names no edition, which the read then refuses', () => {
    expect(readEdition(new FormData())).toBe('')
  })
})

describe('revertChange', () => {
  it('drops the pending draft and leaves the live row exactly where readers already saw it', async () => {
    const hanoi = await aPublishedJourney('hanoi')
    await editJourney(hanoi, 'hanoi, edited')
    const waitingBefore = (await readPendingChanges(payload, scope)).map((change) => change.id)

    await revertChange(payload, scope, `journey:${String(hanoi)}`)

    const waitingAfter = (await readPendingChanges(payload, scope)).map((change) => change.id)
    expect(waitingBefore).toContain(`journey:${String(hanoi)}`)
    expect(waitingAfter).not.toContain(`journey:${String(hanoi)}`)
    // THE LIVE ROW IS THE COLUMN A REVERT MUST NOT MOVE — a revert that
    // published the draft on its way to discarding it would pass a "no longer
    // waiting" assertion on its own.
    expect(await publishedNote(hanoi)).toBe('hanoi, as published')
  })

  it('refuses an id that names nothing this screen can revert', async () => {
    await expect(revertChange(payload, scope, 'media:12')).rejects.toThrow(/revertChange/u)
  })

  it('refuses to revert a journey that has never been published, because there is nothing behind it', async () => {
    const created = await payload.create({
      collection: 'journeys',
      ...scope,
      data: {
        name: `${MARKER} unborn`,
        place: 'Peru',
        slug: `${MARKER}-unborn`,
        dates: '1 Jan 2025',
        startsOn: '2025-01-01T00:00:00.000Z',
        _status: 'draft',
      },
    })

    await expect(revertChange(payload, scope, `journey:${String(created.id)}`)).rejects.toThrow(/never been published/u)
  })
})

describe('readEditions and restoreEdition', () => {
  it('lists a journey’s published editions newest first, marking the one that is live', async () => {
    const oslo = await aPublishedJourney('oslo')
    await editJourney(oslo, 'oslo, second edition')
    await publishSelection(payload, scope, [`journey:${String(oslo)}`])

    const mine = (await readEditions(payload, scope)).filter((edition) => edition.what.includes(`${MARKER} oslo`))

    expect(mine.length).toBeGreaterThanOrEqual(2)
    expect(mine.map((edition) => edition.live)).toEqual([true, ...mine.slice(1).map(() => false)])
  })

  it('puts an older edition back on the page a reader is looking at', async () => {
    const porto = await aPublishedJourney('porto-editions')
    await editJourney(porto, 'porto, second edition')
    await publishSelection(payload, scope, [`journey:${String(porto)}`])

    const older = (await readEditions(payload, scope)).filter(
      (edition) => edition.what.includes(`${MARKER} porto-editions`) && !edition.live,
    )
    const first = older[0]
    if (first === undefined) throw new Error('the fixture published twice and produced one edition')

    const revalidated = await restoreEdition(payload, scope, first.id)

    // THE READER'S OWN PAGE, through the production mapper: a restore that
    // wrote a version nothing reads would pass any assertion about versions.
    expect(await publishedNote(porto)).toBe('porto-editions, as published')
    expect(revalidated).toEqual(expect.arrayContaining([...(await pagePathsOf(porto))]))
  })

  it('lists at most as many editions as the card shows, and the boundary follows the constant', async () => {
    // BOTH SIDES OF THE CAP, built from the constant rather than from a
    // literal, so moving `EDITIONS_SHOWN` moves this case with it. One more
    // edition than the card holds is published, and the read answers the cap
    // exactly — the accepted side is that the newest of them are all there.
    const bergen = await aPublishedJourney('capped')
    const notes: string[] = []
    for (let index = 0; index <= EDITIONS_SHOWN; index += 1) {
      const note = `capped, edition ${String(index)}`
      notes.push(note)
      await editJourney(bergen, note)
      await publishSelection(payload, scope, [`journey:${String(bergen)}`])
    }

    const editions = await readEditions(payload, scope)

    expect(editions).toHaveLength(EDITIONS_SHOWN)
    expect(editions.filter((edition) => edition.what.includes(`${MARKER} capped`))).toHaveLength(EDITIONS_SHOWN)
  })

  it('refuses an edition id that names no version', async () => {
    await expect(restoreEdition(payload, scope, 'not-a-version')).rejects.toThrow(/restoreEdition/u)
  })
})
