/**
 * testDatabaseGuard — refuses the whole integration run, once and loudly, when
 * its Postgres server cannot be reached.
 *
 * ═══ WHY THIS EXISTS: A MISSING SUITE THAT NOBODY READ AS MISSING ═══
 *
 * `testPayload.ts`'s `getTestPayload()` caches `ready` as a PROMISE. When
 * `ensureDatabaseExists` cannot reach the server, that promise rejects, and
 * every later call in the process returns the same rejection. Vitest reports
 * the `beforeAll` failure — and then runs each case in the file anyway, with
 * its `payload` still `undefined`. So what this repository's first CI run
 * surfaced was `TypeError: Cannot read properties of undefined (reading
 * 'db')`, once per integration file, with the actual cause — a port nothing
 * was listening on — named nowhere.
 *
 * The wrong port was a typo, fixed in `testDatabaseUrl.ts`. THE DEFECT IS
 * THAT A WHOLE SUITE CAN BE ABSENT WITHOUT ANYBODY READING IT AS ABSENT, and
 * CLAUDE.md §11 makes that suite half of the gate every completion claim
 * rests on. This runs ONCE, before any file is collected, and stops the run
 * with a single message naming the connection it tried and what Postgres said
 * about it.
 *
 * ═══ WHY IT PROBES THE MAINTENANCE DATABASE ═══
 *
 * `diary_test` does not exist until the first `getTestPayload()` creates it —
 * a fresh Docker volume or a fresh CI run never ran `CREATE DATABASE` against
 * it. A probe aimed at `diary_test` would therefore refuse a perfectly healthy
 * server, so this connects to `postgres`, the maintenance database every
 * server has, exactly as `ensureDatabaseExists` does one step later.
 *
 * ═══ PATTERN (CLAUDE.md §3.3) ═══
 *
 * None of the seven. It is a guard clause with its connection injected:
 * `connect` is the network boundary CLAUDE.md §2.3 permits standing in for,
 * which is what lets the message this module exists for be asserted in the
 * Docker-free pre-commit gate instead of only in the gate it guards.
 * `e2e/support/globalSetup.ts` is the shape this follows for the browser
 * suite; `vitest.integration.globalSetup.ts` is the file that wires this one
 * to a real `pg` client.
 *
 * ═══ INVARIANTS A FUTURE EDIT COULD BREAK ═══
 *
 *   - **The refusal never carries the password.** CLAUDE.md §7 forbids logging
 *     secrets, and a connection string is one, so the message names the
 *     server with its password masked.
 *   - **What the server said is quoted rather than diagnosed.** A refused port
 *     (`ECONNREFUSED`) and refused credentials are different problems with the
 *     same shape, and guessing between them would put a wrong diagnosis in
 *     front of the developer with more confidence than the evidence.
 *   - **The message says that no test ran.** A run that stops here reports no
 *     failing case at all, and "no failures" must not be readable as "the
 *     suite passed".
 *
 * Depends on: nothing.
 */

/** The database every Postgres server has, used only to prove the server answers. */
const MAINTENANCE_DATABASE = 'postgres'

/** What stands in for the password in anything this module prints. */
const MASKED = '***'

/** A run's Postgres server, and how to open a connection to it. */
export interface TestDatabaseProbe {
  /** The integration suite's own connection string, from `testDatabaseUrl()`. */
  readonly databaseUrl: string
  /**
   * Opens and closes a connection to `url`, rejecting if it cannot.
   * @param url - The connection string to open.
   */
  readonly connect: (url: string) => Promise<void>
}

/**
 * The same server, addressed at its maintenance database.
 * @param server - The parsed connection string.
 * @returns A connection string naming `postgres` instead of the test database.
 */
const maintenanceUrlOf = (server: URL): string => {
  const maintenance = new URL(server)
  maintenance.pathname = `/${MAINTENANCE_DATABASE}`
  return maintenance.toString()
}

/**
 * The same connection string with its password masked, safe to print.
 * @param server - The parsed connection string.
 * @returns The connection string with `***` where the password was.
 */
const withoutPassword = (server: URL): string => {
  const masked = new URL(server)
  if (masked.password !== '') masked.password = MASKED
  return masked.toString()
}

/**
 * What a rejection says, whether or not it is an `Error`, and whether or not
 * it says it in its own message.
 *
 * `pg` rejects a refused port with an `AggregateError` whose own `message` is
 * EMPTY — Node tries every address the host resolved to and collects the
 * failures — so a quote taken from `.message` alone printed the one
 * diagnostic line blank (measured against a dead port; the case is in this
 * module's test file).
 * @param failure - Whatever the connection rejected with.
 * @returns The text to quote, never empty.
 */
const saidBy = (failure: unknown): string => {
  if (!(failure instanceof Error)) return String(failure)

  // `AggregateError.errors` is typed `any[]` by the standard library, and
  // `any` is banned (CLAUDE.md §3.1); the cast narrows it to something this
  // function already handles rather than widening anything.
  const aggregated = failure instanceof AggregateError ? (failure.errors as readonly unknown[]).map(saidBy) : []
  const spoken = [failure.message, ...aggregated].filter((line) => line !== '')

  return spoken.length === 0 ? `${failure.name} (no message)` : spoken.join('; ')
}

/**
 * The one message a developer whose Postgres is unreachable is given.
 * @param maskedServer - The connection tried, with its password masked.
 * @param said - What the server, or the driver, said about it.
 * @returns The refusal's text.
 */
const unreachableMessage = (maskedServer: string, said: string): string =>
  [
    'The integration suite could not open a connection to its Postgres server, so no integration test ran.',
    '',
    `  tried:         ${maskedServer}`,
    `  postgres said: ${said}`,
    '',
    'This is reported here, once, rather than as one "Cannot read properties of undefined" per',
    'integration file - which is what the first CI run of this repository printed, with the real',
    'cause named nowhere. Nothing beneath this ran, so a run with no failing case is not a pass.',
    '',
    'Usually one of:',
    '  - the local Postgres is not up          ->  docker compose up -d postgres',
    '  - DATABASE_URL names a host or port this environment does not publish (this repository',
    '    publishes 5433 locally and CI publishes 5432 - see docs/deviations.md section 45)',
    '  - the credentials in DATABASE_URL are not this server’s',
  ].join('\n')

/**
 * Refuses the run unless the integration suite's Postgres server answers.
 *
 * @param probe - The suite's connection string, and how to open a connection.
 * @returns Nothing, when the server accepted a connection.
 * @throws A single error naming the connection tried (password masked), what
 *   the server said, and that no test ran — with the original failure as its
 *   `cause`. Also throws if `databaseUrl` is not a URL, which means
 *   `DATABASE_URL` is not one either.
 * @example
 * await requireReachableTestDatabase({ databaseUrl, connect })
 */
export const requireReachableTestDatabase = async ({ databaseUrl, connect }: TestDatabaseProbe): Promise<void> => {
  const server = URL.parse(databaseUrl)
  if (server === null) {
    throw new Error(
      'The integration suite was handed a connection string that is not a URL, so DATABASE_URL is not one either. Its value is not repeated here: a connection string carries a password (CLAUDE.md §7).',
    )
  }

  try {
    await connect(maintenanceUrlOf(server))
  } catch (failure) {
    throw new Error(unreachableMessage(withoutPassword(server), saidBy(failure)), { cause: failure })
  }
}
