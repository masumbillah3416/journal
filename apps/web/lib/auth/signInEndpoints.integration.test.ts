/**
 * signInEndpoints.integration.test.ts — the three `POST`s the sign-in surface
 * makes: the password step, the code step, and signing out.
 *
 * Integration test (CLAUDE.md §2), against a real Payload and a real Postgres.
 * The claims are all claims about what the database now holds — that a
 * challenge exists bound to this browser, that a session row was issued, that
 * the identifier the browser arrived with no longer authenticates — and a
 * mocked store would answer every one of them by agreeing with the mock.
 *
 * ═══ THE THREE REFUSALS ARE COMPARED WHOLE, NOT BY THEIR BODIES ═══
 *
 * Task 5 made `signIn` answer identically for an unknown address, a wrong
 * password and a locked account, and proved the timing with a median ratio of
 * 0.90 (0.14 with the dummy derivation deleted). A ROUTE that answered a
 * different status, a different `Location`, a different `Set-Cookie` or in a
 * different time for one of the three would re-open exactly what that task
 * closed. `responseShape` below reads the status and EVERY header, and the
 * three are compared with `toEqual` — not three separate assertions that each
 * happen to agree today. The timing case measures the whole handler rather
 * than the service, because the handler is what an attacker can reach.
 *
 * EVERY REDIRECT IS ASSERTED BY ITS STATUS AND ITS `Location` TOGETHER, for
 * the reason `newPasswordScreen.integration.test.ts` gives: a case checking
 * only the location passes on a `200` carrying a header nothing follows.
 *
 * THE CODE STEP'S CHALLENGES ARE ISSUED BY THIS FILE'S OWN OTP SERVICE, bound
 * to the same browser identifier the handler will read out of the cookie. That
 * is not a shortcut around the handler — it is the only way to know the six
 * digits, since the handler's own mailer prints to a terminal. What the
 * handler is then asked is the real question: does this code, for this
 * browser, produce a rotated session.
 *
 * Uses `getTestPayload()` for its fixtures; the handlers call `getPayload()`
 * themselves — a route handler has nothing to inject through — and reach the
 * same `diary_test` database because `vitest.integration.config.ts` sets
 * `DATABASE_URL` for the whole process.
 * Depends on: vitest, @travel-diary/domain, ./browserSession, ./guard,
 * ./otpService, ./sessions, ./signInEndpoints, ./testing/otpProbes,
 * ../adapters/console-mailer, ../testPayload.
 */
import { REMEMBERED_SESSION_LIFETIME_MS, SESSION_COOKIE_NAME, SESSION_LIFETIME_MS } from '@travel-diary/domain/auth/session'
import { IP_ATTEMPT_LIMIT } from '@travel-diary/domain/auth/rateWindow'
import { PASSWORD_REFUSED_STATE } from '@travel-diary/domain/auth/signInScreen'
import type { UserId } from '@travel-diary/domain/ids'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createConsoleMailer } from '../adapters/console-mailer'
import { getTestPayload } from '../testPayload'
import { KEEP_SIGNED_IN_COOKIE_NAME, newBrowserSession } from './browserSession'
import { authenticateAdminRequest } from './guard'
import { createOtpService } from './otpService'
import { createSignInRateLimiter } from './rateLimit'
import { createSessionService } from './sessions'
import {
  CODE_STEP_PATH,
  handleCodeStep,
  handlePasswordStep,
  handleSignOut,
  PASSWORD_STEP_PATH,
  SIGNED_IN_PATH,
} from './signInEndpoints'
import { readCodeFromOutbox } from './testing/otpProbes'

/** Every fixture address here belongs to this domain, so `afterAll` can find them. */
const FIXTURE_EMAIL_DOMAIN = 'sign-in-endpoints-fixture.example'

/**
 * The requesting addresses this file spends limiter budget under.
 *
 * RFC 3849's documentation range, and a prefix no other suite uses:
 * `signIn.integration.test.ts` has `2001:db8:2::`, `rateLimit`'s is TEST-NET-2
 * and `passwordReset`'s TEST-NET-3, so no two files can exhaust each other's
 * windows.
 */
const FIXTURE_IP_PREFIX = '2001:db8:a::'

/** The password every fixture account is created with. */
const FIXTURE_PASSWORD = 'the-one-this-account-was-created-with'

/** A password no fixture account has. */
const WRONG_PASSWORD = 'not-the-one-this-account-was-created-with'

/** Where these requests are addressed. The handlers read the origin from nothing. */
const ORIGIN = 'http://localhost:3000'

/** How many samples each arm of the timing case takes. */
const SAMPLES = 25

/**
 * How far a measured lifetime may fall short of the constant it should be.
 *
 * A minute. The row is written with `expires_at = now() + lifetime` inside the
 * handler, a few milliseconds after the test read its own clock, so the two
 * cannot be compared for equality — but they can be compared to within a
 * minute, and that is the whole difference between this and the assertion these
 * two cases used to make.
 *
 * THE OLD ONE WAS SATISFIED BY THOSE FEW MILLISECONDS. It read
 * `expiry > startedAt + SESSION_LIFETIME_MS`, which is true of a TWELVE-HOUR
 * row as well as a thirty-day one: the handler's clock is always a little
 * later than the test's. Deleting `readKeepSignedIn` and hard-coding
 * `keepSignedIn: false` left both cases green — found by mutation, not by
 * reading.
 */
const LIFETIME_SLACK_MS = 60_000

/** Distinguishes one fixture from the next within a single run. */
let fixtureCount = 0

/** The shared test Payload instance, assigned by `beforeAll`. */
let payload: Awaited<ReturnType<typeof getTestPayload>>

/** The OTP service this file issues readable challenges with. */
let otp: ReturnType<typeof createOtpService>

/** The mailer those codes are read back out of. */
let mailer: ReturnType<typeof createConsoleMailer>

/** The session service this file issues fixture sessions with. */
let sessions: ReturnType<typeof createSessionService>

/**
 * A digit-free label, derived from a counter.
 *
 * Digit-free deliberately: the leak assertions below search a response for the
 * digits of an issued code, and a fixture address containing digits would make
 * them ambiguous — the same reason `otpProbes.ts` gives.
 *
 * @param count - The fixture's ordinal within this run.
 * @returns Two lowercase letters, unique for the first 676 fixtures.
 */
const alphabeticLabel = (count: number): string =>
  String.fromCharCode(97 + Math.floor(count / 26)) + String.fromCharCode(97 + (count % 26))

/** An account, and the two ways this file addresses it. */
interface FixtureAccount {
  /** Its branded id. */
  readonly user: UserId
  /** Its sign-in address. */
  readonly email: string
}

/**
 * A fresh account with a known password.
 *
 * @param options - Whether the account asks for the code step.
 * @returns The account.
 */
const anAccount = async ({ otpRequired }: { readonly otpRequired: boolean }): Promise<FixtureAccount> => {
  fixtureCount += 1
  const email = `reader-${alphabeticLabel(fixtureCount)}@${FIXTURE_EMAIL_DOMAIN}`
  const created = await payload.create({
    collection: 'users',
    data: { email, password: FIXTURE_PASSWORD, otpRequired },
  })
  return { user: String(created.id) as UserId, email }
}

/** A requesting address no other case in this run is using. */
const anIp = (): string => `${FIXTURE_IP_PREFIX}${alphabeticLabel(fixtureCount)}`

/** An address of the fixture domain that names no account at all. */
const anUnknownAddress = (): string => {
  fixtureCount += 1
  return `nobody-${alphabeticLabel(fixtureCount)}@${FIXTURE_EMAIL_DOMAIN}`
}

/** What one of these endpoints was asked, and what it carried. */
interface Submission {
  /** The endpoint's own address. Nothing under test reads it. */
  readonly path: string
  /** The form fields, or `null` for a body with none. */
  readonly fields: Record<string, string> | null
  /** The `Cookie` header to send, or `null` for a browser carrying none. */
  readonly cookie?: string | null
  /** The requesting address to claim. */
  readonly ip?: string
}

/**
 * Posts a form body the way a browser would.
 *
 * @param submission - See {@link Submission}.
 * @returns The request, ready for a handler.
 */
const aPost = ({ path, fields, cookie = null, ip = FIXTURE_IP_PREFIX }: Submission): Request => {
  const body = new FormData()
  for (const [name, value] of Object.entries(fields ?? {})) body.set(name, value)

  const headers = new Headers({ 'x-forwarded-for': ip, 'user-agent': 'a browser' })
  if (cookie !== null) headers.set('cookie', cookie)

  return new Request(`${ORIGIN}${path}`, { method: 'POST', body, headers })
}

/** The `Cookie` header a browser carrying `session` would send. */
const carrying = (session: string): string => `${SESSION_COOKIE_NAME}=${session}`

/**
 * Everything about a response an attacker can observe, except its timing.
 *
 * EVERY HEADER, not a chosen few: the whole point is that two refusals cannot
 * be told apart, and a comparison that read only the status and the `Location`
 * would pass for a handler that set a `Set-Cookie` on one arm and not the
 * other.
 *
 * @param response - The handler's answer.
 * @returns Its status and every header, with the header names sorted so two
 *   responses compare by content rather than by insertion order.
 */
const responseShape = async (response: Response): Promise<unknown> => ({
  status: response.status,
  headers: [...response.headers.entries()]
    // THE MINTED IDENTIFIER IS THE ONE THING THAT MUST DIFFER, so it is
    // replaced by a fixed word rather than dropped: the cookie's name, its
    // every attribute and its PRESENCE are all still compared exactly, and a
    // handler that set the cookie on one arm and not the other still fails.
    // Nothing else in either response varies between runs.
    .map(([name, value]) => [name, value.replaceAll(/(?<=td-session=)[^;]+/gu, '<minted>')])
    .sort(([left], [right]) => (left ?? '').localeCompare(right ?? '')),
  body: await response.text(),
})

/** The `Set-Cookie` value a response set for the session cookie, if any. */
const sessionCookieOf = (response: Response): string | null => {
  const header = response.headers.get('set-cookie')
  return header === null || !header.includes(`${SESSION_COOKIE_NAME}=`) ? null : header
}

/** The session identifier a response handed the browser, if any. */
const issuedSessionOf = (response: Response): string | null => {
  const header = sessionCookieOf(response)
  if (header === null) return null

  const value = new RegExp(`${SESSION_COOKIE_NAME}=([^;]*)`, 'u').exec(header)?.[1] ?? ''
  return value === '' ? null : value
}

/**
 * How long the session an account was most recently issued actually lasts.
 *
 * @param user - The account whose newest `sessions` row to read.
 * @param startedAt - The instant the request was made, in epoch milliseconds.
 * @returns The row's lifetime in milliseconds.
 * @throws If no session row was written at all, which no caller expects.
 */
const issuedLifetimeMs = async (user: UserId, startedAt: number): Promise<number> => {
  const rows = await payload.db.pool.query<{ expires_at: Date }>(
    `SELECT expires_at FROM sessions WHERE user_id = $1 ORDER BY id DESC LIMIT 1`,
    [Number(user)],
  )
  const expiry = rows.rows[0]?.expires_at
  if (expiry === undefined) throw new Error('no session row was written')
  return expiry.getTime() - startedAt
}

/** The median of a set of samples. */
const median = (samples: readonly number[]): number => {
  const sorted = [...samples].sort((left, right) => left - right)
  const middle = sorted[Math.floor(sorted.length / 2)]
  if (middle === undefined) throw new Error('no samples')
  return middle
}

/** Deletes every row this file wrote. */
const removeFixtures = async (): Promise<void> => {
  await payload.db.pool.query(`DELETE FROM sign_in_attempts WHERE subject LIKE $1`, [`${FIXTURE_IP_PREFIX}%`])
  const accounts = await payload.find({
    collection: 'users',
    where: { email: { like: FIXTURE_EMAIL_DOMAIN } },
    limit: 900,
    depth: 0,
  })
  for (const account of accounts.docs) {
    await payload.db.pool.query(`DELETE FROM sessions WHERE user_id = $1`, [account.id])
    await payload.db.pool.query(`DELETE FROM otp_challenges WHERE user_id = $1`, [account.id])
    await payload.delete({ collection: 'users', id: account.id })
  }
}

beforeAll(async () => {
  payload = await getTestPayload()
  mailer = createConsoleMailer({ isDevelopment: false })
  otp = createOtpService({ payload, mailer, now: Date.now })
  sessions = createSessionService({ payload, now: Date.now })
  await removeFixtures()
})

afterAll(async () => {
  await removeFixtures()
})

describe('what the password step answers', () => {
  it('sends an account with no second factor straight to the signed-in screen', async () => {
    const { email } = await anAccount({ otpRequired: false })

    const answered = await handlePasswordStep(
      aPost({ path: PASSWORD_STEP_PATH, fields: { email, password: FIXTURE_PASSWORD }, ip: anIp() }),
    )

    expect(answered.status).toBe(303)
    expect(answered.headers.get('Location')).toBe(SIGNED_IN_PATH)
  })

  it('hands that browser a session the guard then accepts', async () => {
    // The point of the whole task: the cookie is set, and it is a cookie that
    // authenticates. A `Set-Cookie` carrying a value no row names would pass
    // every assertion about the header and none about the session.
    const { user, email } = await anAccount({ otpRequired: false })

    const answered = await handlePasswordStep(
      aPost({ path: PASSWORD_STEP_PATH, fields: { email, password: FIXTURE_PASSWORD }, ip: anIp() }),
    )

    const issued = issuedSessionOf(answered)
    if (issued === null) throw new Error('the response set no session cookie')
    expect(await authenticateAdminRequest(carrying(issued))).toEqual({ ok: true, value: { user } })
  })

  it('rotates away from the identifier the browser arrived with', async () => {
    // `SECURITY.md`: "Rotate the session identifier on login; never reuse a
    // pre-auth id." Asserting that a session exists afterwards passes for a
    // handler that adopts the identifier it was handed, so this asserts the
    // pre-auth value is DIFFERENT and that it authenticates nothing.
    const { email } = await anAccount({ otpRequired: false })
    const preAuth = newBrowserSession()

    const answered = await handlePasswordStep(
      aPost({
        path: PASSWORD_STEP_PATH,
        fields: { email, password: FIXTURE_PASSWORD },
        cookie: carrying(preAuth),
        ip: anIp(),
      }),
    )

    expect(issuedSessionOf(answered)).not.toBe(preAuth)
    expect(await authenticateAdminRequest(carrying(preAuth))).toEqual({ ok: false, error: 'unknown' })
  })

  it('honours "keep me signed in" by lengthening the row, not the cookie alone', async () => {
    const { user, email } = await anAccount({ otpRequired: false })
    const startedAt = Date.now()

    await handlePasswordStep(
      aPost({
        path: PASSWORD_STEP_PATH,
        fields: { email, password: FIXTURE_PASSWORD, keepSignedIn: 'on' },
        ip: anIp(),
      }),
    )

    // Measured as a LIFETIME rather than as "later than the short one" — see
    // LIFETIME_SLACK_MS for what the second of those was worth.
    expect(await issuedLifetimeMs(user, startedAt)).toBeGreaterThan(REMEMBERED_SESSION_LIFETIME_MS - LIFETIME_SLACK_MS)
  })

  it('does not lengthen the row when the box was left unticked', async () => {
    // The other side of the case above, and what makes it about the CHECKBOX
    // rather than about a row existing: the same request without the field
    // gets the ordinary twelve hours.
    const { user, email } = await anAccount({ otpRequired: false })
    const startedAt = Date.now()

    await handlePasswordStep(
      aPost({ path: PASSWORD_STEP_PATH, fields: { email, password: FIXTURE_PASSWORD }, ip: anIp() }),
    )

    const lifetime = await issuedLifetimeMs(user, startedAt)
    expect(lifetime).toBeGreaterThan(SESSION_LIFETIME_MS - LIFETIME_SLACK_MS)
    expect(lifetime).toBeLessThan(SESSION_LIFETIME_MS + LIFETIME_SLACK_MS)
  })

  it('sends an account that asks for a code to the code screen', async () => {
    const { email } = await anAccount({ otpRequired: true })

    const answered = await handlePasswordStep(
      aPost({ path: PASSWORD_STEP_PATH, fields: { email, password: FIXTURE_PASSWORD }, ip: anIp() }),
    )

    expect(answered.status).toBe(303)
    expect(answered.headers.get('Location')).toBe(CODE_STEP_PATH)
  })

  it('issues no session at the code step, so the second factor is not decorative', async () => {
    // A handler that set the session cookie here and merely SHOWED the code
    // screen would pass the case above and skip the second factor entirely.
    const { user, email } = await anAccount({ otpRequired: true })

    const answered = await handlePasswordStep(
      aPost({ path: PASSWORD_STEP_PATH, fields: { email, password: FIXTURE_PASSWORD }, ip: anIp() }),
    )

    const issued = issuedSessionOf(answered)
    if (issued !== null) {
      expect(await authenticateAdminRequest(carrying(issued))).toEqual({ ok: false, error: 'unknown' })
    }
    const rows = await payload.db.pool.query(`SELECT id FROM sessions WHERE user_id = $1`, [Number(user)])
    expect(rows.rows).toHaveLength(0)
  })

  it('gives a browser carrying nothing an identifier to bind its code to', async () => {
    const { email } = await anAccount({ otpRequired: true })

    const answered = await handlePasswordStep(
      aPost({ path: PASSWORD_STEP_PATH, fields: { email, password: FIXTURE_PASSWORD }, ip: anIp() }),
    )

    expect(sessionCookieOf(answered)).not.toBeNull()
  })

  it('carries "keep me signed in" forward to the code step in a cookie of one bit', async () => {
    const { email } = await anAccount({ otpRequired: true })

    const answered = await handlePasswordStep(
      aPost({
        path: PASSWORD_STEP_PATH,
        fields: { email, password: FIXTURE_PASSWORD, keepSignedIn: 'on' },
        ip: anIp(),
      }),
    )

    expect(answered.headers.getSetCookie().join('\n')).toContain(`${KEEP_SIGNED_IN_COOKIE_NAME}=yes`)
  })

  it('leaves the cookie of a browser that already carries one alone', async () => {
    // Re-sending it would rewrite its `Max-Age` to the PRE-AUTH lifetime: a
    // signed-in reader who mistyped a password on this screen would have their
    // thirty-day cookie shortened to an hour, with the same identifier in it
    // and the row it names untouched - so nothing would look wrong until the
    // browser stopped sending it.
    const { email } = await anAccount({ otpRequired: true })
    const carried = newBrowserSession()

    const refused = await handlePasswordStep(
      aPost({
        path: PASSWORD_STEP_PATH,
        fields: { email, password: WRONG_PASSWORD },
        cookie: carrying(carried),
        ip: anIp(),
      }),
    )
    const accepted = await handlePasswordStep(
      aPost({
        path: PASSWORD_STEP_PATH,
        fields: { email, password: FIXTURE_PASSWORD },
        cookie: carrying(carried),
        ip: anIp(),
      }),
    )

    expect(sessionCookieOf(refused)).toBeNull()
    expect(sessionCookieOf(accepted)).toBeNull()
    // And the identifier is still the one the challenge was bound to, which is
    // what makes not re-sending it safe rather than merely quiet.
    expect(accepted.headers.get('Location')).toBe(CODE_STEP_PATH)
  })

  it('sends a body with no fields back to the sign-in screen', async () => {
    const answered = await handlePasswordStep(aPost({ path: PASSWORD_STEP_PATH, fields: null }))

    expect(answered.status).toBe(303)
    expect(answered.headers.get('Location')).toBe(PASSWORD_STEP_PATH)
  })

  it('sends a body that is not a form at all back to the sign-in screen too', async () => {
    const answered = await handlePasswordStep(
      new Request(`${ORIGIN}${PASSWORD_STEP_PATH}`, { method: 'POST', body: 'email=x' }),
    )

    expect(answered.status).toBe(303)
    expect(answered.headers.get('Location')).toBe(PASSWORD_STEP_PATH)
  })

  it('never puts the password anywhere in what it answers', async () => {
    const { email } = await anAccount({ otpRequired: false })

    const answered = await handlePasswordStep(
      aPost({ path: PASSWORD_STEP_PATH, fields: { email, password: FIXTURE_PASSWORD }, ip: anIp() }),
    )

    expect(JSON.stringify([...answered.headers.entries()])).not.toContain(FIXTURE_PASSWORD)
    expect(await answered.text()).toBe('')
  })

  it('never puts the address anywhere in what it answers', async () => {
    // CLAUDE.md §7: a `Location` carrying the address would write it into
    // every access log between here and the reader.
    const { email } = await anAccount({ otpRequired: false })

    const answered = await handlePasswordStep(
      aPost({ path: PASSWORD_STEP_PATH, fields: { email, password: FIXTURE_PASSWORD }, ip: anIp() }),
    )

    expect(JSON.stringify([...answered.headers.entries()])).not.toContain(email)
  })
})

describe('the three refusals the password step must not tell apart', () => {
  /** Posts a wrong password against `email` from a fresh requesting address. */
  const refuse = async (email: string): Promise<Response> =>
    handlePasswordStep(aPost({ path: PASSWORD_STEP_PATH, fields: { email, password: WRONG_PASSWORD }, ip: anIp() }))

  it('answers an unknown address and a wrong password with the identical response', async () => {
    const known = await anAccount({ otpRequired: false })

    const forUnknown = await refuse(anUnknownAddress())
    const forWrong = await refuse(known.email)

    expect(await responseShape(forUnknown)).toEqual(await responseShape(forWrong))
  })

  it('answers a locked account with that same response too', async () => {
    // Phase ruling F44's third arm, and the one that survives every other
    // measure: an attacker who cannot tell a wrong password from an unknown
    // address can still enumerate by spending five guesses per candidate and
    // watching for the one whose answer changes.
    const locked = await anAccount({ otpRequired: false })
    await payload.db.pool.query(`UPDATE users SET lock_until = $2 WHERE id = $1`, [
      Number(locked.user),
      new Date(Date.now() + 900_000),
    ])

    const forLocked = await refuse(locked.email)
    const forUnknown = await refuse(anUnknownAddress())

    expect(await responseShape(forLocked)).toEqual(await responseShape(forUnknown))
  })

  it('sends every one of them back to the sign-in screen with the same refusal state', async () => {
    // What the identical response actually IS, asserted once, so the case
    // above cannot be satisfied by two identical `500`s.
    const answered = await refuse(anUnknownAddress())

    expect(answered.status).toBe(303)
    expect(answered.headers.get('Location')).toBe(`${PASSWORD_STEP_PATH}?state=${PASSWORD_REFUSED_STATE}`)
  })

  it('answers an exhausted window with that same response too', async () => {
    // NOT one of `SECURITY.md`'s three, and asserted anyway: the module's
    // header claims ONE refusal branch, and without this case that claim is
    // unguarded - giving `'rate-limited'` its own `state` word passed every
    // other case in this block, which is how this one came to be written.
    // It also matters on its own terms: an attacker who can see their own
    // budget run out learns when to stop and start again from another address.
    const known = await anAccount({ otpRequired: false })
    const sharedIp = `${FIXTURE_IP_PREFIX}exhausted`
    const spend = async (): Promise<Response> =>
      handlePasswordStep(
        aPost({
          path: PASSWORD_STEP_PATH,
          fields: { email: anUnknownAddress(), password: WRONG_PASSWORD },
          ip: sharedIp,
        }),
      )

    let exhausted = await spend()
    for (let attempt = 0; attempt < IP_ATTEMPT_LIMIT + 2; attempt += 1) exhausted = await spend()

    // THE SENTINEL, and this case is worthless without it: a loop that spent
    // fewer attempts than the limit would compare two ordinary refusals and
    // pass with `'rate-limited'` answering anything at all. The limiter is
    // asked directly, so the window is known to be shut at the moment the
    // response above was produced.
    const limiter = createSignInRateLimiter({ payload })
    expect((await limiter.admitPasswordAttempt({ ip: sharedIp, email: anUnknownAddress() })).ok).toBe(false)

    expect(await responseShape(exhausted)).toEqual(await responseShape(await refuse(known.email)))
  })

  it('takes comparable time for an unknown address and a wrong password', async () => {
    // Task 5 measured 0.90 with the dummy derivation and 0.14 without it, at
    // the SERVICE. This measures the HANDLER, because the handler is what an
    // attacker can reach — the same claim one layer out, against the same
    // deliberately wide band (see `signIn.integration.test.ts` on why a tight
    // band flakes and is then deleted).
    //
    // EVERY SAMPLE IS FRESH IN EVERY DIMENSION. A repeated address exhausts
    // the window, and a repeated account locks after five wrong passwords;
    // either would put BOTH arms on the short path, at which point this case
    // passes with the derivation deleted.
    const accounts: FixtureAccount[] = []
    for (let sample = 0; sample < SAMPLES; sample += 1) accounts.push(await anAccount({ otpRequired: false }))

    const time = async (email: string): Promise<number> => {
      const started = performance.now()
      await refuse(email)
      return performance.now() - started
    }

    const unknown: number[] = []
    const wrong: number[] = []
    // Interleaved, so machine drift during the run cannot favour one arm.
    for (let sample = 0; sample < SAMPLES; sample += 1) {
      unknown.push(await time(anUnknownAddress()))
      const account = accounts[sample]
      if (account === undefined) throw new Error('the timing fixtures are short')
      wrong.push(await time(account.email))
    }

    const ratio = median(unknown) / median(wrong)
    expect(ratio).toBeGreaterThan(0.6)
    expect(ratio).toBeLessThan(1.6)
  })
})

describe('what the code step answers', () => {
  /** An account with a live challenge bound to a fresh browser identifier. */
  const aPendingSignIn = async (): Promise<{
    readonly user: UserId
    readonly session: string
    readonly code: string
  }> => {
    const { user } = await anAccount({ otpRequired: true })
    const session = newBrowserSession()
    const issued = await otp.issueChallenge(user, session, anIp())
    if (!issued.ok) throw new Error('the fixture challenge was not issued')
    return { user, session, code: readCodeFromOutbox(mailer) }
  }

  it('signs the reader in when the code is the one that was sent', async () => {
    const { user, session, code } = await aPendingSignIn()

    const answered = await handleCodeStep(
      aPost({ path: CODE_STEP_PATH, fields: { code }, cookie: carrying(session) }),
    )

    expect(answered.status).toBe(303)
    expect(answered.headers.get('Location')).toBe(SIGNED_IN_PATH)
    const issued = issuedSessionOf(answered)
    if (issued === null) throw new Error('the response set no session cookie')
    expect(await authenticateAdminRequest(carrying(issued))).toEqual({ ok: true, value: { user } })
  })

  it('rotates away from the identifier the code was bound to', async () => {
    const { session, code } = await aPendingSignIn()

    const answered = await handleCodeStep(
      aPost({ path: CODE_STEP_PATH, fields: { code }, cookie: carrying(session) }),
    )

    expect(issuedSessionOf(answered)).not.toBe(session)
    expect(await authenticateAdminRequest(carrying(session))).toEqual({ ok: false, error: 'unknown' })
  })

  it('honours the "keep me signed in" the password step carried forward', async () => {
    const { user, session, code } = await aPendingSignIn()
    const startedAt = Date.now()

    await handleCodeStep(
      aPost({
        path: CODE_STEP_PATH,
        fields: { code },
        cookie: `${carrying(session)}; ${KEEP_SIGNED_IN_COOKIE_NAME}=yes`,
      }),
    )

    expect(await issuedLifetimeMs(user, startedAt)).toBeGreaterThan(REMEMBERED_SESSION_LIFETIME_MS - LIFETIME_SLACK_MS)
  })

  it('gives the ordinary lifetime when nothing was carried forward', async () => {
    // What makes the case above about the COOKIE rather than about the code
    // step issuing a session at all.
    const { user, session, code } = await aPendingSignIn()
    const startedAt = Date.now()

    await handleCodeStep(aPost({ path: CODE_STEP_PATH, fields: { code }, cookie: carrying(session) }))

    const lifetime = await issuedLifetimeMs(user, startedAt)
    expect(lifetime).toBeGreaterThan(SESSION_LIFETIME_MS - LIFETIME_SLACK_MS)
    expect(lifetime).toBeLessThan(SESSION_LIFETIME_MS + LIFETIME_SLACK_MS)
  })

  it('takes the carried answer away once it has been spent', async () => {
    const { session, code } = await aPendingSignIn()

    const answered = await handleCodeStep(
      aPost({
        path: CODE_STEP_PATH,
        fields: { code },
        cookie: `${carrying(session)}; ${KEEP_SIGNED_IN_COOKIE_NAME}=yes`,
      }),
    )

    expect(answered.headers.getSetCookie().join('\n')).toContain(`${KEEP_SIGNED_IN_COOKIE_NAME}=; Path=/admin; Max-Age=0`)
  })

  it('refuses a wrong code and issues nothing', async () => {
    const { user, session, code } = await aPendingSignIn()
    const wrongCode = code === '000000' ? '111111' : '000000'

    const answered = await handleCodeStep(
      aPost({ path: CODE_STEP_PATH, fields: { code: wrongCode }, cookie: carrying(session) }),
    )

    expect(answered.status).toBe(303)
    expect(answered.headers.get('Location')).toBe(CODE_STEP_PATH)
    expect(issuedSessionOf(answered)).toBeNull()
    const rows = await payload.db.pool.query(`SELECT id FROM sessions WHERE user_id = $1`, [Number(user)])
    expect(rows.rows).toHaveLength(0)
  })

  it('refuses a code offered by a browser the challenge was not issued to', async () => {
    // `SECURITY.md`: a code issued for one browser cannot be redeemed in
    // another. The code is right; the identifier is somebody else's.
    const { code } = await aPendingSignIn()

    const answered = await handleCodeStep(
      aPost({ path: CODE_STEP_PATH, fields: { code }, cookie: carrying(newBrowserSession()) }),
    )

    expect(answered.headers.get('Location')).toBe(CODE_STEP_PATH)
    expect(issuedSessionOf(answered)).toBeNull()
  })

  it('sends a browser carrying no identifier at all back to the password step', async () => {
    // There can be no challenge bound to a browser that has none, so the
    // useful answer is the step where a sign-in actually starts.
    const answered = await handleCodeStep(aPost({ path: CODE_STEP_PATH, fields: { code: '123456' } }))

    expect(answered.status).toBe(303)
    expect(answered.headers.get('Location')).toBe(PASSWORD_STEP_PATH)
  })

  it('sends a body with no code in it back to the code step', async () => {
    const { session } = await aPendingSignIn()

    const answered = await handleCodeStep(aPost({ path: CODE_STEP_PATH, fields: null, cookie: carrying(session) }))

    expect(answered.status).toBe(303)
    expect(answered.headers.get('Location')).toBe(CODE_STEP_PATH)
  })

  it('never puts the code anywhere in what it answers', async () => {
    const { session, code } = await aPendingSignIn()

    const answered = await handleCodeStep(
      aPost({ path: CODE_STEP_PATH, fields: { code }, cookie: carrying(session) }),
    )

    expect(JSON.stringify([...answered.headers.entries()])).not.toContain(code)
    expect(await answered.text()).toBe('')
  })
})

describe('what signing out answers', () => {
  /** A browser holding a live session. */
  const aSignedInBrowser = async (): Promise<{ readonly user: UserId; readonly session: string }> => {
    const { user } = await anAccount({ otpRequired: false })
    const started = await sessions.startSession({
      user,
      previous: null,
      keepSignedIn: false,
      device: null,
      location: null,
    })
    if (!started.ok) throw new Error('the fixture session was not issued')
    return { user, session: started.value.session }
  }

  it('sends the reader back to the sign-in screen', async () => {
    const { session } = await aSignedInBrowser()

    const answered = await handleSignOut(aPost({ path: '/admin/sign-out', fields: {}, cookie: carrying(session) }))

    expect(answered.status).toBe(303)
    expect(answered.headers.get('Location')).toBe(PASSWORD_STEP_PATH)
  })

  it('stops the session it revoked from authenticating anything else', async () => {
    // The assertion that matters: clearing the cookie alone would leave a
    // stolen copy of the identifier working for the rest of its lifetime.
    const { session } = await aSignedInBrowser()

    await handleSignOut(aPost({ path: '/admin/sign-out', fields: {}, cookie: carrying(session) }))

    expect(await authenticateAdminRequest(carrying(session))).toEqual({ ok: false, error: 'revoked' })
  })

  it('takes the cookie away as well, so the browser stops sending a dead identifier', async () => {
    const { session } = await aSignedInBrowser()

    const answered = await handleSignOut(aPost({ path: '/admin/sign-out', fields: {}, cookie: carrying(session) }))

    expect(answered.headers.getSetCookie().join('\n')).toContain(`${SESSION_COOKIE_NAME}=; Path=/admin; Max-Age=0`)
  })

  it('revokes nothing at all when the request carries no session', async () => {
    const answered = await handleSignOut(aPost({ path: '/admin/sign-out', fields: {} }))

    expect(answered.status).toBe(303)
    expect(answered.headers.get('Location')).toBe(PASSWORD_STEP_PATH)
  })

  it('leaves somebody else’s session alone when the identifier is not this browser’s', async () => {
    // The guard runs before the revoke, so an unauthenticated request cannot
    // reach `revokeSession` at all — and `revokeSession` itself matches on the
    // owner, so neither half will take a session away from its owner.
    const owner = await aSignedInBrowser()

    await handleSignOut(aPost({ path: '/admin/sign-out', fields: {}, cookie: carrying(newBrowserSession()) }))

    expect(await authenticateAdminRequest(carrying(owner.session))).toEqual({
      ok: true,
      value: { user: owner.user },
    })
  })
})
