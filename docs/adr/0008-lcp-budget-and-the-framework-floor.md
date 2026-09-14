# 0008 — The LCP budget and the framework's floor beneath it

**Status: DECIDED, 2026-09-02, and AMENDED IN ITS NUMBER on 2026-09-14 — the gate is
`3085` today, not the `3000` this document states throughout.** The amendment is the
final section of this file and is the current state; everything before it is left as it
was written, because it recorded a decision that was correct on the evidence of its own
day and on the machine that evidence came from. **The old 3,000 was not simply wrong** —
see that section.

The repository owner chose **Option 1** (§"Options"
below): accept a higher budget for this specific simulation, set from the measured
floor rather than from intuition. This was the owner's call, not a task's — the
measurement and the four options were produced by the investigation below and reported
without a recommendation taken; the choice among them belongs to whoever owns the
product's promises, and CLAUDE.md §6 is theirs to amend.

`lighthouserc.json`'s `/p/1` LCP assertion is now `error` at `maxNumericValue: 3000`,
still asserted with `aggregationMethod: "median"` over `numberOfRuns: 5` — neither of
those was touched, per this document's own "What was deliberately NOT done" below,
which still holds. `CLAUDE.md` §6 now names the Lighthouse preset and throttling the
number is measured under ("`simulate`: 150ms RTT, 1,638Kbps, 4x CPU, median of 5") and
cross-references this ADR, rather than promising a bare "≤ 2.5s" the measurement above
shows this stack cannot reach while rendering the design.

**Why 3,000 and not some other number past the floor.** It is not merely "the floor
plus a round allowance" — it is chosen to still catch a real regression. ADR 0006's
image-window defect, before its fix, measured `/p/1` at **3,247.14ms** (this document's
Context section) and separately **~3,170ms** in that ADR's own before/after table — both
comfortably over 3,000. A gate at 3,000 would have failed that build exactly as the
2,500 gate did; raising the budget to cover the framework's floor does not also cover a
regression this project has already shipped and fixed once. Re-reverting that fix and
re-measuring under this document's own five-run/clean-volume method would confirm the
figure directly, but is expensive under that method (a full `next build`, a wiped
`.next` volume, and five throttled Lighthouse runs per configuration, per §"Method" of
`.superpowers/sdd/2026-09-01-phase-1-public-diary/lcp-floor-report.md`) and is not done
here; the ADR 0006 measurement is taken as sufficient evidence instead, as this
document's own "Options" section anticipated ("it would still catch the image
regression ADR 0006 fixed, which measured 3,170ms").

**THE METHOD, WRITTEN HERE RATHER THAN DELEGATED.** This ADR set the 3,000ms gate the
diary is measured against and pointed at a `.superpowers/` report for how to reproduce the
number — a directory that is not tracked (`git ls-files .superpowers` returns nothing) and
that no commit in this repository has ever held. Phase 2's final review found four ADRs
doing that (finding 39). The method is four steps and belongs in the decision:

1. Delete `apps/web/.next` — a warm build makes the first run of any config fast and the
   median is then a median of the wrong thing.
2. `npm run test:perf`, which builds with `npm run build -w apps/web`, starts the
   production server and runs Lighthouse **five times** per URL.
3. Read `largest-contentful-paint.numericValue` from the five
   `lhci-reports/**/localhost-p_1-*.report.json` files and take the **median** — the same
   `aggregationMethod` the config asserts on.
4. The throttling is **Lighthouse's own default and no config here pins it**:
   `throttlingMethod: "simulate"` at 150ms RTT, 1,638Kbps and 4x CPU. Saying it was
   "the config's, not the machine's" was half right and the wrong half — it is not the
   machine's, and it is not written down either, so a Lighthouse release that retunes the
   preset moves this gate with no diff in this repository. §"The measurement" below says
   the same thing correctly, and the two contradicted each other (Phase 2's final review).
   The VIEWPORT is pinned, in each config: `lighthouserc.book.json` at 1350x940 desktop
   and `lighthouserc.json` at 412x823 mobile at DPR 1.75 — the mobile one in Phase 2's
   final round, having been an unpinned default until then, which is the same defect one
   parameter along. Pinning the throttling is the obvious next move and is deliberately
   NOT made here: it would change the number this ADR is written against, and that is a
   budget decision rather than a documentation fix.

Measured by that method at the close of Phase 2, with `apps/web/.next` deleted first: the
book surface **2924.9 / 2925.4 / 2927.2 / 2927.4 / 2930.0ms, median 2927.2**, and the
mobile surface **2925.7 / 2926.6 / 2933.9 / 2934.7 / 2937.3ms, median 2933.9** — both
against the same 3,000ms, unmoved, with 73ms and 66ms of margin.

### The margin is thin, and a Phase 3 reader should know it before believing a red run

**This gate holds on about 70ms of a 3,000ms budget, and individual runs have come within
11ms of it.** Recorded here rather than discovered later:

| When                                 | Surface       | Slowest of five | Margin on that run |
| ------------------------------------ | ------------- | --------------- | ------------------ |
| Phase 2, third review (warm `.next`) | mobile `/p/1` | **2,989.4ms**   | **10.6ms**         |
| Phase 2, third review (warm `.next`) | book          | 2,946.1ms       | 53.9ms             |
| Phase 2, close (cold `.next`, above) | mobile `/p/1` | 2,937.3ms       | 62.7ms             |
| `fdff259`, before F68 was fixed      | mobile `/p/1` | 3,078.3ms       | **red**            |

Three consequences, and none of them is "raise the budget":

1. **`aggregationMethod: "median"` is what keeps this green against that spread**, and the
   "What this decision does not change" note below is therefore load-bearing rather than
   incidental. The lhci default takes the best of five and would loosen the gate; taking
   the worst of five would fail it on a run where nothing had regressed.
2. **The throttling behind the number is Lighthouse's own unpinned default** (see the
   Status note above). A Lighthouse release that retunes the `simulate` preset moves this
   gate with no diff in this repository. That is the most likely way `/p/1` goes red
   without a code change.
3. **A red `/p/1` should be re-measured five times before it is believed, and against a
   cold `.next`.** A single run at 3,010ms is inside this spread. What distinguishes a real
   regression is the MEDIAN moving, which is what ADR 0006's image-window regression did —
   ~3,170-3,247ms, not one sample over the line.

**What this decision does not change.** `resource-summary:script:size` stays at
`184320`; `cumulative-layout-shift` stays at `0.1`; `aggregationMethod: "median"` stays
in place specifically because the lhci default (`optimistic`) takes the best of five
runs and would silently loosen the gate in a way this decision does not intend. Nothing
else in `lighthouserc.json` moved.

## Context

`CLAUDE.md` §6 sets "LCP (diary, 4G) ≤ 2.5s" as a hard gate. That budget was written
in Phase 0, before any route existed, and `lighthouserc.json` has enforced it on
`/p/1` since Phase 1 Task 1 — deliberately, ahead of the page it measures.

Four investigations have now attacked `/p/1`'s LCP. Three eliminated a suspect
without moving the number:

- **Images.** `/p/1` fetched 20 images and 1.83MB; it now fetches none
  (`docs/adr/0006-diary-image-window.md`). LCP fell from ~3,170ms to ~2,635ms and
  stopped.
- **Page-component JavaScript.** 11,465 bytes of page components and CSS-module class
  maps left the client chunk (`docs/adr/0007-server-rendered-page-faces.md`). LCP
  moved 0.3ms.
- **Fonts.** A previous task measured a four-face build at 2,632.98ms against a
  two-face baseline of 2,634.66ms and concluded fonts were free. **That conclusion was
  an artefact and this document withdraws it** — see §4.

Each of those looked for a cost this repository had added. None of them asked what
the route costs before this repository adds anything. This document answers that.

## The measurement

**Method.** Five Lighthouse runs per configuration, `throttlingMethod: "simulate"`
(Lighthouse's default: 150ms RTT, 1,638Kbps, **4× CPU**), median reported — the same
configuration `lighthouserc.json` asserts. Every run inside
`mcr.microsoft.com/playwright:v1.62.1-noble` against a production `next build` served
by `next start`, on a **freshly wiped `.next` volume per configuration**, with every
static asset's status code checked to be 200 before collecting. Nothing left this
machine (CLAUDE.md §7.1).

**The probe.** A deliberately minimal route was added to this same application, at
`app/(probe)/lcp-floor/page.tsx` with its own bare root layout, measured, and then
**deleted** — it is not in the tree. It was, in full:

```tsx
const LcpFloorProbe = (): React.JSX.Element => (
  <main>
    <h1 style={{ fontSize: '124px', color: '#2f4a47', margin: '48px' }}>Wanderings</h1>
  </main>
)
```

One server component. One heading. An inline style, so not even a stylesheet request
stands between the document and the paint. No client component, no `next/font`, no
image, no data fetch. Its layout is `<html lang="en"><body>{children}</body></html>`
and nothing else. Alongside it, a plain static HTML file with the same heading was
served from `apps/web/public/`, to separate "what this framework costs" from "what
this measurement costs for any page at all".

### The floor

| Route                                | LCP median     | render delay | script bytes | chunks | requests |
| ------------------------------------ | -------------- | ------------ | ------------ | ------ | -------- |
| static `.html`, same server, zero JS | **900.8 ms**   | 450.4 ms     | 0            | 0      | 2        |
| minimal Next route, one `h1`         | **2,023.2 ms** | 1,571.8 ms   | **137,986**  | **6**  | 9        |
| `/p/1` as shipped before this task   | 2,488.2 ms     | 2,035.5 ms   | 141,632      | 7      | 14       |

Five runs each: static 900.4 / 900.6 / 900.8 / 901.0 / 901.6 · minimal 1504.2 /
1505.0 / **2023.2** / 2023.6 / 2023.7 · `/p/1` 2485.1 / 2487.2 / **2488.2** / 2488.5 /
2493.5. CLS 0 on all three.

**A route with no application code in it at all models 2,023ms of a 2,500ms budget —
81% of it — and downloads 137,986 bytes of JavaScript to render one heading.** Those
six chunks are byte-identical to six of the seven `/p/1` loads. React and the Next App
Router client runtime ship on every route in this application whether or not anything
on it is interactive; a page with no `'use client'` anywhere pays the same.

The gap between the two floors is the framework's: **1,122ms of simulated LCP, and
137,986 bytes, to render markup that a static file renders in 901ms.**

### Where `/p/1`'s render delay goes

Main-thread work is reported by Lighthouse as observed (unthrottled) trace time;
Lantern multiplies CPU nodes by 4. Both columns, for the median run of each:

| Task group                   | minimal route | `/p/1`       | `/p/1` ×4    | attributable to us |
| ---------------------------- | ------------- | ------------ | ------------ | ------------------ |
| Script Evaluation            | 108.8 ms      | 149.9 ms     | 600 ms       | +164 ms            |
| **Style & Layout**           | 5.8 ms        | **128.4 ms** | **514 ms**   | **+490 ms**        |
| Other                        | 54.8 ms       | 88.5 ms      | 354 ms       | +135 ms            |
| Script Parsing & Compilation | 19.1 ms       | 33.0 ms      | 132 ms       | +56 ms             |
| Garbage Collection           | 0             | 9.1 ms       | 36 ms        | +36 ms             |
| Parse HTML & CSS             | 1.4 ms        | 8.3 ms       | 33 ms        | +28 ms             |
| Rendering                    | 0.8 ms        | 5.5 ms       | 22 ms        | +19 ms             |
| **TOTAL**                    | **190.6 ms**  | **422.8 ms** | **1,691 ms** | **+929 ms**        |

`/p/1`'s 2,035.5ms render delay is therefore ~1,691ms of simulated CPU plus ~345ms of
simulated network for the script chain. **Of it, 1,571.8ms is the floor and 463.7ms
(23%) is ours** — and the largest single item we own is **Style & Layout, not
script**: laying out 33 server-rendered page faces, which is not a defect but the
design spec's §8 requirement that every page's content be in the served HTML so the
deep links are indexable.

### Which scripts, by name

`bootup-time`, observed, for the median `/p/1` run:

| Chunk                        | transfer    | raw       | eval     | parse   | ×4 total   | what it is                                                                                                                                                                                                 |
| ---------------------------- | ----------- | --------- | -------- | ------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `299ekdt-sjm6b.js`           | 72,280 B    | 229,282 B | 130.7 ms | 9.0 ms  | **563 ms** | **React DOM client + Next App Router runtime** (`react-dom`, `hydrateRoot`, `createRoot`, `MessageChannel`, `onRecoverableError`, `FlightRouterState`, `createFromReadableStream`, `next-route-announcer`) |
| the `/p/1` document          | 16,862 B    | —         | 8.7 ms   | 10.1 ms | **687 ms** | the inline RSC flight payload plus the style/layout of 33 page faces                                                                                                                                       |
| Unattributable               | —           | —         | 2.7 ms   | 0       | 309 ms     |                                                                                                                                                                                                            |
| `1vgpv7vwitdbl.js`           | 43,582 B    | 156,317 B | **0**    | **0**   | **0**      | Next's client router/prefetch layer (`prefetch` ×81, `FlightRouterState` ×14, `IntersectionObserver`). 24,911 B of it unused. Downloaded, not executed before LCP                                          |
| `0if-vqkhyn-zc.js`           | 8,919 B     | 31,423 B  | 0        | 0       | 0          | Next client hooks (`usePathname`, `useSearchParams`)                                                                                                                                                       |
| `turbopack-0u9g73elxfcgm.js` | 4,845 B     | 10,947 B  | 0        | 0       | 0          | Turbopack module runtime                                                                                                                                                                                   |
| `33t46atd3n2zd.js`           | 4,228 B     | 14,434 B  | 0        | 0       | 0          | router/Suspense glue                                                                                                                                                                                       |
| `0wf2rmyoojkx7.js`           | 4,132 B     | 12,696 B  | 0        | 0       | 0          | AppRouter glue                                                                                                                                                                                             |
| **`2-wzetw2ympk0.js`**       | **3,646 B** | 8,042 B   | 0        | 0       | 0          | **the diary's own chunk** — `Book`, `Leaf`, `EdgeStrip`, the flip machine, `book.module.css`'s class map                                                                                                   |

**The diary's own code is 3,646 of 141,632 script bytes — 2.57%** — and is below
Lighthouse's threshold for any attributed bootup time at all. `299ekdt-sjm6b.js` owns
87% of the page's script evaluation, and the one long task Lantern pins LCP to is
attributed to it in every single run, on `/p/1` and on the minimal route alike. No
`@payloadcms`, `lexical`, `graphql` or `qs-esm` string appears in any chunk this route
fetches: **Payload's admin bundle is not on this route**, contrary to what
`docs/adr/0007`'s report supposed.

### Why the number behaves the way it does

`largest-contentful-paint` equals `interactive` **exactly**, run after run, on `/p/1`
and on the bare-heading route. Lantern's pessimistic LCP graph treats every node as
render-blocking and folds in every CPU node that performed layout, then takes the
maximum node end time — which, for a server-rendered App Router page whose LCP element
is inside a hydrated tree, is the end of hydration. Simulated LCP on this stack is a
proxy for time-to-interactive, not for a paint.

**The observed paint says so directly.** In the very runs above, `observedLargestContentfulPaint` is **22ms** (static), **55ms** (minimal route) and **174ms**
(`/p/1`) — and observed LCP equals observed FCP in every one, because the
server-rendered markup paints in a single frame. Nothing in the 2,488ms is a
millisecond any reader waits through on this hardware; it is a projection of what a
throttled device would do, and the projection is dominated by work that is not ours.

## The fonts, re-measured, and the previous conclusion withdrawn

Same method, same container, clean volume per configuration, five runs, every asset
verified 200:

| Faces self-hosted                       | requests | font bytes | LCP median     | five runs                | vs 2,500 gate         |
| --------------------------------------- | -------- | ---------- | -------------- | ------------------------ | --------------------- |
| Caveat 400 + EB Garamond 400            | 2        | 73,554     | **2,488.2 ms** | 2485/2487/2488/2489/2494 | PASS by 11.8 ms       |
| + Courier Prime 400/700                 | 4        | 112,440    | **2,637.4 ms** | 2636/2637/2637/2639/2645 | FAIL by 137 ms        |
| + EB Garamond italic **(now shipping)** | 5        | 138,277    | **2,933.8 ms** | 2932/2934/2934/2935/2943 | FAIL by 434 ms        |
| 5 faces, only Caveat preloaded          | 5        | 138,277    | 2,409.9 ms     | 2406/2408/2410/2411/2938 | _rejected, see below_ |

**ADR 0005's original finding reproduces exactly.** Its table recorded
"Caveat + Garamond + Courier: 2,638–2,641ms, FAIL"; that configuration measures
2,637.4ms here. The mechanism is the one ADR 0005 named: `next/font` emits a
`<link rel="preload" as="font">` per loaded face, and 64,723 extra bytes of
High-priority font preload compete with the script chain on a simulated 4G link,
delaying hydration — and simulated LCP is the end of hydration.

**`docs/adr/0007`'s contrary finding is withdrawn.** It compared a four-face build at
2,632.98ms against a two-face baseline it measured at 2,634.66ms and concluded the
fonts were free. On a clean volume the two-face baseline is 2,488ms; 2,634ms is this
route's _high mode_ on a warm volume, which its own five runs happened to land in
throughout. Comparing a change against a contaminated baseline made a real 149ms cost
read as zero. That is also why the measurement above wipes the `.next` volume between
configurations and checks every asset's status code: one configuration in this
investigation served four static assets as HTTP 500 from a wiped volume under a
still-running server and produced a plausible, entirely invalid 1,958ms.

**The preload lever was measured and rejected.** `preload: false` on everything but
Caveat reaches 2,409.9ms and would pass the gate with all five faces shipping. It is
not taken: it moves the cost to where the gate does not look. Simulated FCP goes
978ms → **1,657ms** (Chrome discovers those faces from the stylesheet and fetches them
at VeryHigh priority, so Lantern folds them into the first-paint chain), CLS goes
0 → 0.00457, and one run in five still lands at 2,938ms. Trading 693ms of modelled
first paint for 78ms of modelled largest paint, on a route whose real paint is 130ms
either way, is gaming the gate rather than serving a reader.

## What this leaves

With all five faces shipping — which is what the design specifies and what this task
wired in — the arithmetic is:

```
   900.8 ms   what any document costs on this measurement (TTFB + first paint)
+ 1,122.4 ms   React + the Next App Router client runtime, on any route
= 2,023.2 ms   the floor, before a line of this repository runs
+   465.0 ms   the diary itself: 33 server-rendered faces, 6.6KB of CSS, 3.6KB of JS
= 2,488.2 ms   /p/1 with two of five faces          (gate: 2,500 — 11.8 ms to spare)
+   445.6 ms   the design's other three font faces
= 2,933.8 ms   /p/1 as it now ships                 (gate: 2,500 — 433.8 ms over)
```

**There is no version of this route that meets 2,500ms and also renders the design.**
The floor takes 81% of the budget; the diary's own work takes essentially all of the
remainder; the typography does not fit at all. Removing every byte this repository has
written would leave 2,023ms against a 2,500ms gate — a 477ms margin for an entire
application, on a metric that is already indistinguishable from time-to-interactive.

## Options — for the owner, not for this task

**Option 1 is the one the owner took, 2026-09-02 — see "Status" above.**

1. **Accept a higher budget for this specific simulation. TAKEN.** Set the `/p/1` LCP
   assertion to a number chosen from the measured floor rather than from intuition —
   for instance 3,000ms, which is the floor plus a stated allowance and would keep the
   gate meaningful (it would still catch the image regression ADR 0006 fixed, which
   measured 3,170ms). `CLAUDE.md` §6's "≤ 2.5s" would be amended to say what
   throttling preset it means, because 2.5s is a reasonable field target and an
   unreachable simulated one.
2. **Measure against a different preset.** Lighthouse's `desktop` preset uses a
   1× CPU multiplier and a faster link. The budget's own wording is "diary, **4G**",
   so this changes what is being promised, not just how it is checked — but it is the
   honest option if the promise was about a real 4G phone rather than about Lantern's
   4× model of one.
3. **Accept that this stack cannot meet 2.5s and record it.** Keep the gate red and
   documented, with this ADR as the standing explanation, until either the framework's
   client runtime shrinks or the diary moves off the App Router. This is the only
   option that changes nothing, and it is not obviously wrong: the route genuinely
   paints in ~130ms.
4. **Ship two faces instead of five.** Reverts 445.6ms and returns the route to
   2,488.2ms — inside the gate by 11.8ms, on a bimodal measurement whose high mode is
   2,634ms. It buys a green tick at the cost of every eyebrow, date, counter, badge
   label, stamp and italic in the design rendering in a generic fallback. This task
   judged that a bad trade and wired the faces in; it is a one-line revert in
   `fonts.ts` if the owner disagrees.

**What was deliberately NOT done:** the gate was not raised, the assertion was not
deleted, it was not downgraded to a warning, and `aggregationMethod: "median"` was not
weakened. A red gate that is understood is worth more than a green one that was moved.

## Consequences

- **Update, after `docs/adr/0009-server-rendered-page-window.md`.** The 465.0ms line
  in the arithmetic above — "the diary itself: 33 server-rendered faces" — is the one
  item on this page that has since moved. `/p/<n>` now renders four to seven faces
  rather than thirty-three, and `/p/1`'s LCP measures **2,927.14ms** over the same five
  runs, against 3,083.95ms with all thirty-three (and 2,933.8ms recorded here, before
  the Frames and About pages existed). The observed Style & Layout on the median run
  falls 167.9ms → 93.8ms. **Everything else on this page stands**: the 900.8ms any
  document costs, the 1,122.4ms of React and the App Router client runtime, and the
  445.6ms of the design's three extra font faces are all untouched, and the original
  2,500ms budget is still 427ms away. That is why this ADR's decision is not revisited
  by that one — it removed the diary's own share of the number, and the diary's own
  share was never what put 2,500ms out of reach.
- `/p/1`'s LCP gate is now **error at `maxNumericValue: 3000`**, measured on
  `aggregationMethod: "median"` over five runs, and passes: the shipped route measures
  **~2,933ms**, about 67ms of margin. See
  `.superpowers/sdd/2026-09-01-phase-1-public-diary/owner-decisions-report.md` for the
  re-run pasted after this decision was applied — **and that file cannot be opened: see
  the method section above, which is where the reproduction now lives.**
- `resource-summary:script:size` **measured 141,632 bytes against the 184,320 gate when
  this decision was taken**, unchanged by the font work (fonts are not script). Note what
  that gate means: 137,986 of those bytes were the framework's, so the "diary route JS
  ≤ 180KB" budget is being met almost entirely by not being charged for the runtime that
  dominates it. This ADR does not touch that gate. **Do not budget a new dependency
  against the headroom this line implies.** It is one measurement from one day; two
  configurations measure `/p/1` at two viewports now (ADR 0014), both of them above this
  figure and inside the gate, and the current pair is whatever the last
  `npm run test:perf` wrote into `lhci-reports/`. Reading a stale figure as current
  over-reported the headroom by about 8% for a phase (final review 9).
- CLS is **0** on `/p/1` with all five faces preloaded, unchanged.
- The probe route is deleted. It is reproduced verbatim above so the floor can be
  re-measured without re-deriving it.
- **The gate still bites.** ADR 0006's image-window regression measured `/p/1` at
  ~3,170-3,247ms before its fix — over the new 3,000ms budget as much as it was over
  the old 2,500ms one. 3,000 was chosen, in part, because it does not launder that
  regression; see "Status" above for why it was not cheap to re-demonstrate live and
  what stands in for that demonstration instead.

---

## Owner ruling, 2026-09-14: 3,000 → 3,085ms, derived from ten CI medians

**The repository owner ruled on this on 2026-09-14, after being shown the measurements
below.** `docs/testing/07-performance.md` §7.0.1's standing recommendation — "amend ADR
0008 to a measured number with headroom rather than chase 25ms, and never move the
ceiling merely to make a red run green" — was put to the owner with the numbers, and the
owner took it. A human made this call, on evidence collected over weeks while the gate
stayed red; nothing here is an agent moving a threshold it found inconvenient. The gate
was left failing on purpose until there was something to derive a number _from_.

### THE OLD 3,000 WAS NOT WRONG, AND THAT IS THE POINT OF THIS AMENDMENT

3,000 was set from a measured framework floor (2,023.2ms for one styled heading with no
application code) on one machine, and ADR 0014 later pinned the two viewports it is
measured at. **It still passes on that machine.** Re-measured on the authoring host on
2026-09-14, `apps/web/.next` deleted first, same method as §"THE METHOD" above:

```
/p/1, mobile surface: 2924.108 2924.988 2925.343 2929.110 2930.506   median 2925.343
```

75ms of margin against the old 3,000, on the host the number was characterised on. What
changed is not the application and not the budget's reasoning — it is that the gate is
now also asserted on a second machine, a shared GitHub-hosted runner inside
`mcr.microsoft.com/playwright:v1.62.1-noble`, which is marginally slower. **A budget
characterised on one machine and enforced on two is the defect being corrected, not a
budget that was too generous.**

**The three admin routes are what make that reading the honest one rather than a
convenient one.** `/admin/sign-in`, `/admin/sign-in/code` and `/admin/reset` were
untouched by Phase 3 — thirty-one commits of upload pipeline — and they sit over the
3,000ms line by the same 16–26ms that `/p/1` does. A regression in the media pipeline
cannot move three auth screens. What can is the machine underneath all five.

### The ten measurements, and what they are

Every gated LCP URL, `largest-contentful-paint` **medians of five**, from two CI runs on
two different trees (`90fbbef` and `fba3cf3`), read off the runs' own annotations —
`docs/testing/07-performance.md` §7.0.1 records them per URL and per run:

```
3004.981  3011.746  3016.373  3020.813  3021.203
3021.513  3023.693  3026.088  3031.788  3045.037
```

| statistic                       | value        |
| ------------------------------- | ------------ |
| n                               | 10           |
| minimum                         | 3004.981     |
| maximum (worst observed median) | **3045.037** |
| spread (max − min)              | **40.056**   |
| mean                            | 3022.323     |
| sample standard deviation       | 10.923       |
| worst SINGLE run observed       | 3062.276     |

### The derivation, and why not a round number

The gate asserts a **median of five**, so the population it must clear is the ten medians
— not the single runs. Two bounds, and the number sits between them:

**Lower bound — what it must pass.** The worst median yet observed is 3045.037. A gate
there would go red on the next run that lands 1ms higher. The allowance is **one full
observed spread** above it, because the spread is the only measurement of run-to-run
variation this environment has offered:

```
3045.037  worst observed median
+  40.056  the observed spread of medians, across two runs on two trees
=  3085.093  ->  3085
```

**Upper bound — what it must still fail.** ADR 0006's image-window regression measured
`/p/1` at **3,170–3,247ms** before its fix, and not laundering that regression is the
reason 3,000 was chosen over something larger in the first place (see "Why 3,000 and not
some other number past the floor" above). 3,085 sits **85ms — 2.76% — below** the cheapest
end of that range, so the gate this amendment writes would have failed that build exactly
as the 3,000 and 2,500 gates did.

**Why not the tighter statistical bound.** `mean + 3σ` is 3055.09, which also clears the
worst observed median. It was not taken: ten points from two runs on one runner class is
not a population, a σ computed from them is a description of two afternoons, and a gate
that goes red on ordinary noise trains people to re-run rather than to read. The
conservative bound costs 30ms of an 85ms window and buys a gate that does not cry wolf.

**3,085 rather than 3,100.** A round number here would be a number chosen and then
justified. 3,085 is `3045.037 + 40.056` floored to the millisecond, and every term in that
sum is above.

| what                                            | value    | relation to the gate |
| ----------------------------------------------- | -------- | -------------------- |
| worst observed CI median                        | 3045.037 | 39.963 under (1.30%) |
| worst observed CI single run                    | 3062.276 | 22.724 under         |
| **the gate**                                    | **3085** | —                    |
| ADR 0006's image-window regression, as measured | 3170+    | 85 over — still red  |
| the authoring host today                        | 2925.343 | 159.657 under        |

### What this ruling changes, and what it does not

- `lighthouserc.json`, `lighthouserc.book.json` and `lighthouserc.admin.json` all assert
  `largest-contentful-paint` at `maxNumericValue: 3085`. All three moved together,
  because all five URLs moved together and a per-config number would be a claim about
  five routes that the evidence does not support.
- `CLAUDE.md` §6 and `docs/standards/06-performance.md` now say **≤ 3,085ms** rather than
  "≤ 3.0s". The prose budget and the enforced one are the same number, which is the
  condition under which either means anything.
- **UNCHANGED:** `aggregationMethod: "median"` and `numberOfRuns: 5`, for the reason this
  ADR gives twice already — the lhci default takes the best of five and would loosen the
  gate silently. `cumulative-layout-shift` at 0.1. `resource-summary:script:size` at
  184,320 and 327,680. `http-status-code`. `/gallery/<slug>`'s own 4,000ms LCP. The
  throttling is still Lighthouse's unpinned default, still the most likely way this gate
  moves with no diff in this repository, and still deliberately not pinned here.
- **This is the last widening that has evidence behind it.** If `/p/1` goes red at 3,085,
  the answer is the one §"A red `/p/1` should be re-measured five times before it is
  believed" already gives — re-measure, against a cold `.next`, and look for the MEDIAN
  moving. It is not another 40ms. Two successive widenings to reach a green gate is how a
  budget stops meaning anything, and the second one would be the one that did it.
