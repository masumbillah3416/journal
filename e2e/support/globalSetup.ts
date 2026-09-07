/**
 * globalSetup — clears the sign-in rate-limit window once, before the browser
 * suite runs, so that running the suite twice in a row is not a failure.
 *
 * ═══ WHY THIS EXISTS: A CORRECTLY-WORKING LIMITER DEFEATING ITS OWN SUITE ═══
 *
 * `packages/domain/src/auth/rateWindow.ts` allows twenty attempts per subject
 * per fifteen minutes on the `password` endpoint, and
 * `apps/web/lib/auth/passwordReset.ts` deliberately spends that same budget
 * for a reset request rather than taking a window of its own (its header says
 * why). Every local request keys on `::1`, so one full run of this suite
 * leaves more in-window rows than the limit allows — measured: twenty-four
 * against a limit of twenty — and a second run inside fifteen minutes fails
 * `e2e/reset.spec.ts:171`, which looks exactly like a regression and is not.
 *
 * The choice was written up as "wait fifteen minutes, or accept the failure",
 * with a warning against loosening the limit. That was a false dichotomy, and
 * the fifth whole-branch review said so: the third option is fixture hygiene.
 * This clears the window ONCE PER RUN, before any spec starts.
 *
 * ═══ WHAT IT DOES NOT TOUCH, WHICH IS THE POINT ═══
 *
 * No limit, no window length, no endpoint, and no case. Every rate-limit case
 * in this suite and in the integration suite builds its OWN counts inside a
 * single run — `e2e/signIn.spec.ts` and `e2e/reset.spec.ts` submit the forms
 * they need — so starting from an empty window changes nothing any of them
 * asserts. What it removes is the dependence on how long ago somebody last ran
 * the suite, which is not a property of the product.
 *
 * A whole-table `DELETE` rather than a scoped one, because the table is a
 * cache of attempts that can affect no decision after their window:
 * `rateLimit.ts` prunes it on every write for the same reason. Clearing it
 * cannot make a refusal into an admission for any case here, since no case
 * asserts a refusal it did not itself cause.
 *
 * `DELETE` RATHER THAN `TRUNCATE`, AND THAT IS MEASURED RATHER THAN CHOSEN.
 * The first version of this ran `TRUNCATE TABLE sign_in_attempts` and Postgres
 * refused it: `cannot truncate a table referenced in a foreign key
 * constraint`. `payload_locked_documents_rels` carries an
 * `ON DELETE CASCADE` reference to this table, which `DELETE` honours by
 * clearing those lock rows with it and `TRUNCATE` refuses without a `CASCADE`
 * nobody should hand a whole schema. The rows are few, so the cost of the
 * slower statement is nothing measurable.
 *
 * PATTERN (CLAUDE.md §3.3): none — this is a fixture factory's smallest form,
 * a single idempotent statement run once. It reads `DATABASE_URL` through
 * `apps/web/lib/env.ts` rather than off `process.env`, so a misconfigured
 * environment fails here with that module's message rather than with a
 * connection error (CLAUDE.md §3.1: validation at the boundary).
 *
 * Depends on: pg, and `apps/web/lib/env.ts`.
 */
import { Client } from 'pg'
import { env } from '../../apps/web/lib/env'

/** The table `apps/web/lib/auth/rateLimit.ts` counts attempts in. */
const ATTEMPTS_TABLE = 'sign_in_attempts'

/**
 * Empties the sign-in attempt window.
 *
 * @throws If the table is absent, rather than passing quietly — a database
 *   this suite can run against is a migrated one, and an absent table would
 *   otherwise be discovered as a navigation timeout inside a spec.
 */
const clearTheAttemptWindow = async (): Promise<void> => {
  const client = new Client({ connectionString: env.DATABASE_URL })
  await client.connect()
  try {
    // `to_regclass` answers NULL rather than raising for a relation that is not
    // there, so the diagnosis below is this module's rather than Postgres's.
    const present = await client.query<{ readonly table: string | null }>('SELECT to_regclass($1)::text AS table', [
      `public.${ATTEMPTS_TABLE}`,
    ])
    if (present.rows[0]?.table === null || present.rows[0]?.table === undefined) {
      throw new Error(`${ATTEMPTS_TABLE} is not in this database; run \`npm run db:migrate\` before the browser suite`)
    }

    await client.query(`DELETE FROM ${ATTEMPTS_TABLE}`)
  } finally {
    await client.end()
  }
}

export default clearTheAttemptWindow
