# Sweep: book & cover screens (SCREENS.md §2.6, §2.7) — 2026-09-20

**Build:** `24a9438` **Engine:** playwright (chromium, `desktop` project, headless) **Routes walked:** 2 (`/admin/book`, `/admin/cover`), at nine widths each
**Result:** 3 defects — S1:0 S2:1 S3:1 S4:1

Instrumented for `console` (every level), `pageerror` and every response with a
status ≥ 400 before the first navigation, because most of what these two screens
can get wrong is silent: both are cards of declared values, and a wrong one is a
correct-looking screenshot.

**Nothing in this sweep saved anything.** Every control on either screen writes a
GLOBAL or `journeys.order`, which is one row for the whole diary, so the sweep
pressed chips, swatches, toggles and sliders — all of which are the island's own
state — and pressed no Save. The two cases in `e2e/admin.spec.ts` that DO write
read what they found first and put it back, and the bookmark one now verifies
the restore rather than assuming it. The developer's `diary` database was dumped
before and after the whole browser session (the `book` and `about` globals, the
`about_paragraphs` and `about_kit` rows, and every journey's `id`/`slug`/`order`/
`_status`); `diff` reports no difference but `book.updated_at`.

Widths walked: 1440, 1280, 1180, 1120, 1000, 900, 860, 780 and 412 — the three
the shell's own rungs sit at, the two SCREENS.md §2.6 and §2.7 name, the
converted container rung, and the phone.

## Defects

### BOOK-001 · S2 · Neither screen ever drew its second column, at any width

- **Route:** `/admin/book` and `/admin/cover`, 1440×900 (and every width above the rung)
- **Steps:**
  1. Cold-load `/admin/book` at 1440×900, which is the design's own reference width.
  2. Read `grid-template-columns` off the screen's own element.
- **Expected:** `SCREENS.md` §2.6 gives `minmax(0,1fr) 340px` above 1180px and §2.7
  gives two equal columns above the same. At 1440 the shell's content box is
  1142px, which is above the converted container rung of 1120, so both shapes
  should be in force.
- **Actual:** one track. `/admin/book` reported `1142px` and `/admin/cover`
  reported `1142px` — the settings card and the About card were stacked under
  their neighbours at every viewport this project tests, exactly as `GAL-004` had
  been one screen earlier.
- **Evidence:**

  ```text
  bookSettingsColumn: "1142px"   (expected "340px")
  coverColumns: 1, coverEqual: false   (expected 2, true)
  ```

  The cause is the one `galleries.module.css`'s header warns about and this file
  then re-made: **an element cannot be its own query container.** `.screen`
  declared `container-type: inline-size` AND the grid, and `.screenBook`
  `composes: screen`, so both landed on the same element and no `@container`
  block could ever match a descendant — because there was no descendant.

  Caught by `e2e/admin.spec.ts`'s own column-shape case on its first run, which
  is why it never reached this document as a surprise. The fix is a wrapper: the
  `<section>` is the container and an inner `<div data-book-columns>` is the grid.

### BOOK-002 · S2 · The cover-cloth case asserted nothing at all below 860px

- **Route:** `/p/1` on the `mobile` project (412×823)
- **Steps:**
  1. Save a different cover cloth on `/admin/cover`.
  2. Open `/p/1` at 412px and read the cover's computed background.
- **Expected:** the reader's cover is painted in the cloth that was just saved —
  on whichever surface serves the address.
- **Actual:** `"none"`, before and after. Below 860px `apps/web/middleware.ts`
  rewrites `/p/<n>` to the mobile reading mode, which is a different route entry
  with a different component tree: there is no `[data-page="cover"]` there, the
  selector fell back to `document.body`, and the case compared `"none"` with
  `"none"` and passed on desktop while proving nothing on the phone.
- **Evidence:**

  ```text
  Expected: not "none"
  Received: "none"
  ```

  The fix is to read `--cover-cloth`, which is the custom property BOTH surfaces
  build their gradient from and the value this screen actually writes — so the
  case now says WHICH cloth arrived rather than only that something moved, and it
  runs on all three viewport projects.

### BOOK-003 · S4 · Both sliders are four pixels wider than every other control on their card

- **Route:** `/admin/book`, at 1440, 900 and 412
- **Steps:**
  1. Cold-load `/admin/book`.
  2. Compare every element inside `[data-book-settings]`'s `scrollWidth` with its
     `clientWidth`.
- **Expected:** `SCREENS.md` §2.6's card is one column of controls inside one
  padding, and the two ranges are drawn on the same line as the labels beneath
  them.
- **Actual:** the "Page turn" and "Gallery thumbnail" groups each overflow their
  own column by exactly 4px, at every width. Nothing scrolls, nothing is clipped,
  and the page has no horizontal scrollbar — so the only visible symptom is that
  the two tracks start two pixels left of every other control and end two pixels
  right of them.
- **Evidence:**

  ```json
  [
    { "tag": "DIV", "text": "Page turnbrisk800 mslanguid", "scroll": 304, "client": 300, "overflowX": "visible" },
    {
      "tag": "DIV",
      "text": "Gallery thumbnaildense200 pxgenerous",
      "scroll": 304,
      "client": 300,
      "overflowX": "visible"
    }
  ]
  ```

  Chromium's UA stylesheet gives `input[type=range]` `margin: 2px`, so a track
  declared `width: 100%` is its column plus four pixels. The prototype's inline
  `width:100%` has the same margin behind it, which is why this is the one place
  the transcription has to say more than the prototype does: `margin: 0`.

## Clean

- **`/admin/book`** at 1440, 1280, 1180, 1120, 1000, 900, 860, 780 and 412 —
  after BOOK-001, the two-column shape appears exactly where the conversion says
  it should (container 1142 at viewport 1440) and stacks below it, and the
  document never scrolls sideways at any width.
- **`/admin/cover`** at the same nine widths, same result.
- **Every literal SCREENS.md §2.6 names, measured in the engine:** rows at
  `10px 0` with a dotted rule, a 9x9 tint square rotated 45° (`matrix(0.707107,
0.707107, -0.707107, 0.707107, 0, 0)`), the name in Caveat 26px, "p. {n}"
  right-aligned in a 66px cell, 26x26 arrows, 44x44 swatches, the page-turn range
  at `400/1600/50` and the gallery-thumbnail range at `140/300/10`.
- **Every literal §2.7 names:** a 172x224 preview, its rule at `inset: 9px`, a
  140px portrait, Title in Caveat 30px, Years shown in Courier Prime 13px, and
  the reply-to line in Caveat 26px `rgb(163, 68, 52)` — which is `#a34434`.
- **Copy**, verbatim: "this is also the order of the book"; the three chips "As
  arranged / Newest first / Oldest first"; the three toggles with their hints.
- **The toggle hotspot** ("toggle a switch twice — nested toggle state read stale
  and toggles appeared dead"): `true → false → true`, and a chip pressed twice
  stays pressed rather than un-pressing.
- **Both sliders at both ends, by keyboard**: `Home`/`End` reach exactly
  "400 ms"/"1600 ms" and "140 px"/"300 px", and each readout follows.
- **The Kit's trailing input**: four inputs for three stored lines, the last one
  empty — which is the only way a line can be added with no JavaScript.
- **The portrait select** defaults to `""`, which is "leave the portrait alone".
- **Console, `pageerror` and failed responses**: nothing but Next's own
  development-mode `[HMR] connected` and the React DevTools notice. No 4xx, no 5xx.
- **axe**, full ruleset, both screens: **0 violations**.

## Not covered

- **Anything behind a Save**, on either screen, beyond the two `e2e/admin.spec.ts`
  cases that restore what they write. The sliders, chips, swatches and toggles
  were exercised as island state only, so what this sweep says about them is that
  the CARD holds them — not that the write does, which is
  `bookMutations.integration.test.ts`'s and `coverMutations.integration.test.ts`'
  subject against a real Payload.
- **The arrows under "Newest first" and "Oldest first"** (`docs/deviations.md`
  §84). Reaching that state means writing `book.journeyOrderMode` on the
  developer's own diary; both sides of the rule are taken by
  `readBookScreen.integration.test.ts` and by `BookmarkOrder.test.tsx` instead.
- **A visual baseline.** `docs/deviations.md` §86: baselines are generated in the
  pinned Playwright Linux container and this sweep ran on Windows, where a run
  writes a `-win32` baseline and then compares the host against itself for ever.
  Six admin screens owe one and they are being taken together in Task 15.
- **The Replace select against a library larger than the cap.** The dev diary has
  fewer photographs than `MAX_PORTRAIT_CHOICES` offers, so the boundary is taken
  in `readCoverScreen.integration.test.ts`, which builds a library past it.
- **A real font-metric check on the preview title.** The engine reports 32px for
  "Wanderings", which is `fitPreviewTitleSize`'s answer, and the title's box is
  inside the preview's — but whether Caveat's real advance widths agree with the
  0.40em estimate is a question `SCREENS.md` §1.1 answers with an estimate too.
