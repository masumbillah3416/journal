/**
 * guard.integration.test.ts — what the admin guard does with the identifier a
 * browser presents.
 *
 * Integration test (CLAUDE.md §2), against a real Payload and a real Postgres.
 * The whole question this module answers is "does this identifier name a live
 * row", and a mocked store would answer it by agreeing with the mock: the
 * three refusals below — a row that was revoked, one that has aged out, and an
 * identifier that never named a row — are facts about what the `sessions`
 * table holds, not about what a stub was told to return.
 *
 * ═══ THE CASE THIS FILE EXISTS FOR ═══
 *
 * "the pre-auth identifier stops authenticating once it has been signed in
 * with". `SECURITY.md` requires the session identifier to rotate on login and
 * that no pre-auth id is ever reused. The trap the brief names is asserting
 * that a session EXISTS after signing in — which is true of an implementation
 * that adopts the identifier it was handed and rotates nothing. This file
 * asserts the OLD identifier is REFUSED, from both sides: before the sign-in
 * (it authenticates nothing, because no row names it) and after it (it still
 * authenticates nothing, and the new one does).
 *
 * Uses `getTestPayload()` for its fixtures; the module under test calls
 * `getPayload()` itself — a route handler has nothing to inject through — and
 * reaches the same `diary_test` database because `vitest.integration.config.ts`
 * sets `DATABASE_URL` for the whole process. `newPasswordScreen.integration.test.ts`
 * makes the same pairing for the same reason.
 *
 * ═══ AND THE FACTORY EVERY PHASE 4 ACTION IS BUILT FROM ═══
 *
 * The sixth whole-branch review's most valuable finding: nothing in this
 * repository EXECUTED `guardedAction`. It had no caller, it sat inside a
 * `c8 ignore` region, and the only thing standing over its body was two
 * `toContain` substring assertions in `adminGuardRegistration.test.ts` — so
 * the reviewer replaced the body with a `process.env`-keyed path that skipped
 * `requireAdminSession()` entirely, kept both pinned substrings, and got
 * `eslint`, `tsc` and prettier clean with **1,348 unit tests passing**. The
 * mechanism an ESLint rule, a factory, four documents and an ADR exist to
 * funnel every future mutation through was asserted by string matching.
 *
 * So the last block here executes it, and asserts the two things Phase 4 will
 * rely on twenty times over: an UNAUTHENTICATED call never reaches the action,
 * and an authenticated one reaches it with the session the guard produced.
 *
 * `next/headers` and `next/navigation` are STOOD IN FOR, not mocked-what-we-own
 * (CLAUDE.md §2.3): both are the framework's request boundary, `headers()`
 * throws outside a request context and no test can supply one, and real
 * `redirect()` throws rather than returning — which the stand-in does too, so
 * the order of the two statements under test is observable rather than
 * inferred. Everything below the boundary is real: a real `sessions` row, a
 * real Payload, a real Postgres. The refusal is a fact about the table, which
 * is why this is an integration file rather than a unit one.
 *
 * Depends on: vitest, @travel-diary/domain/auth/session, ./browserSession,
 * ./guard, ./sessions, ../testPayload.
 */
import { SESSION_COOKIE_NAME } from '@travel-diary/domain/auth/session'
import type { SessionId, UserId } from '@travel-diary/domain/ids'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getTestPayload } from '../testPayload'
import { newBrowserSession } from './browserSession'
import { SIGN_IN_PATH, authenticateAdminRequest, guardedAction } from './guard'
import { createSessionService } from './sessions'

/**
 * The request the framework stand-ins below answer with, and where a refusal
 * sent the browser.
 *
 * `vi.hoisted` because `vi.mock`'s factory is hoisted above every import, so a
 * plain `let` declared here would not exist when the factory is evaluated.
 * Mutable on purpose: each case sets the cookie header the framework would
 * have read, which is the only input `requireAdminSession` takes.
 */
const framework = vi.hoisted(() => ({
  /** What `headers().get('cookie')` answers. `null` is a browser with no cookies. */
  cookieHeader: null as string | null,
  /** Every path `redirect()` was called with, in order. */
  redirectedTo: [] as string[],
}))

/** What the stand-in `redirect()` throws, so a caller cannot mistake it for a return. */
const REDIRECT_THROWN = 'next/navigation redirect'

vi.mock('next/headers', () => ({
  headers: () =>
    Promise.resolve({
      get: (name: string) => (name.toLowerCase() === 'cookie' ? framework.cookieHeader : null),
    }),
}))

vi.mock('next/navigation', () => ({
  redirect: (destination: string) => {
    framework.redirectedTo.push(destination)
    // Real `redirect()` throws; a stand-in that returned would let an action
    // run after a refusal and this file would report the opposite of the truth.
    throw new Error(REDIRECT_THROWN)
  },
}))

/** Every fixture address here belongs to this domain, so `afterAll` can find them. */
const FIXTURE_EMAIL_DOMAIN = 'admin-guard-fixture.example'

/** The password every fixture account is created with. Never offered to anything. */
const FIXTURE_PASSWORD = 'the-one-this-account-was-created-with'

/** Distinguishes one fixture from the next within a single run. */
let fixtureCount = 0

/** The shared test Payload instance, assigned by `beforeAll`. */
let payload: Awaited<ReturnType<typeof getTestPayload>>

/** The session service this file issues and revokes rows with. */
let sessions: ReturnType<typeof createSessionService>

/**
 * What `sessions` is told the time is: fixed for the run, so a lifetime is not
 * waited out — but taken from the REAL clock rather than written down.
 *
 * IT WAS A LITERAL, `2026-09-06T09:00:00.000Z`, AND IT WENT OFF LIKE A TIMER.
 * The module under test reaches its own services through `signInServices()`,
 * whose clock is `Date.now`; the fixtures here were written through a service
 * frozen at that literal. So every "live session" row was stamped
 * `expires_at = 2026-09-06T21:00Z`, and from the moment real time passed it
 * every such fixture authenticated as `'expired'` — three cases that had
 * passed for a day began failing at a wall-clock boundary, with nothing in the
 * repository having changed. Found by Phase 2 Task 11's fix round.
 *
 * INVARIANT: a fixture clock and the clock the code under test reads must be
 * in the same epoch. `otpService.integration.test.ts`'s own header states the
 * rule this file broke — "TIME IS INJECTED, NEVER FROZEN ... a frozen clock
 * would put the service's `now` and the row's `createdAt` in different
 * calendars". Read once at import, so it is still one instant for the whole
 * file and no case can drift from another.
 */
const clock = Date.now()

/**
 * A digit-free label, derived from a counter.
 * @param count - The fixture's ordinal within this run.
 * @returns Two lowercase letters, unique for the first 676 fixtures.
 */
const alphabeticLabel = (count: number): string =>
  String.fromCharCode(97 + Math.floor(count / 26)) + String.fromCharCode(97 + (count % 26))

/**
 * A fresh account.
 * @returns The account's branded id.
 */
const anAccount = async (): Promise<UserId> => {
  fixtureCount += 1
  const email = `reader-${alphabeticLabel(fixtureCount)}@${FIXTURE_EMAIL_DOMAIN}`
  const created = await payload.create({
    collection: 'users',
    data: { email, password: FIXTURE_PASSWORD },
  })
  return String(created.id) as UserId
}

/**
 * The `Cookie` header a browser carrying `session` would send.
 * @param session - The identifier it holds.
 * @returns The header value, with a second cookie beside it so the parse is
 *   exercised on a realistic header rather than on one pair.
 */
const cookieHeaderFor = (session: string): string => `td-reading-surface=book; ${SESSION_COOKIE_NAME}=${session}`

/** Deletes every row this file wrote. */
const removeFixtures = async (): Promise<void> => {
  const accounts = await payload.find({
    collection: 'users',
    where: { email: { like: FIXTURE_EMAIL_DOMAIN } },
    limit: 500,
    depth: 0,
  })
  for (const account of accounts.docs) {
    await payload.db.pool.query(`DELETE FROM sessions WHERE user_id = $1`, [account.id])
    await payload.delete({ collection: 'users', id: account.id })
  }
}

beforeAll(async () => {
  payload = await getTestPayload()
  sessions = createSessionService({ payload, now: () => clock })
  await removeFixtures()
})

afterAll(async () => {
  await removeFixtures()
})

describe('what the guard makes of the identifier a browser presents', () => {
  it('names the account a live session belongs to', async () => {
    const user = await anAccount()
    const started = await sessions.startSession({
      user,
      previous: null,
      keepSignedIn: false,
      device: null,
      location: null,
    })
    if (!started.ok) throw new Error('the fixture session was not issued')

    const authenticated = await authenticateAdminRequest(cookieHeaderFor(started.value.session))

    expect(authenticated).toEqual({ ok: true, value: { user } })
  })

  it('refuses a request carrying no cookies at all', async () => {
    expect(await authenticateAdminRequest(null)).toEqual({ ok: false, error: 'no-session' })
  })

  it('refuses a request whose cookies do not include this one', async () => {
    expect(await authenticateAdminRequest('td-reading-surface=book')).toEqual({ ok: false, error: 'no-session' })
  })

  it('refuses an identifier that names no row', async () => {
    // A well-formed identifier nobody ever issued. It is not `'no-session'`:
    // the browser presented something, and it was checked.
    expect(await authenticateAdminRequest(cookieHeaderFor(newBrowserSession()))).toEqual({
      ok: false,
      error: 'unknown',
    })
  })

  it('refuses a revoked session on the first request after it was revoked', async () => {
    const user = await anAccount()
    const started = await sessions.startSession({
      user,
      previous: null,
      keepSignedIn: false,
      device: null,
      location: null,
    })
    if (!started.ok) throw new Error('the fixture session was not issued')
    await sessions.revokeSession({ session: started.value.session, owner: user })

    expect(await authenticateAdminRequest(cookieHeaderFor(started.value.session))).toEqual({
      ok: false,
      error: 'revoked',
    })
  })

  it('refuses a session whose row has aged out, whatever the cookie was told', async () => {
    const user = await anAccount()
    const started = await sessions.startSession({
      user,
      previous: null,
      keepSignedIn: true,
      device: null,
      location: null,
    })
    if (!started.ok) throw new Error('the fixture session was not issued')
    await payload.db.pool.query(`UPDATE sessions SET expires_at = $2 WHERE token_hash IS NOT NULL AND user_id = $1`, [
      Number(user),
      new Date(clock - 1_000),
    ])

    expect(await authenticateAdminRequest(cookieHeaderFor(started.value.session))).toEqual({
      ok: false,
      error: 'expired',
    })
  })
})

describe('the pre-auth identifier, which must never authenticate', () => {
  it('authenticates nothing before it has been signed in with', async () => {
    const preAuth = newBrowserSession()

    expect(await authenticateAdminRequest(cookieHeaderFor(preAuth))).toEqual({ ok: false, error: 'unknown' })
  })

  it('still authenticates nothing after the sign-in it started, which the new one does', async () => {
    // THE CASE THE BRIEF NAMES. Asserting only that a session exists after
    // signing in passes for a handler that adopts the identifier it was handed
    // and rotates nothing; this asserts the OLD identifier is refused and the
    // NEW one is not, which no such handler can satisfy.
    const user = await anAccount()
    const preAuth = newBrowserSession()

    const started = await sessions.startSession({
      user,
      previous: preAuth,
      keepSignedIn: false,
      device: null,
      location: null,
    })
    if (!started.ok) throw new Error('the fixture session was not issued')

    expect(started.value.session).not.toBe(preAuth)
    expect(await authenticateAdminRequest(cookieHeaderFor(preAuth))).toEqual({ ok: false, error: 'unknown' })
    expect(await authenticateAdminRequest(cookieHeaderFor(started.value.session))).toEqual({
      ok: true,
      value: { user },
    })
  })

  it('stops authenticating the identifier a signed-in browser arrived with', async () => {
    // The same rotation, from the other side: a browser that already held a
    // LIVE session signs in again. The row for the old identifier is revoked
    // in the same statement that mints the new one, so the value the browser
    // was carrying a moment ago is refused rather than left working beside it.
    const user = await anAccount()
    const first = await sessions.startSession({
      user,
      previous: null,
      keepSignedIn: false,
      device: null,
      location: null,
    })
    if (!first.ok) throw new Error('the first fixture session was not issued')

    const second = await sessions.startSession({
      user,
      previous: first.value.session,
      keepSignedIn: false,
      device: null,
      location: null,
    })
    if (!second.ok) throw new Error('the second fixture session was not issued')

    expect(await authenticateAdminRequest(cookieHeaderFor(first.value.session))).toEqual({
      ok: false,
      error: 'revoked',
    })
    expect(await authenticateAdminRequest(cookieHeaderFor(second.value.session))).toEqual({
      ok: true,
      value: { user },
    })
  })
})

describe('what a refusal says', () => {
  it('never names the identifier it refused, in any refusal', async () => {
    // CLAUDE.md §7: a refusal carrying the value would put a live session
    // identifier into whatever renders or logs it.
    const presented: SessionId = newBrowserSession()

    const refused = await authenticateAdminRequest(cookieHeaderFor(presented))

    expect(JSON.stringify(refused)).not.toContain(presented)
  })
})

describe('the factory every Server Action is built from', () => {
  beforeEach(() => {
    framework.cookieHeader = null
    framework.redirectedTo = []
  })

  it('never reaches the action when the request carries no live session', async () => {
    // THE CASE THE SIXTH REVIEW ASKED FOR. A factory that called the action
    // first, or that skipped the guard on a flag, passes every other check in
    // this repository - two substring assertions over `guard.ts`'s text - and
    // fails here.
    const reached: string[] = []
    const publishJourney = guardedAction((session, id: string) => {
      reached.push(id)
      return Promise.resolve(session.user)
    })

    await expect(publishJourney('journey-1')).rejects.toThrow(REDIRECT_THROWN)

    expect(reached, 'the action ran for a request the guard refused').toEqual([])
    expect(framework.redirectedTo).toEqual([SIGN_IN_PATH])
  })

  it('reaches the action with the session the guard produced, and nothing else', async () => {
    const user = await anAccount()
    const started = await sessions.startSession({
      user,
      previous: null,
      keepSignedIn: false,
      device: null,
      location: null,
    })
    if (!started.ok) throw new Error('the fixture session was not issued')
    framework.cookieHeader = cookieHeaderFor(started.value.session)

    const publishJourney = guardedAction((session, id: string) => Promise.resolve({ ran: id, as: session }))

    // The session is the FIRST argument and the form's own arguments follow it,
    // which is what stops an action reading a session of its own.
    expect(await publishJourney('journey-1')).toEqual({ ran: 'journey-1', as: { user } })
    expect(framework.redirectedTo).toEqual([])
  })

  it('refuses on the first call after the session it admitted was revoked', async () => {
    // The guard runs on EVERY call rather than once per factory: a factory that
    // cached the session it first saw would pass the two cases above and leave
    // a revoked administrator signed in for the life of the process.
    const user = await anAccount()
    const started = await sessions.startSession({
      user,
      previous: null,
      keepSignedIn: false,
      device: null,
      location: null,
    })
    if (!started.ok) throw new Error('the fixture session was not issued')
    framework.cookieHeader = cookieHeaderFor(started.value.session)
    const publishJourney = guardedAction((session) => Promise.resolve(session.user))

    expect(await publishJourney()).toEqual(user)
    await sessions.revokeSession({ session: started.value.session, owner: user })

    await expect(publishJourney()).rejects.toThrow(REDIRECT_THROWN)
    expect(framework.redirectedTo).toEqual([SIGN_IN_PATH])
  })
})
