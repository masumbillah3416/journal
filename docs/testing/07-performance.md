# 7 · Performance — the detail

The detail for `docs/testing.md` §7. That document states the suite's tool, its scope
and how to run it, and points here; everything else about the suite is below. The section
numbers are `docs/testing.md`'s and do not change.

#### 7.0.1 · Every number above was measured on ONE machine, CI is a second one, and CI's result is UNRESOLVED

**Read this before treating any margin in the tables above as headroom.** Every median in
§7.0 was collected on this developer's Windows host, against a production `next build` +
`next start`. The `browser` job in `.github/workflows/ci.yml` runs the same
`npm run test:perf` on a shared GitHub-hosted runner inside
`mcr.microsoft.com/playwright:v1.62.1-noble` — a different CPU, a different disk, a
different amount of contention, and no measurement of its own recorded anywhere. The
budgets are hard gates on both machines while having been characterised on one.

**The margins are the reason this matters rather than a footnote.** The LCP gate is
3000ms (ADR 0008), and the medians above clear it by roughly 65–75ms: 2,934.53ms on the
book surface, 2,925.59ms on the mobile surface, 2,926.9–2,928.4ms on the three admin
screens. ADR 0008 measured the framework floor at 2,023.2ms for one styled heading with
no application code, so most of that number is Next.js and Lighthouse's own simulated
throttling rather than this repository's work — and under three per cent of it is the
whole distance to the ceiling. A slower, noisier runner can therefore fail the step with the
application unchanged, and can equally fail it because something is genuinely wrong.
Neither can be assumed.

**The status: the first CI run's `Lighthouse CI budgets` step failed, and its numbers have
not been read.** They cannot be read from this machine: the GitHub CLI is not installed
here, the Actions logs endpoint answers 403 without credentials, and `CLAUDE.md` §7.1
forbids routing anything through a third-party service to work around that. No repository
content was sent anywhere to try. So this is recorded as **UNRESOLVED**, which is the
honest state, rather than as a budget that needs loosening.

**What would settle it, in order.** (1) An authenticated read of that step's log — the
GitHub CLI's run-log view, or the Actions web UI — which prints, per URL, which assertion
failed, its expected ceiling and the value observed. (2) Deciding from that which of three
things it is: a failing `http-status-code` assertion, which is a route not serving on the
runner at all and a real defect rather than a timing question; an LCP over the ceiling by
noise, which is a question about how the gate is MEASURED; or an LCP over the ceiling
consistently, which is a question about the application. (3) For the middle case only, a
decision taken as an ADR with the runner's own five-run medians in it — the way ADR 0014
settled which viewports the gate is measured at — never by moving a ceiling to make a red
run green.

**No budget in §7.0 was changed by this entry, and none should be.** The paragraph
immediately below is this document's fullest record of why: `/p/1` went red in Phase 2,
the bimodal spread was reached for as the explanation, and the real cause was a stylesheet
crossing the route-group seam so that the diary served four render-blocking sheets where
`main` served two. **The budget was never moved**, there or anywhere in §7.1. A budget
moved to make a red run green is the one outcome this section exists to prevent.

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

### CI's Lighthouse numbers now reach the run page, because the logs do not

Three CI runs of the `/p/1` gate read red, green, red on a budget with roughly 72ms of
local margin, and every one of them was diagnosed by **elimination** rather than by reading
a number: `/actions/jobs/<id>/logs` answers `403 Must have admin rights` without a token,
and `gh` is not installed on the authoring machine. Widening the budget would have hidden
the question. Instead `scripts/run-lighthouse.mjs` emits GitHub **workflow commands**, which
become annotations on the run's own page and are readable without log access.

- A failed assertion becomes one `::error::` line naming the audit, the configuration, the
  URL, the limit, the median — and **every individual run value**, which is what tells a
  slow runner apart from one slow run on a median gate.
- A passing configuration emits one `::notice::` line with each gated audit's median against
  its limit. A gate that fails intermittently is diagnosed as much by its margin when green
  as by its number when red, and a notice costs nothing on a passing run.
- Both are guarded by `GITHUB_ACTIONS`, so a local `npm run test:perf` prints exactly what it
  always printed.

**The assertion-results file lhci writes holds only FAILURES unless it is asked not to, and
that was measured rather than assumed.** `@lhci/utils/src/assertions.js`'s `getAllAssertionResults`
ends by filtering out everything that passed unless `includePassedAssertions` is set, so on a
green run the file is `[]` — checked against this repository's own `.lighthouseci/`, and
checked again by calling the engine directly over fifteen saved runs: **0 results without the
option, 12 with it**, each carrying its limit, its median and its five values. A notice built
on the default file would have printed nothing forever. The option is therefore passed as
`--assert.includePassedAssertions`, which `lhci autorun` forwards to its `assert` child, and
only under `GITHUB_ACTIONS` — turning it on in the three `lighthouserc*.json` files would
also change what a local run prints, since lhci then lists every passing assertion itself.

**What decides what each line says is a pure function, not the script — including what an
unreadable results file means.** No Vitest project can execute `run-lighthouse.mjs` — it
spawns `npx lhci`, which needs a build, a browser and minutes — so anything decided inside it
is decided untested. The first version still kept one decision there: a `try`/`catch` around
the read that mapped any failure to `undefined`, under the whole-file `c8 ignore`. Changing
that `undefined` to `[]` left every gate green while CI would have annotated a dead run as an
empty gate. The shell now passes `readResults`, a function returning the file's text, and the
module owns both the failed read and the unparseable one. The parsing and formatting live in
`scripts/lighthouseAnnotations.mjs` and are driven by
`scripts/lighthouseAnnotations.test.js`: a failure becomes one error line with every run
value; a passing set becomes one notice and no errors; a results file that was never written
and one whose contents will not parse say so in two DIFFERENT lines, because they are two
different events and only one of them means the gate ran; and an assertion's `auditProperty`
is part of its name, which is the
defect running it against a real `.lighthouseci/` found — every `resource-summary:*:size`
budget had been printing under one indistinguishable name. Every behaviour has a mutation
that was watched failing.

`scripts/**/*.mjs` joined `vitest.config.ts`'s coverage `include` in the same commit, gated
at **100% lines, branches and functions** — the number the directory actually achieves.
`run-lighthouse.mjs` sits in it behind a whole-file `c8 ignore start`/`stop` carrying its
reason: nothing can execute it, so it gets the "nothing can measure this" treatment §2.1
names rather than an exclusion promising a pass that does not exist.

**That hint has to be the file's FIRST line, which is a second ignore-hint quirk worth
recording beside the bracketed-directory one above.** Written after the module header,
`run-lighthouse.mjs` reported **67 uncovered lines** and the `scripts/**` threshold failed at
60.81%. Moved to line 1, the same file reports 0 of 0 and the directory reports 100/100/100.
Both measured, in consecutive runs. Revisit when `@vitest/coverage-v8` changes version; until
then, a whole-file ignore in this directory goes first, above the header.
`apps/web/app/(admin)/admin/media/upload/route.ts` carries the identical wrapping after its
own header and is **unmeasured either way**, so it settles nothing about the position — the
sentence that used to appear here said it "is ignored correctly at" that position, which is
the claim finding 13 removed from three files three paragraphs above and which nothing can
show: a consumed hint and a file no test imports both report `0 | 0 | 0 | 0`. What is
measured is the pair of `scripts/**` runs, and that pair is about `.mjs` in this directory
and nothing else. Its test glob,
`scripts/**/*.test.js`, is on the `unit` project beside `eslint-rules/**/*.test.js`; both are
plain JavaScript because `node` runs these files with no loader in front of them.

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
_where_ it is measured: the book at 1350x940 with the surface cookie pinned, the mobile
surface at Lighthouse's own phone emulation, both on the same `simulate` throttling
(150ms RTT, 1,638Kbps, 4x CPU). The raise itself is recorded as a departure from the
plan in `docs/deviations.md` §23 — Task 13 Step 5 said not to raise it — and the gate
was reported red and unraised for several rounds before it moved.

#### 7.1 · The record

- **Tool:** Lighthouse CI (`@lhci/cli`, `lighthouserc.json`, `lighthouserc.book.json`
  and — since Phase 2 Task 11 — `lighthouserc.admin.json`)
  - custom probes (the custom probes — 60fps flip measurement, N+1 query detection — are
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
- **`npm run test:perf` ran TWO lhci configurations when this was written, and both were
  gates.** The admin's is a third since Phase 2 Task 11; §7.0 above is the current state,
  and this bullet is the record of why the split exists. Collect
  settings in lhci are per-run, not per-URL, so the diary's desktop viewport cannot share
  a run with the gallery's: at 1350x940 `/gallery/<slug>` picks larger derivatives and
  fetches 1,229,466 bytes of image against its 600,000 budget (ADR 0013), which would
  re-base a budget this change has no business touching. So `lighthouserc.json` collects
  `/p/1`, `/gallery/patagonia` and `/cms` on Lighthouse's phone emulation with no pinned
  cookie, and `lighthouserc.book.json` collects `/p/1` alone on the desktop viewport with
  the cookie. Every one of them keeps `numberOfRuns: 5` and
  `aggregationMethod: "median"`. If you add a route, add it to the first file unless it
  needs a viewport the first file cannot give it — and add the file itself to
  `npm run test:perf`, which `e2e/ciRegistration.test.ts` requires by reading the
  `lighthouserc*.json` files off disk.
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
