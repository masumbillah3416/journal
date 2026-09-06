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
 * EVERY DIMENSION IS PROVEN INDEPENDENTLY, because limiting only one is the
 * common mistake. The per-IP burst fires many attempts from ONE address
 * against MANY accounts, so nothing but the address can be what refuses
 * them; the per-account burst fires many attempts against ONE account from
 * MANY addresses, so nothing but the account can be. Per-account alone lets
 * a botnet spray; per-IP alone lets one host grind a single account behind
 * rotating proxies.
 *
 * THE PASSWORD ENDPOINT HAS TWO WINDOWS TOO, and its second one is keyed on
 * the CLAIMED SIGN-IN ADDRESS rather than on an account (phase ruling F43).
 * At that step the account is not yet known and half the requests name none,
 * so a key that needed a row id would leave the miss path doing strictly less
 * work than the hit path — an enumeration oracle inside the limiter. Its
 * cases here fire many requesting addresses at ONE sign-in address, so
 * nothing but that address can be what refuses them, and one of them reads
 * `subject` back to check it is a hash rather than the address.
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
import { createHash } from 'node:crypto'
import {
  ACCOUNT_CODE_ATTEMPT_LIMIT,
  ADDRESS_PASSWORD_ATTEMPT_LIMIT,
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
 *
 * ONE BLOCK PER SUITE, AND THE THREE ARE DISJOINT: this file has TEST-NET-2,
 * `signIn.integration.test.ts` has TEST-NET-1 (`192.0.2.`) and
 * `passwordReset.integration.test.ts` has TEST-NET-3 (`203.0.113.`). Two
 * suites sharing a prefix would delete each other's rows in `afterAll` —
 * harmless while they run in sequence and a mystery the day they do not.
 */
const FIXTURE_IP_PREFIX = '198.51.100.'

/** The prefix every synthetic account id here carries, for the same reason. */
const FIXTURE_ACCOUNT_PREFIX = 'rate-fixture-account-'

/** How many host addresses a `/24` documentation block actually has. */
const USABLE_HOSTS_IN_A_SLASH_24 = 254

/** Distinguishes one fixture address or account from the next within a run. */
let fixtureCount = 0

/**
 * Counts fixture IPs SEPARATELY from everything else, because a /24 has 254
 * usable hosts and the shared counter passes that.
 *
 * It was not a hypothetical: this file's addresses and accounts drew from one
 * counter that reaches roughly 260 over a full run, so the last of them were
 * `198.51.100.255` and beyond — strings that are unique, and are not addresses.
 * Nothing failed, because `subject` is text; the fixtures had simply stopped
 * being what they claimed to be.
 */
let fixtureIpCount = 0

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
  fixtureIpCount += 1
  // Loud rather than silent if this file outgrows its block: a wrapped counter
  // would hand two cases the same address and they would spend each other's
  // budget, which reads as a bug in the limiter.
  if (fixtureIpCount > USABLE_HOSTS_IN_A_SLASH_24) {
    throw new Error('this suite has outgrown its documentation address block')
  }
  return `${FIXTURE_IP_PREFIX}${String(fixtureIpCount)}`
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

/**
 * The domain every fixture sign-in address here belongs to.
 *
 * Unlike the IP and account prefixes, this one cannot be used to find the
 * rows afterwards: the password endpoint keys its address window on a HASH of
 * the address (phase ruling F43), so nothing recognisable survives into
 * `subject`. {@link fixtureAddressKeys} is what `afterAll` deletes by instead.
 */
const FIXTURE_EMAIL_DOMAIN = 'rate-limit-fixture.example'

/** Every subject this file's sign-in addresses hashed to, so `afterAll` can find them. */
const fixtureAddressKeys: string[] = []

/**
 * A fixture sign-in address no other case in this run is using.
 *
 * @returns An address unique within this run, already recorded for cleanup.
 */
const anEmailAddress = (): string => {
  fixtureCount += 1
  const address = `reader-${String(fixtureCount)}@${FIXTURE_EMAIL_DOMAIN}`
  fixtureAddressKeys.push(addressKey(address))
  return address
}

/**
 * The `subject` an address is expected to be counted under.
 *
 * SHA-256 is spelled out here rather than imported from the module under
 * test, deliberately: this file has to find the rows it wrote in order to
 * delete them, and a helper that asked the implementation what it wrote would
 * agree with any answer, including no hashing at all. The cases below assert
 * the property — 64 hex characters, never the address — rather than this
 * recomputation, which exists for `afterAll`.
 * @param address - The normalised sign-in address.
 * @returns 64 hex characters.
 */
function addressKey(address: string): string {
  return createHash('sha256').update(address).digest('hex')
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
 * The first id the {@link attemptsRankingAfterThisOne} probe writes at.
 *
 * Far above anything the `sign_in_attempts` sequence will hand out, and
 * comfortably under `int4`'s ceiling, so a row written here outranks every row
 * the limiter itself inserts. Supplying an explicit id does not advance the
 * sequence, which is exactly what this needs: the real attempt that follows
 * still receives a small one.
 */
const RANKS_AFTER_ID_BASE = 2_000_000_000

/**
 * Records attempts for `subject` that sit INSIDE the window and are stamped at
 * or before whatever comes next, yet stand after it in the sequence.
 *
 * This is what a racer's row inserted a moment after yours looks like, made
 * deterministic. The rank bound in the adapter's SQL (`id <= mine`) is the only
 * thing that keeps such a row from counting against an attempt it followed —
 * and a concurrent burst catches its removal only some of the time, because
 * whether a racer's row exists yet when you rank depends on scheduling. A test
 * caught three times in four is a test that passes CI the fourth time.
 * @param subject - The address to record them against.
 * @param count - How many to write.
 */
const attemptsRankingAfterThisOne = async (subject: string, count: number): Promise<void> => {
  await payload.db.pool.query(
    `INSERT INTO sign_in_attempts (id, dimension, endpoint, subject, attempted_at, created_at, updated_at)
     SELECT $1::integer + step, 'ip', 'password', $2, clock_timestamp(), clock_timestamp(), clock_timestamp()
       FROM generate_series(1, $3::integer) AS step`,
    [RANKS_AFTER_ID_BASE, subject, count],
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
  await payload.db.pool.query(
    `DELETE FROM sign_in_attempts WHERE subject LIKE $1 OR subject LIKE $2 OR subject = ANY($3)`,
    [`${FIXTURE_IP_PREFIX}%`, `${FIXTURE_ACCOUNT_PREFIX}%`, fixtureAddressKeys],
  )
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
      decisions.push(await limiter.admitPasswordAttempt({ ip, email: anEmailAddress() }))
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

  it('counts only the attempts standing at or before this one, so a row that ranks after it cannot refuse it', async () => {
    // THE RANK BOUND, EXERCISED WITHOUT CONCURRENCY. Twenty attempts for this
    // address, every one inside the window and stamped before the attempt
    // below, but every one carrying an id above the sequence — so each ranks
    // AFTER the attempt being judged. Its rank is therefore one, not
    // twenty-one, and it is admitted.
    //
    // The bursts prove the same rule statistically and this proves it every
    // run: removing `id <= mine` from the ranking query was caught in only
    // three runs out of four by the bursts alone, because whether a racer's
    // row exists yet when you rank depends on scheduling.
    const ip = anAddress()
    await attemptsRankingAfterThisOne(ip, IP_ATTEMPT_LIMIT)

    const decision = await limiter.admitPasswordAttempt({ ip, email: anEmailAddress() })

    expect(decision).toEqual({ ok: true, value: undefined })
  })

  it('spends the password endpoint and the code endpoint from separate budgets', async () => {
    // Different secrets, different keyspaces: a reader who has fumbled their
    // password is not thereby out of code attempts.
    const ip = anAddress()
    for (let attempt = 0; attempt < IP_ATTEMPT_LIMIT + 1; attempt += 1) {
      await limiter.admitPasswordAttempt({ ip, email: anEmailAddress() })
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

})

describe('the per-address window on the password endpoint', () => {
  it('admits ten password attempts against one address and refuses the eleventh, however many addresses they come from', async () => {
    // ONE sign-in address, MANY requesting addresses: each IP sees a single
    // attempt, so the per-IP window cannot be what refuses anything here.
    // Payload's lockout cannot be either — no account is involved at all,
    // which is the case phase ruling F43 exists for.
    const email = anEmailAddress()

    const decisions = []
    for (let attempt = 0; attempt < ADDRESS_PASSWORD_ATTEMPT_LIMIT + 1; attempt += 1) {
      decisions.push(await limiter.admitPasswordAttempt({ ip: anAddress(), email }))
    }

    expect(admitted(decisions)).toBe(ADDRESS_PASSWORD_ATTEMPT_LIMIT)
  })

  it('records the address attempt even when the requesting address is already out of budget', async () => {
    // The same short-circuit the code endpoint is guarded against: a
    // dimension that stopped counting once the other refused would let an
    // attacker grind one sign-in address for free from behind a spent IP.
    const spentIp = anAddress()
    for (let attempt = 0; attempt < IP_ATTEMPT_LIMIT + 1; attempt += 1) {
      await limiter.admitPasswordAttempt({ ip: spentIp, email: anEmailAddress() })
    }
    const email = anEmailAddress()

    await limiter.admitPasswordAttempt({ ip: spentIp, email })

    expect(await recordedAttempts('account', addressKey(email))).toBe(1)
  })

  it('counts the address under a hash, so the table never holds a sign-in address beside an IP', async () => {
    // CLAUDE.md §7 and phase ruling F43: `sign_in_attempts` already holds raw
    // IPs, and an address written in cleartext beside them would put the two
    // halves of an identity in one table.
    const email = anEmailAddress()

    await limiter.admitPasswordAttempt({ ip: anAddress(), email })

    const subjects = await payload.db.pool.query<{ subject: string }>(
      `SELECT subject FROM sign_in_attempts WHERE dimension = 'account' AND endpoint = 'password' AND subject = $1`,
      [addressKey(email)],
    )
    expect(subjects.rows.map((row) => row.subject)).toEqual([expect.stringMatching(/^[0-9a-f]{64}$/u)])
    expect(subjects.rows.map((row) => row.subject)).not.toContain(email)
  })

  it('gives two different addresses two different budgets', async () => {
    const spent = anEmailAddress()
    for (let attempt = 0; attempt < ADDRESS_PASSWORD_ATTEMPT_LIMIT; attempt += 1) {
      await limiter.admitPasswordAttempt({ ip: anAddress(), email: spent })
    }

    const another = await limiter.admitPasswordAttempt({ ip: anAddress(), email: anEmailAddress() })

    expect(another).toEqual({ ok: true, value: undefined })
  })
})

describe('the window sliding', () => {
  it('admits again once the recorded attempts have aged out of the window', async () => {
    const ip = anAddress()
    for (let attempt = 0; attempt < IP_ATTEMPT_LIMIT; attempt += 1) {
      await limiter.admitPasswordAttempt({ ip, email: anEmailAddress() })
    }
    expect(await limiter.admitPasswordAttempt({ ip, email: anEmailAddress() })).toEqual({ ok: false, error: 'rate-limited' })

    await ageAttemptsOutOfTheWindow('ip', ip)

    expect(await limiter.admitPasswordAttempt({ ip, email: anEmailAddress() })).toEqual({ ok: true, value: undefined })
  })

  it('sweeps attempts that have aged out under a DIFFERENT key, so the table is bounded by the window rather than by how many keys were ever seen', async () => {
    // The prune that only touched the key being written bounded growth by the
    // number of distinct keys ever seen — and a spray from many addresses,
    // which is the traffic this limiter exists for, is exactly what
    // manufactures keys. Measured before the fix: three aged rows for one
    // address survived a write against a different one.
    const abandoned = anAddress()
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await limiter.admitPasswordAttempt({ ip: abandoned, email: anEmailAddress() })
    }
    await ageAttemptsOutOfTheWindow('ip', abandoned)

    await limiter.admitPasswordAttempt({ ip: anAddress(), email: anEmailAddress() })

    expect(await recordedAttempts('ip', abandoned)).toBe(0)
  })

  it('prunes the attempts that have aged out, so the table stays bounded without a scheduler', async () => {
    const ip = anAddress()
    for (let attempt = 0; attempt < IP_ATTEMPT_LIMIT; attempt += 1) {
      await limiter.admitPasswordAttempt({ ip, email: anEmailAddress() })
    }
    await ageAttemptsOutOfTheWindow('ip', ip)

    await limiter.admitPasswordAttempt({ ip, email: anEmailAddress() })

    expect(await recordedAttempts('ip', ip)).toBe(1)
  })
})
