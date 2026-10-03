# Testing

All nine test types from `CLAUDE.md` §2 are required; a feature is not complete until
every applicable row is satisfied (design spec §11). This document covers strategy, how
to run each suite today, and how to add a test of each type. Where a suite's tooling
does not exist in the repository yet, that is stated plainly rather than glossed over —
see the **Status** column.

**Read this file; read a suite's `docs/testing/` detail only when your task touches that
suite.** This was one 291KB document that every dispatched agent read in full whatever it
was working on. The suite numbers are frozen the way `CLAUDE.md`'s sections are — this
tree cites `docs/testing.md` §1, §3, §4, §6, §7, §7.0, §7.1, §9, §10.2 and §10.3 — so those
headings stayed where they were and only the bodies moved. **§10's subsection numbers are
the exception and are not frozen:** the documentation guards gained entries of their own in
the same work, so the old §10.5 (how to run them) is §10.10 now, and §10.5 to §10.8 name
four guards that did not exist before; §10.9 arrived later still, with Phase 4 Task 15e,
and pushed "how to run them" down by one again. The §10.x numbers cited from outside this file are
§10.2 and §10.3, and neither has moved. Which numbers are cited is the fact a renumbering
has to respect; how many places cite each is not, and a count of those places would be one
more thing to keep true.

## Coverage gates

Enforced by TWO configs, because no single Vitest run can execute everything:

- **`vitest.config.ts`**, checked by `npm run test:unit`'s `--coverage` flag (the
  Docker-free pre-commit pass). Covers `packages/*/src/**`, `apps/web/lib/**`,
  `apps/web/scripts/**`, `apps/web/app/**` and `apps/web/components/**`, `.ts` and
  `.tsx` alike.

  | Layer                              | Lines | Branches | Functions |
  | ---------------------------------- | ----- | -------- | --------- |
  | `packages/domain/**` (pure logic)  | 100%  | 100%     | 100%      |
  | `packages/tokens/**` (pure logic)  | 100%  | 100%     | 100%      |
  | `apps/web/lib/**`, server actions  | 95%   | 95%      | 95%       |
  | `apps/web/app/**`                  | 95%   | 95%      | 95%       |
  | `apps/web/components/**`           | 90%   | 90%      | 90%       |
  | `apps/web/scripts/placeholder.ts`  | 100%  | 87.5%    | 100%      |
  | `apps/web/scripts/run-seed.ts`     | 100%  | 100%     | 100%      |
  | `apps/web/scripts/run-rederive.ts` | 100%  | 100%     | 100%      |

  **There is no repository-wide row any more, and its absence is the decision, not an
  omission.** `CLAUDE.md` §2.1 dropped the 90% floor as a requirement in Phase 3: the
  layers that carry real behaviour already have stricter gates above, so the only files a
  repo-wide number could bind are the ones no glob names, and a floor across those buys
  tests that assert Next.js and Payload behave as documented. Removing it from
  `vitest.config.ts` was not a deletion, because every file inside an `include` matching no
  per-glob key would fall through to no gate at all. That set was enumerated against this
  pass's own `coverage/lcov.info` with the same `picomatch` call Vitest's
  `resolveThresholds` makes, and it held exactly the `apps/web/scripts/` files now named in
  the rows above, each at the number it measures rather than one rounded up to meet it.
  `placeholder.ts` sits at 87.5 branches because one `/* c8 ignore next -- … */` hint in it
  spans three comment lines, so "next" names the comment's own second line rather than the
  guard beneath it, and the branch is counted; `run-seed.ts` and `run-rederive.ts` are wholly ignored
  behind their own start/stop pairs, and 100 states that the suppression must stay total. A
  further file landing in `apps/web/scripts/` would be gated by none of these entries, and
  `apps/web/lib/docs/coverageThresholds.test.ts` refuses it: that check re-runs the
  enumeration above on every commit, against the config's own lists, so the next
  fall-through fails the commit that adds it rather than the review that eventually
  notices. Gating each file individually rather than its glob is still
  `coverage.thresholds.perFile`'s job, and is its own decision.

  `packages/tokens/**`'s row arrived with Phase 1's final review, which found it gated by
  nothing but the then-repository-wide 90% floor. It is the same kind of code as
  `packages/domain/**` — three pure modules (`colour.ts`, `geometry.ts`, `type.ts`), no
  I/O, no framework, no React — and it measures 100% on all three metrics today, so the
  threshold is set at what it actually achieves rather than at a number rounded up to
  meet it. `CLAUDE.md` §2.1's rule is that a directory gets "a real threshold"; inheriting
  a floor written for framework glue is not one.

  `apps/web/components/**`'s own row arrived with Phase 1 Task 7, the task that put the
  first real files there (the book's frame, page stack and the two hooks that drive
  them). Until then it deliberately had none: a threshold against an empty directory is a
  vacuous pass, not a gate. It is set at 90 — what was then the repository floor, kept as
  this directory's own number when that floor was removed — rather than `lib`'s and
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
guards (see this task's own report). **When that was written**, `apps/web/app/**` held
only Payload's own six route/layout re-exports under `(payload)/` — no logic of ours, and
nothing any test could execute without a Next.js request context. It holds the diary's
routes and the whole `(admin)` panel now; the paragraphs below are the record of those
six, and the exclusions they describe still name those files by their exact paths and
nothing else:

- Three of the six (`layout.tsx`, `api/graphql/route.ts`, `api/graphql-playground/route.ts`)
  carry a `c8 ignore start`/`stop` around their whole body — imports included, since an
  unimported file's own imports are themselves uncovered lines otherwise. They report as
  fully excluded (no row at all in a passing run).
- The other three — joined in Phase 1 Task 7 by the diary's own
  `(diary)/p/[n]/page.tsx` — sit under a Next.js dynamic-route directory written in
  square brackets (`app/(payload)/api/[...slug]/route.ts`,
  `app/(payload)/cms/[[...segments]]/page.tsx` and
  `app/(payload)/cms/[[...segments]]/not-found.tsx`, each by its exact path, because
  §2.1 requires an exclusion to name the file it excuses rather than the directory) —
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
is gated at **100/100/100**, met by 32 cases in `apps/web/middleware.test.ts` driving a
plain `NextRequest` — a desktop and a phone user agent, both cookie values, a query
carried across the rewrite, and the 308 off `/m/<n>`. That test file needed its own glob
(`apps/web/*.test.ts`) on the `unit` project, because a test file no project's `include`
matches is collected by nobody and its absence is silent.

**Three more sit on that list and this document did not name them** — `CLAUDE.md` §2.1
requires each exclusion to be stated at the point of exclusion **and** here, and Phase 2's
final review found the second half missing (finding 37). Each is under a bracketed
directory, each is wrapped `c8 ignore start`/`stop` and each was read and found to hold no
authored decision of its own:

- `(diary)/gallery/[slug]/page.tsx` — awaits the slug, reads the bundle, renders the
  gallery. Which media a slug names, and whether the slug names a gallery at all, is
  `packages/domain/src/gallery.ts`'s, gated at 100%.
- `(diary)/gallery/[slug]/download/[id]/route.ts` — reads a derivative's bytes through the
  `StoragePort` and answers them as an attachment. What it may serve, and the headers it
  serves them under, are `packages/domain/src/galleryDownload.ts`'s and
  `apps/web/lib/readGalleryDownload.ts`'s — the first gated at 100% here, the second by
  `vitest.integration.config.ts`.
- `(admin)/admin/reset/[token]/page.tsx` — awaits the params and the query, reads the
  shell's content and the link's state, renders two components. WHICH STATE THE SCREEN
  DRAWS is `apps/web/lib/auth/newPasswordScreen.ts`'s and, under it,
  `@travel-diary/domain/auth/resetScreen`'s `newPasswordView` — both gated at 100%.

`(admin)/admin/reset/set/route.ts` is deliberately NOT among them, and is the control that
keeps the carve-out honest: it sits under a static segment, so its own `c8 ignore` is read
and holds. So does `(admin)/admin/page.tsx`, the panel root Phase 2's final round mounted.

**And three files sat in `vitest.integration.config.ts`'s `include` with no threshold at
all** — `readGalleryBundle.ts`, `readGalleryDownload.ts` and `auth/readCodeScreen.ts`. All
three were outside `vitest.config.ts`'s include too, so they were measured by one pass and
gated by neither, which is indistinguishable in a report from being fully covered
(finding 36). There is no repository-wide floor in that config to catch them, deliberately:
it measures a hand-picked set, so a wildcard floor would be a number nobody chose. Each now
carries the figure its own suite ACHIEVES — 100/100/100 for `readCodeScreen.ts`, and
100 lines / 78 and 85 branches for the two gallery readers, whose uncovered branches are
the optional-field folds their headers describe, the same shape `readBookBundle.ts` carries
at 83.

**Those branch figures are below CLAUDE.md §2.1's 95% for `apps/web/lib/**`, and that is a
recorded deviation, not a rounding.** `docs/deviations.md` §46 is the register of every
per-file gate in `vitest.integration.config.ts` that sits under 95 on any axis — the two
gallery readers Phase 2 added, `readBookBundle.ts`, `seed.ts`, `postgres-queue.ts` and
`testPayload.ts` from Phase 1, and Phase 3's `clipToolchain.ts`, `media-fixtures.ts`,
`media-processor-contract.ts` and `rederive-media.ts` — with, for each, why `c8 ignore` is
the wrong instrument and what would reverse it. **The register's table is the count; this
sentence deliberately quotes no total**, because the one it used to quote ("all six") went
stale the moment Phase 3 landed four more (whole-branch review F1). A sub-95 threshold added
to that config gets its §46 row in the same commit. Until Phase 2's third whole-branch
review the shortfall was stated at the point of exclusion and nowhere else, which is §1.1's
bidirectional rule broken.

`apps/web/components/**` was genuinely empty until Phase 1 Task 7 (`.gitkeep` only) and
carried no per-glob threshold override until then — a threshold against zero files is the
vacuous pass CLAUDE.md's controller ruling for Task 1 explicitly forbade adding. Task 7,
which landed the first files there, added the explicit 90%/90%/90% row in the same commit,
per CLAUDE.md §2.1.

An uncovered line outside `packages/domain` requires a
`/* c8 ignore next -- <reason> */` comment with a real reason (`CLAUDE.md` §2.1). Where a
**A GLOB THRESHOLD GATES THE AGGREGATE OF THE FILES IT MATCHES, NOT EACH FILE — so one
wholly untested small file inside a 95%-gated glob is absorbed rather than caught.**
Measured in round 7 rather than reasoned about: an entirely new, entirely untested
`apps/web/scripts/emit-actions.ts` was written to disk and `npm run verify` was **exit 0**
with it present (`Test Files 90 passed`, `Tests 1337 passed`). That is a real gap between
what CLAUDE.md §2 asks for — "every behaviour is tested" — and what the gate enforces, and
it is the same mechanism `vitest.config.ts`'s own comment cites as the reason
`testPayload.ts` needed an explicit exclude: a file only gets noticed when it is big enough
to drag its glob's aggregate down.

**It can be closed, and the instrument is `coverage.thresholds.perFile: true`** — Vitest
applies every threshold per file rather than to the aggregate. It is not closed here, and
the reason is blast radius rather than difficulty: turning it on makes each of the six
per-file branch gates in `docs/deviations.md` §46 a repository-wide requirement at its
glob's number, so the change is "raise or individually re-gate every file under
`apps/web/lib/**`", not a flag. That is a Phase 3 decision with its own commit and its own
measurements, and slipping it into a blocker round would be exactly the untested sweeping
change this branch exists to stop shipping. What holds the line meanwhile is §2.1's
requirement that a new directory arrive with its own `include` entry and a real threshold in
the same commit, plus the per-file entries this repository already writes wherever an
aggregate would hide something.

Where a
whole file is unreachable from any test, the honest options are two, and which one
applies depends on whether some _other_ pass can see it: exclude-and-regate (as
`seed.ts`, `seed-data.ts`, `testPayload.ts` and `migrate.ts` each get — excluded from the
unit pass, genuinely measured by the integration pass — as does
`apps/web/scripts/rederive-media.ts` from Phase 3 Task 10), or an explicit `c8 ignore` with
its reason at the point it applies. `apps/web/scripts/run-seed.ts` is the second kind and
now says so in code rather than only in prose: its body is top-level `await` ending in
`process.exit(0)`, so any test importing it would seed a real database and then kill its
own worker — there is no pass that could measure it, and claiming an exclude-and-regate
would claim a measurement nothing performs. `apps/web/scripts/run-rederive.ts` is its twin
and carries the identical treatment for the identical reason.

## The verify gates

- **`npm run verify`** — `typecheck && lint && format:check && test:unit`, where
  `format:check` is `prettier --check .` over the whole repository (ruling F31) and
  `test:unit` runs the `unit` **and** `unit-dom` projects with coverage. This is the
  pre-commit gate: no database, so a developer can always pass it honestly, even with
  Docker down.
- **`npm run verify:full`** — `verify` plus `test:integration:coverage` (which runs the
  same integration test files as `test:integration`, with `--coverage` scoped to the
  integration-only files named in the Contract and Migration sections below). This is
  what CI runs (`.github/workflows/ci.yml`); it requires `DATABASE_URL` for a test
  Postgres.

**Line endings are part of the gate, and for seventy-eight commits they defeated it on
Windows.** `format:check` is `prettier --check .`, whose `endOfLine` default is `lf`.
`.gitattributes` said `* text=auto`, which normalises what the REPOSITORY stores and says
nothing about what a checkout WRITES, so a clone on a machine with `core.autocrlf=true`
— git's default on Windows, which is this project's own platform — got a CRLF working
tree and `prettier --check .` reported **"Code style issues found in 389 files", exit
1**. The seventh whole-branch review measured it on a real clone. Nobody had, because
every gate run in this phase happened on a working tree written by editors rather than by
a checkout. The fix is `* text=auto eol=lf`, with the reason in `.gitattributes` itself.

If a working tree predates that change and `format:check` fails on files you have not
touched, `git add --renormalize .` and a forced re-checkout (`git checkout-index -a -f`)
rewrite it; `git status` is the check that it worked, and an empty `git diff` is the
check that nothing but line endings moved.

## The nine suites

Each carries its tool, its scope, how to run it, and a pointer to the file holding the
rest. §10's documentation guards have no reference file of their own: they are short
enough to stay here whole.

### 1 · Unit

- **Tool:** Vitest.
- **Scope:** pure functions, state machines, mappers, validators. No I/O.
- **Run:** `npm run test:unit` (both projects, with coverage), or `npm run test` for
  watch mode across every project.

**Detail:** `docs/testing/01-unit.md`

### 2 · Integration

- **Tool:** Vitest + a real test Postgres.
- **Scope:** collections, hooks, server actions, access control against a real database.
- **Run:** `npm run test:integration` (requires `DATABASE_URL`), or `npm run verify:full`
  to run it alongside everything else.

**Detail:** `docs/testing/02-integration.md`

### 3 · Contract

- **Tool:** Vitest — one shared suite run against both the local and the production
  implementation of each adapter.
- **Scope:** `storage`, `mailer`, `queue` (design spec §6) — every port that crosses into
  an external service.
- **Run:** unit-reachable contracts (`storage`, `mailer`) run under `npm run verify` like
  any other unit test; the `queue` and `MediaProcessor` contracts, being
  integration-only, run under `npm run verify:full` / `npm run test:integration`.

**Detail:** `docs/testing/03-contract.md`

### 4 · End-to-end

- **Tool:** Playwright (`playwright.config.ts`, Task 12).
- **Scope:** real journeys — page flip, bookmark jump, gallery, lightbox, mobile swipe,
  sign-in + OTP, upload round-trip, and the admin-to-diary seam below.
- **`e2e/focalPoint.spec.ts` discharges Phase 4's second exit criterion**, which no
  other suite can: a focal point is clicked in the editor with coordinates taken from
  the browser's own bounding box, and the crop the DIARY renders is read back out of
  `getComputedStyle` on a public route. Between the two sit Postgres, `readBookBundle`
  and a different component tree, and a break anywhere along that path leaves every
  jsdom case green. Both halves of the assertion are load-bearing: the two readings must
  agree, AND they must not be `50% 50%` — `focalX`/`focalY` both default to 50, so a
  control that stored nothing would satisfy agreement perfectly.

**Detail:** `docs/testing/04-end-to-end.md`

### 5 · Visual regression

- **Tool:** Playwright snapshots (`toHaveScreenshot`, `maxDiffPixelRatio: 0.01` in
  `playwright.config.ts` — the design is high-fidelity, so drift is a defect, not noise).

**Detail:** `docs/testing/05-visual-regression.md`

### 6 · Accessibility

- **Tool:** axe-core in Playwright (`@axe-core/playwright`, `e2e/a11y.spec.ts`), via the
  shared `expectNoAxeViolations` helper (`e2e/support/axe.ts`, Task 1 of Phase 1) — plus
  `measureContrastOverGradient` (`e2e/support/coverContrast.ts`) for the one thing axe
  will not judge: text over a gradient (finding 2 below).
- **Run:** `npm run test:a11y`.

**Detail:** `docs/testing/06-accessibility.md`

### 7 · Performance

#### 7.0 · Current state — what is gated today

**Read this table first.** Everything below it is a chronological record of how these
numbers were arrived at, kept because the measurements are the argument for the numbers.
That record quotes figures that have since been superseded — the 2,500ms LCP budget
above all. **No figure beneath this section is the current gate unless this table says
so.**

| Gate                           | Config                    | Route                                                              | Limit                                                                                                                           |
| ------------------------------ | ------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `largest-contentful-paint`     | `lighthouserc.book.json`  | `/p/1`, book surface (1350x940, `Cookie: td-reading-surface=book`) | **≤3085ms**                                                                                                                     |
| `largest-contentful-paint`     | `lighthouserc.json`       | `/p/1`, mobile surface (Lighthouse phone emulation, no cookie)     | **≤3085ms**                                                                                                                     |
| `largest-contentful-paint`     | `lighthouserc.json`       | `/gallery/patagonia`                                               | ≤4000ms                                                                                                                         |
| `resource-summary:script:size` | both                      | `/p/1` (both surfaces), `/gallery/<slug>`                          | ≤184320 bytes (180KB, `CLAUDE.md` §6)                                                                                           |
| `resource-summary:image:size`  | `lighthouserc.json`       | `/gallery/<slug>`                                                  | ≤680000 bytes                                                                                                                   |
| `largest-contentful-paint`     | `lighthouserc.admin.json` | every URL that config collects (1440x900 desktop) — see below      | **≤3085ms**                                                                                                                     |
| `resource-summary:script:size` | `lighthouserc.admin.json` | the same admin routes                                              | ≤327680 bytes (320KB, `CLAUDE.md` §6)                                                                                           |
| `cumulative-layout-shift`      | all three                 | every collected URL                                                | ≤0.1                                                                                                                            |
| `http-status-code`             | all three                 | every collected URL                                                | `minScore: 1`                                                                                                                   |
| —                              | `lighthouserc.json`       | `/cms`                                                             | `http-status-code` and CLS only: no LCP, no script budget                                                                       |
| **none**                       | —                         | **`/admin/reset/<token>`, `/admin/journeys/<id>`**                 | **NOT GATED** — a parameter has no literal URL for a collector to ask for; the paragraphs under this table say what bounds each |

**EVERY ADMIN SCREEN WITH A LITERAL ADDRESS IS COLLECTED, and a test says so rather than a
count in this paragraph.** `scripts/lighthouseCollects.test.js` walks `apps/web/app/`, computes
each page's address the way Next.js does, and refuses any address under `/admin` that
`lighthouserc.admin.json` does not collect — excusing only an address carrying a bracketed
segment, because a `lighthouserc*.json` holds URLs rather than patterns. It runs in the
pre-commit gate and reads the configuration back the other way too, so a URL whose page has
been deleted fails it.

That guard is Phase 4 Task 15c, and what it found when it was first run is why it exists:
**six** admin screens were mounted, reachable and collected by nothing — `/admin/media`,
`/admin/galleries` (deliberately, `docs/deviations.md` §73 and §80), and `/admin/settings`,
`/admin/trash`, `/admin/account` and `/admin/sign-in/done` because nobody had said. A screen
absent from the collector is not a budget that is red; it is a budget nobody measured, and
Phase 4's seventh exit criterion — phrased "every collected screen" — was satisfiable by
omission. All six were added. `/admin/sign-in/done`'s own exemption had already expired
without being noticed: this document gave as its reason that Lighthouse "sends no cookie", and
Phase 4 Task 3 made the runner mint one.

**BOTH OF THE GATES THAT WERE RED AS THIS PHASE CLOSED WERE RULED ON BY THE REPOSITORY
OWNER ON 2026-09-14, ON THE MEASUREMENTS BELOW.** Neither was an agent adjusting a
threshold: each stayed red for weeks while the numbers were collected, and the decision
to move it was a human's. Kept at the table because this is where a reader comes to learn
what the gates are, and because the reasoning for a number matters more than the number.

- **`resource-summary:image:size` on `/gallery/<slug>`: 600,000 → 680,000**, derived from
  a five-run Lighthouse transfer-size median of **642,138 bytes** on a seeded, re-derived
  corpus. The measurement is of nine **stripe-pattern placeholder PNGs**, not of nine
  photographs, and seven of the nine collide with the ladder's geometry — so it describes
  this corpus and has to be re-measured when the corpus changes. 680,000 is bounded on
  both sides: 37,862 above the measurement, and 27,700 **below** the cheapest tenth eager
  tile (~707,700), which is the smallest real regression of the kind this gate watches
  for. Still a detector: `loading="eager"` re-measured at **4,009,810 bytes** over 60
  requests, 5.90× the new limit. `docs/adr/0013-gallery-image-budget.md` carries the
  ruling and every number in it.
- **`largest-contentful-paint` in all three configs: 3,000 → 3,085ms**, derived from the
  **ten CI medians** recorded in `docs/testing/07-performance.md` §7.0.1 — five URLs
  across two runs on two trees, spanning 3004.981 to 3045.037. The number is the worst
  observed median plus one full observed spread (`3045.037 + 40.056`), floored: it clears
  the worst median by 39.963ms and still sits **85ms below** ADR 0006's image-window
  regression at 3,170ms, which it must keep failing. **The old 3,000 was not wrong** — it
  still passes on the authoring host (re-measured 2925.343 on 2026-09-14, 75ms of margin)
  and the three admin routes, untouched by Phase 3, are over by the same margin as
  `/p/1`. A budget characterised on one machine and enforced on two is what was corrected.
  `docs/adr/0008-lcp-budget-and-the-framework-floor.md` carries the ruling and the
  derivation.

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

**The two addresses that carry a parameter are bounded rather than guessed, because a
collector cannot ask for them.** `/admin/reset/<token>` renders `NewPasswordStep` and needs a
live token that changes every run, so it was measured directly instead — 8 scripts, 176,211
bytes gzipped, against the 320KB ceiling. `/admin/journeys/<id>` is the journey editor and
needs a live journey id; it has never been collected, and nothing here has measured it.
Under `CLAUDE.md` §7.1 that is **UNRESOLVED** rather than inferred from its neighbours.

**`/admin/sign-in/done` used to be in this paragraph and is now collected.** The reason given
for leaving it out was that Lighthouse "sends no cookie" and would collect the redirect — true
when it was written and false since Phase 4 Task 3, which made `scripts/run-lighthouse.mjs`
mint a session before any configuration collecting an `/admin…` address. Task 15c measured it
rather than continuing to bound it: 137,907 bytes in 6 script requests, LCP 2,925.9ms, CLS 0 —
and its final URL is `/admin/sign-in/done`, which is what says the cookie reached the guard.

**`/admin` HAS A LIGHTHOUSE BUDGET NOW, and Phase 4 Task 3 is where it got one.** This
file said for seven rounds that it did not, and the reason it gave was the right one:
`/admin` is behind the session guard, so a collector that sends no cookie is answered with
a redirect to `/admin/sign-in` and measures that screen twice under `/admin`'s name. Worse,
it would have asserted nothing at all — the config's single `assertMatrix` entry matched
`.*/admin/.*`, which `http://localhost:3000/admin` does not satisfy, having no path segment
after `admin`. A URL added without a second matrix entry is collected and never judged,
which is the shape of green this branch has spent four reviews removing.

**Both halves are closed, and each was measured rather than assumed.**

- **The session.** `apps/web/scripts/mint-lighthouse-session.ts` finds or creates one
  dedicated account (`lighthouse@collector.invalid`, a reserved TLD, with a CSPRNG password
  nothing keeps) and issues a session through `createSessionService` — the same call
  `e2e/support/adminSession.ts` makes, so there is one definition of how a session is
  stored. `scripts/run-lighthouse.mjs` runs it before any configuration that collects an
  `/admin…` address and passes the cookie as a collect-settings override
  (`--collect.settings.extraHeaders.Cookie=…`). Its integration test judges the cookie by
  the PRODUCTION reader and the PRODUCTION authenticator — `readBrowserSession` then
  `createSessionService.authenticate`, which is exactly what the guard does — so "a
  well-formed string" cannot pass it.
- **The two refusals, because one of them is not enough.** A cookie that cannot be minted
  exits the runner non-zero, since a missing cookie does not fail the gate on its own:
  Lighthouse follows the redirect and reports a 200 for the sign-in screen. **A cookie that
  mints and is not honoured is that same failure wearing a pass** — the sign-in screen
  measures `http-status-code` 1, 140,763 bytes against 327,680, LCP 2,929ms against 3,085
  and CLS 0, so all four assertions go green on the wrong page and every later task's
  headroom is fictional. So after each admin configuration the runner reads the runs' own
  final URLs (`collectorLanded`, `scripts/lighthouseSession.mjs`) and exits non-zero if any
  of them moved. **The `redirects` audit cannot do this job**, and that was measured rather
  than assumed: it scores 0 on all four admin URLs, including the three gated since Phase 2,
  because every admin address self-redirects once.

  **It is scoped to the configurations that carry a session, deliberately.** The failure it
  catches is a guard answering somewhere else, so it exists exactly where a cookie is sent.
  Extending it to `lighthouserc.json` and `lighthouserc.book.json` is one line and is not
  taken: nothing has measured whether `/p/1` or `/gallery/<slug>` ever self-redirect under
  Lighthouse's phone emulation, and turning an unmeasured assumption into a gate on the
  diary's LCP budget — the budget §7.0 above records as having been red for weeks at a
  time — is a change that should follow a measurement rather than precede it. **Measure
  those addresses first, then widen it.**

- **Where the credential goes, which is not nowhere.** `mint-lighthouse-session.ts` writes
  it to no file, and `run-lighthouse.mjs` captures the child's stdout rather than inheriting
  it, so nothing is committed and nothing reaches a CI log. **Lighthouse writes it down
  itself**: it copies its own `configSettings`, `extraHeaders` among them, into every LHR
  and every HTML report, so `td-session=…` lands in `.lighthouseci/` and `lhci-reports/`
  twice per run. Both directories are `.gitignore`d and **must stay so**, and **neither may
  be uploaded as a CI artifact** — this repository is public. What makes those copies
  harmless rather than merely hidden is that the runner revokes every session the collector
  holds once a configuration is done (`npm run lighthouse:session:revoke -w apps/web`), so
  the value sitting in those files authenticates nothing. Without it, a full admin session
  would stay live for `SESSION_LIFETIME_MS` — twelve hours.
- **The second matrix entry.** `.*/admin$`, disjoint from `.*/admin/.*`, carrying the same
  four assertions.

**The first measurement of `CLAUDE.md` §6's 320KB admin ceiling on a screen behind the
guard**, five runs, medians, 1440x900 desktop, on the authoring host:

| URL                   | final URL             | `http-status-code` | script transfer | script requests | LCP median  | CLS |
| --------------------- | --------------------- | ------------------ | --------------- | --------------- | ----------- | --- |
| `/admin/sign-in`      | `/admin/sign-in`      | 1                  | 140,763         | 7               | 2,928ms     | 0   |
| `/admin/sign-in/code` | `/admin/sign-in/code` | 1                  | 141,478         | 7               | 2,928ms     | 0   |
| `/admin/reset`        | `/admin/reset`        | 1                  | 140,606         | 7               | 2,927ms     | 0   |
| **`/admin`**          | **`/admin`**          | **1**              | **137,986**     | **6**           | **2,777ms** | 0   |
| **`/admin/journeys`** | **`/admin/journeys`** | **1**              | **140,106**     | **7**           | **2,930ms** | 0   |

**The final URL is the requested one in every row, not `/admin/sign-in`** — that is what says
the cookie survived into the collector, and it is the first thing to read when this gate
behaves oddly. `/admin` ships one script request FEWER than each sign-in pane, which is the
shell being Server Components throughout: nothing under `components/admin/shell/` carries a
`'use client'` directive.

**`/admin/journeys` is the first screen to spend any of that headroom, and what it spent is
measured rather than argued.** It ships one script request MORE than `/admin` and
**2,120 bytes** more — which is the two client islands SCREENS.md §2.2 needs, the create
panel's open state and the `⋯` disclosure, and nothing else: the search and the five status
chips are `searchParams`, so they are links and a `GET` form and cost nothing. At 140,106
bytes against 327,680 the screen is 42.8% of the ceiling, and the ten still to come have
187,574 bytes between them.

**WHICH OF THE TWO BUDGETS IS ACTUALLY BINDING, said plainly because the paragraph above
reads off the byte column and the byte column is the roomy one.** The first screen with real
data, a form and a disclosure on it cost about 2KB of script, so on that axis ten more
screens are not the worry. **LCP is:** 2,930ms against the 3,085ms gate is **95% of budget,
155ms of margin**, on the first of eleven screens, and it is a number a screen can move
without shipping a byte of JavaScript — one more query, one uncached font, one image above
the fold. Read the LCP column first when this gate goes red.

### EVERY ADMIN SCREEN MEASURED IN ONE RUN — Phase 4 Task 15c, and the gate is RED

One `npm run test:perf` on this Windows host, production `next build` + `next start`, five runs
per URL, medians, 1440x900 desktop emulation at DPR 1, against the developer `diary` database.
**Every figure in this section is from the run of 2026-10-01**, and saying so is not ceremony:
`lhci`'s `upload.outputDir` ACCUMULATES, so `lhci-reports/admin/` already holds a later run's
seventy reports beside these seventy. A recomputation that reads the directory without filtering
on the timestamp in each filename averages two runs and reproduces none.
**The final URL is the requested one in every row**, which is what says the collector's session
survived into the run rather than that the sign-in pane was measured fourteen times.

| URL                   | script transfer | script req | image transfer | image req | LCP median    | CLS | TBT  |
| --------------------- | --------------- | ---------- | -------------- | --------- | ------------- | --- | ---- |
| `/admin/sign-in`      | 140,684         | 7          | 0              | 0         | 2,926.8ms     | 0   | 20ms |
| `/admin/sign-in/code` | 141,445         | 7          | 0              | 0         | 2,924.5ms     | 0   | 19ms |
| `/admin/sign-in/done` | 137,907         | 6          | 0              | 0         | 2,925.9ms     | 0   | 20ms |
| `/admin/reset`        | 140,527         | 7          | 0              | 0         | 2,925.4ms     | 0   | 20ms |
| `/admin`              | 139,360         | 7          | 0              | 0         | 2,927.5ms     | 0   | 21ms |
| `/admin/journeys`     | 140,075         | 7          | 0              | 0         | 2,927.2ms     | 0   | 20ms |
| `/admin/media`        | 143,035         | 7          | 1,260,054      | 70        | **4,180.2ms** | 0   | 13ms |
| `/admin/galleries`    | 142,827         | 7          | 194,346        | 9         | **3,762.1ms** | 0   | 16ms |
| `/admin/book`         | 141,922         | 7          | 0              | 0         | 2,927.5ms     | 0   | 21ms |
| `/admin/cover`        | 140,873         | 7          | 19,632         | 1         | 3,003.8ms     | 0   | 11ms |
| `/admin/publish`      | 139,888         | 7          | 0              | 0         | 2,926.9ms     | 0   | 21ms |
| `/admin/settings`     | 137,907         | 6          | 0              | 0         | 2,925.5ms     | 0   | 20ms |
| `/admin/trash`        | 137,907         | 6          | 0              | 0         | 2,926.6ms     | 0   | 21ms |
| `/admin/account`      | 137,907         | 6          | 0              | 0         | 2,925.8ms     | 0   | 22ms |

`http-status-code` scored 1 on all seventy runs and CLS measured 0.0000 on all seventy.

**ONE NUMBER IN THAT TABLE MOVED IN PHASE 4 TASK 15d, and it is the script column for
`/admin/journeys`: 140,075 → 140,198, a hundred and twenty-three bytes.** `CreatePanel.tsx` is a
client island and it now imports two things from `lib/admin/formRefusal.ts` — a string constant
and a lookup — so that the panel can reopen itself with the author's typing in it when a create is
refused (`docs/deviations.md` §104). **Every other screen's script column is byte-identical**,
which is the measurement that says the rest of §104's mechanism ships no JavaScript: the refusal
notice and the four cards that redraw what was typed are server components.

**THE LCP COLUMN IS NOT RE-READ FROM THAT RUN, AND THERE ARE TWO POPULATIONS IN IT, NOT ONE.**
A fix round's first version of this paragraph read one noise floor off the two worst screens and
stated it for all fourteen. That is the wrong shape: a 240ms floor would license dismissing a real
200ms regression on any of the other twelve. Both runs' 140 stored reports, re-read per URL:

- **The eleven screens that load no image drifted 1.3ms to 5.7ms** between the two runs. Their
  within-run spread **in 15c** was 1.9ms to 8.5ms; **in 15d it was not**, and both exceptions are
  named rather than smoothed: `/admin/sign-in` spread **61.4ms** (2,990.0 then 2,932.5, 2,928.6,
  2,933.3, 2,928.8 — one slow first pass) and `/admin` spread **20.0ms**. So "single-digit
  milliseconds" is 15c's property, and what survives in both runs is the MEDIAN, which is what the
  drift column reads.
- **The two screens that fetch photographs are not reproducible at that resolution at all.**
  `/admin/media` drifted +247.6ms and `/admin/galleries` +237.6ms — and their WITHIN-run spread
  was already larger than that drift in 15c alone (627.7ms and 590.2ms across five runs of one
  URL). Their medians are worth comparing only in hundreds of milliseconds.
- `/admin/cover` is in neither group cleanly: it loads one 19,632-byte image that
  `docs/testing.md`'s own LCP-element table says is **not on its LCP path**. It drifted **+1.7ms**,
  which is at the bottom of the image-free band.

So `/admin/cover`'s 3,003.8 → 3,005.6ms is not a reading, and the narrower figure is what says so
— not the wide one. What 15d's run does establish is the thing the gate asks: **the same two
screens are red and no third one is**, and `/admin/cover`, the screen with the least margin,
passed at a **3,010.9ms worst of five** against 3,085.

**THE SCRIPT BUDGET IS NOT THE CONSTRAINT AND HAS NEVER BEEN CLOSE.** The heaviest screen in
the admin is `/admin/media` at **143,035 bytes against 327,680 — 43.7%**, and the lightest four
share one number, 137,907 in six requests, because `/admin/settings`, `/admin/trash`,
`/admin/account` and `/admin/sign-in/done` carry **no `'use client'` module at all**. The whole
spread across fourteen screens is **5,128 bytes**, which is the gap between the heaviest screen
and those four — not the cost of the fourteen islands this phase shipped, which no screen
carries all of. Subtracting 137,907 from each of the **ten** screens with a nonzero remainder
gives what that screen's own islands cost: 5,128 for `/admin/media`, 4,920 for
`/admin/galleries`, 4,015 for `/admin/book`, 3,538 for `/admin/sign-in/code`, 2,966 for
`/admin/cover`, 2,777 for `/admin/sign-in`, 2,620 for `/admin/reset`, 2,168 for
`/admin/journeys`, 1,981 for `/admin/publish` and 1,453 for `/admin`. The other four are the
137,907 floor itself. Eleven
screens were predicted free before they were collected, and a prediction is not a number — these
are the numbers.

**LCP IS THE CONSTRAINT, AND THE SHAPE OF IT IS A FLOOR PLUS THE PHOTOGRAPHS.** Eleven of the
fourteen screens draw no image and measure between **2,924.5ms and 2,927.5ms** — a 3ms spread
across eleven different screens, which is ADR 0008's framework floor and five font faces, not
anything a screen did. **On all fifty-five of those runs the LCP element is NOT A LOADED
RESOURCE** — it is a `<p>`, an `<h1>`, an `<h2>` or a `<div>`, and **Load Delay and Load Time
are 0 in every one of them** — leaving a Render Delay of 2,471.8–2,479.8ms on top of a
451.3–452.8ms TTFB. So the floor is not a measurement of markup; it is the framework, the
stylesheet and five font faces, and it is the same on every screen that draws nothing.

Against the 3,085ms gate that floor leaves **about 159ms for everything a screen puts on top of
it**. **That subtraction is the solid number in this section.** What 159ms buys in BYTES is
not, and the three screens that draw images are why:

| screen             | image bytes | LCP element          | image on the LCP path?                    | ms over the 2,926ms floor |
| ------------------ | ----------- | -------------------- | ----------------------------------------- | ------------------------- |
| `/admin/cover`     | 19,632      | a `<div>`, 326×120   | **no** — Load Delay 0, Load Time 0        | +77.8, all Render Delay   |
| `/admin/galleries` | 194,346     | the preview, 252×150 | yes — Load Delay 1,534ms, Load Time 178ms | +836                      |
| `/admin/media`     | 1,260,054   | a grid tile, 214×214 | yes — Load Delay 1,421ms, Load Time 190ms | +1,254                    |

**`/admin/cover`'s photograph is not on its LCP path at all.** Its largest element is a `<div>`
in all five runs, with both load phases at zero; its 77.8ms over the floor is 77.8ms of extra
Render Delay (2,551.6–2,553.4ms against the floor's 2,471.8–2,479.8ms), which may well be the
portrait's decode but is a different mechanism from the other two rows, where the LCP element
IS the image and the overage is load. So that row bounds what an image costs; it does not
measure it.

**The bytes-to-milliseconds exchange rate is therefore NOT established, and this document is
not going to print one.** The two rows that do put an image on the LCP path disagree by more
than four times — 4.3ms per KB against 1.0 — over a sample of two; and the probe below
**falsifies even the higher figure**: taking 66,695 image bytes off `/admin/galleries` should
have been worth about 287ms at 4.3ms/KB, and not one of the five runs that followed came under
the gate — the best of them still 690ms over. Anyone sizing a fix from a rate here will get the
wrong answer. The two numbers that ARE measured are the 159ms of headroom, and what the two
probes below actually delivered.

`/admin/cover` is still the screen to watch when this gate next moves: at 3,003.8ms it has
**81ms of margin**, the least of the twelve that pass. **What would make it go red is not
established, and the two candidates are not exclusive.** What is measured is that its 77.8ms
over the floor is Render Delay; what is NOT measured is whether the portrait's bytes feed that
delay, and if the cause is decode then they do. `/admin/book`'s LCP element is also a `<div>`
and it sits on the floor at 2,927.5ms, so being a `<div>` costs nothing by itself — the only
thing that distinguishes cover from the eleven floor screens is that it draws an image. Treat
both a heavier portrait and more render work as able to spend the 81ms until something
separates them.

### `/admin/media` AND `/admin/galleries` ARE IN THE CONFIG AND RED, WHICH IS THE POINT

`docs/deviations.md` §73 and §80 each measured one of these screens over the gate and then left
its URL OUT of `lighthouserc.admin.json`, so that `npm run test:perf` would stay green for the
tasks that followed. Phase 4 Task 15c reverses both, on the repository owner's ruling: **the
gate does not move and no URL comes out.** A budget nobody measures is worse than a budget
that is red, because only one of the two is visible — and an exit criterion phrased "every
collected screen" is discharged by omission, which is the shape of green this branch has spent
five reviews removing.

So `npm run test:perf` is **RED on this branch**, on two assertions, and both are LCP:

```text
1 result(s) for http://localhost:3000/admin/media :
  ×  largest-contentful-paint failure for maxNumericValue assertion
        expected: <=3085
           found: 4180.2
      all values: 3563.158 3560.962 4185.55 4180.2 4188.63

1 result(s) for http://localhost:3000/admin/galleries :
  ×  largest-contentful-paint failure for maxNumericValue assertion
        expected: <=3085
           found: 3762.112
      all values: 3558.532 4148.686 3761.916 3762.112 4143.928
```

**`/admin/media`'s LCP element, read out of the run rather than guessed:** a grid tile,
`<img src="/api/media/file/bergen-hero-128-400x400.png" loading="lazy">`, painted at a bounding
rect of **214×214 CSS px** from a 400×400 source — the same element, the same snippet and the
same rect in all five runs. **The median run's** phases are TTFB 461ms, Load Delay 1,421ms,
Load Time 190ms, Render Delay 2,109ms; **across the five** TTFB holds at 461–463ms while Load
Delay ranges 1,421–2,245ms and Render Delay is bimodal at 1,108–1,113ms or 1,906–2,109ms, so no
single phase figure describes this screen and the range is given instead of one.
`bootup-time` scores 1 at 0.2s and `mainthread-work-breakdown` 1 at 0.4s in all five, so the
main thread is not what this screen is spending.

**`/admin/galleries`' LCP element is the selected-frame panel's preview**,
`<img src="/api/media/file/bergen-hero-128-1200x900.png">` — the uncropped `frame` derivative —
painted at **252×150 CSS px** — again the same element and rect in all five runs. The median
run's phases are TTFB 452ms, Load Delay 1,534ms, Load Time 178ms, Render Delay 1,599ms.

**This corrects what §80 and this document said about this screen.** Both read "Render Delay
2,905ms … seventy per cent of the number is main-thread work", and the runs that are actually
in the config say otherwise — in **all five**: `render-blocking-resources` scores 1 with no
items, `bootup-time` scores **1 at 0.1s**, `mainthread-work-breakdown` scores **1 at 0.3s** of
which script evaluation is 123.5–132.8ms, and total blocking time is 16ms. There is no 2.9
seconds of main thread on this screen to remove.

What Lighthouse does report is `uses-responsive-images` at **score 0, "Est savings of 165 KiB"**
— and **it names nine items, not one**, identically in all five runs. The LCP element is the
largest of them at 66,055 bytes with 63,792 called wasted, which is **38% of the 165 KiB**; the
other eight are the grid's own 400×400 `thumb` tiles, 12,428–17,347 wasted bytes each,
168,630 bytes wasted in total. Said precisely because the headline is what a reader would size a
follow-up rung from, and the **preview** rung is worth 62 KiB rather than 165 KiB.

**AND THE OTHER EIGHT ARE NOT THE DPR-1 ARTEFACT THE MEDIA PARAGRAPH ABOVE DESCRIBES** — which
was checked rather than assumed, and the two screens' tiles turn out to differ. This grid's
tiles are measured at **152×152 CSS px** in the run (the source comments say 136; the run says
152), and 152 at ADR 0013's DPR 1.75 is **266 device pixels against the 400px `thumb`** — 1.5×
the width and 2.3× the pixels, oversized at a real display's ratio and not only at the gate's.
The Media grid's 214 CSS px needs 375 and is correctly served. So Lighthouse is right about
both halves of this screen and right about neither half of that one, and a reader must not
carry the Media refutation across.

**WHAT THE TWO SCREENS DO AND DO NOT SHARE.** Both are over on image bytes and neither is over
on script or main thread — so §80's "the two image-bearing admin screens miss the same gate for
different reasons" is withdrawn; the reasons are the same one. What differs is the remedy, and
`docs/adr/0013-gallery-image-budget.md`'s own arithmetic — a CSS size times the device pixel
ratio of a real display — is what separates them:

- **The Media grid's tile is correctly served and a smaller rung would be wrong.** 214 CSS px
  at ADR 0013's own DPR 1.75 is **375 device pixels**, and `thumb` is 400: twenty-five pixels
  of headroom, not three and a half times too many. The "about three and a half times the
  pixels it draws" this document carried is the arithmetic at **DPR 1**, which is the ratio the
  GATE is measured at and not the one an author's display has. A rung sized to that number
  would serve a soft tile to every author on a retina screen in order to pass a measurement —
  which is ADR 0013 Option 3 run backwards. The honest form of the fix is a `srcset` offering
  both rungs, and it is not Task 15c's.
- **The Galleries panel preview is genuinely oversized at every ratio.** 252 CSS px at DPR 1.75
  is 441 device pixels against 1200 served — 2.7× the width and 7.4× the pixels — and the panel
  is widest at the mobile breakpoint, where `.columns` collapses to one track; even there
  nothing needs more than about 700. The rung that would serve it is an **uncropped** one
  (`readGalleriesScreen.ts`'s `PREVIEW_TIERS` may not name a cropped tier —
  `apps/web/lib/media/derivativeGeometry.test.ts` holds that), and the ladder's smallest
  uncropped rung today is `frame` at 1400.

**WHAT A SMALLER RUNG WOULD BUY WAS MEASURED, NOT ESTIMATED, AND IT IS NOT ENOUGH.** Building a
rung means an `imageSizes` entry, a migration and `npm run media:rederive` over the library, so
Task 15c measured the two best cases first, through `scripts/run-lighthouse.mjs` on a scratch
configuration — the same session minting, checking and revocation `npm run test:perf` performs
— with two temporary patches that were never committed. `SelectedFrame.tsx` drew the preview
from `thumbSrc`, and `MediaGrid.tsx` drew a tile image on every third tile.

**The galleries patch is a better best case than any rung could be, and the reason is worth
stating exactly.** It did not substitute a small file for a large one: the `thumb` it reached
for is the Bergen hero's 400×400 derivative, which **the grid on that screen was already
fetching** — so the probe removed the preview's 66,695 transfer bytes and added nothing at all. Its image
total fell by exactly that (194,346 − 66,695 = 127,651, to the byte) and its request count by
exactly one. **The preview's marginal cost in the probe was zero**, which no uncropped rung can
match, so what follows is a ceiling on the fix rather than an estimate of it.

| screen             | image bytes             | LCP median              | best of the five runs | that run is still over by |
| ------------------ | ----------------------- | ----------------------- | --------------------- | ------------------------- |
| `/admin/galleries` | 194,346 → **127,651**   | 3,762.1 → **3,841.8ms** | **3,775ms**           | 690ms                     |
| `/admin/media`     | 1,260,054 → **427,468** | 4,180.2 → **3,579.6ms** | **3,560ms**           | 475ms                     |

**THE BEST-RUN COLUMN IS THERE BECAUSE THE MEDIAN COLUMN CANNOT CARRY THIS ARGUMENT.** These
two screens are the only ones in the admin whose five runs disagree with each other: unpatched,
`/admin/galleries` spans 3,558–4,149ms and `/admin/media` 3,561–4,189ms, so a difference of a
couple of hundred milliseconds between two medians of five is inside the instrument and is not a
reading. **What is outside it is that neither probe produced a single run under 3,085ms, in ten
tries**, and that the best of them were still 690ms and 475ms over. Every conclusion below rests
on that and not on the medians moving.

**So taking a third of the image weight off `/admin/galleries` bought no measurable
improvement** — its median moved 80ms, which this screen's own spread makes unreadable in either
direction. The reason is in the probe's own LCP element: with the preview small, **the LCP
element became a grid tile** — a 400×400 `thumb` painted at 152×152 — and `uses-responsive-images`
still scored 0, now naming 101 KiB. A screen covered in photographs does not get faster when you
shrink the largest one; the title passes to the next one.

**Taking two thirds off `/admin/media` bought 601ms of a required 1,095ms.** Its LCP element is
still a tile, still 214×214, with phases TTFB 632ms, Load Delay 2,072ms, Load Time 778ms,
Render Delay 97ms.

So **neither screen can be brought under 3,085ms by a derivative rung**, and the measurement
that says so most plainly is the floor: eleven screens that draw nothing all land at 2,926ms,
and the gate is 159ms above it.

**So the decision this needs is the one `docs/deviations.md` §73 named at the start and nobody
has taken: whether an admin screen that draws photographs is measured against the diary's
number.** 3,085ms is ADR 0008's, derived from ten CI medians of `/p/1` — a reading surface with
one photograph above the fold. The admin's Media library is seventy. Task 15c did not take that
decision and did not move the gate; it made the shortfall visible on every run instead.

**The eager-loading experiment was NOT repeated.** §73 measured it 732ms worse, and both
screens' phase breakdowns say discovery is not the constraint.

### `/admin/publish` IS MEASURED, PASSES EVERY ASSERTION, AND IS NOW IN THE CONFIG

Phase 4 Task 11 measured `http://localhost:3000/admin/publish` against the same matrix, the
same five runs, the same production build and the same 1440x900 desktop emulation — first by
copying `lighthouserc.admin.json` to a scratch file with one URL in it, because that config was
not the task's to edit, and then, on the review's ruling, **by adding the URL to
`lighthouserc.admin.json` itself**. A measurement in a document that no command re-runs is a
number with no owner: it rots silently as the screen changes. It was the eighth URL in that
config when Task 11 added it, and the fourth admin SCREEN in it, beside `/admin/journeys`,
`/admin/book` and `/admin/cover`; Task 15c took the same config to fourteen.

| `/admin/publish`             | final URL        | `http-status-code` | script transfer | script requests | LCP median  | CLS | TBT  |
| ---------------------------- | ---------------- | ------------------ | --------------- | --------------- | ----------- | --- | ---- |
| in `lighthouserc.admin.json` | `/admin/publish` | 1                  | 139,967         | 7               | **2,928ms** | 0   | 20ms |

All five LCP runs of the configured gate: 2,925.3 / 2,927.4 / 2,928.8 / 2,927.8 / 2,928.3. The
scratch run that measured this screen before the URL was added read 2,927ms on the same build,
so the two agree inside one run's own spread. **Every assertion passed**, on all eight URLs that
configuration held at the time, and the final URL is the requested one — which is what says the
collector's cookie was honoured rather than that the sign-in screen was measured under this
screen's name.

**It is the first admin screen since `/admin/journeys` to fit inside the LCP gate**, and the
reason is the one the section above gives from the other side: it carries **no photographs**.
This screen's heaviest element is a Caveat headline. At 2,927ms against 3,085 it has **158ms of
margin** — statistically the same as `/admin`'s 2,777ms and `/admin/journeys`' 2,930ms, and the
same 20ms of total blocking time every admin route reports. The margins by which the two
image-bearing screens miss, and the cause they turn out to share, are Task 15c's section above;
the "main-thread work behind a preview" this paragraph used to name as `/admin/galleries`'
cause is withdrawn there against that screen's own `bootup-time` and
`mainthread-work-breakdown`.

**What the seventh client entry cost, measured rather than argued:** 139,967 bytes against
`/admin`'s 137,986 and one more script request — **1,981 bytes** for `PublishSelection.tsx`,
which is §2.8's live button label and its strike-through. That is 42.7% of the 327,680 ceiling.

**It is judged rather than only collected.** The `.*/admin/.*` matrix entry matches it, which
`scripts/lighthouseJudged.test.js` checks in the pre-commit gate, so the four assertions above
are asserted on every `npm run test:perf` rather than recorded once here.

Every URL **in `lighthouserc.admin.json`** is JUDGED and not merely collected, which was
once a manual `lhci assert --includePassedAssertions` reading of the saved runs and is now
`scripts/lighthouseJudged.test.js` — landed from the Task 3 review, run in the pre-commit
gate, and the thing to read when a future task adds a URL to this config. `/admin/journeys`
is matched by the `.*/admin/.*` matrix entry, and so are the six URLs Task 15c added — which
that case is what confirmed, rather than the pattern being read and assumed to match.
**There is no longer a screen this sentence does not cover:** the two it used to exempt are in
the config and judged by it, and red, which is the section above.

**`/admin/sign-in/code` is collected with no cookie**, so what it measures is the
no-challenge placeholder rather than the pane a signing-in reader sees. Said rather than left
to be assumed: it is the state an unauthenticated visitor to that address is actually served,
it renders the same shell, the same six cells and the same client bundle, and the states that
differ from it differ in text rather than in bytes. It is also, as of Phase 2 Task 11's fix
round, a state a reader reaches only by typing the address — an exhausted or expired
challenge is now described rather than replaced by it (see §8 and
`docs/qa/2026-09-07-sign-in-sweep.md`).

**`apps/web/scripts/sweep-staged.integration.test.ts` no longer reads two clocks**, which is
worth recording here because it was an intermittent GATE rather than an intermittent test. The
case stages a real object and sweeps with a clock one millisecond past the window;
`staleStagedObjects` compares that clock against the FILE'S `mtimeMs`, and the clock came from
`Date.now()`. On Windows those are different sources and the filesystem's can lead, so the
one-millisecond margin was sometimes spent before the comparison ran: **1 failure in 20
isolated runs**, and three of four `verify:full` runs once Task 11's longer suite moved the
timing. The clock is now read off the object's own `modifiedAt`, so both sides of the
comparison come from one source, and the helper throws on an empty listing rather than letting
"the fixture staged nothing" arrive as the same "Swept 0" sentence a working sweep prints.
**Twenty isolated runs after the change: 20 passed, 0 failed.** A gate that fails
intermittently is one people re-run rather than read, and this one guards the deletion of
staged pre-strip originals — the copies that still carry GPS.

**INP has no Lighthouse lab equivalent** — it is a field metric — so `CLAUDE.md` §6's
≤200ms is **not asserted by any of the three configs**, here or on the diary, and is therefore
**UNRESOLVED** rather than met (`CLAUDE.md` §7.1). A green `npm run test:perf` says nothing
about it. What the lab can say is total blocking time, which across Task 15c's fourteen admin
screens measured **11-22ms**, and 12-140ms across the diary's four URLs. Stated here rather
than left to be assumed from a green run.

**The two diary configs were re-measured by Task 15c**, because Phase 4 Task 7 changed
`readBookBundle` and a budget nobody re-ran after a change to the module that assembles the
page is a budget describing the old page. Both passed every assertion, on this Windows host
rather than in the container the table below was taken in:

| Route (config)             | Metric | Median of 5 | Gate    | Margin   |
| -------------------------- | ------ | ----------- | ------- | -------- |
| `/p/1` book (`.book.json`) | LCP    | 2,927.2ms   | 3085    | 157.8ms  |
| `/p/1` book                | script | 142,946 B   | 184,320 | 41,374 B |
| `/p/1` mobile (`.json`)    | LCP    | 2,926.9ms   | 3085    | 158.1ms  |
| `/p/1` mobile              | script | 144,797 B   | 184,320 | 39,523 B |
| `/gallery/patagonia`       | LCP    | 3,531.0ms   | 4000    | 469.0ms  |
| `/gallery/patagonia`       | script | 141,780 B   | 184,320 | 42,540 B |
| `/gallery/patagonia`       | image  | 642,138 B   | 680,000 | 37,862 B |

CLS measured 0.0000 on all twenty of those runs and `http-status-code` scored 1 on every one.
`/cms` measured 4,716.0ms of LCP and 647,063 script bytes, neither of them gated, and its final
URL is `/cms/login` — Payload's own redirect, which only the status and CLS assertions see.
**The gallery's image budget is the tightest thing on the diary**: 642,138 against 680,000 is
37,862 bytes of margin, exactly the figure ADR 0013 derived the limit from, so that budget has
not drifted and has no room in it either.

**The two diary configs, as measured at Phase 1's final review** — one
`npm run test:perf` inside `mcr.microsoft.com/playwright:v1.62.1-noble`, each config
building the app itself first. Both green then, and both green now; the paragraph below the
next table records the one time between those two points that `lighthouserc.book.json` was
not, and what it turned out to be:

| Route (config)             | Metric | Median of 5    | Gate                | Margin    |
| -------------------------- | ------ | -------------- | ------------------- | --------- |
| `/p/1` book (`.book.json`) | LCP    | **2,934.53ms** | 3000                | 65.47ms   |
| `/p/1` book                | script | 142,834 B      | 184,320             | 41,486 B  |
| `/p/1` mobile (`.json`)    | LCP    | **2,925.59ms** | 3000                | 74.41ms   |
| `/p/1` mobile              | script | 144,835 B      | 184,320             | 39,485 B  |
| `/gallery/patagonia`       | LCP    | 3,532.70ms     | 4000                | 467.30ms  |
| `/gallery/patagonia`       | script | 141,711 B      | 184,320             | 42,609 B  |
| `/gallery/patagonia`       | image  | 477,329 B      | 600,000             | 122,671 B |
| `/cms`                     | —      | —              | CLS and status only | —         |

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

| Route (`lighthouserc.admin.json`) | Metric | Median of 5             | Gate    | Margin    |
| --------------------------------- | ------ | ----------------------- | ------- | --------- |
| `/admin/sign-in`                  | LCP    | **2,928.4ms** (2,927.9) | 3000    | 71.6ms    |
| `/admin/sign-in`                  | script | 140,641 B (identical)   | 327,680 | 187,039 B |
| `/admin/sign-in/code`             | LCP    | **2,928.4ms** (2,927.0) | 3000    | 71.6ms    |
| `/admin/sign-in/code`             | script | 141,323 B (identical)   | 327,680 | 186,357 B |
| `/admin/reset`                    | LCP    | **2,926.9ms** (2,928.0) | 3000    | 73.1ms    |
| `/admin/reset`                    | script | 140,489 B (identical)   | 327,680 | 187,191 B |

CLS was **0.0000** on all thirty runs and `http-status-code` scored 1 on every one. Total
blocking time was 19–21ms throughout. The LCP spread is tight — across both runs the slowest
of the thirty is 2,941ms and the fastest 2,924ms — which is the framework floor ADR 0008
measured (2,023.2ms for one styled heading with no application code) plus three panes that
fetch nothing.

### THE PHASE 4 CLOSE-DAY MEASUREMENT — all fourteen admin URLs, one run, three gates separated

`npm run test:perf` on the day Phase 4 merges, against a production build on this host.
`lighthouserc.json` PASS, `lighthouserc.book.json` PASS, `lighthouserc.admin.json` **FAIL —
on two LCP assertions and nothing else.** Five runs per URL, seventy runs in all; the
figures below are read back out of that run's own reports rather than out of whatever was
newest in the directory, which is the mistake `lhci`'s accumulating output invites.

| URL                   | script transfer | CLS    | LCP median    |
| --------------------- | --------------- | ------ | ------------- |
| `/admin`              | 139,360         | 0.0000 | 2,929.2ms     |
| `/admin/account`      | 137,907         | 0.0000 | 2,925.7ms     |
| `/admin/book`         | 141,922         | 0.0000 | 2,930.8ms     |
| `/admin/cover`        | 140,873         | 0.0000 | 3,001.9ms     |
| `/admin/galleries`    | 142,827         | 0.0000 | **4,138.9ms** |
| `/admin/journeys`     | 140,198         | 0.0000 | 2,928.6ms     |
| `/admin/media`        | 143,035         | 0.0000 | **4,182.6ms** |
| `/admin/publish`      | 139,888         | 0.0000 | 2,927.6ms     |
| `/admin/reset`        | 140,527         | 0.0000 | 2,926.6ms     |
| `/admin/settings`     | 137,907         | 0.0000 | 2,924.8ms     |
| `/admin/sign-in`      | 140,684         | 0.0000 | 2,929.3ms     |
| `/admin/sign-in/code` | 141,445         | 0.0000 | 2,924.7ms     |
| `/admin/sign-in/done` | 137,907         | 0.0000 | 2,927.0ms     |
| `/admin/trash`        | 137,907         | 0.0000 | 2,925.8ms     |

**Two of the three admin gates are discharged and the third is not**, which is why they are
printed in three columns rather than summed into a verdict. The worst script transfer on any
admin URL is **143,035 bytes against the 327,680 gate** — 44% of budget at the heaviest
screen. CLS is **0.0000 on all fourteen** against 0.1.

**LCP: twelve of fourteen inside, between 2,924.7 and 3,001.9ms; two over.** The ten
individual readings of those two, from this same run:

```text
/admin/media      4182.62  4177.065  4185.505  4177.56  4185.825
/admin/galleries  4137.014 4139.924  4138.882  4145.15  4010.41
```

**Not one is under 3,085ms.** That is the form the shortfall has to be stated in, because a
median cannot carry the argument here — these two are the only admin screens whose five runs
disagree with each other, so a couple of hundred milliseconds between two medians of five
sits inside the instrument. What sits outside it is that neither screen has produced a single
run under the gate: not in these ten, and not in the ten the derivative-rung probes above
recorded, whose best readings were 3,775ms and 3,560ms — still 690ms and 475ms over.

The floor says the rest, and it is in the table: **twelve admin screens that draw nothing
land between 2,924.7 and 3,001.9ms**, so the framework alone spends about 95% of the gate
before a screen puts anything on top of it.

**The gate was not moved and no URL came out of the collector.** The decision this needs is
`docs/deviations.md` §73's and §80's, it is the owner's, and nobody has taken it.

#### 7.1 · The record

Every round that produced the numbers above: what was measured, on which machine, what moved and what did not.
**Detail:** `docs/testing/07-performance.md`

### 8 · Security

- **Tool:** Vitest + scripted probes.
- **Scope:** rate limits, lockout, OTP single-use, SVG rejection, EXIF stripping,
  authorization on every mutation.

**Detail:** `docs/testing/08-security.md`

### 9 · Migration

- **Tool:** Vitest.
- **Scope:** every migration runs up, down, and up again against a seeded database.

**Detail:** `docs/testing/09-migration.md`

## The documentation guards

**The checks in `apps/web/lib/docs/` are not a tenth suite. They are the ninth
whole-branch review turned into a command**, and they exist because of what that review
counted rather than what it found: **nineteen of its twenty-one findings were reached by a
script, not by judgement.** Nine rounds had each read roughly twenty thousand lines of
prose and each returned about twenty findings, and the rate never fell — because prose has
no compiler and this repository has chosen to carry an unusual amount of it. A tenth
reading would have found twenty more. So the class that a file read can settle is settled
by a file read, in `npm run verify`, on every commit.

They are modelled on the two guards of this shape the repository already had —
`e2e/ciRegistration.test.ts`, which refuses a spec that no CI line names, and
`apps/web/lib/auth/securityCitations.test.ts`, which refuses a citation that resolves to no
test case. `apps/web/lib/media/derivativeGeometry.test.ts` is the same move over SOURCE
rather than prose, and it inverts on **both** axes because MED-001 was one defect in three
places. On the tier axis it computes the uncropped derivative tiers from
`apps/web/collections/media.ts` and refuses any other tier appearing in the three ladders
that serve one whole photograph — the lightbox's `FULL_TIERS`, the download's
`DOWNLOAD_TIERS` and the book slots' `DERIVATIVE_PREFERENCE` — so a rung added years from
now is refused by a case written today. On the **ladder** axis it reads the population off
the filesystem: every file under `apps/web`'s source roots that reads `media.sizes` by
tier must appear either in the uncropped list (whose ladder is then checked) or in
`SQUARE_BY_DESIGN` with its reason. A fourth consumer therefore fails by name rather than
passing silently, which is what a hand-written list of three files would have done —
`readBookBundle.ts` was the third, and the browser sweep had not walked it. Like both, each one **fails by name**: it prints the document, the line and the
offending text, not an exception.

They live under `apps/web/lib/docs/` for the reason `securityCitations.test.ts` lives under
`apps/web/lib/auth/`: the `unit` project's `apps/web/lib/**/*.test.ts` glob already reaches
there, so they run in the PRE-COMMIT gate rather than only in CI, and they needed no new
include of their own. `apps/web/lib/docs/markdownCorpus.ts` is the one thing they share —
the repository's Markdown, listed by `git ls-files` rather than by a directory walk, since
a walk needs a skip list and a skip list is an enumeration that drifts.

**This list is an enumeration where an inversion was needed, and that is a known open hole.**
Nothing requires a guard in `apps/web/lib/docs/` to have a subsection here, so the subsections
below are maintained by whoever remembers — and in Phase 4 Task 15e nobody did: a ninth guard
shipped and §10 was not extended until the review caught it (review round 1, F6). The closure is
the shape §10.7 already uses against `vitest.config.ts` — read the population off the filesystem
rather than listing it: a case over `apps/web/lib/docs/*.test.ts` that fails naming any file with
no `### 10.N · \`<file>\``heading of its own. It is **not built**.
The cost is that it has to know which`.test.ts`files in that directory are guards rather than
unit tests of a helper —`markdownCorpus` has no subsection and should not — so it needs either
a convention or an exemption list with reasons, and that is more than the round that found it
could carry. **What would reverse this:** a third guard shipping into that directory without an
entry, which is the second recurrence and the point at which remembering has been disproved.

### 10.1 · `fencedProse.test.ts` — no prose is trapped in a code fence

Lexes every tracked Markdown file with `marked`, the same lexer a Markdown viewer runs, and
refuses a code block that reads as a paragraph: untagged, over forty words, carrying
sentence punctuation and at least `INLINE_MARKDOWN_LIMIT` marks of inline Markdown (bold,
code spans, emphasis, links). It also refuses a file whose fence lines do not pair up.

**It exists because a fix was reported as landed and had not landed.** ADR 0019 closed a
three-row measurement block one line early and reopened a block that ran to the end of the
file; the correction added three lines of prose saying the fence had been moved, INSIDE
that block, and never touched a fence. The document then asserted in the past tense that a
defect the reader was looking at had been repaired, and it survived a whole further review
that way (final review 9, F9-1).

Both questions are needed and neither subsumes the other: the defect's fences were
BALANCED — four of them — so counting could never have found it, and a block left open at
the end of a file swallows whatever is there without necessarily reading as prose.

**What walks past it, measured:** a swallowed paragraph shorter than forty words, and a
swallowed paragraph inside a fence carrying a language tag. Both are stated at the check.
The threshold was set from the corpus rather than guessed — the swallowed block scores
seven inline marks, and no legitimate untagged block in this repository scores more than
two.

### 10.2 · `pathCitations.test.ts` — every backticked path and identifier resolves

Over the LIVING documentation — `README.md`, `CLAUDE.md` and everything under `docs/`
except the two directories named below, so `docs/adr/*.md` and `docs/standards/*.md` are in.
`docs/qa/**` and `docs/superpowers/**` are excluded deliberately: they are dated records of
what was true when they were written, and requiring their citations to resolve would train
their authors to edit the record. `handoff/**` is the specification and is not ours to
correct.

**That exclusion has a cost, and it is recorded here rather than left as silence
(Phase 3 Task 13).** A sweep report is a live document on the day it is written — its
citations name files that exist right then — and for that one day nothing checks them.
`docs/qa/2026-09-08-media-pipeline-sweep.md` cites seventeen paths; they were resolved by
hand, because the alternative was to assert they resolved.

**Adding `docs/qa/**` to the corpus is the wrong fix, and that is the decision**, not an
omission. The corpus is fail-closed over EVERY file it contains, so a historical sweep
naming a file that has since been renamed would start failing — and the only ways to make
that run green are to edit the record or to grow an exemption list that quietly becomes a
second record. Both are worse than the gap.

**What would close it honestly: a write-time check over the NEWEST report only** — the
one the author is looking at, whose citations are claims about the tree as it is now,
rather than over the archive behind it. Task 13 deliberately did not build one: it is a
check with its own design decisions (which report is "newest", what happens on a branch
that adds two) and it was not a documentation task's to smuggle in. **Phase 4 Task 15
built it — see §10.8 — because this phase writes four reports into that directory, which
is what makes the gap worth a module.** The two design decisions are answered there.

A path resolves if git lists it, or lists a file with that basename; an ESM specifier's
`.js` is rewritten to `.ts` first. An identifier is a backticked token that is camelCase,
PascalCase or SCREAMING_SNAKE — that shape is the whole filter, because a list of English
words to exclude would be another enumeration — and it resolves if it appears anywhere in
this repository's own source.

`packages/ui` was listed as a package of this workspace for two phases and has never
existed (F9-6); `RESET_PATH` was attributed to the module that imports it rather than the
one that declares it (F9-11). Neither survives this.

Two exemption lists in that file — one for paths, one for identifiers, each named and
explained in its own TSDoc — carry what cannot resolve and should not: a report in the
untracked `.superpowers/` directory, a probe written to disk and deleted, a browser API, a
symbol a document says in its own next paragraph is gone. Each entry carries its reason,
and both lists are fail-closed in both directions: an entry no document quotes any more
fails, and an entry that starts resolving fails, so a list can neither rot into a hole nor
quietly excuse something real.

Note what that costs, because it is a real edge: the file excludes ITSELF from the source
corpus, so that its own exemption entries cannot resolve by quoting themselves. A constant
declared only in that file is therefore not resolvable from prose, which is why this
section describes the two lists rather than naming them in backticks.

### 10.3 · `configCitations.test.ts` — every quoted configuration value is read back

Each citation names the config, an extractor that READS THE VALUE OUT OF IT, and the
document that must quote it. **Nothing in that file holds a copy of a budget**: writing the
number there would be a third place for it to drift, and the check would then be edited to
follow the mistake. Reading the config means moving a gate fails the document that
describes it.

It covers the diary, book and admin script budgets, the gallery image budget, the three LCP
gates, `numberOfRuns`, all three measured viewports and the mobile device pixel ratio, the
published Postgres port, and the pure-domain coverage threshold. It also requires every
`unit` include glob in `vitest.config.ts` to be quoted in this document, and every
`lighthouserc*.json` at the root to be named by **each document that describes the
performance gate** — this one and `.github/workflows/ci.yml`.

**That list of documents has two entries because F9-9 recurred, in the second file, while
the first stayed corrected.** The workflow comment above the Lighthouse step said
`npm run test:perf` ran two lhci configurations and named two of the three, and went on
saying it for seventy-three commits after this document's copy of the same sentence was
fixed. A workflow comment is documentation — it is what a reader meets while looking at
the step it sits above — so it is read here too. The count itself is not guarded but
DELETED: the comment now names the three configurations and says all of them are gates,
which is `caseCounts.test.ts`'s doctrine applied one population over. A count check was
written first and rejected, because matching a `<count word> lhci configurations` shape fires on
two sentences of this document that are both correct — §7.1's past-tense record of what
was measured when it was measured, and §10.3's quotation of the defective sentence,
reproduced to explain it. That is this check's own documented limit, and rewriting a
historical record to satisfy a regex is the wrong direction.

Three of the ninth review's findings were this one defect in three shapes: an enumeration
here that omitted two of the `unit` project's include globs, so an auditor checking
CLAUDE.md §2.1's "no file is in neither config's include" audited a smaller set than the
config collects (F9-8); a bolded present-tense claim that `npm run test:perf` runs TWO
Lighthouse configurations, when it has run three since Task 11 (F9-9); and the one
containment cannot settle —

`npm run test:visual:container:update` was described as regenerating every baseline rather
than only the changed ones — the mode the OTHER script passes (F9-2). Both mode words
appear all over this document legitimately, so `contradictedSnapshotPairings` works by
PROXIMITY: the script named nearest before a `--update-snapshots=` is the one that
sentence describes, and the mode has to be the one that script's own compose service
passes. The sentence that shipped the defect is a fixture in the case, so the check is
proved able to report it rather than only to pass over the corrected text — and it cannot
tell a quotation from a claim, which is why the defective sentence is described here
rather than reproduced.

### 10.4 · `caseCounts.test.ts` — a count in prose is a floor, or it is deleted

**This is a repository rule, not just a check.** Eleven of the ninth review's twenty-one
findings were one sentence written eleven times: an exact count of a named test file's
cases, true the day it was typed and stale by the next task. Every earlier round produced a
share of the same shape, and every round corrected the numbers — which is the treatment
that guarantees the next round finds them stale again.

`securityCitations.test.ts` had already written the argument: _"Pinning the exact number
would fail every time a row gained a case, which trains its author to edit the number
rather than read the failure."_ The rule is now repository-wide. Where the magnitude is
worth saying, say **at least N** and let the check resolve it against the file; where it is
not, do not carry a number.

The check finds a backticked test or spec path followed within eighty characters by a
number and the word "case" or "cases", and asks two things: is it a floor (`at least`,
`no fewer than`, `or more`), and does the file it names declare at least that many case
declarations. A floor above what the file holds fails too, so a floor cannot become a
comfortable fiction.

**What it does not catch, stated rather than implied:** a count with no test file named
beside it, because nothing can resolve it; a count of a subset of a file's cases, which it
treats as a floor over the whole file and so judges more weakly than the sentence claims;
and a mispaired sentence that names one file and counts another's, which resolves against
the wrong file — where that was true here, the sentence was rewritten to name the file it
counts. Counts of other things in prose — shapes, configurations, documents — are the same
rule applied by a person; this is the population that recurred eleven times in one review.

### 10.5 · `standardsSections.test.ts` — every frozen section number still resolves

`CLAUDE.md` is a short core plus one reference file per section under `docs/standards/`,
and a split document rots three ways. This refuses all three: a `## N · …` section naming a
`docs/standards/` file that is not in the tree; a file in `docs/standards/` that no section
points at; and — the one that matters — a `CLAUDE.md §N` citation anywhere git lists that
names a section `CLAUDE.md` does not declare. There are hundreds of those citations, in
module headers and config comments as much as in prose, and the numbers are frozen because
of them.

It is what would have caught `adminGuardRegistration.test.ts`'s two citations of a
subsection 8.4 that has never existed. Both meant the Husky pre-commit hook, which is
`CLAUDE.md` §11's territory, and both are corrected; the point is that `verify` was green
beside them for three phases.

**A pointer that resolves is not a rule that exists, so two cases go behind it.** Every
subsection `CLAUDE.md` declares must be a heading in the reference file its section points
at, and that heading must carry a body — deleting `### 2.3 Test quality`'s twelve lines of
rules from `docs/standards/02-testing.md` left 109 files and 1,638 cases green when the
guard checked structure alone, which is the split's whole exposure. The stub floor is
measured rather than picked, in the metric the check counts in — characters that are not
whitespace: the smallest section it currently binds is §2.2 at 276, and the smallest section
in `docs/standards/` at all is §8.3 at 134. **What it catches is deletion, not evisceration.**
A heading kept with a content-free sentence of the same length in its place passes, and a
check that judged whether prose means something would not be a check; the floor's own comment
says so at the constant. **A third case gates `CLAUDE.md`'s word budget**, because size is the one
property the structure cannot imply: every section can keep its reference file, its pointer
and its citations while the file walks back to the 3,680 words the split removed.

A subsection cited as `§8.1` resolves against the reference file too, not only the core.
§8.1 and §8.3 are real, correctly numbered sections that live in
`docs/standards/08-git-workflow.md`; reading the core alone would have failed a correct
citation of either, and a guard that refuses valid input is a guard people route around.

It guards the second split of the same task too: every `docs/testing/<suite>.md` this
document points at exists, and every file in that directory is pointed at. There is no
citation case for this one, because `docs/testing.md` kept every heading it had — its
numbers are guarded by their own presence rather than by a scan.

Declared sections come from `CLAUDE.md`'s own numbered headings plus §0's numbered rules
(which is what a `§0.N` citation names), reference files from `readdirSync`, citations from
`git ls-files` — nothing here lists a known-good value. The sentinel that proves the
resolver can answer "no" is assembled from two string pieces rather than written out,
because written out it would be a live citation inside the corpus the check scans, and this
file is deliberately NOT excluded from that corpus.

### 10.6 · `securityRequirements.test.ts` — no requirement is lost in a rewrite

Derives the requirement list from `handoff/design_handoff_travel_diary/SECURITY.md` — every
top-level bullet, read out of the specification of record, which is evidence and is never
edited — and requires each one to be quoted verbatim by a discharge section of
`docs/security.md`. Both directions: a marker quoting words the handoff does not state fails
too, so a requirement cannot be paraphrased into agreement. It also refuses an index link
that names no heading in the file, since the index is how a reader reaches a section now
that the table is gone.

It exists because `docs/security.md` was a 642KB table and a restructure of a document that
size can silently drop a row — a dropped security requirement being the failure nobody
notices until it matters. It found three on its first run: keeping location opt-in per
journey, the diary served with no credentials attached, and separate credentials for the
media bucket. None had a row in the table, while that document's first sentence said every
requirement had a named home. All three have sections now.

**What it does not catch, stated rather than implied:** the handoff states two requirements as
paragraphs rather than as bullets — `users.otpRequired` decided server-side, and the gallery's
download serving a derivative through our own handler rather than a bucket URL — and a
paragraph has no shape a derivation can separate from the prose around it. Both have a section
in `docs/security.md`, the second inside "Downloads through our handler", but this check is not
what keeps either there. Nor does it judge whether a discharge is
true — that is `securityCitations.test.ts`'s subject.

### 10.7 · `coverageThresholds.test.ts` — no measured file is gated by nothing

`vitest.config.ts` has no repository-wide coverage floor: it was removed because the layers
that carry real behaviour already have stricter per-glob gates, and the only files a
repo-wide number could bind are the ones no glob names. Removing it made the fall-through
set — every file inside the `include` that matches no threshold key — the thing that has to
stay empty, and it was enumerated by hand when the floor came out. This is that enumeration
as a check, so the next file to fall through fails its own commit.

It reads the `include`, `exclude` and threshold keys out of `vitest.config.ts` rather than
restating them — a copy would be the drift it guards against — and matches with `picomatch`,
which is what Vitest's own `resolveThresholds` uses, so it agrees with the gate instead of
approximating it. The file list is git's, so a file written and not yet staged is judged
too.

Written by the Phase 3 standards review. The task that removed the floor stated this gap in
its report as an open concern; a stated hole is reviewable, and it is still a hole.

#### 10.7.1 · The three files in neither config's `include`, audited at the Phase 4 close

`CLAUDE.md` §2.1 ends "**No file is in neither config's `include`.**" §10.7 keeps the
fall-through set empty _inside_ the include; this is the audit of what is outside it, written
down because it had lived only in a commit message, which is not a register.

**The predicate, so the count is reproducible rather than asserted.** Take every path git
lists under `apps/web`, `packages`, `scripts` and `eslint-rules` ending `.ts`/`.tsx`/`.js`/
`.mjs`, drop `*.test.*`, `*.spec.*` and `*.d.ts`, and match the remainder with `picomatch`
against every path or glob string in **both** configs' coverage `include` arrays — exact
paths included, because this repository's excludes and includes name files as well as globs.

**Three application files match neither:**

| file                                      | what it is                                                          |
| ----------------------------------------- | ------------------------------------------------------------------- |
| `apps/web/app/(payload)/cms/importMap.js` | generated by Payload; a two-line map                                |
| `apps/web/payload-types.ts`               | generated by Payload; carries its "DO NOT MODIFY IT BY HAND" banner |
| `apps/web/next.config.ts`                 | a key-value object literal with no branch in it                     |

**What was scoped out of that count, said rather than left implicit**, because "three" reads
as exhaustive and is only exhaustive after the harness is set aside: `e2e/support/*.ts`,
`playwright.config.ts`, `eslint.config.js`, `vitest.config.ts`, `vitest.dom-setup.ts` and
`vitest.integration.config.ts` are also matched by neither. They are the harness rather than
the application — `eslint-rules/**/*.js` is **in** the include precisely because it is not —
and the Phase 4 close did not count them. A reader who counts differently will get a
different number, which is why the predicate is above.

**This is an argument, and the repository has a stronger precedent against itself.**
`vitest.integration.config.ts` includes `vitest.integration.globalSetup.ts` with the comment
that §2.1 is "satisfied by **inclusion rather than by an argument**", and then `c8 ignore`s it
in the file with the reason at the ignore. By that precedent `next.config.ts` — the one of the
three that is hand-written rather than regenerated — belongs in an include with a per-file
ignore, and the two generated files belong in an exclude with their reason beside them. **That
was not done at the Phase 4 close**: it is a change to the gate, and a closing commit is the
wrong place to move a gate. It is recorded here instead so the next change to either config
inherits a decision rather than a silence.

### 10.8 · `newestSweep.test.ts` — the newest `docs/qa/` report’s citations resolve

The write-time check §10.2 asked for, over the newest report alone, so the archive behind
it stays a record. It shares §10.2's rules rather than copying them: both import
`apps/web/lib/docs/citations.ts`, which is where `isPathCitation`, `isIdentifierCitation`,
`resolvesToAFile` and `sourceCorpus` now live. A second copy of those regexes drifting
from the first would mean a report checked by rules the documentation is not.

**Which report is "newest": the date in the name, not `mtime`.** `CLAUDE.md` §10's
convention puts it there, and a checkout cannot lose it — a fresh clone gives every file
the same modification time, and checking out an old branch would make a two-phase-old
report the newest thing on disk.

**A branch that adds two: both are checked, and so is a third.** §10 asks for one sweep
per screen group, so a phase closing out writes several on one day. Every report carrying
the newest DATE is checked, which needs no tiebreak — and a tiebreak is exactly what would
have dropped three of this phase's four reports on the floor.

**No exemption list**, deliberately: this corpus is one day old, so a citation in it that
names nothing is one its author can still correct. A report wanting to name something this
tree does not hold — a screenshot under `test-results/`, say — puts the file in
`docs/qa/assets/` and cites that. (§10.2's own two lists are a different problem on a
different corpus — four phases of documents, some of whose citations cannot resolve and
should not.)

**The date has a ceiling as well as an ordering.** A filename pattern alone accepts
`2026-13-45-…`, which sorts above every real report and would become "the newest" for ever —
every genuine report written afterwards unchecked, the non-vacuity floor still met by that
one file's backticks, and the guard green while guarding nothing. So a date must be a day
the calendar has, and must not be more than **two** days past the runner's own.

Two rather than one, and the arithmetic is the reason rather than a hedge: a report is named
by its author's calendar and checked on the runner's, the inhabited offsets run from UTC−12
to UTC+14, and 26 hours is MORE than a day — 01:30 on the 3rd at UTC+14 is 23:30 on the 1st
at UTC−12, two calendar dates apart. A one-day ceiling refuses a real report written on a
real machine. Two is the whole of that spread and costs nothing, because what the ceiling is
for is a typo — `2099-`, `2062-`, `2026-13-45` — and every one of those is months or years
out, not days. The constant is pinned to that arithmetic by a case rather than to a literal,
so setting it to one or three fails. A report failing either test is named in a failure
rather than skipped.

It is proved able to fail rather than assumed to be, and the proofs below were re-run after
the ceiling was added rather than carried over from before it. A report dated **today**
naming a module and a symbol that do not exist turns both resolution cases red and names the
planted file (6 pass, 2 fail). The same file dated **2099** turns exactly one case red, and
it is the impossible-date one (7 pass, 1 fail) — the ceiling refuses it before the citations
are read, which is the whole point of the ceiling and is why the proof of the resolution
cases has to use a date inside it. A report with no backticked run in it turns the
non-vacuity case red; a selection that stops comparing dates turns the selection case red;
and the ceiling constant set to one or three fails the case that derives it.

### 10.9 · `sectionCitations.test.ts` — every `<document> §N` resolves to a section that document declares

§10.2 is fail-closed on a backticked path and a backticked identifier. A **section number**
was checked by nothing except §10.5, which resolves the `CLAUDE.md` family and only that
family — and a wrong section number is worse than a path that resolves nowhere, because it
reads as confirmed. `docs/deviations.md` §98 is the entry; Phase 4 Task 12 found one by hand
with every gate green.

**The rule, which is also where the count comes from.** A section citation is a reference
that NAMES ITS DOCUMENT: a `.md` file name, optionally backticked, optionally possessive,
immediately followed by the mark and a dotted number. A line wrap between the two is still
immediate — comment continuation included — because that is how most of them are written in
module headers. A bare `§6` and a document named by a phrase ("design spec §8.2") are
declined, and counted by subtraction on every run so the uncovered share is a number rather
than a sentence.

**What a number resolves against** is the named document's own numbered headings AND the
numbered items beneath them, read off the document rather than configured per document:
three documents here put a section's parts in a list and are cited that way (`CLAUDE.md`
§0.9, `SCREENS.md` §3.2, `docs/deviations.md` §13.4). A document is found by full path or
by basename, the way §10.2 finds a file.

**The `CLAUDE.md` family is routed to §10.5, not re-resolved here**, because that guard
already resolves it against the `docs/standards/` split it also guards. Since review round 1
both read the SAME pattern out of `apps/web/lib/docs/citations.ts`, so the routing cannot
hand a spelling to a guard that does not accept it. The routing is held open at both ends by
two floors: one on the citations this guard resolves and one on the family it passes on, so
the exclusion can neither widen into everything nor collapse into nothing.

Its first run was red on three citations that were really wrong, in two files, and nothing
had ever questioned them. It is proved able to fail rather than assumed to be: deleting the
numbered-item rule turns more than a hundred citations unresolvable; a resolver that answers
yes to every number, or that treats any line carrying a digit as a heading, reddens the
sentinel case; and the parser is exercised against a document written in the case itself,
including a wrapped citation and the paragraph break that must NOT be read as one.

### 10.10 · How to run them

```
npx vitest run --project unit apps/web/lib/docs        # all of them
npx vitest run --project unit apps/web/lib/docs/fencedProse.test.ts
npm run verify                                          # what Husky runs
```

They read files and compare strings: no browser, no server, no Postgres. The whole
directory runs in well under a second.

## Test quality rules (apply to every suite above)

From `CLAUDE.md` §2.3: test names read as sentences (e.g. "returns the previous page
when the reader flips backward"); one behaviour per test; Arrange-Act-Assert, visually
separated; no mocking what we own — mock the network boundary, the clock, the
filesystem, never our own modules; fixtures are factories with overrides, never shared
mutable objects; a test that has never failed is unproven — verify it fails when the
behaviour is broken.
