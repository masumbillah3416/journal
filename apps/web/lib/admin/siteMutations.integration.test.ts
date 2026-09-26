/**
 * siteMutations.integration.test.ts — behaviour spec for SCREENS.md §2.9's
 * three writes.
 *
 * Integration test (CLAUDE.md §2): the properties are Payload's. Whether a
 * partial `updateGlobal` really leaves the columns it was not given alone,
 * what an `email` field does with an empty string, and whether a write lands
 * where the screen's own reader finds it are answers only a real Payload and
 * a real Postgres give — and the first of those is the one that decides
 * whether saving a site name can clear the analytics id.
 *
 * ═══ THE GLOBAL IS RESTORED IN A `finally`, AND DUMPED EITHER SIDE ═══
 *
 * Every write here is site-wide, and two of the five settings change what the
 * PUBLIC diary serves. Same treatment as `bookAccess.integration.test.ts`.
 *
 * Uses `getTestPayload()` rather than `getPayload()`, like every integration
 * file here.
 * Depends on: vitest, @travel-diary/domain/ids, ../testPayload, ./adminScope,
 * ./readSettingsScreen, ./siteMutations.
 */
import { userId } from '@travel-diary/domain/ids'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getTestPayload } from '../testPayload'
import { adminScope, type AdminScope } from './adminScope'
import { OFFLINE_SETTING, readSettingsScreen, readerSettingNames } from './readSettingsScreen'
import { readReaderToggle, readSiteForm, saveSite, setReaderSetting, takeBookOffline } from './siteMutations'

/** What every row this file writes carries, so cleanup can find them all. */
const MARKER = 'test-site-mutations'

/** A password that is not one: this account is never signed in to. */
const NOT_A_PASSWORD = 'not-a-real-password'

/** Payload's own bookkeeping on a global, which no write here authors. */
const PAYLOAD_OWNED = new Set(['id', 'createdAt', 'updatedAt', 'globalType'])

describe('the Settings screen’s writes', () => {
  let payload: Awaited<ReturnType<typeof getTestPayload>>
  let scope: AdminScope
  let accountId = 0
  let before: Record<string, unknown> = {}
  let dumpedBefore = ''

  /**
   * Every authored column of the `site` global, as a stable string.
   * @returns The dump.
   */
  const dumpSite = async (): Promise<string> => {
    const site: object = await payload.findGlobal({ slug: 'site', depth: 0 })
    return JSON.stringify(Object.fromEntries(Object.entries(site).filter(([column]) => !PAYLOAD_OWNED.has(column))))
  }

  /**
   * One form body, as a browser would post it.
   * @param fields - The fields.
   * @returns The body.
   */
  const aForm = (fields: Readonly<Record<string, string>>): FormData => {
    const form = new FormData()
    for (const [name, value] of Object.entries(fields)) form.set(name, value)
    return form
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
    before = { ...(await payload.findGlobal({ slug: 'site', depth: 0 })) }
    dumpedBefore = await dumpSite()
  }, 180_000)

  afterAll(async () => {
    // RESTORED FROM THE WHOLE DUMP, not from the columns each case happened to
    // touch: a restore that checks one column certifies the damage it did to
    // the others (standing orders §13).
    await payload.updateGlobal({ slug: 'site', depth: 0, data: before })
    await payload.delete({ collection: 'users', id: accountId })
    expect(await dumpSite()).toBe(dumpedBefore)
  })

  describe('readSiteForm', () => {
    it('reads the four fields the card posts, trimmed', () => {
      expect(
        readSiteForm(
          aForm({ name: '  Wanderings ', domain: ' example.test ', description: ' A diary. ', replyTo: ' a@b.test ' }),
        ),
      ).toEqual({ name: 'Wanderings', domain: 'example.test', description: 'A diary.', replyTo: 'a@b.test' })
    })

    it('accepts a cleared reply-to, because clearing a field is a thing an author does', () => {
      expect(readSiteForm(aForm({ name: 'x', domain: '', description: '', replyTo: '' })).replyTo).toBe('')
    })

    it('refuses a reply-to that is not an address, where the message can still be written', () => {
      // The global declares `replyTo` as an `email`, so Payload would refuse
      // this too — with a message that reaches no screen. Refusing at the
      // boundary is CLAUDE.md §3.1.
      expect(() => readSiteForm(aForm({ name: 'x', domain: '', description: '', replyTo: 'not-an-address' }))).toThrow()
    })
  })

  describe('readReaderToggle', () => {
    it('accepts every setting the site global declares as a checkbox', () => {
      expect(readerSettingNames().map((setting) => readReaderToggle(aForm({ setting, on: 'true' })).setting)).toEqual(
        readerSettingNames(),
      )
    })

    it('refuses a column the global declares as something other than a checkbox', () => {
      // THE INVERSION. `name` and `analyticsId` are real columns of this
      // global; a parse that only refused names it had never heard of would
      // let a toggle write `true` into the site's name.
      expect(() => readReaderToggle(aForm({ setting: 'name', on: 'true' }))).toThrow()
      expect(() => readReaderToggle(aForm({ setting: 'analyticsId', on: 'true' }))).toThrow()
    })

    it('refuses a column that is not on the global at all', () => {
      expect(() => readReaderToggle(aForm({ setting: 'dropEverything', on: 'true' }))).toThrow()
    })

    it('reads both values, because a toggle has to be able to turn something off', () => {
      expect([
        readReaderToggle(aForm({ setting: OFFLINE_SETTING, on: 'true' })).on,
        readReaderToggle(aForm({ setting: OFFLINE_SETTING, on: 'false' })).on,
      ]).toEqual([true, false])
    })

    it('refuses a value that is neither, rather than reading anything but “true” as off', () => {
      expect(() => readReaderToggle(aForm({ setting: OFFLINE_SETTING, on: 'on' }))).toThrow()
    })
  })

  describe('saveSite', () => {
    it('writes the four fields where the screen reads them back', async () => {
      await saveSite(payload, scope, {
        name: `${MARKER} Wanderings`,
        domain: 'wanderings.example',
        description: 'A travel diary.',
        replyTo: 'hello@example.test',
      })

      expect((await readSettingsScreen(payload, scope)).site).toEqual({
        name: `${MARKER} Wanderings`,
        domain: 'wanderings.example',
        description: 'A travel diary.',
        replyTo: 'hello@example.test',
      })
    })

    it('clears a reply-to the author emptied, rather than refusing the whole save', async () => {
      await saveSite(payload, scope, { name: `${MARKER} x`, domain: '', description: '', replyTo: '' })

      expect((await readSettingsScreen(payload, scope)).site.replyTo).toBe('')
    })

    it('leaves the analytics id alone, which no screen in this phase can put back', async () => {
      // THE PARTIAL-WRITE CASE, and it is not hypothetical: `analyticsId` is a
      // real column of this global that §2.9 does not draw, so a whole-object
      // write would clear it the first time anybody saved a site name and
      // nothing in the admin could restore it.
      await payload.updateGlobal({ slug: 'site', ...scope, depth: 0, data: { analyticsId: `${MARKER}-analytics` } })

      await saveSite(payload, scope, { name: `${MARKER} y`, domain: '', description: '', replyTo: '' })

      const site = await payload.findGlobal({ slug: 'site', ...scope, depth: 0, select: { analyticsId: true } })
      expect(site.analyticsId).toBe(`${MARKER}-analytics`)
    })

    it('leaves every reader setting alone, so the two cards cannot overwrite each other', async () => {
      const allOff = Object.fromEntries(readerSettingNames().map((setting) => [setting, false]))
      await payload.updateGlobal({ slug: 'site', ...scope, depth: 0, data: allOff })

      await saveSite(payload, scope, { name: `${MARKER} z`, domain: '', description: '', replyTo: '' })

      expect((await readSettingsScreen(payload, scope)).readers.map((toggle) => toggle.on)).toEqual(
        readerSettingNames().map(() => false),
      )
    })
  })

  describe('setReaderSetting', () => {
    it('writes one setting on and off again, so the toggle is the column and not the module', async () => {
      await setReaderSetting(payload, scope, { setting: 'allowShare', on: false })
      const off = await readSettingsScreen(payload, scope)

      await setReaderSetting(payload, scope, { setting: 'allowShare', on: true })
      const on = await readSettingsScreen(payload, scope)

      expect([
        off.readers.find((toggle) => toggle.setting === 'allowShare')?.on,
        on.readers.find((toggle) => toggle.setting === 'allowShare')?.on,
      ]).toEqual([false, true])
    })

    it('leaves the other four alone, which is what makes one toggle per form safe', async () => {
      const allOn = Object.fromEntries(readerSettingNames().map((setting) => [setting, true]))
      await payload.updateGlobal({ slug: 'site', ...scope, depth: 0, data: allOn })

      await setReaderSetting(payload, scope, { setting: 'allowShare', on: false })

      const view = await readSettingsScreen(payload, scope)
      expect(Object.fromEntries(view.readers.map((toggle) => [toggle.setting, toggle.on]))).toEqual({
        ...Object.fromEntries(readerSettingNames().map((setting) => [setting, true])),
        allowShare: false,
      })
    })
  })

  describe('takeBookOffline', () => {
    it('closes the book, which is the one thing this data model has that takes it offline', async () => {
      await setReaderSetting(payload, scope, { setting: OFFLINE_SETTING, on: false })

      await takeBookOffline(payload, scope)

      expect((await readSettingsScreen(payload, scope)).bookIsOffline).toBe(true)
    })

    it('writes nothing else, so “Careful now” is careful about one column', async () => {
      // THE OTHER FOUR ARE HELD OFF, not on, which is what makes this
      // assertion able to fail: a write that set every checkbox would pass an
      // all-on fixture and fail this one.
      const allOff = Object.fromEntries(readerSettingNames().map((setting) => [setting, false]))
      await payload.updateGlobal({
        slug: 'site',
        ...scope,
        depth: 0,
        data: { ...allOff, name: `${MARKER} untouched` },
      })

      await takeBookOffline(payload, scope)

      const view = await readSettingsScreen(payload, scope)
      expect([view.site.name, ...view.readers.map((toggle) => toggle.on)]).toEqual([
        `${MARKER} untouched`,
        ...readerSettingNames().map((setting) => setting === OFFLINE_SETTING),
      ])
    })
  })
})
