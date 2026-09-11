# 0020 — The presign seam, and a local upload receiver behind it

## Context

The design spec (§9.1) does not prefer direct-to-bucket uploads, it **forces** them:
"Vercel's serverless functions cap request bodies at ~4.5MB, so a 25MB photograph
cannot pass through the app at all." So the browser must PUT the bytes somewhere that
is not a Next.js route handler, and the app's part is to hand it a URL it is allowed
to PUT to.

Three facts about this machine decide what Phase 3 can honestly build.

1. **There is no Cloudflare R2 adapter, and no credentials for one.**
   `apps/web/lib/ports/storage.ts`'s header said the R2 adapter "arrives in Phase 3"
   for two phases. It does not arrive here. R2 needs an account, a bucket and a key
   pair that do not exist in this repository or on this machine.
2. **`CLAUDE.md` §7.1 forbids finding out by sending.** Repository content — source,
   configuration, or file bytes — is never sent to a third-party service without the
   owner's explicit approval for that specific request. Exercising an R2 adapter means
   sending bytes to Cloudflare, so an adapter written now could not be exercised at
   all; it would be exactly the untested deferred path
   `docs/adr/0004-media-pipeline-mode.md` refuses, with none of the contract-suite
   coverage that makes the local adapter legitimate.
3. **The local disk adapter's `signedUrl` returns a `file://` URL, which no browser
   can PUT to.** A filesystem has no HTTP surface. So without something in between,
   "direct to bucket" is not exercisable on a developer machine at all: no test, no
   browser sweep and no developer could drive the upload path until the day
   credentials appeared.

## Options considered

1. **Build the R2 adapter now and leave it untested.** Rejected. It is the shape ADR
   0004 already refused once, and §7.1 makes it untestable here rather than merely
   inconvenient — the adapter would ship on the strength of having been read.
2. **Route uploads through the app** (`POST` the file to a route handler, which writes
   it to the store). Rejected: it contradicts spec §9.1 outright. It would work locally
   and fail in production for every photograph over ~4.5MB, which is most of them — the
   worst failure mode available, since every local test would pass.
3. **Build the seam, and a receiver of our own behind it.** Chosen.

## Decision

**The port grows the method, and the local adapter implements it as an HTTP receiver
this repository serves.**

- `StoragePort.uploadUrl(key, options)` is the seam. Its options are
  `expiresInSeconds`, `contentType` and `maxBytes`. Every case for it lives in the
  **shared** contract suite (`apps/web/lib/adapters/contract/storage-contract.ts`), so
  an R2 adapter inherits them on the day it exists: it is a one-file addition behind an
  already-contract-tested method rather than a new untested path.
- `createLocalStorage`'s implementation returns
  `${ADMIN_ORIGIN}/admin/media/upload?token=<minted>`. The origin is `ADMIN_ORIGIN` and
  never a request's `Host` header, for the reason `apps/web/lib/auth/passwordReset.ts`
  gives at length: a URL built from a header is a URL an attacker points at their own
  machine.
- The token is an HMAC-signed capability over **one key**, carrying that key, an
  expiry and a byte cap — all three inside the signature
  (`apps/web/lib/media/uploadToken.ts`). It is a capability, so it gets a one-time
  code's treatment: constant-time comparison, an expiry, and never logged.
- The receiver (`apps/web/lib/media/receiveLocalUpload.ts`) verifies the token, refuses
  a declared `Content-Length` over the cap before reading a byte, reads the body and
  weighs it again, then writes through the port. It answers `204`, `413` for an
  oversized body, `500` for a store that could not take the bytes, and **one `403` for
  a malformed, expired or wrongly-signed token alike** — the same
  one-refusal-for-all-causes rule `readGalleryDownload` follows, so the endpoint cannot
  become an oracle telling an attacker which part of a forged token was wrong.
- The route is `PUT /admin/media/upload`, and it is **behind the admin guard**
  (`guarded(handleLocalUpload)`, applied in the route file). A token is a capability
  over a key, not authentication; an upload is a mutation by the author.
- The address deliberately carries **no dynamic-route bracket segment**: the token is a
  query parameter, so the route file avoids the `@vitest/coverage-v8` ignore-hint
  defect `CLAUDE.md` §2.1 documents for bracketed directories, and needs no coverage
  carve-out.

**The three numbers, and why each is what it is** (all in
`packages/domain/src/media/uploadSlot.ts`):

| Constant                 | Value        | Why                                                                                                                                                                                      |
| ------------------------ | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MAX_UPLOAD_BYTES`       | `52,428,800` | 50MiB. Chosen against the thing being uploaded: a 45-megapixel raw-to-JPEG export lands near 25MB, so this leaves room for a burst-mode original without leaving room for a video file.  |
| `MAX_FILES_PER_REQUEST`  | `20`         | `SECURITY.md` requires a per-request file count cap. A day's shooting arrives in tens; twenty is a comfortable drag-and-drop batch and a ceiling on staging space one request can claim. |
| `UPLOAD_URL_TTL_SECONDS` | `900`        | Fifteen minutes: long enough for twenty files over a hotel connection, short enough that a URL copied out of a log or a browser history is dead by the time it is read.                  |

The caps are enforced **twice**, deliberately. `planUploadSlots` refuses a request the
client describes as over either cap, and the receiver refuses the bytes that actually
arrive. The plan is only what the client was _told_; a client is not what enforces a
cap. The Server Action that calls `planUploadSlots` for a real request lands in the
commit after this one; the plan, the port method and the receiver are this one.

## Consequences

- **The R2 adapter is a one-file addition.** It implements five methods, three of whose
  `uploadUrl` cases are already written in the shared contract suite, and nothing above
  the port changes.
- **The receiver route still exists in production**, and it is a real write endpoint
  behind the admin guard. **It must be deleted, or gated behind the pipeline
  configuration, in the same change that adds the R2 adapter.** Named here so it is a
  recorded residual rather than a later discovery.
- `apps/web/lib/adapters/local-storage.ts` now depends on `apps/web/lib/env.ts` (for
  `ADMIN_ORIGIN` and `PAYLOAD_SECRET`) and on `apps/web/lib/media/uploadToken.ts`.
  Constructing the local adapter therefore requires a valid environment, which every
  Vitest project already supplies.
- The upload token is signed with `PAYLOAD_SECRET`. Rotating that secret invalidates
  every outstanding upload URL — which is correct, and is at most fifteen minutes of
  in-flight uploads.
- `SECURITY.md`'s "Serve media from a separate domain or bucket origin" and "Give the
  media origin its own restrictive CSP" are **not discharged by this ADR**. `MEDIA_ORIGIN`
  exists and is validated; the separate-origin serving and its CSP remain Phase 3's
  serving work, not the upload path's. Stated here so the presign seam is not mistaken
  for having settled them.
