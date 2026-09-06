# 0014 — The diary's LCP gate is measured at a viewport that agrees with the surface it gates

**Status: DECIDED**, on measurements taken on this machine, 2026-09-03. `/p/1`'s LCP
budget is **unchanged at 3,000ms**, still `error`, still `aggregationMethod: "median"`
over `numberOfRuns: 5`, still under Lighthouse's `simulate` throttling (150ms RTT,
1,638Kbps, 4x CPU). Nothing about the number moved. What moved is the **viewport the
book surface is measured at**, and with it the disappearance of a bimodal split that had
been making the gate flip red and green on identical code.

**This is not a raised gate.** The distinction that matters here is that raising a gate
to accommodate a real regression is dishonest, and setting a measurement so it stops
flipping is correct. This ADR does the second and, deliberately, none of the first: the
book surface measured under the new configuration is **2,930.5ms against the same
3,000ms budget**, within 3.4ms of the two figures this branch already recorded for it
(`docs/adr/0009-server-rendered-page-window.md` 2,927.14ms,
`docs/adr/0012-two-route-entries-for-two-reading-surfaces.md` 2,932.66ms). The
regression demonstration is in §"The gate still bites, and it bites harder than it did",
with the numbers.

## Context — a gate that flipped on identical code

`.superpowers/sdd/2026-09-01-phase-1-public-diary/budget-and-housekeeping-report.md`
closed with one open concern: `/p/1`'s LCP measured **3,015-3,167ms (median 3,022)** on
every one of five consecutive `npm run test:perf` invocations, and had measured
**2,932ms** on the same commit earlier the same day. `git diff` between the two touched
no diary, book or font code — only `lighthouserc.json`'s gallery assertion, two docs
files and `.gitattributes`. The gallery route's LCP stayed at ~3,535ms across the same
period, which ruled out "this machine is slow tonight".

`docs/adr/0008-lcp-budget-and-the-framework-floor.md` had already named this metric
bimodal — "two modes about 149ms apart" — and attributed the high mode to a warm `.next`
volume. `docs/adr/0010-static-generation-and-the-content-window.md`'s own dynamic-route
table shows it happening: four runs at 2,929-2,935ms and a fifth at **3,019.6ms**.

A gate that flips on identical code trains people to re-run CI until it passes. That is
how every decorative gate in this repository started, so the split was characterised
rather than accommodated.

## The measurement

**Method.** A local Lighthouse driver — `chrome-launcher` plus this repository's own
`lighthouse@12.6.1`, both already installed — replaying `lighthouserc.json`'s collect
settings exactly: `simulate` throttling, `chromeFlags: --no-sandbox
--disable-dev-shm-usage`, the same `extraHeaders`, one fresh Chrome per run, against a
production `next build` served by `next start` on this Windows host, which is where
`npm run test:perf` itself runs. It reproduces `npm run test:perf`'s own `/p/1` figures
to the tenth of a millisecond, which is why it is trusted below. Nothing left this
machine (CLAUDE.md §7.1). The driver was deleted; the sentence above is enough to
rebuild it.

### 1 · The distribution as it stood — 20 consecutive runs of `/p/1`

Configuration exactly as `lighthouserc.json` had it: phone emulation (412x823),
`Cookie: td-reading-surface=book` pinned, one freshly built `.next`.

```
3167.1  3166.9  3166.7  3016.4  3016.8  3016.2  3016.6  3015.5  3164.5  3164.1
3014.9  3016.5  3164.9  3165.3  3016.1  3015.3  3014.6  3164.6  3018.2  3014.3
```

**Genuinely bimodal, and the modes do not overlap.** Twelve runs in
**3,014.3-3,018.2ms** and eight in **3,164.1-3,167.1ms** — **149.0ms apart** at their
nearest edges, which is the same 149ms ADR 0008 measured. Nothing lands between them.
Nothing lands near the 2,932ms the same commit measured that afternoon either: that is a
**third** mode, and it did not occur once in these twenty runs. Median of the twenty:
3,016.7ms. With eight of twenty runs in the high mode, a five-run median lands there
about a third of the time — which is the flip.

Every run's LCP element was `mobile-module__…coverTitle`.

### 2 · The gallery, measured the same way — 20 consecutive runs

```
3230.5  3525.6  3528.8  3902.0  3827.6  3532.2  3530.0  3530.4  3530.2  3528.3
3531.2  3526.5  3528.9  3454.6  3453.4  3527.8  3528.6  3758.2  3528.6  3532.2
```

**Not bimodal.** Fifteen of twenty inside 3,526-3,532ms — a 6ms cluster — with a scatter
of one-off outliers either side and no second mode. FCP was 904.3-908.8ms on every
single run. Whatever `/p/1` has, `/gallery/<slug>` does not have it.

### 3 · What separates the modes — the answer is in FCP, not in LCP

Simulated FCP is the tell. In the 2,932ms mode it is **910ms**; in the 3,016ms and
3,167ms modes alike it is **1,581ms**. The gap, 671ms, is 138,277 bytes of font at
1,638Kbps — 675ms. The five font faces are in the first-paint graph in one mode and not
in the other.

Lantern decides that from the **observed** first paint, and the observed first paint is
where the two eras separate:

|                            | observed first paint | simulated FCP | simulated LCP     | LCP element                          |
| -------------------------- | -------------------- | ------------- | ----------------- | ------------------------------------ |
| the afternoon's green runs | 119-144ms            | 910-965ms     | **2,932-2,947ms** | detached — gone before the audit ran |
| tonight's runs             | 271-1,110ms          | 1,579-1,610ms | **3,014-3,167ms** | `mobile-module__…coverTitle`         |

**On the 2,932ms runs the browser painted the book at ~120ms. On every 3,016ms and
3,167ms run it painted nothing at all until 271-1,110ms — after `load`, which is at
133-171ms.** The first thing painted was not the book. It was the mobile reading
surface.

### 4 · Why the mobile surface is on screen at all, on a gate that pins the book

`lighthouserc.json` sent `Cookie: td-reading-surface=book` so Lighthouse would measure
the heavier book surface rather than the mobile one its phone emulation would otherwise
be served (ADR 0012, §"The measurement"). The cookie does its job on the server:
`servedReadingSurface` reads it, `apps/web/middleware.ts` passes the request through to
`/p/[n]`, and an 11,442-byte book document is served.

Then the browser corrects it. Lighthouse injects `extraHeaders` at the network layer,
where `document.cookie` cannot see it, so
`apps/web/components/mobile/SurfaceCorrection.tsx` measures the emulated 412px viewport,
finds `measured: 'mobile'` against `served: 'book'`, writes the cookie, reads it back
successfully — and calls `router.refresh()`. **Every Lighthouse run of `/p/1` therefore
threw the book away and re-rendered the route as the mobile surface**, fetching the
mobile entry's 3,169-byte stylesheet and 6,849-byte chunk and two `/p/2` prefetches: 24
requests where the book alone makes 17.

`docs/testing.md` recorded this refresh and judged it harmless, on the grounds that the
run "downloads the mobile entry's chunk and stylesheet AFTER LCP … LCP is unaffected".
**That is what this ADR withdraws.** It is a race, not an ordering. When the book's paint
wins, LCP is 2,932ms. When the refresh wins, the book never paints at all, first paint is
the mobile Cover's title, and the fonts and the correction's round trip land inside the
first-paint graph: 3,016ms, or 3,167ms when Lantern additionally pins LCP to the end of
hydration (LCP equals TTI exactly on every high-mode run and sits 32.7ms below it on
every low-mode one). Which side wins is decided by machine state, which is why identical
code measured 2,932ms at 20:55 and never once measured below 3,014.3ms an hour later.

### 5 · What was tested, and what was ruled out

| Suspect                               | Test                                                                                                            | Result                                                                                                                                                                      |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Build freshness**                   | `.next` deleted, `next build` re-run, server restarted, 10 runs                                                 | `3024.2 3167.4 3016.4 3017.4 3167.1 3014.6 3019.4 3167.4 3016.1 3017.0` — **both modes, unchanged**. Not the cause                                                          |
| **The Docker Postgres path**          | `server-response-time` on every run of both routes                                                              | 27.7-48.3ms on `/p/1` in both modes; 13.6-17.8ms on the gallery. The gallery reads the same database over the same host-to-container path and does not split. Not the cause |
| **The middleware rewrite**            | `/p/1` with the cookie takes `NextResponse.next()` — the same branch — in every configuration below             | The middleware runs identically on the runs that split and on the runs that do not. Not the cause                                                                           |
| **The surface correction**            | remove the cookie, so the served surface agrees with the emulated viewport and no correction fires — 15 runs    | `2923.4 2926.1 2923.9 2926.1 2923.1 2922.8 2925.0 2923.3 2923.5 2922.8 2926.9 2923.1 2924.5 2923.8 2924.2` — **unimodal, 4.1ms of total spread.** This is the cause         |
| **The surface correction, book side** | keep the cookie and emulate 1350x940, so the correction agrees with the served book — 25 runs across two builds | **2,922.2-2,930.4ms**, 8.2ms of total spread, 17 requests, no `_rsc` refresh, no mobile chunks. Unimodal                                                                    |

Removing the correction from the measurement removes the modes, on either surface.
Nothing else moved them.

## Decision

**The book surface is measured at a viewport that is served the book.** `/p/1` is
collected twice, by two configurations, and each one measures a surface a real reader is
actually given:

1. **`lighthouserc.json`** keeps Lighthouse's phone emulation and **loses
   `collect.settings.extraHeaders`.** A 412px phone is served the mobile reading surface,
   `SurfaceCorrection` agrees with it, nothing refreshes, and `/p/1`'s existing assertion
   matrix now gates **the mobile surface** — which is what SCREENS.md §1.10 says a phone
   gets, and which has never been gated before. `/gallery/<slug>` and `/cms` are
   unaffected by the removal: neither ever read that cookie, and both measure
   byte-for-byte what they measured before (§Consequences).
2. **`lighthouserc.book.json`**, new, collects `/p/1` alone with the cookie still pinned,
   plus `formFactor: "desktop"` and `screenEmulation: 1350x940 @1x`. The book is served,
   the browser measures 1350px, `surfaceForWidth` returns `'book'`, and the correction is
   a no-op. **The throttling is not touched** — `configSettings.throttling` on these runs
   reads `rttMs 150, throughputKbps 1638.4, cpuSlowdownMultiplier 4, throttlingMethod
simulate`, identical to the phone configuration's, and that was verified by reading it
   back off the report rather than assumed. `formFactor` and `screenEmulation` change the
   viewport; they change nothing about the network or the CPU model, which is what
   CLAUDE.md §6 names.

`npm run test:perf` runs both, in that order.

**Why 1350x940.** The book is a scaled 1300x860 design box, so 1350x940 is the smallest
ordinary desktop window that draws it at its native scale. Any width at or above 860
removes the correction; this one additionally stops the measurement depending on
`useBookScale`'s scaling arithmetic.

**Why a second config file rather than one.** Collect settings in lhci are per-run, not
per-URL, and emulating a desktop for the whole run was measured and rejected: at
1350x940 the gallery picks larger derivatives and fetches **1,229,466 bytes of image**
against the 600,000 gate `docs/adr/0013-gallery-image-budget.md` set three commits ago,
with LCP at 3,787-5,311ms against its 4,000. Changing the diary's measurement must not
silently re-base the gallery's, so the diary's viewport lives in its own file.

**Why the user-agent is still a phone's on the book run.** Lighthouse ignores
`emulatedUserAgentString` in this position — verified: `environment.networkUserAgent` is
still the Moto G Power's with the override set, so the override was dropped rather than
left in place looking like it worked. It does not matter, and that is a property of
`readingSurface.ts` rather than luck: a remembered cookie outranks the user-agent guess
outright. The pinned cookie decides the surface; the emulated viewport decides whether
the browser argues with it.

## The gate still bites, and it bites harder than it did

Both of this branch's known LCP regressions were re-introduced on an uncommitted local
build, measured, and reverted (`git checkout --`, confirmed clean).

| Regression                                                                                                                                          | How     | Median of 5, book config                                                                    | vs 3,000         |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------- | ---------------- |
| **The content window removed** — `servedContentWindow` always returns the whole book, i.e. the Task 11 tree `docs/adr/0009` fixed                   | 1 line  | **3,082.0ms** (3006.7 / 3081.9 / **3082.0** / 3082.2 / 3089.3)                              | **RED by 82ms**  |
| **Both windows removed** — the above, plus `loadsImages` true for every in-bounds leaf, i.e. the diary before `docs/adr/0006-diary-image-window.md` | 2 lines | **3,719.9ms** (3646.4 / 3713.3 / **3719.9** / 3720.6 / 3732.3), 5,171,421 bytes transferred | **RED by 720ms** |

The first is the important one. ADR 0009 measured that same regression at **3,083.95ms**;
this configuration measures it at **3,082.0ms** — 1.95ms apart, on a different day and a
different harness. That is the strongest available evidence that the new measurement is
measuring the same thing the old ADRs were.

**And the configuration this ADR replaces could not have caught it.** The same whole-book
build, measured under `lighthouserc.json` as it stood, gives `3169.0 / 3169.2 / 3168.6 /
3169.4 / 3168.8` — median **3,169.0ms, which is 1.9ms above the healthy build's own high
mode of 3,167.1ms.** A 152ms regression was, under the old configuration, indistinguishable
from the measurement's own noise. That is the case for this change stated as a number: the
gate had not merely started flipping, it had stopped being able to tell a regression from
a mode.

ADR 0006's image-window regression measured 3,170-3,247ms when it shipped; the
reproduction above measures its modern equivalent at 3,719.9ms. ADR 0013's lazy-load
regression is a `resource-summary:image:size` finding on `/gallery/<slug>` at 7.67x its
budget, and this ADR touches neither that gate, that route, nor that number.

## Verification

Three consecutive `npm run test:perf` invocations, each with its own `next build`, all
green:

|                                            | run 1   | run 2   | run 3   | all fifteen                        |
| ------------------------------------------ | ------- | ------- | ------- | ---------------------------------- |
| `/p/1` **book** (`lighthouserc.book.json`) | 2,930.5 | 2,931.1 | 2,927.8 | 2,926.0-2,937.8, **11.8ms spread** |
| `/p/1` **mobile** (`lighthouserc.json`)    | 2,926.8 | 2,926.7 | 2,925.6 | 2,924.8-2,933.4, **8.6ms spread**  |
| `/gallery/patagonia` LCP                   | 3,536.0 | 3,538.3 | 3,542.8 | 3,530.1-3,549.2                    |

Book runs in full: `2928.3 2934.4 2937.8 2930.5 2928.5` · `2931.1 2934.4 2932.1 2926.1
2928.3` · `2926.0 2928.0 2927.8 2927.7 2928.2`.

Mobile runs in full: `2930.6 2926.8 2926.4 2927.6 2926.0` · `2930.1 2926.0 2925.5 2926.7
2925.8` · `2933.4 2925.6 2925.0 2924.8 2926.0`.

**Three medians inside 3.3ms of each other, from the same command that produced 3,016ms
and 3,167ms an hour earlier.**

## Consequences

- **The budget did not move.** `/p/1` is still `error` at `maxNumericValue: 3000` in both
  files, still `aggregationMethod: "median"` over `numberOfRuns: 5`. The median setting is
  kept in both for the reason ADR 0008 gave: lhci's default is `optimistic`, which takes
  the best of five runs and would silently loosen every gate it touched.
- **The gate now measures the book.** The LCP element on every book run is the Cover's own
  `<h1 class="cover-module__…">`, and the run makes 17 requests with an 11,440-byte
  document, 142,828 script bytes and no correction — against the 24 requests, 149,677
  script bytes and mobile-surface LCP element the gate had been measuring. 142,828 is ADR
  0012's own "book surface's own transfer … 142,818" figure, which that ADR could only
  report by measuring outside the gate. The gate and that figure now agree.
- **The mobile reading surface is gated for the first time.** `lighthouserc.json`'s `/p/1`
  entry now asserts `http-status-code`, `resource-summary:script:size` (144,835 against
  184,320), `largest-contentful-paint` (2,926.8 against 3,000) and CLS (0) against the
  surface every phone is served. ADR 0011 recorded that the mobile surface "cannot become
  the binding constraint while the book is gated; if that ever stops being true, measure it
  rather than assume it" — it is now measured on every run, and it is 3.7ms lighter than
  the book rather than half its cost, because both are dominated by ADR 0008's framework
  floor and the five font faces rather than by their own markup.
- **`/gallery/<slug>` and `/cms` are unchanged, and that was checked rather than asserted.**
  Across the fifteen post-change runs, `resource-summary:image:size` on `/gallery/patagonia`
  is **477,329 bytes on every single run** — the same figure ADR 0013 recorded — with
  script 141,711 and CLS 0. `/cms` is 647,142 script bytes and CLS 0, as before. Removing
  the cookie moved nothing on either route.
- **`docs/testing.md`'s "LCP is unaffected — the correction happens after it" is
  withdrawn**, and the paragraph that carried it now records what the correction actually
  did to the measurement.
- **No product code changes.** `SurfaceCorrection` is correct: a browser that measures
  412px and was served the book should ask for the mobile surface, and a real reader who
  narrows a window or rotates a tablet needs exactly that. The defect was in asking a page
  to believe a cookie its own viewport contradicts, and then timing the argument.
- **Two things this investigation noticed and did not fix.** (1) Every `/p/<n>` document
  request costs an extra round trip: the response carries `Critical-CH:
Sec-CH-Prefers-Color-Scheme`, so Chrome re-issues it, and Lighthouse records a 66-byte
  307 costing 35-49ms in front of every run, on every configuration measured here. It is
  constant across all modes and is not this ADR's split, but it is ~1.5% of the budget for
  a client hint nothing on the diary reads. (2) `/cms`'s LCP of 4,868-5,181ms remains
  ungated by design — CLAUDE.md §6 scopes the LCP budget to the diary — and remains large.
- **Re-measure, do not re-run.** If this gate goes red again, the first question is no
  longer "is it the bimodality", because there is not one any more. A red run is now a
  regression until a measurement says otherwise.
