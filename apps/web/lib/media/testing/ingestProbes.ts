/**
 * ingestProbes — the fixtures and probes the ingest suite drives
 * `ingestUpload` with.
 *
 * Factories with overridable defaults and no shared mutable state
 * (CLAUDE.md §2.3): every helper builds a fresh thing per call and takes what
 * it needs as a parameter. It implements none of §3.3's seven named patterns
 * beyond Factory.
 *
 * IT IS A SEPARATE MODULE FROM `uploadProbes.ts` rather than an addition to
 * it, and {@link aTempStore} is IMPORTED from there rather than written a
 * second time. The two modules serve two different seams — one stages bytes
 * for a browser to PUT, one hands staged bytes to ingest — but a temporary
 * object store is the same thing for both, and this repository has already
 * had two spellings of one journey fixture.
 *
 * ═══ WHY THE STAGING KEY COMES FROM `planUploadSlots` ═══
 *
 * A fixture that spelled `staging/<journey>/<nonce>-<name>` itself would be a
 * fixture agreeing with itself: the shape ingest is handed in production is
 * whatever the PLANNER minted, and a hand-written key would keep passing if
 * the planner's changed. So {@link aStagedPhotograph} and {@link aStagedSvg}
 * both ask `planUploadSlots` — the same function `offerUploadSlots` calls —
 * for the key, then write the bytes to it through a real `StoragePort`. That
 * is the Phase 2 fixture-drift lesson applied here (`../uploadContract.ts`'s
 * header records the two blockers it came from).
 *
 * ═══ WHY THE TEST PAYLOAD IS IMPORTED INSIDE EACH FUNCTION ═══
 *
 * The same reason `uploadProbes.ts` gives: a top-level
 * `import { getTestPayload } from '../../testPayload'` pulls
 * `payload.config.ts`, `pg` and `sharp` into whatever imports this module,
 * and `vitest.config.ts`'s Docker-free split exists to prevent exactly that.
 * Nothing here is imported by a unit test today, but the import graph is what
 * makes that true tomorrow as well.
 *
 * Depends on: node:crypto, node:path; sharp (for {@link aTinyPng}); the domain's ingest
 * policy, upload-slot planner and branded ids; the MediaProcessor and Storage
 * ports; `mediaProcessorFor` and `createPostgresQueue` for the two dependency
 * sets; the contract suite's photograph factories and the domain's SVG
 * fixture; `aTempStore` (../testing/uploadProbes).
 */
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import sharp from 'sharp'
import type { JourneyId, MediaId } from '@travel-diary/domain/ids'
import { journeyId } from '@travel-diary/domain/ids'
import { acceptedIngestTypes } from '@travel-diary/domain/media/ingestPolicy'
import { planUploadSlots } from '@travel-diary/domain/media/uploadSlot'
import type { Result } from '@travel-diary/domain/result'
import { anSvgDocument } from '@travel-diary/domain/testing/bytes'
import { createPostgresQueue } from '../../adapters/postgres-queue'
import {
  aDifferentPhotograph,
  aPhotograph,
  aPhotographWithExif,
  aReencodedPhotograph,
} from '../../adapters/contract/media-fixtures'
import type { StoragePort } from '../../ports/storage'
import type { IngestDeps, IngestInput, IngestOutcome, IngestRefusalReason } from '../ingestUpload'
import { mediaProcessorFor } from '../services'
import { aTempStore } from './uploadProbes'

export { aTempStore }

/** The slug prefix every fixture journey this module creates carries. */
const FIXTURE_SLUG_PREFIX = 'test-ingest-'

/**
 * Creates a published journey in the test database and returns its branded id.
 *
 * Published rather than draft for the reason `uploadProbes.ts` gives: ingest
 * runs against a journey the admin is working in. The distinguishing label is
 * a fresh UUID per call rather than a parameter with a default — no caller has
 * wanted to choose one, and a default nothing exercises is a vacuous branch.
 * @returns The created row's id, branded.
 * @throws When the branded constructor refuses the id Payload assigned, which
 *   would mean an empty primary key and is not a condition a test can proceed
 *   past.
 * @example
 * const journey = await aFixtureJourney()
 */
export const aFixtureJourney = async (): Promise<JourneyId> => {
  const label = randomUUID()
  const { getTestPayload } = await import('../../testPayload')
  const payload = await getTestPayload()
  const created = await payload.create({
    collection: 'journeys',
    data: {
      name: `Ingest fixture ${label}`,
      place: 'Nowhere',
      slug: `${FIXTURE_SLUG_PREFIX}${label}`,
      dates: '1 - 2 Jan 2020',
      _status: 'published',
    },
  })

  const branded = journeyId(String(created.id))
  /* c8 ignore next -- no organic trigger: Payload's primary key is never the empty string, which is the branded constructor's only refusal (see @throws). The throw stays because a helper that branded an empty id would hand every caller a key with a hole in it. */
  if (!branded.ok) throw new Error(branded.error)
  return branded.value
}

/**
 * Removes every journey {@link aFixtureJourney} created, and the media rows
 * ingested into them.
 *
 * THE MEDIA GO FIRST, and by their journey's slug rather than by a list of
 * ids held in a module variable, which would be the shared mutable state §2.3
 * forbids. Deleting through Payload rather than the database is what removes
 * the derivative files from `apps/web/media/` as well as the rows: a suite
 * that left five tiers of a 4000px photograph on disk per case would grow the
 * working tree every run.
 * @example
 * afterAll(removeIngestFixtures)
 */
export const removeIngestFixtures = async (): Promise<void> => {
  const { getTestPayload } = await import('../../testPayload')
  const payload = await getTestPayload()
  await payload.delete({ collection: 'media', where: { 'journey.slug': { like: FIXTURE_SLUG_PREFIX } } })
  await payload.delete({ collection: 'journeys', where: { slug: { like: FIXTURE_SLUG_PREFIX } } })
}

/** What ingest is handed, and the store and bytes it was staged through. */
export interface StagedUpload {
  /** The input `ingestUpload` takes, keyed at a planner-minted staging key. */
  readonly input: IngestInput
  /** The store the bytes were written to, and ingest will read them back from. */
  readonly storage: StoragePort
  /** The bytes as staged — the pre-strip original, EXIF and all. */
  readonly bytes: Uint8Array
}

/**
 * Writes `bytes` to a planner-minted staging key and returns ingest's input.
 *
 * @param options - The bytes to stage, what the client calls them, and the
 *   journey to stage under.
 * @returns The staged upload: ingest's input, the store, and the bytes.
 * @throws When `planUploadSlots` refuses the file, which would mean this
 *   module built a fixture the real planner would never have offered a slot
 *   for — a broken fixture, not a test failure to report.
 */
const stage = async (options: {
  readonly bytes: Uint8Array
  readonly filename: string
  readonly declaredType: string
  readonly journey: JourneyId
}): Promise<StagedUpload> => {
  const { storage } = await aTempStore()
  const planned = planUploadSlots({
    files: [{ filename: options.filename, declaredType: options.declaredType, byteLength: options.bytes.length }],
    acceptedTypes: acceptedIngestTypes('inline'),
    journey: options.journey,
    nonce: () => randomUUID(),
  })
  /* c8 ignore next -- no organic trigger: every fixture below is a named, non-empty, offered-type file inside both caps, so the planner's refusals are unreachable from here. The throw stays so a future fixture that IS refused fails loudly instead of staging at `undefined`. */
  if (!planned.ok) throw new Error(`the planner refused a fixture: ${planned.error}`)
  const slot = planned.value[0]
  /* c8 ignore next -- no organic trigger: one file in, one slot out. */
  if (slot === undefined) throw new Error('the planner offered no slot for a single file')

  const written = await storage.put(slot.stagingKey, options.bytes, options.declaredType)
  /* c8 ignore next -- no organic trigger: the store is a fresh mkdtemp directory and the key is the planner's own. */
  if (!written.ok) throw new Error(`the fixture store refused the staged bytes: ${written.error}`)

  return {
    input: {
      stagingKey: slot.stagingKey,
      declaredType: slot.declaredType,
      filename: slot.filename,
      journey: options.journey,
    },
    storage,
    bytes: options.bytes,
  }
}

/** Which of the contract suite's four photographs a staged upload carries. */
interface PhotographChoice {
  readonly withExif?: boolean
  readonly reencoded?: boolean
  readonly different?: boolean
}

/**
 * The contract-suite photograph a set of flags names.
 *
 * The flags are mutually exclusive and read in a fixed order rather than
 * validated against each other: no caller sets two, and a guard for a
 * combination nothing produces is a branch nothing exercises.
 * @param choice - Which photograph is wanted. None set means the plain one.
 * @param size - The encoded size, already resolved.
 * @returns The encoded file's bytes.
 */
const photographFor = async (
  choice: PhotographChoice,
  size: { readonly width?: number; readonly height?: number },
): Promise<Uint8Array> => {
  if (choice.different === true) return aDifferentPhotograph(size)
  if (choice.reencoded === true) return aReencodedPhotograph(size)
  if (choice.withExif === true) return aPhotographWithExif(size)
  return aPhotograph(size)
}

/**
 * Stages a real photograph the way an upload leaves one for ingest.
 *
 * @param options - `journey` defaults to a fresh fixture journey, so a case
 *   that does not care about the journey cannot collide with one that does;
 *   `withExif` stages the GPS-and-capture-time original; `reencoded` stages
 *   the same pixels at a lower quality, which is the pair perceptual hashing
 *   exists for; and `different` stages a visibly different photograph, 30 of
 *   the 64 hash bits away, which is the negative control. None defaults to
 *   true, and no caller sets two. `width`/`height` default to
 *   the contract fixture's own size, which is large enough for Payload's
 *   `thumb` and `tile` and no larger — a case asserting that EVERY configured
 *   tier was derived passes the widest configured width, since Payload omits
 *   a width-only image size whose source is narrower than its target
 *   (`payload/dist/uploads/image-resizing/getImageResizeAction.js`).
 * @returns The staged upload.
 * @example
 * const staged = await aStagedPhotograph({ withExif: true })
 */
export const aStagedPhotograph = async (
  options: PhotographChoice & {
    readonly journey?: JourneyId
    readonly width?: number
    readonly height?: number
  },
): Promise<StagedUpload> => {
  const size = {
    ...(options.width === undefined ? {} : { width: options.width }),
    ...(options.height === undefined ? {} : { height: options.height }),
  }
  const bytes = await photographFor(options, size)

  return stage({
    bytes,
    // A DISTINCT NAME PER CALL, because two uploads are two files. A fixture
    // that called every one of them `tokyo.jpg` would make Payload's
    // `getSafeFileName` the thing under test - it would store `tokyo-1.jpg`,
    // `tokyo-2.jpg` and so on - and two concurrent creates racing that loop
    // resolve the same name and violate the filename unique index, which is
    // how this fixture first failed.
    filename: `tokyo-${randomUUID()}.jpg`,
    declaredType: 'image/jpeg',
    journey: options.journey ?? (await aFixtureJourney()),
  })
}

/**
 * Stages an SVG document under a `.jpg` name and a declared `image/jpeg` —
 * the attack exactly as it arrives.
 *
 * An SVG is an HTML document and this repository's `sharp` build decodes one
 * (SECURITY.md; `../stillPipeline.ts`'s header carries the measurement), so
 * one that reaches the store is stored XSS with the author's own session
 * attached. The declared type is the one a file picker derives from the NAME
 * `holiday.jpg`, measured in Task 2's browser probe.
 * @param options - `journey` defaults to a fresh fixture journey.
 * @returns The staged upload.
 * @example
 * const staged = await aStagedSvg({})
 */
export const aStagedSvg = async (options: { readonly journey?: JourneyId } = {}): Promise<StagedUpload> =>
  stage({
    bytes: anSvgDocument(),
    filename: `holiday-${randomUUID()}.jpg`,
    declaredType: 'image/jpeg',
    journey: options.journey ?? (await aFixtureJourney()),
  })

/**
 * A real PNG too small for any derivative tier.
 *
 * Encoded by `sharp` rather than hand-assembled: Payload probes the image and
 * derives what it can from it, so a fixture that were not a decodable image
 * would fail the create for a reason that has nothing to do with the case
 * using it.
 * @returns The encoded file's bytes, fresh per call.
 */
export const aTinyPng = async (): Promise<Uint8Array> =>
  new Uint8Array(
    await sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 200, g: 200, b: 200 } } })
      .png()
      .toBuffer(),
  )

/**
 * The dependency set for `MEDIA_PIPELINE=inline`.
 *
 * Everything in it is REAL: the test Payload, a real `sharp`-backed
 * processor, the caller's own temporary store and the Postgres queue. Nothing
 * here stubs a module this repository owns (CLAUDE.md §2.3) — the only thing
 * that varies between this and {@link workerDeps} is the mode, which is the
 * one configuration ADR 0004 says switches the pipeline.
 * @param storage - The store the bytes were staged in.
 * @returns The dependencies `ingestUpload` takes.
 * @example
 * await ingestUpload(staged.input, await inlineDeps(staged.storage))
 */
export const inlineDeps = async (storage: StoragePort): Promise<IngestDeps> => {
  const { getTestPayload } = await import('../../testPayload')
  return {
    payload: await getTestPayload(),
    storage,
    processor: mediaProcessorFor('inline'),
    queue: createPostgresQueue(),
    mode: 'inline',
  }
}

/**
 * The dependency set for `MEDIA_PIPELINE=worker`.
 * @param storage - The store the bytes were staged in.
 * @returns The dependencies `ingestUpload` takes, bound for `worker`.
 * @example
 * await ingestUpload(staged.input, await workerDeps(staged.storage))
 */
export const workerDeps = async (storage: StoragePort): Promise<IngestDeps> => {
  const { getTestPayload } = await import('../../testPayload')
  return {
    payload: await getTestPayload(),
    storage,
    processor: mediaProcessorFor('worker'),
    queue: createPostgresQueue(),
    mode: 'worker',
  }
}

/**
 * The same hash with `bits` of its bits flipped, and no others.
 *
 * ═══ WHY THE NEAR-DUPLICATE IS A HASH AND NOT A PHOTOGRAPH ═══
 *
 * `DUPLICATE_MAX_DISTANCE` is 5 because real clients produce photographs a
 * few bits apart: a crop, a brightness tweak, a "save for web" resize, the
 * second frame of a phone's HDR pair. Neither fixture in
 * `../../adapters/contract/media-fixtures.ts` is in that band — measured, and
 * recorded there: the q55 re-encode is 0 bits from its original and the
 * different photograph is 30. So a case that has to sit between them either
 * invents a photograph tuned to land there — brittle across `sharp` versions,
 * and a fixture built to make a test pass — or moves the OTHER side of the
 * comparison, which is what this does: the row already in the journey carries
 * the ingest's own hash with bits flipped.
 *
 * One bit per byte, from the left, so the answer is exactly `bits` and the
 * case that asserts a distance is asserting a fact rather than a hope —
 * `ingestUpload.integration.test.ts` pins that with `hammingDistance` before
 * it relies on it.
 * @param hash - A hash as `contentHash` carries it: sixteen lowercase hex
 *   characters, eight bytes.
 * @param bits - How many bits to flip. At most eight, one per byte.
 * @returns The altered hash, the same length and shape.
 * @example
 * flipBits('0000000000000000', 1) // '0100000000000000'
 */
export const flipBits = (hash: string, bits: number): string =>
  (hash.match(/../g) ?? [])
    .map((pair, index) => (index < bits ? Number.parseInt(pair, 16) ^ 0x01 : Number.parseInt(pair, 16)) >>> 0)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')

/**
 * Fills a journey with rows that are not photographs anybody will match.
 *
 * FOR THE ONE CASE ABOUT PAGINATION. Payload's own default page is ten rows,
 * so a journey has to hold more than that before "one query, unpaginated" is
 * distinguishable from "one query". These rows carry no `contentHash`, so they
 * can never be the match themselves — they are only there to be in the way.
 * @param journey - The journey to fill, as a branded id.
 * @param count - How many rows to add.
 * @example
 * await fillJourneyWithMedia(journey, 20)
 */
export const fillJourneyWithMedia = async (journey: JourneyId, count: number): Promise<void> => {
  const { getTestPayload } = await import('../../testPayload')
  const payload = await getTestPayload()
  const png = Buffer.from(await aTinyPng())
  for (let added = 0; added < count; added += 1) {
    await payload.create({
      collection: 'media',
      data: { journey: Number(journey) },
      file: { data: png, mimetype: 'image/png', name: `filler-${randomUUID()}.png`, size: png.length },
    })
  }
}

/**
 * The bytes Payload actually stored for a row, read off the disk it wrote
 * them to.
 *
 * THROUGH THE FILESYSTEM RATHER THAN THROUGH PAYLOAD, deliberately: the
 * phase's "EXIF verifiably absent" criterion is settled by reading the STORED
 * bytes, and asking the CMS that wrote them to hand them back would put the
 * writer on both sides of the assertion.
 * @param filename - The name on the row, as {@link readMediaRow} reports it.
 * @returns The stored file's bytes.
 */
export const readStoredBytes = async (filename: string): Promise<Uint8Array> => {
  const { readFile } = await import('node:fs/promises')
  const { MEDIA_DIR } = await import('../../../collections/media')
  return new Uint8Array(await readFile(path.join(MEDIA_DIR, filename)))
}

/** The facts a case asks of the row an ingest produced. */
export interface MediaRowFacts {
  /** `processing`, `ready` or `failed` — the pipeline's own progress. */
  readonly state: 'processing' | 'ready' | 'failed' | null | undefined
  /** `still` or `clip`, set by the pipeline and never by the author. */
  readonly kind: 'still' | 'clip' | null | undefined
  /** The capture time read off the EXIF before it was stripped. */
  readonly capturedAt: string | null | undefined
  /** The perceptual hash of the SANITISED bytes. */
  readonly contentHash: string | null | undefined
  /** The derivative tiers Payload managed to produce, keyed by tier name. */
  readonly sizes: Readonly<Record<string, unknown>> | undefined
  /** The name Payload stored the file under, inside `MEDIA_DIR`. */
  readonly filename: string | null | undefined
}

/**
 * Reads back the five facts a case asks of an ingested row.
 *
 * `depth: 0` and a narrow `select` (CLAUDE.md §7): a probe that fetched the
 * whole document with its relationships populated would be the over-fetch the
 * rule forbids, in the file every future media test copies from.
 * @param ingested - What `ingestUpload` answered. Must be an `ok` naming a
 *   media row; a refusal has no row to read.
 * @returns The row's state, kind, capture time, hash and derivative tiers.
 * @throws When `ingested` is a refusal or a duplicate, neither of which names
 *   a row this probe created — reading one would mean the case under it is
 *   asserting about something that does not exist.
 * @example
 * expect((await readMediaRow(ingested)).state).toBe('ready')
 */
export const readMediaRow = async (ingested: Result<IngestOutcome, IngestRefusalReason>): Promise<MediaRowFacts> => {
  const media = idOf(ingested)
  const { getTestPayload } = await import('../../testPayload')
  const payload = await getTestPayload()
  const row = await payload.findByID({
    collection: 'media',
    id: media,
    depth: 0,
    select: { state: true, kind: true, capturedAt: true, contentHash: true, sizes: true, filename: true },
  })

  return {
    state: row.state,
    kind: row.kind,
    capturedAt: row.capturedAt,
    contentHash: row.contentHash,
    sizes: row.sizes,
    filename: row.filename,
  }
}

/**
 * The media id an outcome names, or a failure describing what it named
 * instead.
 * @param ingested - What `ingestUpload` answered.
 * @returns The created row's id.
 * @throws When the outcome is a refusal or a duplicate.
 */
const idOf = (ingested: Result<IngestOutcome, IngestRefusalReason>): MediaId => {
  /* c8 ignore next -- no organic trigger: every case calling readMediaRow has already asserted the outcome it passes. The throw stays so a case that stops doing so fails by name instead of reading row `undefined`. */
  if (!ingested.ok) throw new Error(`ingest refused the upload: ${ingested.error}`)
  /* c8 ignore next -- no organic trigger: as above, for the duplicate outcome, which names a row some OTHER ingest created. */
  if (ingested.value.kind === 'duplicate') throw new Error('a duplicate names no row this ingest created')
  return ingested.value.media
}

/**
 * How many media rows exist right now.
 *
 * For the two cases asserting nothing was created. A whole-collection count
 * rather than a journey-scoped one, deliberately: "no row at all" is the
 * claim, and a count scoped to the journey would stay flat for a row created
 * under the wrong journey — which is a defect, not an absence.
 * @returns The row count.
 * @example
 * expect(await countMediaRows()).toBe(before)
 */
export const countMediaRows = async (): Promise<number> => {
  const { getTestPayload } = await import('../../testPayload')
  const payload = await getTestPayload()
  const counted = await payload.count({ collection: 'media' })
  return counted.totalDocs
}
