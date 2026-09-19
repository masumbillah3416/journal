# Sweep: the journey editor's photo slots, focal point, Frames pane and pool — 2026-09-20

**Build:** `de77881` (`feat/phase-4-admin`) **Engine:** Playwright (`chromium`), driven by one
temporary spec (`e2e/t7sweep.spec.ts`) so the walk could read computed styles, measure every
box, click a real focal point, post the pool's real form and then read the `pages` rows behind
them — deleted after the walk, findings here **Routes walked:** 3 —
`/admin/journeys/276?page=534` (the seeded Tokyo journey's **Frames I**, whose three stored
slots are one short of the four cells §2.3 draws, and whose first slot carries a **non-default**
focal point of 22/78), `/admin/journeys/276?page=533` (Tokyo's Notes page, two cells inside the
pane's own `<form>`), and `/admin/journeys/276?page=535` (Frames II, for the per-page leak
check), plus `/p/4` — the published Frames I face — to see whether a crop set in the editor
moves the crop a reader gets
**Surfaces:** the three configured projects — `desktop` 1440x900 · `mid` 1000x800 ·
`mobile` 390x844 (iPhone UA, touch)
**Result:** 2 defects — S1:0 S2:1 S3:0 S4:1

**Instrumentation, attached before the first navigation on every context:** `console` (**all
levels**), `pageerror`, every `response` with a status ≥ 400, and every `requestfailed`. Across
nine walks the only console output was Next's development banner and `[HMR] connected`; **no
`pageerror`, no response ≥ 400, no failed request.** `axe` ran on the frames page and the notes
page at all three surfaces.

**Why the walk runs against the seeded Tokyo journey rather than a clean fixture.** Every
automated case in this task builds its own journey, and every one of them therefore has a page
whose stored slot array is exactly as long as its pane. Tokyo's Frames I does not: three stored
rows against four drawn cells, which is the shape a page created before Task 7 really has.
Its first slot also carries a focal point an editor set (22/78), so the pill and the reticle
have something to be wrong about.

**Every write is restored.** Each writing case reads the page's `slots` first and writes them
back afterwards; `select focal_x, focal_y, media_id from pages_slots where _parent_id in
(533,534)` reads the same nine rows before and after the sweep.

**Nothing here is patched in this commit.** `CLAUDE.md` §10: a fix without a test that failed
first guards nothing.

---

## Defects

### SLOT-001 · S2 · With no frame chosen, the pool's scrolling grid cannot be reached by a keyboard — axe, serious

- **Route:** `/admin/journeys/276?page=534` and `?page=533` — **all three surfaces**, on a cold
  load, which is every cold load: no frame is chosen until a Replace link is followed.
- **Steps:**
  1. Cold load `/admin/journeys/276?page=534` with a live session.
  2. Do not press Replace.
  3. Run axe (`@axe-core/playwright`, full ruleset) against the page.
  4. Or, by hand: tab through the screen and try to reach the pool's tile grid.
- **Expected:** no violation. `SCREENS.md` §2.3 caps the tile grid at `max-height: 432px` and
  scrolls it, and WCAG 2.1.1 requires a scrollable region to be reachable — either through a
  focusable descendant or by taking the focus itself. Task 5 met this with `tabIndex={0}` on the
  `<ul>`, with a comment saying the stop should go "when the tiles become buttons".
- **Actual:** the tiles ARE buttons and the stop is gone — but with no frame chosen every one of
  them is `disabled`, and a disabled button is not focusable. So the region has no focusable
  descendant and no stop of its own, on every cold load. The comment's condition was "when the
  tiles become buttons"; the real condition is "when a keyboard can reach one".

  ```text
  a-desktop.json: "pool": { "tiles": 9, "disabled": true, "gridTabIndex": null }
  "violations": [ { "id": "scrollable-region-focusable", "impact": "serious",
                    "nodes": [".editor-module__Ihypcq__poolGrid"] } ]
  a-mid.json, a-mobile.json, f-desktop.json, f-mid.json, f-mobile.json: the same violation.
  ```

- **Evidence:** `t7-a-desktop.json`, `t7-a-mid.json`, `t7-a-mobile.json`, `t7-f-*.json`
  (the axe run is in each).

### SLOT-002 · S4 · A focal point is stored to fifteen significant digits, and the pill says something else

- **Route:** `/admin/journeys/276?page=534` — `desktop`.
- **Steps:**
  1. Cold load `/admin/journeys/276?page=534`.
  2. Click Frame 2's photograph a quarter across and four fifths down.
  3. Read the pill, then read `pages_slots.focal_x` for that cell.
- **Expected:** the pill and the column agree. §2.3's pill prints whole percentages
  ("focus 25% 30%"), and a focal point finer than one percent of a frame is below anything a
  crop can show.
- **Actual:** the pill reads `focus 25% 80%` and the column holds `24.836806920959496`. They
  render identically — `object-position: 24.8368% 79.6053%` on the published page is the same
  pixel — so nothing is wrong on screen; what is wrong is that the stored value is the raw
  division, and the number an author was shown is not the number that was saved.

  ```text
  b.json: "pill": "focus 25% 80%",
          "position": "24.8368% 79.6053%",
          "after": [ …, { "focalX": 24.836806920959496, "focalY": 79.60526315789474 }, … ]
  ```

- **Evidence:** `t7-b.json`.

## Clean

Everything below was walked and found correct; each is listed with what was actually measured,
because "clean" with no measurement is the claim these sweeps exist to stop.

- **The phase's second exit criterion, end to end in a browser.** Frame 2 of Tokyo's Frames I
  was centred (`50% 50%` in the column and in the editor). One click in the editor, then
  `/p/4` — the published face — was loaded fresh, and its second mount's computed
  `object-position` read `24.8368% 79.6053%`. The other six mounts on that leaf were unchanged.
  **The control is not decorative** (`t7-b.json`, `published`).
- **The Frames pane draws four cells against three stored rows.** Frame 4 is drawn `data-empty`,
  `disabled`, with `cursor: default`, no reticle and a disabled Clear — and its Replace still
  addresses it, which is how a photograph gets into it (`t7-a-*.json`).
- **The three heights are §2.3's.** Hero 186px, ephemera 124px, a frame 152px, at all three
  surfaces (`t7-a-*.json`, `t7-f-*.json`).
- **The preview is an UNCROPPED derivative**, not the square `thumb`:
  `tokyo-a1-128-1000x800.png` (`t7-a-desktop.json`).
- **The pill's two states and their colours.** `focus 22% 78%` in `rgb(47, 107, 104)` —
  `#2f6b68`, §2.3's — for a cell with a crop; `centred — click to focus` in
  `rgb(115, 98, 71)` for one without.
- **The reticle is placed on the point**, `left:22%;top:78%`, and is absent from an empty cell.
- **Replace addresses the cell and the pool follows.** Pressing Frame 4's Replace put
  `?page=534&slot=534:3` in the address, marked that cell, changed the instruction line to
  "Tick a photograph to place it in the frame you chose", enabled all nine tiles and set every
  tile's hidden `slot` field to `534:3` (`t7-c.json`).
- **A tick places the photograph in that cell, padding nothing it should not.** The stored array
  went from three rows to four, the new row carried `role: 'frame'` and the media id, and the
  three rows before it were untouched. The tile then drew ticked (`t7-c.json`).
- **Clear empties the cell IN PLACE.** After Clear the array still had four rows; row 3's
  `media` was `null` and rows 0–2 were byte-identical to before (`t7-c.json`).
- **The Notes pane holds two cells and no nested form.** `document.querySelectorAll(
'[data-notes-pane] form').length` is **0**, and every button in the slots column is
  `type="button"` (`t7-d.json`).
- **A slot control inside the Notes pane does not post the Notes pane.** With
  `Tokyo EDITED IN SWEEP` typed into Location and not saved, pressing the hero's Clear left
  `journeys.name` as `Tokyo` and left the typed text in the field (`t7-d.json`).
- **No crop leaks between pages.** Frame 2 of Frames I was moved to `focus 90% 10%`; Frames II's
  cell 1 then read `centred — click to focus` and `50% 50%` — which is what its row holds
  (`t7-e.json`). This is the defect §2.3 names by journey and page.
- **No overflow at any surface.** On both panes and all three viewports, `pane.scrollWidth`
  equals `pane.clientWidth`, `document.documentElement.scrollWidth` equals its `clientWidth`,
  and no descendant of the pane has a right edge past the pane's. (The Notes pane's own
  NOTES-001 — the tally overflowing at 390px — is Task 6's and was fixed before this sweep.)
- **The caption and alt fields are §2.3's sizes**, 23px and 14.5px, at all three surfaces.
- **The console is quiet.** Nine walks, no `pageerror`, no response ≥ 400, no failed request.

## Not covered

- **Clips.** The seeded Tokyo journey holds nine stills and no clip, so the motion badge was
  only ever observed reading "Still" and the pool's duration chip was never drawn. The badge's
  other arm and the chip have jsdom cases; neither was seen in a browser. **A related gap was
  found while writing this section and is NOT a browser defect:** the pool draws its duration
  chip unconditionally, where the design spec §9.3 puts clip-specific affordances behind
  `MEDIA_PIPELINE`. That is a specification gap in Task 7's own scope, fixed in the commit that
  follows this sweep rather than recorded as a defect here.
- **Two authors at once.** The staleness NOTES-002 records for the highlight controls applies to
  the pool's `?slot=` target as well — a tile posts the cell the address named when the page was
  rendered — and nothing here exercised two tabs.
- **A slot whose media is not `ready`.** There is no such row in the developer's database and
  creating one would have meant a write this sweep could not cleanly undo. The behaviour has
  integration coverage (`readBookBundle.integration.test.ts`) and no browser walk.
- **Keyboard-only traversal of the whole screen.** axe was run at every surface; a by-hand tab
  walk was not, beyond the pool grid SLOT-001 is about.
- **The visual-regression baselines.** They skip off Linux on this host and were not generated;
  the editor's own baseline does not cover the frames pane.
