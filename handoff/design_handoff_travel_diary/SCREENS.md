# Screens — layout and component specification

Measurements are as authored. Diary pages are inside the **1300×860** design box (page area `14px 18px 14px 36px` inset), so those numbers are absolute — the whole box is scaled, never reflowed. Admin measurements are CSS pixels at the wide breakpoint.

---

# 1 · Public diary

## 1.1 Cover

Full-bleed cloth: `repeating-linear-gradient(45deg, rgba(255,255,255,.035) 0 2px, rgba(0,0,0,.03) 2px 4px)` over `linear-gradient(160deg, {cloth} 0%, rgba(0,0,0,.28) 130%)`, plus `inset 0 0 90px rgba(0,0,0,.35)`.

Two nested rules: `inset: 22px` at `1px solid rgba(232,210,161,.42)`, `inset: 29px` at `2.5px solid rgba(232,210,161,.22)`.

Centred column, 70px padding, `text-align: center`:

| Element | Spec |
|---|---|
| Eyebrow "Travel Diary" | Courier 12px, `.42em`, uppercase, `rgba(238,220,180,.72)` |
| Rule | 64×1px `rgba(232,210,161,.5)`, margin `16px 0 8px` |
| Title | Caveat 124px / .9, `#f6ecd6`, `text-shadow: 0 2px 0 rgba(0,0,0,.22)` |
| Subtitle | Garamond italic 22px, `rgba(240,225,192,.78)`, `max-width: 520px`, top margin 12px |
| Rule | as above, margin `22px 0 14px` |
| "Kept by {owner}" | Courier 12.5px, `.3em`, uppercase |
| Years | Courier 12.5px, `.3em`, `rgba(238,220,180,.5)`, top margin 8px |

Decorations (behind the `decorations` flag): washi strip 190×36px at `top: 52px; left: −26px`, `rotate(−7deg)`, tape gradient at 122° with torn `clip-path`. Airmail stamp at `bottom: 32px; right: 32px`, `rotate(4deg)`: 5px perforated mount (`radial-gradient(circle 3.6px at 50% 50%, #fbf6e9 92%, transparent 95%) 0 0/9px 9px`) around a 104×126px face with "POSTA AEREA", a 72×60px hatched block, and "VOL · I" in `#7a3b32`.

**Title must fit, not truncate.** Size it to the box: `fontSize = clamp(min, floor(0.9 × available / (titleLength × 0.4)), max)` — Caveat runs about 0.40em per character. An ellipsis is a last-resort floor only.

## 1.2 Contents

`grid-template-rows: auto 1fr auto`, padding `34px 46px 26px 52px`, gap 20px.

**Header** — flex, baseline, `1.5px solid rgba(90,70,40,.22)` bottom, 16px padding: eyebrow "Index" (Courier 11.5px `.28em`), "Contents" (Caveat 70px / .92 `#33403c`), and a right-aligned italic Garamond 18px note capped at 280px.

**Body** — column-flow grid:

```
gridAutoFlow: column
columns = ceil(entryCount / 11)
gridTemplateColumns: repeat(columns, 1fr)
gridTemplateRows: repeat(ceil(count / columns), 1fr)
columnGap: 34px
```

Each row: flex, centred, `1px dotted rgba(120,98,60,.28)` bottom, `cursor: pointer` — number (Courier 13px `.14em` `#a34434`, 30px wide), name (Caveat 36px single-column / 27px multi-column), meta (Garamond italic 17px, **hidden** in multi-column), a dotted leader (`flex: 1`, dotted bottom, `translateY(6px)`), page number (Courier 14px).

**Footer** — `1.5px` top rule, a Courier hint line, and "{n} pages so far" in Caveat 26px `#a34434` at `rotate(−3deg)`.

Verified: 31 entries render as 4 columns × 8 rows with zero overflow.

## 1.3 Notes page

`grid-template-rows: auto 1fr auto`, padding `32px 44px 24px 52px`, gap 18px.

**Header** — flex, `align-items: flex-end`, `1.5px` bottom rule, 14px padding:
- Left: dates (Courier 11.5px `.26em`), name (Caveat 66px / .94), place (Garamond italic 19px)
- Right: two 98px circles, `flex: none`
  - Weather — `1.5px solid rgba(163,68,52,.55)`, `rotate(−6deg)`, `background rgba(163,68,52,.05)`, `#a34434`: glyph then label (Courier 11px `.08em`, centred, `0 9px`)
  - Mood — `1.5px dashed rgba(72,92,88,.5)`, `rotate(5deg)`, `#455c58`: 13px rotated square then label

Glyphs: **sun** 16px circle `#a34434` · **haze** same at `opacity .45` · **wind** 20×4px bar with `box-shadow: 0 7px 0 -1px, 0 -7px 0 -1px`.

**Body** — `grid-template-columns: 1.06fr .94fr`, gap 36px.

*Left column* (flex column, gap 12px, `min-height: 0`):
1. "Highlights" eyebrow
2. Highlight list, `flex: 0 0 auto`, gap 13px — each a 9px rotated `#a34434` square (11px top margin) beside Caveat 30px / 1.24
3. 52×1.5px rule, then the note — Garamond 18.5px / 1.6 `#4a4232`, `text-wrap: pretty`
4. **Tally ticket**, `flex: 0 0 auto`, `#fffdf6`, padding `11px 14px 13px`, `rotate(−.5deg)` — four equal cells divided by `1px dotted`, each a Courier 10px `.14em` uppercase key over a Caveat 29px value
5. **Ephemera slot**, `flex: 1`, `min-height: 54px` — a taped scrap that absorbs whatever height remains, `rotate(.5deg)`, `box-shadow: 0 0 0 7px #fffdf6, 0 0 0 8px rgba(120,98,60,.16), 0 12px 24px -16px rgba(60,44,20,.5)`, washi strip at `top: −11px; left: 36%`

> **Why the ephemera slot exists.** Fixed content plus leftover height produced a dead band, and `justify-content: space-between` on the highlight list dumped 232px into two gaps when a journey had three highlights instead of four. The fix is a *media element* taking the elastic space — it can absorb 54px or 300px without breaking. Highlights are capped at 4 and sized to content.

*Right column* — hero photo, `padding-top: 12px`: mount `#fffdf6`, `padding 11px 11px 0`, `rotate(−1.1deg)`, photo `flex: 1; min-height: 80px; object-fit: cover`, caption Caveat 25px / 1.2 with `9px 4px 11px` padding, washi strip at `top: −15px; left: 24%` `rotate(−3deg)`. Postage stamp at `bottom: −6px; right: −12px`, `rotate(7deg)` — 76×92px face in `linear-gradient(170deg, {accent}, rgba(0,0,0,.25))` with country (Courier 7.5px `.16em`) and value (Courier 16px 700 white).

**Footer** — `1.5px` top rule, 13px padding: "See full gallery" button (`1.5px solid #a34434`, `rgba(163,68,52,.07)` fill, `9px 18px`, Courier 12px `.18em` uppercase, inverts on hover), the count in Garamond italic 17px, spacer, sign-off in Caveat 27px `#8a7a5f` at `rotate(−2deg)`.

## 1.4 Frames I

`grid-template-rows: auto 1fr`, padding `30px 44px 30px 52px`, gap 16px. Header: name (Caveat 40px), "Frames 01 – 03" (Courier 11px `.24em`), spacer, dates.

Grid `1.5fr 1fr` × `1fr 1fr`, gap `22px 24px`:
- **P1** column 1, spanning both rows — mount padding `12px 12px 0`, `rotate(−.7deg)`, caption 26px, washi at `top: −14px; right: 22px` `rotate(4deg)`
- **P2** column 2 row 1 — padding `10px 10px 0`, `rotate(1deg)`, caption 23px
- **P3** column 2 row 2 — `rotate(−1.4deg)`, caption 23px

## 1.5 Frames II

Same header pattern ("Frames 04 – 07", place on the right). Grid `1fr 1fr 1fr` × `1fr 1fr`, gap `20px 22px`:
- **P1** column 1, both rows, `rotate(.8deg)`, caption 24px
- **P2** column 2 row 1, `rotate(−1.2deg)`, caption 22px
- **P3** column 3 row 1, `rotate(1.5deg)`, washi at `top: −13px; left: 18px` `rotate(−5deg)`
- **P4** columns 2–3 row 2, `rotate(−.5deg)`, caption 23px

Footer: gallery button, count, and "Only a few frames live in the book".

## 1.6 About

`grid-template-columns: .78fr 1.22fr`, gap 44px, padding `36px 48px 32px 54px`.

Left: portrait mount `rotate(−1.6deg)` with washi at `top: −15px; left: −18px` `rotate(−9deg)`, caption 25px; then "Kit" eyebrow and three Garamond 17px lines.

Right: "Colophon" eyebrow, "About" (Caveat 70px / .94), 56×1.5px rule, two Garamond 19px / 1.64 paragraphs, spacer, then a top-ruled footer: "Write to me" eyebrow with the address in Caveat 32px `#a34434`, beside three mini stamps (56×68px faces, rotations −6°/+4°/−2°).

## 1.7 Chrome

**Bookmark rail** — 158px, `flex: none`, `padding-top: 4px`. "Bookmarks" eyebrow (Courier 9.5px `.22em` `#736247`), then a scrolling column, gap 6px. Each tab: `border-radius: 0 6px 6px 0`, padding `9px 10px 9px 0`, a 6px tint bar on the left (`opacity 1` active / `.5`), name Caveat 24px, sub Courier 8.5px `.14em` uppercase at `opacity .62`. Active: `#fbf6e9` fill, `translateX(−6px)`, `0 3px 12px -5px rgba(60,44,20,.5)` plus a `1px` inset ring; inactive `rgba(120,98,60,.07)`. Transition `transform 180ms, background 180ms`.

Journey tabs span 3 pages, so a tab is active when `index ∈ [start, start+3)`. Cover, Contents and About span 1.

**Bottom bar** — 58px, centred, gap 20px: 44px circular prev/next (`1.5px solid #4a4232`, disabled at `rgba(120,98,60,.25)`), and a 210px-min column with the counter (Courier 13px `.28em`) over the page label (Garamond italic 14px).

**Ribbon** — 22px wide, 33% of page height, `top: −7px; left: 42px`, `pointer-events: none`, `clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 82%, 0 100%)`, `drop-shadow(0 6px 8px rgba(40,20,12,.35))`.

## 1.8 Gallery

Header (`1px solid #ece4d4` bottom, padding `26px 34px 16px`): back button, "Full gallery" eyebrow, title (Caveat 52px) with date range beside it, frame count in Courier 12px `.2em` `#a34434`.

Grid: `repeat(auto-fill, minmax({thumbSize}px, 1fr))`, gap `18px 16px`, padding `24px 34px 48px`, `thumbSize` 140–300 (default 200). Tiles are `aspect-ratio: 1/1`, `object-fit: cover`, `1px` inset ring, `loading="lazy"`, index badge top-left (Courier 9px on `rgba(255,253,246,.82)`), caption below truncated to one line. Clips add a 46px circular play badge (`rgba(26,22,17,.58)` with a CSS triangle) and a duration chip bottom-right.

Verified with 61 tiles; must stay square and unsqueezed at 40+.

## 1.9 Lightbox

`rgba(26,22,17,.95)` full screen, `z-index: 1000`, `grid-template-rows: auto 1fr auto`.

Top bar: counter (`003 / 061`), spacer, Download (an `<a download>` — must serve a derivative, never a bucket URL), Share (Web Share API, clipboard fallback, toast confirmation), 36px close.

Middle: 52px circular prev/next either side, image `object-fit: contain` with `max-width/height: 100%` and `0 24px 60px -20px rgba(0,0,0,.7)`.

Clip transport (clips only): 44px play/pause (two 4×15px bars, or a 13px triangle), a 3px scrub track with a `#c9b48a` fill, elapsed/total in Courier 11.5px.

Bottom: caption in Caveat 28px `#f6ecd6`, then metadata in Courier 10px `.24em` uppercase at 45% — "{Journey} · {Place} · frame 007".

## 1.10 Mobile reading mode (< 860px)

No book, no flip, no scaling.

**Header** — `#3b332a`, padding `14px 16px 12px`: 44px burger (three 17×2px bars), title block (Courier 9px `.26em` eyebrow over Caveat 26px name, truncated), counter.

**Content** — scrolling, padding `20px 18px 30px`, with `touchstart`/`touchend` for swipe. One generic page renderer handles all four kinds:

- **Cover** — cloth block, `min-height: 58vh`, padding `46px 26px`, fitted title, then a full-width "Start reading" button and a swipe hint
- **Contents** — eyebrow, "Contents" 52px, note, then rows: number, name (Caveat 30px) over meta, page number
- **Journey** — dates, name (Caveat 50px), place; two badge bars (weather / mood, `flex: 1` each, `11px 13px`); on notes pages a rule then highlights (Caveat 27px), note (18px / 1.62), and a two-column tally card; then a rule and the photos — mounts with `aspect-ratio: 4/3` photos and Caveat 24px captions, 18px apart; then a full-width gallery button and the count
- **About** — eyebrow, "About" 52px, portrait mount, two paragraphs, "Write to me", address in Caveat 30px

**Bottom bar** — `#fbf6e9`, `1px` top rule, padding `10px 14px`: 52px prev/next either side of a truncated page label.

**Drawer** — `rgba(26,22,17,.5)` scrim (`z-index: 800`) and an 82%-wide panel capped at 320px (`z-index: 810`) on `#3b332a`: header with "Bookmarks" and a 34px close, then the tab list at 26px Caveat with 13px rows.

**Swipe:** commit only when `|dx| ≥ 60` **and** `|dx| ≥ 1.4 × |dy|`, so vertical scrolling never turns a page.

---

# 2 · Admin

Shell: 238px dark rail + `flex: 1` main; main is a 96px header over a scrolling content area (`padding: 24px 30px 44px`, `overflow-x: hidden`).

**Rail** — `linear-gradient(180deg, #3b332a, #2c251e)`, padding `20px 0 16px 18px`. Masthead: site name (Courier 9.5px `.3em`) over "The back room" (Caveat 38px `#f6ecd6`). Nav buttons: `border-radius: 0 5px 5px 0`, padding `9px 12px 9px 0`, gap 6px — a 5px section-coloured bar, label (Caveat 23px), sub-label (Courier 10px `.13em` uppercase, `rgba(243,231,205,.72)`), and a count. Active: `#fbf6e9` fill, `translateX(−4px)`, `0 3px 12px -5px rgba(0,0,0,.5)`, ink `#2f3b38`. Footer: a profile button (34px circular avatar, name, "Your account", chevron; terracotta ring when active) over "Last published …" and a Sign out link.

Section colours: Overview/Publish `#a34434` · Journeys/Editor `#3d817e` · Media/Galleries `#a06b3e` · Book/Cover `#5a72a8` · Settings `#a15a4e` · Trash `#736247`.

**Header** — flex, wrap, `1px solid rgba(120,98,60,.22)` bottom, padding `20px 30px 15px`. Title block has `flex: 1 1 230px; min-width: 230px` so the **controls** wrap, not the title: crumb (Courier 10px `.26em`) over the screen title (Caveat 48px). Right: a "Saved just now" chip (`rgba(47,107,104,.08)`, `#2f6b68`, hidden below 1040px), an "n unpublished" chip (`rgba(163,68,52,.09)` with a 7px rotated square, hidden below 900px), Preview draft (hidden below 780px), Publish.

Cards: `#fffdf6`, `border-radius: 3px`, padding `18px 20px 20px` to `20px 22px 22px`, admin-card shadow. Section heads: Caveat 32px over an `18px`-deep `1px solid rgba(120,98,60,.22)` rule, often with an italic Garamond 15.5px aside.

Buttons: `2px` radius, Courier 10–11.5px `.16em`–`.2em` uppercase. Primary `#a34434` fill / `#fdf8ec`; secondary `1.5px solid #4a4232`, transparent, inverting on hover; tertiary borderless `#736247` → `#a34434`.

Inputs: `#fffdf6`, no border, `inset 0 0 0 1px rgba(120,98,60,.3)`, padding `10px 12px`, `2px` radius; or borderless with a `1px solid rgba(120,98,60,.3)` bottom for inline fields. Focus `outline: 2px solid rgba(163,68,52,.45); outline-offset: 1px`. Handwritten fields use Caveat 19–30px; data fields Courier 12–14px; prose Garamond 15–17px.

Toggles: 34×19px track (`#a34434` on / `rgba(120,98,60,.22)` off) with a 14px knob at `left: 2.5px` / `17px`, `transition: 160ms`. Checkboxes: 19–21px square, `2px` radius, filled `#a34434` with a `#fdf8ec` tick.

## 2.1 Overview

Stat grid: `repeat(4, minmax(0,1fr))` above 820px, else `repeat(2, …)`, gap 16px. Card: label (Courier 10px `.22em`), value (Caveat 52px), note (Garamond italic 15px), and a 3px full-height coloured tick at the left edge.

Main split `1.35fr minmax(0,1fr)`, gap 20px:

**Waiting to go out** — washi strip at `top: −12px; left: 34px`; header with "Review all"; rows (`13px 0`, dotted separator): a 64px fixed-width kind chip (Courier 9px `.16em`, colour-coded by tone with a 55%-alpha ring), the change text (Garamond 17px) over its location (Courier 10px), a timestamp, and Revert.

**The book, live** — a 78×104px cloth chip carrying the fitted title and years, beside a summary line, publish date, and Open live / Copy link.

**Needs a look** — terracotta eyebrow, then prompts: an 8px rotated square, the text (Garamond 16.5px / 1.35), and an action link. **These must deep-link to the exact screen *and* selection** — "Pick posters" resolves the first clip with no poster and selects it by id; "Caption them" opens the bulk panel already expanded.

**Lately** — two columns (`0 40px` gap), rows of a 82px timestamp and a description.

## 2.2 Journeys

Controls: search (`flex: 1`, min 220px), status chips (All / Published / Edited / Draft / Archived), New journey.

Create panel (when open): terracotta `1.5px` ring, washi strip, "A new journey" over a note, three fields (where / country / dates) in `1.1fr 1fr 1fr` above 820px, Create + Cancel, and "Starts as a draft — no bookmark until you publish."

Table in one card. Columns drop by priority as width falls:

```
base   : 48px | minmax(0,1.7fr) | 96px (status) | minmax(0,104px) (actions)
+720px : pages 52px
+800px : edited minmax(0,94px)
+880px : media minmax(0,1fr)
+1000px: dates minmax(0,1.15fr)
```

Header row: `rgba(120,98,60,.07)` fill, Courier 9.5px `.2em` uppercase. Body rows: `13px 20px` padding, `1px dotted rgba(120,98,60,.26)` bottom, `rgba(163,68,52,.045)` on hover — 44px cover thumb (`rotate(−1.5deg)`), name (Caveat 30px) over place (Garamond italic 15px), monospace data cells (all truncating), status pill, then Edit / Gallery / ⋯.

⋯ expands a strip beneath the row: `rgba(163,68,52,.05)`, `inset 0 1px 0` top rule, the journey name, spacer, Duplicate, Archive/Unarchive, and a ringed "Move to trash".

## 2.3 Journey editor

`184px | minmax(0,1fr) | 250px` above 1180px · `168px | minmax(0,1fr)` above 860px with the pool spanning `1 / -1` · single column below.

**Page rail** — "Pages in {journey}" eyebrow, then cards: 30×38px paper preview, name (Caveat 24px), meta (Courier 9px). Selected gets `#fffdf6`, a `1.5px` terracotta inset ring and a lift shadow; others `rgba(255,253,246,.5)` with a `1px` ring. The **selected card reveals a tool row** beneath it (`5px 7px 0`): ↑ ↓ · spacer · Copy · Delete, all Courier 9px `.1em`.

Below: a dashed `1.5px` box — "Layout" eyebrow with the active layout name in `#a34434`, a 2×2 grid of four glyph buttons, then "+ Add page with this layout".

Each glyph is a 30px-tall CSS grid of **real cells**, distinct per layout (an empty grid renders four identical rectangles):

| Layout | Grid | Cells |
|---|---|---|
| Three up | `1.45fr 1fr` × `1fr 1fr` | tall spanning rows 1–3, then two |
| Four up | `1fr 1fr` × `1fr 1fr` | four equal |
| Full bleed | `1fr` × `1fr` | one |
| Text spread | `1fr 1fr` × `1fr 1fr 1fr` | three 3px rules beside one block |

Cells `rgba(120,98,60,.34)`, `rgba(163,68,52,.5)` when selected.

**Editing pane** — header: "Editing" eyebrow over the page name (Caveat 40px), Preview page, Save draft.

*Notes page:* field grid `minmax(0,1fr) minmax(0,1fr) minmax(0,132px) minmax(0,132px)` above 900px — Location (Caveat 26px), Dates, Weather, Mood (Courier 12–13px). Then `1.15fr minmax(0,.85fr)` above 1020px:

- Left: "Highlights" with "four maximum — they set the page rhythm"; rows of a `::` grip (Courier 12px `#736247`, `cursor: grab`), a Caveat 25px underlined input, and a `×`; then "Add highlight" (dashed). "The note" textarea (4 rows, Garamond 17px / 1.55). "Tally" as a 2-column grid of key/value pairs (Garamond 16px / Caveat 24px right-aligned). Then a rule and **Page furniture** — "the marks that make it look kept, not typed":
  - **Sign-off** — full-width Caveat 25px `#736247`
  - **Weather glyph** — three 74px cards, `flex: 1`, each drawing its actual mark over a Courier 8.5px label; selected gets `rgba(163,68,52,.07)` and a `1.5px` terracotta ring
  - **Postage stamp** — a live 52×64px face in the journey accent beside stacked country and value inputs
  - **Accent** — five 38px swatches, `linear-gradient(160deg, {c}, rgba(0,0,0,.22))`, `0 0 0 2.5px #a34434` when selected
  - **Gallery address** — a `/gallery/` prefix beside a Courier 12px slug input
- Right: two slots (hero 186px, ephemera 124px) — label, motion badge ("Loops" terracotta / "Still" muted), the image with `cursor: crosshair`, Replace / Clear, a focal-point pill, then caption (Caveat 23px) and alt text (Garamond 14.5px)

*Frames page:* `repeat(auto-fit, minmax(196px, 1fr))`, gap 18px — four slots at 152px with the same label, badge, focal image, caption, alt, Replace and focal pill.

**Focal point:** click anywhere on a slot →

```
x = clamp(0, ((clientX − rect.left) / rect.width) × 100, 100)
y = clamp(0, ((clientY − rect.top) / rect.height) × 100, 100)
```

stored as `"x y"`, applied as `background-position: x% y%`, drawn as a 26px reticle centred on the point: `0 0 0 1.5px #fdf8ec, 0 0 0 3px rgba(163,68,52,.85), 0 1px 4px rgba(0,0,0,.4)`. Pill reads "centred — click to focus" (muted) or "focus 25% 30%" (`#2f6b68`). **Keyed per journey *and* per page** — Tokyo/Frames I must not share Tokyo/Frames II.

**Journey pool** — "Journey pool" eyebrow with "{n} of {total} in the book" in `#a34434`, the instruction line, then a 2-column tile grid capped at `max-height: 432px` and scrolling: `aspect-ratio: 1/1` thumbs, `0 0 0 2px #a34434` when ticked else a `1px` ring, a 17px tick box top-left, duration chip on clips. Footer: a dashed "Drop files or browse".

## 2.4 Media

**Dropzone** — `2px dashed rgba(120,98,60,.4)`, `4px` radius, padding `26px 24px`, flex with wrap: a 70px ringed circle holding a 20px rotated square, then a text block with `flex: 1 1 300px; min-width: 300px` (Caveat 34px headline over an italic note naming accepted formats and stating clips loop automatically), then an "Add to — {journey}" select bound to all journeys, then Browse.

> The `min-width` floor is required. Without it the text block absorbs all shrink, the headline wraps to two lines and the zone grows to 300px tall.

**Upload card** — "Uploading — 2 of 34" with a duplicate notice on the right (`rgba(132,88,37,.1)`, `#845825`, "3 look like duplicates — skipped"); rows of a 230px filename, a 3px track with a terracotta fill, and a right-aligned percentage.

**Controls** — filename search (`flex: 1 1 200px`), filter chips (Everything / Stills / Clips / In the book / Unused), and a bulk bar that appears only with a selection: `rgba(163,68,52,.08)` with a ring, "{n} selected", then Add to book / Caption / Move / Clear.

**Grid** — `repeat(auto-fill, minmax(calc(1120/columns)px, 1fr))`, gap 14px, `columns` 3–8 (default 6). Tiles: square, `0 0 0 2.5px #a34434` selected else a `1px` ring, a 19px tick box, an "In book" chip bottom-left, a duration chip bottom-right, filename beneath in Courier 9.5px.

## 2.5 Galleries

`minmax(0,1fr) 286px` above 1180px · `minmax(0,1fr) 258px` above 860px · stacked below.

Controls: a journey select bound to `journey` with "{name} — {n} frames" labels; "Drag to reorder. The first frame is the gallery cover."; spacer; **Sort by date** (toggles, reads "By date ✓" and turns terracotta when active); **Caption all** (toggles the bulk panel).

Bulk panel: terracotta `1.5px` ring, "Caption what is still blank" with "{n} frames have no caption", then rows (38px thumb, 112px filename, a Caveat 21px input placeholder-hinted with a suggestion) capped at 250px and scrolling, then "Apply captions" and "Anything left empty keeps its file name for now."

Tile grid in a card: `repeat(auto-fill, minmax(136px, 1fr))`, gap 12px, `cursor: grab`. Tiles carry an index badge, a three-bar grip top-right, a "Cover" chip on the first, and a `rgba(44,37,30,.5)` scrim plus a solid "Hidden" chip bottom-left when hidden. Selected: `0 0 0 2.5px #a34434`.

**Selected frame panel** — "Selected frame" eyebrow, a 150px preview, the file line (stills "…jpg · 4032 × 3024 · 6.1 MB", clips "…mp4 · 1920 × 1080 · loops silently"), Caption (Caveat 25px), Alt text (2-row textarea), three toggles (Hidden from the gallery / Use as gallery cover / Also place in the book), and for clips a **Poster frame** block: eyebrow with a state chip ("first frame" amber / "set at 0:11" green), an explanatory line, and a `repeat(4, minmax(0,1fr))` filmstrip of timestamped grabs. Footer: "Save frame".

**Select frames by id, not index** — sorting reorders the grid and a positional index desyncs the panel from the highlight.

## 2.6 Book & bookmarks

`minmax(0,1fr) 340px` above 1180px, stacked below.

**Bookmark order** — "this is also the order of the book". Rows (`10px 0`, dotted): a `::` grip, a 9px rotated tint square, the name (Caveat 26px), the place (Garamond italic 15px), "p. {n}" right-aligned in a 66px cell, then 26px ↑ ↓ buttons (hover → terracotta). Cover, Contents and About are fixed and refuse to move.

**Book settings** — Contents page note (2-row textarea, this is the line the diary prints); Journey order (As arranged / Newest first / Oldest first chips); Cover cloth (four 44px swatches, `0 0 0 2.5px #a34434` selected); Page turn (range 400–1600 step 50, labelled brisk / "{n} ms" / languid); Gallery thumbnail (140–300 step 10, dense / "{n} px" / generous); then toggles for tape/stamps/stickers, ribbon bookmark, page counter.

Both sliders are controlled and their readouts follow the value.

## 2.7 Cover & About

Two equal columns above 1180px.

**Cover** — a 172×224px live preview (cloth gradient, `inset: 9px` rule, eyebrow, fitted title, subtitle, "Kept by") beside four fields: Title (Caveat 30px), Subtitle, Kept by, Years shown (Courier 13px). Below, four cloth swatches.

**About** — a 140px portrait with Replace, beside two paragraph textareas, a Kit list of grip + input rows, and a reply-to address in Caveat 26px `#a34434`.

## 2.8 Publish

`minmax(0,1fr) 360px` above 1180px.

**Headline card** — washi at `top: −12px; right: 44px` `rotate(3deg)`; "{n} changes waiting" (Caveat 40px) with `flex: 1 1 280px; min-width: 280px`, the line "Nothing below is visible to readers until you publish.", then Preview draft and the primary button reading **"Publish all 4"** or **"Publish 2 of 4"**, going inert (muted ring, `#8f836d`) when nothing is ticked.

**Changes card** — header with "tick what goes out"; rows of a 21px checkbox, the kind chip, the text (struck through and `#8f836d` when excluded) over "{location} · {when}", and Revert.

**Editions card** — rows of a 9px rotated mark (filled `#a34434` for the live edition, else a ring), the timestamp (Courier 10.5px), the description (Garamond 16.5px / 1.35), and View / Restore.

## 2.9 Settings

Two equal columns; left stacks two cards.

**The site** — Site name, Address, Description, Reply-to, each with an italic hint beneath.

**Your material** — an explanatory paragraph, Export everything / Import a backup, then **Space used**: "41.2 GB of 100 GB", a 7px segmented bar (photos `#2f6b68` 29%, clips `#845825` 12.2%, remainder the track), a legend of three rotated-square swatches, and the last backup date.

**Readers** — five toggles: allow downloads, share buttons, let search engines index galleries, password the whole book, keep the page-turn on touch. Then a "Careful now" block: eyebrow, explanation, and a ringed "Take the book offline".

## 2.10 Trash

One card, max 1000px. Header: "Kept for thirty days" with "nothing here is gone until you say so" and a count. Empty state: centred Caveat 34px "Nothing thrown away" over an italic line. Rows: 46px thumb, name (Caveat 27px) over "{place} · 3 pages · {n} photographs", "goes for good in 30 days", then Put back (dark ring) and Delete for good (terracotta ring).

## 2.11 Account

Two equal columns; four cards.

**Who is keeping this** — a 132px avatar with Replace, beside Name on the cover (Caveat 26px), Sign-off used on pages (Caveat 24px `#736247`), and a Time zone select whose options state how dates are written.

**Tell me when** — two toggles (a note when a publish finishes, weekly reader summary).

**Getting in** — sign-in email; Current / New password in two columns above 900px; **"One-time code at sign-in"** toggle whose hint switches between "six digits sent to the email above, then five minutes to use them" and "off — your password alone signs you in"; then Save changes. **This toggle is the authoritative OTP setting** — see `SECURITY.md`.

**Where you are signed in** — rows of a 9px mark (filled for the current session), device over "{place} · {when}", and Current / Revoke; then Sign out everywhere and Sign out.

---

# 3 · Sign-in

Centred on the desk background, `padding: 24px`, page scrolls if short.

**Shell** — grid, `4px` radius, `overflow: hidden`, `0 34px 70px -34px rgba(48,38,24,.55)` plus a `1px` ring. Wide: `minmax(0,1fr) minmax(0,1fr)`, max 1020px, `min-height: 592px`. Narrow (< 820px): single `minmax(0,1fr)`, max 470px, `min-height: 0`.

**Cloth panel** (wide only, `display: none` below the breakpoint) — the cover treatment plus a 26px spine strip with two dashed stitch lines, `inset 26px 26px 26px 50px` and `inset 33px 33px 33px 57px` rules, a centred column (eyebrow, rule, fitted title, subtitle, rule, "The back room"), a ribbon at `top: −6px; right: 64px`, and a "PRIVATE / 01" stamp at `bottom: 34px; right: 32px`.

**Narrow masthead** (below the breakpoint) — the cloth gradient, `22px 20px 20px`, centred: eyebrow, fitted title (28–44px), "The back room".

**Form panel** — `#fffdf6`, vertically centred. Pane padding `40px 42px 38px` wide, `26px 20px 24px` narrow. *The narrow padding is required* — at `40px 42px` in a 342px shell the OTP cells collapse to 7px.

Fields: `#fffdf6`, `inset 0 0 0 1px rgba(120,98,60,.32)`, padding `11px 13px`, Garamond 17px. Primary button full width, `13px` padding, Courier 11.5px `.2em`.

**1 · Password** — "Sign in" eyebrow, "Welcome back" (Caveat 52px), "The diary itself is open to everyone. This door is only for editing it."; a rule; Email; Password with a right-inset Show/Hide; an error box when needed (`rgba(152,57,43,.07)` with a ring, an 8px rotated `#98392b` square, Garamond 15.5px `#8c3327`); a remember-me checkbox; the submit button; then a rule and a footer line with a 9px mark stating whether the code step is on.

**2 · One-time code** — "← Back to password"; "Second step" eyebrow; "Check your email" (Caveat 50px); "A six-digit code went to {masked}. It expires in {m:ss}." with the address in upright ink; a rule; "The code" eyebrow; six cells (`flex`, gap 9px, each `flex: 1`, centred Courier 25px, `13px 0` padding, a `1.5px` terracotta ring when filled else `1px` muted); error box; "Verify and sign in"; then a resend button ("Send a new code" / "Send again in {n}s", inert during cooldown) opposite an attempts counter.

Cell behaviour: typing advances, Backspace on an empty cell retreats, arrows move, Enter verifies, focus selects. **Paste needs its own `onPaste` handler** — `maxLength="1"` truncates a pasted string to one character before `change` fires, so a multi-digit paste never reaches the spread logic. Handle it by preventing default, stripping non-digits, and filling from cell 1 for a full-length code (or from the focused cell for a fragment).

Wrong code: clear the cells, refocus cell 1, decrement attempts, and shake the shell — `omShake` 420ms ease, translating −6/+5/−3/+2px at 20/40/60/80%.

**3 · Reset** (two states) — *pending:* "Send yourself a way back in", an email field, "Send the link", and "The link works once and lasts an hour." *Sent:* a green confirmation block (`rgba(47,107,104,.07)`, a 14px rotated mark, the masked address), "Sign in with the new password", and "Send it again".

**4 · Signed in** — a 62px ringed circle holding a 20px `#2f6b68` square, "Signed in" eyebrow, "The back room is open" (Caveat 50px), a status line, then "Open the admin panel" (primary) and "View the diary instead" (secondary), and a borderless "Sign out and start again".

Masking: keep the first two characters, replace the rest of the local part with bullets, keep the domain — `he•••@wanderings.travel`.
