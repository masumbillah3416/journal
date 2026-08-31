# Testing

All nine test types from `CLAUDE.md` §2 are required; a feature is not complete until
every applicable row is satisfied (design spec §11). This document covers strategy, how
to run each suite today, and how to add a test of each type. Where a suite's tooling
does not exist in the repository yet, that is stated plainly rather than glossed over —
see the **Status** column.

## Coverage gates

Enforced in `vitest.config.ts`, checked by `npm run test:unit`'s `--coverage` flag and
gating CI:

| Layer | Lines | Branches | Functions |
|---|---|---|---|
| `packages/domain/**` (pure logic) | 100% | 100% | 100% |
| `apps/web/lib/**`, server actions | 95% | 95% | 95% |
| Repository-wide | 90% | 90% | 90% |

An uncovered line outside `packages/domain` requires a
`/* c8 ignore next -- <reason> */` comment with a real reason (`CLAUDE.md` §2.1).

## The verify gates

- **`npm run verify`** — `typecheck && lint && test:unit`. This is the pre-commit gate:
  unit tests only, so a developer can always pass it honestly, even with Docker down.
- **`npm run verify:full`** — `verify` plus `test:integration`. This is what CI runs
  (`.github/workflows/ci.yml`); it requires `DATABASE_URL` for a test Postgres.

## The nine suites

### 1 · Unit

- **Tool:** Vitest.
- **Scope:** pure functions, state machines, mappers, validators. No I/O.
- **Status:** implemented. The `unit` Vitest project (`vitest.config.ts`) includes
  `packages/*/src/**/*.test.ts` and `apps/web/lib/**/*.test.ts`, excluding anything
  matching `*.integration.test.ts`.
- **Run:** `npm run test:unit` (with coverage), or `npm run test` for watch mode across
  both projects.
- **Add one:** colocate `<name>.test.ts` next to `<name>.ts`. Follow the TDD cycle
  (`CLAUDE.md` §2.2): write the failing test, confirm it fails for the expected reason,
  write the minimum code to pass, refactor with the suite green. Time is always
  injected — never `Date.now()` inside logic under test (this is how `flipMachine`'s
  latch behaviour and `otpChallenges`' expiry are tested with no clock mocking library).

### 2 · Integration

- **Tool:** Vitest + a real test Postgres.
- **Scope:** collections, hooks, server actions, access control against a real database.
- **Status:** the `integration` Vitest project exists in `vitest.config.ts`
  (`**/*.integration.test.ts`, `passWithNoTests: true`) but no test files exist yet —
  there are no collections or server actions to test against until a later Phase 0 task
  adds them.
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
  `<name>Contract(name, makeAdapter)` function that registers one parameterised
  `describe` block — written once, run unchanged against every adapter. Today's
  adapters:
  - `storage` → `apps/web/lib/adapters/local-storage.ts` (filesystem). Path traversal is
    rejected by `validateStorageKey`, exported from the port itself, not the adapter — the
    Cloudflare R2 adapter arriving in Phase 3 has no filesystem to protect, so the guard
    has to live somewhere every adapter shares.
  - `mailer` → `apps/web/lib/adapters/console-mailer.ts` (prints to the terminal). The
    contract asserts the security requirement from `CLAUDE.md` §7 directly: `logLines`
    (what actually reached the terminal) never contains a full email address (masked to
    `m***@example.com`) or the message body, which carries the OTP code. Full messages
    stay available to tests via a separate in-memory outbox, `sent`.
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
- **Coverage for integration-only code:** `npm run verify`'s coverage pass only ever
  executes the `unit` project, so `postgres-queue.ts`, `queue-contract.ts` and
  `queue-fixtures.ts` — reachable exclusively from an `*.integration.test.ts` — are
  excluded from `vitest.config.ts`'s coverage `include` rather than counted as
  0%-covered there. They are gated instead by a second, dedicated pass,
  `vitest.integration.config.ts`, run via `npm run test:integration:coverage` (chained
  into `npm run verify:full`) — it runs the same integration test files with `--coverage`
  scoped to just those three files. Thresholds are set per-file to what is genuinely
  achieved, not aspirational: `queue-contract.ts` and `queue-fixtures.ts` are 100%
  lines/branches/functions; `postgres-queue.ts` is 93% lines, 75% branches, 100%
  functions — its two uncovered branches are `enqueue()`'s and `claim()`'s error-`catch`
  paths for an unexpected database failure, which have no organic trigger without mocking
  the module under test (CLAUDE.md §2.3: "no mocking what we own") or deliberately
  corrupting the test database. `claim()`'s safety-critical `SELECT ... FOR UPDATE SKIP
  LOCKED` line itself executes on every call regardless of outcome, so it is fully
  exercised by both the smoke test and the blocking regression test above.
- **Add one:** write `apps/web/lib/ports/<name>.ts` (the interface, plus any guard every
  adapter must share - see `validateStorageKey` above), then
  `apps/web/lib/adapters/contract/<name>-contract.ts` (the shared suite) before any
  adapter exists, per TDD. Name the adapter's own test file
  `<adapter>.test.ts` (or `.integration.test.ts` if it needs real infrastructure) and call
  `<name>Contract('<adapter>', makeAdapter)` from it.

### 4 · End-to-end

- **Tool:** Playwright.
- **Scope:** real journeys — page flip, bookmark jump, gallery, lightbox, mobile swipe,
  sign-in + OTP, upload round-trip.
- **Status:** not yet implemented. `package.json` has no Playwright dependency yet;
  `npm run test:e2e` and `npm run test:e2e:headed` are documented in `CLAUDE.md` §11 and
  the root `README.md` as the target command surface, added once the app they exercise
  exists (Phase 1 onward).
- **Run (once added):** `npm run test:e2e` (headless); `npm run test:e2e:headed` for a
  visible browser — this is also the engine the mandatory browser-QA-sweep skills use.
- **Add one (once added):** one spec per real user journey; assert on the DOM reflecting
  the state machine (e.g. `flipMachine`'s state), not on re-deriving the machine's logic
  in the test.

### 5 · Visual regression

- **Tool:** Playwright snapshots.
- **Scope:** every page type and every admin screen, at each breakpoint. Drift from the
  high-fidelity design is treated as a defect.
- **Status:** not yet implemented; depends on the Playwright infrastructure above.
- **Run (once added):** `npm run test:visual`.
- **Add one (once added):** one snapshot per page type per breakpoint listed in design
  spec §8.2 (diary `<860px`; admin `≥1180`/`≥860`/narrow; login `<820`). The OTP-cell
  collapse at 819px (design spec §11) is the canonical example of a defect this suite
  type exists to catch.

### 6 · Accessibility

- **Tool:** axe-core in Playwright.
- **Scope:** every route. Contrast ratios from the handoff's token table are asserted,
  not assumed (e.g. `ink-muted` must stay opaque — an alpha version measures below
  4.5:1, per the handoff's own note).
- **Status:** not yet implemented; depends on the Playwright infrastructure above.
- **Run (once added):** `npm run test:a11y`.
- **Add one (once added):** run axe against every new route as it is added; assert zero
  violations, not "no critical violations" — CLAUDE.md's non-negotiables draw no line
  between severities.

### 7 · Performance

- **Tool:** Lighthouse CI + custom probes.
- **Scope:** the hard budgets in `CLAUDE.md` §6 — 60fps flip (only `transform`/`opacity`
  animated), diary route JS ≤180KB gzipped, admin ≤320KB, LCP ≤2.5s, CLS ≤0.1, INP
  ≤200ms, no N+1 queries, always a derivative tier never an original.
- **Status:** not yet implemented; no Lighthouse CI config exists yet.
- **Run (once added):** `npm run test:perf`.
- **Add one (once added):** a budget per route, enforced in CI, not measured once and
  forgotten. Measure before optimizing, and paste the measurement (`CLAUDE.md` §0.4).

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
- **Status:** not yet implemented — no migrations exist yet; they are added together
  with the collections in a later Phase 0 task (`npm run db:migrate` is documented as
  target command surface in `CLAUDE.md` §11 and the root `README.md`).
- **Run (once added):** included in `npm run test:integration`.
- **Add one (once added):** for every migration file, a test that runs it up, down, and
  up again against a seeded copy of the test database, asserting the schema and data are
  correct after each step — not just that the commands exit zero.

## Test quality rules (apply to every suite above)

From `CLAUDE.md` §2.3: test names read as sentences (e.g. "returns the previous page
when the reader flips backward"); one behaviour per test; Arrange-Act-Assert, visually
separated; no mocking what we own — mock the network boundary, the clock, the
filesystem, never our own modules; fixtures are factories with overrides, never shared
mutable objects; a test that has never failed is unproven — verify it fails when the
behaviour is broken.
