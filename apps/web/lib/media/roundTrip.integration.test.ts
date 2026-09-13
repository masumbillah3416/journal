/**
 * roundTrip.integration.test.ts — Phase 3's exit criteria, stated as cases
 * against the running system rather than as claims about it.
 *
 * Four criteria are settled here. **1**: a still round-trips from a presigned
 * slot to a downloadable derivative. **2**: EXIF is verifiably absent from the
 * STORED bytes. **3**: an SVG is verifiably rejected. **5**: clips are
 * deferred, at the port, with the schema untouched. The fourth — both
 * `MediaProcessor` adapters under one contract suite — is
 * `../adapters/contract/media-processor-contract.ts`'s, run against each
 * adapter by its own file, and is not restated here.
 *
 * ═══ WHY A FILE OF ITS OWN, WHEN `ingestUpload.integration.test.ts` EXISTS ═══
 *
 * That file proves what ingest DECIDES. This one proves what the system LEFT
 * BEHIND. They are different sentences: `stores the re-encode, so what Payload
 * wrote carries none of the metadata the staged original did` reads one file —
 * the row's own — through `node:fs`. The criterion says "verified by reading
 * the stored bytes", plural and without exception, so every derivative is read
 * back too, and read back through the same `StoragePort` a download uses.
 *
 * ═══ THE PROBES SHARE NONE OF THE STRIPPER'S ASSUMPTIONS ═══
 *
 * Three independent needles, because one of them could be satisfied by a
 * broken stripper:
 *
 *   1. `metadataMarkersIn` — the domain's whole-buffer search for segment
 *      headers, which knows nothing of `sharp`.
 *   2. `EXIF_CANARY` — ASCII the fixture hides in `Copyright`, so the search
 *      is for something specific rather than for a marker.
 *   3. `asExifRationals(FIXTURE_GPS_LATITUDE)` — the COORDINATE's own bytes.
 *      A stripper that removed the APP1 header and left its payload where it
 *      sat would satisfy both of the first two and still publish a home
 *      address, which is exactly SECURITY.md's objection.
 *
 * Each is asserted PRESENT in the upload before it is asserted absent from the
 * store. Without that, a fixture that never carried EXIF would discharge the
 * criterion while proving nothing — one of the two fixture defects Phase 2
 * shipped.
 *
 * ═══ THE STORED-FILE COUNT IS DERIVED, NOT WRITTEN DOWN ═══
 *
 * The loop over derivatives is only worth anything if the probe actually
 * returned them all, so the tier names are asserted against
 * `configuredTierNames()` — read off `../../collections/media` — rather than
 * against a literal. Task 10 adds `grid`; this file widens by itself when it
 * does, and `./ingestUpload.integration.test.ts`'s deliberately hard-coded
 * `CONFIGURED_TIERS` is the case that goes RED that day, which is the
 * notification. A committed assertion expected to fail is not available here:
 * CLAUDE.md §0.5 and §8.2 require every commit to pass its own tests, and a
 * red test on the branch makes `git bisect` useless.
 *
 * PATTERN (CLAUDE.md §3.3): none — a test file implements no pattern; the
 * fixtures it drives are Factories.
 * Depends on: vitest; the ingest probes (./testing/ingestProbes);
 * `metadataMarkersIn` and `EXIF_CANARY` from the
 * domain; `anIsoBmffHeader` for the QuickTime brand; the contract suite's
 * `aPhotographWithExif`, `aPhotograph`, `aClip` and `FIXTURE_GPS_LATITUDE`; `Media`, for the
 * `mimeTypes` one case pins; `SECRET` and `aPutRequest` (./testing/uploadProbes),
 * so the PUT this file builds is the shape Task 7 measured; `readGalleryDownload`,
 * which is where a reader actually collects a derivative.
 */
import { afterAll, describe, expect, it } from 'vitest'
import { MAX_UPLOAD_BYTES, planUploadSlots } from '@travel-diary/domain/media/uploadSlot'
import { metadataMarkersIn } from '@travel-diary/domain/media/exif'
import { EXIF_CANARY, anIsoBmffHeader } from '@travel-diary/domain/testing/bytes'
import { Media } from '../../collections/media'
import { FIXTURE_GPS_LATITUDE, aClip, aPhotograph, aPhotographWithExif } from '../adapters/contract/media-fixtures'
import { readGalleryDownload } from '../readGalleryDownload'
import { ingestUpload } from './ingestUpload'
import { mintUploadToken } from './uploadToken'
import { receiveLocalUpload } from './receiveLocalUpload'
import {
  aFixtureJourney,
  aStagedClip,
  aStagedSvg,
  aTempStore,
  asExifRationals,
  configuredTierNames,
  countMediaRows,
  ingestPhotograph,
  inlineDeps,
  removeIngestFixtures,
  slugOf,
  storedFilesFor,
} from './testing/ingestProbes'
import { SECRET, aPutRequest } from './testing/uploadProbes'

/**
 * How long a case that runs a real ingest is given.
 *
 * THE SAME BUDGET `./ingestUpload.integration.test.ts` states the arithmetic
 * for, re-measured here: the EXIF case encodes a 3000x4000 JPEG, re-encodes it
 * through `mozjpeg`, has Payload derive every tier from it and then reads
 * every stored file back off the store — 9.9s, against a harness default of 5,000ms it
 * was never going to fit. Thirty seconds is three times the measurement, and a
 * case that discovers its own budget in a merge gate is a flake somebody
 * deletes as tidying.
 */
const INGEST_BUDGET_MS = 30_000

/**
 * A photograph whose STORED form is wide enough for every configured tier.
 *
 * READ OFF THE COLLECTION for the reason `./ingestUpload.integration.test.ts`
 * gives, and PORTRAIT for the reason its own helper gives: the fixture writes
 * orientation 6 and `runStillPipeline` auto-orients, so the bytes Payload
 * derives from are this size transposed, and a width-only tier at the widest
 * configured width is only derived when the SOURCE is that tall.
 * @returns A portrait size whose stored, auto-oriented form is the widest
 *   configured width by a 4:3 height.
 */
const wideEnoughForEveryTier = (): { readonly width: number; readonly height: number } => {
  const upload = Media.upload
  /* c8 ignore next -- no organic trigger: the collection is an upload collection configuring five image sizes; `configuredTierNames` names the absence if that ever stops being true, and the tier assertion below would fail first. */
  if (typeof upload !== 'object' || upload.imageSizes === undefined) throw new Error('no image sizes are configured')
  const storedWidth = Math.max(...upload.imageSizes.map((size) => size.width ?? 0))
  return { width: Math.round((storedWidth * 3) / 4), height: storedWidth }
}

describe('the phase exit criteria', () => {
  afterAll(removeIngestFixtures)

  it(
    'carries a still from a presigned slot to a downloadable derivative',
    async () => {
      // EXIT CRITERION 1. Every seam in the phase, in order, with nothing
      // stubbed but the browser: plan the slot, PUT through the receiver,
      // ingest, then ask the download handler for it the way the gallery does.
      const journey = await aFixtureJourney()
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
    },
    INGEST_BUDGET_MS,
  )

  it(
    'leaves no EXIF in any stored derivative, having proven the upload carried some',
    async () => {
      // EXIT CRITERION 2, read literally: "verified by reading the stored
      // bytes, not by trusting the library". So every assertion below is over
      // bytes fetched back OUT of the store through the StoragePort - the
      // original that Payload wrote, and every derivative - and the probes
      // share none of sharp's assumptions.
      const uploaded = await aPhotographWithExif(wideEnoughForEveryTier())

      // POSITIVE CONTROL. Without these two lines the whole case would pass
      // against a fixture that never had EXIF, which is one of the two shapes
      // of fixture defect Phase 2 shipped.
      expect(metadataMarkersIn(uploaded)).toContain('exif')
      expect(Buffer.from(uploaded).includes(EXIF_CANARY)).toBe(true)

      const stored = await storedFilesFor(await ingestPhotograph({ bytes: uploaded }))

      // THE COUNT AND THE NAMES TOGETHER, because a probe that silently
      // returned four files would make the loop under it vacuous. Derived from
      // the collection - see this module's header.
      expect(stored.map((file) => file.tier).sort()).toEqual(['original', ...(await configuredTierNames())].sort())
      for (const file of stored) {
        expect(metadataMarkersIn(file.bytes)).toEqual([])
        expect(Buffer.from(file.bytes).includes(EXIF_CANARY)).toBe(false)
      }
    },
    INGEST_BUDGET_MS,
  )

  it(
    'leaves no GPS coordinate bytes in the stored original, checked without any parser at all',
    async () => {
      // The canary is ASCII the fixture put in Copyright; this is the
      // coordinate ITSELF. A third needle, because a stripper that removed the
      // segment header while leaving the payload would satisfy a marker search
      // and a Copyright search both, and still publish a home address.
      const uploaded = await aPhotographWithExif()
      const coordinate = Buffer.from(asExifRationals(FIXTURE_GPS_LATITUDE))

      // BOTH CONTROLS, in the case rather than in prose. The positive one says
      // the upload carried the coordinate; the negative one says twenty-four
      // bytes of it are not something a gradient produces by accident, which
      // is the only thing that makes the absence below mean anything.
      expect(Buffer.from(uploaded).includes(coordinate)).toBe(true)
      expect(Buffer.from(await aPhotograph()).includes(coordinate)).toBe(false)

      const stored = await storedFilesFor(await ingestPhotograph({ bytes: uploaded }))
      const original = stored.find((file) => file.tier === 'original')
      if (original === undefined) throw new Error('no stored original to check')

      expect(Buffer.from(original.bytes).includes(coordinate)).toBe(false)
    },
    INGEST_BUDGET_MS,
  )

  it(
    'rejects an SVG at ingest and stores no file for it',
    async () => {
      // EXIT CRITERION 3, and the reason matters as much as the result: an SVG
      // is an HTML document, so one stored upload becomes stored XSS with the
      // author's own session attached (SECURITY.md). Note the disguise - a
      // .jpg name and a declared image/jpeg - because that is the only form
      // this arrives in: the planner is handed the two still types, so an
      // honestly-declared SVG is never offered a key to be staged at.
      const staged = await aStagedSvg()
      const before = await countMediaRows()

      const ingested = await ingestUpload(staged.input, await inlineDeps(staged.storage))

      expect(ingested).toEqual({ ok: false, error: 'svg-rejected' })
      expect(await countMediaRows()).toBe(before)
      expect(await staged.storage.exists(staged.input.stagingKey)).toBe(false)
    },
    INGEST_BUDGET_MS,
  )

  it('offers no slot for an SVG in the first place, so the refusal is two layers deep', async () => {
    const journey = await aFixtureJourney()

    const planned = planUploadSlots({
      files: [{ filename: 'innocent.svg', declaredType: 'image/svg+xml', byteLength: 400 }],
      acceptedTypes: ['image/jpeg', 'image/png'],
      journey,
      nonce: () => 'x',
    })

    expect(planned).toEqual({ ok: false, error: 'type-not-offered' })
  })

  it(
    'rejects an mp4 at ingest under inline, although the schema lists the type',
    async () => {
      // EXIT CRITERION 5. `media.ts`'s mimeTypes still carries video/mp4 and
      // video/quicktime, untouched (DATA_MODEL.md), and the PORT is what
      // refuses them - which is what makes enabling clips MEDIA_PIPELINE=worker
      // plus a deployed worker, and not a migration.
      const staged = await aStagedClip({ bytes: await aClip() })

      const ingested = await ingestUpload(staged.input, await inlineDeps(staged.storage))

      expect(ingested).toEqual({ ok: false, error: 'video-deferred' })
    },
    INGEST_BUDGET_MS,
  )

  it(
    'rejects a quicktime clip under inline, so neither video type is admitted by omission',
    async () => {
      // Both types, separately. `video/quicktime` is the one a list written
      // once and extended later forgets, and it is in the schema exactly as
      // DATA_MODEL.md wrote it.
      const staged = await aStagedClip({ bytes: anIsoBmffHeader({ brand: 'qt' }) })

      const ingested = await ingestUpload(staged.input, await inlineDeps(staged.storage))

      expect(ingested).toEqual({ ok: false, error: 'video-deferred' })
    },
    INGEST_BUDGET_MS,
  )

  it('still lists both video types in the collections own mimeTypes, so nothing was deleted to make this pass', () => {
    // The temptation is to make the criterion true by narrowing the schema.
    // DATA_MODEL.md is the source of record for the field list and ADR 0004
    // rejected exactly that option, so this case pins the schema against the
    // easy fix.
    const upload = Media.upload
    /* c8 ignore next -- no organic trigger: `media.ts` declares `upload` as an object literal; the narrowing exists because Payload types the field as `UploadConfig | boolean | undefined`. */
    if (typeof upload !== 'object') throw new Error('the media collection is not an upload collection')
    expect(upload.mimeTypes).toEqual(['image/jpeg', 'image/png', 'image/heic', 'video/mp4', 'video/quicktime'])
  })
})
