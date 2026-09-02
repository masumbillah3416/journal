# 0007 — The server renders the page faces; the book is handed them as children

## Context

`Book.tsx` is the diary's only `'use client'` boundary. Until this change it also
**imported** `PageFace`, which imports `Cover`, `Contents` and `Notes`, which import
`EphemeraSlot`, `MoodBadge`, `TallyTicket`, `WeatherBadge` and three CSS Modules. A
`'use client'` file's import graph is compiled into the route's script bundle, so all of
that shipped to the browser and hydrated on every `/p/<n>`.

Two earlier reports bracket this one and neither should be re-litigated:

- `render-boundary-report.md` **disproved** the claim that this arrangement kept the
  pages out of the served HTML. It does not: Next.js server-renders a client component's
  whole subtree, and all thirty-three pages' text is in every `/p/<n>` document. That
  question is settled.
- `docs/adr/0005-font-hosting.md` then named the surviving, smaller claim — that the
  page components are *script weight* — and named moving them to server-rendered
  children as the concrete way to buy LCP headroom for a third font family. This ADR is
  that change, and the measurement of whether it bought anything.

## The premise, tested before anything was restructured

Are those components actually in the client bundle, and how many bytes? Measured against
a production `next build`, not inferred:

```
$ grep -rl "POSTA AEREA" apps/web/.next/static/chunks/     # a Cover-only string
apps/web/.next/static/chunks/1txwgzj64c-xj.js

$ grep -rl -F "cover-module__" … "contents-module__" … "notes-module__"
apps/web/.next/static/chunks/1txwgzj64c-xj.js  (plus the route stylesheet)
```

That chunk is 19,930 bytes and IS fetched by `/p/1` (6,400 bytes over the wire,
confirmed in Lighthouse's own `network-requests`). Broken down by module boundary and by
component within the merged module:

```
  1,650  Contents            763  contents.module.css class map
  1,540  Cover               757  cover.module.css class map
  2,874  Notes             1,971  notes.module.css class map
  1,340  the four slot components (Ephemera/Mood/Tally/Weather)
     83  deferredPhotograph
    487  PageFace
 ------                    ------
  7,974  page components   3,491  class maps          = 11,465 of 19,930 bytes
```

**The premise held.** Everything below follows from a measurement, not from the claim.

## Decision

The `/p/<n>` route renders all thirty-three faces on the server and passes them into
`<Book>` as `children`. `Book` slots face `i` into leaf `i` and never learns what is
printed on it. It no longer takes `bundle`, only:

- `bookmarks` — a `readonly RailTab[]`, already labelled and filtered by the new
  `deriveRail` in `@travel-diary/domain/bookBundle`;
- `initialIndex`;
- `children` — whose **count is the book's page count**, so a `totalPages` that
  disagrees with the number of faces is a state that cannot arise.

**`bundle` was dropped rather than kept alongside the faces, deliberately.** Keeping it
would serialize the book twice into the same document — once as the rendered faces, once
as the JSON they were rendered from. Measured: the flight payload grows from 49,481 to
96,847 bytes when the faces move into it; adding the bundle back would have put it past
146,000.

### The image window is the hard part, and it is a context

`leafPresentation.loadsImages` is a function of where the flip machine is — browser
state. A server-rendered face is rendered once, before that exists, so the window
**cannot** be threaded down as a prop: it would freeze at the page the reader arrived on,
and the leaf a bookmark jump lands on would keep its placeholder for the whole visit.
That is a broken window, not a smaller one, and `e2e/imageWindow.spec.ts` requires the
destination's photograph to be in place at the **first frame** of a turn.

The one thing that does cross this seam is React context: server-rendered children are
placed inside the client `<Book>` when React renders it, so a client component nested
anywhere in them resolves context against `<Book>`'s providers.

- `Book` publishes one array of thirty-three booleans on `ImageWindow`, straight from
  `leafPresentation` — it does nothing else with them.
- `apps/web/components/pages/Photograph.tsx` — **the only `'use client'` file under
  `components/pages/`, eleven lines of component** — reads its own leaf's entry and
  chooses between the slot's `src` and `DEFERRED_PHOTOGRAPH_SRC`.
- `Notes` and `EphemeraSlot` stop carrying a `loadsImages` prop and pass `leafIndex`
  instead. `PageFace` does the same.

No provider means **load**, not defer: a photograph outside a book is just a photograph,
and that default fails loudly (a `Book` that forgot to publish the window would fetch
every photograph, which `e2e/imageWindow.spec.ts` counts) rather than quietly (a book of
blank mounts that no network assertion notices).

This retires ADR 0006's one standing obligation — "Task 11's Frames I/II pages must take
`loadsImages` too; a page that ignores it puts its journey's photographs back in every
route's initial load." A page cannot ignore it any more: it renders a `<Photograph>` and
is windowed by construction.

### Rejected

1. **Render both a windowed and an unwindowed face and let the client pick.** Doubles the
   markup in the document to save a fraction of it in script.
2. **Freeze the window at `initialIndex` server-side.** The simplest thing that keeps
   `/p/1` at zero images — and it silently breaks the bookmark jump, which is the one
   path with nothing preloaded. Rejected outright: ADR 0006's window is worth more than
   this change's whole saving.
3. **Keep `Notes` on the client and move only `Cover`/`Contents`.** Leaves 6,185 of the
   11,465 bytes in the bundle and keeps the `loadsImages` obligation alive, for half of a
   saving that is already small.
4. **`React.cloneElement` on each face to inject the window.** A face's outermost element
   is a `<section>`; a prop added there never reaches the nested `<img>`.

## Consequences

### It did not buy LCP. That is the headline, and it is measured

`npm run test:perf` (`lhci autorun`, `numberOfRuns: 5`, median asserted), same machine,
same config, before and after:

| | Before | After |
|---|---|---|
| LCP median, `/p/1` | **2,634.368 ms** | **2,634.656 ms** |
| all five runs | 2717.2 / 2630.3 / 2638.4 / 2633.4 / 2634.4 | 2645.6 / 2630.9 / 2635.9 / 2634.7 / 2631.0 |
| LCP phases (median run) | TTFB 454 / Load 0 / Load Time 0 / **Render Delay 2,180** | TTFB 454 / Load 0 / Load Time 0 / **Render Delay 2,181** |
| `resource-summary:script:size` | 144,386 B | **141,632 B** |
| document transfer | 15,751 B | 16,863 B |
| total transfer | 242,281 B | 240,639 B |
| images on `/p/1` | 0 | **0** |
| CLS | 0 | 0 |

**The gate is still RED at 2,635 ms against 2,500 ms, and `lighthouserc.json` is
untouched.** The render delay did not move by one millisecond. The page components were
2.6% of this route's script transfer; the remaining 141,632 bytes are React, the Next
runtime and Payload's shared chunks, and that — plus the Caveat face under Lighthouse's
4× CPU throttle — is what the 2,180 ms is.

### What it did buy

- The diary's own client chunk: **19,930 → 8,042 bytes** raw, 6,400 → 3,646 transferred.
  Verified by grep: no client JS chunk now contains `POSTA AEREA`, `cover-module__`,
  `contents-module__`, `notes-module__` or any Notes copy. Only the 43-byte placeholder
  GIF remains, in `Photograph`, where it belongs.
- **All thirty-three pages' text is byte-identical in the served HTML.** `curl` against a
  production build, split at every `data-leaf` boundary, diffed before against after:
  no difference at all — `leaves: 33, total text chars: 7645, leaves with zero text: 0,
  total <img>: 20, total media src: 0, total non-empty alt: 10` on both sides, and the
  same on `/p/12` and `/p/33`.
- **A flip no longer re-renders thirty-three page subtrees per animation frame.** The
  faces are stable element identities, so React skips them; only the twenty
  `<Photograph>` context consumers re-render. Not the reason for the change, but the
  reason it is worth keeping given the LCP result.
- ADR 0006's standing obligation is discharged (above).

### What it did not change

- **Courier Prime, EB Garamond italic and every weight above 400 stay deferred — but not
  for the reason ADR 0005 gives.** That ADR asked for its table to be re-run once this
  landed, so it was: Courier Prime 400 and 700 were wired in on top of this change and
  measured five more times.

  ```
  two fonts  (73,554 B, 2 requests)   LCP median 2,634.656 ms
  four fonts (112,440 B, 4 requests)  LCP median 2,632.984 ms
                                      2649.0 / 2632.0 / 2633.0 / 2632.4 / 2634.3
  ```

  **ADR 0005's finding no longer reproduces.** A third and fourth font file cost this
  route nothing measurable — 38,886 bytes of extra transfer moved LCP by less than the
  run-to-run noise. What has changed is not the font cost but the floor underneath it:
  the route now sits at ~2,634 ms with two fonts *or* four, because the 2,180 ms render
  delay dominates everything.

  They are left deferred anyway, and that is a decision, not an oversight: LCP has no
  headroom to spend (the brief for this task made wiring them conditional on headroom
  appearing, and it did not), a single five-run sample near this margin is exactly the
  evidence ADR 0005's own history warns about, and adding 38,886 bytes to a route that is
  already failing its budget is not a call to make in passing. `docs/deviations.md` §11
  and `e2e/pages.spec.ts`'s pinned-fallback test stand unchanged. What HAS changed is
  that restoring Courier Prime is now a live option blocked on a decision rather than a
  closed one blocked on a measurement.
- No visual baseline moved. All twelve committed `-linux.png` baselines matched
  unchanged in `mcr.microsoft.com/playwright:v1.62.1-noble`, in the same 186-test run
  that had `e2e/layout.spec.ts` green.

### The one new hazard

`Photograph.tsx` is the only `'use client'` file under `components/pages/`. Adding a
second — a hook, a handler, a `'use client'` on any page component — pulls that
component's whole import graph back into the route bundle and silently undoes this
change. Nothing gates it: `resource-summary:script:size` has 42,688 bytes of slack, so
the whole page tree could return without failing a budget. The check, if it is ever in
doubt, is the grep at the top of this document.
