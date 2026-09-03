# API

Every route and server action: input, output, errors, auth requirement. This is the
contract `CLAUDE.md` §1.2 requires this document to hold.

## Contract for every entry in this document

Whenever a route or server action is added, it is documented here **in the same commit**
(`CLAUDE.md` §1.3), as a row or subsection with these fields, in this order:

| Field | Meaning |
|---|---|
| **Path / action name** | The URL for a route; the exported function name for a server action |
| **Method** | `GET`/`POST`/etc. for a route; "server action" for a server action |
| **Input** | Request params/body, or the server action's argument type — the Zod schema that validates it at the boundary (`CLAUDE.md` §3.1) |
| **Output** | Response shape or return type |
| **Errors** | Every error case the caller can observe, and what triggers each |
| **Auth requirement** | None / signed-in / signed-in with a specific capability |

A stale entry here is worse than a missing one — changing a route's behaviour means
updating its row in the same commit that changes the code (`CLAUDE.md` §1.3).

## Status

Seven route handlers exist today: Payload's own four, mounted under the `(payload)` route
group, and three of the diary's own — `/p/<n>`, added with the book itself in Phase 1
Task 7 and completed in Task 13; and `/gallery/<slug>` with its download handler
`/gallery/<slug>/download/<id>`, added in Task 14. `/p/<n>` was completed in Task 13 — which gave it a real `404` in place of its clamp, per-page
metadata and a canonical link, and settled in
`docs/adr/0010-static-generation-and-the-content-window.md` why it stays dynamic. Both sets are documented in full below. Everything still unbuilt is
listed further down as **planned**, using only what the design spec (§8) already
specifies, so each phase has a contract to build against rather than inventing one
mid-phase.

## Payload-owned routes (live today)

These four are not hand-written handlers — each re-exports a handler from
`@payloadcms/next`, so their behaviour is Payload's, not ours. They are documented here
anyway, in full, because they are real, reachable HTTP surface: `CLAUDE.md` §1.2 asks
this document for *every* route, and an exposure surface nobody wrote down is an
exposure surface nobody reviews.

**Authorization, for all of them.** None of these routes carries its own auth check.
Every one runs Payload's collection- and global-level access control on the operation it
performs. No collection in `apps/web/collections/` declares `access` except `jobs` and
`otpChallenges` (both `() => false` on read/create/update — server-only, reachable only
through the Local API); every other collection and global therefore inherits Payload's
default access, `({ req: { user } }) => Boolean(user)` — **signed in, or refused**.
Sign-in itself is `users`' auth collection, whose login/refresh/logout operations are
public by construction. Phase 2 and Phase 4 tighten these per `docs/security.md`; until
they do, "signed-in" is the whole policy, and it is enforced by Payload rather than by
anything in this repository.

**`admin.disable` does not gate these routes.** `payload.config.ts` sets
`admin.disable: process.env.NODE_ENV === 'production'`, which disables Payload's *admin
panel* only. Payload's own type documentation is explicit that the way to disable the
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
- **Auth requirement:** signed in, for every collection and global — see the paragraph
  above. `jobs` and `otpChallenges` refuse every request through this route regardless
  of who is signed in.

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
  the same operations. A GraphQL query is not a way around it.

### `GET /api/graphql-playground`

- **Path:** `apps/web/app/(payload)/api/graphql-playground/route.ts`.
- **Method:** `GET`.
- **Input:** none.
- **Output:** the GraphQL Playground HTML page, configured with
  `request.credentials: 'include'` so it sends the caller's Payload session cookie.
- **Errors:** `404 Route Not Found` when it is disabled (see below).
- **Auth requirement:** **none on the route itself.** The page is served unauthenticated
  to anyone who can reach it; it is a *schema browser and request console*, and the
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
  reached from it also re-runs the collection access control described above.
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
