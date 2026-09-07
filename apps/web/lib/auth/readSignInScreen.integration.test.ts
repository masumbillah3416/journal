/**
 * readSignInScreen.integration.test.ts — the sign-in screen's server read,
 * against a real Payload and a real Postgres.
 *
 * THE CASE THIS FILE EXISTS FOR IS THE FLAG. `SECURITY.md`'s second prototype
 * hole is that the OTP on/off switch lived in `localStorage['om-diary-otp']`,
 * where anybody could set it to `0`. The screen's footer line states whether
 * the code step is on, so it needs that answer from somewhere; this module is
 * the only place it comes from, and these cases are what say so. They are
 * integration cases rather than unit ones because `otpRequired` is a nullable
 * column with a schema default, and "what does a row written before the
 * default read as" is a question only a real table can answer.
 *
 * FAIL-CLOSED IS ASSERTED IN BOTH ITS FORMS - a `NULL` column and no account
 * at all - because both are states this database is genuinely in today
 * (`users` is empty in the seeded dev and CI databases) and both would, if
 * they read as "off", tell a reader the second factor is not running when it
 * is.
 *
 * EVERY CASE ASSERTS THE ROW IT SET UP EXISTS BEFORE ASSERTING WHAT WAS READ
 * OFF IT. A case that only checked `codeStepRequired` would pass against an
 * account that was never created - `true` is what an empty table returns too -
 * which is this phase's most common defective test shape.
 *
 * Uses `getTestPayload()`, not `getPayload()` directly, so this file connects
 * to the isolated `diary_test` database - see that module's header.
 * Depends on: vitest, ../testPayload, ../../scripts/seed, ./readSignInScreen.
 */
import { coverCloths } from '@travel-diary/tokens/colour'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPayload } from '../payload'
import { getTestPayload } from '../testPayload'
import { seed } from '../../scripts/seed'
import { bookGlobalSeed } from '../../scripts/seed-data'
import { readSignInScreen } from './readSignInScreen'

const SETUP_TIMEOUT_MS = 60_000

/** The password every fixture account here is created with. Never asserted on. */
const FIXTURE_PASSWORD = 'the-one-this-fixture-account-was-created-with'

describe('readSignInScreen', () => {
  let payload: Awaited<ReturnType<typeof getTestPayload>>

  beforeAll(async () => {
    payload = await getTestPayload()
    await seed(payload)
  }, SETUP_TIMEOUT_MS)

  /**
   * Empties `users` before each case.
   *
   * The module under test answers from the lowest-id account, so a leftover
   * fixture from another file would decide these cases instead of the row the
   * case created. `diary_test` is the isolated integration database and holds
   * no real account (see `../testPayload`'s header), so emptying it is not
   * destroying anybody's data.
   */
  beforeEach(async () => {
    await payload.delete({ collection: 'users', where: { id: { exists: true } } })
  })

  afterAll(async () => {
    await payload.delete({ collection: 'users', where: { id: { exists: true } } })
  })

  it('carries the book global’s own cover fields through for the cloth panel', async () => {
    const content = await readSignInScreen()

    expect(content.title).toBe(bookGlobalSeed.title)
    expect(content.subtitle).toBe(bookGlobalSeed.subtitle)
    expect(content.coverCloth).toBe(bookGlobalSeed.coverCloth)
  })

  it('degrades a cleared title, subtitle and cloth colour rather than printing an empty screen', async () => {
    // None of the three is `required: true`, so all three are ordinary
    // editorial states. Written through the Local API and put back in a
    // `finally`, because every other case in this file reads the seeded
    // values.
    const before = await payload.findGlobal({
      slug: 'book',
      depth: 0,
      select: { title: true, subtitle: true, coverCloth: true },
    })
    try {
      await payload.updateGlobal({ slug: 'book', data: { title: null, subtitle: null, coverCloth: null } })
      const cleared = await payload.findGlobal({ slug: 'book', depth: 0, select: { title: true } })
      expect(cleared.title).toBeNull()

      const content = await readSignInScreen()

      expect(content.title).toBe('')
      expect(content.subtitle).toBe('')
      // The cloth is the one of the three with a real fallback: an empty
      // string would paint the panel with a gradient that has no colour in
      // it. The default is the handoff's first cover cloth.
      expect(content.coverCloth).toBe(coverCloths[0])
    } finally {
      // `?? null` on each: `exactOptionalPropertyTypes` refuses an explicit
      // `undefined` for an optional field, and `findGlobal`'s `select` types
      // every one of these as possibly absent.
      await payload.updateGlobal({
        slug: 'book',
        data: {
          title: before.title ?? null,
          subtitle: before.subtitle ?? null,
          coverCloth: before.coverCloth ?? null,
        },
      })
    }

    expect((await readSignInScreen()).title).toBe(bookGlobalSeed.title)
  })

  it('reads the code step as on when the account asks for it', async () => {
    const created = await payload.create({
      collection: 'users',
      data: { email: 'code-step-on@read-sign-in-screen.example', password: FIXTURE_PASSWORD, otpRequired: true },
    })
    expect(created.otpRequired).toBe(true)

    expect((await readSignInScreen()).codeStepRequired).toBe(true)
  })

  it('reads the code step as off when the account has turned it off', async () => {
    const created = await payload.create({
      collection: 'users',
      data: { email: 'code-step-off@read-sign-in-screen.example', password: FIXTURE_PASSWORD, otpRequired: false },
    })
    expect(created.otpRequired).toBe(false)

    expect((await readSignInScreen()).codeStepRequired).toBe(false)
  })

  it('reads a NULL column as on, so a row written before the default cannot switch the step off', async () => {
    const created = await payload.create({
      collection: 'users',
      data: { email: 'code-step-null@read-sign-in-screen.example', password: FIXTURE_PASSWORD, otpRequired: false },
    })
    // Written through the pool, not the Local API: `otpRequired` is a checkbox
    // with `defaultValue: true`, so Payload has no way to express NULL - and
    // NULL is precisely the state a row written before that default is in.
    await payload.db.pool.query('UPDATE users SET otp_required = NULL WHERE id = $1', [created.id])
    const { rows } = await payload.db.pool.query<{ otp_required: boolean | null }>(
      'SELECT otp_required FROM users WHERE id = $1',
      [created.id],
    )
    expect(rows[0]?.otp_required).toBeNull()

    expect((await readSignInScreen()).codeStepRequired).toBe(true)
  })

  it('reads the code step as on when there is no account at all', async () => {
    const accounts = await payload.find({ collection: 'users', depth: 0, limit: 1 })
    expect(accounts.totalDocs).toBe(0)

    expect((await readSignInScreen()).codeStepRequired).toBe(true)
  })

  it('costs one global read and one account read, each with an explicit depth', async () => {
    // CLAUDE.md §6 and §7: no N+1, select only the fields needed, and set
    // `depth` explicitly rather than letting Payload walk the relationship
    // graph on a screen an unauthenticated visitor can ask for.
    const instance = await getPayload()
    const findSpy = vi.spyOn(instance, 'find')
    const findGlobalSpy = vi.spyOn(instance, 'findGlobal')

    await readSignInScreen()

    expect(findSpy.mock.calls).toHaveLength(1)
    expect(findGlobalSpy.mock.calls).toHaveLength(1)
    for (const call of [...findSpy.mock.calls, ...findGlobalSpy.mock.calls]) {
      expect(call[0]).toHaveProperty('depth', 0)
    }

    findSpy.mockRestore()
    findGlobalSpy.mockRestore()
  })
})
