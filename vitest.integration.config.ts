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
 * needs a real Payload/Postgres.
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
        // seed-data.ts is a pure data literal - 100% by construction, every
        // call reads every field.
        'apps/web/scripts/seed-data.ts': { lines: 100, branches: 100, functions: 100 },
        // seed.ts: 100% lines/functions. 80.48% branches is the real,
        // measured number: seed.integration.test.ts's own `beforeAll`
        // deletes the ten journeys first, so the suite deterministically
        // exercises both the create and the found-existing/update branch of
        // every upsert regardless of what an earlier run (or `npm run
        // db:seed` itself) left in the database. The remaining branches are
        // defensive guards with no organic trigger from the ten real
        // journeys' own data: parseStartsOn's two unrecognised-format
        // fallbacks and its `?? null` (every real `dates` string parses to a
        // real value), brandOrThrow's error branch (Payload never hands back
        // an empty id), and `firstJourneyNumericId === undefined`
        // (journeySeeds is never empty).
        'apps/web/scripts/seed.ts': { lines: 100, branches: 80, functions: 100 },
      },
    },
  },
})
