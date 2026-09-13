/**
 * ingestUpload.integration.test.ts — what a staged upload becomes.
 *
 * AN INTEGRATION TEST because every one of the four things ingest coordinates
 * is real: a real `StoragePort` over a temporary directory, a real
 * `sharp`-backed `MediaProcessor`, the real Postgres `QueuePort`, and the test
 * Payload with its real `media` upload collection deriving real derivative
 * files. Nothing this repository owns is stubbed (CLAUDE.md §2.3) — the only
 * thing that varies between the two dependency sets is the pipeline mode,
 * which is the one configuration switch ADR 0004 requires.
 *
 * IT DRIVES THE SERVICE, NOT THE SERVER ACTION, for the reason
 * `uploadSlots.integration.test.ts` gives: `finaliseUpload` in
 * `apps/web/app/(admin)/admin/media/actions.ts` is `guardedAction(...)` around
 * `finaliseStagedUpload` and nothing else, and a Server Action needs a request
 * context no test process has.
 *
 * ═══ THE TIER LIST IS PINNED TWICE, AND THAT IS DELIBERATE ═══
 *
 * The brief for this task asked for one assertion naming six tiers —
 * `grid` included, before Task 10 adds it — so that adding `grid` and
 * forgetting it would fail something. A committed assertion that is EXPECTED
 * to fail is not available here: CLAUDE.md §8.2 requires every commit to pass
 * its own tests, and a red test on the branch would make `git bisect`
 * useless. So the same guarantee is bought with two green cases instead of
 * one red one. {@link CONFIGURED_TIERS} is the list as of today;
 * “derives every derivative tier the media collection configures” asserts the
 * ROW carries exactly those, and “configures exactly the derivative tiers this
 * suite knows about” asserts the COLLECTION does. Task 10's `grid` fails the
 * second case the moment it is added to `apps/web/collections/media.ts`,
 * which is the notification the brief was buying, and widening the constant
 * then re-arms the first.
 *
 * Depends on: vitest; the probes (./testing/ingestProbes); `getTestPayload`
 * (../testPayload); the `Media` collection, for the tier names it configures;
 * `FIXTURE_CAPTURED_AT_ISO` (../adapters/contract/media-fixtures); the module
 * under test.
 */
import { afterAll, describe, expect, it } from 'vitest'
import type { ImageSize, UploadConfig } from 'payload'
import { journeyId } from '@travel-diary/domain/ids'
import { metadataMarkersIn } from '@travel-diary/domain/media/exif'
import { Media } from '../../collections/media'
import { FIXTURE_CAPTURED_AT_ISO } from '../adapters/contract/media-fixtures'
import { getTestPayload } from '../testPayload'
import { finaliseStagedUpload, ingestUpload } from './ingestUpload'
import {
  aFixtureJourney,
  aStagedPhotograph,
  aStagedSvg,
  aTempStore,
  aTinyPng,
  countMediaRows,
  fillJourneyWithMedia,
  inlineDeps,
  readMediaRow,
  readStoredBytes,
  removeIngestFixtures,
  workerDeps,
} from './testing/ingestProbes'

/**
 * The derivative tiers `apps/web/collections/media.ts` configures today,
 * sorted. See this module's header for why the list is pinned here rather
 * than read off the collection by both cases.
 */
const CONFIGURED_TIERS = ['frame', 'hero', 'hero2x', 'thumb', 'tile'] as const

/**
 * The image sizes the media collection configures.
 * @returns One entry per configured tier.
 * @throws When `Media.upload` is not an object carrying `imageSizes`, which
 *   would mean the collection had stopped deriving tiers at all.
 */
const configuredImageSizes = (): readonly ImageSize[] => {
  const upload: UploadConfig | boolean | undefined = Media.upload
  if (typeof upload !== 'object' || upload.imageSizes === undefined) {
    throw new Error('the media collection configures no image sizes')
  }
  return upload.imageSizes
}

/**
 * A photograph wide enough for every configured tier to have a source.
 *
 * READ OFF THE COLLECTION, never written here: Payload omits a width-only
 * image size whose source is narrower than its target
 * (`payload/dist/uploads/image-resizing/getImageResizeAction.js`), so a
 * fixture narrower than the widest tier would make the case below assert that
 * Payload omitted one. Deriving it means Task 10's `grid` widens the fixture
 * by itself rather than quietly reducing what the case covers.
 * @returns The width and a 4:3 height for it.
 */
const wideEnoughForEveryTier = (): { readonly width: number; readonly height: number } => {
  const width = Math.max(...configuredImageSizes().map((size) => size.width ?? 0))
  return { width, height: Math.round((width * 3) / 4) }
}

/**
 * How long a case that runs a real ingest is given.
 *
 * AN EXPLICIT BUDGET WITH THE ARITHMETIC AT THE LINE, the shape ruling F2
 * settled on: the widest case encodes a 4000x3000 JPEG, re-encodes it through
 * `mozjpeg` and has Payload derive five tiers from it - measured at 6.9s here,
 * against a harness default of 5,000ms it was never going to fit. Thirty
 * seconds is a little over four times the measurement, and a case that
 * discovers its own budget in a merge gate is a flake somebody deletes as
 * tidying.
 */
const INGEST_BUDGET_MS = 30_000

describe('ingestUpload', () => {
  afterAll(removeIngestFixtures)

  it(
    'derives every derivative tier the media collection configures, from the sanitised bytes',
    async () => {
      const staged = await aStagedPhotograph({ withExif: true, ...wideEnoughForEveryTier() })

      const ingested = await ingestUpload(staged.input, await inlineDeps(staged.storage))

      expect(ingested.ok ? ingested.value.kind : null).toBe('ready')
      const row = await readMediaRow(ingested)
      expect(row.state).toBe('ready')
      expect(row.kind).toBe('still')
      expect(Object.keys(row.sizes ?? {}).sort()).toEqual([...CONFIGURED_TIERS])
    },
    INGEST_BUDGET_MS,
  )

  it('configures exactly the derivative tiers this suite knows about, so a new one is not added unnoticed', () => {
    expect(
      configuredImageSizes()
        .map((size) => size.name)
        .sort(),
    ).toEqual([...CONFIGURED_TIERS])
  })

  it(
    'records the capture time it read off the EXIF, before stripping it',
    async () => {
      const staged = await aStagedPhotograph({ withExif: true })

      const ingested = await ingestUpload(staged.input, await inlineDeps(staged.storage))

      // READ BACK IN UTC, AND THAT IS THE POINT RATHER THAN A CONVENIENCE. An
      // EXIF `DateTimeOriginal` carries no zone - it is the wall clock the
      // camera recorded - so the naive string is stored as that wall clock and
      // means the instant it names, wherever it was taken. Asserting the DATE
      // alone (`toContain('2025-03-14')`) would pass or fail on the machine's
      // own offset instead of on what ingest recorded, which is a case that
      // reports the tester's timezone.
      const recorded = (await readMediaRow(ingested)).capturedAt
      expect(new Date(recorded ?? 0).toISOString()).toBe(`${FIXTURE_CAPTURED_AT_ISO}.000Z`)
    },
    INGEST_BUDGET_MS,
  )

  it(
    'stores the re-encode, so what Payload wrote carries none of the metadata the staged original did',
    async () => {
      // THE PHASE'S OWN EXIT CRITERION, reachable end to end for the first time.
      // The positive control is asserted in the same case (`media-fixtures.ts`'s
      // rule): a fixture that never carried EXIF would satisfy the absence while
      // proving nothing.
      const staged = await aStagedPhotograph({ withExif: true })

      const ingested = await ingestUpload(staged.input, await inlineDeps(staged.storage))

      expect(metadataMarkersIn(staged.bytes)).toContain('exif')
      const stored = await readStoredBytes((await readMediaRow(ingested)).filename ?? '')
      expect({ markers: metadataMarkersIn(stored), empty: stored.byteLength === 0 }).toEqual({
        markers: [],
        empty: false,
      })
    },
    INGEST_BUDGET_MS,
  )

  it(
    'removes the staging object once the row exists, so a staged copy cannot outlive it',
    async () => {
      // The staged original still carries the GPS coordinates. Leaving it in the
      // bucket would undo the strip for anybody who could enumerate the bucket -
      // which is exactly SECURITY.md's objection to direct URLs.
      const staged = await aStagedPhotograph({ withExif: true })

      await ingestUpload(staged.input, await inlineDeps(staged.storage))

      expect(await staged.storage.exists(staged.input.stagingKey)).toBe(false)
    },
    INGEST_BUDGET_MS,
  )

  it(
    'reports a re-encode of an existing photograph in the same journey as a duplicate',
    async () => {
      const journey = await aFixtureJourney()
      const first = await aStagedPhotograph({ journey })
      const original = await ingestUpload(first.input, await inlineDeps(first.storage))
      const again = await aStagedPhotograph({ journey, reencoded: true })

      const ingested = await ingestUpload(again.input, await inlineDeps(again.storage))

      expect(ingested.ok ? ingested.value.kind : null).toBe('duplicate')
      expect(ingested.ok && ingested.value.kind === 'duplicate' ? ingested.value.of : null).toBe(
        original.ok && original.value.kind === 'ready' ? original.value.media : 'no original',
      )
    },
    INGEST_BUDGET_MS,
  )

  it(
    'creates no second row for a duplicate, so the copy is reported rather than stored',
    async () => {
      const journey = await aFixtureJourney()
      const first = await aStagedPhotograph({ journey })
      await ingestUpload(first.input, await inlineDeps(first.storage))
      const again = await aStagedPhotograph({ journey, reencoded: true })
      const before = await countMediaRows()

      await ingestUpload(again.input, await inlineDeps(again.storage))

      expect(await countMediaRows()).toBe(before)
    },
    INGEST_BUDGET_MS,
  )

  it(
    'finds a duplicate past the first page of a journey, so a well-stocked journey stops matching nothing',
    async () => {
      // PAYLOAD'S OWN DEFAULT PAGE IS TEN ROWS. Twenty fillers stacked on top
      // of the original put it out of reach of a first page whichever way the
      // default sort runs, so a `find` without `pagination: false` would look
      // at ten rows that are not it and answer "new photograph".
      const journey = await aFixtureJourney()
      const first = await aStagedPhotograph({ journey })
      await ingestUpload(first.input, await inlineDeps(first.storage))
      await fillJourneyWithMedia(journey, 20)
      const again = await aStagedPhotograph({ journey, reencoded: true })

      const ingested = await ingestUpload(again.input, await inlineDeps(again.storage))

      expect(ingested.ok ? ingested.value.kind : null).toBe('duplicate')
    },
    INGEST_BUDGET_MS,
  )

  it(
    'does not report a visibly different photograph in the same journey as a duplicate',
    async () => {
      // THE NEGATIVE CONTROL FOR THE MATCH ITSELF, without which "return the
      // first row in this journey" passes every duplicate case above. The two
      // photographs measure 30 of 64 hash bits apart (`media-fixtures.ts`).
      const journey = await aFixtureJourney()
      const first = await aStagedPhotograph({ journey })
      await ingestUpload(first.input, await inlineDeps(first.storage))
      const other = await aStagedPhotograph({ journey, different: true })

      const ingested = await ingestUpload(other.input, await inlineDeps(other.storage))

      expect(ingested.ok ? ingested.value.kind : null).toBe('ready')
    },
    INGEST_BUDGET_MS,
  )

  it(
    'does not report the same photograph in a different journey as a duplicate',
    async () => {
      // CLAUDE.md section 7, and spec section 9.2 step 6: the match is within ONE
      // journey. The same landscape can legitimately appear in two.
      const mine = await aFixtureJourney()
      const theirs = await aFixtureJourney()
      const first = await aStagedPhotograph({ journey: mine })
      await ingestUpload(first.input, await inlineDeps(first.storage))
      const other = await aStagedPhotograph({ journey: theirs, reencoded: true })

      const ingested = await ingestUpload(other.input, await inlineDeps(other.storage))

      expect(ingested.ok ? ingested.value.kind : null).toBe('ready')
    },
    INGEST_BUDGET_MS,
  )

  it(
    'does not report a photograph as a duplicate of a row whose hash is still pending',
    async () => {
      // A `worker` ingest leaves a row at `processing` with no `contentHash` -
      // the worker writes one later. Comparing against that empty value must not
      // swallow the next upload into the journey as a copy of it.
      const journey = await aFixtureJourney()
      const queued = await aStagedPhotograph({ journey })
      await ingestUpload(queued.input, await workerDeps(queued.storage))
      const next = await aStagedPhotograph({ journey, reencoded: true })

      const ingested = await ingestUpload(next.input, await inlineDeps(next.storage))

      expect(ingested.ok ? ingested.value.kind : null).toBe('ready')
    },
    INGEST_BUDGET_MS,
  )

  it(
    'creates no row at all when the bytes are refused',
    async () => {
      const staged = await aStagedSvg()
      const before = await countMediaRows()

      const ingested = await ingestUpload(staged.input, await inlineDeps(staged.storage))

      expect(ingested).toEqual({ ok: false, error: 'svg-rejected' })
      expect(await countMediaRows()).toBe(before)
    },
    INGEST_BUDGET_MS,
  )

  it(
    'removes the staging object even when the bytes are refused',
    async () => {
      const staged = await aStagedSvg()

      await ingestUpload(staged.input, await inlineDeps(staged.storage))

      expect(await staged.storage.exists(staged.input.stagingKey)).toBe(false)
    },
    INGEST_BUDGET_MS,
  )

  it(
    'refuses when the staged object is absent, rather than creating an empty row',
    async () => {
      const { storage } = await aTempStore()
      const journey = await aFixtureJourney()

      const ingested = await ingestUpload(
        { stagingKey: 'staging/j/never-written.jpg', declaredType: 'image/jpeg', filename: 'a.jpg', journey },
        await inlineDeps(storage),
      )

      expect(ingested).toEqual({ ok: false, error: 'staged-bytes-missing' })
    },
    INGEST_BUDGET_MS,
  )

  it(
    'creates no row when the staged object is absent',
    async () => {
      const { storage } = await aTempStore()
      const journey = await aFixtureJourney()
      const before = await countMediaRows()

      await ingestUpload(
        { stagingKey: 'staging/j/never-written.jpg', declaredType: 'image/jpeg', filename: 'a.jpg', journey },
        await inlineDeps(storage),
      )

      expect(await countMediaRows()).toBe(before)
    },
    INGEST_BUDGET_MS,
  )

  it(
    'enqueues a transcode job and leaves the row processing under worker mode',
    async () => {
      // ADR 0004's amendment: worker mode is a QUEUE HOP, not a different
      // pipeline. The hop lives between the receiver and the worker, so ingest
      // does not run the pipeline here - it records the upload and hands it on.
      const staged = await aStagedPhotograph({})

      const ingested = await ingestUpload(staged.input, await workerDeps(staged.storage))

      expect(ingested.ok ? ingested.value.kind : null).toBe('queued')
      expect((await readMediaRow(ingested)).state).toBe('processing')
    },
    INGEST_BUDGET_MS,
  )

  it(
    'enqueues the transcode job against the row it just created',
    async () => {
      const staged = await aStagedPhotograph({})
      const payload = await getTestPayload()

      const ingested = await ingestUpload(staged.input, await workerDeps(staged.storage))

      const job = await payload.findByID({
        collection: 'jobs',
        id: ingested.ok && ingested.value.kind === 'queued' ? ingested.value.job : '0',
        depth: 0,
        select: { kind: true, mediaId: true, status: true },
      })
      expect({ kind: job.kind, mediaId: job.mediaId, status: job.status }).toEqual({
        kind: 'transcode',
        mediaId: ingested.ok && ingested.value.kind === 'queued' ? ingested.value.media : 'no media',
        status: 'queued',
      })
    },
    INGEST_BUDGET_MS,
  )

  it(
    'removes the staging object under worker mode too, since the worker reads the row and not the staging key',
    async () => {
      const staged = await aStagedPhotograph({})

      await ingestUpload(staged.input, await workerDeps(staged.storage))

      expect(await staged.storage.exists(staged.input.stagingKey)).toBe(false)
    },
    INGEST_BUDGET_MS,
  )

  it(
    'refuses a journey id that names no row, rather than letting NaN reach the driver',
    async () => {
      const staged = await aStagedPhotograph({})
      const named = journeyId('not-a-row-id')

      const ingested = await ingestUpload(
        { ...staged.input, journey: named.ok ? named.value : staged.input.journey },
        await inlineDeps(staged.storage),
      )

      expect(ingested).toEqual({ ok: false, error: 'invalid-journey' })
    },
    INGEST_BUDGET_MS,
  )

  it(
    'removes the staging object when the journey is refused, so a bad id leaves no original behind',
    async () => {
      const staged = await aStagedPhotograph({})
      const named = journeyId('not-a-row-id')

      await ingestUpload(
        { ...staged.input, journey: named.ok ? named.value : staged.input.journey },
        await inlineDeps(staged.storage),
      )

      expect(await staged.storage.exists(staged.input.stagingKey)).toBe(false)
    },
    INGEST_BUDGET_MS,
  )

  it(
    'leaves a row processing when nothing sets its state, so a crashed upload is visible',
    async () => {
      const payload = await getTestPayload()
      const journey = await aFixtureJourney()
      const png = await aTinyPng()

      const created = await payload.create({
        collection: 'media',
        // The branded id is a string and the relationship column is numeric, so
        // the row id is what goes in - the same conversion `ingestUpload` makes.
        data: { journey: Number(journey) },
        file: { data: Buffer.from(png), mimetype: 'image/png', name: 'crashed.png', size: png.length },
      })

      const row = await payload.findByID({ collection: 'media', id: created.id, depth: 0, select: { state: true } })
      expect(row.state).toBe('processing')
    },
    INGEST_BUDGET_MS,
  )
})

describe('finaliseStagedUpload', () => {
  afterAll(removeIngestFixtures)

  it(
    'brands the journey the client sent and finishes the upload',
    async () => {
      const staged = await aStagedPhotograph({})

      const finalised = await finaliseStagedUpload(
        { ...staged.input, journey: String(staged.input.journey) },
        await inlineDeps(staged.storage),
      )

      expect(finalised.ok ? finalised.value.kind : null).toBe('ready')
    },
    INGEST_BUDGET_MS,
  )

  it(
    'refuses a request naming no journey at all, rather than keying a row by nothing',
    async () => {
      const staged = await aStagedPhotograph({})

      const finalised = await finaliseStagedUpload(
        { ...staged.input, journey: '   ' },
        await inlineDeps(staged.storage),
      )

      expect(finalised).toEqual({ ok: false, error: 'invalid-journey' })
    },
    INGEST_BUDGET_MS,
  )
})
