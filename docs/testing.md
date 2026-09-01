# Testing

All nine test types from `CLAUDE.md` §2 are required; a feature is not complete until
every applicable row is satisfied (design spec §11). This document covers strategy, how
to run each suite today, and how to add a test of each type. Where a suite's tooling
does not exist in the repository yet, that is stated plainly rather than glossed over —
see the **Status** column.

## Coverage gates

Enforced by TWO configs, because no single Vitest run can execute everything:

- **`vitest.config.ts`**, checked by `npm run test:unit`'s `--coverage` flag (the
  Docker-free pre-commit pass). Covers `packages/*/src/**`, `apps/web/lib/**`,
  `apps/web/scripts/**`, `apps/web/app/**` and `apps/web/components/**`, `.ts` and
  `.tsx` alike.

  | Layer                             | Lines | Branches | Functions |
  | --------------------------------- | ----- | -------- | --------- |
  | `packages/domain/**` (pure logic) | 100%  | 100%     | 100%      |
  | `apps/web/lib/**`, server actions | 95%   | 95%      | 95%       |
  | `apps/web/app/**`                 | 95%   | 95%      | 95%       |
  | `apps/web/components/**`          | 90%   | 90%      | 90%       |
  | Repository-wide                   | 90%   | 90%      | 90%       |

  `apps/web/components/**`'s own row arrived with Phase 1 Task 7, the task that put the
  first real files there (the book's frame, page stack and the two hooks that drive
  them). Until then it deliberately had none: a threshold against an empty directory is a
  vacuous pass, not a gate. It is set at the repository floor rather than `lib`'s and
  `app`'s 95% because these are React bindings, whose last few percent are framework
  glue; as of that task every file under it measures **100% on all four metrics**, so the
  bar is a floor, not a ceiling that was negotiated down to fit.

- **`vitest.integration.config.ts`**, checked by `npm run test:integration:coverage`.
  Covers everything only a real Postgres can execute: the integration-only `lib` and
  `scripts` files listed under Contract and Migration below, plus
  `apps/web/collections/**`, `apps/web/globals/**`, `apps/web/payload.config.ts` and
  `apps/web/migrations/**`, each gated per-file at what it genuinely measures.

**Nothing is allowed to be in neither.** That is not a stylistic preference: a file no
config's `include` matches is not reported as 0%, it is not reported at all, and a gap
nobody can see is the failure mode this phase has already been bitten by. Collections,
globals, `payload.config.ts` and the migrations were in exactly that position until they
were added here — no exclusion, no reason, simply absent. They are gated at **100%
across the board now**, while they are still declarative and the number costs nothing:
Phase 2's access control and Phase 4's hooks land in `collections/`, and a threshold set
after the code arrives is a threshold negotiated down to whatever that code happens to
score.

**`apps/web/app/**` and `apps/web/components/**` were the last two holes, and Task 1 of
Phase 1 closes both before either holds any of the phase's own code**, rather than
waiting for the task that lands the first server action or component to remember to add
its own directory — the controller ruling that reordered this ahead of the pages it
guards (see this task's own report). `apps/web/app/**` today holds only Payload's own six
route/layout re-exports under `(payload)/` — no logic of ours, and nothing any current
test can execute without a Next.js request context:

- Three of the six (`layout.tsx`, `api/graphql/route.ts`, `api/graphql-playground/route.ts`)
  carry a `c8 ignore start`/`stop` around their whole body — imports included, since an
  unimported file's own imports are themselves uncovered lines otherwise. They report as
  fully excluded (no row at all in a passing run).
- The other three — joined in Phase 1 Task 7 by the diary's own
  `(diary)/p/[n]/page.tsx` — sit under a Next.js dynamic-route directory written in
  square brackets (`api/[...slug]/route.ts`, `cms/[[...segments]]/page.tsx` and its
  `not-found.tsx`) —
  required by Next.js's own routing convention. `c8 ignore start`/`stop` does not take
  effect for a file under a bracketed directory: verified by reproducing one of them
  byte-for-byte under an unbracketed sibling directory and watching the _copy_ get
  ignored correctly while the original did not, with the tool instead reporting the
  file's own header-comment lines as "uncovered" once the ignored code beneath them left
  no `DA` entries to anchor against — a bug in how `@vitest/coverage-v8` scans source text
  for ignore hints on that path shape, not a defect in the files. These three are excluded
  in `vitest.config.ts`'s `exclude` array instead, with the glob's literal `[...]` escaped
  (`\[...\]`) so it is not parsed as a glob character class — the same reason the
  unescaped version silently failed to match at all during this task. See that file's own
  comment for the full reasoning. These three are therefore in NEITHER coverage config —
  `vitest.integration.config.ts` cannot see them either, since nothing under its own
  integration tests imports a Payload route handler (see that file's own header) — which
  is the narrow, explicitly-named carve-out `CLAUDE.md` §2.1 now documents for a verified
  coverage-tooling bug against a file with zero authored logic, not an unmeasured gap this
  phase failed to notice.

`(diary)/p/[n]/page.tsx` (Phase 1 Task 7) was added to that same exclusion list, and the
defect was re-verified rather than inherited. The control sat inside the very same
coverage run: `(diary)/layout.tsx` — identical `c8 ignore start`/`stop` wrapping,
identically never imported by any test, but not under a bracketed directory — reported
correctly as 0 of 0 with no uncovered lines, while `(diary)/p/[n]/page.tsx`, wrapped
exactly the same way, reported its whole body (lines 1–22) as uncovered. The bracket is
the only difference between the two files, so it is the scanner that fails, not the file.
The route itself was written to hold zero authored logic precisely so it could qualify:
its one real decision — what `<n>` means — lives in `packages/domain/src/pageAddress.ts`
with its own 100%-covered suite.

`apps/web/components/**` was genuinely empty until Phase 1 Task 7 (`.gitkeep` only) and
carried no per-glob threshold override until then — a threshold against zero files is the
vacuous pass CLAUDE.md's controller ruling for Task 1 explicitly forbade adding. Task 7,
which landed the first files there, added the explicit 90%/90%/90% row in the same commit,
per CLAUDE.md §2.1.

An uncovered line outside `packages/domain` requires a
`/* c8 ignore next -- <reason> */` comment with a real reason (`CLAUDE.md` §2.1). Where a
whole file is unreachable from any test, the honest options are two, and which one
applies depends on whether some _other_ pass can see it: exclude-and-regate (as
`seed.ts`, `seed-data.ts`, `testPayload.ts` and `migrate.ts` each get — excluded from the
unit pass, genuinely measured by the integration pass), or an explicit `c8 ignore` with
its reason at the point it applies. `apps/web/scripts/run-seed.ts` is the second kind and
now says so in code rather than only in prose: its body is top-level `await` ending in
`process.exit(0)`, so any test importing it would seed a real database and then kill its
own worker — there is no pass that could measure it, and claiming an exclude-and-regate
would claim a measurement nothing performs.

## The verify gates

- **`npm run verify`** — `typecheck && lint && test:unit`, where `test:unit` runs the
  `unit` **and** `unit-dom` projects with coverage. This is the pre-commit gate: no
  database, so a developer can always pass it honestly, even with Docker down.
- **`npm run verify:full`** — `verify` plus `test:integration:coverage` (which runs the
  same integration test files as `test:integration`, with `--coverage` scoped to the
  integration-only files named in the Contract and Migration sections below). This is
  what CI runs (`.github/workflows/ci.yml`); it requires `DATABASE_URL` for a test
  Postgres.

## The nine suites

### 1 · Unit

- **Tool:** Vitest.
- **Scope:** pure functions, state machines, mappers, validators. No I/O.
- **Status:** implemented, as TWO Vitest projects (`vitest.config.ts`):
  - `unit` — `packages/*/src/**/*.test.ts`, `apps/web/lib/**/*.test.ts` and
    `apps/web/scripts/**/*.test.ts`, excluding `*.integration.test.ts`. Node
    environment; these files are pure.
  - `unit-dom` — `packages/*/src/**/*.test.tsx` and `apps/web/**/*.test.tsx`, in a
    **jsdom** environment, with esbuild's automatic JSX runtime so a component test
    needs no `import React`. A separate project rather than a wider glob on `unit`
    because the environment differs, and paying jsdom's setup cost for every pure test
    to accommodate a handful of component tests is the wrong trade. Two further settings
    arrived with Phase 1 Task 7's first real components: `setupFiles:
['./vitest.dom-setup.ts']`, which sets `IS_REACT_ACT_ENVIRONMENT` once for every file
    instead of four repeated lines at the top of each (React reads the flag off the
    global object, so it cannot be set by importing anything), and
    `css.modules.classNameStrategy: 'non-scoped'`, which makes a CSS Module import
    resolve each key to its own literal name rather than `undefined`. Nothing in a jsdom
    test asserts a computed style — jsdom performs no layout, which is exactly why the
    rules that matter (a back face's `pointer-events: none` above all) are asserted in a
    real browser instead — so the strategy is purely about components rendering readable
    class names under test.

  `unit-dom` exists _before_ Phase 1's first component, on purpose. Until it did, no
  project's `include` matched `*.test.tsx` and neither set a DOM environment — so the
  first React component test would have been collected by nobody, and **a test collected
  by nobody does not fail; it silently is not there and the run stays green**. That is
  the worst member of the family this phase has already met twice (a migration that
  looked real because dev-mode schema push had already built the schema; a concurrency
  test that kept passing with its guarding clause deleted), because there is no red to
  notice.

  `apps/web/lib/react-harness.test.tsx` is the guard: it mounts a real React component
  into a real `document` with `react-dom/client` and reads the text back out, which is
  impossible to pass unless the file is being collected AND the environment is a DOM. It
  is named here so that its disappearance from a run summary is noticeable. It is not a
  placeholder and does not get deleted when real component tests arrive — it is the only
  thing in the repository that asserts the harness exists independently of any component.

  Two of Phase 1 Task 9's unit files carry a note of their own.
  `packages/domain/src/coverTitle.test.ts` asserts the clamp bounds as **literals**
  (`38`, `124`), never as `COVER_TITLE_SIZE.min`/`.max`: an assertion that reads the
  constant it is guarding moves with that constant and can never fail. That was caught
  by mutation, not by review — retuning the floor to 37 left the whole file green until
  the literals went in (`CLAUDE.md` §2.3, "a test that has never failed is unproven").
  `packages/domain/src/contentsLayout.test.ts`'s thirty-one-entry case pins **3 columns
  × 11 rows**, which is what SCREENS.md §1.2's formula produces and *not* the "4 columns
  × 8 rows" the same section calls verified; the two cannot both be true for any entry
  count, and `docs/deviations.md` §9 carries the arithmetic. The multi-column path is
  therefore covered as arithmetic but never rendered in a browser — the seeded book has
  ten contents entries — so a task that seeds more than eleven journeys owes the
  Contents body a real overflow assertion.

  Two of Phase 1 Task 9's unit files carry a note of their own.
  `packages/domain/src/coverTitle.test.ts` asserts the clamp bounds as **literals**
  (`38`, `124`), never as `COVER_TITLE_SIZE.min`/`.max`: an assertion that reads the
  constant it is guarding moves with that constant and can never fail. That was caught
  by mutation, not by review — retuning the floor to 37 left the whole file green until
  the literals went in (`CLAUDE.md` §2.3, "a test that has never failed is unproven").
  `packages/domain/src/contentsLayout.test.ts`'s thirty-one-entry case pins **3 columns
  × 11 rows**, which is what SCREENS.md §1.2's formula produces and *not* the "4 columns
  × 8 rows" the same section calls verified; the two cannot both be true for any entry
  count, and `docs/deviations.md` §9 carries the arithmetic. The multi-column path is
  therefore covered as arithmetic but never rendered in a browser — the seeded book has
  ten contents entries — so a task that seeds more than eleven journeys owes the
  Contents body a real overflow assertion.

- **Run:** `npm run test:unit` (both projects, with coverage), or `npm run test` for
  watch mode across every project.
- **Add one:** colocate `<name>.test.ts` next to `<name>.ts` — or `<name>.test.tsx` for
  anything that renders, which the `unit-dom` project picks up automatically. Follow the
  TDD cycle
  (`CLAUDE.md` §2.2): write the failing test, confirm it fails for the expected reason,
  write the minimum code to pass, refactor with the suite green. Time is always
  injected — never `Date.now()` inside logic under test (this is how `flipMachine`'s
  latch behaviour and `otpChallenges`' expiry are tested with no clock mocking library).

### 2 · Integration

- **Tool:** Vitest + a real test Postgres.
- **Scope:** collections, hooks, server actions, access control against a real database.
- **Status:** implemented. The `integration` Vitest project (`vitest.config.ts`) includes
  `**/*.integration.test.ts` under `apps/web/lib/**`, `apps/web/collections/**`,
  `apps/web/scripts/**` and `packages/*/src/**` (no file matches that last pattern
  today — `packages/domain` and `packages/tokens` are pure, no I/O).
  `collections.integration.test.ts` (Task 6) exercises the schema
  rules from `DATA_MODEL.md`, the migration reversibility case (§9 below), and the
  access control on the two server-only collections — `jobs` and `otpChallenges` declare
  `access: { read/create/update: () => false }`, and those predicates had no test at all
  because Payload's Local API defaults to `overrideAccess: true` and so never ran them.
  The four cases pass `overrideAccess: false`, which is what a REST or GraphQL request
  does, and assert every one is refused; `seed.integration.test.ts` (Task 11) exercises
  `apps/web/scripts/seed.ts` against real `journeys`, `pages`, `media` rows and the
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
- **Run:** `npm run test:integration` (requires `DATABASE_URL`), or `npm run verify:full`
  to run it alongside everything else.
- **Add one:** name the file `<name>.integration.test.ts` so Vitest's project split picks
  it up; it will not run under `npm run verify` or the pre-commit hook. Exercise the real
  Postgres started by Docker locally (see `docs/runbook.md`), never a mock of Payload's
  query layer — per `CLAUDE.md` §2.3, "no mocking what we own." Per-journey isolation
  tests (guarding the five recorded per-journey-state defects) belong here.

### 3 · Contract

- **Tool:** Vitest — one shared suite run against both the local and the production
  implementation of each adapter.
- **Scope:** `storage`, `mailer`, `queue` (design spec §6) — every port that crosses into
  an external service.
- **Status:** implemented for all three ports (Tasks 7-9). Each port lives in
  `apps/web/lib/ports/<name>.ts`; each contract suite is a
  `apps/web/lib/adapters/contract/<name>-contract.ts` module exporting a
  `<name>Contract(name, makeAdapter, ...)` function that registers one parameterised
  `describe` block — written once, run unchanged against every adapter.

  **A contract suite imports its port's type and nothing else.** That is the property
  that makes it reusable, and it is easy to lose: `queue-contract.ts` briefly imported a
  `jobRow()` helper that called `getPayload()`, so the "reusable" queue suite could only
  run somewhere Payload was available — a future worker-backed adapter would have had to
  drag a CMS in to be contract-tested. It now takes a `readJobRow` probe from whichever
  test wires it up, and the Payload-backed reader lives in
  `postgres-queue.integration.test.ts` where the adapter it belongs to lives. Anything a
  suite needs that is adapter-specific arrives as a parameter.

  Today's adapters:
  - `storage` → `apps/web/lib/adapters/local-storage.ts` (filesystem). Path traversal is
    rejected by `validateStorageKey`, exported from the port itself, not the adapter — the
    Cloudflare R2 adapter arriving in Phase 3 has no filesystem to protect, so the guard
    has to live somewhere every adapter shares.
  - `mailer` → `apps/web/lib/adapters/console-mailer.ts` (prints to the terminal). The
    contract asserts the security requirement from `CLAUDE.md` §7 directly: `logLines`
    (what actually reached the terminal) never contains a full email address (masked to
    `m***@example.com`) or the message body, which carries the OTP code. Full messages
    stay available to tests via a separate in-memory outbox, `sent`.

    `sent` and `logLines` are declared on `TestableMailer`, which extends `MailerPort`;
    the port itself is `send()` alone. They were briefly on the port, which would have
    obliged Phase 2's Resend adapter to retain every OTP message body in process memory,
    unbounded, purely to satisfy a type that exists for tests. `StoragePort` and
    `QueuePort` never had an equivalent; the split is what brings the three back into
    line.

    The contract is wired with `isDevelopment: false` **explicitly**. The console adapter
    deliberately prints the code when `isDevelopment` is true, and letting that flag
    default from `NODE_ENV` (as the wiring first did) made the §7 security assertion
    depend on an ambient environment variable: green on CI, red for any developer whose
    shell exported `NODE_ENV=development`, reporting a leak that was not one. Confirmed
    by running the old wiring under `NODE_ENV=development`:
    `× never records the message body, which carries the code → expected 'mail: sent
"Your code" to a***@b.com …' not to contain '123456'`. `CLAUDE.md` §2.3 requires
    time and environment to be injected for exactly this reason.

  - `queue` → `apps/web/lib/adapters/postgres-queue.ts` (the `jobs` table, Task 9). The
    concurrency case — two concurrent `claim()` calls must yield the job to exactly one
    caller — is why this suite is an _integration_ test
    (`postgres-queue.integration.test.ts`, needing real Postgres): `claim()`'s
    `SELECT ... FOR UPDATE SKIP LOCKED` has no meaning against a mock.

    The contract's own `Promise.all([queue.claim(), queue.claim()])` case is a **smoke
    test only**, named as one — on a fast local database two full `claim()` round trips
    were measured to complete back-to-back rather than genuinely overlapping, so it still
    passed 8/8 times with the locking clause deleted from the adapter. The real
    regression test is `postgres-queue.integration.test.ts`'s 'claim() skips a row a
    concurrent transaction is holding, rather than blocking for it': it opens a raw
    connection, has it `SELECT ... FOR UPDATE` (no `SKIP LOCKED`) the job's row and leave
    that transaction open and uncommitted, then calls the real `queue.claim()` and races
    it against a short timeout via `Promise.race`. With the clause present, `claim()`
    returns `ok(null)` promptly; without it, `claim()`'s own `SELECT` blocks on the held
    lock and the assertion fails with a clear diff instead of hanging. An earlier version
    of this test issued the same hand-written SQL on two raw connections without calling
    `claim()` at all — which proved Postgres implements `SKIP LOCKED` (never in question),
    not that the adapter uses it; that version was replaced after review because deleting
    the clause from the adapter left it passing.

- **Run:** unit-reachable contracts (`storage`, `mailer`) run under `npm run verify` like
  any other unit test; the `queue` contract, being integration-only, runs under
  `npm run verify:full` / `npm run test:integration`.
- **Coverage for integration-only code:** `npm run verify`'s coverage pass runs without
  a database, so `postgres-queue.ts`, `queue-contract.ts`, `queue-fixtures.ts`,
  `seed.ts`, `seed-data.ts`, `testPayload.ts` and `migrate.ts` — reachable exclusively
  from an `*.integration.test.ts` — are excluded from `vitest.config.ts`'s coverage
  `include` rather than counted as 0%-covered there. They are gated instead by a second,
  dedicated pass, `vitest.integration.config.ts`, run via
  `npm run test:integration:coverage` (chained into `npm run verify:full`) — it runs the
  same integration test files with `--coverage` scoped to those seven, plus
  `apps/web/collections/**`, `apps/web/globals/**`, `apps/web/payload.config.ts` and
  `apps/web/migrations/**` (all four at 100%; see Coverage gates above).
  Thresholds are set per-file to what is genuinely achieved, not aspirational:
  `queue-contract.ts`, `queue-fixtures.ts`, `seed-data.ts` (a pure data literal) and
  `migrate.ts` are 100% lines/branches/functions — see the Migration section below for
  what `migrate.ts` reaches that number with, so it is fully achieved rather than left
  unknown behind the whole-module `c8 ignore` it previously carried (see `migrate.ts`'s
  own header). `postgres-queue.ts` and `testPayload.ts` are both 93% lines, 75% branches,
  100% functions — the former's two
  uncovered branches are `enqueue()`'s and `claim()`'s error-`catch` paths for an
  unexpected database failure, which have no organic trigger without mocking the module
  under test (CLAUDE.md §2.3: "no mocking what we own") or deliberately corrupting the
  test database; the latter's are `ensureDatabaseExists()`'s `CREATE DATABASE` branch,
  which only runs the very first time any integration test ever executes against a given
  Postgres volume (every run after that finds `diary_test` already exists). `claim()`'s
  safety-critical `SELECT ... FOR UPDATE SKIP LOCKED` line itself executes on every call
  regardless of outcome, so it is fully exercised by both the smoke test and the blocking
  regression test above. `seed.ts` is 100% lines/functions, 83% branches — the uncovered
  branches are defensive guards with no organic trigger from the ten real journeys' own
  data (an unrecognised `dates` format, an id branding failure that can't happen for an id
  Payload itself just generated, an out-of-bounds accent-tint index that can't happen for
  a fixed 5-element tuple); see `seed.ts`'s own `c8 ignore` comments and
  `vitest.integration.config.ts`'s threshold comment for the full list.
- **Add one:** write `apps/web/lib/ports/<name>.ts` (the interface, plus any guard every
  adapter must share - see `validateStorageKey` above), then
  `apps/web/lib/adapters/contract/<name>-contract.ts` (the shared suite) before any
  adapter exists, per TDD. Name the adapter's own test file
  `<adapter>.test.ts` (or `.integration.test.ts` if it needs real infrastructure) and call
  `<name>Contract('<adapter>', makeAdapter)` from it.

### 4 · End-to-end

- **Tool:** Playwright (`playwright.config.ts`, Task 12).
- **Scope:** real journeys — page flip, bookmark jump, gallery, lightbox, mobile swipe,
  sign-in + OTP, upload round-trip.
- **Status:** the harness is implemented, and the first real journey it guards is the
  book. The bespoke `/admin` panel and sign-in are still later phases; the routes this
  app serves today are Payload's own admin at `/cms` and the diary's `/p/<n>`.

  **`e2e/book.spec.ts` (Phase 1 Task 7)** covers what only a real layout engine can
  answer, and deliberately nothing that `packages/domain` already proves: that a click on
  a Contents link is not swallowed by the leaf's back face, that no back face can receive
  pointer events at all, that the leaf transitions `transform` and nothing else, that no
  element anywhere inside the book animates a layout property, that the design box is a
  fixed 1300×860 scaled by a transform rather than reflowed, that it rescales when the
  viewport changes, and that exactly one leaf is visible at rest.

  Its first case is the load-bearing one. The handoff records the exact defect
  (README, "Pointer-events warning"): with the back face clickable, Contents links and
  gallery buttons appeared completely dead while their handlers were fine, and it cost a
  debugging session to find. The assertion was proved able to fail — removing
  `pointer-events: none` from `.back` in `book.module.css` and re-running the suite fails
  it on all three viewport projects, with Playwright naming the culprit outright
  (`<div data-face="back" …> intercepts pointer events`); restoring the rule turns it
  green again. That is also why the back face is hidden by opacity alone and never by
  `visibility`: a second, redundant guard would have made the rule that actually matters
  untestable.

  **`e2e/flip.spec.ts` (Phase 1 Task 8)** covers the reader's own triggers — both
  page-edge strips, the bottom arrows, all four keyboard keys, and a bookmark jump —
  driven as a reader drives them, plus the three things only a browser settles:
  that a strip lying over the page stack is genuinely clickable rather than covered
  by the leaf above it, that `prefers-reduced-motion` reaches the machine through a
  real media query, and that hammering a key through a real 900ms transition leaves
  the book usable rather than seized.

  Two of its cases produced real findings on their first run, and both are recorded
  where they were fixed rather than only here:

  - **The handoff's own `z-index: 900` cannot work in the handoff's own DOM
    position.** With the strips as siblings of the leaves (the prototype's
    arrangement), Playwright timed out with `<article class=page> from <div
    data-leaf=2> subtree intercepts pointer events` — a leaf's stacking order is
    `1000 - i`, so the current page always paints above a strip at 900. The strips
    became siblings of the STACK instead; see `docs/deviations.md` §8.
  - **The bottom arrows were unclickable at 390px.** The `mobile` project caught
    `<nav class=rail> intercepts pointer events` on the next arrow: the bar's
    contents are 338px wide in a 232px column, and unwrapped they spilled under the
    bookmark rail. `book.module.css`'s `.bottomBar` now wraps, with the reason at
    the rule.

  Every case in the file waits for the book to be LIVE before pressing anything
  (`waitForLiveBook`, which watches the measured scale replace the server's
  `scale(1)`). A page-turn trigger fired between the server's HTML arriving and
  React hydrating is lost for good — no retry recovers it — and the two
  reduced-motion cases, which by design do not wait out a transition, failed on all
  three viewport projects until that wait existed. The patient cases had been
  winning the same race by luck.

  The bookmark-jump anchor is proved able to fail, the way `book.spec.ts`'s
  pointer-events case is. Deleting the two anchoring lines from `useFlip.ts`'s
  `jumpTo` — so the jump goes straight to the target from wherever the reader is —
  fails three tests at three levels: `useFlip.test.tsx` reports `from: 29` where the
  anchor rule requires `from: 3`, `Book.test.tsx` sees leaves `['2', '8']` visible
  instead of `['2', '3']`, and this file's own in-flight read returns `['29']`
  instead of `['2', '3']`. Restoring the lines turns all three green.

  **`e2e/pages.spec.ts` (Phase 1 Task 9)** covers the Cover and Contents pages'
  browser-only guarantees, at all three viewport projects. What the two components
  *decide* is already covered without a browser
  (`apps/web/components/pages/Cover.test.tsx`, `Contents.test.tsx`) and so is the
  arithmetic behind those decisions (`packages/domain/src/coverTitle.test.ts`,
  `contentsLayout.test.ts`), so this file asserts only what a laid-out page can answer:
  that SCREENS.md §1's measurements stay absolute under the design box's `scale(k)`
  (`offsetTop`/`offsetLeft`/`offsetWidth` are layout coordinates a transform does not
  touch, so the washi strip still reports `top: 52; left: -26; 190x36` at 390px as at
  1440px); that the cover title actually FITS (`fitTitleSize` sizes from an *estimate*
  of Caveat's advance width, since no font metrics exist on the server, so only a
  browser can confirm `scrollWidth <= clientWidth` and that SCREENS.md's "last-resort"
  ellipsis never engages); and that the Contents body does not overflow its `1fr` track,
  which is the one half of SCREENS.md §1.2's "zero overflow" claim that can be checked
  here — the multi-column count cannot, see `docs/deviations.md` §9.

  **`e2e/notes.spec.ts` (Phase 1 Task 10)** does the same job for the Notes page, and
  two of its cases exist because of defects that have already happened rather than ones
  somebody imagined.

  The first is the highlight gaps. `SCREENS.md` §1.3 records that
  `justify-content: space-between` on the highlight list "dumped 232px into two gaps
  when a journey had three highlights instead of four", and that the fix was structural:
  the highlights are `flex: 0 0 auto`, sized to their content, and the ephemera slot —
  a media element that can absorb 54px or 300px without breaking — takes the elastic
  space. The case measures the gaps between rendered highlights on a THREE-highlight
  journey (Lisbon, `/p/6`), because three is the case that broke; a four-highlight
  journey filled the column by accident and never showed the defect. Measured: 13px and
  13px in layout pixels, against a bound of 30 and a recorded defect of 232.

  The second is the focal point. `SCREENS.md` is blunt about the stakes — "If this is
  not wired through to rendering, the admin's focal-point picker is decorative — that is
  the whole point of it" — and a test asserting only that `object-position` carries the
  right string would pass against a stylesheet with `object-fit: fill`, where
  `object-position` does nothing at all. So the case screenshots the hero image twice,
  once at the slot's own focal point and once forced back to `50% 50%`, and requires the
  two buffers to differ. `apps/web/scripts/seed-data.ts` gives Tokyo's hero slot the
  seed's one non-default focal point (`18% 82%`) so that there is a page on which the
  crop demonstrably moves.

  Every selector in that file is scoped to one leaf via `Leaf.tsx`'s `data-leaf` index.
  `Book.tsx` renders all thirty-three leaves at once, so `[data-page="notes"]` alone
  matches ten sections and an unscoped locator is a strict-mode violation rather than a
  wait.

  One assertion in it records a browser fact rather than the authored one, with its
  reason at the assertion: the left column's fit is measured from its last child's
  untransformed `offsetTop`/`offsetHeight` rather than from `scrollHeight`, because the
  scrollable overflow region includes the ROTATED bounding boxes of the tally ticket
  (-0.5deg) and the ephemera scrap (+0.5deg), which makes every notes page in the book
  report exactly 3px of "overflow" on a column whose content fits perfectly.

  Two assertions in `pages.spec.ts` record a browser fact rather than the authored one, each with its
  reason at the assertion: Chromium reports the inner rule's `2.5px` border as `2px`
  (it snaps a computed border width to a whole CSS pixel, measured at
  devicePixelRatio 1 *and* 3, so it is not a density effect), and the washi strip's
  rotation is read back out of the resolved matrix with `atan2` rather than pinned as
  matrix digits, which differ in the sixth decimal place between Chromium builds.

  **`e2e/layout.spec.ts` (the 2026-09-01 sweep's DIARY-001/002/003)** covers where the
  scaled book actually lands on the screen, at all three viewport projects. It exists
  because the visual-regression suite was supposed to own this question and demonstrably
  did not: the `mid` and `mobile` baselines were regenerated over a book that had been
  pushed off the screen entirely and stayed green on a blank page for two commits
  (`docs/qa/2026-09-01-diary-sweep.md`, DIARY-004). A baseline can only say "this looks
  like it did last time"; a picture of no book is still a picture. The three cases say it
  in numbers instead, each from the symptom a reader meets rather than from the CSS that
  produced it: the design box's drawn rect is inside the area `useBookScale` measures and
  concentric with it (off-centre by 0px, spilling 0px on each side, tolerant of the
  sub-pixel remainder a fractional scale leaves); `document.elementFromPoint` at the
  centre of that area resolves to something inside the design box, which is the one
  assertion that separates "drawn" from "laid out somewhere off the screen" and is
  exactly the probe that returned `null` at 390px; every `[data-bookmark]` tab hit-tests
  to itself at its own centre and a click on one of the nine the sweep found dead reaches
  `/p/12`; and both page-edge turn strips hit-test to themselves. That last one is the
  case `e2e/flip.spec.ts` could not make: Playwright scrolls an element into view before
  clicking it, so its edge-strip cases passed on a strip that had left the viewport, which
  a reader cannot scroll back into `.stage` (`overflow: hidden`).

  `e2e/smoke.spec.ts` is the console-error gate: it loads `/cms` and `/p/1` and asserts
  **zero** `console` (error level) and `pageerror` events, with both listeners attached
  _before_ `page.goto()`. This is deliberately the harness's centre of gravity, not an
  afterthought — the handoff's own defect log (`CLAUDE.md` §10, `SCREENS.md`) is mostly
  _silent_ failures (a swallowed click, a missing derivative, a rejected autoplay
  promise), none of which move a pixel, so visual or manual-only QA misses them
  entirely. The test also waits `networkidle` and a fixed 500ms grace period after
  `goto()` before asserting — a real hydration-time console error was observed (in this
  task's own planted-failure proof, see below) landing _after_ the `load` event, so
  checking immediately on navigation would have produced a false negative on exactly the
  class of defect this suite exists to catch.

  Its third case asserts that `/favicon.ico` responds `200`. Every browser asks for that
  address without being told to, and nothing declared it — the sweep recorded the 404 as
  a console `error` on every cold load of every route, and Lighthouse recorded it on a
  production build (`docs/qa/2026-09-01-diary-sweep.md`, DIARY-006). It is asserted with
  `request.get` rather than by watching a page load because whether a browser fetches
  the address at all depends on the browser and on whether it is headed: the two cases
  above are headless and stayed green through the whole defect.

  **A CI gap this file had not recorded.** `.github/workflows/ci.yml`'s `browser` job
  named only `smoke`, `a11y` and `visual` in its single `npx playwright test`
  invocation, so `e2e/book.spec.ts` and `e2e/flip.spec.ts` — named by
  `npm run test:e2e` since Tasks 7 and 8 — had never actually gated a merge. Their
  assertions are among the most load-bearing in the repository (the back face swallowing
  every click, the transform-and-opacity-only budget, all five turn triggers), so they
  were passing locally and guarding nothing remotely. The job now names every spec file
  explicitly, which is also why the list is spelled out rather than given as a
  directory: adding a spec without adding it there is then a visible omission in a diff.

- **Three viewport projects** — `desktop` (1440×900), `mid` (1000×800), `mobile`
  (390×844; `isMobile`/`hasTouch` set) — run every spec three times, once per breakpoint
  named in the Task 12 brief. All three use Chromium, not a mix of engines: this
  environment's Firefox/WebKit binaries are an unverified download, and are not needed
  to catch the class of defect this harness targets today (console/pageerror,
  axe violations, pixel drift). Cross-browser coverage is a candidate for a later phase,
  not a Task 12 gap silently worked around — see `playwright.config.ts`'s header.
- **Run:** `npm run test:e2e` (headless, runs `e2e/smoke.spec.ts`,
  `e2e/book.spec.ts`, `e2e/flip.spec.ts`, `e2e/layout.spec.ts`, `e2e/pages.spec.ts` and
  `e2e/notes.spec.ts`); `npm run test:e2e:headed` (all `e2e/*.spec.ts`, visible browser) — this is also the engine
  `sweeping-for-browser-defects` (`.claude/skills/`) uses for manual, scripted sweeps.
  `playwright.config.ts`'s `webServer` boots the real app: `npm run dev` locally
  (reused if already running), `npm run build && npm run start` in CI.
- **Add one:** one spec per real user journey as each is built; assert on the DOM
  reflecting the state machine (e.g. `flipMachine`'s state), not on re-deriving the
  machine's logic in the test. Every new route gets its own `test()` in
  `e2e/smoke.spec.ts` first — a route with no console-error coverage is a route this
  suite is silently not protecting. A new spec file also needs adding to the
  `test:e2e` script; a spec no script names is a spec CI does not run.

### 5 · Visual regression

- **Tool:** Playwright snapshots (`toHaveScreenshot`, `maxDiffPixelRatio: 0.01` in
  `playwright.config.ts` — the design is high-fidelity, so drift is a defect, not noise).
- **Scope:** every page type and every admin screen, at each breakpoint. Drift from the
  high-fidelity design is treated as a defect. Each page type is snapshotted by the task
  that lands its designed layout, not before — a baseline captured against provisional
  page content would have to be thrown away and recaptured, teaching nobody to trust it
  in between. Phase 1 Task 9 added the **Cover** and **Contents** pages
  (`diary-cover-*.png`, `diary-contents-*.png`, all three projects) and Task 10 the
  **Notes** page (`diary-notes-*.png`); Frames I/II and About follow in Task 11.

  The diary cases snapshot the FULL PAGE, not the scaled design box. The box is drawn
  with `transform: scale(k)`, so a box-only snapshot would be byte-identical at all
  three projects and would prove nothing about the breakpoints, whereas the full page is
  what a reader at 390px actually sees. The consequence is that these baselines also
  carry the diary chrome outside the box (bookmark rail, bottom bar), whose designed
  appearance is Task 12 — that task updates these nine files, which is expected and is
  what a baseline is for. `docs/deviations.md` §11 still applies to all of them: Courier
  Prime and EB Garamond's italic face render in their generic fallbacks (a measured LCP
  constraint, not an oversight), so these baselines guard geometry AND two of three
  families' typography, not all three yet. Regenerate them once Courier Prime is wired
  back in.

  **A baseline is only as good as the page it was captured over, and this suite has
  already ratified an S1 defect once.** The 2026-09-01 browser sweep
  (`docs/qa/2026-09-01-diary-sweep.md`, DIARY-001 and DIARY-004) found the book clipped
  from about 1435px down and entirely outside the viewport at 390px — and the `mid` and
  `mobile` Cover and Contents baselines had been regenerated over exactly that state, so
  `diary-cover-mobile-linux.png` was a picture of a blank page with no book on it and
  the suite stayed green against it for four tasks. That is fixed: the six diary
  baselines were regenerated as part of the fix, and `e2e/layout.spec.ts` now asserts in
  numbers, at all three projects, what a picture cannot say — that the design box is
  inside the area its scale was measured from and that `elementFromPoint` at that area's
  centre lands inside the book.

  **The standing rule that came out of it:** never accept a regenerated `diary-*`
  baseline unless `e2e/layout.spec.ts` was green in the SAME container run that produced
  it, and never commit one without opening the image and looking at it. A green diff
  against a wrong baseline is worth nothing.
- **Status:** the mechanism is implemented and proven, and now runs in CI (Task 1 of
  Phase 1 closed the gap below). `e2e/visual.spec.ts` snapshots every screen that exists
  today — `/cms` — at all three breakpoints, alongside the diary's Cover, Contents and
  Notes pages, using the exact `toHaveScreenshot`/baseline-diff machinery every further page
  will use. Baselines are committed at
  `e2e/visual.spec.ts-snapshots/*.png`; a snapshot suite with no baseline to compare
  against protects nothing.
- **The former gap, closed:** Playwright's screenshot baselines are keyed by OS and font
  rendering, so the Windows-generated baselines Task 12 committed (suffixed `-win32.png`)
  never honestly compared against CI's Ubuntu `browser` job, regardless of whether a page
  had actually changed — that job skipped `test:visual` outright rather than run a
  comparison that could not mean anything. The fix is the standard one: both baseline
  generation and CI comparison now happen inside the same pinned image,
  `mcr.microsoft.com/playwright:v<version>`, where `<version>` matches the
  `@playwright/test` version pinned in `package-lock.json` exactly (`.github/workflows/ci.yml`'s
  `browser` job header names the current tag; bump both together). The committed baselines
  are now `-linux.png`, generated by running `npx playwright test e2e/visual.spec.ts
--update-snapshots` inside that exact image (see this task's report for the pasted
  baseline-generation and clean-comparison runs) — the old `-win32.png` files were deleted,
  not kept alongside. `browser` no longer skips `test:visual`; it runs in the same
  `npx playwright test` invocation as the smoke and accessibility specs.
- **Run:** `npm run test:visual` on a developer's own machine still works for a quick
  local check, but its baseline will not match this Ubuntu-image comparison pixel-for-pixel
  on font rendering — treat a local mismatch as inconclusive, not as drift, and confirm
  in the pinned image before updating a baseline. Update baselines deliberately, inside
  the pinned image, with `npx playwright test e2e/visual.spec.ts --update-snapshots` after
  confirming a diff is an intended change, never reflexively to make a failure go away.
- **Add one:** one snapshot per page type per breakpoint listed in design spec §8.2
  (diary `<860px`; admin `≥1180`/`≥860`/narrow; login `<820`) as each page is built. The
  OTP-cell collapse at 819px (design spec §11) is the canonical example of a defect this
  suite type exists to catch.

### 6 · Accessibility

- **Tool:** axe-core in Playwright (`@axe-core/playwright`, `e2e/a11y.spec.ts`), via the
  shared `expectNoAxeViolations` helper (`e2e/support/axe.ts`, Task 1 of Phase 1) — plus
  `measureContrastOverGradient` (`e2e/support/coverContrast.ts`) for the one thing axe
  will not judge: text over a gradient (finding 2 below).
- **Scope:** every route. Contrast ratios from the handoff's token table are asserted,
  not assumed (e.g. `ink-muted` must stay opaque — an alpha version measures below
  4.5:1, per the handoff's own note). Where axe returns `incomplete` rather than a
  verdict, the ratio is measured from the rendered pixels and asserted anyway; an
  `incomplete` is never read as a pass.
- **Status:** implemented for both routes that exist, and for each designed diary page
  in turn — `/p/1` (Cover, Task 7), `/p/2` (Contents, Task 9) and `/p/3` (Notes, Task
  10), because each page kind renders different markup on the same URL shape. All three
  call `expectNoAxeViolations(page)` with **no exclusions at all** — every rule in the
  full ruleset applies to a route this project authored, and `/cms`'s allowances below
  must never be inherited by them. All three pass on all three viewport projects. The
  Notes case is the first with anything for `image-alt`, `definition-list` or
  `link-name` to judge: it is the first page in the diary with photographs, a
  description list (the tally ticket) and a link styled as a button. `/cms`
  asserts `results.violations` is empty — zero violations, not "no critical violations"; CLAUDE.md's
  non-negotiables draw no line between severities. `expectNoAxeViolations` defaults to
  the FULL ruleset with no exclusions; a caller passes rule ids to disable only via its
  `options.allow`, visibly, at its own call site. Running axe against `/cms` today
  surfaced two real findings that belong to Payload's own stock admin markup, not to any
  code authored in this repository: `landmark-one-main` and `page-has-heading-one`, both
  `impact: moderate`, both scoped to the bare `<html>` element. `/cms` is explicitly
  "development scaffolding ... not the product" (`apps/web/payload.config.ts`'s own
  header) and is disabled outright in production, so `e2e/a11y.spec.ts` calls
  `expectNoAxeViolations(page, { allow: ['landmark-one-main', 'page-has-heading-one'] })`
  — narrowly, with the finding and the reasoning recorded in the test file's own header,
  not by loosening the helper's default. Any _other_ violation, on this route or any
  future one, still fails the suite, and a diary route calling the helper with no
  `allow` cannot inherit `/cms`'s exclusion — each call site names its own. This
  exclusion is revisited the moment `/cms` stops being the route under test — Phase 1's
  bespoke `/admin` replaces it.
- **Proof the helper actually catches something:** verified by planting a real violation
  (an `<img>` with no `alt`, no `aria-label`, no `title` — axe's `image-alt`, `impact:
critical`) into the live `/cms` DOM via `page.evaluate` and calling
  `expectNoAxeViolations(page)` with no `allow` — the assertion failed, listing
  `image-alt` alongside the two known `/cms` findings (`region` also fired, since the
  planted `<img>` sat outside any landmark). Removing the plant and calling
  `expectNoAxeViolations(page, { allow: [...] })` with the two known exclusions passed
  cleanly. See this task's report for the pasted runs.
- **Run:** `npm run test:a11y`.
- **Add one:** call `expectNoAxeViolations(page)` against every new route as it is added
  — with no `allow`, which asserts zero violations against the full ruleset. Only pass
  `allow` with the same standard of evidence as above (a named, understood, vendor-owned
  finding), with a comment at the call site — never to make an inconvenient result
  disappear, and never inherited from another spec's exclusion.

#### Findings recorded here rather than silenced

**1 · The `/cms` axe case had been passing vacuously.** Until Phase 1 Task 9,
`e2e/a11y.spec.ts`'s `/cms` case called `expectNoAxeViolations` immediately after
`page.goto`, with no wait for Payload's asynchronously-rendered login form — so axe was
analysing a nearly empty document. The gap surfaced as an intermittent failure under
concurrent workers that named a *different* rule on each run (`region` once, a
keyboard finding on `.checkbox.field-type` another), while passing every time the case
ran alone. The case now waits for the form and for Next's dev overlay, exactly as
`e2e/visual.spec.ts`'s `/cms` case already did. With the analysis deterministic, a
**third** Payload-owned finding is visible and is now in that call site's `allow` list:
`region` ("All page content should be contained by landmarks"), the same landmark family
as `landmark-one-main` and `page-has-heading-one`. The diary route carries no exclusions
of any kind — the Cover and Contents cases call `expectNoAxeViolations(page)` with no
`allow` argument at all — and adding one there would be a defect, not a workaround.

**2 · The Cover's contrast is measured, not asserted by axe — and two handoff values were
changed so it clears AA.** axe-core reports `color-contrast` as **incomplete** on both
diary pages (7 nodes on the Cover, 45 on Contents), because it cannot resolve a gradient
background. Incomplete is not a violation, so the suite is green; that is axe declining to
judge, not a contrast pass, and `CLAUDE.md` §2 requires the ratios to be *asserted*. They
are now asserted by a test rather than measured by hand: `e2e/a11y.spec.ts`'s cover case
calls `measureContrastOverGradient` (`e2e/support/coverContrast.ts`), which hides each
line with `visibility: hidden` so its box shows only the cloth it sat on, screenshots the
cover element, takes the **lightest** pixel under each line as that line's background —
the worst case, since the 45° texture makes the background a range rather than a value —
flattens the line's own translucent cream onto it, and runs both through
`packages/domain/src/contrast.ts`. It runs at all three viewport projects.

Measured with SCREENS.md §1.1's literal values, four of the five lines failed. Both
columns below are the `desktop` project's, the tightest of the three:

| Cover line | Size | Before | After | Required |
|---|---|---|---|---|
| "Travel Diary" eyebrow | 12px | **2.86:1** | 4.52:1 | 4.5:1 |
| "Wanderings" title | 124px | 3.81:1 | 8.13:1 | 3:1 |
| Subtitle | 22px italic | **2.72:1** | 5.33:1 | 4.5:1 |
| "Kept by …" | 12.5px | **2.37:1** | 4.73:1 | 4.5:1 |
| Years | 12.5px | **1.87:1** | 5.26:1 | 4.5:1 |

The 22px italic subtitle does **not** qualify for SC 1.4.3's large-text exemption, which
needs 24px or 18.66px bold, so it is held to 4.5:1; only the 124px title is large text.
The cause was in the specified gradient rather than in the transcription — the handoff's
own prototype renders the same way: the cloth interpolates from an opaque colour to a
28%-opaque black, so by mid-page the cloth is only ~72% opaque and the light paper face
beneath washes it from `#2f4a47` up to roughly `#5e6d67`, precisely where the small
Courier lines sit. **The user approved two value changes** (`docs/deviations.md` §12): the
gradient's end stop is now the opaque form of that same `rgba(0,0,0,.28)` overlay, and the
years line's alpha is `.78` rather than `.5` — the one line an opaque cloth alone does not
rescue. No new colour was introduced, and every other §1.1 value is unchanged. The
eyebrow's 4.52:1 is the narrowest margin on the page and must be re-measured, not reasoned
about, after any change to the cloth, the texture over it, or that line's own alpha.
**The Contents page needs no such note: every one of its fourteen text roles was measured
against the darkest paper stop and clears its bar, the lowest at 4.57:1.**

**3 · Two of the three handoff fonts are now self-hosted; the third is a measured,
documented deferral.** README.md's "Fonts are Google Fonts (Caveat, EB Garamond,
Courier Prime) — self-host in production" was closed for Caveat and EB Garamond's
upright face by the font-hosting task (`docs/adr/0005-font-hosting.md`,
`apps/web/app/(diary)/fonts.ts`) via `next/font/local`, with the font files committed
and `next build` never touching the network. Courier Prime and EB Garamond's italic
face are **not** loaded — a third self-hosted font on this route repeatedly measured
`/p/1`'s LCP over CLAUDE.md §6's 2,500ms gate in the pinned container, regardless of
which specific family was added third (`docs/deviations.md` §11 has the full measured
table). All nine visual baselines were regenerated in the pinned container against
this state; they guard geometry and two of three families' typography, and must be
regenerated again once Courier Prime's headroom is found (most likely via the
script-weight reduction this same task's ADR names as the next step).

### 7 · Performance

- **Tool:** Lighthouse CI (`@lhci/cli`, `lighthouserc.json`) + custom probes (the custom
  probes — 60fps flip measurement, N+1 query detection — are still not yet implemented;
  they need the flip and data-fetching code these budgets describe).
- **Scope:** the hard budgets in `CLAUDE.md` §6 — 60fps flip (only `transform`/`opacity`
  animated), diary route JS ≤180KB gzipped, admin ≤320KB, LCP ≤2.5s, CLS ≤0.1, INP
  ≤200ms, no N+1 queries, always a derivative tier never an original.
- **Status — hard-gated in CI as of Task 1 of Phase 1, ahead of the route it guards.**
  `lighthouserc.json` now points `collect.url` at `http://localhost:3000/p/1` (the diary
  route Task 13 creates) and `http://localhost:3000/cms`, with per-URL budgets via
  `assert.assertMatrix` rather than one shared `assert.assertions` block: `/p/1` is held
  to `http-status-code` (`minScore: 1`), `resource-summary:script:size`
  (≤184320 bytes), `largest-contentful-paint` (≤2500ms) and
  `cumulative-layout-shift` (≤0.1); `/cms` is held to `http-status-code` and
  `cumulative-layout-shift` only. `CLAUDE.md` §6 scopes the 2500ms LCP budget to "diary,
  4G" specifically — holding Payload's heavy admin bundle to it was the original reason
  this whole step was informational, and giving `/cms` its own entry with no LCP
  assertion is what stops that recurring now that `/cms` shares a config with a real
  route. `.github/workflows/ci.yml`'s `browser` job no longer runs this step with
  `continue-on-error` (see below).
- **`/p/1` was landed as a hard gate before the page existed, deliberately.** The
  controller ruling for Task 1 was to land the gate _before_ the page it measures,
  specifically so no later task can land a regression under a budget still marked
  informational — Phase 0 shipped exactly that state once (`/cms` under
  `continue-on-error`) and it hid nothing because nobody was watching an informational
  job. The route arrived in Task 7 (see `docs/api.md`), so every assertion in this
  entry now measures a real diary page: the first full run against it recorded
  `http-status-code` 1, script transfer 140747 bytes, LCP **2.0s** (score 0.97) and CLS
  **0**.
- **The 180KB JS budget had no gate at all until Phase 1 Task 7's fix round.**
  `CLAUDE.md` §6 calls it a hard gate, and neither `package.json` nor
  `lighthouserc.json` asserted a single byte — the number was a documented intention,
  which is the same failure mode as an informational job nobody watches.
  `resource-summary:script:size` on `/p/1` now enforces it at 184320 bytes (180KB).

  **Which bytes count was a controller ruling, and the mechanism delivers it by
  construction.** Next emits a legacy polyfill bundle marked `noModule`, fetched only by
  browsers predating ES modules. The gate measures what readers actually download, so
  that bundle does not count — and no bespoke script or per-chunk argument is needed to
  get that, because Chrome never requests a `noModule` script, so Lighthouse never sees
  it. The measured run confirms the mechanism rather than assuming it: Lighthouse counts
  **7** script requests where the page's HTML carries **8** `<script src>` tags.

  Measured at 140747 bytes against the 184320 gate — 43573 bytes of headroom. The pages
  of Tasks 9–11 are server-component markup contributing near-zero JS, and the gallery
  and lightbox live on their own route, so the real remaining claimants are Task 8's
  flip triggers and Task 12's chrome. Setting the gate now means whichever task breaches
  it finds out on its own commit rather than at the end of the phase.

  **Task 8 spent 838 of those bytes.** Its triggers — both edge strips, the bottom
  arrows and counter, the bookmark rail, the window keyboard listener, `jumpTo`'s
  anchoring and the URL write — measure **141585 bytes** over the same 7 script
  requests, against the same 184320 gate: **42735 bytes of headroom** left for Task
  12's chrome. LCP 2045ms (budget 2500) and CLS 0 (budget 0.1) on the same run. The
  cost is that small because every trigger ends at `turnTo` or `jumpTo` and the
  arithmetic behind them already shipped in `packages/domain`, which the route was
  already pulling in.

  One local-environment note, since it wasted a run: `lhci autorun` builds and starts
  the app on port 3000 itself, and a stale `next dev` still holding that port makes
  every audit measure ITS error page instead — 703980 bytes of script, LCP 6.3s, and
  `http-status-code` 0 on both URLs. The status-code assertion is what makes that
  legible rather than a mysterious tenfold regression; free the port and re-run.

- **The LCP gate is asserted against the MEDIAN of five runs, not one run — and the
  median had to be asked for explicitly, because lhci's default would have loosened the
  gate.** `/p/1`'s LCP sits within tens of milliseconds of its 2500ms budget, and
  `numberOfRuns: 1` made the assertion a single sample of a noisy measurement rather
  than a measurement: one clean run after an unrelated change read 2567.7ms and failed
  the build. A gate that fails at random on unrelated commits teaches its authors to
  re-run CI until it passes, which is how a hard gate becomes decorative. The fix is to
  reduce the noise, not to raise the number: `collect.numberOfRuns` is **5**, and each
  `assertMatrix` entry carries `"aggregationMethod": "median"`.

  **Both halves are load-bearing.** `@lhci/utils`'s `getStandardAssertionResults`
  defaults `aggregationMethod` to `'optimistic'`
  (`node_modules/@lhci/utils/src/assertions.js`), and
  `getValueForAggregationMethod` resolves `optimistic` on any `max*` assertion to
  `Math.min(...values)` — the **best** run of the five. Raising `numberOfRuns` alone
  would therefore have converted a one-sample gate into a best-of-five gate, which is
  strictly weaker than what it replaced. Verified rather than reasoned about, by
  asserting the same five collected runs at a threshold that falls between their
  minimum and their median (2477ms): with `aggregationMethod: "median"` lhci reports
  `found: 2478.053` and fails; with the default it passes on `2475.156`. `median` is
  the right basis for a budget because it asks whether a typical load is within budget,
  and because it cannot be moved by one outlier — two of five runs may spike without
  changing the verdict.

  Measured over five runs on the same production build: LCP **2481.976 · 2478.018 ·
  2482.933 · 2478.053 · 2475.156** ms, median **2478.1ms** against the unchanged 2500ms
  budget (21.9ms of headroom), spread 7.8ms. Script transfer **142998 bytes** on 7
  requests, identical on every run, against the unchanged 184320 gate — 41322 bytes of
  headroom. CLS 0 on every run. Five rather than three because the whole step is
  dominated by the one production build it runs first; the five audits themselves cost
  about a minute, and five is the smallest odd count that still tolerates two outliers.

  **What that 2.5s actually measures is a projection, not a paint.** `lighthouserc.json`
  inherits Lighthouse's default `throttlingMethod: "simulate"`, so the reported LCP is
  Lantern's model of the trace on slow 4G (150ms RTT, 1638Kbps, 4x CPU), not an observed
  timing. Observed LCP on these five runs was 617/367/344/340/311ms, equal to observed
  FCP in every one: the server-rendered markup paints in a single frame. The LCP element
  is `nav.rail > button.bookmarkTab` — a bookmark tab's text, not a photograph, not the
  cover title — and its phase split is TTFB 454ms, load delay 0, load time 0, render
  delay **2028ms (82%)**. Nothing is render-blocking in the HTML sense
  (`render-blocking-resources` scores 1, `font-display` passes, both self-hosted faces
  finish inside 70ms), so that render delay is the JS: Lantern's pessimistic LCP graph
  treats every node as render-blocking and folds in every CPU node that performed layout
  (`@paulirish/trace_engine/models/trace/lantern/metrics/LargestContentfulPaint.js`),
  then takes the maximum node end time — which lands on the diary route's own bundle.
  The corroboration is that simulated LCP equals simulated TTI exactly on every run, the
  single long task is attributed to the 72KB route chunk, and `unused-javascript` flags
  52KiB unused across that chunk and the 43KB one beside it. The lever, if this budget
  ever needs headroom, is script weight on this route — which is the same lever
  `docs/adr/0005-font-hosting.md` already names for the third font family.

- **`http-status-code` exists because the LCP/CLS budgets alone measured a vacuous
  pass, not because the route's status code is interesting on its own.** First shipped
  without it, this gate measured Next's own 404 response for `/p/1` at `largest-
contentful-paint` **~2039ms** (budget 2500ms) and `cumulative-layout-shift` **0** —
  both cleared the budget, so CI reported a green "diary LCP budget verified" against a
  page that does not exist, which is worse than the informational-red state it replaced:
  a plausible 2039ms reads as a genuine successful measurement, where the earlier
  `continue-on-error` at least visibly meant "not ready." `http-status-code` scores 0 for
  any 4xx/5xx response and 1 otherwise (`node_modules/lighthouse/core/audits/seo/
http-status-code.js`) — added to `/p/1`'s `assertMatrix` entry, it fails the whole gate
  outright against the 404 regardless of how fast that 404 happens to render, restoring
  the intended red-until-Task-13 state. Verified: `lhci autorun` against the current 404,
  inside the pinned Playwright image, fails with `http-status-code failure for minScore
assertion ... expected: >=1, found: 0` (see this task's report for the full pasted run).
  Added to `/cms`'s entry too, for the same reason CLS is asserted there and LCP is not:
  it costs nothing against a route that already returns 200, and catches the admin route
  silently starting to 5xx, which is a real regression LCP/CLS alone would not surface.
  Do not remove this assertion once `/p/1` is real and returns 200 on its own — it is the
  reason the LCP/CLS numbers mean anything at all, not leftover noise from a
  not-yet-built route.
- **Requires `--no-sandbox --disable-dev-shm-usage`** (`lighthouserc.json`'s
  `collect.settings.chromeFlags`) to launch Chrome at all inside a container running as
  root: without `--no-sandbox`, Chrome refuses to start
  (`Running as root without --no-sandbox is not supported`); with only `--no-sandbox` and
  not the second flag, Chrome launched but every audit failed uniformly with
  `CHROME_INTERSTITIAL_ERROR` — Docker's default 64MB `/dev/shm` is too small for
  Chrome's shared memory needs and the renderer crashed to an internal error page, which
  Lighthouse correctly reports as the page having failed to load. Verified by reproducing
  both failures in isolation before adding the fix; see this task's report.
- **Run:** `npm run test:perf`. Needs a system Chrome/Chromium install discoverable by
  `chrome-launcher`. Inside `mcr.microsoft.com/playwright:v<version>` (the image
  `browser`'s CI job now runs in — see the Visual regression section above), there is no
  system `google-chrome`/`chromium-browser` binary to auto-detect; `CHROME_PATH` must
  point at the image's own bundled Chromium under `/ms-playwright/chromium-<build>/
chrome-linux64/chrome` (`.github/workflows/ci.yml` resolves this with `find` rather
  than hard-coding `<build>`, an internal Playwright id that can change on an image
  update). GitHub's plain `ubuntu-latest` (uncontainerized) ships a system Chrome
  `chrome-launcher` finds on its own; set `CHROME_PATH` locally too if none is found
  automatically there.
- **Add one:** a budget per route, enforced in CI, not measured once and forgotten.
  Measure before optimizing, and paste the measurement (`CLAUDE.md` §0.4). Add the
  route's URL to `lighthouserc.json`'s `collect.url` array and its own `assertMatrix`
  entry the moment it exists, scoped to the budget that actually applies to it (§6's
  180KB/320KB JS-weight split is the same reasoning: a shared bundle-agnostic entry would
  misdescribe one route or the other).

### 8 · Security

- **Tool:** Vitest + scripted probes.
- **Scope:** rate limits, lockout, OTP single-use, SVG rejection, EXIF stripping,
  authorization on every mutation.
- **Status:** not yet implemented — this suite exercises the auth service (Phase 2) and
  the upload worker (Phase 3), neither of which exists yet.
- **Run (once added):** included in `npm run test:integration` (these probes need a real
  database and, for the upload cases, the worker), so they run under `verify:full`.
- **Add one (once added):** each row of `docs/security.md` that names a behaviour (not
  just a schema field) gets a negative-case test: e.g. a 4th OTP attempt is rejected, an
  SVG upload is rejected by magic bytes even with a `.jpg` extension, an EXIF-bearing
  upload has no EXIF after processing, enumeration timing is equal for a real and a fake
  account.

### 9 · Migration

- **Tool:** Vitest.
- **Scope:** every migration runs up, down, and up again against a seeded database.
- **Status:** implemented. `apps/web/migrations/` holds two migrations:
  `20260831_154311_initial` (every collection and global's schema) and
  `20260831_161951_add_jobs` (the `jobs` table backing the `queue` port, Task 9).
  `apps/web/lib/migrate.ts` wraps Payload's migration runner as `runMigrateUp`,
  `runMigrateDown`, `appliedMigrationCount` and `runMigrateDownToZero`.
  `apps/web/lib/testPayload.ts`'s `getTestPayload()` calls `runMigrateUp` once, on
  self-bootstrap, to bring a fresh `diary_test` database up to date before any test runs
  against it. `postgresAdapter` is configured with `push: false`
  (`apps/web/payload.config.ts`), so these migrations — never Payload's dev-mode schema
  "push" — are the only sanctioned way the schema changes (`docs/data-model.md`); an
  earlier version of this task found `push` silently building the schema ahead of the
  first real migration, which would have made the migration decorative rather than the
  thing that actually built the tables.
- **What the reversibility test actually does.** `collections.integration.test.ts`'s
  last case — _"rebuilds every table a journey, its highlights and its tally need, after
  rolling all migrations back to zero and re-applying them"_ — writes a journey whose
  values span all three shapes the initial migration creates (plain columns on
  `journeys`, a group's `furniture_*` column prefix, and the two ordered array tables
  `journeys_highlights` and `journeys_tally`), captures those values, rolls every
  migration back to **zero**, asserts against Postgres directly that those three tables
  are gone and that no migration remains applied, re-applies every migration, writes the
  same journey again, and asserts every captured value round-trips.

  It replaced a case named _"runs down and up again without loss"_ that seeded nothing
  and compared nothing: it asserted only that `runMigrateDown()` and `runMigrateUp()`
  did not throw, and that a subsequent `find()` was defined. Both halves of that name
  were unearned.

  **To zero, not one batch, and that is the point.** Payload's `migrateDown()` rolls
  back only the most recent _batch_ — every migration the last `migrate()` applied
  together. On a database brought up in one go that is all of them; on one brought up
  incrementally it is only the newest. A reversibility test built on a single
  `migrateDown()` therefore proves whatever the local batch history happens to make it
  prove, and the initial migration's `down()` — the one that drops every table, and the
  one whose sibling carries a hand-fixed statement order — may never execute at all.
  `runMigrateDownToZero()` loops until `appliedMigrationCount()` reaches zero, which
  removes that dependence. `appliedMigrationCount()` asks Postgres with `to_regclass`
  rather than asking Payload, because the state it has to be able to describe includes
  "there is no schema left": the initial migration's `down()` drops `payload_migrations`
  itself, so a Payload query for that collection would throw at exactly the moment the
  answer is zero.

  **Data is not expected to survive, and the test does not pretend otherwise.**
  `DROP TABLE` destroys rows. What reversibility means here is that the schema comes
  back able to hold exactly what it held before — which is why the test re-writes the
  journey rather than looking for the old one.

  **It has failed.** Per `CLAUDE.md` §2.3, it was verified against two deliberately
  broken migrations. Deleting `DROP TABLE "journeys" CASCADE` from the initial
  migration's `down()` fails it with `cannot drop type enum_journeys_weather_glyph
because other objects depend on it` — the surviving `journeys` table still uses that
  type. Restoring the generator's original statement order in
  `20260831_161951_add_jobs`'s `down()` — the CASCADE-ordering bug that file's hand-fix
  exists to prevent — fails it with `constraint
"payload_locked_documents_rels_jobs_fk" of relation
"payload_locked_documents_rels" does not exist`. Both hand-fixes are therefore covered
  by a test that demonstrably catches their removal.

  **One thing to know when reading a failure.** Payload's own `migrate()` and
  `migrateDown()` call `process.exit(1)` on a failed migration rather than throwing, so
  a broken migration surfaces in Vitest as `Error: process.exit unexpectedly called with
"1"`, with the Postgres error above it in the log, not as an assertion diff. That is
  why the test asserts the rollback's outcome _mid-test_, before re-applying: without
  those two assertions, a rollback that quietly left a table behind would kill the
  worker on the re-apply, before anything could name the problem.

- **Coverage:** `migrate.ts` is reachable only from the integration-only callers above,
  so `vitest.config.ts`'s Docker-free unit pass excludes it from coverage rather than
  count it as 0%. It is gated instead by `vitest.integration.config.ts` at
  **100% lines / 100% branches / 100% functions** — the real, measured number.
  `runMigrateUp` and `runMigrateDown` are two-line wrappers with no branches of their
  own; `appliedMigrationCount` is called both while `payload_migrations` exists and
  after it has been dropped, so both of its branches run; and
  `runMigrateDownToZero`'s loop both runs and exits. Its one no-progress guard carries a
  `c8 ignore` with its reason (`CLAUDE.md` §2.1): it cannot fire while Payload deletes
  the migration row it just rolled back, and it exists so that if it ever does, the
  failure is a named error rather than a hung suite. See the Contract section above for
  the same exclude-and-regate treatment applied to the other integration-only files.
- **Run:** `npm run db:migrate` applies pending migrations; `npm run db:migrate:down`
  rolls back the most recent batch; `npm run db:migrate:create -w apps/web -- <name>`
  generates a new migration from schema changes (`README.md`'s Commands section). The
  reversibility test itself runs under `npm run test:integration`, or
  `npm run verify:full`, which additionally gates `migrate.ts`'s coverage via
  `npm run test:integration:coverage`.
- **Add one:** for every new migration file, extend the reversibility case with values
  that exercise whatever tables that migration adds — follow the existing one: write
  distinctive values, roll back to zero, assert the new tables are gone, re-apply, write
  again, assert the values round-trip. Then break one statement in the new migration's
  `down()` and confirm the case fails, and paste that failure. A reversibility test that
  has never failed is not evidence (`CLAUDE.md` §2.3).

## Test quality rules (apply to every suite above)

From `CLAUDE.md` §2.3: test names read as sentences (e.g. "returns the previous page
when the reader flips backward"); one behaviour per test; Arrange-Act-Assert, visually
separated; no mocking what we own — mock the network boundary, the clock, the
filesystem, never our own modules; fixtures are factories with overrides, never shared
mutable objects; a test that has never failed is unproven — verify it fails when the
behaviour is broken.
