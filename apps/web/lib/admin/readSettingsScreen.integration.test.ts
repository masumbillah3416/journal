/**
 * readSettingsScreen.integration.test.ts — behaviour spec for everything
 * SCREENS.md §2.9 draws, in a fixed number of queries.
 *
 * Integration test (CLAUDE.md §2): every property here is Payload's or
 * Postgres's. What an unwritten checkbox column comes back as, whether a
 * `select` of two columns really returns them, whether the media library's
 * `filesize` is populated at all, and — the one CLAUDE.md §6 gates — whether
 * the screen costs a fixed number of statements or one per media row, are
 * answers only a real Payload and a real database give.
 *
 * ═══ THE `site` GLOBAL IS RESTORED IN A `finally`, AND DUMPED EITHER SIDE ═══
 *
 * `diary_test` is shared by every integration file in this run, and two of
 * the five settings change what the PUBLIC diary serves. A case that threw
 * while `passwordProtect` was on would leave every later case reading a gated
 * site. Same treatment as `bookAccess.integration.test.ts`, for the same
 * reason.
 *
 * ═══ THE MEDIA SUMS ARE ASSERTED AS A DELTA, NOT AS A TOTAL ═══
 *
 * This screen sums the WHOLE library, which every other integration file in
 * this run is adding rows to. A case asserting a total would be asserting
 * about other files' fixtures (standing orders, §16). So each storage case
 * reads the screen, adds a row of a known size, reads it again, and asserts
 * the DIFFERENCE — which is a property of this module and of nothing else in
 * the run.
 *
 * Uses `getTestPayload()` rather than `getPayload()`, like every integration
 * file here.
 * Depends on: vitest, sharp (the fixture's bytes), @travel-diary/domain/admin/storageBar,
 * ../testPayload, ./adminScope, ./readSettingsScreen.
 */
import { GIGABYTE, STORAGE_QUOTA_BYTES } from '@travel-diary/domain/admin/storageBar'
import { userId } from '@travel-diary/domain/ids'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getTestPayload } from '../testPayload'
import { adminScope, type AdminScope } from './adminScope'
import {
  OFFLINE_SETTING,
  READER_COPY,
  QUERIES_PER_READ,
  readSettingsScreen,
  readerCopyFor,
  readerSettingNames,
} from './readSettingsScreen'

/** What every row this file writes carries, so cleanup can find them all. */
const MARKER = 'test-read-settings'

/** A password that is not one: this account is never signed in to. */
const NOT_A_PASSWORD = 'not-a-real-password'

describe('the Settings screen', () => {
  let payload: Awaited<ReturnType<typeof getTestPayload>>
  let scope: AdminScope
  let accountId = 0
  let dumpedBefore = ''
  const created: number[] = []

  /** Payload's own bookkeeping on a global, which no write here authors. */
  const PAYLOAD_OWNED = new Set(['id', 'createdAt', 'updatedAt', 'globalType'])

  /**
   * Every authored column of the `site` global, as a stable string.
   * @returns The dump.
   */
  const dumpSite = async (): Promise<string> => {
    const site: object = await payload.findGlobal({ slug: 'site', depth: 0 })
    return JSON.stringify(Object.fromEntries(Object.entries(site).filter(([column]) => !PAYLOAD_OWNED.has(column))))
  }

  /**
   * Runs one assertion with some settings held at known values, and puts the
   * whole global back whatever happens.
   * @param settings - What to set for the duration.
   * @param body - The assertion to run while they are set.
   */
  const withSite = async (settings: Record<string, unknown>, body: () => Promise<void>): Promise<void> => {
    const before = await payload.findGlobal({ slug: 'site', depth: 0 })
    await payload.updateGlobal({ slug: 'site', depth: 0, data: settings })
    try {
      await body()
    } finally {
      await payload.updateGlobal({ slug: 'site', depth: 0, data: before })
    }
  }

  beforeAll(async () => {
    payload = await getTestPayload()
    // THE PRODUCTION SCOPE, NOT A HAND-BUILT ONE. `adminScope` resolves the
    // account row and is what every screen actually calls, so a change to what
    // a scope carries reaches this file rather than being shadowed by a copy
    // of its shape — `readOverview.integration.test.ts`'s treatment.
    const account = await payload.create({
      collection: 'users',
      data: { email: `${MARKER}@example.test`, password: NOT_A_PASSWORD },
    })
    accountId = account.id
    const branded = userId(String(account.id))
    if (!branded.ok) throw new Error(branded.error)
    scope = await adminScope({ user: branded.value })
    dumpedBefore = await dumpSite()
  }, 180_000)

  afterAll(async () => {
    for (const id of created.splice(0)) await payload.delete({ collection: 'media', id })
    await payload.delete({ collection: 'users', id: accountId })
    expect(await dumpSite()).toBe(dumpedBefore)
  })

  /**
   * Puts a photograph of known byte length into the library.
   *
   * REAL BYTES THROUGH THE REAL UPLOAD PATH, so `filesize` is whatever Payload
   * and the encoder actually wrote rather than a number this file invented —
   * a fixture that hand-set `filesize` would agree with a reader that had
   * stopped reading the column at all.
   * @param label - What to call it, so two fixtures cannot collide.
   * @param kind - Which half of the bar it lands in.
   * @returns Its own `filesize`, as stored.
   */
  const aStoredFile = async (label: string, kind: 'still' | 'clip'): Promise<number> => {
    const png = await sharp({ create: { width: 240, height: 180, channels: 3, background: '#4a6b3c' } })
      .png()
      .toBuffer()
    const row = await payload.create({
      collection: 'media',
      data: { kind, alt: label, state: 'ready' },
      file: { name: `${label}.png`, data: png, mimetype: 'image/png', size: png.length },
    })
    created.push(row.id)
    const stored = await payload.findByID({ collection: 'media', id: row.id, depth: 0, select: { filesize: true } })
    return typeof stored.filesize === 'number' ? stored.filesize : 0
  }

  it('offers one toggle per checkbox the site global declares, in the global’s own order', async () => {
    const view = await readSettingsScreen(payload, scope)

    expect(view.readers.map((toggle) => toggle.setting)).toEqual(readerSettingNames())
  })

  it('reports each toggle’s state from the column it names, both ways round', async () => {
    // BOTH SIDES, DIFFERING IN THE COLUMNS AND NOTHING ELSE. A reader that
    // returned a constant passes one of these and fails the other.
    const allOff = Object.fromEntries(readerSettingNames().map((setting) => [setting, false]))
    const allOn = Object.fromEntries(readerSettingNames().map((setting) => [setting, true]))

    await withSite(allOff, async () => {
      const view = await readSettingsScreen(payload, scope)
      expect(view.readers.map((toggle) => toggle.on)).toEqual(readerSettingNames().map(() => false))
    })
    await withSite(allOn, async () => {
      const view = await readSettingsScreen(payload, scope)
      expect(view.readers.map((toggle) => toggle.on)).toEqual(readerSettingNames().map(() => true))
    })
  })

  it('labels each toggle in SCREENS.md §2.9’s own words, with a hint beneath it', async () => {
    const view = await readSettingsScreen(payload, scope)
    const passwordToggle = view.readers.find((toggle) => toggle.setting === OFFLINE_SETTING)

    expect([passwordToggle?.label, passwordToggle?.hint]).toEqual([
      READER_COPY[OFFLINE_SETTING]?.label,
      READER_COPY[OFFLINE_SETTING]?.hint,
    ])
  })

  it('reads the four site fields the top card prints', async () => {
    await withSite(
      {
        name: 'Wanderings',
        domain: 'wanderings.example',
        description: 'A travel diary.',
        replyTo: 'hello@example.com',
      },
      async () => {
        expect((await readSettingsScreen(payload, scope)).site).toEqual({
          name: 'Wanderings',
          domain: 'wanderings.example',
          description: 'A travel diary.',
          replyTo: 'hello@example.com',
        })
      },
    )
  })

  it('draws an unwritten field as an empty box rather than as the word null', async () => {
    // WHAT POSTGRES ACTUALLY RETURNS for a text column nobody has written is
    // `null`, and React renders `null` as nothing while `String(null)` renders
    // "null" into an input. This is the case that says which one happens.
    await withSite({ name: null, domain: null, description: null, replyTo: null }, async () => {
      expect((await readSettingsScreen(payload, scope)).site).toEqual({
        name: '',
        domain: '',
        description: '',
        replyTo: '',
      })
    })
  })

  it('takes an unwritten checkbox as the default its field declares, and the five do not all declare the same one', async () => {
    // THE OTHER HALF OF THE SAME POSTGRES FACT, and the one that matters:
    // `null` is not `false`. `apps/web/globals/site.ts` defaults four of the
    // five to `true` and `passwordProtect` to `false`, so a module coercing
    // every unwritten column one way would either gate a fresh install's book
    // or switch four of its settings off.
    const unwritten = Object.fromEntries(readerSettingNames().map((setting) => [setting, null]))

    await withSite(unwritten, async () => {
      const view = await readSettingsScreen(payload, scope)

      expect(Object.fromEntries(view.readers.map((toggle) => [toggle.setting, toggle.on]))).toEqual({
        allowDownloads: true,
        allowShare: true,
        indexGalleries: true,
        passwordProtect: false,
        touchPageTurn: true,
      })
    })
  })

  it('labels a setting nobody has written copy for with its own name rather than with nothing', () => {
    // THE ARM A SIXTH CHECKBOX TAKES on the day it lands. It cannot be reached
    // through the screen today — every declared checkbox has copy — so it is
    // reached through the function the screen calls, which is the same code.
    expect(readerCopyFor('somethingNobodyHasNamedYet')).toEqual({
      label: 'somethingNobodyHasNamedYet',
      hint: 'no description has been written for this setting yet',
    })
  })

  it('cannot be given a media row with no file, which is why nothing sums a missing filesize', () => {
    // MEASURED, NOT ASSUMED. `media` is an upload collection, so `filesize` is
    // written by Payload's own upload handler and a row without one cannot be
    // created — which is what makes the guard in `bytesByKind` unreachable and
    // why it carries a `c8 ignore` rather than a case.
    return expect(
      payload.create({ collection: 'media', data: { kind: 'still', alt: `${MARKER}-fileless`, state: 'ready' } }),
    ).rejects.toThrow()
  })

  it('says whether the book is already closed, from the same column the toggle writes', async () => {
    await withSite({ [OFFLINE_SETTING]: true }, async () => {
      expect((await readSettingsScreen(payload, scope)).bookIsOffline).toBe(true)
    })
    await withSite({ [OFFLINE_SETTING]: false }, async () => {
      expect((await readSettingsScreen(payload, scope)).bookIsOffline).toBe(false)
    })
  })

  it('counts a stored photograph’s real bytes into the stills segment', async () => {
    // A DELTA, NOT A TOTAL — see this file's header. `diary_test` is shared.
    const before = await readSettingsScreen(payload, scope)
    const size = await aStoredFile('settings-still', 'still')
    const after = await readSettingsScreen(payload, scope)

    const stillsOf = (view: Awaited<ReturnType<typeof readSettingsScreen>>): number =>
      view.storage.segments.find((segment) => segment.kind === 'stills')?.percent ?? 0

    expect(size).toBeGreaterThan(0)
    expect(stillsOf(after) - stillsOf(before)).toBeCloseTo((size / STORAGE_QUOTA_BYTES) * 100, 9)
  })

  it('counts a stored clip’s bytes into the clips segment instead, so the two swatches are not one', async () => {
    const before = await readSettingsScreen(payload, scope)
    const size = await aStoredFile('settings-clip', 'clip')
    const after = await readSettingsScreen(payload, scope)

    const clipsOf = (view: Awaited<ReturnType<typeof readSettingsScreen>>): number =>
      view.storage.segments.find((segment) => segment.kind === 'clips')?.percent ?? 0
    const stillsOf = (view: Awaited<ReturnType<typeof readSettingsScreen>>): number =>
      view.storage.segments.find((segment) => segment.kind === 'stills')?.percent ?? 0

    expect(clipsOf(after) - clipsOf(before)).toBeCloseTo((size / STORAGE_QUOTA_BYTES) * 100, 9)
    expect(stillsOf(after)).toBeCloseTo(stillsOf(before), 9)
  })

  it('writes the line above the bar in gigabytes of the quota', async () => {
    const view = await readSettingsScreen(payload, scope)

    expect(view.storage.line).toMatch(new RegExp(`^[\\d.]+ GB of ${String(STORAGE_QUOTA_BYTES / GIGABYTE)} GB$`, 'u'))
  })

  it('costs the same number of statements however much the library holds', async () => {
    // BOTH SIDES OF CLAUDE.md §6's "no N+1": the count is taken, a row is
    // added, and the count is taken again. A per-row query makes the second
    // reading longer than the first.
    const counted = async (): Promise<number> => {
      let statements = 0
      const find = payload.find.bind(payload)
      const findGlobal = payload.findGlobal.bind(payload)
      Object.assign(payload, {
        find: (...args: Parameters<typeof find>) => {
          statements += 1
          return find(...args)
        },
        findGlobal: (...args: Parameters<typeof findGlobal>) => {
          statements += 1
          return findGlobal(...args)
        },
      })
      try {
        await readSettingsScreen(payload, scope)
      } finally {
        Object.assign(payload, { find, findGlobal })
      }
      return statements
    }

    const first = await counted()
    await aStoredFile('settings-n-plus-one', 'still')
    const second = await counted()

    expect([first, second]).toEqual([QUERIES_PER_READ, QUERIES_PER_READ])
  })
})
