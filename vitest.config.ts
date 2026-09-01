/**
 * vitest.config.ts — workspace test configuration and coverage gates.
 *
 * Splits tests into two Vitest projects so the pre-commit gate never depends on
 * infrastructure a developer might not have running locally:
 *   - unit: pure tests, no I/O, no database. Runs in `npm run verify` (pre-commit).
 *     Sets fixed dummy values for the three env vars `apps/web/lib/env.ts`
 *     validates at import time, so importing it never needs Docker or a real
 *     `.env` file — those values are never used to open a real connection here.
 *   - unit-dom: React component tests, matched by `*.test.tsx`, in a jsdom
 *     environment. A SEPARATE project rather than a wider glob on `unit`
 *     because the environment differs: `unit`'s files are pure and run in
 *     Node, and paying jsdom's setup cost for every one of them to
 *     accommodate a handful of component tests is the wrong trade. Runs in
 *     `npm run verify` alongside `unit` - `npm run test:unit` names both
 *     projects, and adding a project without adding it there would leave its
 *     files collected by nobody, which is the exact defect this project
 *     exists to close.
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
 * This config's own coverage pass executes the `unit` and `unit-dom` projects
 * (the pre-commit gate is Docker-free), so `postgres-queue.ts`, `migrate.ts` and
 * the queue contract suite/fixtures - reachable only from an
 * `*.integration.test.ts` file - are excluded here rather than counted as
 * 0%-covered against thresholds they have no way to meet from this run. They
 * are not left ungated: a SEPARATE coverage pass, `vitest.integration.config.ts`
 * (run via `npm run test:integration:coverage`, chained into
 * `npm run verify:full`), runs the same integration tests with `--coverage`
 * scoped to exactly these files, with its own thresholds. See docs/testing.md.
 *
 * `apps/web/app/**` and `apps/web/components/**` (Task 1 of Phase 1) are
 * included here NOW, before either holds any of the phase's own code, so
 * that Phase 1's first server action, page component or mapper lands already
 * measured rather than retrofitted - Phase 0 shipped three separate
 * incidents of code invisible to every coverage pass because no `include`
 * matched it (CLAUDE.md §2.1: "an unmeasured file looks exactly like a fully-
 * covered one"). `apps/web/lib/**`'s coverage include already widens to
 * `.tsx`; without the same widening here, a `components/` tree landing
 * `.tsx` files would have been that fourth incident.
 *
 * `apps/web/app/**` today holds only Payload's own six route/layout
 * re-exports under `(payload)/` (`docs/testing.md`'s "one deliberate hole" -
 * no logic of ours, and nothing runnable without a real Next.js request
 * context). Three of the six (`layout.tsx` and the two GraphQL routes) wrap
 * their executable body - imports included, not just the export, since an
 * unimported file's imports are themselves uncovered lines - in
 * `c8 ignore start`/`stop`, rather than a silent config-level exclude: no
 * OTHER coverage pass can see them either (unlike `migrate.ts` etc. above,
 * there is no integration-only test that could import a route handler), so
 * a per-file `c8 ignore` is the honest treatment CLAUDE.md §2.1 asks for
 * where nothing can measure a file, not exclude-and-regate, which promises
 * a pass that does not exist. `c8 ignore file` was tried first and
 * rejected: for a file this coverage pass's `include` matches but no test
 * ever imports, `@vitest/coverage-v8`'s zero-coverage path measures it
 * through a line-comment scanner that recognises `next`/`start`/`stop` but
 * not `file` (verified - `ignore file` left these files reporting real,
 * non-zero, un-ignored statement/function counts at 0% executed, exactly
 * the false negative this task exists to prevent).
 *
 * The other three - the ones under a Next.js dynamic-route directory
 * (`[...slug]`, `[[...segments]]`) - are excluded in the `exclude` array
 * below instead, with their own comment: `c8 ignore start`/`stop` does not
 * take effect on that path shape either, verified by reproducing one of
 * them byte-for-byte under an unbracketed sibling directory and watching
 * the copy get ignored correctly while the bracketed original did not. See
 * that comment for the full reasoning.
 *
 * `apps/web/app/**`'s 95%/95%/95% threshold below therefore binds real code
 * the moment it lands (Task 13's diary route and any further page under
 * `app/`), not the ignored or excluded scaffolding.
 *
 * `apps/web/components/**` held no files at all until Task 7 of Phase 1, so
 * it deliberately carried no per-glob threshold - a threshold against zero
 * files is a vacuous pass, not a gate. Task 7 landed the book's frame, page
 * stack and the two hooks that drive them there, so the directory now
 * carries an explicit 90%/90%/90% threshold below: the repository-wide floor
 * this file's earlier revision always said these files would fall under once
 * they existed, now named rather than inherited, per CLAUDE.md §2.1's "adding
 * code in a new directory means adding that directory to an include, with a
 * real threshold, in the same commit".
 *
 * The `unit-dom` project gains two settings with Task 7's first real
 * components: a `setupFiles` entry (see `vitest.dom-setup.ts`) and
 * `css.modules.classNameStrategy: 'non-scoped'`, which makes a CSS Module
 * import resolve each key to its own literal name instead of `undefined`.
 * Nothing in a jsdom test asserts a computed style - jsdom performs no
 * layout, which is exactly why the rules that matter (a back face's
 * `pointer-events: none` above all) are asserted in a real browser by
 * `e2e/book.spec.ts` - so the strategy is purely about components rendering
 * readable class names under test.
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
        // The automatic JSX runtime, so a `.test.tsx` file does not need an
        // `import React from 'react'` line that nothing in it references.
        // Without it esbuild emits classic `React.createElement` calls and
        // every component test dies with "React is not defined". It belongs
        // on this project, not at the root: Vitest builds each project from
        // its own inline config, so a root-level `esbuild` block does not
        // reach them (verified - the failure above persisted until it moved
        // here).
        esbuild: { jsx: 'automatic' as const },
        test: {
          name: 'unit-dom',
          // React refuses to run `act()` unless IS_REACT_ACT_ENVIRONMENT is
          // true on the global object, and reads it from there rather than
          // from an import - so it is set once here for every component and
          // hook test instead of four repeated lines at the top of each.
          setupFiles: ['./vitest.dom-setup.ts'],
          // CSS Modules are not compiled for this project (nothing here
          // asserts a computed style - jsdom performs no layout, so the rules
          // that matter, `pointer-events: none` on a back face above all, are
          // asserted in the browser by e2e/book.spec.ts). `classNameStrategy:
          // 'non-scoped'` makes `styles.leaf` resolve to the literal string
          // `leaf` rather than `undefined`, so a component test renders the
          // same class names a reader would see in the DOM instead of
          // `class="undefined"`.
          css: { modules: { classNameStrategy: 'non-scoped' as const } },
          // Until this project existed, no project's `include` matched
          // `*.test.tsx` and no project set a DOM environment. A React
          // component test would therefore have been collected by NOBODY -
          // and a test collected by nobody does not fail, it silently is not
          // there, so the run stays green and the report says nothing. Phase
          // 1 lands the first components; this is here before them, with
          // `apps/web/lib/react-harness.test.tsx` proving the harness runs.
          include: ['packages/*/src/**/*.test.tsx', 'apps/web/**/*.test.tsx'],
          exclude: ['**/node_modules/**', '**/.next/**'],
          environment: 'jsdom',
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
      include: [
        'packages/*/src/**/*.ts',
        'packages/*/src/**/*.tsx',
        'apps/web/lib/**/*.ts',
        'apps/web/lib/**/*.tsx',
        'apps/web/scripts/**/*.ts',
        // Task 1 of Phase 1: see this file's own header for why these two
        // are widened in ahead of any real code landing in them.
        'apps/web/app/**/*.ts',
        'apps/web/app/**/*.tsx',
        'apps/web/components/**/*.ts',
        'apps/web/components/**/*.tsx',
      ],
      exclude: [
        '**/*.test.ts',
        '**/*.test.tsx',
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
        // readBookBundle.ts (Task 6 of Phase 1) is reachable only from
        // readBookBundle.integration.test.ts - it needs a real Payload/
        // Postgres to read journeys/pages/media from - so it is gated by
        // vitest.integration.config.ts instead, same reasoning as the queue
        // files and testPayload.ts above.
        'apps/web/lib/readBookBundle.ts',
        // Task 1 of Phase 1: these three are the app/(payload)/** files
        // whose parent directory is a Next.js dynamic-route segment written
        // in square brackets (`[...slug]`, `[[...segments]]`) - required by
        // Next.js's own routing convention, not something this repository
        // can rename. `c8 ignore start`/`stop` (used successfully in the
        // three sibling files that do NOT sit under a bracketed directory -
        // layout.tsx, api/graphql/route.ts, api/graphql-playground/route.ts,
        // each fully excluded with no config entry needed) does not take
        // effect for a file under one: verified by reproducing the same
        // page.tsx content, byte-for-byte, under an unbracketed sibling
        // directory (apps/web/app/(payload)/cms-test-nobracket/page.tsx,
        // deleted after the comparison) - the copy was correctly ignored,
        // the original was not, with the tool instead reporting its header
        // comment's own line range as "uncovered" once the ignored code
        // beneath it produced no `DA` entries of its own to anchor against.
        // That is a bug in how `@vitest/coverage-v8` scans source text for
        // ignore hints on this path shape, not a defect in the file. A
        // config-level exclude, with this same reason, is the honest
        // substitute for a source-level `c8 ignore` that cannot be trusted
        // to hold on this path shape - CLAUDE.md §2.1's two sanctioned
        // treatments (exclude-and-regate; `c8 ignore`) both assume the
        // chosen mechanism actually works, which this one demonstrably does
        // not here.
        // Task 7 of Phase 1 added the diary's own bracketed route to this
        // list, and re-verified the defect above rather than inheriting the
        // claim. The control sits inside the very same coverage run: this
        // task's `(diary)/layout.tsx` - identical `c8 ignore start`/`stop`
        // wrapping, identically never imported by any test, but NOT under a
        // bracketed directory - is correctly reported as 0 of 0 with no
        // uncovered lines, while `(diary)/p/[n]/page.tsx`, wrapped exactly
        // the same way, was reported with its whole body (lines 1-22)
        // uncovered. The bracket is the only difference between them, so it
        // is the scanner that fails, not the file. The file itself qualifies
        // for CLAUDE.md §2.1's narrow carve-out on all three counts: it was
        // read and holds zero authored logic (await the route params, read
        // the bundle, render `<Book>` - its one real decision, what `<n>`
        // means, is delegated to `pageIndexFromParam`, which has its own
        // 100%-covered suite in packages/domain); the tooling defect is named
        // and reproduced above; and this entry names the exact path, so a
        // future file placed beside it under the same bracketed parent is not
        // swept into the same hole and must justify its own exclusion. Its
        // runtime behaviour is covered in a real browser by e2e/book.spec.ts
        // and e2e/smoke.spec.ts. Revisit when @vitest/coverage-v8's version
        // changes - a fixed scanner removes the justification.
        'apps/web/app/(diary)/p/\\[n\\]/page.tsx',
        'apps/web/app/(payload)/api/\\[...slug\\]/route.ts',
        'apps/web/app/(payload)/cms/\\[\\[...segments\\]\\]/page.tsx',
        'apps/web/app/(payload)/cms/\\[\\[...segments\\]\\]/not-found.tsx',
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
        // Task 1 of Phase 1: matches apps/web/lib's bar, since Phase 1's
        // server actions, page components and BookBundle mappers are the
        // same kind of code - our own logic, not framework glue. Every file
        // currently under apps/web/app/** is either `c8 ignore start`/`stop`
        // wrapped or config-excluded (see this file's own header), so this
        // threshold has nothing to bind against yet; it starts applying the
        // moment real code lands.
        // No equivalent entry for apps/web/components/**: that directory
        // holds no files yet (`.gitkeep` only), and a threshold against zero
        // files is the vacuous pass this task was told not to add - it
        // falls under the repo-wide floor above once populated instead.
        'apps/web/app/**/*.ts': {
          lines: 95,
          branches: 95,
          functions: 95,
        },
        'apps/web/app/**/*.tsx': {
          lines: 95,
          branches: 95,
          functions: 95,
        },
        // Task 7 of Phase 1 populated apps/web/components/** with its first
        // real files (the book's frame, page stack and the two hooks that
        // drive them), so the directory now gets the explicit threshold
        // CLAUDE.md §2.1 asks for - "adding code in a new directory means
        // adding that directory to an include, with a real threshold, in the
        // same commit". It is set at the repository-wide 90% floor, which is
        // the bar this config's own header always said these files would
        // fall under once they existed; the higher 95% bar is reserved for
        // `lib/**` and `app/**`, whose files are server-side logic rather
        // than a React binding whose last few percent are framework glue.
        'apps/web/components/**/*.tsx': {
          lines: 90,
          branches: 90,
          functions: 90,
        },
        'apps/web/components/**/*.ts': {
          lines: 90,
          branches: 90,
          functions: 90,
        },
      },
    },
  },
})
