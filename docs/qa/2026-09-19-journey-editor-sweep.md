# Sweep: the journey editor — `/admin/journeys/<id>` — 2026-09-19

**Build:** `e8d7db4` (`feat/phase-4-admin`) **Engine:** Playwright (`chromium`), driven by a
temporary spec so the walk could read computed styles, measure every glyph cell's box and
list the rail's hidden form values — deleted after the walk, findings here
**Routes walked:** 3 — `/admin/journeys/276` (Tokyo, the seeded diary's first journey),
`/admin/journeys/277` (Lisbon, to check per-journey leakage), `/admin/journeys/2000000000`
(a journey nobody owns)
**Surfaces:** the three configured projects — `desktop` 1440x900 · `mid` 1000x800 ·
`mobile` 390x844 (iPhone UA, touch)
**Result:** 5 defects — S1:1 S2:2 S3:0 S4:2. **EDITOR-001, EDITOR-002, EDITOR-003 and
EDITOR-005 were fixed in the round that followed this sweep** — each carries its own
re-check below, measured in the same browser at the same three surfaces. EDITOR-004 is
unfixed and is not this screen's.

**Instrumentation, attached before the first navigation on every context:** `console`
(**all levels**), `pageerror`, every `response` with a status ≥ 400, and every
`requestfailed`. `CLAUDE.md` §10, and it earned its place immediately: **EDITOR-001's
loudest symptom is a `console.error` no assertion in this repository looks at**, and the
four e2e cases and the axe case that walk this screen all pass while it is happening.

**Why this sweep, and why now.** `CLAUDE.md` §10 makes it mandatory and Task 5 did not run
it; the task's own review (`task-5-review.md`, M3) asked for it before the fix round, "so
the patch is written against something observed rather than against my probe alone". That
was the right call twice over: the review's own finding (EDITOR-002) is confirmed here at
three widths, and **two defects nobody had seen were found in the first two minutes** — one
of them S1, and neither reachable from the clean fixtures every automated case uses.

**Nothing here is patched in this commit.** `CLAUDE.md` §10: a fix without a test that
failed first guards nothing.

---

## Defects

### EDITOR-001 · S1 · The rail draws three phantom pages with `id: null`, marks all three selected, and its arrows post `null`

- **Route:** `/admin/journeys/276` — every surface swept (desktop, mid, mobile)
- **Steps:**
  1. Cold load `/admin/journeys/276` with a live session. (The seeded Tokyo journey has
     **three** pages: Notes, Frames I, Frames II.)
  2. Count the cards in the rail.
  3. Read each card's `data-page-id`.
  4. Click the second card.
  5. Read the hidden `pages` value inside the tool row's ↑ and ↓ forms.
  6. Watch the console throughout.
- **Expected:** three cards, one per page, each carrying its own row id; exactly one card
  selected; each arrow carrying a comma-separated list of three real row ids.
- **Actual:** **six** cards — Notes, **Cover**, Frames I, **Contents**, Frames II,
  **About** — and the header's crumb reads "6 PAGES". Three of them carry the literal
  string `null`:

  ```text
  SWEEP[desktop] cards=6
  SWEEP[desktop] railIds=["533","null","534","null","535","null"]
  ```

  Clicking one navigates to `?page=null`, and because three cards share the id `null`,
  **three cards render as selected at once**:

  ```text
  SWEEP[desktop] clicked=null url=…/admin/journeys/276?page=null nowSelected=["null","null","null"]
  ```

  Every arrow in every tool row then carries a sequence with `null` in it, which
  `readPageOrder`'s `z.coerce.number()` turns into `NaN` and refuses — **so ↑ and ↓ throw
  instead of reordering, on the only populated database this project has**:

  ```text
  SWEEP[desktop] arrowSequences=["null,533,534,null,535,null","533,534,null,null,535,null", …]
  ```

  And the silent half, on every load at every surface, twice:

  ```text
  error: Encountered two children with the same key, `%s`. Keys should be unique so that
  components maintain their identity across updates. Non-unique keys may cause children to
  be duplicated and/or omitted — the behavior is unsupported and could change in a future
  version. null
  ```

  Next's dev overlay shows it as the red **"2 Issues"** badge in
  `desktop-editor.png`'s lower left.

- **Cause, isolated.** Not the seed and not the component. `readJourneyEditor` reads pages
  with `draft: true`, which makes Payload answer from `_pages_v` — and a version row whose
  parent page row no longer exists comes back as a document with `id: null`. Measured
  against the developer's own `diary`:

  ```text
  PROBE plain    [{"id":533,"t":"Notes"},{"id":534,"t":"Frames I"},{"id":535,"t":"Frames II"}]
  PROBE drafted  [{"id":533,"t":"Notes"},{"id":null,"t":"Cover"},{"id":534,"t":"Frames I"},
                  {"id":null,"t":"Contents"},{"id":535,"t":"Frames II"},{"id":null,"t":"About"}]
  ```

  Reproduced from nothing in `diary_test` by removing a page row without its versions
  (`payload.db.deleteOne`), which is the state the dev database is in — Cover, Contents and
  About are pages a Phase 1 iteration created and removed:

  ```text
  PROBE plain    [{"id":204,"t":"Notes"},{"id":206,"t":"Frames II"}]
  PROBE drafted  [{"id":204,"t":"Notes"},{"id":null,"t":"Frames I"},{"id":206,"t":"Frames II"}]
  PROBE versions [{"parent":206,…},{"parent":null,"latest":true,"t":"Frames I"},{"parent":204,…}]
  ```

  **`deletePageRow` is not the source** — measured separately: `payload.delete` removes a
  page's version rows with it, and a journey read back after it shows no phantom.

  What let it through the type system: `readJourneyEditor` brands the id with
  `pageId(String(page.id))`, and `String(null)` is `'null'` — a non-empty string, which is
  the only thing the brand promises. `packages/domain/src/ids.ts`'s `rowId` exists in this
  very task to refuse exactly that ("the brand only promises a non-empty string, so a caller
  can hand over something that is not a Payload id") and is used on the read's journey id
  and not on its pages.

- **Why no automated case caught it:** every fixture in
  `readJourneyEditor.integration.test.ts`, `pageMutations.integration.test.ts` and
  `e2e/admin.spec.ts` builds its own journey and its own pages, so none of them has ever
  met an orphaned version. The a11y case _does_ open a seeded journey — and axe has no
  opinion about a card whose id is a string.
- **Evidence:** `docs/qa/assets/2026-09-19-journey-editor/desktop-editor.png` (six cards,
  the "2 Issues" badge) · the four `SWEEP[…]` lines above, reproduced identically at `mid`
  and `mobile`.
- **Fixed** in `ac882f1`, by `isRowId` in the domain — a brand promises a non-empty string,
  and that is a different question from "is there a row behind this". Re-checked in the same
  browser: `ids=["533","534","535"] selected=1 consoleErrors=[]` at all three surfaces, and
  `desktop-editor-fixed.png` shows three cards and no dev-overlay badge.

---

### EDITOR-002 · S2 · The **Four up** glyph draws two 3px rules and two blocks, not four equal cells

- **Route:** `/admin/journeys/276`, the layout box — every surface swept
- **Steps:**
  1. Cold load the editor.
  2. Measure every `[data-glyph-cell]`'s bounding box inside each of the four buttons.
  3. Look at the Four up button.
- **Expected:** `SCREENS.md` §2.3's table — "Four up · `1fr 1fr` × `1fr 1fr` · **four
  equal**".
- **Actual:** identical at all three surfaces:

  ```text
  SWEEP[desktop] glyph three-up    = ["24.7x30","17.1x13.5","17.1x13.5"]
  SWEEP[desktop] glyph four-up     = ["18.1x3","18.1x13.5","12.7x3","18.1x13.5"]
  SWEEP[desktop] glyph full-bleed  = ["56x30"]
  SWEEP[desktop] glyph text-spread = ["29.3x3","29.3x3","20.5x3","29.3x30"]
  ```

  Four up's first and third cells are **3px tall**, and the third is **12.7px wide against
  its siblings' 18.1px** — the `width: 70%` the text spread's last rule carries. So the
  button draws a thin line, a block, a shorter thin line and a block. Three up, Full bleed
  and Text spread are all correct.

- **Cause:** `LayoutPicker.tsx`'s `isRule` infers "this is a 3px rule" from the cell's
  SHAPE — one row tall, first column — and `four-up`'s two left cells satisfy it. The
  `rules.length > 1` guard spares `full-bleed` (one such cell) and not `four-up` (two).
- **Failure scenario:** the two layouts the glyph exists to tell apart are Four up and Text
  spread, and Four up is drawn as a half-finished Text spread. This is the defect §2.3 puts
  in parentheses ("an empty grid renders four identical rectangles") one level down: the
  cells are real and distinct as data, and the drawing still collapses two options toward
  each other.
- **Evidence:** `docs/qa/assets/2026-09-19-journey-editor/desktop-layout-picker.png` — the
  Four up button, second from the left, reading as two rules and two blocks · the same
  measurements at `mid` and `mobile`.
- **Also found by:** `task-5-review.md` H2, from a jsdom probe. This sweep confirms it in a
  real browser, at three widths, with the pixel heights.
- **Fixed** in the round that followed, by moving `kind: 'block' | 'rule'` into `GlyphCell`
  so a layout that did not declare a rule cannot be drawn with one. Re-checked:
  `fourUp=["18.1x13.5","18.1x13.5","18.1x13.5","18.1x13.5"]` — four equal cells — at all
  three surfaces, and `desktop-layout-picker-fixed.png` shows it.

---

### EDITOR-003 · S2 · §2.3's two- and three-column layouts never appear at any width this project tests

- **Route:** `/admin/journeys/276` — desktop, mid and mobile
- **Steps:**
  1. Cold load the editor at 1440x900.
  2. Read `getComputedStyle(document.querySelector('[data-journey-editor]')).gridTemplateColumns`.
  3. Repeat at 1000x800 and 390x844.
- **Expected:** `SCREENS.md` §2.3 — `184px | minmax(0,1fr) | 250px` above 1180px,
  `168px | minmax(0,1fr)` above 860px with the pool spanning `1 / -1`, a single column
  below. The prototype at a 1440 viewport draws the **three-column** shape.
- **Actual:** one column at every surface:

  ```text
  SWEEP[desktop] viewport=1440 screenWidth=1142 cols="1142px"
  SWEEP[mid]     viewport=1000 screenWidth=718  cols="718px"
  SWEEP[mobile]  viewport=390  screenWidth=346  cols="346px"
  ```

- **Cause, and it is a consequence of a decision that was reviewed and accepted.**
  `editor.module.css` keys the rungs on a **container query**, whose `inline-size` is the
  content BOX. The prototype keys them on
  `document.querySelector('[data-content]').clientWidth`
  (`Travel Diary Admin.dc.html:1469`), and `clientWidth` **includes** that element's own
  `padding: 24px 30px 44px`. So at a 1440 viewport the prototype reads
  `1440 − 238 = 1202` and takes `w >= 1180 → 'wide'` (line 1537); we read `1202 − 60 = 1142`
  and take the narrow arm. The stylesheet's header states the ~60px offset and says it is
  "written down rather than compensated for" — what nobody checked is that for THESE two
  rungs the offset changes the answer at the design's own reference width.
  `journeys.module.css` makes the same choice and is unaffected only because its rungs
  (720/800/880/1000) sit where 1142 and 1202 give the same answer.
- **Failure scenario:** the author opens the largest screen in the handoff on a 1440
  desktop and gets a single stacked column: the rail's cards run the full 1142px, the tool
  row's spacer throws Copy and Delete a thousand pixels away from ↑ ↓, the 2×2 layout
  picker becomes two columns of enormous buttons, and the pool's `aspect-ratio: 1/1` tiles
  render ~570px square from a 400px `thumb` derivative.
- **Evidence:** `docs/qa/assets/2026-09-19-journey-editor/desktop-editor.png` (the whole
  screen in one column) and `desktop-layout-picker.png` (the picker stretched across the
  full width) · the three `cols=` readings above.
- **Fixed, and the cause was two things rather than one.** Compensating the rungs (800 and
  1120, which are §2.3's 860 and 1180 in the units a container query measures in) changed
  NOTHING on its own: the re-check still read `1142px`. The second cause is that
  `container-type: inline-size` was on the grid itself, and **an element is not matched by
  its own container query** — only its descendants are, which is why the `.pool` rules
  inside the rungs had always worked and the grid rules had never fired at any width. The
  grid is now a child of the measured element. Re-checked: `cols="184px 672px 250px"` at
  desktop — §2.3's three columns, the pool at its 250px — and one column at `mid` (718px
  container, correctly below the 800 rung) and `mobile`. `desktop-editor-fixed.png`.
- **Still not exercised:** the two-column middle shape. `mid`'s container is 718px and the
  rung is 800, so no project photographs it — the same gap `docs/deviations.md` §55 records
  for the journeys ladder, where `mid` sits under the first rung.

---

### EDITOR-004 · S4 · "Journey pool — 0 of 9 in the book" on a journey whose book prints several of those nine

- **Route:** `/admin/journeys/276`, the pool eyebrow — every surface
- **Steps:** cold load the editor and read `[data-pool-count]`.
- **Expected:** `SCREENS.md` §2.3 — "{n} of {total} in the book".
- **Actual:** `count="0 of 9 in the book"`, while Tokyo's book pages do print photographs
  from that pool.
- **Cause:** the count is `media.inBook`, which is the column §2.4's "Add to book" writes —
  and **nothing writes it yet**. `apps/web/scripts/seed.ts:510` says so explicitly:
  "`inBook` (schema default `false`) is what distinguishes the two", and the seed relies on
  the default. So the screen is reading the right column and the column is empty.
- **Not this screen's to fix:** the owner is §2.4's media screen, or the seed. Recorded so
  that a later reader does not take "0 of 9" for a defect in the pool, and so that whoever
  lands §2.4 knows this eyebrow is its first consumer.
- **Evidence:** `desktop-editor.png`, the pool eyebrow · `SWEEP[desktop] pool … count="0 of 9 in the book" tiles=9`.

---

### EDITOR-005 · S4 · The pool is not drawn as a card, and the editor grid's `max-width` and `align-items` differ from the prototype

- **Route:** `/admin/journeys/276`, the pool column — every surface
- **Steps:** compare `editor.module.css`'s `.screen` and `.pool` against
  `Travel Diary Admin.dc.html`'s `editorGrid` (line 1932) and `poolStyle` (line 1936).
- **Expected:** the prototype's own values — grid `maxWidth: '1440px'`,
  `alignItems: 'start'`; pool `background: '#fffdf6'`, `borderRadius: '3px'`,
  `padding: '16px 16px 18px'`, `boxShadow: '0 0 0 1px rgba(120,98,60,.16), 0 12px 26px -22px rgba(60,44,20,.55)'`.
  `SCREENS.md` §2's preamble says the same of every card.
- **Actual:** `max-width: 1320px` (the journeys screen's number, carried over), no
  `align-items`, and the pool has no card background, ring, radius or padding of its own.
  `gap: 18px` matches.
- **Why it has not shown yet:** in a single column (EDITOR-003) the missing `align-items:
start` changes nothing and the pool's full-width band reads as part of the page. Both
  become visible the moment the three-column shape appears.
- **Evidence:** `desktop-editor.png` — the pool sits directly on the desk with no card
  behind it, unlike every other panel on the screen.
- **Fixed** alongside EDITOR-003, because both become visible in the same shape: the grid
  takes the prototype's `max-width: 1440px` and `align-items: start`, and the pool takes its
  `#fffdf6`, `3px` radius, `16px 16px 18px` padding, ring and shadow. `desktop-editor-fixed.png`.

---

## Clean

Everything below was walked and found correct; each is a thing that has broken on this
surface before, or that this screen's own claims rest on.

- **No `pageerror` at any surface**, on any of the three routes. Zero.
- **No 4xx or 5xx and no failed request**, except the deliberate probe:
  `404 http://localhost:3000/admin/journeys/2000000000`. The missing-journey address
  answers a real `404` status, not a 500 and not a redirect.
- **No horizontal overflow at any surface** — `documentOverflow` is
  `{scrollWidth: 1440, clientWidth: 1440}` / `1000/1000` / `390/390`. The shell's content
  area is `overflow-x: hidden`, so anything sticking out would be unreachable rather than
  merely ugly; nothing does.
- **The tool row never overflows its card**, at any width:
  `toolRowWidth=1142 cardWidth=1142 toolOverflow=false` (and 718/718, 346/346). This is the
  defect the journeys row's controls had at Task 4, checked here for the same reason.
- **The arrows are disabled at the ends of the rail, and only there** —
  `up.disabled=true down.disabled=false` with the first card selected.
- **Per-journey state does not leak** — the handoff's most-repeated defect, five separate
  times. Navigating from Tokyo to Lisbon gives `title="Lisbon"` and `cards=3`: the title,
  the rail, the crumb and the pool all follow the address, because the screen holds no state
  at all.
- **The pool's scroller is reachable and really scrolls** —
  `scroll={"scrollHeight":919,"clientHeight":432,"tab":0}` at desktop, `707/432` at mid,
  `521/432` at mobile: the `max-height: 432px` cap §2.3 gives it is in force, there is more
  content than fits, and `tabIndex` is 0 so a keyboard can reach it. That is the WCAG 2.1.1
  fix from `d7af26a` holding in a real browser at three widths.
- **Three up, Full bleed and Text spread all draw what §2.3's table says**, measured cell by
  cell (see EDITOR-002's numbers for all four).
- **The eyebrow, the crumb and the title** read "PAGES IN TOKYO", "JOURNEYS · JAPAN · 6
  PAGES" and "Tokyo" — the format is right; the count is EDITOR-001's.
- **The rail's Journeys button stays lit** on the editor, so the editor reads as part of the
  journeys section rather than as an orphan screen.

## Not covered

- **axe.** Not re-run here: `e2e/a11y.spec.ts` gained a case for this screen in `d7af26a`
  which walks it at the same three projects and is green. The one violation it found
  (`scrollable-region-focusable`) was fixed in that commit and is confirmed above.
- **Add page, Copy, Delete and the layout buttons were not pressed during the walk.** The
  sweep read what each form would post rather than posting it, because the walk runs against
  the developer's own `diary` and a press would change seeded data — the hazard Task 4 paid
  seven baselines for. Their round trips are covered by `e2e/admin.spec.ts`'s four cases
  against a journey those tests create and delete. **Note that EDITOR-001 means the ones on
  a phantom card could not have worked anyway.**
- **A journey with no pages at all.** Not reachable from the seeded data and not creatable
  without writing to `diary`; covered in jsdom (`draws an empty rail rather than throwing`)
  and in integration (`starts the rail at 0 for a journey that has no pages at all`).
- **Widths between the projects.** Three viewports, not a sweep across the rungs — which
  is what EDITOR-003 is about, and is the right place to settle it rather than here.
- **The editing pane.** It is Tasks 6 and 7; today it prints the selected page's name and
  one line saying so.
