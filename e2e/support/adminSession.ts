/**
 * adminSession — gives a browser test a real signed-in session, by writing the
 * two rows the guard reads.
 *
 * ═══ WHY A BROWSER TEST CANNOT SIGN ITSELF IN ═══
 *
 * Phase 2 Task 10 guards `/admin/sign-in/done`: an unauthenticated request is
 * answered with a redirect to `/admin/sign-in`, which is the whole point of the
 * task. Three suites need that screen anyway — `e2e/reset.spec.ts` measures its
 * geometry, `e2e/a11y.spec.ts` runs axe over it, `e2e/visual.spec.ts` holds its
 * three baselines — and none of them can reach it by driving the form:
 *
 *   - the account's `otpRequired` reads as REQUIRED when it is `NULL` and when
 *     there is no account at all (`readSignInScreen.ts`), so every sign-in this
 *     database can offer goes through the one-time-code step; and
 *   - the code is delivered by `console-mailer`, whose outbox is a process
 *     variable in the server. A browser cannot see it.
 *
 * Turning the second factor off for a fixture account is not a way round it
 * either: `readSignInScreen` prints the LOWEST-ID account's flag in the sign-in
 * screen's footer line, so an account with `otpRequired: false` would change
 * what `/admin/sign-in` says and move the baselines this helper exists to keep
 * still. The fixture below is written with the column left at its default,
 * `true`, so the footer says exactly what it says with no account at all.
 *
 * ═══ WHAT IT WRITES, AND WHY IT IS SQL RATHER THAN THE LOCAL API ═══
 *
 * Two rows: a `users` row (only `email` is `NOT NULL`; the password columns
 * stay null, because nothing here ever authenticates with a password) and a
 * `sessions` row holding the SHA-256 of a fresh identifier. That is exactly
 * what `apps/web/lib/auth/sessions.ts` stores, and it is deliberately the only
 * thing this file duplicates — importing that module would pull Payload and its
 * whole config into the Playwright process, for two `INSERT`s.
 *
 * INVARIANT — THE HASH HERE MUST STAY SHA-256 OF THE RAW IDENTIFIER, hex. It is
 * the one fact this file shares with `sessions.ts`, and if that module ever
 * changes how it stores a token, every suite using this helper fails at the
 * guard rather than silently passing — which is the right direction.
 *
 * NOTHING HERE LOGS THE IDENTIFIER (CLAUDE.md §7).
 *
 * Depends on: node:crypto, pg, @next/env (for the same `.env` this repository's
 * own `apps/web/lib/env.ts` loads).
 */
import { createHash, randomBytes } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import nextEnv from '@next/env'
import { Client } from 'pg'

// `@next/env` ships as CJS; destructuring after a default import is the
// interop-safe form `apps/web/lib/env.ts` uses for the same package.
const { loadEnvConfig } = nextEnv

// e2e/support -> e2e -> repo root, where `.env` sits next to `.env.example`.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

/**
 * The address of the account these suites sign in as.
 *
 * A fixed address rather than a per-run one: the row is reused across suites
 * and workers, and two workers racing to create it is handled by the `ON
 * CONFLICT` below rather than by hoping they do not.
 */
export const FIXTURE_ADMIN_EMAIL = 'browser-suite@task-ten-fixture.example'

/** How long the session this helper mints lasts. Long enough for any suite. */
const FIXTURE_SESSION_MS = 60 * 60_000

/**
 * A connected client against whatever database the app under test is using.
 *
 * `process.env` first, `.env` second, and never the other way round:
 * `loadEnvConfig` is additive, so the value `docker-compose.yml` sets for the
 * container wins over the `localhost:5433` in the bind-mounted `.env`. That is
 * the same guarantee `apps/web/lib/env.ts` relies on.
 *
 * @returns The connected client. The caller closes it.
 * @throws If no `DATABASE_URL` can be found at all — which is a misconfigured
 *   run, and should fail loudly here rather than as a navigation timeout.
 */
const connect = async (): Promise<Client> => {
  loadEnvConfig(repoRoot)
  const connectionString = process.env['DATABASE_URL']
  if (connectionString === undefined || connectionString === '') {
    throw new Error('adminSession needs DATABASE_URL, from the environment or the repository’s .env')
  }

  const client = new Client({ connectionString })
  await client.connect()
  return client
}

/**
 * Mints a live session for the fixture account.
 *
 * @returns The opaque identifier a browser presents in `td-session`.
 * @throws If the fixture account cannot be written or found.
 * @example
 * const session = await aSignedInSession()
 * await context.addCookies([{ name: 'td-session', value: session, url: `${baseURL}/admin` }])
 */
export const aSignedInSession = async (): Promise<string> => {
  const client = await connect()
  try {
    const account = await client.query<{ id: number }>(
      `INSERT INTO users (email, created_at, updated_at)
       VALUES ($1, now(), now())
       ON CONFLICT (email) DO UPDATE SET updated_at = now()
       RETURNING id`,
      [FIXTURE_ADMIN_EMAIL],
    )
    const userId = account.rows[0]?.id
    if (userId === undefined) throw new Error('the fixture admin account was neither created nor found')

    const session = randomBytes(32).toString('base64url')
    await client.query(
      `INSERT INTO sessions (user_id, token_hash, expires_at, created_at, updated_at)
       VALUES ($1, $2, $3, now(), now())`,
      [userId, createHash('sha256').update(session).digest('hex'), new Date(Date.now() + FIXTURE_SESSION_MS)],
    )
    return session
  } finally {
    await client.end()
  }
}

/**
 * Deletes the fixture account and every session it holds.
 *
 * @returns Once both are gone.
 * @example
 * test.afterAll(async () => { await removeSignedInFixture() })
 */
export const removeSignedInFixture = async (): Promise<void> => {
  const client = await connect()
  try {
    await client.query(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email = $1)`, [
      FIXTURE_ADMIN_EMAIL,
    ])
    await client.query(`DELETE FROM users WHERE email = $1`, [FIXTURE_ADMIN_EMAIL])
  } finally {
    await client.end()
  }
}
