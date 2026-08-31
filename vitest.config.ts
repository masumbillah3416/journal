/**
 * vitest.config.ts — workspace test configuration and coverage gates.
 *
 * Splits tests into two Vitest projects so the pre-commit gate never depends on
 * infrastructure a developer might not have running locally:
 *   - unit: pure tests, no I/O, no database. Runs in `npm run verify` (pre-commit).
 *     Sets fixed dummy values for the three env vars `apps/web/lib/env.ts`
 *     validates at import time, so importing it never needs Docker or a real
 *     `.env` file — those values are never used to open a real connection here.
 *   - integration: tests requiring DATABASE_URL, matched by `*.integration.test.ts`
 *     under `apps/web/lib/**`, `apps/web/collections/**` or `apps/web/scripts/**`
 *     (collection, migration and seed tests against the real Docker Postgres).
 *     Runs only in `npm run verify:full`. Its own `DATABASE_URL` points at
 *     `diary_test`, a separate database from `.env`'s `diary` - never the
 *     developer's own dev data - bootstrapped on demand by
 *     `apps/web/lib/testPayload.ts`'s `getTestPayload()`, which every
 *     integration test file calls instead of `getPayload()` directly.
 *
 * Root-level `fileParallelism: false`: the `integration` project's files
 * share one live database, and `collections.integration.test.ts` migrates
 * the schema down and back up as part of its own test - run concurrently
 * with `postgres-queue.integration.test.ts`'s use of the `jobs` table, that
 * produced a real, reproducible failure ("relation jobs does not exist")
 * from the two files' workers overlapping. Setting `fileParallelism: false`
 * inside the `integration` project's own `test` block did not stop the
 * overlap in practice; only the top-level setting did, so it applies to
 * both projects. The unit project's files have no shared external state, so
 * running them one at a time costs a little wall-clock time (it is still
 * sub-second) rather than any correctness risk.
 *
 * This config's own coverage pass only ever executes the `unit` project (the
 * pre-commit gate is Docker-free), so `postgres-queue.ts`, `migrate.ts` and
 * the queue contract suite/fixtures - reachable only from an
 * `*.integration.test.ts` file - are excluded here rather than counted as
 * 0%-covered against thresholds they have no way to meet from this run. They
 * are not left ungated: a SEPARATE coverage pass, `vitest.integration.config.ts`
 * (run via `npm run test:integration:coverage`, chained into
 * `npm run verify:full`), runs the same integration tests with `--coverage`
 * scoped to exactly these files, with its own thresholds. See docs/testing.md.
 * Depends on: vitest/config.
 */
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // See the module header: must be set here, at the root, not inside the
    // `integration` project's own `test` block - a per-project setting did
    // not prevent that project's files from running concurrently in practice.
    fileParallelism: false,
    projects: [
      {
        test: {
          name: 'unit',
          include: ['packages/*/src/**/*.test.ts', 'apps/web/lib/**/*.test.ts', 'apps/web/scripts/**/*.test.ts'],
          exclude: ['**/*.integration.test.ts', '**/node_modules/**'],
          env: {
            DATABASE_URL: 'postgres://unit-test:unused@localhost:5432/unit-test',
            PAYLOAD_SECRET: 'unit-test-secret-value-not-used-for-real-auth',
            MEDIA_ORIGIN: 'http://localhost:3000',
          },
        },
      },
      {
        test: {
          name: 'integration',
          include: [
            'packages/*/src/**/*.integration.test.ts',
            'apps/web/lib/**/*.integration.test.ts',
            'apps/web/collections/**/*.integration.test.ts',
            'apps/web/scripts/**/*.integration.test.ts',
          ],
          exclude: ['**/node_modules/**'],
          env: {
            // A separate database on the same Postgres server as `.env`'s
            // real DATABASE_URL, never the developer's own dev database -
            // see apps/web/lib/testPayload.ts's header (Task 10/11 review
            // finding 2). Every integration test file calls `getTestPayload()`
            // from that module, not `getPayload()` directly, so this value is
            // what they actually connect to.
            DATABASE_URL: 'postgres://diary:diary@localhost:5433/diary_test',
          },
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['packages/*/src/**/*.ts', 'apps/web/lib/**/*.ts', 'apps/web/scripts/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        '**/*.d.ts',
        '**/index.ts',
        // Gated instead by vitest.integration.config.ts's dedicated pass -
        // see this file's own header and docs/testing.md.
        'apps/web/lib/adapters/postgres-queue.ts',
        'apps/web/lib/adapters/contract/queue-contract.ts',
        'apps/web/lib/adapters/contract/queue-fixtures.ts',
        // migrate.ts (runMigrateDown/runMigrateUp) is imported only by
        // testPayload.ts and collections.integration.test.ts, neither of
        // which the unit project ever runs, so it is gated instead by
        // vitest.integration.config.ts - same reasoning as the queue files
        // above. It previously carried a whole-module `c8 ignore` here
        // instead of this exclude, which hid it from coverage everywhere,
        // not just this Docker-free pass - see migrate.ts's own header.
        'apps/web/lib/migrate.ts',
        // seed.ts and seed-data.ts are reachable only from
        // seed.integration.test.ts (they need a real Payload/Postgres), so
        // they are gated by vitest.integration.config.ts instead - same
        // reasoning as the queue files above.
        'apps/web/scripts/seed.ts',
        'apps/web/scripts/seed-data.ts',
        // testPayload.ts (Task 10/11 review finding 2) is reachable only
        // from an `*.integration.test.ts` file - it needs a real Postgres
        // server to create diary_test against - so it is gated by
        // vitest.integration.config.ts instead, same reasoning as the queue
        // files above. Unlike migrate.ts and queue.ts (which stay
        // ungated, tolerated at 0% in this file's repo-wide aggregate - see
        // their own files), testPayload.ts is large enough to have pulled
        // `apps/web/lib/**`'s aggregate below its 95% threshold here, so it
        // needs the same explicit exclude-and-regate treatment as the queue
        // files.
        'apps/web/lib/testPayload.ts',
      ],
      thresholds: {
        // Repository-wide floor.
        lines: 90,
        branches: 90,
        functions: 90,
        // Pure logic: every branch is a real behaviour, so every branch is covered.
        'packages/domain/src/**/*.ts': {
          lines: 100,
          branches: 100,
          functions: 100,
        },
        'apps/web/lib/**/*.ts': {
          lines: 95,
          branches: 95,
          functions: 95,
        },
      },
    },
  },
})
