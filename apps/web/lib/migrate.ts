/**
 * migrate — thin wrappers over Payload's migration runner.
 *
 * Exists so migration reversibility can be asserted by a test rather than
 * discovered during an incident (CLAUDE.md §2, "Migration" row: every
 * migration runs up, down, and up again against a seeded database). Depends
 * on the Payload instance from `./payload.js`.
 *
 * Exercised by `collections/collections.integration.test.ts`'s "runs down and
 * up again" case and by `testPayload.ts`'s self-bootstrap, both against real
 * Docker Postgres — these two functions have no branches of their own to
 * unit-test in isolation, and a mock proving "this calls the thing it calls"
 * would not add confidence the integration suite doesn't already provide.
 * This module is never imported by the unit project (see vitest.config.ts,
 * which excludes it from that pass's coverage `include` for exactly this
 * reason), so it carries no `c8 ignore` — it is measured for real by
 * `vitest.integration.config.ts` instead, at the honest 100% both functions
 * actually achieve there (see that file's thresholds and docs/testing.md).
 */
import { getPayload } from './payload.js'

/** Rolls the most recently applied migration back. */
export const runMigrateDown = async (): Promise<void> => {
  const payload = await getPayload()
  await payload.db.migrateDown()
}

/** Applies every pending migration. */
export const runMigrateUp = async (): Promise<void> => {
  const payload = await getPayload()
  await payload.db.migrate()
}
