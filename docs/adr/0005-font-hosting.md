# 0005 — Font hosting: self-host via `next/font/local` (superseded in part by ADR 0008: all three families now load)

## Context

`packages/tokens/src/type.ts` and `packages/tokens/src/tokens.css` have declared three
`--td-font-*` custom properties (Caveat, EB Garamond, Courier Prime) since Phase 1's
first tasks, but nothing in `apps/web` ever loaded a font file for them. README.md is
explicit: "Fonts are Google Fonts (Caveat, EB Garamond, Courier Prime) — self-host in
production." Every diary page rendered in the browser's generic `cursive`/`serif`/
`monospace` fallbacks instead, and Task 9's report named this the largest fidelity gap
in the phase (§7.3 there), deliberately deferred rather than folded into that task
because it touches every page type and carries a build-time or bundling decision an ADR
should record.

This ADR was written after discovering, while wiring the fonts in, that self-hosting all
three families at their full specified weight sets pushes `/p/1`'s Largest Contentful
Paint over CLAUDE.md §6's hard 2,500ms gate. That finding — not just the loading
mechanism — is most of what this document exists to record.

## Options considered

### Loading mechanism

1. **`next/font/google`** — Next's built-in Google Fonts loader. It genuinely does
   self-host its *output*: at build time it fetches the family's CSS and font files
   from Google's servers and re-serves them from the app's own origin, so a deployed
   page never makes a runtime request to `fonts.gstatic.com`. Verified by reading
   `node_modules/next/dist/compiled/@next/font/dist/google/{fetch-css-from-google-fonts,fetch-font-file}.js`
   rather than assumed. Rejected anyway: that self-hosting is accomplished by a **live
   network fetch to Google on every `next build`**, which this repository does not want
   inside its pinned, hermetic Docker build (SECURITY.md's "no third-party requests" at
   runtime is satisfied either way, but a build-time dependency on Google's
   availability is not the same guarantee, and CLAUDE.md §7.1's spirit — nothing this
   repository does should depend on somebody else's server being up — argues for the
   same caution at build time).
2. **`next/font/local` with committed `.woff2` files** — chosen. `next build` never
   touches the network for fonts, in this container or any other; a font file that
   fails to fetch during development is a `git status` diff, not a flaky CI run.
   `next/font/local` also computes a metric-matched fallback face automatically (see
   Decision, CLS), which a hand-rolled `@font-face` block would have to replicate by
   hand.
3. **Hand-rolled `@font-face` + committed files, no `next/font`** — rejected: gives up
   `next/font`'s automatic fallback-metric calculation (ascent/descent/line-gap
   override, size-adjust) for no benefit over option 2, and would have to reimplement
   preloading and per-page code-splitting by hand.

### How many families/weights to load

4. **Load every weight the handoff names for all three families** (Caveat 400-700; EB
   Garamond 400/500/600 + italic; Courier Prime 400/700) — tried first, measured, and
   rejected: five self-hosted font files pushed `/p/1`'s LCP to 2,937-3,110ms against
   the 2,500ms gate, reproduced across five separate runs.
5. **Load only the weights already used by a real CSS rule today** (Caveat 400; EB
   Garamond 400 upright + 400 italic; Courier Prime 400/700 — five files, still) —
   tried second: three self-hosted files (Caveat, one Garamond, one Courier) already
   measured over the gate at ~2,639-2,641ms on a clean build; a fourth file failed the
   same way regardless of which specific face was added.
6. **Self-host two of the three families, defer the third and the two secondary
   faces (EB Garamond italic, Courier Prime bold), single weight each** — chosen. See
   Decision.

## Decision

- **`next/font/local`**, per option 2 above.
- **Files fetched once, directly, from `fonts.gstatic.com`'s own "latin" subset** — the
  seeded diary content is plain ASCII plus em/en dash and "§", all inside that subset's
  `unicode-range`, so no broader subset is needed. This was a one-way download of a
  public asset (the permitted exception to CLAUDE.md §7.1 — nothing from this repository
  was sent anywhere), not a build-time dependency: the files are committed at
  `apps/web/app/(diary)/fonts/*.woff2` and read from disk by every subsequent build.
- **Licence and provenance.** Caveat, EB Garamond and Courier Prime are all published
  under the **SIL Open Font License 1.1** on Google Fonts
  (`fonts.google.com/specimen/Caveat`, `.../EB+Garamond`, `.../Courier+Prime`) — a
  licence that explicitly permits embedding, self-hosting and redistribution
  (including commercially) with the font files themselves, provided the OFL's own
  copyright/reserved-font-name notices are not altered; it does not require attribution
  in the shipped product itself. No separate licence file is bundled with the `.woff2`
  binaries; the licence is recorded here and by this project name being an
  open-source-licensed asset, not a proprietary purchase.
- **SUPERSEDED BY ADR 0008 — all five committed faces load today: Caveat 400, EB
  Garamond 400 upright and italic, Courier Prime 400 and 700.** What this bullet
  originally decided, and why, is kept below because the measurement behind it still
  reproduces; what changed is that the gate it was protecting turned out to be
  unreachable regardless. See the Consequences.

  *As originally decided:* two of the three families loaded — Caveat (400) and EB
  Garamond (400 upright). Courier Prime, EB Garamond's italic face, and every weight
  beyond 400 were not loaded, though every one of those `.woff2` files was committed
  (`courier-prime-regular.woff2`, `courier-prime-bold.woff2`,
  `eb-garamond-italic.woff2`) — re-enabling any of them a one-line `localFont` call, not
  a new download. Recorded then as `docs/deviations.md` §11 (since removed) and in
  `apps/web/app/(diary)/fonts.ts`'s own header. In short: repeated `npx lhci autorun`
  runs against a freshly-built `.next` in the pinned
  `mcr.microsoft.com/playwright:v1.62.1-noble` image showed `/p/1`'s LCP crossing the
  2,500ms gate once three or more fonts are self-hosted on this route, regardless of
  which specific family is the third — `resource-summary:script:size` and
  `mainthread-work-breakdown` barely move between configurations, so this is a
  request-count/connection-contention effect (the route is served over plain HTTP/1.1
  with no TLS by `next start`), not a raw-byte one. **That effect is real and was
  re-confirmed at 2,637.4 ms for the four-face build.** Caveat is not negotiable: it is
  the actual LCP element on this route and the cover title this task exists to fix. EB
  Garamond was kept over Courier Prime because it carries the diary's reading content
  (captions, notes, descriptions) rather than Courier's auxiliary labels.
- **One weight per loaded family, not the handoff's full range**, per option 5/6:
  `git grep` across every `.module.css` under `apps/web/components` confirms no rule
  sets a Caveat weight other than 400, or a Garamond upright weight other than 400,
  anywhere in the code that exists today. A static single-weight file is smaller than
  the corresponding variable-range file for both (Caveat 400: 48.8KB vs. the 400-700
  variable file's 74.9KB; EB Garamond 400: 23.8KB vs. the 400-600 variable file's
  44.3KB) — CLAUDE.md §4's YAGNI applied to bytes, with the variable file named in
  `fonts.ts`'s comments as the one-line upgrade the moment a heavier weight is used.
- **Wiring.** `apps/web/app/(diary)/fonts.ts` calls `localFont` once per loaded family
  and exports a `.variable` class per family; `apps/web/app/(diary)/layout.tsx` applies
  both classes to `<html>`; `apps/web/app/(diary)/diary.css` redefines
  `--td-font-caveat` and `--td-font-garamond` (not `--td-font-courier`, left untouched)
  to `var(--font-caveat), 'Caveat', cursive` and the Garamond equivalent — layering the
  self-hosted face and next/font's own fallback in front of the handoff's original
  stack rather than replacing it. `packages/tokens/src/tokens.css` itself is unchanged:
  it stays the shared, framework-agnostic token source, and wiring an
  app-build-tool-generated variable name into it would couple that package to
  `apps/web`'s choice of `next/font`.
- **Layout shift.** `next/font/local`'s `adjustFontFallback` (on by default) reads each
  font file's own metrics and generates a size-adjusted `local(Arial)` fallback face
  (`ascent-override`/`descent-override`/`line-gap-override`/`size-adjust`), so the
  fallback-to-webfont swap does not change the text's rendered box size. `display:
  'swap'` (next/font's own default, named explicitly at each call site) was kept
  throughout the investigation; `optional` was tried and reverted (see Consequences) —
  it changes nothing observable in this measurement method and removes a real
  guarantee (`swap` always eventually shows the true font; `optional` can permanently
  commit to the fallback for a given page view on a slow connection).

## Consequences

- **CLS stays 0** on both `/p/1` and `/cms`, re-measured with `npx lhci autorun` in the
  pinned container after every change in this investigation. Nothing about the
  fallback-metric mechanism above was compromised to hit the LCP number.
- **LCP passes, but the margin is thin and was measured, repeatedly, to be thin** —
  ~2,486-2,496ms on `/p/1` against the 2,500ms gate across six clean-Docker-volume runs
  of the final two-font configuration (`apps/web/app/(diary)/fonts.ts` carries the full
  multi-run table for every configuration tried, including the ones that failed). A
  single `lhci autorun` run near this margin is not reliable evidence either way — the
  same code measured as low as 1,962ms in one clean run and as high as 2,496ms in
  another; `lighthouserc.json`'s `numberOfRuns: 1` is unchanged by this task, but this
  route's true position relative to the gate should be read as "usually passes" rather
  than "comfortably passes" until the next item lands.
- **The fix named here as "the real fix for headroom" has since been built, measured,
  and did not work.** This ADR expected that moving the page faces out of `Book.tsx`'s
  client boundary into server-rendered children would shrink the JS competing with these
  font requests and very likely make room for Courier Prime. It was built
  (`docs/adr/0007-server-rendered-page-faces.md`) and it recovered 2,754 bytes of script
  transfer — and **LCP did not move at all**: 2,634.368 ms before, 2,634.656 ms after,
  render delay 2,180 ms both times. There is no headroom, and this route never had a
  script-weight problem of the size that would produce one.

- **THE MEASUREMENT IN THIS ADR REPRODUCES, and ADR 0007's contrary finding is
  withdrawn.** That report re-ran this ADR's table and concluded a third and fourth font
  were free (2,632.984 ms against 2,634.656 ms). It compared against a warm-`.next`-volume
  baseline that had drifted into this route's high mode at ~2,634 ms. On a freshly wiped
  volume, five runs per configuration, every static asset's status code verified 200
  before collecting:

      Caveat 400 + EB Garamond 400          2 files    73,554 B    2,488.2 ms
      + Courier Prime 400/700               4 files   112,440 B    2,637.4 ms
      + EB Garamond italic                  5 files   138,277 B    2,933.8 ms

  which is this ADR's own "2,638-2,641 ms once a third font is self-hosted" to within a
  millisecond. The mechanism named here — `next/font`'s per-face
  `<link rel="preload" as="font">` competing with the script chain on a simulated 4G
  link — was right. `docs/adr/0008-lcp-budget-and-the-framework-floor.md` has the
  working.

- **The deferral was nevertheless lifted, and all five faces now ship.** Not because the
  cost went away but because the gate it protects cannot be met either way. A minimal
  route in this same app — one server component, one styled heading, no font, no
  stylesheet, no client component — measures **2,023.2 ms** and ships **137,986 bytes**
  of React and Next App Router runtime, which is 81% of the 2,500 ms budget before this
  repository writes a line; and the OBSERVED paint on `/p/1` is 122-174 ms in every
  configuration measured, because `simulate` reports Lantern's projection, not a paint.
  Spending the design's entire auxiliary typeface to buy 446 ms of a projected number, on
  a route whose real paint does not move, was the wrong trade. ADR 0008 records the
  floor, the options, and the fact that the gate is left **red and unraised** at
  2,933.8 ms.

- **Courier Prime 400/700 and EB Garamond's italic face now load.** All five committed
  `.woff2` files are wired in `apps/web/app/(diary)/fonts.ts`, and
  `apps/web/app/(diary)/diary.css` redefines all three `--td-font-*` tokens rather than
  two. Weights 500/600 for EB Garamond and 500-700 for Caveat are still not loaded and no
  file for them is committed: no rule in this codebase asks for one (CLAUDE.md §4's
  YAGNI). `docs/deviations.md`'s font entry (§11) has been removed, and
  `e2e/pages.spec.ts`'s Courier fallback-pinning test — written so that re-enabling the
  face would fail loudly rather than pass silently — has done its job and been replaced
  by the positive assertion the Caveat and Garamond cases make, plus a new case that
  distinguishes a real EB Garamond italic face from a synthesised slant.

- **Every committed visual baseline** (`e2e/visual.spec.ts-snapshots/`) has been
  regenerated inside the pinned container against the five-face configuration, with
  `e2e/layout.spec.ts` green in the same run. They previously showed genuine Caveat and
  EB Garamond upright with Courier Prime and Garamond italic visibly in their generic
  fallbacks; they now show the design's full typography.
- **No build-time network dependency for fonts, in this container or any other** — all
  five `.woff2` files are ordinary repository content from here on, and all five are
  loaded.
