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
  | `packages/tokens/**` (pure logic) | 100%  | 100%     | 100%      |
  | `apps/web/lib/**`, server actions | 95%   | 95%      | 95%       |
  | `apps/web/app/**`                 | 95%   | 95%      | 95%       |
  | `apps/web/components/**`          | 90%   | 90%      | 90%       |
  | Repository-wide                   | 90%   | 90%      | 90%       |

  `packages/tokens/**`'s row arrived with Phase 1's final review, which found it gated by
  nothing but the repository-wide 90% floor. It is the same kind of code as
  `packages/domain/**` — three pure modules (`colour.ts`, `geometry.ts`, `type.ts`), no
  I/O, no framework, no React — and it measures 100% on all three metrics today, so the
  threshold is set at what it actually achieves rather than at a number rounded up to
  meet it. `CLAUDE.md` §2.1's rule is that a directory gets "a real threshold"; inheriting
  a floor written for framework glue is not one.

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
  `apps/web/lib/auth/otpService.ts` (Phase 2 Task 3), `apps/web/lib/auth/rateLimit.ts`
  (Task 4), `apps/web/lib/auth/sessions.ts` (Task 6) and
  `apps/web/lib/auth/signIn.ts`/`passwordReset.ts` (Task 5) are in this pass rather than
  the Docker-free one for the same reason: every operation these modules perform writes
  and then re-reads a row, and the claims their tests make — "only a hash was stored", "a
  concurrent burst was admitted in arrival order up to the limit and no further", "the
  superseded identifier no longer authenticates" — are claims about what Postgres did,
  not about what a mock agreed to. `signIn.ts` adds a reason of its own: what it asserts
  is that an unknown address and a wrong password cost the same TIME, and the time in
  question is a PBKDF2 derivation Payload performs inside a real login against a real
  row — a mocked credential store would make both arms instant and the measurement
  meaningless. All five are gated at **100/100/100**.
  `sessions.ts` reached that honestly rather than by construction: it measured 94%
  branches first, and the two uncovered arms turned out to be reachable by any caller (a
  `UserId` that is not a Payload row id, handed to
  `revokeSession`/`revokeAllSessions`), so they were exercised rather than excused — the
  correction `otpService.ts` had to make twice. Their pure arithmetic lives in
  `packages/domain/src/auth/`, which the Docker-free pass measures at the domain's own
  100% bar.

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
The route itself was written to hold zero authored logic precisely so it could qualify,
and it has kept that property as it grew: all of its real decisions live in
`packages/domain`, which is gated at 100%. What `<n>` means, and whether the book has
such a page at all, is `pageAddress.ts`'s `addressedPageIndex`; which pages this
particular request gets the content of, and whether a given leaf is one of them, are
`contentWindow.ts`'s `servedContentWindow` and `rendersContent`
(`docs/adr/0009-server-rendered-page-window.md`); and the title, description and
canonical link `generateMetadata` returns are `pageMetadata.ts`'s, which is where its
six fallbacks over blank editor fields are covered. The exclusion is only honest while
that holds — a branch written into the route itself is a branch neither coverage config
can reach. `app/(diary)/not-found.tsx`, added in Task 13, is the OTHER honest treatment
and needs no config entry: it is not under a bracketed directory, so its `c8 ignore
start`/`stop` wrapping takes effect, and it holds no branch of its own — the only value
on it is `pagePath(0)`.

`(diary)/m/[n]/page.tsx` — the mobile reading surface's own route entry, added when the
two surfaces were split across two entries
(`docs/adr/0012-two-route-entries-for-two-reading-surfaces.md`) — joined the same
exclusion list on the same three counts, re-verified against the same control in the same
run rather than inherited. It holds zero authored logic: await the params, read the
bundle, render `<MobileDiary>` around the ONE addressed page. What `<n>` means is
`addressedPageIndex`'s; its title, description and canonical are `addressedPageMetadata`'s
(both `packages/domain`, gated at 100%); its chrome's three values are `deriveRail`,
`mobileHeading` and `pageLabel`'s. And **which readers reach it at all** — the one
decision the split actually moved — is `servedReadingSurface`'s, spent by
`apps/web/middleware.ts`, which is NOT excluded: it sits at the app's own root, is named
in `vitest.config.ts`'s coverage `include` (no `lib/**` or `app/**` glob reaches it) and
is gated at **100/100/100**, met by ten cases in `apps/web/middleware.test.ts` driving a
plain `NextRequest` — a desktop and a phone user agent, both cookie values, a query
carried across the rewrite, and the 308 off `/m/<n>`. That test file needed its own glob
(`apps/web/*.test.ts`) on the `unit` project, because a test file no project's `include`
matches is collected by nobody and its absence is silent.

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
  - `unit` — `packages/*/src/**/*.test.ts`, `apps/web/lib/**/*.test.ts`,
    `apps/web/scripts/**/*.test.ts`, `apps/web/*.test.ts` and `e2e/**/*.test.ts`,
    excluding `*.integration.test.ts`. Node environment; these files are pure. The last
    glob collects exactly one file, `e2e/ciRegistration.test.ts` — the guard that says
    every browser spec is named by CI and by an npm script, which is a file read rather
    than a browser test and belongs in the pre-commit gate it protects (ruling F57, and
    the browser-suite section below).
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

  Phase 2 Task 7 puts the first ADMIN components in `unit-dom`:
  `apps/web/components/admin/SignInShell.test.tsx` and `PasswordStep.test.tsx`. The
  second is where `SECURITY.md`'s second prototype hole is first held down — it plants
  `om-diary-otp` in `localStorage` with the opposite answer to the server's and requires
  the footer line not to move, and it spies on `Storage.prototype.getItem` to require
  that nothing was read at all. Neither assertion stands alone: both are paired with one
  that the footer line exists and says what `SCREENS.md` §3.1 says it should, because "no
  storage was read" is trivially true of a component that rendered nothing. What jsdom
  cannot reach — whether the DELIVERED page and its scripts read storage — is
  `e2e/signIn.spec.ts`'s.

  Task 9 adds the last three admin panes — `ResetStep.test.tsx` (19 cases),
  `NewPasswordStep.test.tsx` (19) and `SignedInStep.test.tsx` (9). Two things about them
  are worth knowing. First, **every case that says a pane does NOT print something is
  paired with one that says the pane printed anything at all**: "the confirmation carries
  no address of its own" and "the expired state never prints the token" are both trivially
  true of a pane that rendered nothing, which is this phase's most common defective shape.
  Second, **the geometry is deliberately not here**: `SCREENS.md` §3.4's 62px ringed
  circle, its 20px square and §3.3's 14px confirmation mark are numbers jsdom cannot read,
  because it performs no layout and loads no stylesheet, so all three are measured in a
  real engine by `e2e/reset.spec.ts` rather than left to a screenshot that would absorb
  them (see the Visual regression section on what the threshold does not catch).

  Task 8 adds `apps/web/components/admin/CodeStep.test.tsx`, the largest component suite
  here at 46 cases, and it is worth knowing what it deliberately does NOT prove. Its
  header names three things and hands each to `e2e/codeStep.spec.ts`: the cell widths
  (jsdom performs no layout), the paste path (jsdom performs no default paste, so
  `preventDefault` has nothing to prevent and the case cannot distinguish a working
  handler from a missing one on the browser's own terms), and the shake's
  `prefers-reduced-motion` honesty (a media query is a property of the stylesheet). Two
  of its cases were strengthened after a mutation showed them passing with the mechanism
  removed: the Backspace case moved from cell 0 to cell 2, because at the first cell
  "stays here" and "retreats" are the same outcome, and the countdown's non-finite guard
  is now tested with `NaN` rather than `Infinity`, because an infinite instant already
  falls out of the subtraction as "the window closed long ago" and passed with the guard
  deleted.

  Its numbers all come from `@travel-diary/domain/auth/otpChallenge` rather than from
  copies, and that is proven rather than asserted: raising `MAX_ATTEMPTS` to 5 in the
  domain fails 5 of its cases, doubling `EXPIRY_MS` fails 3, and halving
  `RESEND_COOLDOWN_MS` fails 1. The one number that cannot follow its constant is the
  word "Three" in "Three wrong codes…", so a case of its own pins `MAX_ATTEMPTS` to `3`
  as a literal — the copy names the number in words, and no expression turns the constant
  into that word.

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
  Phase 2 Task 7 adds `apps/web/lib/auth/readSignInScreen.integration.test.ts`, the
  sign-in screen's own server read. Its four flag cases are integration cases rather
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
  `seed.ts`, `seed-data.ts`, `testPayload.ts`, `migrate.ts` and — from Phase 2 Task 3 —
  `auth/otpService.ts` and `auth/testing/otpProbes.ts` — reachable exclusively
  from an `*.integration.test.ts` — are excluded from `vitest.config.ts`'s coverage
  `include` rather than counted as 0%-covered there. They are gated instead by a second,
  dedicated pass, `vitest.integration.config.ts`, run via
  `npm run test:integration:coverage` (chained into `npm run verify:full`) — it runs the
  same integration test files with `--coverage` scoped to those nine, plus
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
  `auth/otpService.ts` (Phase 2 Task 3) is **100% on every axis**, and it is worth
  recording that it took two corrections to get there honestly. Its first threshold was
  93% branches with a comment claiming both missing arms were unreachable; the review
  reached one of them (`attempts ?? 0`) with a plain
  `payload.update({ data: { attempts: null } })` and no mocking at all. A threshold
  lowered on a reason that is not true is worse than one lowered honestly, because the
  comment is what stops the next reader from checking. Both arms are gone rather than
  excused: the attempt count is `COALESCE`d in SQL, with a test that writes a NULL count
  and expects the challenge to still verify, and the single-row `count(*)` is folded over
  its rows rather than read through a `?.` whose empty arm nothing can take. One
  `c8 ignore` remains, on `deriveKey`'s error arm, and its comment records the three
  things tried before it was excused — `promisify` (no `scrypt.__promisify__` in
  `@types/node`, so the key arrives as `unknown`), reaching it from a test (`scrypt`
  errors only on cost parameters, which are module constants), and a branch-free settle.
  `auth/testing/otpProbes.ts` is 100% on every axis too, like `queue-fixtures.ts` and for
  the same reason: the probes are what make the OTP security assertions non-vacuous, so
  each of their own refusals — an empty outbox, a message with no six-digit run, an
  account with no challenge — is exercised rather than assumed.
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
  book. The routes this app serves today are Payload's own admin at `/cms`, the diary's
  `/p/<n>`, `/gallery/<slug>` with its download handler (Phase 1 Task 14), and — since
  Phase 2 Task 7 — the bespoke panel's first screen at `/admin/sign-in`, joined by
  `/admin/sign-in/code` in Task 8. The rest of the `/admin` panel is Phase 4.

  **`e2e/signIn.spec.ts` (Phase 2 Task 7)** is where `SECURITY.md`'s second prototype
  hole is proved closed **against the delivered page rather than against the source**.
  The hole is that the OTP on/off flag lived in `localStorage['om-diary-otp']`, "where
  anyone can set it to `0` and skip the second factor entirely"; the fix is that the code
  step is decided from `users.otpRequired`, server-side. A grep proves only that nobody
  typed that read — not that nothing the route ships performs one — so three cases run in
  a browser:

  1. **The page reads no browser storage.** An init script installed before the document
     exists records every `Storage.prototype.getItem`/`key` call; the recorded list must
     be empty.
  2. **The prototype's own key is planted with the OPPOSITE answer** before navigation,
     and the footer line must not move. This is the hole itself, reproduced: against the
     handoff's prototype this case reads "the code step is switched off".
  3. **Every script the page fetched is downloaded and searched for the key.** A bundle
     carrying the string is a read waiting to happen even if it did not fire on this
     load. This one has a consequence for the code: `PasswordStep.tsx` does not spell the
     key even in a comment, because a development build ships comments verbatim and a
     quoted key would make the case fail locally and pass in CI's minified build.

  All three also assert that the footer line **exists** and says what `SCREENS.md` §3.1
  says it should — "no storage was read" and "no script names the key" are both trivially
  true of a page that failed to render. Four further cases cover what only a laid-out page
  can answer: the cloth panel beside the form above 820px and the masthead instead of it
  below (asserting the shell's own `grid-template-columns` count, not just that both
  elements exist), the Show/Hide toggle preserving the typed value across the input's
  `type` swap, and a refused submission staying on the screen with the field marked.

  Both the `localStorage` cases were watched to fail with the mechanism put back: a
  five-line reintroduction of the prototype's read failed cases 1 and 2, and shipping the
  key as a client-side constant failed case 3.

  **`e2e/reset.spec.ts` (Phase 2 Task 9)** carries what a component test cannot say about
  `SCREENS.md` §3.3 and §3.4, and its first two cases are about a defect no component test
  could ever have caught. For the whole of Tasks 5 to 8 the reset email carried a working
  token to an address nothing answered: the constant was right, the two spellings of it
  agreed, the token was minted and provably consumable, and `/admin/reset/<token>` was a
  404. A component suite renders a component; it never fetches an address. So the first
  case clicks the "Forgotten" link off the password screen and **reads the response
  status**, and the second requests the mailed link's own shape and reads it again — 200,
  with the expired state on it, rather than 404. Every other assertion in both cases would
  hold on Next's own not-found page if the status were not read.

  The rest of the file is geometry and delivered markup: the ringed circle measured at
  62x62 with a 20x20 square inside it, the confirmation block's computed background read
  back as `rgba(47, 107, 104, 0.07)` with its 14px mark, the two signed-in actions measured
  to the same width 10px apart, the expired state asserted to contain the token nowhere in
  its `innerHTML`, and a whole address planted in `?sent=` asserted to reach the page
  masked. **What it deliberately does not do is request a reset**: `POST /admin/reset/request`
  is mounted (Task 10), but reading the link it sends means the mailer's in-process outbox,
  which a browser cannot see, so the journey from a request through the mailed link to a
  changed password is proved where the outbox is — see the integration section below.

  **`e2e/codeStep.spec.ts` (Phase 2 Task 8)** carries the three things about
  `SCREENS.md` §3.2's one-time-code screen that jsdom cannot settle, and each was watched
  to fail with its mechanism removed:

  1. **The cell widths at 390px.** §3 records the exact failure this guards — "at
     `40px 42px` in a 342px shell the OTP cells collapse" — and the fix is the narrow
     pane padding, `26px 20px 24px`. The case pins a LITERAL 40px floor rather than
     anything derived from the stylesheet, because a floor compared against the value it
     is meant to hold still moves with it and can never fail. Restoring `40px 42px`
     failed it at **35.5px**; the correct padding measures **42.83px**. A second case
     covers the other half of the same defect, which a width floor alone would pass:
     cells that refuse to shrink do not collapse, they overflow.

     **That second case was decorative when it was first written, and the fix is worth
     recording.** It measured the flex CONTAINER against the form panel — and a
     block-level container is sized by its parent whatever its children do, so it could
     never fail. Under `.cell { flex: none }` it reported the row comfortably inside the
     panel while the row's own `scrollWidth` was 2,043 against a `clientWidth` of 302 and
     the last cell stood 1,741px past the pane. It now measures each CELL's edges against
     the pane's CONTENT box — which is the box the required padding actually creates —
     and `flex: none` fails it at `pastTheRightEdge: 1741` against a floor of `0.5`. The
     lesson generalises: a test written to cover another test's blind spot needs its own
     mutation, or it inherits the blind spot and adds confidence on top of it.
  2. **The paste.** Each cell is `maxLength="1"`, and the browser truncates a pasted
     string to one character before `change` fires — so a jsdom case proves the handler
     spreads digits and NOT that a reader pasting a code gets six of them (jsdom performs
     no default paste at all for a handler to have to prevent). This case grants clipboard
     permission, writes the code with `navigator.clipboard.writeText` and presses
     Ctrl+V. With `onPaste` deleted it read `['1','','','','','']` — the defect itself.
  3. **The shake under `prefers-reduced-motion`.** A media query is a property of the
     stylesheet, so asserting that the pane raised its flag proves nothing about it. Both
     cases read `animation-name` off the SHELL's computed style under
     `page.emulateMedia({ reducedMotion })`, and both first assert that the refusal really
     happened (the error box says "All six digits, then we can look." and the flag reads
     `true`), because "nothing is animating" is trivially true of a screen that never
     refused anything. Deleting the `@media` block failed the reduce case with
     `signIn-module__…__omShake`; deleting the `.shell:has(…)` rule failed the other with
     `none`.

  The same file also pins §3.2's own measurements from the RENDERED page rather than
  from the stylesheet — the title at 50px, the 20px gap between the rule and the "The
  code" label, the row's 9px gap, each cell's 25px Courier, `13px 0` padding and centred
  text, and the two rings side by side in one row (`1.5px` `#a34434` on a filled cell
  against `1px rgba(120,98,60,.34)` on an empty one). Reading the computed style is what
  makes a rule that is present but overridden fail.

  One of those assertions is a DECLARATION rather than a rendered outcome, and it says
  so: `.labelAboveCells` sets the whole `margin` because the label is a `<p>` whose
  default `1em 0` puts 9.5px above it, and measured, **that 9.5px currently moves
  nothing** — it collapses through the zero-height top edge of the `<form>` the label
  opens and then with the rule's own 20px `margin-bottom`, so every box below sits at the
  same y to the pixel with or without the rule. It is kept because a collapse is what is
  holding that layout: a border or a padding on that form, the wrapper going away, or the
  rule's margin dropping under 9.5px each end the collapse and start a real drift. The
  gap assertion beside it is the rendered one, and it is the one that would catch that
  day.

  Each shake case clicks and reads inside ONE `page.evaluate`: the flag is cleared 420ms
  later, and a click followed by a separate round trip is a race that fails under load
  rather than under a defect. React flushes a click's state update in a **microtask**
  rather than synchronously — measured, not assumed — so the case yields the microtask
  queue once and then reads, and the 420ms timer that clears the flag is a macrotask
  scheduled during that same flush and cannot have run yet.

  **`e2e/gallery.spec.ts` (Phase 1 Task 14)** covers the four things about the gallery
  and its lightbox that only a served, laid-out page can answer, and deliberately
  nothing that `packages/domain/src/gallery.ts` (100%) or
  `apps/web/components/gallery/*.test.tsx` already prove.

  1. **The tiles stay square and unsqueezed at sixty-one of them.** `SCREENS.md` §1.8
     records the grid as "Verified with 61 tiles; must stay square and unsqueezed at
     40+", which is a statement about `aspect-ratio: 1/1` and `object-fit: cover` under
     a `repeat(auto-fill, minmax(...))` track — none of which exists until a browser
     lays it out. `apps/web/scripts/seed.ts` seeds Patagonia's full sixty-one-frame
     gallery so this case has the number the design was verified at (see
     `docs/deviations.md` §20 for why one journey and not ten).
  2. **The download is served by us.** `SECURITY.md`'s requirement has a half that no
     unit test can see: the RESPONSE headers. This suite issues the real request and
     asserts `Content-Disposition: attachment`, the strict `Content-Type`,
     `X-Content-Type-Options: nosniff`, and a `404` when the same media id is addressed
     through a journey it does not belong to.
  3. **Returning restores `/p/<n>`, not `/`** — by BOTH paths, because they are
     different mechanisms. The gallery's own control is a link whose `href` is resolved
     by the SERVER from the `from` parameter the diary's own gallery link
     carries; the browser's Back button depends on `Book.tsx`'s
     `history.replaceState`. A third case reads that `href` out of the raw
     HTML, because the first design resolved it from `document.referrer` after
     mount and a reader who clicked before hydration landed on the cover
     (`docs/qa/2026-09-03-gallery-sweep.md`, GAL-005). `e2e/routing.spec.ts` has covered the second half against a
     404 since Task 13; this is where it meets a real gallery.
  4. **The lightbox's keyboard contract.** Escape closes, the arrows step, Tab stays
     inside the dialog, and focus returns to the tile the reader STEPPED to rather than
     the one they opened.

  **`e2e/mobile.spec.ts` (Phase 1 Task 15)** covers `SCREENS.md` §1.10's mobile reading
  mode, which below 860px replaces the book entirely. It runs at the `mobile` project
  alone, and that project now carries a PHONE USER AGENT as well as a 390x844 viewport,
  because which surface a request is served is decided on the server from the user agent
  before any viewport can be measured
  (`docs/adr/0011-two-reading-surfaces-chosen-on-the-server.md`). Sixteen cases, of which
  five could not exist anywhere else:

  1. **A vertical scroll does not turn a page.** The rule is
     `packages/domain/src/swipe.ts`'s and is unit-tested to 100%, including both
     diagonals either side of the 1.4 ratio; `useSwipe.test.tsx` drives the binding with
     dispatched React events. Neither can tell you whether a finger dragging DOWN the
     page also turns it, because neither scrolls anything. These cases drag through the
     DevTools Protocol's `Input.dispatchTouchEvent` - the same input path a finger takes,
     so the browser scrolls the column itself - and assert BOTH halves: that the column
     moved, and that the address did not. A run where nothing scrolled would pass the URL
     check while proving nothing.
  2. **Neither surface ships the other's code**, which is what two route entries bought
     (`docs/adr/0012-two-route-entries-for-two-reading-surfaces.md`). The case fetches
     `/p/1` twice, once with a desktop user agent and once with a phone's, collects every
     script and stylesheet each document asks for, fetches those too, and requires that
     none of the book's carry `mobile-module__` and none of the mobile surface's carry
     `book-module__` — one marker per surface, because Turbopack puts a stylesheet's
     class-name prefix in both the CSS chunk and the client chunk that imports it. It is
     the guard on the bundling seam rather than the rendering one, and it is the case that
     fails if a future shared import quietly pulls one surface into the other's chunk
     group. Proved to fail first, by importing `mobile.module.css` into `Book.tsx`.
  3. **A phone's document carries no book at all.** No design box, no leaves - the weight
     the surface split exists to avoid, asserted rather than assumed.
  4. **All THIRTY-THREE deep links serve their own page in raw HTML**, with no script
     run — the mobile counterpart of `e2e/serverWindow.spec.ts`'s thirty-three-route
     case, and the same design-spec §8 promise. **It was four hand-listed routes until
     Phase 1's final review**, which named the gap plainly: `serverWindow.spec.ts` skips
     below 860px, Googlebot Smartphone is served THIS surface, so the surface most likely
     to be indexed was the only one with no per-route guarantee. It now fetches every
     `/p/<n>` with the phone user agent and holds each document to the BOOK, fetched in
     the same run at `?pages=all` with a desktop user agent — an independent answer,
     since ADR 0012 made the two surfaces two route entries with two page components.
     Each route must serve one mobile page and zero leaves and zero design boxes; its
     `data-mobile-page` kind must equal the `data-page` kind the completed book puts at
     that leaf; the journey its header names must be the journey the book's own bookmark
     rail puts at that leaf; and its counter must read `NN / 33`.

     **An exact text match across the two surfaces is not available, and the case does
     not pretend otherwise.** They render the same content differently on purpose — the
     mobile Cover carries "Start reading" and a swipe hint where the book's carries its
     postal stamps, a mobile frames page repeats the journey's weather and mood badges
     where the book's prints "Frames 01 – 03", and the mobile About drops the kit list.
     So identity is asserted through what both surfaces must agree on (kind, and
     governing journey) and substance through what only this surface can answer: all
     thirty-three pages carry more than 50 characters, and no two of them carry the same
     text. A route serving another route's page fails the first pair; a route thinning
     out to nothing fails the second. Measured while writing it: thirty-three distinct
     texts, the shortest 144 characters (the Cover).
  5. **The correction path**, in its own browser context with a DESKTOP user agent at a
     700px viewport - the one reader the server's hint gets wrong. It asserts that the
     document arrived carrying the book, that the browser corrected it to the mobile
     mode, and that the correction survives a navigation because it is remembered in a
     cookie rather than in the address.

  **NINE BOOK SPECS NOW SKIP BELOW 860px**, through one shared predicate and one line
  each: `drawsMobileReadingMode` in `e2e/support/surface.ts`, reading the domain's own
  `MOBILE_READING_MAX_WIDTH_PX` rather than an 860 repeated per file. A book spec's
  mobile run had stopped describing anything a reader below the breakpoint will meet -
  the design says there is no book there - so the skip removes a case that was no longer
  about the product, and each carries its reason in its own `test.skip` message.
  `e2e/layout.spec.ts` is the one file that does NOT take that route; see below.

  **`e2e/layout.spec.ts` (Phase 1 Task 12, rethought in Task 15)** asserts in numbers what
  a screenshot cannot say - that the book is on the screen. Its four cases are the record
  of an S1 defect found at 390px (`docs/qa/2026-09-01-diary-sweep.md`), which is exactly
  the viewport where there is now no book to place. Standing them down there would have
  left the `mobile` project with no placement test at all, so each is PAIRED with a mobile
  case asking the same question of the surface that is drawn instead: the surface fills
  its viewport with no spill and no sideways scroll; `elementFromPoint` at the middle of
  the scrolling column lands inside the page; every bookmark in the drawer receives a tap,
  and Marrakech - the same tab the book's own case clicks - is tapped to prove it; both
  52px bottom-bar arrows are pressable, hit-tested at their own centres rather than
  through a Playwright click that would scroll them into view first.

  **The Next dev overlay is off** (`apps/web/next.config.ts`, `devIndicators: false`).
  It is fixed to the bottom-left of the viewport, which at 390px is where §1.10 puts the
  previous-page arrow, and `<nextjs-portal>` intercepted every click on it - so
  `e2e/mobile.spec.ts` and `e2e/layout.spec.ts` could not be run locally at all while the
  same cases passed in CI, which serves a production build with no overlay. A suite that
  only passes on the runner is one a developer learns to skip.

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

  **`e2e/frames.spec.ts` and `e2e/about.spec.ts` (Phase 1 Task 11)** do the same job
  for the three pages that carry the book's photographs. Two things in them are worth
  knowing before editing either file.

  The rotations are read to THREE DECIMAL PLACES, out of the resolved transform matrix.
  SCREENS.md §1.4-§1.6 give each of the eight mounts its own authored angle (−1.6°,
  −1.4°, −1.2°, −0.7°, −0.5°, +0.8°, +1.0°, +1.5°), and rounding them to whole degrees
  — the technique `notes.spec.ts` uses for its badges at −6° and +5° — collapses six of
  them onto −1, 0 and +1, so the cases would pass against a page that had swapped them.
  The three mini stamps on About are the exception and are rounded, because their
  angles are three degrees apart at the closest.

  The focal point is proved on a `frame`-role slot and on the About portrait, not only
  on the Notes hero. The portrait matters most: it is the one photograph in the diary
  whose focal point comes from the MEDIA ITEM rather than from a `pages` slot, so it
  travels a different path through `readBookBundle` and a wiring that held for slots
  alone would leave it silently centred. Both use `notes.spec.ts`'s method — assert the
  fit is `cover`, assert the computed position, screenshot the element at its focal
  point and again forced back to `50% 50%`, and require the two buffers to differ.

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

  **`e2e/imageWindow.spec.ts` (Phase 1, the LCP fix)** covers the one thing the unit
  suites cannot: whether the bytes actually stop arriving. `Book.tsx` renders all
  thirty-three leaves and every leaf is absolutely positioned at `inset: 0`, so the
  browser counts all of them as in the viewport and `loading="lazy"` defers NOTHING —
  measured, not assumed: `/p/1` fetched all twenty of the seeded book's photographs,
  1,820,504 bytes, with the reader on the Cover, and the LCP gate went red at 3,247ms.
  An attribute-level assertion would have passed the whole time that was happening,
  because the `lazy` attribute was present throughout, so the first case counts real
  network responses and requires ZERO on `/p/1`.

  The window itself is `leafPresentation.loadsImages`
  (`packages/domain/src/pageStack.ts`), unit-tested to 100% there. Three further cases
  guard what a browser has to settle: that a leaf inside the served document but outside
  the image window still carries its heading, its caption and its alt text with only its
  `src` stood in for (the bytes are deferred, never the markup); that the next
  page's hero is already `complete` with a non-zero `naturalWidth` at the FIRST
  animation frame of the turn that reveals it, which is the "empty frame swinging into
  place" defect stated as an assertion; and that a bookmark jump's destination is inside
  the window from the first frame of the jump rather than only once the turn commits.
  The last two fire their trigger from inside `page.evaluate` and read one frame later,
  for the reasons `flip.spec.ts`'s header sets out.

  Two of this file's cases moved when the SERVER's content window landed
  (`docs/adr/0009-server-rendered-page-window.md`), and both moves are recorded at the
  case rather than here. The "words in the document" case now asks about leaf 4 on
  `/p/2` rather than leaf 29 on `/p/1`, because leaf 29's face is no longer in `/p/1`'s
  document at all until the reader turns a page — and leaf 4 on `/p/2` is the pairing
  the case actually wants: inside the served window, outside the image window. The
  bookmark-jump case opens the whole-book address (`wholeBookPath`), because it reads a
  single animation frame after the click and on a bare `/p/1` that frame is the book
  waiting for one round trip. That waiting is real behaviour, and it is asserted in
  `e2e/serverWindow.spec.ts` rather than left out.

  **`e2e/routing.spec.ts` (Phase 1 Task 13)** covers what the diary's ADDRESSES promise,
  which is a different subject from what any page renders. Six cases assert the 404
  boundary from outside the app — `/p/999`, `/p/34`, `/p/0` and `/p/tokyo` are 404 while
  `/p/33` is still 200, so the boundary is off by nothing — and one requires the 404 view
  to carry a link back to `/p/1`, because a reader who lands there has nothing else on
  screen. Four more read raw HTML with `request.get`, never `page.goto`: a crawler runs no
  JavaScript, so neither may the assertion standing in for one. They require each page's
  own `<title>` and `<meta name="description">` (two deep links that are one search result
  are most of what real paths were bought to avoid) and require `?pages=all` to declare
  `/p/<n>` as its canonical, which is what stops the content window's own request address
  from being duplicate content.

  **Four cases were added when the two reading surfaces became two route entries**
  (`docs/adr/0012-two-route-entries-for-two-reading-surfaces.md`). Two require `/m/<n>` —
  the mobile surface's own route entry — to answer a direct request with a **308** to
  `/p/<n>`, for a real page and for one the book does not have alike: it exists so the
  bundler has two entries to split, and left reachable it would give all thirty-three
  pages a second crawlable URL. Two more send an explicit desktop and an explicit phone
  user agent to the SAME `/p/3` and require the two documents to agree on their title,
  their description and their canonical. That pair is not redundant with the cases above
  it: a mobile-user-agent crawler (Googlebot's smartphone crawler is one) is served the
  mobile entry, so metadata that held in only one entry would be metadata half the
  crawlers never saw.

  Its last two cases are the **gallery return**, which the design spec calls out by name:
  "returning from a gallery restores `/p/<n>`, not `/`". `/gallery/<slug>` is Task 14's to
  build, and the cases do not wait for it — `Notes.tsx` and `FramesII.tsx` already render
  the gallery button as a real `<a href>` (Task 10/11, deliberately), and a navigation to a
  route that does not exist yet is still a navigation with a history entry. So the second
  case turns two pages, clicks the real link on the leaf the reader is actually on, goes
  back, and requires `/p/5` — the page reading took them to, not the one they arrived at.
  It passes today against a 404 and will keep passing when Task 14 puts a gallery there.
  What it actually guards is `Book.tsx`'s `history.replaceState`: were the book to push
  rather than replace, or not write the address at all, both cases fail.

  **One case is about a file rather than a route, and belongs here for that reason.**
  Every promise above is that a deep link is indexable, and until Phase 1's final review
  this repository served **no `robots.txt` at all** — permissive by omission rather than
  by a decision anyone can read, and not what `SECURITY.md` asks for ("respect
  `indexGalleries` in `robots.txt` **and** with `X-Robots-Tag`"). `apps/web/public/robots.txt`
  is now served, static, and consistent with `site.indexGalleries`'s `defaultValue:
  true` — the only honest content while nothing writes or reads that setting and the
  Settings screen that would is Phase 4. The case requires a 200, requires `User-agent:
  *`, `Allow: /` and `Disallow: /cms`, and requires the file NOT to carry a bare
  `Disallow: /` or `Disallow: /p` — a line that would quietly undo every other case in
  the file without failing one of them. `docs/security.md`'s `indexGalleries` row records
  the two halves Phase 4 still owes: a generated `app/robots.ts` that reads the setting,
  and the `X-Robots-Tag` header on the gallery route.

  **`e2e/serverWindow.spec.ts` (the server content window)** covers the other window,
  and its first case is the one the whole change stands or falls on: it fetches all
  **thirty-three** `/p/<n>` routes as raw HTML with `request.get`, parses each with
  `DOMParser` — never `page.goto`, because a crawler runs no JavaScript and neither may
  the assertion that a crawler is served — and requires each document's own leaf to
  match, character for character, what the completed book renders on that leaf. It
  compares against the live book rather than a transcription, so a page whose content
  ever thins out breaks the case instead of quietly agreeing with a stale string.
  9,945 characters of page text across the thirty-three routes.

  Its five browser cases are the other half, because a document that indexes beautifully
  and strands a reader on a blank leaf four turns in has not solved anything. They walk
  the reader's own path — a bare `/p/<n>`, then turns — past the window's edge forwards
  and backwards, across the book from a bookmark tab, and, with the book's own request
  for the rest of itself **held up on the network for six seconds** by `page.route`, four
  turns into a three-leaf window: the reader stops at the edge on a page with content on
  it, and the fourth turn plays itself the moment the rest arrives. That last case is the
  empty-leaf defect stated as an assertion, and it is the only place the held-move queue
  can be observed in a browser.

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

  **`e2e/chrome.spec.ts` (Task 12, `SCREENS.md` §1.7)** covers the book's chrome in a
  real layout engine: the bookmark rail, the bottom bar and the spine ribbon. Its
  markup is covered three times over by `apps/web/components/chrome/`'s own jsdom
  suites — which tab carries `aria-current`, what each tab prints, that the arrows are
  labelled and go dead at the ends of the book — and none of those can answer the four
  questions that actually broke: whether the ribbon takes a click meant for what is
  under it, whether the bar is 58px, whether a control has been laid out under the rail,
  and whether the rail scrolls without showing a scrollbar. All four are layout and
  hit-testing, so all four run here at all three viewport projects.

  Two of its cases are worth knowing about specifically. **The ribbon case asserts on a
  live trigger, not on the hit test alone** — the first draft only asked whether the
  element under the ribbon's centre was the ribbon, and it PASSED with
  `pointer-events: none` deleted, because the backward page-edge strip's own
  `z-index: 900` already sits above the ribbon's `400` and answered for it. It now clicks
  at that point and requires the page to turn back, which is what a reader would notice.
  **The scrollbar case reads the declared `scrollbar-width` as well as the measured
  gutter**, for the same reason: this browser draws overlay scrollbars, so the gutter is
  0 whether the rule is there or not — measured, with the diary-wide rule removed, rather
  than assumed. It still asserts the content genuinely scrolls (a rail made
  `overflow: hidden` to lose its scrollbar would fail there), on a viewport forced short
  so the thirteen tabs overflow at every project rather than only at two of them.

  `e2e/smoke.spec.ts` is the console-error gate: it loads `/cms`, `/p/1` and (Task 13)
  the page-not-found view at `/p/999` — where the correct response is a 404, so that case
  asserts the status rather than `ok()`, and what it is really about is that a route which
  deliberately throws `notFound()` renders cleanly rather than logging on the way. It
  asserts
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

  **And the list drifted again.** Task 12 found `e2e/frames.spec.ts`,
  `e2e/about.spec.ts` (both Task 11) and `e2e/serverWindow.spec.ts` named by
  `npm run test:e2e` but absent from the CI job, so none of them had gated a merge
  either — `serverWindow.spec.ts` most consequentially, since it is what asserts all
  thirty-three deep links still serve their own page. All three are named there now,
  alongside Task 12's own `e2e/chrome.spec.ts`. Two lists that have to agree will
  disagree eventually; until one is generated from the other, checking both is part of
  landing a spec.

  **The third time, it was made impossible instead.** Task 13 added
  **`e2e/ciRegistration.spec.ts`** (a Vitest test, `e2e/ciRegistration.test.ts`, since
  Phase 2 — see below), whose whole subject is the two lists above. It
  globs `e2e/*.spec.ts` off the filesystem, reads the `- run:` command out of
  `.github/workflows/ci.yml`'s browser job and the `test:e2e` / `test:visual` /
  `test:a11y` scripts out of `package.json`, and fails naming exactly which spec is
  missing from which list. It reads the `run:` COMMAND rather than the workflow file,
  because that file's comments name half these specs in prose and a substring search
  over it would pass for a spec that is only ever mentioned — which is the state this
  guard exists to end, dressed as a green test. It was proved able to fail: a throwaway
  `e2e/dummyDrift.spec.ts` was added, both cases failed naming it, and the file was
  deleted. It needs no browser and no `page` fixture, so it costs the run a file read.

  **A third case was added in Phase 1's final review, for the same defect shape in a
  different list.** `npm run test:perf` runs one `lhci autorun` invocation per
  `lighthouserc*.json` — two when this case was written, **three since Phase 2 Task 11 added
  `lighthouserc.admin.json`** — because lhci's collect settings are per-run rather than per-URL
  and the book's 1350x940 desktop viewport cannot share a run with the gallery's phone
  emulation (ADR 0014). Nothing enforced the pairing: collapsing the script to one
  command — a plausible tidy-up — would have silently stopped gating the book surface,
  the heavier of the two and the one every LCP ADR measured, while `npm run test:perf`
  still exited 0 and CI still reported the step green. The case reads the config
  filenames off the repository root, reads `test:perf` out of `package.json`, and fails
  naming exactly which config nothing runs. Reading the filenames off disk rather than
  hard-coding the pair is what makes it catch a THIRD configuration added and never run.
  Proved able to fail: `test:perf` was collapsed to the first command alone, the case
  failed naming `lighthouserc.book.json`, and the script was restored — both runs are
  pasted in this task's report. **It then did exactly what it was written for.** Phase 2
  Task 11 added `lighthouserc.admin.json` to the repository root, and the case failed naming
  that file before `test:perf` was updated to run it — which is the third-config scenario the
  "read the filenames off disk" decision was made for.

  **The script's shape changed under it in the same round, and the case was written to
  survive that.** `test:perf` was a `&&` chain and is now
  `node scripts/run-lighthouse.mjs <config> <config> <config>`, because `&&` short-circuits
  and a red gate was hiding a newer one behind it. This case still passes unchanged: it asks
  whether the script NAMES each config, not how it invokes them. That is also why the runner
  takes the configs as arguments instead of globbing them itself — a runner that discovered
  them would satisfy this case by construction, which is the shape of test that passes
  because it cannot fail.

  **The fourth time, the guard was there and did not fire — so it moved into `verify`
  (ruling F57).** Phase 2 Task 9 found `e2e/codeStep.spec.ts` named by `npm run test:e2e`
  and by no `- run:` line since commit `2d2b3c1`, gating nothing for two commits. The
  guard above would have caught it — the Task 9 reviewer removed `e2e/reset.spec.ts` from
  the CI line and watched it fail as designed — but it was a **Playwright spec**, so it
  ran only in the CI browser job or in a full `npm run test:e2e`, never in
  `npm run verify`, the gate Husky runs before every commit. A detector that lives in the
  same job as the thing it detects reports the fire from inside the building. It is
  `e2e/ciRegistration.test.ts` now: the same three cases, importing `vitest` instead of
  `@playwright/test`, collected by `vitest.config.ts`'s `unit` project via its
  `e2e/**/*.test.ts` glob, so a commit that forgets a `run:` line fails at the moment it
  is made. It stays in `e2e/` because that directory is its subject, and
  `playwright.config.ts` narrows its own `testMatch` to `**/*.spec.ts` so the two runners
  cannot collect each other's files. It is no longer named by `test:e2e` or by the CI
  browser job, because it is not a browser test — `npm run verify` runs it, and CI runs
  `npm run verify:full`. Proved able to fail in its new home: `e2e/reset.spec.ts` was
  removed from the CI `run:` line and `npx vitest run --project unit e2e/ciRegistration.test.ts`
  failed naming it; the line was restored.

- **Three viewport projects** — `desktop` (1440×900), `mid` (1000×800), `mobile`
  (390×844; `isMobile`/`hasTouch` set) — run every spec three times, once per breakpoint
  named in the Task 12 brief. All three use Chromium, not a mix of engines: this
  environment's Firefox/WebKit binaries are an unverified download, and are not needed
  to catch the class of defect this harness targets today (console/pageerror,
  axe violations, pixel drift). Cross-browser coverage is a candidate for a later phase,
  not a Task 12 gap silently worked around — see `playwright.config.ts`'s header.
- **Run:** `npm run test:e2e` (headless, runs `e2e/smoke.spec.ts`,
  `e2e/book.spec.ts`, `e2e/flip.spec.ts`, `e2e/layout.spec.ts`, `e2e/chrome.spec.ts`,
  `e2e/pages.spec.ts`,
  `e2e/notes.spec.ts`, `e2e/frames.spec.ts`, `e2e/about.spec.ts`,
  `e2e/imageWindow.spec.ts`, `e2e/serverWindow.spec.ts`, `e2e/routing.spec.ts`,
  `e2e/gallery.spec.ts`, `e2e/mobile.spec.ts`, `e2e/signIn.spec.ts`,
  `e2e/codeStep.spec.ts` and `e2e/reset.spec.ts` — the
  authoritative list is the script itself, and `e2e/ciRegistration.test.ts`, which runs in
  `npm run verify`, is what makes the two agree); `npm run test:e2e:headed` (all
  `e2e/*.spec.ts`, visible browser) — this is also the engine
  `sweeping-for-browser-defects` (`.claude/skills/`) uses for manual, scripted sweeps.
  `playwright.config.ts`'s `webServer` boots the real app: `npm run dev` locally
  (reused if already running), `npm run build && npm run start` in CI.
- **Add one:** one spec per real user journey as each is built; assert on the DOM
  reflecting the state machine (e.g. `flipMachine`'s state), not on re-deriving the
  machine's logic in the test. Every new route gets its own `test()` in
  `e2e/smoke.spec.ts` first — a route with no console-error coverage is a route this
  suite is silently not protecting. A new spec file also needs adding to the
  `test:e2e` script AND to `.github/workflows/ci.yml`'s browser job; a spec no script
  names is a spec CI does not run, and `e2e/ciRegistration.test.ts` now fails
  `npm run verify` — the pre-commit gate, not two tasks later and not one full CI run
  later — when either list is missing one.

### 5 · Visual regression

- **Tool:** Playwright snapshots (`toHaveScreenshot`, `maxDiffPixelRatio: 0.01` in
  `playwright.config.ts` — the design is high-fidelity, so drift is a defect, not noise).
- **Scope:** every page type and every admin screen, at each breakpoint. Drift from the
  high-fidelity design is treated as a defect. Each page type is snapshotted by the task
  that lands its designed layout, not before — a baseline captured against provisional
  page content would have to be thrown away and recaptured, teaching nobody to trust it
  in between. Phase 1 Task 9 added the **Cover** and **Contents** pages
  (`diary-cover-*.png`, `diary-contents-*.png`, all three projects), Task 10 the
  **Notes** page (`diary-notes-*.png`) and Task 11 **Frames I**, **Frames II** and
  **About** (`diary-frames-i-*.png`, `diary-frames-ii-*.png`, `diary-about-*.png`) —
  every page type the book has, twenty-one files in all. All six diary cases share one `settled()` helper (wait
  for the section, for the design box's `scale(k)`, for `document.fonts.ready`, then for
  every image in the document to `decode()`); each of those four waits replaces a race,
  and none of them is a timeout.

  Task 14 added `diary-gallery-*.png` and `diary-lightbox-*.png` — the gallery route and
  the lightbox open over it, three projects each. Neither is `fullPage`: sixty-one tiles
  is several viewports of scroll, and a baseline that tall is one nobody reads a diff of;
  the viewport carries the header, the grid's tracks and its first rows, which is every
  rule `SCREENS.md` §1.8 states. They also do not use `settled()` — there is no scaled
  design box on this route — and they await only the images the browser has actually
  fetched, since the grid loads lazily by design and the rest are below the fold.

  Task 13 added a twenty-second, twenty-third and twenty-fourth: `diary-not-found-*.png`,
  the page-not-found view an address naming no page now renders. It is the one case here
  that does not call `settled()` — there is no scaled design box on that view to wait
  for, only the fonts. It earns a baseline because it is a view assembled from the
  design's surface (desk gradient, paper card, hairline rule, all three type families)
  for a screen the design does not itself specify, which is exactly the kind of thing
  that drifts away from the rest unnoticed. Task 13 changed no page's markup, and the
  twenty-one existing baselines came back **byte-identical** from the same
  `--update-snapshots=all` container run that wrote the three new ones, with
  `e2e/layout.spec.ts` green in it.

  Each Task 11 baseline was captured in the same pinned-container run that regenerated
  the six older ones, and the older six MOVED for a structural reason rather than a
  cosmetic one: `/p/1` renders all thirty-three leaves at once, so replacing thirty
  heading-only fallback faces with thirty designed pages changes what is drawn behind
  the current leaf in every screenshot in this suite.

  The diary cases snapshot the FULL PAGE, not the scaled design box. The box is drawn
  with `transform: scale(k)`, so a box-only snapshot would be byte-identical at all
  three projects and would prove nothing about the breakpoints, whereas the full page is
  what a reader at 390px actually sees. The consequence is that these baselines also
  carry the diary chrome outside the box (bookmark rail, bottom bar), whose designed
  appearance is Task 12 — that task updates these nine files, which is expected and is
  what a baseline is for. They now guard geometry AND the design's FULL typography:
  Courier Prime 400/700 and EB Garamond's italic face were wired in and every baseline
  was regenerated in the pinned container against them, with `e2e/layout.spec.ts` green
  in the same run — see `docs/adr/0008-lcp-budget-and-the-framework-floor.md`.
  `docs/deviations.md` §11, which recorded the old two-of-three state, is withdrawn.

  Task 15 moved seven files, and for a structural reason rather than a cosmetic one: at
  the `mobile` project `/p/<n>` no longer draws the book. `diary-cover-mobile`,
  `diary-contents-mobile`, `diary-notes-mobile`, `diary-frames-i-mobile`,
  `diary-frames-ii-mobile` and `diary-about-mobile` are now pictures of `SCREENS.md`
  §1.10's mobile reading mode - they were previously a whole book at roughly a third
  scale, the least useful images in this directory - and a seventh joins them,
  `diary-mobile-drawer`, the bookmark panel, which exists at that project alone because
  it is §1.10's replacement for the book's 158px rail. `settled()` reads WHICH surface it
  is looking at off the document (does a `[data-design-box]` exist?) rather than off the
  project's viewport, because it is the server that decided it.

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
  are now `-linux.png`, generated inside that exact image — by hand at first, and since
  Phase 2 Task 7 by `npm run test:visual:container:update`, which is the invocation the
  Run bullet below documents in full (and which passes `--update-snapshots=all`, not the
  `changed` default this line used to name). The old `-win32.png` files were deleted, not
  kept alongside. `browser` no longer skips `test:visual`; it runs in the same
  `npx playwright test` invocation as the smoke and accessibility specs.
- **Run — and this is now the ONLY way to run it off Linux.** `e2e/visual.spec.ts`
  **skips** on a Windows or macOS host rather than comparing: Playwright names the file
  it wants after the host platform, so such a run asks for `-win32.png`, finds nothing,
  WRITES one, and every run after that compares the host against itself and passes. That
  is not hypothetical — 31 such files were found untracked in the snapshot directory
  while a full local suite reported "394 passed" and the committed baselines went unread.
  The two commands below are the whole story:

  ```
  npm run db:migrate && npm run db:seed          # once, on the host — these run the
                                                 # suite, not the fixtures
  npm run test:visual:container                  # compare against the committed baselines
  npm run test:visual:container:update           # regenerate the ones that actually moved
  npm run test:visual:container:update:all       # regenerate every one — opt-in, see below
  ```

  Both are `docker compose run --rm` against the `visual`/`visual-update` services in
  `docker-compose.yml`, which are `mcr.microsoft.com/playwright:v1.62.1-noble` — the same
  image, at the same tag, that CI's `browser` job runs in. **Phase 2 Task 7 wrote them
  down.** Until then the command needed to satisfy a gate this repository enforces existed
  nowhere in the repository: this document named the image for `test:perf` only, there was
  no `docker run` line in `docs/` or `.github/`, and `package.json`'s `test:visual` ran
  Playwright on the host. The service definition carries the reasoning in full; the four
  things worth knowing here are:

  - **The container installs its own `node_modules`, into named volumes.** A Windows
    checkout holds Windows-built binaries (`sharp`, `lightningcss`, the SWC/Turbopack
    native packages) that a Linux container cannot load, and a bare bind mount would also
    let the container's `npm ci` delete them. Five named volumes shadow the four
    `node_modules` directories and `apps/web/.next`; everything else, including
    `e2e/visual.spec.ts-snapshots/`, is the live bind mount, so a regenerated baseline
    lands straight in the working tree.
  - **It runs with `CI=1`**, so `playwright.config.ts` boots a production build rather
    than `next dev` — CI's own baselines are taken against a production build, and a
    development-mode image would be compared against something the runner never renders.
  - **`e2e/layout.spec.ts` runs in the same invocation**, because of the standing rule
    below: never accept a regenerated `diary-*` baseline unless that suite was green in
    the run that produced it.
  - **`--update-snapshots=changed` is the default, and `all` is a separate, named
    service.** This started the other way round and the first use proved why it should
    not: `all` rewrote fifteen unrelated `diary-*` baselines that no change in that commit
    could have touched and that the comparison run immediately before had just passed —
    encoder and anti-aliasing noise under `maxDiffPixelRatio`, not drift, and committing
    it would have made the next real diff unreadable. They were caught and reverted by
    hand, which is a rule that describes the next recurrence rather than preventing one.
    `changed` writes only baselines whose diff EXCEEDS the threshold, plus any that are
    missing entirely, so a new screen's baselines still land on the first run and nothing
    else moves.

    **The one case that needs `all`** — and the reason the opt-in exists rather than the
    flag being deleted — is a baseline whose diff is UNDER the threshold and which is
    nonetheless wrong, because `changed` leaves it alone while still reporting a pass. The
    cover-contrast change (`docs/deviations.md` §12) is the real instance: it moved the
    `mobile` cover by less than the threshold, and `changed` would have left that one file
    showing the old, failing cover. Reach for
    `npm run test:visual:container:update:all` when you have INTENDED a visual change that
    a comparison run did not flag, and read `git status` afterwards.

    Either way the order is the same: **compare first, then update.** The comparison run is
    what tells you which files are supposed to move.

  `npm run test:visual` on a developer's own machine is still there, and on Linux it is
  the quick local check; off Linux it now skips with a message naming the container
  rather than quietly writing a host baseline.
- **Phase 2 Task 7 adds the first ADMIN screen**: `admin-sign-in-*.png`, `SCREENS.md`
  §3's sign-in shell with §3.1's password step in it. One case, three images, and that
  covers both of the layouts §3 specifies rather than one of them — the projects already
  ARE the breakpoint: `desktop` (1440) and `mid` (1000) are above §3's 820px boundary and
  photograph the cloth panel beside the form, and `mobile` (390) is below it and
  photographs the narrow masthead above a 470px shell. It does not use `settled()` (no
  scaled design box on this route) and waits only for the pane and
  `document.fonts.ready`, since the screen carries no images at all.
- **Phase 2 Task 8 adds its second state**: `admin-sign-in-code-*.png`, `SCREENS.md`
  §3.2's one-time-code step in the same shell. Three images again, and again that covers
  both of §3's layouts rather than one. It is the only case in `e2e/visual.spec.ts` that
  fixes the browser's clock (`page.clock.setFixedTime`) before navigating, and it has to:
  the screen carries two LIVE countdowns — "It expires in {m:ss}" and "Send again in
  {n}s" — so without a fixed clock the baseline photographs whichever second the run
  landed on and every later comparison drifts against it. The fixed instant is
  deliberately in the PAST, so both windows clamp to their whole length
  (`secondsRemaining`'s ceiling) and the image always reads "5:00" and "Send again in
  30s". The comparison run before the update was green on all 46 existing baselines and
  failed only on the three missing ones; the `changed` update wrote exactly those three
  and `git status` showed nothing else had moved.
- **WHAT `maxDiffPixelRatio: 0.01` DOES AND DOES NOT CATCH — measured, because "the
  visual suite passed" keeps being read as more than it is.** The threshold is a
  proportion of the frame, so the licence it grants is an area: at the `desktop`
  project's 1440×940 full-page frame, 1% is roughly **13,500 pixels**. A narrow column
  of type displaced vertically is cheap in pixels, and vertical displacement of a narrow
  column is the most common CSS regression this codebase produces — which is precisely
  the class these baselines are assumed to cover.

  **The worked example, run in the pinned container against the committed baselines.** A
  `margin-top` was added to `.cells` on the one-time-code screen, moving everything below
  it down, and the suite was run at each magnitude:

  | Shift | `desktop` (1440×940) | `mid` (1000×800) | `mobile` (390×844, DPR 3) |
  |---|---|---|---|
  | **10px** | **passes** | **passes** | fails — 3,323px, ratio 0.02 |
  | **20px** | **passes** | fails — 9,865px | fails — 16,096px |
  | **40px** | fails — 18,958px, ratio 0.02 | fails | fails |

  So the `desktop` baseline absorbs a **20px** vertical displacement of an entire pane
  without a word, and only starts objecting somewhere between 20px and 40px. `mobile`
  catches ten times less because its frame is small and its device pixel ratio is 3.

  **Do not tighten the threshold.** It exists to absorb encoder and anti-aliasing noise,
  and that noise was measured at 14-15 files varying per run (Task 7) — tightening it
  buys a suite that cries wolf, which is how a real diff stops being read. **The rule
  that follows instead: spacing that matters gets a numeric assertion, not a baseline.**
  `e2e/codeStep.spec.ts`'s measurements case is the pattern — a `getComputedStyle` /
  `getBoundingClientRect` read of the value itself, which fails on a one-pixel change at
  every project at once.

  This is the second time in two screens that the threshold has hidden something a reader
  assumed it covered. Task 7's sub-threshold gradient change was the first, where
  `--update-snapshots=changed` would have left three baselines stale because the
  comparison never flagged them. A gate whose real coverage is undocumented is how "the
  visual suite passed" becomes evidence for something it never checked.

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
- **Status:** implemented for every view that exists — including, since Phase 2 Task 7,
  the first screen of the bespoke admin: `/admin/sign-in` runs `expectNoAxeViolations`
  with **no exclusions**, and it is the first view in the product where `label`,
  `form-field-multiple-labels` and `autocomplete-valid` have anything to judge. It is
  followed by TWO contrast cases of the same kind the cover has, and for the same reason:
  the cloth panel and the narrow masthead are gradients, so axe returns `color-contrast`
  INCOMPLETE over both and a green axe run says nothing about the cream lines drawn on
  them. Measured from the rendered pixels, the panel's eyebrow came in at 4.447:1 —
  below AA — which is what `docs/deviations.md` §32 records and fixes; the masthead
  needed no change and measures 4.805, 7.974 and 4.577. The masthead case runs at the
  `mobile` project alone and the panel case at the other two, because each block is drawn
  at one side of the breakpoint only.

  **Phase 2 Task 8 adds the second sign-in state**, `/admin/sign-in/code`, in TWO cases
  and with no exclusions either: the screen as it loads, and the screen after it has
  refused a code. The second exists because the error box is the one part of that pane
  axe never sees on a clean load, and it is what `aria-describedby` on the cell group has
  to resolve to. This is also the first view in the product where `label` has six
  boxes with no visible label to judge — `SCREENS.md` §3.2 gives the row one heading
  ("The code") and no per-cell text, so each cell carries an `aria-label` ("Digit 1 of
  6") and the row is a `role="group"` named by that heading. The cloth and masthead
  contrast cases already cover this route's frame, since it is the same shell drawn from
  the same stylesheet; its pane is dark ink on `#fffdf6`, which axe judges for itself.

  Implemented for each designed diary page in turn — `/p/1` (Cover, Task 7), `/p/2` (Contents, Task 9), `/p/3` (Notes, Task 10)
  and `/p/4`, `/p/5`, `/p/33` (Frames I, Frames II and About, Task 11), because each
  page kind renders different markup on the same URL shape — plus Task 13's
  page-not-found view (`/p/999`), the one diary view that is not a page of the book and
  the one where an unlabelled way back would strand a reader with nothing else on
  screen. Task 14 added two more: `/gallery/patagonia` and the same route with its
  LIGHTBOX OPEN. The second of those is the only view in the product that traps a
  reader's focus, and axe knows most of what that costs — `aria-dialog-name` (a dialog
  needs an accessible name), `button-name` on its four controls, and `color-contrast` on
  cream type over a 95%-opaque near-black scrim. It runs with no exclusions,
  deliberately: silencing one of those rules would be silencing the only automated check
  this project has on that view. The gallery case itself is where `image-alt` has most
  to judge anywhere in the product, a gallery being almost entirely photographs. All
  nine
  call `expectNoAxeViolations(page)` with **no exclusions at all** — every rule in the
  full ruleset applies to a route this project authored, and `/cms`'s allowances below
  must never be inherited by them. All nine pass on all three viewport projects. The
  Notes case is the first with anything for `image-alt`, `definition-list` or
  `link-name` to judge: it is the first page in the diary with photographs, a
  description list (the tally ticket) and a link styled as a button. The two Frames
  cases are three quarters and four fifths photograph, so a slot whose alt text went
  missing would be most of the page; the About case is the one page in the book with
  nothing clickable on it at all, and the one whose level-one heading is a static
  string rather than editor content — which is what keeps `page-has-heading-one` green
  on a book whose `about` global has never been filled in. `/cms`
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
  exclusion is revisited the moment `/cms` stops being the route under test — the bespoke
  `/admin` replaces it, and Phase 2 Task 7 mounted its first screen (`/admin/sign-in`,
  which needs no `allow` at all).
- **The mobile reading mode is audited separately, because it is a separate tree**
  (Phase 1 Task 15). Six of the diary's axe cases are the BOOK's and now skip below
  860px; six new ones take their place at the `mobile` project - `/p/1`, `/p/2`, `/p/3`,
  `/p/4` and `/p/33` for §1.10's four page kinds, plus the bookmark drawer OPEN over
  `/p/3`. All six call `expectNoAxeViolations(page)` with **no exclusions**, the same bar
  the book's pages are held to. The drawer case is the second view in this product that
  traps a reader's focus (the lightbox is the first), so `aria-dialog-name`,
  `button-name`, `aria-allowed-attr` on `aria-current` and `color-contrast` over
  `#3b332a` all have something real to judge - and that last one is why the drawer's tab
  list is not painted the way the book's paper-backed rail is: the prototype's own
  colours measure 2.28:1 and 1.68:1 on that panel (`docs/deviations.md` §22).
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

**3 · All three handoff fonts are self-hosted, at all five faces the design uses.**
README.md's "Fonts are Google Fonts (Caveat, EB Garamond, Courier Prime) — self-host in
production" is closed via `next/font/local`, with the five `.woff2` files committed and
`next build` never touching the network (`docs/adr/0005-font-hosting.md`,
`apps/web/app/(diary)/fonts.ts`). Courier Prime 400/700 and EB Garamond's italic face
were deferred through Phase 1 on a real LCP measurement, and that measurement **still
reproduces**: `/p/1` measures 2,488.2ms with two faces, 2,637.4ms with four and
2,933.8ms with five, against CLAUDE.md §6's 2,500ms gate — the gate at the time of
writing; **3,000ms today**, see §7.0's current-state table below. They were wired in
anyway, because a minimal fontless route in this same app models 2,023.2ms of that
budget on its own and the route's OBSERVED paint is ~130ms in every configuration —
`docs/adr/0008-lcp-budget-and-the-framework-floor.md` has the floor measurement, the
options, and the record that the gate was left **red and unraised** at the time — raised
to 3,000ms since, and green today (§7.0). Every visual
baseline was regenerated in the pinned container against the five-face state, with
`e2e/layout.spec.ts` green in the same run.

### 7 · Performance

#### 7.0 · Current state — what is gated today

**Read this table first.** Everything below it is a chronological record of how these
numbers were arrived at, kept because the measurements are the argument for the numbers.
That record quotes figures that have since been superseded — the 2,500ms LCP budget
above all. **No figure beneath this section is the current gate unless this table says
so.**

| Gate | Config | Route | Limit |
|---|---|---|---|
| `largest-contentful-paint` | `lighthouserc.book.json` | `/p/1`, book surface (1350x940, `Cookie: td-reading-surface=book`) | **≤3000ms** |
| `largest-contentful-paint` | `lighthouserc.json` | `/p/1`, mobile surface (Lighthouse phone emulation, no cookie) | **≤3000ms** |
| `largest-contentful-paint` | `lighthouserc.json` | `/gallery/patagonia` | ≤4000ms |
| `resource-summary:script:size` | both | `/p/1` (both surfaces), `/gallery/<slug>` | ≤184320 bytes (180KB, `CLAUDE.md` §6) |
| `resource-summary:image:size` | `lighthouserc.json` | `/gallery/<slug>` | ≤600000 bytes |
| `largest-contentful-paint` | `lighthouserc.admin.json` | `/admin/sign-in`, `/admin/sign-in/code`, `/admin/reset` (1440x900 desktop) | **≤3000ms** |
| `resource-summary:script:size` | `lighthouserc.admin.json` | the same three admin routes | ≤327680 bytes (320KB, `CLAUDE.md` §6) |
| `cumulative-layout-shift` | all three | every collected URL | ≤0.1 |
| `http-status-code` | all three | every collected URL | `minScore: 1` |
| — | `lighthouserc.json` | `/cms` | `http-status-code` and CLS only: no LCP, no script budget |

All three configs collect `numberOfRuns: 5` and every `assertMatrix` entry carries
`"aggregationMethod": "median"`. `npm run test:perf` runs **all three**, and all three are
gates; `e2e/ciRegistration.test.ts` asserts that the script still names every
`lighthouserc*.json` on disk — it reads the filenames off the repository root rather than
hard-coding the pair, which is what made it catch `lighthouserc.admin.json` the moment that
file landed and before the script named it.

**`lighthouserc.admin.json` is Phase 2 Task 11, and it is the first performance gate the
admin has ever had.** Tasks 7, 8 and 9 each reported `CLAUDE.md` §6's admin budgets
UNRESOLVED for the same reason: `lighthouserc.json` and `lighthouserc.book.json` between them
cover the diary's two surfaces and the gallery, and nothing covered `/admin/*` at all. It is
a third config rather than three more URLs in an existing one for exactly the reason ADR 0014
gives for the book's: lhci's collect settings are per-run, not per-URL, and the admin is an
authoring surface measured at a desktop viewport rather than under phone emulation.

**Three of the five reachable admin addresses are collected, and the other two are bounded
rather than guessed.** `/admin/sign-in/done` is behind the session guard, so Lighthouse —
which sends no cookie — collects the redirect rather than the screen. Rather than fabricate a
session for the collector it is left out, with the bound recorded: it ships strictly fewer
client modules than the three that are collected, because `SignedInStep` is not a
`'use client'` component and the other three panes are, so its script total cannot exceed
theirs. `/admin/reset/<token>` renders `NewPasswordStep`, which IS a client component and so
is not covered by that argument; its address needs a live token that changes every run, so it
was measured directly instead — 8 scripts, 176,211 bytes gzipped, against the 320KB ceiling.

**`/admin/sign-in/code` is collected with no cookie**, so what it measures is the
no-challenge placeholder rather than the pane a signing-in reader sees. Said rather than left
to be assumed: it is the state an unauthenticated visitor to that address is actually served,
it renders the same shell, the same six cells and the same client bundle, and the states that
differ from it differ in text rather than in bytes. It is also, as of Phase 2 Task 11's fix
round, a state a reader reaches only by typing the address — an exhausted or expired
challenge is now described rather than replaced by it (see §8 and
`docs/qa/2026-09-07-sign-in-sweep.md`).

**INP has no Lighthouse lab equivalent** — it is a field metric — so `CLAUDE.md` §6's
≤200ms is not asserted by any of the three configs, here or on the diary. What the lab can
say is total blocking time, which measured **20ms** on all three admin routes. Stated here
rather than left to be assumed from a green run.

**The two diary configs, last measured at Phase 1's final review** — one
`npm run test:perf` inside `mcr.microsoft.com/playwright:v1.62.1-noble`, each config
building the app itself first. Both green then, and both green now; the paragraph below the
next table records the one time between those two points that `lighthouserc.book.json` was
not, and what it turned out to be:

| Route (config) | Metric | Median of 5 | Gate | Margin |
|---|---|---|---|---|
| `/p/1` book (`.book.json`) | LCP | **2,934.53ms** | 3000 | 65.47ms |
| `/p/1` book | script | 142,834 B | 184,320 | 41,486 B |
| `/p/1` mobile (`.json`) | LCP | **2,925.59ms** | 3000 | 74.41ms |
| `/p/1` mobile | script | 144,835 B | 184,320 | 39,485 B |
| `/gallery/patagonia` | LCP | 3,532.70ms | 4000 | 467.30ms |
| `/gallery/patagonia` | script | 141,711 B | 184,320 | 42,609 B |
| `/gallery/patagonia` | image | 477,329 B | 600,000 | 122,671 B |
| `/cms` | — | — | CLS and status only | — |

CLS was **0** on all twenty runs and `http-status-code` scored **1** on every one. The
five book runs read 2,932.28 / 2,934.41 / **2,934.53** / 2,935.14 / 2,956.60ms; the five
mobile runs 2,404.94 / 2,405.08 / **2,925.59** / 2,935.49 / 2,951.89ms — two runs of that
set landing half a second below the rest is the spread the `median` aggregation exists to
absorb, and is why `optimistic` (lhci's default, which takes the minimum) would have
reported this route at 2,404.94ms and called 500ms of headroom that does not exist.
`/cms` measured 4,880.39ms of LCP and 647,142 script bytes, neither of them gated, for
the reason its row above gives.

**The admin gate, measured for the first time in Phase 2 Task 11** — on this Windows host
against a production `next build` + `next start`, five runs per URL. Run twice; the second
run's medians are in brackets, and the gate passed both times:

| Route (`lighthouserc.admin.json`) | Metric | Median of 5 | Gate | Margin |
|---|---|---|---|---|
| `/admin/sign-in` | LCP | **2,928.4ms** (2,927.9) | 3000 | 71.6ms |
| `/admin/sign-in` | script | 140,641 B (identical) | 327,680 | 187,039 B |
| `/admin/sign-in/code` | LCP | **2,928.4ms** (2,927.0) | 3000 | 71.6ms |
| `/admin/sign-in/code` | script | 141,323 B (identical) | 327,680 | 186,357 B |
| `/admin/reset` | LCP | **2,926.9ms** (2,928.0) | 3000 | 73.1ms |
| `/admin/reset` | script | 140,489 B (identical) | 327,680 | 187,191 B |

CLS was **0.0000** on all thirty runs and `http-status-code` scored 1 on every one. Total
blocking time was 19–21ms throughout. The LCP spread is tight — across both runs the slowest
of the thirty is 2,941ms and the fastest 2,924ms — which is the framework floor ADR 0008
measured (2,023.2ms for one styled heading with no application code) plus three panes that
fetch nothing.

### `/p/1` went red in Phase 2, and the wrong explanation was reached for first

**This is the most instructive thing in this section, so it is written down in full.**
Phase 2 Task 11 reported `lighthouserc.book.json`'s `/p/1` at **3,082.6ms and 3,080.2ms**
across two `npm run test:perf` runs, against its unchanged 3,000ms budget — and attributed
it to the bimodality ADR 0008 named and ADR 0014 characterised. The evidence offered was
that the gate measured red at `d61ab9e` with the task's own changes stashed, and again on a
deleted `.next` (3,079.7ms and 3,077.3ms).

**That baseline could not answer the question it was asked.** `d61ab9e` is on the same
branch. A baseline separates "did we cause it" from "is the host slow tonight" only if it
sits on the other side of the change. The one that does:

```
main   0bac9bd   2,924.3ms median   exit 0   GREEN
branch fdff259   3,078.3ms median   exit 1   RED
```

Same host, same committed config, minutes apart, both on a deleted `.next`. The
distributions do not overlap — main's slowest run is 8ms below the branch's fastest — so it
was never the bimodal split. It was a Phase 2 regression, and ADR 0014's closing bullet
forbids the explanation that was used without measuring `main` first.

**The cause was a shared CSS module, and it was read out of the build rather than reasoned
about.** `/p/1` was serving four render-blocking stylesheets where `main` serves two,
because `app/(admin)/layout.tsx` imported `../(diary)/fonts` and `app/(admin)/admin.css`
`@import`s the same `tokens.css` `diary.css` does. A module reachable from two route entries
cannot be merged into either entry's stylesheet, so each became a chunk the diary had to
fetch. The full isolation — one variable per build — and the decision are
`docs/adr/0019-the-admin-performance-gate-and-the-css-seam.md`.

Fixed by giving `(admin)` its own font declarations. `/p/1` measures **2,926.1ms and
2,925.8ms** across two runs, within 1.8ms of `main`. **The budget was never moved.**

**How to check this one first, next time:** count the `<link rel="stylesheet">` elements a
production `/p/1` serves before looking at the LCP number. **Three is the shape** — the
shared token chunk (2,467 B), `diary.css` merged with the diary's own `@font-face` rules
(3,338 B), and the diary's CSS modules (28,599 B). A **fourth** means something new is
shared across the route-group seam; two would mean the token crossing had been closed, which
nothing has decided to do. `docs/adr/0019-the-admin-performance-gate-and-the-css-seam.md`
names all three and why the first of them is deliberate.

### `test:perf` stopped being a `&&` chain, because the chain hid the new gate

It ran `lhci autorun && lhci autorun && lhci autorun`. `&&` short-circuits, so while the
book gate was red the admin gate — third in the chain, added in the same task — **never
executed once under its own command**; the numbers in the table above exist only because the
config was invoked directly. A gate that cannot report because an earlier gate failed is a
gate nobody sees, and it fails silently: the command exits 1, CI shows one red step, and
nothing says two budgets went unmeasured.

`npm run test:perf` is now `node scripts/run-lighthouse.mjs <config> <config> <config>`,
which runs every configuration it is named whatever the ones before it did, prints a
`PASS`/`FAIL` line per config, and exits non-zero if any failed. The configs stay **named in
`package.json` rather than discovered by the runner**: `e2e/ciRegistration.test.ts` guards
against a config file that exists and is run by nothing, and it does that by checking that
the script names each one — a runner that globbed them would satisfy that guard by
construction and stop guarding anything.

**A second, independent measurement of the same budget**, because the two count differently
and the difference is worth writing down rather than rediscovering. Lighthouse's
`resource-summary:script:size` is the transfer size of the scripts the page actually fetched.
Task 7's review measured the admin's route JS a different way — every script the built
document requests, gzipped individually and summed — and got **175,552 bytes (171KB)**.
Repeating Task 7's method now, against the same production build, on each of the four
sign-in addresses:

```
/admin/sign-in         : 8 scripts, 176,423 bytes gzipped = 172.3 KB
/admin/sign-in/code    : 8 scripts, 177,105 bytes gzipped = 173.0 KB
/admin/reset           : 8 scripts, 176,271 bytes gzipped = 172.1 KB
/admin/reset/<40 hex>  : 8 scripts, 176,211 bytes gzipped = 172.1 KB
```

So Task 7's figure still holds: three more screens and the whole route layer have landed
since, and `/admin/sign-in` has grown by 871 bytes. Both methods sit far inside 320KB, and
the gate asserts the Lighthouse one because that is what the diary's two configs already
assert — a gate that measures the same budget two ways is two gates that can disagree.

**Why 3000 and not 2500.** `CLAUDE.md` §6's LCP budget was 2,500ms from Phase 0 until
Phase 1 Task 13. `docs/adr/0008-lcp-budget-and-the-framework-floor.md` measured what this
route costs with no application code at all — 2,023.2ms and 137,986 bytes of React and
Next App Router runtime for one styled heading — which is 81% of the old budget before
this repository writes a line, and the budget was set to **3.0s** from that measured
floor. `docs/adr/0014-the-viewport-the-diary-lcp-gate-is-measured-at.md` then fixed
*where* it is measured: the book at 1350x940 with the surface cookie pinned, the mobile
surface at Lighthouse's own phone emulation, both on the same `simulate` throttling
(150ms RTT, 1,638Kbps, 4x CPU). The raise itself is recorded as a departure from the
plan in `docs/deviations.md` §23 — Task 13 Step 5 said not to raise it — and the gate
was reported red and unraised for several rounds before it moved.

#### 7.1 · The record

- **Tool:** Lighthouse CI (`@lhci/cli`, `lighthouserc.json` and `lighthouserc.book.json`)
  + custom probes (the custom probes — 60fps flip measurement, N+1 query detection — are
  still not yet implemented; they need the flip and data-fetching code these budgets
  describe).
- **Scope:** the hard budgets in `CLAUDE.md` §6 — 60fps flip (only `transform`/`opacity`
  animated), diary route JS ≤180KB gzipped, admin ≤320KB, LCP **≤3.0s** (ADR 0008 for
  the number, ADR 0014 for the two viewports it is measured at), CLS ≤0.1, INP
  ≤200ms, no N+1 queries, always a derivative tier never an original.
- **Status — hard-gated in CI as of Task 1 of Phase 1, ahead of the route it guards.**
  `lighthouserc.json` now points `collect.url` at `http://localhost:3000/p/1` (the diary
  route Task 13 creates) and `http://localhost:3000/cms`, with per-URL budgets via
  `assert.assertMatrix` rather than one shared `assert.assertions` block: `/p/1` is held
  to `http-status-code` (`minScore: 1`), `resource-summary:script:size`
  (≤184320 bytes), `largest-contentful-paint` (≤2500ms **as landed in Task 1 — the
  budget is 3000ms today, see §7.0**) and `cumulative-layout-shift` (≤0.1); `/cms` is
  held to `http-status-code` and `cumulative-layout-shift` only.

  **Task 14 added a third URL and a fourth budget.** `/gallery/patagonia` is collected
  and asserted in its own `assertMatrix` entry. The gallery route is OUTSIDE the diary's
  LCP budget - `CLAUDE.md` §6 scopes that to `/p/1` - and that is exactly why it needs a
  gate of its own: it is a long scroll of photographs on a route no existing budget
  watches, which is the easiest place in this product for weight to accumulate
  unnoticed. Measured on a production build, median of five: **LCP 3,462.4ms**
  (3,089 / 3,391 / 3,462 / 3,463 / 3,500), **script 141,551 bytes** (856 fewer than the
  diary's own 142,407 - the gallery ships no book, no flip machine and no page faces),
  **images 173,579 bytes in 9 requests**, CLS 0. Its budgets are set from those numbers:
  `largest-contentful-paint` ≤4000ms (~15% over the median, and 500ms clear of the worst
  of the five), `resource-summary:script:size` ≤184320 (the SAME number the diary route
  carries, so drift is read against one bar rather than two),
  `cumulative-layout-shift` ≤0.1, and `http-status-code`.

  **The image budget is the one that earns its place.** `resource-summary:image:size`
  catches the specific regression this route is exposed to: nine of the tiles are
  fetched today because every one carries `loading="lazy"`, and if that attribute is
  ever dropped the route fetches every tile in the gallery while every functional test
  still passes. `e2e/gallery.spec.ts` asserts the ATTRIBUTE; only this budget asserts
  the EFFECT. `CLAUDE.md` §6 scopes the diary LCP budget (2500ms at the time of writing;
  3000ms today, §7.0) to the diary route specifically —
  holding Payload's heavy admin bundle to it was the original reason this whole step
  was informational, and giving `/cms` its own entry with no LCP assertion is what
  stops that recurring now that `/cms` shares a config with a real route.
  `.github/workflows/ci.yml`'s `browser` job no longer runs this step with
  `continue-on-error` (see below).

  **Update, `docs/adr/0013-gallery-image-budget.md`.** The figures above are Task 14's
  original measurement, on the pre-PH1-002 gallery (61 tiles, one of them the Notes
  page's ephemera scrap) and the pre-PH1-003 tile choice (every device handed the same
  400px `thumb` regardless of viewport or density). Both changed on this branch: PH1-002
  removed the ephemera scrap from every gallery's frame list (Patagonia is 60 tiles, not
  61), and PH1-003 made a tile offer a `srcset` and let the browser choose, rather than
  the server guessing one derivative for every device. The second fix is why the number
  moved: at a one-column phone viewport the correct choice is the 800px `tile`
  derivative, not the 400px `thumb`, so the same nine lazy-loaded requests now cost
  477,329 bytes instead of 173,579. `resource-summary:image:size` is now `600000`, not
  400,000 and not 477,329 — ADR 0013 records why the limit sits above the current
  measurement (the seeded placeholders understate a real photograph's bytes) rather than
  at it, and pins the regression this gate exists to catch: with `loading="lazy"`
  disabled, the same route fetched all 60 tiles for **4,600,585 bytes** — 7.67× the new
  limit, so the detector still fires with room to spare.
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
  52KiB unused across that chunk and the 43KB one beside it.

  **"The lever is script weight on this route" was this entry's original conclusion, and
  it was wrong.** It has since been tried twice and measured twice.
  `docs/adr/0007-server-rendered-page-faces.md` removed 11,465 bytes of page components
  from the client chunk and moved LCP by 0.3ms.
  `docs/adr/0008-lcp-budget-and-the-framework-floor.md` then measured what the route
  costs with NO application code at all: a minimal server component rendering one styled
  heading, in this same app, with no font, stylesheet, image or client component, still
  downloads **137,986 bytes of JavaScript over six chunks** and models an LCP of
  **2,023.2ms** with a 1,571.8ms render delay — 81% of the 2,500ms budget, before this
  repository writes a line. A plain static `.html` file with the same heading, served by
  the same server, measures 900.8ms. The 72KB chunk this entry blames is React DOM plus
  the Next App Router client runtime, and it loads on every route in this application
  whether or not anything on it is interactive; the diary's OWN chunk is 3,646 bytes,
  2.57% of the route's script transfer, with no attributable bootup time at all. Script
  weight is not a lever this repository holds. ADR 0008 sets out what is left — accept a
  budget chosen from the measured floor, measure against a different Lighthouse preset,
  or accept that this stack cannot meet 2.5s — and leaves the choice to the repository
  owner. **The gate has not been raised, downgraded or removed, and is currently red.**

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
- **The diary budget is pinned to the BOOK surface, and since ADR 0014 it is measured at
  a viewport that is actually served the book** (Phase 1 Task 15, revised).
  `lighthouserc.book.json` sends `Cookie: td-reading-surface=book` — that line is
  load-bearing, because below 860px `/p/1` serves `SCREENS.md` §1.10's mobile reading
  mode instead of the book
  (`docs/adr/0011-two-reading-surfaces-chosen-on-the-server.md`), and without the pin the
  gate silently stopped measuring the book. **It is not enough on its own.** The same
  file emulates a 1350x940 desktop viewport, because Lighthouse injects `extraHeaders` at
  the network layer where `document.cookie` cannot see them: on a 412px emulated phone
  `SurfaceCorrection` measured the viewport, disagreed with the served book, and called
  `router.refresh()` on **every** run, so the gate was measuring the mobile surface
  preceded by a discarded book render. See
  `docs/adr/0014-the-viewport-the-diary-lcp-gate-is-measured-at.md` for the twenty-run
  distribution that showed it, and for why the throttling (150ms RTT, 1,638Kbps, 4x CPU,
  `simulate`) is identical in both files. **The step was RED as of Task 15** —
  3,011.36ms against 3,000 — caused by the mobile surface's client half sitting in the
  book's own chunk group, which Turbopack would not split per import. It was reported red
  rather than raised, and the cookie was NOT removed, because removing it would have
  turned the gate green by changing what it measured rather than by making anything
  faster. **It went GREEN at the two-route split** — 2,932.66ms with 67.34ms of margin
  (`docs/adr/0012-two-route-entries-for-two-reading-surfaces.md`) — and it is green and
  **stable** now: three consecutive `npm run test:perf` invocations, each with its own
  build, gave book medians of **2,930.5 / 2,931.1 / 2,927.8ms**, fifteen runs spanning
  2,926.0-2,937.8ms.
- **`npm run test:perf` runs TWO lhci configurations, and both are gates.** Collect
  settings in lhci are per-run, not per-URL, so the diary's desktop viewport cannot share
  a run with the gallery's: at 1350x940 `/gallery/<slug>` picks larger derivatives and
  fetches 1,229,466 bytes of image against its 600,000 budget (ADR 0013), which would
  re-base a budget this change has no business touching. So `lighthouserc.json` collects
  `/p/1`, `/gallery/patagonia` and `/cms` on Lighthouse's phone emulation with no pinned
  cookie, and `lighthouserc.book.json` collects `/p/1` alone on the desktop viewport with
  the cookie. Both keep `numberOfRuns: 5` and `aggregationMethod: "median"`. If you add a
  route, add it to the first file unless it needs a viewport the first file cannot give
  it.
- **The mobile reading surface is gated too, since ADR 0014.** Dropping
  `collect.settings.extraHeaders` from `lighthouserc.json` means its `/p/1` entry now
  measures what a phone is actually served: 144,835 script bytes against the 184,320
  budget, LCP 2,926.8ms against 3,000, CLS 0, over fifteen runs spanning
  2,924.8-2,933.4ms. ADR 0011 said the mobile surface "cannot become the binding
  constraint while the book is gated; if that ever stops being true, measure it rather
  than assume it". It is now measured, on every run — and it is 3.7ms lighter than the
  book, not half its cost, because both are dominated by ADR 0008's framework floor and
  the five font faces rather than by their own markup.
- **A correction that was recorded as harmless was not, and this paragraph replaces the
  claim.** Until ADR 0014 this section said the mismatched-surface refresh downloaded the
  mobile entry's chunk and stylesheet "AFTER LCP … LCP is unaffected — the correction
  happens after it". It was a race, not an ordering. When the book's paint won, `/p/1`
  measured 2,932ms; when the refresh won, the book never painted at all, the first paint
  was the mobile Cover's title at 271-1,110ms observed, the five font faces landed in the
  first-paint graph (simulated FCP 910 -> 1,581ms), and LCP measured 3,016ms or — when
  Lantern additionally pinned it to the end of hydration — 3,167ms. Machine state decided
  which. The gated script figure of 149,658 was the same artefact; the book surface's own
  transfer, which the gate now measures directly, is **142,828**.
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
- **Status:** partly implemented. The OTP half of it exists as of Phase 2 Task 3:
  `apps/web/lib/auth/otpService.integration.test.ts` is nineteen cases against a real
  Payload and a real Postgres, one per `SECURITY.md` bullet under the first prototype
  hole plus the resend limits — the code is never returned, never logged and never
  stored in the clear; a code issued for one session is refused in another; a correct
  code works exactly once; a third wrong guess kills the challenge even for the correct
  code; expiry is derived from `createdAt` rather than the stored `expiresAt`; the
  comparison is `crypto.timingSafeEqual`; and the code is drawn from `crypto.randomInt`.
  Each of those was verified by **mutation** — deliberate breakages, each failing exactly
  the case that names it and no other (the runs are pasted in that task's report).

  **Three of those cases are `Promise.all` bursts, and they are the ones that found a
  real hole.** A limit that holds one request at a time can be nothing at all: the first
  version of the service read the attempt count, spent ~30ms hashing, and wrote the count
  back, so twelve parallel guesses were all evaluated against a three-attempt budget, two
  parallel correct codes both redeemed one challenge, and ten parallel requests all
  mailed a code past an hourly ceiling of five. Every sequential test passed throughout.
  The rule this leaves behind: **any limit expressed as read-check-write gets a parallel
  test, and that test is confirmed to fail before the fix.** All three failed first, and
  each is now pinned to the mechanism that fixes it — a conditional `UPDATE` for the
  attempt and for consumption, a per-account advisory lock for the count-and-insert.

  **Rate limiting and lockout land in Phase 2 Task 4, and they are two files.**
  `apps/web/lib/auth/rateLimit.integration.test.ts` is ten cases over the sliding window
  `SECURITY.md` requires per account and per IP, and the two that carry it are real
  `Promise.all` bursts proving each dimension **independently**: twenty-eight concurrent
  attempts from ONE address against TWENTY-EIGHT accounts admit exactly twenty (so
  nothing but the address can be refusing them), and eighteen concurrent attempts against
  ONE account from EIGHTEEN addresses admit exactly ten (so nothing but the account can
  be). Limiting only one dimension is the common mistake and it is invisible from a
  single-dimension test — per-account alone lets a botnet spray, per-IP alone lets one
  host grind a single account behind rotating proxies. Verified by mutation: removing the
  per-address condition fails the address burst and NOT the account burst, and removing
  the per-account condition fails the account cases and NOT the address burst. Removing
  the rank ordering — so attempts standing *after* this one are counted against it — was
  caught by the bursts in only three runs out of four, because whether a racer's row
  exists yet at the moment another request ranks is a matter of scheduling. A guard caught
  three times in four is a guard that passes CI the fourth time, so the file also carries
  a **deterministic** case for it: a key seeded with rows written at explicit ids above
  the sequence — inside the window, stamped earlier, but ranking after the attempt that
  follows them, which is what a racer's row looks like without the race — and the
  assertion that the attempt is still admitted. That case fails on every run when the
  bound is removed (five out of five, measured).

  **The session layer lands in Phase 2 Task 6, before the sign-in screens that will use
  it,** because sign-in must issue a session and cannot issue what does not exist.
  `apps/web/lib/auth/sessions.integration.test.ts` is twenty-five cases, shaped around
  the two ways a test in this area passes while the mechanism is gone:

  - **A rotation test that only asserts "a new identifier exists" passes while the old
    one still authenticates.** So every rotation case asserts the OLD identifier is
    refused, and names the refusal. Verified by mutation: returning the identifier the
    browser arrived with instead of minting one fails three cases and no others, and
    binding the supersede clause to `NULL` — so rotation revokes nothing — fails exactly
    the case named "stops the previous identifier authenticating the moment a new one is
    issued".
  - **A revocation test that checks a field was set passes while nothing reads that
    field.** So no case asserts on `revokedAt`. Each one revokes and then attempts to
    authenticate. Verified by mutation: deleting the line that acts on the domain's
    verdict fails six cases across revocation, expiry and rotation.

  "Keep me signed in" is asserted from three sides, because "the session lasts longer" is
  satisfied by the wrong implementation — a longer-lived token — as readily as by the
  right one: the stored `expires_at` column holds the long lifetime, the identifier is
  byte-identical in shape between a remembered and an ordinary sign-in, and a remembered
  row aged past its expiry stops authenticating while its untouched thirty-day cookie
  still says thirty days.

  Revocation is exercised through the Account screen's own route as well as through the
  module — a Payload `update` by the signed-in reader under their own per-user access —
  so the two paths are proven to meet on the same row rather than assumed to.

  `apps/web/collections/sessions.access.integration.test.ts` is the collection's half,
  and **every case in it is cross-account**: two accounts, each with a session, asserting
  what one can do to the other's row. That is not thoroughness, it is the only shape that
  can see the defect the file was written for - `sessions` declared no access block at
  all, so Payload's `defaultAccess` applied and every operation was granted to "signed
  in" (`docs/deviations.md` §29). A suite with one account would have passed throughout.
  Verified by mutation: removing the block fails five cases.

  **THE PER-FIELD SWEEP IS THE PART TO CARRY INTO PHASE 4**, and it exists because the
  first version of that file was still not enough. It enumerated OPERATIONS - read,
  create, update, delete - and two holes came straight through it, each a field inside an
  operation that is correctly permitted: an owner could re-point `user` at another account
  and authenticate as them, and could write `revokedAt` back to `null` and un-revoke
  themselves. **The unit of authorization on a Payload collection is the field, not the
  operation.**

  So the file now carries one case that attempts an update on **every field the collection
  declares**, with the field list read off `Sessions.fields` rather than written out, and
  the row snapshotted with `SELECT *` rather than a named column list. Both halves matter:
  a field added tomorrow is probed the day it lands, and a column a future field adds is
  compared without anybody remembering to add it. On its **first run** the sweep failed on
  a field neither the reviewer nor the author had enumerated - `createdAt`, which Payload
  injects into a collection's field list when it sanitises it, and which an injected field
  carries no access rule for. That is the argument for the shape, in one measurement.

  Verified by mutation, field by field: removing any one field's `update` refusal fails
  the sweep, and for `user`, `revokedAt`, `tokenHash` and `expiresAt` it fails the named
  case beside it as well. `updatedAt` is the one exception and is recorded as such at the
  line itself - Payload stamps that column after access runs, so no test can distinguish -
  rather than left for a later reader to assume it was proven.

  One fixture lesson came out of that matrix and is worth repeating: the file's cleanup
  used to find its rows by the `device` marker, which the sweep itself overwrites. Under
  one mutation a row survived carrying a probe value, deleting its account then hit
  `sessions.user_id`'s `NOT NULL` against an `ON DELETE set null` foreign key, and the
  **whole file was skipped** on the next run with a not-null violation several cases away
  from the cause. Cleanup now matches by owner. See `docs/data-model.md` for the
  constraint itself.

  A second case covers what bounds the table: a write against one key must sweep aged rows
  belonging to **other** keys. Pruning only the key being written bounds growth by the
  number of distinct keys ever seen rather than by the window, and a spray from many
  addresses is exactly what manufactures keys — three aged rows for one address were
  measured surviving a write against another before the sweep was added.

  `apps/web/collections/users.lockout.integration.test.ts` is the other file, and it
  exercises Payload's `maxLoginAttempts`/`lockTime` for the first time since Phase 0
  declared them. Its load-bearing case is **the correct password being refused**: a case
  that only checked wrong passwords still failing would pass with the lockout entirely
  absent. Writing it found a real defect — Payload takes `lockTime` in milliseconds while
  taking `tokenExpiration`, on the same object, in seconds, so `15 * 60` had been asking
  for a 900-millisecond cooling-off period since Phase 0. Nothing behavioural
  distinguished it, which is why only a case asserting the lock's DURATION could catch
  it (`docs/adr/0016-rate-limit-window-storage.md`).

  **Phase 2 Task 9 adds the journey that ties the reset path together**, in
  `apps/web/lib/auth/setNewPassword.integration.test.ts` (19 cases) and
  `newPasswordScreen.integration.test.ts` (13). The first case of the first file is the
  one that matters: it requests a reset through the real service, **takes the link out of
  the console mailer's outbox rather than out of the database** — exactly as
  `lib/auth/testing/otpProbes.ts`'s `readCodeFromOutbox` takes a code out of one — spends
  it, and then signs in with the password it set. Reading the column instead would pass
  with a link built from the wrong origin, a link built from the wrong path, or no link in
  the body at all; reading the URL a reader would click is what makes it a test of the
  journey rather than of the column.

  Three of its cases exist because the obvious ones are not enough. "The new password
  signs in" would pass for a reset that ADDED a password, so a second case requires the
  old one to stop working. "The second use of a link is refused" would pass for an
  implementation that cleared the account's password on the way to refusing, so a third
  requires the first use's password to still sign in afterwards. And `refusalFrom` is
  exported and exercised directly, because a live Payload reaches only two of its arms — a
  403 for a token it cannot match and a 400 for a password it refuses — while a thrown
  string, a `null` and an object with no status are what a dropped connection or a future
  release would take, and all three must give the answer that cannot mislead.

  `newPasswordScreen.integration.test.ts` drives the route layer with a real `Request` and
  a real `Response`, which is why both of its route files hold nothing but one call each.
  Every redirect is asserted by **status and `Location` together**: a case checking only
  the location passes on a `200` carrying a header nothing follows, and one checking only
  the status passes on a redirect to the wrong screen.

  **Anti-enumeration and the wiring land in Phase 2 Task 5, and it is the task where
  three mechanisms stop being mechanisms.** `apps/web/lib/auth/signIn.integration.test.ts`
  is nineteen cases and `apps/web/lib/auth/passwordReset.integration.test.ts` eight, and
  the four traps they are shaped around are the ones this repository has already been
  caught by:

  - **An anti-enumeration test that compares two error strings passes while the two paths
    differ in timing.** So the identical-response case compares the WHOLE returned value,
    and a second case MEASURES both branches — twenty-five interleaved samples per arm,
    medians compared, asserted inside a deliberately wide 0.6–1.6 band. The timing path
    was taken here rather than the structural one Task 3 fell back to for
    `timingSafeEqual`, and the reason is the size of the signal: there the leak was ~13ns
    behind a ~30ms derivation and could not be measured; here the whole ~40ms derivation
    is what is missing from the miss path, which is an order of magnitude, not a
    fraction. **Measured: 0.90 with the dummy derivation, 0.14 without it.**
  - **A timing case where either arm can drift into a shortcut measures nothing.** Both
    arms would look identical if both were refused by the rate limiter before reaching a
    hash, or if the wrong-password arm had locked its own account and stopped hashing —
    at which point the case passes with the mechanism deleted. So every sample uses a
    fresh requesting address, a fresh sign-in address and a fresh account: no budget and
    no lockout counter is spent twice.
  - **An `otpRequired` test that stubs the flag proves nothing about where it is read.**
    So every case sets it on the ROW and hands `signIn` a request carrying the OPPOSITE
    value as an extra property — what a client trying to force it would look like. A
    `SignInRequest` with no such field is the only thing that makes them pass. Reading it
    from the request instead fails three cases.
  - **A rotation test that asserts "a new session exists" passes while the pre-auth
    identifier still authenticates.** So the rotation case authenticates the OLD
    identifier and expects `'revoked'`. Passing `null` as `previous` fails it and nothing
    else.

  Twelve mutations were run against this task's code and each is recorded in the task
  report with what failed: removing the dummy derivation (the timing case, 0.14), passing
  `null` instead of the browser's identifier (the rotation case), reading `otpRequired`
  from the request (three cases), giving the unknown address its own refusal (two cases),
  giving the LOCKED account its own refusal (one case), removing the limiter call (four),
  treating a NULL `otp_required` as not-required (one), removing normalisation (one), and
  removing the claimed-address dimension from `admitPasswordAttempt` (four in `signIn`'s
  suite and three in `rateLimit`'s), plus three against the reset module.

  Two test-quality lessons came out of that matrix and are worth repeating, because both
  are the same shape — an assertion that is **vacuously true of the mechanism's absence**:

  - The case asserting that an unknown address spends the same windows as a known one
    originally compared the two counts to each other, and **passed under the mutation that
    removed the limiter entirely** — two zeroes are equal. It now asserts both counts are
    ONE.
  - The case asserting that the operator's log line names no address originally checked
    only that the recorded calls contained no address, and **passed while nothing was
    logged at all**. It now asserts the call count first.

  **Review round 1 added a fifth trap, and it is the one with operational teeth.** A bare
  `catch` around Payload's login turned every throw into "wrong password" — so a database
  outage would tell the owner their correct password was wrong and send them to reset it,
  during an incident, with nothing recorded. `checkPassword` now returns three answers
  rather than two, and the suite asserts the distinction in **both** directions: the
  operator is told (and told nothing about who), the reader is told exactly what a wrong
  password tells them, and an ordinary wrong password reports nothing at all. Three more
  mutations, all pasted in the task report: collapsing the classification back to a bare
  catch fails two cases, reporting every refusal fails two others, and letting the outage
  reach the reader as its own refusal fails the case named for it.

  That suite carries the phase's one deliberate test double for a third-party boundary: a
  `Proxy` over the real `Payload` whose `login` rejects. "The credential store cannot
  answer" has no honest inducement — the only real cause is the database being unreachable,
  and taking `diary_test` down mid-run would take every other file with it — so the
  boundary is substituted at the boundary, exactly as `passwordReset.integration.test.ts`
  substitutes a refusing `MailerPort`, and never the module under test (CLAUDE.md §2.3). A
  proxy rather than a spread: spreading a class instance drops its prototype methods, which
  ESLint refuses and TypeScript catches.

  **Fixture addresses: one documentation block per suite, and a counter that cannot leave
  it.** The three sign-in suites clean up by IP prefix, so two sharing a block delete each
  other's rows — harmless only because `fileParallelism` is off. They now hold TEST-NET-1
  (`signIn`), TEST-NET-2 (`rateLimit`) and TEST-NET-3 (`passwordReset`). Each also counts
  IPs on a counter of its own that throws past 254 rather than wrapping: `rateLimit`'s
  addresses and accounts shared one counter that reaches about 260 over a full run, so its
  last fixtures were `198.51.100.255` and beyond — unique strings that are not addresses.
  Nothing failed, because `subject` is text; the fixtures had simply stopped being what
  they claimed to be.

  What is still outstanding is the upload worker's SVG and EXIF probes (Phase 3).
- **Run (once added):** included in `npm run test:integration` (these probes need a real
  database and, for the upload cases, the worker), so they run under `verify:full`.
- **Add one (once added):** each row of `docs/security.md` that names a behaviour (not
  just a schema field) gets a negative-case test: e.g. a 4th OTP attempt is rejected, an
  SVG upload is rejected by magic bytes even with a `.jpg` extension, an EXIF-bearing
  upload has no EXIF after processing, enumeration timing is equal for a real and a fake
  account.

#### The HTTP boundary (Phase 2 Task 10), which is where the guard, the CSRF refusal and the CSP are proved

Four new suites, and what decides where each case lives is whether its claim is about a
database.

- **`apps/web/lib/auth/adminAccess.test.ts`, `browserSession.test.ts`, `httpForm.test.ts`
  (unit).** Pure: a path, a method, two origins, a `Cookie` header, a `Request`. All three
  are gated at **100/100/100 by name** in `vitest.config.ts` rather than left under
  `apps/web/lib/**`'s 95%, because each is imported by `apps/web/middleware.ts` and
  therefore runs in the Edge runtime, where a mistake is caught by nothing else.

  The cases worth knowing about are the negative ones. `isCrossSiteMutation` has a case
  named for an **absent** `Origin`, because a check written as `origin !== target` refuses
  `null` by luck rather than by decision, and a later "for robustness" guard would silently
  invert it. `isGuardedAdminPath` has a case for **an address nobody wrote down**, which is
  what makes it a policy rather than a list. `readBrowserSession` has a case for
  `not-td-session=stolen`, which a scan by `indexOf` would read as the reader's session.

- **`apps/web/lib/auth/adminGuardRegistration.test.ts` (unit).** The structural guard: it
  reads every `page.tsx` and `route.ts` under `app/(admin)/admin` off the filesystem, turns
  each into the address Next serves it at, and requires each to be declared public or to
  name the guard — directly or through the one `lib/auth` module it re-exports its handler
  from. **Its first case is a sentinel**: the walk must have found `/admin/sign-in`,
  `/admin/sign-in/done`, `/admin/sign-out` and `/admin/reset/[token]` by name, because a
  scan that walked the wrong directory would find nothing and pass with every screen
  unguarded — the decorative shape CLAUDE.md §10 names. A second sentinel requires at least
  one guarded address to exist, so the main case cannot pass vacuously in a repository
  where everything had been declared public.

- **`apps/web/lib/auth/guard.integration.test.ts`.** Whether an identifier names a live row
  is a fact about the `sessions` table. Four refusals — no cookie, an identifier naming no
  row, a revoked row, an aged-out row — and the two rotation cases the task brief names:
  the pre-auth identifier authenticates nothing before a sign-in, and **still**
  authenticates nothing after it while the new one does. That second case is the one an
  implementation which adopts the identifier it was handed cannot pass; "a session exists
  afterwards" is not.

- **`apps/web/lib/auth/signInEndpoints.integration.test.ts` and
  `resetRequestEndpoint.integration.test.ts`.** Real `Request`s, a real Payload, and the
  handlers calling `getPayload()` themselves — the same pairing
  `newPasswordScreen.integration.test.ts` makes. Both are gated at **100/100/100** in
  `vitest.integration.config.ts`.

  **The indistinguishable-refusal cases compare the whole response.** `responseShape` reads
  the status, EVERY header and the body, and the three arms are compared with one `toEqual`
  rather than three assertions that happen to agree today — a comparison of the status and
  the `Location` alone would pass for a handler that set a `Set-Cookie` on one arm and not
  the other. The one value that legitimately differs, the freshly minted identifier, is
  replaced by a fixed word rather than dropped, so the cookie's name, its every attribute
  and its **presence** are all still compared. The timing case measures the HANDLER over 25
  interleaved samples per arm, because the handler is what an attacker can reach; the band
  is the same deliberately wide 0.6–1.6 `signIn.integration.test.ts` uses, and every sample
  is fresh in every dimension so that neither arm can be pushed onto the short path.

  **The code step's challenges are issued by the test's own OTP service**, bound to the
  same browser identifier the handler will read out of the cookie. That is not a shortcut
  around the handler — the handler's own mailer prints to a terminal, so it is the only way
  to know the six digits — and what the handler is then asked is the real question: does
  this code, for this browser, produce a rotated session.

  **The reset endpoint's identical-answer case uses two addresses that mask to the same
  string** (same first two characters, same domain), so the whole response is comparable
  rather than only its shape, and then asserts that the one thing which DID differ is
  invisible from outside: only the real address has a reset token.

- **`apps/web/middleware.test.ts`** gained eleven cases for the admin, and the ones that
  matter are again negative: the diary's `/p/<n>` response, its `/m/<n>` rewrite and the 308
  off the internal path are each asserted to carry **none** of the admin's headers, one
  header at a time, and to be handed no minted cookie. Adding either would be a behaviour
  change to thirty-three pages this task does not own.

#### Fix round 1: the suite was testing a request shape no browser makes

Every route case in round 0 — unit, integration and browser — SET the `origin` header
itself. `e2e/reset.spec.ts` did it under a comment calling it "what a browser form would
have sent". It was not. Under the `Referrer-Policy: no-referrer` the admin then carried, a
form-navigation `POST` sends `Origin: null`, and the cross-site check refused it: **every
form on the surface answered `403` in a real browser**, with 1,283 unit tests, 314
integration tests, twenty-one mutations and a green browser suite agreeing it worked.

**A second defect of the same shape was underneath it.** `SCREENS.md` §3.2's pane posts six
fields all named `code`. The handler read them through `Object.fromEntries`, which keeps one
value per name, so it compared a single character against a six-digit code. The integration
suite sent a single `code` field and agreed with the handler.

Neither is an untested mechanism. Both are mechanisms **tested against a fiction**, and the
rules that come out of it are:

- **No browser test sets a request header.** `e2e/signInJourney.spec.ts` fills in the real
  forms and presses the real buttons, through the second factor and out the other side; the
  only `page.request` call left in the repository is the one case that exists to assert a
  headerless post is refused with `403`. Reverting `Referrer-Policy` fails five cases across
  that file and `e2e/reset.spec.ts`.
- **A fixture builds the request the same way the product does.**
  `signInEndpoints.integration.test.ts`'s `aPost` now appends one `code` field per digit,
  because that is what the pane sends.
- **The one thing a browser genuinely cannot do is named, not worked around.** The six
  digits live in the server's own mailer outbox and the stored hash is scrypt, so
  `e2e/support/adminSession.ts` issues a second challenge through this repository's own
  `otpService` and reads it from an outbox the test process owns — which is exactly what
  "Send a new code" does. Everything either side of that step is the reader's own.

**The helper checks its own work.** `aSignedInSession` asks the same `authenticate` the
guard asks before handing a session back. Without it, a fixture that failed presented as a
guarded screen quietly redirecting and an assertion failing on a missing element — which is
how one flaky container run read before the cause (three viewport projects sharing one
fixture account, one project's `afterAll` deleting it under another) was found. Every
caller now names its own account and deletes only that one.

**`e2e/tsconfig.json` includes the app's `lib`, `collections`, `globals`, `migrations`,
`scripts` and `payload.config.ts`**, because that helper calls this repository's own
services rather than duplicating what they store. TypeScript projects must list every
transitive file; it is scoped to those directories rather than all of `apps/web` so no React
route is typechecked under a config with no JSX settings.

#### Fix round 2: three fixture defects, and a baseline that was a picture of a transient state

**"Exit 0, no flakes" was read off one run.** Three container runs after round 1 were
clean / 2 flaky / 1 flaky, green only because CI retries once. A summary with a `flaky`
count is not a green suite, and one run is not a measurement of an intermittency. Three
runs are the standing check now, and this section is what they found.

- **Fixtures are keyed per WORKER, not per project.** `test.afterAll` fires once per
  worker and `playwright.config.ts` sets `fullyParallel: true`, so one project's tests
  split across workers and each worker's cleanup deleted the account another worker of the
  same project was still signing in as. Round 1 closed cross-*project* sharing and left
  this. `e2e/support/adminSession.ts`'s `fixtureLabel` is the fix, and the same mistake was
  in `signInJourney.spec.ts`'s own four accounts.
- **`aSignedInSession`'s self-check reads stronger than it is**, and that is now written at
  it: it proves the session was live AT MINT TIME. Nothing about a fixture can prove the
  row still exists a second later when the browser presents it. Only making the row nobody
  else's does.
- **Cleanup deletes by predicate, not by id.** A `find`-then-`delete({ id })` is not
  atomic, and a row that vanished between the two arrived as a `NotFound` thrown from
  inside Payload — which is what the flaky runs actually reported.
- **`signInEndpoints`' and `resetRequestEndpoint`'s fixture addresses are unique per RUN.**
  `rateLimit.ts` keys its second window on a HASH of the address, which no `LIKE` cleanup
  can match, so those rows outlive `afterAll` for their fifteen minutes. Addresses derived
  from a counter that restarts every run were reused, and two or three runs inside a
  quarter of an hour pushed one past the ten-attempt ceiling: a case posting a CORRECT
  password got `?state=refused`, which reads exactly like a broken handler. It was always
  there; adding cases made it reachable sooner.

**The `cms-admin*.png` baselines were regenerated, and the reason is worth reading.**
Payload's own admin shows "create first user" to an EMPTY database and a login form to one
with any account in it. Those baselines were taken against an empty one — and this suite
now creates an account for the signed-in screen's session, so `/cms` was screenshotted in
whichever state another worker had left. Measured: at 390x844 `/cms` is 1246px tall with no
account and exactly 844 with one; at 1000x800 and 1440x900 it is the viewport height either
way, which is why the failure only ever showed at `mobile`.

The fix is that the suite now GUARANTEES the precondition it baselines, in a `beforeAll`,
rather than inheriting it. The new state is also the durable one: from the moment this
diary has its author account, every deployed instance shows the login screen, so the old
baselines were a picture of a condition that only holds before anyone signs up. Both images
were opened and compared — same unstyled treatment, only the screen differs — and
`e2e/layout.spec.ts` was green in the run that produced them, per the standing rule.

#### Task 11: the log, and the browser sweep

**`apps/web/lib/auth/logSafety.integration.test.ts`** is the one security assertion that
belongs to no single module: nothing this surface hands to a log carries a secret, a code, a
token or a whole email address (`CLAUDE.md` §7). Every service already asserts its own call
site — `otpService`'s suite that the mailer's terminal line carries no code, `signIn`'s that
the credential-store report names neither address nor password. What none of them can see is
the union, and two things had no assertion at all before this file: **reset tokens** and
**session identifiers**.

It drives one whole journey — unknown address, wrong password, correct password, wrong code,
right code, session started, authenticated and revoked, reset link, credential-store outage —
with both sinks recording: all six levels of `payload.logger`, and the mailer's own
`logLines`. There is no third sink, and that is enforced rather than assumed:
`eslint.config.js` sets `no-console: 'error'` repository-wide with one path-scoped exception,
the console mailer. That is also why this file does not patch `console` — doing so would need
the very override whose absence is the guarantee.

**Every case reads the transcript through a guard that refuses to hand it over unless both
sinks are demonstrably in it.** Six negatives over a string are six assertions that hold
trivially when the string is empty, which is this phase's most-repeated defective test shape.
Break the drive and all six fail, rather than all six passing.

Four mutations, each watched to fail the case named for it:

```
console-mailer prints message.text on the non-development branch  -> code case, reset-token case
signIn.ts appends the address to the credential-store report      -> address case
sessions.ts logs the identifier it has just minted                -> session case
signIn.ts's credential-store report deleted entirely              -> all six, through the guard
```

**The browser sweep** is `docs/qa/2026-09-07-sign-in-sweep.md`: seven addresses at three
viewports plus one driven journey, with `console`, `pageerror`, `requestfailed` and every
response >= 400 attached before every `goto`, and 21 axe analyses with no exclusions and no
violations. It found **four** defects — three, plus a fourth its own review found in the same
family — all on `/admin/sign-in/code`, none visible to any assertion in this repository, and
all four faces of one decision: `otpService` treated a challenge that could no longer be
answered as one that had never existed. The screen therefore drew the no-challenge
placeholder, the placeholder re-anchored both countdowns on every render, the pane's own
"Three wrong codes" message became unreachable while its jsdom case stayed green, and "Send a
new code" — the only move `SECURITY.md` §3 leaves an exhausted reader — mailed nothing and
said nothing.

**Fixed as one class**, per `.claude/skills/fixing-browser-defects/SKILL.md`: six cases
written red first (five in `otpService.integration.test.ts`, one in
`signInEndpoints.integration.test.ts`), the cause fixed in two reads rather than the four
symptoms, and `readCodeScreen.integration.test.ts`'s "falls back to the placeholder once the
guesses are gone" INVERTED — that case had been ratifying the defect, and was the second time
the same case had asserted the wrong thing.

**The sweep found three of the four and stopped one click short of the fourth.** It drove the
resend button, waited out the cooldown, recorded `"Send a new code", disabled false` — and
never pressed it. A sweep that walks up to a control and stops has not tested it.

The sweep driver was a temporary spec, deleted once the report was written;
`e2e/ciRegistration.test.ts` correctly failed while it existed and passes now.

#### `apps/web/lib/auth/securityCitations.test.ts` — the citation column checks itself

`docs/security.md`'s table quotes 113 test case names. Task 11 wrote them and claimed none
was paraphrased; its review found three that were, plus nine more carrying Markdown the
source does not (backticks inside the quotation, restyled quotes), so twelve could not be
found by a reader who searched for them. Every one pointed at a real, correct, covering case
— which is what makes it dangerous rather than obvious: nothing was wrong with the discharge,
only with the citation.

Nobody can hold 113 strings in their head across a rewrite. This unit test reads the document
and every `.ts`/`.tsx` file under `apps/`, `packages/` and `e2e/`, extracts the first
argument of every `it(...)` and `test(...)` it finds, and requires each citation to be one of
those names. It normalises exactly two things, both notation rather than words: the backslash
TypeScript needs before an apostrophe inside a single-quoted literal, and the curly
apostrophe. Nothing else — so a paraphrase of any kind still fails.

**Two things about it were weaker than it read, and were tightened in the same round it was
written.** It matched only curly `“…”` runs, so a citation typed with straight quotes was not
checked at all — and not checked SILENTLY, which is the failure mode it exists to end. And
its corpus was every source file's whole TEXT, so a quotation that appeared only inside a
module header comment resolved, while the case was named "are all real". It now reads both
quote characters and matches against declarations, and it separates citations from quoted
PROSE — the ten fragments in that table which quote the handoff, the UI or a dependency's
message rather than a test — by an explicit list rather than by which quote character
somebody typed. Every entry of that list must still appear in the document and must not be a
declared case name, so an exemption cannot outlive the sentence it exempts or quietly excuse
a real citation.

Non-vacuous five ways: a floor on the number of citations found; a floor on the number of
declarations extracted (the corpus is an extraction now, so a pattern that stopped matching
must say so in one failure rather than 113); a sentinel string required to be ABSENT from the
declarations, so the search is proved able to say no; a case name owned by another file
required to be PRESENT, so an extraction that returned nothing fails here; and the
exemption-list checks above. It excludes its own source from the corpus, which is what keeps
the sentinel meaningful.

Proved able to fail, four ways, each failing the case named for it:

```
a curly citation reworded "not from" -> "rather than"            -> unfindable
a bogus citation typed with STRAIGHT quotes                      -> unfindable (silently ignored before)
a citation that exists only in a module header comment           -> unfindable (resolved before)
the sentence one prose exemption covers, deleted                 -> stale exemption
```

### 9 · Migration

- **Tool:** Vitest.
- **Scope:** every migration runs up, down, and up again against a seeded database.
- **Status:** implemented. `apps/web/migrations/` holds five migrations:
  `20260831_154311_initial` (every collection and global's schema),
  `20260831_161951_add_jobs` (the `jobs` table backing the `queue` port, Task 9),
  `20260905_202028_add_otp_session_hash` (the OTP challenge's session binding, Phase 2
  Task 3 — `docs/deviations.md` §25), `20260905_230601_add_sign_in_attempts` (the
  sliding window's own table, Phase 2 Task 4 — `docs/deviations.md` §27) and
  `20260906_004937_add_session_expiry` (the session row's lifetime and the index an
  authentication reads by, Phase 2 Task 6 — `docs/deviations.md` §30). Each of the four
  later ones has its **own** case in `collections.integration.test.ts` rather than
  sharing one.

  The `session_expiry` case asserts on the column **and** the index, and on the
  `sessions` table surviving — this migration adds to a table it did not create, so a
  `down()` that took the table with it would be a different and much worse kind of
  reversible. Verified by making `down()` a no-op and watching it fail. That migration's
  `up()` is also the first here to be hand-split rather than hand-reordered: as generated
  it was a single `ADD COLUMN ... NOT NULL` with no default, which succeeds only against
  a table with no rows, so `down()`-then-`up()` — the very thing this suite exists to
  assert — would have failed the moment one session existed. Split into add-nullable,
  backfill, `SET NOT NULL`, it holds whatever the table contains. **A generated
  migration passing a reversibility test against an empty table is not the same as a
  reversible migration**; check the `up()` against a populated one before believing it.

  The `sign_in_attempts` case asserts on **all five** artefacts its migration creates —
  the table, its compound index, its two enum types, and the column Payload adds to
  `payload_locked_documents_rels` — rather than on the table alone. A `down()` that
  dropped the table and left the enum types behind would satisfy a table-only assertion
  and then fail its own re-apply with "type already exists", which is exactly the class
  of bug the hand-fixed statement order in that file's `down()` exists to prevent.
  Verified by making `down()` a no-op and watching it fail.

  **All four reversibility cases re-apply in a `finally`,** including the roll-to-zero
  one, which did not until a review pointed out that documenting its blast radius was not
  the same as closing it. Between `runMigrateDownToZero()` and `runMigrateUp()` the
  database has no schema at all, and an assertion failing in that gap used to leave it
  that way: measured, one failing assertion there turned into four failed cases and a
  `diary_test` with no `payload_migrations` table, so every later file in the project ran
  against nothing. With the `finally`, the same failing assertion leaves all four
  migrations applied and the schema intact — measured too. What a `finally` cannot cover
  is a `down()` that leaves artefacts behind, because the re-apply then legitimately fails
  on the collision; **that** case still needs hand repair (drop `sign_in_attempts`, both
  `enum_sign_in_attempts_*` types and the `payload_locked_documents_rels` column, then let
  the next run apply `up()` again), and it is the one to expect when mutating a `down()`
  on purpose.

  The `session_hash` case is also the one worth reading before writing another migration
  test, because its first version was worthless and looked fine. It rolled every
  migration back to zero and asserted the *table* came back — which the INITIAL
  migration's `down()`/`up()` does on its own, so the case passed with this migration's
  `down()` replaced by a no-op. It now rolls back **that migration alone** (through the
  same `up`/`down` functions Payload itself loads, via `readMigrationFiles` — a static
  import would register a second copy of the file and wreck its coverage report, measured
  at 60% branches purely from adding one) and asserts on the **column and its index**,
  which are the only two facts this migration is responsible for. Verified by making
  `down()` a no-op and watching it fail.

  The general rule: assert on what the migration under test actually changes, and
  reverse only that migration. A reversibility test that leans on a wider rollback is
  measuring the wider rollback.
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
