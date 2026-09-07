# 0011 — Two reading surfaces, chosen on the server and corrected in the browser

**Status: DECIDED.** Phase 1 Task 15, the mobile reading mode (`SCREENS.md` §1.10).

## Context

`SCREENS.md` §1.10 opens with four words that decide the shape of this task: **"No book,
no flip, no scaling."** Below 860px the diary is not the book at a smaller size — it is a
different document: a dark header, a scrolling column of one page, a bottom bar and a
bookmark drawer. Nothing in it is inside the 1300×860 design box, nothing is scaled by a
transform, and nothing turns.

That makes the mobile mode a **second component tree**, not a set of media queries over
`book.module.css`. A media query cannot express it: the book's leaves are absolutely
positioned at `inset: 0` inside a transformed box, and the mobile mode is a document-flow
column that scrolls. Sharing one DOM would produce a scaled book fighting a scrolling
column, and the task brief says so in those words.

A second tree raises a question the brief asked to be answered before any of it was
built: **if both trees ship to every reader, a desktop reader downloads a mobile mode
they will never use, and a phone downloads thirty-three leaves it will never draw.** The
diary has almost no room for either. `docs/adr/0008-lcp-budget-and-the-framework-floor.md`
records that a route with no application code on it already models 2,023ms of a 2,500ms
budget; `docs/adr/0009-server-rendered-page-window.md` bought the current 3,000ms gate
about 70ms of margin by removing twenty-nine pages of markup from the document, and it
did that on the same route this task adds a surface to.

## Decision

**The `/p/<n>` route renders exactly one of the two surfaces per request. The server
chooses; the browser corrects the choice when it turns out to be wrong.**

### 1 · The decision is a pure function — `packages/domain/src/readingSurface.ts`

`servedReadingSurface({ remembered, device })` picks a surface from the strongest signal
a server render has:

1. **what a previous correction remembered**, in a cookie — a real measurement, taken by
   the reader's own browser;
2. failing that, **the user agent's device kind** (`mobile`/`tablet` → the mobile mode),
   which is what gets a phone the right surface on its very first paint;
3. failing that, **the book** — the wider surface, and the one the LCP gate measures.

`surfaceForWidth(width)` is the browser's half of the same decision, against the same
`MOBILE_READING_MAX_WIDTH_PX = 860`. Both halves read one module, so they cannot drift
apart — the shape `contentWindow.ts` already uses for the `?pages=all` signal.

### 2 · The correction — a cookie and `router.refresh()`

`apps/web/components/mobile/SurfaceCorrection.tsx` is rendered beside whichever surface
was chosen. It measures the viewport (on mount, on `resize`, and through a
`ResizeObserver`, the pattern `useBookScale` established), and where the measurement and
the served surface disagree it writes `td-reading-surface` and asks the server again.

**Why a cookie rather than a search parameter.** `?pages=all` was right for the content
window because that request is made once per reading session and the book then takes the
parameter back off the address (ADR 0009). A surface is different: it has to survive
every subsequent `/p/<n>` navigation, or a corrected reader flashes the wrong surface on
every page they turn. As a parameter it would have to be threaded onto every link on the
mobile surface **and** merged into `useRestOfBook`'s query, and any place that forgot
would swap the reader's surface mid-read. The cookie is read by the server on every
request with nothing threaded anywhere, and `useRestOfBook` needed no change at all.

It is a **session** cookie holding one of two literal strings, with no `Secure` flag
(it must also work over plain HTTP on a developer's machine) and nothing personal in it.
What it remembers is the size of the window in front of the reader right now, which is
not a fact worth carrying into next month.

**It cannot loop, and the guard is a readback.** If the cookie does not stick — a reader
with cookies blocked — the server would answer the refresh with the same surface, the
component would measure the same disagreement and refresh again, forever. So the cookie
is read back immediately after it is written, and a write that did not take leaves the
reader on the surface they were served. A worse surface beats an endless reload.

### 3 · The mobile document carries ONE page

The book keeps thirty-three leaves in a single document because a 900ms 3D flip cannot
survive its own subtree being unmounted; everything ADR 0009 records — the served window,
the request for the rest of the book, the held move at the window's edge, the
`history.replaceState` — exists to protect that. **None of it applies to a scrolling
column.** There is no animation in flight, no measured scale and no flip machine to lose,
so on this surface a page change is an ordinary navigation to `/p/<n>`, and the document
only ever needs the page the address names.

Measured on the seeded book, `/p/3`, production build:

| Surface                    | Document, raw bytes |
| -------------------------- | ------------------- |
| book (a seven-leaf window) | 89,589              |
| **mobile (one page)**      | **22,481**          |

Three of the four ways to change page — the bottom bar's arrows, the drawer's tabs, the
Cover's "Start reading" — are therefore real `<a href>` elements that work before any
script runs. The swipe is the fourth and the only one that cannot be.

## Alternatives rejected

1. **Media queries over the book.** What §1.10 rules out in its first line, and what the
   brief names as the wrong shape: one DOM holding a scaled book and a scrolling column.
2. **Render both surfaces and hide one with CSS.** Every reader pays for both in markup —
   on the one route whose LCP gate has ~70ms of margin and whose largest owned cost is
   already Style & Layout (ADR 0008). It also gives a phone the thirty-three-leaf stack
   the window was built to remove.
3. **Always serve the book; let the client swap to a lazily-loaded mobile tree.** The
   mobile tree would then have to render its pages in the browser, which means
   serializing the bundle into the flight payload for **every** reader, desktop included —
   exactly the cost `docs/adr/0007-server-rendered-page-faces.md` removed. And every
   phone would paint the book before replacing it.
4. **A search parameter instead of a cookie.** See §2 above: it works, and it has to be
   threaded through every link and every other query on the route, where forgetting once
   is a surface swap mid-read.
5. **`next/dynamic` to split the two trees into separate client chunks.** Tried
   **twice**, and **measured, not assumed** — the second time through Lighthouse, because
   the first measurement could not have seen a split even if there had been one (it summed
   the `<script src>` tags, and a lazily-fetched chunk never appears there). With
   `MobileDiary` behind a dynamic boundary and `Book` static, the gated run measured
   **148,646 bytes of script against 148,791 without it** — 145 bytes, or 0.1% — and LCP
   3,016.30ms against 3,011.36ms, inside a single run's spread. Turbopack groups this
   route's client references into one chunk whichever way it is written, so the boundary
   bought nothing and cost its own wrapper. Reverted, and the probe deleted.

   **AMENDED, and the split is now done — by a different mechanism.** Turbopack's client
   split is per route ENTRY, not per import, which is why no import-level boundary could
   ever have moved it. `docs/adr/0012-two-route-entries-for-two-reading-surfaces.md`
   gives each surface its own route entry and joins them with a rewrite in
   `apps/web/middleware.ts`: the book entry's chunk fell 20,161 → 11,474 raw bytes and its
   stylesheet 41,704 → 28,599, and the gated LCP fell **3,011.36ms → 2,932.66ms, green
   against 3,000 with the pinned cookie still in place**. Everything in THIS document
   stands unchanged — the decision, the cookie, the correction and its readback guard;
   only _where the decision is spent_ moved, from the `/p/[n]` page component to the
   middleware, which calls the same `servedReadingSurface`.

## Consequences

- **The markup is split; the script is not.** A phone's document is a quarter the size of
  the book's, and a desktop reader never receives the mobile mode's markup, its
  photographs' `<img>` tags or its stylesheet's rules. Both surfaces' _client components_
  still land in one route chunk, because Turbopack chunks them together and
  `next/dynamic` did not change that (see alternative 5). The mobile tree is small by
  construction — the page itself is a server component passed in as `children`, so what
  ships is the swipe, the drawer, the header and the correction.
- **THE LCP GATE STARTED MEASURING A DIFFERENT SURFACE, AND IS PINNED BACK.** Lighthouse
  emulates a phone by default — that is the point of the budget, which ADR 0008 scopes as
  "diary, 4G" — and a phone is exactly what this change gives the mobile reading mode to.
  Measured: with no pin, `/p/1`'s document under the gate fell from **11,454 to 5,208
  transferred bytes**, because the gate was no longer looking at the book at all. That is
  a truer picture of what a phone reader gets and a worse budget: a budget guards the
  worst case, and the book is the heavier surface. `lighthouserc.json`'s `collect.settings`
  therefore sends `Cookie: td-reading-surface=book`, so the gate keeps measuring exactly
  what ADR 0008 and ADR 0009 measured. The mobile surface is lighter by construction —
  less than half the document — so it cannot become the binding constraint while the
  book is gated.
- **THE LCP GATE IS RED, BY 11.36ms, AND IS REPORTED RED RATHER THAN RAISED.** Measured
  with Lighthouse's `simulate` preset, median of 5, against a production build, with the
  route's mobile branch removed as the "before" — the same tree, one `if` apart:

  |                          | LCP median      | LCP spread        | script transfer | document |
  | ------------------------ | --------------- | ----------------- | --------------- | -------- |
  | before (book)            | 2,936.12 ms     | 2,930.58–2,976.64 | 142,420         | 11,454   |
  | **after (book, pinned)** | **3,011.36 ms** | 3,010.23–3,038.43 | **148,791**     | 11,531   |
  | after (mobile, unpinned) | 2,931.23 ms     | 2,927.21–2,945.95 | 148,775         | 5,208    |

  **+75.24ms against 3,000ms, and CLS stays 0. Script transfer is +6,371 bytes and passes
  its own 184,320 gate with 35,529 to spare.** The cause is exactly the +6,371 bytes: the
  mobile tree's client half — the swipe, the drawer, the header and the correction — lands
  in the route's shared chunk and is therefore downloaded and parsed by the book's readers
  too, and Turbopack will not split it out (alternative 5, measured twice). At 1,638Kbps
  under a 4x CPU multiplier that is most of the 75ms.

  **The gate could be made green by deleting one line, and that line is not deleted.**
  Without `lighthouserc.json`'s `Cookie: td-reading-surface=book`, Lighthouse's own phone
  emulation is served the mobile surface and the same build measures **2,931.23ms — green,
  with 68.77ms of margin**. That would be buying a number: the book did not get faster, the
  gate stopped looking at it. ADR 0008 rejected a preload lever on exactly that reasoning,
  and this is the same trade seen from the other side. The pin stays, the run is red, and
  the decision about what to do with 11ms belongs to the repository owner — the options
  are a real chunk split (which this bundler does not offer today), less code on this
  surface, or a budget that admits ADR 0008's floor. **Do not silence it by removing the
  cookie.**

- **`e2e/layout.spec.ts` did not lose its mobile case.** Its cases are the record of
  an S1 defect found at 390px, and below 860px there is no design box for them to ask
  about. Each is now paired with a mobile case asking the same question of the surface
  that IS drawn there: does it fill the viewport with nothing spilling out, is the page
  really under a pointer aimed at the column, does every drawer bookmark receive a tap,
  are both 52px arrows pressable. See that file's header.
- **Nine book specs now skip below 860px**, through one shared predicate
  (`e2e/support/surface.ts`) and one line each, and the `mobile` Playwright project has
  gained a phone user agent so that it is served the mobile mode directly rather than
  through a correction. The correction path is covered by its own case, at its own
  viewport and user agent, in `e2e/mobile.spec.ts`.
- **Seven visual baselines move.** The six `diary-*-mobile` files become pictures of the
  mobile reading mode — they were previously a whole book at roughly a third scale, the
  least useful images in the suite — and `diary-mobile-drawer` is new.
- **The dev indicator is off** (`apps/web/next.config.ts`). Next's development overlay is
  fixed to the bottom-left of the viewport, which at 390px is exactly where §1.10 puts
  the previous-page arrow; it intercepted every click on it, so two suites could not be
  run locally at all while passing in CI. A gate that only passes on the runner is one a
  developer learns to skip.
- **A user-agent guess is a guess.** A tablet in landscape and a desktop window narrowed
  under 860px are both served the wrong surface first and corrected a round trip later,
  with a visible swap. That is the cost of not shipping both trees, it is bounded at one
  round trip per session, and it is asserted rather than assumed.
- **What would change this decision.** If Turbopack ever splits the two trees' chunks —
  or if a future task adds enough weight to the mobile tree that the shared chunk matters —
  alternative 5 is worth re-measuring, because everything else about the split already
  holds. Re-run the measurement rather than the reasoning.

- **Update, after `docs/adr/0014-the-viewport-the-diary-lcp-gate-is-measured-at.md`.**
  The pinned `Cookie: td-reading-surface=book` named twice above now lives in
  `lighthouserc.book.json`, not `lighthouserc.json`, and it is no longer enough on its
  own: on Lighthouse's 412px emulated phone the correction this ADR designed fired on
  every run, threw the pinned book away and re-rendered the mobile surface, which made
  the gate bimodal (3,016ms or 3,167ms) and, in the afternoon, 2,932ms on the same
  commit. The book is now measured at a 1350x940 viewport that agrees with the pin.
  Everything this ADR decided about which surface a reader is served, the cookie, the
  correction and its readback guard is unchanged — the correction is right, and only the
  measurement was asking it to argue with itself. This ADR's claim that the mobile surface
  "cannot become the binding constraint while the book is gated" is no longer assumed:
  it is gated too, at 2,926.8ms against the book's 2,930.5ms.
