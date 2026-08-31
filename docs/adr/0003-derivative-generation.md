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

The transcoder worker (`apps/transcoder`, Fly.io) runs `sharp` alongside `ffmpeg`.
Per the upload pipeline order in design spec §9.2 and `DATA_MODEL.md`'s `media`
`beforeChange` hook:

1. Sniff the real type from magic bytes; reject SVG outright.
2. Read EXIF to capture `capturedAt` and orientation, then strip all metadata.
3. Re-encode the still via `sharp` rather than passing the original through — this
   removes metadata and any embedded payload in the same step.
4. Generate all five derivative tiers (`thumb`, `tile`, `frame`, `hero`, `hero2x`) via
   `sharp`, at upload time, once.
5. Compute a perceptual hash for duplicate detection within the same journey.

No image transform vendor is used. Clips still use `ffmpeg`/`ffprobe` for transcoding,
poster extraction and duration probing, unchanged.

## Consequences

- Removes a vendor: no Cloudflare Images or imgproxy account, credentials, billing line,
  or API surface to integrate, monitor, or keep available.
- Costs **~10GB of extra R2 storage for ~$0.15/month** (design spec §2.2) — five stored
  derivative tiers per still instead of on-the-fly transforms — which is materially
  cheaper than a transform vendor's request-based pricing at this scale.
- Derivative generation is testable in the same worker contract suite as the rest of the
  pipeline (magic-byte sniff, EXIF strip, transcode, poster extraction) rather than
  mocked against an external service's API — one integration surface for the whole
  upload pipeline, not two.
- The worker owns more responsibility (image *and* video processing), which is the
  correct trade for a single-author site: one container to deploy, monitor and pay for
  attaching to Fly.io, instead of two moving parts (worker + transform vendor) for a
  100-asset-per-journey, ~40GB-total workload.
- Logged as deviation 2 in `docs/deviations.md` and in the design spec §2.2/§15.
