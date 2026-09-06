# 0006 — The diary renders every page's markup, but only a window of pages' image bytes

> **Superseded in one respect by `docs/adr/0009-server-rendered-page-window.md`.** This
> document's premise — that every route's document carries all thirty-three pages'
> markup — no longer holds: `/p/<n>` now renders only the addressed page and three
> leaves either side, and the book asks the server for the rest on the reader's first
> turn. Nothing about the image window itself changed: `loadsImages` is still `±1` plus
> the turn's own two leaves, `visible` is still a subset of it, and a leaf inside the
> served content window but outside the image window still carries all of its markup and
> none of its bytes. What changed is that "inside the document" is now a smaller set than
> "in the book", and the two windows are separate: this one is a function of the flip
> machine, that one of the address.

## Context

`Book.tsx` renders one `<Leaf>` per page of the reading sequence — all thirty-three of
the seeded book — and that is deliberate. The design spec's §8 requires the server to
"statically render every page's content, so the deep links are indexable", which is why
the diary uses real `/p/<n>` paths rather than hashes, and why the handoff lists "a
client-only SPA (destroys the deep links' SEO value)" under what to avoid.

Task 10 added the Notes page, the first page in the diary that displays a photograph,
and the LCP gate went red:

```
largest-contentful-paint  found: 3247.14 ms   expected: <= 2500
resource-summary:image    20 requests, 1,833,312 bytes    (0 before Task 10)
```

Every leaf is absolutely positioned at `inset: 0` inside the design box, so all
thirty-three occupy the same coordinates. Both photographs already carried
`loading="lazy"`, `decoding="async"` and `fetchpriority="low"`, and it made no
difference: the browser considers a stacked leaf to be in the viewport, so a reader on
the Cover downloaded every journey's hero and ephemera scrap before the cover title
could paint.

Task 11 adds Frames I (3 photographs) and Frames II (4) per journey, taking the seeded
book from ~20 images to ~90. The defect had to be fixed before that work, not after.

## Options considered

1. **`loading="lazy"` alone.** Already in place, and **verified not to work here** rather
   than assumed: a Chromium run against a production build of `/p/1` recorded 20 image
   responses totalling 1,820,504 bytes with every one of those `<img>` elements inside a
   `visibility: hidden` leaf. The viewport intersection the attribute keys off is
   computed against the element's box, and every leaf's box is the whole design box.
   Rejected as insufficient, and subsequently removed from both photographs: leaving it
   in would have meant the neighbour preload depended on a browser _continuing_ to treat
   a hidden stacked leaf as visible, which is a pop-in defect waiting for a browser
   release.
2. **`content-visibility: hidden` on non-current leaves.** Would genuinely skip the
   subtree and stop its images loading. Rejected on two counts. It is a rendering
   property applied per leaf, so toggling it is work inside the flip's own subtree at
   exactly the moment the flip needs the compositor — CLAUDE.md §6 allows only
   `transform` and `opacity` to animate. And it can only be lifted at the moment a leaf
   becomes visible, which is the very frame the destination's hero is needed; the
   photograph would start loading as the leaf began to swing. That is the empty-frame
   defect, not a fix for it.
3. **Render only the current page server-side.** The smallest possible payload, and
   rejected outright: it is the SPA the handoff names as the thing to avoid, and it
   costs the deep links their indexability, which is the reason the route shape exists
   at all.
4. **A window of leaves that may carry real `src` attributes — chosen.** The open page,
   its two immediate neighbours, and the leaves a turn departs from and arrives at.
   Everything else renders its complete markup and stands its `src` in with a 1×1
   transparent GIF data URL.

## Decision

The window is a field on `LeafPresentation`, `loadsImages`, computed by
`leafPresentation` in `packages/domain/src/pageStack.ts`:

```ts
loadsImages: inBounds && (Math.abs(leafIndex - currentIndex) <= 1 || leafIndex === state.from || leafIndex === state.to)
```

It lives there, and not as an inference inside `Book.tsx` or `Leaf.tsx`, because that
module's header already forbids the alternative: "the DOM layer never re-derives flip
geometry", and "is this leaf near enough to fetch" is flip geometry. The field costs one
line and no new branch; re-deriving it in the component is the seam Task 8 already had
to close once, when `Leaf.tsx` was reading the turning leaf back off a literal `2000`
z-index.

Two properties follow from the shape of the expression rather than from care:

- **`visible` is a subset of `loadsImages`.** `visible` is `index || from || to`; the
  window is those plus one page either side. A leaf can therefore never become visible
  carrying a photograph it was not permitted to fetch. `pageStack.test.ts` asserts this
  over every leaf at every phase of a turn, rather than trusting it.
- **A turn's destination is preloaded before the turn exists.** The neighbour is inside
  the window while the book is at rest, so its hero is fetched and decoded during idle
  time. `e2e/imageWindow.spec.ts` reads `complete` and `naturalWidth` on the destination
  at the first animation frame of the turn.

A bookmark jump is the one case with nothing to preload, since it moves the reader many
pages at once. It is handled by the anchoring `useFlip.jumpTo` already performs for the
animation's sake: the jump lands on an anchor one page from the target and turns the
single leaf between them, so `index`, `from` and `to` are all adjacent from the first
frame and the destination is inside the window for the whole 900ms of the turn — never
only once it commits.

The withheld `src` is a data URL rather than an absent attribute (`src` is a required
attribute of `<img>`, and an element without one renders its alt text as text instead of
an image box). See `apps/web/components/pages/deferredPhotograph.ts`.

## Consequences

- `/p/1` requests **0 images, 0 bytes**, down from 20 and 1,833,312. `/p/3` and `/p/6`
  request 2 each — the page the reader opened on. LCP median over five runs falls from
  **3,170ms to a value recorded in the task report**, back inside the 2,500ms gate.
- **Indexability is unchanged, and measured.** `curl` against a production build returns
  the same 7,805 characters of page text across all thirty-three leaves before and
  after, with all twenty `<img>` elements and all ten non-empty `alt` attributes still
  present. Only the twenty `src="/api/media/file/…"` attributes are gone.
- ~~**Every page component that prints a photograph now takes a `loadsImages` prop**,
  from `PageFace` down. Task 11's Frames I/II pages must take it too; a page that ignores
  it puts its journey's photographs back in every route's initial load. This is the one
  standing obligation this decision creates.~~ **Discharged by
  `docs/adr/0007-server-rendered-page-faces.md`.** The page components are now rendered
  on the server and no longer carry the flag at all: `Book` publishes the window on a
  React context and `apps/web/components/pages/Photograph.tsx` — the single `<img>`
  component every page prints its photographs through — reads its own leaf's entry. A
  page cannot ignore the window any more, because it never sees it. Frames I/II inherit
  the behaviour by rendering a `<Photograph>`; they have nothing to remember.

  The window's arithmetic, its ±1 width, its `visible ⊆ loadsImages` property and its
  placeholder `src` are all unchanged by that ADR — only the route from
  `leafPresentation` to the `<img>` is.

- The window is deliberately not configurable. A wider window is more bytes and a
  narrower one is pop-in; ±1 is the smallest window that preloads a turn, and there is
  no second caller to serve (CLAUDE.md §4).
- `fetchpriority="low"` stays on both photographs. With the window in place it matters
  much less, but a neighbour's hero must still not outrank the page the reader is
  actually looking at.
