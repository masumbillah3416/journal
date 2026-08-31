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

## Phase 0 status

No routes and no server actions exist in `apps/web` yet — `apps/web` itself has not been
scaffolded; this task is documentation only. The design spec (§8) names the two public
paths the diary will serve once Phase 1 builds routing; they are documented below as
**planned**, using only what the spec already specifies, so that Phase 1's
implementation has a contract to build against rather than inventing one mid-phase.

## Planned routes (Phase 1)

### `GET /p/<n>`

- **Method:** `GET`.
- **Input:** `n` — a 1-indexed page number, path parameter. Not a `PageId`; a positional
  index into the book's ordered page list, since it is meant to be a short, memorable,
  shareable URL (design spec §8).
- **Output:** the diary page at that position, server-rendered from a `BookBundle`
  assembled for the whole book. Content is statically rendered; the client takes over
  only for scaling and the flip.
- **Errors:** `n` outside the valid page range — behaviour (404 vs. clamp vs. redirect to
  the nearest valid page) is not specified by the design spec and will be decided and
  documented here when the route is built, not assumed now.
- **Auth requirement:** none. The public diary needs no authentication
  (`SECURITY.md`, "Sessions and access") — except that `site.passwordProtect`, when set,
  must gate this route server-side; a client-side check leaves the content fetchable
  (`docs/security.md`).
- **Notes:** the URL is written on every turn (flip commit, mobile step, bookmark jump)
  and read on load, so the reader's exact page survives a reload or a shared link.
  Returning from `/gallery/<slug>` must restore the `/p/<n>` the reader was on, not `/`.

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
