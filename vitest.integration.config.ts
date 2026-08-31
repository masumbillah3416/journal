/**
 * vitest.integration.config.ts — coverage gate for integration-only lib code.
 *
 * `vitest.config.ts`'s coverage pass only ever executes the `unit` project
 * (the pre-commit gate is Docker-free), so any file reachable exclusively
 * through an `*.integration.test.ts` - real Postgres required - is invisible
 * to that gate. `postgres-queue.ts`, `queue-contract.ts` and
 * `queue-fixtures.ts` are that case: they are excluded from
 * `vitest.config.ts`'s coverage `include` (see its own header) rather than
 * counted as 0%-covered there, but excluding them is only honest if they are
 * actually measured somewhere else - this file is that somewhere else.
 *
 * It runs the same integration test files as `vitest.config.ts`'s
 * `integration` project, with `--coverage` scoped to just the files no unit
 * test can reach. Thresholds are chosen to be genuinely met today, not
 * aspirational - see docs/testing.md for the measured numbers and the
 * rationale for stopping short of the 95% `apps/web/lib/**` bar the unit
 * pass enforces: `claim()`'s two error-catch branches (an unexpected
 * database failure mid-transaction, and enqueue() failing) have no organic
 * trigger without mocking the module under test, which CLAUDE.md §2.3
 * forbids ("no mocking what we own").
 *
 * `apps/web/scripts/seed.ts` and `seed-data.ts` (Task 11) join this file for
 * the same reason: `seed.integration.test.ts` is their only test, and it
 * needs a real Payload/Postgres. `apps/web/lib/testPayload.ts` joins it for
 * the same reason as those two, plus one more: `vitest.config.ts`'s own
 * coverage `include` broadly covers `apps/web/lib/**`, and testPayload.ts is
 * large enough (unlike the small migrate.ts it sits beside) that leaving it
 * at 0% there pulled that bucket's aggregate below its own 95% threshold -
 * so it is excluded there and regated here, same as the queue files.
 *
 * `apps/web/lib/migrate.ts` (`runMigrateDown`/`runMigrateUp`) joins this file
 * for the same reason as the queue files: it is reachable only from
 * `testPayload.ts`'s self-bootstrap and `collections.integration.test.ts`'s
 * "runs down and up again" case, both integration-only. It previously
 * carried a whole-module `c8 ignore` instead of an exclude-and-regate, which
 * suppressed it from every coverage run rather than moving it to the one
 * that can actually see it - see migrate.ts's own header. Both functions are
 * simple wrappers with no branches of their own, so 100% here is the honest,
 * fully-achieved number, not a rounded-up one.
 *
 * `DATABASE_URL` points at `diary_test`, a separate database from `.env`'s
 * `diary` - never the developer's own dev data - for the same reason as
 * `vitest.config.ts`'s `integration` project (see its header): every
 * integration test file calls `apps/web/lib/testPayload.ts`'s
 * `getTestPayload()`, not `getPayload()` directly.
 * Depends on: vitest/config.
 */
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'integration-coverage',
    include: [
      'packages/*/src/**/*.integration.test.ts',
      'apps/web/lib/**/*.integration.test.ts',
      'apps/web/collections/**/*.integration.test.ts',
      'apps/web/scripts/**/*.integration.test.ts',
    ],
    exclude: ['**/node_modules/**'],
    env: {
      DATABASE_URL: 'postgres://diary:diary@localhost:5433/diary_test',
    },
    // See vitest.config.ts's own header: these files share one live database,
    // and collections.integration.test.ts migrates the schema down and up as
    // part of its own test - concurrent files would race real DDL against
    // real reads/writes.
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      include: [
        'apps/web/lib/adapters/postgres-queue.ts',
        'apps/web/lib/adapters/contract/queue-contract.ts',
        'apps/web/lib/adapters/contract/queue-fixtures.ts',
        'apps/web/scripts/seed.ts',
        'apps/web/scripts/seed-data.ts',
        'apps/web/lib/testPayload.ts',
        'apps/web/lib/migrate.ts',
      ],
      thresholds: {
        // postgres-queue.ts's two error-catch branches (an unexpected DB
        // failure inside enqueue(), and inside claim()'s rollback) have no
        // organic trigger without mocking the module under test (CLAUDE.md
        // §2.3 forbids mocking what we own) or deliberately breaking the
        // test database - so 75% branches here is the real, achieved
        // number, not an aspirational one. claim()'s SKIP LOCKED line
        // itself - the safety-critical one - executes on every call
        // regardless of outcome, so it is fully exercised.
        'apps/web/lib/adapters/postgres-queue.ts': { lines: 93, branches: 75, functions: 100 },
        'apps/web/lib/adapters/contract/queue-contract.ts': { lines: 100, branches: 100, functions: 100 },
        'apps/web/lib/adapters/contract/queue-fixtures.ts': { lines: 100, branches: 100, functions: 100 },
        // testPayload.ts's ensureDatabaseExists() only takes its
        // `CREATE DATABASE` branch the very first time any integration test
        // ever runs against a given Postgres volume - every run after that
        // finds `diary_test` already exists, which is the entire point of
        // not tearing it down between runs (see this module's own header).
        // 93% lines / 75% branches / 100% functions is what a repository
        // that has already bootstrapped `diary_test` once genuinely
        // measures, not what a first-ever run would.
        'apps/web/lib/testPayload.ts': { lines: 93, branches: 75, functions: 100 },
        // seed-data.ts is a pure data literal - 100% by construction, every
        // call reads every field.
        'apps/web/scripts/seed-data.ts': { lines: 100, branches: 100, functions: 100 },
        // seed.ts: 100% lines/functions. 83.72% branches is the real,
        // measured number: seed.integration.test.ts's own `beforeAll`
        // deletes the ten journeys (and the About portrait) first, so the
        // suite deterministically exercises both the create and the
        // found-existing/update branch of every upsert regardless of what an
        // earlier run (or `npm run db:seed` itself) left in the database.
        // The remaining branches are defensive guards with no organic
        // trigger from the ten real journeys' own data: parseStartsOn's two
        // unrecognised-format fallbacks and its `?? null` (every real
        // `dates` string parses to a real value), accentFor's `??
        // journeyAccents[0]` fallback (the round-robin index is always in
        // bounds for a fixed 5-element tuple), and brandOrThrow's error
        // branch (Payload never hands back an empty id).
        'apps/web/scripts/seed.ts': { lines: 100, branches: 83, functions: 100 },
        // migrate.ts: both functions are two-line wrappers with no branches
        // of their own - runMigrateDown() and runMigrateUp() are each called
        // at least once (collections.integration.test.ts's "runs down and up
        // again" case, plus testPayload.ts's self-bootstrap calling
        // runMigrateUp()), so every line, branch and function is genuinely
        // exercised.
        'apps/web/lib/migrate.ts': { lines: 100, branches: 100, functions: 100 },
      },
    },
  },
})
