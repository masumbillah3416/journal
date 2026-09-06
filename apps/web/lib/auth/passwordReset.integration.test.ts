/**
 * passwordReset.integration.test.ts — the reset request, which must answer
 * the same way whether or not the address exists.
 *
 * Integration test (CLAUDE.md §2), against a real Payload and a real
 * Postgres: the token it mints is a column Payload writes and later consumes,
 * and a test that stopped at "a message was sent" would pass while the link
 * in it did nothing.
 *
 * THE IDENTICAL-RESPONSE CASE COMPARES THE WHOLE VALUE, and it can, because
 * the two addresses it uses share their first two characters and their
 * domain — so `maskEmail` makes the same string of both. That is not a
 * convenience: it is the property being asserted. A masked address that
 * differed between a hit and a miss would be an enumeration oracle wearing
 * the mask that was meant to prevent one, and a case that compared
 * `maskEmail(a)` against `maskEmail(b)` for two DIFFERENT addresses would be
 * comparing two expressions rather than two answers.
 *
 * WHAT IS NOT PROVEN HERE, stated rather than left to be discovered: the
 * timing. `SECURITY.md` asks for identical timing on the sign-in miss and
 * mismatch, and asks of the reset endpoint only that it "respond
 * identically" — which is what this file asserts. The hit path does one row
 * update and one mail dispatch that the miss path does not, and that
 * difference is measurable. See `passwordReset.ts`'s header for why it is
 * accepted here and what would close it.
 *
 * Uses `getTestPayload()`, not `getPayload()` directly, so this file connects
 * to the isolated `diary_test` database rather than a developer's own.
 * Depends on: vitest, ./passwordReset, ./rateLimit, ../adapters/console-mailer,
 * ../ports/mailer, ../testPayload, `@travel-diary/domain`.
 */
import { createHash } from 'node:crypto'
import { maskEmail } from '@travel-diary/domain/auth/mask'
import { ADDRESS_PASSWORD_ATTEMPT_LIMIT } from '@travel-diary/domain/auth/rateWindow'
import { err } from '@travel-diary/domain/result'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createConsoleMailer } from '../adapters/console-mailer'
import type { MailerPort } from '../ports/mailer'
import { getTestPayload } from '../testPayload'
import { type PasswordResetService, createPasswordResetService } from './passwordReset'
import { createSignInRateLimiter } from './rateLimit'

/** Every fixture address here belongs to this domain. */
const FIXTURE_EMAIL_DOMAIN = 'password-reset-fixture.example'

/**
 * The two characters `maskEmail` leaves visible, shared by every fixture
 * address in this file.
 *
 * Load-bearing for the identical-response case: with the same visible prefix
 * and the same domain, an address that exists and one that does not mask to
 * the same string, so the two answers can be compared whole.
 */
const FIXTURE_LOCAL_PREFIX = 'reader'

/** The documentation address block every fixture IP comes from (RFC 5737 TEST-NET-1). */
const FIXTURE_IP_PREFIX = '192.0.2.'

/** The password every fixture account is created with. */
const CORRECT_PASSWORD = 'the-one-this-account-was-created-with'

/** The password the completed reset sets, proving the token actually works. */
const REPLACEMENT_PASSWORD = 'the-one-the-reset-link-set-instead'

/** The origin the service is told to build links against. */
const ADMIN_ORIGIN = 'https://diary.example'

/** Distinguishes one fixture from the next within a single run. */
let fixtureCount = 0

/** Every `sign_in_attempts.subject` this file's addresses hashed to, so `afterAll` can find them. */
const fixtureAddressKeys: string[] = []

/**
 * The `subject` the password endpoint counts a sign-in address under.
 * @param address - The normalised sign-in address.
 * @returns 64 hex characters.
 */
const addressKey = (address: string): string => createHash('sha256').update(address).digest('hex')

/**
 * A digit-free label, derived from a counter.
 * @param count - The fixture's ordinal within this run.
 * @returns Two lowercase letters, unique for the first 676 fixtures.
 */
const alphabeticLabel = (count: number): string =>
  String.fromCharCode(97 + Math.floor(count / 26)) + String.fromCharCode(97 + (count % 26))

/**
 * A fixture address, recorded so `afterAll` can find the rows it produced.
 * @returns An address unique within this run.
 */
const anAddress = (): string => {
  fixtureCount += 1
  const address = `${FIXTURE_LOCAL_PREFIX}-${alphabeticLabel(fixtureCount)}@${FIXTURE_EMAIL_DOMAIN}`
  fixtureAddressKeys.push(addressKey(address))
  return address
}

/**
 * A requesting address no other case in this run is using.
 * @returns A TEST-NET-1 address unique within this run.
 */
const anIp = (): string => {
  fixtureCount += 1
  return `${FIXTURE_IP_PREFIX}${String(fixtureCount)}`
}

/** The shared test Payload instance, assigned by `beforeAll`. */
let payload: Awaited<ReturnType<typeof getTestPayload>>

/** The service under test. */
let service: PasswordResetService

/** The mailer it delivers through, for reading the link back out. */
let mailer: ReturnType<typeof createConsoleMailer>

/**
 * A fresh account with a known password.
 * @returns The account's address.
 */
const aReader = async (): Promise<string> => {
  const email = anAddress()
  await payload.create({ collection: 'users', data: { email, password: CORRECT_PASSWORD } })
  return email
}

/**
 * The reset token out of the most recent message, the way a reader would take
 * it — from the link, not from the database.
 * @returns The token.
 * @throws If nothing was sent, or the last message carries no reset link.
 *   Neither message echoes the body it searched.
 */
const readTokenFromOutbox = (): string => {
  const last = mailer.sent.at(-1)
  if (last === undefined) throw new Error('nothing was sent')
  const match = /\/admin\/reset\/([0-9a-f]+)\b/u.exec(last.text)
  const token = match?.[1]
  if (token === undefined) throw new Error('no reset link in the message body')
  return token
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
  await payload.db.pool.query(`DELETE FROM sign_in_attempts WHERE subject LIKE $1 OR subject = ANY($2)`, [
    `${FIXTURE_IP_PREFIX}%`,
    fixtureAddressKeys,
  ])
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
  service = createPasswordResetService({
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

describe('requesting a way back in', () => {
  it('answers identically for an address that exists and one that does not', async () => {
    const known = await aReader()
    const unknown = anAddress()

    const forTheKnown = await service.requestPasswordReset({ email: known, ip: anIp() })
    const forTheUnknown = await service.requestPasswordReset({ email: unknown, ip: anIp() })

    expect(forTheKnown).toEqual(forTheUnknown)
  })

  it('returns the address masked, never the address itself', async () => {
    const known = await aReader()

    const requested = await service.requestPasswordReset({ email: known, ip: anIp() })

    expect(requested).toEqual({ ok: true, value: { maskedTo: maskEmail(known) } })
    expect(JSON.stringify(requested)).not.toContain(known)
  })

  it('sends nothing at all to an address that names no account', async () => {
    const before = mailer.sent.length

    await service.requestPasswordReset({ email: anAddress(), ip: anIp() })

    expect(mailer.sent.length).toBe(before)
  })

  it('sends a link that actually resets the password', async () => {
    // The case that stops this being a message-shaped no-op: a test that
    // asserted only "a mail went out" would pass with a token that Payload
    // never wrote, or with a link built from the wrong route.
    const known = await aReader()

    await service.requestPasswordReset({ email: known, ip: anIp() })
    const token = readTokenFromOutbox()
    await payload.resetPassword({
      collection: 'users',
      data: { password: REPLACEMENT_PASSWORD, token },
      overrideAccess: true,
    })

    expect(await signInSucceeds(known, REPLACEMENT_PASSWORD)).toBe(true)
  })

  it('builds the link against the origin it was given rather than one taken from the request', async () => {
    // Injected, never read off a `Host` header: an attacker who can set that
    // header on a request for somebody else's address would otherwise be sent
    // a link pointing at their own machine.
    const known = await aReader()

    await service.requestPasswordReset({ email: known, ip: anIp() })

    expect(mailer.sent.at(-1)?.text).toContain(`${ADMIN_ORIGIN}/admin/reset/`)
  })

  it('normalises the address, so a differently-spelled request reaches the same account', async () => {
    const known = await aReader()

    await service.requestPasswordReset({ email: ` ${known.toUpperCase()} `, ip: anIp() })

    expect(mailer.sent.at(-1)?.to).toBe(known)
  })

  it('refuses once the address has spent the password endpoint budget it shares', async () => {
    // A reset request costs an attempt on the same window the password step
    // spends, deliberately — see `passwordReset.ts`'s header. Without it the
    // endpoint is an unmetered way to put mail in the owner's inbox.
    const known = await aReader()
    for (let attempt = 0; attempt < ADDRESS_PASSWORD_ATTEMPT_LIMIT; attempt += 1) {
      await service.requestPasswordReset({ email: known, ip: anIp() })
    }

    const overTheLimit = await service.requestPasswordReset({ email: known, ip: anIp() })

    expect(overTheLimit).toEqual({ ok: false, error: 'rate-limited' })
  })

  it('reports a delivery that failed rather than claiming a link was sent', async () => {
    const known = await aReader()
    const refusingMailer: MailerPort = { send: () => Promise.resolve(err('the mail provider refused')) }
    const withARefusingMailer = createPasswordResetService({
      payload,
      mailer: refusingMailer,
      limiter: createSignInRateLimiter({ payload }),
      adminOrigin: ADMIN_ORIGIN,
    })

    const requested = await withARefusingMailer.requestPasswordReset({ email: known, ip: anIp() })

    expect(requested).toEqual({ ok: false, error: 'delivery-failed' })
  })
})
