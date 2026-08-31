# Handoff: Travel Diary — public site, admin panel, sign-in

## Overview

A personal travel blog styled as a physical custom diary. The public site is a book you turn page by page with a realistic 3D page-flip; each journey occupies three pages (notes, then two spreads of photo frames) plus global Cover, Contents and About pages. Every journey has a separate photo gallery outside the flip sequence, reachable by a "See full gallery" button, holding up to ~100 assets. A bespoke admin panel edits all of it, and a sign-in screen with an optional one-time-code step guards the admin.

Scale: designed for ~15 pages initially, verified at 30 journeys / 93 pages / 33 bookmarks, currently seeded with 10 journeys / 33 pages.

## About the design files

The three files in this bundle are **design references created in HTML** — prototypes that show intended look and behaviour. They are **not production code to copy**. They are written for an internal component runtime (`<x-dc>` templates with a `renderVals()` logic class) that will not exist in your codebase.

Your task is to **recreate these designs in the target environment** using its established patterns and libraries. If no codebase exists yet, see *Recommended stack* below.

Read them as specifications: the markup shows structure and exact styling, the logic class shows state shape and behaviour. Do not port the `<sc-for>` / `<sc-if>` / `{{ }}` template syntax.

## Fidelity

**High-fidelity.** Final colours, typography, spacing, layout and interactions. Recreate the UI to match. All photographic content is placeholder — striped SVG data-URIs labelled with their slot (`TOKYO A1`, `BERGEN HERO`, `MARRAKEC_005.mp4`). Real photographs are supplied later; the captions and layouts around them are final.

Copy is final and deliberate. The voice is dry, first-person, understated — "nineteen tarts, no regrets", "the map was wrong by evening". Do not replace it with lorem ipsum or make it more enthusiastic.

---

## Recommended stack

No codebase exists yet. Recommended:

- **Payload CMS 3 running inside a Next.js app, on Postgres.** Chosen because four expensive features come free rather than being written: draft/published states, version history with restore, focal point on uploads, and image-size generation. All four have dedicated screens in this design.
- **Frontend:** Next.js. Statically render the content bundle; run the page stack client-side. The page-flip is pure CSS 3D transforms — no animation library.
- **Media:** S3 or Cloudflare R2 for originals, with a transform layer (Cloudflare Images or imgproxy) for derivatives. ~40GB expected.
- **Video:** ffmpeg on upload — H.264 MP4 at modest bitrate plus poster extraction at the author's chosen timestamp. These are silent ~20-second loops; do not use a streaming service.
- **Auth:** Auth.js with credentials + email OTP via a transactional mail provider.

Alternative if you'd rather not live inside a framework: **Supabase** (Postgres, auth, storage, image transforms) and hand-roll drafts/versions as a `status` column plus a `revisions` table.

Avoid: a separate Express/Nest service (doubles the deployment for a single-author site), Firebase (the content is relational — the Contents page and bookmark ordering want joins), and a client-only SPA (destroys the deep links' SEO value).

See `DATA_MODEL.md` for collections and `SECURITY.md` for the required hardening. **Read `SECURITY.md` before implementing the sign-in — three things in the prototype are deliberately insecure.**

---

## Design tokens

### Colour

| Token | Value | Use |
|---|---|---|
| `paper` | `#fbf6e9` → `#f7f0df` (180deg) | diary page face |
| `paper-mount` | `#fffdf6` | photo mounts, admin cards |
| `paper-back` | `#f8f1e0` → `#f1e8d3` → `#e6dbc2` (270deg) | reverse of a turning leaf |
| `desk` | radial `#f8f2e2` + `#f4eddc` → `#efe7d3` | admin background |
| `outer` | `#ffffff` | diary background outside the book |
| `board` | `#40382e` → `#332c24 55%` → `#2b241d` | book cover boards |
| `spine` | `#241e18` → `#3b332a 48%` → `#2a231c` (90deg) | spine strip |
| `sidebar` | `#3b332a` → `#2c251e` | admin nav rail |
| `ink` | `#33403c` | headings |
| `ink-body` | `#4a4232` | body copy |
| `ink-muted` | `#736247` | labels, meta, drag handles (**opaque — never an alpha of `rgba(120,98,60,…)`; those measure below 4.5:1**) |
| `ink-diary-muted` | `#7a6b50` / `#6f6247` | diary-page meta and italics |
| `accent` | `#a34434` | primary actions, marks, links |
| `accent-hover` | `#8c3327` | |
| `cream` | `#f6ecd6` | text on dark |
| `cream-alt` | `#fdf8ec` | text on accent fills |
| `cream-dim` | `rgba(243,231,205,.72)` | secondary text on sidebar (**6.5:1 — do not lower**) |
| `ribbon` | `#8c2f28` → `#b6483c 45%` → `#8c2f28` | ribbon bookmark |

**Cover cloth options:** `#2f4a47` (default), `#7a3b32`, `#3d4257`, `#5c4a2b`.

**Journey accent tints** (bookmark tab + postage stamp): `#3d817e`, `#a06b3e`, `#5a72a8`, `#a15a4e`, `#736247`. Assigned per journey, editable.

**Status:** Published `#2f6b68`, Edited `#845825`, Draft `#6b5d46`. Rendered as a pill: `1px` inset ring at 55% alpha of the colour, `4px 9px` padding, `2px` radius.

**Hairlines:** `rgba(120,98,60,.14)`–`.34` solid for borders and inset rings; `rgba(120,98,60,.26)`–`.3` dotted for list separators; `1px dashed rgba(226,201,150,.28)` for spine stitching.

### Shadow

```
book        0 28px 64px -26px rgba(48,38,24,.55), inset 0 0 0 1px rgba(255,255,255,.06)
page face   inset 26px 0 30px -26px rgba(70,52,24,.42), inset -1px 0 0 rgba(120,98,60,.14),
            0 10px 26px -18px rgba(60,44,20,.5)
photo mount 0 14px 30px -16px rgba(60,44,20,.55), 0 0 0 1px rgba(120,98,60,.12)
admin card  0 0 0 1px rgba(120,98,60,.16), 0 12px 26px -22px rgba(60,44,20,.55)
flip shade  linear-gradient(270deg, rgba(44,32,16,.42), rgba(44,32,16,.14) 26%, transparent 62%)
```

### Type

Three families, from Google Fonts:

- **Caveat** 400–700 — headings, photo captions, handwritten highlights, tally values, sign-off
- **EB Garamond** 400/500/600 + italic — body copy, meta lines, descriptions
- **Courier Prime** 400/700 — eyebrows, counters, dates, file names, all-caps labels

Courier Prime labels always carry `letter-spacing: .14em`–`.42em` and `text-transform: uppercase`, at 8.5–13px.

Diary page scale (inside the 1300×860 box): cover title 124px, journey name 66px, Contents 70px, section heads 40px, highlights 30px, photo captions 23–26px, note 18.5px/1.64, tally values 29px, eyebrows 10–11.5px.

Admin scale: screen title 48px Caveat, card heading 32px Caveat, journey name in rows 30px Caveat, body 16–17px Garamond, labels 9–10.5px Courier.

**Minimum sizes:** no admin label below 9px; no diary body text below 15px; mobile hit targets ≥44px (nav buttons are 52px).

### Geometry

- Radius: `2px` (inputs, buttons, pills), `3px` (cards), `2px 9px 9px 2px` (page face), `7px 16px 16px 7px` (book board)
- Admin card padding: `18px 20px 20px` to `20px 22px 22px`
- Grid gaps: `20px` between admin cards, `14px` within a card, `12px` in tile grids
- All layout uses flex/grid with `gap`. Every `fr` track is `minmax(0, …)` — see *Responsive* for why.

---

## The book — geometry and flip

The single most important implementation detail.

**Fixed design box.** The book is authored at exactly **1300×860 px** and scaled to fit its container:

```js
scale = Math.min(areaWidth / 1300, areaHeight / 860)
```

applied as `transform: scale(k)` with `transform-origin: center`, on an element with explicit `width: 1300px; height: 860px`. Measured on mount, on `resize`, via `ResizeObserver` on body, and after returning from a gallery. This makes every page resolution-independent — proportions hold at any window size, like a printed page.

**Consequence at 4K:** the book scales up (~2.4× at 3840 CSS px) but the bookmark rail and bottom nav sit *outside* the transform at fixed sizes, so they look undersized next to a very large book. Consider capping the scale at ~1.7× and centring, or scaling the chrome with it. Also emit a 2× image derivative tier — a 1200px photo at 2900px is visibly soft.

**Frame.** Inside the design box: dark board (full bleed), 36px spine strip on the left with two dashed stitch lines at x=9 and x=27, an 11px fore-edge page-stack strip on the right (`repeating-linear-gradient(90deg, #f2ebda 0 2px, #d9cdb4 2px 3px)`), and the page area inset `14px 18px 14px 36px`.

**Page stack.** Every page is absolutely positioned in a container with `perspective: 2800px; perspective-origin: 35% 50%`. Each leaf:

- `transform-origin: left center`, `transform: rotateY(Ndeg)`, `transform-style: preserve-3d`
- Turned pages sit at `-180deg`, untouched pages at `0deg`
- `z-index`: turned pages `i + 1` (ascending), untouched `1000 - i` (descending), the actively turning leaf `2000`
- `visibility: hidden` on any page that is not current, turning, or being revealed — prevents stranded mirrored content
- `pointer-events: auto` only on the current page when not mid-flip

**Do not use `backface-visibility`.** It was tried and produced blank pages. Instead each leaf has a front face and a back face, and their `opacity` swaps at the animation midpoint:

```
forward  : front 1→0, back 0→1  at t = duration/2
backward : front 0→1, back 1→0  at t = duration/2
```

**Flip sequence**, driven by explicit timers with a `_busy` latch that always releases:

| t | action |
|---|---|
| 0 | set `flip = {dir, from, to, go: false, half: false}` |
| 30ms | `go = true` — CSS transition begins |
| 30 + duration/2 | `half = true` — faces swap |
| 30 + duration + 40 | commit `index = to`, clear `flip`, release latch, write URL |

Transition: `transform {duration}ms cubic-bezier(.55, .06, .28, 1)`, and `opacity {duration}ms ease-in-out` on the travelling shade. Duration default **900ms**, range 400–1600.

A travelling shade (see *Shadow*) fades in over the turning leaf, giving the paper weight.

**Triggers:** clicking the 44px right page-edge strip (`z-index: 900`), the 30px left strip, the bottom prev/next arrows, ArrowLeft/ArrowRight, PageUp/PageDown, and bookmark tabs. Bookmark jumps set an anchor page one step from the target, then flip, so the animation always plays in the right direction.

**Pointer-events warning:** the back face must be `pointer-events: none`. When it wasn't, it silently swallowed every click on page content — Contents links and gallery buttons appeared dead while their handlers were fine.

---

## Screens

Full per-screen specification in `SCREENS.md`. Summary:

### Public diary — `Travel Diary.dc.html`

| Page | Content |
|---|---|
| **Cover** | Cloth board, double rule frame, title, subtitle, "Kept by", years, washi tape strip, perforated airmail stamp |
| **Contents** | Auto-generated index; column-flow grid, max 11 rows per column, wrapping to 2/3/4 columns as journeys are added; meta text drops out in multi-column mode. Verified with 31 entries on one page |
| **Notes** ×N | Date eyebrow, journey name, place; circular weather and mood badges (98px); up to 4 handwritten highlights; note paragraph; horizontal tally ticket (4 metrics); hero photo with caption and washi tape; taped ephemera slot filling remaining column height; postage stamp; "See full gallery"; handwritten sign-off |
| **Frames I** ×N | 3 photos — one tall spanning two rows, two stacked — each with a caption, slight rotations (−1.4° to +1.5°) |
| **Frames II** ×N | 4 photos — tall, two small, one wide — plus gallery button and count |
| **About** | Portrait with caption, kit list, two colophon paragraphs, contact, three mini stamps |

**Gallery** (separate route, outside the flip): back button, journey title and date range, frame count, scrollable `auto-fill minmax(200px, 1fr)` grid of square thumbnails with truncated captions and index badges. Video tiles get a play badge and duration chip. Clicking opens a full-screen lightbox with download, share, prev/next, counter, caption and metadata; clips add a transport row (play/pause, scrub, elapsed/total). Keyboard: Escape closes, arrows step.

**Chrome:** right-side bookmark rail (158px, scrollable, active tab shifts `translateX(-6px)` onto the page), bottom bar with prev/next and a `03 / 33` counter plus page label, ribbon bookmark on the spine side.

### Admin — `Travel Diary Admin.dc.html`

Ten destinations in a dark left rail (Caveat labels, Courier sub-labels, coloured spine bar per section, active tab lifts onto cream) plus an account destination in the rail footer.

**Overview** · 4 stat cards, "Waiting to go out" change list with revert, live-book card with cloth chip, "Needs a look" prompts that deep-link to the exact screen and selection, activity list.

**Journeys** · search, status filters incl. Archived, New-journey create panel, table (cover / journey / dates / pages / media / status / edited / actions) with a ⋯ row menu offering Duplicate, Archive, Move to trash.

**Journey editor** · three columns: page rail (reorderable, per-page move/duplicate/delete, layout picker with four distinct glyph previews, "Add page with this layout") · the editing pane (all journey fields, highlights with add/remove, note, tally, page furniture: sign-off, weather glyph, postage stamp, accent, gallery slug; photo slots with click-to-set focal point, caption and alt text) · the journey pool (tick a frame to place it in the book).

**Media** · dropzone with per-journey target, upload progress, duplicate-skipped notice, filename search, filters, multi-select with a bulk action bar, tiles marked In book / duration.

**Galleries** · per-journey selector, sort by date, Caption-all bulk panel listing only uncaptioned frames, draggable tile grid with cover/hidden badges, and a selected-frame panel: caption, alt text, three flags, and — for clips — a four-thumbnail **poster frame** filmstrip.

**Book & bookmarks** · reorderable bookmark list with page numbers, contents-page note, journey order mode, cover cloth, page-turn duration, gallery thumbnail size, decoration toggles.

**Cover & About** · live cover preview beside its fields; About portrait, paragraphs, kit list, reply-to.

**Publish** · headline, per-change checkboxes (excluded rows strike through, button counts "Publish 2 of 4"), numbered editions with view/restore.

**Settings** · site fields, storage quota with photos/clips/free breakdown, export/import, reader toggles (downloads, sharing, indexing, password, touch), take-offline.

**Trash** · 30-day hold, Put back, Delete for good, empty state.

**Account** · avatar, name on the cover, sign-off, time zone, notification toggles, sign-in email, password change, **one-time-code toggle** (this is the switch that drives the login), session list with revoke.

### Sign-in — `Travel Diary Login.dc.html`

Two-panel: cloth panel with the book's cover treatment, form panel on cream. Three states:

1. **Password** — email, password with show/hide, remember-me, forgotten link, and a footer line stating whether the code step is active
2. **One-time code** — six separate digit cells with auto-advance, backspace-retreat, arrow keys and paste-across-cells; 5-minute expiry countdown; resend on a 30s cooldown; three attempts; wrong code shakes the card (`omShake` keyframes, 420ms) and clears the cells
3. **Signed in** — routes to admin or diary

Plus a two-state **password reset** screen (enter email → sent confirmation with masked address).

---

## Interactions & behaviour

### Routing

| URL | View |
|---|---|
| `#/p/<n>` | diary page, 1-indexed |
| `#/gallery/<slug>` | that journey's gallery |

The page URL is written on every turn — flip commit, mobile step, bookmark jump — and read on load. **Returning from a gallery must restore `#/p/<n>`, not `#/`** (a reader who browses a gallery and copies the URL should still be sharing the page they were reading).

In production use real paths (`/p/12`, `/gallery/tokyo`) rather than hashes, so the deep links are indexable.

### Motion clips in the diary

Any photo slot can hold a looping clip. The still is the `poster`; the video plays over it with `autoplay muted loop playsinline preload="none"` and **no controls and no play badge** — it should read as the page quietly animating. Start playback on `canplay`, re-asserting `muted` first and swallowing the rejected promise (`play().catch(() => {})`) for browsers that block autoplay.

Gallery tiles are the opposite: there clips *do* show a play badge and duration, because the user is choosing what to open.

### Focal point

Clicking a photo slot in the admin sets a focal point as `x% y%`, drawn as a reticle. It is stored per slot and applied as `background-position` / `object-position` when the diary renders that photo. Without this, a portrait in a landscape slot crops through the subject's head. If you don't wire it through to rendering, the control is decorative — that is the whole point of it.

### Selective publish

Each pending change carries an include flag. Excluded rows strike through and grey; the primary button reads "Publish all 4" or "Publish 2 of 4" and goes inert when nothing is selected.

### Responsive

Three files, one pattern: measure the real viewport or content width into state on mount, on `resize`, and via `ResizeObserver`; derive a mode; drive layout from it.

| File | Breakpoints |
|---|---|
| Diary | `< 860px` → mobile reading mode |
| Admin | `≥ 1180` wide · `≥ 860` mid · below narrow |
| Login | `< 820` → single column |

**Diary mobile mode** replaces the book entirely — no flip, no scaling. Dark header with a bookmarks drawer, scrolling single column, full-width 4:3 photos, 52px nav buttons, swipe left/right (≥60px horizontal and 1.4× the vertical delta) to turn pages. Cover gets a "Start reading" call to action.

**Admin** drops table columns by priority as width falls (dates → media → edited → pages), keeping the actions cell in the last track; the editor's pool moves below the page card at mid width; everything stacks below that. The header keeps a 230px floor on its title block so the *controls* wrap rather than the title, and the pending chip and Preview button hide below 900/780px.

**Login** hides the cloth panel below 820px, becomes a single 470px column, tightens pane padding to `26px 20px 24px`, and shows a compact cloth masthead in the panel's place. Without this the OTP cells collapse to 7px.

### Scrollbars

The diary hides them entirely (`scrollbar-width: none` plus `::-webkit-scrollbar { display: none }`) — a visible scrollbar breaks the paper illusion. The admin shows a thin muted one. Content still scrolls in both.

---

## State

### Diary

```
index, flip {dir, from, to, go, half}, view ('diary'|'gallery'), gid, lb (lightbox index),
scale, vw, mobOpen, playing, t (clip position), toast
```

### Admin

Everything author-editable is keyed by journey id. **This is the one structural rule that matters** — five separate defects came from holding per-journey data in a single global value:

```
content   { '<journeyId>.<field>': value }     // incl. 'focal.<slotKey>', 'alt.<slotKey>'
pagesBy   { '<journeyId>': [ {id, name, meta, type} ] }
layoutFor { '<journeyId>.<pageId>': layoutName }
inBook    { '<poolItemId>': boolean }          // default carried on the item itself
```

Plus UI state: `screen, journey, page, filters, query, sel[], picked (frame id), poster{}, deleted[], purged[], statusOverride{}, rowMenu, outgoing[], galSort, bulkOpen, captioned[], on[] (toggles), savedAt`.

Two lessons worth keeping:

- **Select by id, never by array index.** `picked` was a positional index into the gallery; once "sort by date" reordered the list, the selected-frame panel showed a different photo than the grid highlighted.
- **Toggle state as a flat array of enabled keys**, not a nested object mutated by copy. The nested version read stale and toggles appeared to do nothing.

### Login

```
step ('password'|'otp'|'reset'|'done'), email, password, showPw, remember,
otp[6], attempts, left (expiry seconds), resendIn, resetSent, busy, error, shakeAt, vw
```

**Give each async action its own timeout handle** (`_tSubmit`, `_tVerify`, `_tReset`). Sharing one handle meant the reset path's `clearTimeout` killed the verify timer and left the button stuck on "Checking…" forever.

---

## Content model summary

Per journey, all author-editable: `name, place, dates (free text), slug, status, weather, mood, weatherGlyph (sun|haze|wind), stampCountry, stampValue, accent, signoff, highlights[≤4], note, tally[4]{key,value}, slotCaptions[], frameCaptions[], pages[], media[]`.

Per media item: `file, kind (still|clip), caption, alt, focalPoint, posterTimestamp (clips), inBook, hiddenFromGallery, isCover, allowDownload, capturedAt, order`.

Global: `bookTitle, subtitle, owner, coverCloth, years, contentsNote, flipDuration, galleryThumbSize, decorations/ribbon/counter flags, about{portrait, portraitCaption, paragraphs[], kit[], replyTo}, site{name, domain, description, replyTo}, reader flags`.

Full Payload collection definitions in `DATA_MODEL.md`.

---

## Assets

No binary assets. Every photograph is a placeholder: an inline SVG data-URI of 45° stripes in the journey's palette with a centred monospace label naming its slot. Replace with real images via the media pipeline; keep the captions.

Fonts are Google Fonts (Caveat, EB Garamond, Courier Prime) — self-host in production.

Icons are drawn with CSS, not an icon font: rotated squares for bullets and marks, a circle for clear weather, a dimmed circle for haze, a three-bar stack for wind, CSS triangles for play. Washi tape is a `repeating-linear-gradient` with a torn `clip-path`; postage-stamp perforation is a `radial-gradient` background repeated at 7.5px.

---

## Files

| File | Contents |
|---|---|
| `Travel Diary.dc.html` | Public diary — book, page flip, all page types, gallery, lightbox, mobile mode |
| `Travel Diary Admin.dc.html` | Admin panel — all ten screens plus account |
| `Travel Diary Login.dc.html` | Sign-in, one-time code, password reset |
| `SCREENS.md` | Per-screen layout and component specification |
| `DATA_MODEL.md` | Payload collections, fields, hooks |
| `SECURITY.md` | Required hardening — read before building auth |

To view a prototype, open the HTML file in a browser. Resize below 860px to see the diary's mobile mode.

## Known gaps

Deliberately not built, listed so you don't assume they were missed:

- **Nothing persists** in the admin prototype; it is a design reference. The only exception is the one-time-code flag, kept in `localStorage` so the two prototypes could demonstrate the link — **this must move server-side**, see `SECURITY.md`.
- Dates are free text, so "sort by date" applies to photo capture time only.
- No duplicate-image detection beyond the notice; no storage enforcement beyond the quota bar.
- The scale cap and admin centring discussed for 4K displays are not implemented.
