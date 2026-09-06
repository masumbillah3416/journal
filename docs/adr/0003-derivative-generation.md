# 0003 — Derivative generation: `sharp` in the media worker, not a transform vendor

## Context

`handoff/design_handoff_travel_diary/README.md` suggests a dedicated image transform
layer — Cloudflare Images or imgproxy — to generate derivative sizes from uploaded
originals.

The design already requires a dedicated worker container (Fly.io) running `ffmpeg` for
video transcoding, because that work does not fit a serverless function (design spec
§2). `DATA_MODEL.md`'s `media` collection defines the required derivative tiers
(`imageSizes`: `thumb` 400², `tile` 800², `frame` 1400w, `hero` 2000w, `hero2x` 4000w)
and its `beforeChange` hook order already calls for re-encoding stills before storage —
both steps a `sharp` call can perform.

## Options considered

1. **Cloudflare Images or imgproxy**, per the handoff README. Rejected: it adds a vendor
   account, a billing relationship, and an API/webhook integration surface for work a
   process already running in this pipeline can do directly.
2. **`sharp` inside the existing transcoder worker**, generating all five derivative
   tiers at upload time — chosen. The worker already exists for `ffmpeg`; adding `sharp`
   is additive to a container that is already running, not a new service.

## Decision

Per the upload pipeline order in design spec §9.2 and `DATA_MODEL.md`'s `media`
`beforeChange` hook:

1. Sniff the real type from magic bytes; reject SVG outright.
2. Read EXIF to capture `capturedAt` and orientation, then strip all metadata.
3. Re-encode the still via `sharp` rather than passing the original through — this
   removes metadata and any embedded payload in the same step.
4. Generate all five derivative tiers (`thumb`, `tile`, `frame`, `hero`, `hero2x`) via
   `sharp`, at upload time, once.
5. Compute a perceptual hash for duplicate detection within the same journey.

No image transform vendor is used — that reasoning is unchanged by anything below.

**Update, `docs/adr/0004-media-pipeline-mode.md`:** where this pipeline runs changed
after this ADR was first written. The user decided against video clips for now, so the
Fly.io transcode worker this ADR originally assumed (`apps/transcoder`) is deferred.
Steps 1–5 above run **in-process on Vercel** instead, as the `MediaProcessor` port's
`inline` adapter — the same `sharp` calls, same five tiers, same order, just not inside
a separate worker container. This still holds because none of steps 1–5 need `ffmpeg`
or a long-running process: `sharp` fits comfortably inside a Vercel serverless
function's time and memory limits, which is precisely why this ADR's original
reasoning ("adding `sharp` is additive to a container already running for `ffmpeg`")
never depended on video existing — it only assumed a worker would exist for some
reason. With no `ffmpeg` work to justify that worker while video is off, `sharp`
simply runs wherever the upload request is already being handled.

Clips, when re-enabled, still use `ffmpeg`/`ffprobe` for transcoding, poster extraction
and duration probing, unchanged — that code path is the `MediaProcessor` port's
`worker` adapter, built and contract-tested from day one per ADR 0004 but not deployed
until video is turned back on.

## Consequences

- Removes a vendor: no Cloudflare Images or imgproxy account, credentials, billing line,
  or API surface to integrate, monitor, or keep available.
- Costs **~10GB of extra R2 storage for ~$0.15/month** (design spec §2.2) — five stored
  derivative tiers per still instead of on-the-fly transforms — which is materially
  cheaper than a transform vendor's request-based pricing at this scale.
- Derivative generation is testable in the same `MediaProcessor` contract suite as the
  rest of the pipeline (magic-byte sniff, EXIF strip, transcode, poster extraction)
  rather than mocked against an external service's API — one integration surface for
  the whole upload pipeline, not two, and the same suite runs against both the `inline`
  and `worker` adapters (ADR 0004) so the still-image steps are proven identical
  regardless of which one is bound.
- Originally reasoned as "the worker owns more responsibility (image _and_ video
  processing)" — with the worker deferred (ADR 0004), the still pipeline instead runs
  wherever the upload request is handled (Vercel, in-process), and only the _deferred_
  video path would still add a Fly.io container. The underlying trade this ADR made —
  one processing surface instead of two (a worker/pipeline plus a transform vendor) —
  is unaffected; only which infrastructure hosts that one surface changed.
- Logged as deviation 2 in `docs/deviations.md` and in the design spec §2.2/§15. The
  in-process-on-Vercel update is logged as the pipeline-mode deviation in the same
  file and in `docs/adr/0004-media-pipeline-mode.md`.
