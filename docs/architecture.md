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
    app/(admin)/admin/    the bespoke panel: sign-in, then the ten screens
    app/(payload)/cms/    Payload's stock admin — dev only, disabled in production
    lib/                  repositories, server actions, adapters, auth/
  transcoder/             Node + sharp + ffmpeg worker, queue consumer  → DEFERRED (ADR 0004)
packages/
  domain/                 pure logic — no I/O, no framework. 100% coverage.
  tokens/                 handoff colour/type/geometry as CSS variables + typed TS
  ui/                     shared primitives: pill, washi tape, postage stamp, hairline
docs/                     architecture, ADRs, data model, API, runbook, security, testing, QA sweeps
handoff/                  the specification of record
```

**Sign-in lives under `(admin)`, not under a group of its own.** The tree above named
an `app/(auth)/signin/` group until Phase 2 Task 7, which is where the screen was
actually built — `/admin/sign-in` — and the address is not a preference. `payload.config.ts`
moves Payload's own admin to `/cms` precisely so the bespoke panel owns `/admin`, and
`sessions.ts` scopes the session cookie `Path=/admin`: RFC 6265 sends such a cookie only
to `/admin` and its descendants, so a sign-in screen served from `/signin` would set a
cookie it could never read back and the signed-in state would never render (phase ruling
F41). `(admin)` is a third ROOT layout, alongside `(diary)`'s and `(payload)`'s, for the
same reason those two are separate: Payload wraps its routes in its own `RootLayout`, and
the diary's document is built around a scaled paper object. It declares its own
`fonts.ts` from the same five `.woff2` files rather than importing the diary group's.

**That is the CSS seam, and it is an invariant rather than a preference.** The admin group
imported `(diary)/fonts` until Phase 2 Task 11's fix round, to avoid a second set of
`@font-face` rules "for bytes the browser already has" — and no browser ever has them,
because the two groups have separate root layouts and no document loads both. What the
sharing cost was paid by the public diary: **a module reachable from both route entries
cannot be merged into either entry's stylesheet**, so it becomes a chunk of its own, and
that chunk was then served on `/p/1` — the route `CLAUDE.md` §6's LCP budget gates. Four
render-blocking stylesheets where `main` served two, and the gate went red.

So: a module imported by both `app/(diary)/**` and `app/(admin)/**` is a request the diary
pays for. One crossing remains and is deliberate — `admin.css` and `diary.css` both
`@import` `@travel-diary/tokens/tokens.css`, the single source of truth for the `--td-*`
properties — and it was measured before it was kept, at about 1.3ms of LCP.
`docs/adr/0019-the-admin-performance-gate-and-the-css-seam.md` has the isolation, the
numbers and the option it rejected.

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

| Module                                  | Package                            | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `flipMachine`                           | `packages/domain`                  | Pure reducer over `{dir, from, to, go, half, busy}` with an injected clock                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `bookScale`                             | `packages/domain`                  | `(area) → number`, `min(w/1300, h/860)` capped at 1.7                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `bookBundle`                            | `packages/domain` + `apps/web/lib` | Payload rows in, one typed `BookBundle` out. The diary client reads nothing else.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `pageStack`                             | `packages/domain`                  | `(leafIndex, FlipState, totalPages) → LeafPresentation`. Every field maps one-to-one into CSS, so the DOM layer re-derives no flip geometry. `loadsImages` extends the same idea to the image window (`docs/adr/0006-diary-image-window.md`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `pageAddress`                           | `packages/domain`                  | `('<n>', totalPages) → leafIndex \| null` and `leafIndex → '/p/<n>'`. The only translation between the 1-based page number a reader shares and the 0-based index the stack works in, in both directions. `null` is "the book has no such page", which the route spends as a `404` (Task 13; it clamped before). Task 14 added the other direction of the same translation: `galleryPath(slug, leafIndex)` writes the reader's page into the gallery link the book renders, and `returningPagePath(from)` reads it back out for the gallery's back control - server-rendered at both ends, because the two alternatives (the `Referer` header; `document.referrer` after mount) are ruled out by SECURITY.md and by a measured hydration race respectively.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `pageMetadata`                          | `packages/domain`                  | `(BookPage, {chrome, about, pageNumber, totalPages}) → {title, description}`. What one indexable deep link tells a crawler about itself. Every field it reads is optional in the schema, so the fallbacks are the module: a blank subtitle must not become `undefined · Wanderings` or a description that is one full stop.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `contentWindow`                         | `packages/domain`                  | `(addressedIndex, totalPages) → ContentWindow`. Which leaves' faces a `/p/<n>` document carries — the SERVER's window, a function of the address, where `pageStack.loadsImages` is a function of the flip machine. Also owns the one search parameter with which the book asks for the rest (`docs/adr/0009-server-rendered-page-window.md`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `gallery`                               | `packages/domain` + `apps/web/lib` | Payload `media` rows in, one typed `GalleryBundle` out — the gallery's counterpart to `bookBundle`, and the same rule: `components/gallery/` reads nothing else. The pure half also owns the two decisions the handoff records as having been got wrong: the open frame is addressed by `MediaId` (`openFrameById`, `stepFrame` — the index is DERIVED, for the `003 / 061` counter and nothing else), and the grid is windowed only past a hundred tiles (`tileWindow`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `galleryDownload`                       | `packages/domain` + `apps/web/lib` | The download action's rules, kept out of the route handler so they can be tested at all: a root-relative path with no scheme and no authority (so it can never resolve to a bucket origin), a three-value `Content-Type` allowlist that refuses `image/svg+xml` by name, and a filename derived from the journey slug and the frame's number rather than from the stored key. `SECURITY.md`'s "downloads through your own handler" requirement lives here and in `apps/web/lib/readGalleryDownload.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `otpChallenge` / `otpService`           | `packages/domain` + `apps/web/lib` | The sign-in code's lifecycle, split so the rules are pure and the I/O is not. `challengeState`/`canResend` decide validity, exhaustion and whether a resend may be sent, from three persisted numbers and an injected clock; `apps/web/lib/auth/otpService.ts` is the only place an `otpChallenges` row is read or written, and the only place a code exists at all — CSPRNG generation, a scrypt hash with a per-row salt, a SHA-256 session binding used as the lookup key, and `crypto.timingSafeEqual` for the comparison (`docs/adr/0015-otp-challenge-hashing.md`). The domain half never sees the hash, which is what keeps a test or a log line from printing one. Every limit the pure half _decides_ is _enforced_ by Postgres, not by the web process: the attempt is claimed by a conditional `UPDATE` before the code is compared, consumption is claimed the same way, and issuing counts and inserts under a per-account advisory lock — otherwise all three limits hold one request at a time and fall to a parallel burst. Two smaller pure modules sit beside it for the SCREEN rather than for the server: `otpCells` (`nextCell`, `distributePaste`) is where the six code cells' keyboard and paste behaviour lives, and `otpCountdown` (`secondsRemaining`, `formatCountdown`) turns an instant and a window into `SCREENS.md` §3.2's `{m:ss}`. `otpCountdown` takes the window as a parameter rather than importing one, because the same screen counts two of them down — `EXPIRY_MS` and `RESEND_COOLDOWN_MS` — and `otpChallenge` stays the single place either number is written.                                       |
| `rateWindow` / `rateLimit`              | `packages/domain` + `apps/web/lib` | The layer above the code's own lifecycle: `SECURITY.md`'s sliding window on sign-in attempts, per account and per IP. `admitsAttempt` is pure — given the attempts recorded for a key, the instant being judged, the window and the limit, it answers where that attempt ranks and whether the rank is inside the budget — and `apps/web/lib/auth/rateLimit.ts` is the only place a `signInAttempts` row is written or read. The seam is drawn so the window's arithmetic exists in exactly ONE place: the SQL supplies the newest `limit + 1` attempts at or before this one and applies no window floor of its own, because two copies of one rule would mean neither could be broken by itself. The window lives in Postgres rather than in the process because this app deploys to serverless invocations that do not share memory, and each request records its own attempt BEFORE anything is counted, so there is no check-then-write interval for a racer to occupy (`docs/adr/0016-rate-limit-window-storage.md`). The password endpoint's second dimension is keyed on a SHA-256 of the CLAIMED sign-in address rather than on an account row id (phase ruling F43): at that step the account is not yet known and half the requests name none, so a key that needed a row id would leave the miss path doing strictly less work than the hit path — an enumeration oracle inside the limiter. Its limit sits above Payload's `maxLoginAttempts: 5`, so for an address that names a real account the lockout `SECURITY.md` assigns that job to still binds first, and what the window governs is the address Payload has no row to lock. |
| `signIn` / `passwordReset`              | `apps/web/lib`                     | The enforcement point, and the only module that composes the four above. `apps/web/lib/auth/signIn.ts` records the attempt in both of the password endpoint's windows, reads the account by its normalised address, asks Payload to check the password (Payload is the credential store and the lockout, and nothing else), reads `users.otpRequired` FROM THE ROW, and then either issues a code bound to the identifier the browser presented or starts a session that supersedes it. `passwordReset.ts` is its sibling for "send yourself a way back in". Both exist to make three refusals indistinguishable — an unknown address, a wrong password and a locked account — in the response AND in the time taken: any branch that cannot reach Payload's own key derivation spends an equivalent one and discards it, or the identical answer is worth nothing. Neither sets a cookie; `startSession`'s `Set-Cookie` value is returned for the route handler to put on a response.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `session` / `sessions`                  | `packages/domain` + `apps/web/lib` | The session layer everything behind sign-in rests on. `sessionState`/`sessionLifetimeMs`/`sessionCookie` are pure — the lifecycle, the two lifetimes and the admin cookie's attributes; `sessions.ts` is the only place a `sessions` row is written or read. One entry point creates a session and it always rotates: the identifier the browser arrived with is superseded in the same statement that mints its replacement. The lifetime lives in the row, never in the token (`SECURITY.md`), so revoking or shortening it takes effect on the next request whatever the browser was told (`docs/adr/0017-session-store-and-rotation.md`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `signInTitle` / `readSignInScreen`      | `packages/domain` + `apps/web/lib` | The sign-in screen's own seam, and the smallest one here. The pure half fits the book's name to the cloth panel and to the narrow masthead (`SCREENS.md` §3's "fitted title", and its "28-44px" for the masthead) with the handoff prototype's own arithmetic, on the server, where no font metrics exist — measuring in the browser instead would mean client JS and a layout shift on a screen whose whole content is above the fold. `apps/web/lib/auth/readSignInScreen.ts` is the only place the screen learns anything: the `book` global's title, subtitle and cloth colour, and — the reason the module exists — `users.otpRequired`, which is what the footer line states and what `SECURITY.md`'s second prototype hole had living in `localStorage`. It fails CLOSED in both of the states this database is actually in: a `NULL` column and an empty `users` table both read as "the code step is on", the same `!== false` test `signIn.ts` applies to the same column.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `storage` / `mailer` / `transcodeQueue` | `apps/web/lib`                     | Ports with local and production adapters, one shared contract suite run against both                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

### The book's DOM binding (`apps/web/components/book/`)

Phase 1 Task 7 added the one place the pure modules above become a page. It is
deliberately thin, and every file in it names what it is allowed to decide:

| File               | Responsibility                                                                                                                                                                                                                                                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Book.tsx`         | The diary's single `'use client'` boundary. Composes frame, scaled design box, stack and every trigger; owns no arithmetic. Writes the URL on each committed page change, once the book is whole. Holds a turn or jump the served document cannot show yet, rather than revealing an empty leaf.                                   |
| `Leaf.tsx`         | Assigns one `LeafPresentation` straight into `rotateY()`, `z-index`, `visibility`, `pointer-events`, the two face opacities and — from `isTurning` — the shade and transition duration.                                                                                                                                            |
| `PageFace.tsx`     | Dispatch only: it maps a `BookPage`'s `kind` onto the designed page component for it, and hands down which leaf it is printed on. It carries no `loadsImages` flag — the image window reaches a photograph through the context `Book.tsx` publishes (`docs/adr/0006-diary-image-window.md`), so a page cannot forget to honour it. |
| `EdgeStrip.tsx`    | One page-edge turn strip, as a labelled button. Geometry lives in the stylesheet; see `docs/deviations.md` §8 for where it sits in the DOM and why.                                                                                                                                                                                |
| `useTurnKeys.ts`   | The four page-turn keys, bound on `window`. Never takes a key from a text field, and calls `preventDefault` only on a key it acts on.                                                                                                                                                                                              |
| `useFlip.ts`       | Injects a real clock into `flipReducer` from a single `requestAnimationFrame` loop that stops when the book settles. `jumpTo` anchors a bookmark jump one page from its target before turning.                                                                                                                                     |
| `useBookScale.ts`  | Feeds `bookScale` a measurement, re-measured on resize and through a `ResizeObserver`, always inside one animation frame.                                                                                                                                                                                                          |
| `useRestOfBook.ts` | The one request that turns a windowed document into the whole book, made on the reader's first turn. A `router.replace` onto the SAME path with a query added — measured to be the only re-render that does not unmount the book (`docs/adr/0009-server-rendered-page-window.md`).                                                 |
| `book.module.css`  | The handoff's absolute geometry, plus `.stage`'s grid — the one rule that keeps the chrome BESIDE the book rather than over it. Holds the three rules that record real defects: no `backface-visibility`, back faces always `pointer-events: none`, and only `transform`/`opacity` ever transitioned.                              |

### The chrome outside the box (`apps/web/components/chrome/`)

Phase 1 Task 12 added `SCREENS.md` §1.7 — the three parts of the reading surface that
are not the book. None of them decides anything: each is handed a fact `Book.tsx` or the
server already knows, and turns it into markup.

| File                | Responsibility                                                                                                                                                                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BookmarkRail.tsx`  | The 158px column, as a named navigation landmark over a list of buttons. Which tab is active is `isRailTabActive` reading `deriveBookmarks`' own spans — never `[start, start + 3)` re-derived here. `aria-current="page"` is what makes the active tab's lift legible without sight. |
| `BottomBar.tsx`     | The 58px bar: two labelled arrows and the `NN / NN` counter over the page label. Both strings are derived — `pageCounter` and `derivePageLabels` — so the bar computes nothing.                                                                                                       |
| `Ribbon.tsx`        | The spine ribbon. The one piece of chrome that lies OVER the page, hence `pointer-events: none` and its own browser test; drawn only when the book's `decorations` flag is on.                                                                                                        |
| `chrome.module.css` | §1.7's measurements. One stylesheet for the three components: one class map in the route's bundle rather than three, and §1.7 is one design section. Carries the `HANDOFF-DEVIATION` at `.tabSub` (`docs/deviations.md` §15).                                                         |

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

| File                    | Responsibility                                                                                                                                                                                                                                                                                                       |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MobileDiary.tsx`       | The surface's single `'use client'` boundary. Composes the header, the scrolling column, the bottom bar and the drawer, and owns two facts: whether the drawer is open, and the two page indices either side of this one. It does not render the page - it is handed one, exactly as `Book.tsx` is handed its faces. |
| `MobilePage.tsx`        | A SERVER component, and one generic renderer for §1.10's four page kinds - Cover, Contents, Journey (all three of a journey's pages) and About. Nothing it reaches ships to the browser.                                                                                                                             |
| `MobileHeader.tsx`      | The `#3b332a` bar: the 44px burger, the book title over this page's short name (`mobileHeading`), and the `NN / NN` counter (`pageCounter`). Derives nothing.                                                                                                                                                        |
| `BookmarkDrawer.tsx`    | The scrim and the 82%-wide panel, as a real modal: named dialog, focus moved in, Tab trapped, Escape closing. Every tab is a real `/p/<n>` link. Focus RESTORATION belongs to `MobileDiary`, which outlives it.                                                                                                      |
| `useSwipe.ts`           | `touchstart`/`touchend` into `shouldTurnPage`. Holds no threshold and no ratio of its own - see `packages/domain/src/swipe.ts`, where the rule that stops a scroll turning a page is stated once.                                                                                                                    |
| `useViewportSurface.ts` | Feeds `surfaceForWidth` a measurement, re-measured on resize and through a `ResizeObserver`, always inside one animation frame - the same shape `useBookScale` has.                                                                                                                                                  |
| `SurfaceCorrection.tsx` | Draws nothing. Where the measured viewport and the served surface disagree, it remembers the measurement in a session cookie and re-renders the route on the server. It reads the cookie back before refreshing, so a reader with cookies blocked keeps the surface they have rather than reloading forever.         |

### The admin's request boundary (`apps/web/middleware.ts` + `apps/web/lib/auth/`)

Phase 2 Task 10 joined the sign-in screens to the services behind them. The thing worth
carrying out of it is **where each decision runs, and why the two halves cannot be
merged**, because the obvious arrangement — all of it in the middleware — authenticates
nobody.

```
request for /admin/…
  │
  ├─ apps/web/middleware.ts  (EDGE runtime: no pg, no Payload, no node:crypto)
  │    ├─ isCrossSiteMutation → 403, empty body, admin headers on it
  │    ├─ adminSecurityHeaders({ development }) on every response
  │    └─ mints a pre-auth td-session for an anonymous browser on a public GET
  │
  └─ the route  (NODE runtime)
       ├─ page  → requireAdminSession()      ─┐  authenticateAdminRequest
       └─ POST  → authenticateAdminRequest()  ┘  reads the sessions row
```

**The split is by what each half can know.** Whether an identifier names a LIVE row is a
question only Postgres can answer, and the Edge runtime cannot ask it. Substituting "is a
cookie present" is not a weaker version of the same check — it is a different one, and it
would pass for every revoked session, every expired one, and every anonymous visitor, since
the pre-auth identifier this surface mints for browsers that have not signed in is carried
in the same cookie. `docs/adr/0018-admin-request-policy-and-the-guard-split.md` records the
five arrangements considered.

**The path policy is default-deny.** `apps/web/lib/auth/adminAccess.ts` lists the addresses
that answer without a session — the steps of signing in and of getting back in — and
everything else under `/admin` is guarded, including screens nobody has written yet.

**What stops Phase 4 forgetting the guard is two mechanisms, and only one is a check.**

A Server Action cannot be written unguarded: `guardedAction()`
(`apps/web/lib/auth/guard.ts`) calls the guard and then the action, and
`eslint-rules/guarded-server-actions.js` — an ESLint rule over the AST, with no `files`
list, so there is no directory it does not reach — reports any export of a `'use server'`
module that is not a call to it, any re-export from such a module, and any `'use server'`
directive inside a function body.

**The rule's reach is proved rather than asserted, and the two earlier versions of this
paragraph claimed more than the code did.** A lint rule can only judge a file ESLint hands
it, and ESLint hands it the extensions some config block's `files` array names — for four
rounds none named `.jsx`, so an unguarded `'use server'` module written as `actions.jsx`
passed `eslint .` at exit 0 while a running dev server mounted it as a real action
endpoint. `eslint.config.js` now names that extension, and
`apps/web/lib/auth/adminGuardRegistration.test.ts` no longer takes any extension list on
trust: it walks git's own listing of the repository, finds every file whose BYTES carry
`'use server'` at any extension in any directory, and asks ESLint's own API whether each
one is a file it lints with this rule at `error`. Text finds candidates nobody enumerated;
the AST decides whether they are guarded.

**What gets through, measured rather than reasoned about.** Thirty-three shapes have been
written to disk and run against the real gate: **the twenty-three from the third whole-branch
review's own table, re-run against this version, plus ten new ones** — and the
twenty-three already include the nine that defeated the text scans, the five that beat the
scan round 5 replaced and the three that beat round 5's own rule. **Thirty-two of the thirty-three fail `npm run verify`.** Two of
them fail it without failing `npm run lint`, which is the point of having both: a disable
comment in a directory nobody listed, and a module at an extension ESLint still does not
enumerate, are caught by the coverage case rather than by the rule. The one shape that gets
through is a module carrying an `eslint-disable` comment in a file `.gitignore` also hides
— which cannot be committed, and whose `.gitignore` line would be in the same diff. A
disable comment on its own is deliberate: it is one reviewable line, and the files allowed
to carry one are enumerated by exact path in `adminGuardRegistration.test.ts`, read off
git's listing rather than off a directory list.

Route files are checked rather than constructed, because a page is not built from a
factory: `apps/web/lib/auth/adminGuardRegistration.test.ts` walks the whole `app/` tree,
computes each file's address the way Next.js does — so a second route group is measured at
the address it really answers at — requires each route file at a guarded address either to
be declared public or to APPLY the guard in its own body, and FAILS on any file under an
admin address whose kind it does not recognise. It follows nothing a file imports. Both run
in the pre-commit gate. `docs/adr/0018` records the nine text scans that preceded this and
why enumeration was the wrong mechanism.

| File                               | Responsibility                                                                                                                                                                                                                                                                                                               |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/auth/adminAccess.ts`          | The three edge-safe decisions: which addresses are public, whether a mutation came from one of our own pages, and the headers every admin response carries (`adminSecurityHeaders`, which differs between development and production in one keyword). Imports nothing but `resetPath.ts`, because the middleware imports it. |
| `lib/auth/browserSession.ts`       | The two cookies a browser carries through a sign-in: the identifier in `td-session` (minted from Web Crypto, so it works in both runtimes) and the one bit of "keep me signed in" the code step would otherwise lose. Also the two clears, both `Path=/admin` — RFC 6265 keys a cookie by name AND path.                     |
| `lib/auth/guard.ts`                | The authority on who a request is. Reads the cookie, asks `sessions.authenticate`, returns a `Result`; `requireAdminSession` is the Server Component binding that redirects.                                                                                                                                                 |
| `lib/auth/httpForm.ts`             | What every endpoint does with a raw `Request` before any decision: read its fields (an unparseable body is an empty submission, never a `500`), name the address and the device, and answer `303`.                                                                                                                           |
| `lib/auth/services.ts`             | The composition root: the one place the real Payload, mailer, admin origin and clock are chosen.                                                                                                                                                                                                                             |
| `lib/auth/signInEndpoints.ts`      | The password step, the code step and signing out, as three functions of a `Request`. One refusal branch for the password step, deliberately, so the three answers that must be indistinguishable cannot be separated later.                                                                                                  |
| `lib/auth/resetRequestEndpoint.ts` | `POST /admin/reset/request`, and the `GET` that keeps the address a 404.                                                                                                                                                                                                                                                     |
| `lib/auth/readCodeScreen.ts`       | What `/admin/sign-in/code` prints: the challenge bound to the browser's identifier, or a placeholder that echoes nothing when there is none.                                                                                                                                                                                 |

**Every route file under `app/(admin)` is one line** — but for a guarded route that line
APPLIES the guard: `export const POST = guarded(handleSignOut)`. A route handler is an
ordinary function of a `Request`, and neither Vitest project can execute one, so a decision
left in a route file is a decision nothing can measure; the guard is the exception, and it
is there so `adminGuardRegistration.test.ts` can read the route file and follow nothing.
That check credited a route for whatever a module it imported contained until it did.

**The one-time-code route is `force-dynamic`, and was silently static.** `Date.now()` was
evaluated at build time, so the countdown read `0:00` for every reader minutes after a
deploy — invisible in development, where each request re-renders. It reads `cookies()` now
as well, which forces the same thing; `lib/auth/codeScreenRoute.test.ts` fails if the
declaration goes, and `npm run build` prints `ƒ (Dynamic)` beside it.

### The back room's front door (`apps/web/components/admin/`)

Phase 2 Task 7 added `SCREENS.md` §3's sign-in screen — the first thing in
`apps/web/components/admin/`, and the first screen of the bespoke panel. Task 8 added its
second state and Task 9 the remaining three. Six components, one stylesheet, and one
client boundary per pane that needs one — two of the six need none.

**All six panes are drawn inside one shell, and that is the whole reason `SignInShell`
takes `children`.** `SCREENS.md` §3 is one screen with four states in it; the frame is
identical in every one and only the pane changes. Six route entries hand it a different
pane — `/admin/sign-in`, `/admin/sign-in/code`, `/admin/reset` (in either of §3.3's
states), `/admin/reset/<token>` (in any of its three) and `/admin/sign-in/done` — and none
of them has needed a line of the frame changed.

| File                  | Responsibility                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SignInShell.tsx`     | The frame: the desk (which IS the route's `<main>`, so nothing sits outside a landmark and nothing empty is added to satisfy one), the shell's grid, the cloth panel with its spine, stitches, rules, ribbon and "PRIVATE / 01" stamp, the narrow masthead, and the form panel. A SERVER component — no hooks, no handlers, no state — so the frame costs the route nothing in the browser. It takes the step as `children`, which is what lets §3's other three states reuse it unchanged.                                                                                                                                                   |
| `PasswordStep.tsx`    | §3.1's pane, and the route's only `'use client'` module. Three pieces of state and no more: whether the password is revealed, which field the reader has to fix, and whether the server's own refusal is still standing. It is a real `<form method="post">` rather than a `fetch`, so a reader with no JavaScript can still sign in; the handler it posts to is `POST /admin/sign-in/password` (Task 10), and the refusal it draws is `passwordStepView`'s — one message for every reason a sign-in can be refused.                                                                                                                          |
| `CodeStep.tsx`        | §3.2's pane, the second `'use client'` module on this screen, and the most intricate thing in it: six `flex: 1` cells, an expiry countdown, a resend cooldown, an attempts counter and a shake. It owns none of the arithmetic — `nextCell` and `distributePaste` (`@travel-diary/domain/auth/otpCells`) decide what the keyboard and the clipboard do, `secondsRemaining`/`formatCountdown` (`otpCountdown`) turn an instant into `{m:ss}`, and every number comes from `otpChallenge`'s own constants. TWO real `POST` forms, not one with two buttons, so verifying and resending each say what they are for and neither needs JavaScript. |
| `ResetStep.tsx`       | §3.3's pane, in both of its states. `'use client'`, for one piece of state: whether the address the reader typed is worth posting. The state itself is the SERVER's, arriving as a `ResetRequestView` — there is deliberately no branch here for an address that names no account, because `SECURITY.md` §3 requires one answer for both and a screen that could draw two would be the oracle the whole path is shaped to avoid.                                                                                                                                                                                                              |
| `NewPasswordStep.tsx` | The pane the mailed link lands on, which `SCREENS.md` does not describe at all (`docs/deviations.md` §36) and which is assembled from §3.3's own surface. `'use client'`, for the Show/Hide and the empty-field refusal. Its token is rendered only as a hidden field's value and appears in no heading, message or log; the expired state prints none at all.                                                                                                                                                                                                                                                                                |
| `SignedInStep.tsx`    | §3.4's pane, and the only one of the five that is a SERVER component. It has no state to hold: two anchors and one `<form method="post">`, so the screen needs no JavaScript to work and the route ships none for it. Sign-out is a `POST` rather than a link precisely because a link would let a prefetch, a crawler or another site's `<img>` sign a reader out.                                                                                                                                                                                                                                                                           |
| `signIn.module.css`   | §3's measurements. NARROW IS A MEDIA QUERY, not a measured width: the prototype reads `window.innerWidth` and re-measures on resize, which here would mean every phone painting the wide layout first and reflowing after hydration. Carries the `HANDOFF-DEVIATION` at the cloth gradient and the cloth eyebrow (`docs/deviations.md` §32).                                                                                                                                                                                                                                                                                                  |

**The shake is the one place a pane reaches the frame, and it does it through the
stylesheet rather than through the DOM.** `SCREENS.md` §3.2 shakes THE SHELL when a code
is refused, and the shell is a server component that holds no state. So `CodeStep` raises
`data-code-step-shaking` on its own root and `signIn.module.css` animates
`.shell:has([data-code-step-shaking='true'])`. That keeps the frame free of client
JavaScript, and it puts the animation somewhere a `prefers-reduced-motion` query can
switch it off — which `e2e/codeStep.spec.ts` reads back off the computed style under both
settings, because a test that only checked the flag was raised would say nothing about the
query.

**The reset path is the one journey on this surface that crosses the server twice, and
Task 9's seam is drawn so that neither route file decides anything.** A Next.js page
component cannot be run by either Vitest project, and `/admin/reset/[token]` sits under a
bracketed directory where `@vitest/coverage-v8`'s ignore hints are documented not to hold
(CLAUDE.md §2.1) — so a branch in either file is a branch nothing can measure. There is
none. `@travel-diary/domain/auth/resetScreen` holds the two rules (`resetRequestView`,
`newPasswordView`) at the domain's 100% bar; `apps/web/lib/auth/setNewPassword.ts` is the
only place a reset link is read or spent; `apps/web/lib/auth/newPasswordScreen.ts` turns
HTTP into those calls and back, and is driven by an integration test with a real `Request`
and a real Payload. `app/(admin)/admin/reset/set/route.ts` is one line: `export const POST
= handleSetNewPassword`.

**A dynamic segment answers for its siblings until it is told not to.**
`app/(admin)/admin/reset/[token]` matches ANY single segment under `/admin/reset`,
including `/admin/reset/request` — the address SCREENS.md §3.3's own "Send the link"
button posts to, which Task 10 mounted. Mounting the token route therefore turned that
address from a 404 into a 200 drawing "That link has expired", invisibly to every suite,
because every test addressed the routes directly and none posted the form (ruling F56).
The seam that fixes it is the same one as everything else here: the LIST of segments that
are routes rather than tokens is `apps/web/lib/auth/resetPath.ts`'s
`RESERVED_RESET_SEGMENTS` (pure, unit-gated), the 404 is raised by
`readNewPasswordScreen` (integration-gated), and the route file still decides nothing.
`resetPath.test.ts` reads the addresses this surface posts to off its own source and the
static routes off the filesystem, and fails the build if either names a segment the list
does not.

**Mounting the handler did not retire the reservation, and it added a `GET` for a
different reason.** A static route wins over a dynamic sibling only while it is mounted at
that exact path, so the list stays. And a `route.ts` exporting only `POST` makes Next
answer `405` to a `GET` — a different answer from the `404` the address gave the day
before — so `app/(admin)/admin/reset/request/route.ts` exports a `GET` that calls
`notFound()`. There is nothing at that address to fetch; it is a form's action.

**Which state that screen draws is decided by the LINK, not by the address bar.**
`linkState` asks Payload whether the token still names a row whose expiry is in the
future; `newPasswordView` combines that with the query, and a spent link draws the expired
state whatever the query asks for. A form drawn for a token that cannot work is a password
typed for nothing — and there is deliberately no `state=expired` for the endpoint to
redirect with, because one fact read in one place cannot disagree with itself.

**The one thing to understand about this screen is where the footer line's answer comes
from.** It states whether the one-time-code step runs, and `SECURITY.md`'s second
prototype hole is that the handoff kept that flag in `localStorage`, where anyone could
set it to `0`. Here `PasswordStep` is handed `codeStepRequired` as a prop, the route read
it from `users.otpRequired` before rendering, and no module on this screen touches
browser storage at all. That is asserted against the DELIVERED page rather than the
source — `e2e/signIn.spec.ts` records every `Storage` read the page makes, searches every
script it fetches for the prototype's key, and plants that key with the opposite answer
before navigating.
| `mobile.module.css` | §1.10's measurements, in the viewport's own pixels. Carries the `HANDOFF-DEVIATION` at `.drawerTab` (`docs/deviations.md` §22). |

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

> **The diagram below has never been rendered, and that is UNRESOLVED rather than fine.**
> No Mermaid renderer is installed on this machine, and `CLAUDE.md` §7.1 forbids pasting
> repository content into an online one to get a green tick — an unresolved check is
> honest and costs a follow-up; a check bought by publishing the repository cannot be
> undone. What HAS been done is an audit of the diagram as text against the filesystem,
> which is what produced findings 30 and 45 of Phase 2's final review. Installing
> `@mermaid-js/mermaid-cli` locally and running `mmdc` over this file would settle the
> syntax; nothing else here can.

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
`MediaProcessor`, is to get the same treatment when Phase 3 builds it: an `inline`
adapter (the still-image pipeline, in-process on Vercel, bypassing the queue entirely) and
a `worker` adapter (the still pipeline plus `ffmpeg`, via `pgQueue` and the Fly.io worker
above) — both required to pass the same contract suite in CI, per ADR 0004, even though
only `inline` would deploy until video is turned back on.

**NOT BUILT.** Neither `MediaProcessor` adapter, the port itself, the contract suite or the `MEDIA_PIPELINE` variable exists in this repository: `grep -rn MediaProcessor apps packages` returns nothing, `apps/web/lib/ports/` holds only `mailer.ts`, `queue.ts` and `storage.ts`, `MEDIA_PIPELINE` is declared in neither `apps/web/lib/env.ts` nor `.env.example`, and setting it changes nothing. `docs/adr/0004-media-pipeline-mode.md` says so itself — _Nothing in this ADR is built now_ — and five documents described it in the present tense anyway (Phase 2's final review, finding 30). It is Phase 3's.

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
5. **(Phase 3, not built — see the note under §2's ports.)** Uploads will go straight from
   the browser to R2 via a presigned URL (never through Vercel, which caps request bodies
   at ~4.5MB); a server action will create the `media` row and run the `MediaProcessor`
   port's `inline` adapter in-process (the `sharp` still pipeline — no queue, no worker,
   since video is deferred per ADR 0004), marking the row `ready` or `failed`. Once video is re-enabled, a `worker`-mode upload instead
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
