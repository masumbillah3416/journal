/**
 * testPayload — bootstraps and returns a Payload instance for an isolated
 * integration-test database, never the developer's own dev database.
 *
 * FINDING 2 fix (Task 10/11 review, round 1): every `*.integration.test.ts`
 * file used to call `getPayload()` directly, which connects to whatever
 * `DATABASE_URL` is active - in practice the same database `npm run dev` and
 * `npm run db:seed` use. `seed.integration.test.ts`'s own cleanup (deleting
 * the ten real journeys by slug before reseeding them) then risked deleting
 * a real journey a developer had actually edited through the admin, the
 * moment its slug happened to match one of the ten. That is a data-loss trap
 * that fires exactly once, unpredictably.
 *
 * The fix is a genuinely separate database, not a marker column: `vitest.
 * config.ts`'s `integration` project and `vitest.integration.config.ts` both
 * set `DATABASE_URL` to point at `diary_test` instead of `diary` (same
 * Postgres instance and credentials, different database name - see
 * `docker-compose.yml`). `getTestPayload()` is what every integration test
 * file calls instead of `getPayload()` directly: it creates that database on
 * first use if it does not exist yet (a fresh Docker volume, or a fresh CI
 * run, never ran `docker-entrypoint-initdb.d` against it) and applies every
 * pending migration, so the isolated database is self-bootstrapping
 * regardless of whether tests are invoked via `npm run`, `npx vitest`
 * directly, or an editor's test runner. It is deliberately never dropped:
 * persisting across runs is the same trade-off the real `diary` database
 * already makes, and isolation - not a fresh database every time - is what
 * this fix is for.
 *
 * `CREATE DATABASE` cannot run inside Payload's own connection pool (that
 * pool's very first connection attempt is to `diary_test`, which does not
 * exist yet on a fresh volume) or inside a transaction (Postgres forbids
 * `CREATE DATABASE` there), so this connects with a plain `pg` client to the
 * same server's default `postgres` maintenance database first.
 * Depends on: `pg`, `./env.js`, `./payload.js`, `./migrate.js`.
 */
import { Client } from 'pg'
import { env } from './env.js'
import { getPayload } from './payload.js'
import { runMigrateUp } from './migrate.js'

/**
 * Creates the database named in `databaseUrl` on its Postgres server, unless
 * it already exists.
 * @param databaseUrl - A `postgres://` connection string naming the target database.
 */
const ensureDatabaseExists = async (databaseUrl: string): Promise<void> => {
  const target = new URL(databaseUrl)
  const databaseName = target.pathname.replace(/^\//, '')

  const adminUrl = new URL(databaseUrl)
  adminUrl.pathname = '/postgres' // Postgres's own always-present maintenance database.
  const client = new Client({ connectionString: adminUrl.toString() })
  await client.connect()
  try {
    const { rows } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [databaseName])
    if (rows.length === 0) {
      // Database names cannot be bind-parameters in Postgres; databaseName
      // comes from our own DATABASE_URL, never from user input.
      await client.query(`CREATE DATABASE "${databaseName}"`)
    }
  } finally {
    await client.end()
  }
}

let ready: Promise<Awaited<ReturnType<typeof getPayload>>> | undefined

/**
 * Returns the shared Payload instance for the integration-test database,
 * creating that database and applying pending migrations on first call in
 * this process. Every `*.integration.test.ts` file's `beforeAll` should call
 * this instead of `getPayload()` directly.
 * @returns The initialised {@link Payload} instance, connected to the
 *   isolated test database named in the active `DATABASE_URL`.
 */
export const getTestPayload = async (): ReturnType<typeof getPayload> => {
  ready ??= (async () => {
    await ensureDatabaseExists(env.DATABASE_URL)
    const payload = await getPayload()
    await runMigrateUp()
    return payload
  })()
  return ready
}
