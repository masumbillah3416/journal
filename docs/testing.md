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

  | Layer | Lines | Branches | Functions |
  |---|---|---|---|
  | `packages/domain/**` (pure logic) | 100% | 100% | 100% |
  | `apps/web/lib/**`, server actions | 95% | 95% | 95% |
  | `apps/web/app/**` | 95% | 95% | 95% |
  | Repository-wide (`apps/web/components/**` included) | 90% | 90% | 90% |

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
- The other three sit under a Next.js dynamic-route directory written in square brackets
  (`api/[...slug]/route.ts`, `cms/[[...segments]]/page.tsx` and its `not-found.tsx`) —
  required by Next.js's own routing convention. `c8 ignore start`/`stop` does not take
  effect for a file under a bracketed directory: verified by reproducing one of them
  byte-for-byte under an unbracketed sibling directory and watching the *copy* get
  ignored correctly while the original did not, with the tool instead reporting the
  file's own header-comment lines as "uncovered" once the ignored code beneath them left
  no `DA` entries to anchor against — a bug in how `@vitest/coverage-v8` scans source text
  for ignore hints on that path shape, not a defect in the files. These three are excluded
  in `vitest.config.ts`'s `exclude` array instead, with the glob's literal `[...]` escaped
  (`\[...\]`) so it is not parsed as a glob character class — the same reason the
  unescaped version silently failed to match at all during this task. See that file's own
  comment for the full reasoning.

`apps/web/components/**` is genuinely empty as of this task (`.gitkeep` only) and carries
no per-glob threshold override — a threshold against zero files is the vacuous pass
CLAUDE.md's controller ruling for this task explicitly forbade adding. It falls under the
repository-wide floor the moment a real file lands there, same as any other directory the
`include` reaches but does not name.

An uncovered line outside `packages/domain` requires a
`/* c8 ignore next -- <reason> */` comment with a real reason (`CLAUDE.md` §2.1). Where a
whole file is unreachable from any test, the honest options are two, and which one
applies depends on whether some *other* pass can see it: exclude-and-regate (as
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
    to accommodate a handful of component tests is the wrong trade.

  `unit-dom` exists *before* Phase 1's first component, on purpose. Until it did, no
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
    caller — is why this suite is an *integration* test
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
- **Status:** the harness is implemented; the journeys it will guard are not. The public
  diary, the bespoke `/admin` panel and sign-in are all Phase 1+ — the only route this
  app serves today is Payload's own admin at `/cms` (`apps/web/payload.config.ts`).
  `e2e/smoke.spec.ts` is today's one real end-to-end test: it loads `/cms` and asserts
  **zero** `console` (error level) and `pageerror` events, with both listeners attached
  *before* `page.goto()`. This is deliberately the harness's centre of gravity, not an
  afterthought — the handoff's own defect log (`CLAUDE.md` §10, `SCREENS.md`) is mostly
  *silent* failures (a swallowed click, a missing derivative, a rejected autoplay
  promise), none of which move a pixel, so visual or manual-only QA misses them
  entirely. The test also waits `networkidle` and a fixed 500ms grace period after
  `goto()` before asserting — a real hydration-time console error was observed (in this
  task's own planted-failure proof, see below) landing *after* the `load` event, so
  checking immediately on navigation would have produced a false negative on exactly the
  class of defect this suite exists to catch.
- **Three viewport projects** — `desktop` (1440×900), `mid` (1000×800), `mobile`
  (390×844; `isMobile`/`hasTouch` set) — run every spec three times, once per breakpoint
  named in the Task 12 brief. All three use Chromium, not a mix of engines: this
  environment's Firefox/WebKit binaries are an unverified download, and are not needed
  to catch the class of defect this harness targets today (console/pageerror,
  axe violations, pixel drift). Cross-browser coverage is a candidate for a later phase,
  not a Task 12 gap silently worked around — see `playwright.config.ts`'s header.
- **Run:** `npm run test:e2e` (headless, runs `e2e/smoke.spec.ts`); `npm run
  test:e2e:headed` (all `e2e/*.spec.ts`, visible browser) — this is also the engine
  `sweeping-for-browser-defects` (`.claude/skills/`) uses for manual, scripted sweeps.
  `playwright.config.ts`'s `webServer` boots the real app: `npm run dev` locally
  (reused if already running), `npm run build && npm run start` in CI.
- **Add one:** one spec per real user journey as each is built; assert on the DOM
  reflecting the state machine (e.g. `flipMachine`'s state), not on re-deriving the
  machine's logic in the test. Every new route gets its own `test()` in
  `e2e/smoke.spec.ts` first — a route with no console-error coverage is a route this
  suite is silently not protecting.

### 5 · Visual regression

- **Tool:** Playwright snapshots (`toHaveScreenshot`, `maxDiffPixelRatio: 0.01` in
  `playwright.config.ts` — the design is high-fidelity, so drift is a defect, not noise).
- **Scope:** every page type and every admin screen, at each breakpoint. Drift from the
  high-fidelity design is treated as a defect.
- **Status:** the mechanism is implemented and proven, and now runs in CI (Task 1 of
  Phase 1 closed the gap below). `e2e/visual.spec.ts` snapshots the one screen that exists
  today — `/cms` — at all three breakpoints, using the exact `toHaveScreenshot`/
  baseline-diff machinery the real pages will use later. Baselines are committed at
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
  shared `expectNoAxeViolations` helper (`e2e/support/axe.ts`, Task 1 of Phase 1).
- **Scope:** every route. Contrast ratios from the handoff's token table are asserted,
  not assumed (e.g. `ink-muted` must stay opaque — an alpha version measures below
  4.5:1, per the handoff's own note).
- **Status:** implemented for the one route that exists, `/cms`, asserting `results.
  violations` is empty — zero violations, not "no critical violations"; CLAUDE.md's
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
  not by loosening the helper's default. Any *other* violation, on this route or any
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
  to both `largest-contentful-paint` (≤2500ms) and `cumulative-layout-shift` (≤0.1); `/cms`
  is held to `cumulative-layout-shift` only. `CLAUDE.md` §6 scopes the 2500ms LCP budget
  to "diary, 4G" specifically — holding Payload's heavy admin bundle to it was the
  original reason this whole step was informational, and giving `/cms` its own entry
  with no LCP assertion is what stops that recurring now that `/cms` shares a config with
  a real route. `.github/workflows/ci.yml`'s `browser` job no longer runs this step with
  `continue-on-error` (see below).
- **`/p/1` does not exist yet — Task 13 creates it — and that is deliberate, not an
  oversight.** The controller ruling for Task 1 was to land the hard gate *before* the
  page it measures, specifically so no later task can land a regression under a budget
  still marked informational — Phase 0 shipped exactly that state once (`/cms` under
  `continue-on-error`) and it hid nothing because nobody was watching an
  informational job.
- **Measured today, this does not reproduce as a failure — worth recording plainly.**
  The brief anticipated `/p/1` failing honestly against a 404 until Task 13 lands the
  real page. Run for real inside the pinned Playwright image (`npm run test:perf`,
  `CHROME_PATH` pointed at that image's bundled Chromium — see below), Next's own 404
  response for `/p/1` is small enough to clear the budget on its own merits:
  `largest-contentful-paint` measured **~2039ms** (budget 2500ms) and
  `cumulative-layout-shift` measured **0** — both pass. `/cms`'s `cumulative-layout-shift`
  also measured **0** and passes; its `largest-contentful-paint` (measured ~5043ms) is no
  longer asserted at all, by design. This does not make the gate decorative: it is a real,
  hard assertion against whatever `/p/1` actually returns today, with no escape hatch, and
  it is exactly the assertion Task 13 landing a heavier real page must clear honestly —
  the false expectation was about which direction the *number* would land, not about
  whether the gate is real. See this task's report for the pasted `lhci` run and the raw
  `numericValue`s from the generated reports.
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
  last case — *"rebuilds every table a journey, its highlights and its tally need, after
  rolling all migrations back to zero and re-applying them"* — writes a journey whose
  values span all three shapes the initial migration creates (plain columns on
  `journeys`, a group's `furniture_*` column prefix, and the two ordered array tables
  `journeys_highlights` and `journeys_tally`), captures those values, rolls every
  migration back to **zero**, asserts against Postgres directly that those three tables
  are gone and that no migration remains applied, re-applies every migration, writes the
  same journey again, and asserts every captured value round-trips.

  It replaced a case named *"runs down and up again without loss"* that seeded nothing
  and compared nothing: it asserted only that `runMigrateDown()` and `runMigrateUp()`
  did not throw, and that a subsequent `find()` was defined. Both halves of that name
  were unearned.

  **To zero, not one batch, and that is the point.** Payload's `migrateDown()` rolls
  back only the most recent *batch* — every migration the last `migrate()` applied
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
  why the test asserts the rollback's outcome *mid-test*, before re-applying: without
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
