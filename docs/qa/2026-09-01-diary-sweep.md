# Sweep: diary — 2026-09-01

**Build:** 9b6db64 **Engine:** playwright-headed **Routes walked:** 3 × 3 viewports (9)
**Result:** 6 defects — S1:1 S2:3 S3:1 S4:1

Routes: `/p/1` (Cover), `/p/2` (Contents), `/p/3` (Journey — Tokyo — Notes).
Viewports: the three `playwright.config.ts` projects — `desktop` 1440×900, `mid`
1000×800, `mobile` 390×844 (isMobile, hasTouch, DPR 3).

`console` (all levels), `pageerror`, `requestfailed` and every response ≥400 were
attached before the first `page.goto` on each context, per `CLAUDE.md` §10.

## Defects

### DIARY-001 · S1 · The book is not centred in its area; it is clipped from ~1435px down and renders entirely off-screen at 390px

- **Route:** `/p/1`, `/p/2`, `/p/3` — every viewport below ~1435px. Screenshots at
  `mid` 1000×800 and `mobile` 390×844.
- **Steps:**
  1. Cold-load `http://localhost:3000/p/1`.
  2. Set the viewport to 1000×800.
  3. Read the design box's bounding rect against its parent's:
     `document.querySelector('[data-design-box]').getBoundingClientRect()` versus
     `.parentElement.getBoundingClientRect()`.
  4. Repeat at 390×844.
- **Expected:** the book is drawn centred in the area `useBookScale` measures.
  `book.module.css`'s own header states the rail and bar "sit OUTSIDE the scaled design
  box … so they must not overlap the area `useBookScale` measures — a strip of chrome
  lying across the book would also lie across the page-edge turn strips and swallow
  their clicks. A grid, rather than absolute positioning over the book, is what makes
  that impossible rather than merely unlikely." SCREENS.md §1 makes the 1300×860 box
  absolute and scaled, never reflowed — it does not make it off-centre.
- **Actual:** the book's visual centre is pinned at **x = 650** at every width — the
  design box's own `transform-origin: 650px 430px` — while the area's centre moves with
  the viewport. `.bookArea` is `display: grid; place-items: center` with no
  `grid-template-columns`, so the 1300px-wide box is auto-placed into an **implicit**
  `auto`-sized column that is itself 1300px wide and overflows the area to the right;
  centring inside that track leaves the box's layout left at 0, and `scale(k)` about its
  own centre then leaves the visual result at x = 650 − 650k. Measured on `/p/1`:

  | viewport | book area | design box | off-centre by | clipped right | overlaps rail |
  | -------- | --------- | ---------- | ------------- | ------------- | ------------- |
  | 1920     | 0–1762    | 245–1517   | 0px           | 0px           | no            |
  | 1440     | 0–1282    | 14–1286    | 9px           | 4px           | yes           |
  | 1200     | 0–1042    | 129–1171   | 129px         | 129px         | yes           |
  | 1000     | 0–842     | 229–1071   | 229px         | 229px         | yes           |
  | 860      | 0–702     | 299–1001   | 299px         | 299px         | yes           |
  | 600      | 0–442     | 429–871    | 429px         | 429px         | yes           |
  | 390      | 0–232     | 534–766    | 534px         | 534px         | yes           |

  At 390×844 the entire book lies outside the 390px viewport and is clipped away by
  `.stage { overflow: hidden }`: `document.elementFromPoint` at the design box's own
  centre returns **`null`**, and the reader sees a blank page carrying only the bookmark
  rail, the counter and the two arrows. This is **not** the deferred mobile reading mode
  alone — at 1200px and 1000px, both well above SCREENS.md §1.10's 860px boundary where
  the scaled book _is_ the specified layout, 129px and 229px of the page are cut off,
  and the fore-edge, the airmail stamp and the right page edge are lost with them.

- **Evidence:** `docs/qa/assets/2026-09-01-diary/mid-1000x800-p1.png` (the cover runs
  under the rail; its stamp is cut) · `docs/qa/assets/2026-09-01-diary/mobile-390x844-p1.png`
  (no book at all) · the table above, read from `getBoundingClientRect()` ·
  `apps/web/components/book/book.module.css` `.bookArea`.

  **Confirmed on a production build, independently of this sweep's engine.**
  `docs/qa/assets/2026-09-01-diary/prod-412x823-p1-lighthouse.png` is Lighthouse's own
  final screenshot of `/p/1` from `npm run test:perf` — a `next build` + `next start`
  server at 412×823 — and it is the same blank page with only the rail, the counter and
  the arrows. It also explains a result from the performance gate: Lighthouse reports
  `/p/1`'s LCP element as `nav.rail > button.bookmarkTab`, a bookmark tab's text, rather
  than the cover title, because at that width the cover is not on the screen to be
  painted.

### DIARY-002 · S2 · Nine of thirteen bookmark tabs are covered by the book at 1000×800 and silently swallow every click

- **Route:** `/p/1` at 1000×800 (`mid`).
- **Steps:**
  1. Cold-load `/p/1` at 1000×800 and let the book settle.
  2. For each `[data-bookmark]`, call `document.elementFromPoint` at the tab's centre.
  3. Click `[data-bookmark="11"]` ("Marrakech — Notes").
- **Expected:** the tab jumps to `/p/12`. `Book.tsx`'s header lists the bookmark tabs as
  one of the handoff's five triggers ("Every one of them ends at `turnTo` or `jumpTo`
  and nowhere else"), and SCREENS.md §1.7 gives the rail its own 158px column beside the
  book, not under it.
- **Actual:** the click does nothing. The URL stays `/p/1` and the counter stays
  `01 / 33`. `elementFromPoint` at nine of the thirteen tabs' centres resolves to
  `DIV.cover-module__Tax46q__column` — the Cover page's own text column, painted above
  the rail because a leaf's `z-index` runs to 1000 while the rail has none. The tabs
  affected are every journey tab from Lisbon to Seville:

  ```
  blocked tabs: [{"tab":"5","label":"Lisbon — Notes","hit":"DIV[cover-module__Tax46q__column]"},
                 {"tab":"8","label":"Patagonia — Notes",…}, {"tab":"11","label":"Marrakech — Notes",…},
                 {"tab":"14","label":"Reykjavik — Notes",…}, {"tab":"17","label":"Kyoto — Notes",…},
                 {"tab":"20","label":"Hanoi — Notes",…},    {"tab":"23","label":"Porto — Notes",…},
                 {"tab":"26","label":"Bergen — Notes",…},   {"tab":"29","label":"Seville — Notes",…}]
  after click url: /p/1 counter: 01 / 33
  ```

  There is no console error, no `pageerror` and no failed request — the handler is fine
  and never runs. Playwright names the same thing explicitly:

  ```
  locator.click: Timeout 5000ms exceeded.
  Call log:
    - waiting for locator('[data-bookmark="11"]')
      - locator resolved to <button type="button" data-bookmark="11" class="book-module__7L0BKq__bookmarkTab">Marrakech — Notes</button>
    - attempting click action
      2 × waiting for element to be visible, enabled and stable
  ```

  Same probe at 1440×900: 0 tabs blocked, click lands on `/p/12`. At 390×844: 0 blocked,
  click lands on `/p/12` — because there the book has been pushed past the rail
  entirely (DIARY-001), not because the layout is right.

- **Evidence:** the log above · `docs/qa/assets/2026-09-01-diary/mid-1000x800-p1.png`,
  where the rail shows only Cover / Contents / Tokyo at the top and About at the bottom
  — the nine tabs between them are behind the book. Same root cause as DIARY-001.

### DIARY-003 · S2 · The right page-edge turn strip is unreachable by pointer at and below 1000px; both strips are unreachable at 390px

- **Route:** `/p/1` at 1000×800 and 390×844.
- **Steps:**
  1. Cold-load `/p/1`.
  2. At each width, take `[data-edge="right"]`'s bounding rect and call
     `document.elementFromPoint` at its centre; repeat for `[data-edge="left"]`.
- **Expected:** the 44px forward strip and the 30px backward strip are clickable at
  every width. `README.md`'s "Triggers" lists them first, and `EdgeStrip.tsx`'s header
  keeps them in the DOM at the ends of the book precisely for "a stable layout, a stable
  selector".
- **Actual:** `elementFromPoint` returns `null` at the right strip's centre for every
  width from **1000px down** (`off-viewport`), because the strip travels with the
  off-centre book and leaves the viewport. At 390px **both** strips are off-viewport.
  Measured: right strip `ok` at 1920, 1440, 1200, 1100; `off-viewport` at 1000, 900,
  861, 860, 800, 700, 600, 500, 390. Left strip `ok` down to 500, `off-viewport` at 390.
  `e2e/flip.spec.ts` still passes on the `mid` and `mobile` projects because Playwright
  scrolls the element into view before clicking; a reader cannot.
- **Evidence:** the width table in DIARY-001 · the same
  `mid-1000x800-p1.png`, where the book's right edge is under the rail and past it.
  Same root cause as DIARY-001, but a distinct symptom class — a dead trigger rather
  than lost content — so it needs its own failing test before either is fixed.

### DIARY-004 · S2 · The `mid` and `mobile` visual-regression baselines were regenerated over the clipped book, so the guard is green on a broken screen

- **Route:** n/a — `e2e/visual.spec.ts-snapshots/`.
- **Steps:**
  1. Open `e2e/visual.spec.ts-snapshots/diary-cover-mobile-linux.png`.
  2. Compare it against `docs/qa/assets/2026-09-01-diary/mobile-390x844-p1.png`.
- **Expected:** `CLAUDE.md` §2's visual-regression row exists because "the design is
  high-fidelity; drift is a defect". A baseline is the record of what the screen should
  look like.
- **Actual:** the committed mobile Cover baseline **is** the blank screen — bookmark
  rail, counter and two arrows on empty paper, no book. It was regenerated in
  28c6153 ("test(diary): regenerate visual baselines for the self-hosted fonts") and has
  been green ever since, over a page with no book on it. `diary-contents-mobile-linux.png`
  and the two `mid` baselines carry the same state. The suite designed to catch exactly
  DIARY-001 has instead ratified it.
- **Evidence:** `e2e/visual.spec.ts-snapshots/diary-cover-mobile-linux.png` (committed)
  versus `docs/qa/assets/2026-09-01-diary/mobile-390x844-p1.png` (this sweep) — the two
  images match. Whoever fixes DIARY-001 must regenerate these four baselines, and the
  regeneration is the fix's proof, not a side effect of it.

### DIARY-005 · S3 · The bookmark rail never marks an active tab, and the "Bookmarks" eyebrow is absent

- **Route:** `/p/1`, `/p/2`, `/p/4`, `/p/5`, `/p/12`, `/p/33`, all three viewports.
- **Steps:**
  1. Load each of those pages.
  2. Read every `[data-bookmark]`'s `aria-current`, `aria-selected`, computed
     `background-color`, computed `transform` and class list.
  3. Check `nav[aria-label="Bookmarks"]` for the eyebrow text.
- **Expected:** SCREENS.md §1.7 — "Active: `#fbf6e9` fill, `translateX(−6px)`,
  `0 3px 12px -5px rgba(60,44,20,.5)` plus a `1px` inset ring; inactive
  `rgba(120,98,60,.07)`", with "a 6px tint bar on the left (`opacity 1` active / `.5`)",
  a `"Bookmarks"` eyebrow above the column, and the spanning rule on the next line:
  "Journey tabs span 3 pages, so a tab is active when `index ∈ [start, start+3)`. Cover,
  Contents and About span 1."
- **Actual:** no tab is ever active on any page. All 13 tabs report a single background
  `rgba(120, 98, 60, 0.14)`, `transform: none`, one class name
  (`book-module__7L0BKq__bookmarkTab`), and zero `aria-current`/`aria-selected`
  attributes — identical on pages 1, 2, 4, 5, 12 and 33, so the `[start, start+3)` span
  is not implemented at all rather than implemented wrongly. The `"Bookmarks"` eyebrow is
  not rendered. Also absent from the bottom bar: the page label under the counter
  (SCREENS.md §1.7, "a 210px-min column with the counter … over the page label
  (Garamond italic 14px)").

  This is scoped out in the code rather than overlooked — `Book.tsx`'s SCOPE note and
  `book.module.css`'s chrome section both name SCREENS.md §1.7's appearance as Task 12.
  It is recorded here because the sweep was asked for it and because the rail is on
  screen today; triage may close it against that task rather than fixing it.

- **Evidence:** the per-page probe output in this sweep's raw findings; verified in the
  source at `apps/web/components/book/Book.tsx` (the tab renders no active class and no
  `aria-current`) and `apps/web/components/book/book.module.css` `.bookmarkTab` (one
  rule, no active variant, no eyebrow).

### DIARY-006 · S4 · `/favicon.ico` 404s on every cold load

- **Route:** every route, every viewport.
- **Steps:**
  1. Attach a `console` listener.
  2. Cold-load `/p/1`.
- **Expected:** no failed responses on a clean load.
- **Actual:** a console `error` on the first load in each context:
  ```
  Failed to load resource: the server responded with a status of 404 (Not Found)
    http://localhost:3000/favicon.ico
  ```
  Nothing else appears on any route at any viewport beyond Next's own dev noise (the
  React DevTools notice and `[HMR] connected`). No `pageerror`, no `requestfailed`, no
  other response ≥400 across all nine walks.
- **Evidence:** the console excerpt above, captured identically on `desktop`, `mid` and
  `mobile`. `apps/web/app/` carries no `icon`/`favicon` file. Reproduced on the
  production build too: `npm run test:perf`'s LHR records
  `404 Other http://localhost:3000/favicon.ico` in `network-requests` and the same line
  as the sole entry in its `errors-in-console` audit.

## Triage and resolution — 2026-09-02

Appended after the fixes; the findings above are the record of the sweep and are
left as they were written.

| Defect    | Sev | Outcome                                                                                                                                                                                                                                                    | Where                                                                            |
| --------- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| DIARY-001 | S1  | **Fixed.** `.bookArea` given explicit `minmax(0, 1fr)` tracks, so `place-items: center` centres the design box in the same rectangle `useBookScale` measures.                                                                                              | `fix(diary): centre the scaled book in the area its scale is measured from`      |
| DIARY-002 | S2  | **Fixed by DIARY-001**, verified rather than assumed: 0 of 13 tabs blocked at every viewport, and a click on `[data-bookmark="11"]` reaches `/p/12`. No separate change was needed — with the book inside its own grid column it cannot lie over the rail. | same commit                                                                      |
| DIARY-003 | S2  | **Fixed by DIARY-001**, verified: both `[data-edge]` strips hit-test to themselves at 1440, 1000 and 390.                                                                                                                                                  | same commit                                                                      |
| DIARY-004 | S2  | **Fixed.** All six `diary-*` baselines regenerated in `mcr.microsoft.com/playwright:v1.62.1-noble` and asserted to show a book before being accepted.                                                                                                      | `test(diary): regenerate the visual baselines over a book that is on the screen` |
| DIARY-005 | S3  | **Deferred to Task 12** at triage, and **fixed there.** See the note under this table.                                                                                                                                                                     | `feat(diary): add the bookmark rail, bottom bar and ribbon`                      |
| DIARY-006 | S4  | **Fixed.** `apps/web/app/favicon.ico` added; `/favicon.ico` responds 200 on every route.                                                                                                                                                                   | `fix(diary): serve an icon at /favicon.ico`                                      |

**DIARY-005, closed 2026-09-03 (Task 12).** Deferring it was the right call and the
reason is worth keeping: landing the `aria-current` alone would have shipped half of
`SCREENS.md` §1.7 and moved the six `diary-*` visual baselines twice. Every item the
defect listed is now on screen and asserted:

- **No tab ever active.** `deriveRail` now carries each tab's `span` from
  `deriveBookmarks`, and `isRailTabActive` (`packages/domain/src/bookBundle.ts`, 100%
  covered) answers `index ∈ [start, start + span)`. The active tab carries
  `aria-current="page"`, `#fbf6e9`, `translateX(-6px)`, the drop shadow and the 1px inset
  ring; the tint bar goes to `opacity: 1`. Asserted at all three viewport projects in
  `e2e/chrome.spec.ts` — one tab stays marked across `/p/3`, `/p/4` and `/p/5` and hands
  over on `/p/6` — and per-page in
  `apps/web/components/chrome/BookmarkRail.test.tsx`.
- **The `"Bookmarks"` eyebrow.** Rendered, in Courier 9.5px `.22em`, and it is also what
  names the navigation landmark (`aria-labelledby`), so a screen reader announces
  "Bookmarks" once rather than twice.
- **The page label under the counter.** `derivePageLabels` derives one label per page on
  the server; the bar prints the one for the page the reader is on.
  `e2e/chrome.spec.ts` opens `/p/13` and requires `13 / 33` over
  `Marrakech — Frames I` — a page whose label a rail-derived string could not produce.

One thing the defect did not record and the fix found: the handoff's `opacity: .62` on
each tab's sub-line fails WCAG AA (2.38:1 inactive, 3.50:1 active, measured by axe-core),
which failed 18 of `e2e/a11y.spec.ts`'s 24 cases before it was changed. See
`docs/deviations.md` §15.

The LCP prediction in DIARY-001 held. On five production runs of `npm run test:perf`
after the fix, `/p/1`'s LCP element is the cover title
(`h1.cover-module__title`, "Wanderings") on four of five runs rather than a bookmark
tab; median LCP 2482ms against the 2500ms budget, median script transfer 142998 bytes
against 184320.

## Clean

- **`/p/1`, `/p/2`, `/p/3` at 1440×900 (`desktop`)** — the book is centred, fills its
  area and does not overlap the rail; all four page types on screen render their real
  seeded copy ("Wanderings", "field notes, photographs and other scraps",
  "Each journey runs three pages — notes, then two spreads", "Tokyo — Notes ·
  JAPAN · 12 – 24 MARCH 2025").
- **The back-face swallow does not reproduce.** On `/p/2` at `desktop` and `mid`, the
  Contents row nearest the fold hit-tests to the anchor itself
  (`hitFace: "front"`, `hitIsTargetOrChild: true`) and clicking it navigates to `/p/3`.
  No `[data-face="back"]` or `[data-shade]` anywhere reports anything but
  `pointer-events: none`.
- **The latch always releases.** 14 next-clicks at 60ms intervals, then 14 prev-clicks,
  on all three viewports: the book advances the two pages a 900ms turn allows in that
  window, never seizes, and a single clean turn afterwards still works
  (`seized: false` on `desktop`, `mid` and `mobile`).
- **No mirrored or stranded content after a flip.** Mid-flight exactly two leaves are
  visible — the turning leaf (`z-index: 2000`, `pointer-events: none`) and the leaf
  being revealed; at rest exactly one, `pointer-events: auto`. Every other leaf is
  `visibility: hidden`. Identical on all three viewports.
- **Deep link, refresh and turn-then-address.** `/p/12` cold-loads at `12 / 33`, survives
  a reload at `12 / 33`, and a forward turn rewrites the address to `/p/13` via
  `replaceState` without adding a history entry — which is `Book.tsx`'s documented
  intent, so the browser Back button returns to the previously _navigated_ page rather
  than the previous _leaf_.
- **axe-core:** zero violations on `/p/1`, `/p/2` and `/p/3`, at all three viewports
  (9 scans).
- **Resize across 860px in both directions** (900 → 861 → 859 → 800 → 859 → 861 → 900 →
  1440): the book rescales on every step, `document.documentElement` never scrolls
  horizontally, and the rail stays displayed. The rescaling itself is correct; what it
  rescales is mispositioned, which is DIARY-001 and not counted twice here.
- **Out-of-range address:** `/p/999` returns 200 and clamps to page 33, which is the
  documented interim behaviour in `apps/web/app/(diary)/p/[n]/page.tsx` ("clamps an
  out-of-range page number onto a real page rather than 404ing"), with the real 404
  owned by Task 13. Recorded as expected, not as a defect.

## Not covered

- **Page types that do not exist yet.** Notes, Frames I, Frames II and About render as
  a heading and a meta line from `PageFace.tsx`'s fallback; their designed layouts
  (SCREENS.md §1.3–§1.6) are Tasks 10 and 11. `/p/3` was walked as the journey page for
  console, geometry and axe coverage, not for design conformance.
- **Gallery and lightbox** (SCREENS.md §1.8, §1.9) — no route exists, so the hotspot
  "open a gallery, go back — the URL must restore `#/p/<n>`" could not be exercised.
- **Clips in page slots and gallery tiles** (playing/looping/muted, no controls, no play
  badge; badge and duration on tiles) — no media renders on any page built today.
- **`hero2x` at DPR ≥ 2** — the `mobile` project runs at DPR 3 but no page built today
  renders a photograph, so no derivative tier could be checked.
- **Touch swipe (≥60px horizontal and 1.4× the vertical delta)** — no `touchstart`,
  `touchend` or `pointerdown` handler exists anywhere in `apps/web` or `packages`;
  SCREENS.md §1.10's mobile reading mode, which owns it, is not built.
- **Mobile reading mode below 860px** (SCREENS.md §1.10: "No book, no flip, no
  scaling") — not built. The current sub-860px behaviour is the scaled desktop book,
  which is what DIARY-001 measures.
- **Admin panel and sign-in.** `/cms` is Payload's stock admin; the designed admin
  screens (SCREENS.md §2) and the sign-in screen (§3) are Phases 2 and 3. None of the
  admin or sign-in hotspots in the skill were reachable.
- **Frame rate during a flip.** `e2e/book.spec.ts` already asserts that only `transform`
  and `opacity` are transitioned anywhere inside the design box; an actual fps trace was
  not taken in this sweep.
- **Engine note.** The sweep drove `npm run dev` (Turbopack, dev mode) on port 3000, as
  the skill's procedure step 1 specifies. Dev-mode console noise (the React DevTools
  notice, `[HMR] connected`) is present in every capture and is not reported as a
  finding. Nothing in DIARY-001 through DIARY-005 is dev-mode-specific: all of them are
  layout and markup facts that a production build carries unchanged. DIARY-001 and
  DIARY-006 are additionally evidenced against a real `next build` + `next start`
  server, via Lighthouse's own screenshot and its `errors-in-console` audit.
