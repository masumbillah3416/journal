# 0021 — `image/heic` is refused at the port, not removed from the schema

## Context

`handoff/design_handoff_travel_diary/DATA_MODEL.md` lists `image/heic` among the `media`
collection's accepted `mimeTypes`, and `apps/web/collections/media.ts` transcribes that
list verbatim. It is not an idle entry: HEIC is what an iPhone photographs in by default,
so it is the format the author of this diary is most likely to hand it.

**This repository's `sharp` cannot decode one.** Measured on the authoring machine rather
than inferred from release notes, with the one-line command that settles it:

```
$ node -e "const sharp=require('sharp');console.log('sharp',sharp.versions.sharp,'libvips',sharp.versions.vips);console.log(JSON.stringify(sharp.format.heif));"
sharp 0.35.4 libvips 8.18.6
{"id":"heif","input":{"file":true,"buffer":true,"stream":true,"fileSuffix":[".avif"]},"output":{"file":true,"buffer":true,"stream":true,"alias":["avif"]}}
```

The `heif` container is compiled in, and it is AV1 only: the input suffix list is
`['.avif']` and the output alias is `avif`. HEIC is the same container carrying HEVC,
which this build has no decoder for. So accepting a HEIC would store an original that no
derivative tier could ever be made from — a row that looks ingested and can never be
displayed — and the failure would arrive as an exception out of `sharp` partway through
`runStillPipeline`, after the bytes had already been staged.

The decision is therefore not "do we support HEIC" — we cannot, here — but **where the
"no" is said, and what it costs to turn into a "yes" later.**

## Options considered

1. **Strip `image/heic` out of `apps/web/collections/media.ts`'s `mimeTypes`.** Rejected,
   for exactly the reason `docs/adr/0004-media-pipeline-mode.md` rejected the same move
   for `video/mp4` and `video/quicktime`: `mimeTypes` is schema, so removing it and
   re-adding it is a migration, and re-enabling HEIC becomes a schema change rather than
   a configuration change. It would also make the collection disagree with
   `DATA_MODEL.md` permanently, for a reason that is a property of one dependency's
   build on one machine.
2. **Ship a `libheif`-enabled `sharp`** — a custom `libvips` with an HEVC decoder, or a
   prebuilt variant that carries one. Rejected as unearned **now**: it is a native
   dependency, a licence question (HEVC is patent-encumbered and that is why the stock
   build omits it), and a second binary to keep working across the developer machine,
   the Vercel runtime and the CI image — bought for a format no upload has yet been
   refused for. **This is what would reverse this ADR**, and it is named here so the
   reversal is a decision rather than a discovery.
3. **Refuse at the port, schema untouched.** Chosen.

## Decision

**`packages/domain/src/media/ingestPolicy.ts` refuses `image/heic` with the named refusal
`'heic-unsupported'`, in both pipeline modes, and `apps/web/collections/media.ts`'s
`mimeTypes` keeps the type exactly as `DATA_MODEL.md` writes it.**

This is the same shape ADR 0004 already applies to video — the schema is the handoff's,
the port is where policy lives — and it means turning HEIC on is deleting one guard
clause, not writing a migration.

Three consequences of that placement are worth stating precisely, because each is pinned
by a case rather than assumed:

- **The refusal names the decoder's limit, not the header.** A HEIC arrives from a real
  browser as `Content-Type: application/octet-stream` (measured in the Task 2 review, by
  posting `photo.heic` through this repository's own Chromium), so the declared type says
  nothing and `'declared-mismatch'` would be a lie about what went wrong. Pinned by
  _"still refuses a HEIC sent as application/octet-stream as unsupported, not as a
  mismatch"_ in `packages/domain/src/media/ingestPolicy.test.ts`.
- **Both modes refuse it.** `'heic-unsupported'` is not conditional on `MEDIA_PIPELINE`:
  the `worker` adapter composes the same `runStillPipeline`, so a HEIC is as undecodable
  there. Pinned by a case asserting the refusal under `'inline'` **and** `'worker'` in
  the same file.
- **`acceptedIngestTypes` never offers it**, so a HEIC is refused a slot before its bytes
  are uploaded at all (`'type-not-offered'`, from `planUploadSlots`) and refused again at
  ingest if one is uploaded to a slot minted for something else. Two layers, the same as
  SVG.

## Consequences

- **The schema is untouched.** `DATA_MODEL.md` and `apps/web/collections/media.ts` still
  agree, and `image/heic` costs nothing while it is refused.
- **An author who uploads an iPhone photograph gets a typed refusal rather than a 500.**
  What is observable today is exactly that: `requestUploadSlots` answers
  `'type-not-offered'` and `ingestUpload` answers `'heic-unsupported'`, both as `Result`
  values a caller must handle, and neither creates a `media` row or a stored file. **No
  admin screen renders either string yet** — the Media screen is not built — so "a clear
  refusal" is a property of the Server Action's answer, not of a rendered message, and
  this ADR does not claim otherwise.
- **Nothing partially ingested exists.** Because the refusal happens before
  `payload.create` (`docs/deviations.md` §50), a HEIC leaves no row to clean up and no
  file in the store. The staged object is deleted on the refusal path like any other.
- **Recorded as a handoff deviation**, `docs/deviations.md` §47, with the
  `// HANDOFF-DEVIATION:` comment carrying the measurement at the refusal itself.
- **What revisits this decision, and the check that settles it.** A `sharp` build whose
  `heif` input reports a `.heic` suffix and an HEVC decoder. **Re-run the one-line
  command at the top of this ADR** — `sharp.format.heif.input.fileSuffix` — before
  deleting anything; the refusal is about this build, not about the format, and a
  `sharp` upgrade is the event that makes it worth re-measuring. Removing the guard is
  then one clause in `ingestPolicy.ts`, one entry in `acceptedIngestTypes`'s still list,
  the two cases above inverted, and this ADR superseded — with no migration.
