# 0005 — Font hosting: self-host via `next/font/local`, two of three families for now

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
- **Two of the three families load today: Caveat (400) and EB Garamond (400 upright).**
  Courier Prime, EB Garamond's italic face, and every weight beyond 400 for Caveat and
  Garamond are **not loaded**, though every one of those `.woff2` files is committed
  and unused (`courier-prime-regular.woff2`, `courier-prime-bold.woff2`,
  `eb-garamond-italic.woff2`) — re-enabling any of them is a one-line `localFont` call,
  not a new download. This is recorded as `docs/deviations.md` §11 and in
  `apps/web/app/(diary)/fonts.ts`'s own header, which carries the full measured table.
  In short: repeated `npx lhci autorun` runs against a freshly-built `.next` in the
  pinned `mcr.microsoft.com/playwright:v1.62.1-noble` image showed `/p/1`'s LCP crossing
  the 2,500ms gate once three or more fonts are self-hosted on this route, regardless of
  which specific family is the third — `resource-summary:script:size` and
  `mainthread-work-breakdown` barely move between configurations, so this is a
  request-count/connection-contention effect (the route is served over plain HTTP/1.1
  with no TLS by `next start`), not a raw-byte one. Caveat is not negotiable: it is the
  actual LCP element on this route (a bookmark-rail journey name) and the cover title
  this task exists to fix. EB Garamond was kept over Courier Prime because it carries
  the diary's reading content (captions, notes, descriptions) rather than Courier's
  auxiliary labels, and because the Caveat+Garamond pairing's margin under the gate,
  while thin, was consistently positive across repeated clean-volume runs, whereas
  Caveat+Courier's was observed once at single-digit milliseconds of margin.
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

  **The table was then re-run as this section asked, and this ADR's own finding did not
  reproduce.** Courier Prime 400 and 700 wired on top of that change measured a
  **2,632.984 ms** median over five runs against the two-font configuration's
  **2,634.656 ms** — 38,886 extra bytes and four font requests instead of two, for a
  difference smaller than the run-to-run noise. The "LCP crosses the gate the moment a
  third font is self-hosted" conclusion recorded above was true when it was measured and
  is not true now; what changed is the floor beneath it, since `/p/1` now sits at
  ~2,634 ms with two fonts or with four, 135 ms over the gate, on a render delay that
  neither scripts nor fonts explain.

  The deferral therefore **stands, on a different and weaker footing than this ADR
  claims**: not "a third font breaks the gate" but "the gate is already broken and this
  is not the task that decides to spend 38,886 more bytes on a red route". Restoring
  Courier Prime is now a decision waiting to be taken, not a measurement waiting to be
  made. `docs/deviations.md` §11's rationale should be read with this paragraph beside
  it.
- **Courier Prime, EB Garamond's italic face, and every weight above 400 for the two
  loaded families render in generic fallbacks today** — an intentional, documented,
  reversible scope reduction from the handoff's full specification, not a silent gap.
  `docs/deviations.md` §11 and `e2e/pages.spec.ts` both assert this explicitly (a test
  pins the Courier eyebrow's computed `font-family` at the literal fallback stack, so
  the day Courier Prime is wired back in, that test fails and must be updated — it
  cannot silently keep "passing" for the wrong reason).
- **All nine committed visual baselines** (`e2e/visual.spec.ts-snapshots/`) were
  regenerated inside the pinned container against this final configuration and now show
  genuine Caveat and EB Garamond typography on the Cover and Contents pages, with
  Courier Prime and Garamond italic still visibly in their generic fallbacks — an
  accurate picture of the current, intentionally partial state, not a claim of full
  fidelity.
- **No build-time network dependency for fonts, in this container or any other** — the
  five `.woff2` files (two loaded, three committed for later) are ordinary repository
  content from here on.
