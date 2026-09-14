# 5 · Visual regression — the detail

The detail for `docs/testing.md` §5. That document states the suite's tool, its scope
and how to run it, and points here; everything else about the suite is below. The section
numbers are `docs/testing.md`'s and do not change.

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
  cosmetic one: `/p/1` served all thirty-three leaves at once then (ADR 0009 narrowed it
  to the content window afterwards), so replacing thirty heading-only fallback faces with
  thirty designed pages changed what is drawn behind the current leaf in every screenshot
  in this suite.

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
  Phase 1 closed the gap below). `e2e/visual.spec.ts` snapshots every page type and every
  admin screen that exists, at the three breakpoints `mobile`, `mid` and `desktop`: the
  diary's Cover, Contents, Notes, Frames I and II, About, gallery, lightbox and
  not-found; its mobile drawer, which is a `mobile` baseline alone because the drawer
  exists at no other width; Payload's own `/cms`; and the bespoke panel — sign-in, its
  code step, the signed-in state, the panel itself, and the reset screen in its sent,
  live and expired states. **The directory is the authority, not this sentence**: the
  baselines are committed at `e2e/visual.spec.ts-snapshots/*.png`, one file per screen
  per breakpoint, and this list drifted a whole phase behind them once (final review 9,
  F9-10). A snapshot suite with no baseline to compare against protects nothing.
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
  Run bullet below documents in full (and which passes `--update-snapshots=changed`; `all`
  is the separate `npm run test:visual:container:update:all`, for the reason the Run
  bullet gives). The old `-win32.png` files were deleted, not
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

  | Shift    | `desktop` (1440×940)         | `mid` (1000×800) | `mobile` (390×844, DPR 3)   |
  | -------- | ---------------------------- | ---------------- | --------------------------- |
  | **10px** | **passes**                   | **passes**       | fails — 3,323px, ratio 0.02 |
  | **20px** | **passes**                   | fails — 9,865px  | fails — 16,096px            |
  | **40px** | fails — 18,958px, ratio 0.02 | fails            | fails                       |

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
