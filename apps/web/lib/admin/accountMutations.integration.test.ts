/**
 * accountMutations.integration.test.ts — SCREENS.md §2.11's four writes,
 * asserted by what they change about the next sign-in rather than by reading a
 * column back.
 *
 * Integration test (CLAUDE.md §2), and it could not be anything else. Two of
 * the four claims here are about work that happens outside this process: the
 * code step is decided by `signIn.ts` from the account's own row, and the
 * current password is verified by Payload's own credential store, which owns
 * the PBKDF2 comparison and the lockout counter. A mocked version of either
 * would assert the mock.
 *
 * ═══ THE OTP TOGGLE IS PROVED THROUGH THE SIGN-IN PATH ═══
 *
 * `SECURITY.md` calls `users.otpRequired` the only source of truth for the
 * code step, because the prototype kept the flag in `localStorage` where
 * "anyone can set it to `0` and skip the second factor entirely". So the two
 * cases below turn the toggle off and ON and ask the production sign-in
 * service what happens — asserting `users.otpRequired` is `false` would prove
 * the write and nothing about the behaviour, and a single case in one
 * direction would pass against a service that never asks at all.
 *
 * ═══ THE LOCKOUT IS A CASE, NOT A COMMENT ═══
 *
 * `changePassword` verifies the current password by calling `payload.login`,
 * which is the same operation the sign-in screen calls — so a wrong current
 * password here spends one of `maxLoginAttempts`, and five of them lock the
 * account for `lockTime`. That is a prediction about a library's behaviour,
 * and this repository has been wrong about Payload's semantics before, so it
 * is measured: five wrong currents, then a sign-in with the RIGHT password,
 * refused. The second half of the measurement is the one an author actually
 * wants: the session they are already in keeps working, because `sessions`
 * rows are this repository's and Payload's lockout does not reach them.
 *
 * ═══ THE FIXTURES ARE THIS FILE'S OWN, AND SO ARE ITS ADDRESSES ═══
 *
 * `diary_test` is shared (standing orders §16). Every account here carries
 * {@link MARKER}, every requesting address comes from this file's own
 * documentation block, and `afterAll` deletes exactly those.
 *
 * Uses `getTestPayload()` rather than `getPayload()`, like every integration
 * file here.
 * Depends on: vitest, @travel-diary/domain/ids, ../adapters/console-mailer,
 * ../auth/otpService, ../auth/rateLimit, ../auth/sessions, ../auth/signIn,
 * ../testPayload, ./adminScope, ./accountMutations.
 */
import { type SessionId, type UserId, sessionId, userId } from '@travel-diary/domain/ids'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createConsoleMailer } from '../adapters/console-mailer'
import { createOtpService } from '../auth/otpService'
import { createSignInRateLimiter } from '../auth/rateLimit'
import { type SessionService, createSessionService } from '../auth/sessions'
import { type SignInService, createSignInService } from '../auth/signIn'
import { getTestPayload } from '../testPayload'
import {
  changePassword,
  readNotificationToggle,
  readOtpToggle,
  readProfileForm,
  saveNotifications,
  saveProfile,
  setOtpRequired,
} from './accountMutations'
import { type AdminScope, adminScope } from './adminScope'

/** What every account this file writes carries, so cleanup can find them all. */
const MARKER = 'test-account-mutations'

/** The password every fixture account is created with. */
const CORRECT_PASSWORD = 'the-one-this-account-was-created-with'

/** A password no fixture account has. */
const WRONG_PASSWORD = 'not-the-one-this-account-was-created-with'

/** The password the change cases move to. */
const NEW_PASSWORD = 'the-one-the-account-screen-set'

/**
 * The documentation address block every fixture request comes from (RFC 3849).
 *
 * ITS OWN BLOCK, disjoint from `signIn.integration.test.ts`'s TEST-NET-1,
 * `rateLimit.integration.test.ts`'s TEST-NET-2 and
 * `passwordReset.integration.test.ts`'s TEST-NET-3. Two suites sharing a
 * prefix would spend each other's rate-limit budget and delete each other's
 * rows in `afterAll`.
 */
const FIXTURE_IP_PREFIX = '2001:db8:acc::'

/** `users.auth.maxLoginAttempts`, restated so the lockout case does not import the config it measures. */
const MAX_LOGIN_ATTEMPTS = 5

describe('the Account screen’s writes', () => {
  let payload: Awaited<ReturnType<typeof getTestPayload>>
  let sessions: SessionService
  let signIn: SignInService
  let fixtureCount = 0

  /**
   * A fresh account with a known password.
   *
   * A FACTORY, NOT A SHARED FIXTURE (CLAUDE.md §2.3): this file spends lockout
   * counters and changes passwords, so two cases sharing an account would
   * spend each other's.
   * @param data - Columns to set beyond the address and password.
   * @returns Its row id, its branded id and its address.
   */
  const anAccount = async (
    data: Record<string, unknown> = {},
  ): Promise<{ readonly row: number; readonly id: UserId; readonly email: string }> => {
    fixtureCount += 1
    const email = `${MARKER}-${String(fixtureCount)}@example.test`
    const created = await payload.create({
      collection: 'users',
      data: { email, password: CORRECT_PASSWORD, ...data },
    })
    const branded = userId(String(created.id))
    if (!branded.ok) throw new Error(branded.error)
    return { row: created.id, id: branded.value, email }
  }

  /** A requesting address no other case in this run is using. */
  const anIp = (): string => {
    fixtureCount += 1
    return `${FIXTURE_IP_PREFIX}${fixtureCount.toString(16)}`
  }

  /** A pre-auth identifier, for a browser that has not signed in yet. */
  const aBrowserSession = (): SessionId => {
    fixtureCount += 1
    const branded = sessionId(`pre-auth-${String(fixtureCount)}`)
    if (!branded.ok) throw new Error(branded.error)
    return branded.value
  }

  /**
   * One whole password step, through the production sign-in service.
   * @param email - The address being signed in with.
   * @param password - The password being offered.
   * @returns Whatever `signIn` answered.
   */
  const aSignInWith = (email: string, password: string): Promise<Awaited<ReturnType<SignInService['signIn']>>> =>
    signIn.signIn({
      email,
      password,
      browserSession: aBrowserSession(),
      keepSignedIn: false,
      ip: anIp(),
      device: null,
      location: null,
    })

  /**
   * What a sign-in answered, flattened to something a failure message can name.
   *
   * `expect(outcome.ok && outcome.value.status)` collapses a refusal to
   * `false`, so a sign-in refused for an unrelated reason reports
   * `expected false to be 'signed-in'` and says nothing about why. This keeps
   * the refusal in the value.
   * @param outcome - What `signIn` returned.
   * @returns The success's discriminant, or the refusal, spelled out. One
   *   `string`, not a union with `SignInOutcome`'s two members: a union of a
   *   literal type and `string` collapses to `string` anyway, and writing it
   *   out reads as a guarantee the type does not make.
   */
  const outcomeOf = (outcome: Awaited<ReturnType<SignInService['signIn']>>): string =>
    outcome.ok ? outcome.value.status : `refused: ${outcome.error}`

  /** The scope a screen would be drawn under for `owner`. */
  const scopeFor = (owner: UserId): Promise<AdminScope> => adminScope({ user: owner })

  /** A form body, as a browser posts one. */
  const aForm = (fields: Readonly<Record<string, string>>): FormData => {
    const form = new FormData()
    for (const [name, value] of Object.entries(fields)) form.append(name, value)
    return form
  }

  /** Deletes every row this file writes, at both ends of the run. */
  const removeFixtures = async (): Promise<void> => {
    await payload.db.pool.query(`DELETE FROM sign_in_attempts WHERE subject LIKE $1`, [`${FIXTURE_IP_PREFIX}%`])
    await payload.db.pool.query(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)`, [
      `${MARKER}%`,
    ])
    await payload.db.pool.query(
      `DELETE FROM otp_challenges WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)`,
      [`${MARKER}%`],
    )
    await payload.delete({ collection: 'users', where: { email: { like: MARKER } } })
  }

  beforeAll(async () => {
    payload = await getTestPayload()
    sessions = createSessionService({ payload, now: Date.now })
    signIn = createSignInService({
      payload,
      otp: createOtpService({ payload, mailer: createConsoleMailer({ isDevelopment: false }), now: Date.now }),
      sessions,
      limiter: createSignInRateLimiter({ payload }),
      now: Date.now,
    })
    await removeFixtures()
  }, 180_000)

  afterAll(async () => {
    await removeFixtures()
  })

  describe('the one-time code toggle', () => {
    it('turns the code step off for the next sign-in, which is the only thing this toggle means', async () => {
      const account = await anAccount()

      await setOtpRequired(payload, await scopeFor(account.id), { on: false })

      // The left side is the production sign-in service's own answer; the
      // right side is the state the toggle asked for. Asserting
      // `users.otpRequired` is `false` would prove the write and nothing about
      // the behaviour.
      expect(outcomeOf(await aSignInWith(account.email, CORRECT_PASSWORD))).toBe('signed-in')
    })

    it('turns it back on, so the assertion above is not passing for a service that never asks', async () => {
      const account = await anAccount({ otpRequired: false })

      await setOtpRequired(payload, await scopeFor(account.id), { on: true })

      expect(outcomeOf(await aSignInWith(account.email, CORRECT_PASSWORD))).toBe('otp-required')
    })

    it('reads the value the toggle is switching TO, in both directions', () => {
      // A toggle posts the value it is switching to rather than a checkbox's
      // presence, because a checkbox that is off posts nothing at all — a form
      // built that way could never turn the second factor back on.
      expect([readOtpToggle(aForm({ on: 'true' })), readOtpToggle(aForm({ on: 'false' }))]).toEqual([
        { on: true },
        { on: false },
      ])
    })

    it('refuses anything that is not one of those two words', () => {
      expect(() => readOtpToggle(aForm({ on: '0' }))).toThrow()
    })
  })

  describe('changing the password', () => {
    it('makes the new password the one that signs in', async () => {
      const account = await anAccount({ otpRequired: false })

      const changed = await changePassword(payload, await scopeFor(account.id), {
        current: CORRECT_PASSWORD,
        next: NEW_PASSWORD,
      })

      expect(changed).toEqual({ ok: true, value: undefined })
      expect(outcomeOf(await aSignInWith(account.email, NEW_PASSWORD))).toBe('signed-in')
    })

    it('stops the old password signing in, which is what makes the change a change', async () => {
      const account = await anAccount({ otpRequired: false })
      await changePassword(payload, await scopeFor(account.id), { current: CORRECT_PASSWORD, next: NEW_PASSWORD })

      expect(outcomeOf(await aSignInWith(account.email, CORRECT_PASSWORD))).toBe('refused: invalid-credentials')
    })

    it('refuses a wrong current password, and leaves the account’s own password alone', async () => {
      const account = await anAccount({ otpRequired: false })

      const refused = await changePassword(payload, await scopeFor(account.id), {
        current: WRONG_PASSWORD,
        next: NEW_PASSWORD,
      })

      expect(refused).toEqual({ ok: false, error: 'wrong-password' })
      // THE SECOND HALF IS WHAT MAKES THE FIRST MEAN ANYTHING: a refusal that
      // had already written the new password would satisfy the assertion above.
      expect(outcomeOf(await aSignInWith(account.email, CORRECT_PASSWORD))).toBe('signed-in')
    })

    it('refuses an empty new password, because Payload writes nothing and says nothing', async () => {
      // MEASURED, AND IT IS THE FIFTH PAYLOAD SEMANTIC THIS REPOSITORY HAS HAD
      // TO FIND BY RUNNING IT. `payload.update({ data: { password: '' } })`
      // RESOLVES, writes no hash, and leaves the old password signing in —
      // while `payload.login` refuses the same value with a `ValidationError`.
      // Without the refusal the author clears the box, presses Save, is told
      // the password changed, and it did not.
      const account = await anAccount({ otpRequired: false })

      const refused = await changePassword(payload, await scopeFor(account.id), {
        current: CORRECT_PASSWORD,
        next: '',
      })

      expect(refused).toEqual({ ok: false, error: 'empty-password' })
      // The half that names the defect: the old password is still the one.
      expect(outcomeOf(await aSignInWith(account.email, CORRECT_PASSWORD))).toBe('signed-in')
    })

    it('spends no login attempt on an empty new password, so a mis-filled form cannot lock the account', async () => {
      // The empty box is refused BEFORE the current password is offered to
      // Payload, so five of them cost nothing. The assertion is a sign-in with
      // the right password, for the lockout case's reason.
      const account = await anAccount({ otpRequired: false })
      const scope = await scopeFor(account.id)
      for (let attempt = 0; attempt < MAX_LOGIN_ATTEMPTS; attempt += 1) {
        await changePassword(payload, scope, { current: WRONG_PASSWORD, next: '' })
      }

      expect(outcomeOf(await aSignInWith(account.email, CORRECT_PASSWORD))).toBe('signed-in')
    })

    it('locks the account after five wrong current passwords, exactly as five at the sign-in screen do', async () => {
      // A PREDICTION ABOUT A LIBRARY, MEASURED. `changePassword` verifies
      // through `payload.login`, which owns `maxLoginAttempts` and `lockTime`
      // — so this screen spends the same counter the sign-in screen does. The
      // assertion is on a sign-in with the RIGHT password, because "the wrong
      // password is refused" is true before the lock as well as after it.
      const account = await anAccount({ otpRequired: false })
      const scope = await scopeFor(account.id)
      for (let attempt = 0; attempt < MAX_LOGIN_ATTEMPTS; attempt += 1) {
        await changePassword(payload, scope, { current: WRONG_PASSWORD, next: NEW_PASSWORD })
      }

      expect(outcomeOf(await aSignInWith(account.email, CORRECT_PASSWORD))).toBe('refused: invalid-credentials')
    })

    it('leaves the session the author is already in working, because the lock is Payload’s and the session is ours', async () => {
      // The half an author actually wants to know. `sessions` rows are this
      // repository's and are not consulted by Payload's lockout, so locking
      // yourself out of the credential store does not sign you out of the
      // screen you are on — you simply cannot change the password until the
      // cooling-off period lifts.
      const account = await anAccount({ otpRequired: false })
      const scope = await scopeFor(account.id)
      const issued = await sessions.startSession({
        user: account.id,
        previous: null,
        keepSignedIn: false,
        device: 'the account screen',
        location: null,
      })
      if (!issued.ok) throw new Error(issued.error)
      for (let attempt = 0; attempt < MAX_LOGIN_ATTEMPTS; attempt += 1) {
        await changePassword(payload, scope, { current: WRONG_PASSWORD, next: NEW_PASSWORD })
      }

      expect((await sessions.authenticate(issued.value.session)).ok).toBe(true)
    })
  })

  describe('who is keeping this', () => {
    it('writes the three fields §2.11’s first card collects', async () => {
      const account = await anAccount()

      await saveProfile(payload, await scopeFor(account.id), {
        name: 'Helena Marsh',
        signoff: 'Until the next one',
        timeZone: 'Asia/Tokyo',
      })

      const row = await payload.findByID({ collection: 'users', id: account.row, depth: 0 })
      expect({ name: row.displayName, signoff: row.signoffDefault, timeZone: row.timeZone }).toEqual({
        name: 'Helena Marsh',
        signoff: 'Until the next one',
        timeZone: 'Asia/Tokyo',
      })
    })

    it('leaves the settings the card does not draw exactly where they were', async () => {
      // A PARTIAL UPDATE, DELIBERATELY. `siteMutations.ts`'s reasoning: a
      // whole-object write would clear every column the form did not carry,
      // and on this row that includes the one setting `SECURITY.md` calls
      // authoritative.
      const account = await anAccount({ otpRequired: true, notifyWeekly: true })

      await saveProfile(payload, await scopeFor(account.id), { name: 'Helena', signoff: '', timeZone: 'UTC' })

      const row = await payload.findByID({ collection: 'users', id: account.row, depth: 0 })
      expect({ otpRequired: row.otpRequired, weekly: row.notifyWeekly }).toEqual({ otpRequired: true, weekly: true })
    })

    it('trims what was typed, so a pasted name does not arrive with its spaces', () => {
      expect(readProfileForm(aForm({ name: '  Helena  ', signoff: ' see you ', timeZone: ' UTC ' }))).toEqual({
        name: 'Helena',
        signoff: 'see you',
        timeZone: 'UTC',
      })
    })

    it('accepts a card whose optional boxes were cleared, because every one of these columns is nullable', () => {
      expect(readProfileForm(aForm({}))).toEqual({ name: '', signoff: '', timeZone: '' })
    })
  })

  describe('tell me when', () => {
    it('writes the toggle that was pressed', async () => {
      const account = await anAccount({ notifyOnPublish: true })

      await saveNotifications(payload, await scopeFor(account.id), { setting: 'notifyOnPublish', on: false })

      const row = await payload.findByID({ collection: 'users', id: account.row, depth: 0 })
      expect(row.notifyOnPublish).toBe(false)
    })

    it('leaves the other toggle alone, so two forms cannot overwrite each other from a stale page', async () => {
      const account = await anAccount({ notifyOnPublish: true, notifyWeekly: true })

      await saveNotifications(payload, await scopeFor(account.id), { setting: 'notifyOnPublish', on: false })

      const row = await payload.findByID({ collection: 'users', id: account.row, depth: 0 })
      expect(row.notifyWeekly).toBe(true)
    })

    it('reads the column and the value the toggle is switching TO', () => {
      expect(readNotificationToggle(aForm({ setting: 'notifyWeekly', on: 'true' }))).toEqual({
        setting: 'notifyWeekly',
        on: true,
      })
    })

    it('refuses a column that is not one of this card’s two, however true it is of the row', () => {
      // SPECIES 6: the parse refuses what it does not recognise. `otpRequired`
      // is a real column on this row and IS writable — by its own action, which
      // is the one place `SECURITY.md`'s authoritative setting is written — so
      // a notification toggle that accepted any column name would be a second
      // way to switch off the second factor.
      expect(() => readNotificationToggle(aForm({ setting: 'otpRequired', on: 'false' }))).toThrow()
    })
  })

  describe('the access rule every one of these writes runs under', () => {
    it('refuses a write aimed at another account’s row, which is what ownAccountOnly is for', async () => {
      // NONE OF THE WRITES ABOVE CAN AIM ELSEWHERE — each one addresses
      // `scope.user.id`, which is the row `adminScope` resolved for the
      // admitted session. This case is the rule itself, asked directly: if a
      // future write took an id from a form, this is what would stop it.
      const mine = await anAccount()
      const theirs = await anAccount()
      const scope = await scopeFor(mine.id)

      await expect(
        payload.update({ collection: 'users', id: theirs.row, ...scope, depth: 0, data: { displayName: 'not mine' } }),
      ).rejects.toThrow()

      const row = await payload.findByID({ collection: 'users', id: theirs.row, depth: 0 })
      expect(row.displayName).not.toBe('not mine')
    })
  })
})
