# Architecture

Source: design spec §3 (repository structure), §6 (module seams), §8 (rendering and
routing). This document describes the target structure for the whole project; Phase 0
establishes the workspace and the domain package, later phases fill in `apps/web` and
`apps/transcoder`.

## 1 · Repository structure

```
apps/
  web/                    Next 15 App Router + Payload 3 in-process
    app/(diary)/          public book, galleries          → static + ISR
    app/(admin)/admin/    the bespoke ten-screen panel    → authenticated
    app/(auth)/signin/    password, OTP, reset
    app/(payload)/cms/    Payload's stock admin — dev only, disabled in production
    lib/                  repositories, server actions, adapters
  transcoder/             Node + sharp + ffmpeg worker, queue consumer  → DEFERRED (ADR 0004)
packages/
  domain/                 pure logic — no I/O, no framework. 100% coverage.
  tokens/                 handoff colour/type/geometry as CSS variables + typed TS
  ui/                     shared primitives: pill, washi tape, postage stamp, hairline
docs/                     architecture, ADRs, data model, API, runbook, security, testing, QA sweeps
handoff/                  the specification of record
```

`packages/domain` holds everything testable without a browser or a database: the flip
machine, book scaling, page numbering, contents pagination, bookmark spans, the OTP
challenge lifecycle, and the `BookBundle` mappers. It carries the repository's only 100%
coverage gate (`vitest.config.ts`), because every branch in it is a real behaviour rather
than framework glue.

**The rule that matters: `packages/domain` never imports from `apps/`.** Dependencies
run one way — apps and the `apps/web/lib` layer depend on the domain package, never the
reverse. A domain module that reached back into `apps/web` would no longer be testable
without a browser or a database, which defeats the reason the package exists. As of this
task, this is a structural convention stated here and in the design spec (§3), not yet a
lint-enforced import boundary — `eslint.config.js` has no `apps/**` → `packages/domain/**`
restriction wired in. Adding one (e.g. `eslint-plugin-boundaries` or a path-based
`no-restricted-imports` rule) is future hardening, not yet built.

## 2 · Module seams

Four boundaries carry the design's stated failure modes (spec §6). Each is a small
module, independently testable, named in its own header.

| Module                                  | Package                            | Contract                                                                                                                                          |
| --------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `flipMachine`                           | `packages/domain`                  | Pure reducer over `{dir, from, to, go, half, busy}` with an injected clock                                                                        |
| `bookScale`                             | `packages/domain`                  | `(area) → number`, `min(w/1300, h/860)` capped at 1.7                                                                                             |
| `bookBundle`                            | `packages/domain` + `apps/web/lib` | Payload rows in, one typed `BookBundle` out. The diary client reads nothing else.                                                                 |
| `pageStack`                             | `packages/domain`                  | `(leafIndex, FlipState, totalPages) → LeafPresentation`. Every field maps one-to-one into CSS, so the DOM layer re-derives no flip geometry. `loadsImages` extends the same idea to the image window (`docs/adr/0006-diary-image-window.md`). |
| `pageAddress`                           | `packages/domain`                  | `('<n>', totalPages) → leafIndex \| null` and `leafIndex → '/p/<n>'`. The only translation between the 1-based page number a reader shares and the 0-based index the stack works in, in both directions. `null` is "the book has no such page", which the route spends as a `404` (Task 13; it clamped before). Task 14 added the other direction of the same translation: `galleryPath(slug, leafIndex)` writes the reader's page into the gallery link the book renders, and `returningPagePath(from)` reads it back out for the gallery's back control - server-rendered at both ends, because the two alternatives (the `Referer` header; `document.referrer` after mount) are ruled out by SECURITY.md and by a measured hydration race respectively. |
| `pageMetadata`                          | `packages/domain`                  | `(BookPage, {chrome, about, pageNumber, totalPages}) → {title, description}`. What one indexable deep link tells a crawler about itself. Every field it reads is optional in the schema, so the fallbacks are the module: a blank subtitle must not become `undefined · Wanderings` or a description that is one full stop. |
| `contentWindow`                         | `packages/domain`                  | `(addressedIndex, totalPages) → ContentWindow`. Which leaves' faces a `/p/<n>` document carries — the SERVER's window, a function of the address, where `pageStack.loadsImages` is a function of the flip machine. Also owns the one search parameter with which the book asks for the rest (`docs/adr/0009-server-rendered-page-window.md`). |
| `gallery`                               | `packages/domain` + `apps/web/lib` | Payload `media` rows in, one typed `GalleryBundle` out — the gallery's counterpart to `bookBundle`, and the same rule: `components/gallery/` reads nothing else. The pure half also owns the two decisions the handoff records as having been got wrong: the open frame is addressed by `MediaId` (`openFrameById`, `stepFrame` — the index is DERIVED, for the `003 / 061` counter and nothing else), and the grid is windowed only past a hundred tiles (`tileWindow`). |
| `galleryDownload`                       | `packages/domain` + `apps/web/lib` | The download action's rules, kept out of the route handler so they can be tested at all: a root-relative path with no scheme and no authority (so it can never resolve to a bucket origin), a three-value `Content-Type` allowlist that refuses `image/svg+xml` by name, and a filename derived from the journey slug and the frame's number rather than from the stored key. `SECURITY.md`'s "downloads through your own handler" requirement lives here and in `apps/web/lib/readGalleryDownload.ts`. |
| `storage` / `mailer` / `transcodeQueue` | `apps/web/lib`                     | Ports with local and production adapters, one shared contract suite run against both                                                              |

### The book's DOM binding (`apps/web/components/book/`)

Phase 1 Task 7 added the one place the pure modules above become a page. It is
deliberately thin, and every file in it names what it is allowed to decide:

| File              | Responsibility                                                                                                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Book.tsx`        | The diary's single `'use client'` boundary. Composes frame, scaled design box, stack and every trigger; owns no arithmetic. Writes the URL on each committed page change, once the book is whole. Holds a turn or jump the served document cannot show yet, rather than revealing an empty leaf. |
| `Leaf.tsx`        | Assigns one `LeafPresentation` straight into `rotateY()`, `z-index`, `visibility`, `pointer-events`, the two face opacities and — from `isTurning` — the shade and transition duration.                 |
| `PageFace.tsx`    | Dispatch only: it maps a `BookPage`'s `kind` onto the designed page component for it, and hands down which leaf it is printed on. It carries no `loadsImages` flag — the image window reaches a photograph through the context `Book.tsx` publishes (`docs/adr/0006-diary-image-window.md`), so a page cannot forget to honour it. |
| `EdgeStrip.tsx`   | One page-edge turn strip, as a labelled button. Geometry lives in the stylesheet; see `docs/deviations.md` §8 for where it sits in the DOM and why.                                                     |
| `useTurnKeys.ts`  | The four page-turn keys, bound on `window`. Never takes a key from a text field, and calls `preventDefault` only on a key it acts on.                                                                  |
| `useFlip.ts`      | Injects a real clock into `flipReducer` from a single `requestAnimationFrame` loop that stops when the book settles. `jumpTo` anchors a bookmark jump one page from its target before turning.         |
| `useBookScale.ts` | Feeds `bookScale` a measurement, re-measured on resize and through a `ResizeObserver`, always inside one animation frame.                                                                              |
| `useRestOfBook.ts` | The one request that turns a windowed document into the whole book, made on the reader's first turn. A `router.replace` onto the SAME path with a query added — measured to be the only re-render that does not unmount the book (`docs/adr/0009-server-rendered-page-window.md`). |
| `book.module.css` | The handoff's absolute geometry, plus `.stage`'s grid — the one rule that keeps the chrome BESIDE the book rather than over it. Holds the three rules that record real defects: no `backface-visibility`, back faces always `pointer-events: none`, and only `transform`/`opacity` ever transitioned. |

### The chrome outside the box (`apps/web/components/chrome/`)

Phase 1 Task 12 added `SCREENS.md` §1.7 — the three parts of the reading surface that
are not the book. None of them decides anything: each is handed a fact `Book.tsx` or the
server already knows, and turns it into markup.

| File                | Responsibility                                                                                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BookmarkRail.tsx`  | The 158px column, as a named navigation landmark over a list of buttons. Which tab is active is `isRailTabActive` reading `deriveBookmarks`' own spans — never `[start, start + 3)` re-derived here. `aria-current="page"` is what makes the active tab's lift legible without sight. |
| `BottomBar.tsx`     | The 58px bar: two labelled arrows and the `NN / NN` counter over the page label. Both strings are derived — `pageCounter` and `derivePageLabels` — so the bar computes nothing.                                            |
| `Ribbon.tsx`        | The spine ribbon. The one piece of chrome that lies OVER the page, hence `pointer-events: none` and its own browser test; drawn only when the book's `decorations` flag is on.                                             |
| `chrome.module.css` | §1.7's measurements. One stylesheet for the three components: one class map in the route's bundle rather than three, and §1.7 is one design section. Carries the `HANDOFF-DEVIATION` at `.tabSub` (`docs/deviations.md` §15). |

### The other reading surface (`apps/web/components/mobile/`)

Phase 1 Task 15 added `SCREENS.md` §1.10, and it is a SECOND COMPONENT TREE rather than a
breakpoint over the first. §1.10 opens "No book, no flip, no scaling": below 860px the
diary is a dark header over a scrolling column over a bottom bar, with the bookmark rail
behind a drawer. Nothing in it is inside the 1300x860 design box and nothing is scaled, so
there is no media query in `book.module.css` and there must not be one - the two surfaces
never share a document. Which one a request gets is decided before either is rendered; see
`docs/adr/0011-two-reading-surfaces-chosen-on-the-server.md`.

**The two surfaces are two ROUTE ENTRIES, and that is a bundling seam, not only a
rendering one.** `app/(diary)/p/[n]/page.tsx` imports `Book`; `app/(diary)/m/[n]/page.tsx`
imports `MobileDiary`; neither imports the other's tree. While one route branched
between them, Turbopack compiled both into that route's single client chunk group —
its split is per route entry, not per import — so every desktop reader downloaded the
mobile mode's client half and its 23,923-byte stylesheet, and the LCP gate went red.
`apps/web/middleware.ts` is what joins the two entries back into one address: it reads
the cookie and the user agent, asks the same `servedReadingSurface`, and REWRITES
`/p/<n>` onto `/m/<n>` for a reader served the mobile surface, so the reader's address
never moves. `/m/<n>` is not an address — a direct request for it is answered with a
308 back to `/p/<n>`, so no page in the book has two URLs. See
`docs/adr/0012-two-route-entries-for-two-reading-surfaces.md` for the measurement and
the six alternatives it beat.

| File                    | Responsibility                                                                                                                                                                                                    |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MobileDiary.tsx`       | The surface's single `'use client'` boundary. Composes the header, the scrolling column, the bottom bar and the drawer, and owns two facts: whether the drawer is open, and the two page indices either side of this one. It does not render the page - it is handed one, exactly as `Book.tsx` is handed its faces. |
| `MobilePage.tsx`        | A SERVER component, and one generic renderer for §1.10's four page kinds - Cover, Contents, Journey (all three of a journey's pages) and About. Nothing it reaches ships to the browser.                            |
| `MobileHeader.tsx`      | The `#3b332a` bar: the 44px burger, the book title over this page's short name (`mobileHeading`), and the `NN / NN` counter (`pageCounter`). Derives nothing.                                                      |
| `BookmarkDrawer.tsx`    | The scrim and the 82%-wide panel, as a real modal: named dialog, focus moved in, Tab trapped, Escape closing. Every tab is a real `/p/<n>` link. Focus RESTORATION belongs to `MobileDiary`, which outlives it.     |
| `useSwipe.ts`           | `touchstart`/`touchend` into `shouldTurnPage`. Holds no threshold and no ratio of its own - see `packages/domain/src/swipe.ts`, where the rule that stops a scroll turning a page is stated once.                   |
| `useViewportSurface.ts` | Feeds `surfaceForWidth` a measurement, re-measured on resize and through a `ResizeObserver`, always inside one animation frame - the same shape `useBookScale` has.                                                 |
| `SurfaceCorrection.tsx` | Draws nothing. Where the measured viewport and the served surface disagree, it remembers the measurement in a session cookie and re-renders the route on the server. It reads the cookie back before refreshing, so a reader with cookies blocked keeps the surface they have rather than reloading forever. |
| `mobile.module.css`     | §1.10's measurements, in the viewport's own pixels. Carries the `HANDOFF-DEVIATION` at `.drawerTab` (`docs/deviations.md` §22).                                                                                     |

**A page change on this surface is a navigation, and that is the structural difference
from the book.** The book turns pages inside one document because a 900ms 3D flip cannot
survive its subtree being unmounted, and the whole of ADR 0009 exists to protect that. A
scrolling column has no animation in flight, no measured scale and no flip machine, so
`/p/<n>` is reached by pressing a link - which is why this surface's document carries ONE
page (22,481 raw bytes on `/p/3`, against the book's 89,589) and why three of its four
page-changing controls work before any script has run.

The rail and the bar claim `grid-area: rail` and `grid-area: bar` from `.stage` rather
than being positioned over the book, and that is structural rather than cosmetic: a
strip of chrome over the book is also a strip of chrome over the page-edge turn strips,
which then swallow their clicks in silence — nine of thirteen tabs were dead at
1000×800 for exactly that reason (`docs/qa/2026-09-01-diary-sweep.md`, DIARY-002).

**A `.js` import specifier does not survive Turbopack, and is banned repository-wide.**
Next's bundler resolves `./payload.js` to nothing when the file on disk is `payload.ts`;
Vitest and `tsc` both resolve it happily, so a file carrying one looks correct everywhere
until a Next route imports it — which `/p/<n>` was the first to do. Next's own
`experimental.extensionAlias` escape hatch is on its published list of options Turbopack
ignores, so there is no configuration fix.

`tsconfig.base.json` sets `moduleResolution: "Bundler"`, so the extension was never
required in the first place; it was a leftover NodeNext-style convention. Every relative
import in the repository is therefore extensionless, and `eslint.config.js`'s
`no-restricted-imports` rule keeps it that way — otherwise the convention creeps back and
the next person to learn about it learns from a build error naming a missing file rather
than a wrong convention. The one exemption is `apps/web/app/(payload)/**`, whose
`importMap.js` is a real `.js` file Payload generates; it is scoped to those files by
path rather than weakened globally.

`BookBundle` is the only serialization boundary between server and diary client — the
diary never learns what a Payload row looks like. `bookBundle`'s pure mapping rules
(what a `BookBundle` looks like, how derived fields like page numbers and the `03 / 33`
counter are computed) live in `packages/domain`; the half that actually reads Payload
rows and assembles one lives in `apps/web/lib`, since touching the database is I/O the
domain package is not allowed to do.

```mermaid
flowchart TB
  subgraph domain["packages/domain — pure, 100% coverage, no I/O, no framework"]
    flipMachine["flipMachine<br/>reducer over {dir, from, to, go, half, busy}<br/>injected clock"]
    bookScale["bookScale<br/>(area) to number<br/>min(w/1300, h/860), capped 1.7x"]
    bookBundleDomain["bookBundle — mapping rules<br/>page numbers, 03/33 counter,<br/>contents entries, bookmark spans"]
  end

  subgraph webLib["apps/web/lib"]
    bookBundleWeb["bookBundle — assembly<br/>Payload rows to one BookBundle"]
    storagePort["storage port"]
    mailerPort["mailer port"]
    queuePort["transcodeQueue port"]
  end

  subgraph adapters["Adapters — local dev vs. production, one shared contract suite"]
    localDisk["local disk"]
    r2["Cloudflare R2"]
    consoleMail["console adapter"]
    resend["Resend"]
    pgQueue["Postgres job table"]
    worker["Fly.io worker: ffmpeg<br/>DEFERRED — ADR 0004"]
  end

  payload["Payload collections<br/>Postgres via Neon"] --> bookBundleWeb
  bookBundleDomain --> bookBundleWeb
  bookBundleWeb --> diaryClient["Diary client<br/>scaling + flip"]
  flipMachine --> diaryClient
  bookScale --> diaryClient

  storagePort --> localDisk
  storagePort --> r2
  mailerPort --> consoleMail
  mailerPort --> resend
  queuePort --> pgQueue
  queuePort --> worker

  webLib -.->|depends on| domain
```

The dotted edge at the bottom of the diagram is half of the rule stated above, drawn:
`apps/web/lib` depends on `packages/domain`. The reverse dependency — domain code
importing from `apps/` — is not drawn at all, deliberately: an arrow reads as something
that happens, and this is something that must never happen. Its prohibition is stated in
prose above, not as a "never" edge that a skimming reader could mistake for a real one.

The `payload` node above is drawn as a plain rectangle rather than a database-cylinder
shape, because Mermaid's `[( )]` cylinder syntax nests awkwardly with a label that itself
needs punctuation, and a rectangle renders identically across Mermaid versions.

`storage`, `mailer` and `transcodeQueue` are the Ports & Adapters pattern named in
`CLAUDE.md` §3.3: a local stand-in (disk, console log, a Postgres table polled directly)
during development, a cloud service in production (R2, Resend, the Fly.io worker
consuming the same Postgres table), and one shared contract test suite run against both
so the two implementations are provably interchangeable.

**The Fly.io worker is deferred** (`docs/adr/0004-media-pipeline-mode.md`): no video
clips for now, so nothing claims jobs from `pgQueue` in production yet. A fourth port,
`MediaProcessor`, gets the same treatment when Phase 3 builds it: an `inline` adapter
(the still-image pipeline, in-process on Vercel, bypassing the queue entirely) and a
`worker` adapter (the still pipeline plus `ffmpeg`, via `pgQueue` and the Fly.io worker
above) — both required to pass the same contract suite in CI, per ADR 0004, even though
only `inline` deploys until video is turned back on.

## 3 · Data flow

1. The author edits content in the admin (`apps/(admin)/admin`), which writes to Payload
   collections in Postgres via typed repository accessors (the Repository pattern —
   the diary never learns what a Payload row looks like).
2. Publishing triggers on-demand revalidation of only the affected static paths.
3. On a request to a diary route, the server assembles one `BookBundle` from the
   relevant Payload rows and statically renders every page's content.
4. The client takes over only for scaling (`bookScale`) and flipping (`flipMachine`);
   it never re-fetches page content mid-session — real paths (`/p/<n>`, `/gallery/<slug>`)
   are written on every turn so deep links stay indexable and shareable.
   4a. A gallery is a SEPARATE route, outside the book's flip sequence: `/gallery/<slug>`
   assembles its own `GalleryBundle` (three Payload queries, whatever the gallery's
   size) and renders a header plus a grid. Returning from it restores `/p/<n>` by two
   independent paths — the browser's Back button, which works because `Book.tsx` writes
   the reader's page onto the CURRENT history entry with `replaceState` rather than
   pushing a new one, and the gallery's own back link, whose `href` the server renders
   from the `from` parameter the book's own gallery link carries (`galleryPath` writes
   it, `returningPagePath` reads it). Neither the `Referer` header (a document that
   varied by it could not be served from a CDN) nor `document.referrer` after mount (a
   reader who clicked before hydration landed on the cover) survived contact — see
   `docs/qa/2026-09-03-gallery-sweep.md`, GAL-005.
   4b. A download from that gallery goes through `/gallery/<slug>/download/<id>`, an
   application route that reads a derivative's bytes back out of the store through the
   `StoragePort` and serves them as an attachment. Never a bucket URL — see
   `docs/security.md`.
5. Uploads go straight from the browser to R2 via a presigned URL (never through Vercel,
   which caps request bodies at ~4.5MB); a server action creates the `media` row and
   runs the `MediaProcessor` port's `inline` adapter in-process (the `sharp` still
   pipeline — no queue, no worker, since video is deferred per ADR 0004), marking the
   row `ready` or `failed`. Once video is re-enabled, a `worker`-mode upload instead
   writes a job row to the Postgres queue table for the Fly.io worker to claim and run
   the `sharp`/`ffmpeg` pipeline against.

## 4 · Why each seam exists

- **`flipMachine`** — the flip is four timers and a latch; as an explicit pure reducer
  with an injected clock, illegal states (a seized book, a stranded "busy" flag) become
  unrepresentable and are unit-tested with no browser (spec §7.2).
- **`bookScale`** — the book is authored at a fixed 1300×860 design box and must stay
  resolution-independent at any viewport; extracting the scale function as pure logic
  keeps the 1.7× cap (closing the handoff's known 4K gap) testable without a DOM.
- **`pageStack`** — the flip's geometry is the part of the book that has actually gone
  wrong: a rotation keyed off the wrong field, the wrong leaf animated on a backward
  turn, a face crossfade that only worked forwards. Deriving all of it in one pure
  function means the DOM layer has nothing left to get wrong, and the browser layer's
  own tests can be about the browser (a swallowed click, a real transition) instead of
  re-testing geometry.
- **`pageStack.loadsImages`** — the same argument, applied to bytes rather than
  geometry. All thirty-three leaves are in the document, stacked at `inset: 0`, so the
  browser treats every one of them as in the viewport and `loading="lazy"` defers
  nothing. Deciding "is this leaf near enough to fetch" beside the geometry that already
  answers "is this leaf visible" is what keeps the two from disagreeing — `visible` is a
  subset of `loadsImages` by construction, so a leaf can never swing into view carrying
  an empty frame. See `docs/adr/0006-diary-image-window.md`.
- **`contentWindow`** — the other window, and the reason there are two. `loadsImages`
  needs the flip machine, which only a browser has; which pages' FACES belong in a
  served document needs only the address, which is all a server render has. They are
  therefore different functions of different inputs, and collapsing them would mean
  either freezing the image window at the page the reader arrived on or asking the
  server a question it cannot answer. What the two share is a property: a leaf can never
  become visible whose content is not in the document, because `Book` holds any move the
  window cannot serve until the rest of the book arrives. See
  `docs/adr/0009-server-rendered-page-window.md`, whose "hard part" section is the
  measurement behind that sentence.
- **`pageAddress`** — a page component cannot be run without a Next request context, so
  arithmetic living inside one is arithmetic nothing can check. Keeping the one decision
  `/p/<n>` makes in the domain package is what leaves the route itself a passthrough.
  Task 13 turned its clamp into a rejection: `/p/999` is now `null` here and `notFound()`
  there, rather than page 33 at status 200.
- **`pageMetadata`** — the same argument, applied to `generateMetadata`, which is the
  route's second untestable entry point. What looks like string interpolation is six
  fallbacks over fields an editor is allowed to leave blank, and every one of them is a
  branch a search result would show if it were wrong.

`/p/<n>` renders DYNAMICALLY, and does not declare `generateStaticParams`. That is a
measured decision rather than an omission — statically generating all thirty-three and
reading the content window's `searchParams` are mutually exclusive on one path in
Next 16, and the static build was built and measured at no LCP advantage. See
`docs/adr/0010-static-generation-and-the-content-window.md`, which also records the
route shape (hoisting `Book` into `p/[n]/layout.tsx`, widening via a child route) that
could hold both if that ever changes.
- **`bookBundle`** — one serialization boundary means the diary client's shape can never
  silently drift from what Payload happens to store; a schema change on the Payload side
  is caught at the `bookBundle` assembly step, not scattered across every component that
  reads content.
- **`storage` / `mailer` / `transcodeQueue`** — these are the three points where the app
  talks to a service outside the monorepo. Naming them as ports keeps every provider
  swappable (the mitigation the design spec's risk table records for cloud pricing
  changes) and keeps local development fully working without cloud credentials.
