# Sweep: the journey editor's Notes pane — `/admin/journeys/<id>?page=<notes>` — 2026-09-19

**Build:** `3f8005a` (`feat/phase-4-admin`) **Engine:** Playwright (`chromium`), driven by
three temporary specs so the walk could read computed styles, measure every box, post the
pane's real forms and then read the `journeys` and `_journeys_v` rows behind them — deleted
after the walk, findings here **Routes walked:** 4 — `/admin/journeys/276?page=533` (the
seeded Tokyo journey's Notes page, whose highlight list is **at the four-line cap**),
`/admin/journeys/277?page=536` (Lisbon, three highlights, a different glyph and a different
accent, to check per-journey leakage), `/admin/journeys/276?page=534` (Tokyo's Frames I,
which must still draw the placeholder), and `/admin/journeys` (the list, to see what a save
does to the `Status` cell)
**Surfaces:** the three configured projects — `desktop` 1440x900 · `mid` 1000x800 ·
`mobile` 390x844 (iPhone UA, touch)
**Result:** 2 defects — S1:0 S2:1 S3:0 S4:1

**Instrumentation, attached before the first navigation on every context:** `console`
(**all levels**), `pageerror`, every `response` with a status ≥ 400, and every
`requestfailed`. Across twelve walks the only console output was Next's development banner
and `[HMR] connected`; **no `pageerror`, no response ≥ 400, no failed request.** `axe` was
run on the Tokyo walk at all three surfaces through `e2e/support/axe.ts` and reported no
violations.

**Why the walk that WRITES runs on a copy of Tokyo rather than on Tokyo.** Everything read
below is the seeded row — a four-line highlight list at the cap, a four-cell tally with
"Kilometres walked" in it, a real 400-character note — because that is the shape no clean
fixture has. The walk that presses Save draft runs against a journey created by copying
Tokyo's own columns and deleted afterwards, so the developer's own `diary` database keeps
its ten journeys with no draft versions minted over them. `select count(*) from journeys`
reads 10 before and after.

**Nothing here is patched in this commit.** `CLAUDE.md` §10: a fix without a test that
failed first guards nothing.

---

## Defects

### NOTES-001 · S2 · At 390px the tally's right-hand column is drawn outside the pane, and two of its four cells cannot be reached

- **Route:** `/admin/journeys/276?page=533` — `mobile` 390x844 only. Clean at `mid` and
  `desktop`.
- **Steps:**
  1. Cold load `/admin/journeys/276?page=533` with a live session at 390x844.
  2. Scroll to "Tally".
  3. Try to type into the second column's key or value input.
  4. Measure: `pane.scrollWidth` against `pane.clientWidth`, and the bounding box of every
     descendant whose right edge is past the pane's.
- **Expected:** four tally cells, all inside the pane's card, all typeable. `SCREENS.md`
  §2.3 gives the tally "a 2-column grid of key/value pairs" and does not exempt any surface;
  every other grid in `editor.module.css` writes `minmax(0, 1fr)` precisely so a track cannot
  be pushed past its container by its content.
- **Actual:** the pane is 346px wide and its content is **542px** — a 196px overflow, which
  the shell clips rather than scrolls (`document.documentElement.scrollWidth` equals its
  `clientWidth`, so there is no horizontal scrollbar to reach the rest with). The second
  column's two cells end at x=564 against a pane that ends at x=368. "Kilometres walked" and
  "Bowls of ramen" are cut mid-word and their value inputs are entirely off the card.

  ```text
  OVERFLOW[mobile] {"paneRight":368,"paneClient":346,"paneScroll":542,
    "wide":[{"tag":"div.tallyCell","right":564,"width":254},
            {"tag":"input.tallyKeyInput","right":481,"width":171},
            {"tag":"input.tallyValueInput","right":564,"width":74}, …]}
  OVERFLOW[mid]    {"paneRight":978,"paneClient":718,"paneScroll":718,"wide":[]}
  ```

  **The cause is `1fr`, not the 74px value input.** `.tally` is
  `grid-template-columns: 1fr 1fr`, and a `1fr` track's automatic minimum is `min-content` —
  here a `flex: 1` key input beside a fixed 74px value input, which measures 254px. Two of
  those are 508px against 306px of room, so the tracks refuse to shrink and the grid
  overflows. `minmax(0, 1fr)` is what every other grid in this stylesheet uses and what the
  `.fieldGrid` beside it already uses.

- **Evidence:** `docs/qa/assets/2026-09-19-notes-pane/tally-overflow-mobile.png` (the cut
  "Kilometr…" and "Bowls of…"), and `…/tally-clean-mid.png` for the same block at `mid`,
  where it fits.

### NOTES-002 · S4 · Two rapid presses of a highlight control apply only one of them

- **Route:** `/admin/journeys/<a copy of Tokyo>?page=<its notes>` — `desktop`, and the same
  at the other two surfaces
- **Steps:**
  1. Load a Notes page with two highlights.
  2. Press "Add highlight" and wait for the pane to come back. (Three lines.)
  3. Press "Add highlight" **twice in quick succession**, without waiting in between.
  4. Wait, then count the rows.
- **Expected, arguably:** five lines. Each press is a request.
- **Actual:** four. The second press posts the list the pane was rendered with, which is the
  same list the first press posted, so the two writes are the same write and the later one
  wins:

  ```text
  PROBE afterTwoFastAdds before=["…dba4","…dba5"] now=["…dbb1","…dbb2","…dbb3"]
  ```

- **Why it is S4 and not S2.** This is the staleness `notesMutations.ts`'s header already
  records — every save re-mints the array row ids, so a form rendered before a save carries
  ids the next save has replaced — and it is the same window the page rail's arrows have
  had since Task 5. Nothing is lost that the author typed: the fields all survive, and a
  settled press always applies. It is recorded because it is real and observable, not
  because anything is blocked.
- **Evidence:** the probe line above. Every settled press was measured working at all three
  surfaces, in sequence: `afterAddAtCap` (refused, list unchanged at four), `afterRemove`
  (three), `afterAdd` (four, the new line last), `afterMoveUp` (the last line moved one
  place up), `afterSave`, `afterReload` (the same four, from Postgres).

## Clean

Everything below was measured, not glanced at. `desktop`/`mid`/`mobile` unless stated.

- **The container rungs, which is what EDITOR-003 was about.** At `desktop` the editor's
  container is 1142 and the pane is 672: the field grid draws
  `163px 163px 132px 132px` (four tracks, §2.3's `minmax(0,132px)` pair at their cap), the
  body grid draws `348px 258px` and the furniture grid draws two columns. At `mid` the
  container is 718 and all three collapse to one/two tracks, which is correct — 718 + 44 is
  762, below §2.3's 900 and 1020. At `mobile` the container is 346 and the same. No rung
  fires at a width it should not.
- **Every field arrives filled from the database.** Location `Tokyo`, Dates
  `12 – 24 March 2025`, Weather `CLEAR 14C`, Mood `WIDE EYED`, the note, the four
  highlights, the four tally cells (`Days=12`, `Kilometres walked=147`, `Rolls shot=9`,
  `Bowls of ramen=11`), the sign-off, `NIPPON`, `120`, and `/gallery/tokyo`.
- **The three weather cards draw three different marks**, measured as three different SVG
  bodies (528, 241 and 195 characters) in three 74px-tall cards, with the selected one
  carrying `rgb(163, 68, 52) 0 0 0 1.5px inset` and the other two the muted hairline.
- **The stamp face is a live 52x64 painted in the journey's accent** —
  `linear-gradient(170deg, rgb(61, 129, 126), rgba(0, 0, 0, 0.25))` for Tokyo's `#3d817e`,
  and `#a06b3e` for Lisbon's.
- **Five swatches at 38x38, the journey's own checked.** Tokyo `#3d817e`, Lisbon `#a06b3e`.
- **The grips are disabled at the two ends and nowhere else**, on a four-row list:
  `up=true,down=false` · `false,false` · `false,false` · `false,down=true`.
- **"Add highlight" is drawn on a list already at the cap**, and pressing it changes
  nothing — the refusal is the server's, which is where a `POST` cannot walk past it.
- **A blanked line is dropped rather than refused.** Typing three spaces into the middle of
  three lines and saving left two, with no error.
- **Enter in a text field saves; it does not press the first `×`.** Measured on a
  two-highlight journey: the name changed and both highlights survived.
- **The glyph cards are reachable and operable by keyboard.** Focusing the visually hidden
  radio draws a 2px ring on the card, and Space selects it.
- **Nothing of one journey leaks into the next.** Loading Tokyo and then Lisbon in the same
  context gives Lisbon's own name, slug, three highlights, `haze` and `#a06b3e`, with the
  hidden `journey` field reading `277`. This is the handoff's most-repeated defect and it is
  not here.
- **Save draft publishes nothing.** After a save the live `journeys` row is still
  `_status: 'published'` with its ORIGINAL name and note, while `_journeys_v`'s newest row
  is `draft` with the typed ones — and `/admin/journeys` now prints `Edited` for that
  journey. That is Task 4's trap, checked from both tables.
- **A Frames page still draws the placeholder and no form at all** (`notesPanes: 0`).
- **No console error, no `pageerror`, no response ≥ 400, no failed request**, across twelve
  walks.
- **axe: no violations**, on the Tokyo Notes page at all three surfaces.

## Not covered

- **The photo slots**, which §2.3 puts in the pane's right column. They are Task 7; the
  column currently carries a placeholder line and was walked only to confirm it draws.
- **"Preview page"**, which is not built — `docs/deviations.md` §59.
- **A slug collision.** `journeys.slug` is `unique`, so saving the gallery address of one
  journey onto another is refused by Postgres and reaches the author as an unhandled action
  error. The pane has no error surface of its own and the handoff gives it none; this is
  noted rather than filed, because deciding what an author should see is a design question
  this task has no answer from the handoff for.
- **Every other admin screen.** This sweep is scoped to the Notes pane; the rail, the layout
  picker and the pool were re-checked only incidentally by loading the screen they sit on.
- **Firefox and WebKit** — `playwright.config.ts`'s three projects are all Chromium, for the
  reason its header gives.
