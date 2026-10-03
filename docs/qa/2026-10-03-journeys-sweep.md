# Sweep: the Journeys list (SCREENS.md §2.2) — 2026-10-03

**Build:** `1a17c28` **Engine:** playwright (chromium, scripted) **Routes walked:** 1 (`/admin/journeys`) at 29 widths
**Result:** 2 defects — S1:0 S2:1 S3:0 S4:1

The last Phase 4 screen with no sweep of its own. Ten of the eleven `SCREENS.md` §2 screens
were already swept at finer grain than the spec's four screen groups — the index at
`docs/qa/2026-09-18-phase-4-sweep-coverage.md` says which report covers which.

**Instrumented before walking**, in every one of the six driver passes: `console` at all
levels, `pageerror`, `requestfailed`, and every response with a status at or above 400.
Across the whole sweep — 29 viewport changes, 17 navigations, two refused form submissions,
four axe runs and the ⋯ strip opened and closed six times — **no page error, no failed
request and no response at 400 or above**. The only console output was Next's own
`[HMR] connected`, `[Fast Refresh] rebuilding`/`done in 157ms`, and React's DevTools notice.

**The dev database was dumped before the sweep and diffed after it** (standing order §9).
Every column of all ten `journeys` rows, plus the counts `journeys` 10 / `_journeys_v` 690 /
`pages` 30 / `media` 143: `diff` reports **no difference**. The two form submissions below
were both refused by Zod, so neither wrote.

## Defects

### JOU-001 · S2 · Every journey's 44px cover square is empty, and no control in the admin can fill it

- **Route:** `http://localhost:3000/admin/journeys`, 1440x900 — and at every other width,
  because the square is in the base column track.
- **Steps:**
  1. Sign in and open `/admin/journeys` cold.
  2. Look at the leftmost column of any of the ten rows.
  3. Try to give a journey a cover from anywhere in the admin.
- **Expected:** `SCREENS.md` §2.2, the body-row description: "44px cover thumb
  (`rotate(−1.5deg)`)". A column the handoff draws with a photograph in it.
- **Actual:** the square renders at 45x45 with the rotation applied and **nothing inside it**
  — `innerHTML` is `''`, there is no `<img>`, and the computed `background-image` is `none`
  — for 10 rows out of 10. There is no `<img>` element anywhere on the screen.
- **Why, read rather than guessed:** `apps/web/lib/admin/readJourneysScreen.ts`'s
  `coversByJourney` fills the square from `media.isCover`, taking the `thumb` derivative of
  the row where `isCover === true`. In the dev database
  `select count(*) from media where is_cover = true` is **0**, against 143 media rows of
  which **143** carry a `thumb` derivative. The seed never sets it, and neither does
  anything an author can press: §2.5's "Use as gallery cover" toggle is a **reorder**, not a
  write to that column, which is `docs/deviations.md` §75's own decision, and an unscoped,
  case-insensitive grep for `isCover` across the tree finds writes only in the `media`
  collection's hook — which **clears** the flag on siblings — and in two integration-test
  fixtures. **No production code path sets it.** So the column is not showing an empty
  database; it is showing a datum the admin cannot produce.
- **It also falsifies a sentence in `docs/deviations.md` §75**, which reads
  "`apps/web/lib/admin/readJourneysScreen.ts` reads that column for §2.2's 44px cover square
  and keeps it." The column is kept; what §75 does not say is that after §2.5 stopped
  writing it, nothing else started, so the square it feeds can no longer be filled from
  inside the admin at all.
- **Evidence:** `docs/qa/assets/2026-10-03-journeys/journeys-1440.png` — ten rows, ten empty
  squares. The three measurements above, taken in one pass: the computed style and
  `innerHTML` of every `.thumb` cell; `select count(*) from media where is_cover = true` → 0;
  `select count(*) from media where sizes_thumb_url is not null` → 143.
- **Not patched here.** `CLAUDE.md` §10 forbids patching from a sweep, and every candidate
  fix is new behaviour rather than a repair: a control that writes `isCover`, or re-pointing
  §2.2's square at `coverFrame`'s positional answer, which is the one §2.5 already uses.
  Carried as a residual with that choice stated.

### JOU-002 · S4 · Every control on the screen except the search box draws Chromium's default focus ring

- **Route:** `http://localhost:3000/admin/journeys`, 1440x900.
- **Steps:**
  1. Open `/admin/journeys` cold.
  2. Press `Tab` repeatedly and read `getComputedStyle(document.activeElement).outline` at
     each stop. (Pressed, not scripted with `.focus()` — a programmatic focus does not raise
     `:focus-visible`, so a `.focus()` reading would have measured the wrong thing.)
- **Expected:** `SCREENS.md` §2 gives one focus treatment for the panel:
  `outline: 2px solid rgba(163,68,52,.45); outline-offset: 1px`. It is stated in the
  **Inputs** paragraph, so what follows is consistency drift rather than a spec violation,
  and is filed at S4 on that basis.
- **Actual:** measured over 30 tab stops —

  | control                       | `outline`                           | `outline-offset` |
  | ----------------------------- | ----------------------------------- | ---------------- |
  | the search box                | `rgba(163, 68, 52, 0.45) solid 2px` | `1px`            |
  | the five status chips         | `rgb(16, 16, 16) auto 1px`          | `1px`            |
  | each row's Edit, Gallery      | `rgb(16, 16, 16) auto 1px`          | `1px`            |
  | each row's ⋯, and New journey | `rgb(16, 16, 16) auto 1px`          | `0px`            |

  So one control on the screen wears the handoff's ring and eleven per row do not. Nobody is
  blocked: Chromium's default ring is visible on this background and axe reports nothing.

- **Evidence:** the table above, read from the live DOM at each `Tab` stop.

## Checked and found sound

Recorded because each one looks wrong until it is measured, and a later reader should meet
the measurement rather than re-open the question.

- **The column rungs fire at the container's width, not the viewport's**, which is why the
  Dates column vanishes at a 1280px viewport while §2.2 says it appears "+1000px". Measured
  at 29 widths against the container's own `inline-size`: 1142 → 8 tracks; 982 → 7; 836 → 6;
  778 → 5; 716 → 4; 368 → 4. Every threshold lands exactly where `@container
td-journeys-table (min-width: 720|800|880|1000px)` puts it. The rail collapses below 860px,
  which is why 820px shows **more** columns than 880px does — the container gets wider when
  the rail goes. `journeys.module.css`'s own header carries the argument for container
  queries over media queries.
- **The create panel's `1.1fr 1fr 1fr` flips at a container width of 820**, measured one
  pixel at a time: container 823 → `266.5px 242.3px 242.3px`; container 818 → one column.
  The ratio holds (379.67 / 345.16 = 1.1 at 1440).
- **The refusal notice is not stale, and an earlier reading of this sweep said it was.** A
  first pass waited 900ms after pressing Create and read the refusal from the _previous_
  submission, which looked exactly like a one-render lag. Re-measured deterministically with
  five attempts and readings at 300ms, 1,000ms and 3,000ms: nothing at 300ms, and by 1,000ms
  the notice is **exactly the failing fields, every time** — `place` alone, `dates` alone,
  all three together, and then correctly replaced on each subsequent submission without a
  reload. The notice is a server round trip and takes between 300ms and 1s to arrive; there
  is no client-side validation and `docs/deviations.md` §104 says why.
- **The ⋯ strip carries its own row.** Opening row 0 then row 1 leaves both open, each
  strip showing its own journey name (Seville, Bergen), its own Duplicate / Archive /
  Move to trash, strip background `rgba(163, 68, 52, 0.05)` and top rule
  `rgba(120, 98, 60, 0.16) 0 1px 0 inset`, with "Move to trash" ringed at
  `1px solid rgba(163, 68, 52, 0.5)`. Closing row 1 and re-opening it three times leaves row
  0 untouched. §2.2 does not say the strips are exclusive, and they are not.
- **The search box and the chips compose.** `?q=tokyo` leaves every chip link carrying
  `q=tokyo`; `?filter=published` puts `filter=published` in the search form as a hidden
  field, so searching inside a chip lands on `?q=tokyo&filter=published` with the chip still
  `aria-current`. `?filter=draft&q=tokyo` → 0 rows; `?filter=published&q=tokyo` → 1.
- **Unrecognised input is absorbed rather than thrown.** `?filter=nonsense` and `?filter=`
  both answer 200 with all ten rows and the All chip current; `?q='">`, `?q=` + 600
  characters and `?q=` with only spaces all answer 200 — the first two with the empty state,
  the third with all ten rows. No error overlay, no 500, nothing in the console.
- **The row links resolve.** `Edit → /admin/journeys/285` answers 200 with the title
  "Journey editor"; `Gallery → /admin/galleries?journey=285` answers 200 with "Galleries".
- **The spec's pixel facts on the table.** Header fill `rgba(120, 98, 60, 0.07)`, 9.5px,
  letter-spacing 1.9px (= `.2em`), uppercase. Body rows `13px 20px` padding,
  `1px dotted rgba(120, 98, 60, 0.26)` bottom, hover `rgba(163, 68, 52, 0.043)`. Name 30px
  Caveat over place 15px EB Garamond italic. Six data cells carry
  `text-overflow: ellipsis; white-space: nowrap` — §2.2's "all truncating". The actions
  track is 128px rather than §2.2's `minmax(0,104px)`, which `journeys.module.css`'s header
  records as deliberate.
- **The create panel's chrome and copy.** Terracotta ring
  `rgba(163, 68, 52, 0.32) 0 0 0 1.5px`; the washi strip is a real `aria-hidden` element at
  `top: -12px; left: 40px; rotate(-2deg)`, not a pseudo-element — a first probe looked only
  at `::before`/`::after` and wrongly reported it missing. "A new journey" over the note,
  the three fields labelled Where / Country / Dates, Create journey + Cancel, and
  "Starts as a draft — no bookmark until you publish." character for character.
- **axe is clean** at 1440, 900 and 412, and clean again with a ⋯ strip open and the create
  panel open at the same time: **zero violations** in all four runs.
- **No horizontal scroll at any of the 29 widths**, 412 included.

## Clean

`/admin/journeys` at 1440, 1280, 1200, 1140, 1120, 1119, 1118, 1117, 1115, 1113, 1110, 1105,
1100, 1060, 1059, 1001, 1000, 999, 998, 997, 940, 939, 881, 880, 879, 859, 821, 820, 819,
801, 800, 799, 781, 780, 779, 721, 720, 719, 700, 600 and 412 — cold load, deep links with
every `filter` value and six `q` values, both chips-with-search directions, the ⋯ strip, the
create panel open and cancelled, and two refused submissions. Everything above beyond the two
defects behaved as `SCREENS.md` §2.2 describes.

## Not covered

- **Creating, duplicating, archiving and trashing a journey.** All four write to the
  database, and standing order §9 forbids a browser sweep leaving a value in the developer's
  own `diary`. They are driven instead by `e2e/admin.spec.ts` against the isolated
  `diary_test`, with the rows it makes deleted in `afterAll` by `where` rather than by id.
  This sweep drove only the refused half of Create, which writes nothing.
- **The Archive chip and the Unarchive label.** No journey in this database is archived, so
  the Archived chip was walked only in its empty state and the strip's second button was
  only ever seen reading "Archive". Reaching "Unarchive" needs a write.
- **The cover square with a cover in it.** JOU-001 is exactly that it cannot be reached from
  the admin; reaching it would mean writing `media.isCover` by hand, which would be putting
  a value in the dev database to photograph it.
- **A screen reader in browse mode.** No NVDA or JAWS on this machine and `CLAUDE.md` §7.1
  forbids routing it anywhere. UNRESOLVED, as in every other sweep on this branch.
- **The 1180 / 900 / 860 / 780 table rungs from the skill's Admin hotspot list.** Those are
  §2.3's editor rungs, not §2.2's; this screen's are 720 / 800 / 880 / 1000 and all four were
  walked from both sides.

---

## Correction, 2026-10-04 — the submission count in the header is wrong

The count appears in **three** places, not the two this correction first named: the line
above the Defects section ("two refused form submissions"), the database-safety paragraph
that rests on the same two ("The two form submissions below were both refused by Zod"), and
the `## Clean` section ("the create panel open and cancelled, and two refused submissions").
All three are wrong.

**It is seven.** The first driver pass made two — all three fields whitespace, then one blank
field. The withdrawal probe described under "Checked and found sound" made five more, in
three distinct field combinations, and the report's own words for it are "five attempts and
readings at 300ms, 1,000ms and 3,000ms". The sentence counted one pass and not the probe that
was run to re-measure it. (This correction's first draft labelled those five "T1 through T5"
and said they spanned "two page loads"; the report uses neither phrase, and it says the
notice was "correctly replaced on each subsequent submission **without a reload**".)

The sentence is named here rather than rewritten, which is how this repository corrects a
dated record: a sweep report is a walk on a day, and editing the walk loses the fact that the
count was taken wrong.

**The safety argument is unaffected and does not rest on the count.** Every one of the seven
was refused by Zod before any write, and the evidence is not the number of submissions but
the before/after dump: all ten `journeys` rows byte-identical across every column, and the
counts `journeys` 10 / `_journeys_v` 690 / `pages` 30 / `media` 143 unchanged.

**Which seven the dump covers, since the correction should not create a new vagueness while
closing one.** The dump was taken before the first driver pass and diffed after the last, and
the withdrawal probe ran inside that window — it was a sixth driver pass against the same
server and the same database, before the diff. So the dump evidences all seven, not two of
them. What later
moved that data was `npm run test:e2e`, not this sweep — `docs/deviations.md` §116.
