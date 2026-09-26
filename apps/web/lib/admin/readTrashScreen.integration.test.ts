/**
 * readTrashScreen.integration.test.ts — behaviour spec for the rows
 * SCREENS.md §2.10's card prints.
 *
 * Integration test (CLAUDE.md §2): every property here is Payload's or
 * Postgres's. Whether `deletedAt: { exists: true }` really selects the
 * INVERSE of the clause every other admin read applies, whether a soft delete
 * written through production's own path leaves the pages and the media where
 * they were, whether a stored upload has a `thumb` derivative at all, and —
 * the one CLAUDE.md §6 gates — whether the screen costs a fixed number of
 * statements or one per journey, are answers only a real database gives.
 *
 * ═══ THE CLOCK IS AN ARGUMENT, SO THE WINDOW IS NOT A WAIT ═══
 *
 * `readTrashScreen` takes `now`, so a case can stand at any instant of the
 * thirty days without touching a system clock and without a fixture that
 * takes a month to ripen. The countdown's own arithmetic is
 * `trashCountdown.test.ts`'s at 100%; what this file adds is that the
 * instant it is given comes from the row's real `deletedAt`.
 *
 * ═══ EVERY ROW THIS FILE WRITES IS ITS OWN, AND IS DELETED AFTER ═══
 *
 * `diary_test` is shared and the seed writes ten journeys into it, so a case
 * asserting on the whole list would be asserting about other files' rows
 * (standing orders, §16). Every case finds its own journey by id.
 *
 * Uses `getTestPayload()` rather than `getPayload()`, like every integration
 * file here.
 * Depends on: vitest, sharp (the fixture's bytes),
 * @travel-diary/domain/admin/trashCountdown, @travel-diary/domain/ids,
 * ../testPayload, ./adminScope, ./journeyMutations, ./readTrashScreen.
 */
import { TRASH_WINDOW_DAYS } from '@travel-diary/domain/admin/trashCountdown'
import { userId } from '@travel-diary/domain/ids'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getTestPayload } from '../testPayload'
import { adminScope, type AdminScope } from './adminScope'
import { softDeleteJourney } from './journeyMutations'
import { QUERIES_PER_READ, readTrashScreen } from './readTrashScreen'

/** What every row this file writes carries, so cleanup can find them all. */
const MARKER = 'test-read-trash'

/** A password that is not one: this account is never signed in to. */
const NOT_A_PASSWORD = 'not-a-real-password'

/** One day, in milliseconds. */
const DAY = 24 * 60 * 60 * 1_000

describe('the Trash screen', () => {
  let payload: Awaited<ReturnType<typeof getTestPayload>>
  let scope: AdminScope
  let accountId = 0

  /**
   * Removes every row this file has ever written.
   *
   * The pages and the media are found through their JOURNEYS rather than
   * through their own fields, because a case deliberately leaves a page with
   * no title.
   */
  const clean = async (): Promise<void> => {
    const mine = await payload.find({
      collection: 'journeys',
      depth: 0,
      pagination: false,
      select: { slug: true },
      where: { slug: { like: MARKER } },
    })
    const ids = mine.docs.map((journey) => journey.id)
    if (ids.length > 0) {
      await payload.delete({ collection: 'pages', where: { journey: { in: ids } } })
      await payload.delete({ collection: 'media', where: { journey: { in: ids } } })
      for (const id of ids) await payload.delete({ collection: 'journeys', id })
    }
  }

  /**
   * A journey of this file's own, live.
   * @param label - What distinguishes it from the file's other fixtures.
   * @param place - Its place, for the row's summary line.
   * @returns Its row id.
   */
  const aJourney = async (label: string, place = 'Somewhere'): Promise<number> => {
    const created = await payload.create({
      collection: 'journeys',
      data: { name: `Trash ${label}`, place, slug: `${MARKER}-${label}`, dates: '1 – 2 May 2026' },
    })
    return created.id
  }

  /**
   * A page belonging to one journey.
   * @param journey - Its owner.
   * @param order - Where it sits.
   */
  const aPage = async (journey: number, order: number): Promise<void> => {
    await payload.create({ collection: 'pages', data: { journey, kind: 'notes', order } })
  }

  /**
   * A stored file belonging to one journey.
   * @param journey - Its owner.
   * @param label - What to call it.
   * @param options - Whether it is a clip, and whether it is the cover.
   * @returns Its row id.
   */
  const aFile = async (
    journey: number,
    label: string,
    options: { readonly kind?: 'still' | 'clip'; readonly isCover?: boolean } = {},
  ): Promise<number> => {
    const png = await sharp({ create: { width: 600, height: 600, channels: 3, background: '#4a6b3c' } })
      .png()
      .toBuffer()
    const created = await payload.create({
      collection: 'media',
      data: {
        journey,
        kind: options.kind ?? 'still',
        alt: label,
        state: 'ready',
        ...(options.isCover === true ? { isCover: true } : {}),
      },
      file: { name: `${MARKER}-${label}.png`, data: png, mimetype: 'image/png', size: png.length },
    })
    return created.id
  }

  /**
   * One journey's row on the screen, by id.
   * @param journey - The row id.
   * @param now - The clock the screen is drawn at.
   * @returns The row, or `undefined` when the screen does not list it.
   */
  const rowFor = async (
    journey: number,
    now = Date.now(),
  ): Promise<Awaited<ReturnType<typeof readTrashScreen>>[number] | undefined> => {
    const rows = await readTrashScreen(payload, scope, now)
    return rows.find((row) => row.id === String(journey))
  }

  beforeAll(async () => {
    payload = await getTestPayload()
    const account = await payload.create({
      collection: 'users',
      data: { email: `${MARKER}@example.test`, password: NOT_A_PASSWORD },
    })
    accountId = account.id
    const branded = userId(String(account.id))
    if (!branded.ok) throw new Error(branded.error)
    scope = await adminScope({ user: branded.value })
    await clean()
  }, 180_000)

  afterAll(async () => {
    await clean()
    await payload.delete({ collection: 'users', id: accountId })
  })

  it('lists a journey once it has been thrown away, and not before', async () => {
    // BOTH SIDES, AND THE SOFT DELETE IS PRODUCTION'S OWN (§13): the case
    // reads the screen, calls the mutation every screen calls, and reads
    // again — rather than writing `deletedAt` itself, which would prove the
    // screen agrees with this file about what deleted means.
    const journey = await aJourney('appears')

    expect(await rowFor(journey)).toBeUndefined()

    await softDeleteJourney(payload, scope, journey)

    expect((await rowFor(journey))?.name).toBe('Trash appears')
  })

  it('leaves it off again once it has been put back, so the clause is the column and not the module', async () => {
    const journey = await aJourney('restored')
    await softDeleteJourney(payload, scope, journey)
    expect(await rowFor(journey)).toBeDefined()

    await payload.update({ collection: 'journeys', id: journey, ...scope, data: { deletedAt: null } })

    expect(await rowFor(journey)).toBeUndefined()
  })

  it('writes §2.10’s summary line from the rows that would come back with it', async () => {
    const journey = await aJourney('summary', 'Lisbon')
    await aPage(journey, 1)
    await aPage(journey, 2)
    await aFile(journey, 'summary-one')
    await aFile(journey, 'summary-clip', { kind: 'clip' })
    await softDeleteJourney(payload, scope, journey)

    // ONE photograph, because the clip is not one — the line says
    // "photographs", and the two counts are different questions.
    expect((await rowFor(journey))?.summary).toBe('Lisbon · 2 pages · 1 photograph')
  })

  it('writes the singular for a journey holding one of each, because “1 pages” is not a sentence', async () => {
    const journey = await aJourney('singular', 'Porto')
    await aPage(journey, 1)
    await aFile(journey, 'singular-one')
    await softDeleteJourney(payload, scope, journey)

    expect((await rowFor(journey))?.summary).toBe('Porto · 1 page · 1 photograph')
  })

  it('cannot be given a journey with no place at all, which is why nothing guards for one', async () => {
    // SPECIES 4, CAUGHT BY POSTGRES RATHER THAN BY REVIEW. The first draft of
    // `readTrashScreen.ts` left the place out of the summary when it was
    // empty. It can never be: `place` is `required: true` on the collection,
    // and this is the create that proves it — so the guard was a branch no
    // writer could reach, and it is gone.
    await expect(aJourney('placeless', '')).rejects.toThrow(/Place/u)
  })

  it('counts down from the row’s own deletedAt, not from a clock inside the module', async () => {
    const journey = await aJourney('countdown')
    await softDeleteJourney(payload, scope, journey)
    const stamped = await payload.findByID({
      collection: 'journeys',
      id: journey,
      depth: 0,
      select: { deletedAt: true },
    })
    const at = Date.parse(stamped.deletedAt ?? '')

    // THREE READINGS OF ONE ROW, differing only in the clock handed in. A
    // module reading `Date.now()` for itself answers the same number three
    // times.
    expect([
      (await rowFor(journey, at))?.daysLeft,
      (await rowFor(journey, at + (TRASH_WINDOW_DAYS - 1) * DAY))?.daysLeft,
      (await rowFor(journey, at + TRASH_WINDOW_DAYS * DAY))?.daysLeft,
    ]).toEqual([TRASH_WINDOW_DAYS, 1, 0])
  })

  it('says what is true of a row past the window rather than counting down to nothing', async () => {
    const journey = await aJourney('expired')
    await softDeleteJourney(payload, scope, journey)
    const stamped = await payload.findByID({
      collection: 'journeys',
      id: journey,
      depth: 0,
      select: { deletedAt: true },
    })
    const at = Date.parse(stamped.deletedAt ?? '')

    // NOTHING SWEEPS THE TRASH, so the row is still listed and still
    // restorable. A screen printing "goes for good in 0 days" would be
    // promising a sweep this repository does not run.
    const row = await rowFor(journey, at + (TRASH_WINDOW_DAYS + 5) * DAY)

    expect([row?.goesForGood, row?.daysLeft]).toEqual(['goes for good on the next sweep', 0])
  })

  it('draws the journey’s cover at thumb size, never the original', async () => {
    const journey = await aJourney('thumbed')
    await aFile(journey, 'thumbed-cover', { isCover: true })
    await softDeleteJourney(payload, scope, journey)

    const row = await rowFor(journey)

    expect(row?.thumbSrc).toContain('thumb')
  })

  it('draws an empty square for a journey with no cover, rather than a broken image', async () => {
    const journey = await aJourney('coverless')
    await aFile(journey, 'coverless-one')
    await softDeleteJourney(payload, scope, journey)

    expect((await rowFor(journey))?.thumbSrc).toBeNull()
  })

  it('puts the most recently thrown away journey first', async () => {
    const older = await aJourney('older')
    await softDeleteJourney(payload, scope, older)
    const newer = await aJourney('newer')
    await softDeleteJourney(payload, scope, newer)

    const rows = await readTrashScreen(payload, scope, Date.now())
    const mine = rows.filter((row) => row.id === String(older) || row.id === String(newer))

    expect(mine.map((row) => row.id)).toEqual([String(newer), String(older)])
  })

  it('costs the same number of statements however much the trash holds', async () => {
    // BOTH SIDES OF CLAUDE.md §6's "no N+1": a per-journey query makes the
    // second reading longer than the first.
    const counted = async (): Promise<number> => {
      let statements = 0
      const find = payload.find.bind(payload)
      Object.assign(payload, {
        find: (...args: Parameters<typeof find>) => {
          statements += 1
          return find(...args)
        },
      })
      try {
        await readTrashScreen(payload, scope, Date.now())
      } finally {
        Object.assign(payload, { find })
      }
      return statements
    }

    const first = await counted()
    const extra = await aJourney('n-plus-one')
    await aPage(extra, 1)
    await softDeleteJourney(payload, scope, extra)
    const second = await counted()

    expect([first, second]).toEqual([QUERIES_PER_READ, QUERIES_PER_READ])
  })
})
