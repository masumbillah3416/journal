/**
 * fonts.ts — self-hosts two of the handoff's three Google Fonts families via
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
 * HANDOFF-DEVIATION (docs/deviations.md §11) - READ BEFORE ADDING A THIRD
 * `localFont` CALL HERE. Only Caveat and EB Garamond load. Courier Prime is
 * NOT loaded - `--td-font-courier` (`diary.css`) still resolves to the
 * handoff's plain `'Courier Prime', monospace` fallback stack, exactly as
 * it did before this task. This is not an oversight; it is the direct
 * result of repeatedly measuring `/p/1`'s LCP with `npx lhci autorun` in
 * the pinned container, against a freshly-created `.next` Docker volume
 * every time (a warm/reused volume gave misleading one-off numbers on both
 * sides of the gate for identical code - see the note on measurement noise
 * below). Multiple runs per configuration, not one:
 *
 *   Fonts self-hosted           requests   `/p/1` LCP, multiple clean runs      Gate
 *   --------------------------  --------   -----------------------------------  ----
 *   none (Task 9's baseline)        12     2,042ms (1 run)                      PASS
 *   Caveat only                     13     2,337.1 / 2,337.8 / 2,337.1ms        PASS (~163ms to spare)
 *   Caveat + EB Garamond (this)     14     2,486.5 / 2,489.1-2,492.4 / 2,496.4ms  PASS (4-14ms to spare)
 *   Caveat + Courier Prime          14     2,489ms (1 run)                       PASS (~11ms to spare)
 *   Caveat + Garamond + Courier     15     2,638-2,641ms (2 runs)                FAIL (gate 2,500ms)
 *   every weight, every family      17     2,937-3,110ms (3 runs)                FAIL
 *
 * Every row is a single weight per family (the YAGNI-scoped files described
 * below); `resource-summary:script:size` and `mainthread-work-breakdown` are
 * essentially identical across every row (a font's CPU cost is negligible) -
 * what moves LCP is request count, not bytes: `next start` serves plain
 * HTTP/1.1 with no TLS, and the jump from 14 to 15 requests costs far more
 * than one ~19-24KB file's transfer time could explain, which points at
 * connection/priority contention in Lighthouse's `simulate` throttling
 * model rather than a smooth per-byte cost.
 *
 * **On the measurement noise itself, stated plainly because it is load-
 * bearing for how much to trust any of this:** a single `lhci autorun` is
 * NOT a reliable sample this close to the gate. The SAME two-font code
 * measured 1,962ms in one clean-volume run and 2,486-2,496ms across five
 * others; a warm (non-freshly-cleared) `.next` volume once produced a false
 * PASS at ~2,108ms for code that fails at ~2,640ms on a clean volume. The
 * table above uses the numbers that replicated across multiple clean runs,
 * not the first or the most favourable one. `lighthouserc.json`'s
 * `numberOfRuns: 1` is a pre-existing setting this task did not change; the
 * practical consequence is that Caveat+EB Garamond's true margin is thin
 * (single-digit milliseconds was observed more than once) and this route's
 * CI runs on this exact gate should be read as "usually passes, not
 * comfortably". (Task 9's structural fix has since landed and did not give
 * it headroom - see the re-measured table below.) This measurement was also taken through a Windows-host Docker
 * bind mount, whose I/O characteristics differ from a native Linux CI
 * runner in ways this investigation could not isolate from genuine
 * network-contention effects - reported as a caveat on the noise itself,
 * not as a reason to discount the PASS/FAIL boundary found.
 *
 * Caveat is non-negotiable: it is the LCP element itself on this route (a
 * bookmark-rail journey name) and the cover title this whole task exists to
 * fix. Between EB Garamond and Courier Prime, Garamond was kept: it carries
 * the diary's actual reading content (photo captions, notes, descriptions,
 * per `packages/tokens/src/type.ts`'s `family` doc) rather than Courier's
 * auxiliary labels/dates/counters.
 *
 * Courier Prime's two files remain committed at
 * `./fonts/courier-prime-regular.woff2` and `./fonts/courier-prime-bold.woff2`,
 * and EB Garamond's italic file remains committed at
 * `./fonts/eb-garamond-italic.woff2` (none deleted) - re-enabling any of
 * them is a `localFont` call away, not a new download.
 *
 * THE STRUCTURAL FIX THIS HEADER WAS WAITING FOR HAS LANDED, AND THE TABLE
 * ABOVE NO LONGER REPRODUCES. "Have the server route pre-render the page
 * faces and pass them into `Book` as children" was built and measured
 * (`docs/adr/0007-server-rendered-page-faces.md`): it recovered 2,754 bytes
 * of script transfer and moved `/p/1`'s LCP by nothing at all - 2,634.368ms
 * before, 2,634.656ms after, render delay 2,180ms on both sides. The table
 * was then re-run on top of it, exactly as this paragraph used to ask:
 *
 *   Fonts self-hosted           requests   `/p/1` LCP, 5 runs, median         Gate
 *   --------------------------  --------   ---------------------------------  ----
 *   Caveat + EB Garamond (this)     14     2,634.656ms                        FAIL
 *   Caveat + Garamond + Courier     16     2,632.984ms                        FAIL
 *                                          2649.0/2632.0/2633.0/2632.4/2634.3
 *
 * A third family is now free - 38,886 extra bytes and two extra requests
 * moved the median by less than the noise, and the row above that once read
 * "FAIL (gate 2,500ms)" at 2,638-2,641ms for this configuration now reads
 * the same as the two-font one. What changed is not the font cost but the
 * floor beneath it: this route sits at ~2,634ms whatever the fonts do,
 * because a 2,180ms render delay that neither scripts nor fonts explain
 * dominates it.
 *
 * The faces are STILL NOT WIRED, and that is now a decision rather than a
 * measurement: there is no headroom to spend, one five-run sample near this
 * margin is exactly what the noise note above warns against, and putting
 * 38,886 more bytes on a route that is already 135ms over its budget is not
 * something to do in passing. Wiring Courier Prime is a `localFont` call,
 * a `--td-font-courier` line in `diary.css`, a class on `layout.tsx`'s
 * `<html>`, and an update to `e2e/pages.spec.ts`'s pinned-fallback test -
 * which will fail the moment it is done, by design.
 *
 * Files, weights, and why:
 *   - caveat-400.woff2      — Caveat, weight 400. A static single-weight
 *     file (48.8KB) rather than the 400-700 variable file (74.9KB): no rule
 *     in this codebase sets a Caveat `font-weight` other than 400 today
 *     (`git grep` across every `.module.css` under `apps/web/components`
 *     confirms it), so the variable file's extra interpolation masters
 *     would be pure overhead - CLAUDE.md §4's YAGNI applied to bytes.
 *     Reinstate the 400-700 variable file (`weight: '400 700'`) the moment
 *     a component sets a heavier Caveat weight.
 *   - eb-garamond-400.woff2 — EB Garamond upright, weight 400. Same
 *     reasoning: static (23.8KB) beats the 400-600 variable file (44.3KB)
 *     while nothing requests 500 or 600. EB Garamond's italic face
 *     (`eb-garamond-italic.woff2`, committed, not loaded) is the other half
 *     of this deviation - one more request was not affordable alongside
 *     Courier Prime, and Courier was the one dropped in full rather than
 *     splitting the budget across a partial Garamond and a partial Courier.
 *
 * Each file was fetched once, directly, from fonts.gstatic.com's own
 * "latin" subset (the seeded content is plain ASCII plus em/en dash and
 * "§" — all inside that subset's `unicode-range`), which is a one-way
 * download of a public asset, not a disclosure of repository content (see
 * CLAUDE.md §7.1's exception for exactly this shape of fetch).
 *
 * `adjustFontFallback` is left at its default (on): `next/font/local`
 * reads each file's own metrics and computes a size-adjusted fallback face
 * so the fallback-to-webfont swap does not reflow (CLS stays 0 - see the
 * font report for the re-measurement). `display: 'swap'` is next/font's
 * own default; named explicitly here so the choice reads at the call site.
 * `font-display: optional` and `preload: false` were both tried during this
 * investigation and reverted: neither moved the measured LCP at all -
 * Lighthouse's `simulate` throttling method derives its timing graph from
 * the ACTUAL (fast, local, unthrottled) capture trace, where every font
 * finishes long before any block period expires regardless of these
 * settings, so they are dead levers for this specific gate and `swap` is
 * kept everywhere for its determinism instead.
 *
 * Depends on: `next/font/local`, two of the five files in `./fonts/`.
 * Imported only by `./layout.tsx`, which is itself never imported by any
 * test (see that file's `c8 ignore` note) - `next/font/local`'s real export
 * only exists inside the Next.js build; calling it from Vitest throws, so
 * this file must stay off every test's import graph. Not under a bracketed
 * route segment, so `c8 ignore` is trusted here per vitest.config.ts's
 * documented finding for this exact directory.
 */
/* c8 ignore start -- see module header: next/font/local's real
 * implementation only exists inside the Next.js compiler, so importing
 * this file under Vitest throws rather than executing normally. Nothing
 * here can be unit-tested; the fonts actually rendering is asserted in the
 * browser by e2e/pages.spec.ts (document.fonts.check / computed
 * font-family on the cover title). */
import localFont from 'next/font/local'

/** Caveat, 400 only today — see this file's HANDOFF-DEVIATION note. */
export const caveat = localFont({
  src: './fonts/caveat-400.woff2',
  weight: '400',
  style: 'normal',
  display: 'swap',
  variable: '--font-caveat',
})

/** EB Garamond, 400 upright only today — see this file's HANDOFF-DEVIATION note. */
export const ebGaramond = localFont({
  src: [{ path: './fonts/eb-garamond-400.woff2', weight: '400', style: 'normal' }],
  display: 'swap',
  variable: '--font-eb-garamond',
})
/* c8 ignore stop */
