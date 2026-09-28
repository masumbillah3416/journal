/**
 * readAccountScreen.integration.test.ts — behaviour spec for everything
 * SCREENS.md §2.11's four cards draw.
 *
 * Integration test (CLAUDE.md §2): every property here is Payload's, the
 * session store's, or Postgres's. What an unwritten checkbox column comes back
 * as, whether the caller's own row is the one the scope resolves, which
 * `sessions` row a cookie names, and whether the screen costs a fixed number of
 * statements are answers only a real Payload and a real database give.
 *
 * ═══ THE SESSION LIST IS ASSERTED WITH TWO LIVE SESSIONS, NEVER ONE ═══
 *
 * Standing orders §14: a fixture holding one of the thing a comparison
 * distinguishes cannot see the comparison being wrong. "The row whose hash
 * matches the cookie" and "the newest row" agree on every single-session
 * account, so the case that pins the current mark mints two and carries the
 * OLDER of them. The defect that hides behind a single-row fixture is the
 * author revoking the session they are sitting in.
 *
 * ═══ THE ACCOUNTS ARE THIS FILE'S OWN, AND SO ARE THE SESSIONS ═══
 *
 * `diary_test` is shared by every integration file in this run (standing
 * orders §16), and this file mints and revokes sessions. Every row it writes
 * carries {@link MARKER} in its address or its device label, and `afterAll`
 * deletes exactly those.
 *
 * Uses `getTestPayload()` rather than `getPayload()`, like every integration
 * file here.
 * Depends on: vitest, @travel-diary/domain/ids, ../auth/sessions, ../testPayload,
 * ./adminScope, ./readAccountScreen.
 */
import { type SessionId, type UserId, sessionId, userId } from '@travel-diary/domain/ids'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createSessionService } from '../auth/sessions'
import { getTestPayload } from '../testPayload'
import { type AdminScope, adminScope } from './adminScope'
import { QUERIES_PER_READ, TIME_ZONE_SAMPLE, readAccountScreen } from './readAccountScreen'

/** What every row this file writes carries, so cleanup can find them all. */
const MARKER = 'test-read-account'

/** A password that is not one: these accounts are never signed in to. */
const NOT_A_PASSWORD = 'not-a-real-password'

/** The device label every session this file mints is recorded under. */
const FIXTURE_DEVICE = `${MARKER}-device`

/** The place label recorded beside it. A place, never an address. */
const FIXTURE_PLACE = 'Reykjavik, Iceland'

describe('the Account screen', () => {
  let payload: Awaited<ReturnType<typeof getTestPayload>>
  let sessions: ReturnType<typeof createSessionService>
  let scope: AdminScope
  let account: UserId
  let accountId = 0
  let fixtureCount = 0

  /**
   * A fresh account of this file's own.
   * @param data - Columns to set on it beyond the address and password.
   * @returns Its row id and its branded id.
   */
  const anAccount = async (
    data: Record<string, unknown> = {},
  ): Promise<{ readonly row: number; readonly id: UserId }> => {
    fixtureCount += 1
    const created = await payload.create({
      collection: 'users',
      data: { email: `${MARKER}-${String(fixtureCount)}@example.test`, password: NOT_A_PASSWORD, ...data },
    })
    const branded = userId(String(created.id))
    if (!branded.ok) throw new Error(branded.error)
    return { row: created.id, id: branded.value }
  }

  /**
   * A live session for `owner`, minted through the production service.
   * @param owner - Whose session it is.
   * @returns The identifier a browser would carry.
   */
  const aSessionFor = async (owner: UserId): Promise<SessionId> => {
    const issued = await sessions.startSession({
      user: owner,
      previous: null,
      keepSignedIn: false,
      device: FIXTURE_DEVICE,
      location: FIXTURE_PLACE,
    })
    if (!issued.ok) throw new Error(`the fixture session was refused: ${issued.error}`)
    return issued.value.session
  }

  /**
   * The scope a screen would be drawn under for `owner`.
   *
   * THE PRODUCTION SCOPE, NOT A HAND-BUILT ONE, for
   * `readSettingsScreen.integration.test.ts`'s reason: `adminScope` resolves
   * the account row and is what every screen actually calls.
   * @param owner - The account the guard admitted.
   * @returns The scope.
   */
  const scopeFor = (owner: UserId): Promise<AdminScope> => adminScope({ user: owner })

  /**
   * Deletes every row this file writes, at both ends of the run.
   *
   * SESSIONS GO FIRST AND ARE MATCHED BY THEIR OWNER as well as by the device
   * marker: `sessions.user_id` is `NOT NULL` while its foreign key is
   * `ON DELETE set null`, so a session left pointing at a fixture account makes
   * the account's own delete fail the constraint — and one case here mints a
   * row with no device label at all.
   */
  const removeFixtures = async (): Promise<void> => {
    await payload.db.pool.query(
      `DELETE FROM sessions WHERE device = $1 OR user_id IN (SELECT id FROM users WHERE email LIKE $2)`,
      [FIXTURE_DEVICE, `${MARKER}%`],
    )
    await payload.delete({ collection: 'users', where: { email: { like: MARKER } } })
  }

  beforeAll(async () => {
    payload = await getTestPayload()
    sessions = createSessionService({ payload, now: Date.now })
    await removeFixtures()
    const created = await anAccount({
      displayName: 'Helena Marsh',
      signoffDefault: 'Until the next one',
      timeZone: 'Asia/Tokyo',
    })
    accountId = created.row
    account = created.id
    scope = await scopeFor(account)
  }, 180_000)

  afterAll(async () => {
    await removeFixtures()
    expect(accountId).toBeGreaterThan(0)
  })

  describe('who is keeping this', () => {
    it('draws the three fields §2.11 prints, off the caller’s own row', async () => {
      const view = await readAccountScreen(payload, scope, null)

      expect(view.profile).toMatchObject({
        name: 'Helena Marsh',
        signoff: 'Until the next one',
        timeZone: 'Asia/Tokyo',
      })
    })

    it('draws empty strings for a row that has never been filled in, rather than the word null', async () => {
      const blank = await anAccount()

      const view = await readAccountScreen(payload, await scopeFor(blank.id), null)

      expect(view.profile).toMatchObject({ name: '', signoff: '' })
    })

    it('offers time zone options whose labels state how a date is written there', async () => {
      // SCREENS.md §2.11's own phrase — "a Time zone select whose options state
      // how dates are written" — which means the label carries an EXAMPLE, not
      // just a zone name. Asserted against the two zones that write the sample
      // instant on different DAYS, so a label that printed the zone name twice
      // could not pass.
      const view = await readAccountScreen(payload, scope, null)

      const labels = new Map(view.profile.timeZoneOptions.map((option) => [option.zone, option.label]))
      expect(labels.get('Asia/Tokyo')).toBe(
        `Asia/Tokyo — ${new Intl.DateTimeFormat('en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Asia/Tokyo',
        }).format(TIME_ZONE_SAMPLE)}`,
      )
      expect(labels.get('Asia/Tokyo')).not.toBe(labels.get('America/Los_Angeles'))
    })

    it('offers the stored zone as an option even when it is not one of the listed ones', async () => {
      // Otherwise the select silently reports a zone the account does not hold,
      // and saving the form would move the author's dates without them asking.
      const elsewhere = await anAccount({ timeZone: 'Pacific/Chatham' })

      const view = await readAccountScreen(payload, await scopeFor(elsewhere.id), null)

      expect(view.profile.timeZoneOptions.map((option) => option.zone)).toContain('Pacific/Chatham')
    })

    it('still draws the screen when the stored zone is one no runtime knows', async () => {
      // `users.timeZone` is a plain `text` column, and `Intl.DateTimeFormat`
      // throws a `RangeError` for a zone its ICU has never heard of. Unguarded,
      // one bad value 500s the ONE screen an author would go to in order to fix
      // it. Found rather than reasoned about: this file's first list held
      // `Europe/Reykjavik`, which is not a zone.
      const nonsense = await anAccount({ timeZone: 'Europe/Reykjavik' })

      const view = await readAccountScreen(payload, await scopeFor(nonsense.id), null)

      expect(view.profile.timeZone).toBe('Europe/Reykjavik')
      expect(view.profile.timeZoneOptions.map((option) => option.label)).toContain(
        'Europe/Reykjavik — this system does not know that zone',
      )
    })
  })

  describe('tell me when', () => {
    it('reports the two notification columns at their declared defaults when nobody has written them', async () => {
      // `notifyOnPublish` defaults to true and `notifyWeekly` to false
      // (`apps/web/collections/users.ts`), so a reader that treated an
      // unwritten column as one fixed value would be wrong about exactly one
      // of them — which is why both sides are asserted in one case.
      // THE COLUMNS ARE NULLED IN SQL, not left to `payload.create`, which
      // applies the declared defaults on its way in — so a fixture that only
      // omitted them would be asserting that Payload wrote what Payload wrote,
      // and the fallback below would never run. NULL is what a row written
      // before a field existed actually holds.
      const fresh = await anAccount()
      await payload.db.pool.query(`UPDATE users SET notify_on_publish = NULL, notify_weekly = NULL WHERE id = $1`, [
        fresh.row,
      ])

      const view = await readAccountScreen(payload, await scopeFor(fresh.id), null)

      expect(view.notifications).toEqual({ onPublish: true, weekly: false })
    })

    it('reports what has been written, so the defaults above are a fallback and not the answer', async () => {
      const written = await anAccount({ notifyOnPublish: false, notifyWeekly: true })

      const view = await readAccountScreen(payload, await scopeFor(written.id), null)

      expect(view.notifications).toEqual({ onPublish: false, weekly: true })
    })
  })

  describe('getting in', () => {
    it('prints the address the reader signs in with', async () => {
      const view = await readAccountScreen(payload, scope, null)

      expect(view.gettingIn.email).toBe(`${MARKER}-1@example.test`)
    })

    it('reports the code step as ON for a row whose column has never been written', async () => {
      // THE SAME RULE `signIn.ts` READS THE COLUMN BY: a NULL is REQUIRED, not
      // optional, because `users.otp_required` is nullable and a second factor
      // that switched itself off for an old row would do it silently. A screen
      // that disagreed with the sign-in service about this would draw the
      // toggle off while the code step still ran.
      const fresh = await anAccount()
      await payload.db.pool.query(`UPDATE users SET otp_required = NULL WHERE id = $1`, [fresh.row])

      const view = await readAccountScreen(payload, await scopeFor(fresh.id), null)

      expect(view.gettingIn.otpRequired).toBe(true)
    })

    it('reports the code step as off only for a row that says so', async () => {
      const off = await anAccount({ otpRequired: false })

      const view = await readAccountScreen(payload, await scopeFor(off.id), null)

      expect(view.gettingIn.otpRequired).toBe(false)
    })
  })

  describe('where you are signed in', () => {
    it('lists the reader’s own live sessions, and nobody else’s', async () => {
      const mine = await anAccount()
      const theirs = await anAccount()
      const carried = await aSessionFor(mine.id)
      await aSessionFor(theirs.id)

      const view = await readAccountScreen(payload, await scopeFor(mine.id), carried)
      const otherView = await readAccountScreen(payload, await scopeFor(theirs.id), null)

      expect(view.sessions).toHaveLength(1)
      expect(view.sessions.map((row) => row.row)).not.toEqual(otherView.sessions.map((row) => row.row))
    })

    it('marks the row the request came in on, and not the newest row', async () => {
      // TWO LIVE SESSIONS, AND THE REQUEST CARRIES THE OLDER. See this file's
      // header: with one session the two rules agree, and the screen would
      // offer Revoke beside a wrong "Current" mark.
      const owner = await anAccount()
      const carried = await aSessionFor(owner.id)
      await aSessionFor(owner.id)

      const view = await readAccountScreen(payload, await scopeFor(owner.id), carried)

      const marked = view.sessions.filter((row) => row.isCurrent).map((row) => row.row)
      const newest = view.sessions.map((row) => row.row)[0]
      expect(marked).toHaveLength(1)
      expect(marked[0]).not.toBe(newest)
    })

    it('marks nothing for a request carrying no identifier, rather than guessing', async () => {
      const owner = await anAccount()
      await aSessionFor(owner.id)

      const view = await readAccountScreen(payload, await scopeFor(owner.id), null)

      expect(view.sessions.filter((row) => row.isCurrent)).toEqual([])
    })

    it('marks nothing for an identifier that names no row of this account’s', async () => {
      const owner = await anAccount()
      await aSessionFor(owner.id)
      const somebodyElses = sessionId('an-identifier-that-was-never-issued')
      if (!somebodyElses.ok) throw new Error(somebodyElses.error)

      const view = await readAccountScreen(payload, await scopeFor(owner.id), somebodyElses.value)

      expect(view.sessions.filter((row) => row.isCurrent)).toEqual([])
    })

    it('drops a revoked session, because the list says where you ARE signed in', async () => {
      const owner = await anAccount()
      const kept = await aSessionFor(owner.id)
      const gone = await aSessionFor(owner.id)
      const scoped = await scopeFor(owner.id)
      const before = await readAccountScreen(payload, scoped, kept)
      await sessions.revokeSession({ session: gone, owner: owner.id })

      const after = await readAccountScreen(payload, scoped, kept)

      expect([before.sessions.length, after.sessions.length]).toEqual([2, 1])
    })

    it('prints the device over the place and the date, which is the row §2.11 draws', async () => {
      const owner = await anAccount()
      const carried = await aSessionFor(owner.id)

      const view = await readAccountScreen(payload, await scopeFor(owner.id), carried)

      expect(view.sessions.map((row) => row.device)).toEqual([FIXTURE_DEVICE])
      expect(view.sessions.map((row) => row.where.startsWith(`${FIXTURE_PLACE} · `))).toEqual([true])
    })

    it('says so in words when a session recorded no device and no place', async () => {
      // A row's `device` and `location` are both nullable (`StartSessionRequest`
      // takes `string | null`), and a card printing "null · null" is what an
      // unchecked `??` produces. Both fallbacks are this repository's copy.
      const owner = await anAccount()
      const issued = await sessions.startSession({
        user: owner.id,
        previous: null,
        keepSignedIn: false,
        device: null,
        location: null,
      })
      if (!issued.ok) throw new Error(issued.error)

      const view = await readAccountScreen(payload, await scopeFor(owner.id), issued.value.session)

      expect(view.sessions.map((row) => row.device)).toEqual(['An unnamed device'])
      expect(view.sessions.map((row) => row.where.startsWith('Somewhere unrecorded · '))).toEqual([true])
    })

    it('writes each row’s date in the account’s OWN time zone, not the server host’s', async () => {
      // §2.11 puts a Time zone select on the card beside this list and states
      // its purpose as "options state how dates are written". Until this case
      // existed, every session date was written in the DEPLOYMENT HOST's zone:
      // measured on a host in `Asia/Dhaka`, a session last seen 19:00 UTC on
      // the 28th printed "29 Sept 2026" for an author stored as `UTC`. That is
      // a fact about where the server is, and it changes if the server moves.
      //
      // THE INSTANT IS PINNED AND SO ARE BOTH ZONES, so this case is decided by
      // the account's column rather than by the machine it runs on: 19:00 UTC
      // is the 28th in `UTC` and the 29th in `Asia/Tokyo`, on every host.
      const owner = await anAccount({ timeZone: 'UTC' })
      const carried = await aSessionFor(owner.id)
      await payload.db.pool.query(`UPDATE sessions SET last_seen_at = $2 WHERE user_id = $1`, [
        owner.row,
        new Date(Date.UTC(2026, 8, 28, 19, 0)),
      ])

      const inUtc = await readAccountScreen(payload, await scopeFor(owner.id), carried)
      await payload.db.pool.query(`UPDATE users SET time_zone = 'Asia/Tokyo' WHERE id = $1`, [owner.row])
      const inTokyo = await readAccountScreen(payload, await scopeFor(owner.id), carried)

      expect(inUtc.sessions.map((row) => row.where)).toEqual([`${FIXTURE_PLACE} · 28 Sept 2026`])
      expect(inTokyo.sessions.map((row) => row.where)).toEqual([`${FIXTURE_PLACE} · 29 Sept 2026`])
    })

    it('falls back to a defined zone when the account’s is one no runtime knows, rather than to the host’s', async () => {
      // `users.timeZone` is a plain `text` column, so the formatter can be
      // handed a zone `Intl` refuses. Falling back to the HOST would put the
      // defect above back for exactly the rows nobody can explain; UTC is an
      // answer that does not move when the server does.
      const owner = await anAccount({ timeZone: 'Europe/Reykjavik' })
      const carried = await aSessionFor(owner.id)
      await payload.db.pool.query(`UPDATE sessions SET last_seen_at = $2 WHERE user_id = $1`, [
        owner.row,
        new Date(Date.UTC(2026, 8, 28, 19, 0)),
      ])

      const view = await readAccountScreen(payload, await scopeFor(owner.id), carried)

      expect(view.sessions.map((row) => row.where)).toEqual([`${FIXTURE_PLACE} · 28 Sept 2026`])
    })

    it('dates a row by when it was last seen once it has been, not by when it was minted', async () => {
      // `authenticate` stamps `last_seen_at` only on a live session, so a row
      // that has never been presented has none and the line falls back to the
      // start. Both sides are asserted, because a reader that printed the start
      // time either way would be right on every unused row — which is most of
      // them — and wrong about the one the author is looking at.
      const owner = await anAccount()
      const carried = await aSessionFor(owner.id)
      await payload.db.pool.query(
        `UPDATE sessions SET created_at = created_at - interval '400 days' WHERE user_id = $1`,
        [owner.row],
      )
      const scoped = await scopeFor(owner.id)
      const unused = await readAccountScreen(payload, scoped, carried)
      await sessions.authenticate(carried)

      const seen = await readAccountScreen(payload, scoped, carried)

      expect(unused.sessions.map((row) => row.where)).not.toEqual(seen.sessions.map((row) => row.where))
    })
  })

  it('costs the same number of statements however many sessions the account holds', async () => {
    // BOTH SIDES OF CLAUDE.md §6's "no N+1": the count is taken, a session is
    // added, and the count is taken again. A per-row query makes the second
    // reading longer than the first.
    const owner = await anAccount()
    const scoped = await scopeFor(owner.id)
    const counted = async (): Promise<number> => {
      let statements = 0
      // ANNOTATED RATHER THAN INFERRED. `pg`'s `query` is overloaded and the
      // last overload takes a callback and returns `void`, which is the one
      // `Parameters<typeof …>` resolves to — so an inferred wrapper is a
      // function returning a void expression. Naming the promise-returning
      // shape picks that overload instead.
      const query: (text: string, values?: readonly unknown[]) => Promise<unknown> = payload.db.pool.query.bind(
        payload.db.pool,
      )
      Object.assign(payload.db.pool, {
        query: (text: string, values?: readonly unknown[]) => {
          statements += 1
          return query(text, values)
        },
      })
      try {
        await readAccountScreen(payload, scoped, null)
      } finally {
        Object.assign(payload.db.pool, { query })
      }
      return statements
    }

    const first = await counted()
    await aSessionFor(owner.id)
    const second = await counted()

    expect([first, second]).toEqual([QUERIES_PER_READ, QUERIES_PER_READ])
  })
})
