/**
 * newPasswordScreen.integration.test.ts — the server side of the screen the
 * mailed link lands on: what a `GET` of it is told, and what a `POST` to it
 * answers.
 *
 * Integration test (CLAUDE.md §2), against a real Payload and a real Postgres.
 * Both halves are HTTP-shaped rather than Next-shaped — `readNewPasswordScreen`
 * takes two strings and `handleSetNewPassword` takes a `Request` and answers a
 * `Response` — so this file exercises the whole of what the two route files
 * contain, which is why those files hold nothing but a call to each of them.
 *
 * THE TOKENS ARE READ OUT OF THE MAILER'S OUTBOX, never out of the database,
 * for the reason `setNewPassword.integration.test.ts` gives at length.
 *
 * EVERY REDIRECT IS ASSERTED BY ITS STATUS AND ITS `Location` TOGETHER. A case
 * that checked only the location would pass on a `200` carrying a header
 * nothing follows, and a case that checked only the status would pass on a
 * redirect to the wrong screen.
 *
 * Uses `getTestPayload()` for its fixtures. The two functions under test call
 * `getPayload()` themselves — a route handler has nothing to inject through —
 * and reach the same `diary_test` database, because `vitest.integration.config.ts`
 * sets `DATABASE_URL` for the whole process. `readSignInScreen.integration.test.ts`
 * makes the same pairing for the same reason.
 * Depends on: vitest, ./newPasswordScreen, ./passwordReset, ./rateLimit,
 * ./resetPath, ../adapters/console-mailer, ../testPayload.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createConsoleMailer } from '../adapters/console-mailer'
import { getTestPayload } from '../testPayload'
import { handleSetNewPassword, readNewPasswordScreen } from './newPasswordScreen'
import { createPasswordResetService } from './passwordReset'
import { createSignInRateLimiter } from './rateLimit'
import { RESET_PATH } from './resetPath'

/** Every fixture address here belongs to this domain, so `afterAll` can find them. */
const FIXTURE_EMAIL_DOMAIN = 'new-password-screen-fixture.example'

/** The requesting addresses this file spends limiter budget under (RFC 3849). */
const FIXTURE_IP_PREFIX = '2001:db8:1::'

/** The password every fixture account is created with. */
const ORIGINAL_PASSWORD = 'the-one-this-account-was-created-with'

/** The password a successful post sets. */
const REPLACEMENT_PASSWORD = 'the-one-the-screen-set-instead'

/** The origin the reset service is told to build links against. */
const ADMIN_ORIGIN = 'https://diary.example'

/** A token of the right shape that names no account at all. */
const UNKNOWN_TOKEN = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef'

/** What the endpoint is asked at. Only its shape matters to `handleSetNewPassword`. */
const ENDPOINT = 'http://localhost:3000/admin/reset/set'

/**
 * The `digest` Next.js puts on the error `notFound()` throws.
 *
 * Asserted rather than the error's class, because the class is `Error`: the
 * digest is the whole of what distinguishes a 404 from any other rejection,
 * and it is the value Next's own router reads to decide the status.
 */
const NOT_FOUND_DIGEST = 'NEXT_HTTP_ERROR_FALLBACK;404'

/** Distinguishes one fixture from the next within a single run. */
let fixtureCount = 0

/** The shared test Payload instance, assigned by `beforeAll`. */
let payload: Awaited<ReturnType<typeof getTestPayload>>

/** The reset service that mints the links this file follows. */
let requestReset: ReturnType<typeof createPasswordResetService>

/** The mailer those links are read back out of. */
let mailer: ReturnType<typeof createConsoleMailer>

/**
 * A digit-free label, derived from a counter.
 * @param count - The fixture's ordinal within this run.
 * @returns Two lowercase letters, unique for the first 676 fixtures.
 */
const alphabeticLabel = (count: number): string =>
  String.fromCharCode(97 + Math.floor(count / 26)) + String.fromCharCode(97 + (count % 26))

/**
 * A fresh account with a known password.
 * @returns The account's address.
 */
const aReader = async (): Promise<string> => {
  fixtureCount += 1
  const email = `reader-${alphabeticLabel(fixtureCount)}@${FIXTURE_EMAIL_DOMAIN}`
  await payload.create({ collection: 'users', data: { email, password: ORIGINAL_PASSWORD } })
  return email
}

/**
 * A requesting address no other case in this run is using.
 * @returns An address unique within this run.
 */
const anIp = (): string => `${FIXTURE_IP_PREFIX}${alphabeticLabel(fixtureCount)}`

/**
 * The reset token out of the most recent message, taken from the link.
 * @returns The token.
 * @throws If nothing was sent, or the last message carries no reset link.
 */
const readTokenFromOutbox = (): string => {
  const last = mailer.sent.at(-1)
  if (last === undefined) throw new Error('nothing was sent')
  const match = new RegExp(`${RESET_PATH}/([0-9a-f]+)\\b`, 'u').exec(last.text)
  const token = match?.[1]
  if (token === undefined) throw new Error('no reset link in the message body')
  return token
}

/**
 * A live link for a fresh account.
 * @returns The account's address and the token mailed to it.
 */
const aMailedLink = async (): Promise<{ readonly email: string; readonly token: string }> => {
  const email = await aReader()
  await requestReset.requestPasswordReset({ email, ip: anIp() })
  return { email, token: readTokenFromOutbox() }
}

/**
 * Posts a form body to the endpoint the way a browser would.
 * @param fields - The form fields to send, or `null` for a body with none.
 * @returns The handler's own response.
 */
const post = async (fields: Record<string, string> | null): Promise<Response> => {
  const body = new FormData()
  for (const [name, value] of Object.entries(fields ?? {})) body.set(name, value)
  return handleSetNewPassword(new Request(ENDPOINT, { method: 'POST', body }))
}

/**
 * Offers a password and reports whether Payload accepted it.
 * @param email - The account to sign in as.
 * @param password - The password to offer.
 * @returns Whether the login succeeded.
 */
const signInSucceeds = async (email: string, password: string): Promise<boolean> => {
  try {
    await payload.login({ collection: 'users', data: { email, password } })
    return true
  } catch {
    return false
  }
}

/** Deletes every row this file wrote. */
const removeFixtures = async (): Promise<void> => {
  await payload.db.pool.query(`DELETE FROM sign_in_attempts WHERE subject LIKE $1`, [`${FIXTURE_IP_PREFIX}%`])
  const accounts = await payload.find({
    collection: 'users',
    where: { email: { like: FIXTURE_EMAIL_DOMAIN } },
    limit: 500,
    depth: 0,
  })
  for (const account of accounts.docs) {
    await payload.delete({ collection: 'users', id: account.id })
  }
}

beforeAll(async () => {
  payload = await getTestPayload()
  mailer = createConsoleMailer({ isDevelopment: false })
  requestReset = createPasswordResetService({
    payload,
    mailer,
    limiter: createSignInRateLimiter({ payload }),
    adminOrigin: ADMIN_ORIGIN,
  })
  await removeFixtures()
})

afterAll(async () => {
  await removeFixtures()
})

describe('what a GET of the screen is told', () => {
  it('draws the form for a link that has just been mailed', async () => {
    const { token } = await aMailedLink()

    expect(await readNewPasswordScreen({ token, state: undefined })).toBe('form')
  })

  it('draws the expired state for a link that names nothing', async () => {
    expect(await readNewPasswordScreen({ token: UNKNOWN_TOKEN, state: undefined })).toBe('expired')
  })

  it('draws the expired state for a link that has already been spent', async () => {
    const { token } = await aMailedLink()
    await post({ token, password: REPLACEMENT_PASSWORD })

    expect(await readNewPasswordScreen({ token, state: undefined })).toBe('expired')
  })

  it('carries the endpoint’s refusal back onto the form', async () => {
    const { token } = await aMailedLink()

    expect(await readNewPasswordScreen({ token, state: 'rejected' })).toBe('rejected')
  })

  it('refuses to draw the form for a spent link, whatever the address bar asks', async () => {
    expect(await readNewPasswordScreen({ token: UNKNOWN_TOKEN, state: 'rejected' })).toBe('expired')
  })

  it('404s on every reserved segment rather than reading one as a token', async () => {
    // Ruling F56. `[token]` sits directly above the two addresses this surface
    // names under `/admin/reset/`, so before the reservation `request` was a
    // valid token spelling and "Send the link" answered 200 with "That link
    // has expired" - a screen telling the reader that a link they never asked
    // for is dead. BOTH words are asserted, not just the one the defect was
    // about: `set` is shielded today only by Next.js resolving a static
    // segment first, which is a property of a route that exists.
    // The digest is Next's own contract for `notFound()`, and it is what
    // makes the route answer 404 rather than draw anything at all.
    await expect(readNewPasswordScreen({ token: 'request', state: undefined })).rejects.toMatchObject({
      digest: NOT_FOUND_DIGEST,
    })
    await expect(readNewPasswordScreen({ token: 'set', state: undefined })).rejects.toMatchObject({
      digest: NOT_FOUND_DIGEST,
    })
  })

  it('draws the expired state for the near neighbour of every reserved segment', async () => {
    // What proves the case above is about the RESERVATION and not about "any
    // token that is not hexadecimal": each of these reaches Payload, is
    // refused there, and gets a screen rather than a 404. One per reserved
    // word, because a reservation that behaved as a prefix would cost a real
    // reader their link.
    expect(await readNewPasswordScreen({ token: 'requests', state: undefined })).toBe('expired')
    expect(await readNewPasswordScreen({ token: 'sets', state: undefined })).toBe('expired')
    expect(await readNewPasswordScreen({ token: UNKNOWN_TOKEN, state: undefined })).toBe('expired')
  })
})

describe('what a POST to the screen answers', () => {
  it('sends the reader to the sign-in screen once the password is set', async () => {
    const { email, token } = await aMailedLink()

    const answered = await post({ token, password: REPLACEMENT_PASSWORD })

    expect(answered.status).toBe(303)
    expect(answered.headers.get('Location')).toBe('/admin/sign-in')
    expect(await signInSucceeds(email, REPLACEMENT_PASSWORD)).toBe(true)
  })

  it('sends them back to the same link, saying the password was refused', async () => {
    const { token } = await aMailedLink()

    const answered = await post({ token, password: '' })

    expect(answered.status).toBe(303)
    expect(answered.headers.get('Location')).toBe(`${RESET_PATH}/${token}?state=rejected`)
  })

  it('leaves a refused password unset, so the old one still signs them in', async () => {
    const { email, token } = await aMailedLink()

    await post({ token, password: '' })

    expect(await signInSucceeds(email, ORIGINAL_PASSWORD)).toBe(true)
  })

  it('sends them back to the same link with nothing to say when the link is dead', async () => {
    // No `state` at all: the screen's own read of the link is what draws the
    // expired state, so there is no second spelling of "expired" to disagree
    // with it.
    const answered = await post({ token: UNKNOWN_TOKEN, password: REPLACEMENT_PASSWORD })

    expect(answered.status).toBe(303)
    expect(answered.headers.get('Location')).toBe(`${RESET_PATH}/${UNKNOWN_TOKEN}`)
  })

  it('sends a body with no fields in it back to the reset form', async () => {
    const answered = await post(null)

    expect(answered.status).toBe(303)
    expect(answered.headers.get('Location')).toBe(RESET_PATH)
  })

  it('sends a body that is not a form at all back to the reset form too', async () => {
    // A TRUST BOUNDARY, and it answered 500 with an empty body until the Task
    // 9 re-review probed it: `Request.formData()` THROWS for a content type it
    // cannot parse, so Zod never saw the submission and nothing caught the
    // throw (CLAUDE.md §3.1). This route is mounted and reachable today.
    const answered = await handleSetNewPassword(
      new Request(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'a', password: 'b' }),
      }),
    )

    expect(answered.status).toBe(303)
    expect(answered.headers.get('Location')).toBe(RESET_PATH)
  })

  it('sends a body with no content type at all back to the reset form', async () => {
    // The shape the re-review actually probed: a `POST` carrying bytes and no
    // `Content-Type` header. It is what a hand-rolled request, a misconfigured
    // client or a scan sends, and it reached the same throw.
    const answered = await handleSetNewPassword(new Request(ENDPOINT, { method: 'POST', body: 'token=a' }))

    expect(answered.status).toBe(303)
    expect(answered.headers.get('Location')).toBe(RESET_PATH)
  })

  it('answers 303, so the browser follows it with a GET and a reload posts nothing', async () => {
    // 302 would let a browser repeat the POST, and this one spends a link.
    const { token } = await aMailedLink()

    expect((await post({ token, password: REPLACEMENT_PASSWORD })).status).toBe(303)
  })

  it('never puts the password anywhere in what it answers', async () => {
    // CLAUDE.md §7: a `Location` carrying the password would write it into
    // every access log between here and the reader.
    const { token } = await aMailedLink()

    const answered = await post({ token, password: REPLACEMENT_PASSWORD })

    expect(answered.headers.get('Location')).not.toContain(REPLACEMENT_PASSWORD)
    expect(await answered.text()).toBe('')
  })

  it('percent-encodes what it puts back in the address, so a crafted token cannot break out', async () => {
    const answered = await post({ token: 'not a token?with=parts', password: REPLACEMENT_PASSWORD })

    expect(answered.headers.get('Location')).toBe(`${RESET_PATH}/not%20a%20token%3Fwith%3Dparts`)
  })
})
