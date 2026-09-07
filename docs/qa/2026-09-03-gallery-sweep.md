# Browser sweep — the gallery route and its lightbox

**Date:** 2026-09-03
**Area:** `/gallery/<slug>` (SCREENS.md §1.8), the lightbox over it (§1.9), and
`/gallery/<slug>/download/<id>`.
**Phase / task:** Phase 1, Task 14.
**Engine:** `npx playwright test` (`playwright.config.ts`'s three viewport projects —
`desktop` 1440x900, `mid` 1000x800, `mobile` 390x844), plus the pinned container
`mcr.microsoft.com/playwright:v1.62.1-noble` for the baselines.
**Instrumentation, attached before every navigation:** `console` (errors only),
`pageerror`, and the document's own response status — the same three
`e2e/smoke.spec.ts` attaches, because the handoff's defect log is mostly SILENT
failures (a swallowed click, a missing derivative, a rejected promise), none of which
appear in a screenshot.

This file is the record of what was covered and what was not. Defects are numbered
`GAL-nnn` and each one names the automated test that now fails without the fix — per
CLAUDE.md §10, nothing here was patched straight from the sweep.

---

## Defects found and fixed

### GAL-001 · Every one of the sixty-one tiles was 215x240, not square

**Severity:** high — it is the one measurement `SCREENS.md` §1.8 records as _verified_
("Verified with 61 tiles; must stay square and unsqueezed at 40+").

**Symptom.** Every tile in the grid rendered as a portrait rectangle. Ratio measured
0.8952 against 1.0; `object-fit` was correctly `cover`, so the photographs were cropped
rather than stretched — which is exactly why this was invisible at a glance and had to be
caught by a number. The caption line below each square was pushing the square's own box
taller than its width.

**Root cause.** `.tileSquare` is a `<span>` — the tile is a `<button>`, and a `<button>`
may not contain a `<div>` in valid HTML — and it carried no `display`. Both
`aspect-ratio` and `width: 100%` are ignored on an inline box, so the square was sized by
its content instead of by its track.

**Fix.** `display: block` on `.tileSquare`, with the reason written at the declaration.

**The test that failed first.** `e2e/gallery.spec.ts`'s "keeps every tile square and
unsqueezed at sixty-one of them" — written before the CSS, red on all sixty-one tiles
(the failure listed each one with its measured ratio), green after.

---

### GAL-002 · The lightbox's metadata line failed AA contrast at the handoff's own value

**Severity:** medium — a real WCAG 2.1 AA failure on the one view in the product that
traps a reader's focus.

**Symptom.** No visual symptom at all; found by axe.
`color-contrast`: "Element has insufficient color contrast of 3.87 (foreground color:
#837d70, background color: #25221d, font size: 7.5pt (10px), font weight: normal).
Expected contrast ratio of 4.5:1". One node, at `desktop` and `mid`; `mobile` passed.

**Root cause.** `SCREENS.md` §1.9 specifies that line as "Courier 10px `.24em` uppercase
at 45%". Cream (`#f6ecd6`) at 45% over the lightbox's `rgba(26,22,17,.95)` scrim, itself
over the gallery's white ground, computes to 3.87:1. The stated design value is below the
floor.

**Fix.** 58%, which reaches 5.47:1 over the same stack (50% is 4.44:1 and still short;
52% is 4.68:1 with no margin). Recorded as `docs/deviations.md` §21, with the
measurement, alongside §12 and §15, which changed two cover values and a bookmark
sub-line for the same reason.

**The test that failed first.** `e2e/a11y.spec.ts`'s "has no axe violations with the
lightbox open over that gallery", with **no exclusions** — the fix is the colour, not an
entry in `allow`.

---

### GAL-003 · A shared lightbox address did not open its frame (test defect, not app defect)

**Severity:** low, and it is recorded here because the _sweep_ was wrong rather than the
app.

**Symptom.** "opens the frame a shared address names" failed with `[data-counter]` never
appearing.

**Root cause.** In the test. `page.goto()` to a URL differing from the current one only
in its fragment performs a fragment navigation, not a load — so the mount effect that
reads `location.hash` never ran. A reader following a shared link performs a real load.

**Fix.** `page.reload()` after the fragment `goto`, with the reason at the call site. The
application code was correct and unchanged.

---

### GAL-004 . The gallery header overflowed the 390px viewport and the document scrolled sideways

**Severity:** high - the same defect class as DIARY-004, which stayed green on a blank
page for two commits.

**Symptom.** At the `mobile` project (390x844), the header's title read "Patago" and its
census read "61 photos ." - both clipped off the right edge - and
`document.documentElement.scrollWidth` exceeded `clientWidth`. Found by opening the
newly-generated `diary-gallery-mobile-linux.png` baseline and looking at it, which is
the step `docs/testing.md`'s visual-regression section says never to skip.

**Root cause.** `.header` is one flex row - back control, title block, census - with
`gap: 22px` and `padding: 26px 34px`. Its content's minimum width exceeds 390px, and
nothing let it wrap.

**Fix.** One `@media (max-width: 859px)` block - the design's own mobile breakpoint
(design spec 8.2) - that lets the header wrap, gives the title block its own row,
reduces the title to 42px and trims the route's padding. Nothing moves at the `mid`
(1000px) project or above.

**And the same defect one viewport down, found the same way.** The regenerated
`diary-lightbox-mobile-linux.png` showed the lightbox's top bar cramped: `SCREENS.md`
1.9's `18px 24px` padding leaves 342px for a counter, two ~100px actions and a 36px
close, and `003 / 061` wrapped onto two lines. The same media block trims that bar's
padding and gap and gives the counter `white-space: nowrap`, which fits all four
controls on one line at 390px. This is explicitly NOT `SCREENS.md` 1.10's mobile reading
mode, which is a different shell and a later task; it is the minimum that keeps this
layout usable until that lands.

**The test that failed first.** `e2e/gallery.spec.ts`'s "never scrolls the document
sideways, at any viewport this suite runs at" and its lightbox counterpart - the
measurement `e2e/layout.spec.ts` makes for the book, asked of a route with no design box
to be centred in. Red at `mobile`, green at `desktop` and `mid`, which is the shape of
the defect.

---

### GAL-005 . The gallery's back control sent a reader to the cover if they clicked before hydration

**Severity:** high - it silently defeats the one behaviour the design spec calls out by
name ("returning from a gallery restores `/p/<n>`, not `/`").

**Symptom.** "returns the reader to the page they left the book from, by the gallery's
own control" failed at `desktop` and `mid` with `Received string:
"http://localhost:3000/p/1"` - the cover, not page nine. Intermittent: it passed against
a warm dev server and failed against a cold one, which is exactly the profile of a
hydration race and exactly the kind of defect that gets waved through as a flake.

**Root cause.** The first design made the control a client component that rendered
`href="/p/1"` and corrected it to the referring page in a `useEffect`. Between first
paint and hydration the control genuinely pointed at the cover, and a reader on a slow
connection is in that window for as long as the JavaScript takes.

**Fix.** The page number travels in the link the BOOK renders
(`galleryPath(slug, leafIndex)` -> `/gallery/patagonia?from=9`) and the gallery route
resolves it server-side (`returningPagePath(from)`). The control is now a plain
server-rendered anchor with the right `href` in the first bytes, and works with no script
at all. `BackToBook.tsx` was deleted; the route has no client-side referrer logic left.
Reading the `Referer` header server-side was considered and rejected: `SECURITY.md`'s
Public site section requires the diary to be CDN-served, and a document that varied by
`Referer` cannot be.

**The test that failed first.** The case above, plus a new one that reads the control's
`href` out of the RAW HTML with `request.get` - a crawler runs no JavaScript, and neither
may the assertion that stands in for a reader who clicks early.

---

## What was walked, and what was found clean

| Route / view                                   | Projects             | Console / `pageerror`        | Notes                                                                                                                                                                                                                                 |
| ---------------------------------------------- | -------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/gallery/patagonia` (61 tiles)                | desktop, mid, mobile | clean                        | Sixty-one tiles, all square after GAL-001. `loading="lazy"` on every one.                                                                                                                                                             |
| The lightbox, opened from a tile               | desktop, mid, mobile | clean                        | Opened, stepped with the arrows, closed with Escape, all inside `e2e/smoke.spec.ts`'s own instrumented case — a client component that mounts a document listener, moves focus and reads `navigator` has three ways to throw at mount. |
| `/gallery/<slug>/download/<id>`                | desktop              | n/a (a file, not a document) | 200 with `Content-Disposition: attachment`, `Content-Type: image/png`, `nosniff`.                                                                                                                                                     |
| The same id through the wrong journey's slug   | desktop              | n/a                          | 404, as every other refusal does.                                                                                                                                                                                                     |
| `/gallery/no-such-journey`                     | desktop              | n/a                          | 404, not an empty grid.                                                                                                                                                                                                               |
| Return to `/p/9` by the gallery's back control | desktop, mid, mobile | clean                        |                                                                                                                                                                                                                                       |
| Return to `/p/9` by the browser's Back button  | desktop, mid, mobile | clean                        |                                                                                                                                                                                                                                       |
| A gallery reached with no referrer             | desktop, mid, mobile | clean                        | Back control points at `/p/1` — a page of the book, never `/`.                                                                                                                                                                        |

## What was NOT covered, and why

- **Clips.** No `media` row can carry `kind: 'clip'` while video is deferred
  (`docs/adr/0004-media-pipeline-mode.md`), so neither the grid's play badge and duration
  chip nor the lightbox's absent clip transport was walked in a browser. Both are recorded
  in `docs/deviations.md` §18. Nothing was faked in the database to produce a clip.
- **The windowed grid past a hundred tiles.** The seeded gallery is sixty-one frames, by
  design (`docs/deviations.md` §20), so `tileWindow`'s measured branch is exercised by
  `packages/domain/src/gallery.test.ts` and `useGridGeometry.test.tsx` rather than by a
  browser. A gallery large enough to window does not exist in this repository's content.
- **The mobile reading mode's own gallery.** `SCREENS.md` §1.10 gives the sub-860px
  reader a different shell entirely ("No book, no flip, no scaling") and a full-width
  gallery button; that mode is not built. The gallery route at 390px is therefore the
  desktop layout squeezed, which is a transitional state on a screen whose real design is
  a later task — the same reading `docs/deviations.md` §16 applies to the bottom bar.
- **`indexGalleries`.** Nothing writes that setting yet, so no robots directive is served
  for the gallery page. See `docs/security.md`'s row for that requirement, still open.
