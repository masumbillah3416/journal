# Phase 3 — Media Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the upload pipeline — presigned direct-to-bucket upload, a `MediaProcessor` port with `inline` and `worker` adapters behind `MEDIA_PIPELINE`, magic-byte sniffing, SVG rejection, EXIF strip, the derivative tiers, perceptual duplicate detection, `processing`/`ready`/`failed` states and the download handler — so that a still survives a full round trip, EXIF is verifiably absent, SVG is verifiably rejected, both adapters pass one contract suite in CI, and turning clips on is a config change rather than new code.

**Architecture:** Ports & Adapters, exactly as `storage`/`mailer`/`queue` already are. A new `MediaProcessor` port fronts the pipeline; both adapters compose ONE shared `stillPipeline` module, so "the same still steps" is true by construction rather than by inspection, and one shared contract suite runs against both. Every byte-level decision that can be pure is pure and lives in `packages/domain/src/media/**` at 100% coverage: magic-byte sniffing, the ingest policy, the EXIF tag reader, the metadata-marker probe, the perceptual hash and the upload-slot plan. `sharp` re-encodes; Payload's own `imageSizes` derives the tiers from the sanitised bytes. Every mutation is a `guardedAction`.

**Tech Stack:** Next.js 15 (App Router), Payload 3, Postgres, `sharp` 0.35.4 (already a dependency of `apps/web`), `node:crypto` for the upload token's HMAC, `ffmpeg`/`ffprobe` for the deferred clip path, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-31-travel-diary-design.md` §4 (Phase 3), §9 (Media pipeline), §10 (the security table's upload and download rows)
**Security source of record:** `handoff/design_handoff_travel_diary/SECURITY.md`, "Uploads — the two that matter most for a photo site"
**Data source of record:** `handoff/design_handoff_travel_diary/DATA_MODEL.md`, the `media` collection
**Decisions this phase executes:** `docs/adr/0003-derivative-generation.md`, `docs/adr/0004-media-pipeline-mode.md`, `docs/adr/0013-gallery-image-budget.md` (its deferred Option 3)

**Branch:** `feat/phase-3-media-pipeline`, cut from `main` at `4791d4b`.

---

## Global Constraints

Copied verbatim from `CLAUDE.md`, the spec, the handoff and the ADRs. Every task's requirements implicitly include these.

### From `CLAUDE.md`

- TypeScript `strict`, plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. **`any` is banned.** No non-null assertions.
- Coverage gates: `packages/domain/**` **100%** lines/branches/functions; `apps/web/lib/**` 95%; repository-wide 90%. **No source file may be absent from every coverage `include`** (§2.1). "Adding code in a new directory means adding that directory to an `include`, with a real threshold, in the same commit."
- TDD is mandatory: "a failing test exists before the implementation that satisfies it", and it must fail _for the expected reason_.
- "No claim of 'done', 'fixed' or 'passing' without pasted command output proving it."
- **"Key everything by journey id."** Duplicate detection matches "an existing row **in the same journey**".
- **"Address rows by id, never by array position."**
- **"Derive, never store"**, what the data model lists as derived — including **media counts and storage totals**.
- "All migrations are reversible and tested in both directions."
- "Never log secrets, tokens, OTP codes, or full email addresses."
- **§7.1: repository content never leaves this machine.** "When the local tool is missing, the verification is UNRESOLVED" — report it as unresolved and name the tool.
- Time is always injected. `Date.now()` inside logic under test is a defect.
- Performance budgets are hard gates: "**Only `transform` and `opacity` animated**"; diary route JS ≤ 180KB gzipped; admin ≤ 320KB; CLS ≤ 0.1; INP ≤ 200ms; "No N+1. Every list is one query with joins"; "**Always a derivative tier, never an original.** `hero2x` for displays ≥2×".
- One logical change per commit; Conventional Commits with a _why_ body; subject **≤72 characters**; ending `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

### From `SECURITY.md`, "Uploads — the two that matter most for a photo site"

- "Read EXIF once to capture `capturedAt` and orientation"
- "Then **strip all metadata** before storing or serving"
- "Re-encode stills rather than passing originals through — that removes metadata and any embedded payload in one step"
- "An SVG is an HTML document. One uploaded file becomes stored XSS with your own session attached."
- "**Reject SVG.** There is no use for it here"
- "Sniff the real type from magic bytes; never trust the extension or the client-declared mime type"
- "Serve media from a separate domain or bucket origin, so a bypass can't script against the admin"
- "Set `Content-Disposition: attachment` and a strict `Content-Type` on downloads"
- "Cap file size and the per-request file count; reject archives"
- "the gallery's download action must serve a **derivative through your own handler**, not a bucket URL. Direct URLs invite enumeration of everything in the bucket, including anything marked hidden."
- "Check authorization on **every mutation**, not just at login... nothing inherits trust from the page it was reached from"

### From the spec §9.2 — the pipeline order, which "matters"

1. Sniff the real type from magic bytes. Never the extension, never the client-declared mime type.
2. **Reject SVG outright.**
3. Read EXIF, capturing `capturedAt` and orientation.
4. **Strip all metadata and re-encode via `sharp`.**
5. Generate the five derivative tiers: `thumb` 400 squared, `tile` 800 squared, `frame` 1400w, `hero` 2000w, `hero2x` 4000w.
6. Compute a perceptual hash; if it matches an existing row **in the same journey**, skip and report as a duplicate.
7. Clips: `ffprobe` for `durationSec`, transcode to H.264 at modest bitrate, extract a poster at `posterAt ?? 0` into `posterImage`.
8. Mark `ready`, or `failed` with a reason the Media screen surfaces.

### Exact values

| Value                                           | Exactly                                                                                           | Source                                       |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `MEDIA_PIPELINE`                                | `'inline'` or `'worker'`, Zod-validated in `apps/web/lib/env.ts`, default `'inline'`              | spec §9.3, ADR 0004                          |
| `media.upload.mimeTypes`                        | `['image/jpeg', 'image/png', 'image/heic', 'video/mp4', 'video/quicktime']` — **unchanged**       | `apps/web/collections/media.ts`, DATA_MODEL  |
| Existing `imageSizes`                           | `thumb` 400x400 `position: 'centre'`, `tile` 800x800, `frame` 1400w, `hero` 2000w, `hero2x` 4000w | `apps/web/collections/media.ts`              |
| New tier this phase adds                        | `grid` **700x700**                                                                                | ADR 0013 Option 3 (~700px), for a 658px need |
| Gallery image budget, today                     | `resource-summary:image:size` `maxNumericValue: 600000` on `/gallery/<slug>`                      | `lighthouserc.json`, ADR 0013                |
| Gallery LCP / script / CLS                      | `4000` ms, `184320` bytes, `0.1`                                                                  | `lighthouserc.json`                          |
| Diary LCP                                       | `3000` ms, both viewport configs                                                                  | ADR 0008, ADR 0014                           |
| The regression the gallery gate exists to catch | 60 requests / **4,600,585** bytes, against 9 requests / **477,329** bytes intact                  | ADR 0013, measured                           |
| `MAX_UPLOAD_BYTES`                              | `52_428_800` (50 MiB) — above the "25MB photograph" the spec names as realistic                   | spec §9.1, ADR 0020 (this phase)             |
| `MAX_FILES_PER_REQUEST`                         | `20` — a journey tops out at ~100 assets, uploaded in batches                                     | spec §1, ADR 0020 (this phase)               |
| `UPLOAD_URL_TTL_SECONDS`                        | `900`                                                                                             | ADR 0020 (this phase)                        |
| `DUPLICATE_MAX_DISTANCE`                        | `5` of 64 hash bits                                                                               | ADR 0022 (this phase)                        |
| Vercel request body cap                         | ~4.5MB — "so a 25MB photograph cannot pass through the app at all"                                | spec §9.1                                    |

### Two measurements taken while writing this plan, on this machine

Both were run locally against the installed `sharp` 0.35.4, and both change what a task must do. Neither left the machine.

```
$ cd apps/web && node -e "const s=require('sharp'); console.log('heif:', JSON.stringify(s.format.heif))"
heif: {"id":"heif","input":{"file":true,"buffer":true,"stream":true,"fileSuffix":[".avif"]},
       "output":{"file":true,"buffer":true,"stream":true,"alias":["avif"]}}

$ cd apps/web && node -e "const s=require('sharp'); console.log('svg:', JSON.stringify(s.format.svg))"
svg: {"id":"svg","input":{"file":true,"buffer":true,"stream":true,"fileSuffix":[".svg",".svgz",".svg.gz"]},
      "output":{"file":false,"buffer":false,"stream":false}}
```

1. **This `sharp` build cannot decode HEIC.** Its `heif` input `fileSuffix` is `['.avif']` only, and the bundled codec is `aom` (AV1), not HEVC. `media.ts`'s `mimeTypes` lists `image/heic` faithfully from `DATA_MODEL.md`, so the schema is right and the pipeline cannot honour it. Task 2 therefore refuses `image/heic` at the port with `'heic-unsupported'` — the same shape ADR 0004 uses for video: **the schema is untouched, the port enforces.** Recorded as a deviation in Task 13.
2. **This `sharp` build DOES decode SVG** (`rsvg` 2.62.91 appears in `sharp.versions`). So an SVG renamed `.jpg` and declared `image/jpeg` would be rasterised without complaint by any sharp-based pipeline. **Our magic-byte sniff is the only thing between an uploaded SVG and the store**, which is why Task 2's mutation step is load-bearing rather than ceremonial.

### One check this plan cannot resolve here

`ffmpeg` and `ffprobe` are **not installed on this machine**:

```
$ ffmpeg -version
bash: line 1: ffmpeg: command not found
$ ffprobe -version
bash: line 1: ffprobe: command not found
```

Per `CLAUDE.md` §7.1 that makes the real-binary arm of the `worker` adapter's clip cases **UNRESOLVED locally**, and it is reported as unresolved rather than worked around. The tool that settles it is **`ffmpeg`, which ships `ffprobe`** — installed on the developer's machine (`winget install Gyan.FFmpeg`, `choco install ffmpeg`, or a static build on `PATH`) and installed in CI by an explicit `apt-get install -y ffmpeg` step, added in Task 6. Nothing is sent anywhere to get around it.

**The exit criterion does not depend on it.** The shared contract suite exercises the still pipeline, which both adapters compose; it needs no `ffmpeg` at all. Only the clip-specific arm does, and that arm **fails rather than skips** when `MEDIA_REQUIRE_CLIP_TOOLCHAIN=1` is set, which CI sets.

---

## What already exists — build on it, never duplicate it

| Thing                                                                                                                            | Where                                                           | What this phase does with it                                       |
| -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------ |
| `Media` collection, five `imageSizes`, `kind`/`capturedAt`/`posterAt`/`posterImage`/`durationSec`/`contentHash`, `MEDIA_DIR`     | `apps/web/collections/media.ts`                                 | Adds `state`, `failureReason`, the `grid` tier, the `isCover` hook |
| **No `state` field**                                                                                                             | —                                                               | Task 5 adds it, with a reversible migration                        |
| `StoragePort`, `validateStorageKey`                                                                                              | `apps/web/lib/ports/storage.ts`                                 | Grows `uploadUrl`; is the shape the new port follows               |
| `createLocalStorage`                                                                                                             | `apps/web/lib/adapters/local-storage.ts`                        | Implements `uploadUrl` as the local receiver URL                   |
| `storageContract`, `mailerContract`, `queueContract`                                                                             | `apps/web/lib/adapters/contract/`                               | The pattern `mediaProcessorContract` copies                        |
| **`MediaProcessor` does not exist.** Five documents said it shipped; Phase 2's ninth review found that false and corrected them. | —                                                               | Task 6 builds it                                                   |
| `parseEnv`, `envSchema`, `env`, `Env`                                                                                            | `apps/web/lib/env.ts`                                           | Task 1 adds `MEDIA_PIPELINE`                                       |
| `guardedAction`, `guarded`, `requireAdminSession`, `AuthenticatedSession`                                                        | `apps/web/lib/auth/guard.ts`                                    | Every mutation this phase adds sits behind them                    |
| `eslint-rules/guarded-server-actions.js`                                                                                         | —                                                               | **Read its header before writing any `'use server'` module**       |
| `QueuePort`, `ClaimedJob`                                                                                                        | `apps/web/lib/ports/queue.ts`                                   | The `worker` mode's queue hop, kind `transcode`                    |
| `readGalleryDownload`, `Attachment`, `DOWNLOAD_TIERS`                                                                            | `apps/web/lib/readGalleryDownload.ts`                           | Task 11 adds cacheability and the `grid` tier                      |
| `downloadContentType`, `downloadFilename`, `DownloadableContentType`                                                             | `packages/domain/src/galleryDownload.ts`                        | Task 11 adds `downloadCacheControl`                                |
| `TILE_TIERS`, `FULL_TIERS`, `tileSrcSet`, `DerivativeTier`                                                                       | `apps/web/lib/readGalleryBundle.ts`, module-private             | Task 10 puts `grid` into `TILE_TIERS`                              |
| `runMigrationDirection`, `sessionExpirySchema`, `signInAttemptsSchema`, `aTinyPng`                                               | `apps/web/collections/collections.integration.test.ts`, private | Tasks 5 and 10 add their reversibility cases **inside that file**  |
| `aSignedInSession`, `fixtureLabel`, `removeSignedInFixture`, `SESSION_FIXTURE_DOMAIN`, cookie `td-session`                       | `e2e/support/adminSession.ts`                                   | Task 9's browser upload signs in with these                        |
| `waitForLiveBook`, `waitForWholeBook`, `wholeBookPath`                                                                           | `e2e/support/liveBook.ts`                                       | Task 12 adds `deferAddressWrites` beside them                      |
| `Result`, `ok`, `err`, `isOk`                                                                                                    | `@travel-diary/domain/result`                                   | Every fallible operation in this phase                             |
| `MediaId`, `JourneyId`, `mediaId`, `journeyId`                                                                                   | `@travel-diary/domain/ids`                                      | **No new branded ids are needed**                                  |
| `aJourney`, `aGalleryFrame`, `aChallenge`, `aPortrait`                                                                           | `packages/domain/src/testing/factories.ts`                      | Tasks 2 to 4 add the byte-level factories there                    |
| `site.passwordProtect`, a checkbox defaulting to `false`                                                                         | `apps/web/globals/site.ts`                                      | Task 11's carry-forward reads it                                   |
| `getPayload`, `getTestPayload`                                                                                                   | `apps/web/lib/payload.ts`, `apps/web/lib/testPayload.ts`        | Every integration test in this phase                               |

**Import conventions, checked against the tree.** Inside `packages/domain` imports are **extensionless** (`from './result'`, `from '../auth/otpChallenge'`) and never carry `.js`. From `apps/web` the domain is reached as `@travel-diary/domain/<path>`, because its `package.json` maps `"./*"` to `"./src/*.ts"`. Payload's Local API creates an upload row as `payload.create({ collection: 'media', data, file: { data, mimetype, name, size } })` — the shape `apps/web/scripts/seed.ts` already uses, and the shape this phase hands sanitised bytes to.

---

## File Structure

| Path                                                         | Responsibility                                                         | Task |
| ------------------------------------------------------------ | ---------------------------------------------------------------------- | ---- |
| `packages/domain/src/media/sniff.ts`                         | Magic-byte type sniffing, pure                                         | 2    |
| `packages/domain/src/media/ingestPolicy.ts`                  | What each mode accepts, and why a candidate is refused                 | 2    |
| `packages/domain/src/media/exif.ts`                          | The two-tag EXIF reader **and** the metadata-marker probe              | 3    |
| `packages/domain/src/media/perceptualHash.ts`                | dHash, Hamming distance, the duplicate threshold                       | 4    |
| `packages/domain/src/media/uploadSlot.ts`                    | Size cap, file-count cap, staging-key plan                             | 7    |
| `apps/web/lib/ports/mediaProcessor.ts`                       | The `MediaProcessor` port                                              | 6    |
| `apps/web/lib/media/stillPipeline.ts`                        | Steps 1 to 6, composed by **both** adapters                            | 6    |
| `apps/web/lib/media/clipToolchain.ts`                        | The `ffprobe`/`ffmpeg` subprocess seam                                 | 6    |
| `apps/web/lib/adapters/inline-media-processor.ts`            | Stills in-process on Vercel; refuses video                             | 6    |
| `apps/web/lib/adapters/worker-media-processor.ts`            | The same stills plus step 7; built and tested, deployed by nothing     | 6    |
| `apps/web/lib/adapters/contract/media-processor-contract.ts` | ONE suite, run against both adapters                                   | 6    |
| `apps/web/lib/adapters/contract/media-fixtures.ts`           | Real `sharp`-produced photographs, with EXIF, as factories             | 6    |
| `apps/web/lib/media/services.ts`                             | The composition root: which adapter `MEDIA_PIPELINE` binds             | 6    |
| `apps/web/lib/media/uploadToken.ts`                          | HMAC mint and verify for the local presigned PUT                       | 7    |
| `apps/web/lib/media/receiveLocalUpload.ts`                   | The local receiver's whole body                                        | 7    |
| `apps/web/lib/media/localUploadEndpoint.ts`                  | `Request` to `Response` for that receiver                              | 7    |
| `apps/web/app/(admin)/admin/media/upload/route.ts`           | `export const PUT = guarded(handleLocalUpload)`                        | 7    |
| `apps/web/lib/media/uploadContract.ts`                       | The action request and response types. **Not** a `'use server'` module | 7    |
| `apps/web/app/(admin)/admin/media/actions.ts`                | `'use server'` — `requestUploadSlots`, `finaliseUpload`, both guarded  | 7, 8 |
| `apps/web/lib/media/ingestUpload.ts`                         | Row creation, states, duplicate-within-journey                         | 8    |
| `apps/web/lib/media/roundTrip.integration.test.ts`           | The five exit criteria, proven end to end                              | 9    |
| `apps/web/scripts/rederive-media.ts`                         | Re-derive every stored row so it carries `grid`                        | 10   |
| `e2e/upload.spec.ts`                                         | The real browser PUT, and the fixture-shape proof                      | 9    |
| `e2e/support/liveBook.ts`                                    | Extended with `deferAddressWrites`                                     | 12   |

---

## Task-to-exit-criterion map

The spec's `_Exit:_` line for Phase 3 is five things. Each has exactly one **owning** task; none is left to be a by-product.

| Exit criterion                                                                                                        | Owned by   | Where the proof lives                                                                 |
| --------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------- |
| **a still survives a full round trip via the `inline` adapter**                                                       | **Task 9** | `roundTrip.integration.test.ts`, plus `e2e/upload.spec.ts`'s real browser PUT         |
| **EXIF verifiably absent**, by reading the stored bytes                                                               | **Task 9** | `roundTrip.integration.test.ts`, reading the object back through the `StoragePort`    |
| **SVG verifiably rejected**                                                                                           | **Task 9** | `roundTrip.integration.test.ts` — refused at ingest, and nothing written to the store |
| **both `MediaProcessor` adapters pass the same contract suite in CI**                                                 | **Task 6** | `media-processor-contract.ts`, called from both adapters' own test files              |
| **enabling clips is a config switch, not new code** — so `inline` rejects `video/mp4` and `video/quicktime` at ingest | **Task 9** | `roundTrip.integration.test.ts`'s mode-parameterised ingest cases                     |

The rules those depend on are built earlier and enforced at the port: the sniff and the refusal policy are **Task 2**, the metadata probe is **Task 3**, the port and both adapters are **Task 6**, ingest is **Task 8**. Task 9 owns four of the criteria because Task 9 is where the claim is actually proven against a real database and a real store.

Also owned: ADR 0013's deferred ~700px derivative tier is **Task 10**; the `passwordProtect` download-cache revisit Phase 2 left behind is **Task 11**; `e2e/flip.spec.ts:157`'s ~2% flake is **Task 12**.

---

## How this plan answers the two things Phase 2 learned the hard way

**1 · A test asserting a mechanism must be watched to fail with the mechanism removed.** Every task below carries a numbered mutation step that names the exact edit, the exact test that must fail, and the restore. Where a mechanism has no single line to delete, the task says so and mutates the nearest thing that changes behaviour. The mutations are chosen to be _visible_: a sniff that returns `'unknown'` instead of `'image/svg+xml'`, an `>=` that becomes `>`, a `withMetadata()` left on the `sharp` chain.

**2 · A fixture that encodes an assumption is invisible to mutation testing.** Three fixture families in this phase could hide a wrong assumption, and each is given an explicit proof:

| Fixture                                                 | The assumption it could hide                                  | How it is proven                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The hand-assembled EXIF JPEG in `factories.ts` (Task 3) | That EXIF is laid out the way the parser expects              | Task 6 Step 4 runs `readExifFacts` against a **real `sharp`-encoded** photograph and asserts it returns the values `withExif` was asked to write. A hand-built fixture agreeing with a hand-built parser proves nothing; agreement with a real encoder does.                                                                                                                |
| The EXIF-absence assertion (Tasks 6, 9)                 | That the fixture never had EXIF at all, so absence is vacuous | Every absence assertion is preceded by a **positive control** in the same test: `metadataMarkersIn(fixtureBytes)` must contain `'exif'`, and the fixture's ASCII canary must be present, before the processed bytes are asserted to carry neither.                                                                                                                          |
| The upload request (Tasks 7, 9)                         | That the request shape is one no browser produces             | `EXPECTED_UPLOAD_REQUEST` in `apps/web/lib/media/uploadContract.ts` is a single exported constant. The integration fixture **builds from it**, and `e2e/upload.spec.ts` intercepts the PUT a real Chromium actually issues and asserts the observed method, `Content-Type` and body length **equal that same constant**. Drift fails the browser suite, not the unit suite. |

---

## Task 1: `MEDIA_PIPELINE` in the validated environment

The flag ADR 0004 specifies, in the one place this repository validates untyped strings from the OS.

**Files:**

- Modify: `apps/web/lib/env.ts`, `apps/web/lib/env.test.ts`, `.env.example`

**Interfaces:**

- Consumes: `parseEnv(raw: Record<string, string | undefined>): Result<Env, string>` and `envSchema` — both already in `apps/web/lib/env.ts`.
- Produces: `Env['MEDIA_PIPELINE']`, typed `'inline' | 'worker'`, and a re-exported `PipelineMode` alias is **not** added here — the type name belongs to the domain and arrives in Task 2. Task 1 leaves the field's type inferred by Zod.

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/lib/env.test.ts`, following that file's existing style of calling `parseEnv` with a complete record:

```ts
describe('MEDIA_PIPELINE', () => {
  it('defaults to inline when the variable is not set', () => {
    const parsed = parseEnv({ ...aValidEnv(), MEDIA_PIPELINE: undefined })

    expect(parsed).toEqual({ ok: true, value: expect.objectContaining({ MEDIA_PIPELINE: 'inline' }) })
  })

  it('accepts worker, which is the mode that turns clips on', () => {
    const parsed = parseEnv({ ...aValidEnv(), MEDIA_PIPELINE: 'worker' })

    expect(parsed).toEqual({ ok: true, value: expect.objectContaining({ MEDIA_PIPELINE: 'worker' }) })
  })

  it('refuses a mode nobody implements, naming the field', () => {
    // A typo here would otherwise bind the inline adapter silently and defer
    // video a second time without anybody deciding to.
    const parsed = parseEnv({ ...aValidEnv(), MEDIA_PIPELINE: 'flyio' })

    expect(parsed.ok).toBe(false)
    expect(parsed.ok ? '' : parsed.error).toContain('MEDIA_PIPELINE')
  })
})
```

`aValidEnv()` is the helper `env.test.ts` already uses to build a complete, passing record. **Read that file first**: if it spells the helper differently, use its name rather than introducing a second one, and if it has none, add `aValidEnv` as a factory with overridable defaults per `CLAUDE.md` §2.3 in this same step.

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run --project unit apps/web/lib/env.test.ts`
Expected: all three FAIL. The first two on `MEDIA_PIPELINE` being absent from the parsed object (Zod strips unknown keys), the third on `parsed.ok` being `true` because an unvalidated field cannot be refused.

- [ ] **Step 3: Implement**

Add to `envSchema`, with a TSDoc comment saying what the flag switches — the three things ADR 0004 lists, together:

```ts
  /**
   * Which `MediaProcessor` adapter is bound, and with it: whether
   * `video/mp4`/`video/quicktime` are accepted at ingest, and whether the
   * admin shows clip affordances. One variable rather than three, so
   * "enable video" cannot be half-done (docs/adr/0004-media-pipeline-mode.md).
   */
  MEDIA_PIPELINE: z.enum(['inline', 'worker']).default('inline'),
```

Add `MEDIA_PIPELINE=inline` to `.env.example` with a one-line comment pointing at ADR 0004.

- [ ] **Step 4: Mutation — break the enum, name the test that must fail**

Replace `z.enum(['inline', 'worker']).default('inline')` with `z.string().optional()`. Run Step 2's command.
**The test that must fail: `refuses a mode nobody implements, naming the field`.** The two accepting cases keep passing, which is exactly why the refusal case has to exist.
Restore. Re-run. **Paste both runs.**

- [ ] **Step 5: Commit**

```
feat(infra): validate MEDIA_PIPELINE as an enum with an inline default
```

Body: why the flag exists (ADR 0004's one-configuration-change requirement), why it is validated rather than read (`CLAUDE.md` §3.1, runtime validation at every trust boundary), and that a typo must fail at boot rather than silently bind `inline`.

---

## Task 2: Magic-byte sniffing and the ingest policy, pure

Step 1 and step 2 of the spec's pipeline order, and the whole of what each mode accepts. Pure, in `packages/domain`, at 100% coverage — because "never trust the extension or the client-declared mime type" is a rule about bytes, and bytes need no database.

**Files:**

- Create: `packages/domain/src/media/sniff.ts`, `packages/domain/src/media/sniff.test.ts`, `packages/domain/src/media/ingestPolicy.ts`, `packages/domain/src/media/ingestPolicy.test.ts`
- Modify: `packages/domain/src/testing/factories.ts`, `packages/domain/src/testing/factories.test.ts`

**Interfaces:**

- Consumes: `Result`, `ok`, `err` from `./result` — already exist.
- Produces, in `sniff.ts`:
  - `export type SniffedType = 'image/jpeg' | 'image/png' | 'image/heic' | 'image/svg+xml' | 'video/mp4' | 'video/quicktime' | 'unknown'`
  - `export const sniffMediaType = (bytes: Uint8Array): SniffedType`
- Produces, in `ingestPolicy.ts`:
  - `export type PipelineMode = 'inline' | 'worker'`
  - `export type IngestRefusal = 'svg-rejected' | 'video-deferred' | 'heic-unsupported' | 'type-not-allowed' | 'declared-mismatch'`
  - `export type AcceptedType = 'image/jpeg' | 'image/png' | 'video/mp4' | 'video/quicktime'`
  - `export const acceptedIngestTypes = (mode: PipelineMode): readonly AcceptedType[]`
  - `export const ingestDecision = (candidate: { readonly sniffed: SniffedType; readonly declared: string; readonly mode: PipelineMode }): Result<AcceptedType, IngestRefusal>`
- Produces, in `factories.ts` (every fixture the tests below use, so no snippet references an identifier nothing defines):
  - `export const aJpegHeader = (): Uint8Array`
  - `export const aPngHeader = (): Uint8Array`
  - `export const anIsoBmffHeader = (overrides?: { readonly brand?: string }): Uint8Array`
  - `export const anSvgDocument = (overrides?: { readonly leadingWhitespace?: string }): Uint8Array`

- [ ] **Step 0: Add the four byte-level factories**

In `packages/domain/src/testing/factories.ts`, beside `aJourney` and `aChallenge`, with overridable defaults and no shared mutable state:

```ts
/** A JPEG's SOI marker followed by a JFIF APP0 segment header. */
export const aJpegHeader = (): Uint8Array =>
  new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00])

/** The eight-byte PNG signature. */
export const aPngHeader = (): Uint8Array => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/**
 * An ISO base media file's `ftyp` box, whose brand is what separates HEIC
 * from MP4 from QuickTime - all three share these first eight bytes.
 * @param overrides - `brand` defaults to `'isom'`, MP4's own.
 */
export const anIsoBmffHeader = (overrides: { readonly brand?: string } = {}): Uint8Array => {
  const brand = overrides.brand ?? 'isom'
  const header = new Uint8Array(16)
  header.set([0x00, 0x00, 0x00, 0x10], 0)
  header.set(new TextEncoder().encode('ftyp'), 4)
  header.set(new TextEncoder().encode(brand.padEnd(4, ' ').slice(0, 4)), 8)
  header.set(new TextEncoder().encode('0000'), 12)
  return header
}

/**
 * An SVG that is also an HTML document, which is the whole objection to it
 * (SECURITY.md: "One uploaded file becomes stored XSS with your own session
 * attached"). The script tag is the payload a rejection has to stop.
 * @param overrides - `leadingWhitespace` defaults to `''`; a real uploader can
 *   send a BOM or newlines before the root element.
 */
export const anSvgDocument = (overrides: { readonly leadingWhitespace?: string } = {}): Uint8Array =>
  new TextEncoder().encode(
    `${overrides.leadingWhitespace ?? ''}<svg xmlns="http://www.w3.org/2000/svg">` +
      `<script>fetch("/admin/sign-out",{method:"POST"})</script></svg>`,
  )
```

Extend `packages/domain/src/testing/factories.test.ts` with a case per factory asserting its first bytes, so the 100% gate on `packages/domain/**` is met by the factories themselves rather than incidentally.

- [ ] **Step 1: Write the failing sniff test**

`packages/domain/src/media/sniff.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { sniffMediaType } from './sniff'
import { aJpegHeader, anIsoBmffHeader, anSvgDocument, aPngHeader } from '../testing/factories'

describe('sniffMediaType', () => {
  it('names a JPEG from its start-of-image marker', () => {
    expect(sniffMediaType(aJpegHeader())).toBe('image/jpeg')
  })

  it('names a PNG from its eight-byte signature', () => {
    expect(sniffMediaType(aPngHeader())).toBe('image/png')
  })

  it('separates HEIC from MP4 by the ftyp brand, not by the box header they share', () => {
    expect(sniffMediaType(anIsoBmffHeader({ brand: 'heic' }))).toBe('image/heic')
    expect(sniffMediaType(anIsoBmffHeader({ brand: 'isom' }))).toBe('video/mp4')
  })

  it('names QuickTime from the qt brand', () => {
    expect(sniffMediaType(anIsoBmffHeader({ brand: 'qt' }))).toBe('video/quicktime')
  })

  it('names an SVG, which no byte signature announces, from its root element', () => {
    expect(sniffMediaType(anSvgDocument())).toBe('image/svg+xml')
  })

  it('names an SVG that leads with whitespace and a byte-order mark', () => {
    // A rejection that only catches a file starting exactly at the angle
    // bracket is a rejection an uploader gets past by pressing return.
    expect(sniffMediaType(anSvgDocument({ leadingWhitespace: '﻿\n  ' }))).toBe('image/svg+xml')
  })

  it('names an SVG wrapped in an XML declaration', () => {
    const declared = new TextEncoder().encode(
      `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg"/>`,
    )

    expect(sniffMediaType(declared)).toBe('image/svg+xml')
  })

  it('reports unknown rather than guessing, for bytes it does not recognise', () => {
    expect(sniffMediaType(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe('unknown')
  })

  it('reports unknown for an empty upload rather than throwing', () => {
    expect(sniffMediaType(new Uint8Array())).toBe('unknown')
  })

  it('reports unknown for a file too short to carry any signature', () => {
    expect(sniffMediaType(new Uint8Array([0xff]))).toBe('unknown')
  })
})
```

Note the ZIP signature in the unknown case: `SECURITY.md` says "reject archives", and an archive is exactly a thing with no image signature. It is refused by being unrecognised, which is the default-deny direction.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run --project unit packages/domain/src/media/sniff.test.ts`
Expected: FAIL — `Failed to resolve import "./sniff"`. Then, once the module exists with a stub, ten assertion failures.

- [ ] **Step 3: Implement `sniffMediaType`**

A signature table, checked longest-first, then the SVG text scan. Two invariants to state at the point they are relied on:

- **The SVG scan reads only the first 1,024 bytes**, decoded as UTF-8 with `fatal: false`, lowercased, after stripping a leading BOM and whitespace. Bounded because an uploader controls the length, and an unbounded scan of a 50 MiB file is a denial-of-service the cap alone does not close.
- **`ftyp` brands** are compared against `'heic'`, `'heix'`, `'hevc'`, `'mif1'`, `'msf1'` for HEIC; `'qt'` (padded, so `'qt  '`) for QuickTime; everything else beginning a valid `ftyp` box is `'video/mp4'`. Say in the header that `mif1` is HEIF-generic and is treated as HEIC because the only thing this repository does with either is refuse it (see Task 2's policy).

- [ ] **Step 4: Write the failing ingest-policy test**

`packages/domain/src/media/ingestPolicy.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { acceptedIngestTypes, ingestDecision } from './ingestPolicy'

describe('acceptedIngestTypes', () => {
  it('offers stills only under inline, because video is deferred', () => {
    expect(acceptedIngestTypes('inline')).toEqual(['image/jpeg', 'image/png'])
  })

  it('offers the two clip types as well under worker, which is the whole config switch', () => {
    expect(acceptedIngestTypes('worker')).toEqual(['image/jpeg', 'image/png', 'video/mp4', 'video/quicktime'])
  })
})

describe('ingestDecision', () => {
  it('accepts a JPEG whose declared type agrees with its bytes', () => {
    expect(ingestDecision({ sniffed: 'image/jpeg', declared: 'image/jpeg', mode: 'inline' })).toEqual({
      ok: true,
      value: 'image/jpeg',
    })
  })

  it('accepts on the sniffed type when the declared type is missing entirely', () => {
    // The bytes decide. A client that declares nothing has declared nothing
    // wrong.
    expect(ingestDecision({ sniffed: 'image/png', declared: '', mode: 'inline' })).toEqual({
      ok: true,
      value: 'image/png',
    })
  })

  it('rejects an SVG declared as a JPEG as an SVG, not as a mismatch', () => {
    // The refusal has to name the danger. SECURITY.md: an SVG is an HTML
    // document, so one upload becomes stored XSS with the author's own
    // session attached - and that is true whatever the client called it.
    expect(ingestDecision({ sniffed: 'image/svg+xml', declared: 'image/jpeg', mode: 'inline' })).toEqual({
      ok: false,
      error: 'svg-rejected',
    })
  })

  it('rejects an SVG under worker as well, because no mode has a use for one', () => {
    expect(ingestDecision({ sniffed: 'image/svg+xml', declared: 'image/svg+xml', mode: 'worker' })).toEqual({
      ok: false,
      error: 'svg-rejected',
    })
  })

  it('defers an mp4 under inline even though the schema lists it', () => {
    // ADR 0004: the port enforces this, not a schema change - so enabling
    // clips stays one configuration change.
    expect(ingestDecision({ sniffed: 'video/mp4', declared: 'video/mp4', mode: 'inline' })).toEqual({
      ok: false,
      error: 'video-deferred',
    })
  })

  it('defers QuickTime under inline for the same reason', () => {
    expect(ingestDecision({ sniffed: 'video/quicktime', declared: 'video/quicktime', mode: 'inline' })).toEqual({
      ok: false,
      error: 'video-deferred',
    })
  })

  it('accepts an mp4 under worker, which is what the flag buys', () => {
    expect(ingestDecision({ sniffed: 'video/mp4', declared: 'video/mp4', mode: 'worker' })).toEqual({
      ok: true,
      value: 'video/mp4',
    })
  })

  it('refuses HEIC in both modes, because this sharp build cannot decode it', () => {
    // Measured: sharp 0.35.4's heif input fileSuffix is ['.avif'] and its
    // codec is aom, not HEVC. The schema keeps image/heic faithfully from
    // DATA_MODEL.md; the port is what refuses it.
    expect(ingestDecision({ sniffed: 'image/heic', declared: 'image/heic', mode: 'inline' })).toEqual({
      ok: false,
      error: 'heic-unsupported',
    })
    expect(ingestDecision({ sniffed: 'image/heic', declared: 'image/heic', mode: 'worker' })).toEqual({
      ok: false,
      error: 'heic-unsupported',
    })
  })

  it('refuses bytes it could not identify', () => {
    expect(ingestDecision({ sniffed: 'unknown', declared: 'image/jpeg', mode: 'inline' })).toEqual({
      ok: false,
      error: 'type-not-allowed',
    })
  })

  it('refuses a PNG declared as a JPEG, because the disagreement is itself a signal', () => {
    expect(ingestDecision({ sniffed: 'image/png', declared: 'image/jpeg', mode: 'inline' })).toEqual({
      ok: false,
      error: 'declared-mismatch',
    })
  })
})
```

- [ ] **Step 5: Run it, watch it fail, implement**

Run: `npx vitest run --project unit packages/domain/src/media/ingestPolicy.test.ts`
Expected: FAIL on the unresolved import, then on assertions.

Implement with the refusal order the tests pin, and say in the module header that the order is the assertion: **SVG first, then HEIC, then video-by-mode, then unrecognised, then declared mismatch.** An SVG that came back `'declared-mismatch'` would be technically true and operationally useless — the log line and the admin's error would name the wrong problem.

- [ ] **Step 6: Mutation — remove the SVG rule, name the tests that must fail**

Two mutations, run separately:

1. In `sniff.ts`, delete the SVG text scan so an SVG falls through to `'unknown'`.
   **Must fail:** `names an SVG, which no byte signature announces, from its root element`, `names an SVG that leads with whitespace and a byte-order mark`, `names an SVG wrapped in an XML declaration`.
   `ingestPolicy.test.ts` keeps passing — it is given `sniffed` directly — which is the reason both modules need their own mutation and not one between them.
2. In `ingestPolicy.ts`, move the SVG check below the declared-mismatch check.
   **Must fail:** `rejects an SVG declared as a JPEG as an SVG, not as a mismatch`.

Restore after each. **Paste all four runs** (two broken, two restored).

- [ ] **Step 7: Confirm the 100% gate**

Run: `npm run test:unit` and confirm `packages/domain/src/media/**` reports 100/100/100. `packages/domain/src/**/*.ts` is already inside `vitest.config.ts`'s coverage `include` and its 100% threshold, so **no config change is needed for this task** — verify that by reading the report rather than assuming it, and if `sniff.ts` or `ingestPolicy.ts` is missing from the table, add the directory to the `include` in this commit (`CLAUDE.md` §2.1).

- [ ] **Step 8: Commit**

```
feat(media): sniff the real type and refuse SVG, HEIC and video
```

Body: that the extension and declared type are never trusted (`SECURITY.md`); that SVG is refused because it is an HTML document and one upload is stored XSS with the author's session attached; the measured reason HEIC is refused (sharp's `heif` input is AVIF-only in 0.35.4); and that video is refused by the **port** so that enabling it stays one configuration change (ADR 0004) rather than a schema change.

---

## Task 3: The EXIF reader, and the probe that proves absence

Step 3 of the pipeline order, plus the instrument the exit criterion needs. `SECURITY.md`: "Read EXIF once to capture `capturedAt` and orientation. Then **strip all metadata** before storing or serving."

**Why the reader is hand-written and small.** Two tags are needed and no more, so a dependency would be a parser for hundreds of tags this repository has no use for. **And the reader must not be the same code that strips**, or the absence assertion becomes a library agreeing with itself: `sharp` strips, our own bytes-level probe certifies. That separation is the exit criterion's phrase "verified by reading the stored bytes, not by trusting the library", written as an architecture rather than a wish.

**Files:**

- Create: `packages/domain/src/media/exif.ts`, `packages/domain/src/media/exif.test.ts`
- Modify: `packages/domain/src/testing/factories.ts`, `packages/domain/src/testing/factories.test.ts`

**Interfaces:**

- Consumes: nothing but `Uint8Array`. Deliberately no `Result` — an unreadable EXIF block is not an error, it is a photograph with no EXIF, and the two fields are already optional.
- Produces:
  - `export interface ExifFacts { readonly capturedAt: string | undefined; readonly orientation: number | undefined }`
  - `export const readExifFacts = (bytes: Uint8Array): ExifFacts`
  - `export const METADATA_MARKERS: readonly string[]` — `['exif', 'iptc', 'xmp']`
  - `export const metadataMarkersIn = (bytes: Uint8Array): readonly string[]`
- Produces in `factories.ts`:
  - `export const anExifJpeg = (overrides?: { readonly capturedAt?: string; readonly orientation?: number; readonly canary?: string }): Uint8Array`
  - `export const EXIF_CANARY: string` — the literal `'TRAVEL-DIARY-EXIF-CANARY'`

- [ ] **Step 1: Add the hand-assembled EXIF fixture**

In `packages/domain/src/testing/factories.ts`. It builds a real JPEG structure — SOI, an APP1 segment carrying `Exif\0\0`, a big-endian TIFF header, one IFD0 with `Orientation` (0x0112, SHORT) and `Copyright` (0x8298, ASCII, the canary), an Exif sub-IFD pointer (0x8769) to an IFD holding `DateTimeOriginal` (0x9003, ASCII, 20 bytes) — then EOI. No pixel data: nothing in this task decodes the image, and adding a compressed scan would make the fixture unreadable to a human maintaining it.

```ts
/** The ASCII string the EXIF fixture hides in Copyright, so an absence assertion can look for something specific rather than for a marker. */
export const EXIF_CANARY = 'TRAVEL-DIARY-EXIF-CANARY'

/**
 * A JPEG carrying exactly the EXIF this repository reads and strips.
 *
 * NOT A PHOTOGRAPH: it has no pixel data, because nothing that consumes this
 * fixture decodes the image. `apps/web/lib/adapters/contract/media-fixtures.ts`
 * has the real, `sharp`-encoded one, and Task 6 Step 4 is what proves this
 * hand-built layout agrees with a real encoder rather than with its own reader.
 * @param overrides - `capturedAt` is EXIF's own `YYYY:MM:DD HH:MM:SS` form.
 */
export const anExifJpeg = (
  overrides: { readonly capturedAt?: string; readonly orientation?: number; readonly canary?: string } = {},
): Uint8Array => {
  // ... assembled per the layout described above; see exif.test.ts for what
  // each field must read back as.
}
```

The implementer writes the byte assembly. The plan does not pre-write it because the assertions in Step 2 fully specify it, and a hand-transcribed byte array in a planning document is exactly the kind of snippet that was never run.

- [ ] **Step 2: Write the failing reader and probe tests**

`packages/domain/src/media/exif.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { metadataMarkersIn, readExifFacts } from './exif'
import { aJpegHeader, anExifJpeg, aPngHeader, EXIF_CANARY } from '../testing/factories'

describe('readExifFacts', () => {
  it('reads the capture time as an ISO instant, not as EXIF colons', () => {
    const facts = readExifFacts(anExifJpeg({ capturedAt: '2025:03:14 09:26:53' }))

    expect(facts.capturedAt).toBe('2025-03-14T09:26:53')
  })

  it('reads the orientation tag, which decides whether the photograph is on its side', () => {
    expect(readExifFacts(anExifJpeg({ orientation: 6 })).orientation).toBe(6)
  })

  it('reports both facts as undefined for a JPEG with no EXIF segment at all', () => {
    expect(readExifFacts(aJpegHeader())).toEqual({ capturedAt: undefined, orientation: undefined })
  })

  it('reports both facts as undefined for a PNG, rather than reading a JPEG structure that is not there', () => {
    expect(readExifFacts(aPngHeader())).toEqual({ capturedAt: undefined, orientation: undefined })
  })

  it('reports undefined rather than throwing when the segment is truncated mid-IFD', () => {
    const truncated = anExifJpeg().slice(0, 24)

    expect(readExifFacts(truncated)).toEqual({ capturedAt: undefined, orientation: undefined })
  })

  it('reports undefined for an orientation outside the eight EXIF defines', () => {
    // A value of 0 or 9 is a corrupt tag, and rotating by it would be worse
    // than not rotating.
    expect(readExifFacts(anExifJpeg({ orientation: 9 })).orientation).toBeUndefined()
  })

  it('reports undefined for a capture time EXIF could not have written', () => {
    expect(readExifFacts(anExifJpeg({ capturedAt: 'not a timestamp' })).capturedAt).toBeUndefined()
  })
})

describe('metadataMarkersIn', () => {
  it('finds the exif marker in a file that carries one', () => {
    expect(metadataMarkersIn(anExifJpeg())).toEqual(['exif'])
  })

  it('finds nothing in a JPEG carrying no metadata segment', () => {
    expect(metadataMarkersIn(aJpegHeader())).toEqual([])
  })

  it('finds the xmp marker by its namespace URI, which is plain ASCII in the file', () => {
    const withXmp = new Uint8Array([...aJpegHeader(), ...new TextEncoder().encode('http://ns.adobe.com/xap/1.0/')])

    expect(metadataMarkersIn(withXmp)).toEqual(['xmp'])
  })

  it('finds the iptc marker by the Photoshop resource header that carries it', () => {
    const withIptc = new Uint8Array([...aJpegHeader(), ...new TextEncoder().encode('Photoshop 3.0')])

    expect(metadataMarkersIn(withIptc)).toEqual(['iptc'])
  })

  it('returns the markers sorted, so an assertion reads as a set', () => {
    const both = new Uint8Array([...anExifJpeg(), ...new TextEncoder().encode('Photoshop 3.0')])

    expect(metadataMarkersIn(both)).toEqual(['exif', 'iptc'])
  })

  it('does not find the canary string as a marker, because the canary is not a marker', () => {
    // The probe and the canary are two independent checks. If one silently
    // implied the other, the absence assertion would be one check wearing
    // two hats.
    expect(metadataMarkersIn(new TextEncoder().encode(EXIF_CANARY))).toEqual([])
  })
})
```

- [ ] **Step 3: Run them and watch them fail**

Run: `npx vitest run --project unit packages/domain/src/media/exif.test.ts`
Expected: FAIL — `Failed to resolve import "./exif"`, then thirteen assertion failures once the module is stubbed.

- [ ] **Step 4: Implement**

`readExifFacts`: walk JPEG segments from `0xFFD8`, find the `APP1` whose payload begins `Exif\0\0`, read the TIFF byte order (`II` or `MM`) and the IFD0 offset, walk IFD0 for 0x0112 and 0x8769, follow the sub-IFD for 0x9003. **Every read is bounds-checked and returns the partial facts on any surprise** — the invariant to state at the point it is relied on is that this function is fed attacker-controlled bytes and must never throw, because a throw in the pipeline becomes a 500 on an upload rather than a refusal.

`metadataMarkersIn`: a byte-subsequence search for `Exif\0\0`, `Photoshop 3.0` and `http://ns.adobe.com/xap/1.0/`, returning the sorted subset of `METADATA_MARKERS` found. Deliberately a search over the whole buffer rather than a segment walk: **the probe must not share the reader's structural assumptions**, because a stripper that left a segment somewhere the walk does not visit is precisely the failure the probe is meant to catch.

- [ ] **Step 5: Mutation — break each half separately**

1. In `readExifFacts`, change the orientation validity check from `value >= 1 && value <= 8` to `value >= 0`.
   **Must fail:** `reports undefined for an orientation outside the eight EXIF defines`.
2. In `metadataMarkersIn`, restrict the search to the first 64 bytes.
   **Must fail:** `finds the iptc marker by the Photoshop resource header that carries it` and `returns the markers sorted, so an assertion reads as a set`. This is the mutation that matters: a probe that only looks at the head of the file is a probe that certifies EXIF absent while a segment sits at byte 4,000.

Restore after each. **Paste all four runs.**

- [ ] **Step 6: Commit**

```
feat(media): read the two EXIF tags, and probe for metadata markers
```

Body: that `capturedAt` and orientation are read once before stripping (`SECURITY.md`); why the reader is two tags rather than a dependency; and — the load-bearing sentence — why the probe is a whole-buffer byte search independent of the reader's segment walk, so the exit criterion's "verified by reading the stored bytes, not by trusting the library" is structurally true.

---

## Task 4: The perceptual hash and the duplicate threshold

Step 6 of the pipeline order. Pure: the hash is a function of a small grayscale grid, and `sharp` is what produces the grid.

**Files:**

- Create: `packages/domain/src/media/perceptualHash.ts`, `packages/domain/src/media/perceptualHash.test.ts`

**Interfaces:**

- Consumes: `Result`, `ok`, `err` from `./result`.
- Produces:
  - `export const DHASH_WIDTH = 9`
  - `export const DHASH_HEIGHT = 8`
  - `export const DUPLICATE_MAX_DISTANCE = 5`
  - `export const dHash = (grayscale: readonly number[]): Result<string, string>` — expects exactly `DHASH_WIDTH * DHASH_HEIGHT` samples (72), returns 16 lowercase hex characters
  - `export const hammingDistance = (left: string, right: string): Result<number, string>`
  - `export const isPerceptualDuplicate = (left: string, right: string): boolean`

**Why dHash and not a stored average.** The comparison is between rows in one journey, at ~100 rows, so a linear scan of 64-bit hashes is one query's worth of work and no index is earned (`CLAUDE.md` §4). Recorded as ADR 0022 in Task 13.

- [ ] **Step 1: Write the failing test**

`packages/domain/src/media/perceptualHash.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  DHASH_HEIGHT,
  DHASH_WIDTH,
  DUPLICATE_MAX_DISTANCE,
  dHash,
  hammingDistance,
  isPerceptualDuplicate,
} from './perceptualHash'

/** A 9x8 grid, row-major, built from a function of its coordinates. */
const aGrid = (sample: (x: number, y: number) => number): readonly number[] =>
  Array.from({ length: DHASH_WIDTH * DHASH_HEIGHT }, (_unused, index) =>
    sample(index % DHASH_WIDTH, Math.floor(index / DHASH_WIDTH)),
  )

describe('dHash', () => {
  it('returns sixteen hex characters, which is sixty-four bits', () => {
    const hashed = dHash(aGrid((x) => x * 20))

    expect(hashed).toEqual({ ok: true, value: expect.stringMatching(/^[0-9a-f]{16}$/) })
  })

  it('gives a flat image a hash of all zeroes, because no pixel is brighter than its neighbour', () => {
    expect(dHash(aGrid(() => 128))).toEqual({ ok: true, value: '0'.repeat(16) })
  })

  it('gives the same grid the same hash twice, so a re-upload is detectable', () => {
    const grid = aGrid((x, y) => (x * 13 + y * 29) % 256)

    expect(dHash(grid)).toEqual(dHash(grid))
  })

  it('gives a mirrored image a different hash, because the gradient reverses', () => {
    const rising = dHash(aGrid((x) => x * 20))
    const falling = dHash(aGrid((x) => (DHASH_WIDTH - 1 - x) * 20))

    expect(rising).not.toEqual(falling)
  })

  it('refuses a grid of the wrong size rather than hashing part of it', () => {
    expect(dHash([1, 2, 3]).ok).toBe(false)
  })

  it('refuses an empty grid', () => {
    expect(dHash([]).ok).toBe(false)
  })
})

describe('hammingDistance', () => {
  it('is zero between a hash and itself', () => {
    expect(hammingDistance('0f0f0f0f0f0f0f0f', '0f0f0f0f0f0f0f0f')).toEqual({ ok: true, value: 0 })
  })

  it('counts every differing bit, not every differing character', () => {
    // 0x0 against 0xf is four bits, in one character.
    expect(hammingDistance('0000000000000000', '000000000000000f')).toEqual({ ok: true, value: 4 })
  })

  it('refuses hashes of different lengths rather than comparing a prefix', () => {
    expect(hammingDistance('0f0f', '0f0f0f0f0f0f0f0f').ok).toBe(false)
  })

  it('refuses a hash carrying anything but hex', () => {
    expect(hammingDistance('zzzzzzzzzzzzzzzz', '0000000000000000').ok).toBe(false)
  })
})

describe('isPerceptualDuplicate', () => {
  it('calls a hash a duplicate of itself', () => {
    expect(isPerceptualDuplicate('0f0f0f0f0f0f0f0f', '0f0f0f0f0f0f0f0f')).toBe(true)
  })

  it('accepts a difference exactly at the threshold, so a re-encode still matches', () => {
    // DUPLICATE_MAX_DISTANCE is inclusive. A JPEG re-encoded at a different
    // quality moves a handful of bits and is still the same photograph.
    const left = '0000000000000000'
    const right = '000000000000001f'

    expect(hammingDistance(left, right)).toEqual({ ok: true, value: DUPLICATE_MAX_DISTANCE })
    expect(isPerceptualDuplicate(left, right)).toBe(true)
  })

  it('refuses a difference one bit past the threshold', () => {
    expect(isPerceptualDuplicate('0000000000000000', '000000000000003f')).toBe(false)
  })

  it('is false rather than throwing when either hash is malformed', () => {
    expect(isPerceptualDuplicate('nope', '0000000000000000')).toBe(false)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run --project unit packages/domain/src/media/perceptualHash.test.ts`
Expected: FAIL on the unresolved import, then on assertions. **Check the two threshold cases fail for the right reason** — `0x1f` is five set bits and `0x3f` is six, so if either arithmetic assertion fails after the implementation lands, the fixture is wrong and not the code.

- [ ] **Step 3: Implement**

`dHash`: for each of the 8 rows, compare each of the first 8 columns with its right neighbour, emitting one bit per comparison, most significant first; render as 16 hex characters. State the invariant that `DHASH_WIDTH` is 9 **because** 8 comparisons need 9 samples — the off-by-one that produces a 56-bit hash and a silently weaker comparison.

- [ ] **Step 4: Mutation — make the threshold exclusive**

Change `isPerceptualDuplicate`'s comparison from `distance <= DUPLICATE_MAX_DISTANCE` to `distance < DUPLICATE_MAX_DISTANCE`.
**Must fail:** `accepts a difference exactly at the threshold, so a re-encode still matches`.
Restore, re-run, **paste both**. This is the boundary that decides whether a re-encoded photograph is reported as a duplicate or silently stored twice, so it gets its own case rather than living inside a range.

- [ ] **Step 5: Commit**

```
feat(media): hash a still perceptually and set the duplicate threshold
```

Body: that duplicate detection is scoped to one journey (spec §9.2 step 6, `CLAUDE.md` §7's "key everything by journey id"); why 9 samples per row; why a linear scan over ~100 rows earns no index; and the number `5` with its reason.

---

## Task 5: The `state` field, its reversible migration, and the `isCover` hook

`media` has no `state` field. `processing`/`ready`/`failed` needs one, so it needs a migration — and `DATA_MODEL.md`'s `afterChange` rule ("if `isCover` was set, clear it on the journey's other media") is not built either. Two logical changes, two commits, one task because both touch `apps/web/collections/media.ts`.

**Files:**

- Modify: `apps/web/collections/media.ts`, `apps/web/collections/collections.integration.test.ts`, `apps/web/migrations/index.ts`, `apps/web/payload-types.ts` (regenerated), `docs/data-model.md`
- Create: `apps/web/migrations/<generated>_add_media_state.ts` and its `.json`

**Interfaces:**

- Consumes: `runMigrationDirection(name, direction, payload)`, `getTestPayload()`, `Client` from `pg`, `env.DATABASE_URL`, `aTinyPng()` — all already present in `collections.integration.test.ts`.
- Produces on the collection: `state` (`select`, options `['processing', 'ready', 'failed']`, `defaultValue: 'processing'`, `admin: { readOnly: true }`) and `failureReason` (`text`, `admin: { readOnly: true }`).
- Produces in the test file: `const MEDIA_STATE_MIGRATION: string` (the generated name) and `const mediaStateSchema = async (): Promise<string[]>`, modelled exactly on the existing `sessionExpirySchema`.

- [ ] **Step 1: Write the failing reversibility test first**

In `apps/web/collections/collections.integration.test.ts`, beside the four existing reversibility cases. Assert on **every artefact this migration is responsible for** — the two columns and the enum type Payload's Postgres adapter creates for a `select` — and on the `media` table surviving, because this migration adds to a table it did not create:

```ts
/** The migration that gives a media row a processing state (Phase 3 Task 5). */
const MEDIA_STATE_MIGRATION = '<the generated name>'

/**
 * Which of the artefacts `MEDIA_STATE_MIGRATION` is responsible for exist.
 *
 * The enum type as well as the columns: a `down()` that dropped the columns
 * and left `enum_media_state` behind would satisfy a column-only assertion
 * and then fail its own re-apply with "type already exists" - the failure the
 * hand-fixed statement order in `add_jobs` exists to prevent.
 * @returns The artefacts that exist, sorted, so an assertion reads as a set.
 */
const mediaStateSchema = async (): Promise<string[]> => {
  const client = new Client({ connectionString: env.DATABASE_URL })
  await client.connect()
  try {
    const found = await client.query<{ artefact: string }>(
      `SELECT 'state-column' AS artefact FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'media' AND column_name = 'state'
       UNION ALL
       SELECT 'reason-column' FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'media' AND column_name = 'failure_reason'
       UNION ALL
       SELECT 'state-type' FROM pg_type WHERE typname = 'enum_media_state'
       UNION ALL
       SELECT 'media-table' FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'media'`,
    )
    return found.rows.map((row) => row.artefact).sort()
  } finally {
    await client.end()
  }
}

/** Every artefact `mediaStateSchema` looks for, when the migration is applied. */
const MEDIA_STATE_SCHEMA = ['media-table', 'reason-column', 'state-column', 'state-type']
```

and the case itself:

```ts
it('rolls the media state column and its enum type down and back up, with the table and its rows intact', async () => {
  const payload = await getTestPayload()
  const png = await aTinyPng()
  const existing = await payload.create({
    collection: 'media',
    data: { alt: FIXTURE_MEDIA_STATE_ALT },
    file: { data: png, mimetype: 'image/png', name: 'state-reversibility.png', size: png.length },
  })

  expect(await mediaStateSchema()).toEqual(MEDIA_STATE_SCHEMA)

  try {
    await runMigrationDirection(MEDIA_STATE_MIGRATION, 'down', payload)

    // The columns and the type are gone; the table and the row are not. A
    // down() that took `media` with it would be a much worse kind of
    // reversible - every photograph in the diary.
    expect(await mediaStateSchema()).toEqual(['media-table'])
  } finally {
    await runMigrationDirection(MEDIA_STATE_MIGRATION, 'up', payload)
  }

  expect(await mediaStateSchema()).toEqual(MEDIA_STATE_SCHEMA)
  const survived = await payload.findByID({ collection: 'media', id: existing.id, depth: 0, select: { alt: true } })
  expect(survived.alt).toBe(FIXTURE_MEDIA_STATE_ALT)
})
```

`FIXTURE_MEDIA_STATE_ALT` is a new module-level constant beside the existing `FIXTURE_MEDIA_ALTS`, added in this step and removed by that file's `afterAll` the same way — **read how `FIXTURE_MEDIA_ALTS` is cleaned up and extend it rather than adding a second cleanup path.**

- [ ] **Step 2: Run it and watch it fail**

Run: `npm run test:integration -- apps/web/collections/collections.integration.test.ts` (needs the Docker Postgres up).
Expected: FAIL on the first `expect(await mediaStateSchema()).toEqual(MEDIA_STATE_SCHEMA)` — the columns and the enum type do not exist, so the probe returns `['media-table']`.

- [ ] **Step 3: Add the fields and generate the migration**

Add to `apps/web/collections/media.ts`'s `fields`, immediately after `kind` (the pipeline's other write-only field):

```ts
    // Set by the MediaProcessor pipeline, never by the author. `processing` is
    // a first-class UI state, not a missing image (spec §9.2): the Media
    // screen shows progress against it, and the Galleries poster filmstrip
    // needs a processed clip.
    {
      name: 'state',
      type: 'select',
      options: ['processing', 'ready', 'failed'],
      defaultValue: 'processing',
      admin: { readOnly: true },
    },
    // Why a `failed` row failed, in words the Media screen shows. Never a
    // stack trace and never a storage key.
    { name: 'failureReason', type: 'text', admin: { readOnly: true } },
```

Then: `npm run db:migrate:create -w apps/web -- add_media_state`.

**Four hand-fixes this generator always needs**, each already documented in the existing migrations:

1. `import type { MigrateDownArgs, MigrateUpArgs }` — Payload emits it without `type`, and Node's type-stripping cannot infer it, so the file fails to load under the Payload CLI.
2. Underscore-prefix the unused `payload`/`req` parameters for `noUnusedParameters`.
3. **Split any `ADD COLUMN ... NOT NULL` into add-nullable, backfill, `SET NOT NULL`** — a generated single statement succeeds only against an empty table, and `down()`-then-`up()` is exactly what the test above does. Check what the generator actually emitted rather than assuming.
4. **Order `down()` so the enum type is dropped after the column that uses it**, or the re-apply fails with "type already exists".

Add the entry to `apps/web/migrations/index.ts` in the same commit (`apps/web/lib/migrationsIndex.test.ts` fails if it is missing). Regenerate types with `npm run payload -w apps/web -- generate:types` and commit `apps/web/payload-types.ts` alongside the schema it describes.

- [ ] **Step 4: Run the test again, watch it pass, then mutate**

Replace the migration's `down()` body with a comment and nothing else.
**Must fail:** `rolls the media state column and its enum type down and back up, with the table and its rows intact` — at `expect(await mediaStateSchema()).toEqual(['media-table'])`, because every artefact is still there.
Restore. Re-run. **Paste both.**

If the re-apply legitimately collides after a deliberate `down()` mutation, repair by hand exactly as `docs/testing.md` §9 records for `sign_in_attempts`: drop the two columns and `enum_media_state`, then let the next run apply `up()` again.

- [ ] **Step 5: Commit**

```
feat(db): give a media row a processing state and a failure reason
```

Body: that `processing` is a UI state rather than a missing image (spec §9.2); that a row is `processing` by default so a crashed upload is visible rather than invisible; and the generator hand-fixes, with the enum drop order named as the one that breaks the re-apply.

- [ ] **Step 6: Write the failing `isCover` test**

`DATA_MODEL.md`: "`afterChange`: if `isCover` was set, clear it on the journey's other media." In `collections.integration.test.ts`:

```ts
it('clears isCover on the journeys other media when a new cover is set', async () => {
  const payload = await getTestPayload()
  const journey = await payload.create({ collection: 'journeys', data: aCoverFixtureJourney() })
  const first = await createFixtureMedia({ journey: journey.id, isCover: true })
  const second = await createFixtureMedia({ journey: journey.id, isCover: false })

  await payload.update({ collection: 'media', id: second.id, data: { isCover: true } })

  const reread = await payload.findByID({ collection: 'media', id: first.id, depth: 0, select: { isCover: true } })
  expect(reread.isCover).toBe(false)
})

it('leaves another journeys cover alone, because a cover belongs to one journey', async () => {
  // CLAUDE.md section 7: key everything by journey id. A hook that cleared
  // every isCover in the collection would be the sixth defect of the family
  // the handoff already records five of.
  const payload = await getTestPayload()
  const mine = await payload.create({ collection: 'journeys', data: aCoverFixtureJourney() })
  const theirs = await payload.create({ collection: 'journeys', data: aCoverFixtureJourney() })
  const theirCover = await createFixtureMedia({ journey: theirs.id, isCover: true })
  const myNewCover = await createFixtureMedia({ journey: mine.id, isCover: false })

  await payload.update({ collection: 'media', id: myNewCover.id, data: { isCover: true } })

  const reread = await payload.findByID({
    collection: 'media',
    id: theirCover.id,
    depth: 0,
    select: { isCover: true },
  })
  expect(reread.isCover).toBe(true)
})

it('settles rather than recursing when the hook clears a sibling', async () => {
  // An afterChange that updates siblings fires afterChange for each sibling.
  // Without the isCover-equals-true clause in the where, this is unbounded.
  const payload = await getTestPayload()
  const journey = await payload.create({ collection: 'journeys', data: aCoverFixtureJourney() })
  await createFixtureMedia({ journey: journey.id, isCover: true })
  const next = await createFixtureMedia({ journey: journey.id, isCover: false })

  await expect(payload.update({ collection: 'media', id: next.id, data: { isCover: true } })).resolves.toBeDefined()
})
```

Two new helpers in that same file, **defined in this step so no snippet above uses an undefined identifier**:

- `const aCoverFixtureJourney = (overrides: Partial<{ readonly slug: string }> = {}) => ...` — a factory over the shape `aReversibilityJourney()` already returns, with a distinct slug prefix registered in that file's fixture-cleanup list so `afterAll` removes it. **Read how `FIXTURE_SLUGS` is cleaned up and extend it; do not add a second cleanup path.**
- `const createFixtureMedia = async (input: { readonly journey: number | string; readonly isCover: boolean }) => ...` — wraps `payload.create({ collection: 'media', data: { journey: input.journey, isCover: input.isCover, alt: FIXTURE_MEDIA_STATE_ALT }, file: { data: await aTinyPng(), mimetype: 'image/png', name: ..., size: ... } })`, with a per-call unique filename so parallel workers cannot collide.

- [ ] **Step 7: Run, watch fail, implement**

Expected first failure: `reread.isCover` is `true`, because no hook exists.

Implement `afterChange` on `Media`: return the doc unchanged unless `doc.isCover === true`; then one `payload.update` with

```
where: { and: [
  { journey: { equals: <the doc's journey id> } },
  { id: { not_equals: doc.id } },
  { isCover: { equals: true } },
] }
```

`data: { isCover: false }`, and `req` threaded through so it runs inside the same transaction. The `isCover: { equals: true }` clause is what bounds the recursion **and** keeps it one query rather than one per sibling (`CLAUDE.md` §6, no N+1). The journey value has to be read defensively: with `depth` above 0 Payload hands back a populated object rather than an id, so narrow it rather than casting.

- [ ] **Step 8: Mutation — drop the journey clause**

Remove `{ journey: { equals: ... } }` from the `where`.
**Must fail:** `leaves another journeys cover alone, because a cover belongs to one journey`. The first case keeps passing, which is exactly why the second one exists.
Restore, re-run, **paste both**.

- [ ] **Step 9: Commit**

```
fix(media): clear isCover only on the same journeys other media
```

Body: that `DATA_MODEL.md` requires the hook and it was never built; that the journey clause is `CLAUDE.md` §7's rule rather than an optimisation; and that the `isCover: { equals: true }` clause both bounds the recursion and keeps it a single query.

---

## Task 6: The `MediaProcessor` port, one shared still pipeline, and both adapters

**OWNS EXIT CRITERION 4: both `MediaProcessor` adapters pass the same contract suite in CI.** ADR 0004 calls that non-negotiable, and gives the reason: "A deferred code path with no test rots invisibly, and 'flip one config' silently becomes 'flip one config, then debug for three days'."

**The structural decision that makes the criterion honest.** The suite proves both adapters behave the same on stills; a shared module makes that true by construction rather than by two implementations happening to agree. `apps/web/lib/media/stillPipeline.ts` holds steps 1 to 6 **once**, and both adapters compose it. The `worker` adapter adds step 7 and nothing else. If a reviewer wants to know whether the two still pipelines are the same, the answer is that there is one.

**Files:**

- Create: `apps/web/lib/ports/mediaProcessor.ts`
- Create: `apps/web/lib/media/stillPipeline.ts`
- Create: `apps/web/lib/media/clipToolchain.ts`
- Create: `apps/web/lib/adapters/inline-media-processor.ts`, `apps/web/lib/adapters/inline-media-processor.integration.test.ts`
- Create: `apps/web/lib/adapters/worker-media-processor.ts`, `apps/web/lib/adapters/worker-media-processor.integration.test.ts`
- Create: `apps/web/lib/adapters/contract/media-processor-contract.ts`
- Create: `apps/web/lib/adapters/contract/media-fixtures.ts`
- Create: `apps/web/lib/media/services.ts`
- Modify: `vitest.config.ts`, `vitest.integration.config.ts` (coverage `include` and thresholds for the new files), `.github/workflows/ci.yml` (the `ffmpeg` step), `docs/testing.md`

**Interfaces:**

- Consumes: `sniffMediaType`, `SniffedType` (`@travel-diary/domain/media/sniff`); `ingestDecision`, `acceptedIngestTypes`, `AcceptedType`, `IngestRefusal`, `PipelineMode` (`@travel-diary/domain/media/ingestPolicy`); `readExifFacts`, `metadataMarkersIn` (`@travel-diary/domain/media/exif`); `dHash`, `DHASH_WIDTH`, `DHASH_HEIGHT` (`@travel-diary/domain/media/perceptualHash`); `Result`, `ok`, `err` (`@travel-diary/domain/result`); `env` (`../env`); `sharp`. Every one of those is either already in the tree or created by Tasks 1 to 4.
- Produces in `mediaProcessor.ts`:

```ts
/** What a browser handed us, before anything has been believed about it. */
export interface UploadedBytes {
  readonly bytes: Uint8Array
  /** What the client called it. Used only to refuse a disagreement. */
  readonly declaredType: string
  /** What the client called the file. Never used to decide a type. */
  readonly filename: string
}

/** A still, re-encoded and stripped, ready for Payload to derive tiers from. */
export interface ProcessedStill {
  readonly kind: 'still'
  readonly bytes: Uint8Array
  readonly contentType: 'image/jpeg'
  readonly filename: string
  readonly capturedAt: string | undefined
  readonly contentHash: string
  readonly width: number
  readonly height: number
}

/** A clip, transcoded, with the poster frame step 7 extracted. */
export interface ProcessedClip {
  readonly kind: 'clip'
  readonly bytes: Uint8Array
  readonly contentType: 'video/mp4'
  readonly filename: string
  readonly capturedAt: string | undefined
  readonly contentHash: string
  readonly durationSec: number
  readonly poster: ProcessedStill
}

export type Processed = ProcessedStill | ProcessedClip

/** Every way processing can refuse. The policy's refusals, plus unreadable bytes. */
export type ProcessingRefusal = IngestRefusal | 'unreadable'

/** Fronts wherever the upload pipeline actually runs. */
export interface MediaProcessor {
  /**
   * The types this processor will accept, which is what the flag switches.
   * Read by ingest and by the admin's upload picker, so the three things
   * ADR 0004 says move together have one source.
   */
  readonly acceptedTypes: readonly AcceptedType[]
  /**
   * Sniffs, refuses, strips, re-encodes and hashes `upload`.
   * @returns `ok` with the processed result, or `err` naming the refusal.
   *   Never throws: the bytes are attacker-controlled.
   */
  process(upload: UploadedBytes): Promise<Result<Processed, ProcessingRefusal>>
}
```

- Produces elsewhere: `createInlineMediaProcessor(): MediaProcessor`; `createWorkerMediaProcessor(options?: { readonly toolchain?: ClipToolchain }): MediaProcessor`; `runStillPipeline(upload: UploadedBytes, options: { readonly mode: PipelineMode }): Promise<Result<ProcessedStill, ProcessingRefusal>>`; `ClipToolchain` and `createFfmpegToolchain(paths: { readonly ffmpegPath: string; readonly ffprobePath: string }): ClipToolchain`; `mediaProcessorContract(name, makeAdapter, expectation)`; `mediaProcessor(): MediaProcessor` in `services.ts`.

- [ ] **Step 1: Write the fixture module, and its own positive-control test**

`apps/web/lib/adapters/contract/media-fixtures.ts`. **Factories, overridable defaults, no shared mutable state** (`CLAUDE.md` §2.3). These are real `sharp`-encoded photographs, not hand-built headers, because the contract suite is what proves the pipeline works on files a camera could produce:

```ts
/**
 * media-fixtures — factories for the MediaProcessor contract suite.
 *
 * REAL FILES, PRODUCED BY A REAL ENCODER, and that is the point rather than
 * convenience. `packages/domain/src/testing/factories.ts`'s `anExifJpeg()` is
 * hand-assembled bytes, which is right for unit-testing a parser and wrong
 * here: a hand-built fixture read by a hand-built parser proves only that the
 * two authors agreed. `aPhotographWithExif()` asks `sharp` to write the EXIF,
 * so the fixture's layout is a real encoder's and the parser is checked
 * against it (see this suite's `readExifFacts` case).
 *
 * EVERY ABSENCE ASSERTION IN THIS PHASE IS PAIRED WITH A POSITIVE CONTROL over
 * one of these factories. A fixture that never carried EXIF would satisfy
 * "EXIF is absent" while proving nothing, which is the shape of defect two
 * Phase 2 blockers had (fixtures sending a request no browser produces).
 * Depends on: sharp, and the domain's EXIF probe for the controls.
 */
import sharp from 'sharp'

// EXIF_CANARY IS NOT REDECLARED HERE. Task 3 Step 1 defines it in
// `packages/domain/src/testing/factories.ts`, and this module re-exports it so
// the domain's unit fixture and this adapter fixture cannot drift to two
// different strings - which they would, silently, since every absence
// assertion would still pass against whichever one it was given.
export { EXIF_CANARY } from '@travel-diary/domain/testing/factories'

/** The capture time the EXIF fixtures write, in EXIF's own colon form. */
export const FIXTURE_CAPTURED_AT_EXIF = '2025:03:14 09:26:53'

/** The same instant, as `readExifFacts` returns it. */
export const FIXTURE_CAPTURED_AT_ISO = '2025-03-14T09:26:53'

/**
 * Raw RGB pixels with real structure in them, as a function of coordinate and
 * `seed`.
 *
 * IT MATTERS THAT IT IS NOT FLAT: `dHash` compares each pixel with its right
 * neighbour, so a solid-colour photograph hashes to all zeroes - and the
 * duplicate cases would then be comparing two identical constants rather than
 * two photographs. `perceptualHash.test.ts`'s own flat-image case asserts
 * exactly that all-zeroes behaviour, which is what makes this a fixture
 * requirement rather than a preference.
 * @param seed - Changes the pattern. Two photographs with different seeds must
 *   be far enough apart to sit outside `DUPLICATE_MAX_DISTANCE`, which the
 *   contract suite's negative duplicate case is what checks.
 */
const rawGradient = (width: number, height: number, seed: number): Buffer => {
  const pixels = Buffer.alloc(width * height * 3)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const at = (y * width + x) * 3
      pixels[at] = (x * 3 + seed) % 256
      pixels[at + 1] = (y * 5 + seed * 7) % 256
      pixels[at + 2] = ((x + y) * 2 + seed * 13) % 256
    }
  }
  return pixels
}

/** The seed {@link aPhotograph} and {@link aPhotographWithExif} both use. */
const FIXTURE_SEED = 11

/** A seed far enough from {@link FIXTURE_SEED} to hash outside the duplicate threshold. */
const DIFFERENT_FIXTURE_SEED = 197

/**
 * A JPEG photograph carrying GPS coordinates, a capture time, an orientation
 * and the ASCII canary.
 *
 * The GPS tags are the reason this fixture exists: SECURITY.md's objection is
 * that "Shoot anything at home and you have published your home address".
 * @param overrides - `width`/`height` default to 1200x900, large enough that
 *   Payload can derive `thumb`, `grid` and `tile` from it; `orientation`
 *   defaults to 6, which is a photograph on its side.
 */
export const aPhotographWithExif = async (
  overrides: { readonly width?: number; readonly height?: number; readonly orientation?: number } = {},
): Promise<Uint8Array> => {
  const width = overrides.width ?? 1200
  const height = overrides.height ?? 900
  const buffer = await sharp(rawGradient(width, height, FIXTURE_SEED), { raw: { width, height, channels: 3 } })
    .withExif({
      IFD0: { Copyright: EXIF_CANARY, Orientation: String(overrides.orientation ?? 6) },
      IFD2: { DateTimeOriginal: FIXTURE_CAPTURED_AT_EXIF },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '51/1 30/1 26/1', GPSLongitudeRef: 'W', GPSLongitude: '0/1 7/1 39/1' },
    })
    .jpeg({ quality: 92 })
    .toBuffer()
  return new Uint8Array(buffer)
}

/**
 * A photograph with no metadata at all, for the cases that need a clean input.
 * @param overrides - as {@link aPhotographWithExif}.
 */
export const aPhotograph = async (
  overrides: { readonly width?: number; readonly height?: number } = {},
): Promise<Uint8Array> => {
  const width = overrides.width ?? 1200
  const height = overrides.height ?? 900
  const buffer = await sharp(rawGradient(width, height, FIXTURE_SEED), { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 92 })
    .toBuffer()
  return new Uint8Array(buffer)
}

/**
 * The same pixels as {@link aPhotograph}, re-encoded at a lower quality - the
 * case perceptual hashing exists for, since the bytes differ and the
 * photograph does not.
 */
export const aReencodedPhotograph = async (): Promise<Uint8Array> => {
  const buffer = await sharp(Buffer.from(await aPhotograph()))
    .jpeg({ quality: 55 })
    .toBuffer()
  return new Uint8Array(buffer)
}

/** A visibly different photograph, so the duplicate assertion has a negative case. */
export const aDifferentPhotograph = async (): Promise<Uint8Array> => {
  const buffer = await sharp(rawGradient(1200, 900, DIFFERENT_FIXTURE_SEED), {
    raw: { width: 1200, height: 900, channels: 3 },
  })
    .jpeg({ quality: 92 })
    .toBuffer()
  return new Uint8Array(buffer)
}

/**
 * A clip for the mode case. Real MP4 where `ffmpeg` exists, an `ftyp` header
 * otherwise - see Step 5, which is also where the header records which of the
 * two this machine produced.
 */
export const aClip = async (): Promise<Uint8Array> => {
  // Step 5's two options, chosen on `clipToolchainAvailable()`, with the
  // choice recorded in this module's header.
}
```

**`withExif`'s IFD numbering is an assumption, and Step 2's positive control is what checks it.** libvips maps `IFD0` to the main image directory, `IFD2` to the Exif sub-IFD and `IFD3` to GPS — if that is wrong in this `sharp` build, the positive control fails FIRST and names the problem, before any absence assertion can pass vacuously. That ordering is deliberate: **write the positive control before the fixture is trusted anywhere else.**

- [ ] **Step 2: Write the fixture's own positive control, and run it**

In `apps/web/lib/adapters/contract/media-fixtures.integration.test.ts`:

```ts
it('carries the exif marker, the canary and the coordinates, so an absence assertion is not vacuous', async () => {
  const bytes = await aPhotographWithExif()

  expect(metadataMarkersIn(bytes)).toContain('exif')
  expect(Buffer.from(bytes).includes(EXIF_CANARY)).toBe(true)
  expect(Buffer.from(bytes).includes('GPSLatitude') || (await sharp(bytes).metadata()).exif !== undefined).toBe(true)
})

it('is read correctly by the domains own EXIF reader, which is what proves the hand-built unit fixture', async () => {
  // A hand-assembled fixture agreeing with a hand-written parser proves only
  // that one author was consistent. This is the case that checks the parser
  // against a real encoder.
  const facts = readExifFacts(await aPhotographWithExif({ orientation: 6 }))

  expect(facts).toEqual({ capturedAt: FIXTURE_CAPTURED_AT_ISO, orientation: 6 })
})
```

Run: `npm run test:integration -- apps/web/lib/adapters/contract/media-fixtures.integration.test.ts`
Expected: FAIL first on the unresolved imports; then, once the fixture module exists, **both cases must pass before Step 3 begins**. If the second fails, `withExif`'s IFD mapping is not what this plan assumed — fix the fixture, not the reader, and record the real mapping in the fixture module's header.

It is an `*.integration.test.ts` rather than a unit test because it calls `sharp`, which is native and does real I/O-shaped work; the unit project is Docker-free and pure by design.

- [ ] **Step 3: Write the ONE shared contract suite, failing**

`apps/web/lib/adapters/contract/media-processor-contract.ts`, header and signature:

```ts
/**
 * media-processor-contract — the MediaProcessor contract suite (Ports &
 * Adapters). Written once, run against `inline` and against `worker`.
 *
 * ADR 0004 makes running it against BOTH non-negotiable, even though only
 * `inline` ever deploys before video is turned on. The still cases below need
 * no `ffmpeg` and are the ones the phase's exit criterion names; the clip case
 * is parameterised on `expectation.mode`, because whether video is accepted IS
 * what the flag switches - so one suite asserts both sides of it rather than
 * two suites drifting apart.
 * Depends on: vitest, the MediaProcessor port, ./media-fixtures, and the
 * domain's EXIF probe, SVG factory and duplicate predicate.
 */
import { describe, expect, it } from 'vitest'
import { metadataMarkersIn } from '@travel-diary/domain/media/exif'
import type { PipelineMode } from '@travel-diary/domain/media/ingestPolicy'
import { isPerceptualDuplicate } from '@travel-diary/domain/media/perceptualHash'
import { anSvgDocument } from '@travel-diary/domain/testing/factories'
import type { MediaProcessor } from '../../ports/mediaProcessor'
import {
  aClip,
  aDifferentPhotograph,
  aPhotograph,
  aPhotographWithExif,
  aReencodedPhotograph,
  EXIF_CANARY,
  FIXTURE_CAPTURED_AT_ISO,
} from './media-fixtures'

/**
 * Registers the shared MediaProcessor contract as a `describe` block.
 * @param name - Which adapter is under test, in the suite's title.
 * @param makeAdapter - Builds a fresh processor for one test.
 * @param expectation - `mode` says which side of the video switch this
 *   adapter is on. An options object rather than a bare string, so the call
 *   site says what the value means (CLAUDE.md §3.2).
 */
export const mediaProcessorContract = (
  name: string,
  makeAdapter: () => Promise<MediaProcessor>,
  expectation: { readonly mode: PipelineMode },
): void => {
  describe(`MediaProcessor contract: ${name}`, () => {
    /* THE ELEVEN CASES ARE LISTED IN FULL IMMEDIATELY BELOW THIS SNIPPET;
     * they go here verbatim. */
  })
}
```

The eleven cases, in full:

```ts
it('reports the accepted types its mode allows, which is what the admin picker reads', async () => {
  const processor = await makeAdapter()

  expect(processor.acceptedTypes).toEqual(
    expectation.mode === 'inline'
      ? ['image/jpeg', 'image/png']
      : ['image/jpeg', 'image/png', 'video/mp4', 'video/quicktime'],
  )
})

it('returns a still for a photograph, with the capture time read off its EXIF', async () => {
  const processor = await makeAdapter()

  const processed = await processor.process({
    bytes: await aPhotographWithExif(),
    declaredType: 'image/jpeg',
    filename: 'tokyo.jpg',
  })

  expect(processed.ok).toBe(true)
  expect(processed.ok ? processed.value.kind : null).toBe('still')
  expect(processed.ok ? processed.value.capturedAt : null).toBe(FIXTURE_CAPTURED_AT_ISO)
})

it('leaves no metadata marker in the bytes it returns, having first proven the input had one', async () => {
  const processor = await makeAdapter()
  const input = await aPhotographWithExif()

  // POSITIVE CONTROL, in this test rather than a neighbouring one: an
  // absence assertion over a fixture with nothing to remove is a test that
  // can never fail.
  expect(metadataMarkersIn(input)).toContain('exif')
  expect(Buffer.from(input).includes(EXIF_CANARY)).toBe(true)

  const processed = await processor.process({ bytes: input, declaredType: 'image/jpeg', filename: 'home.jpg' })
  const out = processed.ok ? Buffer.from(processed.value.bytes) : Buffer.alloc(0)

  expect(metadataMarkersIn(new Uint8Array(out))).toEqual([])
  expect(out.includes(EXIF_CANARY)).toBe(false)
})

it('applies the orientation it read, so a photograph on its side comes back upright', async () => {
  // Orientation 6 means rotate 90 degrees, so a 1200x900 input comes back
  // 900x1200 - and with the tag gone, so nothing rotates it a second time.
  const processor = await makeAdapter()

  const processed = await processor.process({
    bytes: await aPhotographWithExif({ width: 1200, height: 900, orientation: 6 }),
    declaredType: 'image/jpeg',
    filename: 'sideways.jpg',
  })

  expect(processed.ok ? { w: processed.value.width, h: processed.value.height } : null).toEqual({
    w: 900,
    h: 1200,
  })
})

it('refuses an SVG declared as a JPEG, because an SVG is an HTML document', async () => {
  const processor = await makeAdapter()

  const processed = await processor.process({
    bytes: anSvgDocument(),
    declaredType: 'image/jpeg',
    filename: 'innocent.jpg',
  })

  expect(processed).toEqual({ ok: false, error: 'svg-rejected' })
})

it('refuses bytes it cannot identify rather than handing them to sharp', async () => {
  const processor = await makeAdapter()

  const processed = await processor.process({
    bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]),
    declaredType: 'image/jpeg',
    filename: 'photos.zip',
  })

  expect(processed).toEqual({ ok: false, error: 'type-not-allowed' })
})

it('refuses a truncated JPEG as unreadable rather than throwing', async () => {
  const processor = await makeAdapter()
  const whole = await aPhotograph()

  const processed = await processor.process({
    bytes: whole.slice(0, 64),
    declaredType: 'image/jpeg',
    filename: 'cut-short.jpg',
  })

  expect(processed).toEqual({ ok: false, error: 'unreadable' })
})

it('gives the same photograph the same content hash twice', async () => {
  const processor = await makeAdapter()
  const bytes = await aPhotograph()

  const first = await processor.process({ bytes, declaredType: 'image/jpeg', filename: 'a.jpg' })
  const second = await processor.process({ bytes, declaredType: 'image/jpeg', filename: 'b.jpg' })

  expect(first.ok && second.ok ? first.value.contentHash === second.value.contentHash : false).toBe(true)
})

it('gives a re-encoded copy a hash within the duplicate threshold', async () => {
  const processor = await makeAdapter()

  const original = await processor.process({
    bytes: await aPhotograph(),
    declaredType: 'image/jpeg',
    filename: 'a.jpg',
  })
  const reencoded = await processor.process({
    bytes: await aReencodedPhotograph(),
    declaredType: 'image/jpeg',
    filename: 'a-again.jpg',
  })

  const both = original.ok && reencoded.ok
  expect(both ? isPerceptualDuplicate(original.value.contentHash, reencoded.value.contentHash) : false).toBe(true)
})

it('gives a different photograph a hash outside the duplicate threshold', async () => {
  const processor = await makeAdapter()

  const one = await processor.process({
    bytes: await aPhotograph(),
    declaredType: 'image/jpeg',
    filename: 'a.jpg',
  })
  const other = await processor.process({
    bytes: await aDifferentPhotograph(),
    declaredType: 'image/jpeg',
    filename: 'b.jpg',
  })

  const both = one.ok && other.ok
  expect(both ? isPerceptualDuplicate(one.value.contentHash, other.value.contentHash) : true).toBe(false)
})

it('handles video the way its own mode says it should, which is the whole config switch', async () => {
  const processor = await makeAdapter()

  const processed = await processor.process({
    bytes: await aClip(),
    declaredType: 'video/mp4',
    filename: 'harbour.mp4',
  })

  if (expectation.mode === 'inline') {
    // ADR 0004: refused by the PORT, with the schema untouched, so
    // enabling clips stays one configuration change.
    expect(processed).toEqual({ ok: false, error: 'video-deferred' })
    return
  }

  expect(processed.ok ? processed.value.kind : null).toBe('clip')
  const clip = processed.ok && processed.value.kind === 'clip' ? processed.value : null
  expect(clip === null ? 0 : clip.durationSec).toBeGreaterThan(0)
  expect(clip === null ? null : clip.poster.kind).toBe('still')
})
```

- [ ] **Step 4: Wire the suite to both adapters and watch it fail**

`apps/web/lib/adapters/inline-media-processor.integration.test.ts`:

```ts
import { createInlineMediaProcessor } from './inline-media-processor'
import { mediaProcessorContract } from './contract/media-processor-contract'

mediaProcessorContract('inline', () => Promise.resolve(createInlineMediaProcessor()), { mode: 'inline' })
```

`apps/web/lib/adapters/worker-media-processor.integration.test.ts`:

```ts
import { clipToolchainForTests } from '../media/clipToolchain'
import { mediaProcessorContract } from './contract/media-processor-contract'
import { createWorkerMediaProcessor } from './worker-media-processor'

// ADR 0004's non-negotiable: the same suite, against the adapter nothing
// deploys. Its still cases need no ffmpeg at all - they are `stillPipeline`,
// which both adapters compose - so this half of the exit criterion is green
// with or without the binaries. Only the clip case needs them; Step 5 says
// what happens when they are missing, and why that is a failure in CI rather
// than a skip.
mediaProcessorContract(
  'worker',
  () => Promise.resolve(createWorkerMediaProcessor({ toolchain: clipToolchainForTests() })),
  { mode: 'worker' },
)
```

Run: `npm run test:integration -- apps/web/lib/adapters/inline-media-processor.integration.test.ts apps/web/lib/adapters/worker-media-processor.integration.test.ts`
Expected: FAIL on the unresolved imports, then twenty-two assertion failures — eleven per adapter — once the modules are stubbed.

- [ ] **Step 5: Resolve the clip toolchain honestly, before implementing**

`apps/web/lib/media/clipToolchain.ts`:

```ts
/** The three things step 7 of the pipeline needs from ffmpeg. */
export interface ClipToolchain {
  probe(bytes: Uint8Array): Promise<Result<{ readonly durationSec: number }, string>>
  transcode(bytes: Uint8Array): Promise<Result<Uint8Array, string>>
  poster(bytes: Uint8Array, atSeconds: number): Promise<Result<Uint8Array, string>>
}

/** A toolchain that shells out to real binaries, via temp files under os.tmpdir(). */
export const createFfmpegToolchain = (paths: {
  readonly ffmpegPath: string
  readonly ffprobePath: string
}): ClipToolchain => {
  // `node:child_process` spawn, with the bytes written to and read back from
  // temp files under `os.tmpdir()` - `ffmpeg` needs a seekable input for MP4.
}

/**
 * Reports whether both binaries are on this machine.
 * @returns `true` when `ffmpeg` and `ffprobe` both answer `-version`.
 */
export const clipToolchainAvailable = async (): Promise<boolean> => {
  // Spawn each with `-version` and report whether both exited 0.
}

/** The toolchain the contract suite uses. See the module header for the three cases. */
export const clipToolchainForTests = (): ClipToolchain => {
  // The three cases in this module's header, in that order.
}
```

The module header states the rule, because a reader will otherwise assume a mock:

- `CLAUDE.md` §2.3 forbids mocking what we own. A subprocess to an external binary is the **process boundary**, which §2.3 names as mockable — so a stand-in here is legitimate where a stand-in for `stillPipeline` would not be.
- But a stand-in **alone** is exactly the rot ADR 0004 describes: it would pass forever with `ffmpeg` broken.
- So which one is used is never a silent decision:
  - `ffmpeg` present: the real toolchain, exercising the real binaries.
  - absent, with `MEDIA_REQUIRE_CLIP_TOOLCHAIN=1` set: **throws**, naming the binary. CI sets that variable, so a runner without `ffmpeg` fails the build rather than quietly testing less.
  - absent, without it: the recorded stand-in, and the suite **prints** that it is using it and that the real path is UNRESOLVED on this machine (`CLAUDE.md` §7.1). Nothing is sent anywhere to be checked.

Add to `.github/workflows/ci.yml`'s `verify` job, before `npm ci`, with a comment saying why it is explicit rather than trusted to the runner image:

```yaml
# ffmpeg/ffprobe for the worker MediaProcessor's clip cases (ADR 0004:
# both adapters are tested from day one). Installed explicitly rather
# than relied on from the runner image, and MEDIA_REQUIRE_CLIP_TOOLCHAIN
# turns a missing binary into a failure instead of a quieter test run.
- run: sudo apt-get update && sudo apt-get install -y ffmpeg
```

and `MEDIA_REQUIRE_CLIP_TOOLCHAIN: '1'` to that job's `env` block.

**`aClip()`'s fixture has the same honesty problem, and the same answer.** A real MP4 cannot be produced without an encoder. Two options, in order:

1. **If `ffmpeg` is available:** generate the fixture at test time — `ffmpeg -f lavfi -i testsrc=size=320x240:rate=15 -t 1 -c:v libx264 -pix_fmt yuv420p out.mp4` into a temp file. Generated, never committed, so no binary blob enters the repository.
2. **If it is not:** `aClip()` returns `anIsoBmffHeader({ brand: 'isom' })` — enough for the sniff, and therefore enough for the **inline** side of the mode case, which is the side the exit criterion names. The worker side then runs against the stand-in toolchain and prints its UNRESOLVED notice.

The fixture's own header must record which of the two it produced, and why. **Neither option sends anything anywhere:** no sample video is downloaded and no bytes are uploaded to be transcoded. The tool that settles option 1 is `ffmpeg`, which is not installed here — so **option 2 is what this machine gets, and the plan says so rather than pretending otherwise.**

- [ ] **Step 6: Implement the shared still pipeline**

`apps/web/lib/media/stillPipeline.ts`, in the spec's order, with the order named in the header as load-bearing:

1. `sniffMediaType(upload.bytes)`.
2. `ingestDecision({ sniffed, declared: upload.declaredType, mode })` — where SVG, HEIC and (under `inline`) video are refused. **Nothing has reached `sharp` yet**, and that is the point: this `sharp` build renders SVG (measured in Global Constraints), so the refusal must precede the decode rather than follow it.
3. `readExifFacts(upload.bytes)` for `capturedAt` and orientation.
4. `sharp(bytes).rotate(orientation).jpeg({ quality: 88, mozjpeg: true }).toBuffer({ resolveWithObject: true })` — **no `withMetadata()` and no `keepExif()` anywhere on the chain.** sharp drops metadata by default; the invariant stated at that line is that adding either call publishes the author's home address.
5. The hash: `sharp(sanitised).resize(DHASH_WIDTH, DHASH_HEIGHT, { fit: 'fill' }).greyscale().raw().toBuffer()`, then `dHash([...grid])`. **Hashed from the sanitised bytes, never the original**, so two uploads of one photograph with different metadata hash alike.
6. Return `ProcessedStill` with the re-encoded bytes, the two EXIF facts, the hash, and the width and height from `sharp`'s own `info` — never from the input, which orientation may have swapped.

Every `sharp` call sits inside a `try`/`catch` returning `err('unreadable')`. `CLAUDE.md` §3.1 forbids an empty `catch`; this one returns a typed refusal, which is its opposite.

**Both adapters are thin, deliberately.** `inline-media-processor.ts` is `acceptedTypes: acceptedIngestTypes('inline')` plus a `process` that delegates to `runStillPipeline(upload, { mode: 'inline' })`. `worker-media-processor.ts` is `acceptedIngestTypes('worker')`, delegates stills to the same function with `{ mode: 'worker' }`, and for a sniffed video runs the toolchain's probe, transcode and poster — **the poster going back through `runStillPipeline`**, so a poster frame is stripped and hashed by the same code as any other still.

- [ ] **Step 7: The composition root**

`apps/web/lib/media/services.ts`, modelled on `apps/web/lib/auth/services.ts`:

```ts
/**
 * services — the one place `MEDIA_PIPELINE` chooses a MediaProcessor.
 *
 * Written into each caller, "which adapter" would be several answers and one
 * of them would be wrong. Here it is one answer, and adding a caller cannot
 * change it by accident. NOT a singleton: it holds no state and returns a
 * fresh stateless adapter per call (CLAUDE.md §3.3's rejected anti-patterns).
 */
export const mediaProcessor = (): MediaProcessor =>
  env.MEDIA_PIPELINE === 'worker'
    ? createWorkerMediaProcessor({
        toolchain: createFfmpegToolchain({ ffmpegPath: 'ffmpeg', ffprobePath: 'ffprobe' }),
      })
    : createInlineMediaProcessor()
```

with a test asserting `acceptedTypes` differs between the two modes — the smallest honest proof that the flag is wired to something rather than declared.

- [ ] **Step 8: Coverage configuration, in this commit**

`CLAUDE.md` §2.1: "Adding code in a new directory means adding that directory to an `include`, with a real threshold, in the same commit", and "No file is in neither config's `include`."

- `apps/web/lib/media/**` and `apps/web/lib/ports/**` are already matched by `vitest.config.ts`'s `apps/web/lib/**/*.ts` include. **Read the report and confirm it**, do not assume.
- Every file exercised only by `*.integration.test.ts` — `stillPipeline.ts`, `clipToolchain.ts`, both adapters, both contract files, `media-fixtures.ts`, `services.ts` — follows the treatment the queue files already have: **excluded by exact path from `vitest.config.ts`** and **included with its own per-file threshold in `vitest.integration.config.ts`**. Exact paths, never a directory wildcard, so a future file beside them justifies its own entry.
- Each per-file threshold is the number the file **actually achieves, measured**, not a rounded-up 100. `docs/testing.md` gets the same numbers and the same reasons in this commit.
- **No file gets the §2.1 bracket-segment carve-out in this task.** None of these paths contains a dynamic-route bracket.

- [ ] **Step 9: Mutation — three, run separately**

1. Add `.withMetadata()` to the `sharp` chain in `stillPipeline.ts` step 4.
   **Must fail:** `leaves no metadata marker in the bytes it returns, having first proven the input had one` — **in both adapters' suites**, which is the exit criterion demonstrating itself. This is the single most important mutation in the phase: it is the one that publishes the author's home address.
2. In `stillPipeline.ts`, move `ingestDecision` to **after** the `sharp` decode.
   **Must fail:** `refuses an SVG declared as a JPEG, because an SVG is an HTML document` — because sharp will have rasterised it into a perfectly valid still. This is the mutation that proves the ORDER is the mechanism, not just the presence of a check.
3. In `worker-media-processor.ts`, replace `acceptedIngestTypes('worker')` with `acceptedIngestTypes('inline')`.
   **Must fail:** `reports the accepted types its mode allows, which is what the admin picker reads` and `handles video the way its own mode says it should, which is the whole config switch`, in the worker suite only.

Restore after each. **Paste all six runs.**

- [ ] **Step 10: Commit**

```
feat(media): add the MediaProcessor port and both of its adapters
```

Body: ADR 0004's non-negotiable and why (a deferred path with no test rots invisibly, and this project has been bitten twice by that species); that one `stillPipeline` module is what makes "the same steps" true by construction; the measured reason the sniff must precede the decode (this sharp build renders SVG); the clip toolchain's three cases and the fact that `ffmpeg` is UNRESOLVED on the authoring machine; and the coverage treatment each new file received.

---

## Task 7: Presigned upload — the port's `uploadUrl`, the local receiver, and the guarded slot action

Spec §9.1: "Direct to bucket, and this is forced rather than preferred: Vercel's serverless functions cap request bodies at ~4.5MB, so a 25MB photograph cannot pass through the app at all."

**A tension this task resolves rather than papers over.** `apps/web/lib/ports/storage.ts`'s header says the Cloudflare R2 adapter arrives "in Phase 3". **This phase does not build it, and does not claim to.** R2 needs an account and credentials that do not exist here, and `CLAUDE.md` §7.1 forbids sending a byte of this repository to a service to find out whether the adapter works — so an R2 adapter built now would be exactly the untested deferred path ADR 0004 forbids, with none of the contract-suite coverage that makes the `worker` processor legitimate. What Phase 3 builds is **the seam**: `StoragePort` grows `uploadUrl`, the local adapter implements it as an HTTP receiver of ours, and the R2 adapter becomes a one-file addition behind an already-contract-tested method. Recorded as **ADR 0020**, and `storage.ts`'s stale pointer is corrected in Task 13 — the same treatment Phase 2's ninth review gave the five documents that claimed `MediaProcessor` had shipped.

**Files:**

- Modify: `apps/web/lib/ports/storage.ts`, `apps/web/lib/adapters/local-storage.ts`, `apps/web/lib/adapters/local-storage.test.ts`, `apps/web/lib/adapters/contract/storage-contract.ts`
- Create: `packages/domain/src/media/uploadSlot.ts` + `uploadSlot.test.ts`
- Create: `apps/web/lib/media/uploadToken.ts` + `uploadToken.test.ts`
- Create: `apps/web/lib/media/uploadContract.ts`
- Create: `apps/web/lib/media/receiveLocalUpload.ts` + `receiveLocalUpload.integration.test.ts`
- Create: `apps/web/lib/media/localUploadEndpoint.ts`
- Create: `apps/web/app/(admin)/admin/media/upload/route.ts`
- Create: `apps/web/app/(admin)/admin/media/actions.ts`
- Create: `docs/adr/0020-the-presign-seam-and-the-local-upload-receiver.md`

**Interfaces:**

- Consumes: `validateStorageKey`, `StoragePort` (`../ports/storage`); `guarded`, `guardedAction`, `AuthenticatedSession` (`../auth/guard`); `env` (`../env`); `mediaProcessor()` (Task 6); `createLocalStorage`, `MEDIA_DIR`; `Result`, `ok`, `err`; `JourneyId`, `journeyId`; `createHmac`, `timingSafeEqual` from `node:crypto`.
- Produces on `StoragePort`:

```ts
  /**
   * Produces a URL a browser can PUT the object's bytes straight to, so an
   * upload never passes through the app (spec §9.1: Vercel caps a request
   * body at ~4.5MB, and a photograph is larger than that).
   * @param key - The object's key. Rejected if it escapes the namespace.
   * @param options - How long the URL lives, what type it accepts, and the
   *   most bytes it will take.
   * @returns `ok` with the URL, or `err` naming why one could not be produced.
   */
  uploadUrl(key: string, options: UploadUrlOptions): Promise<Result<string, string>>
```

with `export interface UploadUrlOptions { readonly expiresInSeconds: number; readonly contentType: string; readonly maxBytes: number }`.

- Produces in `packages/domain/src/media/uploadSlot.ts`:

```ts
export const MAX_UPLOAD_BYTES = 52_428_800
export const MAX_FILES_PER_REQUEST = 20
export const UPLOAD_URL_TTL_SECONDS = 900
export type SlotRefusal = 'empty-request' | 'too-many-files' | 'too-large' | 'type-not-offered' | 'unnamed-file'
export interface RequestedUpload {
  readonly filename: string
  readonly declaredType: string
  readonly byteLength: number
}
export interface UploadSlotPlan {
  readonly stagingKey: string
  readonly declaredType: string
  readonly filename: string
}
export const planUploadSlots = (request: {
  readonly files: readonly RequestedUpload[]
  readonly acceptedTypes: readonly string[]
  readonly journey: JourneyId
  readonly nonce: (index: number) => string
}): Result<readonly UploadSlotPlan[], SlotRefusal>
```

- Produces in `apps/web/lib/media/uploadToken.ts`: `mintUploadToken(input: { readonly key: string; readonly expiresAt: number; readonly maxBytes: number; readonly secret: string }): string` and `verifyUploadToken(input: { readonly token: string; readonly now: number; readonly secret: string }): Result<{ readonly key: string; readonly maxBytes: number }, 'malformed' | 'expired' | 'bad-signature'>`.
- Produces in `apps/web/lib/media/uploadContract.ts`: `UploadSlotRequest`, `UploadSlotResponse`, `FinaliseRequest`, `FinaliseResponse`, and **`EXPECTED_UPLOAD_REQUEST`** — the constant both the integration fixture and `e2e/upload.spec.ts` compare against (see the fixture-proof table).

- [ ] **Step 1: Write the failing pure slot-plan test**

`packages/domain/src/media/uploadSlot.test.ts`, with its own local helpers so nothing is referenced that is not defined:

```ts
import { describe, expect, it } from 'vitest'
import { journeyId } from '../ids'
import type { RequestedUpload } from './uploadSlot'
import { MAX_FILES_PER_REQUEST, MAX_UPLOAD_BYTES, planUploadSlots } from './uploadSlot'

/** A journey id for these tests. Throws rather than returning, so a case reads straight. */
const aJourneyId = () => {
  const built = journeyId('journey-7')
  if (!built.ok) throw new Error(built.error)
  return built.value
}

/** One requested upload, with overridable defaults. */
const aRequestedUpload = (overrides: Partial<RequestedUpload> = {}): RequestedUpload => ({
  filename: 'tokyo.jpg',
  declaredType: 'image/jpeg',
  byteLength: 2_000_000,
  ...overrides,
})

const plan = (files: readonly RequestedUpload[]) =>
  planUploadSlots({
    files,
    acceptedTypes: ['image/jpeg', 'image/png'],
    journey: aJourneyId(),
    nonce: (index) => `n${String(index)}`,
  })

describe('planUploadSlots', () => {
  it('keys the staging object by journey id, so nothing can be staged journey-less', () => {
    // CLAUDE.md section 7: key everything by journey id.
    expect(plan([aRequestedUpload()])).toEqual({
      ok: true,
      value: [{ stagingKey: 'staging/journey-7/n0-tokyo.jpg', declaredType: 'image/jpeg', filename: 'tokyo.jpg' }],
    })
  })

  it('gives each file in one request its own key, so two cannot overwrite each other', () => {
    const planned = plan([aRequestedUpload(), aRequestedUpload()])
    const keys = planned.ok ? planned.value.map((slot) => slot.stagingKey) : []

    expect(new Set(keys).size).toBe(2)
  })

  it('sanitises a filename down to what a storage key may hold', () => {
    const planned = plan([aRequestedUpload({ filename: '../../etc/pass wd?.JPG' })])

    expect(planned.ok ? planned.value[0]?.stagingKey : '').toBe('staging/journey-7/n0-etc-pass-wd.jpg')
  })

  it('refuses a request with no files at all', () => {
    expect(plan([])).toEqual({ ok: false, error: 'empty-request' })
  })

  it('refuses one file more than the per-request cap', () => {
    // SECURITY.md: cap file size AND the per-request file count.
    expect(plan(Array.from({ length: MAX_FILES_PER_REQUEST + 1 }, () => aRequestedUpload()))).toEqual({
      ok: false,
      error: 'too-many-files',
    })
  })

  it('accepts exactly the per-request cap', () => {
    expect(plan(Array.from({ length: MAX_FILES_PER_REQUEST }, () => aRequestedUpload())).ok).toBe(true)
  })

  it('accepts a file exactly at the size cap', () => {
    expect(plan([aRequestedUpload({ byteLength: MAX_UPLOAD_BYTES })]).ok).toBe(true)
  })

  it('refuses a file one byte over the size cap', () => {
    expect(plan([aRequestedUpload({ byteLength: MAX_UPLOAD_BYTES + 1 })])).toEqual({ ok: false, error: 'too-large' })
  })

  it('refuses a zero-byte file, which is never a photograph', () => {
    expect(plan([aRequestedUpload({ byteLength: 0 })])).toEqual({ ok: false, error: 'too-large' })
  })

  it('refuses a type the processor did not offer, so the cap and the policy cannot disagree', () => {
    // `acceptedTypes` comes from the bound MediaProcessor rather than a second
    // list written here, so under inline an mp4 has no slot to upload into.
    expect(plan([aRequestedUpload({ declaredType: 'video/mp4' })])).toEqual({ ok: false, error: 'type-not-offered' })
  })

  it('refuses a file whose name is entirely unusable rather than inventing one', () => {
    expect(plan([aRequestedUpload({ filename: '???' })])).toEqual({ ok: false, error: 'unnamed-file' })
  })

  it('refuses the whole request when one file fails, rather than partly succeeding', () => {
    // A caller handed three slots for four files would upload three and never
    // learn which one it lost.
    expect(plan([aRequestedUpload(), aRequestedUpload({ byteLength: MAX_UPLOAD_BYTES + 1 })])).toEqual({
      ok: false,
      error: 'too-large',
    })
  })
})
```

- [ ] **Step 2: Run it, watch it fail, implement**

Run: `npx vitest run --project unit packages/domain/src/media/uploadSlot.test.ts`
Expected: FAIL on the unresolved import, then on assertions.

The `nonce` function is **injected** rather than reached for, for the same reason the clock is (`CLAUDE.md` §2.3): a key built from `randomUUID()` inside pure logic is a key no test can assert. The caller in `actions.ts` passes `() => randomUUID()`.

- [ ] **Step 3: Write the failing token test**

`apps/web/lib/media/uploadToken.test.ts` — a unit test, since HMAC over `node:crypto` is pure computation. `SECRET` is a throwaway 32-character constant, **never `env.PAYLOAD_SECRET`**, so the Docker-free project needs no real environment; it is defined in `apps/web/lib/media/testing/uploadProbes.ts` (Step 5) and imported here, so the unit and integration suites sign with one value rather than two:

```ts
describe('verifyUploadToken', () => {
  it('returns the key and the cap a minted token carries', () => {
    const token = mintUploadToken({ key: 'staging/j/1-a.jpg', expiresAt: 1_000, maxBytes: 99, secret: SECRET })

    expect(verifyUploadToken({ token, now: 500, secret: SECRET })).toEqual({
      ok: true,
      value: { key: 'staging/j/1-a.jpg', maxBytes: 99 },
    })
  })

  it('refuses a token past its expiry, so a leaked URL stops working', () => {
    const token = mintUploadToken({ key: 'staging/j/1-a.jpg', expiresAt: 1_000, maxBytes: 99, secret: SECRET })

    expect(verifyUploadToken({ token, now: 1_001, secret: SECRET })).toEqual({ ok: false, error: 'expired' })
  })

  it('refuses a token whose key was edited after signing', () => {
    // Without the signature covering the key, the receiver would write
    // wherever the URL said - the traversal `validateStorageKey` exists for,
    // arrived at from the other side.
    const token = mintUploadToken({ key: 'staging/j/1-a.jpg', expiresAt: 1_000, maxBytes: 99, secret: SECRET })

    expect(verifyUploadToken({ token: token.replace('1-a.jpg', '1-b.jpg'), now: 500, secret: SECRET }).ok).toBe(false)
  })

  it('refuses a token whose byte cap was raised after signing', () => {
    const token = mintUploadToken({ key: 'staging/j/1-a.jpg', expiresAt: 1_000, maxBytes: 99, secret: SECRET })

    expect(verifyUploadToken({ token: token.replace('99', '99999999'), now: 500, secret: SECRET }).ok).toBe(false)
  })

  it('refuses a token signed with a different secret', () => {
    const token = mintUploadToken({ key: 'staging/j/1-a.jpg', expiresAt: 1_000, maxBytes: 99, secret: SECRET })

    expect(verifyUploadToken({ token, now: 500, secret: `${SECRET}x` })).toEqual({ ok: false, error: 'bad-signature' })
  })

  it('refuses a malformed token rather than throwing', () => {
    expect(verifyUploadToken({ token: 'nonsense', now: 500, secret: SECRET })).toEqual({
      ok: false,
      error: 'malformed',
    })
  })
})
```

The comparison uses `timingSafeEqual` over equal-length buffers, as `apps/web/lib/auth/otpService.ts` already does. State in the header that an upload token is a **capability**, so it gets a code's treatment: constant-time comparison, an expiry, and never logged.

- [ ] **Step 4: Extend the storage contract suite, then the adapter**

Add to `apps/web/lib/adapters/contract/storage-contract.ts` — the **shared** suite, so the R2 adapter inherits these the day it exists:

```ts
it('produces an upload URL for a valid key', async () => {
  const storage = await makeAdapter()

  const url = await storage.uploadUrl('staging/j/1-a.jpg', {
    expiresInSeconds: 900,
    contentType: 'image/jpeg',
    maxBytes: 1_000,
  })

  expect(url.ok).toBe(true)
})

it('refuses an upload URL for a key that escapes the namespace', async () => {
  // Traversal is refused at the PORT, so the R2 adapter - which has no
  // filesystem to protect - gets the same refusal for free.
  const storage = await makeAdapter()

  const url = await storage.uploadUrl('../escape.jpg', {
    expiresInSeconds: 900,
    contentType: 'image/jpeg',
    maxBytes: 1_000,
  })

  expect(url.ok).toBe(false)
})

it('refuses an upload URL for an empty key', async () => {
  const storage = await makeAdapter()

  const url = await storage.uploadUrl('', { expiresInSeconds: 900, contentType: 'image/jpeg', maxBytes: 1_000 })

  expect(url.ok).toBe(false)
})
```

Run `npx vitest run --project unit apps/web/lib/adapters/local-storage.test.ts`.
Expected: FAIL — `storage.uploadUrl is not a function`.

Then implement on `createLocalStorage`: build `${env.ADMIN_ORIGIN}/admin/media/upload?token=<minted>`, minting through `mintUploadToken` with `env.PAYLOAD_SECRET`. `ADMIN_ORIGIN`, never the request's `Host`, for the reason `apps/web/lib/auth/passwordReset.ts` already gives at length: a URL built from a header is a URL an attacker points at their own machine.

**The receiver's address carries no bracket segment**, deliberately: the token is a query parameter rather than a path segment, so this route file avoids the `@vitest/coverage-v8` ignore-hint defect `CLAUDE.md` §2.1 documents for dynamic-route brackets, and needs no carve-out.

- [ ] **Step 5: Write the failing receiver test**

`apps/web/lib/media/receiveLocalUpload.integration.test.ts` — integration, because it writes real bytes through a real `createLocalStorage` rooted at a temp directory:

```ts
it('writes the bytes to the key the token names', async () => {
  const { storage } = await aTempStore()
  const token = mintUploadToken({ key: 'staging/j/1-a.jpg', expiresAt: 2_000, maxBytes: 100, secret: SECRET })

  const received = await receiveLocalUpload(aPutRequest({ token, body: new Uint8Array([1, 2, 3]) }), {
    storage,
    now: () => 1_000,
    secret: SECRET,
  })

  expect(received).toEqual({ ok: true, value: { key: 'staging/j/1-a.jpg' } })
  expect(await storage.get('staging/j/1-a.jpg')).toEqual({ ok: true, value: new Uint8Array([1, 2, 3]) })
})

it('refuses a body larger than the token allows, and writes nothing', async () => {
  // The cap is enforced HERE and not only in the slot plan: the plan is what
  // the client was TOLD, and a client is not what enforces a cap.
  const { storage } = await aTempStore()
  const token = mintUploadToken({ key: 'staging/j/1-a.jpg', expiresAt: 2_000, maxBytes: 2, secret: SECRET })

  const received = await receiveLocalUpload(aPutRequest({ token, body: new Uint8Array([1, 2, 3]) }), {
    storage,
    now: () => 1_000,
    secret: SECRET,
  })

  expect(received).toEqual({ ok: false, error: 'too-large' })
  expect(await storage.exists('staging/j/1-a.jpg')).toBe(false)
})

it('refuses an expired token, and writes nothing', async () => {
  const { storage } = await aTempStore()
  const token = mintUploadToken({ key: 'staging/j/1-a.jpg', expiresAt: 500, maxBytes: 100, secret: SECRET })

  const received = await receiveLocalUpload(aPutRequest({ token, body: new Uint8Array([1]) }), {
    storage,
    now: () => 1_000,
    secret: SECRET,
  })

  expect(received).toEqual({ ok: false, error: 'expired' })
  expect(await storage.exists('staging/j/1-a.jpg')).toBe(false)
})

it('refuses a request carrying no token at all', async () => {
  const { storage } = await aTempStore()

  const received = await receiveLocalUpload(new Request('http://localhost/admin/media/upload', { method: 'PUT' }), {
    storage,
    now: () => 1_000,
    secret: SECRET,
  })

  expect(received).toEqual({ ok: false, error: 'malformed' })
})
```

Three things, **created in this step in `apps/web/lib/media/testing/uploadProbes.ts`** — a module of its own rather than locals in this test file, because Tasks 8 and 9 need the same three and a helper that has to be "moved later" is a helper that gets duplicated:

- `export const SECRET: string` — a throwaway 32-character signing secret, **never `env.PAYLOAD_SECRET`**, so a test never depends on the real one.
- `export const aTempStore = async (): Promise<{ readonly storage: StoragePort; readonly root: string }>` — `mkdtemp` under `os.tmpdir()`, then `createLocalStorage(root)`. **Read `apps/web/lib/adapters/local-storage.test.ts` first and reuse its temp-root helper if it exports one**, rather than writing a second.
- `export const aPutRequest = (input: { readonly token: string; readonly body: Uint8Array }): Request` — the method and `Content-Type` come from **`EXPECTED_UPLOAD_REQUEST`** in `uploadContract.ts`, so they are the ones `e2e/upload.spec.ts` observes a real Chromium sending; the body and its length are the caller's. That constant is the whole fixture-drift defence; see the fixture-proof table above.

`uploadToken.test.ts` (Step 3) imports `SECRET` from here too, so the unit and integration suites sign with one value.

- [ ] **Step 6: Run, watch fail, implement the receiver and its route**

`receiveLocalUpload` reads `token` off the URL, verifies it, refuses a `Content-Length` above the token's cap **before** reading the body, reads the body, refuses again if the actual length exceeds the cap (a `Content-Length` is a claim), and writes through the port.

`apps/web/lib/media/localUploadEndpoint.ts` turns that `Result` into a `Response`: `204` on success, `413` for `'too-large'`, and **one `403` for `'malformed'`, `'expired'` and `'bad-signature'` alike** — the same one-refusal-for-all-causes rule `readGalleryDownload` already follows, so the endpoint cannot become an oracle telling an attacker which part of a forged token was wrong.

`apps/web/app/(admin)/admin/media/upload/route.ts` is one line of body:

```ts
export const PUT = guarded(handleLocalUpload)
```

`guarded` applies the session check **in the route file**, which is the only version of that check `adminGuardRegistration.test.ts` accepts — read `apps/web/app/(admin)/admin/sign-out/route.ts` for the shape. The address is **not** added to `ADMIN_PUBLIC_PATHS`: an upload is a mutation by the author, and the session cookie is `Path=/admin`, so the browser sends it here.

- [ ] **Step 7: The guarded slot action**

`apps/web/app/(admin)/admin/media/actions.ts`. **Read `eslint-rules/guarded-server-actions.js`'s header before writing a line of this file.** What it enforces:

- A `'use server'` module may export **nothing but calls to `guardedAction(...)`**, and the callee must resolve to an import whose **imported name is `guardedAction`** and whose specifier resolves on disk to `apps/web/lib/auth/guard.ts`.
- **Nothing at the top level may evaluate anything at load** bar a literal, a function expression, or that same call. No `const processor = mediaProcessor()` at module scope — call it **inside** the action.
- The only export it passes over is one the parser marks `exportKind: 'type'`. That is why `UploadSlotRequest` and friends live in `apps/web/lib/media/uploadContract.ts` and are imported here rather than declared here.
- A `'use server'` directive inside a function body is refused outright.

```ts
'use server'

/**
 * actions — the admin's media mutations. Every export is built from
 * `guardedAction`, which is what a Server Action needs rather than a check it
 * could forget: an action is a POST endpoint of its own, dispatched before the
 * page around it renders, so the page's own guard has not run (SECURITY.md:
 * nothing inherits trust from the page it was reached from).
 * Depends on: guardedAction (../../../../lib/auth/guard), planUploadSlots
 * (@travel-diary/domain/media/uploadSlot), mediaProcessor and the storage
 * adapter, both constructed INSIDE the action - see the lint rule's rule 4.
 */
export const requestUploadSlots = guardedAction(
  async (_session, request: UploadSlotRequest): Promise<UploadSlotResponse> => {
    // ...
  },
)
```

Its integration test asserts three things, in `apps/web/lib/media/uploadSlots.integration.test.ts` (testing the underlying service rather than the action, since a Server Action needs a request context):

```ts
it('offers one upload URL per planned slot, each carrying its own token', async () => {
  const journey = await aPublishedFixtureJourney()

  const offered = await planSlotsFor({
    mode: 'inline',
    files: [
      { filename: 'a.jpg', declaredType: 'image/jpeg', byteLength: 1_000 },
      { filename: 'b.jpg', declaredType: 'image/jpeg', byteLength: 1_000 },
    ],
    journey,
  })

  const urls = offered.ok ? offered.value.map((slot) => slot.uploadUrl) : []
  expect(urls).toHaveLength(2)
  // Distinct, because each token signs its own key: one URL that worked for
  // both slots would let a second upload overwrite the first.
  expect(new Set(urls).size).toBe(2)
})

it('offers no video slot under inline, so the picker cannot ask for one', async () => {
  // Exit criterion 5, at the slot layer: enabling clips must be a config
  // switch. Under inline there is nowhere to put an mp4.
  const offered = await planSlotsFor({ mode: 'inline', declaredType: 'video/mp4' })

  expect(offered).toEqual({ ok: false, error: 'type-not-offered' })
})

it('offers a video slot under worker', async () => {
  expect((await planSlotsFor({ mode: 'worker', declaredType: 'video/mp4' })).ok).toBe(true)
})
```

`planSlotsFor` is a helper in that test file, **defined in this step**: `(input: { readonly mode: PipelineMode; readonly files?: readonly RequestedUpload[]; readonly declaredType?: string; readonly journey: JourneyId }) => Promise<Result<readonly { readonly uploadUrl: string; readonly stagingKey: string }[], SlotRefusal>>`. It calls the same service `requestUploadSlots` calls, with a processor built for `mode`; `declaredType` is shorthand for a single-file request, so the three cases read straight. `aPublishedFixtureJourney` is Task 9's probe helper — **if Task 7 runs first, define it here in `uploadProbes.ts` and let Task 9 import it**, rather than writing a second.

- [ ] **Step 8: Mutations — three, run separately**

1. In `receiveLocalUpload`, drop the post-read length check (keep the `Content-Length` check).
   **Must fail:** `refuses a body larger than the token allows, and writes nothing` — when `aPutRequest` is given a body whose declared length lies. **Add that case in this step if it is not already there**: a cap enforced only against a header is a cap a client sets.
2. In `mintUploadToken`, sign only the expiry and not the key.
   **Must fail:** `refuses a token whose key was edited after signing`.
3. In `apps/web/app/(admin)/admin/media/upload/route.ts`, replace `guarded(handleLocalUpload)` with `handleLocalUpload`.
   **Must fail:** `npm run lint` and `adminGuardRegistration.test.ts`'s route-guard case — **paste both**, because the ESLint rule and the registration test are two mechanisms and this proves which one caught it.

Restore after each. **Paste all six runs.**

- [ ] **Step 9: ADR 0020, and the commits**

Write `docs/adr/0020-the-presign-seam-and-the-local-upload-receiver.md`: Context (spec §9.1's forced direct-to-bucket; no R2 credentials; §7.1 forbids finding out by sending), Options (build R2 now and leave it untested / route uploads through the app / **build the seam and a local receiver**), Decision (the port's `uploadUrl`; the local receiver at `PUT /admin/media/upload?token=`; `MAX_UPLOAD_BYTES` 52,428,800, `MAX_FILES_PER_REQUEST` 20, `UPLOAD_URL_TTL_SECONDS` 900, each with its reason), Consequences (the R2 adapter is a one-file addition behind three already-shared contract cases; **the receiver route still exists in production and must be deleted or gated in the same change that adds the R2 adapter** — named here so it is a recorded residual rather than a discovery).

Two commits:

```
feat(media): add a presigned upload seam to the storage port
```

```
feat(media): receive a presigned upload behind the admin guard
```

Bodies: why direct-to-bucket is forced rather than preferred; why R2 is **not** built here and what would make it dishonest to; that the token is a capability and gets a code's treatment; and that the cap is enforced at the receiver because the plan is only what the client was told.

---

## Task 8: Ingest — the row, its states, and duplicate detection within the journey

The step spec §9.1 calls "server action creates media row" and §9.2 step 8 calls "mark `ready`, or `failed` with a reason the Media screen surfaces".

**How the states are actually reachable, stated plainly, because a dead state is worse than none.** Payload's upload collections require a file at `create`, so a row cannot exist before its bytes do. So:

- **`inline`, a still:** the staged bytes are read back, processed, and the row is created **once**, from the sanitised bytes, at `state: 'ready'`. A refusal creates **no row at all** and is returned to the caller — there is nothing to show a `failed` row for, because there is no photograph.
- **`worker`:** the row is created from the staged bytes at `state: 'processing'` and a `transcode` job is enqueued. The worker sets `'ready'` or `'failed'` with a reason.
- **`processing` is reachable under `inline` too**, and usefully: the field defaults to `'processing'`, so a request that dies between `create` and the state write leaves a **visibly** processing row rather than an invisible one. That is the state the Media screen should show for a crashed upload, and it is asserted rather than assumed.

**Files:**

- Create: `apps/web/lib/media/ingestUpload.ts`, `apps/web/lib/media/ingestUpload.integration.test.ts`
- Modify: `apps/web/app/(admin)/admin/media/actions.ts` (adds `finaliseUpload`), `apps/web/lib/media/uploadContract.ts`, `vitest.config.ts`, `vitest.integration.config.ts`, `docs/testing.md`

**Interfaces:**

- Consumes: `mediaProcessor()` (Task 6), `createLocalStorage`, `MEDIA_DIR`, `getPayload`, `QueuePort`, `isPerceptualDuplicate` (Task 4), `guardedAction`, `JourneyId`, `MediaId`, `mediaId`, `StoragePort`, `ProcessingRefusal`, `PipelineMode`.
- Produces:

```ts
/** Everything ingest needs, injected so a test can move the clock and the queue. */
export interface IngestDeps {
  readonly payload: Awaited<ReturnType<typeof getPayload>>
  readonly storage: StoragePort
  readonly processor: MediaProcessor
  readonly queue: QueuePort
  readonly mode: PipelineMode
  readonly now: () => number
}

/** What became of one staged upload. */
export type IngestOutcome =
  | { readonly kind: 'ready'; readonly media: MediaId }
  | { readonly kind: 'duplicate'; readonly of: MediaId }
  | { readonly kind: 'queued'; readonly media: MediaId; readonly job: string }

export type IngestRefusalReason = ProcessingRefusal | 'staged-bytes-missing'

export const ingestUpload = (
  input: {
    readonly stagingKey: string
    readonly declaredType: string
    readonly filename: string
    readonly journey: JourneyId
  },
  deps: IngestDeps,
): Promise<Result<IngestOutcome, IngestRefusalReason>>
```

- [ ] **Step 1: Write the six helpers these tests consume**

All six live in `apps/web/lib/media/testing/ingestProbes.ts`, factories and probes with no shared mutable state (`CLAUDE.md` §2.3). **They are written before the tests that use them**, so nothing below references an identifier nothing defines:

| Helper              | Signature                                                                                                                                                                                                       | What it does                                                                                                                                                                    |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `aTempStore`        | `() => Promise<{ readonly storage: StoragePort; readonly root: string }>`                                                                                                                                       | `mkdtemp` under `os.tmpdir()`, then `createLocalStorage(root)`. The same helper Task 7 Step 5 introduced — **import it, do not write a second**                                 |
| `aFixtureJourney`   | `() => Promise<JourneyId>`                                                                                                                                                                                      | Creates a published journey with a per-call slug prefixed `test-ingest-`, and registers it for `afterAll` cleanup                                                               |
| `aStagedPhotograph` | `(options: { readonly journey?: JourneyId; readonly withExif?: boolean; readonly reencoded?: boolean }) => Promise<{ readonly input: IngestInput; readonly storage: StoragePort; readonly bytes: Uint8Array }>` | Builds a temp store, writes `aPhotographWithExif()` / `aPhotograph()` / `aReencodedPhotograph()` to a staging key through the port, and returns the `ingestUpload` input for it |
| `aStagedSvg`        | `(options?: { readonly journey?: JourneyId }) => Promise<{ readonly input: IngestInput; readonly storage: StoragePort }>`                                                                                       | The same, staging `anSvgDocument()` under a `.jpg` name and a declared `image/jpeg` — the attack, exactly as it would arrive                                                    |
| `readMediaRow`      | `(ingested: Result<IngestOutcome, IngestRefusalReason>) => Promise<MediaRowFacts>`                                                                                                                              | Reads back `state`, `kind`, `capturedAt`, `contentHash` and `sizes` for the row an outcome names, `depth: 0`, `select`ed narrowly (`CLAUDE.md` §7)                              |
| `countMediaRows`    | `() => Promise<number>`                                                                                                                                                                                         | `payload.count({ collection: 'media' })`, for the two cases asserting nothing was created                                                                                       |

`IngestInput` is the first parameter's type, exported from `ingestUpload.ts` so the probes and the tests name it once. `MediaRowFacts` is declared in the probe module.

- [ ] **Step 2: Write the failing tests, part one — the happy path and the strip**

```ts
it('creates a ready row carrying every derivative tier, from the sanitised bytes', async () => {
  const staged = await aStagedPhotograph({ withExif: true })

  const ingested = await ingestUpload(staged.input, await inlineDeps(staged.storage))

  expect(ingested.ok ? ingested.value.kind : null).toBe('ready')
  const row = await readMediaRow(ingested)
  expect(row.state).toBe('ready')
  expect(row.kind).toBe('still')
  expect(Object.keys(row.sizes ?? {}).sort()).toEqual(['frame', 'grid', 'hero', 'hero2x', 'thumb', 'tile'])
})

it('records the capture time it read off the EXIF, before stripping it', async () => {
  const staged = await aStagedPhotograph({ withExif: true })

  const ingested = await ingestUpload(staged.input, await inlineDeps(staged.storage))

  expect((await readMediaRow(ingested)).capturedAt).toContain('2025-03-14')
})

it('removes the staging object once the row exists, so a staged copy cannot outlive it', async () => {
  // The staged original still carries the GPS coordinates. Leaving it in the
  // bucket would undo the strip for anybody who could enumerate the bucket -
  // which is exactly SECURITY.md's objection to direct URLs.
  const staged = await aStagedPhotograph({ withExif: true })

  await ingestUpload(staged.input, await inlineDeps(staged.storage))

  expect(await staged.storage.exists(staged.input.stagingKey)).toBe(false)
})
```

The six-tier assertion is written **now**, before Task 10 adds `grid`, and is therefore **expected to fail on `grid` until Task 10 lands.** That is deliberate and stated here rather than discovered: if the tier list were written as five and widened later, nothing would have failed when `grid` was added and forgotten. Task 10's own step re-runs this case as its proof.

`inlineDeps` and `workerDeps` are two more probe-module helpers, `(storage: StoragePort) => Promise<IngestDeps>`, differing only in `mode` and in which processor they bind — added in Step 1's table when implementing.

- [ ] **Step 3: Write the failing tests, part two — duplicates, refusals and the two modes**

```ts
it('reports a re-encode of an existing photograph in the same journey as a duplicate', async () => {
  const journey = await aFixtureJourney()
  const first = await aStagedPhotograph({ journey })
  await ingestUpload(first.input, await inlineDeps(first.storage))
  const again = await aStagedPhotograph({ journey, reencoded: true })

  const ingested = await ingestUpload(again.input, await inlineDeps(again.storage))

  expect(ingested.ok ? ingested.value.kind : null).toBe('duplicate')
})

it('does not report the same photograph in a different journey as a duplicate', async () => {
  // CLAUDE.md section 7, and spec section 9.2 step 6: the match is within ONE
  // journey. The same landscape can legitimately appear in two.
  const mine = await aFixtureJourney()
  const theirs = await aFixtureJourney()
  const first = await aStagedPhotograph({ journey: mine })
  await ingestUpload(first.input, await inlineDeps(first.storage))
  const other = await aStagedPhotograph({ journey: theirs, reencoded: true })

  const ingested = await ingestUpload(other.input, await inlineDeps(other.storage))

  expect(ingested.ok ? ingested.value.kind : null).toBe('ready')
})

it('creates no row at all when the bytes are refused', async () => {
  const staged = await aStagedSvg()
  const before = await countMediaRows()

  const ingested = await ingestUpload(staged.input, await inlineDeps(staged.storage))

  expect(ingested).toEqual({ ok: false, error: 'svg-rejected' })
  expect(await countMediaRows()).toBe(before)
})

it('removes the staging object even when the bytes are refused', async () => {
  const staged = await aStagedSvg()

  await ingestUpload(staged.input, await inlineDeps(staged.storage))

  expect(await staged.storage.exists(staged.input.stagingKey)).toBe(false)
})

it('refuses when the staged object is absent, rather than creating an empty row', async () => {
  const { storage } = await aTempStore()
  const journey = await aFixtureJourney()

  const ingested = await ingestUpload(
    { stagingKey: 'staging/j/never-written.jpg', declaredType: 'image/jpeg', filename: 'a.jpg', journey },
    await inlineDeps(storage),
  )

  expect(ingested).toEqual({ ok: false, error: 'staged-bytes-missing' })
})

it('enqueues a transcode job and leaves the row processing under worker mode', async () => {
  // ADR 0004: worker mode is a queue hop, not a different pipeline.
  const staged = await aStagedPhotograph({})

  const ingested = await ingestUpload(staged.input, await workerDeps(staged.storage))

  expect(ingested.ok ? ingested.value.kind : null).toBe('queued')
  expect((await readMediaRow(ingested)).state).toBe('processing')
})

it('leaves a row processing when nothing sets its state, so a crashed upload is visible', async () => {
  const payload = await getTestPayload()
  const journey = await aFixtureJourney()
  const png = await aTinyPng()

  const created = await payload.create({
    collection: 'media',
    data: { journey },
    file: { data: png, mimetype: 'image/png', name: 'crashed.png', size: png.length },
  })

  const row = await payload.findByID({ collection: 'media', id: created.id, depth: 0, select: { state: true } })
  expect(row.state).toBe('processing')
})
```

- [ ] **Step 4: Run, watch fail, implement**

Run: `npm run test:integration -- apps/web/lib/media/ingestUpload.integration.test.ts`
Expected: FAIL on the unresolved import, then ten assertion failures — and **the six-tier case additionally failing on `grid`** until Task 10, as Step 2 says.

`ingestUpload`:

1. `storage.get(stagingKey)`; `err('staged-bytes-missing')` on failure.
2. `processor.process({ bytes, declaredType, filename })`; on `err`, delete the staging object and return the refusal.
3. **The duplicate query, one query, keyed by journey and selecting two columns.** `payload.find({ collection: 'media', depth: 0, pagination: false, where: { journey: { equals: journey } }, select: { contentHash: true } })`, then `isPerceptualDuplicate` over the rows. **One query with the journey in the `where`, never a scan of the collection** (`CLAUDE.md` §6, no N+1; §7, key by journey id).
4. `payload.create({ collection: 'media', data: { journey, kind, capturedAt, contentHash, state: 'ready' }, file: { data: sanitised, mimetype, name, size } })` under `inline`; under `worker`, `state: 'processing'` from the staged bytes plus `queue.enqueue({ kind: 'transcode', mediaId })`.
5. Delete the staging object, on every path, in a `finally`.

`finaliseUpload` in `actions.ts` is `guardedAction(async (_session, request: FinaliseRequest) => ...)`, building the deps **inside** the action (the lint rule's rule 4) and mapping the `Result` to a `FinaliseResponse`. **It never returns a storage key** — a response naming the staging key would hand the caller the bucket's own naming, which is the enumeration `readGalleryDownload` already refuses to enable.

- [ ] **Step 5: Mutations — three, run separately**

1. Drop `{ journey: { equals: journey } }` from the duplicate query's `where`.
   **Must fail:** `does not report the same photograph in a different journey as a duplicate`. The same-journey case keeps passing — which is why both exist, and why this is the sixth member of the defect family the handoff records five of.
2. Move the staging-object delete so it only runs on the success path.
   **Must fail:** `removes the staging object even when the bytes are refused`. This matters more than it looks: the staged original is the copy that still has the GPS coordinates in it.
3. Make `ingestUpload` create the row **before** calling `processor.process`.
   **Must fail:** `creates no row at all when the bytes are refused` — because the SVG would then have a row, and a row means a stored file.

Restore after each. **Paste all six runs.**

- [ ] **Step 6: Coverage configuration, in this commit**

`ingestUpload.ts`, `testing/ingestProbes.ts` and the `actions.ts` module all run only under a real Payload. Same treatment as Task 6 Step 8: **exact-path exclude in `vitest.config.ts`, exact-path include with a measured per-file threshold in `vitest.integration.config.ts`**, and the same reasons written into `docs/testing.md`. `apps/web/app/(admin)/admin/media/actions.ts` falls under `vitest.config.ts`'s existing `apps/web/app/**/*.ts` 95% threshold — if it cannot be measured there, exclude it **by exact path** with the reason stated, never by wildcard.

- [ ] **Step 7: Commit**

```
feat(media): ingest a staged upload into a ready media row
```

Body: the state reachability argument above (why `inline` creates once at `ready`, why a refusal creates no row, and why `processing` is still a real state); that the duplicate match is scoped to one journey and why; and that the staging object is deleted on every path because it is the copy that still carries the coordinates.

---

## Task 9: The exit-criteria suite — round trip, EXIF absent from the STORED bytes, SVG rejected, video deferred

**OWNS EXIT CRITERIA 1, 2, 3 AND 5.** Everything before this task built mechanisms; this task is where the phase's claim is proven, against a real Postgres, a real store, and — for the upload half — a real browser.

**Why a separate task rather than assertions spread through Tasks 6 to 8.** The exit line is a claim about the system, and the unit that proves it has to be the system. Task 6 proves the processor strips; **this task proves the bytes that ended up on disk carry nothing** — which is a different sentence, and the one the spec actually wrote ("EXIF verifiably absent", verified by reading the stored bytes).

**Files:**

- Create: `apps/web/lib/media/roundTrip.integration.test.ts`
- Create: `e2e/upload.spec.ts`
- Modify: `package.json` (`test:e2e` names the new spec), `.github/workflows/ci.yml` (the `browser` job names it too)

**Interfaces:**

- Consumes: `planUploadSlots`, `MAX_UPLOAD_BYTES`, `mintUploadToken`, `receiveLocalUpload`, `ingestUpload`, `readGalleryDownload`, `metadataMarkersIn`, `EXIF_CANARY`, `aPhotographWithExif`, `anSvgDocument`, `anIsoBmffHeader`, `aClip`, `Media`, `EXPECTED_UPLOAD_REQUEST`, `SECRET`, `aTempStore`, `aPutRequest`, and the Task 8 probe helpers — every one created by a named earlier task (Tasks 2, 4, 6, 7, 8).
- Produces: no application code. This task adds tests only. If it needs a helper, the helper goes in `apps/web/lib/media/testing/ingestProbes.ts` beside the others.

- [ ] **Step 1: Write the failing round-trip test**

```ts
it('carries a still from a presigned slot to a downloadable derivative', async () => {
  // EXIT CRITERION 1. Every seam in the phase, in order, with nothing stubbed
  // but the browser: plan the slot, PUT through the receiver, ingest, then ask
  // the download handler for it the way the gallery does.
  const journey = await aPublishedFixtureJourney()
  const { storage } = await aTempStore()
  const bytes = await aPhotographWithExif()

  const planned = planUploadSlots({
    files: [{ filename: 'tokyo.jpg', declaredType: 'image/jpeg', byteLength: bytes.byteLength }],
    acceptedTypes: ['image/jpeg', 'image/png'],
    journey,
    nonce: () => 'roundtrip',
  })
  const slot = planned.ok ? planned.value[0] : undefined
  if (slot === undefined) throw new Error('the slot plan refused a photograph it should have accepted')

  const token = mintUploadToken({
    key: slot.stagingKey,
    expiresAt: 2_000,
    maxBytes: MAX_UPLOAD_BYTES,
    secret: SECRET,
  })
  const received = await receiveLocalUpload(aPutRequest({ token, body: bytes }), {
    storage,
    now: () => 1_000,
    secret: SECRET,
  })
  expect(received.ok).toBe(true)

  const ingested = await ingestUpload(
    { stagingKey: slot.stagingKey, declaredType: slot.declaredType, filename: slot.filename, journey },
    await inlineDeps(storage),
  )
  expect(ingested.ok ? ingested.value.kind : null).toBe('ready')

  const media = ingested.ok && ingested.value.kind === 'ready' ? ingested.value.media : null
  if (media === null) throw new Error('ingest did not name a media row')
  const attachment = await readGalleryDownload(await slugOf(journey), media)

  expect(attachment.ok).toBe(true)
  expect(attachment.ok ? attachment.value.contentType : null).toBe('image/jpeg')
  expect(attachment.ok ? attachment.value.bytes.byteLength : 0).toBeGreaterThan(0)
})
```

`aPublishedFixtureJourney` and `slugOf` are two more `ingestProbes.ts` helpers — the first `aFixtureJourney` with `_status: 'published'` (the download handler filters on it), the second `(journey: JourneyId) => Promise<string>`. **Defined in this step.** `MAX_UPLOAD_BYTES` comes from `@travel-diary/domain/media/uploadSlot`; `SECRET` and `aPutRequest` are the constants Task 7 Step 5 introduced, imported from the probe module rather than redeclared.

- [ ] **Step 2: Write the failing EXIF-absence test — against the bytes on disk**

```ts
it('leaves no EXIF in any stored derivative, having proven the upload carried some', async () => {
  // EXIT CRITERION 2, read literally: "verified by reading the stored bytes,
  // not by trusting the library". So every assertion below is over bytes
  // fetched back OUT of the store through the StoragePort - the original that
  // Payload wrote, and all six derivatives - and the probe is the domain's
  // whole-buffer byte search, which shares none of sharp's assumptions.
  const uploaded = await aPhotographWithExif()

  // POSITIVE CONTROL. Without these two lines the whole case would pass
  // against a fixture that never had EXIF, which is one of the two shapes of
  // fixture defect Phase 2 shipped.
  expect(metadataMarkersIn(uploaded)).toContain('exif')
  expect(Buffer.from(uploaded).includes(EXIF_CANARY)).toBe(true)

  const stored = await storedFilesFor(await ingestPhotograph({ bytes: uploaded }))

  // Six derivatives plus the original: seven files, each read back and each
  // checked. A loop rather than seven cases, because the assertion is
  // identical and the interesting number is that none was skipped.
  expect(stored.length).toBe(7)
  for (const file of stored) {
    expect(metadataMarkersIn(file.bytes)).toEqual([])
    expect(Buffer.from(file.bytes).includes(EXIF_CANARY)).toBe(false)
  }
})

it('leaves no GPS coordinate bytes in the stored original, checked without any parser at all', async () => {
  // The canary is ASCII the fixture put in Copyright; this is the coordinate
  // itself. Two independent checks, because a stripper that removed the
  // segment header while leaving the payload would satisfy a marker search.
  const uploaded = await aPhotographWithExif()
  const stored = await storedFilesFor(await ingestPhotograph({ bytes: uploaded }))
  const original = stored.find((file) => file.tier === 'original')
  if (original === undefined) throw new Error('no stored original to check')

  expect(Buffer.from(original.bytes).includes(Buffer.from('GPS'))).toBe(false)
})
```

Two more probe helpers, **defined in this step**:

- `ingestPhotograph(options: { readonly bytes: Uint8Array; readonly journey?: JourneyId }): Promise<MediaId>` — plans, receives and ingests in one call, so the two cases above are not four screens of setup.
- `storedFilesFor(media: MediaId): Promise<readonly { readonly tier: string; readonly bytes: Uint8Array }[]>` — reads the row's `filename` and every `sizes[tier].filename`, then fetches each **through `createLocalStorage(MEDIA_DIR)`**, never through `fs` directly. Its return includes `tier: 'original'` for the row's own file. **The count assertion is the point**: a probe that silently returned four files would make the loop vacuous, so `expect(stored.length).toBe(7)` guards the guard.

The `length` of 7 assumes `grid` exists, so like Task 8's tier case this is **expected to fail at 6 until Task 10 lands**, and Task 10 re-runs it as its own proof. Written as 7 now, deliberately, so adding the tier cannot be forgotten silently.

- [ ] **Step 3: Write the failing SVG and video refusal tests**

```ts
it('rejects an SVG at ingest and stores no file for it', async () => {
  // EXIT CRITERION 3, and the reason matters as much as the result: an SVG is
  // an HTML document, so one stored upload becomes stored XSS with the
  // author's own session attached (SECURITY.md). Note the disguise - a .jpg
  // name and a declared image/jpeg - because that is the only form this
  // arrives in.
  const journey = await aPublishedFixtureJourney()
  const { storage } = await aTempStore()
  const before = await countMediaRows()
  const slot = 'staging/svg-attempt/innocent.jpg'
  await storage.put(slot, anSvgDocument(), 'image/jpeg')

  const ingested = await ingestUpload(
    { stagingKey: slot, declaredType: 'image/jpeg', filename: 'innocent.jpg', journey },
    await inlineDeps(storage),
  )

  expect(ingested).toEqual({ ok: false, error: 'svg-rejected' })
  expect(await countMediaRows()).toBe(before)
  expect(await storage.exists(slot)).toBe(false)
})

it('offers no slot for an SVG in the first place, so the refusal is two layers deep', async () => {
  const journey = await aPublishedFixtureJourney()

  const planned = planUploadSlots({
    files: [{ filename: 'innocent.svg', declaredType: 'image/svg+xml', byteLength: 400 }],
    acceptedTypes: ['image/jpeg', 'image/png'],
    journey,
    nonce: () => 'x',
  })

  expect(planned).toEqual({ ok: false, error: 'type-not-offered' })
})

it('rejects an mp4 at ingest under inline, although the schema lists the type', async () => {
  // EXIT CRITERION 5. `media.ts`'s mimeTypes still carries video/mp4 and
  // video/quicktime, untouched (DATA_MODEL.md), and the PORT is what refuses
  // them - which is what makes enabling clips MEDIA_PIPELINE=worker plus a
  // deployed worker, and not a migration.
  const journey = await aPublishedFixtureJourney()
  const { storage } = await aTempStore()
  const slot = 'staging/clip-attempt/harbour.mp4'
  await storage.put(slot, await aClip(), 'video/mp4')

  const ingested = await ingestUpload(
    { stagingKey: slot, declaredType: 'video/mp4', filename: 'harbour.mp4', journey },
    await inlineDeps(storage),
  )

  expect(ingested).toEqual({ ok: false, error: 'video-deferred' })
})

it('rejects a quicktime clip under inline, so neither video type is admitted by omission', async () => {
  // Both types, separately. `video/quicktime` is the one a list written once
  // and extended later forgets, and it is in the schema exactly as
  // DATA_MODEL.md wrote it.
  const journey = await aPublishedFixtureJourney()
  const { storage } = await aTempStore()
  const slot = 'staging/clip-attempt/harbour.mov'
  await storage.put(slot, anIsoBmffHeader({ brand: 'qt' }), 'video/quicktime')

  const ingested = await ingestUpload(
    { stagingKey: slot, declaredType: 'video/quicktime', filename: 'harbour.mov', journey },
    await inlineDeps(storage),
  )

  expect(ingested).toEqual({ ok: false, error: 'video-deferred' })
})

it('still lists both video types in the collections own mimeTypes, so nothing was deleted to make this pass', async () => {
  // The temptation is to make the criterion true by narrowing the schema.
  // DATA_MODEL.md is the source of record for the field list and ADR 0004
  // rejected exactly that option, so this case pins the schema against the
  // easy fix.
  expect(Media.upload?.mimeTypes).toEqual(['image/jpeg', 'image/png', 'image/heic', 'video/mp4', 'video/quicktime'])
})
```

`Media` is imported from `../../collections/media`. That last case is the most valuable one in the file: it is what stops criterion 5 being satisfied by deleting the two types from the schema, which would look green and would break ADR 0004's whole decision.

- [ ] **Step 4: Run the whole file and watch it fail**

Run: `npm run test:integration -- apps/web/lib/media/roundTrip.integration.test.ts`
Expected, before Task 10: every case passing **except** the two tier-count assertions, which fail at 6 rather than 7 and at five tier names rather than six. State that in the run's notes; do not weaken them.

- [ ] **Step 5: Write the failing browser upload spec — and the fixture-shape proof**

`e2e/upload.spec.ts`. Two things at once, and the second is the more important:

```ts
test('a real browser PUT reaches the receiver and the bytes land', async ({ page, context, baseURL }, testInfo) => {
  const session = await aSignedInSession(`upload.${fixtureLabel(testInfo)}`)
  await context.addCookies([{ name: 'td-session', value: session, url: `${baseURL ?? ''}/admin` }])
  const upload = await anUploadUrlFor(testInfo)

  const observed = await page.evaluate(
    async (upload: { readonly url: string; readonly contentType: string; readonly byteLength: number }) => {
      // A File built in the page, PUT by the page's own fetch: a real
      // Content-Length, a real Content-Type off the File, and the browser's
      // own body handling - none of which a Node-built Request exercises.
      const body = new File([new Uint8Array(upload.byteLength).fill(7)], 'tokyo.jpg', { type: upload.contentType })
      const response = await fetch(upload.url, { method: 'PUT', body })
      return {
        method: 'PUT',
        status: response.status,
        contentType: body.type,
        byteLength: body.size,
      }
    },
    upload,
  )

  expect(observed.status).toBe(204)
  // THE FIXTURE-SHAPE PROOF. `EXPECTED_UPLOAD_REQUEST` is the single constant
  // the integration fixture `aPutRequest` builds its method and Content-Type
  // from, so if the shape the integration suite exercises ever stops matching
  // what a browser actually sends, THIS fails - not a unit test that would
  // happily agree with itself. Two Phase 2 blockers passed 1,600 tests behind
  // fixtures sending a request shape no browser produces; this is the check
  // that would have caught them.
  //
  // The constant carries the SHAPE and not a length: the body's size is the
  // caller's, and pinning one here would make the round-trip fixture - which
  // sends a whole photograph - contradict the constant it is built from.
  expect({ method: observed.method, contentType: observed.contentType }).toEqual(EXPECTED_UPLOAD_REQUEST)
  // The length is asserted against the File the page actually built, which is
  // the only thing that can honestly say what it was.
  expect(observed.byteLength).toBe(upload.byteLength)
})

test('the receiver refuses the same PUT with no session, so an upload URL is not a bypass', async ({
  page,
  baseURL,
}, testInfo) => {
  // The token is a capability over one KEY; it is not authentication. The
  // route is guarded, and this is what proves the guard is what answers.
  const upload = await anUploadUrlFor(testInfo)
  const status = await page.evaluate(async (url: string) => {
    const response = await fetch(url, { method: 'PUT', body: new Blob([new Uint8Array(4)]) })
    return response.status
  }, upload.url)

  expect([302, 303, 401, 403]).toContain(status)
})
```

`anUploadUrlFor(testInfo)` is a new helper in `e2e/support/adminSession.ts`, beside `aSignedInSession`: it creates a fixture journey, plans one slot for it, and returns `{ url, contentType, byteLength }` — mints the URL through the same `createLocalStorage(MEDIA_DIR).uploadUrl` the app uses, so the browser is handed a genuine presigned URL and not a hand-built one. **Defined in this step.** `EXPECTED_UPLOAD_REQUEST` is imported from `apps/web/lib/media/uploadContract.ts`; `e2e/tsconfig.json` already includes the app's `lib`, so the import resolves.

Also in this step: add `e2e/upload.spec.ts` to the `test:e2e` script in `package.json` **and** to the explicit spec list in `.github/workflows/ci.yml`'s `browser` job. Both are lists named file-by-file so an omission shows in a diff, and `e2e/ciRegistration.test.ts` fails when the two disagree — **read that file's expectations before editing either list.**

- [ ] **Step 6: Mutations — two, run separately**

1. Change `EXPECTED_UPLOAD_REQUEST.contentType` to `'application/octet-stream'`.
   **Must fail:** `a real browser PUT reaches the receiver and the bytes land`, on the shape comparison. That is the drift detector proving it detects drift — and it is the only mutation in this phase whose failure mode is a _test_ being wrong rather than the code.
2. In `apps/web/app/(admin)/admin/media/upload/route.ts`, unwrap `guarded`.
   **Must fail:** `the receiver refuses the same PUT with no session, so an upload URL is not a bypass`, **and** `npm run lint`. Paste both, because two mechanisms cover this and it should be clear that neither is carrying it alone.

Restore after each. **Paste all four runs.**

- [ ] **Step 7: Commit**

```
test(media): prove the round trip, the strip and both refusals
```

Body: which exit criterion each case discharges; that the EXIF assertion reads the stored bytes through the port and uses a probe independent of the stripper; that the tier counts are written at six and seven **before** Task 10 adds `grid`, deliberately, so the tier cannot be forgotten silently; and that the schema-pinning case exists to stop criterion 5 being satisfied by deleting the two video types.

---

## Task 10: ADR 0013's deferred ~700px tier, the re-derivation, and the gallery gate re-measured

**Carry-forward 1.** ADR 0013 took Option 1 (raise the gate to 600,000) and deferred Option 3 — "the right answer" — to this phase, with an instruction: "Phase 3 should read this ADR before it touches `imageSizes` again", and "add the ~700px tier Option 3 describes and lower this gate again once every `media` row carries it — at which point 600,000 should be re-measured against real photographs, not raised further on faith."

**Why the tier is needed, in ADR 0013's own measured terms.** At Lighthouse's 412px emulated viewport the gallery grid is one column, so a tile is 376 CSS px, and at DPR 1.75 that needs **658 device pixels**. The `srcset` offers 400w and 800w, so the browser correctly takes the 800w candidate — 173,579 to 477,329 bytes for the same nine requests. There is no rung between `thumb` and `tile` to soften it. A 700-wide rung serves a 658px need almost exactly.

**Files:**

- Modify: `apps/web/collections/media.ts`, `apps/web/collections/collections.integration.test.ts`, `apps/web/migrations/index.ts`, `apps/web/payload-types.ts`, `apps/web/lib/readGalleryBundle.ts`, `apps/web/lib/readGalleryBundle.integration.test.ts`, `lighthouserc.json`, `docs/adr/0013-gallery-image-budget.md`, `docs/data-model.md`, `package.json`
- Create: the generated `*_add_media_grid_tier.ts` migration and its `.json`; `apps/web/scripts/rederive-media.ts` + `rederive-media.integration.test.ts`

**Interfaces:**

- Consumes: `runMigrationDirection`, `getTestPayload`, `Client`, `env.DATABASE_URL`, `createLocalStorage`, `MEDIA_DIR`, `TILE_TIERS` (module-private in `readGalleryBundle.ts`).
- Produces: a `grid` entry in `imageSizes`; `mediaGridTierSchema()` and `MEDIA_GRID_TIER_SCHEMA` in the collections test file; `rederiveMedia(deps: { readonly payload: ...; readonly storage: StoragePort }): Promise<{ readonly rederived: number; readonly skipped: readonly string[] }>` in the script module; and an `npm run media:rederive` script delegating to `apps/web`.

- [ ] **Step 1: Write the failing reversibility test first**

Same shape as Task 5's, asserting on the columns Payload's Postgres adapter adds for one `imageSize` — `sizes_grid_url`, `sizes_grid_width`, `sizes_grid_height`, `sizes_grid_mime_type`, `sizes_grid_filesize`, `sizes_grid_filename` — **and on the `media` table surviving**:

```ts
/** The migration that adds ADR 0013's deferred intermediate tier (Phase 3 Task 10). */
const MEDIA_GRID_TIER_MIGRATION = '<the generated name>'

/**
 * Which of the six columns one imageSize adds currently exist, plus the table.
 *
 * All six rather than one: Payload derives a column per size FIELD, and a
 * `down()` that dropped `sizes_grid_url` alone would leave five orphans that
 * its own `up()` could not re-add.
 * @returns The artefacts that exist, sorted, so an assertion reads as a set.
 */
const mediaGridTierSchema = async (): Promise<string[]> => {
  /* information_schema, as sessionExpirySchema does */
}

/** Every artefact `mediaGridTierSchema` looks for, when the migration is applied. */
const MEDIA_GRID_TIER_SCHEMA = [
  'media-table',
  'sizes_grid_filename',
  'sizes_grid_filesize',
  'sizes_grid_height',
  'sizes_grid_mime_type',
  'sizes_grid_url',
  'sizes_grid_width',
]
```

and the case, rolling **that migration alone** down and up with a real media row present, exactly as Task 5's does.

- [ ] **Step 2: Run it, watch it fail, add the tier and generate the migration**

In `apps/web/collections/media.ts`, **between `thumb` and `tile`**, so the ladder reads in order:

```ts
      {
        name: 'grid',
        width: 700,
        height: 700,
        // ADR 0013 Option 3, deferred to this phase by that ADR and taken
        // here. A one-column gallery tile at 412 CSS px and DPR 1.75 needs
        // 658 device pixels; without a rung here the browser correctly takes
        // the 800px `tile` and the gallery pays 477,329 bytes for nine
        // images. Square, like `thumb` and `tile`, because a gallery tile is.
      },
```

Generate, hand-fix and register the migration exactly as Task 5 Step 3 lists. Regenerate `payload-types.ts`.

- [ ] **Step 3: Write the failing re-derivation test, then the script**

Every existing row — the seeded placeholders and anything Task 9 created — has five tiers and no `grid`. ADR 0013's instruction is explicit that the gate moves "once every `media` row carries it".

```ts
it('gives an existing row the new tier without changing its id or its caption', async () => {
  // Re-deriving must not be a re-upload: the diary addresses media by id
  // (CLAUDE.md section 7), so a script that created new rows would break
  // every `pages.slots[].media` reference in the book.
  const payload = await getTestPayload()
  const before = await aRowWithoutTheGridTier()

  const summary = await rederiveMedia({ payload, storage: aStore() })

  const after = await payload.findByID({
    collection: 'media',
    id: before.id,
    depth: 0,
    select: { sizes: true, caption: true },
  })
  expect(summary.rederived).toBeGreaterThan(0)
  expect(after.sizes?.grid?.filename).toBeTypeOf('string')
  expect(after.caption).toBe(before.caption)
})

it('reports rather than throws for a row whose original is missing from the store', async () => {
  // A store missing a file is a real state (the 500 that Phase 1 Task 10
  // found). The script must name the row and carry on, not abort the run
  // halfway through the collection.
  const orphan = await aRowWhoseFileWasDeleted()

  const summary = await rederiveMedia({ payload: await getTestPayload(), storage: aStore() })

  expect(summary.skipped).toContain(String(orphan.id))
})

it('is idempotent, so a second run changes nothing', async () => {
  await rederiveMedia({ payload: await getTestPayload(), storage: aStore() })
  const first = await sizesSnapshot()

  await rederiveMedia({ payload: await getTestPayload(), storage: aStore() })

  expect(await sizesSnapshot()).toEqual(first)
})
```

`aRowWithoutTheGridTier`, `aRowWhoseFileWasDeleted`, `aStore` and `sizesSnapshot` are helpers in that test file, **defined in this step**. `rederiveMedia` reads each row's original through the port and calls `payload.update({ collection: 'media', id, file: { data, mimetype, name, size } })`, which is what makes Payload re-run its own derivative generation — **the same `file` shape `apps/web/scripts/seed.ts` already uses.**

Add `"media:rederive": "npm run media:rederive -w apps/web"` to the root `package.json` and the workspace script beside `db:seed`, and document it in `docs/runbook.md` — it is an operational step a deploy needs, not a one-off.

- [ ] **Step 4: Put `grid` into the tile `srcset`, failing test first**

In `apps/web/lib/readGalleryBundle.integration.test.ts`:

```ts
it('offers the grid tier as a srcset candidate, with its own width descriptor', async () => {
  // A tier the row carries but the srcset never names is a tier the browser
  // cannot choose - which is the whole of ADR 0013 Option 3 undone by an
  // omission in one array.
  const bundle = await readGalleryBundle(A_SEEDED_GALLERY_SLUG)
  const frame = bundle.ok ? bundle.value.frames[0] : undefined

  expect(frame?.tileSrcSet).toContain('700w')
})
```

Run it, watch it fail, then add `'grid'` to `TILE_TIERS` **between `'thumb'` and `'tile'`** — the array's order is its preference order, and `tileSrcSet` reads each tier's real stored width rather than the configured one, so no width literal needs changing. Extend that constant's comment with ADR 0013's number (658 device pixels at 412 CSS px and DPR 1.75).

`A_SEEDED_GALLERY_SLUG` is whatever that test file already uses for the Patagonia gallery — **read it and reuse it**, rather than adding a second constant.

- [ ] **Step 5: Re-measure the gate. Do not raise it.**

Run, in order, and paste every number:

```
npm run db:migrate && npm run media:rederive && npm run db:seed
npm run test:perf
```

Then set `lighthouserc.json`'s `/gallery/<slug>` `resource-summary:image:size` to the measured median **plus the headroom ADR 0013's reason 1 asks for** (a real photograph compresses larger than a stripe-pattern PNG fixture). ADR 0013's own arithmetic is the model to follow: it set 600,000 against a measured 477,329, so the headroom was about 25%.

**Three rules, and they are not negotiable:**

1. **If the number went down, lower the gate.** That is what this task is for. Record the before and after in ADR 0013's Consequences.
2. **If the number went up, do not raise the gate.** `CLAUDE.md` §6: budgets are hard gates. Report the number, say why, and stop — a tier meant to reduce bytes that increased them is a finding, not a config change.
3. **Keep `numberOfRuns: 5` and `aggregationMethod: "median"` untouched**, per ADR 0013's own "What this decision does not change".

Then **re-verify the gate still detects the failure it exists for**, the way ADR 0013 did rather than by assertion: flip `Tile.tsx`'s `loading="lazy"` to `"eager"` on a throwaway local build, nothing committed, measure the same route once under the same settings, and confirm the number is still comfortably red. ADR 0013 measured 60 requests and 4,600,585 bytes. **Paste both numbers.** A gate lowered without this check is a gate nobody has proven is still a detector.

- [ ] **Step 6: Re-run Tasks 8 and 9's tier assertions as this task's proof**

```
npm run test:integration -- apps/web/lib/media/ingestUpload.integration.test.ts apps/web/lib/media/roundTrip.integration.test.ts
```

Expected: the two cases those tasks deliberately left failing — `creates a ready row carrying every derivative tier, from the sanitised bytes` (six tier names) and `leaves no EXIF in any stored derivative, having proven the upload carried some` (seven files) — **now pass**. Paste the before and after. Those two failures were this task's acceptance test, written two tasks early on purpose.

- [ ] **Step 7: Mutation**

Remove `'grid'` from `TILE_TIERS` but leave it in `imageSizes`.
**Must fail:** `offers the grid tier as a srcset candidate, with its own width descriptor`.
The two tier-count assertions keep passing, because the row still carries the derivative — which is exactly the half-done state this mutation exists to make visible: the tier is generated, stored, paid for in R2, and never served.
Restore, re-run, **paste both**.

- [ ] **Step 8: Update ADR 0013 and commit**

ADR 0013's Consequences gains: that Option 3 was taken in Phase 3, the measured before and after, the re-verified regression number, and the fact that the gate now sits on a re-derived corpus rather than a defect's footprint. Do **not** rewrite its Decision — it recorded a decision that was correct at the time, and rewriting history is not how that ADR is closed.

Three commits:

```
feat(media): add ADR 0013s deferred 700px gallery derivative tier
```

```
feat(media): re-derive every stored row so it carries the grid tier
```

```
perf(diary): lower the gallery image gate onto the re-derived corpus
```

Bodies: ADR 0013's 658-device-pixel measurement; that re-derivation updates rows in place because the diary addresses media by id; and, in the third, the four numbers (before, after, the gate, and the lazy-load regression) with the command that produced each.

---

## Task 11: The download handler — private caching under `passwordProtect`, and the new tier

**Carry-forward 2.** `apps/web/app/(diary)/gallery/[slug]/download/[id]/route.ts` currently sends `Cache-Control: public, max-age=3600`, and its own comment names the debt:

> "`public` IS CORRECT TODAY AND BECOMES WRONG THE MOMENT A JOURNEY IS GATED... the first time a gate exists in front of a journey, this header must become `private` (or `no-store`) for a gated one, because a `public` response is cacheable by any proxy between us and the reader and would outlive the gate... Revisit with `passwordProtect`, in the same change that adds the gate."

`site.passwordProtect` exists as a checkbox defaulting to `false`. So the flag to condition on **does** exist; what did not exist was a reader for it in this path. This task adds one.

**Files:**

- Modify: `packages/domain/src/galleryDownload.ts` + its test, `apps/web/lib/readGalleryDownload.ts` + its integration test, `apps/web/app/(diary)/gallery/[slug]/download/[id]/route.ts`, `e2e/gallery.spec.ts`, `docs/security.md`, `docs/api.md`

**Interfaces:**

- Consumes: `downloadContentType`, `downloadFilename`, `DOWNLOAD_TIERS`, `readGalleryDownload`, `Attachment`, `payload.findGlobal`.
- Produces: `downloadCacheControl(options: { readonly gated: boolean }): string` in `packages/domain/src/galleryDownload.ts`, and `Attachment` gaining `readonly cacheControl: string`.

- [ ] **Step 1: Write the failing pure test**

In `packages/domain/src/galleryDownload.test.ts`:

```ts
describe('downloadCacheControl', () => {
  it('lets a shared cache keep an ungated derivative for an hour', () => {
    expect(downloadCacheControl({ gated: false })).toBe('public, max-age=3600')
  })

  it('forbids a shared cache from keeping a gated one at all', () => {
    // A `public` response is cacheable by any proxy between us and the
    // reader, and would outlive the gate - so turning passwordProtect on
    // would leave the derivative served from a cache that never heard about
    // it. `no-store` rather than `private, max-age=0` because the reader's own
    // browser cache is a shared machine often enough.
    expect(downloadCacheControl({ gated: true })).toBe('private, no-store')
  })
})
```

An options object rather than a boolean parameter, per `CLAUDE.md` §3.2 — `downloadCacheControl(true)` says nothing at the call site.

- [ ] **Step 2: Run, watch fail, implement, then thread it through**

Run: `npx vitest run --project unit packages/domain/src/galleryDownload.test.ts` — FAIL on the missing export.

Then `readGalleryDownload` reads the flag and returns it on the `Attachment`:

```ts
// ONE MORE GLOBAL READ, `select`ed to the single field (CLAUDE.md §7:
// select only what is needed, and set `depth` explicitly). It is read here
// rather than in the route because a route handler cannot be tested without
// a request context - the same split this module's header already argues
// for the other four checks.
const site = await payload.findGlobal({ slug: 'site', depth: 0, select: { passwordProtect: true } })
```

and the route sends `attachment.value.cacheControl` in place of the literal. **The route's long `Cache-Control` comment is replaced, not left standing** — `CLAUDE.md` §1.3: "A stale document is worse than none". Its replacement points at `downloadCacheControl` and says the revisit was discharged in Phase 3.

Also add `'grid'` to `DOWNLOAD_TIERS`, between `'tile'` and `'thumb'`:

```ts
const DOWNLOAD_TIERS = ['hero', 'frame', 'tile', 'grid', 'thumb'] as const
```

so a row that could only derive as far as `grid` is still downloadable. `hero2x` stays out, for the reason already written there.

- [ ] **Step 3: Write the failing integration tests**

```ts
it('marks an ungated download cacheable by a shared cache', async () => {
  const attachment = await readGalleryDownload(A_SEEDED_GALLERY_SLUG, aSeededFrameId())

  expect(attachment.ok ? attachment.value.cacheControl : null).toBe('public, max-age=3600')
})

it('marks every download uncacheable once the whole book is password protected', async () => {
  // SECURITY.md: "The `password the whole book` setting must gate
  // server-side." A gate the CDN never heard about is a client-side check
  // wearing a server's clothes.
  await withPasswordProtect(true, async () => {
    const attachment = await readGalleryDownload(A_SEEDED_GALLERY_SLUG, aSeededFrameId())

    expect(attachment.ok ? attachment.value.cacheControl : null).toBe('private, no-store')
  })
})

it('reads the site global exactly once per download, so the header costs no extra round trip', async () => {
  const spy = vi.spyOn(await getPayload(), 'findGlobal')

  await readGalleryDownload(A_SEEDED_GALLERY_SLUG, aSeededFrameId())

  expect(spy.mock.calls).toHaveLength(1)
  expect(spy.mock.calls[0]?.[0]).toMatchObject({ depth: 0, select: { passwordProtect: true } })
  spy.mockRestore()
})

it('serves the grid derivative when it is the largest tier a row carries', async () => {
  const narrow = await aRowWithOnlyTheSmallTiers()

  const attachment = await readGalleryDownload(A_SEEDED_GALLERY_SLUG, narrow)

  expect(attachment.ok).toBe(true)
})
```

`withPasswordProtect(value, body)` sets the global, runs the body and **restores the previous value in a `finally`** — a helper defined in this step, and the restore is not optional: every later case in the file would otherwise run against a gated site. `aSeededFrameId()` and `aRowWithOnlyTheSmallTiers()` are two more helpers in that file. `readGalleryDownload.integration.test.ts` already spies on `findGlobal` elsewhere in the suite family (`readBookBundle.integration.test.ts` does) — **follow that file's pattern rather than inventing a second.**

- [ ] **Step 4: Mutation**

Change `downloadCacheControl` to return `'public, max-age=3600'` unconditionally.
**Must fail:** `marks every download uncacheable once the whole book is password protected` **and** `forbids a shared cache from keeping a gated one at all`. Two mechanisms, one at each layer, which is why both cases exist.
Restore, re-run, **paste both**.

- [ ] **Step 5: Browser check, then commit**

A Playwright case in `e2e/gallery.spec.ts` asserting the response header on a real download response, since a header is exactly the thing a unit test can be right about while the route is wrong:

```ts
test('the download response carries the attachment headers and a cache policy', async ({ page }) => {
  const response = await page.request.get(await aSeededDownloadPath())

  expect(response.headers()['content-disposition']).toContain('attachment')
  expect(response.headers()['x-content-type-options']).toBe('nosniff')
  expect(response.headers()['cache-control']).toBe('public, max-age=3600')
})
```

`aSeededDownloadPath()` is a helper in that spec file — **read whether one already exists there**, since the gallery spec already exercises the download action.

```
fix(diary): make a gated derivative uncacheable by a shared cache
```

Body: the exact debt Phase 2 recorded and where; why `no-store` rather than `private, max-age=0`; that the flag existed and only its reader did not; that `grid` joins `DOWNLOAD_TIERS`; and that the route's old explanatory comment was **replaced** rather than left standing beside code that no longer matches it.

---

## Task 12: `e2e/flip.spec.ts:157`'s ~2% flake, fixed through the `fixing-browser-defects` discipline

**REQUIRED SUB-SKILL: `fixing-browser-defects`.** `CLAUDE.md` §10: "never patch a defect straight from a sweep. A fix without a test that failed first proves nothing and guards nothing — the test can never fail again, so it never catches the regression." An assertion edit that makes a flake stop is exactly the patch that rule forbids.

**The defect.** `e2e/flip.spec.ts:157`, `publishes no page but the one it left and the one it was asked for, for the whole of a bookmark jump`, fails roughly 2% of runs. Two Phase 2 reviews confirmed it is **test-side**.

**The root cause, named precisely, because the fix follows from it.** The case polls one tuple every 40 ms —

```
counter | page label | aria-current bookmark | location.pathname
```

— and asserts the set of distinct readings is exactly `[origin, '02 / 33 | Contents | 1 | /p/2']`. Three of those four are the book's **published identity**, written in one React commit. The fourth is the **address**, written by a separate `useEffect` in `apps/web/components/book/Book.tsx` — `window.history.replaceState(null, '', pagePath(state.index))`, keyed on `[state.index, complete]` — which runs after the render that already shows the new counter. So there is a window of up to one 40 ms poll in which the tuple reads `02 / 33 | Contents | 1 | /p/30`: a value that is neither end, and the assertion fails.

**And the application is right.** `Book.tsx`'s header already says so, deliberately and at length: "SO THE ADDRESS CAN LAG A COMMITTED TURN, AND THAT IS A KNOWN COST RATHER THAN AN INVARIANT", held open because writing the address earlier costs a remount (ADR 0009). **Nothing in `Book.tsx` changes in this task.** The case asserted a coupling the application never promised. Published page identities are only ever the two ends; the address is a separate series that settles.

**Files:**

- Modify: `e2e/flip.spec.ts`, `e2e/support/liveBook.ts`
- Create: `docs/qa/2026-09-08-flip-address-lag-defect.md` — the `fixing-browser-defects` record

**Interfaces:**

- Consumes: `waitForLiveBook`, `wholeBookPath` (`e2e/support/liveBook.ts`).
- Produces: `deferAddressWrites(page: Page, options: { readonly delayMs: number }): Promise<void>` in `e2e/support/liveBook.ts`.

- [ ] **Step 1: Reproduce it deterministically — this is the failing test**

A 2% flake cannot be watched to fail on demand, so the reproduction makes the lag **certain** rather than occasional. Add to `e2e/support/liveBook.ts`:

```ts
/**
 * Delays every `history.replaceState` this page makes.
 *
 * `Book.tsx` writes the address from an effect that runs after the render
 * naming the new page, so the address lags a committed turn by up to one
 * frame - a cost that file's header records deliberately (ADR 0009), not a
 * defect. A poll that reads the address AS PART OF the page's identity
 * therefore has a window in which it sees a tuple that is neither end, which
 * is `e2e/flip.spec.ts`'s ~2% flake. This makes that window WIDE, so a case
 * about it fails or passes on purpose rather than 2% of the time.
 *
 * `addInitScript` rather than `evaluate`: it must be installed before the
 * page's own scripts run, or the book has already captured `replaceState`.
 * @param page - The page to install it on, before `goto`.
 * @param options - `delayMs` must exceed the polling interval of whichever
 *   case uses it, or the widened window is still narrower than one poll.
 */
export const deferAddressWrites = async (page: Page, options: { readonly delayMs: number }): Promise<void> => {
  await page.addInitScript((delay: number) => {
    const original = window.history.replaceState.bind(window.history)
    window.history.replaceState = (...args: Parameters<History['replaceState']>): void => {
      setTimeout(() => {
        original(...args)
      }, delay)
    }
  }, options.delayMs)
}
```

No `any`: the arguments are typed `Parameters<History['replaceState']>` and spread, so the signature is the real one.

- [ ] **Step 2: Watch the existing case fail, with the lag installed**

Temporarily add `await deferAddressWrites(page, { delayMs: 200 })` before the `page.goto(wholeBookPath(30))` in the **existing, unmodified** case, and run:

```
npx playwright test e2e/flip.spec.ts -g "publishes no page but the one it left" --repeat-each=5
```

Expected: **5 of 5 fail**, with `published.seen` carrying a third reading whose first three fields are the destination and whose fourth is `/p/30`. **Paste it.** That output is the diagnosis: it shows in one line that the extra reading differs from the destination in the address and nowhere else — the root-cause argument made by the machine rather than asserted by a human.

Then run the same command **without** the lag at `--repeat-each=50` and paste that too. It will mostly pass, which is what a 2% flake looks like and why Step 1 exists.

- [ ] **Step 3: Split the two series**

Rewrite the case's `page.evaluate` to gather **two** ordered, adjacent-deduplicated series instead of one tuple:

```ts
const published = await page.evaluate(
  async (): Promise<{ readonly identities: readonly string[]; readonly addresses: readonly string[] }> => {
    // THE PUBLISHED PAGE, which is what PH1-001 was about: the counter, the
    // label under it, and the tab the rail marks. All three are written in
    // ONE React commit, so a reading of them is always self-consistent.
    const identity = (): string =>
      [
        document.querySelector('[data-counter]')?.textContent ?? 'no counter',
        document.querySelector('[data-page-label]')?.textContent ?? 'no label',
        document.querySelector('[data-bookmark][aria-current="page"]')?.getAttribute('data-bookmark') ?? 'no tab',
      ].join(' | ')

    // THE ADDRESS, as its own series. `Book.tsx` writes it from a separate
    // effect and its header records that it can lag a committed turn (ADR
    // 0009). Folding it into the identity above is what made this case fail
    // ~2% of runs: the tuple could catch the new page at the old address, a
    // value that is neither end and that the application never promised
    // did not exist.
    const address = (): string => location.pathname

    const identities = [identity()]
    const addresses = [address()]
    const record = (): void => {
      const nextIdentity = identity()
      if (nextIdentity !== identities[identities.length - 1]) identities.push(nextIdentity)
      const nextAddress = address()
      if (nextAddress !== addresses[addresses.length - 1]) addresses.push(nextAddress)
    }

    const tabs = [...document.querySelectorAll<HTMLButtonElement>('[data-bookmark]')]
    const contents = tabs.find((tab) => tab.textContent.includes('Contents'))
    if (contents === undefined) return { identities: ['no Contents bookmark tab in the rail'], addresses: [] }

    contents.click()
    for (let waited = 0; waited < 1_400; waited += 40) {
      await new Promise((resolve) => setTimeout(resolve, 40))
      record()
    }
    return { identities, addresses }
  },
)
```

**Adjacent-deduplicated and ordered, not a `Set`.** The original used `new Set(readings)`, which discards order — so a book that published the destination, went back to the origin and returned would have produced the same set as one that never wavered. Two of the three things this case guards are about order, so the deduplication has to keep it.

- [ ] **Step 4: Write the two assertions, and a third case for the lag**

```ts
// What PH1-001 is actually about: between the two ends, no third page is
// ever published. The origin is read out of the page rather than written
// down, so the case cannot drift from the seed.
expect(published.identities).toEqual([published.identities[0], '02 / 33 | Contents | 1'])

// The address is asserted as its own settling series: it starts where the
// reader was and ends where they went, and never visits a third place.
// Whether it changes on the same poll as the identity is NOT asserted,
// because Book.tsx deliberately does not promise that.
expect(published.addresses).toEqual(['/p/30', '/p/2'])
```

and a **new case that keeps the widened lag permanently**, so the reproduction becomes the regression guard rather than being thrown away:

```ts
test('publishes no third page even when the address write is delayed well past a poll', async ({ page }) => {
  // THE REGRESSION GUARD FOR THIS FIX. Its subject is the identity series,
  // and `deferAddressWrites` proves that series does not depend on when the
  // address is written. Before the fix this case failed 5/5; the old
  // assertion could not distinguish "a third page was published" from "the
  // address had not caught up yet", which is why it failed ~2% of runs
  // without the delay and 100% with it.
  //
  // The address series is NOT asserted here: under a 200ms delay the final
  // write lands after the poll window, and asserting on it would be asserting
  // on the injected delay rather than on the book.
  await deferAddressWrites(page, { delayMs: 200 })
  await page.goto(wholeBookPath(30))
  await waitForLiveBook(page)

  const identities = await pollIdentitiesAfterContentsClick(page)

  expect(identities).toEqual([identities[0], '02 / 33 | Contents | 1'])
})
```

`pollIdentitiesAfterContentsClick(page: Page): Promise<readonly string[]>` is the identity half of Step 3's `page.evaluate`, extracted into one local helper in `e2e/flip.spec.ts` and used by **both** cases so the two cannot drift. **Extract it in Step 3**, so the case above has something to call: the original case then reads its identity series through the same helper and its address series through the second half.

- [ ] **Step 5: Prove the fix, and prove the guard still guards**

Three runs, all pasted:

1. `npx playwright test e2e/flip.spec.ts -g "publishes no page but the one it left" --repeat-each=50` — **50 of 50 pass.** Fifty rather than five: at a 2% base rate, five green runs are what the flake looks like on a good afternoon.
2. `npx playwright test e2e/flip.spec.ts -g "publishes no third page even when the address write is delayed" --repeat-each=10` — 10 of 10 pass.
3. **Mutation.** In `apps/web/components/book/Book.tsx`, temporarily make the flip commit the **anchor** as the reader's index — the PH1-001 defect the case exists for — and run both cases. **Both must fail**, on the identity series carrying a third entry. Restore, re-run, paste. This is the step that answers "seventeen tests in this repository passed while guarding nothing": the point of the fix is a case that still catches the defect it was written for, not a case that stopped failing.

- [ ] **Step 6: Fix the whole defect class**

`CLAUDE.md` §10 and the `fixing-browser-defects` skill both require it. Audit, and record the result:

```
grep -rn "location.pathname\|location.href" e2e/*.spec.ts
```

For **every** hit, decide and write down which of three it is:

- part of a polled tuple alongside page content — **the same defect**, fixed the same way;
- read on its own, or through `expect(page).toHaveURL(...)` — fine, since Playwright's own matcher retries;
- read once after an `await expect(...)` that already settled — fine, and say why.

`e2e/routing.spec.ts` and `e2e/mobile.spec.ts` are the likely neighbours; `e2e/flip.spec.ts`'s own `changes page instantly under prefers-reduced-motion` reads the URL through `toHaveURL` with a timeout and is the second kind. The audit's table goes in the defect report.

- [ ] **Step 7: The defect report, and the commit**

`docs/qa/2026-09-08-flip-address-lag-defect.md`, per `CLAUDE.md` §10 ("a sweep that produces no file did not happen"): what was observed, the reproduction command and its 5/5 output, the root cause with the `Book.tsx` line and header quotation, why the application was **not** changed, the fix, the three verification runs, the mutation result, and the class audit table.

```
fix(diary): decouple the polled page identity from the address
```

Body: the ~2% flake and where; that the address lag is `Book.tsx`'s documented, deliberate cost (ADR 0009) and the test asserted a coupling nothing promised; that the reproduction is kept as a permanent case rather than discarded; the mutation that proves the case still catches PH1-001; and the class audit's outcome.

---

## Task 13: Documentation, ADRs, the browser sweep, and the phase's exit evidence

`CLAUDE.md` §1.3: documentation ships **in the same commit** as the code it describes, so most of this phase's documentation is already written by Tasks 1 to 12. What is left is the phase-level record, the corrections, and the sweep.

**Files:**

- Create: `docs/adr/0021-heic-refused-at-the-port.md`, `docs/adr/0022-perceptual-hashing-and-the-duplicate-threshold.md`
- Modify: `docs/architecture.md`, `docs/data-model.md`, `docs/api.md`, `docs/security.md`, `docs/testing.md`, `docs/runbook.md`, `docs/deviations.md`, `docs/adr/0003-derivative-generation.md`, `docs/adr/0004-media-pipeline-mode.md`, `apps/web/lib/ports/storage.ts`, `.env.example`
- Create: `docs/qa/2026-09-08-media-pipeline-sweep.md`

- [ ] **Step 1: Correct the three stale pointers this phase falsifies**

Phase 2's ninth review found five documents claiming `MediaProcessor` had shipped and corrected them. The same discipline applies to what **this** phase makes false:

| Where                                                       | What it says now                                                                | What it must say                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/lib/ports/storage.ts` header                      | "the Cloudflare R2 adapter in Phase 3"                                          | That Phase 3 added `uploadUrl` and the local receiver, and that the R2 adapter is **not** built — with the reason (no credentials, and §7.1 forbids finding out by sending), pointing at ADR 0020                                                                               |
| `apps/web/lib/adapters/contract/storage-contract.ts` header | "the Cloudflare R2 adapter in Phase 3, unchanged"                               | The same correction, plus that the three `uploadUrl` cases are already in the shared suite waiting for it                                                                                                                                                                       |
| `apps/web/collections/media.ts` header                      | that the `beforeChange` pipeline "is design spec Phase 3 work, not this task's" | That Phase 3 built it, **where** (`stillPipeline.ts` and both adapters), and that it runs at ingest rather than in a Payload hook, with the reason: direct-to-bucket means Payload never sees the unsanitised bytes, so a `beforeChange` hook would never run for a real upload |

That last row is a genuine **deviation from `DATA_MODEL.md`**, which specifies the pipeline as a `beforeChange` hook. The steps and their order are unchanged; only where they run is different, and it is forced by §9.1's direct-to-bucket upload. Carry a `// HANDOFF-DEVIATION:` comment at the point it is relied on and an entry in `docs/deviations.md`.

- [ ] **Step 2: Write the two ADRs**

**ADR 0021 — HEIC refused at the port.** Context: `DATA_MODEL.md` lists `image/heic` in `mimeTypes` and this `sharp` build cannot decode it — with the command and its output, as measured in this plan's Global Constraints. Options: strip the type from the schema (rejected, for the reason ADR 0004 gives for video: it makes re-enabling a schema change); ship a `libheif`-enabled `sharp` (rejected as unearned now, and named as what would reverse this); **refuse at the port** (taken). Consequences: the schema is untouched; an author uploading an iPhone photograph gets a clear refusal rather than a 500; **the decision is revisited when `sharp`'s bundled `heif` gains HEVC input**, and the check that settles it is the one-line `sharp.format.heif` command in this ADR.

**ADR 0022 — perceptual hashing and the duplicate threshold.** Context: spec §9.2 step 6 wants duplicates reported within one journey. Options: exact content hash (rejected — a re-encode is byte-different and visually identical, which is the case that matters); an index or a vector extension (rejected as unearned at ~100 rows per journey); **dHash plus a linear scan** (taken). Consequences: `DUPLICATE_MAX_DISTANCE = 5` of 64 bits, with what that tolerates and what it does not; one query per ingest with the journey in the `where`; and that `media.contentHash` is a **perceptual** hash, which `docs/data-model.md` must say so nobody later treats it as an integrity checksum.

- [ ] **Step 3: Update the eight repository documents**

| Document               | What this phase adds                                                                                                                                                                                                                                                                           |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/architecture.md` | The `MediaProcessor` seam beside `storage`/`mailer`/`queue`; the upload data flow as a Mermaid diagram — **rendered locally or not at all** (§7.1: repository content never goes to an online renderer; if no local Mermaid tool is installed, say the render is UNRESOLVED and name the tool) |
| `docs/data-model.md`   | `state`, `failureReason`, the `grid` tier, the `isCover` hook, migration history for the two new migrations, and that `contentHash` is perceptual                                                                                                                                              |
| `docs/api.md`          | `PUT /admin/media/upload`, `requestUploadSlots`, `finaliseUpload` — input, output, errors and auth requirement each, as that file's format requires; and the download route's new `Cache-Control` behaviour                                                                                    |
| `docs/security.md`     | The five upload rows, each with a real file reference and the test that proves it — the EXIF row, the SVG row, the magic-byte row, the size/count cap row, the download-handler row — plus the `passwordProtect` row Task 11 closes                                                            |
| `docs/testing.md`      | The `MediaProcessor` contract suite and that it runs against both adapters; the clip-toolchain three-case rule and `MEDIA_REQUIRE_CLIP_TOOLCHAIN`; every new coverage `include`/threshold with its measured number; the two new migration reversibility cases                                  |
| `docs/runbook.md`      | `npm run media:rederive` and when a deploy needs it; what a `failed` row means and how to retry it; that enabling clips is `MEDIA_PIPELINE=worker` plus a deployed worker **and** `ffmpeg` on that host                                                                                        |
| `docs/deviations.md`   | §47 HEIC refused at the port; §48 the pipeline runs at ingest rather than in `beforeChange`; §49 the local upload receiver as a development stand-in. **Read the file's own numbering first** — it currently ends at §46                                                                       |
| `.env.example`         | `MEDIA_PIPELINE=inline`, with a pointer to ADR 0004                                                                                                                                                                                                                                            |

- [ ] **Step 4: The browser sweep**

**REQUIRED SUB-SKILL: `sweeping-for-browser-defects`.** `CLAUDE.md` §5 requires a sweep for UI changes, and this phase has two: the gallery's `srcset` gains a candidate, and the download response's headers change. Sweep the gallery route and the download action at each breakpoint, instrumenting `console`, `pageerror` and failed responses **before** walking the route — the handoff's own defect log is mostly silent failures, and a missing derivative is exactly one of them. Commit the report to `docs/qa/2026-09-08-media-pipeline-sweep.md`. **A sweep that produces no file did not happen.** Anything it finds is fixed through `fixing-browser-defects`, failing test first — never patched from the report.

- [ ] **Step 5: Commit**

```
docs(media): record the pipeline, its two ADRs and three corrections
```

Body: which documents changed and why; that the three corrected pointers were made false by this phase's own work; and that the sweep report is committed.

---

## Identifier ledger

Every non-obvious identifier the test snippets above reference, and where it comes from. Phase 2's plan shipped "seven helpers referenced but never defined" and "a type used throughout that did not exist"; this table is the check that catches that species.

### Already in the tree (verified by reading it)

| Identifier                                                                                                                                         | Module                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `Result`, `ok`, `err`, `isOk`                                                                                                                      | `packages/domain/src/result.ts`                                                                                                              |
| `JourneyId`, `MediaId`, `journeyId`, `mediaId`                                                                                                     | `packages/domain/src/ids.ts`                                                                                                                 |
| `aJourney`, `aGalleryFrame`, `aChallenge`, `aPortrait`                                                                                             | `packages/domain/src/testing/factories.ts`                                                                                                   |
| `downloadContentType`, `downloadFilename`, `DownloadableContentType`                                                                               | `packages/domain/src/galleryDownload.ts`                                                                                                     |
| `StoragePort`, `validateStorageKey`                                                                                                                | `apps/web/lib/ports/storage.ts`                                                                                                              |
| `QueuePort`, `ClaimedJob`                                                                                                                          | `apps/web/lib/ports/queue.ts`                                                                                                                |
| `createLocalStorage`                                                                                                                               | `apps/web/lib/adapters/local-storage.ts`                                                                                                     |
| `storageContract`                                                                                                                                  | `apps/web/lib/adapters/contract/storage-contract.ts`                                                                                         |
| `Media`, `MEDIA_DIR`                                                                                                                               | `apps/web/collections/media.ts`                                                                                                              |
| `parseEnv`, `envSchema`, `env`, `Env`                                                                                                              | `apps/web/lib/env.ts`                                                                                                                        |
| `guarded`, `guardedAction`, `requireAdminSession`, `AuthenticatedSession`                                                                          | `apps/web/lib/auth/guard.ts`                                                                                                                 |
| `getPayload`                                                                                                                                       | `apps/web/lib/payload.ts`                                                                                                                    |
| `getTestPayload`                                                                                                                                   | `apps/web/lib/testPayload.ts`                                                                                                                |
| `readGalleryDownload`, `Attachment`                                                                                                                | `apps/web/lib/readGalleryDownload.ts`                                                                                                        |
| `readGalleryBundle`                                                                                                                                | `apps/web/lib/readGalleryBundle.ts`                                                                                                          |
| `runMigrationDirection`, `aTinyPng`, `aReversibilityJourney`, `FIXTURE_SLUGS`, `FIXTURE_MEDIA_ALTS`, `sessionExpirySchema`, `signInAttemptsSchema` | `apps/web/collections/collections.integration.test.ts` (module-private; the new cases live in that same file)                                |
| `aSignedInSession`, `fixtureLabel`, `removeSignedInFixture`, `SESSION_FIXTURE_DOMAIN`                                                              | `e2e/support/adminSession.ts`                                                                                                                |
| `waitForLiveBook`, `waitForWholeBook`, `wholeBookPath`                                                                                             | `e2e/support/liveBook.ts`                                                                                                                    |
| `aValidEnv`                                                                                                                                        | `apps/web/lib/env.test.ts` — **Task 1 Step 1 requires reading that file and using its own name, or adding the factory there if it has none** |
| `A_SEEDED_GALLERY_SLUG`                                                                                                                            | whatever `readGalleryBundle.integration.test.ts` already calls it — **Task 10 Step 4 requires reusing it, not adding a second**              |

### Created by this plan, with the task that creates it

| Identifier                                                                                                                                                                                                    | Created in           | Module                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `aJpegHeader`, `aPngHeader`, `anIsoBmffHeader`, `anSvgDocument`                                                                                                                                               | Task 2 Step 0        | `packages/domain/src/testing/factories.ts`                                                                                                                                                                                                |
| `SniffedType`, `sniffMediaType`                                                                                                                                                                               | Task 2               | `packages/domain/src/media/sniff.ts`                                                                                                                                                                                                      |
| `PipelineMode`, `IngestRefusal`, `AcceptedType`, `acceptedIngestTypes`, `ingestDecision`                                                                                                                      | Task 2               | `packages/domain/src/media/ingestPolicy.ts`                                                                                                                                                                                               |
| `EXIF_CANARY`, `anExifJpeg`                                                                                                                                                                                   | Task 3 Step 1        | `packages/domain/src/testing/factories.ts`                                                                                                                                                                                                |
| `ExifFacts`, `readExifFacts`, `METADATA_MARKERS`, `metadataMarkersIn`                                                                                                                                         | Task 3               | `packages/domain/src/media/exif.ts`                                                                                                                                                                                                       |
| `DHASH_WIDTH`, `DHASH_HEIGHT`, `DUPLICATE_MAX_DISTANCE`, `dHash`, `hammingDistance`, `isPerceptualDuplicate`                                                                                                  | Task 4               | `packages/domain/src/media/perceptualHash.ts`                                                                                                                                                                                             |
| `aGrid`                                                                                                                                                                                                       | Task 4 Step 1        | `perceptualHash.test.ts`, local                                                                                                                                                                                                           |
| `MEDIA_STATE_MIGRATION`, `mediaStateSchema`, `MEDIA_STATE_SCHEMA`, `FIXTURE_MEDIA_STATE_ALT`, `aCoverFixtureJourney`, `createFixtureMedia`                                                                    | Task 5 Steps 1 and 6 | `collections.integration.test.ts`                                                                                                                                                                                                         |
| `UploadedBytes`, `ProcessedStill`, `ProcessedClip`, `Processed`, `ProcessingRefusal`, `MediaProcessor`                                                                                                        | Task 6               | `apps/web/lib/ports/mediaProcessor.ts`                                                                                                                                                                                                    |
| `runStillPipeline`                                                                                                                                                                                            | Task 6 Step 6        | `apps/web/lib/media/stillPipeline.ts`                                                                                                                                                                                                     |
| `ClipToolchain`, `createFfmpegToolchain`, `clipToolchainAvailable`, `clipToolchainForTests`                                                                                                                   | Task 6 Step 5        | `apps/web/lib/media/clipToolchain.ts`                                                                                                                                                                                                     |
| `createInlineMediaProcessor`                                                                                                                                                                                  | Task 6               | `apps/web/lib/adapters/inline-media-processor.ts`                                                                                                                                                                                         |
| `createWorkerMediaProcessor`                                                                                                                                                                                  | Task 6               | `apps/web/lib/adapters/worker-media-processor.ts`                                                                                                                                                                                         |
| `mediaProcessorContract`                                                                                                                                                                                      | Task 6 Step 3        | `apps/web/lib/adapters/contract/media-processor-contract.ts`                                                                                                                                                                              |
| `aPhotograph`, `aPhotographWithExif`, `aReencodedPhotograph`, `aDifferentPhotograph`, `aClip`, `FIXTURE_CAPTURED_AT_EXIF`, `FIXTURE_CAPTURED_AT_ISO`, `rawGradient`, `FIXTURE_SEED`, `DIFFERENT_FIXTURE_SEED` | Task 6 Step 1        | `apps/web/lib/adapters/contract/media-fixtures.ts`. **`EXIF_CANARY` is re-exported from the domain factories here, never redeclared** — two copies of one canary string would drift silently and every absence assertion would still pass |
| `mediaProcessor`                                                                                                                                                                                              | Task 6 Step 7        | `apps/web/lib/media/services.ts`                                                                                                                                                                                                          |
| `UploadUrlOptions`, `StoragePort.uploadUrl`                                                                                                                                                                   | Task 7               | `apps/web/lib/ports/storage.ts`                                                                                                                                                                                                           |
| `MAX_UPLOAD_BYTES`, `MAX_FILES_PER_REQUEST`, `UPLOAD_URL_TTL_SECONDS`, `SlotRefusal`, `RequestedUpload`, `UploadSlotPlan`, `planUploadSlots`                                                                  | Task 7               | `packages/domain/src/media/uploadSlot.ts`                                                                                                                                                                                                 |
| `aJourneyId`, `aRequestedUpload`, `plan`                                                                                                                                                                      | Task 7 Step 1        | `uploadSlot.test.ts`, local                                                                                                                                                                                                               |
| `mintUploadToken`, `verifyUploadToken`                                                                                                                                                                        | Task 7               | `apps/web/lib/media/uploadToken.ts`                                                                                                                                                                                                       |
| `SECRET`, `aTempStore`, `aPutRequest`                                                                                                                                                                         | Task 7 Step 5        | `apps/web/lib/media/testing/uploadProbes.ts` — a module, not locals, because Tasks 8 and 9 import the same three                                                                                                                          |
| `UploadSlotRequest`, `UploadSlotResponse`, `FinaliseRequest`, `FinaliseResponse`, `EXPECTED_UPLOAD_REQUEST`                                                                                                   | Task 7               | `apps/web/lib/media/uploadContract.ts`                                                                                                                                                                                                    |
| `receiveLocalUpload`                                                                                                                                                                                          | Task 7               | `apps/web/lib/media/receiveLocalUpload.ts`                                                                                                                                                                                                |
| `handleLocalUpload`                                                                                                                                                                                           | Task 7 Step 6        | `apps/web/lib/media/localUploadEndpoint.ts`                                                                                                                                                                                               |
| `requestUploadSlots`, `finaliseUpload`                                                                                                                                                                        | Tasks 7 and 8        | `apps/web/app/(admin)/admin/media/actions.ts`                                                                                                                                                                                             |
| `planSlotsFor`                                                                                                                                                                                                | Task 7 Step 7        | `uploadSlots.integration.test.ts`, local                                                                                                                                                                                                  |
| `IngestDeps`, `IngestOutcome`, `IngestRefusalReason`, `IngestInput`, `ingestUpload`                                                                                                                           | Task 8               | `apps/web/lib/media/ingestUpload.ts`                                                                                                                                                                                                      |
| `aFixtureJourney`, `aStagedPhotograph`, `aStagedSvg`, `readMediaRow`, `countMediaRows`, `MediaRowFacts`, `inlineDeps`, `workerDeps`                                                                           | Task 8 Step 1        | `apps/web/lib/media/testing/ingestProbes.ts`                                                                                                                                                                                              |
| `aPublishedFixtureJourney`, `slugOf`, `ingestPhotograph`, `storedFilesFor`                                                                                                                                    | Task 9 Steps 1 and 2 | `apps/web/lib/media/testing/ingestProbes.ts`                                                                                                                                                                                              |
| `anUploadUrlFor`                                                                                                                                                                                              | Task 9 Step 5        | `e2e/support/adminSession.ts`                                                                                                                                                                                                             |
| `MEDIA_GRID_TIER_MIGRATION`, `mediaGridTierSchema`, `MEDIA_GRID_TIER_SCHEMA`                                                                                                                                  | Task 10 Step 1       | `collections.integration.test.ts`                                                                                                                                                                                                         |
| `rederiveMedia`, `aRowWithoutTheGridTier`, `aRowWhoseFileWasDeleted`, `aStore`, `sizesSnapshot`                                                                                                               | Task 10 Step 3       | `apps/web/scripts/rederive-media.ts` and its test                                                                                                                                                                                         |
| `downloadCacheControl`                                                                                                                                                                                        | Task 11              | `packages/domain/src/galleryDownload.ts`                                                                                                                                                                                                  |
| `withPasswordProtect`, `aSeededFrameId`, `aRowWithOnlyTheSmallTiers`                                                                                                                                          | Task 11 Step 3       | `readGalleryDownload.integration.test.ts`, local                                                                                                                                                                                          |
| `aSeededDownloadPath`                                                                                                                                                                                         | Task 11 Step 5       | `e2e/gallery.spec.ts` — **read whether one already exists there**                                                                                                                                                                         |
| `deferAddressWrites`                                                                                                                                                                                          | Task 12 Step 1       | `e2e/support/liveBook.ts`                                                                                                                                                                                                                 |
| `pollIdentitiesAfterContentsClick`                                                                                                                                                                            | Task 12 Step 3       | `e2e/flip.spec.ts`, local to that file and used by both cases                                                                                                                                                                             |

---

## Tensions between the spec and what exists

Named here rather than discovered mid-task. Each has a task that resolves it, or a stated reason it cannot be resolved in this phase.

| Tension                                                                                                                                                                                          | Resolution                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `media.ts`'s `mimeTypes` lists `image/heic`, and this `sharp` build cannot decode it (measured)                                                                                                  | Refused at the port with `'heic-unsupported'`, schema untouched — the same shape ADR 0004 uses for video. ADR 0021, deviation §47                                                                                               |
| `DATA_MODEL.md` specifies the pipeline as a `beforeChange` hook; §9.1's direct-to-bucket upload means Payload never sees the unsanitised bytes, so such a hook would never run for a real upload | The steps and their order are unchanged; they run at ingest. `HANDOFF-DEVIATION` comment plus deviation §48 (Task 13)                                                                                                           |
| `storage.ts` and `storage-contract.ts` both say the R2 adapter arrives "in Phase 3"; there are no credentials, and §7.1 forbids finding out by sending                                           | Phase 3 builds the **seam** (`uploadUrl` plus three shared contract cases) and not the adapter. ADR 0020; the two headers corrected in Task 13                                                                                  |
| The local disk adapter's `signedUrl` returns a `file://` URL, which no browser can PUT to — so "direct to bucket" is not exercisable locally at all                                              | The local receiver at `PUT /admin/media/upload?token=`, guarded and token-scoped. ADR 0020, and its **recorded residual**: the route must be deleted or gated in the same change that adds the R2 adapter                       |
| Spec §9.2 puts derivative generation in our pipeline; Payload generates `imageSizes` itself from whatever file it is handed                                                                      | The processor sanitises and Payload derives from the sanitised bytes. One derivation, not two, and `media.sizes` stays Payload's own — which is what `readGalleryBundle`'s `srcset` already reads                               |
| `processing` and `failed` are barely reachable under `inline`                                                                                                                                    | Stated plainly in Task 8 rather than papered over: `inline` creates once at `ready`, a refusal creates no row, `processing` is the default so a crashed request is visible, and `failed` is the worker's. Asserted, not assumed |
| ADR 0004 leaves "how to test `worker` in CI" to this phase; `ffmpeg` is not installed here                                                                                                       | The still cases — the exit criterion — need no `ffmpeg`. The clip arm has three explicit cases, **fails** rather than skips in CI, and is **UNRESOLVED locally**, with the tool named. Task 6 Step 5                            |
| ADR 0013 says re-measure the gallery gate "against real photographs, not raised further on faith"; the corpus is still stripe-pattern PNG placeholders                                           | Task 10 Step 5 re-measures on the re-derived corpus, keeps ADR 0013's fixture-understatement headroom, and **refuses to raise the gate** if the number went up                                                                  |
| `e2e/flip.spec.ts:157` asserts a coupling `Book.tsx`'s header explicitly declines to promise                                                                                                     | The test changes, the application does not. Task 12                                                                                                                                                                             |

---

## Phase 3 exit criteria

- [ ] **A still survives a full round trip via the `inline` adapter** — Task 9, output pasted
- [ ] **EXIF verifiably absent** — read back out of the store, checked by a probe independent of the stripper, with a positive control in the same test — Task 9
- [ ] **SVG verifiably rejected** — at the slot layer and at ingest, in its `.jpg` disguise, with no row and no stored file — Task 9
- [ ] **Both `MediaProcessor` adapters pass the same contract suite in CI** — Task 6, both suite names in the pasted output
- [ ] **Enabling clips is a config switch, not new code** — `inline` refuses both video types at ingest **while `media.ts`'s `mimeTypes` still lists them**, pinned by its own case — Task 9
- [ ] `npm run verify:full` passes — output pasted
- [ ] Every mutation step run, its named test watched to fail, and both runs pasted
- [ ] ADR 0013's ~700px tier added, every row re-derived, the gallery gate **re-measured and lowered** (or the number reported and the gate left alone), and its lazy-load regression re-verified at ADR 0013's own numbers — Task 10
- [ ] The `passwordProtect` download-cache revisit discharged, and the route's stale comment replaced — Task 11
- [ ] `e2e/flip.spec.ts`'s flake fixed test-first, 50 of 50 green, the reproduction kept as a permanent case, and the class audited — Task 12
- [ ] Every performance gate still green: both diary LCP configs at 3,000ms, gallery LCP 4,000ms, script 184,320 bytes, CLS 0.1, and the gallery image gate at its new number
- [ ] Every new file in a coverage `include` with a **measured** threshold; `packages/domain/src/media/**` at 100/100/100 — report pasted
- [ ] Both new migrations reversible, each with its own case asserting **its own** artefacts, each verified by making `down()` a no-op
- [ ] Typecheck clean, lint clean, `prettier --check` clean, zero warnings
- [ ] No `TODO`, `FIXME`, placeholder or commented-out code
- [ ] Every §1.2 document affected updated in the same commit as its code
- [ ] A committed browser sweep at `docs/qa/2026-09-08-media-pipeline-sweep.md`
- [ ] `docs/security.md`'s five upload rows and the `passwordProtect` row carry real file **and test** references
- [ ] Three ADRs written (0020, 0021, 0022) and three stale pointers corrected
- [ ] Nothing left this machine. Any check needing an absent tool is reported UNRESOLVED with the tool named — as `ffmpeg` already is
