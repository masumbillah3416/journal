# API

Every route and server action: input, output, errors, auth requirement. This is the
contract `CLAUDE.md` §1.2 requires this document to hold.

## Contract for every entry in this document

Whenever a route or server action is added, it is documented here **in the same commit**
(`CLAUDE.md` §1.3), as a row or subsection with these fields, in this order:

| Field                  | Meaning                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Path / action name** | The URL for a route; the exported function name for a server action                                                             |
| **Method**             | `GET`/`POST`/etc. for a route; "server action" for a server action                                                              |
| **Input**              | Request params/body, or the server action's argument type — the Zod schema that validates it at the boundary (`CLAUDE.md` §3.1) |
| **Output**             | Response shape or return type                                                                                                   |
| **Errors**             | Every error case the caller can observe, and what triggers each                                                                 |
| **Auth requirement**   | None / signed-in / signed-in with a specific capability                                                                         |

A stale entry here is worse than a missing one — changing a route's behaviour means
updating its row in the same commit that changes the code (`CLAUDE.md` §1.3).

## Status

Eight routes exist today: Payload's own four, mounted under the `(payload)` route
group; three of the diary's own — `/p/<n>`, added with the book itself in Phase 1
Task 7 and completed in Task 13; and `/gallery/<slug>` with its download handler
`/gallery/<slug>/download/<id>`, added in Task 14 — and the bespoke admin's first,
`/admin/sign-in` and `/admin/sign-in/code`, added in Phase 2 Tasks 7 and 8. Phase 2 Task
10 added the four `POST` endpoints those screens post to and the request policy every
`/admin` address is now put through — see "The admin's request policy" below, which applies
to every row in the "Admin routes" section and is stated once rather than in each. `/p/<n>` was completed in Task 13 — which gave it a real `404` in place of its clamp, per-page
metadata and a canonical link, and settled in
`docs/adr/0010-static-generation-and-the-content-window.md` why it stays dynamic. Both sets are documented in full below. Everything still unbuilt is
listed further down as **planned**, using only what the design spec (§8) already
specifies, so each phase has a contract to build against rather than inventing one
mid-phase.

## Payload-owned routes (live today)

These four are not hand-written handlers — each re-exports a handler from
`@payloadcms/next`, so their behaviour is Payload's, not ours. They are documented here
anyway, in full, because they are real, reachable HTTP surface: `CLAUDE.md` §1.2 asks
this document for _every_ route, and an exposure surface nobody wrote down is an
exposure surface nobody reviews.

**Authorization, for all of them.** None of these routes carries its own auth check.
Every one runs Payload's collection- and global-level access control on the operation it
performs. Four collections declare `access` and they do not all say the same thing:

- `jobs`, `otpChallenges` and `signInAttempts` refuse every operation outright —
  `read`, `create`, `update` **and `delete`**, all four predicates. The `delete` one is
  this repository's addition; leaving it out is what let deletion fall through to
  Payload's "signed in, or refused" default, which is Ruling F32 and
  `docs/data-model.md`'s §"The `delete` predicate".
- `sessions` declares **per-user ownership** rather than a flat refusal: `read`,
  `update` and `delete` each return a `Where` constraining the operation to the caller's
  own rows, and `create` is refused for everyone. See `apps/web/collections/sessions.ts`.
- `media` declares a **public-read** rule: a signed-out caller gets
  `{ hidden: { not_equals: true } }` rather than a refusal, so unhidden media is
  **served, not refused** — including through `/api/media/file/<name>`. That is
  deliberate and is what the public diary depends on (`docs/security.md`'s
  "A hidden media item stays hidden from a signed-out reader" row).

Every other collection and global inherits Payload's default access,
`({ req: { user } }) => Boolean(user)` — **signed in, or refused**. Phase 4 tightens the
remainder per `docs/security.md`.

**Nothing can be signed in through these routes any more.** `users` carries an `auth`
block, so Payload mounted a set of credential endpoints on it — `POST /api/users/login`
chief among them, which minted a Payload auth cookie on an email and a password **alone**:
no one-time code, no per-IP or per-address window, no anti-enumeration, and outside
`apps/web/middleware.ts`'s matcher and therefore outside the CSRF check and the admin
CSP. That was the second authentication surface Phase 2's final review found (B5). Those
endpoints are now sealed in `apps/web/collections/sealedUserAuth.ts` and `users` declares
`graphQL: { disableMutations: true }`, so the same bypass is closed in both protocols.
The one way to a session is `POST /admin/sign-in/password` and the code step behind it.
Because no Payload auth cookie can be minted at all, the "signed in, or refused" default
above now refuses **every** caller on this surface, and `media`'s public read is the only
thing `/api/**` serves.

**`admin.disable` does not gate these routes.** `payload.config.ts` sets
`admin.disable: process.env.NODE_ENV === 'production'`, which disables Payload's _admin
panel_ only. Payload's own type documentation is explicit that the way to disable the
REST and GraphQL endpoints is to delete the `app/(payload)/api` directory, not to set
this flag. `/api/**` and `/api/graphql` therefore stay live in production and are
governed solely by the access control above. The playground is the one exception, and
for a different reason — see its row.

### `ALL /api/<...slug>`

- **Path:** `apps/web/app/(payload)/api/[...slug]/route.ts`.
- **Method:** `GET`, `POST`, `PATCH`, `PUT`, `DELETE`, `OPTIONS` — Payload's REST API,
  mounted at `routes.api`'s default `/api`.
- **Input:** Payload's REST conventions: the collection or global slug and document id
  in the path, its query language (`where`, `depth`, `limit`, `sort`, `locale`) in the
  query string, and a document body on writes. Validation is Payload's own field
  validation, derived from `apps/web/collections/*` and `apps/web/globals/*`; there is
  no Zod schema at this boundary because no code of ours sits at it.
- **Output:** Payload's REST envelopes — `{ docs, totalDocs, page, ... }` for a list,
  the document for a read, `{ message, doc }` for a write.
- **Errors:** `400` on validation failure, `401` when unauthenticated,
  `403` when access control refuses, `404` for an unknown collection/global/document,
  `500` on an unhandled failure.
- **Auth requirement:** signed in, for every collection and global except `media` — see
  the paragraphs above. `jobs`, `otpChallenges` and `signInAttempts` refuse every request
  through this route regardless of who is signed in; `sessions` narrows to the caller's
  own rows; `media` serves unhidden items to a signed-out caller, deliberately. And since
  the `users` credential endpoints are sealed, **no caller can be signed in here at all**:
  in practice this route serves unhidden media and refuses everything else. The sealed
  endpoints answer `404` with Payload's own "Route not found" body, byte-identical to an
  address that was never mounted.

### `POST /api/graphql`

- **Path:** `apps/web/app/(payload)/api/graphql/route.ts`.
- **Method:** `POST`.
- **Input:** a GraphQL request body (`{ query, variables, operationName }`) against the
  schema Payload generates from the same collections and globals.
- **Output:** a GraphQL response (`{ data, errors }`).
- **Errors:** returned in the response's `errors` array rather than as status codes —
  including the authorization refusals, which surface as `FORBIDDEN`/`UNAUTHORIZED`
  extensions on a `200`.
- **Auth requirement:** identical to the REST route — the same access control runs, on
  the same operations. A GraphQL query is not a way around it. `users` declares
  `graphQL: { disableMutations: true }`, so `loginUser`, `forgotPasswordUser`,
  `resetPasswordUser`, `refreshTokenUser` and `unlockUser` are **not in the schema**: the
  REST sealing above is not a way around it either. `users` queries stay in the schema
  because `sessions.user` is a relationship to it.

### `GET /api/graphql-playground`

- **Path:** `apps/web/app/(payload)/api/graphql-playground/route.ts`.
- **Method:** `GET`.
- **Input:** none.
- **Output:** the GraphQL Playground HTML page, configured with
  `request.credentials: 'include'` so it sends the caller's Payload session cookie.
- **Errors:** `404 Route Not Found` when it is disabled (see below).
- **Auth requirement:** **none on the route itself.** The page is served unauthenticated
  to anyone who can reach it; it is a _schema browser and request console_, and the
  queries a visitor fires from it run under that visitor's own session, so it grants no
  data an unauthenticated caller could not already request against `/api/graphql`. What
  it does expose without a session is the full shape of the schema.
- **Where it is exposed:** Payload serves the playground unconditionally whenever
  `NODE_ENV !== 'production'`, and in production only if both `graphQL.disable` and
  `graphQL.disablePlaygroundInProduction` are false. `disablePlaygroundInProduction`
  defaults to `true` (Payload's own config defaults) and this repository does not
  override it, so **the playground returns 404 in production and is fully open in
  development** — including on any non-production deployment (a preview build, a
  staging environment) that is reachable from outside a developer's machine. Phase 2
  should either delete this route or set `graphQL.disable` explicitly rather than rely
  on a default this repository has never stated; recorded here so the decision is a
  decision.

### `GET /cms/<...segments>` (and its 404 view)

- **Path:** `apps/web/app/(payload)/cms/[[...segments]]/page.tsx`, with
  `not-found.tsx` for unmatched segments and `app/(payload)/layout.tsx` wrapping both.
- **Method:** `GET` (a React Server Component route; its mutations travel as Next.js
  server-function calls through the `serverFunction` handler in that layout).
- **Input:** `segments` — the admin screen path (`collections/journeys`, an id, `login`,
  …) — plus that screen's query string.
- **Output:** Payload's generated admin UI. `routes.admin` is `/cms`, not `/admin`, so
  it never collides with the bespoke panel Phase 4 builds at `/admin`.
- **Errors:** Payload's own 404 view for an unmatched segment; the login screen (rather
  than an error) for an unauthenticated visitor.
- **Auth requirement:** signed in, enforced by Payload's admin views; every operation
  reached from it also re-runs the collection access control described above. **In
  practice nobody can sign in here:** this screen's login form posts to
  `POST /api/users/login`, which is sealed (see the paragraph on the second
  authentication surface above). `/cms` is therefore a screen anyone can load and nobody
  can get past, in development as in production, and that is the recorded cost of closing
  B5 — `docs/deviations.md` §"Payload's own admin can no longer be signed into".
- **Where it is exposed:** this is the one route `admin.disable` does gate —
  `payload.config.ts` sets it to `process.env.NODE_ENV === 'production'`, so the panel
  is development-only. That flag is deprecated upstream; the durable form of the same
  guarantee is deleting this route directory in production, which is Phase 4's job once
  the bespoke panel replaces it.

## Diary routes (live today)

### `GET /p/<n>` (and its 404 view)

- **Path:** `apps/web/app/(diary)/p/[n]/page.tsx`, with `app/(diary)/not-found.tsx` for
  an address the book has no page for, and `app/(diary)/layout.tsx` as the route group's
  own root layout wrapping both (parallel to `(payload)`'s, so the diary inherits none of
  Payload's admin chrome).
- **Method:** `GET` — a React Server Component route.
- **Input:** `n` — a 1-indexed page number, path parameter. Not a `PageId`; a positional
  index into the book's ordered page list, since it is meant to be a short, memorable,
  shareable URL (design spec §8). It is interpreted by
  `addressedPageIndex` (`packages/domain/src/pageAddress.ts`), not by this route, which
  holds no logic of its own. One optional query parameter, `pages=all`, is read: it is
  the book's own request for the pages its document left out
  (`docs/adr/0009-server-rendered-page-window.md`), never anything a reader types, and
  the response to it declares `/p/<n>` as its canonical URL so it is not a second
  crawlable address for the same page.
- **Output:** ONE OF TWO READING SURFACES, server-rendered from one `BookBundle`
  (`apps/web/lib/readBookBundle.ts`) and opened at the leaf `n` addresses. At and above
  860px it is the book: every leaf of the stack, with the faces inside the served content
  window, and the client taking over only for scaling (`useBookScale`) and flipping
  (`useFlip`). Below 860px it is `SCREENS.md` §1.10's mobile reading mode - a header, the
  ONE addressed page, a bottom bar and a bookmark drawer - and the client takes over only
  for the swipe and the drawer. The two are never both in a document: the mobile one is
  22,259 raw bytes on `/p/3` against the book's 89,269. Which one this request gets is
  `servedReadingSurface`'s (`packages/domain/src/readingSurface.ts`); see
  `docs/adr/0011-two-reading-surfaces-chosen-on-the-server.md`.
- **Which route entry answers:** the two surfaces are **two route entries**, and this one
  path serves both. `apps/web/middleware.ts` takes the decision above and, for a reader
  served the mobile surface, REWRITES the request onto `app/(diary)/m/[n]/page.tsx` —
  a rewrite, so the reader's address stays `/p/<n>` and the page keeps one shareable,
  indexable, canonical URL. They are separate entries because Turbopack's client split is
  per route entry, not per import: one entry importing both trees shipped each surface the
  other's chunk and stylesheet, and took the LCP gate red. Both entries answer with the
  same title, description and canonical link, from the same `addressedPageMetadata` —
  a mobile-user-agent crawler (Googlebot's smartphone crawler is one) is served the mobile
  entry. See `docs/adr/0012-two-route-entries-for-two-reading-surfaces.md`.
- **Request headers read:** two, both read by the middleware and handed straight to the
  domain without interpretation. `Cookie` - for `td-reading-surface`, the session cookie a
  previous correction wrote (`docs/security.md`); and `User-Agent` - for its device kind,
  through Next's own `userAgent()` parser, which is what gets a phone the mobile surface
  on its first paint rather than a flash of the book. The page components themselves read
  no request headers at all; `/p/[n]` is dynamic because it reads `searchParams`.
- **Errors:** `404` for any `n` the book has no page for — outside `1..33`, padded with a
  leading zero, or not a whole page number at all. `addressedPageIndex` returns `null` and
  the route calls `notFound()`, which renders `app/(diary)/not-found.tsx` under the
  diary's own layout. This **replaces the clamp** the route shipped with through Task 12:
  `/p/999` used to be answered with page 33 at status `200`, which told a crawler that
  thirty-three synonyms for the last page were all real pages and told a reader that a
  broken link had worked. `pageStack.ts` still clamps a stale `state.index`, and that is a
  different case — the book's own state disagreeing with itself, where landing on a real
  page is a recovery, rather than the reader's input, where it is a lie about what they
  asked for. A Payload failure while assembling the bundle surfaces as a `500`, since
  `readBookBundle` throws on the two boundary invariants it enforces (a journey missing
  `startsOn`; a media item with no derivative of any tier).
- **Auth requirement:** none. The public diary needs no authentication
  (`SECURITY.md`, "Sessions and access") — except that `site.passwordProtect`, when set,
  must gate this route server-side; a client-side check leaves the content fetchable
  (`docs/security.md`). **That gate is not built yet** and is tracked in
  `docs/security.md`, not discharged here.
- **Notes:** the URL is written on every turn (flip commit, bookmark jump) and read on
  load, so the reader's exact page survives a reload or a shared link. On the mobile
  surface there is nothing to write: a page change there IS a navigation to `/p/<n>`, so
  the address is correct by construction and `history.replaceState` has no part in it. As of
  Task 8 that write is live, and as of Task 13 it is asserted end to end
  (`e2e/routing.spec.ts`: turn two pages, click a page footer's real
  `/gallery/<slug>` link, go back, and the address is still the page the reader had
  turned to). `Book.tsx` calls `window.history.replaceState` with
  `pagePath(state.index)` from an effect keyed on the machine's committed index — the one
  moment the reader's page actually changes, whichever trigger caused it. It replaces
  rather than pushes, so reading thirty pages does not bury the page the reader arrived
  from under thirty history entries, and it is `replaceState` rather than a router
  navigation because a navigation would re-render the route and take the book's own flip
  state with it. Returning from `/gallery/<slug>` must restore the `/p/<n>` the reader was
  on, not `/`.
- **Metadata:** each page carries its own `<title>`, `<meta name="description">` and
  `<link rel="canonical">`, derived by `addressedPageMetadata`
  (`packages/domain/src/pageMetadata.ts`, which composes the address lookup with
  `pageMetadata`'s derivation so that BOTH route entries can declare the same three
  without either holding a decision to drift on) from the page and the book global — the page's
  own label before the book's title (`Tokyo — Notes · Wanderings`), and the editor's own
  words as the description where there are any. Thirty-three deep links sharing one title
  are thirty-three results nobody can tell apart, which throws away most of what real
  paths bought. The canonical is root-relative: this repository has no configured site
  origin (`MEDIA_ORIGIN` is the media bucket's), and a canonical resolved against
  `localhost:3000` would be worse than none.
- **Rendering:** dynamic (`ƒ /p/[n]`), server-rendered per request. It does **not**
  declare `generateStaticParams`, and that is a measurement rather than an omission:
  statically generating all thirty-three and reading `searchParams` are mutually
  exclusive on one path in Next 16, `searchParams` is the only signal that widens the
  content window without unmounting the book, and the 33-route static build was built and
  measured at 2,932.92ms LCP against this route's 2,931.04ms — no win the gate can see.
  See `docs/adr/0010-static-generation-and-the-content-window.md`. `readBookBundle` is
  wrapped in React's per-request `cache` so this route's two reads of it —
  `generateMetadata`'s and the page component's — cost six Payload queries between them
  rather than twelve.
- **Still to come:** on-demand revalidation of affected paths on publish (design spec §8).
  Nothing publishes yet, so there is nothing to revalidate; it is named here so the gap
  between this row and the design spec is a recorded decision rather than an omission.

### `GET /m/<n>` — the mobile surface's route entry, which is not an address

- **Path:** `apps/web/app/(diary)/m/[n]/page.tsx`.
- **Method:** `GET` — a React Server Component route.
- **Reached by:** a rewrite from `/p/<n>` in `apps/web/middleware.ts`, and by nothing
  else. Nothing in the diary links to it and no sitemap names it. It exists so the
  bundler has two route entries to split (`docs/adr/0012-two-route-entries-for-two-reading-surfaces.md`);
  served through the rewrite it renders `SCREENS.md` §1.10's mobile reading mode under the
  reader's own `/p/<n>` address, with that page's title, description and canonical.
- **Direct request:** **`308 Permanent Redirect` to `/p/<n>`**, for every `n`, including
  one the book has no page for. Next.js does not re-run middleware on its own rewrites, so
  a `/m/<n>` request the middleware sees came from outside — a crawler that found the path
  or a reader who typed it — and is sent to the page's one public address rather than
  answered there. Left reachable, it would give all thirty-three pages a second crawlable
  URL. Asserted in `e2e/routing.spec.ts`.
- **Input, output, errors, auth:** as `GET /p/<n>` above, except that it reads no query at
  all: the mobile surface changes page by navigating, so its document carries the ONE
  addressed page and never `servedContentWindow`'s seven.

### `GET /gallery/<slug>`

- **Method:** `GET`.
- **Input:** `slug` — the journey's slug, path parameter (`journeys.slug`, unique,
  indexed). No query, no body, no header is read.
- **Output:** an HTML document: that journey's gallery (`SCREENS.md` §1.8) — the header's
  back control, "Full gallery" eyebrow, the journey's name with `{place} · {dates}`
  beside it and a `{n} photos · {m} clips` census, then a `repeat(auto-fill,
minmax({thumbSize}px, 1fr))` grid of one square tile per visible frame. Its content is
  `apps/web/lib/readGalleryBundle.ts`'s `GalleryBundle`. `generateMetadata` returns the
  page's own title (`{name} — Full gallery`), description and a canonical
  `/gallery/<slug>`.
- **Errors:** `404` for a slug naming no journey, and for a journey that is unpublished,
  archived or soft-deleted — one response for all four, rendered by
  `app/(diary)/not-found.tsx`. `hidden` media items are excluded from the grid
  regardless of slug validity, in the query rather than by access control (the Local API
  overrides access control, so a reader rule alone would not exclude them).
- **Auth requirement:** none. Subject to the same `site.passwordProtect` gate as
  `/p/<n>` once that setting exists, and to `site.indexGalleries` governing whether this
  route is crawlable — neither setting is written by anything yet, so neither is wired
  (`docs/security.md`).

### `GET /gallery/<slug>/download/<id>`

- **Method:** `GET`.
- **Input:** `slug` — the journey's slug; `id` — the media row's id. Both path
  parameters, both read as opaque strings and matched against the database rather than
  parsed; nothing from the request body or headers is read, so the response never varies
  by caller.
- **Output:** the bytes of one derivative (`hero`, else `frame`, else `tile`, else
  `thumb` — never `hero2x`, and never the uploaded original), with
  `Content-Disposition: attachment; filename="<slug>-<nnn>.<ext>"`, a `Content-Type`
  from a three-value allowlist (`image/jpeg`, `image/png`, `image/webp`),
  `X-Content-Type-Options: nosniff`, `X-Robots-Tag: noindex` and
  `Cache-Control: public, max-age=3600`. The filename is derived from the journey's slug
  and the frame's position in the gallery, never from the stored key.
- **Errors:** `404`, with the body `Not found`, for every refusal: no such journey; the
  journey is unpublished, archived or soft-deleted; no such media row; the row belongs
  to another journey; the row is `hidden`; the row's `allowDownload` is `false`; the row
  has no derivative; the derivative's stored mime type is not on the allowlist; the
  bytes are missing from the store. **One response for all nine, deliberately** — a
  handler that distinguished them would be the enumeration oracle `SECURITY.md` requires
  this route to close.
- **Auth requirement:** none.
- **Notes:** this is the handler `SECURITY.md` demands ("the gallery's download action
  must serve a derivative through your own handler, not a bucket URL"). The prototype's
  own lightbox links straight at the image; this route replaces that. A short-lived
  signed URL was considered and not taken: this app already fronts the store, so a
  signed URL would add an expiry to think about without removing a hop — see
  `docs/deviations.md` §17.

## The admin's request policy (applies to every admin route below)

`apps/web/middleware.ts` runs on `/admin/:path*` and applies three things to every request
under it, before any route file is entered. They are stated once here because they are the
same for every row in this section, and `docs/adr/0018-admin-request-policy-and-the-guard-split.md`
records why they live in the middleware while the session check does not.

- **Cross-site mutations are refused with `403` and an empty body.** Any method but `GET`,
  `HEAD` or `OPTIONS` must carry an `Origin` header equal to the request's own origin —
  scheme, host and port, exactly. **An absent `Origin` is refused too**, which is what
  makes the check real rather than decorative: every browser released since 2016 sends one
  on a form `POST`. The practical cost is that a hand-rolled client (`curl`, a script) must
  send `Origin` to post to any address below, and this is where that is documented rather
  than discovered. **A real browser form does send one** — that is what the
  `Referrer-Policy` note below is about.
- **Every admin response carries the admin's security headers:**
  `Content-Security-Policy: default-src 'self'; base-uri 'none'; object-src 'none';
frame-ancestors 'none'; form-action 'self'; connect-src 'self'; font-src 'self';
img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'`,
  plus `Referrer-Policy: same-origin`, `X-Content-Type-Options: nosniff` and
  `X-Robots-Tag: noindex, nofollow`. In DEVELOPMENT, and only there, `script-src` also
  carries `'unsafe-eval'`, which React's development build needs and its production build
  does not — both measured. The `403` above carries these headers too. **The diary's own
  responses carry none of them** — asserted one header at a time in
  `apps/web/middleware.test.ts`.

  **`Referrer-Policy` is `same-origin`, and `no-referrer` was a blocking defect.** Under
  `no-referrer` a form-navigation `POST` sends `Origin: null` per the Fetch standard, so
  every form on this surface answered `403` in a real browser while the whole suite — which
  set the `origin` header itself — stayed green. `same-origin` keeps `Origin` populated for
  the same-origin posts this app makes and still sends nothing cross-origin, so
  `/admin/reset/<token>`'s live token never leaves in a `Referer`.

- **A pre-auth identifier is minted** into `td-session` for a browser arriving at a public
  admin address on a safe method with no session cookie at all. It authenticates nothing
  (no `sessions` row names it); it exists so `signIn` has the non-null `browserSession` it
  requires and so a one-time code can be bound to the browser that asked for it. It is
  never minted over a cookie the browser already holds, never on a guarded address, and
  never on a mutation.

**Which addresses are guarded.** `apps/web/lib/auth/adminAccess.ts` lists the public ones —
`/admin/sign-in`, `/admin/sign-in/password`, `/admin/sign-in/code`,
`/admin/sign-in/code/verify`, `/admin/reset`, `/admin/reset/request`, `/admin/reset/set`,
and the reset link's own `/admin/reset/<token>` — and **everything else under `/admin` is
guarded**, including addresses nobody has written yet. Guarding is
`apps/web/lib/auth/guard.ts`'s `authenticateAdminRequest`, which reads the identifier out of
the cookie and asks the `sessions` table whether it names a live row; a page calls
`requireAdminSession`, which redirects to `/admin/sign-in` on any refusal.
`apps/web/lib/auth/adminGuardRegistration.test.ts` fails the pre-commit gate for any mounted
admin address that is neither declared public nor calls the guard.

**Nothing under `/api` can authenticate from this cookie.** It is `Path=/admin`, so a
browser never sends it to `/api/...`. Payload's four routes above authenticate with
Payload's own cookie or an `Authorization: JWT …` header, judged by the collection access
rules; `signIn.ts` discards the JWT `payload.login` mints, so signing in here issues no
`/api` credential.

## Admin routes (live today)

### `GET /admin`

- **Path:** `apps/web/app/(admin)/admin/page.tsx`; the pane is
  `apps/web/components/admin/PanelHome.tsx`.
- **Method:** `GET`. This route answers nothing else.
- **Input:** the session cookie, and nothing else. No path parameter, no query, no body.
- **Output:** an HTML document: the admin panel's root — a "The back room" eyebrow, the
  heading "Still being furnished", a line saying what is behind the door today, the four
  groups of screens `SCREENS.md` §2 specifies, a primary "Read the diary" to `/p/1`, and a
  borderless "Sign out and start again" posting to `/admin/sign-out`. `metadata` sets the
  document title and `robots: { index: false, follow: false }`.
- **Errors:** none observable. The screen is fixed content and decides nothing.
- **Auth requirement:** **signed in.** `requireAdminSession` runs before anything is
  drawn; an absent cookie, an identifier naming no row, a revoked row, an expired row and
  the pre-auth identifier the middleware mints for anonymous browsers are all answered with
  a `303` to `/admin/sign-in`.
- **Notes:** **this address had nothing mounted at it, and that was blocker B2.**
  `SCREENS.md` §3.4's signed-in pane has a primary action, "Open the admin panel", pointing
  here; verified against the built route manifest, `/admin` had no entry, so a reader who
  completed the entire sign-in journey and pressed the primary button got a `404`. There
  was no row here for it, no `docs/deviations.md` entry and no e2e case walking it.

  **The screen itself is ours, not the handoff's** (`docs/deviations.md` §44): §2 describes
  the panel, and Phase 4 builds it. The two alternatives were a `404` — the defect as found
  — and a redirect back to `/admin/sign-in/done`, which makes the primary action a button
  that visibly does nothing, the same silent-failure species as the resend that sent no
  code. Phase 4 replaces the whole of this route.

  **It is the first guarded address on this surface that is not part of signing in**, which
  is why `e2e/signInJourney.spec.ts` walks it in both directions: from the signed-in
  screen's own button, and from a browser with no session at all.

### `GET /admin/sign-in`

- **Method:** `GET`. This route answers nothing else; see the note below.
- **Input:** one optional query value, `state`, and it has two words.
  `POST /admin/sign-in/password` redirects here with `?state=refused` for every refusal a
  caller WITHOUT the password can provoke — an unknown address, a wrong password, a locked
  account, a spent rate-limit window — and with `?state=code-unsent` when the password was
  ACCEPTED and no code could be sent. `@travel-diary/domain/auth/signInScreen`'s
  `passwordStepView` is what interprets both, and any other value — including one somebody
  typed — draws the plain form. Nothing else is read: no body, and no cookie, because
  nobody has said who they are yet.
- **Output:** an HTML document: `SCREENS.md` §3's shell with §3.1's password step in it —
  the cloth panel and its "PRIVATE / 01" stamp above 820px, the narrow masthead below,
  and the form panel's eyebrow, "Welcome back", lede, Email, Password with its Show/Hide,
  the remember-me checkbox, the submit button and the footer line stating whether the
  one-time-code step is on. With `?state=refused`, the error box §3.1 specifies is drawn
  above the button, saying "Those details did not let you in." — **one message for every
  reason a sign-in can be refused by somebody who does not hold the password**
  (`docs/deviations.md`, since the prototype never refuses one and so has no copy for it).
  With `?state=code-unsent` the same box says "Your password was right, but the code could
  not be sent. Try again shortly." — reachable only on the far side of a password Payload
  accepted, which is why it may say so. Until Phase 2's final review both cases wrote
  `refused`, so resubmitting a CORRECT password inside the thirty-second resend cooldown
  was answered by telling the reader their details were wrong (blocker B1). Its content is `apps/web/lib/auth/readSignInScreen.ts`'s
  `SignInScreenContent` — the `book` global's title, subtitle and cloth colour, and
  `users.otpRequired`. `metadata` sets the document title and `robots: { index: false,
follow: false }`.
- **Errors:** none observable. Every absent value degrades rather than throwing: a
  cleared title or subtitle prints nothing, an unset cloth colour falls back to the
  handoff's default, and an absent account — which is the seeded database's actual state
  — reads as "the code step is on", the same fail-closed answer `signIn.ts` gives the
  same column.
- **Auth requirement:** none. It is the door. It is `Disallow`ed in `public/robots.txt`
  and carries its own `noindex` for the reason that file's header gives.
- **Notes:** the address is not a preference. `apps/web/payload.config.ts` moves
  Payload's own admin to `/cms` so this panel owns `/admin`, and `sessions.ts` scopes the
  session cookie `Path=/admin` — RFC 6265 sends such a cookie only to `/admin` and its
  descendants, so a sign-in screen served from anywhere else would set a cookie it could
  never read back (phase ruling F41).

  **The `POST` this screen makes is `/admin/sign-in/password`**, mounted in Phase 2 Task
  10 and documented in its own row below. It is a sibling route because a Next.js page
  cannot answer a `POST` at its own address, and its path is
  `PASSWORD_STEP_ENDPOINT`, exported from `apps/web/components/admin/PasswordStep.tsx` so
  the handler mounts at the path the form actually posts to rather than at a second
  spelling of it.

  **The footer line is `SECURITY.md`'s second prototype hole, closed.** It states whether
  the code step runs, and it is answered by `users.otpRequired` read on the server before
  the document is rendered — never from `localStorage['om-diary-otp']`, where the
  handoff's prototype kept it and where anyone could set it to `0`. That is asserted
  against the delivered page rather than the source: `e2e/signIn.spec.ts` records every
  `Storage` read the page makes (none), downloads every script it fetches and searches
  each for that key (none names it), and plants the key with the opposite answer before
  navigating, requiring the line not to move.

  **"Forgotten" links to `/admin/reset`, which Task 9 mounted** — see its own row below.
  Both that link and the emailed one are built from a single constant,
  `apps/web/lib/auth/resetPath.ts`'s `RESET_PATH`, and `resetPath.test.ts` asserts a route
  file exists at that address and at its `[token]` child rather than only that two
  spellings of it agree.

### `GET /admin/sign-in/code`

- **Method:** `GET`. This route answers nothing else; the two `POST`s made from it go to
  sibling paths named below.
- **Input:** **the session cookie, which is the whole basis of this screen**, and one
  optional query value. The cookie carries the pre-auth identifier the challenge is bound
  to; `apps/web/lib/auth/readCodeScreen.ts` reads it and answers with the masked address a
  code went to, the instant it was issued and the guesses spent, or a placeholder that
  names nobody when the browser holds no live challenge. The query value is `state`, with
  two words: `wait` when `POST /admin/sign-in/code/verify` would not judge the guess, and
  `unsent` when `POST /admin/sign-in/code/resend` sent no new code.
  `@travel-diary/domain/auth/codeScreen`'s `codeStepNotice` interprets both, and any other
  value — including one somebody typed — draws no notice. No body is read.
- **Output:** an HTML document: the same `SCREENS.md` §3 shell `/admin/sign-in` draws,
  with §3.2's one-time-code step in the form panel — "← Back to password", the "Second
  step" eyebrow, "Check your email", "A six-digit code went to {masked}. It expires in
  {m:ss}.", a rule, the "The code" eyebrow, six `flex: 1` cells at `9px` gap, the error
  box when there is something to say, "Verify and sign in", and the resend button
  opposite the attempts counter. The shell's own content is
  `apps/web/lib/auth/readSignInScreen.ts`'s `SignInScreenContent`; the pane's numbers are
  the domain's — `EXPIRY_MS`, `RESEND_COOLDOWN_MS` and `MAX_ATTEMPTS` from
  `@travel-diary/domain/auth/otpChallenge`, counted down by
  `@travel-diary/domain/auth/otpCountdown`. `metadata` sets the document title and
  `robots: { index: false, follow: false }`.
- **Errors:** none observable. Every absent value degrades exactly as the password step's
  does, and the pane itself has no failing path: it draws the same document for every
  caller.
- **Auth requirement:** none. A reader here has no session by definition, which is why
  `ADMIN_PUBLIC_PATHS` declares this address. It is `Disallow`ed in `public/robots.txt`
  and carries its own `noindex`.
- **Notes:** **the pending challenge is wired**, as of Task 10's fix round
  (`docs/deviations.md` §33 carries the closure). A browser holding a live challenge is
  shown the address the code actually went to, a countdown measured from when it was
  issued, and the guesses it has spent; a browser holding none is shown `maskEmail('')` —
  `•••`, which echoes nothing — with the countdown measured from the render. Refusing the
  latter outright would make this route an oracle for whether a given browser holds a
  challenge; drawing the placeholder does not.

  **Both `POST`s this screen makes are mounted.** The code form targets
  `/admin/sign-in/code/verify` (`CODE_STEP_ENDPOINT`) and the resend targets
  `/admin/sign-in/code/resend` (`RESEND_ENDPOINT`); each has its own row below. The resend
  row's earlier claim that it "resolves to a `404`" was closed in Task 10 and is corrected
  here.

  **Two answers this screen used to give in silence now carry a word.** A guess the rate
  limiter would not judge, and a resend that sent nothing, both leave the spent count
  untouched — and everything this pane says was derived from that count, so a reader who
  pressed a button got back the page they had pressed it on, including a reader who had
  typed the CORRECT code (final review findings 6 and 14).

  **The code is posted as six repeated `code` fields, not one.** Each cell is
  `<input name="code" maxLength={1}>`, so the handler reads
  `formData.getAll('code').join('')` and gets the digits in document order — which is
  what lets a reader with no JavaScript at all submit a code. The `onPaste` handler
  exists because `maxLength="1"` truncates a pasted string to one character before
  `change` fires; `e2e/codeStep.spec.ts` proves the whole six-digit paste against a real
  clipboard.

### `GET /admin/reset`

- **Method:** `GET`. This route answers nothing else; the `POST` the form makes goes to a
  sibling path named below.
- **Input:** one optional query value, `sent` — the masked address the reset endpoint
  redirects with. It decides which of `SCREENS.md` §3.3's two states is drawn, through
  `@travel-diary/domain/auth/resetScreen`'s `resetRequestView`: absent is the pending
  state, present is the sent state. **Whatever it holds is passed through `maskEmail`
  before it is printed**, so a hand-typed whole address renders as `he•••@…` and a value
  that is not an address at all renders as `•••`. Nothing this repository writes ever puts
  an unmasked address in that parameter — a URL reaches every access log between here and
  the reader (CLAUDE.md §7).
- **Output:** an HTML document: the same `SCREENS.md` §3 shell every sign-in state is
  drawn in, with §3.3's reset pane in the form panel. _Pending:_ "← Back to sign in", the
  "Forgotten" eyebrow, "Send yourself a way back in", a lede, a rule, one Email field,
  "Send the link", and "The link works once and lasts an hour. Nothing about the diary
  changes until you use it." _Sent:_ the same head with "Check your email", then the green
  confirmation block (`rgba(47,107,104,.07)`, a 14px rotated `#2f6b68` mark, the masked
  address), "Sign in with the new password" and "Send it again". `metadata` sets the
  document title and `robots: { index: false, follow: false }`.
- **Errors:** none observable. There is no state for an address that names no account,
  deliberately — see below.
- **Auth requirement:** none. It is reached from the door.
- **Notes:** **there is exactly one screen for an address that exists and one that does
  not, because there is exactly one code path.** `SECURITY.md` §3 requires the reset
  endpoint to "respond identically whether or not the address exists", and
  `apps/web/lib/auth/passwordReset.ts` discharges it by deriving the masked address from
  what was _submitted_ rather than from a row. This route is told one thing — whether a
  request was made — so a "no such account" state is not something it could draw without
  first being handed the answer the whole path exists to withhold.

  **The `POST` this screen makes is `/admin/reset/request`** (`RESET_REQUEST_ENDPOINT`,
  exported from `apps/web/components/admin/ResetStep.tsx` so the handler mounts at the path
  the form actually posts to), mounted in Phase 2 Task 10 and documented in its own row
  below. `?sent=` is what that endpoint redirects here with.

  **That 404 is held by a reservation, not by absence (ruling F56).** This row said the
  address 404s "exactly as the password step's does", and that was measurably wrong:
  `POST /admin/sign-in/password` 404s because nothing is mounted near it, whereas
  `/admin/reset/request` sits under `GET /admin/reset/<token>` below, whose dynamic
  segment matches ANY single segment — so for one commit it answered `200` with the
  expired screen, telling a reader that a link they had never asked for was dead.
  `apps/web/lib/auth/resetPath.ts`'s `RESERVED_RESET_SEGMENTS` names `request` and `set`,
  `readNewPasswordScreen` answers `notFound()` for either, and `resetPath.test.ts` fails
  the build if a further address appears under `/admin/reset/` without being reserved.
  **Task 10 mounting the handler did not retire the reservation** — a static route wins
  over a dynamic sibling only while it is mounted at that exact path — and the mounted route
  exports a `GET` of its own answering `404`, because a `route.ts` with only a `POST`
  answers `405`, which is not the answer this address gave the day before.

  **"Send it again" is a link back to this screen, not a second request.** The
  confirmation is told the masked address and nothing else, so there is nothing left to
  resend with; a reader who wants another link types the address again
  (`docs/deviations.md` §37).

### `GET /admin/reset/<token>`

- **Method:** `GET`. This is the address the reset email has named since Task 5; the
  `POST` its form makes goes to `/admin/reset/set`, below.
- **Input:** the token as the last path segment, and one optional query value, `state`.
  Which screen is drawn is `apps/web/lib/auth/newPasswordScreen.ts`'s
  `readNewPasswordScreen`: it asks `linkState(token)` whether the token still names a row
  whose `resetPasswordExpiration` is in the future, then
  `@travel-diary/domain/auth/resetScreen`'s `newPasswordView` combines that with `state`.
  **The link overrules the query**: a spent token draws the expired state whatever the
  address bar asks for, so a form is never drawn for a token that cannot work. The only
  `state` value that means anything is `rejected`, which the endpoint below redirects
  with; there is deliberately no `state=expired`, because the link's own state is read
  here, and one fact read in one place cannot disagree with itself.
- **Output:** an HTML document: the §3 shell with the set-a-new-password pane in it.
  _Form:_ "← Back to sign in", the "Forgotten" eyebrow, "Choose a new password", a lede, a
  rule, one password field with a right-inset Show/Hide, a hidden `token` field, and "Set
  the new password". _Rejected:_ the same, with "That password was not accepted. Try a
  longer one." in §3.1's error box. _Expired:_ "That link has expired", a lede, a rule and
  "Send yourself another", with **no form and no field at all**. `metadata` sets the
  document title and `robots: { index: false, follow: false }` — which matters more here
  than on any other screen, since this address carries a live credential in its path.
- **Errors:** `404` for a **reserved segment** — `request` and `set`, the two addresses
  this surface names under `/admin/reset/` that are routes rather than tokens
  (`RESERVED_RESET_SEGMENTS`, ruling F56). Everything else is not an error: a token that
  names nothing is the expired state, served `200`.
- **Auth requirement:** the token is the authorisation. Nothing else is read.
- **Notes:** **this screen is not in the handoff.** `SCREENS.md` §3.3 draws the reset
  _request_ in two states and stops; the prototype has no screen for the link, because a
  prototype can pretend the link worked. Phase ruling F47 gave it to Task 9, and it is
  assembled from §3.3's own surface rather than invented (`docs/deviations.md` §36).

  **`linkState` is a read, and it is an oracle on purpose.** An unauthenticated request
  can ask whether any string is a live reset token. What that buys is bounded by the token
  itself — Payload mints 20 CSPRNG bytes — and the alternative, drawing a form for a token
  that cannot work, is worse for the reader and no better for an attacker, who can ask the
  same question by posting a password against it.

  **The token is never printed.** It reaches the pane as a prop and is rendered only as a
  hidden field's value; the expired state renders it nowhere at all, which
  `e2e/reset.spec.ts` asserts against the delivered markup.

### `POST /admin/reset/set`

- **Method:** `POST`. The first `POST` endpoint the bespoke sign-in surface has.
- **Input:** a form body with two fields, `token` and `password`, parsed with Zod at the
  boundary (`apps/web/lib/auth/newPasswordScreen.ts`). Both are plain strings with no
  further rule: an empty password is a real submission Payload refuses on its own terms,
  and an empty token is a real submission that matches no row. **The token travels in the
  body rather than in the path** — a URL is the most copied, logged and forwarded part of
  a request, and it is already in the address the reader arrived at; there is no reason to
  put it in a second one.
- **Output:** always a `303 See Other` with an empty body, never a rendered page. Three
  destinations: `/admin/sign-in` when the password is set,
  `/admin/reset/<token>?state=rejected` when Payload refused the password, and
  `/admin/reset/<token>` when the link itself was refused (the screen's own read of the
  link draws the expired state). A body carrying neither field goes to `/admin/reset`, and
  so does **a body that is not a form at all** — no `Content-Type`, or one naming any
  other encoding. Everything put back into an address is percent-encoded, so a crafted
  token cannot write its own query string or path segments into the `Location`.
- **Errors:** none escape. Until the Task 9 re-review probed it, one did: `Request.formData()`
  THROWS rather than returning empty for a body it cannot parse, so a `POST` carrying no
  `Content-Type` answered **`500` with an empty body** before Zod saw anything — an
  unhandled error at a trust boundary, which CLAUDE.md §3.1 forbids. `submittedFields`
  now maps that throw to the empty submission the schema already refuses, so every request
  this screen did not make gets one answer instead of two.
  `payload.resetPassword` throws for both refusals and
  `apps/web/lib/auth/setNewPassword.ts`'s `refusalFrom` narrows what it threw — status
  `400` (Payload's `ValidationError`) is a refused password, and everything else, a thrown
  string or a dropped connection included, is reported as a refused link, which is the
  answer that cannot mislead.
- **Auth requirement:** the token in the body. No session, no cookie.
- **Notes:** **`303`, not `302`.** 303 is the one status that requires the browser to
  follow with a `GET`, and this endpoint spends a link — a reader who reloaded a `302`
  would be shown a refusal for a link they had just used successfully.

  **It is now behind the admin's cross-site refusal**, like every other mutation under
  `/admin` — see "The admin's request policy" above. Task 10 put that one layer up rather
  than in this handler, so a forged post never reaches it. The bound this row used to state
  still holds underneath: the authorisation for this endpoint is the token in the body,
  which a cross-site forgery does not have.

  **A static segment beside a dynamic one.** `set` resolves before `[token]`, and no token
  can be the string `set` — Payload mints them as hexadecimal. Keeping the handler off a
  bracketed route also keeps it where `@vitest/coverage-v8`'s ignore hints are honoured
  (CLAUDE.md §2.1).

### `GET /admin/sign-in/done`

- **Method:** `GET`. The `POST` that "Sign out and start again" makes goes to
  `/admin/sign-out`, documented below.
- **Input:** the session cookie, and nothing else. No path parameter, no query and no body.
- **Output:** an HTML document: the §3 shell with `SCREENS.md` §3.4's signed-in state — a
  62px ringed circle holding a 20px `#2f6b68` square, the "Signed in" eyebrow, "The back
  room is open", a status line, then "Open the admin panel" (primary, to `/admin`), "View
  the diary instead" (secondary, to `/p/1`) and a borderless "Sign out and start again".
  `metadata` sets the document title and `robots: { index: false, follow: false }`.
- **Errors:** none observable. A refused request never reaches the render: the guard is
  called before the screen's content is read.
- **Auth requirement:** **signed in.** `requireAdminSession` reads the identifier out of
  the cookie and asks the `sessions` table whether it names a live row; an absent cookie, an
  identifier that names no row, a revoked row and an expired row are all answered with a
  `303` to `/admin/sign-in`. The pre-auth identifier the middleware mints for anonymous
  browsers is refused like any other — it is carried in the same cookie and no row names it,
  which is why a presence check would not do.
- **Notes:** the guard is called in the page rather than inherited from a layout, because
  the siblings under `/admin/sign-in` are the screens a reader with no session must be able
  to reach. What stops a later screen forgetting the call is
  `apps/web/lib/auth/adminGuardRegistration.test.ts`. The status line is ours rather than
  the prototype's, whose own line counts unpublished changes that no phase before 4 can
  compute (`docs/deviations.md` §38).

### `POST /admin/sign-in/password`

- **Path:** `apps/web/app/(admin)/admin/sign-in/password/route.ts`; the handler is
  `apps/web/lib/auth/signInEndpoints.ts`'s `handlePasswordStep`.
- **Method:** `POST`. A `GET` is `405`; there is nothing at this address to fetch.
- **Input:** a form body with `email`, `password` and an optional `keepSignedIn`, parsed
  with Zod at the boundary. `keepSignedIn` is a checkbox, so its PRESENCE is the answer.
  Both strings carry no further rule: an empty password is a real submission `signIn`
  refuses on its own terms, and an address that names nobody is the case the whole
  anti-enumeration design exists for. The `td-session` cookie is read if present, and one
  is minted if not. `X-Forwarded-For` / `X-Real-IP` name the rate-limit subject and
  `User-Agent` the device label on the account screen — neither is an authorisation input.
- **Output:** always a `303 See Other` with an empty body. Four destinations:
  `/admin/sign-in/done` with the issued session's `Set-Cookie` when the account has no
  second factor; `/admin/sign-in/code` with the browser's identifier and a
  `td-keep-signed-in` cookie when it does; `/admin/sign-in?state=refused` for every refusal
  a caller without the password can provoke; and `/admin/sign-in?state=code-unsent` when
  the password was ACCEPTED and no code could be sent.
- **Errors:** none escape. A body with no fields, and a body that is not a form at all,
  both answer `303` to `/admin/sign-in`.
- **Auth requirement:** none — it is the door. The credentials in the body are the
  authorisation.
- **Notes:** **the three refusals are one response.** An unknown address, a wrong password
  and a locked account are already one value in `signIn.ts`, reached in the same time
  (medians 0.90 with the dummy PBKDF2 derivation, 0.14 without); this endpoint puts every
  refusal a caller WITHOUT the password can provoke — `'rate-limited'` included — through
  one `return`, so the three that must agree cannot be separated by a change meant to
  distinguish the fourth. `signInEndpoints.integration.test.ts` compares the status, every
  header and the body of all three with `toEqual`, and measures the handler's own timing
  over 25 interleaved samples per arm. The cost: a genuinely rate-limited reader is told
  the same thing as one who mistyped a password (`docs/security.md`).

  **`'code-not-sent'` is NOT one of them, and folding it in was blocker B1.** That refusal
  is returned only after Payload has ACCEPTED the password, when the code cannot be issued
  — the thirty-second resend cooldown, the hourly ceiling, or a mailer that declined. It
  went through the same `return` until Phase 2's final review, so a reader who resubmitted
  a CORRECT password inside the cooldown was told "Those details did not let you in.", and
  past `HOURLY_RESEND_CAP` every correct submission for the rest of the hour said it. It
  costs the anti-enumeration property nothing, because the word is unreachable without the
  password. The branch is written as an equality on the one value that leaves rather than
  as a list of the four that stay, so a `SignInRefusal` added later joins the
  indistinguishable group by default.

  **The session identifier is rotated, and the rotation is asserted from the other side.**
  What goes into the `Set-Cookie` is always the value `startSession` minted, never the
  identifier read out of the request — and the suite asserts the pre-auth identifier STOPS
  AUTHENTICATING, because asserting that a session exists afterwards passes for a handler
  that reuses the value it was handed.

### `POST /admin/sign-in/code/verify`

- **Path:** `apps/web/app/(admin)/admin/sign-in/code/verify/route.ts`; the handler is
  `apps/web/lib/auth/signInEndpoints.ts`'s `handleCodeStep`.
- **Method:** `POST`. A `GET` is `405`.
- **Input:** **six form fields all named `code`**, one per cell, joined in document order
  — `SCREENS.md` §3.2's pane is six `<input name="code" maxLength={1}>` elements, and that
  is what a browser sends. A client posting a single `code` field works too, because
  joining one value is that value. Also the `td-session` cookie naming the browser the
  challenge was issued to, and `td-keep-signed-in`, carrying the choice the password step
  could not otherwise pass on.

  **Reading this through `Object.fromEntries` was a defect, and it is the second of the
  same shape as the `Referrer-Policy` one.** That keeps one value per name, so the handler
  compared a single character against a six-digit code and refused every correct one. The
  integration suite sent a single field, so it agreed with the handler; this row had
  recorded the real shape since Task 8 and nothing read it. Found by typing a code into the
  real pane in a browser.

- **Output:** a `303` with an empty body. `/admin/sign-in/done` with the issued session's
  `Set-Cookie` and a cleared `td-keep-signed-in` when the code is right;
  `/admin/sign-in/code` when it is not; `/admin/sign-in` when the browser carries no
  identifier at all, since no challenge can be bound to one that has none.
- **Errors:** none escape. A body with no `code`, and a body that is not a form, both answer
  `303` to `/admin/sign-in/code`.
- **Auth requirement:** the code, and the challenge bound to this browser's identifier. A
  correct code offered by a different browser is refused (`SECURITY.md`).
- **Notes:** a wrong code, an exhausted challenge, a consumed one and an expired one are one
  answer, because `verifyChallenge` collapses them: distinguishing them would say which
  browsers hold a live challenge. The screen it returns to draws the server's own attempts
  counter, so a reader can see what is left.

  **A guess the limiter would not judge redirects with `?state=wait`.** That path spends no
  challenge attempt, so the counter does not move and every message the pane derives from
  it is unchanged — until this word existed, a reader who typed the CORRECT code with a
  shut window was handed back the page they had just submitted from, with nothing said
  (final review finding 6). The word names no address, no count and no deadline; the
  message is `@travel-diary/domain/auth/codeScreen`'s `CODE_UNJUDGED_MESSAGE`. **This endpoint DOES call `rateLimit.ts`'s `admitCodeAttempt`** as of
  the fix round — `otpService.challengeAccount` names the account a live challenge belongs
  to, server-side and never in a response, which is what that function had been waiting for
  since Task 4. The challenge's own database-enforced budget still applies underneath
  (three attempts claimed before the code is compared, single use, five minutes) and the
  hourly ceiling bounds issuing.

  **Its sibling `/admin/sign-in/code/resend` is mounted too** — its own row is above.

### `POST /admin/sign-in/code/resend`

- **Path:** `apps/web/app/(admin)/admin/sign-in/code/resend/route.ts`; the handler is
  `apps/web/lib/auth/signInEndpoints.ts`'s `handleResendCode`. Mounted in Task 10's fix
  round; it was the last unmounted form on this surface (`docs/deviations.md` §33).
- **Method:** `POST`. A `GET` is `405`.
- **Input:** the `td-session` cookie, and **nothing else** — the body is not read. That is
  the endpoint's whole safety property: `otpService.resendChallenge` resolves the account
  from the challenge bound to the browser's own identifier, so a reader cannot have a code
  sent to an address they have not authenticated as.
- **Output:** a `303` to `/admin/sign-in/code` when a new code really went out,
  `/admin/sign-in/code?state=unsent` when none did, or `/admin/sign-in` for a browser
  carrying no identifier at all.
- **Errors:** none escape, and every reason nothing was sent is **one answer**: the
  thirty-second cooldown, the hourly ceiling, a spent rate-limit window, a mailer that
  declined, and a browser holding no challenge all write `?state=unsent`. `SCREENS.md` §3.2
  gives the resend a cooldown label and no refusal copy, so the sentence is ours
  (`docs/deviations.md`). It used to answer with **silence**, which hid two defects in
  succession: a resend that refused an exhausted challenge outright (ruling F69), and then
  a button that renders enabled past the hourly ceiling — its cooldown is measured from
  the challenge bound to THIS browser, the server's ceiling counts every challenge the
  ACCOUNT has had in the hour — and did nothing when pressed (final review finding 14).
- **Auth requirement:** none, and it names no account. The challenge bound to the cookie is
  the authorisation.
- **Notes:** **it spends the code endpoint's own rate-limit windows**, the same two
  `/admin/sign-in/code/verify` spends. It called no limiter at all until Phase 2's final
  review, while `otpService.issueChallenge` justified deriving ~30ms of scrypt before its
  advisory lock on the grounds that "Task 4's per-account and per-IP rate limiting is what
  bounds the number of requests" — so for this endpoint that bound was enforced zero times
  and every request past the ceiling still paid a full derivation to write no row (final
  review finding 7). The account the key needs comes from
  `otpService.challengeAccount`, server-side and never in a response, so the request still
  names nobody.

### `POST /admin/reset/request`, `GET /admin/reset/request`

- **Path:** `apps/web/app/(admin)/admin/reset/request/route.ts`; the handlers are
  `apps/web/lib/auth/resetRequestEndpoint.ts`'s `handleResetRequest` and
  `readResetRequestRoute`.
- **Method:** `POST` for `SCREENS.md` §3.3's "Send the link". **`GET` answers `404`**, and
  that export exists for a reason: `[token]` sits beside this directory and matched this
  address until ruling F56 reserved it, and a `route.ts` exporting only `POST` would answer
  `405` — a different answer from the one this address gave the day before.
- **Input:** a form body with `email`, parsed with Zod, and `X-Forwarded-For` /
  `X-Real-IP` for the window the request spends. `email` carries no shape rule: refusing an
  address that is not one would be a cheaper oracle than the one this endpoint avoids.
- **Output:** a `303` with an empty body, to `/admin/reset?sent=<masked>` — the mask
  percent-encoded, and derived from what was SUBMITTED rather than from a row, so it is the
  same whether or not the address exists. `resetRequestView` masks it again on the way in,
  so nothing that reaches the screen can be a whole address.
- **Errors:** none escape. A refusal — the shared password window exhausted, or the mail
  provider declining — answers `303` to `/admin/reset`, the plain form: a refusal must not
  draw the "sent" confirmation, because telling a reader a link is on its way when none is
  is the one message they cannot act on.
- **Auth requirement:** none. It is a way back in for somebody who cannot sign in.
- **Notes:** it spends the password endpoint's own rate-limit windows rather than a budget
  of its own (`passwordReset.ts`). The `'delivery-failed'` residual named there is not
  widened here: this handler cannot tell the two refusals apart either.

### `POST /admin/sign-out`

- **Path:** `apps/web/app/(admin)/admin/sign-out/route.ts`; the handler is
  `apps/web/lib/auth/signInEndpoints.ts`'s `handleSignOut`.
- **Method:** `POST`, never a link — signing out changes something, so it must not be
  reachable by a `GET` a prefetch, a crawler or an image tag can make. A `GET` is `405`.
- **Input:** the session cookie. No body is read.
- **Output:** a `303` to `/admin/sign-in` with `td-session` cleared (`Max-Age=0`,
  `Path=/admin` — RFC 6265 keys a cookie by name AND path, so a clear without the path sets
  a second empty cookie at `/` and leaves the real one where it was).
- **Errors:** none observable. The same answer whether or not there was a session to
  revoke.
- **Auth requirement:** **signed in.** The guard runs before anything is revoked, and
  `revokeSession` matches on the owner as well as the identifier — revocation is how a
  stolen session is taken away from the thief rather than from its owner.
- **Notes:** both halves happen, and the row is the one that matters: clearing the cookie
  stops this browser sending the identifier, revoking the row stops the identifier working
  at all. `signInEndpoints.integration.test.ts` asserts the revoked identifier is refused
  afterwards, not merely that a cookie was cleared.

## Planned routes (Phase 1)

None. Task 14 built the last of them (`/gallery/<slug>` and its download handler, both
documented above); everything remaining is a later phase's, listed below.

## Planned server actions (later phases)

Not yet designed in enough detail to document with real input/output/error shapes
without inventing them. Named here only so the shape of what's coming is visible, per
the phase plan (design spec §4): a presigned-upload action and a create-media-row action
(Phase 3, gated by declared type/size/per-request-file-count validation — Vercel's
serverless functions cap request bodies at ~4.5MB, which is why upload goes straight to
R2 rather than through an action, per design spec §9.1); sign-in, OTP verification, and
password-reset actions (Phase 2); and the full set of admin mutations across all ten
screens (Phase 4), each requiring Payload access-control authorization per
`docs/security.md`'s "Authorization on every mutation" row — checked on every mutation,
never inherited from the page it was reached from. Each of these gets a full row in this
document, in the commit that adds it.

One of those actions now has its logic waiting for it, which is worth naming so nobody
looks for a route that does not exist: Phase 2 Task 3 built
`apps/web/lib/auth/otpService.ts` — `issueChallenge(user, session, ip)` and
`verifyChallenge(session, code)`. It is a module, **not** a route and not a server
action, and deliberately so: nothing about the OTP flow is reachable from the Payload
REST or GraphQL API (the `otpChallenges` collection returns `false` from every access
predicate), so the only way to reach it is a server action that has not been written yet.
When that action lands it gets its own full row here, and this paragraph goes with it.

Phase 2 Task 4 added a second such module for the same reason:
`apps/web/lib/auth/rateLimit.ts` — `admitPasswordAttempt({ ip })` and
`admitCodeAttempt({ ip, account })`, the sliding window `SECURITY.md` requires per
account and per IP (`docs/adr/0016-rate-limit-window-storage.md`). Also a module, also
not a route: its `signInAttempts` collection returns `false` from every access predicate
too, so the sign-in and code-verification actions of Task 5 are the only things that will
ever call it. Whichever route ends up in front of it is what supplies the `ip`, and it
gets its row here when it lands.

Phase 2 Task 6 added a third, and it is the one the others will be built on:
`apps/web/lib/auth/sessions.ts` — `startSession({ user, previous, keepSignedIn, device,
location })`, `authenticate(session)`, `revokeSession({ session, owner })` and
`revokeAllSessions({ owner })`. Also a module rather than a route, and built **before**
the sign-in action that will call it, because sign-in must issue a session and cannot
issue what does not exist (`docs/adr/0017-session-store-and-rotation.md`). `startSession` hands back the identifier, the `Set-Cookie`
value for it, and the row's expiry; whichever route ends up in front of it is what sets
that header and what supplies the `device` and `location` labels the Account screen
lists.

Phase 2 Task 5 added the module that calls all three, and it is still not a route:
`apps/web/lib/auth/signIn.ts` — `signIn({ email, password, browserSession, keepSignedIn,
ip, device, location })` — plus its sibling `apps/web/lib/auth/passwordReset.ts` —
`requestPasswordReset({ email, ip })`. `signIn` answers `ok({ status: 'otp-required',
maskedTo })` or `ok({ status: 'signed-in', session })`, or `err` with one of
`'invalid-credentials'`, `'rate-limited'` or `'code-not-sent'`; `requestPasswordReset`
answers `ok({ maskedTo })` or `err` with `'rate-limited'` or `'delivery-failed'`.

Three things about those shapes are worth stating here rather than leaving to be
discovered by whoever writes the route in front of them:

- **The three refusals are deliberately one.** An unknown address, a wrong password and a
  locked account all answer `'invalid-credentials'`, and take the same time to do it
  (`docs/security.md`, "No user enumeration"). **A route that gives them different status
  codes, different headers or different response times re-opens the hole the module
  closes** — `POST /admin/sign-in/password`'s row above says so, and
  `signInEndpoints.integration.test.ts` compares the status, every header and the body of
  all three, and measures the handler's own timing.
- **Neither sets a cookie.** `signIn` returns `startSession`'s whole `Set-Cookie` value
  inside `session`; putting it on a response is the route's job. `browserSession` is the
  identifier the browser is carrying — the pre-auth identifier for a browser that has
  none — and it is superseded either way, so the route has to have one to hand.
- **`requestPasswordReset` takes no origin from the request.** The origin its link is
  built against is a dependency of the service, not a field of the request: a link built
  from a `Host` header is a link an attacker can point at their own machine. The reset
  screen the link lands on (`/admin/reset/<token>`) is not built yet, and **Phase 2
  Task 9 owns it**: the `[token]` route at that path, the form, the
  `payload.resetPassword` call, the invalid/expired state, and an e2e case following
  the mailed link (controller ruling, Task 5 review round 1). Until it lands the link
  resolves to a 404, which is why the deviation recording this copy says so
  (`docs/deviations.md` §31).

Unlike the two above, the collection behind it is **not** closed to everybody:
`sessions` carries a per-user ownership rule (`docs/deviations.md` §29), so the Account
screen's list reaches these rows through Payload's own REST/Local API under the signed-in
reader's access — `GET`/`DELETE /api/sessions`, narrowed to
`{ user: { equals: <caller> } }`, with `tokenHash` never returned. **Revoke does not go
that way.** It calls `revokeSession` above, because review round 1 found that revoking
through a field write meant the same field could be written back; `PATCH /api/sessions/:id`
is still admitted for the caller's own row but writes **no field at all**, every one of
them refusing `update` (see `docs/data-model.md`). Those are Payload's own generated
routes rather than ones this repository writes, which is why they have no row of their own
here; what constrains them is the collection's access block, and
`apps/web/collections/sessions.access.integration.test.ts` is where that is asserted —
field by field, enumerated from the collection config.
