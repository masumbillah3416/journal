# Sweep: galleries screen (SCREENS.md §2.5) — 2026-09-20

**Build:** `e7fe1fe` **Engine:** playwright headed (chromium, `desktop` project) **Routes walked:** 1 (`/admin/galleries`), at six widths
**Result:** 6 defects — S1:0 S2:2 S3:2 S4:2

Instrumented for `console` (every level), `pageerror` and every response with a
status ≥ 400 before the first navigation, because most of what this screen can
get wrong is silent. Fixture: a journey of the sweep's own with six frames —
one hidden, three uncaptioned, two carrying an EXIF capture time — and a second
journey with one frame, so the select has somewhere to go. Both deleted
afterwards; the developer's `diary` database was dumped before and after the
whole browser session (143 `media` rows, id / journey / order / caption / alt /
hidden / inBook / posterAt) and `diff` reports no difference but the log's own
timestamp.

## Defects

### GAL-001 · S2 · Switching journeys empties the selected-frame panel until a hard reload

- **Route:** `/admin/galleries?journey=<a>` → select `<b>`, at 1440×900
- **Steps:**
  1. Cold-load `/admin/galleries?journey=<a>`, a journey with six frames.
  2. Choose another journey — one with one frame — in the journey select.
  3. Wait for the grid to redraw.
- **Expected:** the panel shows the new journey's first frame, which is what a
  cold load of that address shows. `SCREENS.md` §2.5 draws one panel per screen
  and the README's "State" > "Admin" section names per-journey state held in one
  global as the handoff's most-repeated defect — five separate times.
- **Actual:** the grid redraws with the new journey's one tile, no tile is
  highlighted, and the panel reads "Selected frame / This journey has no frames
  yet." A hard reload of the same address then draws it correctly.
- **Evidence:**

  ```json
  { "hotspot": "switch journey (client navigation)",
    "url": "http://localhost:3000/admin/galleries?journey=396",
    "tileButtons": 1, "panel": "", "highlighted": 0,
    "panelText": "Selected frameThis journey has no frames yet.",
    "select": "396", "before": "1716" }
  { "hotspot": "switch journey (after a hard reload)",
    "tileButtons": 1, "panel": "1721", "highlighted": 1 }
  ```

  The journey select pushes an address, so Next.js re-renders the Server
  Component in place and `FrameGrid` keeps its state: `selected` is initialised
  from `frames[0]` and nothing resets it when the `frames` prop changes. The
  arrangement IS reset — `shownFor !== frames` — so the two halves of the same
  state disagree.

### GAL-002 · S2 · A hidden frame's thumbnail is refused 403 on the one screen that must show it

- **Route:** `/admin/galleries?journey=<a>`, any width
- **Steps:**
  1. Mark a frame hidden.
  2. Load the galleries screen for its journey.
- **Expected:** the tile draws the photograph under `SCREENS.md` §2.5's
  `rgba(44,37,30,.5)` scrim with a solid "Hidden" chip — the scrim exists
  precisely so a withheld frame is still legible, and this is the only screen
  from which it can be un-hidden.
- **Actual:** the tile's `<img>` requests `/api/media/file/<name>` and is
  refused 403; `naturalWidth` is 0, the browser draws its broken-image box
  under the scrim, and the console carries an error. Every other frame's
  thumbnail loads.
- **Evidence:**

  ```text
  http 403 http://localhost:3000/api/media/file/sweep-galleries-4-400x400.png
  console.error: Failed to load resource: the server responded with a status of 403 (Forbidden)
  ```

  ```json
  { "id": "1719", "src": "sweep-galleries-4-400x400.png", "loaded": false }
  ```

  `apps/web/collections/media.ts`'s reader rule withholds a `hidden` row from an
  unauthenticated reader, and `/api/media/file/<name>` is Payload's own route:
  it authenticates with Payload's cookie, which this application never issues —
  the admin's session is `td-session` and the guard is ours. So the admin
  browser is anonymous to that route by construction, and no session will change
  that.

### GAL-003 · S3 · The three-bar grip is drawn outside its own tile

- **Route:** `/admin/galleries`, measured at 1440, 1200, 1000, 870, 850 and 390
- **Steps:** load the screen and compare the grip's box with its tile's.
- **Expected:** `SCREENS.md` §2.5 — "Tiles carry an index badge, a three-bar
  grip top-right". The grip belongs to the tile.
- **Actual:** `inside: false` at every one of the six widths. `.grip` is
  `position: absolute` and its parent — the cell `<div>` that wraps the tile and
  the grip — declares no `position`, so its containing block is whatever is
  positioned further up. It is drawn top-right of that ancestor instead.
- **Evidence:** the width walk reports `"gripInsideTile": { …, "inside": false }`
  for 1440 / 1200 / 1000 / 870 / 850 / 390, and
  `test-results/sweep-galleries-1440.png` shows it.

### GAL-004 · S3 · §2.5's widest column shape is unreachable at the design's own 1440 reference

- **Route:** `/admin/galleries` at 1440×900 and 1000×800
- **Steps:** load the screen and read the computed `grid-template-columns` of
  the two-column wrapper.
- **Expected:** `SCREENS.md` §2.5 — `minmax(0,1fr) 286px` above 1180px,
  `minmax(0,1fr) 258px` above 860px, stacked below.
- **Actual:** `868px 258px` at a 1440 viewport, and a single `718px` column at 1000. The panel is never 286px anywhere this project renders.
- **Evidence:**

  ```json
  { "width": 1440, "columnsTracks": "868px 258px" }
  { "width": 1200, "columnsTracks": "628px 258px" }
  { "width": 1000, "columnsTracks": "718px" }
  ```

  `galleries.module.css` transcribed 1180 and 860 straight in as CONTAINER
  widths. A container query measures the content box, and the shell's content
  column is `viewport − 238 (the rail) − 2 × gutter` — 1142 at a 1440 viewport.
  This is EDITOR-003 (`docs/qa/2026-09-19-journey-editor-sweep.md`) one screen
  along, and `editor.module.css`'s header already carries the conversion:
  1180 → 1120 and 860 → 816, each converted with the gutter in force where that
  rung transitions.

### GAL-005 · S4 · The file line prints "0.0 MB" for anything under 50KB

- **Route:** `/admin/galleries`, any width
- **Expected:** `SCREENS.md` §2.5 — "…jpg · 4032 × 3024 · 6.1 MB".
- **Actual:** `sweep-galleries-0.png · 900 × 700 · 0.0 MB`. One decimal place is
  what §2.5's own example shows, and it rounds anything below 50,000 bytes to
  zero.
- **Evidence:** `"fileLine": "sweep-galleries-0.png · 900 × 700 · 0.0 MB"` at
  every width walked. Nothing an author uploads is that small — §2.5's own
  example is a 6.1MB photograph — so this is only ever seen behind a fixture.

### GAL-006 · S4 · The bulk panel's 1.5px ring computes to 1px

- **Route:** `/admin/galleries` → "Caption all", 1440×900, DPR 1
- **Expected:** `SCREENS.md` §2.5 — "terracotta `1.5px` ring".
- **Actual:** `getComputedStyle(panel).borderTopWidth` is `1px`.
- **Evidence:** `{ "hotspot": "bulk panel", "ringWidth": "1px" }`. The
  DECLARATION is `1.5px` and matches §2.5; Chromium rounds a border's used width
  to whole device pixels at DPR 1, which is the browser rather than the
  stylesheet. Recorded so that a later reader measuring the same number knows it
  has been looked at.

## Clean

- **axe-core, full ruleset, no exclusions** — zero violations at 1440, 1000 and 390.
- **The §2.5 selection invariant, in a real browser.** Pressing "Sort by date"
  and then selecting the third tile leaves the panel and the highlight on the
  same frame: `{ "clicked": "1708", "panel": "1708", "highlighted": "1708" }`.
- **"By date ✓"** reads and turns terracotta after the sort, and the write
  landed: `"sortLabelAfter": "By date ✓"`.
- **A toggle pressed twice** returns to where it started —
  `{ "once": true, "twice": false }` — which is the nested-stale-state defect
  the hotspot list names.
- **The bulk panel** offers exactly the three uncaptioned frames, prints
  "3 frames have no caption", hints (never fills) each input with a suggestion
  built from the filename, and scrolls at `max-height: 250px`.
- **Save frame** survives a reload: the caption typed into the panel is still
  there after a hard load.
- **`cursor: grab`** on the grid at every width.
- **No horizontal overflow** at any of the six widths
  (`scrollWidth − clientWidth` is 0 throughout).
- **One "Cover" chip and one "Hidden" chip**, at every width.
- **Drag and keyboard rearrangement** both write and both survive a reload —
  `e2e/admin.spec.ts`'s two galleries cases, three consecutive green runs.

## Not covered

- **The clip half of §2.5 — the poster filmstrip and the file line's clip
  branch.** `ffmpeg` and `ffprobe` are absent on this machine and
  `MEDIA_PIPELINE=worker` is refused at boot, so with `inline` bound this screen
  cannot produce a clip at all. It is covered in jsdom by handing
  `SelectedFrame` a clip row directly (`SelectedFrame.test.tsx`); whether a real
  clip, derived by a real worker, draws the same thing is **UNRESOLVED** under
  CLAUDE.md §7.1 and is not routed anywhere else.
- **Lighthouse.** `/admin/galleries` is not in `lighthouserc.admin.json` and that
  config is not this task's to edit. The measurement is in the task report.
- **The `mid` and `mobile` Playwright projects' own user agents.** The width
  walk resizes the `desktop` project rather than adding a fourth project, which
  is what `e2e/admin.spec.ts` already does for the editor's middle rung; a
  mobile user-agent pass over this screen is not covered here.
- **Two authors at once.** The optimistic arrangement is this browser's; what a
  second author sees while a drag is in flight is not something one browser can
  be asked.
