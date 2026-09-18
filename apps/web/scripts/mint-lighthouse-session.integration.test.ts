/**
 * mint-lighthouse-session.integration.test.ts — behaviour spec for the session
 * a performance collector carries.
 *
 * THE PROPERTY IS NOT THAT THE STRING LOOKS RIGHT. A well-formed cookie that
 * authenticates nothing is exactly the failure this whole mechanism exists to
 * avoid: `/admin` would answer the collector with a redirect to
 * `/admin/sign-in`, Lighthouse would follow it, and the admin JS budget would
 * be asserted against the sign-in screen for a third time under `/admin`'s
 * name — green, and measuring the wrong page. So the cookie is judged by the
 * PRODUCTION reader (`readBrowserSession`, which is what the guard calls) and
 * then by the PRODUCTION authenticator (`createSessionService.authenticate`,
 * which is what the guard calls next). Neither is written here.
 *
 * Uses `getTestPayload()` rather than `getPayload()`, so the account and the
 * session land in the isolated `diary_test` database — never the developer's
 * own `diary`, which is the database the collector itself mints against.
 */
import { readBrowserSession } from '../lib/auth/browserSession'
import { createSessionService } from '../lib/auth/sessions'
import { getTestPayload } from '../lib/testPayload'
import { LIGHTHOUSE_ACCOUNT_EMAIL, mintLighthouseSession } from './mint-lighthouse-session'
import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

let payload: Payload

/**
 * Removes the collector's account, and its sessions FIRST.
 *
 * The order is not tidiness. `sessions.user` is a required relationship, so
 * deleting the account while a session points at it aborts the transaction on a
 * foreign key and every statement after it in the same transaction — including
 * Payload's own `deleteUserPreferences` — fails with "current transaction is
 * aborted". Measured: this file passed on its first run, when no account
 * existed yet, and failed on its second.
 *
 * Raw SQL for the `sessions` rows, exactly as `e2e/support/adminSession.ts`'s
 * `removeSignedInFixture` does and for the same reason: `sessions` is written
 * through the service rather than read through it, and a Local API delete of
 * rows this file never created is a wider claim than the cleanup needs.
 */
const clean = async (): Promise<void> => {
  const accounts = await payload.find({
    collection: 'users',
    where: { email: { equals: LIGHTHOUSE_ACCOUNT_EMAIL } },
    depth: 0,
    pagination: false,
  })
  for (const account of accounts.docs) {
    await payload.db.pool.query(`DELETE FROM sessions WHERE user_id = $1`, [account.id])
  }

  await payload.delete({ collection: 'users', where: { email: { equals: LIGHTHOUSE_ACCOUNT_EMAIL } } })
}

beforeAll(async () => {
  payload = await getTestPayload()
  await clean()
}, 60_000)

afterAll(async () => {
  await clean()
})

describe('mintLighthouseSession', () => {
  it('prints a cookie the guard itself accepts, not merely a well-formed string', async () => {
    const header = await mintLighthouseSession(payload)
    const value = readBrowserSession(header)

    expect(value).not.toBeNull()
    if (value === null) throw new Error('unreachable: the assertion above has already failed')

    const sessions = createSessionService({ payload, now: Date.now })
    const authenticated = await sessions.authenticate(value)

    expect(authenticated.ok).toBe(true)
  })

  it('names the account the session belongs to, so the screen is drawn for somebody', async () => {
    const header = await mintLighthouseSession(payload)
    const value = readBrowserSession(header)
    if (value === null) throw new Error('the minted header carried no session')

    const sessions = createSessionService({ payload, now: Date.now })
    const authenticated = await sessions.authenticate(value)
    if (!authenticated.ok) throw new Error(`the minted session does not authenticate: ${authenticated.error}`)

    // The right side is read back out of Postgres by email, so the two sides
    // are the session's own claim and the row that exists.
    const account = await payload.find({
      collection: 'users',
      where: { email: { equals: LIGHTHOUSE_ACCOUNT_EMAIL } },
      limit: 1,
      depth: 0,
    })
    expect(authenticated.value.user).toBe(String(account.docs[0]?.id))
  })

  it('creates the collector’s account once and reuses it, so a gate does not grow a row per run', async () => {
    await mintLighthouseSession(payload)
    await mintLighthouseSession(payload)

    const accounts = await payload.find({
      collection: 'users',
      where: { email: { equals: LIGHTHOUSE_ACCOUNT_EMAIL } },
      depth: 0,
      pagination: false,
    })

    expect(accounts.docs).toHaveLength(1)
  })

  it('issues a different session each time, so one run cannot inherit another’s', async () => {
    const first = await mintLighthouseSession(payload)
    const second = await mintLighthouseSession(payload)

    expect(second).not.toBe(first)
  })
})
