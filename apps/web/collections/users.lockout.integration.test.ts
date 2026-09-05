/**
 * users.lockout.integration.test.ts — `SECURITY.md` §3's "account lockout
 * with a cooling-off period", exercised for the first time.
 *
 * `users` has carried `auth: { maxLoginAttempts: 5, lockTime: 15 * 60 }`
 * since Phase 0 and no test had ever tripped it. Configuration that has never
 * been observed working is a hypothesis: a typo in the key, a unit read as
 * milliseconds instead of seconds, or a Payload release that renames either
 * option would all leave the collection looking correct and the lockout
 * absent — and the only way anyone would find out is an attacker not being
 * stopped by it.
 *
 * `SECURITY.md` §3 assigns the per-account PASSWORD limit here rather than to
 * `apps/web/lib/auth/rateLimit.ts`, which is why that module keeps no account
 * window on the password endpoint (CLAUDE.md §7: one source of truth per
 * rule). The two are complementary and this file proves the half Payload
 * owns; `rateLimit.integration.test.ts` proves the other.
 *
 * THE CASE THAT MATTERS MOST IS THE CORRECT PASSWORD BEING REFUSED. A test
 * that only asserted "a wrong password is still refused after five wrong
 * passwords" would pass with the lockout entirely absent — wrong passwords
 * are refused either way. A lockout is only observable as the RIGHT
 * credentials failing.
 *
 * Integration test (CLAUDE.md §2), against a real Payload and a real
 * Postgres, because the counter and the lock are columns (`login_attempts`,
 * `lock_until`) and Payload's login operation is what maintains them. Both
 * are read straight out of the table rather than through the Local API,
 * which hides them from an ordinary `find`.
 *
 * Uses `getTestPayload()`, not `getPayload()` directly, so this file connects
 * to the isolated `diary_test` database rather than a developer's own — see
 * that module's header.
 * Depends on: vitest, ../lib/testPayload.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getTestPayload } from '../lib/testPayload'

/** Every fixture account here carries this, so `afterAll` can find them all. */
const FIXTURE_EMAIL_DOMAIN = 'users-lockout-fixture.example'

/** The password each fixture account is actually created with. */
const CORRECT_PASSWORD = 'the-one-this-account-was-created-with'

/** A password no fixture account has. */
const WRONG_PASSWORD = 'not-the-one-this-account-was-created-with'

/**
 * `users.auth.maxLoginAttempts`, restated rather than imported.
 *
 * Deliberately a literal: importing the collection's own config would make
 * this file agree with whatever that config says, including a five silently
 * edited to fifty. `SECURITY.md` asks for a lockout after a small number of
 * attempts and `docs/security.md` records the number as five, so five is what
 * is asserted.
 */
const MAX_LOGIN_ATTEMPTS = 5

/** `users.auth.lockTime`, in milliseconds, restated for the same reason. */
const LOCK_TIME_MS = 15 * 60_000

/** Distinguishes one fixture account from the next within a single run. */
let fixtureCount = 0

/** The shared test Payload instance, assigned by `beforeAll`. */
let payload: Awaited<ReturnType<typeof getTestPayload>>

/**
 * A fresh account with a known password.
 *
 * A factory, not a shared fixture (CLAUDE.md §2.3): the whole subject of this
 * file is a per-account counter, so two cases sharing an account would spend
 * each other's attempts and the failure would read as a bug in Payload.
 * @returns The account's email and its row id.
 */
const aLockableAccount = async (): Promise<{ email: string; id: number }> => {
  fixtureCount += 1
  const email = `locked-${String(fixtureCount)}@${FIXTURE_EMAIL_DOMAIN}`
  const created = await payload.create({
    collection: 'users',
    data: { email, password: CORRECT_PASSWORD },
  })
  return { email, id: created.id }
}

/**
 * What Payload's lockout columns hold for one account.
 *
 * Read from the table rather than through the Local API: `loginAttempts` and
 * `lockUntil` are auth-internal fields Payload does not return from an
 * ordinary `find`, and a test that could not see them would be asserting on
 * behaviour alone with no way to say WHY it behaved that way.
 * @param id - The account's row id.
 * @returns The counter, and when the lock lifts (epoch milliseconds, or
 *   `null` while the account is not locked).
 */
const lockoutColumns = async (id: number): Promise<{ attempts: number; lockedUntilMs: number | null }> => {
  const read = await payload.db.pool.query<{ login_attempts: string | null; lock_until: Date | null }>(
    `SELECT login_attempts, lock_until FROM users WHERE id = $1`,
    [id],
  )
  return read.rows.reduce<{ attempts: number; lockedUntilMs: number | null }>(
    // One row or none; the fold reads the row when there is one and keeps
    // the unlocked default when there is not, with no arm no test can take.
    (_previous, row) => ({
      attempts: Number(row.login_attempts ?? 0),
      lockedUntilMs: row.lock_until === null ? null : row.lock_until.getTime(),
    }),
    { attempts: 0, lockedUntilMs: null },
  )
}

/**
 * Offers a password and reports whether Payload accepted it.
 *
 * Returns a boolean rather than letting the rejection escape, because every
 * case here is interested in the OUTCOME of a login rather than in which of
 * Payload's error classes it threw — and a rejected promise left unattached
 * while a later `await` runs is the unhandled-rejection race
 * `collections.integration.test.ts` already recorded.
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

/**
 * Offers the wrong password `times` times, one after another.
 * @param email - The account to fail against.
 * @param times - How many failures to spend.
 */
const failToSignIn = async (email: string, times: number): Promise<void> => {
  for (let attempt = 0; attempt < times; attempt += 1) {
    await signInSucceeds(email, WRONG_PASSWORD)
  }
}

/** Deletes every account this file creates. */
const removeFixtureAccounts = async (): Promise<void> => {
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
  // Cleaned at both ends: fixture addresses derive from a counter and repeat
  // run to run, and `users.email` is unique, so one row left by an
  // interrupted run makes the next run fail inside the fixture factory.
  await removeFixtureAccounts()
})

afterAll(async () => {
  await removeFixtureAccounts()
})

describe('the account lockout on the users collection', () => {
  it('lets the right password through while the account has attempts left', async () => {
    // The control. Without it, every assertion below could be satisfied by an
    // account that simply cannot sign in at all.
    const account = await aLockableAccount()
    await failToSignIn(account.email, MAX_LOGIN_ATTEMPTS - 1)

    expect(await signInSucceeds(account.email, CORRECT_PASSWORD)).toBe(true)
  })

  it('refuses the right password once five wrong ones have been spent', async () => {
    // The case the whole file exists for: a lockout is only observable as
    // correct credentials failing.
    const account = await aLockableAccount()
    await failToSignIn(account.email, MAX_LOGIN_ATTEMPTS)

    expect(await signInSucceeds(account.email, CORRECT_PASSWORD)).toBe(false)
  })

  it('records the fifth failure as the one that locks the account', async () => {
    const account = await aLockableAccount()
    await failToSignIn(account.email, MAX_LOGIN_ATTEMPTS - 1)
    const beforeTheLast = await lockoutColumns(account.id)

    await failToSignIn(account.email, 1)
    const afterTheLast = await lockoutColumns(account.id)

    expect({ before: beforeTheLast.lockedUntilMs, after: afterTheLast.lockedUntilMs === null }).toEqual({
      before: null,
      after: false,
    })
  })

  it('holds the lock for fifteen minutes, the cooling-off period SECURITY.md asks for', async () => {
    const account = await aLockableAccount()
    const lockedAt = Date.now()

    await failToSignIn(account.email, MAX_LOGIN_ATTEMPTS)
    const { lockedUntilMs } = await lockoutColumns(account.id)

    // A range rather than an equality: the lock is stamped by Payload some
    // milliseconds after `lockedAt` was read, and five sequential password
    // hashes are not instant. A minute either side is far tighter than the
    // mistakes this case exists to catch — seconds read as milliseconds
    // (fifteen seconds) or minutes read as seconds (fifteen hours).
    expect(lockedUntilMs).toBeGreaterThan(lockedAt + LOCK_TIME_MS - 60_000)
    expect(lockedUntilMs).toBeLessThan(lockedAt + LOCK_TIME_MS + 60_000)
  })

  it('counts each wrong password once, so the budget is five and not fewer', async () => {
    const account = await aLockableAccount()

    await failToSignIn(account.email, 3)

    expect((await lockoutColumns(account.id)).attempts).toBe(3)
  })

  it('resets the counter when a sign-in succeeds, so an honest reader does not accumulate towards a lock', async () => {
    const account = await aLockableAccount()
    await failToSignIn(account.email, MAX_LOGIN_ATTEMPTS - 1)

    await signInSucceeds(account.email, CORRECT_PASSWORD)

    expect((await lockoutColumns(account.id)).attempts).toBe(0)
  })
})
