# 2 · Integration — the detail

The detail for `docs/testing.md` §2. That document states the suite's tool, its scope
and how to run it, and points here; everything else about the suite is below. The section
numbers are `docs/testing.md`'s and do not change.

- **Tool:** Vitest + a real test Postgres.
- **Scope:** collections, hooks, server actions, access control against a real database.
- **Status:** implemented. The `integration` Vitest project (`vitest.config.ts`) includes
  `**/*.integration.test.ts` under `apps/web/lib/**`, `apps/web/collections/**`,
  `apps/web/scripts/**` and `packages/*/src/**` (no file matches that last pattern
  today — `packages/domain` and `packages/tokens` are pure, no I/O).
  Phase 2 Task 7 adds `apps/web/lib/auth/readSignInScreen.integration.test.ts`, the
  sign-in screen's own server read. Its flag cases are integration cases rather
  than unit ones for a reason a unit test could not have: `users.otp_required` is a
  NULLABLE column with a schema default, and "what does a row written before that default
  read as" is a question only a real table answers. It fails closed in both forms — a
  `NULL` column and an empty `users` table, which is the state the seeded dev and CI
  databases are actually in — and each case asserts the row it set up exists before
  asserting what was read off it.

  `collections.integration.test.ts` (Task 6) exercises the schema
  rules from `DATA_MODEL.md`, the migration reversibility case (§9 below), and the
  access control on the three server-only collections — `jobs`, `otpChallenges` and
  `signInAttempts` declare `access: () => false` on read, create, update **and delete**,
  and those predicates had no test at all because Payload's Local API defaults to
  `overrideAccess: true` and so never ran them. One case per collection passes
  `overrideAccess: false`, which is what a REST or GraphQL request does, and asserts that
  **no** operation is permitted — to a signed-in caller as well as a signed-out one, and
  against **real rows**.

  That file also covers the `isCover` `afterChange` hook (Phase 3 Task 5), and it covers
  it with **more than one journey**, because a cover is per journey and a suite with one
  journey cannot tell "the journey's other media" from "all the media" — with one
  journey they are the same rows. Each guard in the hook is pinned by a case that fails
  when that guard alone is removed, measured rather than assumed: dropping the `journey`
  clause fails _"leaves another journeys cover alone"_; dropping the
  `isCover equals true` clause fails _"rewrites only the media that was actually the
  cover"_ (which reads `updatedAt`, because a needless write is invisible in the field it
  writes); dropping the guard on the changed row's own `isCover` fails _"leaves the
  journeys cover alone when a sibling is edited"_; dropping the no-journey guard fails
  _"leaves another journeyless rows cover flag alone"_; and narrowing `doc.journey` to
  only one of its two shapes fails whichever case exercises the other — the populated
  journey at the default depth, or the bare id at `depth: 0`. That last pair exists
  because the first cases written here exercised one side only, which is the one-sided
  boundary this repository has now met four times.

  Both of those qualifiers were added after a review found what their absence hid. The
  first version of these cases asserted read, create and update for a signed-out caller
  only, and one of them was named "so nobody can clear or forge their own window" while
  checking two thirds of that. Payload applies its `defaultAccess` — "signed in, or
  refused" — to any operation an access block omits, and all three blocks omitted
  `delete`, so an authenticated caller could delete rows in every one of them: their own
  rate-limit window, their own OTP attempt counter, the queue. The signed-out half could
  never have caught it, because `defaultAccess` refuses a signed-out caller anyway. Real
  rows matter for the same class of reason: an `update` or `delete` aimed at an id that
  does not exist is refused for being absent rather than forbidden, so a guard written
  against `id: '1'` passes with or without the rule. The predicate was added and the gap
  recorded as `docs/deviations.md` §28; removing it again fails all three cases, each
  naming `delete` in the operations it was allowed. `sessions.access.integration.test.ts`
  (Phase 2 Task 6) is that file's counterpart for the one Phase 2 collection a signed-in
  reader legitimately reaches, and it is shaped differently on purpose: **every case is
  cross-account**, because `sessions` declared no access block at all and so granted every
  operation to "signed in" — a defect no single-account suite can see
  (`docs/deviations.md` §29). `sessions.integration.test.ts` under `apps/web/lib/auth/`
  covers the behaviour over those rows: rotation, revocation and the row-governed
  lifetime, each pinned by a mutation (see §8 below). `seed.integration.test.ts` (Task 11)
  exercises `apps/web/scripts/seed.ts` against real `journeys`, `pages`, `media` rows and the
  `book`/`about` globals, including its idempotency (running it twice leaves the same
  ten journeys, not twenty) and the thirty-row page count (ten journeys × three — Cover,
  Contents and About are globals/derived, not `pages` rows; see `docs/deviations.md` §5).
  Its own `beforeAll` deletes the ten seeded journeys first, so the suite's coverage
  numbers (see below) do not depend on whether a previous run, or `npm run db:seed -w apps/web`
  itself, already seeded the same database.

- **Isolation:** every integration test file calls `getTestPayload()`
  (`apps/web/lib/testPayload.ts`), not `getPayload()` directly. `DATABASE_URL` for the
  `integration` project (and `vitest.integration.config.ts`) points at `diary_test`, a
  separate database on the same Postgres server as `.env`'s `diary` — never the
  developer's own dev data. `getTestPayload()` creates `diary_test` on first use if it
  does not exist yet and applies pending migrations, so it self-bootstraps regardless of
  how tests are invoked. This exists because `seed.integration.test.ts`'s cleanup deletes
  journeys by slug, and running that against the real dev database would delete a real
  edited journey the moment its slug matched one of the ten (Task 10/11 review round 1,
  finding 2). `diary_test` is not torn down between runs — persisting is the same
  trade-off `diary` itself already makes; isolation, not a fresh database every time, is
  the fix.

  **ONE DEVELOPER AT A TIME, AND NOTHING ENFORCES IT.** `vitest.integration.config.ts`'s
  `fileParallelism: false` orders files _within_ a run; it guards nothing between two runs,
  and `diary_test` has no lock. **Two integration runs at once corrupt each other's seed** —
  both find no journeys, both create ten — so leaving `npm run verify:full` going and
  starting `npm run test:integration` beside it is the one way to break this suite without
  touching it. The symptom is a doubled count rather than an error
  (`expected [ … ] to have a length of 33 but got 66`, and four more like it), and because
  the database settles once both runs finish their cleanup, **the re-run passes** — which is
  exactly how a suite that was never broken acquires a `test.skip`. Measured in Phase 3
  Task 10/11; nothing was changed to make the serial re-run green.

  **THAT CONNECTION STRING IS DERIVED FROM THE ENVIRONMENT'S OWN `DATABASE_URL`, AND USED
  NOT TO BE.** Both configs held `postgres://diary:diary@localhost:5433/diary_test` as a
  literal, and 5433 is one developer's Docker port mapping (`docs/deviations.md` §45).
  CI's Postgres service listens on 5432, and its two jobs do not agree on the host
  either — the `verify` job reaches it at `localhost:5432`, the containerized `browser`
  job at `postgres:5432` over a Docker network addressed by service name. So on the first
  CI run this repository ever had, nothing was listening where the config pointed, Payload
  never initialised, and every integration test file failed beneath it.
  `apps/web/lib/testDatabaseUrl.ts` replaces only the database NAME and keeps whatever
  else the environment said; `5433` survives there as the fallback for a developer with
  nothing set, since neither Vitest config loads `.env` before it is read. A list of known
  hosts and ports was rejected as the same defect with more branches — the fourth
  environment fails exactly as CI did.

  **AN UNREACHABLE SERVER IS NOW ONE LOUD FAILURE, WHICH IS THE HALF THAT ACTUALLY
  MATTERED.** The wrong port was a typo; a whole suite being absent without anybody
  reading it as absent is the defect. `getTestPayload()` caches `ready` as a PROMISE, so
  an unreachable server rejects once and every case in the file then runs with `payload`
  still `undefined` — which is why CI surfaced a `TypeError` per file, one
  `Cannot read properties of undefined` for each, and named the real cause nowhere.
  `vitest.integration.globalSetup.ts` now runs once, before the first file is collected,
  and stops the run with a single message naming the connection it tried (password
  masked, `CLAUDE.md` §7) and what Postgres said about it. Both integration runs register
  it — `vitest.integration.config.ts` at its root, and `vitest.config.ts`'s `integration`
  project on the PROJECT rather than at that file's root, so the two Docker-free projects
  never probe a database and the pre-commit gate stays one a developer can pass with
  Docker down. `apps/web/lib/testDatabaseGuard.ts` holds the message and every decision
  in it, gated at 100% in the Docker-free pass with the connection injected (the network
  boundary `CLAUDE.md` §2.3 permits standing in for); its second describe block reads
  both configs off disk and fails if either stops naming the setup file, for the same
  reason `e2e/ciRegistration.test.ts` reads the workflow. Vitest prints its own
  `No test files found, exiting with code 1` line above the message when a global setup
  throws, and the run exits **1** even under `--passWithNoTests` — verified, because that
  flag swallowing this failure would have restored the silence exactly.

  **`vitest.integration.globalSetup.ts` is in that config's coverage `include` and its
  body carries a whole-file `c8 ignore`, and the reason is measured.** A `globalSetup`
  module runs in Vitest's own main process, not in a test worker, and
  `@vitest/coverage-v8` instruments the workers — so with the path included and no ignore
  hint, a run in which the setup demonstrably executed reported
  `...lobalSetup.ts | 0 | 100 | 100 | 0 | 39-79`: every line of a file that ran, counted
  as uncovered. A false 0% is as misleading as an unmeasured file, so this is `CLAUDE.md`
  §2.1's second honest treatment — an ignore that carries its reason where no pass can
  see the code — rather than the carve-out, which this file would not qualify for. What
  it costs is bounded by design: the file holds a `pg` client and a timeout, and every
  decision it could get wrong lives in `testDatabaseGuard.ts`. One cosmetic consequence,
  said rather than left to alarm somebody: the ignored file leaves a directory row for the
  repository root itself, reading `0 | 0 | 0 | 0` with no file beneath it, in that pass's
  report. That is a
  0-of-0 group, not a measured zero — the pass has no repository-wide threshold and no
  entry for that path, so it gates nothing and the run exits 0.

- **Run:** `npm run test:integration` (requires `DATABASE_URL`), or `npm run verify:full`
  to run it alongside everything else.
- **Add one:** name the file `<name>.integration.test.ts` so Vitest's project split picks
  it up; it will not run under `npm run verify` or the pre-commit hook. Exercise the real
  Postgres started by Docker locally (see `docs/runbook.md`), never a mock of Payload's
  query layer — per `CLAUDE.md` §2.3, "no mocking what we own." Per-journey isolation
  tests (guarding the five recorded per-journey-state defects) belong here.
