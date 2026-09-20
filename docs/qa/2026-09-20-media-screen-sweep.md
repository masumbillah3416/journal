# Sweep: the Media screen (SCREENS.md §2.4) — 2026-09-20

**Build:** `875e877` **Engine:** playwright (chromium, headless) **Routes walked:** 1 route, 3
viewports, 10 widths
**Result:** 3 defects — S1:0 S2:0 S3:2 S4:1

## What this sweep could write, and what it did to the database

**Every control on this screen except the chips is a write.** "Add to book" sets a column,
"Caption" sets another, "Move" re-points a relationship, and the dropzone creates rows and files.
Task 7's sweep left the dev `diary` changed without noticing, so this one did not rely on
remembering to restore.

`apps/web/media` and the `media`/`journeys` tables were **snapshotted before the walk** (143 media
rows, 10 journeys, with `id`, `filename`, `in_book`, `caption`, `journey_id` and `order` for every
row). The sweep created two journeys and two media rows of its own and pointed every write at
those. Afterwards the fixtures were deleted — rows, journeys and all fifteen derived files,
through the Storage port — and the two tables were **re-read and compared with the snapshot**:

```text
media identical: true ( 143 -> 143 )
journeys identical: true ( 10 -> 10 )
```

`apps/web/media/staging/` was checked for orphans and holds **no files** (see MEDIA-003's note on
the empty directories it does hold).

## Defects

### MEDIA-001 · S3 · The upload card keeps saying "Uploading" after the batch has finished

- **Route:** `/admin/media`, desktop 1440×900 (every viewport)
- **Steps:**
  1. Load `/admin/media` with a live session.
  2. Choose a journey in "Add to — {journey}" and pick one JPEG through Browse.
  3. Wait for the row's percentage to reach 100%.
  4. Read the card's eyebrow.
- **Expected:** `SCREENS.md` §2.4 draws the card as the state of an upload IN PROGRESS —
  "Uploading — 2 of 34", a track and a percentage. Nothing in §2.4 describes a finished card, and
  the prototype's is a static fixture of two files mid-flight.
- **Actual:** the card stays exactly as it is, reading `Uploading — 1 of 1` with `100%`, until the
  author navigates away. The screen therefore says an upload is in progress when none is.
- **Evidence:** `assets/2026-09-20-media/08-upload-card.png`; the sweep's own reading
  `upload-state=100%` taken after `Uploading — 1 of 1` had settled.

### MEDIA-002 · S3 · A refused file's row prints the pipeline's internal refusal name

- **Route:** `/admin/media`, desktop 1440×900
- **Steps:**
  1. Load `/admin/media` with a live session.
  2. Pick a file the pipeline does not accept — a `.txt` declared `text/plain`.
  3. Read the row the card draws for it.
- **Expected:** the author is told, in words, that the file was not accepted. `SCREENS.md` §2.4
  specifies no error surface at all, so anything shown here is this implementation's
  (`docs/deviations.md` §60 is the same gap one screen along).
- **Actual:** the row reads `sweep-media-fixture-refused.txt — type-not-offered`, which is
  `SlotRefusal`'s own member name out of
  `packages/domain/src/media/uploadSlot.ts`. It is developer vocabulary in an author's screen, and
  it is the only place the refusal appears.
- **Evidence:** `assets/2026-09-20-media/10-refused.png`; sweep reading
  `refused-row=sweep-media-fixture-refused.txt — type-not-offered0%`.

### MEDIA-003 · S4 · The `min-width` §2.4 calls required changes nothing at any width this app draws

- **Route:** `/admin/media`, widths 700, 760, 820, 880, 940, 1000, 1100, 1180, 1280 and 1440
- **Steps:**
  1. Measure the dropzone's height, the text block's width and the headline's line count at each
     width.
  2. Delete `min-width: 300px` from `.dropzoneText` in `media.module.css`.
  3. Measure all ten again.
- **Expected:** `SCREENS.md` §2.4: "The `min-width` floor is required. Without it the text block
  absorbs all shrink, the headline wraps to two lines and the zone grows to 300px tall."
- **Actual:** **every one of the thirty readings is identical with the floor and without it.** The
  headline is on one line at all ten widths either way, and the text block never falls below
  325px, because the flex row WRAPS before the `flex: 1 1 300px` basis is shrunk. The declaration
  is inert in this implementation.

  ```text
  WITH FLOOR                                           WITHOUT FLOOR
  w=700  zoneH=292.78  textW=325     lines=1           w=700  zoneH=292.78  textW=325     lines=1
  w=760  zoneH=255.39  textW=385     lines=1           w=760  zoneH=255.39  textW=385     lines=1
  w=820  zoneH=235.78  textW=329.53  lines=1           w=820  zoneH=235.78  textW=329.53  lines=1
  w=880  zoneH=312.39  textW=454     lines=1           w=880  zoneH=312.39  textW=454     lines=1
  w=940  zoneH=292.78  textW=327     lines=1           w=940  zoneH=292.78  textW=327     lines=1
  w=1000 zoneH=255.39  textW=387     lines=1           w=1000 zoneH=255.39  textW=387     lines=1
  w=1100 zoneH=235.78  textW=371.53  lines=1           w=1100 zoneH=235.78  textW=371.53  lines=1
  w=1180 zoneH=198.39  textW=435.53  lines=1           w=1180 zoneH=198.39  textW=435.53  lines=1
  w=1280 zoneH=198.39  textW=535.53  lines=1           w=1280 zoneH=198.39  textW=535.53  lines=1
  w=1440 zoneH=198.39  textW=695.53  lines=1           w=1440 zoneH=198.39  textW=695.53  lines=1
  ```

- **Why it is S4 and not "delete the line".** Nothing a reader or an author can see is wrong. The
  declaration is what §2.4 asks for in words, and a control added to that row later is exactly
  what would make it bite. What was wrong is what the code SAID about it: `media.module.css`'s
  header, its `.dropzoneText` comment and `Dropzone.test.tsx`'s header each read as though the
  floor were preventing the growth. **All three were corrected in the commit that carries this
  report**, and the jsdom case now says in its own words that it asserts a declaration and not a
  behaviour.
- **One observation beside it, not a defect:** the zone reaches **312px** at a 880px viewport WITH
  the floor in place, which is past the 300px §2.4 names as the bad outcome. The cause is the flex
  row wrapping, which is the design's own `flex-wrap`, and §2.4 specifies no height for the zone.
  Recorded here so a later reader meets the number rather than rediscovering it.

## Clean

Everything below was walked and found correct against `SCREENS.md` §2.4 and
`Travel Diary Admin.dc.html`.

- **Console and network.** 38 messages across the whole walk, all `console.log`/`console.info`
  from Next.js and React's dev build. **No `pageerror`, no rejected promise, and no response at
  400 or above** — including every derivative the grid asked for.
- **The dropzone.** `2px dashed rgba(120,98,60,.4)`, `4px` radius, `26px 24px` padding, the 70px
  ringed circle and its 20px rotated square. The headline is §2.4's own words. The note reads
  **"JPEG and PNG."** — this pipeline's real accepted list, not the design's five (see
  `docs/deviations.md` §66). The select reads "Add to — {journey}" for every live journey.
- **The upload card's duplicate notice is real.** Uploading the same bytes twice into one journey
  drew `1 looks like a duplicate — skipped`, which is Phase 3's `finaliseUpload` answering
  `{ kind: 'duplicate' }` from a perceptual-hash match — not a number this screen invented.
- **The five chips are addresses.** Each navigates, marks itself `aria-current="page"`, and keeps
  the search: `?filter=stills` → `?filter=stills&q=…` after typing in the box, with the chip still
  marked. `Everything` 145 of 145, `Stills` 145, `Clips` 0, `In the book` 0 before any write,
  `Unused` 55.
- **The `In the book` chip and the tile chip agree with the column.** Before "Add to book",
  `In the book` drew nothing at all, which is `media.inBook` never having had a writer
  (`docs/deviations.md` §63). After it, both selected tiles drew the "In book" chip and the chip
  filter found exactly those two — and `Unused` dropped them.
- **The bulk bar.** Absent with no selection; `rgba(163,68,52,.08)` with its ring once one tile is
  pressed; `1 selected`, then `2 selected`. Clear and every write empties it.
- **Selection ring.** `rgb(163,68,52) 0 0 0 2.5px` selected, `rgba(120,98,60,.22) 0 0 0 1px`
  otherwise — §2.4's two values.
- **The grid.** `gap: 14px`; tracks `217.19px × 5` at 1440, `230px × 3` at 1000, `368px × 1` at
  412 — `auto-fill` fitting the domain's 187px minimum into the real container, which is the
  design's own mechanism. Tiles are square (217.19 × 217.19).
- **The windowing, measured in a browser.** With 145 rows in the library the grid drew **120** tile
  elements. Scrolling 4,000px changed which tile is first (`1591` → `1548`) and left the count at
  **120**. That is the half `MediaGrid.test.tsx` cannot assert, because jsdom lays nothing out;
  `e2e/upload.spec.ts` now carries it as a standing case.
- **`revalidatePath` reaches the screen.** Each bulk write redrew the grid with the new state and
  no manual reload.
- **Three viewports.** 1440×900, 1000×900 and 412×823 all draw the zone, the controls and the grid
  without overflow; at 412 the select and Browse take the full row, which is this stylesheet's
  container query.

## Not covered

- **The duration chip.** `MEDIA_PIPELINE` is `inline` on this machine, so `showsClipAffordances`
  is false and no clip can be ingested at all — there is no clip in the library to draw one on.
  The chip's presence and absence are pinned in jsdom (`MediaGrid.test.tsx`) against both sides of
  that flag; a browser cannot be shown it until a worker exists (ADR 0004).
- **`processing` and `failed` media rows.** Same cause: `inline` creates rows at `state: 'ready'`
  in one write and creates none on a refusal, so neither state exists to draw.
- **A drag-and-drop upload.** The zone's `onDrop` was not driven. Chromium's DataTransfer cannot
  be populated from Playwright without synthesising a `DragEvent` in the page, which is a
  fixture of our own rather than a browser's drop. The file-picker path — the same `upload`
  function — was driven end to end.
- **Visual baselines.** No `admin-media-*.png` was added. The journey editor (Tasks 5–7) shipped
  without baselines for the same reason: generating them needs the Linux container
  (`npm run test:visual:container:update`), and a photograph is the wrong instrument for the
  threshold questions this screen has. Its measurements are pinned numerically above and in
  `MediaGrid.test.tsx`.
- **A library below the windowing threshold.** `e2e/upload.spec.ts`'s windowing case skips itself,
  by name, on a database with 100 media rows or fewer.
- **`MEDIA_PIPELINE=worker`.** `apps/web/lib/env.ts` refuses it at boot, so the clip half of the
  dropzone's note, the duration chip and a queued upload are all unreachable from a browser today.
