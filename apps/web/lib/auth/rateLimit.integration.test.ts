/**
 * rateLimit.integration.test.ts — `SECURITY.md` §3's sliding window, in both
 * dimensions, asserted against a real Postgres.
 *
 * Integration test (CLAUDE.md §2), not a unit test, and not optional: the
 * window's arithmetic is already covered by
 * `packages/domain/src/auth/rateWindow.test.ts`, so what is left to prove is
 * exactly the part a mock cannot say anything about — that the counting is
 * done by the DATABASE, in a way that holds when requests arrive at once. A
 * limiter that reads a count, decides, and then records the attempt passes
 * every sequential test and lets a burst straight through; this repository
 * has already measured that failure once, with twelve parallel guesses
 * evaluated against a three-guess budget
 * (`docs/adr/0015-otp-challenge-hashing.md`).
 *
 * BOTH DIMENSIONS ARE PROVEN INDEPENDENTLY, because limiting only one is the
 * common mistake. The per-IP burst fires many attempts from ONE address
 * against MANY accounts, so nothing but the address can be what refuses
 * them; the per-account burst fires many attempts against ONE account from
 * MANY addresses, so nothing but the account can be. Per-account alone lets
 * a botnet spray; per-IP alone lets one host grind a single account behind
 * rotating proxies.
 *
 * THE BURSTS ARE REAL CONCURRENCY — `Promise.all`, not a loop — and they
 * assert EXACTLY how many attempts were admitted, not merely that some were
 * refused. "Some were refused" is satisfied by a limiter that refuses the
 * wrong ones, and by one that refuses all of them.
 *
 * ACCOUNTS HERE ARE SYNTHETIC IDS, NOT `users` ROWS, and that is a statement
 * about the module under test rather than a shortcut. The limiter never
 * joins an attempt to an account: the account id is a key it counts against,
 * nothing more. Creating twenty-eight real accounts would add twenty-eight
 * password hashes to the runtime and would assert a relationship that does
 * not exist. Payload's own lockout — the part that DOES need a real account
 * — is exercised in `apps/web/collections/users.lockout.integration.test.ts`.
 *
 * NO CLOCK IS INJECTED HERE, DELIBERATELY, AND THAT IS NOT A BREACH OF
 * CLAUDE.md §2.3. There is no application clock to inject: every timestamp
 * this module compares is stamped and read by Postgres, which is the whole
 * point (an application server with a fast clock must not be able to widen
 * its own window). The one case that needs time to have passed moves the
 * ROWS instead, backdating them past the window — the same thing waiting
 * fifteen minutes would do, without waiting fifteen minutes.
 *
 * Uses `getTestPayload()`, not `getPayload()` directly, so this file connects
 * to the isolated `diary_test` database rather than a developer's own — see
 * that module's header.
 * Depends on: vitest, ./rateLimit, ../testPayload, `@travel-diary/domain`.
 */
import {
  ACCOUNT_CODE_ATTEMPT_LIMIT,
  IP_ATTEMPT_LIMIT,
  SIGN_IN_WINDOW_MS,
} from '@travel-diary/domain/auth/rateWindow'
import { type UserId, userId } from '@travel-diary/domain/ids'
import { isOk } from '@travel-diary/domain/result'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getTestPayload } from '../testPayload'
import { type SignInRateLimiter, createSignInRateLimiter } from './rateLimit'

/**
 * The documentation address block every fixture address comes from
 * (RFC 5737 TEST-NET-2), so `afterAll` can delete this file's rows by prefix
 * and can never delete a row some other suite wrote.
 */
const FIXTURE_IP_PREFIX = '198.51.100.'

/** The prefix every synthetic account id here carries, for the same reason. */
const FIXTURE_ACCOUNT_PREFIX = 'rate-fixture-account-'

/** Distinguishes one fixture address or account from the next within a run. */
let fixtureCount = 0

/**
 * A fixture address no other case in this run is using.
 *
 * A factory, not a shared constant (CLAUDE.md §2.3): the whole subject of
 * this file is a per-key budget, so two cases sharing an address would spend
 * each other's — and the failure would read as a bug in the limiter rather
 * than in the fixture.
 * @returns A TEST-NET-2 address unique within this run.
 */
const anAddress = (): string => {
  fixtureCount += 1
  return `${FIXTURE_IP_PREFIX}${String(fixtureCount)}`
}

/**
 * A fixture account id no other case in this run is using.
 *
 * Synthetic rather than a real `users` row — see this file's header for why
 * that is faithful to the module under test rather than a shortcut.
 * @returns A branded id unique within this run.
 */
const anAccount = (): UserId => {
  fixtureCount += 1
  const branded = userId(`${FIXTURE_ACCOUNT_PREFIX}${String(fixtureCount)}`)
  /* c8 ignore next -- `userId` refuses only an empty string, which a prefixed counter never is */
  if (!isOk(branded)) throw new Error('the fixture account id is empty')
  return branded.value
}

/** The shared test Payload instance, assigned by `beforeAll`. */
let payload: Awaited<ReturnType<typeof getTestPayload>>

/** The limiter under test, built over the same Payload instance. */
let limiter: SignInRateLimiter

/**
 * How many attempts are recorded against one key, refused ones included.
 *
 * Counts ROWS rather than believing the limiter's own answers, which is the
 * point whenever the question is whether a refusal was applied or merely
 * reported: a limiter that refuses by declining to record is a limiter whose
 * next window starts empty.
 * @param dimension - Which of the two windows to count in.
 * @param subject - The address or account id.
 * @returns How many rows exist for that key.
 */
const recordedAttempts = async (dimension: 'ip' | 'account', subject: string): Promise<number> => {
  const counted = await payload.db.pool.query<{ attempts: string }>(
    `SELECT count(*) AS attempts FROM sign_in_attempts WHERE dimension = $1 AND subject = $2`,
    [dimension, subject],
  )
  return counted.rows.reduce((total, row) => total + Number(row.attempts), 0)
}

/**
 * Moves every recorded attempt for one key back beyond the window.
 *
 * The honest stand-in for waiting a quarter of an hour: the rows are what
 * the window is measured over, and Postgres is the only clock involved.
 * @param dimension - Which window the key belongs to.
 * @param subject - The address or account id.
 */
const ageAttemptsOutOfTheWindow = async (dimension: 'ip' | 'account', subject: string): Promise<void> => {
  await payload.db.pool.query(
    `UPDATE sign_in_attempts
        SET attempted_at = attempted_at - ($3::double precision * interval '1 millisecond')
      WHERE dimension = $1 AND subject = $2`,
    [dimension, subject, SIGN_IN_WINDOW_MS + 60_000],
  )
}

/**
 * How many of a set of decisions were admissions.
 * @param decisions - What the limiter answered.
 * @returns The number that were `ok`.
 */
const admitted = (decisions: readonly { readonly ok: boolean }[]): number =>
  decisions.filter((decision) => decision.ok).length

/** Removes every row this file wrote, so a run starts and ends from a known state. */
const removeFixtureAttempts = async (): Promise<void> => {
  await payload.db.pool.query(`DELETE FROM sign_in_attempts WHERE subject LIKE $1 OR subject LIKE $2`, [
    `${FIXTURE_IP_PREFIX}%`,
    `${FIXTURE_ACCOUNT_PREFIX}%`,
  ])
}

beforeAll(async () => {
  payload = await getTestPayload()
  limiter = createSignInRateLimiter({ payload })
  // Cleaned at BOTH ends: fixture subjects are derived from a counter and so
  // repeat run to run, and a run has to be able to start from whatever an
  // interrupted one left behind.
  await removeFixtureAttempts()
})

afterAll(async () => {
  await removeFixtureAttempts()
})

describe('the per-address window', () => {
  it('admits twenty attempts from one address and refuses the twenty-first', async () => {
    const ip = anAddress()

    const decisions = []
    for (let attempt = 0; attempt < IP_ATTEMPT_LIMIT + 1; attempt += 1) {
      decisions.push(await limiter.admitPasswordAttempt({ ip }))
    }

    expect(admitted(decisions)).toBe(IP_ATTEMPT_LIMIT)
    expect(decisions.at(-1)).toEqual({ ok: false, error: 'rate-limited' })
  })

  it('admits exactly twenty of a concurrent burst from one address, however many accounts it is aimed at', async () => {
    // ONE address, MANY accounts: each account sees a single attempt, so the
    // per-account window cannot be what refuses anything here. If this passes
    // with the per-address condition removed, the dimension is not enforced.
    const ip = anAddress()
    const burst = IP_ATTEMPT_LIMIT + 8

    const decisions = await Promise.all(
      Array.from({ length: burst }, () => limiter.admitCodeAttempt({ ip, account: anAccount() })),
    )

    expect(admitted(decisions)).toBe(IP_ATTEMPT_LIMIT)
  })

  it('records every attempt of a burst, including the ones it refuses', async () => {
    // A limiter that refused by declining to write would report the same
    // numbers as this one and would start its next window empty.
    const ip = anAddress()
    const burst = IP_ATTEMPT_LIMIT + 8

    await Promise.all(Array.from({ length: burst }, () => limiter.admitCodeAttempt({ ip, account: anAccount() })))

    expect(await recordedAttempts('ip', ip)).toBe(burst)
  })

  it('spends the password endpoint and the code endpoint from separate budgets', async () => {
    // Different secrets, different keyspaces: a reader who has fumbled their
    // password is not thereby out of code attempts.
    const ip = anAddress()
    for (let attempt = 0; attempt < IP_ATTEMPT_LIMIT + 1; attempt += 1) {
      await limiter.admitPasswordAttempt({ ip })
    }

    const onTheCodeEndpoint = await limiter.admitCodeAttempt({ ip, account: anAccount() })

    expect(onTheCodeEndpoint).toEqual({ ok: true, value: undefined })
  })
})

describe('the per-account window', () => {
  it('admits exactly ten of a concurrent burst against one account, however many addresses it comes from', async () => {
    // ONE account, MANY addresses: each address sees a single attempt, so the
    // per-address window cannot be what refuses anything here. This is the
    // spray a per-address limit alone cannot see.
    const account = anAccount()
    const burst = ACCOUNT_CODE_ATTEMPT_LIMIT + 8

    const decisions = await Promise.all(
      Array.from({ length: burst }, () => limiter.admitCodeAttempt({ ip: anAddress(), account })),
    )

    expect(admitted(decisions)).toBe(ACCOUNT_CODE_ATTEMPT_LIMIT)
  })

  it('refuses an account at its limit even from an address with no history at all', async () => {
    const account = anAccount()
    for (let attempt = 0; attempt < ACCOUNT_CODE_ATTEMPT_LIMIT; attempt += 1) {
      await limiter.admitCodeAttempt({ ip: anAddress(), account })
    }

    const fromSomewhereNew = await limiter.admitCodeAttempt({ ip: anAddress(), account })

    expect(fromSomewhereNew).toEqual({ ok: false, error: 'rate-limited' })
  })

  it('records the account attempt even when the address it came from is already out of budget', async () => {
    // Short-circuiting on the address's refusal would leave the account's
    // window uncounted, so an attacker who had already spent one address's
    // budget could grind an account for free from behind it — and every
    // sequential case in this file would still pass.
    const spentAddress = anAddress()
    for (let attempt = 0; attempt < IP_ATTEMPT_LIMIT + 1; attempt += 1) {
      await limiter.admitCodeAttempt({ ip: spentAddress, account: anAccount() })
    }
    const account = anAccount()

    await limiter.admitCodeAttempt({ ip: spentAddress, account })

    expect(await recordedAttempts('account', account)).toBe(1)
  })

  it('leaves the password endpoint to Payload lockout, counting no account window there', async () => {
    // SECURITY.md §3 assigns the per-account password limit to Payload's
    // `maxLoginAttempts`/`lockTime` (proved in
    // `apps/web/collections/users.lockout.integration.test.ts`), so this
    // module must not keep a second one beside it — two sources of truth for
    // one rule (CLAUDE.md §7). The password endpoint takes no account at all,
    // which is why this asserts on the rows rather than on a decision.
    const ip = anAddress()

    await limiter.admitPasswordAttempt({ ip })

    const passwordRows = await payload.db.pool.query<{ attempts: string }>(
      `SELECT count(*) AS attempts FROM sign_in_attempts WHERE endpoint = 'password' AND dimension = 'account'
         AND subject LIKE $1`,
      [`${FIXTURE_ACCOUNT_PREFIX}%`],
    )

    expect(passwordRows.rows.reduce((total, row) => total + Number(row.attempts), 0)).toBe(0)
  })
})

describe('the window sliding', () => {
  it('admits again once the recorded attempts have aged out of the window', async () => {
    const ip = anAddress()
    for (let attempt = 0; attempt < IP_ATTEMPT_LIMIT; attempt += 1) {
      await limiter.admitPasswordAttempt({ ip })
    }
    expect(await limiter.admitPasswordAttempt({ ip })).toEqual({ ok: false, error: 'rate-limited' })

    await ageAttemptsOutOfTheWindow('ip', ip)

    expect(await limiter.admitPasswordAttempt({ ip })).toEqual({ ok: true, value: undefined })
  })

  it('prunes the attempts that have aged out, so the table stays bounded without a scheduler', async () => {
    const ip = anAddress()
    for (let attempt = 0; attempt < IP_ATTEMPT_LIMIT; attempt += 1) {
      await limiter.admitPasswordAttempt({ ip })
    }
    await ageAttemptsOutOfTheWindow('ip', ip)

    await limiter.admitPasswordAttempt({ ip })

    expect(await recordedAttempts('ip', ip)).toBe(1)
  })
})
