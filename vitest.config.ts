/**
 * vitest.config.ts — workspace test configuration and coverage gates.
 *
 * Splits tests into two Vitest projects so the pre-commit gate never depends on
 * infrastructure a developer might not have running locally:
 *   - unit: pure tests, no I/O, no database. Runs in `npm run verify` (pre-commit).
 *   - integration: tests requiring DATABASE_URL, matched by `*.integration.test.ts`.
 *     Runs only in `npm run verify:full` (CI). None exist yet.
 * Depends on: vitest/config.
 */
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['packages/*/src/**/*.test.ts', 'apps/web/lib/**/*.test.ts'],
          exclude: ['**/*.integration.test.ts', '**/node_modules/**'],
        },
      },
      {
        test: {
          name: 'integration',
          include: ['packages/*/src/**/*.integration.test.ts', 'apps/web/lib/**/*.integration.test.ts'],
          exclude: ['**/node_modules/**'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['packages/*/src/**/*.ts', 'apps/web/lib/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.d.ts', '**/index.ts'],
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
