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
 * `apps/web/collections/**`, `apps/web/globals/**`, `payload.config.ts` and
 * `apps/web/migrations/**` were covered by NEITHER config's `include` until
 * now - not excluded with a reason, simply absent, which is the failure mode
 * this phase has already had twice. They are measured here because this is
 * the pass that actually executes them: the first `getTestPayload()` imports
 * `payload.config.ts`, which imports every collection and global, and the
 * reversibility test runs both migrations' `up()` and `down()` in full. All
 * four are gated at 100% NOW, while they are still declarative and the number
 * is free - Phase 2's access control and Phase 4's hooks land in
 * `collections/`, and a threshold set after that code arrives is a threshold
 * negotiated down to whatever it happens to score. The one exclusion is
 * `apps/web/migrations/index.ts`, a generated barrel Payload never imports -
 * measured instead by `vitest.config.ts`'s `unit` project (see this file's
 * coverage `exclude` for the detail).
 *
 * `apps/web/lib/auth/readSignInScreen.ts` (Phase 2 Task 7) joins this file for
 * the same reason as `readBookBundle.ts`: it reads a Payload global and a
 * `users` row, and the question its cases exist to answer - what a NULLABLE
 * `otp_required` column reads as for a row written before its schema default -
 * has no answer without a real table.
 *
 * `apps/web/app/**` is NOT included here, and that is settled, not stale:
 * Task 1 of Phase 1 added it to `vitest.config.ts`'s unit coverage include
 * instead (with a 95%/95%/95% threshold that starts binding the moment
 * Task 13's diary route lands there) - see that file's own header. Three of
 * its six current files (Payload's `layout.tsx` and the two GraphQL routes)
 * are `c8 ignore start`/`stop`-wrapped and fully excluded there. The other
 * three sit under a Next.js dynamic-route bracket directory
 * (`api/[...slug]/route.ts`, `cms/[[...segments]]/page.tsx` and its
 * `not-found.tsx`) where that same ignore mechanism does not take effect - a
 * verified `@vitest/coverage-v8` defect, not a choice - so they are excluded
 * from `vitest.config.ts`'s coverage `include` by exact path. This pass does
 * not pick them up either: nothing under `apps/web/scripts/**` or
 * `apps/web/collections/**`'s integration tests imports a Payload route
 * handler, so adding them to the `include` below would not measure them, only
 * relocate the same 0-of-0 non-measurement here. That is the narrow,
 * explicitly-named carve-out CLAUDE.md §2.1 now documents for a verified
 * coverage-tooling bug against a file with zero authored logic - not a gap
 * this phase failed to notice.
 *
 * `DATABASE_URL` points at `diary_test`, a separate database from `.env`'s
 * `diary` - never the developer's own dev data - for the same reason as
 * `vitest.config.ts`'s `integration` project (see its header): every
 * integration test file calls `apps/web/lib/testPayload.ts`'s
 * `getTestPayload()`, not `getPayload()` directly.
 *
 * IT IS DERIVED FROM THE ENVIRONMENT'S OWN `DATABASE_URL` RATHER THAN
 * WRITTEN OUT HERE, and that is what the first CI run this repository ever
 * had was about. This line used to read
 * `postgres://diary:diary@localhost:5433/diary_test`; 5433 is one developer's
 * Docker port mapping, CI's Postgres service listens on 5432, and CI's two
 * jobs do not even agree on the host (`localhost` for `verify`, the service
 * name `postgres` for the containerized `browser` job). Nothing was listening
 * where this pointed, so Payload never initialised and every integration test
 * file failed downstream. `apps/web/lib/testDatabaseUrl.ts` replaces the
 * database NAME and keeps whatever else the environment said - see its header
 * for why a list of known hosts would be the same defect with more branches.
 * Depends on: vitest/config, ./apps/web/lib/testDatabaseUrl.
 */
import { defineConfig } from 'vitest/config'
import { testDatabaseUrl } from './apps/web/lib/testDatabaseUrl'

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
      DATABASE_URL: testDatabaseUrl(process.env.DATABASE_URL),
    },
    // Runs ONCE, before the first file is collected, and stops the whole run
    // if the server named above does not answer - see that file's header, and
    // `apps/web/lib/testDatabaseGuard.ts`. Without it an unreachable Postgres
    // is reported as one `Cannot read properties of undefined` per
    // integration file (`getTestPayload()` caches a rejected promise and
    // Vitest runs the cases anyway), which is what CI printed and why the
    // wrong port above went two phases unnoticed.
    globalSetup: ['./vitest.integration.globalSetup.ts'],
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
        // The reachability guard's `pg` binding. Included so that CLAUDE.md
        // §2.1's "no file is in neither include" is satisfied by inclusion
        // rather than by an argument - and then IGNORED inside the file
        // itself, with the reason at the ignore: a `globalSetup` module runs
        // in Vitest's main process, which the v8 provider does not
        // instrument, so with this path included and no hint the run reported
        // every line of a file that demonstrably executed as uncovered
        // (`0 | 100 | 100 | 0 | 39-79`). See that file's header and
        // docs/testing.md's Integration section; the decisions it could get
        // wrong live in `apps/web/lib/testDatabaseGuard.ts`, gated at 100% by
        // the Docker-free pass.
        'vitest.integration.globalSetup.ts',
        'apps/web/lib/migrate.ts',
        'apps/web/lib/readBookBundle.ts',
        'apps/web/lib/readGalleryBundle.ts',
        'apps/web/lib/readGalleryDownload.ts',
        'apps/web/lib/auth/otpService.ts',
        'apps/web/lib/auth/testing/otpProbes.ts',
        'apps/web/lib/auth/rateLimit.ts',
        'apps/web/lib/auth/sessions.ts',
        'apps/web/lib/auth/signIn.ts',
        'apps/web/lib/auth/passwordReset.ts',
        'apps/web/lib/auth/readSignInScreen.ts',
        'apps/web/lib/auth/setNewPassword.ts',
        'apps/web/lib/auth/newPasswordScreen.ts',
        'apps/web/lib/auth/guard.ts',
        'apps/web/lib/auth/services.ts',
        'apps/web/lib/auth/signInEndpoints.ts',
        'apps/web/lib/auth/resetRequestEndpoint.ts',
        'apps/web/lib/auth/readCodeScreen.ts',
        'apps/web/collections/**/*.ts',
        'apps/web/globals/**/*.ts',
        'apps/web/payload.config.ts',
        'apps/web/migrations/**/*.ts',
      ],
      // `apps/web/migrations/index.ts` is a generated barrel that Payload
      // never imports - `readMigrationFiles` filters `index.ts`/`index.js`
      // out and reads every other migration file off disk directly - so
      // nothing THIS pass runs ever executes it either; it is excluded here
      // rather than left at a false 0%. It is not left unmeasured: a
      // dedicated `apps/web/lib/migrationsIndex.test.ts` - a plain import and
      // an array-shape assertion, no Postgres needed - runs in
      // `vitest.config.ts`'s Docker-free `unit` project instead, and that
      // config's own coverage `include`/threshold gate it at 100% there. That
      // test deliberately does NOT live inside `apps/web/migrations/` itself:
      // `readMigrationFiles` treats every `.ts`/`.js` file in `migrationDir`
      // other than `index.ts`/`index.js` as a migration to dynamically
      // import, so a colocated test file gets self-migrated as if it were one
      // (reproduced - it broke every integration test that bootstraps
      // Payload, each of which self-migrates on first connect). Named by its
      // exact path, not as `**/index.ts`: CLAUDE.md §2.1 requires an
      // exclusion to name the file it excuses, so that a future `index.ts`
      // anywhere in this repository has to justify its own exclusion rather
      // than inherit this one.
      exclude: ['**/*.test.ts', '**/*.d.ts', 'apps/web/migrations/index.ts'],
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
        // otpService.ts (Phase 2 Task 3): 100% on every axis, and it took
        // two corrections to get an honest 100 rather than a lowered bar.
        // The first version of this entry sat at 93% branches and claimed
        // both missing arms were unreachable. One of them was not: a reviewer
        // reached `attempts ?? 0` with a plain
        // `payload.update({ data: { attempts: null } })`, no mocking - a
        // threshold lowered on a reason that is not true is worse than one
        // lowered honestly, because the comment stops the next reader from
        // checking. Both arms are gone rather than excused: the attempt count
        // is now `COALESCE`d in SQL (with a test that writes a NULL count and
        // expects the challenge to still work), and the single-row `count(*)`
        // is folded over its rows instead of read through a `?.`. The one
        // `c8 ignore` left in the file, on `deriveKey`'s error arm, records
        // the three things tried before it was excused.
        'apps/web/lib/auth/otpService.ts': { lines: 100, branches: 100, functions: 100 },
        // The probes are gated at 100% on every axis, like queue-fixtures.ts
        // above and for the same reason: they are what makes every security
        // assertion in otpService.integration.test.ts non-vacuous, so each of
        // their own refusals is exercised rather than assumed.
        'apps/web/lib/auth/testing/otpProbes.ts': { lines: 100, branches: 100, functions: 100 },
        // rateLimit.ts (Phase 2 Task 4): 100% on every axis, and honestly so
        // rather than by construction. The module has no defensive arm to
        // excuse: its two single-row folds are TOTAL (`Math.max` over the
        // returned rows, with initial values that make an impossible empty
        // result fail closed through the domain's own guards), so there is no
        // `if (row === undefined)` here whose branch nothing could take -
        // which is exactly how otpService.ts arrived at an honest 100 after
        // two corrections. Every remaining branch is a real decision: the two
        // dimensions of `admitCodeAttempt`, and the `byAddress.ok` that
        // decides which refusal a caller is told about.
        'apps/web/lib/auth/rateLimit.ts': { lines: 100, branches: 100, functions: 100 },
        // sessions.ts (Phase 2 Task 6): 100% on every axis, and honestly so.
        // It reached 94% branches first, with the two uncovered arms being
        // `revokeSession` and `revokeAllSessions` refusing a `UserId` that is
        // not a Payload row id - reachable by any caller, since the brand
        // promises only a non-empty string. Both are now exercised rather
        // than excused: otpService.ts's entry above records what happens when
        // a threshold is lowered on a reason that turns out not to be true.
        // The two `c8 ignore`s that remain are on the `isOk` unwraps of
        // `sessionId`/`userId`, whose refusal arms a base64url identifier and
        // a `NOT NULL integer` column cannot reach, and each states so at the
        // point of the exclusion.
        'apps/web/lib/auth/sessions.ts': { lines: 100, branches: 100, functions: 100 },
        // signIn.ts and passwordReset.ts (Phase 2 Task 5): 100% on every
        // axis. Neither carries a lowered bar, and both are the enforcement
        // point rather than a mechanism - every branch in them is a real
        // answer a request can receive, including the three that are
        // deliberately the same answer (unknown address, wrong password,
        // locked account). The `c8 ignore`s in `signIn.ts` are the `pbkdf2`
        // error arm (the same arm, for the same reason, as otpService.ts's
        // `deriveKey`), the `userId` unwrap on a `NOT NULL` primary key, and
        // `startSession`'s `'unknown-account'` refusal reached two statements
        // after the row was read - each states its reason at the exclusion.
        'apps/web/lib/auth/signIn.ts': { lines: 100, branches: 100, functions: 100 },
        'apps/web/lib/auth/passwordReset.ts': { lines: 100, branches: 100, functions: 100 },
        // readSignInScreen.ts (Phase 2 Task 7): 100% on every axis. There is
        // nothing to excuse here - the module is two queries and four
        // narrowings, and every one of its branches is a real editorial or
        // schema state with a case of its own: a cleared title, a cleared
        // subtitle, a cleared cloth colour, and the three answers
        // `otp_required` can give (true, false, and NULL - which reads as
        // required, like an absent account).
        'apps/web/lib/auth/readSignInScreen.ts': { lines: 100, branches: 100, functions: 100 },
        // setNewPassword.ts and newPasswordScreen.ts (Phase 2 Task 9): 100% on
        // every axis, and nothing in either is excused. `refusalFrom`'s arms
        // are the reason it is exported: a live Payload produces only two of
        // them (a 403 for a token it cannot match and a 400 for a password it
        // refuses), and the rest - a thrown string, a `null`, an object with
        // no status - are what a rejected connection or a future release would
        // take, so they are exercised directly rather than left as an
        // untestable "cannot happen". Everything else in both files is a real
        // answer a request can receive: two link states, two refusals, and the
        // three redirects a submission can be given.
        'apps/web/lib/auth/setNewPassword.ts': { lines: 100, branches: 100, functions: 100 },
        'apps/web/lib/auth/newPasswordScreen.ts': { lines: 100, branches: 100, functions: 100 },
        // guard.ts, services.ts, signInEndpoints.ts and resetRequestEndpoint.ts
        // (Phase 2 Task 10 — the HTTP boundary): 100% on every axis, which is
        // the measured number rather than a rounded-up one, and nothing in any
        // of the four is excused beyond two arms that are marked and named.
        // `guard.ts` HAS NO `c8 ignore` REGION AS OF ROUND 9, and that is a
        // change worth naming: it had one over `requireAdminSession` and
        // `guardedAction`, on the ground that `headers()` throws outside a
        // request context. It does — and `next/headers` and `next/navigation`
        // are the framework boundary CLAUDE.md §2.3 permits standing in for,
        // which is what `guard.integration.test.ts` now does. The sixth
        // whole-branch review found the region's own claim that the factory's
        // "runtime behaviour is covered in the browser" false, because nothing
        // reached the factory at all; both functions are executed now, and the
        // 100% below is measured over them rather than around them.
        // `signInEndpoints.ts`
        // has one `c8 ignore next`: `startSession` refusing an account a
        // challenge row references, which is the fail-closed answer to that
        // account being deleted between two statements. Everything else in all
        // four is a real answer a request can receive — three sign-in outcomes,
        // four code-step outcomes, two sign-out outcomes, two reset outcomes,
        // and the four session refusals the guard distinguishes.
        'apps/web/lib/auth/guard.ts': { lines: 100, branches: 100, functions: 100 },
        'apps/web/lib/auth/services.ts': { lines: 100, branches: 100, functions: 100 },
        'apps/web/lib/auth/signInEndpoints.ts': { lines: 100, branches: 100, functions: 100 },
        'apps/web/lib/auth/resetRequestEndpoint.ts': { lines: 100, branches: 100, functions: 100 },
        // readBookBundle.ts (Task 6 of Phase 1; Task 6 review fix round 1;
        // Task 11): 100% lines/statements/functions. 83% branches is the
        // real, measured number, RAISED again from 81% by Task 11, whose
        // `about`-global mapping added branches AND the cases that exercise
        // them (a cleared portrait caption with the portrait still attached,
        // and a portrait media row whose `focalX`/`focalY` are explicitly
        // null). Task 11 leaves exactly two of its own branches uncovered,
        // both verified instances of classes (2) and (4) below rather than
        // new gaps: `doc.portrait?.id` in `toAboutContent` (dead at
        // `depth: 0`, like every other relationship-id branch here) and the
        // `?? ''` half of `portraitMedia.alt ?? ''` (the seed labels the
        // portrait `PORTRAIT`, so its `alt` is never absent). 81% was itself
        // RAISED from an earlier 72% after the review's finding 3
        // corrected an overbroad "no organic trigger" claim: `hiddenFromBookmarks
        // ?? false`, `furniture?.accent ?? '#3d817e'`, `journeyOrderMode ??
        // 'manual'` and slot `focalX`/`focalY ?? 50` are each reachable through
        // ordinary API use - Payload's `defaultValue` fills a field only when
        // it is `undefined` at write time, and an explicit `null` (an ordinary
        // PATCH) bypasses it - so each is now exercised by a dedicated fixture
        // (readBookBundle.integration.test.ts, "fields with a schema default
        // fall back correctly when explicitly null"). `slot.role ?? 'frame'`
        // (the one fallback WITHOUT a schema default) was already covered.
        //
        // What remains uncovered is genuinely dead, not merely untested -
        // the review's own conclusion, verified rather than taken on faith:
        // (1) `journeyId()`'s error branch - Payload never hands back an
        // empty id; (2) every `typeof x === 'number' ? x : x.id`
        // relationship-id branch (slot.media in two places, page.journey) -
        // this module always queries at `depth: 0`, so the populated-object
        // alternative is provably dead code under that invariant; (3) the
        // "media id not found in the batch" guard in `slotsFor` - every id it
        // looks up came from the same book's own `where: id in [...]` query
        // one line above, so it is never absent without a concurrent delete
        // between the two queries; (4) the second half of `slot.alt ??
        // media.alt ?? ''` and `slot.caption ?? media.caption ?? ''` - the
        // seed and every fixture here give `media` a truthy `alt`/`caption`,
        // so the final `''` never fires; (5) `page.slots ?? []` in
        // `slotsFor` - every matched Notes/Frames page this suite creates
        // always defines `slots`.
        'apps/web/lib/readBookBundle.ts': { lines: 100, branches: 83, functions: 100 },
        // FINDING 36 of Phase 2's final review: these three sat in this pass's
        // `include` with NO threshold entry, and outside `vitest.config.ts`'s
        // include as well — measured by this run and gated by nothing, which
        // is the state CLAUDE.md §2.1 exists to forbid ("an unmeasured file
        // looks exactly like a fully-covered one"). There is no repository-wide
        // floor in this config to catch them either, deliberately: this pass
        // measures a hand-picked set, so a wildcard floor would be a number
        // nobody chose.
        //
        // Each number below is the one the suite ACHIEVES, not one negotiated
        // down to it: `readCodeScreen.ts` is total at 100 across, and the two
        // gallery readers' branch figures are the optional-field folds their
        // own headers describe — the same shape `readBookBundle.ts` above
        // carries, for the same reason, at the same kind of number.
        //
        // TWO OF THE THREE SIT BELOW CLAUDE.md §2.1's 95% FOR `apps/web/lib/**`,
        // AND THAT IS STATED HERE RATHER THAN LEFT TO BE NOTICED. 78% and 85%
        // branches are what the suites achieve, not numbers negotiated down to
        // the code: both files map a Payload document onto a bundle, and the
        // uncovered branches are the `?? fallback` on optional fields that the
        // seeded content happens to fill — `readBookBundle.ts` above carries
        // 83% for exactly the same reason and has since Phase 1.
        //
        // Raising them means seeding a journey with every optional field blank,
        // which is a fixture decision belonging to whoever next touches the
        // gallery, not a number to be edited here. What is NOT acceptable, and
        // is what the final review found, is the previous state: no entry at
        // all, so the files were measured by this pass and gated by nothing.
        // A stated shortfall is reviewable; an absent one is invisible.
        //
        // AND IT IS NOW STATED IN THE REGISTER OF DEPARTURES TOO, which it was
        // not: `docs/deviations.md` §46 lists all SIX per-file branch gates in
        // this config that sit under §2.1's 95% - these two, plus
        // `readBookBundle.ts` at 83, `seed.ts` at 83, `postgres-queue.ts` at 75
        // and `testPayload.ts` at 75, four of which predate this branch and
        // none of which had an entry. Stating a shortfall only at the point of
        // exclusion is stating it where somebody already looking will see it;
        // §1.2 makes deviations.md the place somebody NOT already looking
        // will.
        'apps/web/lib/readGalleryBundle.ts': { lines: 100, branches: 78, functions: 100 },
        'apps/web/lib/readGalleryDownload.ts': { lines: 100, branches: 85, functions: 100 },
        'apps/web/lib/auth/readCodeScreen.ts': { lines: 100, branches: 100, functions: 100 },
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
        // Collections, globals and payload.config.ts: 100% across the board,
        // and honestly so. These are declarative configuration - importing
        // payload.config.ts executes every one of them, which the very first
        // `getTestPayload()` does. The only executable functions among them
        // are `jobs` and `otpChallenges`'s `() => false` access predicates,
        // which collections.integration.test.ts now drives directly with
        // `overrideAccess: false` (Payload's Local API otherwise bypasses
        // access control, which is exactly why they were unmeasured before).
        // Gated at 100% NOW, before Phase 2's access control and Phase 4's
        // hooks land here: a threshold set after the code arrives is a
        // threshold negotiated down to whatever the code happens to score.
        'apps/web/collections/**/*.ts': { lines: 100, branches: 100, functions: 100 },
        'apps/web/globals/**/*.ts': { lines: 100, branches: 100, functions: 100 },
        'apps/web/payload.config.ts': { lines: 100, branches: 100, functions: 100 },
        // Both migration files' up() AND down() run in full, because
        // collections.integration.test.ts rolls every migration back to zero
        // and re-applies it (docs/testing.md §9). This is the number that
        // proves the DROP paths - including add_jobs's hand-fixed statement
        // order - are actually executed rather than merely present.
        'apps/web/migrations/**/*.ts': { lines: 100, branches: 100, functions: 100 },
      },
    },
  },
})
