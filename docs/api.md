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

Every route below the "live today" headings exists; a count is not written here, because
one written in prose has been stale by the next task every time it was. Payload's own four are mounted under the `(payload)` route
group; three of the diary's own — `/p/<n>`, added with the book itself in Phase 1
Task 7 and completed in Task 13; and `/gallery/<slug>` with its download handler
`/gallery/<slug>/download/<id>`, added in Task 14 — and the bespoke admin's first,
`/admin/sign-in` and `/admin/sign-in/code`, added in Phase 2 Tasks 7 and 8. Phase 2 Task
10 added the six `POST` endpoints those screens post to and the request policy every
`/admin` address is now put through; Phase 3 Task 7 added
`PUT /admin/media/upload` and the `requestUploadSlots` action that hands out its URLs, and
Task 8 the `finaliseUpload` action that turns what it staged into a row — see "The admin's request policy" below, which applies
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
performs. The collections that declare `access` do not all say the same thing, and the
list below is what they say rather than how many there are — this sentence carried a count
twice, wrong the first time (Phase 2's final review) and going stale again the moment
Phase 4 Task 1 added a sixth, so the count is deleted rather than corrected a third time
(`CLAUDE.md` §1.3):

- `jobs`, `otpChallenges` and `signInAttempts` refuse every operation outright —
  `read`, `create`, `update` **and `delete`**, all four predicates. The `delete` one is
  this repository's addition; leaving it out is what let deletion fall through to
  Payload's "signed in, or refused" default, which is Ruling F32 and
  `docs/data-model.md`'s §"The `delete` predicate".
- `sessions` declares **per-user ownership** rather than a flat refusal: `read`,
  `update` and `delete` each return a `Where` constraining the operation to the caller's
  own rows, and `create` is refused for everyone. See `apps/web/collections/sessions.ts`.
- `users` declares **per-row ownership**: `read` and `update` return
  `{ id: { equals: req.user.id } }`, so an operation is narrowed to the caller's own row
  and refused with no caller, and `create`/`delete` are refused for everyone — the diary
  has one author. `unlock` and `admin` are refused outright too: undeclared, the first let
  any signed-in caller clear any account's lockout counter (measured — the call resolved
  `true`) and the second answered `canAccessAdmin` with "is anybody signed in". Added by Phase 4 Task 1; before it, any signed-in account could `PATCH`
  any other account's row, `otpRequired` included (`docs/deviations.md` §52).
- `media` declares a **public-read** rule **while the book is open**: a signed-out caller
  gets `{ hidden: { not_equals: true } }` rather than a refusal, so unhidden media is
  **served, not refused** — including through `/api/media/file/<name>`. That is
  deliberate and is what the public diary depends on (`docs/security.md`'s
  "A hidden media item stays hidden from a signed-out reader" row).
  **Once `site.passwordProtect` is on, the same rule refuses outright**, and that clause
  is the fifth surface of the book gate: Payload's REST route, its GraphQL route and
  `/api/media/file/<name>` are three callers of this one predicate, so the refusal is
  written once rather than at three routes. Added in Task 13's first fix round, after a
  review measured a closed book still serving a paginated index of every non-hidden
  photograph and then the bytes. Its `create`, `update` and `delete` are **signed in, or
  refused**, written out in Phase 4 Task 1 rather than inherited.
- `journeys` and `pages` are **signed in, or refused** on all four operations **and on
  `readVersions`**, which is a fifth routed operation Payload does not fill in and which
  `read` says nothing about — narrow `read` and version history stays open. The `book`,
  `site` and `about` globals carry the two a global has. Added by Phase 4 Task 1,
  behaviour-identical to the default they replace: the public diary reads these rows
  through the Local API, which bypasses access control, so nothing public depends on
  them over HTTP and widening them would be exposure nobody asked for
  (`docs/deviations.md` §52).

**Nothing of this repository's is left on Payload's default access**,
`({ req: { user } }) => Boolean(user)`. That is a claim a test makes rather than a claim
this document makes, and **the first version of both the claim and the test was false** —
review round 1, finding 1. `adminAccess.integration.test.ts` takes a live reference to
that function from `payload-migrations`, a collection Payload owns and gives no rule, and
refuses any operation of ours pointing at it. The correction is that **an undeclared
operation now counts too**: `addDefaultsToCollectionConfig` fills exactly `create`,
`delete`, `read`, `unlock` and `update`, so `readVersions` and `admin` were left
`undefined` — and `executeAccess` then runs its own hardcoded `if (req.user) return true`,
a second copy of the default behind a door an identity comparison cannot see through.
Measured at the time: `journeys` and `pages` both carry `versions: { drafts: true }`, both
had no `readVersions`, and a signed-in `findVersions` on `journeys` returned 160 rows.

Which operations are swept is decided per object from its own sanitised config, never from
its slug: `read`/`create`/`update`/`delete` always, `readVersions` wherever `versions` is
enabled, `unlock` on an auth collection counting login attempts, `admin` on the collection
`config.admin.user` names. **There are no exclusions.** `unlock` used to be one, on the
grounds that `POST /api/users/unlock` is sealed — true, and incomplete, since what keeps
`unlockUser` out of the GraphQL schema is a second decision,
`graphQL: { disableMutations: true }`. `users` declares `unlock: () => false` and
`admin: () => false` instead, so the refusal no longer depends on either seal holding.

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
above now refuses **every** caller on every collection and global reached through this
surface.

**Four things still answer on `/api/**`, and this is the whole list.** `media`'s public
read, above — and three `users` auth endpoints deliberately left reachable, none of which
takes a credential or mints one:

- `GET /api/users/me` reports whoever the request's own cookie names, so with every
  credential endpoint sealed the user it names is `null`. Measured against this
  deployment's own config: `200`, body `{"user":null,"message":"Account"}`. Payload's
  admin shell asks for it on load, and `e2e/smoke.spec.ts`'s zero-console-errors gate on
  `/cms` depends on it answering.
- `GET /api/users/init` carries a boolean saying whether any account exists at all —
  measured `200`, body `{"initialized":true}`. It is what stops the stock admin offering
  to create a first user, and it reveals nothing an unauthenticated visitor cannot infer
  from the sign-in screen existing.
- `POST /api/users/logout` destroys a session and can create none. Offered no session it
  refuses from the endpoint itself rather than from the seal — measured `400`, body
  `{"errors":[{"message":"No User"}]}`.

The three bodies are Payload's wording, quoted here as measurements rather than pinned:
what `sealedUserAuth.integration.test.ts` asserts is that none of the three is the sealed
answer, since pinning Payload's phrasing would make a dependency upgrade fail a case about
this repository's decision.

They are `OPEN_USER_AUTH_ENDPOINTS` in `apps/web/collections/sealedUserAuth.ts` — the
sealing itself is recorded as `docs/deviations.md` **§42**, which names the same three —
and this list is not a sentence anyone has to keep in step with that array:
`sealedUserAuth.integration.test.ts` requires the sealed and open lists together to be
TOTAL over whatever Payload actually mounts, and walks every open entry against a real
request, asserting it answers rather than returning the sealed `404`. The eighth
whole-branch review found this paragraph claiming `media` was the only thing `/api/**`
served while the module two files away said otherwise; the case is what stops the next
edit from being wrong the same way.

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
  in practice this route serves unhidden media and the three open `users` auth endpoints
  named above — `GET /me`, `GET /init`, `POST /logout` — and refuses everything else. The
  sealed endpoints answer `404` with Payload's own "Route not found" body, byte-identical
  to an address that was never mounted.

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
  B5 (`docs/deviations.md` §42). **The refusal is silent:** Payload's admin reports the
  sealed endpoint's `404` to the browser console and leaves its own form unchanged, so a
  correct password produces no message on the page. It is not a screen this repository can
  add a message to, and making the seal production-only to avoid it would leave every
  sealing test exercising the UNSEALED path — the shape that hid the `lockTime` units bug
  for two phases. `docs/runbook.md` says so where an operator will meet it.
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
  gates this route server-side, because a client-side check leaves the content
  fetchable. **That gate is built as of Phase 4 Task 13**: `bookIsGated`
  (`apps/web/lib/bookAccess.ts`) is asked before the bundle is read, and a closed book
  answers `401`, rendering `app/(diary)/unauthorized.tsx`. It sends no
  `WWW-Authenticate` challenge, for the two measured reasons in `docs/deviations.md`
  §100. The same gate is applied at `/m/<n>`, which is this address's other route entry.
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
- **Revalidated on publish (design spec §8), as of Phase 4 Task 11.** `GET /admin/publish`'s
  `publishChanges` calls `revalidatePath` on each `/p/<n>` the published journeys occupy, on
  the Contents page and on each journey's `/gallery/<slug>` — and on nothing else. It is
  registered rather than served differently: this route declares no `generateStaticParams`
  and renders per request, so there is no prerendered artefact to invalidate today and a
  reader already gets the current book. `docs/adr/0010-static-generation-and-the-content-window.md`
  says the same in advance. What the call buys now is that the set is correct and measured;
  what it buys the day this route is cached — by ISR, or by a CDN honouring it — is that only
  the pages that changed are dropped.

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

### `GET /robots.txt`

- **Path:** `apps/web/app/robots.ts` — Next's own metadata route. It replaced the static
  `apps/web/public/robots.txt` in Phase 4 Task 13, because a file under `public/` cannot
  consult a database and `SECURITY.md` requires `site.indexGalleries` to be respected
  here.
- **Method:** `GET`.
- **Input:** none from the request. One read of the `site` global (`readPublicAccess`,
  `depth: 0`, two fields).
- **Output:** `text/plain`. `User-Agent: *`, `Allow: /`, then `Disallow: /cms` and
  `Disallow: /admin` always, plus `Disallow: /gallery/` while `site.indexGalleries` is
  off. The route declares `dynamic = 'force-dynamic'`: without it Next prerenders the
  answer at build time and the author's toggle does nothing in production (measured —
  the build prints a static marker for this route and the server answers
  `x-nextjs-cache: HIT`).
- **Errors:** none a caller can observe. A database this route cannot reach is a
  database the diary cannot be served from either.
- **Auth requirement:** none. It is the one address whose whole purpose is to be fetched
  by a stranger.

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
- **Auth requirement:** none for a reader, but **gated by `site.passwordProtect`** since
  Phase 4 Task 13: `bookIsGated` (`apps/web/lib/bookAccess.ts`) is asked before the
  bundle is read, and a closed book answers `401` here exactly as it does at `/p/<n>`.
  `site.indexGalleries` governs whether this route is crawlable, and reaches it as a
  `<meta name="robots" content="noindex">` from `generateMetadata` rather than as an
  `X-Robots-Tag` header — a Next.js page component cannot set a response header
  (`docs/deviations.md` §101).

### `GET /gallery/<slug>/download/<id>`

- **Method:** `GET`.
- **Input:** `slug` — the journey's slug; `id` — the media row's id. Both path
  parameters, both read as opaque strings and matched against the database rather than
  parsed; nothing from the request body or headers is read, so the response never varies
  by caller.
- **Output:** the bytes of one derivative (`hero`, else `frame` — never `hero2x`, never a
  cropped tier, and never the uploaded original; the list ended `tile, grid, thumb` until
  MED-001 showed that a 1200×900 photograph was therefore downloaded as an 800×800 centre
  crop, and `frame` now declines to enlarge rather than being omitted, so every raster row
  carries it), with
  `Content-Disposition: attachment; filename="<slug>-<nnn>.<ext>"`, a `Content-Type`
  from a three-value allowlist (`image/jpeg`, `image/png`, `image/webp`),
  `X-Content-Type-Options: nosniff`, `X-Robots-Tag: noindex` and a `Cache-Control` that
  depends on one site setting: `private, no-store` when `site.passwordProtect` is on,
  `public, max-age=3600` when it is not (`downloadCacheControl`,
  `packages/domain/src/galleryDownload.ts`). `grid` is ADR 0013's 700px rung, added in
  Phase 3 Task 10, so a row that could derive no further than it is still downloadable at
  the best size it has. The filename is derived from the journey's slug
  and the frame's position in the gallery, never from the stored key.
- **Errors:** `404`, with the body `Not found`, for every refusal: no such journey; the
  journey is unpublished, archived or soft-deleted; no such media row; the row belongs
  to another journey; the row is `hidden`; the row's `allowDownload` is `false`; the row
  has no derivative; the derivative's stored mime type is not on the allowlist; the
  bytes are missing from the store. **One response for all nine, deliberately** — a
  handler that distinguished them would be the enumeration oracle `SECURITY.md` requires
  this route to close. Separately, `401` with `Cache-Control: private, no-store` and no
  body when `site.passwordProtect` is on: that is not one of the nine and is answered
  before any of them is asked, because it reveals nothing about which id was requested.
- **Auth requirement:** none, unless the author has closed the whole book — in which
  case this route refuses with `401` as of Phase 4 Task 13. A closed book whose
  photographs are still served by id is the "content fetchable" the `passwordProtect`
  requirement is written against, and this is a Route Handler, so it answers rather than
  raising a page interrupt.
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
`/admin/sign-in/code/verify`, **`/admin/sign-in/code/resend`**, `/admin/reset`,
`/admin/reset/request`, `/admin/reset/set`, and the reset link's own
`/admin/reset/<token>` — and **everything else under `/admin` is guarded**, including
addresses nobody has written yet. The resend endpoint was missing from this sentence while
sitting in `ADMIN_PUBLIC_PATHS` and carrying its own row below saying its auth requirement
is none: a security-surface list wrong by omission (Phase 2's final review, finding 32).
That list is now built from `apps/web/lib/auth/adminPaths.ts`'s constants — the same ones
the forms post to — and `adminPaths.test.ts` asserts the public set matches the allowlist
the middleware actually reads. Guarding is
`apps/web/lib/auth/guard.ts`'s `authenticateAdminRequest`, which reads the identifier out of
the cookie and asks the `sessions` table whether it names a live row; a page calls
`requireAdminSession`, which redirects to `/admin/sign-in` on any refusal.
`apps/web/lib/auth/adminGuardRegistration.test.ts` fails the pre-commit gate for any route
file under an `/admin` address that neither is declared public nor applies the guard in its
own body, and for any file under such an address whose kind it cannot classify. **Server
Action modules are not its business and have not been since round 5** — this sentence said
"including Server Action modules, which it reads per export", which was the text scan that
was defeated five times in five attempts. Actions are judged by
`eslint-rules/guarded-server-actions.js` over the parsed AST; what this test keeps about
them is whether the rule is still switched on, whether anybody has switched it off for a
file, and whether ESLint actually visits every file in the repository that carries the
directive.

**Nothing under `/api` can authenticate from this cookie.** It is `Path=/admin`, so a
browser never sends it to `/api/...`. Payload's four routes above authenticate with
Payload's own cookie or an `Authorization: JWT …` header, judged by the collection access
rules; `signIn.ts` discards the JWT `payload.login` mints, so signing in here issues no
`/api` credential.

## Admin routes (live today)

### `GET /admin`

- **Path:** `apps/web/app/(admin)/admin/page.tsx`; the frame is
  `apps/web/components/admin/shell/AdminShell.tsx` and the screen inside it is
  `apps/web/components/admin/overview/` — `StatGrid.tsx`, `WaitingCard.tsx`,
  `LiveBookCard.tsx`, `PromptsCard.tsx`, `LatelyCard.tsx` and `CopyLink.tsx`.
- **Method:** `GET`. This route answers nothing else; the Revert on each waiting row is
  `app/(admin)/admin/publish/actions.ts`'s Server Action, with its own opaque `POST`
  address.
- **Input:** the session cookie, and nothing else. No path parameter, no query, no body.
- **Output:** an HTML document: `SCREENS.md` §2's shell — the 238px rail with its nine
  buttons, the counts beside three of them, the profile block and the sign-out form; the
  96px header with its crumb ("4 changes waiting") over the screen title "Overview" —
  around §2.1's Overview: a four-card stat grid (Journeys, Pages, Photographs, Clips, each
  with a derived figure, a note and a coloured tick), "Waiting to go out" with one row per
  pending change and a Revert, "The book, live" with a 78x104px cloth chip, the summary
  line, the publish date and Open live / Copy link, "Needs a look" with one deep-linking
  prompt per outstanding job, and "Lately". `metadata` sets the document title and
  `robots: { index: false, follow: false }`.
- **Reads:** three call sites, **eighteen queries**, under ONE hoisted `adminScope` —
  `readNavCounts` (four `payload.count` calls, one per rail number), one
  `findGlobal('site')` selecting `name` for the masthead, and `readOverview`
  (`QUERIES_PER_READ`: three `find`s, four `count`s and one `findGlobal` of its own, plus
  `readPendingChanges`' four and `readEditions`' one). Plus the one `users` row
  `adminScope` itself resolves, which is what the scope is. The scope is resolved ONCE and
  spread; resolving it per call site would be one `users` lookup per operation
  (CLAUDE.md §7).
- **Errors:** none observable from the screen's own content. A refused read would throw
  before anything is drawn, which is a bug in the guard that admitted the session rather
  than a state this screen draws.
- **Auth requirement:** **signed in.** `requireAdminSession` runs before anything is
  drawn; an absent cookie, an identifier naming no row, a revoked row, an expired row and
  the pre-auth identifier the middleware mints for anonymous browsers are all answered with
  a `303` to `/admin/sign-in`.
- **Notes:** **this address had nothing mounted at it, and that was blocker B2.**
  `SCREENS.md` §3.4's signed-in pane has a primary action, "Open the admin panel", pointing
  here; verified against the built route manifest, `/admin` had no entry, so a reader who
  completed the entire sign-in journey and pressed the primary button got a `404`. Phase 2
  answered it with a holding screen, "Still being furnished", and `docs/deviations.md` §44
  named its own reversal. **Phase 4 Task 12 is that reversal**: the holding screen and its
  stylesheet are deleted and this route draws §2.1.

  **It is the first guarded address that is not part of signing in**, which is why
  `e2e/signInJourney.spec.ts` walks it in both directions: from the signed-in screen's own
  button, and from a browser with no session at all.

  **THE WAITING CARD AND `/admin/publish` REPORT ONE SET.** Both read
  `apps/web/lib/admin/readPendingChanges.ts`, and `readOverview.integration.test.ts`
  asserts the two answers are the same list — two screens counting the same thing
  differently is the defect `journeyStatus.ts` exists to avoid. The header's chip is a
  DIFFERENT number and now says so: it counts journeys that have never been published, and
  reads "n journeys never published" (`docs/deviations.md` §91).

  **THE PROMPTS ARE DEEP LINKS, AND THE DESTINATION READS THEM.** "Pick posters" and "Add
  alt text" carry `?journey=<id>&frame=<id>`, "Caption them" adds `&captionAll=1`, and
  `app/(admin)/admin/galleries/page.tsx` parses all three with `promptedSelection` — the
  inverse of the function that writes them. `e2e/admin.spec.ts` reads the id off the
  prompt's own `href` BEFORE the click and compares it with the frame the gallery
  highlighted.

  **ONE CLIENT ENTRY**, `components/admin/overview/CopyLink.tsx`: putting an address on the
  clipboard is a browser capability with no form post behind it. The other five files in
  that directory ship nothing, and `lib/admin/shellShipsNoClientJs.test.ts` names the island
  in an allowlist that is now **eight** entries and fails by name and by length.

  **It carries a performance budget** — see `docs/testing.md` §7 and
  `lighthouserc.admin.json`, which names this address.

### `GET /admin/journeys`

- **Path:** `apps/web/app/(admin)/admin/journeys/page.tsx`; the frame is
  `apps/web/components/admin/shell/AdminShell.tsx`, and the screen inside it is
  `apps/web/components/admin/journeys/` - `JourneyControls.tsx`, `CreatePanel.tsx`,
  `JourneyTable.tsx` and `RowActions.tsx`.
- **Method:** `GET`. This route answers nothing else; the four mutations below are Server
  Actions with their own opaque `POST` addresses.
- **Input:** the session cookie, plus two optional query parameters - `q`, what the author
  typed into the search box, and `filter`, one of `published`, `edited`, `draft` or
  `archived`. Both are parsed by `journeysQuery` in
  `apps/web/lib/admin/readJourneysScreen.ts`: a repeated parameter takes its first value,
  and a `filter` no chip offers falls back to everything rather than selecting nothing.
- **Output:** an HTML document: `SCREENS.md` §2's shell - with the screen title "Journeys"
  and a crumb that counts what is on screen ("10 entries · 30 pages") - around §2.2's
  screen: the search box, the five status chips, the "New journey" button, and the table in
  one card. Each row carries a 44px cover thumbnail, the journey's name over its place, its
  dates, page and media counts, the date it was last edited, a status pill and Edit /
  Gallery / `⋯`. Columns drop by width; the ladder is
  `packages/domain/src/admin/journeyColumns.ts`'s and the media queries that act on it are
  `journeys.module.css`'s. `metadata` sets the document title and
  `robots: { index: false, follow: false }`.
- **Reads:** three call sites, nine queries, under ONE hoisted `adminScope` -
  `readNavCounts` (four `payload.count` calls), one `findGlobal('site')` selecting `name`,
  and `readJourneysScreen` (four: the journeys, then one grouped read each of `pages`,
  `media` and the journeys' VERSIONS, all keyed `{ in: ids }`). Nine whatever the number of
  journeys: Payload has no `GROUP BY`, so the counts are tallied in memory rather than
  asked per row (CLAUDE.md §6). Plus the one `users` row `adminScope` itself resolves.
- **Errors:** none observable from the screen's own content. A refused read would throw
  before anything is drawn, which is a bug in the guard that admitted the session rather
  than a state this screen draws. A search that matches nothing draws the card with "No
  journeys match that." in it.
- **Auth requirement:** **signed in.** `requireAdminSession` runs in this file before
  anything is drawn, with the same five refusals `GET /admin` lists.
- **Notes:** **the search and the chips are addresses, not state.** Both survive a reload
  and can be sent to somebody, and both ship no JavaScript. The screen buys exactly two
  client islands - the create panel's open state and the `⋯` disclosure - and nothing else
  on it is a client component.

  **`Edited` prints a date where the design prints "2 months ago"** - `docs/deviations.md`
  §54, because a relative string is a function of the current instant and this screen is
  rendered once on a server that never re-renders it.

  **Edit now points at a route.** Phase 4 Task 5 mounts `GET /admin/journeys/<id>`,
  documented immediately below, and `e2e/a11y.spec.ts` reaches the editor by clicking that
  very link rather than by typing the address. **Gallery still points at an address Task 7
  mounts**, so it answers Next's own not-found page until then - the same intermediate
  state `GET /admin` records for the rail buttons, behind the same session guard.

### `GET /admin/journeys/<id>`

- **Path:** `apps/web/app/(admin)/admin/journeys/[id]/page.tsx`; the frame is
  `apps/web/components/admin/shell/AdminShell.tsx`, and the screen inside it is
  `apps/web/components/admin/editor/` - `EditorGrid.tsx`, `PageRail.tsx`,
  `LayoutPicker.tsx`, `JourneyPool.tsx`, and `NotesPane.tsx` with `Furniture.tsx`.
- **Method:** `GET`. This route answers nothing else; the six mutations below are Server
  Actions with their own opaque `POST` addresses.
- **Input:** the session cookie, the `<id>` path segment, and one optional query parameter
  - `page`, the page whose card is open. The segment is branded by `journeyId` and turned
    into a row id by `rowId`, which refuses anything that is not a positive safe integer;
    `page` is resolved by `selectedPage` in `packages/domain/src/admin/pageRail.ts`, which
    takes a repeated parameter's first value and ignores an id this journey does not hold.
    `slot` names the CELL the journey pool fills next, as `<page>:<cell>`, and is resolved by
    `selectedSlot` in `packages/domain/src/admin/pageSlots.ts` - which takes a repeated
    parameter's first value, ignores a cell the selected page does not draw, and defaults to
    NOTHING rather than to a first cell.
- **Output:** an HTML document: `SCREENS.md` §2's shell - with the journey's own name as
  the screen title and a crumb naming its place and page count - around §2.3's editor. Its
  three columns are `184px | minmax(0,1fr) | 250px` above 1180px, `168px | minmax(0,1fr)`
  above 860px with the pool spanning `1 / -1`, and a single column below, keyed on a
  CONTAINER query rather than the viewport (`editor.module.css` says why). The left column
  is the page rail - a card per page, the selected one revealing ↑ ↓ · Copy · Delete - over
  the dashed layout box, whose four glyphs are real CSS grid cells drawn from
  `packages/domain/src/admin/layoutGlyphs.ts`. The middle column is §2.3's editing pane: for
  a NOTES page that is `NotesPane`, a single `<form>` holding the field grid, Highlights,
  The note, Tally and the Page furniture block, which reshapes at two more rungs of the same
  container (856 and 960, which are §2.3's 900 and 1020 in the units a container query
  measures in); for a FRAMES page it is `FramesPane`, which is NOT a form and draws its cells
  in `repeat(auto-fit, minmax(196px, 1fr))`. Both hand their cells to `SlotPanel` - the hero
  and the ephemera scrap in the Notes pane's right-hand column, four frames in the Frames
  pane - and each cell draws its label, its motion badge, the photograph with
  `cursor: crosshair`, Replace / Clear, the focal pill and the caption and alt fields.
  **"Preview page" is not drawn** - `docs/deviations.md` §59 says why, and §64 says why a
  Frames pane draws no "Save draft" either. The right column is the journey pool, whose tiles
  place a photograph into the cell `?slot=` names and are disabled while it names none. `metadata` sets the document title and
  `robots: { index: false, follow: false }`.
- **Reads:** three call sites, eight queries, under ONE hoisted `adminScope` -
  `readNavCounts` (four `payload.count` calls), one `findGlobal('site')` selecting `name`,
  and `readJourneyEditor` (three: the journey, then one read each of its `pages` and its
  `media`). Eight whatever the number of pages or photographs. The journey and its pages
  are read with `draft: true`, because the author's unpublished work exists only in the
  versions table and an editor that read the main rows would show a reader's copy of the
  book. Plus the one `users` row `adminScope` itself resolves. **Still three after the Notes
  pane landed:** its fields are journey-level columns, so they widened the journey read's
  `select` rather than adding a read of their own. **And still three after the slots landed:**
  every page's cells come from `slots`, one more column on the `pages` read, and each cell's
  preview is resolved against the media rows the pool read already fetched - a fourth query, or
  a read keyed on which page is selected, would have made the count depend on the address.
- **Notes pane fields:** Location (the journey's own `name`), Dates, Weather, Mood; the
  highlight list, capped at `MAX_HIGHLIGHTS`; The note; the tally, always `TALLY_ROWS` cells
  whose values are TEXT ("plenty", "uncounted"); and the furniture - sign-off, weather glyph,
  postage stamp, accent and gallery address. Every control posts to `saveNotes` below.
- **Errors:** `notFound()` - a real 404 - for an `<id>` that is not a row id, names no
  journey, or names one in the trash. A journey that has been thrown away must not be
  editable, which is the invariant `readJourneysScreen.ts` carries one screen along.
- **Auth requirement:** **signed in.** `requireAdminSession()` runs in this file before
  anything is drawn; an anonymous request is redirected to `/admin/sign-in`.
- **Notes:** **the screen ships ONE client entry — 2,295 bytes gzipped — and everything else is
  a form.** (`/admin/journeys/[id]` totals 136,975 against `/admin`'s 134,680; the route was
  byte-identical to the shell until this task.) Selection
  is an address (`?page=<id>`, `?slot=<page>:<cell>`), and every control but the slot panel's
  is a `<form action={...}>`: the arrows carry the WHOLE new sequence of page ids, computed on
  the server by `movePage` while the rail renders, so the browser posts an outcome rather than
  an instruction. The Notes pane is the same argument one column along: its highlight controls
  are submit buttons in the pane's own form, each carrying an `op` the save applies, so
  pressing one keeps every unsaved keystroke on the page. The one exception is
  `components/admin/editor/SlotPanel.tsx`: §2.3's focal point is
  `clamp(0, ((clientX - rect.left) / rect.width) x 100, 100)`, which needs the clicked
  element's measured width, and no server has it (`docs/deviations.md` §62).
  `apps/web/lib/admin/shellShipsNoClientJs.test.ts` judges `components/admin/editor/` for
  that claim, admits that one file by name, and fails on the commit that adds an UNDECLARED
  `'use client'` there - or that leaves the allowlist naming a file which no longer carries
  the directive. **That allowlist now names three files**, not one: Phase 4 Task 8 put
  `components/admin/media/` inside the same scan and declared its two islands
  (`docs/deviations.md` §68). The editor's own count is unchanged - one.
  **The pool's duration chip is behind `MEDIA_PIPELINE`**, which is design spec §9.3's
  "whether the admin shows clip-specific affordances": the flag is read on the server, turned
  into a yes or a no by `showsClipAffordances`
  (`packages/domain/src/media/ingestPolicy.ts`, derived from `acceptedIngestTypes` rather
  than from the mode's name) and passed down. The TILE is still drawn either way — a clip
  ingested before the flag moved is content, and hiding it would make the screen lie about
  what the library holds.

### `GET /admin/media`

- **Path:** `apps/web/app/(admin)/admin/media/page.tsx`; the frame is
  `apps/web/components/admin/shell/AdminShell.tsx`, and the screen inside it is
  `apps/web/components/admin/media/` - `Dropzone.tsx`, `UploadCard.tsx` and `MediaGrid.tsx`.
- **Method:** `GET`. This route answers nothing else; the upload path is
  `PUT /admin/media/upload` (documented above) and the three bulk mutations are Server
  Actions with their own opaque `POST` addresses.
- **Input:** the session cookie, plus two optional query parameters - `q`, what the author
  typed into the filename search, and `filter`, one of `stills`, `clips`, `in-the-book` or
  `unused`. Both are parsed by `mediaQuery` in `apps/web/lib/admin/readMediaScreen.ts`: a
  repeated parameter takes its first value, and a `filter` no chip offers falls back to
  `everything` rather than selecting nothing.
- **Output:** an HTML document: `SCREENS.md` §2's shell - with the screen title "Media" and a
  crumb reading "{drawn} of {total}" - around §2.4's screen: the dashed dropzone with its
  "Add to — {journey}" select and Browse, the upload card while a batch is in flight, the
  filename search, the five filter chips, a bulk bar that appears only with a selection, and
  the tile grid. `metadata` sets the document title and
  `robots: { index: false, follow: false }`.
- **Reads:** three call sites, eight queries, under ONE hoisted `adminScope` -
  `readNavCounts` (four `payload.count` calls), one `findGlobal('site')` selecting `name`,
  and `readMediaScreen` (three: the media, the pages that hold it, and the live journeys).
  Eight whatever the size of the library: "is this one used anywhere" is a fold over every
  page's `slots` built once, not a read per tile (CLAUDE.md §6). Plus the one `users` row
  `adminScope` itself resolves.
- **Errors:** none observable from the screen's own content. A refused read would throw
  before anything is drawn. A search or a chip that matches nothing draws
  "Nothing here — {n} in the library." in place of the grid.
- **Auth requirement:** **signed in.** `requireAdminSession` runs in this file before
  anything is drawn, with the same five refusals `GET /admin` lists.
- **Notes:** **this is the one admin read that is not keyed by journey**, because §2.4's grid
  is the library rather than one journey's pool - said out loud in `readMediaScreen.ts`'s
  header, because a read with no journey clause is the shape CLAUDE.md §7 exists to make
  suspicious.

  **The search is SQL and the chips are memory.** A filename search is a `like` on a column,
  so it narrows what crosses the wire; `unused` is a fact about an array column on another
  collection and cannot be a `where` at all, so all five chips are applied together by
  `packages/domain/src/admin/mediaFilters.ts`. `total` is therefore what the SEARCH admitted,
  before the chip.

  **The screen ships TWO client entries**, which is two more than every admin screen before
  it, and `apps/web/lib/admin/shellShipsNoClientJs.test.ts` names both. An upload is four
  round trips a `<form action>` cannot make (spec §9.1, `docs/adr/0020`), and §2.4's bulk bar
  appears with a selection that is a `ReadonlySet<MediaId>` - an address would be a
  navigation per tick. The search and the chips are still a `GET` form and five `<a>`s; they
  are drawn inside the grid island only because §2.4 puts them in one flex row with the bar
  (`docs/deviations.md` §68).

  **The grid windows past a hundred tiles** (design spec §12, CLAUDE.md §6). The arithmetic is
  `virtualWindow` in `packages/domain/src/admin/gridColumns.ts` - pure, because jsdom lays
  nothing out - and the component measures. Measured in a browser with 145 rows: 120 tile
  elements, unchanged by scrolling (`e2e/upload.spec.ts` carries it as a standing case).

  **The dropzone's note names what this pipeline accepts, not what §2.4 promises.** It reads
  "JPEG and PNG." here, built from `acceptedIngestTypes(MEDIA_PIPELINE)`: HEIC is refused at
  the port (`docs/adr/0021`) and both clip types are behind a worker ADR 0004 defers
  (`docs/deviations.md` §66). The duration chip is behind the same flag, exactly as the
  journey editor's pool's is.

  **§2.4 is the first screen anywhere here that writes `media.inBook`**, and the first that
  displays it per tile - `docs/deviations.md` §63 records the column having had an eyebrow
  counting it and no tile showing it.

### `GET /admin/galleries`

- **Path:** `apps/web/app/(admin)/admin/galleries/page.tsx`; the frame is
  `apps/web/components/admin/shell/AdminShell.tsx`, and the screen inside it is
  `apps/web/components/admin/galleries/` — `FrameGrid.tsx`, with `SelectedFrame.tsx` and
  `CaptionAll.tsx` drawn by it.
- **Method:** `GET`. This route answers nothing else; its five mutations are Server Actions
  with their own opaque `POST` addresses.
- **Input:** the session cookie, plus three optional query parameters. `journey` is the row id
  of the gallery being arranged. `frame` is the `media` row this screen opens with SELECTED,
  and `captionAll=1` opens §2.5's bulk caption panel already expanded — both written by
  `SCREENS.md` §2.1's prompts and parsed here by `promptedSelection`
  (`@travel-diary/domain/admin/prompts`), which is the inverse of the function that writes
  them, so the two screens share one definition rather than two spellings. A repeated
  parameter takes its first value on all three; a journey that is not there (a typo, a trashed
  journey somebody bookmarked) falls back to the first offered rather than drawing a grid with
  nothing in it and no way out; a `frame` that is not a row id Postgres could have minted, or
  that names a frame this gallery does not hold, falls back to the first frame the same way.
  All three are INITIAL values — once an author presses a tile or the "Caption all" button,
  the address has had its say.
- **Output:** an HTML document: `SCREENS.md` §2's shell — with the screen title "Galleries"
  and a crumb reading "{n} frames" — around §2.5's screen: the journey select with its
  "{name} — {n} frames" labels, the line "Drag to reorder. The first frame is the gallery
  cover.", "Sort by date" and "Caption all", the bulk caption panel when it is open, the tile
  grid, and the selected-frame panel beside it. `metadata` sets the document title and
  `robots: { index: false, follow: false }`.
- **Reads:** three call sites, eight queries, under ONE hoisted `adminScope` —
  `readNavCounts` (four `payload.count` calls), one `findGlobal('site')` selecting `name`,
  and `readGalleriesScreen` (three: the journeys the select offers, the pages that name the
  decorative scraps, and every gallery frame in the diary). Eight whatever the size of the
  diary: the "{n} frames" beside each option is a fold over the one media read, not a count
  per journey (CLAUDE.md §6). Plus the one `users` row `adminScope` itself resolves.
- **Errors:** none observable from the screen's own content. A refused read would throw
  before anything is drawn. A journey with no frames draws "Nothing in this gallery yet." in
  place of the grid, and a diary with no journeys at all draws "There are no journeys to
  arrange yet."
- **Auth requirement:** **signed in.** `requireAdminSession` runs in this file before
  anything is drawn, with the same five refusals `GET /admin` lists.
- **Notes:** **the arrangement is the diary's own.** `readGalleriesScreen` asks
  `apps/web/lib/galleryFrames.ts` for both the `where` and the sort rather than writing its
  own, so "first" means the same thing here as it does under `/gallery/<slug>` — which is
  what makes §2.5's line, "The first frame is the gallery cover", one sentence about two
  screens. It asks for ONE CLAUSE LESS: §2.5 draws a "Hidden" chip and the toggle that
  clears it, so this is the one reader that passes `includeHidden`
  (`docs/deviations.md` §79).

  **Selection is a frame id, never a position** (CLAUDE.md §0.9, and §2.5 states it in bold).
  The id is resolved against the list on screen on every render and falls back to the first
  frame when it names nothing there, which is what happens the moment the select pushes
  another address — Next.js re-renders the Server Component in place and the island keeps its
  state (GAL-001, `docs/qa/2026-09-20-galleries-screen-sweep.md`).

  **The screen ships ONE client entry**, and it is the whole screen
  (`docs/deviations.md` §76). A drag is a pointer gesture no form post carries, and the
  selection, the arrangement and the bulk panel are one screen's state.
  `apps/web/lib/admin/shellShipsNoClientJs.test.ts` names the file and asserts the count.

  **It is operable without a pointer.** Each tile's grip is a real button whose arrow keys
  move the frame one place, and whose `Home` and `End` send it to either end
  (`docs/deviations.md` §78). §2.5 specifies `cursor: grab` and nothing about a keyboard.

  **A hidden frame is listed without its photograph** (`docs/deviations.md` §77), and **this
  screen is not judged by the Lighthouse gate** (`docs/deviations.md` §80), measured at
  4,162ms against 3,085ms with 70% of that in Render Delay rather than in bytes.

### `GET /admin/book`

- **Path:** `apps/web/app/(admin)/admin/book/page.tsx`; the frame is
  `apps/web/components/admin/shell/AdminShell.tsx`, and the screen inside it is
  `apps/web/components/admin/book/` — `BookmarkOrder.tsx` and `BookSettings.tsx`.
- **Method:** `GET`. This route answers nothing else; its two mutations are Server Actions
  with their own opaque `POST` addresses.
- **Input:** the session cookie. Nothing else — this screen has no address of its own beyond
  the path.
- **Output:** an HTML document: `SCREENS.md` §2's shell — with the screen title
  "Book & bookmarks" and a crumb reading "{n} bookmarks" — around §2.6's two cards: the
  bookmark list under "this is also the order of the book", one row per page-group of the
  book with its grip, its 9px tint square, its name, its place, its derived "p. {n}" and its
  two 26px arrows; and the Book settings card with the contents-page note, the three journey
  order chips, the four cover cloths, the two sliders and the three toggles. `metadata` sets
  the document title and `robots: { index: false, follow: false }`.
- **Reads:** three call sites, seven queries, under ONE hoisted `adminScope` —
  `readNavCounts` (four `payload.count` calls), one `findGlobal('site')` selecting `name`, and
  `readBookScreen` (two: the `book` global's eight settings columns, and the journeys the
  book contains). Seven whatever the size of the diary; the page numbers cost no query at all
  (CLAUDE.md §6). Plus the one `users` row `adminScope` itself resolves.
- **Errors:** none observable from the screen's own content. A refused read would throw before
  anything is drawn. A diary with no journeys draws the three fixed rows and nothing else.
- **Auth requirement:** **signed in.** `requireAdminSession` runs in this file before anything
  is drawn, with the same five refusals `GET /admin` lists.
- **Notes:** **"p. {n}" is derived, never stored** (`DATA_MODEL.md`, "Derived, not stored").
  `numberBookmarkPages` walks the list the way `derivePages` walks the reading sequence, and
  `readBookScreen.integration.test.ts` compares the result against `readBookBundle`'s own
  contents entries — two different code paths, so the agreement is evidence rather than a
  restatement.

  **The list is the book's own order.** It uses `BOOK_JOURNEYS_QUERY` (shared with the write
  that renumbers the journeys) and `readBookBundle`'s own `sortForJourneyOrderMode`. That sort
  is imported rather than copied because a copy was written first and was wrong within the
  hour: it returned `'order'` where the diary returns `['order', 'createdAt']`.

  **Cover, Contents and About refuse to move**, in both directions, and the rule is
  `moveBookmark`'s in `packages/domain/src/admin/bookmarkOrder.ts` rather than the markup's.
  Each arrow posts the WHOLE new sequence of journey ids, and `saveBookmarkOrder` refuses
  anything that is not a bijection onto the book's journeys.

  **The arrows are off unless the book is arranged by hand** (`docs/deviations.md` §84), with
  one line saying why — under either date mode they would write a column the book ignores.

  **The screen ships ONE client entry**, `BookSettings.tsx`, and it is half the screen:
  SCREENS.md §2.6 states that both sliders are controlled and their readouts follow the value.
  The bookmark list beside it ships nothing.
  `apps/web/lib/admin/shellShipsNoClientJs.test.ts` names the file and asserts the count,
  which is now **seven** across the admin.

  **There is no visual baseline for this screen yet** (`docs/deviations.md` §86).

### `GET /admin/cover`

- **Path:** `apps/web/app/(admin)/admin/cover/page.tsx`; the frame is
  `apps/web/components/admin/shell/AdminShell.tsx`, and the screen inside it is
  `apps/web/components/admin/book/` — `CoverPreview.tsx` and `AboutCard.tsx`.
- **Method:** `GET`. Its two mutations are Server Actions with their own opaque `POST`
  addresses.
- **Input:** the session cookie.
- **Output:** an HTML document: `SCREENS.md` §2's shell — with the screen title
  "Cover & About" and a crumb reading "front matter" — around §2.7's two cards: the 172x224px
  live cover preview beside Title, Subtitle, Kept by and Years shown with four cloth swatches
  under them; and the About card's 140px portrait with Replace, two paragraph textareas, the
  Kit list and the reply-to address.
- **Reads:** three call sites, nine queries, under ONE hoisted `adminScope` — `readNavCounts`
  (four `payload.count` calls), one `findGlobal('site')` selecting `name`, and
  `readCoverScreen` (four: the `book` global's cover columns, the `about` global, the capped
  list of replacement photographs, and the portrait itself). The last is skipped outright when
  no portrait is set, so a diary that has never had one costs eight. None of them grows with
  the library. Plus the one `users` row `adminScope` itself resolves.
- **Errors:** none observable from the screen's own content. Every field of both globals is
  nullable, and a cleared one draws an empty box rather than failing the screen.
- **Auth requirement:** **signed in.** `requireAdminSession` runs in this file before anything
  is drawn.
- **Notes:** **the preview uses the diary's own fitter.** `fitPreviewTitleSize` lives beside
  the cover page's `fitTitleSize` in `packages/domain/src/coverTitle.ts`, so SCREENS.md §1.1's
  "Title must fit, not truncate" and this preview cannot be changed apart. It is not
  `fitTitleSize` with a smaller width — that function floors at 38px, which overflows a 144px
  box — so both of its bounds are the admin prototype's own.

  **Replace is a select** (`docs/deviations.md` §83): the prototype's button carries no
  handler at all, and a `<select>` over the media library plus a submit is the smallest
  control that actually replaces a portrait and ships no JavaScript. Its first option is
  valued `''`, which the write reads as "leave the portrait alone", so a save about the two
  paragraphs cannot empty the mount. The list is capped at `MAX_PORTRAIT_CHOICES`; a portrait
  older than the cap is still drawn, because it is read by its own id.

  **The Kit draws one input more than it holds**, which is how a line is added with no
  JavaScript, and blank kit lines are dropped on save. The two paragraph boxes are a FIXED
  count instead, so clearing the first does not slide the second into its box.

  **The screen ships ONE client entry**, `CoverPreview.tsx`, because §2.7 calls the preview
  live. The About card beside it is one `<form>` and ships nothing.

  **There is no visual baseline for this screen yet** (`docs/deviations.md` §86).

### `GET /admin/publish`

- **Path:** `apps/web/app/(admin)/admin/publish/page.tsx`; the frame is
  `apps/web/components/admin/shell/AdminShell.tsx`, and the screen inside it is
  `apps/web/components/admin/publish/` — `PublishSelection.tsx` over `Headline.tsx` and
  `ChangesCard.tsx`, beside `EditionsCard.tsx`.
- **Method:** `GET`. Its three mutations are Server Actions with their own opaque `POST`
  addresses.
- **Input:** the session cookie. Nothing else — this screen has no address of its own beyond
  the path.
- **Output:** an HTML document: `SCREENS.md` §2's shell — with the screen title "Publish" and
  a crumb reading "{n} changes waiting" — around §2.8's three cards: the headline card with
  its washi strip, the count in Caveat 40px, "Nothing below is visible to readers until you
  publish." and the primary button; the Changes card under "tick what goes out", one row per
  waiting change with a 21px checkbox, its tone chip, its text over "{location} · {when}" and
  Revert; and the Editions card, one row per published version of a journey with a 9px rotated
  mark, the timestamp, the description and Restore. `metadata` sets the document title and
  `robots: { index: false, follow: false }`.
- **Reads:** four call sites, ten queries, under ONE hoisted `adminScope` — `readNavCounts`
  (four `payload.count` calls), one `findGlobal('site')` selecting `name`,
  `readPendingChanges` (four: the live journeys, their latest versions, their pages, and
  those pages' latest versions) and `readEditions` (one). Ten whatever the size of the diary.
  Plus the one `users` row `adminScope` itself resolves.
- **Errors:** none observable from the screen's own content. A diary with nothing waiting
  draws one line in place of the rows, and a book that has never gone out draws one in place
  of the editions.
- **Auth requirement:** **signed in.** `requireAdminSession` runs in this file before anything
  is drawn, with the same five refusals `GET /admin` lists.
- **Notes:** **this is the screen design spec §8 has been waiting for.** "Publishing triggers
  on-demand revalidation of affected paths only" was recorded as a gap on `GET /p/<n>` for
  three phases; `publishSelection` now answers the diary addresses one publish makes stale and
  `actions.ts` spends them. The addresses are COMPUTED — one `/p/<n>` per page of each journey
  that went out, plus the Contents page and each journey's `/gallery/<slug>` — so they are the
  one revalidation in this repository that no registration test can read off a source file.
  `publishSelection.integration.test.ts` measures WHICH paths against the book's own page
  list, and `publishRevalidationRegistration.test.ts` asserts that both writes that answer any
  spend every one of them.

  **The bundle is read BEFORE the publish.** A cache entry can only exist for an address that
  has been served, and publishing a journey the book does not hold yet inserts three leaves
  and renumbers everything after them — which is why `affectedPaths` answers the whole book
  for a journey it cannot find in it.

  **Only two kinds of thing can be waiting** (`docs/deviations.md` §87). `DATA_MODEL.md` puts
  `versions: { drafts: true }` on `journeys` and `pages` and on nothing else, so a caption, an
  upload, a bookmark reorder and a cover title are written live and reach a reader at once.
  The prototype's four pending rows include three that this data model publishes immediately.

  **An empty selection publishes nothing, and asks the database nothing.** The array is the
  selection; `[]` is "nothing was ticked" and never "everything".

  **Revert is a submit button, and its row id is a BOUND argument, not a posted field.** A
  `<form>` inside a `<form>` is invalid HTML, so each row's Revert carries a `formAction` of its
  own. It cannot carry the id in `name`/`value`: React uses the SUBMITTER's own `name` and
  `value` to encode the action id when the `formAction` is a Server Action, so `name="revert"`
  is overwritten with `$ACTION_ID_…` between the server render and the browser — a hydration
  mismatch on screen and an empty field on the wire, which is what `e2e/admin.spec.ts`'s Revert
  case caught. `revertOneChange` therefore takes `id: string` and the card calls
  `revert.bind(null, change.id)`, which is the other shape Next.js documents for passing an
  argument. `actions.ts`'s own header carries the measurement. The Editions card's Restore is a
  real `<form>` with a hidden field, which is the same documented pair and has no submitter to
  collide with. It is withheld on a row that has never been
  published, because there is nothing behind it to go back to and §2.8 draws no error surface
  (`docs/deviations.md` §60).

  **The screen ships ONE client entry**, `PublishSelection.tsx`, because §2.8's button reads
  "Publish 2 of 4" and its rows strike through as boxes are cleared — the tick state and the
  text printed from it in one render. The Editions card beside it is a server component whose
  every Restore is a `<form>`.

  **There is no "Preview draft" and no "View" on an edition** (`docs/deviations.md` §88): the
  diary serves published rows at every address, so neither control has anywhere to lead.

  **There is no visual baseline for this screen yet** (`docs/deviations.md` §86).

### `GET /admin/settings`

- **Path:** `apps/web/app/(admin)/admin/settings/page.tsx`.
- **Method:** `GET` — a React Server Component route.
- **Input:** none. No path parameter, no query, no body.
- **Output:** an HTML document: `SCREENS.md` §2.9 — two equal columns, the left stacking
  "The site" (four fields, each with an italic hint) and "Your material" (the explanatory
  paragraph, Export everything / Import a backup, "Space used" with its 7px segmented bar
  and legend), the right holding "Readers" (one toggle per `site` checkbox, then a
  "Careful now" block). Its content is
  `apps/web/lib/admin/readSettingsScreen.ts`'s `SettingsView`, read in TWO statements.
  `metadata` sets the document title and `robots: { index: false, follow: false }`.
- **Errors:** a refused session redirects to `/admin/sign-in`. A Payload failure surfaces
  as a `500`.
- **Auth requirement:** **signed in.** `requireAdminSession()` is applied in this file.
- **Notes:** the toggle list is DERIVED from the `site` global's own `checkbox` fields, so a
  sixth setting appears here the day it lands rather than becoming a setting no screen can
  reach. Two of §2.9's controls cannot be answered by this data model and are drawn as what
  is true instead — see `docs/deviations.md` §103.

### `GET /admin/trash`

- **Path:** `apps/web/app/(admin)/admin/trash/page.tsx`.
- **Method:** `GET` — a React Server Component route.
- **Input:** none.
- **Output:** an HTML document: `SCREENS.md` §2.10 — one card, max 1000px, headed "Kept for
  thirty days" with a count, and a row per trashed journey (a 46px thumb, the name over
  "{place} · {n} pages · {n} photographs", the countdown, then Put back and Delete for
  good). Its content is `apps/web/lib/admin/readTrashScreen.ts`, read in THREE statements,
  with the clock taken once per render. `metadata` sets the document title and
  `robots: { index: false, follow: false }`.
- **Errors:** as `/admin/settings` above.
- **Auth requirement:** **signed in.** `requireAdminSession()` is applied in this file.
- **Notes:** NOTHING SWEEPS THE TRASH. No job removes a row when its thirty days are up, so
  a row past the window is still listed, still restorable, and says so rather than counting
  down to a promise this repository does not keep.

### `GET /admin/account`

- **Path:** `apps/web/app/(admin)/admin/account/page.tsx`.
- **Method:** `GET` — a React Server Component route.
- **Input:** an optional `?password=` query, carrying `changed`, `wrong-password` or
  `empty-password`. `passwordNotice` refuses any other value, so a hand-typed address can
  only produce one of the card's own three lines.
- **Output:** an HTML document: `SCREENS.md` §2.11 — two equal columns and four cards.
  "Who is keeping this" (a 132px monogram, Name on the cover, Sign-off used on pages, and a
  Time zone select whose options carry an example date), "Tell me when" (two toggles),
  "Getting in" (the sign-in address, Current / New password in two columns above 900px, and
  the "One-time code at sign-in" toggle with its two hints), and "Where you are signed in"
  (a row per live session with a 9px mark filled for the current one, then Sign out
  everywhere and Sign out). Its content is
  `apps/web/lib/admin/readAccountScreen.ts`'s `AccountView`, read in ONE statement — the
  profile comes off the row `adminScope` already resolved. `metadata` sets the document
  title and `robots: { index: false, follow: false }`.
- **Errors:** as `/admin/settings` above. A refused password change is NOT a `500`: the
  action redirects here with the query above and the card prints the line.
- **Auth requirement:** **signed in.** `requireAdminSession()` is applied in this file.
- **Notes:** the screen is reached from the rail's profile button and is deliberately not a
  nav entry (`packages/domain/src/admin/navigation.ts`). The row marked **Current** is the
  one whose stored hash matches THIS request's cookie, never the newest row. Revoke
  addresses a session by its ROW id, because only the identifier's hash is stored. A wrong
  current password spends one of `maxLoginAttempts`, so five of them lock the account for
  fifteen minutes exactly as five at the sign-in screen do — and the session the author is
  already in keeps working. §2.11's avatar has nothing to draw in this data model; see
  `docs/deviations.md` §106.

### `GET /admin/export`

- **Path:** `apps/web/app/(admin)/admin/export/route.ts` —
  `export const GET = guarded(handleExport)`.
- **Method:** `GET`. A route rather than a server action, because the response is a stream
  of bytes the browser saves rather than a value a component re-renders from.
- **Input:** none. The export is the whole diary and takes no parameters.
- **Output:** `application/json; charset=utf-8`, as an attachment named
  `travel-diary-<yyyy-mm-dd>.json`, with `Cache-Control: private, no-store` and
  `X-Robots-Tag: noindex`. The document holds `takenAt`, an `excludes` list in words, every
  row of every CONTENT collection, every global, and a media manifest — one entry per stored
  file, with its key, size and hash.
- **Errors:** a refused session is answered `303` to `/admin/sign-in` with the dead cookie
  cleared. A Payload config declaring a collection or global nobody has classified makes the
  handler THROW, which surfaces as a `500` — deliberately: an export that quietly included
  something unclassified is the failure this refuses.
- **Auth requirement:** **signed in.** Built from `guarded`.
- **Notes:** what is in it is `apps/web/lib/admin/exportEverything.ts`'s decision, not this
  route's. It excludes the photographs themselves (the bucket is backed up by the bucket's
  own versioning) and five collections that hold credentials, PII or machinery —
  `users`, `sessions`, `otpChallenges`, `signInAttempts`, `jobs` — plus Payload's own four
  internal collections. `docs/deviations.md` §103 records why it is JSON rather than a ZIP.

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
- **Auth requirement:** none. It is the door. It is `Disallow`ed in `app/robots.ts`
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
  `ADMIN_PUBLIC_PATHS` declares this address. It is `Disallow`ed in `app/robots.ts`
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
- **Reads:** `readSignInScreen` for the cloth panel's title, subtitle and cloth, and
  `readPendingChanges` (four queries, under one hoisted `adminScope`) for the number the
  status line prints. The one `users` row `adminScope` itself resolves makes six.
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
  `apps/web/lib/auth/adminGuardRegistration.test.ts`.

  **The status line names a real number, as of Phase 4 Task 11**, which is what closed
  `docs/deviations.md` §38. It reads "4 changes are still unpublished." — or "Nothing is
  waiting to go out." when none is — from `readPendingChanges`, the SAME read `GET
/admin/publish`'s Changes card is drawn from, so the two screens cannot disagree about the
  count. The prototype's trailing "from your last session" is still not printed, because no
  draft version records the session that wrote it (`docs/deviations.md` §89).

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

### `PUT /admin/media/upload?token=<capability>`

- **Path:** `apps/web/app/(admin)/admin/media/upload/route.ts`; the handler is
  `apps/web/lib/media/localUploadEndpoint.ts`'s `handleLocalUpload`, and the decisions are
  `apps/web/lib/media/receiveLocalUpload.ts`'s.
- **Method:** `PUT`, which is what a browser's own `fetch(url, { method: 'PUT', body: file })`
  sends — measured against this repository's Chromium, along with the `Content-Type` (the
  `File`'s own type) and the `Content-Length` (set by the browser from the body, and not
  settable by the page). See `apps/web/lib/media/uploadContract.ts`'s header for the run.
- **Input:** the capability token in the query string, and the file's bytes as the body.
  **The storage key comes from inside the token, never from the URL** — otherwise this
  address would be a write-anywhere primitive.
- **Output:** `204` with no body.
- **Errors:** `413` when the body is over the cap the token carries. The cap is **the
  weighing of the bytes that actually arrived**; the `Content-Length` check that runs
  first is an optimisation for clients that declare one — every browser does — and a
  chunked client that declares nothing walks past it and is refused after the body has
  been buffered. Accepted rather than fixed by streaming: the route is behind the admin
  guard, and it is deleted or gated the day R2 lands (see Notes). `403` for a malformed,
  expired or wrongly-signed token, **all three identically**, so the endpoint cannot
  become an oracle telling a forger which part was wrong. `500` when the store refused or
  could not take the bytes. No refusal carries a body.
- **Auth requirement:** **signed in.** The guard is applied in the route file
  (`guarded(handleLocalUpload)`). A token is a capability over one key, not
  authentication, so a leaked URL is not a way in.
- **Notes:** this route exists because there is no R2 bucket on a developer machine and
  the local disk adapter's `signedUrl` returns a `file://` URL no browser can PUT to — see
  `docs/adr/0020-the-presign-seam-and-the-local-upload-receiver.md`, which also records
  the residual: **it must be deleted or gated in the same change that adds the R2
  adapter.**

## Server actions (live today)

**A `ZodError` FROM AN ACTION WHOSE FIRST ARGUMENT IS A `FormData` IS DRAWN, NOT THROWN**
(Phase 4 Task 15d, `docs/deviations.md` §104). Every `Errors:` line below that names a `ZodError`
still describes what the parse refuses, and that is unchanged; what changed is where the refusal
goes. `guardedAction` catches it, hands the messages and the posted values the form asked to keep
to the render that follows, and the action resolves with `undefined`. The screen redraws with the
message and the author's typing still in the boxes, and answers `200`. It used to answer `500`,
which four screens were measured doing.

**THE TEST IS `FormData`-NESS, NOT FORM-DISPATCH-NESS**, and this paragraph said the second until
a review measured the tree. Every `<form action={…}>` sends a `FormData`, so all of those are
caught — and so are **three** actions no form dispatches: `setSlotFocalPoint`, `setSlotText` and
`clearSlot`, which `SlotPanel.tsx` builds a `FormData` for and calls from an island. (A fix round
wrote `setSlotMedia` into that list and it does not belong there: it is the journey pool's
ordinary `<form action={place}>`.) The three are caught, and the island `void`s the promise, so it
reads neither a rejection nor a resolved `undefined`; a refusal drawn on the screen is better than
one that answers 500, so this is acceptable rather than accidental.

**An action called with typed arguments keeps its refusal as a rejection**, because there is a
caller holding the promise: `requestUploadSlots`, `finaliseUpload`, `saveCover`,
`saveBookSettings` and the Galleries screen's five are in that group, and
`guard.integration.test.ts`'s `keeps a value-returning action’s refusal as a rejection` is what
holds the line between the two. Nothing but a `ZodError` is caught either way — a refused Payload
write still reaches the error boundary it always did.

### `requestUploadSlots(request: UploadSlotRequest): Promise<UploadSlotResponse>`

- **Path:** `apps/web/app/(admin)/admin/media/actions.ts`; the decisions are
  `apps/web/lib/media/uploadSlots.ts`'s `offerUploadSlots`.
- **Input:** the journey to stage under, and one `{ filename, declaredType, byteLength }`
  per file the picker selected. Every field is the client's claim; nothing has been
  weighed.
- **Output:** one slot per file — `{ stagingKey, declaredType, filename, uploadUrl }` — in
  the order asked for, each URL carrying its own token over its own key.
- **Errors:** `'empty-request'`, `'too-many-files'` (over `MAX_FILES_PER_REQUEST`, 20),
  `'too-large'` (zero bytes, or over `MAX_UPLOAD_BYTES`, 52,428,800), `'type-not-offered'`
  (a type the bound `MediaProcessor` does not accept — under `MEDIA_PIPELINE=inline` that
  is every video type), `'unnamed-file'`, `'invalid-journey'`, `'no-upload-url'`. **The
  whole request is refused when one file fails**, so a caller is never handed three slots
  for four files.
- **Auth requirement:** **signed in.** Built from `guardedAction`, which is what
  `eslint-rules/guarded-server-actions.js` requires of every value export of a
  `'use server'` module.
- **Notes:** the caps are enforced again at the receiver above. The plan is only what the
  client was told, and a client is not what enforces a cap.

### `finaliseUpload(request: FinaliseRequest): Promise<FinaliseResponse>`

- **Path:** `apps/web/app/(admin)/admin/media/actions.ts`; the decisions are
  `apps/web/lib/media/ingestUpload.ts`'s `finaliseStagedUpload` and `ingestUpload`.
- **Input:** `{ stagingKey, declaredType, filename, journey }` — the same three claims the
  slot was offered for, plus the journey the row belongs to. Every field is the client's
  claim: the type is weighed by `sniffMediaType` over the bytes, the filename decides only
  the stored name, and **the key must be one `planUploadSlots` would have minted for this
  journey** (`isStagingKeyFor`), checked before the object is read. That is a narrower
  question than the store's own `validateStorageKey`, which asks only whether a key is
  well formed — and a stored photograph's key is well formed. This row said
  `validateStorageKey` was the protection, which was an overstatement: ingest reads AND
  deletes what it is handed, and the production store is rooted at `MEDIA_DIR`, where
  Payload keeps every stored file.
- **Output:** one of `{ kind: 'ready', media }`, `{ kind: 'duplicate', of }` or
  `{ kind: 'queued', media, job }`. **No storage key in any arm** — a response naming one
  would hand the caller the store's own naming, which is the enumeration
  `readGalleryDownload` refuses to enable. `'queued'` only under `MEDIA_PIPELINE=worker`.
- **Errors:** `'svg-rejected'`, `'video-deferred'`, `'heic-unsupported'`,
  `'type-not-allowed'`, `'declared-mismatch'`, `'unreadable'` (the processor's own
  refusals, every one of them decided from the BYTES); `'key-not-staged'` (the key is not
  one this journey's slots were minted under — refused before anything is read or
  deleted); `'staged-bytes-missing'` (the key names no object);
  `'invalid-journey'` (the id names no journey a row could be keyed by);
  `'not-queued'` (a `worker` ingest could not hand the upload on). **A refusal creates no
  row**, and the staged object is deleted on every one of these paths — it is the
  pre-strip original.
- **Auth requirement:** **signed in.** Built from `guardedAction`, which is what
  `eslint-rules/guarded-server-actions.js` requires of every value export of a
  `'use server'` module.
- **Notes:** **under `MEDIA_PIPELINE=inline`, which is the only mode that boots**,
  duplicate detection is scoped to ONE journey (`CLAUDE.md` §7), in one query with the
  journey in its `where`, and the match is perceptual rather than an equality — a re-save,
  a re-encode or a resize of a photograph already in the journey is reported as a copy.
  **A re-crop is not**, and this sentence said it was: measured, five per cent off every
  edge is 13 bits away against a threshold of 5. See
  `docs/adr/0022-perceptual-hashing-and-the-duplicate-threshold.md` for the table. **Under
  `worker` there is no duplicate detection at all:** that mode does not run the pipeline,
  so the row is created from the staged bytes at `state: 'processing'` with no
  `contentHash` to match on, and a `transcode` job is enqueued for a worker that has to do
  the matching as well as the processing. `worker` is refused at `parseEnv` until such a
  worker exists — see `docs/runbook.md` and `docs/security.md` for the two controls and
  the order that removes them.

### `createJourney(form: FormData): Promise<void>`

- **Path:** `apps/web/app/(admin)/admin/journeys/actions.ts`; the decisions are
  `apps/web/lib/admin/journeyMutations.ts`'s `readNewJourney` and `createJourneyRow`.
- **Method:** server action.
- **Input:** the create panel's `FormData` - `name`, `place`, `dates` - parsed by
  `readNewJourney`'s Zod schema: three trimmed, non-empty strings. `FormData` rather than
  an object because a `<form action={...}>` is the only caller there is.
- **Output:** `void`. The screen is re-rendered by `revalidatePath('/admin/journeys')`.
- **Errors:** a `ZodError` when any field is missing, empty or not a string; from Payload,
  a refused write. The slug is derived from the name and made unique before the write, so
  a second journey of the same name does not fail the collection's unique index.
- **Auth requirement:** **signed in.** Built from `guardedAction`, which is what
  `eslint-rules/guarded-server-actions.js` requires of every value export of a
  `'use server'` module.
- **Notes:** **the journey is created as a DRAFT**, which is what the panel's own line
  promises - "Starts as a draft - no bookmark until you publish." - and **three pages are
  created with it**, one `notes` and two `frames` (Notes, Frames I, Frames II), which is the
  other sentence the panel prints. Both are asserted in
  `journeyMutations.integration.test.ts`.

### `duplicateJourney(form: FormData): Promise<void>`

- **Path:** `apps/web/app/(admin)/admin/journeys/actions.ts`; the decisions are
  `apps/web/lib/admin/journeyMutations.ts`'s `readJourneyRef` and `duplicateJourneyRow`.
- **Method:** server action.
- **Input:** the row strip's `FormData` - one `journey` field, coerced to a positive
  integer by Zod, so nothing reaches the driver as `NaN`.
- **Output:** `void`, then `revalidatePath('/admin/journeys')`.
- **Errors:** a `ZodError` when the field is absent or is not a row id; from Payload, `Not
Found` when the id names no journey, and a refused write.
- **Auth requirement:** **signed in**, through `guardedAction`.
- **Notes:** the copy is named `"<name> (copy)"`, takes a slug that does not collide, and
  **is a draft even when the source is published** - a duplicate that went out the moment it
  was made would publish an unedited copy of somebody's journey. Its pages are copied with
  their slots, and every array row's `id` is stripped: handing Payload the SOURCE's array
  ids asks it to insert rows that already exist, which it refuses as "The following field is
  invalid: id".

### `archiveJourney(form: FormData): Promise<void>`

- **Path:** `apps/web/app/(admin)/admin/journeys/actions.ts`; the decision is
  `apps/web/lib/admin/journeyMutations.ts`'s `toggleJourneyArchived`.
- **Method:** server action.
- **Input:** the row strip's `FormData` - one `journey` field, as above.
- **Output:** `void`, then `revalidatePath('/admin/journeys')`.
- **Errors:** a `ZodError` for a field that is not a row id; from Payload, `Not Found` and
  a refused write.
- **Auth requirement:** **signed in**, through `guardedAction`.
- **Notes:** it TOGGLES, because SCREENS.md §2.2's strip prints Archive or Unarchive from
  the row's own state and posts the same action either way - so it reads the row before it
  writes. Archiving is a shelf and not a stage: `journeyStatus` lets `archived` shadow the
  version state rather than replacing it.

### `trashJourney(form: FormData): Promise<void>`

- **Path:** `apps/web/app/(admin)/admin/journeys/actions.ts`; the decision is
  `apps/web/lib/admin/journeyMutations.ts`'s `softDeleteJourney`.
- **Method:** server action.
- **Input:** the row strip's `FormData` - one `journey` field, as above.
- **Output:** `void`, then `revalidatePath('/admin/journeys')`.
- **Errors:** a `ZodError` for a field that is not a row id; from Payload, `Not Found` and
  a refused write.
- **Auth requirement:** **signed in**, through `guardedAction`.
- **Notes:** **a `deletedAt`, never `payload.delete`** (CLAUDE.md §7). SCREENS.md §2.10
  keeps the trash for thirty days with a restore, so the row has to survive - and the
  journey's pages are left exactly where they are, because a restore returns a journey
  whole rather than an empty one. `journeyMutations.integration.test.ts` asserts both
  halves: the list stops showing it AND the row is still there with a `deletedAt` on it.

### `addPage(form: FormData): Promise<void>`

- **Path:** `apps/web/app/(admin)/admin/journeys/[id]/actions.ts`; the decisions are
  `apps/web/lib/admin/pageMutations.ts`'s `readNewPage` and `addPageRow`.
- **Method:** server action.
- **Input:** the layout box's `FormData` - `journey` and `layout` - parsed by `readNewPage`:
  a positive integer row id, and a layout that must be one
  `@travel-diary/domain/admin/layoutGlyphs`'s own `LAYOUTS` names. That check is an
  inversion, so a fifth layout added there is admitted without editing the parse and a
  sixth invented by a `POST` is refused without the parse having predicted it.
- **Output:** `void`, then `revalidatePath` on the editor's address and on
  `/admin/journeys`.
- **Errors:** a `ZodError` for a journey that is not a row id or a layout no picker offers;
  from Payload, a refused write.
- **Auth requirement:** **signed in**, through `guardedAction`.
- **Notes:** the page is added at the END of the rail and is always a `frames` page named
  `Frames <n>`, which is `Travel Diary Admin.dc.html`'s own `addPage`. **It is created as a
  draft** - see `docs/deviations.md` §56 for what today's public book does with one.

### `copyPage(form: FormData): Promise<void>`

- **Path:** `apps/web/app/(admin)/admin/journeys/[id]/actions.ts`; the decisions are
  `apps/web/lib/admin/pageMutations.ts`'s `readPageRef` and `copyPageRow`.
- **Method:** server action.
- **Input:** the tool row's `FormData` - `journey` and `page`, both positive integer row
  ids. The journey decides only which address to revalidate; the copy derives everything
  it writes from the page row.
- **Output:** `void`, then `revalidatePath` on both addresses.
- **Errors:** a `ZodError` for a field that is not a row id; from Payload, `Not Found` and
  a refused write.
- **Auth requirement:** **signed in**, through `guardedAction`.
- **Notes:** the copy lands immediately AFTER its source, which is the prototype's
  `dupePage`, and the pages after it are renumbered through the same write path as the
  arrows. **The source is read with `draft: true`**, so what is copied is what the editor
  was showing; a copy of the published row would discard the author's pending edits at the
  moment they asked for a duplicate of them. Slot array row ids are stripped, because
  handing a create the source's ids asks Payload to insert rows that already exist.

### `deletePage(form: FormData): Promise<void>`

- **Path:** `apps/web/app/(admin)/admin/journeys/[id]/actions.ts`; the decision is
  `apps/web/lib/admin/pageMutations.ts`'s `deletePageRow`.
- **Method:** server action.
- **Input:** the tool row's `FormData` - `journey` and `page`, as above.
- **Output:** `void`, then `revalidatePath` on both addresses.
- **Errors:** a `ZodError` for a field that is not a row id; a thrown refusal when it is
  the journey's ONLY page; from Payload, `Not Found` and a refused delete.
- **Auth requirement:** **signed in**, through `guardedAction`.
- **Notes:** **a hard delete, and that is the data model's own answer** rather than an
  omission of CLAUDE.md §7's soft delete: `DATA_MODEL.md` scopes the 30-day trash to
  journeys ("`deletedAt` on journeys") and declares no such column on `pages`, whose own
  line is "Pages are rows, not a fixed triple - the admin can add, duplicate, reorder and
  delete them". The rail hides Delete on a one-page journey, so reaching the refusal is a
  `POST` nobody's browser sent.

### `reorderPages(form: FormData): Promise<void>`

- **Path:** `apps/web/app/(admin)/admin/journeys/[id]/actions.ts`; the decisions are
  `apps/web/lib/admin/pageMutations.ts`'s `readPageOrder` and `reorderPageRows`.
- **Method:** server action.
- **Input:** an arrow's `FormData` - `journey`, and `pages`: the WHOLE new sequence of page
  row ids, comma-separated. The sequence is computed on the server by
  `packages/domain/src/admin/pageRail.ts`'s `movePage` while the rail renders, so the
  browser posts an outcome rather than an instruction and the screen ships no JavaScript
  for it. The parse refuses an empty list and a list naming one page twice.
- **Output:** `void`, then `revalidatePath` on both addresses.
- **Errors:** a `ZodError` for an empty, repeated or non-numeric list; a thrown refusal
  when the submitted ids are not EXACTLY this journey's pages - a stale form from a second
  tab would otherwise leave two pages sharing one `order`; from Payload, a refused write.
- **Auth requirement:** **signed in**, through `guardedAction`.
- **Notes:** one write per page whose place actually changed, not one per page: every write
  on a versioned collection mints a version row, and a swap moves two. Each of those writes
  is the TWO-WRITE shape described under `setPageLayout` below, which is the same mechanism.

### `setPageLayout(form: FormData): Promise<void>`

- **Path:** `apps/web/app/(admin)/admin/journeys/[id]/actions.ts`; the decisions are
  `apps/web/lib/admin/pageMutations.ts`'s `readPageLayoutRef` and `setPageLayoutRow`.
- **Method:** server action.
- **Input:** a glyph button's `FormData` - `journey`, `page` and `layout`.
- **Output:** `void`, then `revalidatePath` on both addresses.
- **Errors:** a `ZodError` for a field that is absent or outside its type; from Payload,
  `Not Found` and a refused write.
- **Auth requirement:** **signed in**, through `guardedAction`.
- **Notes:** **it applies at once, with no Save** - the prototype's picker sets the current
  page's layout and stamps "saved just now" in the same breath. **The write is TWO writes,
  not one `payload.update`**, and that is the trap Phase 4 Task 4 paid two review rounds
  for on `journeys`: `pages` carries `versions: { drafts: true }`, and Payload's
  `updateByID` merges into whatever `getLatestCollectionVersion` returns - which is passed
  no `published` key, so it is the NEWEST VERSION whatever `draft` says. A one-line update
  would write the author's unpublished text into the live row and stamp it `draft`. So the
  live row is written from its OWN content plus the field, and then the pending draft is
  saved again with the same field on it, because the first write made a non-draft version
  the latest one. `pageMutations.integration.test.ts` asserts both halves, from both sides.

### `saveNotes(form: FormData): Promise<void>`

- **Path:** `apps/web/app/(admin)/admin/journeys/[id]/actions.ts`; the decisions are
  `apps/web/lib/admin/notesMutations.ts`'s `readNotes` and `writeNotesDraft`.
- **Method:** server action.
- **Input:** the whole Notes pane, as one `FormData` - `journey`, `location`, `dates`,
  `weather`, `mood`, `weatherGlyph`, `note`, `signoff`, `stampCountry`, `stampValue`,
  `accent`, `slug`, a `highlightId`/`highlightText` pair per highlight row, a
  `tallyKey`/`tallyValue` pair per tally cell, and an optional `op`. **Every refusal is an
  inversion:** the glyph must BE one of `@travel-diary/domain/bookBundle`'s
  `WEATHER_GLYPHS`, the accent must BE a six-digit hex colour (it is interpolated into a
  CSS declaration on two screens), the gallery address must BE a slug, and `op` must BE
  `add`, `up:<id>`, `down:<id>` or `remove:<id>`. The two repeated lists are zipped by
  position, so each pair's lengths must agree; the tally must be exactly `TALLY_ROWS`
  cells, which is what `apps/web/collections/journeys.ts` sets `minRows` and `maxRows` to.
- **Output:** `void`, then `revalidatePath` on the editor's address and on
  `/admin/journeys`. **Not on the public book**, deliberately - see the note below.
- **Errors:** a `ZodError` for any of the refusals above; from Payload, `Not Found`, a
  refused write, and a unique-index violation when the gallery address is another
  journey's.
- **Auth requirement:** **signed in**, through `guardedAction`.
- **Notes:** **it is a DRAFT write, which is the whole answer to the versioned-collection
  trap.** `journeys` carries `versions: { drafts: true }` and `updateByID` merges into the
  newest version whatever `draft` says - the defect Task 4 paid two rounds for. Writing
  with `draft: true` makes that merge the desired behaviour (the author's earlier
  unpublished edits are carried through) and leaves the live row untouched, so a reader
  keeps seeing the published notes until Publish. That is also why it is ONE write where
  `setPageLayout` above is two: `order` and `layout` are structural and apply with no Save,
  and notes are content behind a button called Save draft.
  **The four highlight controls are submit buttons in the SAME form**, because this pane
  ships no client JavaScript: each posts an `op`, and `readNotes` applies it to the list
  the author has in front of them, so pressing one keeps everything they had typed and not
  yet saved. The cap is enforced there, on the server, which is why the pane can draw "Add
  highlight" unconditionally. A line the author emptied is dropped rather than refused -
  `highlights.text` is `required` on the collection, and refusing the save over it would
  strand them on a page they cannot leave. **Array row ids are not sent**, so a highlight's
  id changes on every save and a form left open in a second tab posts stale ids whose `×`
  and grips do nothing - the same staleness the page rail's arrows have.
  `notesMutations.integration.test.ts` asserts the property that matters end to end: what
  the pane posted is what `readBookBundle` reads back once the journey is published.

### `setSlotMedia(form)` · `setSlotFocalPoint(form)` · `setSlotText(form)` · `clearSlot(form)`

- **Path:** `apps/web/app/(admin)/admin/journeys/[id]/actions.ts`; every decision is
  `apps/web/lib/admin/slotMutations.ts`'s, executed by its own integration suite.
- **Method:** server actions, all four `(form: FormData) => Promise<void>`.
- **Input:** `journey`, and ONE field naming the target: `slot`, the branded
  `<page>:<cell>` key the pane holds its pending focal points under
  (`@travel-diary/domain/admin/focalPoint`'s `slotKeyFor`). A form carrying `page` and
  `cell` as two fields can be posted with a cell from one slot and a page from another;
  one field cannot. Then `media` (a row id) for `setSlotMedia`, `focalX`/`focalY` (each in
  `[0, 100]`) for `setSlotFocalPoint`, `caption` and `alt` for `setSlotText`, and nothing
  more for `clearSlot`. **The key is refused by SHAPE first** - two runs of digits and a
  colon - so a minus sign, a decimal, an empty half and a second colon are all refused
  without the parse having listed them.
- **Output:** `void`, then `revalidatePath` on the editor's address and on
  `/admin/journeys`.
- **Errors:** a `ZodError` for a malformed key, a cell past the last one ANY pane draws, a
  focal component outside the frame, or a media id that is not a row id; an `Error` naming
  the page's kind when THIS page's pane does not draw that cell; and from Payload, `Not
Found` and a refused write. **The editing pane surfaces none of them** -
  `docs/deviations.md` §60, which also records that none of these refusals is reachable by
  clicking.
- **Auth requirement:** **signed in**, through `guardedAction`.
- **Notes:** **the cell is checked twice, and the two checks are different questions.** The
  parse refuses a cell no pane draws at all (`HIGHEST_SLOT_CELL`, derived from
  `@travel-diary/domain/admin/pageSlots`, so a fifth frame added there widens it with no
  edit to the parse); the WRITE then refuses a cell this page's own pane does not draw,
  because a notes page has two cells and a frames page four and the key carries no kind.
  **All four are LIVE-ROW writes through `pageMutations.ts`'s `writePageFields`**, the
  two-write shape Task 4 paid two review rounds for: §2.3's slot controls have no Save of
  their own and the public book reads `pages.slots` off the `pages` table, so a slot write
  is structural exactly as `order` and `layout` are. What is new is that `slots` is an
  ARRAY the write patches one cell of, and the live row's and the pending draft's can
  differ - so `writePageFields` takes a FUNCTION of the document being written, and each
  side is patched from its own array. **The array is padded, never spliced:** a cell's index
  is its cell of the layout (`FramesI.tsx` reads `page.slots?.[position]`), so `clearSlot`
  empties a row in place and a write to cell 2 creates three. **Placing a photograph
  re-centres the cell**, because a crop chosen for one photograph frames a different one
  arbitrarily and the pill reads a number either way.
  **Three of the four are called from a client island, not a form.** `SlotPanel.tsx` builds
  the `FormData` itself, because §2.3's focal formula needs the clicked element's measured
  width (`docs/deviations.md` §62); `setSlotMedia` is posted by the journey pool's real
  `<form>`. The shape is the same so one parse serves both.
  `slotMutations.integration.test.ts` asserts the property the phase's second exit criterion
  rests on: a focal point set here moves the crop `readBookBundle` hands the diary.

### `addToBook(ids)` · `captionMedia(ids, caption)` · `moveMedia(ids, journey)`

- **Path:** `apps/web/app/(admin)/admin/media/actions.ts`; the decisions are
  `addMediaToBook`, `captionMediaRows` and `moveMediaRows` in
  `apps/web/lib/admin/mediaMutations.ts`.
- **Method:** `POST`, to the opaque action ids Next.js mints. Dispatched by
  `components/admin/media/MediaGrid.tsx` inside `startTransition`, not by a form.
- **Input:** the selection as an array of media row ids, plus a caption (any string,
  including the empty one, which clears it) or a destination journey's row id. Parsed by
  `readMediaIds` - `z.array(z.coerce.number().int().positive()).min(1).max(MAX_BULK_MEDIA)`,
  so an empty selection is refused rather than answered as a silent no-op, and
  `Number('nonsense')` never reaches the driver as `NaN`.
- **Output:** nothing, and a different set of invalidated addresses each. All three call
  `revalidatePath('/admin/media')`, so the grid redraws from the server's own read.
  `addToBook` ALSO calls `revalidatePath('/admin/journeys/[id]', 'page')`, because
  `readJourneyEditor` counts `media.inBook` for the pool's "{n} of {total} in the book"
  eyebrow. `moveMedia` calls that one AND `revalidatePath('/admin/journeys')`, because
  `readJourneysScreen` tallies `media` by journey and every editor's pool is scoped by the
  column a Move re-points — the ROUTE PATTERN rather than an id, because the action knows
  the destination journey and not the sources. `captionMedia` calls only the first, and
  that is checked rather than assumed: nothing outside this grid draws `media.caption`.
  The table is pinned by `apps/web/lib/admin/mediaRevalidationRegistration.test.ts`, which
  fails on a fourth bulk write landing with no decision recorded about its readers.
- **Errors:** a `ZodError` for a selection or a destination the grid's own controls cannot
  produce, and Payload's own for a refused write. **Neither is drawn**: the bar has no error
  surface, and a rejection inside `startTransition` surfaces as an unhandled promise
  rejection (`docs/deviations.md` §60, which this screen inherits unchanged).
- **Auth requirement:** **signed in.** All three are `guardedAction`s, so the guard runs
  inside the action rather than being inherited from the page around it.
- **Notes:** **one write per action, not one per id** - Payload's `update` takes a `where`, so
  a selection of forty rows is one statement (CLAUDE.md §6). `media` carries no `versions`
  block, so none of this needs `journeyMutations.ts`'s two-write dance.

  **`addToBook` is not a toggle.** The control says "Add to book", and a toggle over a mixed
  selection has no honest answer. **`moveMedia` changes which public gallery a photograph is
  in** - `galleryFrameWhere` selects a gallery's frames by `journey` - and
  `mediaMutations.integration.test.ts` asserts both counts through that module's own query
  rather than counting rows itself. **It does not clear a page slot** that still holds the
  photograph; §2.4 specifies a move and no cascade (`docs/deviations.md` §70).

  **All three take arrays rather than `FormData`**, because §2.4's bulk bar is a client island
  holding a `ReadonlySet<MediaId>` and not a form - the one place in this repository where
  that is true.

### `setFrameOrder(journey, order)` · `setFrameText(id, caption, alt)` · `setFrameFlags(id, flags)` · `setPosterAt(id, seconds)` · `applyBulkCaptions(rows)`

- **Path:** `apps/web/app/(admin)/admin/galleries/actions.ts`; every decision is in
  `apps/web/lib/admin/galleryMutations.ts`, which an integration test executes against a
  real Payload.
- **Method:** `POST`, to the opaque action ids Next.js mints. Dispatched by
  `apps/web/components/admin/galleries/FrameGrid.tsx` inside `startTransition`, not by a
  form.
- **Input:** arrays and plain values rather than `FormData`, for §2.4's reason one screen
  along — the whole screen is a client island and none of its controls is a form. A journey
  row id and every one of its frames in the new order; a frame row id with a caption and an
  alt text, either of which may be empty; a frame row id with `{ hidden, inBook }`; a frame
  row id with a second or `null`; and one `{ id, caption }` per row the bulk panel drew.
  Parsed at the boundary: ids are `z.coerce.number().int().positive()`, so
  `Number('nonsense')` never reaches the driver as `NaN`; a list is `.min(1)` and
  `.max(MAX_GALLERY_FRAMES)`; a poster second is `z.number().nonnegative().nullable()`.
- **Output:** nothing, and a different set of invalidated addresses each. All five call
  `revalidatePath('/admin/galleries')`. The three that change a column another admin screen
  reads — `setFrameOrder` (`media.order`, which both other media readers SORT by),
  `setFrameText` (`alt`, on both their tiles) and `setFrameFlags` (`inBook`, §2.4's chip and
  the editor's eyebrow) — also call `revalidatePath('/admin/media')` and
  `revalidatePath('/admin/journeys/[id]', 'page')`. `setPosterAt` and `applyBulkCaptions`
  call only the first, and that is checked rather than assumed: nothing outside this screen
  reads `media.posterAt` or `media.caption`. `/admin/journeys` is invalidated by none of
  them, because §2.5 writes neither `media.journey` nor `media.isCover`
  (`docs/deviations.md` §75). The table is pinned by
  `apps/web/lib/admin/galleriesRevalidationRegistration.test.ts`, which COUNTS the
  `'page'`-typed editor invalidations rather than searching for one.
- **Errors:** a `ZodError` for anything the screen's own controls cannot produce; an `Error`
  from `setFrameOrder` when the list does not name that journey's frames one for one — a
  repeat, a stranger, or a frame that has since gone; and Payload's own for a refused write.
  **None is drawn**: §2.5 has no error surface, and a rejection inside `startTransition`
  surfaces as an unhandled promise rejection (`docs/deviations.md` §60, which this screen
  inherits unchanged).
- **Auth requirement:** **signed in.** All five are `guardedAction`s, so the guard runs
  inside the action rather than being inherited from the page around it.
- **Notes:** **a reorder touches only the rows that moved.** Every row takes a DIFFERENT
  `order`, so this is the one write here that cannot be a single `where`-scoped update:
  `setFrameOrder` reads first and writes only what changed, which after a drag of one tile
  is the span it crossed. The property is observable —
  `apps/web/lib/admin/galleryMutations.integration.test.ts` reads `updatedAt` off a frame
  that did not move and finds it untouched. The read is two queries over ONE journey's rows:
  its pages, for the decorative scrap the gallery rule excludes, and its frames.

  **An arrangement that is not a BIJECTION onto the journey's gallery frames refuses whole** —
  a repeat, a stranger, an omission, or a swap at the same count. Skipping the strangers would
  write a partial arrangement and say nothing; the standing orders call that the
  enumeration-where-inversion-was-needed species. The first version of this check tested one
  direction and claimed both, and a subset was accepted, leaving two frames sharing
  `order: 0` with the public cover then decided by `GALLERY_FRAME_SORT`'s id tiebreak.

  **None of this needs the versioned-write dance.** `media` carries no `versions` block, so
  there is no newest version for a plain update to merge from — unlike `pages`, where
  `pageMutations.ts`, `notesMutations.ts` and `slotMutations.ts` each write the live row and
  the pending draft in the same call.

  **A blank bulk caption is left alone**, which is §2.5's own line — "Anything left empty
  keeps its file name for now." The panel submits every row it drew, blanks included, and
  the rule about which of them is written is in one place.

### `saveBookSettings(settings)` · `saveBookmarkOrder(form)`

- **Path:** `apps/web/app/(admin)/admin/book/actions.ts`. Every decision is
  `apps/web/lib/admin/bookMutations.ts`'s; this module is the guard, the wiring and the
  cache hints.
- **Input:** `saveBookSettings` takes SCREENS.md §2.6's eight controls as a plain object —
  the card is a client island, so there is no form body between it and the action.
  `saveBookmarkOrder` takes an arrow's `FormData`: one `journey` field per journey of the
  book, in the new order.
- **Output:** nothing. Both revalidate and the screen asks for the page again.
- **Errors:** a `ZodError` from the parse, or an `Error` from `saveBookmarkOrder` when the
  order is not a bijection onto the book's journeys. Neither screen draws an error surface
  (`docs/deviations.md` §60), so a refusal arrives as an unhandled Server Action error.
- **Auth requirement:** **signed in.** Both are built from `guardedAction`.
- **Notes:** `saveBookSettings` names six columns of the `book` global and relies on
  `updateGlobal` MERGING, which is asserted rather than assumed. `saveBookmarkOrder` writes
  `journeys.order` through the two-write dance a versioned collection needs, so an author's
  pending draft is neither published nor lost, and it writes only the rows that moved.

  **Which addresses each invalidates** is `apps/web/lib/admin/bookRevalidationRegistration.test.ts`'s
  table. `saveBookSettings` reaches `/admin/book`, `/admin/cover` and `/admin/sign-in` — the
  last because §2.6's swatches write `book.coverCloth`, which the sign-in cloth panel reads
  and which is rendered without a dynamic function. `saveBookmarkOrder` reaches `/admin/book`
  and `/admin/journeys`, which is the only other screen sorted by `journeys.order`. **The
  public diary needs nothing**: `/p/<n>`, `/m/<n>` and `/gallery/<slug>` render per request
  and declare no `generateStaticParams`.

### `saveCover(cover)` · `saveAbout(form)`

- **Path:** `apps/web/app/(admin)/admin/cover/actions.ts`. Every decision is
  `apps/web/lib/admin/coverMutations.ts`'s.
- **Input:** `saveCover` takes SCREENS.md §2.7's five Cover fields as a plain object, from the
  island. `saveAbout` takes the About card's whole `FormData`: two `paragraph` fields, a `kit`
  field per row, `replyTo`, and `portrait` — where `''` means "leave the portrait alone".
- **Output:** nothing.
- **Errors:** a `ZodError` from the parse. The cloth must be a six-digit hex colour, the
  reply-to must be an address or empty, the portrait must be a row id or empty, and the
  paragraph count is fixed.
- **Auth requirement:** **signed in.** Both are built from `guardedAction`.
- **Notes:** `saveCover` reaches `/admin/cover`, `/admin/book` and `/admin/sign-in`, because
  `title`, `subtitle` and `coverCloth` are read by all three. `saveAbout` reaches
  `/admin/cover` alone: the `about` global is read by this screen and by `readBookBundle`, and
  the diary caches nothing.

### `saveSite(form)` · `setReaderSetting(form)` · `takeBookOffline()`

- **Path:** `apps/web/app/(admin)/admin/settings/actions.ts`. Every decision is
  `apps/web/lib/admin/siteMutations.ts`'s.
- **Input:** `saveSite` takes the Site card's whole `FormData` — `name`, `domain`,
  `description`, `replyTo`. `setReaderSetting` takes one toggle's form: `setting`, the
  column it writes, and `on`, the value it is switching TO (a checkbox that is off posts
  nothing at all, so a form built that way could only ever switch a setting on).
  `takeBookOffline` takes nothing.
- **Output:** nothing.
- **Errors:** a `ZodError` from the parse. `replyTo` must be an address or empty, and
  `setting` must be a `checkbox` the `site` global declares — `name` and `analyticsId` are
  refused by that same rule.
- **Auth requirement:** **signed in.** All three are built from `guardedAction`.
- **Notes:** each write is PARTIAL, so saving a site name cannot clear the analytics id no
  screen in this phase can put back, and a toggle cannot overwrite the card above it.
  `saveSite` reaches `/admin/settings` and `/admin` with the `layout` type, because the
  rail's masthead prints `site.name` on every screen. The two settings writes reach
  `/robots.txt`, `/gallery/[slug]`, `/p/[n]` and `/m/[n]`, which are the public addresses
  the five columns are read at; `apps/web/lib/admin/settingsRevalidationRegistration.test.ts`
  holds the table.

### `putJourneyBackFromTrash(form)` · `deleteJourneyForGood(form)`

- **Path:** `apps/web/app/(admin)/admin/trash/actions.ts`. Every decision is
  `apps/web/lib/admin/journeyMutations.ts`'s.
- **Input:** the row's `FormData`, carrying `journey` — the journey's row id.
- **Output:** nothing.
- **Errors:** a `ZodError` for a reference that is not a row id. `deleteJourneyForGood`
  throws for a journey that is NOT in the trash, before anything is deleted: the only route
  to it is §2.10, which lists nothing else, so a request naming a live journey is a stale
  page, a typed id or a replayed POST.
- **Auth requirement:** **signed in.** Both are built from `guardedAction`.
- **Notes:** `deleteJourneyForGood` is the only hard delete in Phase 4. It removes the
  journey, its pages and its photographs — `docs/deviations.md` §102 carries the decision and
  the alternative that was not taken — and it is the only write in this phase that makes
  §2.9's "Space used" go down, which is why it alone invalidates `/admin/settings`.
  `apps/web/lib/admin/trashRevalidationRegistration.test.ts` holds both tables.

## Planned routes (Phase 1)

None. Task 14 built the last of them (`/gallery/<slug>` and its download handler, both
documented above); everything remaining is a later phase's, listed below.

## Planned server actions (later phases)

**NOTHING IN PHASE 2 IS PLANNED ANY MORE, AND THREE PARAGRAPHS HERE SAID OTHERWISE FOR
THE REST OF THE PHASE.** Task 10 mounted `POST /admin/sign-in/password`,
`POST /admin/sign-in/code/verify`, `POST /admin/sign-in/code/resend`,
`POST /admin/sign-out`, `POST /admin/reset/request` and `POST /admin/reset/set`, and each
has its own full row above. This section went on describing `otpService.ts`,
`rateLimit.ts` and `sessions.ts` as modules whose only future caller was "a server action
that has not been written yet", while the routes that call them today sat documented
thirty rows higher (Phase 2's final review, finding 10). Those three paragraphs are
deleted rather than annotated: a plan that has happened is not a plan.

**The presigned-upload action is no longer planned — it is built**, by Phase 3 Task 7,
and it has its own full row above (`requestUploadSlots`), as does the receiver its URLs
point at. **Nor is the create-media-row action** — Phase 3 Task 8 built it as
`finaliseUpload`, with its own full row above. What is still planned: the full set of
admin mutations across every admin screen (Phase 4). They are named here only so the shape
of what is coming is visible; each gets a full row in the commit that adds it.

The reason the upload does not pass through an action at all still stands and is worth
repeating where a reader meets it: Vercel's serverless functions cap request bodies at
~4.5MB (design spec §9.1), so a 25MB photograph cannot go through one. The action hands
out a URL; the bytes go somewhere else.

**HOW A PHASE 4 ACTION WILL BE WRITTEN, because that is now decided rather than open.**
Every one of them is built from `guardedAction()` (`apps/web/lib/auth/guard.ts`), which
calls `requireAdminSession()` and then the action, passing it the session:

```ts
'use server'
import { guardedAction } from '../../../../lib/auth/guard'
import { adminScope } from '../../../../lib/admin/adminScope'
import { getPayload } from '../../../../lib/payload'

export const publishJourney = guardedAction(async (session, id: string) => {
  // `session.user` is the account the guard admitted. Nothing above this line
  // ran before it.
  const payload = await getPayload()
  // RESOLVE THE SCOPE ONCE PER ACTION, not once per call. It costs one
  // `users` lookup, and `adminScope` memoises nothing — awaiting it inside
  // each call in a loop is the N+1 CLAUDE.md §6 forbids.
  const scope = await adminScope(session)
  // The spread is the whole interface: it carries the resolved account row and
  // `overrideAccess: false`, so Payload runs the collection and field access
  // rules. See `apps/web/lib/admin/adminScope.ts` and the paragraph below.
  await payload.update({ collection: 'journeys', id, ...scope, data: {} })
})
```

That is not a convention. `eslint-rules/guarded-server-actions.js` reports every **value**
export of a `'use server'` module that is not such a call, any re-export from one, any
top-level statement in one that EVALUATES anything when Next.js loads the module — bar a
literal, a function expression or that same call — and any `'use server'` directive inside a
function body — over
the parsed AST, on every file `npm run lint` visits, with no `files` list, so there is no
directory it does not reach, and an export spelling it does not RECOGNISE is reported rather
than skipped. The exception is an export the parser marks `exportKind: 'type'`, which emits
no runtime binding. Until round 7 this paragraph said "no export spelling past it": `export
= x` and `export as namespace X` both walked past, because the dispatch tested whether the
parser's node-type NAME began with `Export`, and neither does.

Round 9 rewrote the third of those. It read "any top-level statement in one that is not an
import or a declaration", which is what the rule TESTED, and a declaration runs its
initialiser at module load: `const attached = Object.assign(module.exports, { … })` was
admitted where the same call as a bare statement was refused, and the sixth whole-branch
review committed it. And `guardedAction` itself now has a test that EXECUTES it
(`apps/web/lib/auth/guard.integration.test.ts`), because until round 9 the only thing over
the factory every action on this page will be built from was two substring assertions.

**An action that forgets fails `npm run verify` — and `verify` rather than `lint` is the
accurate word.** Several of the ways an action can escape the rule itself are caught by
`apps/web/lib/auth/adminGuardRegistration.test.ts` instead: a module at an extension
ESLint does not enumerate (`.jsx` was one for four rounds, and Next.js mounted it), and an
ESLint disable directive in a file nobody listed. That test walks git's listing of the
repository for the literal `'use server'` and asks ESLint's own API which of those files it
actually lints, which of them a disable directive is written in, which of them spell the
rule's own id, and — through `suppressedMessages` — in which of them a directive actually
stopped this rule reporting. Round 6 ran thirty-three shapes against the gate; the fourth
whole-branch review ran fourteen more and three got through, two of which round 7 closed in
the rule; round 7 ran eleven of its own and closed a fourth; the fifth review ran sixteen,
eleven of them new, and defeated the rule four more ways — all four closed in round 8, two
in the rule and two in the checks beside it. The sixth review ran eight of its own and five
got through; round 9 closed three of those in the rule and one in a new key over
flat-config `processor` blocks, and pinned the array below so a row claiming a shape a later
round has closed fails on that commit.

**The shapes that get through are enumerated, with the measurement and the committability
of each, by `SHAPES_THAT_GET_THROUGH` in
`apps/web/lib/auth/adminGuardRegistration.test.ts`** — and a case there fails if this
document stops pointing at that array or starts restating it. No count is written here: a
number retyped in prose has drifted from this code in every round of this phase, and seven
sites restated a count of two while the fifth review measured four (ruling F76). A row's
ABSENCE still proves nothing — the array says so at itself — because enumerating what gets
through means knowing what gets through. `docs/adr/0018` records
the nine text scans that preceded this rule and says why enumeration was the wrong
mechanism.

**Authorization does not stop at the guard, and Phase 4 owed the other half — Tasks 1 and
2 paid it.** The guard answers "is this somebody"; Payload's collection and field access
control answers "may this somebody do this". `docs/security.md`'s "What Phase 2 hands to
Phase 4" section named what was missing: a Local API call runs with access control OFF
unless it passes `overrideAccess: false` and a `user` — by Payload's own Local-API default,
and explicitly at `apps/web/lib/auth/setNewPassword.ts:209`, where the token in a reset
link is the authorisation and there is no signed-in user for Payload to judge; and
`journeys`, `pages` and `users` declared no `access` block at all, so a server action
calling `payload.update()` on any of the three would have got no Payload-side check
whatever it passed. Task 1 wrote those blocks. Task 2 wrote
`apps/web/lib/admin/adminScope.ts`, the second production site that passes the option and
the only one that passes `false`: `adminScope(session)` resolves the account row
the session's branded id names and answers `{ user, overrideAccess: false }`, which every
admin action spreads into every `find`, `findByID`, `create`, `update`, `delete`,
`findGlobal` and `updateGlobal` it makes. No action writes the option itself. Until round 7
this sentence asserted instead that `overrideAccess` was absent from production code
altogether — false on the day a fix round copied it here, and
`apps/web/lib/auth/overrideAccessSites.test.ts` now fails if those words come back, pins
the production set to those two paths, and reads the bytes of each so the `false`/`true`
split between them cannot silently invert.

Phase 2 Task 5's module, which the routes above call:
`apps/web/lib/auth/signIn.ts` — `signIn({ email, password, browserSession, keepSignedIn,
ip, device, location })` — plus its sibling `apps/web/lib/auth/passwordReset.ts` —
`requestPasswordReset({ email, ip })`. Both are reached through the mounted routes above;
what follows is the shape a caller gets, not a plan. `signIn` answers `ok({ status: 'otp-required',
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
  screen the link lands on (`/admin/reset/<token>`) **exists, as of Phase 2 Task 9**: the
  `[token]` route at that path, the form, the `payload.resetPassword` call, the
  invalid/expired state, and an e2e case following the mailed link (controller ruling,
  Task 5 review round 1). It has its own rows above; the sentence that used to end here
  said the link resolves to a 404, which stopped being true in Task 9, and the correction
  was joined to the false clause by an "and" rather than replacing it (final review 9).

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
