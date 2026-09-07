# 0012 — Two route entries for two reading surfaces, joined by a rewrite

**Status: DECIDED.** Phase 1, the follow-up to Task 15. It closes the one part of Task
15's brief that task could not answer in the affirmative, and the RED LCP gate that
followed from it.

## Context

`docs/adr/0011-two-reading-surfaces-chosen-on-the-server.md` made the diary serve exactly
one of two reading surfaces per request: the book at and above 860px, `SCREENS.md`
§1.10's scrolling column below it. The choice was `servedReadingSurface`'s and was spent
by an `if` inside one route component, `app/(diary)/p/[n]/page.tsx`.

**That split the MARKUP and did not split the SCRIPT.** `/p/3`'s document is 22,481 raw
bytes for a phone against 89,589 for the book — no reader receives the other surface's
HTML. But Turbopack compiled both component trees into the route's single client chunk
group, because **the split Turbopack performs is per route ENTRY, not per import**. One
entry importing both `Book` and `MobileDiary` produced:

|                          | one chunk group                                                          |
| ------------------------ | ------------------------------------------------------------------------ |
| the route's client chunk | **20,161 B** raw, containing `data-design-box` AND `data-mobile-content` |
| the route's stylesheet   | **41,704 B** raw, containing `book-module__` AND `mobile-module__`       |

Every desktop reader downloaded the mobile mode's client half and its 23,923-byte
stylesheet; every phone downloaded the book's. Task 15 measured the cost against
`CLAUDE.md` §6's gate and reported it rather than hiding it:

|                               | LCP median      | script  | document | stylesheet | CLS |
| ----------------------------- | --------------- | ------- | -------- | ---------- | --- |
| before the mobile mode (book) | 2,936.12 ms     | 142,420 | 11,454   | —          | 0   |
| **Task 15 (book, gated)**     | **3,011.36 ms** | 148,791 | 11,531   | 10,741     | 0   |

**RED by 11.36ms against 3,000**, and 75.24ms slower than the same tree one `if` earlier.
`next/dynamic` was tried twice, the second time through Lighthouse: 148,646 bytes against
148,791, a 0.1% difference, because a dynamic import inside a server component does not
move a client reference out of the route entry it was declared in.

`docs/adr/0008-lcp-budget-and-the-framework-floor.md` bounds what is achievable here: a
route with no application code on it at all models 2,023ms of the budget, and simulated
LCP on this stack is a proxy for the end of hydration rather than for a paint. There was
never 75ms of headroom to find inside our own code; the only honest fix was to stop
shipping code the reader does not run.

## Decision

**Each reading surface gets its own route entry, and `apps/web/middleware.ts` puts a
request on the right one by rewrite.**

1. `app/(diary)/p/[n]/page.tsx` imports `Book` and `PageFace`, and nothing of the mobile
   surface but `SurfaceCorrection`.
2. `app/(diary)/m/[n]/page.tsx` imports `MobileDiary`, `MobilePage` and
   `SurfaceCorrection`, and nothing of the book.
3. `apps/web/middleware.ts` reads the two signals ADR 0011 named — the
   `td-reading-surface` cookie and the user agent's device kind — hands them to the same
   `servedReadingSurface`, and **rewrites** `/p/<n>` onto `/m/<n>` for a reader served the
   mobile surface. It takes no decision of its own.
4. `/m/<n>` **is not an address.** Next.js does not run middleware again on its own
   rewrites, so every `/m/<n>` request the middleware sees came from outside, and is
   answered with a **308** to `/p/<n>`.

**A rewrite, not a redirect, and not two public addresses.** The reader's address stays
`/p/<n>` on both surfaces, so every page has exactly one address to share, one to index
and one to declare canonical — which is the whole reason design spec §8 made `/p/<n>` a
real path. A redirect would also cost every mobile page load a round trip against a
budget that has none to give.

**Both entries declare the same metadata, from the same function.** A crawler with a
phone's user agent — Googlebot's smartphone crawler is one — is served the mobile entry
for `/p/<n>`, so metadata written into only one entry would be metadata half the crawlers
never saw. `addressedPageMetadata` (`packages/domain/src/pageMetadata.ts`, 100%-covered)
composes the address lookup and the derivation, and each entry's `generateMetadata` does
nothing to its result but shape it into Next's `Metadata`. The two cannot drift.

## The measurement

Same method as ADR 0008 and Task 15: five Lighthouse runs, `throttlingMethod: "simulate"`
(150ms RTT, 1,638Kbps, 4× CPU), median reported, inside
`mcr.microsoft.com/playwright:v1.62.1-noble` against a production `next build` served by
`next start`, on a **freshly wiped `.next` volume per configuration**. The gated row keeps
`lighthouserc.json`'s `Cookie: td-reading-surface=book`, which is what makes Lighthouse
measure the heavier book surface rather than getting the lighter mobile one from its own
phone emulation. Nothing left this machine (CLAUDE.md §7.1).

### What each route now compiles to

|                           | before (one entry) | book entry   | mobile entry |
| ------------------------- | ------------------ | ------------ | ------------ |
| client chunk, raw         | 20,161 B (both)    | **11,474 B** | 18,844 B     |
| stylesheet, raw           | 41,704 B (both)    | **28,599 B** | 13,105 B     |
| `book-module__` present   | yes                | yes          | **no**       |
| `mobile-module__` present | yes                | **no**       | yes          |

The book entry sheds 13,105 raw bytes of stylesheet it never applied — and a stylesheet is
render-blocking, which is why the LCP win is larger than the script bytes alone suggest.

### LCP and transfer

|                          | LCP median      | five runs                                                | script  | document | stylesheet | CLS |
| ------------------------ | --------------- | -------------------------------------------------------- | ------- | -------- | ---------- | --- |
| Task 15 (book, gated)    | 3,011.36 ms     | 3,010.23–3,038.43                                        | 148,791 | 11,531   | 10,741     | 0   |
| **now (book, gated)**    | **2,932.66 ms** | 2,930.69 / 2,932.46 / **2,932.66** / 2,935.45 / 2,962.96 | 149,658 | 11,492   | 12,195     | 0   |
| Task 15 (mobile surface) | 2,931.23 ms     | 2,927.21–2,945.95                                        | 148,775 | 5,208    | —          | 0   |
| **now (mobile surface)** | **2,929.58 ms** | 2,927.22 / 2,928.47 / **2,929.58** / 2,933.15 / 2,935.74 | 144,826 | 5,224    | 6,237      | 0   |

**The gate is GREEN: 2,932.66ms against 3,000, with 67.34ms of margin** — 78.70ms faster
than Task 15's tree and 3.46ms faster than the same route before the mobile mode existed
at all. `npm run test:perf` exits 0 with the pinned cookie still in place. CLS 0.

**The gated script figure needs one honest note.** 149,658 is _higher_ than Task 15's
148,791, and it is not the book's own weight. Lighthouse emulates a 412px-wide phone, and
`extraHeaders`' cookie is injected at the network layer where `document.cookie` cannot see
it — so `SurfaceCorrection` measures 412px, disagrees with the served book, writes the
cookie and refreshes, and the run then also downloads the mobile entry's 6,840-byte chunk
and 3,149 bytes of stylesheet **after LCP**. That is the mismatched reader's path, which
ADR 0011 already records as costing one round trip; it is not a byte any real desktop
reader fetches. The book surface's own transfer, measured in the same container on the
same build with no correction in the run, is **142,818 script and 9,046 stylesheet** —
down from 148,791 and 10,741. Both figures are far inside the 184,320 budget.

## Alternatives rejected

1. **`next/dynamic` around `MobileDiary`.** Tried twice before this task, the second time
   measured through Lighthouse: 148,646 against 148,791 bytes, 0.1%. A dynamic import in a
   server component does not move a client reference out of its route entry's chunk group.
   Not retried.
2. **A Turbopack chunking configuration.** Next 16.3's Turbopack exposes no
   `splitChunks`-equivalent knob in `next.config.ts`; there is nothing to configure.
3. **Building production with webpack instead.** MEASURED, not assumed: `next build
--webpack` on this repository **fails outright** —
   `TypeError: Cannot destructure property 'loadEnvConfig' of 'i(...)' as it is undefined`
   while collecting page data for `/gallery/[slug]/download/[id]`, from `@next/env` inside
   Payload's webpack output. Even had it built, it would have meant a production bundler
   that differs from the one `next dev` uses, in a Next release that has made Turbopack the
   default.
4. **Restructuring so the shared ancestor is thin enough to split naturally.** The shared
   ancestor _is_ the route entry. Turbopack groups a route's client references regardless
   of how thin the component that imports them is, which is exactly what measurement 1
   demonstrated. Nothing below the entry can change the grouping.
5. **Two public addresses (`/p/<n>` for the book, `/m/<n>` for the mobile surface), chosen
   by a redirect.** Rejected on two counts: it gives every page two crawlable addresses
   and needs a canonical to undo the damage, and it puts a redirect round trip in front of
   every mobile page load. The rewrite gets the same two entries with neither cost.
6. **A `next.config.ts` `rewrites()` with `has` clauses on the cookie and a user-agent
   regex.** It would work, and it would be a _second_ definition of which reader gets which
   surface — written in configuration no test collects, beside a domain function gated at
   100% precisely so that decision is written once. The middleware calls that function.

## Consequences

- **The middleware is on the diary's page path.** Its matcher was `['/p/:path*',
'/m/:path*']` and nothing else when this ADR was written, so Payload's `/api` and `/cms`,
  the gallery, `/_next` and every static asset were untouched. **Amended: Phase 2's ADR
  0018 added `/admin/:path*`** for the CSRF check and the admin security headers, which
  this ADR's matcher sentence went on denying for the rest of the phase (Phase 2's final
  review, finding 38). `/api` and `/cms` are still outside it — which is exactly why the
  Payload REST credential endpoints had to be closed in the collection rather than at the
  middleware (`apps/web/collections/sealedUserAuth.ts`). It is unit-tested at 100/100/100 from a plain
  `NextRequest` (`apps/web/middleware.test.ts`, ten cases).
- **`/p/<n>` now varies by `Cookie` and `User-Agent` at the middleware rather than in the
  page.** The book entry no longer reads request headers at all; it is still dynamic
  because it reads `searchParams` (ADR 0009). Any future CDN in front of this app must key
  on those two headers — which was already true, and is now true in one place.
- **A shared import is now the way the split could regress**, not a shared route. A client
  component imported by both entries is compiled into both chunk groups; one imported by
  one entry stays there. `e2e/mobile.spec.ts`'s "ships neither surface the other's code"
  fetches every script and stylesheet each surface's document asks for and fails if either
  carries the other's `*-module__` marker. It was proved to fail first, by importing
  `mobile.module.css` into `Book.tsx`.
- **ADR 0011 stands, with its alternative 5 now taken.** Which surface a reader is served,
  the cookie, the correction and its readback guard are all unchanged; only _where the
  decision is spent_ moved, from the page to the middleware.
- **`docs/adr/0009`'s window and `docs/adr/0010`'s dynamic rendering are untouched.**
  `?pages=all` is carried across the rewrite, the served window is still the book entry's,
  and all thirty-three deep links still serve their own page's content in raw HTML
  (`e2e/serverWindow.spec.ts`, green).

- **Update, after `docs/adr/0014-the-viewport-the-diary-lcp-gate-is-measured-at.md`.**
  The gated run described above — "`extraHeaders`' cookie is injected at the network layer
  where `document.cookie` cannot see it … the run then also downloads the mobile entry's
  6,840-byte chunk and 3,149 bytes of stylesheet **after LCP**" — was right about the
  mechanism and wrong about the ordering. It is a race: when the refresh won, the book
  never painted and LCP measured 3,016ms or 3,167ms instead of 2,932ms. `/p/1` is now
  collected twice, the book at a 1350x940 viewport in `lighthouserc.book.json` and the
  mobile surface on the phone emulation in `lighthouserc.json`, and the gate measures
  **142,828 script bytes** directly — the same "book surface's own transfer … 142,818"
  figure this ADR could only obtain by measuring outside the gate. The 149,658 figure and
  its honest note are now history rather than the gated number.
