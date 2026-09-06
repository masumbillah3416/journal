# 0009 — The server renders a window of the book's pages, and the book asks for the rest

**Status: DECIDED by the repository owner**, who set the direction: _"window the SERVER
render so each route emits only the pages near the one requested, instead of all 33."_
What follows is the shape that direction took once it met the flip, and the three
alternatives it beat — two of them rejected on measurements taken here, not on
intuition.

## Context

`docs/adr/0006-diary-image-window.md` narrowed the BYTES `/p/1` fetched from 1.83MB to
zero. It deliberately left the MARKUP alone, and said so: "A leaf outside it still
renders all of its markup — headings, captions, alt text, the note, the highlights, the
tally — because the design spec's §8 requires the server to render every page's content
so the deep links are indexable."

Task 11 added Frames I, Frames II and About. `/p/1`'s document went **17,443 → 23,444
bytes transferred** (+34%) carrying ninety more server-rendered photograph subtrees for
a reader looking at the Cover, and LCP went **2,930.6 → 3,084.6ms** against the 3,000ms
gate `docs/adr/0008-lcp-budget-and-the-framework-floor.md` had just set. That task
reported the gate red, did not raise it, and named the cause exactly: not image bytes —
markup, and the style and layout it causes. ADR 0008's own breakdown agrees: the largest
single item this repository owns in `/p/1`'s LCP is **Style & Layout**, "laying out 33
server-rendered page faces".

It does not get better on its own. Every journey added to the book puts seven more
photograph subtrees into **every** route's document.

**The reasoning that unlocks this.** Spec §8 requires the deep links to be indexable —
that is why the diary uses real `/p/<n>` paths rather than hashes, and why the handoff
warns against "a client-only SPA (destroys the deep links' SEO value)". But
**indexability is PER ROUTE, not per document.** `/p/12` must serve page 12's content.
Nothing ever required `/p/1` to also carry page 20's text, because `/p/20` carries it.
Each route being independently indexable is the actual requirement, and a window
satisfies it.

## The hard part: the flip is client-side, and the reader turns past the window's edge

A window is trivial to render and easy to get catastrophically wrong. The book turns
pages in the browser, 900ms at a time, and the reader can walk straight off the end of
whatever the server sent. Three things had to be true and none of them is free:

1. **A turn must never reveal an empty leaf.** The destination's content has to be in
   the document before its face becomes visible at the midpoint of the turn.
2. **A bookmark jump moves the reader many pages at once** — page 30 to page 3 — and
   `useFlip.jumpTo` anchors it one page from the target before flipping, so a jump needs
   _two_ arbitrary leaves, not one.
3. **The leaves themselves must stay.** `visibility: hidden` leaves outside the window
   still carry the stack's z-order, resting angles and page count. It is their CONTENT
   that goes, never the leaf.

### The obvious answer, measured, and rejected

The URL is already written on every turn, so a navigation looks like it is already in
play: let the reader turn, and let a Next client navigation re-render `/p/<n>` with a
window centred on the new page. **It cannot work, and the reason is structural.** Next's
`layout-router` keys each route segment's subtree by that segment's value
(`createRouterCacheKey`), so navigating between two `/p/<n>` unmounts everything below
it. Measured on a production build of this application, with a mount counter and the
flip index read out of the page:

| Action                                                 | book mounts | flip index                  | server re-rendered |
| ------------------------------------------------------ | ----------- | --------------------------- | ------------------ |
| load `/p/1`                                            | 1           | 0                           | —                  |
| `router.replace('/p/5')`                               | **2**       | reset to 4                  | yes (`n=5`)        |
| `history.replaceState('/p/9')` then `router.refresh()` | **3**       | reset to 8                  | yes (`n=9`)        |
| `router.replace('/p/6')` **mid-turn**                  | **2**       | turn destroyed, jumped to 5 | yes                |

The book's own state — where the reader is, the turn in flight, the measured scale — is
thrown away by every one of them. `Book.tsx`'s header already said this in words ("a
navigation would re-render the route and take the book's own state with it"); this is
the measurement behind the sentence. **A sliding window driven by navigation is not
available on this stack.**

Two follow-ups from the same probe, because they decided what IS available:

- A client component in `app/(diary)/layout.tsx` survives all of the above (mount count
  stayed at 1 across `/p/1 → /p/5 → /p/9`). Hoisting the whole book into the layout was
  considered and rejected: the layout sits above the `[n]` segment and so cannot know
  which page is addressed, the leaves themselves would still be re-mounted on every
  slide, and it is a large refactor bought with a second `readBookBundle` per request.
- **A navigation that changes only the SEARCH PARAMS does not re-key the segment.**
  `createRouterCacheKey(segment, /* no search params */)` excludes them, and it behaves
  that way: `router.replace('/p/5?pages=all')` from `/p/5` left the mount count
  unchanged, kept the flip index, and still re-rendered the route on the server.

## Decision

**The document carries a window; the book asks for the rest of itself once, when the
reader first turns a page.**

### 1 · The window — `packages/domain/src/contentWindow.ts`

`contentWindow(addressedIndex, totalPages)` — the addressed page and
`CONTENT_WINDOW_RADIUS = 3` leaves either side, **clamped** at both ends rather than slid
to keep a constant width. `/p/1` is both the route the LCP gate measures and the one
route a reader can only travel forward from, so sliding it forward would put three pages
of markup into that document that nobody reaches without first passing the three that
follow.

**Why 3.** The radius is the reader's runway, and nothing else. Three leaves is three
turns — 2,700ms at the handoff's 900ms default, 1,200ms at the 400ms floor it allows —
against a single same-origin round trip. A radius of 1 is the smallest that can serve a
turn at all and would save four more faces; the four faces are not worth the runway.
It is not configurable (CLAUDE.md §4: there is no second caller).

`app/(diary)/p/[n]/page.tsx` renders `<PageFace>` for leaves inside the window and a
bare `<div data-page-deferred={i} />` outside it. Every leaf still gets a child, so the
stack's page count, z-order and geometry are untouched — and `data-page-deferred` is the
handle `e2e/serverWindow.spec.ts` reads to know which document it has.

### 2 · The signal — one search parameter

`servedContentWindow(query, addressedIndex, totalPages)` returns the whole book when the
query carries `pages=all`, and a window otherwise. Every document request — a reader's
first load, and **every crawl** — is "otherwise".

The search parameter is not decoration on a mechanism that would work without it; it is
the only signal that both reaches the server and keeps the book mounted. The `RSC`
request header would have been tidier and **is unreadable**: it is on the wire (Next's
own responses carry `Vary: rsc` because of it), but Next 16 strips its routing headers
before a server component sees them. Printing `[...headers().keys()]` during the refresh
request returns `host, user-agent, accept, referer` and four `x-forwarded-*`, and
nothing else.

### 3 · The request — `useRestOfBook`, called on the reader's first turn

`router.replace(`${usePathname()}?pages=all`, { scroll: false })`, once. Same path, so
the segment key does not change and the book is not unmounted. `usePathname()` rather
than `pagePath(initialIndex)` because they disagree for `/p/999`, which
`pageIndexFromParam` clamps onto page 33 — and the disagreement would cost a remount.

**It is called from `Book`'s turn/jump handler, not from a mount effect, and that is a
measurement.** Asked for on mount, the answer lands inside the page's own load: 28,998
bytes transferred (131,041 raw) on a 1,638Kbps simulated link, plus the re-render and
layout of the twenty-nine faces it brings — and Lighthouse's `simulate` preset folds
every CPU node that performed layout into its LCP graph whenever it happens (ADR 0008).
Five runs each, same machine, same command:

| Where the request is made      | LCP median      | document | total transfer |
| ------------------------------ | --------------- | -------- | -------------- |
| on mount                       | 3,009.68 ms     | 10,561   | 329,374        |
| **on the reader's first turn** | **2,927.14 ms** | 10,560   | **300,383**    |

(An earlier five-run set of the same shipped code measured 2,932.02ms. The figure quoted
throughout this document is the run taken against the committed tree.)

Most of the win was being spent putting back what the window had just removed.

**This is not the preload lever ADR 0008 rejected as gaming the gate.** That one traded
693ms of modelled first paint for 78ms of modelled largest paint while making the real
page worse. This removes bytes and work from the reader's load, not only from where the
gate looks: the document is 65,014 raw bytes instead of 274,459 whether anyone measures
it or not, and a reader who arrives on a deep link, reads the page they came for and
leaves never fetches the other twenty-nine pages at all.

### 4 · The held move — what happens at the window's edge

`Book` holds one request, the newest, when the document cannot serve it:

- a **turn** needs its destination leaf, so it is checked against the served window;
- a **jump** can land anywhere and is anchored beside its target by `useFlip.jumpTo`, so
  it waits for the whole book rather than re-deriving that anchor here to ask about it.

The held move is performed the instant the rest of the book arrives. It does not bypass
the latch — what is held is re-presented to the machine, which still refuses a turn in
flight. In practice the only reader who can reach the edge is the reduced-motion one,
whose turns commit instantly; three key presses beat one round trip where 2,700ms of
animation would not. The answer to that is the queue, not a wider radius.

### 5 · The address

The `history.replaceState` that keeps `/p/<n>` shareable now waits for the book to be
whole, and does two jobs with one line. It is what takes `?pages=all` back off the
address, and writing the address _before_ that answer would be actively harmful:
`replaceState` moves the router's own idea of which `/p/<n>` it is on, so a turn
committed while the request was in flight would turn it into a navigation to a different
segment — which is the remount measured above. Until the answer lands the address is
still the page the reader arrived on, which is where they still are.

## Alternatives rejected

1. **Render only the current leaf.** The client-only SPA the handoff names outright.
   Rejected without measurement.
2. **A window slid by client navigation.** Rejected on the measurement above: every
   `/p/<n>` navigation unmounts the book.
3. **Hoist the book into the diary layout so the navigated segment holds only leaves.**
   Survives navigation (measured), but the layout cannot know which page is addressed,
   the leaves would still remount on every slide, and it costs a second bundle read per
   request. A large refactor to reach a worse place than one request.
4. **`content-visibility: hidden` on out-of-window leaves.** Would skip their style and
   layout — which is the biggest single cost — while changing nothing about the
   document. Rejected because it is not what the owner decided and does not address the
   document at all: 23,444 bytes still ship, still grow with every journey, and the
   HTML is still parsed. Worth revisiting only if the remaining Style & Layout ever
   becomes the binding constraint again.
5. **Stream the far faces late in the same document behind `<Suspense>`.** The document
   is one network node to Lighthouse's model and one parse to the browser; the bytes and
   the layout both still happen. It moves nothing.
6. **Fetch the far faces as HTML and inject them.** A second renderer for page content,
   outside React's ownership, that the image window's context could not reach. Rejected
   on both counts.

## Consequences

- **`/p/1`'s document is 65,014 raw bytes, down from 274,459** — 10,560 transferred,
  down from 23,445. Across all thirty-three routes the served document is now 60,620 to
  89,639 raw bytes (mean 79,721) where every one of them used to be 274,459.
- **LCP median over five runs: 3,083.95ms → 2,927.14ms** (2926.6 / 2926.6 / **2927.1** /
  2929.4 / 2931.4). The 3,000ms gate passes with **72.9ms of margin**, and
  `npm run test:perf` is green for the first time since Task 11. FCP falls with it,
  1,064.0 → 908.1ms. CLS stays 0. Script transfer 141,589 → 141,919, against the
  184,320 gate. Observed Style & Layout on the median run, the largest item ADR 0008
  attributed to this repository, falls 167.9 → 93.8ms — a 44% cut, and ×4 under
  Lantern's CPU multiplier the single biggest contributor to the result.
- **It stops growing with the book.** `/p/1` used to gain seven photograph subtrees per
  journey. It now carries four pages whatever the book's length — the document is
  O(1) in journeys where it was O(n).
- **Indexability is asserted route by route, not argued.** `e2e/serverWindow.spec.ts`
  fetches all thirty-three `/p/<n>` as raw HTML with no JavaScript run and requires each
  document's own leaf to match, character for character, what the completed book renders
  on that leaf. 9,945 characters of page text across the thirty-three routes, zero
  failures.
- **The one behaviour this costs.** A bookmark jump made as the reader's very first
  gesture waits one round trip before it plays, because neither the target nor its
  anchor is in the document yet. It is held, never dropped, and never shown as a blank
  leaf. Every later jump, and every turn including the first, is immediate.
- **`?pages=all` is a real, reachable URL** that renders the same book with every page's
  content. Nothing links to it, and the reader's address never keeps it. It is a
  superset of the canonical document rather than a different one, but Task 13, which
  owns `/p/<n>` metadata, should give the route a canonical link so a crawler that finds
  one is pointed back at `/p/<n>`.
- **The route reads `searchParams`, so it renders dynamically.** It already did
  (`ƒ /p/[n]`), so nothing regresses today — but Task 13's `generateStaticParams` will
  have to reckon with it, either by moving the whole-book render behind a `<Suspense>`
  boundary under PPR or by accepting a dynamic route.
- **`e2e/support/liveBook.ts` grew a second and a third export.** `waitForLiveBook` still
  waits only for hydration — on a document that stays a window until the reader turns a
  page, waiting for the whole book would be waiting for something that is not coming.
  `waitForWholeBook` waits for it where a spec has earned it, and `wholeBookPath` opens
  the whole-book address for the two specs that assert on the single animation frame
  after a bookmark click, where a round trip is not what they are measuring.
- **Thirteen visual baselines moved, and four of them moved back to exactly where they
  were before Task 11.** `diary-notes-desktop/mid/mobile` and `diary-contents-mobile`
  are now **byte-identical** to their `63d5e46` versions. Task 11 had recorded that
  those files moved "because `/p/1`'s document holds all thirty-three leaves and thirty
  of them stopped being heading-only fallbacks"; removing those leaves from the document
  restores them exactly, which is the cleanest confirmation available that the window
  changes what is in the document and not what is on the screen.
- **The original 2,500ms budget is still out of reach**, by 427.1ms, and this change
  brings it no closer to reach. ADR 0008's floor has not moved: 2,023.2ms for a route
  with no application code on it, plus 445.6ms for the design's three extra font faces,
  is **2,468.8ms — 98.8% of a 2,500ms budget before the diary renders anything at all.**
  The diary's own share is now 458.3ms, and deleting every byte of it would leave the
  route 31ms inside a gate whose runs spread by 5ms and whose bimodality this repository
  has measured at 149ms. What this change did do to that arithmetic is remove its
  growth: ADR 0008's 465.0ms line was 33 faces and rising with every journey, and 458.3ms
  for four faces is flat.
