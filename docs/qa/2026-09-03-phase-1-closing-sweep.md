# Sweep: phase-1-closing — 2026-09-03

**Build:** bbd6e17 **Engine:** playwright-headed **Routes walked:** 19 addresses × 3 viewport projects

**Result:** 7 defects — S1:0 S2:2 S3:2 S4:3

Viewports are `playwright.config.ts`'s three projects: `desktop` 1440×900, `mid`
1000×800, `mobile` 390×844 (`isMobile`, `hasTouch`, DPR 3, iPhone user agent — the
surface is chosen on the server from that user agent, so a desktop UA at 390px is a
different reader and is walked separately under **Resize across 860px**).

`console` (all levels), `pageerror`, `requestfailed` and every response ≥ 400 were
attached to each browser context **before the first `page.goto` on it**, per
`CLAUDE.md` §10 and the skill's step 3.

**Two builds were driven, and the distinction decides two of the findings.** The walk
began against `npm run dev` (Turbopack). Everything that survived was then re-measured
against a real `next build` + `next start` on the same seeded Postgres, because two
candidate defects turned out to be dev-mode timing and one turned out to be worse in
production than it looked in dev. Every defect below states which build it was confirmed
on. Findings that did **not** reproduce in production are recorded under **Clean**, with
their dev measurements, so triage is not surprised by them later.

Departures recorded in `docs/deviations.md` are not reported as defects. Four candidate
findings were dropped after reading it — the `· 0 clips` census copy (§18 and
`GalleryHeader.tsx`'s own note), the bookmark sub-line's colour (§15), the lightbox
metadata's 58% (§21) and the empty gallery caption *element* (§19). One note on §19 is at
the end of this file.

---

## Defects

### PH1-001 · S2 · A bookmark jump publishes its anchor page — counter, page label, active tab and the address — for the whole length of the turn, so clicking "Contents" reads "Tokyo — Notes · 03 / 33" at `/p/3` for a second

- **Route:** `/p/29` → the Contents bookmark tab. `desktop` 1440×900 and `mid` 1000×800.
  **Confirmed on the production build** (`next build` + `next start`); also reproduces in dev.
- **Steps:**
  1. Cold-load `http://localhost:3000/p/29` and let it settle.
  2. Click `[data-bookmark="1"]` — the rail's "Contents" tab.
  3. Poll `[data-counter]`, `[data-page-label]`, `[data-bookmark][aria-current]` and
     `location.pathname` every 40ms.
- **Expected:** the reader asked for page 2. `SCREENS.md` §1.7 gives the rail one job —
  "Journey tabs span 3 pages, so a tab is active when `index ∈ [start, start+3)`" — and
  `Book.tsx`'s header states the address rule: "THE URL IS WRITTEN ON EVERY PAGE CHANGE,
  from one effect keyed on the machine's committed index — **which is the only moment the
  reader's page actually changes**". A page the book is animating *through* is not a page
  the reader's address, counter, label and bookmark should name.
- **Actual:** for 981ms the diary asserts the reader is on a different page of a different
  journey, in four places at once, and writes that address to the address bar. Production
  trace, `desktop`:

  ```
      1ms  29 / 33  url=/p/29           label="Bergen — Frames II"  active=["26"]  def=26
     67ms  29 / 33  url=/p/29?pages=all label="Bergen — Frames II"  active=["26"]  def=0
    115ms  03 / 33  url=/p/3            label="Tokyo — Notes"       active=["2"]   def=0
   1096ms  02 / 33  url=/p/2            label="Contents"            active=["1"]   def=0
  ```

  Identical at `mid` (116ms → 1061ms). The cause is not a race: `useFlip.jumpTo` deliberately
  "land[s] on an anchor one page from the target, then turn[s] the single leaf between them",
  so that a jump of twenty-seven leaves is drawn as one page turn rather than the book
  unravelling. That is a sound rendering decision and is not what this defect is about — the
  defect is that the anchor is *committed as the reader's index*, so `Book.tsx`'s address
  effect, the counter, the page label and `isRailTabActive` all read it and publish it.

  It is not confined to a cold load. On a whole book (`def=0`) a jump from `/p/2` to the
  Seville tab shows `29 / 33 · Bergen — Frames II` at `/p/29`, with the **Bergen** tab
  marked `aria-current="page"`, for 983ms before landing on `/p/30`:

  ```
      1ms  29 / 33  url=/p/29  label="Bergen — Frames II"  active=["26"]  def=0
    983ms  30 / 33  url=/p/30  label="Seville — Notes"     active=["29"]  def=0
  ```

  The address is the one that matters most: `/p/<n>` is this diary's whole navigation
  contract — deep links, the canonical link `generateMetadata` declares, and the `?from=<n>`
  a gallery return is built from. A reader who copies the address, or whose browser records
  it, during the jump gets a page they never asked for.
- **Evidence:** `docs/qa/assets/2026-09-03-phase-1-closing/desktop-jump-transit.png` — shot
  400ms after clicking **Contents**, showing the Tokyo Notes page, the Tokyo tab highlighted
  in the rail, `03 / 33` over `Tokyo — Notes` in the bar, at `/p/3` ·
  `mid-jump-transit.png` (same) · `desktop-jump-settled.png` and `mid-jump-settled.png`
  (the same click 1.5s later, correctly at `02 / 33 · Contents`, `/p/2`) · the two traces
  above · `apps/web/components/book/useFlip.ts`'s `jumpTo` (the anchor) and
  `apps/web/components/book/Book.tsx`'s `replaceState` effect (what spends it).

### PH1-002 · S2 · Every journey's gallery publishes the Notes page's decorative ephemera scrap as frame 004 — captionless, counted in the "n photos" census, and downloadable

- **Route:** `/gallery/tokyo`, `/gallery/lisbon`, `/gallery/patagonia`, all three viewports.
  Build-independent — a derivation fact, confirmed on dev and production.
- **Steps:**
  1. Load `/gallery/tokyo`.
  2. Read every `[data-tile]`'s `img[alt]` and `[data-tile-caption]`.
  3. Click the fourth tile and read the lightbox.
  4. `GET /gallery/tokyo/download/1502`.
- **Expected:** `docs/deviations.md` §13.4 settles what the ephemera slot holds and argues
  it from the page's own semantics: "the thing in the slot is a texture behind tape rather
  than a photograph with a subject … An empty `alt` takes it out of the accessibility tree,
  which is what a decorative image should do." `SCREENS.md` §1.8's grid is the journey's
  photographs, and §1.3 gives ephemera its own non-photographic slot on the Notes page.
- **Actual:** the gallery route reads **every** non-hidden `media` row for the journey
  (`apps/web/lib/readGalleryBundle.ts`, `where: { journey, hidden: { not_equals: true } }`),
  and the seed writes the ephemera scrap as an ordinary media row with `caption: ''`
  (`apps/web/scripts/seed.ts`, `{ role: 'ephemera', …, caption: '' }`). So the decorative
  texture is frame 004 of every gallery, in every journey:

  ```
  /gallery/tokyo      "9 photos · 0 clips"   9 tiles  · empty caption at 4: alt "TOKYO EPHEMERA"
  /gallery/lisbon     "9 photos · 0 clips"   9 tiles  · empty caption at 4: alt "LISBON EPHEMERA"
  /gallery/patagonia  "61 photos · 0 clips" 61 tiles  · empty caption at 4: alt "PATAGONIA EPHEMERA"
  ```

  Opening it gives a lightbox reading `004 / 009`, caption empty, metadata
  `Tokyo · Japan · frame 004`, and a working Download:

  ```
  GET /gallery/tokyo/download/1502
    200 · content-disposition: attachment; filename="tokyo-004.png"
  ```

  Three consequences, not one: the census is wrong (the "9 photos" and "61 photos" lines
  count a non-photograph), the frame numbering is off by one for every frame after it, and
  the reader can download a page texture as though it were a photograph of Tokyo. The row
  already carries the `hidden` flag the query respects, so the mechanism to exclude it
  exists and is not being used.
- **Evidence:** `docs/qa/assets/2026-09-03-phase-1-closing/desktop-gallery-ephemera-frame.png`,
  `mid-gallery-ephemera-frame.png`, `mobile-gallery-ephemera-frame.png` — the lightbox open
  on the scrap · the census above · `apps/web/lib/readGalleryBundle.ts`'s `where` clause ·
  `apps/web/scripts/seed.ts`'s ephemera slot · `docs/deviations.md` §13.4, whose own
  argument this contradicts.

### PH1-003 · S3 · At DPR ≥ 2 every gallery tile is a soft upscale — a 400px `thumb` into a 354 CSS px tile at DPR 3 is 2.66× — and no image on any route carries a `srcset`

- **Route:** `/gallery/patagonia` at `mobile` 390×844, DPR 3. Also measured at `desktop`
  and `mid` (DPR 1, where it is correct). Build-independent.
- **Steps:**
  1. Load `/gallery/patagonia` at the `mobile` project.
  2. For every `img`: read `getBoundingClientRect().width`, `naturalWidth`,
     `devicePixelRatio`, `currentSrc`, `srcset`, `sizes`.
- **Expected:** the skill's diary hotspot list: "At ≥2× DPR, confirm the `hero2x`
  derivative is served, not a soft upscale." The ladder exists for this —
  `apps/web/collections/media.ts` generates `thumb` 400 / `tile` 800 / `frame` 1400 /
  `hero` 2000 / `hero2x` 4000, and `docs/deviations.md` §2 and §4 both record `hero2x` as
  existing specifically "for serving a sharp image at up to ~1.7× the design box's native
  resolution."
- **Actual:** every one of the 61 tiles is served the 400px `thumb` at every viewport,
  and no `<img>` anywhere in the diary — page slots, gallery tiles or the lightbox — carries
  a `srcset` or a `sizes` attribute, so the browser is never given a choice:

  | project | DPR | tile CSS width | device px needed | served | upscale |
  | --- | --- | --- | --- | --- | --- |
  | desktop 1440 | 1 | 215px | 215 | 400px `thumb` | 0.54× (fine) |
  | mid 1000 | 1 | 221px | 221 | 400px `thumb` | 0.54× (fine) |
  | **mobile 390** | **3** | **354px** | **1062** | **400px `thumb`** | **2.66×** |

  `readGalleryBundle.ts`'s `TILE_TIERS` is `['thumb', 'tile', 'frame', 'hero']` — smallest
  first, unconditionally — and its comment states the reasoning: "A tile is at most 300 CSS
  pixels wide (`GALLERY_THUMB_SIZE.max`), so the 400px `thumb` already covers it at better
  than 1x and comfortably at 2x on the smallest tile". Both halves are measurably wrong.
  `GALLERY_THUMB_SIZE.max` is the grid's minimum *track*
  (`repeat(auto-fill, minmax(thumbSize, 1fr))`, `SCREENS.md` §1.8) and the `1fr` lets a tile
  grow past it: at 390px there is one column, so the tile is **354px**, not "at most 300".
  And the widest tile therefore occurs at the *narrowest* viewport, which is exactly the
  device class with the highest DPR — the assumption is not merely optimistic, it is
  inverted. The `tile` tier (800px) exists for every seeded row and would cover 354px at
  DPR 2; nothing selects it.

  `hero2x` is consequently served to nobody: `readGalleryBundle.ts`'s `FULL_TIERS`
  deliberately omits it for the lightbox (its own comment says so), and
  `readBookBundle.ts`'s `DERIVATIVE_PREFERENCE` puts it first only for the `hero` role —
  a static, per-role choice with no DPR input on either surface.
- **Evidence:** the table above, read from `getBoundingClientRect()` and `naturalWidth` ·
  `docs/qa/assets/2026-09-03-phase-1-closing/mobile-gallery.png` (a DPR-3 capture of the
  grid) · `apps/web/lib/readGalleryBundle.ts`'s `TILE_TIERS` and its comment ·
  `packages/domain/src/gallery.ts`'s `GALLERY_THUMB_SIZE` · `apps/web/collections/media.ts`'s
  `imageSizes`.

  **One thing this sweep cannot settle, deliberately stated rather than glossed.** The book's
  own page slots at DPR 3 measure a 1.25× upscale (334 CSS px × 3 = 1002 needed, 800 served),
  but the seeded fixtures are ≤ 1200px, so Payload never generated `frame`/`hero`/`hero2x`
  for them — `readBookBundle.ts` says as much at `DERIVATIVE_PREFERENCE`. With real
  photographs that path would reach `hero2x` and the 1.25× would not occur. It is therefore
  **not** reported as a defect. The gallery finding above is unaffected by this, because
  `TILE_TIERS` asks for `thumb` first and `thumb` exists for every row whatever the source
  size.

### PH1-004 · S3 · The mobile reading surface's Cover silently drops the book's years line, which the book's Cover prints

- **Route:** `/p/1` at `mobile` 390×844, against `/p/1` at `desktop`/`mid`.
- **Steps:**
  1. Load `/p/1` at the `mobile` project and read the cover block.
  2. Load `/p/1` at `desktop` and read the same block.
- **Expected:** the two surfaces print the same book. `SCREENS.md` §1.1 gives the cover a
  "Years — Courier 12.5px `.3em`, `rgba(238,220,180,.5)`, top margin 8px" line under
  "Kept by {owner}"; `docs/deviations.md` §12 revisits that line's alpha and keeps the line.
  §1.10's mobile Cover is terse — "cloth block, `min-height: 58vh`, padding `46px 26px`,
  fitted title, then a full-width 'Start reading' button and a swipe hint" — and does not
  enumerate the eyebrow, the rules, the subtitle or "Kept by" either, yet the implementation
  renders all four. It renders five of §1.1's six lines and drops the sixth.
- **Actual:** the mobile Cover prints `TRAVEL DIARY`, both rules, `Wanderings`,
  "field notes, photographs and other scraps" and `KEPT BY M. ALVAREZ` — and no years.
  `apps/web/components/mobile/MobilePage.tsx` never reads `chrome.yearsShown`; the book's
  `apps/web/components/pages/Cover.tsx:93` does
  (`{chrome.yearsShown !== '' && <p className={styles.years}>{chrome.yearsShown}</p>}`).
  `yearsShown` is an editor-supplied field on the `book` global, so an owner who edits it
  sees it change on a laptop and not on a phone, with nothing in the product or in
  `docs/deviations.md` saying it should. This is an inconsistency between the two surfaces
  rather than a literal §1.10 violation, and is recorded as such.
- **Evidence:** `docs/qa/assets/2026-09-03-phase-1-closing/mobile-p1-cover.png` (no years
  line) against `desktop-p1-cover.png` and `mid-p1-cover.png` (`2025 — 2026` under
  `KEPT BY M. ALVAREZ`) · `MobilePage.tsx` (no `yearsShown` reference anywhere in the file)
  · `Cover.tsx:93`.

### PH1-005 · S4 · Every book-surface page load preloads a stylesheet it never uses, and Chrome logs a console warning for it on every route

- **Route:** every `/p/<n>` at `desktop` and `mid`. **Production build.** Absent on `mobile`.
- **Steps:**
  1. Attach a `console` listener to the context.
  2. Cold-load any `/p/<n>` and wait past the load event.
- **Expected:** no console output on a clean load. This is the same class as DIARY-006 in
  `docs/qa/2026-09-01-diary-sweep.md`, which was fixed rather than tolerated.
- **Actual:** one warning per cold load, on the production server:

  ```
  The resource http://localhost:3000/_next/static/chunks/394r482rndsmj.css was preloaded
  using link preload but not used within a few seconds from the window's load event.
  Please make sure it has an appropriate `as` value and it is preloaded intentionally.
  ```

  In dev the same warning names the chunk outright —
  `apps_web_app_(diary)_notFound_module_00-z_pm.css` — which identifies it: the diary
  layout preloads `not-found.tsx`'s stylesheet on every page of the book, and a page that
  is found never uses it. It is bytes and a warning on every reader's first paint, and it
  is on the `desktop` and `mid` surfaces only; the `mobile` reading surface's console is
  completely silent in production. Nothing else appears: **zero** `pageerror`, zero
  `requestfailed` and zero responses ≥ 400 across every walk of this sweep, on either build,
  other than the intended 404 for `/p/999`.
- **Evidence:** the warning above, captured identically on `desktop` and `mid` against
  `next build` + `next start`; the dev capture naming `notFound_module` ·
  `apps/web/app/(diary)/not-found.tsx` and `notFound.module.css`.

### PH1-006 · S4 · The address lags a committed turn until the rest of the book arrives; ~1s in dev, where a refresh in that window silently loses the turn

- **Route:** `/p/20` at `desktop` and `mid`. **Dev build only — does NOT reproduce in
  production**, and is recorded at S4 for that reason.
- **Steps:**
  1. Cold-load `/p/20` (the served content window is leaves 17–23; 26 leaves carry
     `data-page-deferred`).
  2. Click `[data-nav="next"]` once.
  3. Wait 1,100ms — past the 900ms turn — then read `[data-counter]` and
     `location.pathname`.
  4. Reload.
- **Expected:** `Book.tsx`'s header states the intended invariant in its own words: "Until
  the answer lands the address is still the page the reader arrived on, **which is where
  they still are**."
- **Actual:** the second half of that sentence is false — the turn commits on its own
  schedule, and the address is held back independently until `useRestOfBook`'s `?pages=all`
  document lands. Dev trace:

  ```
      1ms  20 / 33  url=/p/20  def=26   <- turn starts
    987ms  21 / 33  url=/p/20  def=26   <- turn COMMITTED; the address still says 20
   1978ms  21 / 33  url=/p/21  def=0    <- widening lands; the address catches up
  ```

  A refresh inside that ~1s window puts the reader back on page 20:

  ```
  before reload: counter "21 / 33"  label "Hanoi — Notes"   url /p/20
  after  reload: counter "20 / 33"  label "Kyoto — Frames II"  url /p/20
  ```

  **In production the window closes before the turn does** and the defect is not
  reader-visible: the widening lands at 110ms, well inside the 900ms turn, so the counter
  and the address move together at 1004ms and the same refresh keeps page 21
  (`lostAPage: false` at both `desktop` and `mid`). The mechanism is real and unchanged —
  `Book.tsx`'s address effect is `if (!complete) return` — so a reader on a slow enough
  connection reopens it; the 1,868ms figure above is Turbopack's compile time, not a
  network floor. Recorded at S4 as a latent hazard with a measured production margin,
  not as a defect a reader meets today.
- **Evidence:** the two traces above · `apps/web/components/book/Book.tsx`'s
  `replaceState` effect and the header paragraph it contradicts ·
  `apps/web/components/book/useRestOfBook.ts`.

### PH1-007 · S4 · Crossing 860px after a turn strands `?pages=all` in the reader's address bar on the mobile surface, which has no content window

- **Route:** `/p/9` in a desktop-user-agent context narrowed from 1440px to 390px. Dev and
  production.
- **Steps:**
  1. Load `/p/9` at 1440×900 with a desktop user agent.
  2. Click `[data-nav="next"]`.
  3. 200ms later, set the viewport to 390×844 and wait for `<SurfaceCorrection>` to swap
     the surface.
- **Expected:** the reader's address is one of the thirty-three `/p/<n>` the diary
  publishes. `?pages=all` is an internal signal the book puts on its own address to widen
  its content window (`docs/adr/0009-server-rendered-page-window.md`), and `Book.tsx` says
  the first clean write after the answer lands "takes it back off".
- **Actual:** the surface swap happens first, and the mobile route entry
  (`app/(diary)/m/[n]/page.tsx`) has no content window and no `replaceState` effect to take
  the query back off, so it stays:

  ```
  after crossing to 390px: surface "mobile"  counter "09 / 33"  url /p/9?pages=all
  after crossing back to 1440px: surface "book"  counter "09 / 33"  url /p/9
  ```

  It clears on the mobile surface's next navigation, since every control there is a real
  link, so the exposure is one page view — but it is a shareable, bookmarkable address
  carrying a query that means nothing on the surface serving it.
- **Evidence:** the crossing trace above ·
  `apps/web/components/mobile/SurfaceCorrection.tsx` · `apps/web/middleware.ts`'s rewrite ·
  `Book.tsx`'s address effect.

  The same crossing also loses the in-flight turn (the reader had committed to page 10 and
  arrives on page 9), which is PH1-006's mechanism seen from the other side — the address
  is the only state that survives a surface swap, and it was stale. It is evidence for
  PH1-006 rather than a separate finding.

---

## Triage — how each of these was resolved

Added after the sweep, by the closing-fixes pass on branch `feat/phase-1-public-diary`.
Every defect above records its outcome here: **fixed**, **already a recorded departure**,
or **not fixed, with the reason**. `docs/deviations.md` was read against all seven first;
none of them is covered by any of its twenty-two entries, though three lean on entries
that support the fix rather than excuse the defect (§13.4 for PH1-002, §2 and §4 for
PH1-003, §12 for PH1-004).

**A correction to this file's own header, now applied.** This file originally opened with
"6 defects — S1:0 S2:2 S3:2 S4:2" and then listed **seven**, PH1-001 through PH1-007. The
severity tally was right for the first six and the seventh is a third S4, so the header's
count was one short rather than an extra defect having been invented — the header has
been corrected to "7 defects — S1:0 S2:2 S3:2 S4:3" to match the list it summarizes,
rather than left to disagree with the body it introduces.

| Defect | Sev | Outcome | Commit |
| --- | --- | --- | --- |
| PH1-001 · bookmark jump publishes its anchor | S2 | **Fixed** | `e52552d` |
| PH1-002 · ephemera scrap published as a gallery frame | S2 | **Fixed** | `a58287e` |
| PH1-003 · soft upscale at DPR ≥ 2, no `srcset` anywhere | S3 | **Fixed** (one residual, stated) | `88ce1c1` |
| PH1-004 · mobile Cover drops the years line | S3 | **Fixed** | `57ad54a` |
| PH1-005 · unused stylesheet preloaded on every page | S4 | **Fixed** | `c3b44aa` |
| PH1-006 · address lags a committed turn | S4 | **Not fixed** — documented cost, pinned by a test | `b0140b0` |
| PH1-007 · `?pages=all` stranded by a surface swap | S4 | **Not fixed** — outside this pass's scope | — |

### PH1-001 · fixed

The anchor was kept — Task 8 measured that removing it makes the flip spin the wrong way
through the whole book — and the machine now holds the reader's location and the stack's
anchor as two fields instead of one, with a bookmark jump arriving as its own `jump`
event. Red first at two levels: `Book.test.tsx` polls the counter, page label, active tab
and `location.pathname` every 40ms across a whole jump, and `e2e/flip.spec.ts` polls the
same four in a real browser.

### PH1-002 · fixed

Not a re-litigation of `docs/deviations.md` §19, and the note at the end of this file is
why that needed saying. §19 explains why a gallery tile renders its caption element when
the caption is empty, and that reasoning is sound and untouched. What it never examined is
a row in the grid that is **not a photograph and that no editor put there** — and the
empty caption was the symptom that surfaced it, not the defect. §19 has gained a paragraph
saying so. §13.4 already settled what the ephemera slot holds ("a texture behind tape
rather than a photograph with a subject"), which is the argument for the fix, not against
it.

**The rule turned out to be written three times, and that is why the fix is not one
line.** `readGalleryBundle` builds the grid; `readGalleryDownload` re-derives the same
list in the same order, because a download's filename carries the frame's *position*; and
`readBookBundle` counts it a third time for the census the Notes footer prints and the
gallery header repeats. Fixing only the grid would have been worse than fixing nothing —
the scrap's download address would have stayed live with every filename after it naming
the wrong photograph, and the page would have read "9 photographs" over a grid of eight.
All three now ask one pure module, `apps/web/lib/galleryFrames.ts`. It also closed a
defect no fixture could have shown: **the census was the only reader that had never
applied the `hidden` filter at all.**

**This report's suggested mechanism was wrong, and is worth recording as wrong.** The
finding says "the row already carries the `hidden` flag the query respects, so the
mechanism to exclude it exists and is not being used." Marking the scrap `hidden: true`
would break the Notes page: `collections/media.ts`'s reader rule is a `Where` constraint
Payload applies to `/api/media/file/<name>` as well as to a listing, so a hidden scrap
answers 403 to every signed-out reader and the page loses the texture §13 exists to keep.
The scrap is identified instead by the `pages` slot that prints it — `role` lives on the
slot, not on the media row.

**Consequence for a future reader:** Patagonia's gallery is now **60** tiles, not 61, and
the other nine journeys are 8 rather than 9. §1.8's verified bar ("square and unsqueezed
at 40+") still holds and §1.9's `003 / 061` was always the counter's three-digit *format*.
`docs/deviations.md` §20 records the change.

### PH1-003 · fixed, with one residual stated rather than glossed

`TILE_TIERS` is now the list of tiers a tile **offers**, emitted as a `srcset` with each
derivative's real width, and the browser chooses. `sizes` — without which no `srcset` can
work — is derived in the domain (`galleryTileSizes`) from the same thumb size that sets
the track it describes, in two entries rather than the grid's whole column arithmetic,
because `sizes` is an attribute on every one of sixty `img`s. The one-column case, where
this report measured the defect and where the error would be largest, is exact.

A second test pins the other direction: at 1440px the tile is 215px at DPR 1 and the
400px `thumb` is still what gets served. Trading a soft phone for a wasteful desktop would
not have been a fix.

**Residual.** The seeded placeholders are 900px squares, so Payload derives only `thumb`
and `tile` for them, and 800px is the sharpest answer this database holds for a 354px tile
at DPR 3 — 1.33× rather than the 2.66× it was. The *mechanism* was the defect and is now
right; a real photograph carries `frame` and `hero` too and the same `srcset` reaches them
with no further change. This is the same fixture ceiling this finding already declines to
report the book's page slots on, and `hero2x` being served to nobody on the book's surface
is unchanged by this fix.

The browser measurement had to change, and the reason is worth keeping: **`naturalWidth`
is not readable evidence once a `srcset` is in play.** The browser reports an image's
intrinsic size corrected for the pixel density its chosen candidate implies, so a
correctly-served 800px tile in a 354px box reports `354` — the same number a wrong one
reports. The test asserts which candidate was taken instead.

### PH1-004 · fixed

§1.10 was not an authority the omission could appeal to: it enumerates no type on the
mobile cover at all — not the eyebrow, the rules, the subtitle or "Kept by" either, all
four of which that surface already printed from §1.1 — so the set is §1.1's and the years
line was the only member missing. The line takes `.coverKeptBy`'s 10px/.26em (§1.1's
12.5px/.3em scaled for a 390px phone) with the book's own 8px top margin, no
`text-transform`, and `docs/deviations.md` §12's `rgba(238,220,180,.78)`. That alpha sits
*above* the neighbouring "Kept by" line's `.72`, so it cannot be the first line on this
cloth to fail contrast.

### PH1-005 · fixed

The cause was where the rules lived, not the preload. `not-found.tsx` is a sibling slot of
`children` in the `(diary)` group's layout tree, so Next collects a CSS module imported
there as part of the *segment's* stylesheets and preloads it on every route in the group.
The rules moved into `diary.css`, which the group's layout already loads everywhere, so
there is no second chunk to preload. Not one declaration changed, and the rendered 404 was
opened at 1440×900 to confirm it: desk gradient, paper card with its hairline and shadow,
Courier eyebrow, Caveat 58px title, hairline rule, Garamond body, terracotta "Open the
diary". An inline `<style>` was rejected — it would ship the rules on the 404 alone, but it
moves a stylesheet into a `.tsx` file and out of the convention every other surface here
follows.

### PH1-006 · not fixed; a documented cost with a measured production margin, now pinned

This is **not** a recorded deviation, and it is **not** a later phase's work either —
saying so would be stretching this task. It is a Phase 1 trade-off that this report is
right to call out, and one whose fix is not affordable on the evidence available:

- **The hold is load-bearing and measured.** `useRestOfBook` widens the document by
  navigating to the *same* path with `?pages=all` added, because Next keys a route
  segment's subtree by that segment's value. Changing `/p/<n>` while that request is in
  flight remounts the book and discards the flip state — measured on a production build,
  mount count 1 → 2. Writing the address earlier is what would cost that.
- **Holding the turn instead** — the way a jump is already held — would make a reader's
  first turn wait on a round trip, which is the single thing `useRestOfBook`'s design
  exists to avoid: the window is three leaves deep either side precisely so the gesture
  that asks for the rest of the book is served out of the document already in hand.
- **No reader on a normal connection meets it.** This report's own production numbers: the
  widening lands at 110ms, well inside the 900ms turn, so the counter and the address move
  together and the same refresh keeps the new page.

So the honest outcome is a cost recorded rather than an invariant claimed. Two things
changed. `Book.tsx`'s header had asserted "until the answer lands the address is still the
page the reader arrived on, **which is where they still are**" — this report is correct
that the second half is false, and it has been corrected rather than left to mislead the
next reader. And `Book.test.tsx` now pins the gap executably, with the remount measurement
in its own comment, so anyone who moves the address write earlier meets a red test with
the reason attached.

**What would settle it** is the one measurement this sweep names as not taken: `/p/<n>`
under network throttling on a production build, to find the connection speed at which the
gap becomes reader-visible. That is a follow-up, and it is what should decide whether
paying the remount is worth it.

### PH1-007 · not fixed; outside this pass

Not triaged here beyond this note: the closing-fixes pass was scoped to PH1-002 through
PH1-006, and PH1-007 is the finding this file's own header does not count. It is a real
finding and it is still open. It is also the cheapest of the three S4s to close — the
mobile route entry needs the same "take the query back off" write the book surface already
does — and it shares PH1-006's mechanism seen from the other side, as this report says. It
should be picked up alongside PH1-006's throttling measurement rather than on its own.

---

## Status of every defect from the earlier sweeps

Each was re-checked in the browser on the **production build**, not read off a green
suite. `docs/qa/2026-09-03-mobile-sweep.md` is a third sweep the brief did not name; its
two defects are re-checked here too.

### `docs/qa/2026-09-01-diary-sweep.md`

| Defect | Sev | Still fixed? | How it was re-checked |
| --- | --- | --- | --- |
| DIARY-001 · book clipped below ~1435px, invisible at 390px | S1 | **Yes** | The design box is on screen and interactive at every viewport: `desktop` `[5, 0, 1273, 842]` inside a 1282×842 area, `mid` `[0, 92, 842, 557]` inside 842×742 — both centred to the pixel, `elementFromPoint` at the box centre returning real page content (`H1`, `DIV`), `documentElement` never scrolling horizontally. At 390px the book is correctly **not** drawn at all: the server serves `SCREENS.md` §1.10's reading surface instead, which is fully on screen. See the specific confirmation below. |
| DIARY-002 · 9 of 13 bookmark tabs covered by the book at 1000×800 | S2 | **Yes** | Hit-tested all 13 tabs at their own centres on `/p/1`, `/p/2`, `/p/3`, `/p/4`, `/p/5` and `/p/33`, at `desktop` and `mid`: **0 covered, 0 off-viewport**, every tab resolving to itself. Clicks land — `[data-bookmark="1"]` from `/p/29` reaches `/p/2`, `[data-bookmark="32"]` reaches `/p/33`. (The *journey* of that click is PH1-001; the tab is not covered.) |
| DIARY-003 · page-edge turn strips unreachable at ≤1000px | S2 | **Yes** | `[data-edge="left"]` (30px, `z-index: 900`) and `[data-edge="right"]` (44px) hit-test to themselves at `desktop` and `mid` on every page walked, and both turn: `/p/3` → right → `04 / 33` → left → `03 / 33`. At `mobile` they correctly do not exist — §1.10 has no book to put an edge on. |
| DIARY-004 · `mid`/`mobile` visual baselines regenerated over the clipped book | S2 | **Yes** | Opened `e2e/visual.spec.ts-snapshots/diary-cover-mid-linux.png` and looked at it, which is the step the defect existed to force: it shows a whole book, cloth, ribbon, washi, airmail stamp and a 13-tab rail. The baseline set has since grown from 6 to 31 files and now covers all six page kinds, the gallery, the lightbox, the mobile drawer and the 404, at all three projects. |
| DIARY-005 · no active rail tab, no "Bookmarks" eyebrow, no page label | S3 | **Yes** | `aria-current="page"` present on exactly one tab per page, and the three-page span holds: tab `2` (Tokyo) is current on `/p/3`, `/p/4` **and** `/p/5`, and hands over to tab `32` on `/p/33`. The eyebrow renders "Bookmarks". The bar prints the page label under the counter — `Tokyo — Frames I`, `Tokyo — Frames II`, `About`. Measured against §1.7: rail 158px, gap 6px, eyebrow Courier 9.5px `.22em` `rgb(115,98,71)`; active tab `#fbf6e9`, `translateX(-6px)`, `0 3px 12px -5px rgba(60,44,20,.5)` plus the 1px inset ring; inactive `rgba(120,98,60,.07)`; tint 6px at opacity 1 / .5; `transform 180ms, background 180ms`. All literal. |
| DIARY-006 · `/favicon.ico` 404s on every cold load | S4 | **Yes** | `GET /favicon.ico` → `200 image/x-icon` on the production server, and no response ≥ 400 appeared in any walk except the intended `404` for `/p/999`. |

**Also changed since that sweep, and re-checked because it was recorded there as interim
behaviour:** `/p/999` no longer clamps onto page 33 and answers 200. It is a real `404`
with `not-found.tsx` rendered, at every viewport, which is what
`apps/web/app/(diary)/p/[n]/page.tsx` now says it should be.

### `docs/qa/2026-09-03-gallery-sweep.md`

| Defect | Sev | Still fixed? | How it was re-checked |
| --- | --- | --- | --- |
| GAL-001 · all 61 tiles 215×240, not square | high | **Yes** | Measured every tile's square at all three projects: **61 of 61 at ratio 1.0000**, at 215.33px (`desktop`), 221px (`mid`) and 354px (`mobile`). `object-fit: cover` and `loading="lazy"` on every one. (The 354px tile is what PH1-003 measures against DPR 3; it is square, it is just soft.) |
| GAL-002 · lightbox metadata line fails AA contrast | medium | **Yes** | axe-core run over the open lightbox with **no exclusions** at all three projects: zero violations. `docs/deviations.md` §21's 58% is what is rendered. |
| GAL-003 · shared lightbox address did not open its frame | low | **Yes** | `GET /gallery/patagonia#frame-1522` followed by a real load opens the lightbox at `005 / 061` with the right caption ("Lenticular cloud, showing off"). The Share control builds that address — with `navigator.share` present it is handed `{ title: "Patagonia", url: ".../gallery/patagonia#frame-1522" }`. |
| GAL-004 · gallery header overflowed 390px; the document scrolled sideways | high | **Yes** | At `mobile` 390×844, `documentElement.scrollWidth === clientWidth === 390` on the gallery **and** with the lightbox open. The header reads in full — "← BACK TO THE DIARY · FULL GALLERY · Patagonia · Chile · 8 – 19 January 2026 · 61 photos · 0 clips" — nothing clipped. |
| GAL-005 · back control sent an early clicker to the cover | high | **Yes** | Read out of the **raw HTML**, with no JavaScript run, which is the assertion the fix turned on: `curl /gallery/patagonia?from=9` → `data-back-to-book="true" href="/p/9"`. A gallery reached with no `?from` gives `href="/p/1"` — a page of the book, never `/`. Clicking it returns to `/p/9` at `09 / 33` at all three viewports, and so does the browser's own Back button. |

### `docs/qa/2026-09-03-mobile-sweep.md`

| Defect | Sev | Still fixed? | How it was re-checked |
| --- | --- | --- | --- |
| MOB-001 · scrolling column not keyboard-reachable on `/p/33` | serious | **Yes** | `[data-mobile-content]` carries `role="region"`, `tabindex="0"` and `aria-label` set to the page's own label ("Tokyo — Notes"). axe-core is clean on `/p/33` at `mobile`. |
| MOB-002 · Next's dev overlay swallowed the previous-page arrow | medium | **Yes** | Both 52px arrows sit fully in the bar (`prev` at `[14, 782, 52, 52]`, `next` at `[324, 782, 52, 52]`), hit-test to themselves, and navigate — verified by click, by `tap` and by keyboard Enter, from `/p/2`, `/p/3`, `/p/10` and `/p/30`. No `nextjs-portal` in the production document at all. |

---

## The specific confirmation asked for: is the reading surface on screen and interactive?

Measured on a real `next build` + `next start`, not a dev server, and not inferred from a
passing suite — which is the failure mode DIARY-004 recorded.

| project | surface served | design box | on screen | `elementFromPoint` at its centre | doc scrolls sideways |
| --- | --- | --- | --- | --- | --- |
| `desktop` 1440×900 | book | `[5, 0, 1273, 842]` | **yes** | `H1` (the cover title) | no |
| `mid` 1000×800 | book | `[0, 92, 842, 557]` | **yes** | `H1` (the cover title) | no |
| `mobile` 390×844 | §1.10 mobile mode | *none, by design* | **yes** | the mobile page column | no |

**Yes at all three.** The book is drawn, centred in the area `useBookScale` measures, fully
inside the viewport, and returns real page content — not `null` — at its own centre. At
390px the phone is served `SCREENS.md` §1.10's surface instead of a scaled book, and that
surface is complete and operable: header, burger, scrolling column, bottom bar, drawer.
`docs/qa/assets/2026-09-03-phase-1-closing/` holds a capture of every page kind at every
viewport; `mobile-p1-cover.png` in particular is the page that was blank when DIARY-001 was
written and now carries the whole cover, "Start reading" and the swipe hint.

The 860px boundary was crossed in both directions, one pixel at a time, in a desktop-UA
context resized 1440 → 1000 → 900 → 861 → **860 → 859** → 800 → 640 → 390 → 640 → **859 →
860** → 861 → 900 → 1000 → 1440. The surface swaps exactly at the boundary each way
(`860` book / `859` mobile, both directions), the page number is preserved at `09 / 33`
across all sixteen steps, the book stays on screen and centred at every width it is drawn
at, the rail keeps all 13 tabs, the drawer replaces it below the boundary, and the document
never scrolls horizontally. `<SurfaceCorrection>` records the measurement in
`td-reading-surface`, so the swap survives a reload.

---

## Clean

Routes and behaviours walked with no finding. Everything here was checked on the
production build unless noted.

**The turning machinery, `desktop` and `mid`.**
- **The latch always releases.** 14 next-clicks at 60ms intervals, then 14 prev-clicks,
  then a single clean turn: the book advances what a 900ms turn allows in that window and
  turns cleanly afterwards (`seized: false` at both projects). 20 clicks alternating
  direction at 45ms: `16 / 33` → `18 / 33`, then a single next reaches `19 / 33` —
  `seized: false`. The book never froze in any run of this sweep.
- **No mirrored or stranded content.** Mid-flight exactly two leaves are visible — the
  turning leaf at `z-index: 2000, pointer-events: none` and the leaf being revealed — and
  at rest exactly one, at `pointer-events: auto`. Every other leaf of 33 is
  `visibility: hidden`. Checked mid-turn, at rest, after the fast-flip run and after the
  alternating thrash.
- **Nothing swallows a click near the fold.** Probed the ten Contents rows at the point of
  each nearest the fold: **0 of 10** swallowed, every one hit-testing to the anchor itself,
  and the click navigates to `/p/3`. No `[data-face="back"]` or `[data-shade]` anywhere
  reports anything but `pointer-events: none`.
- **Every trigger turns, forward and backward.** Page-edge strips, bottom-bar arrows and
  ArrowLeft/ArrowRight all move exactly one leaf in the right direction at both projects.
  `Home`/`End` do nothing, which no handoff section asks for.
- **The ends hold.** `prev` is `disabled` on `/p/1`, `next` is `disabled` on `/p/33`, at
  every viewport.

**The gallery and its lightbox, all three projects.**
- 61 tiles, all square (GAL-001), `loading="lazy"`, `object-fit: cover`, no broken images.
- The lightbox opens the frame the tile shows — tile badge `003` opens `003 / 061`
  "Guanaco, unbothered" — arrows step (`003` → `004` → `003`), the keyboard arrows step,
  `prev` is disabled at `001 / 061` and `next` at `061 / 061`, and Escape closes it and
  returns focus to a tile (the tile of the frame that was on screen when it closed, badge
  `004` after stepping to it — a defensible reading of "focus returns to the tile", noted
  rather than reported).
- Download goes through the app's own handler, per `docs/deviations.md` §17:
  `GET /gallery/patagonia/download/1522` → `200`, `image/png`,
  `content-disposition: attachment; filename="patagonia-005.png"`,
  `x-content-type-options: nosniff`, 44,548 bytes.
- Returning from a gallery restores `/p/<n>`, never `/` — by the gallery's own control, by
  the browser's Back button, and from a gallery reached with no `?from` at all (`/p/1`).
- Turning the book and *then* opening a gallery carries the page the reader is actually on:
  from `/p/9`, two turns forward, the footer's link reads `/gallery/patagonia?from=11` and
  the return lands on `/p/11`.

**The mobile reading surface, `mobile` 390×844.**
- **The swipe rule is exactly `SCREENS.md` §1.10's**, driven through the DevTools
  Protocol's `Input.dispatchTouchEvent` rather than synthetic DOM events. A −160px
  horizontal drag turns forward; +160px turns back; a **45px** drag does not turn; a
  −100/−90px diagonal (which fails `|dx| ≥ 1.4 × |dy|`) does not turn; a −160/−40px
  diagonal (which passes) does. A 260px vertical drag scrolls the column by 245px and
  **does not turn the page**.
- **The drawer.** `role="dialog"`, `aria-modal="true"`, focus moved to the 34px close
  button, "Bookmarks" header, 13 tabs, **none covered** by anything, the correct tab marked
  `aria-current` (tab 2 on `/p/3`). Closes on Escape and on a scrim click at `x: 370`, to
  the right of the panel. A drawer jump lands exactly right, with no transit page —
  About → `33 / 33`, Contents → `02 / 33`, Seville → `30 / 33` — because every control on
  this surface is a real navigation, which is why PH1-001 is a book-surface defect only.
- **§1.10's measurements are literal**: header `#3b332a` at `14px 16px 12px`, 44px burger,
  content `20px 18px 30px`, bottom bar `#fbf6e9` with a 1px top rule at `10px 14px` and
  52px arrows, drawer 319.8px (82% of 390, capped at 320) on `#3b332a` at `z-index: 810`,
  scrim `rgba(26,22,17,.5)` at `z-index: 800`, tab names Caveat 26px, 13px rows, 34px close.
- `/m/3` is not a public address: it `308`-redirects to `/p/3`, so the surface has two
  route entries and one address, as `middleware.ts` intends.
- The mobile console is **completely silent** in production — not even PH1-005's warning.

**Accessibility.** axe-core, no exclusions, 25 scans: `/p/1`, `/p/2`, `/p/3`, `/p/4`,
`/p/5`, `/p/33`, `/gallery/patagonia`, the open lightbox and `/p/999` at all three
projects, plus the open bookmark drawer at `mobile`. **Zero violations everywhere**,
including the two surfaces `docs/deviations.md` §15, §21 and §22 record contrast changes for.

**Console and network.** Zero `pageerror`, zero `requestfailed` and zero responses ≥ 400
across every walk on both builds, other than the intended `404` for `/p/999` and PH1-005's
preload warning. Dev-only noise not reported: the React DevTools notice, `[HMR] connected`,
and one `ws://…/_next/hmr … ERR_NO_BUFFER_SPACE` caused by this sweep running many browser
contexts on one machine.

**Two dev-mode behaviours that do NOT reproduce in production**, recorded here so a later
reader does not rediscover them as defects:
1. **A bookmark tab appears dead for 2,019ms on a cold-loaded page.** On `/p/29` in dev,
   clicking the Contents tab produces no feedback at all until `useRestOfBook`'s
   `?pages=all` document lands. `Book.tsx` holds a jump whose destination the document does
   not carry, which is the right call — turning into a blank leaf is worse. In production
   the widening lands at 65ms and the jump starts at 115ms, so there is no dead window.
   Not a defect; the *hold* is correct and the *silence* is only visible at Turbopack's
   compile speed.
2. **The address lag** — see PH1-006, filed at S4 for the same reason.

**Design conformance spot-checks against `SCREENS.md` §1**, measured rather than eyeballed:
§1.1's cover (Caveat 124px / .9 `#f6ecd6` with the `0 2px 0 rgba(0,0,0,.22)` shadow, both
64×1px rules, the washi strip, the airmail stamp, the years line), §1.2's Contents (one
column for ten entries per `docs/deviations.md` §9, `column-gap: 34px`, `scrollHeight ===
clientHeight` so zero overflow), §1.3's Notes (weather and mood badges, four-cell tally
ticket, ephemera slot, hero mount with its postage stamp, "See full gallery" footer),
§1.4/§1.5's Frames grids (P1 spanning both rows, "FRAMES 04 – 07", the washi on P3, "Only a
few frames live in the book"), §1.6's About, and §1.7's chrome in full — every value in the
DIARY-005 row above. The 44px nav buttons report a computed `1px` border against §1.7's
`1.5px`; that is Chromium snapping a fractional border to a device pixel at DPR 1, not
drift — `chrome.module.css` declares `border: 1.5px solid var(--td-ink-body)`. Not reported.

---

## Not covered

- **Clips, everywhere they appear in the handoff.** `SCREENS.md` §1.8's play badge and
  duration chip on a tile, and §1.9's clip transport, cannot be reached: no `media` row can
  carry `kind: 'clip'` while video is deferred (`docs/adr/0004-media-pipeline-mode.md`,
  `docs/deviations.md` §18 and §20). Confirmed empty rather than assumed —
  `[data-play-badge]` and `[data-duration]` are absent from all 61 Patagonia tiles, and
  every gallery's census reads `· 0 clips`. Nothing was faked in the database to produce one.
  The skill's hotspot "clips in page slots: playing, looping, muted, no controls and no play
  badge" is therefore **unreachable, not passed**.
- **`hero2x` on a real photograph.** The seeded fixtures are ≤ 1200px, so Payload generates
  only `thumb` and `tile` for them and the top three tiers do not exist in this database.
  PH1-003's gallery finding does not depend on that; the book's own slots at DPR 3 do, and
  are explicitly not reported for it. Settling the book side needs a journey seeded with a
  ≥ 2000px photograph.
- **The windowed gallery grid past a hundred tiles.** Patagonia's 61 is the largest gallery
  this repository contains (`docs/deviations.md` §20), so `tileWindow`'s measured branch is
  exercised by unit tests rather than by a browser here.
- **A real phone, and any engine but Chromium.** Everything at `mobile` is Chromium device
  emulation with an iPhone user agent. Momentum scrolling, the URL bar's collapse that
  `100dvh` is written for, and Safari's own touch behaviour are unverified on hardware —
  the same standing scope note `docs/testing.md` carries.
- **A slow network.** PH1-006's window is a function of how long the `?pages=all` document
  takes. It was measured on localhost at both builds (1,868ms dev / 110ms production) and
  **not** under throttling, so the connection speed at which it becomes reader-visible in
  production is unknown. That is the one measurement that would settle PH1-006's severity.
- **Frame rate during a flip.** `e2e/book.spec.ts` already asserts that only `transform`
  and `opacity` are transitioned inside the design box; no fps trace was taken, so the
  skill's "record fps" bar is met by the property assertion rather than by a profile.
- **Admin and sign-in.** `SCREENS.md` §2 and §3 are Phases 2 and 3. `/cms` is Payload's
  stock admin. None of the skill's Admin or Sign-in hotspots was in scope.
- **Nothing was sent anywhere.** Every check in this sweep ran against `localhost:3000` and
  local tooling — Playwright's bundled Chromium, a local `axe-core`, a local `next build`,
  the Docker Postgres on 5433. No repository content left this machine, per `CLAUDE.md`
  §7.1. No check was left unresolved for want of a local tool.

---

## One note on `docs/deviations.md`, raised separately as the brief asks

§19 explains why a gallery tile renders its caption element even when the caption is
empty — the grid's rows size to their tallest item, so dropping the element would shorten
one tile and strand it in a track sized by its neighbours. That reasoning is sound and this
sweep does not dispute it. But the entry closes with "it is empty, not padded — so nothing
is printed that an editor did not write", and that sentence is now doing work it was not
written for: it reads as a blanket sanction for an empty caption in the grid, and PH1-002
is an empty caption that indicates something real — a row in the gallery that is not a
photograph and that no editor put there. The entry is not wrong; it is being relied on to
cover a case it never examined. Worth a sentence when PH1-002 is triaged, so that the fix
is not mistaken for a re-litigation of §19.
