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
 *     under `apps/web/lib/**` or `apps/web/collections/**` (collection and migration
 *     tests against the real Docker Postgres). Runs only in `npm run verify:full`.
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
 * pre-commit gate is Docker-free), so `postgres-queue.ts` and its contract
 * suite/fixtures - reachable only from an `*.integration.test.ts` file - are
 * excluded here rather than counted as 0%-covered against thresholds they
 * have no way to meet from this run. They are not left ungated: a SEPARATE
 * coverage pass, `vitest.integration.config.ts` (run via
 * `npm run test:integration:coverage`, chained into `npm run verify:full`),
 * runs the same integration tests with `--coverage` scoped to exactly these
 * files, with its own thresholds. See docs/testing.md.
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
          include: ['packages/*/src/**/*.test.ts', 'apps/web/lib/**/*.test.ts'],
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
          ],
          exclude: ['**/node_modules/**'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['packages/*/src/**/*.ts', 'apps/web/lib/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        '**/*.d.ts',
        '**/index.ts',
        // Gated instead by vitest.integration.config.ts's dedicated pass -
        // see this file's own header and docs/testing.md.
        'apps/web/lib/adapters/postgres-queue.ts',
        'apps/web/lib/adapters/contract/queue-contract.ts',
        'apps/web/lib/adapters/contract/queue-fixtures.ts',
      ],
      thresholds: {
        // Repository-wide floor.
        lines: 90, branches: 90, functions: 90,
        // Pure logic: every branch is a real behaviour, so every branch is covered.
        'packages/domain/src/**/*.ts': {
          lines: 100, branches: 100, functions: 100,
        },
        'apps/web/lib/**/*.ts': {
          lines: 95, branches: 95, functions: 95,
        },
      },
    },
  },
})
