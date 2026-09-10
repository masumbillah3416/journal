/**
 * vitest.integration.globalSetup.ts — proves the integration suite's Postgres
 * server answers, ONCE, before any test file is collected.
 *
 * ═══ WHY A GLOBAL SETUP AND NOT A `beforeAll` ═══
 *
 * Every integration file's `beforeAll` already calls `getTestPayload()`, which
 * caches its result as a PROMISE — so an unreachable server rejects once and
 * every case beneath it then runs with `payload` still `undefined`. That is
 * what the first CI run of this repository printed: `TypeError: Cannot read
 * properties of undefined (reading 'db')`, once per integration file, with the
 * real cause named nowhere. A global setup is the only hook that runs before
 * the first file and can stop the whole run, which is what an absent suite
 * needs — see `apps/web/lib/testDatabaseGuard.ts` for the message, and
 * `apps/web/lib/testDatabaseUrl.ts` for where the connection string comes
 * from.
 *
 * `e2e/support/globalSetup.ts` is the same shape for the browser suite.
 *
 * ═══ WHY ITS BODY CARRIES A `c8 ignore`, WHICH IS MEASURED RATHER THAN
 * ASSUMED ═══
 *
 * This file IS in `vitest.integration.config.ts`'s coverage `include`, so
 * CLAUDE.md §2.1's "no file is in neither include" is satisfied by inclusion
 * rather than by an argument. But a `globalSetup` module runs in Vitest's own
 * MAIN process, not in a test worker, and `@vitest/coverage-v8` instruments
 * the workers — so a file that demonstrably ran (the guard below refuses the
 * run when it fails) is reported at **0% of lines, every line uncovered**.
 * Measured, not inferred: with this path in that `include` and no ignore
 * hint, one integration file's run reported
 * `...lobalSetup.ts | 0 | 100 | 100 | 0 | 39-79`.
 *
 * A false 0% is exactly as misleading as an unmeasured file, so the treatment
 * is §2.1's second one: a whole-body `c8 ignore` that carries its reason,
 * with the reason being that no coverage pass CAN see this execution. The
 * imports are inside it too, since an uninstrumented file's own import lines
 * are themselves reported as uncovered.
 *
 * WHAT THAT COSTS, AND WHY IT IS BOUNDED. Everything this file could get
 * wrong — which database is probed, what the refusal says, whether the
 * password is masked, whether a non-`Error` rejection survives — lives in
 * `apps/web/lib/testDatabaseGuard.ts`, which the Docker-free pass measures at
 * 100% and which has a case per behaviour. What is left here is the `pg`
 * binding, and every integration run there is executes it.
 *
 * PATTERN (CLAUDE.md §3.3): Ports & Adapters, at its smallest — this is the
 * adapter that binds the guard's injected `connect` to a real `pg` client.
 *
 * Depends on: pg, ./apps/web/lib/testDatabaseGuard, ./apps/web/lib/testDatabaseUrl.
 */
/* c8 ignore start -- a globalSetup runs in Vitest's main process, which the v8 provider does not instrument; measured as a false 0% (see this file's header), and every decision it could get wrong lives in testDatabaseGuard.ts at 100% */
import { Client } from 'pg'
import { requireReachableTestDatabase } from './apps/web/lib/testDatabaseGuard'
import { testDatabaseUrl } from './apps/web/lib/testDatabaseUrl'

/**
 * How long to wait for the server to answer.
 *
 * Set explicitly because `pg`'s default is no timeout at all: a wrong PORT is
 * refused instantly, but a wrong HOST leaves the connection waiting on the
 * operating system's own TCP timeout, which on a CI runner is long enough to
 * read as a hung job rather than as a failed one.
 */
const CONNECTION_TIMEOUT_MS = 10_000

/**
 * Opens a connection to `url` and closes it again.
 * @param url - The connection string to open.
 * @throws Whatever `pg` rejects with, which the guard quotes rather than
 *   diagnoses.
 */
const openAndCloseAConnection = async (url: string): Promise<void> => {
  const client = new Client({ connectionString: url, connectionTimeoutMillis: CONNECTION_TIMEOUT_MS })
  // `connect()` is outside the try/finally on purpose: a client that never
  // connected has nothing to close, and `end()` on one can reject with a
  // second error that hides the first.
  await client.connect()
  await client.end()
}

/**
 * Refuses the run unless the integration suite's Postgres server answers.
 * @returns Nothing, when it does.
 * @throws The guard's single message, when it does not.
 */
const guardTheIntegrationDatabase = async (): Promise<void> =>
  requireReachableTestDatabase({
    databaseUrl: testDatabaseUrl(process.env.DATABASE_URL),
    connect: openAndCloseAConnection,
  })

export default guardTheIntegrationDatabase
/* c8 ignore stop */
