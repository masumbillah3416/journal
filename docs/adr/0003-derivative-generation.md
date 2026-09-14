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
and duration probing, unchanged — that code path is to be the `MediaProcessor` port's
`worker` adapter, which ADR 0004 specifies is built and contract-tested alongside
`inline` rather than deferred with the deployment.

**Both adapters and the port exist as of Phase 3 Task 6**, and this paragraph said
neither did — true when it was written, false since. `apps/web/lib/ports/mediaProcessor.ts`
is the port; `apps/web/lib/adapters/inline-media-processor.ts` and
`worker-media-processor.ts` are the two adapters; `apps/web/lib/media/stillPipeline.ts`
holds steps 1 to 3 and 5 once, so both compose the same still pipeline rather than
agreeing by coincidence. The sentence is corrected rather than deleted because it was
itself a correction — Phase 2's final review, finding 30, for a sentence that read as a
statement about code — and the same file going stale a second time is the point.

## Consequences

- Removes a vendor: no Cloudflare Images or imgproxy account, credentials, billing line,
  or API surface to integrate, monitor, or keep available.
- Costs **~10GB of extra R2 storage for ~$0.15/month** (design spec §2.2) — five stored
  derivative tiers per still instead of on-the-fly transforms — which is materially
  cheaper than a transform vendor's request-based pricing at this scale.
- Derivative generation is testable against a real `sharp` rather than mocked against an
  external service's API — one integration surface for the whole upload pipeline, not
  two. **BUT IT IS NOT IN THE `MediaProcessor` CONTRACT SUITE, WHICH THIS BULLET SAID IT
  WAS (Phase 3 Task 13).** What Phase 3 built divides the work differently from what this
  ADR anticipated: the port's `process()` answers with ONE set of sanitised bytes
  (`ProcessedStill` carries `bytes`, `width`, `height`, `contentHash` — no tiers), and
  **Payload's own `imageSizes` derive the ladder from those bytes at `payload.create`.**
  One derivation, not two: a processor that also derived tiers would hand Payload an
  original it would then re-derive from anyway. So the tiers are proven by
  `apps/web/lib/media/ingestUpload.integration.test.ts`'s _"derives every derivative tier
  the media collection configures"_, reading the stored FILES back rather than the `sizes`
  keys — Payload emits a key per configured size whether or not it derived one, and that
  case passed while `hero2x` was never derived at all until Task 9 caught it. What the
  contract suite does prove, against both adapters, is steps 1 to 3 and 5: the sniff, the
  refusal, the EXIF strip, the re-encode and the hash.
- Originally reasoned as "the worker owns more responsibility (image _and_ video
  processing)" — with the worker deferred (ADR 0004), the still pipeline instead runs
  wherever the upload request is handled (Vercel, in-process), and only the _deferred_
  video path would still add a Fly.io container. The underlying trade this ADR made —
  one processing surface instead of two (a worker/pipeline plus a transform vendor) —
  is unaffected; only which infrastructure hosts that one surface changed.
- **The ladder named above is the ladder as of this decision, not as of today.** Phase 3
  Task 10 added a sixth rung, `grid` (700²), between `thumb` and `tile`: that is
  `docs/adr/0013-gallery-image-budget.md`'s Option 3, which 0013 deferred to this phase
  precisely because Phase 3 owns the pipeline. The Context and Decision above are left as
  they were written — they recorded the handoff's own list correctly at the time — so a
  reader who needs the current ladder should read `apps/web/collections/media.ts`'s
  `imageSizes`, which is the only place it is declared. The storage line above scales with
  it: one more derivative per still.
- **`frame` is no longer "1400w"; it is "at most 1400w", and that changed the storage
  line again.** Phase 3's owner-decisions round gave it `withoutEnlargement: true` to
  close MED-001 (`docs/qa/2026-09-08-media-pipeline-sweep.md`): this ADR's list of five
  tiers derived an uncropped one ONLY from a source at least 1400px wide, so every
  narrower photograph fell through to the square `tile` in all three of the ladders that
  serve one whole photograph. With the flag, a narrower original is left at its own size
  instead of the tier being skipped, so **every raster row now carries an uncropped
  derivative** — one more file per still below 1400px, which is every seeded placeholder
  and most phone photographs. `hero` and `hero2x` were deliberately left without the flag:
  they would be byte-identical duplicates of `frame` on exactly those sources.
- Logged as deviation 2 in `docs/deviations.md` and in the design spec §2.2/§15. The
  in-process-on-Vercel update is logged as the pipeline-mode deviation in the same
  file and in `docs/adr/0004-media-pipeline-mode.md`.
