/**
 * readCodeScreen.integration.test.ts — what `/admin/sign-in/code` prints for
 * the browser in front of it.
 *
 * Integration test (CLAUDE.md §2), against a real Payload and a real Postgres.
 * Every claim here is a claim about an `otpChallenges` row: that the masked
 * address is the account's, that the countdown's origin is when the code was
 * ISSUED rather than when the page was drawn, and that the attempts counter is
 * the server's own. A mocked store would answer all three by agreeing with the
 * mock — and the three values it replaced were a fixed bullet run, `Date.now()`
 * and a hard-coded zero (`docs/deviations.md` §33), each of which any mock
 * would also have produced.
 *
 * THE PLACEHOLDER CASES ARE NOT FILLER. A reader who types the address, or
 * whose code has expired, must get the screen rather than a refusal: refusing
 * would make this route an oracle for whether a given browser holds a live
 * challenge, which is what `verifyChallenge`'s single `'invalid'` refusal
 * spends three statements to withhold. They also pin the three
 * `admin-sign-in-code-*` visual baselines, which are taken in exactly that
 * state.
 *
 * Depends on: vitest, @travel-diary/domain, ./browserSession, ./otpService,
 * ./readCodeScreen, ./testing/otpProbes, ../adapters/console-mailer,
 * ../testPayload.
 */
import { maskEmail } from '@travel-diary/domain/auth/mask'
import { MAX_ATTEMPTS } from '@travel-diary/domain/auth/otpChallenge'
import { SESSION_COOKIE_NAME } from '@travel-diary/domain/auth/session'
import type { SessionId, UserId } from '@travel-diary/domain/ids'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createConsoleMailer } from '../adapters/console-mailer'
import { getTestPayload } from '../testPayload'
import { newBrowserSession } from './browserSession'
import { createOtpService } from './otpService'
import { NO_PENDING_ADDRESS, readCodeScreen } from './readCodeScreen'
import { readCodeFromOutbox } from './testing/otpProbes'

/** Every fixture address here belongs to this domain, so `afterAll` can find them. */
const FIXTURE_EMAIL_DOMAIN = 'code-screen-fixture.example'

/** The requesting address this file records challenges under (RFC 3849). */
const FIXTURE_IP = '2001:db8:c::1'

/** The password every fixture account is created with. Never offered to anything. */
const FIXTURE_PASSWORD = 'the-one-this-account-was-created-with'

/** An instant the placeholder's countdown is pinned to. */
const RENDERED_AT = Date.parse('2026-09-06T09:00:00.000Z')

/** Distinguishes one fixture from the next within a single run. */
let fixtureCount = 0

/** The shared test Payload instance, assigned by `beforeAll`. */
let payload: Awaited<ReturnType<typeof getTestPayload>>

/** The OTP service this file issues readable challenges with. */
let otp: ReturnType<typeof createOtpService>

/** The mailer those codes are read back out of. */
let mailer: ReturnType<typeof createConsoleMailer>

/**
 * A digit-free label, derived from a counter.
 * @param count - The fixture's ordinal within this run.
 * @returns Two lowercase letters, unique for the first 676 fixtures.
 */
const alphabeticLabel = (count: number): string =>
  String.fromCharCode(97 + Math.floor(count / 26)) + String.fromCharCode(97 + (count % 26))

/**
 * A fresh account.
 * @returns Its branded id and its address.
 */
const anAccount = async (): Promise<{ readonly user: UserId; readonly email: string }> => {
  fixtureCount += 1
  const email = `reader-${alphabeticLabel(fixtureCount)}@${FIXTURE_EMAIL_DOMAIN}`
  const created = await payload.create({ collection: 'users', data: { email, password: FIXTURE_PASSWORD } })
  return { user: String(created.id) as UserId, email }
}

/** The `Cookie` header a browser carrying `session` would send. */
const carrying = (session: string): string => `td-reading-surface=book; ${SESSION_COOKIE_NAME}=${session}`

/** An account with a live challenge bound to a fresh browser identifier. */
const aBrowserAwaitingACode = async (): Promise<{
  readonly user: UserId
  readonly email: string
  readonly session: SessionId
}> => {
  const { user, email } = await anAccount()
  const session = newBrowserSession()
  const issued = await otp.issueChallenge(user, session, FIXTURE_IP)
  if (!issued.ok) throw new Error('the fixture challenge was not issued')
  return { user, email, session }
}

/** Deletes every row this file wrote. */
const removeFixtures = async (): Promise<void> => {
  const accounts = await payload.find({
    collection: 'users',
    where: { email: { like: FIXTURE_EMAIL_DOMAIN } },
    limit: 500,
    depth: 0,
  })
  for (const account of accounts.docs) {
    await payload.db.pool.query(`DELETE FROM otp_challenges WHERE user_id = $1`, [account.id])
    await payload.delete({ collection: 'users', id: account.id })
  }
}

beforeAll(async () => {
  payload = await getTestPayload()
  mailer = createConsoleMailer({ isDevelopment: false })
  otp = createOtpService({ payload, mailer, now: Date.now })
  await removeFixtures()
})

afterAll(async () => {
  await removeFixtures()
})

describe('what the code screen is told when a challenge is live', () => {
  it('prints the address the code actually went to, masked', async () => {
    const { email, session } = await aBrowserAwaitingACode()

    const content = await readCodeScreen(carrying(session), RENDERED_AT)

    expect(content.maskedAddress).toBe(maskEmail(email))
    expect(content.maskedAddress).not.toBe(NO_PENDING_ADDRESS)
  })

  it('never prints a whole address, whatever the account is called', async () => {
    // CLAUDE.md §7. What this returns is rendered into a page.
    const { email, session } = await aBrowserAwaitingACode()

    const content = await readCodeScreen(carrying(session), RENDERED_AT)

    expect(content.maskedAddress).not.toContain(email)
    expect(JSON.stringify(content)).not.toContain(email)
  })

  it('counts the countdown from when the code was issued, not from when the page was drawn', async () => {
    // The defect this replaced: `issuedAt` was `Date.now()` at render, so a
    // reader who reloaded saw the five minutes start again — and in a
    // production build, where the route was static, it was the BUILD's clock.
    const { session } = await aBrowserAwaitingACode()
    const before = Date.now()

    const content = await readCodeScreen(carrying(session), RENDERED_AT)

    expect(content.issuedAt).not.toBe(RENDERED_AT)
    expect(content.issuedAt).toBeGreaterThanOrEqual(before - 5_000)
    expect(content.issuedAt).toBeLessThanOrEqual(Date.now() + 1_000)
  })

  it('shows the guesses the server has spent, not a zero', async () => {
    const { session } = await aBrowserAwaitingACode()
    const code = readCodeFromOutbox(mailer)
    await otp.verifyChallenge(session, code === '000000' ? '111111' : '000000')

    expect((await readCodeScreen(carrying(session), RENDERED_AT)).attemptsSpent).toBe(1)
  })

  it('keeps the address, the counter and the issue instant once every guess is gone', async () => {
    // THIS CASE HAS BEEN WRONG TWICE, and the second time it was wrong it
    // ratified a defect a reader could see. It first asserted a clamp that
    // could not fire (`attemptsSpent <= MAX_ATTEMPTS`, which reduced to
    // `0 <= 3`). It was then rewritten to assert the placeholder — and the
    // placeholder is the defect: the screen forgot the address the reader had
    // been told to check, reset the counter to zero, and took the render
    // instant as the issue instant, which restarted both countdowns on every
    // reload (SIGNIN-001 and SIGNIN-002, docs/qa/2026-09-07-sign-in-sweep.md).
    //
    // What the screen owes a reader who has spent all three guesses is the
    // truth: the same masked address, `3 of 3 tried` — which is what makes
    // `CodeStep`'s "Three wrong codes" message reachable at all — and the
    // instant the code was really issued, so the resend cooldown counts down
    // to a button that works.
    const { email, session } = await aBrowserAwaitingACode()
    const code = readCodeFromOutbox(mailer)
    const wrong = code === '000000' ? '111111' : '000000'
    const issuedBefore = Date.now()
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) await otp.verifyChallenge(session, wrong)

    const content = await readCodeScreen(carrying(session), RENDERED_AT)

    expect(content.maskedAddress).toBe(maskEmail(email))
    expect(content.attemptsSpent).toBe(MAX_ATTEMPTS)
    // Not the render instant, and not a fabricated one: the row's own.
    expect(content.issuedAt).not.toBe(RENDERED_AT)
    expect(content.issuedAt).toBeLessThanOrEqual(issuedBefore)
  })
})

describe('what it is told when there is no live challenge', () => {
  it('draws the placeholder for a browser carrying no identifier at all', async () => {
    const content = await readCodeScreen(null, RENDERED_AT)

    expect(content).toEqual({ maskedAddress: NO_PENDING_ADDRESS, issuedAt: RENDERED_AT, attemptsSpent: 0 })
  })

  it('draws it for a browser carrying an identifier nothing was issued to', async () => {
    const content = await readCodeScreen(carrying(newBrowserSession()), RENDERED_AT)

    expect(content).toEqual({ maskedAddress: NO_PENDING_ADDRESS, issuedAt: RENDERED_AT, attemptsSpent: 0 })
  })

  it('draws it once the challenge has been spent', async () => {
    const { session } = await aBrowserAwaitingACode()
    await otp.verifyChallenge(session, readCodeFromOutbox(mailer))

    expect((await readCodeScreen(carrying(session), RENDERED_AT)).maskedAddress).toBe(NO_PENDING_ADDRESS)
  })

  it('echoes nothing at all in that placeholder', () => {
    // `maskEmail('')`'s own fallback — three bullets, no part of any address.
    // It is what makes drawing the screen safer than refusing it.
    expect(NO_PENDING_ADDRESS).toBe('•••')
  })
})
