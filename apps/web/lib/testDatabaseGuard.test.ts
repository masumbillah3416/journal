/**
 * testDatabaseGuard.test.ts — an unreachable Postgres is one loud failure, not
 * one silent one per test file.
 *
 * ═══ WHY THIS FILE EXISTS ═══
 *
 * `getTestPayload()` caches `ready` as a PROMISE, so when
 * `ensureDatabaseExists` cannot reach the server that promise rejects once and
 * every later call returns the same rejection. Vitest reports the `beforeAll`
 * failure, and then every case in the file runs with its `payload` still
 * `undefined` — so what this repository's first CI run actually surfaced was
 * `TypeError: Cannot read properties of undefined (reading 'db')`, once per
 * integration file, with the real cause — a port nothing was listening on —
 * named nowhere at all.
 *
 * A whole suite being absent without anybody reading it as absent is the
 * defect. The cases below are about the message a developer is handed: which
 * connection was tried, what Postgres said about it, and that no test ran.
 *
 * WHY THE CONNECTION IS INJECTED. `connect` is the network boundary, which
 * CLAUDE.md §2.3 permits standing in for (and only that — nothing here mocks a
 * module we own). Injecting it is what lets the message be asserted in the
 * Docker-free pre-commit gate rather than only in the gate it guards.
 *
 * THE SECOND DESCRIBE BLOCK is not about the guard's behaviour but about its
 * REGISTRATION. A guard that stops the run is worth nothing if a config stops
 * naming it, and nothing else in this repository would notice: an unreachable
 * database would simply go back to reporting one `undefined` per file. So the
 * two configs are read off disk here, in the pre-commit gate, for the same
 * reason `e2e/ciRegistration.test.ts` reads the workflow (ruling F57) - a
 * detector that runs only in the job it guards reports the fire from inside
 * the building.
 *
 * Depends on: vitest, node:fs, ./testDatabaseGuard, ./docs/markdownCorpus.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { requireReachableTestDatabase } from './testDatabaseGuard'
import { REPOSITORY_ROOT } from './docs/markdownCorpus'

/** The connection string a run in this repository's own Docker would use. */
const A_TEST_DATABASE_URL = 'postgres://diary:s3cret@localhost:5433/diary_test'

/**
 * The refusal `requireReachableTestDatabase` throws, so a case can assert
 * about its text.
 * @param databaseUrl - The connection string to guard.
 * @param failure - What the injected connection rejects with.
 * @returns The error thrown.
 * @throws If the guard returned instead of refusing, so a guard that stops
 *   refusing fails here rather than asserting about nothing.
 */
const refusalFor = async (databaseUrl: string, failure: unknown): Promise<Error> => {
  try {
    await requireReachableTestDatabase({
      databaseUrl,
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- one case below deliberately rejects with a string: `pg` is a boundary, and a driver that rejects with something other than an Error must not have its diagnosis dropped.
      connect: () => Promise.reject(failure),
    })
  } catch (refusal) {
    return refusal instanceof Error ? refusal : new Error(String(refusal))
  }
  throw new Error('the guard was expected to refuse and did not')
}

describe('requireReachableTestDatabase', () => {
  it('says nothing when the server accepts a connection', async () => {
    await expect(
      requireReachableTestDatabase({ databaseUrl: A_TEST_DATABASE_URL, connect: () => Promise.resolve() }),
    ).resolves.toBeUndefined()
  })

  it('probes the maintenance database, because the test database may not exist yet', async () => {
    // `diary_test` is created on first use by `getTestPayload()`, so a probe
    // aimed at it would refuse a perfectly healthy fresh Docker volume.
    const probed: string[] = []

    await requireReachableTestDatabase({
      databaseUrl: A_TEST_DATABASE_URL,
      connect: (url) => {
        probed.push(url)
        return Promise.resolve()
      },
    })

    expect(probed).toEqual(['postgres://diary:s3cret@localhost:5433/postgres'])
  })

  it('names the connection it tried, since the wrong host is the whole defect', async () => {
    const refusal = await refusalFor(A_TEST_DATABASE_URL, new Error('connect ECONNREFUSED 127.0.0.1:5433'))

    expect(refusal.message).toContain('localhost:5433')
  })

  it('masks the password in that message, because a connection string carries one', async () => {
    const refusal = await refusalFor(A_TEST_DATABASE_URL, new Error('connect ECONNREFUSED 127.0.0.1:5433'))

    expect(refusal.message).not.toContain('s3cret')
  })

  it('quotes what Postgres said, so a refused port and a refused password are told apart', async () => {
    const refusal = await refusalFor(A_TEST_DATABASE_URL, new Error('password authentication failed'))

    expect(refusal.message).toContain('password authentication failed')
  })

  it('quotes what an aggregate failure aggregates, since its own message is empty', async () => {
    // MEASURED, not imagined: `pg` on this machine rejects a refused port with
    // an `AggregateError` whose own `message` is the empty string (Node tries
    // every address a host resolves to and collects the failures), so a
    // message built from `.message` alone printed `postgres said:` and
    // nothing - the one line that says WHICH problem this is.
    const refused = new AggregateError([new Error('connect ECONNREFUSED 127.0.0.1:5999')], '')

    const refusal = await refusalFor(A_TEST_DATABASE_URL, refused)

    expect(refusal.message).toContain('connect ECONNREFUSED 127.0.0.1:5999')
  })

  it('names the failure by type when it carries no message at all', async () => {
    const refusal = await refusalFor(A_TEST_DATABASE_URL, new Error(''))

    expect(refusal.message).toContain('Error (no message)')
  })

  it('quotes a rejection that is not an Error rather than dropping it', async () => {
    const refusal = await refusalFor(A_TEST_DATABASE_URL, 'the pool closed')

    expect(refusal.message).toContain('the pool closed')
  })

  it('says that no integration test ran, so an empty result is not read as a pass', async () => {
    const refusal = await refusalFor(A_TEST_DATABASE_URL, new Error('connect ECONNREFUSED 127.0.0.1:5433'))

    expect(refusal.message).toContain('no integration test ran')
  })

  it('keeps the original failure as its cause, so the stack is not thrown away', async () => {
    const original = new Error('connect ECONNREFUSED 127.0.0.1:5433')

    const refusal = await refusalFor(A_TEST_DATABASE_URL, original)

    expect(refusal.cause).toBe(original)
  })

  it('refuses a connection string that is not a URL, naming the variable', async () => {
    await expect(
      requireReachableTestDatabase({ databaseUrl: 'not a database url', connect: () => Promise.resolve() }),
    ).rejects.toThrow(/DATABASE_URL/u)
  })
})

describe('the reachability guard', () => {
  /** The `globalSetup` entry both integration runs have to name. */
  const REGISTRATION = "globalSetup: ['./vitest.integration.globalSetup.ts']"

  /**
   * Read a repository file as text.
   * @param file - Its repository-relative path.
   * @returns The file's contents.
   */
  const text = (file: string): string => readFileSync(path.join(REPOSITORY_ROOT, file), 'utf8')

  it('is registered by the config `verify:full` gates on, and by the fast local one', () => {
    // `vitest.integration.config.ts` is what `test:integration:coverage` -
    // and therefore `verify:full`, and therefore CI - actually runs;
    // `vitest.config.ts`'s `integration` project is what
    // `npm run test:integration` runs. A guard in one and not the other is a
    // developer and CI being told different things about the same database.
    const unregistered = ['vitest.integration.config.ts', 'vitest.config.ts'].filter(
      (config) => !text(config).includes(REGISTRATION),
    )

    expect(
      unregistered,
      'these configs no longer run the reachability guard, so an unreachable Postgres goes back to reporting one undefined per integration file',
    ).toEqual([])
  })
})
