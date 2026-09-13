# 4 · End-to-end — the detail

The detail for `docs/testing.md` §4. That document states the suite's tool, its scope
and how to run it, and points here; everything else about the suite is below. The section
numbers are `docs/testing.md`'s and do not change.

- **Tool:** Playwright (`playwright.config.ts`, Task 12).
- **Scope:** real journeys — page flip, bookmark jump, gallery, lightbox, mobile swipe,
  sign-in + OTP, upload round-trip.
- **Status:** the harness is implemented, and the first real journey it guards is the
  book. The routes this app serves today are Payload's own admin at `/cms`, the diary's
  `/p/<n>`, `/gallery/<slug>` with its download handler (Phase 1 Task 14), and — since
  Phase 2 Task 7 — the bespoke panel's first screen at `/admin/sign-in`, joined by
  `/admin/sign-in/code` in Task 8. The rest of the `/admin` panel is Phase 4.

  **`e2e/signIn.spec.ts` (Phase 2 Task 7)** is where `SECURITY.md`'s second prototype
  hole is proved closed **against the delivered page rather than against the source**.
  The hole is that the OTP on/off flag lived in `localStorage['om-diary-otp']`, "where
  anyone can set it to `0` and skip the second factor entirely"; the fix is that the code
  step is decided from `users.otpRequired`, server-side. A grep proves only that nobody
  typed that read — not that nothing the route ships performs one — so three cases run in
  a browser:

  1. **The page reads no browser storage.** An init script installed before the document
     exists records every `Storage.prototype.getItem`/`key` call; the recorded list must
     be empty.
  2. **The prototype's own key is planted with the OPPOSITE answer** before navigation,
     and the footer line must not move. This is the hole itself, reproduced: against the
     handoff's prototype this case reads "the code step is switched off".
  3. **Every script the page fetched is downloaded and searched for the key.** A bundle
     carrying the string is a read waiting to happen even if it did not fire on this
     load. This one has a consequence for the code: `PasswordStep.tsx` does not spell the
     key even in a comment, because a development build ships comments verbatim and a
     quoted key would make the case fail locally and pass in CI's minified build.

  All three also assert that the footer line **exists** and says what `SCREENS.md` §3.1
  says it should — "no storage was read" and "no script names the key" are both trivially
  true of a page that failed to render. Four further cases cover what only a laid-out page
  can answer: the cloth panel beside the form above 820px and the masthead instead of it
  below (asserting the shell's own `grid-template-columns` count, not just that both
  elements exist), the Show/Hide toggle preserving the typed value across the input's
  `type` swap, and a refused submission staying on the screen with the field marked.

  Both the `localStorage` cases were watched to fail with the mechanism put back: a
  five-line reintroduction of the prototype's read failed cases 1 and 2, and shipping the
  key as a client-side constant failed case 3.

  **`e2e/reset.spec.ts` (Phase 2 Task 9)** carries what a component test cannot say about
  `SCREENS.md` §3.3 and §3.4, and its first two cases are about a defect no component test
  could ever have caught. For the whole of Tasks 5 to 8 the reset email carried a working
  token to an address nothing answered: the constant was right, the two spellings of it
  agreed, the token was minted and provably consumable, and `/admin/reset/<token>` was a 404. A component suite renders a component; it never fetches an address. So the first
  case clicks the "Forgotten" link off the password screen and **reads the response
  status**, and the second requests the mailed link's own shape and reads it again — 200,
  with the expired state on it, rather than 404. Every other assertion in both cases would
  hold on Next's own not-found page if the status were not read.

  The rest of the file is geometry and delivered markup: the ringed circle measured at
  62x62 with a 20x20 square inside it, the confirmation block's computed background read
  back as `rgba(47, 107, 104, 0.07)` with its 14px mark, the two signed-in actions measured
  to the same width 10px apart, the expired state asserted to contain the token nowhere in
  its `innerHTML`, and a whole address planted in `?sent=` asserted to reach the page
  masked. **What it deliberately does not do is request a reset**: `POST /admin/reset/request`
  is mounted (Task 10), but reading the link it sends means the mailer's in-process outbox,
  which a browser cannot see, so the journey from a request through the mailed link to a
  changed password is proved where the outbox is — see the integration section below.

  **`e2e/codeStep.spec.ts` (Phase 2 Task 8)** carries the three things about
  `SCREENS.md` §3.2's one-time-code screen that jsdom cannot settle, and each was watched
  to fail with its mechanism removed:

  1. **The cell widths at 390px.** §3 records the exact failure this guards — "at
     `40px 42px` in a 342px shell the OTP cells collapse" — and the fix is the narrow
     pane padding, `26px 20px 24px`. The case pins a LITERAL 40px floor rather than
     anything derived from the stylesheet, because a floor compared against the value it
     is meant to hold still moves with it and can never fail. Restoring `40px 42px`
     failed it at **35.5px**; the correct padding measures **42.83px**. A second case
     covers the other half of the same defect, which a width floor alone would pass:
     cells that refuse to shrink do not collapse, they overflow.

     **That second case was decorative when it was first written, and the fix is worth
     recording.** It measured the flex CONTAINER against the form panel — and a
     block-level container is sized by its parent whatever its children do, so it could
     never fail. Under `.cell { flex: none }` it reported the row comfortably inside the
     panel while the row's own `scrollWidth` was 2,043 against a `clientWidth` of 302 and
     the last cell stood 1,741px past the pane. It now measures each CELL's edges against
     the pane's CONTENT box — which is the box the required padding actually creates —
     and `flex: none` fails it at `pastTheRightEdge: 1741` against a floor of `0.5`. The
     lesson generalises: a test written to cover another test's blind spot needs its own
     mutation, or it inherits the blind spot and adds confidence on top of it.

  2. **The paste.** Each cell is `maxLength="1"`, and the browser truncates a pasted
     string to one character before `change` fires — so a jsdom case proves the handler
     spreads digits and NOT that a reader pasting a code gets six of them (jsdom performs
     no default paste at all for a handler to have to prevent). This case grants clipboard
     permission, writes the code with `navigator.clipboard.writeText` and presses
     Ctrl+V. With `onPaste` deleted it read `['1','','','','','']` — the defect itself.
  3. **The shake under `prefers-reduced-motion`.** A media query is a property of the
     stylesheet, so asserting that the pane raised its flag proves nothing about it. Both
     cases read `animation-name` off the SHELL's computed style under
     `page.emulateMedia({ reducedMotion })`, and both first assert that the refusal really
     happened (the error box says "All six digits, then we can look." and the flag reads
     `true`), because "nothing is animating" is trivially true of a screen that never
     refused anything. Deleting the `@media` block failed the reduce case with
     `signIn-module__…__omShake`; deleting the `.shell:has(…)` rule failed the other with
     `none`.

  The same file also pins §3.2's own measurements from the RENDERED page rather than
  from the stylesheet — the title at 50px, the 20px gap between the rule and the "The
  code" label, the row's 9px gap, each cell's 25px Courier, `13px 0` padding and centred
  text, and the two rings side by side in one row (`1.5px` `#a34434` on a filled cell
  against `1px rgba(120,98,60,.34)` on an empty one). Reading the computed style is what
  makes a rule that is present but overridden fail.

  One of those assertions is a DECLARATION rather than a rendered outcome, and it says
  so: `.labelAboveCells` sets the whole `margin` because the label is a `<p>` whose
  default `1em 0` puts 9.5px above it, and measured, **that 9.5px currently moves
  nothing** — it collapses through the zero-height top edge of the `<form>` the label
  opens and then with the rule's own 20px `margin-bottom`, so every box below sits at the
  same y to the pixel with or without the rule. It is kept because a collapse is what is
  holding that layout: a border or a padding on that form, the wrapper going away, or the
  rule's margin dropping under 9.5px each end the collapse and start a real drift. The
  gap assertion beside it is the rendered one, and it is the one that would catch that
  day.

  Each shake case clicks and reads inside ONE `page.evaluate`: the flag is cleared 420ms
  later, and a click followed by a separate round trip is a race that fails under load
  rather than under a defect. React flushes a click's state update in a **microtask**
  rather than synchronously — measured, not assumed — so the case yields the microtask
  queue once and then reads, and the 420ms timer that clears the flag is a macrotask
  scheduled during that same flush and cannot have run yet.

  **`e2e/gallery.spec.ts` (Phase 1 Task 14)** covers the four things about the gallery
  and its lightbox that only a served, laid-out page can answer, and deliberately
  nothing that `packages/domain/src/gallery.ts` (100%) or
  `apps/web/components/gallery/*.test.tsx` already prove.

  1. **The tiles stay square and unsqueezed at sixty-one of them.** `SCREENS.md` §1.8
     records the grid as "Verified with 61 tiles; must stay square and unsqueezed at
     40+", which is a statement about `aspect-ratio: 1/1` and `object-fit: cover` under
     a `repeat(auto-fill, minmax(...))` track — none of which exists until a browser
     lays it out. `apps/web/scripts/seed.ts` seeds Patagonia's full sixty-one-frame
     gallery so this case has the number the design was verified at (see
     `docs/deviations.md` §20 for why one journey and not ten).
  2. **The download is served by us.** `SECURITY.md`'s requirement has a half that no
     unit test can see: the RESPONSE headers. This suite issues the real request and
     asserts `Content-Disposition: attachment`, the strict `Content-Type`,
     `X-Content-Type-Options: nosniff`, and a `404` when the same media id is addressed
     through a journey it does not belong to.
  3. **Returning restores `/p/<n>`, not `/`** — by BOTH paths, because they are
     different mechanisms. The gallery's own control is a link whose `href` is resolved
     by the SERVER from the `from` parameter the diary's own gallery link
     carries; the browser's Back button depends on `Book.tsx`'s
     `history.replaceState`. A third case reads that `href` out of the raw
     HTML, because the first design resolved it from `document.referrer` after
     mount and a reader who clicked before hydration landed on the cover
     (`docs/qa/2026-09-03-gallery-sweep.md`, GAL-005). `e2e/routing.spec.ts` has covered the second half against a
     404 since Task 13; this is where it meets a real gallery.
  4. **The lightbox's keyboard contract.** Escape closes, the arrows step, Tab stays
     inside the dialog, and focus returns to the tile the reader STEPPED to rather than
     the one they opened.

  **`e2e/mobile.spec.ts` (Phase 1 Task 15)** covers `SCREENS.md` §1.10's mobile reading
  mode, which below 860px replaces the book entirely. It runs at the `mobile` project
  alone, and that project now carries a PHONE USER AGENT as well as a 390x844 viewport,
  because which surface a request is served is decided on the server from the user agent
  before any viewport can be measured
  (`docs/adr/0011-two-reading-surfaces-chosen-on-the-server.md`). Five of its cases could
  not exist anywhere else:

  1. **A vertical scroll does not turn a page.** The rule is
     `packages/domain/src/swipe.ts`'s and is unit-tested to 100%, including both
     diagonals either side of the 1.4 ratio; `useSwipe.test.tsx` drives the binding with
     dispatched React events. Neither can tell you whether a finger dragging DOWN the
     page also turns it, because neither scrolls anything. These cases drag through the
     DevTools Protocol's `Input.dispatchTouchEvent` - the same input path a finger takes,
     so the browser scrolls the column itself - and assert BOTH halves: that the column
     moved, and that the address did not. A run where nothing scrolled would pass the URL
     check while proving nothing.
  2. **Neither surface ships the other's code**, which is what two route entries bought
     (`docs/adr/0012-two-route-entries-for-two-reading-surfaces.md`). The case fetches
     `/p/1` twice, once with a desktop user agent and once with a phone's, collects every
     script and stylesheet each document asks for, fetches those too, and requires that
     none of the book's carry `mobile-module__` and none of the mobile surface's carry
     `book-module__` — one marker per surface, because Turbopack puts a stylesheet's
     class-name prefix in both the CSS chunk and the client chunk that imports it. It is
     the guard on the bundling seam rather than the rendering one, and it is the case that
     fails if a future shared import quietly pulls one surface into the other's chunk
     group. Proved to fail first, by importing `mobile.module.css` into `Book.tsx`.
  3. **A phone's document carries no book at all.** No design box, no leaves - the weight
     the surface split exists to avoid, asserted rather than assumed.
  4. **All THIRTY-THREE deep links serve their own page in raw HTML**, with no script
     run — the mobile counterpart of `e2e/serverWindow.spec.ts`'s thirty-three-route
     case, and the same design-spec §8 promise. **It was four hand-listed routes until
     Phase 1's final review**, which named the gap plainly: `serverWindow.spec.ts` skips
     below 860px, Googlebot Smartphone is served THIS surface, so the surface most likely
     to be indexed was the only one with no per-route guarantee. It now fetches every
     `/p/<n>` with the phone user agent and holds each document to the BOOK, fetched in
     the same run at `?pages=all` with a desktop user agent — an independent answer,
     since ADR 0012 made the two surfaces two route entries with two page components.
     Each route must serve one mobile page and zero leaves and zero design boxes; its
     `data-mobile-page` kind must equal the `data-page` kind the completed book puts at
     that leaf; the journey its header names must be the journey the book's own bookmark
     rail puts at that leaf; and its counter must read `NN / 33`.

     **An exact text match across the two surfaces is not available, and the case does
     not pretend otherwise.** They render the same content differently on purpose — the
     mobile Cover carries "Start reading" and a swipe hint where the book's carries its
     postal stamps, a mobile frames page repeats the journey's weather and mood badges
     where the book's prints "Frames 01 – 03", and the mobile About drops the kit list.
     So identity is asserted through what both surfaces must agree on (kind, and
     governing journey) and substance through what only this surface can answer: all
     thirty-three pages carry more than 50 characters, and no two of them carry the same
     text. A route serving another route's page fails the first pair; a route thinning
     out to nothing fails the second. Measured while writing it: thirty-three distinct
     texts, the shortest 144 characters (the Cover).

  5. **The correction path**, in its own browser context with a DESKTOP user agent at a
     700px viewport - the one reader the server's hint gets wrong. It asserts that the
     document arrived carrying the book, that the browser corrected it to the mobile
     mode, and that the correction survives a navigation because it is remembered in a
     cookie rather than in the address.

  **NINE BOOK SPECS NOW SKIP BELOW 860px**, through one shared predicate and one line
  each: `drawsMobileReadingMode` in `e2e/support/surface.ts`, reading the domain's own
  `MOBILE_READING_MAX_WIDTH_PX` rather than an 860 repeated per file. A book spec's
  mobile run had stopped describing anything a reader below the breakpoint will meet -
  the design says there is no book there - so the skip removes a case that was no longer
  about the product, and each carries its reason in its own `test.skip` message.
  `e2e/layout.spec.ts` is the one file that does NOT take that route; see below.

  **`e2e/layout.spec.ts` (Phase 1 Task 12, rethought in Task 15)** asserts in numbers what
  a screenshot cannot say - that the book is on the screen. Its four cases are the record
  of an S1 defect found at 390px (`docs/qa/2026-09-01-diary-sweep.md`), which is exactly
  the viewport where there is now no book to place. Standing them down there would have
  left the `mobile` project with no placement test at all, so each is PAIRED with a mobile
  case asking the same question of the surface that is drawn instead: the surface fills
  its viewport with no spill and no sideways scroll; `elementFromPoint` at the middle of
  the scrolling column lands inside the page; every bookmark in the drawer receives a tap,
  and Marrakech - the same tab the book's own case clicks - is tapped to prove it; both
  52px bottom-bar arrows are pressable, hit-tested at their own centres rather than
  through a Playwright click that would scroll them into view first.

  **The Next dev overlay is off** (`apps/web/next.config.ts`, `devIndicators: false`).
  It is fixed to the bottom-left of the viewport, which at 390px is where §1.10 puts the
  previous-page arrow, and `<nextjs-portal>` intercepted every click on it - so
  `e2e/mobile.spec.ts` and `e2e/layout.spec.ts` could not be run locally at all while the
  same cases passed in CI, which serves a production build with no overlay. A suite that
  only passes on the runner is one a developer learns to skip.

  **`e2e/book.spec.ts` (Phase 1 Task 7)** covers what only a real layout engine can
  answer, and deliberately nothing that `packages/domain` already proves: that a click on
  a Contents link is not swallowed by the leaf's back face, that no back face can receive
  pointer events at all, that the leaf transitions `transform` and nothing else, that no
  element anywhere inside the book animates a layout property, that the design box is a
  fixed 1300×860 scaled by a transform rather than reflowed, that it rescales when the
  viewport changes, and that exactly one leaf is visible at rest.

  Its first case is the load-bearing one. The handoff records the exact defect
  (README, "Pointer-events warning"): with the back face clickable, Contents links and
  gallery buttons appeared completely dead while their handlers were fine, and it cost a
  debugging session to find. The assertion was proved able to fail — removing
  `pointer-events: none` from `.back` in `book.module.css` and re-running the suite fails
  it on all three viewport projects, with Playwright naming the culprit outright
  (`<div data-face="back" …> intercepts pointer events`); restoring the rule turns it
  green again. That is also why the back face is hidden by opacity alone and never by
  `visibility`: a second, redundant guard would have made the rule that actually matters
  untestable.

  **`e2e/flip.spec.ts` (Phase 1 Task 8)** covers the reader's own triggers — both
  page-edge strips, the bottom arrows, all four keyboard keys, and a bookmark jump —
  driven as a reader drives them, plus the three things only a browser settles:
  that a strip lying over the page stack is genuinely clickable rather than covered
  by the leaf above it, that `prefers-reduced-motion` reaches the machine through a
  real media query, and that hammering a key through a real 900ms transition leaves
  the book usable rather than seized.

  Two of its cases produced real findings on their first run, and both are recorded
  where they were fixed rather than only here:

  - **The handoff's own `z-index: 900` cannot work in the handoff's own DOM
    position.** With the strips as siblings of the leaves (the prototype's
    arrangement), Playwright timed out with `<article class=page> from <div
data-leaf=2> subtree intercepts pointer events` — a leaf's stacking order is
    `1000 - i`, so the current page always paints above a strip at 900. The strips
    became siblings of the STACK instead; see `docs/deviations.md` §8.
  - **The bottom arrows were unclickable at 390px.** The `mobile` project caught
    `<nav class=rail> intercepts pointer events` on the next arrow: the bar's
    contents are 338px wide in a 232px column, and unwrapped they spilled under the
    bookmark rail. `book.module.css`'s `.bottomBar` now wraps, with the reason at
    the rule.

  Every case in the file waits for the book to be LIVE before pressing anything
  (`waitForLiveBook`, which watches the measured scale replace the server's
  `scale(1)`). A page-turn trigger fired between the server's HTML arriving and
  React hydrating is lost for good — no retry recovers it — and the two
  reduced-motion cases, which by design do not wait out a transition, failed on all
  three viewport projects until that wait existed. The patient cases had been
  winning the same race by luck.

  The bookmark-jump anchor is proved able to fail, the way `book.spec.ts`'s
  pointer-events case is. Deleting the two anchoring lines from `useFlip.ts`'s
  `jumpTo` — so the jump goes straight to the target from wherever the reader is —
  fails three tests at three levels: `useFlip.test.tsx` reports `from: 29` where the
  anchor rule requires `from: 3`, `Book.test.tsx` sees leaves `['2', '8']` visible
  instead of `['2', '3']`, and this file's own in-flight read returns `['29']`
  instead of `['2', '3']`. Restoring the lines turns all three green.

  **`e2e/pages.spec.ts` (Phase 1 Task 9)** covers the Cover and Contents pages'
  browser-only guarantees, at all three viewport projects. What the two components
  _decide_ is already covered without a browser
  (`apps/web/components/pages/Cover.test.tsx`, `Contents.test.tsx`) and so is the
  arithmetic behind those decisions (`packages/domain/src/coverTitle.test.ts`,
  `contentsLayout.test.ts`), so this file asserts only what a laid-out page can answer:
  that SCREENS.md §1's measurements stay absolute under the design box's `scale(k)`
  (`offsetTop`/`offsetLeft`/`offsetWidth` are layout coordinates a transform does not
  touch, so the washi strip still reports `top: 52; left: -26; 190x36` at 390px as at
  1440px); that the cover title actually FITS (`fitTitleSize` sizes from an _estimate_
  of Caveat's advance width, since no font metrics exist on the server, so only a
  browser can confirm `scrollWidth <= clientWidth` and that SCREENS.md's "last-resort"
  ellipsis never engages); and that the Contents body does not overflow its `1fr` track,
  which is the one half of SCREENS.md §1.2's "zero overflow" claim that can be checked
  here — the multi-column count cannot, see `docs/deviations.md` §9.

  **`e2e/frames.spec.ts` and `e2e/about.spec.ts` (Phase 1 Task 11)** do the same job
  for the three pages that carry the book's photographs. Two things in them are worth
  knowing before editing either file.

  The rotations are read to THREE DECIMAL PLACES, out of the resolved transform matrix.
  SCREENS.md §1.4-§1.6 give each of the eight mounts its own authored angle (−1.6°,
  −1.4°, −1.2°, −0.7°, −0.5°, +0.8°, +1.0°, +1.5°), and rounding them to whole degrees
  — the technique `notes.spec.ts` uses for its badges at −6° and +5° — collapses six of
  them onto −1, 0 and +1, so the cases would pass against a page that had swapped them.
  The three mini stamps on About are the exception and are rounded, because their
  angles are three degrees apart at the closest.

  The focal point is proved on a `frame`-role slot and on the About portrait, not only
  on the Notes hero. The portrait matters most: it is the one photograph in the diary
  whose focal point comes from the MEDIA ITEM rather than from a `pages` slot, so it
  travels a different path through `readBookBundle` and a wiring that held for slots
  alone would leave it silently centred. Both use `notes.spec.ts`'s method — assert the
  fit is `cover`, assert the computed position, screenshot the element at its focal
  point and again forced back to `50% 50%`, and require the two buffers to differ.

  **`e2e/notes.spec.ts` (Phase 1 Task 10)** does the same job for the Notes page, and
  the cases below it exist because of defects that have already happened rather than ones
  somebody imagined.

  The first is the highlight gaps. `SCREENS.md` §1.3 records that
  `justify-content: space-between` on the highlight list "dumped 232px into two gaps
  when a journey had three highlights instead of four", and that the fix was structural:
  the highlights are `flex: 0 0 auto`, sized to their content, and the ephemera slot —
  a media element that can absorb 54px or 300px without breaking — takes the elastic
  space. The case measures the gaps between rendered highlights on a THREE-highlight
  journey (Lisbon, `/p/6`), because three is the case that broke; a four-highlight
  journey filled the column by accident and never showed the defect. Measured: 13px and
  13px in layout pixels, against a bound of 30 and a recorded defect of 232.

  The second is the focal point. `SCREENS.md` is blunt about the stakes — "If this is
  not wired through to rendering, the admin's focal-point picker is decorative — that is
  the whole point of it" — and a test asserting only that `object-position` carries the
  right string would pass against a stylesheet with `object-fit: fill`, where
  `object-position` does nothing at all. So the case screenshots the hero image twice,
  once at the slot's own focal point and once forced back to `50% 50%`, and requires the
  two buffers to differ. `apps/web/scripts/seed-data.ts` gives Tokyo's hero slot the
  seed's one non-default focal point (`18% 82%`) so that there is a page on which the
  crop demonstrably moves.

  Every selector in that file is scoped to one leaf via `Leaf.tsx`'s `data-leaf` index.
  `Book.tsx` renders every leaf of the served content window at once — the addressed
  page and `CONTENT_WINDOW_RADIUS` either side of it, widening to all thirty-three as
  the reader turns (ADR 0009) — so `[data-page="notes"]` alone matches several sections
  and an unscoped locator is a strict-mode violation rather than a wait.

  One assertion in it records a browser fact rather than the authored one, with its
  reason at the assertion: the left column's fit is measured from its last child's
  untransformed `offsetTop`/`offsetHeight` rather than from `scrollHeight`, because the
  scrollable overflow region includes the ROTATED bounding boxes of the tally ticket
  (-0.5deg) and the ephemera scrap (+0.5deg), which makes every notes page in the book
  report exactly 3px of "overflow" on a column whose content fits perfectly.

  **`e2e/imageWindow.spec.ts` (Phase 1, the LCP fix)** covers the one thing the unit
  suites cannot: whether the bytes actually stop arriving. Every leaf `Book.tsx`
  renders is absolutely positioned at `inset: 0`, so the browser counts all of them as
  in the viewport and `loading="lazy"` defers NOTHING — measured, not assumed, against
  the document of the day, which carried all thirty-three (ADR 0009 narrowed it to the
  content window afterwards): `/p/1` fetched all twenty of the seeded book's photographs,
  1,820,504 bytes, with the reader on the Cover, and the LCP gate went red at 3,247ms.
  An attribute-level assertion would have passed the whole time that was happening,
  because the `lazy` attribute was present throughout, so the first case counts real
  network responses and requires ZERO on `/p/1`.

  The window itself is `leafPresentation.loadsImages`
  (`packages/domain/src/pageStack.ts`), unit-tested to 100% there. Three further cases
  guard what a browser has to settle: that a leaf inside the served document but outside
  the image window still carries its heading, its caption and its alt text with only its
  `src` stood in for (the bytes are deferred, never the markup); that the next
  page's hero is already `complete` with a non-zero `naturalWidth` at the FIRST
  animation frame of the turn that reveals it, which is the "empty frame swinging into
  place" defect stated as an assertion; and that a bookmark jump's destination is inside
  the window from the first frame of the jump rather than only once the turn commits.
  The last two fire their trigger from inside `page.evaluate` and read one frame later,
  for the reasons `flip.spec.ts`'s header sets out.

  Two of this file's cases moved when the SERVER's content window landed
  (`docs/adr/0009-server-rendered-page-window.md`), and both moves are recorded at the
  case rather than here. The "words in the document" case now asks about leaf 4 on
  `/p/2` rather than leaf 29 on `/p/1`, because leaf 29's face is no longer in `/p/1`'s
  document at all until the reader turns a page — and leaf 4 on `/p/2` is the pairing
  the case actually wants: inside the served window, outside the image window. The
  bookmark-jump case opens the whole-book address (`wholeBookPath`), because it reads a
  single animation frame after the click and on a bare `/p/1` that frame is the book
  waiting for one round trip. That waiting is real behaviour, and it is asserted in
  `e2e/serverWindow.spec.ts` rather than left out.

  **`e2e/routing.spec.ts` (Phase 1 Task 13)** covers what the diary's ADDRESSES promise,
  which is a different subject from what any page renders. Six cases assert the 404
  boundary from outside the app — `/p/999`, `/p/34`, `/p/0` and `/p/tokyo` are 404 while
  `/p/33` is still 200, so the boundary is off by nothing — and one requires the 404 view
  to carry a link back to `/p/1`, because a reader who lands there has nothing else on
  screen. Four more read raw HTML with `request.get`, never `page.goto`: a crawler runs no
  JavaScript, so neither may the assertion standing in for one. They require each page's
  own `<title>` and `<meta name="description">` (two deep links that are one search result
  are most of what real paths were bought to avoid) and require `?pages=all` to declare
  `/p/<n>` as its canonical, which is what stops the content window's own request address
  from being duplicate content.

  **Four cases were added when the two reading surfaces became two route entries**
  (`docs/adr/0012-two-route-entries-for-two-reading-surfaces.md`). Two require `/m/<n>` —
  the mobile surface's own route entry — to answer a direct request with a **308** to
  `/p/<n>`, for a real page and for one the book does not have alike: it exists so the
  bundler has two entries to split, and left reachable it would give all thirty-three
  pages a second crawlable URL. Two more send an explicit desktop and an explicit phone
  user agent to the SAME `/p/3` and require the two documents to agree on their title,
  their description and their canonical. That pair is not redundant with the cases above
  it: a mobile-user-agent crawler (Googlebot's smartphone crawler is one) is served the
  mobile entry, so metadata that held in only one entry would be metadata half the
  crawlers never saw.

  Its last two cases are the **gallery return**, which the design spec calls out by name:
  "returning from a gallery restores `/p/<n>`, not `/`". `/gallery/<slug>` is Task 14's to
  build, and the cases do not wait for it — `Notes.tsx` and `FramesII.tsx` already render
  the gallery button as a real `<a href>` (Task 10/11, deliberately), and a navigation to a
  route that does not exist yet is still a navigation with a history entry. So the second
  case turns two pages, clicks the real link on the leaf the reader is actually on, goes
  back, and requires `/p/5` — the page reading took them to, not the one they arrived at.
  It passes today against a 404 and will keep passing when Task 14 puts a gallery there.
  What it actually guards is `Book.tsx`'s `history.replaceState`: were the book to push
  rather than replace, or not write the address at all, both cases fail.

  **One case is about a file rather than a route, and belongs here for that reason.**
  Every promise above is that a deep link is indexable, and until Phase 1's final review
  this repository served **no `robots.txt` at all** — permissive by omission rather than
  by a decision anyone can read, and not what `SECURITY.md` asks for ("respect
  `indexGalleries` in `robots.txt` **and** with `X-Robots-Tag`"). `apps/web/public/robots.txt`
  is now served, static, and consistent with `site.indexGalleries`'s `defaultValue:
true` — the only honest content while nothing writes or reads that setting and the
  Settings screen that would is Phase 4. The case requires a 200, requires `User-agent:
*`, `Allow: /` and `Disallow: /cms`, and requires the file NOT to carry a bare
  `Disallow: /` or `Disallow: /p` — a line that would quietly undo every other case in
  the file without failing one of them. `docs/security.md`'s `indexGalleries` row records
  the two halves Phase 4 still owes: a generated `app/robots.ts` that reads the setting,
  and the `X-Robots-Tag` header on the gallery route.

  **`e2e/serverWindow.spec.ts` (the server content window)** covers the other window,
  and its first case is the one the whole change stands or falls on: it fetches all
  **thirty-three** `/p/<n>` routes as raw HTML with `request.get`, parses each with
  `DOMParser` — never `page.goto`, because a crawler runs no JavaScript and neither may
  the assertion that a crawler is served — and requires each document's own leaf to
  match, character for character, what the completed book renders on that leaf. It
  compares against the live book rather than a transcription, so a page whose content
  ever thins out breaks the case instead of quietly agreeing with a stale string.
  9,945 characters of page text across the thirty-three routes.

  Its five browser cases are the other half, because a document that indexes beautifully
  and strands a reader on a blank leaf four turns in has not solved anything. They walk
  the reader's own path — a bare `/p/<n>`, then turns — past the window's edge forwards
  and backwards, across the book from a bookmark tab, and, with the book's own request
  for the rest of itself **held up on the network for six seconds** by `page.route`, four
  turns into a three-leaf window: the reader stops at the edge on a page with content on
  it, and the fourth turn plays itself the moment the rest arrives. That last case is the
  empty-leaf defect stated as an assertion, and it is the only place the held-move queue
  can be observed in a browser.

  Two assertions in `pages.spec.ts` record a browser fact rather than the authored one, each with its
  reason at the assertion: Chromium reports the inner rule's `2.5px` border as `2px`
  (it snaps a computed border width to a whole CSS pixel, measured at
  devicePixelRatio 1 _and_ 3, so it is not a density effect), and the washi strip's
  rotation is read back out of the resolved matrix with `atan2` rather than pinned as
  matrix digits, which differ in the sixth decimal place between Chromium builds.

  **`e2e/layout.spec.ts` (the 2026-09-01 sweep's DIARY-001/002/003)** covers where the
  scaled book actually lands on the screen, at all three viewport projects. It exists
  because the visual-regression suite was supposed to own this question and demonstrably
  did not: the `mid` and `mobile` baselines were regenerated over a book that had been
  pushed off the screen entirely and stayed green on a blank page for two commits
  (`docs/qa/2026-09-01-diary-sweep.md`, DIARY-004). A baseline can only say "this looks
  like it did last time"; a picture of no book is still a picture. Its cases say it
  in numbers instead, each from the symptom a reader meets rather than from the CSS that
  produced it: the design box's drawn rect is inside the area `useBookScale` measures and
  concentric with it (off-centre by 0px, spilling 0px on each side, tolerant of the
  sub-pixel remainder a fractional scale leaves); `document.elementFromPoint` at the
  centre of that area resolves to something inside the design box, which is the one
  assertion that separates "drawn" from "laid out somewhere off the screen" and is
  exactly the probe that returned `null` at 390px; every `[data-bookmark]` tab hit-tests
  to itself at its own centre and a click on one of the nine the sweep found dead reaches
  `/p/12`; and both page-edge turn strips hit-test to themselves. That last one is the
  case `e2e/flip.spec.ts` could not make: Playwright scrolls an element into view before
  clicking it, so its edge-strip cases passed on a strip that had left the viewport, which
  a reader cannot scroll back into `.stage` (`overflow: hidden`).

  **`e2e/chrome.spec.ts` (Task 12, `SCREENS.md` §1.7)** covers the book's chrome in a
  real layout engine: the bookmark rail, the bottom bar and the spine ribbon. Its
  markup is covered three times over by `apps/web/components/chrome/`'s own jsdom
  suites — which tab carries `aria-current`, what each tab prints, that the arrows are
  labelled and go dead at the ends of the book — and none of those can answer the four
  questions that actually broke: whether the ribbon takes a click meant for what is
  under it, whether the bar is 58px, whether a control has been laid out under the rail,
  and whether the rail scrolls without showing a scrollbar. All four are layout and
  hit-testing, so all four run here at all three viewport projects.

  Two of its cases are worth knowing about specifically. **The ribbon case asserts on a
  live trigger, not on the hit test alone** — the first draft only asked whether the
  element under the ribbon's centre was the ribbon, and it PASSED with
  `pointer-events: none` deleted, because the backward page-edge strip's own
  `z-index: 900` already sits above the ribbon's `400` and answered for it. It now clicks
  at that point and requires the page to turn back, which is what a reader would notice.
  **The scrollbar case reads the declared `scrollbar-width` as well as the measured
  gutter**, for the same reason: this browser draws overlay scrollbars, so the gutter is
  0 whether the rule is there or not — measured, with the diary-wide rule removed, rather
  than assumed. It still asserts the content genuinely scrolls (a rail made
  `overflow: hidden` to lose its scrollbar would fail there), on a viewport forced short
  so the thirteen tabs overflow at every project rather than only at two of them.

  `e2e/smoke.spec.ts` is the console-error gate: it loads `/cms`, `/p/1` and (Task 13)
  the page-not-found view at `/p/999` — where the correct response is a 404, so that case
  asserts the status rather than `ok()`, and what it is really about is that a route which
  deliberately throws `notFound()` renders cleanly rather than logging on the way. It
  asserts
  **zero** `console` (error level) and `pageerror` events, with both listeners attached
  _before_ `page.goto()`. This is deliberately the harness's centre of gravity, not an
  afterthought — the handoff's own defect log (`CLAUDE.md` §10, `SCREENS.md`) is mostly
  _silent_ failures (a swallowed click, a missing derivative, a rejected autoplay
  promise), none of which move a pixel, so visual or manual-only QA misses them
  entirely. The test also waits `networkidle` and a fixed 500ms grace period after
  `goto()` before asserting — a real hydration-time console error was observed (in this
  task's own planted-failure proof, see below) landing _after_ the `load` event, so
  checking immediately on navigation would have produced a false negative on exactly the
  class of defect this suite exists to catch.

  Its `/favicon.ico` case asserts that the address responds `200`. Every browser asks
  for that address without being told to, and nothing declared it — the sweep recorded the 404 as
  a console `error` on every cold load of every route, and Lighthouse recorded it on a
  production build (`docs/qa/2026-09-01-diary-sweep.md`, DIARY-006). It is asserted with
  `request.get` rather than by watching a page load because whether a browser fetches
  the address at all depends on the browser and on whether it is headed: the page-load
  cases above it are headless and stayed green through the whole defect.

  **`e2e/upload.spec.ts` (Phase 3 Task 9)** is where a MEASUREMENT is checked against
  another measurement, and it is the only place that can be done.
  `EXPECTED_UPLOAD_REQUEST` in `apps/web/lib/media/uploadContract.ts` records what a
  real Chromium sends when a page PUTs an upload — `PUT`, the `File`'s own `type` as
  `Content-Type`, and a `Content-Length` a page cannot set. The integration fixture
  `aPutRequest` in `apps/web/lib/media/testing/uploadProbes.ts` builds its method and
  content type FROM that constant, which is what keeps one spelling of the shape — and
  is also why no Vitest run can tell the constant drifting from the browser drifting:
  the fixture and the assertion agree by construction, which is exactly how two Phase 2
  blockers passed sixteen hundred tests. So the first case builds a `File` inside the
  page, PUTs it with the page's own `fetch`, and compares what the browser did against
  the constant.

  The URL it PUTs to is a genuine one. `anUploadUrlFor` in `e2e/support/adminSession.ts`
  calls `offerUploadSlots` — the same function the admin's Server Action calls — over
  the live `createLocalStorage(MEDIA_DIR)` store and the bound `mediaProcessor()`, so
  the token is signed with the real secret, capped at the real `MAX_UPLOAD_BYTES` and
  pointed at the real `ADMIN_ORIGIN`. It creates no journey of its own: a published
  fixture row would be a row `e2e/visual.spec.ts` photographs. The type the page puts on
  its `File` comes off the bound pipeline's `acceptedTypes`, never off the constant
  under test, so the two sides of the comparison have independent sources.

  The second case is about authorisation rather than shape. The token is a capability
  over one KEY and is not authentication, so the route file applies `guarded`; the same
  genuine URL is PUT to from a browser with no session, and the case asserts that
  **nothing landed at the key** — read back through the store — before it asserts what
  the browser was told. `fetch` follows redirects by default, so a `303` to
  `/admin/sign-in` would arrive at the page as that screen's `200`; the case uses
  `redirect: 'manual'`, under which a browser reports the redirect itself as
  `{ status: 0, type: 'opaqueredirect' }`.

  Both mechanisms were watched failing. Setting the constant's `contentType` to
  `application/octet-stream` failed the first case on the shape comparison, naming both
  values. Unwrapping `guarded` in
  `apps/web/app/(admin)/admin/media/upload/route.ts` failed the second case on the store
  assertion — four bytes where there should have been none — and, separately,
  `apps/web/lib/auth/adminGuardRegistration.test.ts`'s `leaves every guarded address
applying the guard in its own file`. **`npm run lint` exited 0 under that mutation**,
  measured: `eslint-rules/guarded-server-actions.js` governs modules whose directive
  prologue declares a Server Action, and a route file is not one. Two shapes, two checks,
  and neither covers the other's.

  Neither case uploads a photograph. There is no admin picker to drive until Phase 4, so
  the body is a filled `Uint8Array` inside a `File`; what happens to real photograph
  bytes afterwards is `apps/web/lib/media/roundTrip.integration.test.ts`'s, against a
  real Postgres and a real store.

  **A CI gap this file had not recorded.** `.github/workflows/ci.yml`'s `browser` job
  named only `smoke`, `a11y` and `visual` in its single `npx playwright test`
  invocation, so `e2e/book.spec.ts` and `e2e/flip.spec.ts` — named by
  `npm run test:e2e` since Tasks 7 and 8 — had never actually gated a merge. Their
  assertions are among the most load-bearing in the repository (the back face swallowing
  every click, the transform-and-opacity-only budget, all five turn triggers), so they
  were passing locally and guarding nothing remotely. The job now names every spec file
  explicitly, which is also why the list is spelled out rather than given as a
  directory: adding a spec without adding it there is then a visible omission in a diff.

  **And the list drifted again.** Task 12 found `e2e/frames.spec.ts`,
  `e2e/about.spec.ts` (both Task 11) and `e2e/serverWindow.spec.ts` named by
  `npm run test:e2e` but absent from the CI job, so none of them had gated a merge
  either — `serverWindow.spec.ts` most consequentially, since it is what asserts all
  thirty-three deep links still serve their own page. All three are named there now,
  alongside Task 12's own `e2e/chrome.spec.ts`. Two lists that have to agree will
  disagree eventually; until one is generated from the other, checking both is part of
  landing a spec.

  **The third time, it was made impossible instead.** Task 13 added
  **`e2e/ciRegistration.spec.ts`** (a Vitest test, `e2e/ciRegistration.test.ts`, since
  Phase 2 — see below), whose whole subject is the two lists above. It
  globs `e2e/*.spec.ts` off the filesystem, reads the `- run:` command out of
  `.github/workflows/ci.yml`'s browser job and the `test:e2e` / `test:visual` /
  `test:a11y` scripts out of `package.json`, and fails naming exactly which spec is
  missing from which list. It reads the `run:` COMMAND rather than the workflow file,
  because that file's comments name half these specs in prose and a substring search
  over it would pass for a spec that is only ever mentioned — which is the state this
  guard exists to end, dressed as a green test. It was proved able to fail: a throwaway
  `e2e/dummyDrift.spec.ts` was added, both cases failed naming it, and the file was
  deleted. It needs no browser and no `page` fixture, so it costs the run a file read.

  **A third case was added in Phase 1's final review, for the same defect shape in a
  different list.** `npm run test:perf` runs one `lhci autorun` invocation per
  `lighthouserc*.json` — two when this case was written, **three since Phase 2 Task 11 added
  `lighthouserc.admin.json`** — because lhci's collect settings are per-run rather than per-URL
  and the book's 1350x940 desktop viewport cannot share a run with the gallery's phone
  emulation (ADR 0014). Nothing enforced the pairing: collapsing the script to one
  command — a plausible tidy-up — would have silently stopped gating the book surface,
  the heavier of the two and the one every LCP ADR measured, while `npm run test:perf`
  still exited 0 and CI still reported the step green. The case reads the config
  filenames off the repository root, reads `test:perf` out of `package.json`, and fails
  naming exactly which config nothing runs. Reading the filenames off disk rather than
  hard-coding the pair is what makes it catch a THIRD configuration added and never run.
  Proved able to fail: `test:perf` was collapsed to the first command alone, the case
  failed naming `lighthouserc.book.json`, and the script was restored — both runs are
  pasted in this task's report. **It then did exactly what it was written for.** Phase 2
  Task 11 added `lighthouserc.admin.json` to the repository root, and the case failed naming
  that file before `test:perf` was updated to run it — which is the third-config scenario the
  "read the filenames off disk" decision was made for.

  **The script's shape changed under it in the same round, and the case was written to
  survive that.** `test:perf` was a `&&` chain and is now
  `node scripts/run-lighthouse.mjs <config> <config> <config>`, because `&&` short-circuits
  and a red gate was hiding a newer one behind it. This case still passes unchanged: it asks
  whether the script NAMES each config, not how it invokes them. That is also why the runner
  takes the configs as arguments instead of globbing them itself — a runner that discovered
  them would satisfy this case by construction, which is the shape of test that passes
  because it cannot fail.

  **The fourth time, the guard was there and did not fire — so it moved into `verify`
  (ruling F57).** Phase 2 Task 9 found `e2e/codeStep.spec.ts` named by `npm run test:e2e`
  and by no `- run:` line since commit `2d2b3c1`, gating nothing for two commits. The
  guard above would have caught it — the Task 9 reviewer removed `e2e/reset.spec.ts` from
  the CI line and watched it fail as designed — but it was a **Playwright spec**, so it
  ran only in the CI browser job or in a full `npm run test:e2e`, never in
  `npm run verify`, the gate Husky runs before every commit. A detector that lives in the
  same job as the thing it detects reports the fire from inside the building. It is
  `e2e/ciRegistration.test.ts` now: the same cases, importing `vitest` instead of
  `@playwright/test`, collected by `vitest.config.ts`'s `unit` project via its
  `e2e/**/*.test.ts` glob, so a commit that forgets a `run:` line fails at the moment it
  is made. It stays in `e2e/` because that directory is its subject, and
  `playwright.config.ts` narrows its own `testMatch` to `**/*.spec.ts` so the two runners
  cannot collect each other's files. It is no longer named by `test:e2e` or by the CI
  browser job, because it is not a browser test — `npm run verify` runs it, and CI runs
  `npm run verify:full`. Proved able to fail in its new home: `e2e/reset.spec.ts` was
  removed from the CI `run:` line and `npx vitest run --project unit e2e/ciRegistration.test.ts`
  failed naming it; the line was restored.

- **Three viewport projects** — `desktop` (1440×900), `mid` (1000×800), `mobile`
  (390×844; `isMobile`/`hasTouch` set) — run every spec three times, once per breakpoint
  named in the Task 12 brief. All three use Chromium, not a mix of engines: this
  environment's Firefox/WebKit binaries are an unverified download, and are not needed
  to catch the class of defect this harness targets today (console/pageerror,
  axe violations, pixel drift). Cross-browser coverage is a candidate for a later phase,
  not a Task 12 gap silently worked around — see `playwright.config.ts`'s header.
- **Run:** `npm run test:e2e` (headless, runs `e2e/smoke.spec.ts`,
  `e2e/book.spec.ts`, `e2e/flip.spec.ts`, `e2e/layout.spec.ts`, `e2e/chrome.spec.ts`,
  `e2e/pages.spec.ts`,
  `e2e/notes.spec.ts`, `e2e/frames.spec.ts`, `e2e/about.spec.ts`,
  `e2e/imageWindow.spec.ts`, `e2e/serverWindow.spec.ts`, `e2e/routing.spec.ts`,
  `e2e/gallery.spec.ts`, `e2e/mobile.spec.ts`, `e2e/signIn.spec.ts`,
  `e2e/codeStep.spec.ts`, `e2e/reset.spec.ts` and `e2e/signInJourney.spec.ts` — the
  authoritative list is the script itself, and `e2e/ciRegistration.test.ts`, which runs in
  `npm run verify`, is what makes the script and CI agree. This sentence is a third copy
  that neither of them checks, and it was missing `signInJourney.spec.ts` for the rest of
  the phase after that file landed); `npm run test:e2e:headed` (all
  `e2e/*.spec.ts`, visible browser) — this is also the engine
  `sweeping-for-browser-defects` (`.claude/skills/`) uses for manual, scripted sweeps.
  `playwright.config.ts`'s `webServer` boots the real app: `npm run dev` locally
  (reused if already running), `npm run build && npm run start` in CI.

  **WHICH PATH TO USE WHEN, which ruling F58 required this document to say and which it
  did not say for the rest of the phase.** `npm run test:e2e` on the host runs at ONE
  worker (`playwright.config.ts`, ruling F39): the dev server compiles a route on first
  request in a single process, so parallel workers queue behind each other and time out.
  That is right for running one spec while you work on it, and it is roughly four hours
  for the whole list — which is why no task in Phase 2 ever ran the whole list, and why
  the final review recorded that as a residual.

  **One environmental cause of a timeout here, because it looks exactly like a
  regression.** `apps/web/scripts/seed.integration.test.ts`'s first case seeds ten
  journeys and their media, with a sixty-second budget. It passed for the whole of Phase 2
  and then began timing out on this machine with no commit in between — because
  `apps/web/media` had reached 102,503 files and 4.5 GB, and nothing ever deletes from it.
  Measured on the same commit: 0 files → 34.3s and green; 102,503 files → over 60s and
  red. `docs/runbook.md` has the cleanup and the table. Reach for it before reaching for
  `git bisect`.

  **THE SUITE IS NOT IDEMPOTENT INSIDE FIFTEEN MINUTES, and the second run's failure looks
  exactly like a regression.** Measured in round 7: a container run finished green
  (`446 passed`, 1 flaky), a second one was started about four minutes later, and
  `e2e/reset.spec.ts:171` "never draws a screen at the address §3.3's own form posts to"
  failed on `mid` and `mobile`, on both retries, with
  `page.waitForURL: Test timeout of 30000ms exceeded` and the log line
  `navigated to "http://localhost:3000/admin/reset"` — the bare address, with no `?sent=`.

  That is the rate limiter working. `packages/domain/src/auth/rateWindow.ts` allows **20
  attempts per address per 15-minute window** on the `password` endpoint, and
  `apps/web/lib/auth/passwordReset.ts` spends that same budget for a reset request rather
  than taking one of its own (its header says so, and why). `handleResetRequest` answers a
  refusal with a `303` to the bare `RESET_PATH`, which is indistinguishable from a rejected
  submission. Confirmed against the live table rather than inferred: immediately after the
  second run, `sign_in_attempts` held **24** rows for `dimension=ip`,
  `endpoint=password`, `subject=::1`, newest four minutes before the query — over the limit,
  inside the window.

  **FIXED IN ROUND 8, AND THE FIX IS THE OPTION THIS PARAGRAPH USED TO OMIT.**
  `playwright.config.ts` now names `e2e/support/globalSetup.ts`, which clears
  `sign_in_attempts` once before any spec starts (a `DELETE`, not a `TRUNCATE`: Postgres
  refuses to truncate a table `payload_locked_documents_rels` references, and the first
  version of the setup was refused exactly that way). It touches no limit, no window length, no
  endpoint and no case — every rate-limit case in this suite builds its own counts inside a
  single run — and it makes the suite idempotent: two `test:e2e:container` runs back to
  back, the second starting seconds after the first, both pass.

  **HOW TO RE-PROVE THAT IDEMPOTENCY, because the commit that claims it cites evidence this
  repository does not contain.** `ff52484`'s body names a fix report under
  `.superpowers/`, which is `.gitignore`d, so a future reader of the history cannot open the
  proof — a branch-wide convention rather than a defect of that commit, but the claim is the
  kind somebody will want to check. The check that settles it is not the exit code, which
  would also be 0 on a lucky ordering: count the in-window rows before and after a second
  run. `SELECT dimension, endpoint, subject, count(*) FROM sign_in_attempts GROUP BY 1, 2, 3`
  held **34 rows before the second run's specs began and 34 after it finished** (11 ×
  `ip`/`password`/`::1`, 6 × `ip`/`code`/`::1`, the rest per-account) for the sixth
  whole-branch review — and round 9 re-ran the pair and measured **34 before and 34 after,
  with the same 11 and 6 at the top**. Without the setup, a second run leaves roughly
  double. Both round-9 runs: exit 0, `447 passed`, `171 skipped`, **0 flaky** (the word
  appears zero times in either log), and the bookmark-jump publish case — then at
  `e2e/flip.spec.ts:157`, and carrying a ~2% flake into Phase 3 by ruling — passed first
  attempt in both. **That flake is fixed and the ledger is closed:** the case polled the
  address as a fourth field of the book's published identity, which the application has
  never promised moves in step with it, and it is now three cases polling two series
  apart. Do not chase it at line 157 — that line is a different case now.
  `docs/qa/2026-09-08-flip-address-lag-defect.md` carries the root cause, the deterministic
  reproduction that is kept as a permanent case, and the mutations that prove all three
  still catch PH1-001.

  **AND THE GENERAL RULE THAT PARAGRAPH IS AN INSTANCE OF (ruling F80).** Anything a
  reader must know in order to trust a mechanism — a residue, a fragility, the
  measurement behind a claim — belongs in the tree: this file, the ADR, or the comment
  on the mechanism itself. Never only in a fix report under `.superpowers/`. That is not
  a style preference; it cost two blockers in the seventh whole-branch review. Round 9
  knew that the F76 pointer case's regex could not cross a comment line break, wrote it
  down in `final-fix-report-5.md`, and shipped a comment on the case asserting the
  opposite — so the sentence a reader met said the thing was impossible while the
  sentence that admitted otherwise was in a directory the repository does not contain.
  From the tree's point of view, a disclosure nobody can open is not a disclosure.

  **What this paragraph said before is worth keeping as a lesson about rationales.** It
  framed the choice as "wait fifteen minutes for the window to age out, or accept the
  failure", and warned against loosening the limit. Both halves of that were true and the
  frame was a false dichotomy: the third option is fixture hygiene, and the fifth
  whole-branch review named it independently. A rationale that reads as a principled
  refusal while omitting the cheap correct fix is a weaker artefact than the finding it
  accompanies. **Do still not reach for the limits** — the case is right and the endpoint is
  right — and if the setup is ever removed, the second run's failure is the limiter's own
  evidence rather than a regression.

  **The server prints `⨯ Error: The destination stream closed early.` during a parallel
  run, and it is a client disconnect rather than a fault.** The count varies with the
  worker count and with the machine, and **no bound is claimed here**, because one was and
  it was wrong: this paragraph said "between eight and thirteen" — a range derived from two
  runs — and the next container run printed **14**. What has actually been counted, on this
  branch, one entry per container run in the order they happened: 13, 6, 14, 13, 11, 7. **The
  figures are `test:e2e:container` runs only** — a `test:visual:container` run is a different
  and much smaller suite and prints a quite different number (2 and 4 have been counted), so
  comparing one against this list would look like a change and be none. They cluster in `e2e/mobile.spec.ts`. They are worth a
  paragraph because a `[WebServer]` line looks exactly like the silent server-side failure
  this repository has been bitten by, and because a sweep that shrugged at it would be the
  wrong habit. What was measured, on the same build in the same image:

  | Run                                        | Occurrences | Result    |
  | ------------------------------------------ | ----------- | --------- |
  | `e2e/mobile.spec.ts`, default worker count | 6           | 17 passed |
  | `e2e/mobile.spec.ts`, `--workers=1`        | **0**       | 17 passed |

  It is a function of parallelism, not of any one case: Next's streaming renderer logs it
  when a client goes away mid-document, which is what a Playwright worker closing its page
  or context does to a navigation another worker's timing left in flight. Two hypotheses
  were tested and did not reproduce it — abandoning a navigation by closing the page, and
  fetching all thirty-three deep links concurrently through `request.get` — so the
  remaining cause is worker teardown, which is also the only thing `--workers=1` removes.

  **Nothing observable is broken, and that is asserted rather than assumed.**
  `e2e/smoke.spec.ts` requires zero console errors, zero page errors and zero `>= 400`
  responses on the mobile surface; `e2e/mobile.spec.ts`'s deep-link case requires all
  thirty-three documents to answer `200` with real HTML. Both pass in the runs that print
  the line. Revisit this if the count ever changes with a code change rather than with a
  worker count — that would be a different thing wearing the same message.

  **`npm run test:e2e:container` is the whole-suite path.** It runs the same spec list in
  the pinned `mcr.microsoft.com/playwright` image Docker Compose defines, with `CI=1` —
  which makes `playwright.config.ts` build once, start the production server, and use its
  default worker count. Same specs, same config, minutes instead of hours. It needs the
  Compose Postgres up and migrated (`npm run db:migrate && npm run db:seed` on the host)
  exactly as the visual services do. Use the host path for one spec, the container path
  before claiming the suite is green.

- **Add one:** one spec per real user journey as each is built; assert on the DOM
  reflecting the state machine (e.g. `flipMachine`'s state), not on re-deriving the
  machine's logic in the test. Every new route gets its own `test()` in
  `e2e/smoke.spec.ts` first — a route with no console-error coverage is a route this
  suite is silently not protecting. A new spec file also needs adding to the
  `test:e2e` script AND to `.github/workflows/ci.yml`'s browser job; a spec no script
  names is a spec CI does not run, and `e2e/ciRegistration.test.ts` now fails
  `npm run verify` — the pre-commit gate, not two tasks later and not one full CI run
  later — when either list is missing one.
