# Sweep: /admin — SCREENS.md §2.1's Overview — 2026-09-26

**Build:** `26a1594` **Engine:** playwright (chromium, headless, `desktop` project driving its own viewports)
**Routes walked:** 1 (`/admin`) at three viewports, plus `/admin/publish` and `/admin/galleries` as
comparison surfaces
**Result:** 3 defects — S1:0 S2:0 S3:3 S4:0. **All three fixed in this task**, each with its own
failing test and its own commit; see the `Fixed` line on each.

## What was instrumented

`console` (errors and warnings), `pageerror`, and every response with a status ≥ 400, attached
before the first navigation. **All three were empty at all three viewports.** The full axe
ruleset (`expectNoAxeViolations`, no exclusions) passed at all three.

## What the diary had to be given first, and why

**The seeded diary has nothing outstanding, and that was measured rather than assumed.** Every
gallery frame carries a caption and alt text; every journey is published; `select count(*) from
media where kind = 'clip'` is **0**; and the ten rows with an empty caption are all ephemera,
which `galleryFrameWhere` excludes for every reader. The 42 `_journeys_v` rows with
`latest = true AND version__status = 'draft'` all have `parent_id` **NULL** — orphans of deleted
journeys — so `readPendingChanges` correctly reports nothing waiting.

So three of the four cards would have drawn their empty lines and the sweep would have measured
nothing. The run seeds two journeys (one published-then-edited, one never published) and three
`media` rows (a posterless clip, an uncaptioned still, a still with no alt text), and removes
them afterwards. **The dev database was dumped before and after** — journeys 10, pages 30, media
143, `_journeys_v` 610, `_pages_v` 546 — and the three COLLECTION counts came back identical,
with zero rows matching either fixture marker.

**The version tables did not, and it is worth saying exactly why rather than rounding it to
"clean".** After the full `e2e/admin.spec.ts` run `_journeys_v` reads 650: the orphan count
(rows whose `parent_id` is null, which Payload leaves behind when a journey is deleted) went
42 → 56, and all ten seeded journeys carry a new version row and a fresh `updated_at`. Their
names, places and `_status` are unchanged, and the cause is Task 10's own bookmark-order case,
which says so at the top of itself — "IT WRITES THE DEVELOPER'S OWN DATABASE, so it reads every
journey's `order` AND `_status` first and writes them all back at the end" — through
`writeJourneyPlace`, which is the versioned-write path that makes the restore safe. Nothing this
sweep did touches a seeded row: its fixtures are rows it created and deleted.

## Defects

### OVR-001 · S3 · The prompt's action link runs on from the end of its sentence

- **Route:** `/admin` at 1440, 1000 and 390 — all three.
- **Steps:**
  1. Sign in and open `/admin` with at least one prompt outstanding.
  2. Read any row of the "Needs a look" card.
- **Expected:** `SCREENS.md` §2.1 — "an 8px rotated square, the text (Garamond 16.5px / 1.35),
  and an action link". The handoff prototype puts the text in a `<div>` and the action in a
  `<button>` below it, both block-level inside a flex column, with `margin-top: 3px` between
  them.
- **Actual:** the action sits on the same line as the last word of the sentence, with no space
  at all: **"…gallery has no alt text.ADD ALT TEXT"**. `.promptText` is a `<span>` and the
  stylesheet leaves it `display: inline`, so the `margin-top: 3px` on the inline-block action
  does nothing to separate them.
- **Fixed:** `59ac29e`. `.promptText` takes `display: block`, the rule
  `publish.module.css`'s `.what` already carries with the reason beside it. The case asserts
  the LEFT EDGE of every action rather than the top of one, because an inline sentence runs on
  only when the action fits on its last line — the first shape of the test passed on its first
  run for that reason and was rewritten.
- **Evidence:** `getComputedStyle('[data-prompt-text]').display` is **`"inline"`**;
  the run-on was visible in all three prompt rows at all three viewports, and
  the geometry says which: of three prompts on one render, the first read
  `{"text":{"top":492,"bottom":536,"lines":2},"action":{"top":524,"left":1061},"bodyLeft":974}`
  — the action starting 87px right of the body's own edge, on the sentence's last line — while
  the other two happened to wrap and looked correct. `publish.module.css`'s `.what` carries the note this file needed and did not
  copy: "`display: block` because both lines are `<span>`s inside the row's `<label>` — an inline
  element takes no top margin and the two would share a line."

### OVR-002 · S3 · The waiting row's text collapses to 63px at 390

- **Route:** `/admin` at 390.
- **Steps:**
  1. Sign in, open `/admin` with at least one change waiting.
  2. Narrow to 390 and read the "Waiting to go out" rows.
- **Expected:** `SCREENS.md` §2.1's row — "a 64px fixed-width kind chip …, the change text
  (Garamond 17px) over its location (Courier 10px), a timestamp, and Revert" — readable at every
  breakpoint the shell supports. §2.1 gives no narrow rule, so the row has to hold itself.
- **Actual:** the row is `display: flex` with a `flex: none` 64px chip, a `flex: none` timestamp
  and a `flex: none` Revert, so at a 302px card the text column gets **63px** and wraps to one
  word per line. **Measured:** row 302px wide, text column **63px**, row **238px tall**. The
  §2.8 row on `/admin/publish` at the same width measures text **131px** and row **128px** —
  half the height — because §2.8 puts `{location} · {when}` on the second line instead of giving
  the timestamp a column of its own. So this is §2.1's own shape rather than a family defect, and
  it is this screen's to hold.
- **Fixed:** `a11f5ff`. The timestamp and Revert travel together in one `.rowMeta`, the row
  wraps, and the text asks for half the row — so when the pair cannot fit beside it they take
  their own line. No breakpoint: the row answers whatever width it is given.
- **Evidence:** `ROWCMP /admin {"row":302,"rowHeight":238,"text":63}` against
  `ROWCMP /admin/publish {"row":302,"rowHeight":128,"text":131}`, both read in one pass at the
  same 390px viewport.

### OVR-003 · S3 · The rail's Publish count says 1 beside a crumb that says 2

- **Route:** `/admin` at all three viewports; the rail is on all twelve admin screens.
- **Steps:**
  1. Have one journey that has never been published and one that was edited after publishing.
  2. Open `/admin` and read the rail's "Publish" button and the header's crumb.
- **Expected:** a bare digit beside a rail button means "how many rows of the thing this button
  names". It does on Journeys (live journeys), Media (media rows) and Trash (trashed journeys).
  Beside "Publish · WHAT GOES OUT" it should mean what is going out.
- **Actual:** the rail prints **1** — `readNavCounts.unpublished`, journeys that have never been
  published — while the crumb, the Waiting card and `/admin/publish` all count **2**. This is
  PUB-001 (`docs/deviations.md` §91) in its third instance: the chip was relabelled by this task
  and the rail's digit has no label to fix.
- **Fixed:** `458200e`, `docs/deviations.md` §97. `navCountFor` returns `undefined` for
  `publish`; the datum stays on `NavCounts` and the header chip prints it in words. The browser
  case asserts the PROPERTY — any Publish count is allowed as long as the rest of the screen
  agrees with it — so it stays green the day the chrome can afford the real count.
- **Evidence:** `STATES {"railPublish":"1","crumb":"2 changes waiting","chip":"1 journey never published"}`,
  read off one render at one instant; and, on the fixture this task's own e2e run builds,
  `the rail says [0] beside Publish while 1 change waiting`.

## What was measured and found correct

Every §2.1 value, read off `getComputedStyle` and `getBoundingClientRect` at all three viewports:

- **Stat grid** — `repeat(4, minmax(0,1fr))` at 1440 (273.5px × 4), `repeat(2, …)` at 1000 and
  390, gap `16px`; card padding `18px 20px 17px`, radius `3px`, `#fffdf6`. Label Courier `10px`
  / `2.2px` (= `.22em`) uppercase `#736247`; value Caveat `52px` / line-height `52px` `#33403c`;
  note Garamond italic `15px` `#736247`. Tick box **3 × 94px**, four of them, four distinct tones.
- **Main split** — `644.547px 477.453px` at 1440 (ratio **1.35**), gap `20px`; one column at 1000
  and 390.
- **Washi strip** — `top: -12px`, `left: 34px`, `112 × 26px`, `rotate(-2.5deg)`, opacity `.72`.
- **Waiting rows** — padding `13px 0`, `1px dotted rgba(120,98,60,.3)`, gap `14px`. Chip box
  **64 × 18px**, Courier `9px` / `1.44px` (= `.16em`) uppercase, ring
  `srgb(.184 .420 .408 / 0.55)` — the **55%-alpha ring** §2.1 specifies, against §2.8's full one.
  Text Garamond `17px`, location Courier `10px` / `1.2em`, timestamp Courier `10.5px`.
- **Revert, both states** — disabled `#8f836d`, `cursor: not-allowed`, opacity `.55`; enabled
  `#736247`, `cursor: pointer`, opacity `1`. Two rows of two tones in the fixture, so the
  comparison could disagree with the data. `docs/deviations.md` §92's missing `:disabled` arm is
  present here.
- **Cloth chip** — box **78 × 104px** exactly. Title Caveat **13px** (`fitChipTitleSize`'s answer
  for "Wanderings"), `scrollWidth 52 ≤ clientWidth 52`. Years Courier `7px` / `1.68px`
  (= `.24em`).
- **Prompts** — eyebrow Courier `10px` / `2.2em` in `#a34434`; mark 8 × 8px at `rotate(45deg)`
  (its bounding rect reads 11.3, which is 8·√2 and not a defect); text Garamond `16.5px` /
  `22.275px` (= 1.35); action Courier `9.5px` / `1.52px` (= `.16em`).
- **Lately** — two columns at 1440 (`529px 529px`), one at 1000 and 390; gap `0 40px`; row
  padding `11px 0`, dotted rule, gap `13px`; timestamp box **82 × 22px**; description Garamond
  `16.5px`.
- **No horizontal overflow** at any of the three viewports
  (`documentElement.scrollWidth - clientWidth === 0`).
- **The empty states** — with the fixtures removed the Waiting card draws "Everything you have
  written is already out. Nothing is waiting." and the prompts card draws "Nothing needs a look.
  The diary is in order.", and the Lately card still draws six rows. Both were seen.

## Clean

- `/admin` at 1440, 1000 and 390 — axe (full ruleset) clean, no console output at any level, no
  page errors, no response ≥ 400, in both the populated and the empty state.
- `/admin/galleries` reached by clicking a prompt — the named frame is selected on the panel AND
  highlighted in the grid, and the bulk panel opens expanded for "Caption them".
- `/admin/publish` at 390, visited only as the comparison surface for OVR-002.

## Not covered

- **Pressing Revert.** It is a Server Action that discards a draft, and the sweep's rule is that
  it does not write to the developer's diary beyond fixtures it created and removed. Its
  behaviour is covered by `e2e/admin.spec.ts`'s Revert case on `/admin/publish`, which is the
  same action, and the button's disabled arm is measured above from both sides.
- **"Copy link".** `navigator.clipboard` needs a permission the headless run does not grant, so
  the three labels are asserted in jsdom against a stubbed clipboard instead
  (`CopyLink.test.tsx`), including the refusal and the no-clipboard arms.
- **A visual baseline.** Owed, and generated only in the pinned Linux container
  (`docs/deviations.md` §86). This sweep's own screenshots were written to `test-results/`,
  which later runs clean, so the evidence recorded here is the NUMBERS rather than the pictures
  — which is the stronger record anyway: a screenshot cannot be re-read against a threshold.
- **The `nothing-published` prompt.** It needs a diary with no published journey at all, which
  cannot be produced in the developer's database without unpublishing ten seeded journeys. Its
  own case is in `packages/domain/src/admin/prompts.test.ts`.
