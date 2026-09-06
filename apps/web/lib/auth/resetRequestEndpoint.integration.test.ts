/**
 * resetRequestEndpoint.integration.test.ts — what `/admin/reset/request`
 * answers to each verb.
 *
 * Integration test (CLAUDE.md §2), against a real Payload and a real Postgres.
 * The claim that matters — that a real address and an invented one get the
 * same answer — is a claim about a `users` table with one of the two rows
 * actually in it, and a mocked store would make both arms whatever the mock
 * said.
 *
 * ═══ THE `GET` CASE IS NOT A FORMALITY ═══
 *
 * `/admin/reset/request` sits beside `app/(admin)/admin/reset/[token]`, which
 * matches ANY single segment. Before ruling F56's reservation, a `GET` of this
 * address answered `200` with "That link has expired" — a screen telling the
 * reader a link they had never asked for was dead. The reservation restored
 * the `404`; mounting a real `POST` route here is what the reservation was
 * making room for, and the `404` has to survive the mounting. That is what the
 * first block asserts, by the digest Next's own router reads.
 *
 * Uses `getTestPayload()` for its fixtures; the handler calls `getPayload()`
 * itself and reaches the same `diary_test` database because
 * `vitest.integration.config.ts` sets `DATABASE_URL` for the whole process.
 * Depends on: vitest, @travel-diary/domain/auth/mask, ./resetPath,
 * ./resetRequestEndpoint, ../testPayload.
 */
import { maskEmail } from '@travel-diary/domain/auth/mask'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getTestPayload } from '../testPayload'
import { RESET_PATH } from './resetPath'
import { handleResetRequest, readResetRequestRoute } from './resetRequestEndpoint'

/** Every fixture address here belongs to this domain, so `afterAll` can find them. */
const FIXTURE_EMAIL_DOMAIN = 'reset-request-fixture.example'

/** The requesting addresses this file spends limiter budget under (RFC 3849). */
const FIXTURE_IP_PREFIX = '2001:db8:b::'

/** The password every fixture account is created with. */
const FIXTURE_PASSWORD = 'the-one-this-account-was-created-with'

/** Where these requests are addressed. */
const ENDPOINT = `http://localhost:3000${RESET_PATH}/request`

/**
 * The `digest` Next.js puts on the error `notFound()` throws.
 *
 * Asserted rather than the error's class, because the class is `Error`: the
 * digest is the whole of what distinguishes a 404 from any other rejection,
 * and it is the value Next's own router reads to decide the status. The same
 * assertion `newPasswordScreen.integration.test.ts` makes for the same reason.
 */
const NOT_FOUND_DIGEST = 'NEXT_HTTP_ERROR_FALLBACK;404'

/** Distinguishes one fixture from the next within a single run. */
let fixtureCount = 0

/** The shared test Payload instance, assigned by `beforeAll`. */
let payload: Awaited<ReturnType<typeof getTestPayload>>

/**
 * A digit-free label, derived from a counter.
 * @param count - The fixture's ordinal within this run.
 * @returns Two lowercase letters, unique for the first 676 fixtures.
 */
const alphabeticLabel = (count: number): string =>
  String.fromCharCode(97 + Math.floor(count / 26)) + String.fromCharCode(97 + (count % 26))

/**
 * A fresh account.
 * @returns The account's address.
 */
const aReader = async (): Promise<string> => {
  fixtureCount += 1
  const email = `reader-${alphabeticLabel(fixtureCount)}@${FIXTURE_EMAIL_DOMAIN}`
  await payload.create({ collection: 'users', data: { email, password: FIXTURE_PASSWORD } })
  return email
}

/** An address of the fixture domain that names no account at all. */
const anUnknownAddress = (): string => {
  fixtureCount += 1
  return `nobody-${alphabeticLabel(fixtureCount)}@${FIXTURE_EMAIL_DOMAIN}`
}

/** A requesting address no other case in this run is using. */
const anIp = (): string => `${FIXTURE_IP_PREFIX}${alphabeticLabel(fixtureCount)}`

/**
 * Posts a form body the way a browser would.
 * @param fields - The form fields, or `null` for a body with none.
 * @returns The handler's own response.
 */
const post = async (fields: Record<string, string> | null): Promise<Response> => {
  const body = new FormData()
  for (const [name, value] of Object.entries(fields ?? {})) body.set(name, value)
  return handleResetRequest(new Request(ENDPOINT, { method: 'POST', body, headers: { 'x-forwarded-for': anIp() } }))
}

/** Everything about a response an attacker can observe, except its timing. */
const responseShape = async (response: Response): Promise<unknown> => ({
  status: response.status,
  headers: [...response.headers.entries()].sort(([left], [right]) => left.localeCompare(right)),
  body: await response.text(),
})

/** Whether Payload has minted a reset token for an address. */
const hasResetToken = async (email: string): Promise<boolean> => {
  const found = await payload.db.pool.query<{ reset_password_token: string | null }>(
    `SELECT reset_password_token FROM users WHERE email = $1 LIMIT 1`,
    [email],
  )
  return (found.rows[0]?.reset_password_token ?? null) !== null
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
  await removeFixtures()
})

afterAll(async () => {
  await removeFixtures()
})

describe('what a GET of this address answers', () => {
  it('404s, exactly as it did before a POST route was mounted here', () => {
    // Ruling F56, held from the other side: the reservation in
    // `RESERVED_RESET_SEGMENTS` kept `[token]` from answering here, and this
    // route now answers instead — so the 404 has to be this route's, not the
    // reservation's, or mounting it silently turned a 404 into a 405.
    // The digest is Next's own contract for `notFound()`, and it is the value
    // its router reads to decide the status - asserted rather than the error's
    // class, which is a plain `Error`.
    expect(readResetRequestRoute).toThrowError(expect.objectContaining({ digest: NOT_FOUND_DIGEST }) as Error)
  })
})

describe('what a POST of this address answers', () => {
  it('tells the reader where the link went, masked', async () => {
    const email = await aReader()

    const answered = await post({ email })

    expect(answered.status).toBe(303)
    expect(answered.headers.get('Location')).toBe(`${RESET_PATH}?sent=${encodeURIComponent(maskEmail(email))}`)
  })

  it('actually mints a link, rather than only saying it did', async () => {
    const email = await aReader()

    await post({ email })

    expect(await hasResetToken(email)).toBe(true)
  })

  it('answers an address that names nobody exactly as it answers one that does', async () => {
    // `SECURITY.md` §3: "The reset endpoint must respond identically whether or
    // not the address exists." The two addresses are chosen to MASK TO THE SAME
    // STRING — same first two characters, same domain — so the whole response
    // is comparable rather than only its shape. That is possible because the
    // mask is derived from what was SUBMITTED and never from a row, which is
    // the property this case is really pinning: an implementation that masked a
    // found row's address would answer differently the moment the two spellings
    // differed. `passwordReset.integration.test.ts` compares the same pair at
    // the service; this compares the whole HTTP response.
    const known = await aReader()
    const unknown = anUnknownAddress().replace(/^nobody-/u, 'reader-x')
    expect(maskEmail(unknown)).toBe(maskEmail(known))

    const forKnown = await post({ email: known })
    const forUnknown = await post({ email: unknown })

    expect(await responseShape(forUnknown)).toEqual(await responseShape(forKnown))
    // And the one thing that DID differ is the thing an attacker cannot see:
    // only the real address has a token.
    expect(await hasResetToken(known)).toBe(true)
    expect(await hasResetToken(unknown)).toBe(false)
  })

  it('never puts a whole address in the answer', async () => {
    // CLAUDE.md §7. The `Location` is written into every access log between
    // here and the reader.
    const email = await aReader()

    const answered = await post({ email })

    expect(answered.headers.get('Location')).not.toContain(email)
    expect(await answered.text()).toBe('')
  })

  it('sends a body with no fields back to the reset form', async () => {
    const answered = await post(null)

    expect(answered.status).toBe(303)
    expect(answered.headers.get('Location')).toBe(RESET_PATH)
  })

  it('sends a body that is not a form at all back to the reset form too', async () => {
    const answered = await handleResetRequest(
      new Request(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'reader@example.test' }),
      }),
    )

    expect(answered.status).toBe(303)
    expect(answered.headers.get('Location')).toBe(RESET_PATH)
  })

  it('sends a reader whose window is exhausted back to the form rather than claiming a link was sent', async () => {
    // A refusal must not draw the "sent" confirmation: telling somebody a link
    // is on its way when none is is the one message they cannot act on.
    const email = await aReader()
    const ip = `${FIXTURE_IP_PREFIX}exhausted`
    const spend = async (): Promise<Response> =>
      handleResetRequest(
        new Request(ENDPOINT, {
          method: 'POST',
          body: (() => {
            const body = new FormData()
            body.set('email', email)
            return body
          })(),
          headers: { 'x-forwarded-for': ip },
        }),
      )

    let last = await spend()
    for (let attempt = 0; attempt < 12; attempt += 1) last = await spend()

    expect(last.status).toBe(303)
    expect(last.headers.get('Location')).toBe(RESET_PATH)
  })
})
