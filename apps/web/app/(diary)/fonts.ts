/**
 * fonts.ts — self-hosts all three of the handoff's Google Fonts families via
 * `next/font/local`.
 *
 * README.md: "Fonts are Google Fonts (Caveat, EB Garamond, Courier Prime) —
 * self-host in production." `next/font/local` was chosen over
 * `next/font/google` even though the latter also self-hosts its OUTPUT
 * (the emitted font files are served from this origin, never from
 * fonts.gstatic.com at runtime): `next/font/google` performs that
 * self-hosting by fetching CSS and font files from Google's servers at
 * EVERY build, which is a live network dependency this repository does not
 * want inside a pinned, hermetic Docker build (SECURITY.md's "no
 * third-party requests" plus the pinned-image discipline in
 * docs/testing.md). Committing the font files below removes that
 * dependency entirely: `next build` never touches the network for fonts,
 * in this container or any other. See docs/adr/0005-font-hosting.md.
 *
 * ALL FIVE COMMITTED FACES NOW LOAD. Caveat 400, EB Garamond 400 upright
 * and italic, Courier Prime 400 and 700. There is no font deferral left in
 * this file and docs/deviations.md no longer carries one - but that is a
 * decision taken with the cost in hand, not a constraint that vanished.
 *
 * WHY THE DEFERRAL IS GONE, AND WHAT IT COSTS. Read this before "fixing"
 * the LCP gate by unwiring a face again: the cost below is real, it is
 * measured, and it is still not the reason the gate is red.
 *
 * ADR 0005 deferred Courier Prime on a real measurement, and that
 * measurement REPRODUCES. Five runs per configuration, each on a freshly
 * wiped `.next` volume inside `mcr.microsoft.com/playwright:v1.62.1-noble`,
 * every asset verified 200 before collecting, median asserted:
 *
 *   Faces self-hosted                     reqs   font bytes   LCP median   Gate 2,500ms
 *   ------------------------------------  ----   ----------   ----------   ------------
 *   Caveat 400 + Garamond 400              2       73,554     2,488.2 ms   PASS by 11.8
 *   + Courier 400/700                      4      112,440     2,637.4 ms   FAIL by 137
 *   + Garamond italic  (SHIPPING)          5      138,277     2,933.8 ms   FAIL by 434
 *   5 faces, only Caveat preloaded         5      138,277     2,409.9 ms   PASS by 90 *
 *
 *   * rejected — see "the preload lever" below.
 *
 * So the honest position is NOT "fonts turned out to be free" (a previous
 * task concluded that, from a warm-volume baseline that had drifted into
 * this route's high mode at ~2,634ms, which made a 4-face 2,633ms look
 * identical to it). Three extra faces cost about 446ms of SIMULATED LCP,
 * and they are wired in anyway. Here is why that is the right call.
 *
 * **The observed paint does not move at all.** Lighthouse runs
 * `throttlingMethod: 'simulate'`: it captures an unthrottled trace and then
 * projects it onto slow 4G with a 4x CPU multiplier. The OBSERVED first and
 * largest contentful paint on this route, in the very same runs that produced
 * the table above, are 174ms (2 faces), 122ms (5 faces) and 132ms (5 faces,
 * no preload) — identical within noise, and observed LCP equals observed FCP
 * in every run, because the server-rendered markup paints in one frame. Every
 * millisecond of difference in that table is Lantern's model, not a paint any
 * reader waits through.
 *
 * **And the budget was already spent before this file loaded a byte.** A
 * deliberately minimal route in this same app — one server component, one
 * styled heading, no client component, no font, no stylesheet, no image, 464
 * bytes of document — measures a 5-run median LCP of **2,023.2 ms** with a
 * **1,571.8 ms render delay**, and ships **137,986 bytes of JavaScript over
 * six chunks**, because React plus the Next App Router client runtime loads
 * on every route whether or not anything on it is interactive. A plain static
 * HTML file with the same heading, served by the same server, measures
 * **900.8 ms**. So the framework costs ~1,122ms of simulated LCP before this
 * repository writes a line, and leaves ~477ms of a 2,500ms budget for an
 * entire diary. Two font files were never what decided this gate.
 *
 * **The preload lever, measured and REJECTED.** `preload: false` on
 * everything but Caveat drops the median to 2,409.9ms and would pass the
 * gate with all five faces shipping. It is not taken, because it buys the
 * number by moving the cost somewhere the gate does not look: simulated FCP
 * goes 978ms -> 1,657ms (Chrome discovers those faces from the stylesheet
 * and gives them VeryHigh priority, so Lantern folds them into the
 * first-paint chain), CLS goes 0 -> 0.0046, and one run in five still lands
 * at 2,938ms. Trading 693ms of modelled first paint for 78ms of modelled
 * largest paint, on a route whose real paint is 130ms either way, is gaming
 * the gate rather than serving a reader.
 *
 * See `.superpowers/sdd/2026-09-01-phase-1-public-diary/lcp-floor-report.md`
 * and `docs/adr/0008-lcp-budget-and-the-framework-floor.md`, which puts the
 * budget decision where it belongs — with the repository owner.
 *
 * **On measurement noise, kept because it is still load-bearing.** A single
 * `lhci autorun` is not a reliable sample on this route, and a WARM `.next`
 * volume is worse than noisy — it is wrong. One configuration in this
 * investigation served four static assets as HTTP 500 from a wiped volume
 * under a still-running server and produced a plausible, entirely invalid
 * 1,958ms; the table above therefore checks every asset's status code before
 * collecting. On a clean volume this route's five runs are tight (spread
 * under 12ms), but the same code on a warm one has read 1,962ms and 2,634ms.
 * These numbers were also taken through a Windows-host Docker bind mount,
 * whose I/O differs from a native Linux CI runner in ways this investigation
 * could not isolate.
 *
 * Files, weights, and why:
 *   - caveat-400.woff2 — Caveat, weight 400. A static single-weight file
 *     (48.8KB) rather than the 400-700 variable file (74.9KB): no rule in
 *     this codebase sets a Caveat `font-weight` other than 400 today, so the
 *     variable file's extra interpolation masters would be pure overhead —
 *     CLAUDE.md §4's YAGNI applied to bytes. Reinstate the 400-700 variable
 *     file (`weight: '400 700'`) the moment a component sets a heavier
 *     Caveat weight.
 *   - eb-garamond-400.woff2 / eb-garamond-italic.woff2 — EB Garamond upright
 *     and italic at 400. The italic face is not optional typography:
 *     `contents.module.css`'s `.note` and `.meta`, `cover.module.css`'s
 *     `.subtitle`, and `notes.module.css`'s `.place` and `.count` all set
 *     `font-style: italic` on this family, so without the real italic the
 *     browser was synthesising a slanted upright. Weights 500 and 600 are
 *     still not loaded and no file for them is committed: nothing in this
 *     codebase asks for them.
 *   - courier-prime-regular.woff2 / courier-prime-bold.woff2 — Courier Prime
 *     400 and 700. Both weights are genuinely used: 400 carries every
 *     eyebrow, date, badge label, tally key, counter and page number in the
 *     design, and 700 is set by `.stampValue` in both `cover.module.css` and
 *     `notes.module.css`.
 *
 * Each file was fetched once, directly, from fonts.gstatic.com's own "latin"
 * subset (the seeded content is plain ASCII plus em/en dash and the section
 * sign — all inside that subset's `unicode-range`), which is a one-way
 * download of a public asset, not a disclosure of repository content (see
 * CLAUDE.md §7.1's exception for exactly this shape of fetch).
 *
 * `adjustFontFallback` is left at its default (on): `next/font/local` reads
 * each file's own metrics and computes a size-adjusted fallback face so the
 * fallback-to-webfont swap does not reflow (CLS stays 0). `display: 'swap'`
 * is next/font's own default; named explicitly here so the choice reads at
 * the call site. `font-display: optional` and `preload: false` were both
 * tried during the original investigation and reverted: neither moved the
 * measured LCP at all — Lighthouse's `simulate` throttling derives its
 * timing graph from the ACTUAL (fast, local, unthrottled) capture trace,
 * where every font finishes long before any block period expires, so they
 * are dead levers for this gate and `swap` is kept everywhere for its
 * determinism instead.
 *
 * Depends on: `next/font/local`, all five files in `./fonts/`.
 * Imported only by `./layout.tsx`, which is itself never imported by any
 * test (see that file's `c8 ignore` note) — `next/font/local`'s real export
 * only exists inside the Next.js build; calling it from Vitest throws, so
 * this file must stay off every test's import graph. Not under a bracketed
 * route segment, so `c8 ignore` is trusted here per vitest.config.ts's
 * documented finding for this exact directory.
 */
/* c8 ignore start -- see module header: next/font/local's real
 * implementation only exists inside the Next.js compiler, so importing
 * this file under Vitest throws rather than executing normally. Nothing
 * here can be unit-tested; the fonts actually rendering is asserted in the
 * browser by e2e/pages.spec.ts (computed font-family plus a loaded
 * FontFace, per family). */
import localFont from 'next/font/local'

/** Caveat, 400 only — nothing in this codebase sets a heavier Caveat weight. */
export const caveat = localFont({
  src: './fonts/caveat-400.woff2',
  weight: '400',
  style: 'normal',
  display: 'swap',
  variable: '--font-caveat',
})

/** EB Garamond, 400 upright and 400 italic — both faces are set by real rules. */
export const ebGaramond = localFont({
  src: [
    { path: './fonts/eb-garamond-400.woff2', weight: '400', style: 'normal' },
    { path: './fonts/eb-garamond-italic.woff2', weight: '400', style: 'italic' },
  ],
  display: 'swap',
  variable: '--font-eb-garamond',
})

/** Courier Prime, 400 and 700 — 700 is `.stampValue` on the cover and the Notes page. */
export const courierPrime = localFont({
  src: [
    { path: './fonts/courier-prime-regular.woff2', weight: '400', style: 'normal' },
    { path: './fonts/courier-prime-bold.woff2', weight: '700', style: 'normal' },
  ],
  display: 'swap',
  variable: '--font-courier-prime',
})
/* c8 ignore stop */
