/**
 * vitest.config.ts — workspace test configuration and coverage gates.
 *
 * Splits tests into two Vitest projects so the pre-commit gate never depends on
 * infrastructure a developer might not have running locally:
 *   - unit: pure tests, no I/O, no database. Runs in `npm run verify` (pre-commit).
 *     Sets fixed dummy values for the three env vars `apps/web/lib/env.ts`
 *     validates at import time, so importing it never needs Docker or a real
 *     `.env` file — those values are never used to open a real connection here.
 *     Its `include` also reaches the `e2e` directory's `.test.ts` files (NOT
 *     its `.spec.ts` ones, which are Playwright's), for the one file there
 *     that is a file read rather than a browser test — see that glob's own
 *     comment and ruling F57.
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
          include: [
            'packages/*/src/**/*.test.ts',
            'apps/web/lib/**/*.test.ts',
            'apps/web/scripts/**/*.test.ts',
            // `apps/web/collections/**/*.test.ts` - the NON-integration ones.
            // A collection config is a plain object and `users.ts` imports
            // only types from `payload`, so a check over the numbers OTHER
            // modules are written against (`users.lockout.test.ts`: the
            // lockout window against `rateWindow.ts`'s) needs no Docker and
            // belongs in the pre-commit gate rather than in CI. The
            // integration project's own glob below still owns
            // `*.integration.test.ts`, and the two patterns are disjoint.
            'apps/web/collections/**/*.test.ts',
            // `eslint-rules/**/*.test.js` — the ESLint rule that makes an
            // unguarded Server Action a lint error, and its RuleTester cases.
            // Both are plain JavaScript because ESLint loads a config and its
            // plugins through Node rather than a bundler, so a `.ts` rule would
            // need a loader inside the pre-commit hook. The rule is the guard
            // Phase 4 rests on, so its behaviour belongs in the gate Husky runs
            // rather than only in CI. See docs/testing.md.
            'eslint-rules/**/*.test.js',
            // `apps/web/middleware.ts` sits at the app's own root, where
            // Next.js requires it - see its header. Without this glob its
            // test file would be collected by nobody, which is the exact
            // failure mode this config's header exists to prevent.
            'apps/web/*.test.ts',
            // `e2e/ciRegistration.test.ts` (ruling F57): the guard that says
            // every browser spec is named by CI and by an npm script. It
            // reads four files off disk and needs no browser, so it belongs
            // in the PRE-COMMIT gate rather than in the browser job it
            // guards - being a Playwright spec is the whole reason it never
            // fired while `e2e/codeStep.spec.ts` gated nothing for two
            // commits. Only `*.test.ts` is matched here; `playwright.config.ts`
            // owns `e2e/*.spec.ts` and narrows its own `testMatch` so the two
            // runners cannot collect each other's files.
            'e2e/**/*.test.ts',
          ],
          exclude: ['**/*.integration.test.ts', '**/node_modules/**'],
          env: {
            DATABASE_URL: 'postgres://unit-test:unused@localhost:5432/unit-test',
            PAYLOAD_SECRET: 'unit-test-secret-value-not-used-for-real-auth',
            MEDIA_ORIGIN: 'http://localhost:3000',
            ADMIN_ORIGIN: 'http://localhost:3000',
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
            ADMIN_ORIGIN: 'http://localhost:3000',
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
        // `apps/web/migrations/index.ts`: named by its exact path, not
        // widened to `apps/web/migrations/**` - its sibling migration files
        // need a real Postgres connection to execute their `up()`/`down()`
        // and are measured instead by `vitest.integration.config.ts`'s own
        // `apps/web/migrations/**` include. This one file needs neither, so
        // it is measured here instead by `apps/web/lib/migrationsIndex.test.ts`
        // (matched by this project's plain `apps/web/lib/**/*.test.ts` glob
        // above - no new glob needed). That test does NOT live beside the
        // barrel it tests: Payload's own `readMigrationFiles` treats every
        // file in `migrationDir` ending `.ts`/`.js` as a migration to
        // dynamically import UNLESS its name is exactly `index.ts`/`index.js`
        // - it does not recognise `*.test.ts` as anything special. A
        // `index.test.ts` colocated in `apps/web/migrations/` was tried first
        // and broke every integration test that bootstraps Payload (each
        // self-migrates on first connect): `readMigrationFiles` tried to
        // `dynamicImport` the test file itself as a migration and failed
        // resolving its own extension-less `./index` import. See the `exclude`
        // array below for why the wildcard this replaced was wrong.
        'apps/web/migrations/index.ts',
        // Task 1 of Phase 1: see this file's own header for why these two
        // are widened in ahead of any real code landing in them.
        'apps/web/app/**/*.ts',
        'apps/web/app/**/*.tsx',
        'apps/web/components/**/*.ts',
        'apps/web/components/**/*.tsx',
        // Next.js requires the middleware at the app's own root, so no
        // `apps/web/lib/**` or `apps/web/app/**` glob above reaches it -
        // and an unmeasured file looks exactly like a fully-covered one
        // (CLAUDE.md §2.1). It is named here, and gated at 100% below.
        'apps/web/middleware.ts',
        // `eslint-rules/**/*.js` — repository tooling that ESLint loads
        // directly, and the one piece of it that enforces a SECURITY.md
        // requirement rather than a convention. It is measured here because an
        // unmeasured rule is one whose branches can rot into always-passing,
        // which is the exact failure the nine text scans before it had.
        'eslint-rules/**/*.js',
      ],
      exclude: [
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/*.d.ts',
        // This was `'**/index.ts'` until Phase 1's final review. CLAUDE.md
        // §2.1 requires an exclusion to name "the file's exact path, never a
        // directory wildcard", so that a future file placed alongside it is
        // not silently swept into the same hole - and a `**/index.ts` excuses
        // every `index.ts` this repository will ever hold, sight unseen.
        // Narrowing it to `apps/web/migrations/index.ts` - the one file the
        // wildcard actually described - made it visible that the file then
        // sat in NEITHER config's measured set: `vitest.integration.config.ts`
        // also excludes it by the same exact path, because
        // `readMigrationFiles` filters `index.ts`/`index.js` out and no
        // integration test executes it either. That is exactly the gap
        // CLAUDE.md §2.1 forbids without a named, demonstrated tooling
        // defect - and there isn't one here, only a file nothing organically
        // imports - so the fix is to measure it, not to excuse it: it is
        // included above instead, with a dedicated
        // `apps/web/lib/migrationsIndex.test.ts` (a plain import and an
        // array-shape assertion, no Postgres needed) and its own 100%
        // threshold below. It is NOT in this exclude list.
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
        // files above. Unlike `apps/web/lib/ports/queue.ts` - which stays in
        // the measured set and prints 0% because it is TYPE-ONLY, two
        // `import type`s and two `export interface`s with no executable
        // statement, so it contributes no counted lines to any aggregate -
        // testPayload.ts is large enough to have pulled `apps/web/lib/**`'s
        // aggregate below its 95% threshold here, so it needs the same
        // explicit exclude-and-regate treatment as the queue files. This
        // comment named migrate.ts as ungated for two rounds while migrate.ts
        // sat in this same `exclude` array eleven lines above, at the entry
        // just before `apps/web/scripts/seed.ts`.
        'apps/web/lib/testPayload.ts',
        // readBookBundle.ts (Task 6 of Phase 1) is reachable only from
        // readBookBundle.integration.test.ts - it needs a real Payload/
        // Postgres to read journeys/pages/media from - so it is gated by
        // vitest.integration.config.ts instead, same reasoning as the queue
        // files and testPayload.ts above.
        'apps/web/lib/readBookBundle.ts',
        // readGalleryBundle.ts and readGalleryDownload.ts (Task 14 of Phase
        // 1) are reachable only from their own `*.integration.test.ts` files
        // - both need a real Payload/Postgres, and readGalleryDownload also
        // needs the derivative files the media collection wrote to disk - so
        // they are gated by vitest.integration.config.ts instead, same
        // reasoning as readBookBundle.ts above.
        'apps/web/lib/readGalleryBundle.ts',
        'apps/web/lib/readGalleryDownload.ts',
        // otpService.ts and its test-side probes (Phase 2 Task 3) are
        // reachable only from otpService.integration.test.ts - every one of
        // this module's operations reads or writes an `otpChallenges` row
        // through a real Payload, and the whole point of testing it against a
        // real Postgres is that "only a hash was stored" and "the challenge is
        // now consumed" are claims about a database, not about a mock. Gated
        // by vitest.integration.config.ts instead, same reasoning as
        // readBookBundle.ts above.
        'apps/web/lib/auth/otpService.ts',
        'apps/web/lib/auth/testing/otpProbes.ts',
        // rateLimit.ts (Phase 2 Task 4) is reachable only from
        // rateLimit.integration.test.ts, for the same reason otpService.ts
        // is: every one of its operations writes and then ranks a
        // `signInAttempts` row, and the whole claim being tested - that a
        // concurrent burst is admitted in arrival order up to the limit and
        // no further - is a claim about what Postgres did, not about what a
        // mock agreed to. Gated by vitest.integration.config.ts instead. Its
        // pure arithmetic lives in `packages/domain/src/auth/rateWindow.ts`,
        // which this pass DOES measure, at the domain's 100% bar.
        'apps/web/lib/auth/rateLimit.ts',
        // sessions.ts (Phase 2 Task 6) is reachable only from
        // sessions.integration.test.ts, for the same reason otpService.ts and
        // rateLimit.ts are: every one of its operations reads or writes a
        // `sessions` row, and the claims being tested - that a superseded
        // identifier stops authenticating, that a revoked row is refused, and
        // that "keep me signed in" lengthens the ROW rather than the token -
        // are claims about what Postgres holds, not about what a mock agreed
        // to. Gated by vitest.integration.config.ts instead. Its pure logic
        // lives in `packages/domain/src/auth/session.ts`, which this pass
        // DOES measure, at the domain's 100% bar.
        'apps/web/lib/auth/sessions.ts',
        // signIn.ts and passwordReset.ts (Phase 2 Task 5) are reachable only
        // from their own `*.integration.test.ts` files, for the same reason
        // as the three above and one more that is specific to them: what they
        // assert is that an unknown address and a wrong password cost the
        // same TIME, and the time in question is a PBKDF2 derivation Payload
        // performs inside a real login against a real row. A mocked
        // credential store would make both arms instant and the measurement
        // meaningless. Gated by vitest.integration.config.ts instead. Their
        // pure logic - the mask, the window arithmetic, the session lifetimes
        // - lives in `packages/domain/src/auth/**`, which this pass DOES
        // measure, at the domain's 100% bar.
        'apps/web/lib/auth/signIn.ts',
        'apps/web/lib/auth/passwordReset.ts',
        // readSignInScreen.ts (Phase 2 Task 7) is reachable only from
        // readSignInScreen.integration.test.ts, for the same reason as
        // readBookBundle.ts above: it reads a Payload global and a `users`
        // row, and the question its cases exist to answer - what a NULLABLE
        // `otp_required` column reads as for a row written before its schema
        // default - has no answer without a real table. Gated by
        // vitest.integration.config.ts instead. Its pure half, the two title
        // clamps, lives in `packages/domain/src/auth/signInTitle.ts`, which
        // this pass DOES measure at the domain's 100% bar.
        'apps/web/lib/auth/readSignInScreen.ts',
        // setNewPassword.ts and newPasswordScreen.ts (Phase 2 Task 9) are
        // reachable only from their own `*.integration.test.ts` files, for the
        // same reason as passwordReset.ts above: the questions they exist to
        // answer are all held in a column Payload writes. Whether a token is
        // honoured, whether it survives being spent, and whether the password
        // it set is the one `login` now accepts have no answer without a real
        // `users` row, and a mocked one would let a reset that changes nothing
        // pass. Gated by vitest.integration.config.ts instead, both at 100% on
        // every axis. Their pure half - which state each reset screen draws -
        // lives in `packages/domain/src/auth/resetScreen.ts`, which this pass
        // DOES measure at the domain's 100% bar.
        'apps/web/lib/auth/setNewPassword.ts',
        'apps/web/lib/auth/newPasswordScreen.ts',
        // guard.ts, services.ts, signInEndpoints.ts and resetRequestEndpoint.ts
        // (Phase 2 Task 10) are reachable only from their own
        // `*.integration.test.ts` files, for the same reason as every module
        // above: each one composes a real Payload. The guard's whole question -
        // does this identifier name a LIVE row - has no answer without the
        // `sessions` table, and the endpoints' answers are claims about what
        // Postgres now holds (a challenge bound to this browser, a rotated
        // session row, a revoked one). A mocked store would let a handler that
        // reused the pre-auth identifier pass. Gated by
        // vitest.integration.config.ts instead, all four at 100% on every axis.
        // Their pure halves - which addresses are public, what a cross-site
        // mutation is, the admin's headers, the two cookies and the form
        // reading - are `adminAccess.ts`, `browserSession.ts` and
        // `httpForm.ts`, which this pass DOES measure, each at 100% below.
        'apps/web/lib/auth/guard.ts',
        'apps/web/lib/auth/services.ts',
        'apps/web/lib/auth/signInEndpoints.ts',
        'apps/web/lib/auth/resetRequestEndpoint.ts',
        // readCodeScreen.ts (Task 10's fix round) joins the same two: it reads
        // the challenge bound to the browser's cookie through a real Payload,
        // and what it exists to prove - that the code screen prints the SERVER's
        // masked address, issue time and attempts rather than a placeholder - is
        // a claim about an `otpChallenges` row. Gated by
        // vitest.integration.config.ts instead.
        'apps/web/lib/auth/readCodeScreen.ts',
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
        // read and holds zero authored logic (await the route params and the
        // query, read the bundle, render `<Book>` with one child per page) -
        // all three of its real decisions are delegated to
        // `@travel-diary/domain`, which gates that package at 100%:
        // `pageIndexFromParam` for what `<n>` means, `servedContentWindow`
        // for which pages this request gets the content of, and
        // `rendersContent` for whether a given leaf is one of them
        // (docs/adr/0009-server-rendered-page-window.md). Re-read this
        // clause before adding anything to that file: a branch of its own
        // there is a branch nothing can measure. The tooling defect is named
        // and reproduced above; and this entry names the exact path, so a
        // future file placed beside it under the same bracketed parent is not
        // swept into the same hole and must justify its own exclusion. Its
        // runtime behaviour is covered in a real browser by e2e/book.spec.ts
        // and e2e/smoke.spec.ts. Revisit when @vitest/coverage-v8's version
        // changes - a fixed scanner removes the justification.
        'apps/web/app/(diary)/p/\\[n\\]/page.tsx',
        // Task 15's follow-up (docs/adr/0012) splits the diary's two reading
        // surfaces across two route entries so neither ships the other's
        // client chunk, which adds a second page component under a bracketed
        // directory. It qualifies on the same three counts as the one above,
        // re-verified in the same run against the unbracketed control
        // `(diary)/layout.tsx` rather than inherited: (1) it was read and holds
        // zero authored logic - await the params, read the bundle, render
        // `<MobileDiary>` around the one addressed page - with what `<n>` means
        // delegated to `addressedPageIndex`, its metadata to
        // `addressedPageMetadata`, its chrome to `deriveRail`/`mobileHeading`/
        // `pageLabel`, and WHICH READERS REACH IT AT ALL to
        // `apps/web/middleware.ts`, which this pass does measure, at 100%;
        // (2) the tooling defect is the one named above and is a property of the
        // path shape, which this file shares; (3) it names its exact path. Its
        // runtime behaviour is covered in a real browser by e2e/mobile.spec.ts,
        // e2e/routing.spec.ts, e2e/layout.spec.ts and e2e/a11y.spec.ts.
        'apps/web/app/(diary)/m/\\[n\\]/page.tsx',
        // Task 14 of Phase 1 adds the gallery route and its download handler
        // to this list, on the same three counts CLAUDE.md §2.1's carve-out
        // requires - re-verified against the control in this same run rather
        // than inherited. (1) Both were read and hold zero authored logic:
        // the page awaits its param, reads `readGalleryBundle`, 404s when
        // there is none and renders two components; the route handler awaits
        // its two params, calls `readGalleryDownload` and turns a `Result`
        // into a `Response` with four fixed headers. Every decision either
        // appears to take belongs to a module with its own suite -
        // `readGalleryBundle`/`readGalleryDownload` (integration, against a
        // real Payload), `GalleryHeader`/`Grid`/`Tile`/`Lightbox` (jsdom),
        // and `@travel-diary/domain`'s `gallery`/`galleryDownload`, gated at
        // 100%. (2) The tooling defect is the one named above and is a
        // property of the path shape, which both of these share (`[slug]`,
        // `[id]`); `(diary)/layout.tsx` remains the control that is correctly
        // ignored without a config entry. (3) Each names its exact path, so a
        // future file placed beside either is not swept into the same hole.
        // Their runtime behaviour is covered in a real browser by
        // e2e/gallery.spec.ts and e2e/a11y.spec.ts.
        // Phase 2 Task 9 adds the reset link's own screen, the first
        // bracketed route outside the diary. It qualifies on the same three
        // counts CLAUDE.md §2.1's carve-out requires, re-verified against the
        // control in this same run rather than inherited. (1) It was read and
        // holds zero authored logic: await the params and the query, read the
        // shell's content and the link's state, render two components - with
        // WHICH STATE THE SCREEN DRAWS delegated to
        // `apps/web/lib/auth/newPasswordScreen.ts` (integration-tested against
        // a real Payload and gated at 100% by vitest.integration.config.ts)
        // and, under that, to `@travel-diary/domain/auth/resetScreen`'s
        // `newPasswordView`, which this pass measures at 100%. (2) The tooling
        // defect is the one named above and is a property of the path shape,
        // which this file shares (`[token]`); `(diary)/layout.tsx` remains the
        // control that is correctly ignored without a config entry. (3) It
        // names its exact path, so a future file placed beside it under the
        // same bracketed parent is not swept into the same hole. Its sibling
        // `reset/set/route.ts` is deliberately NOT here: it sits under a
        // static segment, so its own `c8 ignore` is read and holds. Runtime
        // behaviour: e2e/reset.spec.ts, e2e/a11y.spec.ts, e2e/visual.spec.ts.
        'apps/web/app/(admin)/admin/reset/\\[token\\]/page.tsx',
        'apps/web/app/(diary)/gallery/\\[slug\\]/page.tsx',
        'apps/web/app/(diary)/gallery/\\[slug\\]/download/\\[id\\]/route.ts',
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
        // `packages/tokens/src/**` is the same kind of code as
        // `packages/domain/src/**` - three pure modules (`colour.ts`,
        // `geometry.ts`, `type.ts`) with no I/O, no framework and no React -
        // and it was falling to the repository-wide 90% floor purely because
        // nobody had named it. CLAUDE.md §2.1 asks a directory for "a real
        // threshold", and the honest one is the number the directory actually
        // achieves: 100/100/100, measured, not rounded up. Named rather than
        // inherited so that a rule landing at 91% here fails on its own commit
        // instead of hiding under an aggregate set for framework glue.
        'packages/tokens/src/**/*.ts': {
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
        // The three Phase 2 Task 10 modules the admin's request policy is
        // made of. They are named individually, at the number they actually
        // achieve, rather than left under `apps/web/lib/**`'s 95%: each is pure
        // (no I/O, no framework, no database), each is imported by
        // `apps/web/middleware.ts` and therefore runs in the Edge runtime where
        // a mistake cannot be caught by anything else, and each decides
        // something a security requirement names - which addresses answer
        // without a session, whether a mutation came from our own pages, and
        // what a session cookie says. 95% would leave one uncovered branch in
        // any of them acceptable, and there is no branch here whose behaviour
        // is not a real one.
        // The Server Action rule: 100 across, and it has to be. It is the only
        // thing standing between Phase 4's ten screens of mutations and an
        // unguarded POST endpoint, it replaced nine text scans that were
        // defeated because their branches were never exercised, and every
        // branch in it is a shape somebody actually reached for. A threshold
        // below 100 here would be a branch nobody has driven, in the file whose
        // whole job is to have driven them.
        'eslint-rules/**/*.js': { lines: 100, branches: 100, functions: 100 },
        'apps/web/lib/auth/adminAccess.ts': {
          lines: 100,
          branches: 100,
          functions: 100,
        },
        'apps/web/lib/auth/browserSession.ts': {
          lines: 100,
          branches: 100,
          functions: 100,
        },
        'apps/web/lib/auth/httpForm.ts': {
          lines: 100,
          branches: 100,
          functions: 100,
        },
        // The middleware takes no decision of its own - which surface a
        // request is served is `servedReadingSurface`'s, gated at 100% in the
        // domain, and the admin's request policy is `lib/auth/adminAccess.ts`'s
        // - so what is left in it is three routing outcomes, three admin
        // outcomes and a matcher, every one of them reachable from a plain
        // `NextRequest` (apps/web/middleware.test.ts). 100% is the number that
        // is actually achieved there, not a rounded-up one.
        'apps/web/middleware.ts': {
          lines: 100,
          branches: 100,
          functions: 100,
        },
        // Two imports and an array literal, nothing else - `index.test.ts`
        // exercises the whole file, so 100% is the honest number, not a
        // rounded-up one.
        'apps/web/migrations/index.ts': {
          lines: 100,
          branches: 100,
          functions: 100,
        },
      },
    },
  },
})
