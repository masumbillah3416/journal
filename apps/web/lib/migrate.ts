/**
 * migrate — thin wrappers over Payload's migration runner.
 *
 * Exists so migration reversibility can be asserted by a test rather than
 * discovered during an incident (CLAUDE.md §2, "Migration" row: every
 * migration runs up, down, and up again against a seeded database). Depends
 * on the Payload instance from `./payload`, the validated `env` from
 * `./env`, and `pg` for the one question Payload cannot answer.
 *
 * `runMigrateDownToZero` exists because `payload.db.migrateDown()` rolls back
 * only the LAST BATCH — every migration the most recent `migrate()` applied
 * together, which on a database brought up in one go is all of them, and on
 * one brought up incrementally is just the newest. A reversibility test built
 * on a single `migrateDown()` therefore proves whatever the local batch
 * history happens to make it prove, and the oldest migration's `down()` — the
 * one that drops everything, and the one carrying hand-fixed statement
 * ordering — may never execute at all. Rolling to zero removes that
 * dependence on history.
 *
 * `appliedMigrationCount` asks Postgres directly rather than asking Payload,
 * because the state it has to describe includes "the schema is gone": the
 * initial migration's `down()` drops `payload_migrations` itself, so a
 * Payload query for that collection would throw at exactly the moment the
 * answer is zero.
 *
 * Exercised by `collections/collections.integration.test.ts`'s reversibility
 * case and by `testPayload.ts`'s self-bootstrap, both against real Docker
 * Postgres. This module is never imported by the unit project (see
 * vitest.config.ts, which excludes it from that pass's coverage `include` for
 * exactly this reason), so it carries no whole-module `c8 ignore` — it is
 * measured for real by `vitest.integration.config.ts` instead (see that
 * file's thresholds and docs/testing.md).
 */
import { Client } from 'pg'
import { env } from './env'
import { getPayload } from './payload'

/** Rolls the most recently applied batch of migrations back. */
export const runMigrateDown = async (): Promise<void> => {
  const payload = await getPayload()
  await payload.db.migrateDown()
}

/** Applies every pending migration. */
export const runMigrateUp = async (): Promise<void> => {
  const payload = await getPayload()
  await payload.db.migrate()
}

/**
 * Counts the migrations Postgres currently records as applied.
 * @returns The number of rows in `payload_migrations`, or `0` when that table
 *   does not exist — which is what a database rolled all the way back to zero
 *   looks like, since the initial migration's `down()` drops it.
 */
export const appliedMigrationCount = async (): Promise<number> => {
  const client = new Client({ connectionString: env.DATABASE_URL })
  await client.connect()
  try {
    // `to_regclass` returns NULL rather than raising for an absent relation,
    // so this is safe to ask of a database with no schema at all. Counting in
    // the same statement would not be: Postgres plans the whole query up
    // front and would still fail to resolve the table name.
    const probe = await client.query<{ present: string | null }>(
      `SELECT to_regclass('public.payload_migrations')::text AS present`,
    )
    if (!probe.rows.some((row) => row.present !== null)) return 0

    const counted = await client.query<{ applied: string }>('SELECT count(*) AS applied FROM payload_migrations')
    // `count(*)` always returns exactly one row, but `noUncheckedIndexedAccess`
    // does not know that. Summing the rows says the same thing as reading
    // `rows[0]` without introducing a defensive branch no test can ever take,
    // which would leave this file permanently short of its 100% gate.
    return counted.rows.reduce((total, row) => total + Number(row.applied), 0)
  } finally {
    await client.end()
  }
}

/**
 * Rolls every applied migration back, one batch at a time, until none remain
 * — so the oldest migration's `down()` runs regardless of how the batches
 * were originally applied. See this module's header for why a single
 * `runMigrateDown()` is not equivalent.
 * @throws If a rollback leaves the applied count unchanged, which would
 *   otherwise loop forever.
 */
export const runMigrateDownToZero = async (): Promise<void> => {
  let remaining = await appliedMigrationCount()
  while (remaining > 0) {
    await runMigrateDown()
    const stillApplied = await appliedMigrationCount()
    /* c8 ignore start -- unreachable while Payload deletes the migration row it just rolled back; this guard exists so that if that ever stops holding, the failure is a named error rather than a suite that hangs until the timeout */
    if (stillApplied >= remaining) {
      throw new Error(
        `Rollback made no progress: ${String(stillApplied)} migration(s) still applied after migrateDown().`,
      )
    }
    /* c8 ignore stop */
    remaining = stillApplied
  }
}
