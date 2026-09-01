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

Five route handlers exist today: Payload's own four, mounted under the `(payload)` route
group, and the diary's `/p/<n>`, added with the book itself in Phase 1 Task 7 and
extended in Task 13. Both sets are documented in full below. Everything still unbuilt is
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

### `GET /p/<n>`

- **Path:** `apps/web/app/(diary)/p/[n]/page.tsx`, with `app/(diary)/layout.tsx` as the
  route group's own root layout (parallel to `(payload)`'s, so the diary inherits none of
  Payload's admin chrome).
- **Method:** `GET` — a React Server Component route.
- **Input:** `n` — a 1-indexed page number, path parameter. Not a `PageId`; a positional
  index into the book's ordered page list, since it is meant to be a short, memorable,
  shareable URL (design spec §8). It is interpreted by
  `pageIndexFromParam` (`packages/domain/src/pageAddress.ts`), not by this route, which
  holds no logic of its own.
- **Output:** the whole book, server-rendered from one `BookBundle`
  (`apps/web/lib/readBookBundle.ts`), opened at the leaf `n` addresses. The client takes
  over only for scaling (`useBookScale`) and flipping (`useFlip`).
- **Errors:** none observable today. `n` outside the valid page range, or not a whole
  page number at all, is **clamped** to the nearest real page rather than refused — the
  same choice `pageStack.ts` makes for a stale index, and for the same reason: a reader
  with a bad address should land on a page rather than a blank stack. A Payload failure
  while assembling the bundle surfaces as a `500`, since `readBookBundle` throws on the
  two boundary invariants it enforces (a journey missing `startsOn`; a media item with no
  derivative of any tier).
- **Auth requirement:** none. The public diary needs no authentication
  (`SECURITY.md`, "Sessions and access") — except that `site.passwordProtect`, when set,
  must gate this route server-side; a client-side check leaves the content fetchable
  (`docs/security.md`). **That gate is not built yet** and is tracked in
  `docs/security.md`, not discharged here.
- **Notes:** the URL is written on every turn (flip commit, mobile step, bookmark jump)
  and read on load, so the reader's exact page survives a reload or a shared link. As of
  Task 8 that write is live: `Book.tsx` calls `window.history.replaceState` with
  `pagePath(state.index)` from an effect keyed on the machine's committed index — the one
  moment the reader's page actually changes, whichever trigger caused it. It replaces
  rather than pushes, so reading thirty pages does not bury the page the reader arrived
  from under thirty history entries, and it is `replaceState` rather than a router
  navigation because a navigation would re-render the route and take the book's own flip
  state with it. Returning from `/gallery/<slug>` must restore the `/p/<n>` the reader was
  on, not `/`.
- **Still to come (Task 13, which extends this same file):** `generateStaticParams` for
  all 33 pages, revalidation, a real `404` for an out-of-range page in place of today's
  clamp, per-page metadata, and the gallery-return behaviour. It is named here so the gap
  between this row and the design spec is a recorded decision rather than an omission.

## Planned routes (Phase 1)

### `GET /gallery/<slug>`

- **Method:** `GET`.
- **Input:** `slug` — the journey's slug, path parameter (`journeys.slug`, unique,
  indexed).
- **Output:** that journey's gallery: journey title and date range, frame count, and the
  grid of up to ~100 media items (thumbnails, captions, index badges; clips show a play
  badge and duration). Virtualized past 100 tiles per the performance budget
  (`CLAUDE.md` §6).
- **Errors:** unknown `slug` — behaviour not yet specified; to be decided and documented
  when the route is built. A journey's `hidden` media items are excluded from this
  response regardless of slug validity.
- **Auth requirement:** none by default, subject to the same `site.passwordProtect` gate
  as `/p/<n>`, and to `site.indexGalleries` governing whether this route is crawlable
  (`robots.txt` and `X-Robots-Tag`, since the page is statically served —
  `docs/security.md`).
- **Notes:** the gallery's download action must serve a derivative **through this app's
  own handler** — a short-lived signed URL with `Content-Disposition: attachment` and a
  strict `Content-Type` — never a bucket URL directly, which would invite enumeration of
  everything in the bucket including hidden items (`SECURITY.md`). That handler is a
  separate action from the route itself and will get its own row here once built.

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
