# 0010 — `/p/<n>` stays dynamic: static generation and the content window cannot both hold, and static generation buys nothing here

**Status: DECIDED**, on measurements taken on this machine. The route does not
declare `generateStaticParams`. It renders on demand, server-rendering every
addressed page's content into the document exactly as it does today.

This ADR exists because the decision looks, from the outside, like something
was quietly dropped. The design spec's §8 asks the server to "statically render
every page's content"; the Task 13 brief asked for `generateStaticParams`
across all thirty-three pages; and `docs/adr/0009-server-rendered-page-window.md`
flagged the collision forward in its own concerns list rather than leaving it
to be discovered. What follows is the collision, the three ways out that were
considered, and the numbers that chose between them.

## Context

Two commitments meet on one file, `apps/web/app/(diary)/p/[n]/page.tsx`.

**The first is indexability, and it is already discharged.** `/p/<n>` is a real
path rather than a hash so the deep links can be crawled and shared (design
spec §8; the handoff warns against "a client-only SPA (destroys the deep links'
SEO value)"). Every one of the thirty-three routes serves its own page's
content in the HTML, with no JavaScript run, and `e2e/serverWindow.spec.ts`
asserts it route by route against the completed book's own rendering. That is
true of a dynamically-rendered route and a statically-generated one alike:
**server-rendering is what indexability needs; static generation is a
deployment property, not a visibility one.**

**The second is the content window** (ADR 0009, decided by the repository
owner). Each document carries the addressed page and three leaves either side
rather than all thirty-three, which took `/p/1` from 274,459 raw bytes to
65,014 and LCP from 3,083.95ms to 2,927.14ms against a 3,000ms gate. The
reader turns past that window, so the book asks the server for the rest of
itself once, by navigating to the same path with `?pages=all` on it.

**The collision.** Next 16 renders a route dynamically the moment it reads
`searchParams`. A route that reads `searchParams` cannot also be prerendered by
`generateStaticParams` — they are mutually exclusive on one path. And ADR 0009
measured that the search parameter is the ONLY signal available: Next keys each
route segment's subtree by that segment's value, so widening the window by
navigating to a different `/p/<n>` unmounts the book and throws the reader's
position and any turn in flight away (mount count 1 → 2, measured); and the
`RSC` request header, which would have been tidier, is stripped by Next before
a server component's `headers()` can read it (measured).

So: `generateStaticParams` OR the window. Not both, on this path, on this
framework version, without changing the shape of the route.

## What was measured

Both shapes were BUILT and run through `npm run test:perf` — Lighthouse
`simulate`, 150ms RTT, 1,638Kbps, 4× CPU, five runs, median asserted — on the
same machine, minutes apart, against the same seeded database.

The static variant is not hypothetical. `generateStaticParams` returning one
entry per page, with `searchParams` removed and the window derived from the
route parameter alone, prerenders exactly as intended:

```
Route (app)
└   /p/[n]
  ├ ● /p/1
  ├ ● /p/2
  ├ ● /p/3
  └ ● [+30 more paths]

●  (SSG)      prerendered as static HTML (uses generateStaticParams)
```

`prerender-manifest.json` confirms `"compute": "static"` for each of the
thirty-three, and the whole build generated 38 static pages in 1,368ms.

| | dynamic (`ƒ /p/[n]`, shipped) | static (`● /p/1 …`, spike) |
|---|---|---|
| LCP median of 5 | **2,931.04 ms** | **2,932.92 ms** |
| LCP runs | 2929.6 / 2930.8 / **2931.0** / 2935.7 / 3019.6 | 2928.2 / 2928.6 / **2932.9** / 2933.1 / 2937.6 |
| Lighthouse `server-response-time` | 77–116 ms | **1.7–2.6 ms** |
| CLS | 0 | 0 |
| Script transfer | 142,407 | 142,407 |
| `/p/1` document, raw | 64,837 | 71,457 (`htmlSize`, prerender manifest) |
| `?pages=all` still widens | yes | **no — `searchParams` is empty under static rendering** |

**Static generation removed 75–114ms of measured server response time and moved
LCP by 1.88ms**, which is inside a single set's own spread (6.4ms across the
static set's four clustered runs) and two orders of magnitude inside the 149ms
bimodality ADR 0008 documented for this measurement. It is not a small win; it
is no win the gate can see.

That is not surprising once ADR 0008's arithmetic is read again: 2,023.2ms of
this route's LCP is the framework floor with no application code on it, and a
further 445.6ms is the design's font faces. The binding constraint is the
critical chain's CPU and font work, not the origin's time to first byte — so
slack given back at the front of the request is absorbed rather than banked.
The one number that did move against the static variant is the document, which
is **6,620 bytes (10.2%) LARGER** as a prerendered file than as a rendered
response.

## The three shapes considered for keeping both

1. **Partial prerendering (`cacheComponents: true`, Next 16's successor to
   `experimental.ppr`).** It genuinely can serve a static shell with the
   `searchParams`-dependent part streamed into it, which is exactly the shape
   this route wants. Rejected on cost and blast radius: it is an
   application-wide switch that changes dynamic-API semantics for the
   `(payload)` route group as well — Payload's own admin, which this repository
   does not own — and every leaf outside the window would have to become its
   own `<Suspense>` boundary awaiting the query. A framework-wide, admin-
   affecting migration to buy 1.88ms fails CLAUDE.md §4 on its own terms.

2. **Hoisting `<Book>` into `p/[n]/layout.tsx` and moving the widening to a
   CHILD route (`/p/<n>/all`), so both are statically generated.** This is the
   "separate route rather than a search param" shape, and unlike the others it
   would work: a layout survives navigation to its own child, so the book would
   stay mounted while the faces were swapped. It was rejected on the same
   arithmetic — it is a large refactor of the one component whose mounting
   behaviour ADR 0009 had to measure four separate ways, it costs a second
   `readBookBundle` per render, it mints thirty-three more crawlable URLs that
   each need `noindex` and a canonical, and its whole return is the 1.88ms
   above. ADR 0009 rejected the sibling idea (hoisting into the `(diary)`
   layout) partly because that layout cannot know which page is addressed;
   `p/[n]/layout.tsx` CAN, so this is a real option and is recorded as one, to
   be revisited if static generation ever buys something.

3. **`generateStaticParams` declared anyway, beside the `searchParams` read.**
   Rejected outright as the worst of the three: Next silently renders the route
   dynamically, and the repository is left with a line of configuration that
   looks like a guarantee and is not. A dead declaration is worse than an
   absent one.

## Decision

**`/p/<n>` renders on demand. `generateStaticParams` is not declared, and the
content window keeps its search parameter.** The absence is recorded here and
in the route's own header, with the numbers, so it reads as a decision rather
than an oversight.

Nothing about indexability changes: every route still server-renders its own
page's content into the HTML, and `e2e/serverWindow.spec.ts` still proves it
thirty-three times over with no JavaScript run.

## Consequences

- **The diary keeps the 156.8ms the window bought** and keeps the property that
  matters more than the number: `/p/1`'s document is O(1) in journeys rather
  than O(n).
- **Every request costs six Payload queries, not thirty-three prerendered
  files.** Measured at 19–34ms to first byte locally. A future deployment that
  wants edge caching gets it with `Cache-Control`/ISR on the response rather
  than by prerendering, which is a smaller change than shape 2 above and does
  not touch the window.
- **On-demand revalidation on publish (design spec §8) is unaffected**, and
  arguably simpler: there is no prerendered artefact to invalidate. It is
  still unbuilt — nothing publishes yet.
- **A second read of the bundle appeared and had to be deduplicated.** Adding
  `generateMetadata` gave the route two entry points that each need the
  `BookBundle`, which is twelve Payload queries per document instead of six —
  the over-fetching CLAUDE.md §7 forbids. `readBookBundle` is now wrapped in
  React's per-request `cache`, which put `/p/3` back to ~29ms to first byte
  from ~45ms. This is a cost static generation would not have had, and it is
  named here rather than buried: it is real, it was measured, and it is fixed.
- **`?pages=all` is no longer duplicate content.** Every `/p/<n>` now declares
  `<link rel="canonical" href="/p/<n>">`, so a crawler that finds the widened
  address is pointed back at the page's own URL. ADR 0009's concerns list asked
  Task 13 for exactly this. The link is root-relative rather than absolute
  because this repository has no configured site origin to build an absolute
  one from — `MEDIA_ORIGIN` is the media bucket's — and a canonical resolved
  against `localhost:3000` would be worse than none.
- **The clamp is gone, which removes the other duplicate-content source.**
  `/p/999`, `/p/0`, `/p/03` and `/p/tokyo` used to be answered with page 33 or
  page 1 at status 200 — thirty-three synonyms for the last page, every one of
  them crawlable and identical. They are now 404s
  (`addressedPageIndex`, `app/(diary)/not-found.tsx`).
- **Revisit when the framework moves.** Two things would reopen this: Next
  making partial prerendering safe to enable per-route rather than per-app, or
  a deployment where origin latency, rather than the font-and-framework floor,
  becomes this route's binding constraint. Both would be measured again before
  anything changed; the spike in shape 2 is the one that would then be built.
