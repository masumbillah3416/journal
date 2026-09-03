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
| `pageAddress`                           | `packages/domain`                  | `('<n>', totalPages) → leafIndex \| null` and `leafIndex → '/p/<n>'`. The only translation between the 1-based page number a reader shares and the 0-based index the stack works in, in both directions. `null` is "the book has no such page", which the route spends as a `404` (Task 13; it clamped before). |
| `pageMetadata`                          | `packages/domain`                  | `(BookPage, {chrome, about, pageNumber, totalPages}) → {title, description}`. What one indexable deep link tells a crawler about itself. Every field it reads is optional in the schema, so the fallbacks are the module: a blank subtitle must not become `undefined · Wanderings` or a description that is one full stop. |
| `contentWindow`                         | `packages/domain`                  | `(addressedIndex, totalPages) → ContentWindow`. Which leaves' faces a `/p/<n>` document carries — the SERVER's window, a function of the address, where `pageStack.loadsImages` is a function of the flip machine. Also owns the one search parameter with which the book asks for the rest (`docs/adr/0009-server-rendered-page-window.md`). |
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
