/**
 * testDatabaseUrl — where the integration suite's isolated database is,
 * derived from whatever `DATABASE_URL` the environment already provides.
 *
 * ═══ WHY THIS IS DERIVED AND NOT WRITTEN DOWN ═══
 *
 * `vitest.integration.config.ts` set `DATABASE_URL` to the literal
 * `postgres://diary:diary@localhost:5433/diary_test`, and 5433 is one
 * developer's Docker port mapping (`docker-compose.yml` publishes 5432 there
 * because a native Postgres already owns 5432 on that machine). The first CI
 * run after this repository was pushed failed every integration test file:
 * CI's Postgres service listens on 5432, so nothing was listening where that
 * string pointed, and each file's `beforeAll` rejection surfaced as an
 * `undefined` payload in every case beneath it. The two CI jobs do not even agree with each other —
 * `.github/workflows/ci.yml`'s `verify` job reaches it at `localhost:5432`
 * and its `browser` job, which runs inside a container on a Docker network
 * addressed by service name, at `postgres:5432`.
 *
 * So the environment is the only thing that knows where its Postgres is, and
 * the ONE thing this repository knows is which database on it the tests may
 * touch. {@link testDatabaseUrl} therefore changes only the database name and
 * keeps everything else it was given. A list of known hosts and ports would
 * satisfy today's three environments and be the same defect with more
 * branches — the fourth environment fails exactly as CI did.
 *
 * ═══ PATTERN (CLAUDE.md §3.3) ═══
 *
 * None of the seven. One pure function over a string, plus the two constants
 * it is written in terms of. A Result type was considered and rejected: the
 * one caller is a Vitest config being loaded, where a thrown error names the
 * problem before a single test is collected and a `Result` would only be
 * unwrapped into the same throw.
 *
 * ═══ INVARIANTS A FUTURE EDIT COULD BREAK ═══
 *
 *   - **Only the database NAME is replaced.** Host, port, credentials, and
 *     any query parameters are the environment's own and are kept, because
 *     they are the half this repository cannot know.
 *   - **The fallback is a whole URL, not a port.** A developer with nothing
 *     set gets `docker-compose.yml`'s published mapping, which is what every
 *     local run used before this module existed.
 *   - **A malformed value is refused, never quietly replaced by the
 *     fallback.** Falling back would point the suite at this machine's own
 *     mapping while the environment's real setting was broken — a green run
 *     against the wrong server, which is the failure this module exists to
 *     end.
 *   - **The refusal never repeats the value.** A connection string carries a
 *     password, and CLAUDE.md §7 forbids logging secrets, so the message says
 *     which variable is wrong and nothing about what it holds.
 *
 * Depends on: nothing.
 */

/**
 * The one database on the environment's Postgres server that the integration
 * suite may create, migrate and delete rows in.
 *
 * Never `.env`'s own `diary`: `seed.integration.test.ts` deletes the ten
 * seeded journeys by slug before reseeding them, and running that against a
 * developer's dev database would delete a real edited journey the moment its
 * slug matched one of the ten (see `apps/web/lib/testPayload.ts`'s header).
 */
export const TEST_DATABASE_NAME = 'diary_test'

/**
 * Where the test database is when the environment names no Postgres at all:
 * the host port `docker-compose.yml` publishes for local development.
 */
export const DEVELOPER_FALLBACK_DATABASE_URL = `postgres://diary:diary@localhost:5433/${TEST_DATABASE_NAME}`

/**
 * The isolated test database's connection string for the environment this run
 * is in.
 *
 * @param rawDatabaseUrl - `DATABASE_URL` as the environment provides it, which
 *   may be absent or empty.
 * @returns The same connection string with its database name replaced by
 *   {@link TEST_DATABASE_NAME}, or {@link DEVELOPER_FALLBACK_DATABASE_URL}
 *   when the environment names no Postgres.
 * @throws If a value is present but is not a URL — the message names
 *   `DATABASE_URL` and deliberately does not repeat it.
 * @example
 * testDatabaseUrl('postgres://diary:diary@postgres:5432/diary')
 * // 'postgres://diary:diary@postgres:5432/diary_test'
 */
export const testDatabaseUrl = (rawDatabaseUrl: string | undefined): string => {
  if (rawDatabaseUrl === undefined || rawDatabaseUrl === '') return DEVELOPER_FALLBACK_DATABASE_URL

  const server = URL.parse(rawDatabaseUrl)
  if (server === null) {
    throw new Error(
      'DATABASE_URL is not a URL, so the integration suite cannot derive its test database from it. Its value is not repeated here: a connection string carries a password (CLAUDE.md §7).',
    )
  }

  server.pathname = `/${TEST_DATABASE_NAME}`
  return server.toString()
}
