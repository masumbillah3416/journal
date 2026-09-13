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
 * the planner's changed. So every staging helper here goes through
 * `plannedInput`, which asks `planUploadSlots` — the same function
 * `offerUploadSlots` calls — for the key, and then the bytes are written to
 * it: through a real `StoragePort` for the `aStaged*` factories, and through
 * the real RECEIVER for {@link ingestPhotograph}. That is the Phase 2
 * fixture-drift lesson applied here (`../uploadContract.ts`'s header records
 * the two blockers it came from).
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
 * policy, upload-slot planner, upload cap and branded ids; the MediaProcessor and Storage
 * ports; `mediaProcessorFor` and `createPostgresQueue` for the two dependency
 * sets; `createLocalStorage`, for reading the real store back;
 * `receiveLocalUpload`, `mintUploadToken` and `ingestUpload`, which
 * {@link ingestPhotograph} drives in order; the contract suite's photograph
 * factories and the domain's SVG fixture; `aTempStore`, `aPutRequest` and
 * `SECRET` (./uploadProbes).
 */
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import sharp from 'sharp'
import type { ImageSize } from 'payload'
import type { JourneyId, MediaId } from '@travel-diary/domain/ids'
import { journeyId } from '@travel-diary/domain/ids'
import { acceptedIngestTypes } from '@travel-diary/domain/media/ingestPolicy'
import { MAX_UPLOAD_BYTES, planUploadSlots } from '@travel-diary/domain/media/uploadSlot'
import type { Result } from '@travel-diary/domain/result'
import { anSvgDocument } from '@travel-diary/domain/testing/bytes'
import { createLocalStorage } from '../../adapters/local-storage'
import { createPostgresQueue } from '../../adapters/postgres-queue'
import {
  aDifferentPhotograph,
  aPhotograph,
  aPhotographWithExif,
  aReencodedPhotograph,
} from '../../adapters/contract/media-fixtures'
import type { StoragePort } from '../../ports/storage'
import type { IngestDeps, IngestInput, IngestOutcome, IngestRefusalReason } from '../ingestUpload'
import { ingestUpload } from '../ingestUpload'
import { receiveLocalUpload } from '../receiveLocalUpload'
import { mediaProcessorFor } from '../services'
import { mintUploadToken } from '../uploadToken'
import { SECRET, aPutRequest, aTempStore } from './uploadProbes'

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
 * @throws When the temporary store refuses the bytes. The planner's own
 *   refusals are {@link plannedInput}'s.
 */
const stage = async (options: {
  readonly bytes: Uint8Array
  readonly filename: string
  readonly declaredType: string
  readonly journey: JourneyId
}): Promise<StagedUpload> => {
  const { storage } = await aTempStore()
  const input = plannedInput(options)

  const written = await storage.put(input.stagingKey, options.bytes, options.declaredType)
  /* c8 ignore next -- no organic trigger: the store is a fresh mkdtemp directory and the key is the planner's own. */
  if (!written.ok) throw new Error(`the fixture store refused the staged bytes: ${written.error}`)

  return { input, storage, bytes: options.bytes }
}

/**
 * Asks the real planner for one slot and returns ingest's input for it.
 *
 * SPLIT OUT OF {@link stage} so {@link ingestPhotograph} can put the bytes
 * through the RECEIVER instead of writing them itself, without a second
 * spelling of the key. Both callers therefore carry whatever key
 * `planUploadSlots` mints today.
 * @param options - What the client calls the bytes, how many of them there
 *   are, and the journey to stage under.
 * @returns The input `ingestUpload` takes.
 * @throws When `planUploadSlots` refuses the file — a broken fixture, not a
 *   test failure to report.
 */
const plannedInput = (options: {
  readonly bytes: Uint8Array
  readonly filename: string
  readonly declaredType: string
  readonly journey: JourneyId
}): IngestInput => {
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

  return {
    stagingKey: slot.stagingKey,
    declaredType: slot.declaredType,
    filename: slot.filename,
    journey: options.journey,
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
 * Stages a clip under a `.jpg` name and a declared `image/jpeg` — the only
 * form a clip can reach an `inline` ingest in.
 *
 * ═══ WHY THE DISGUISE IS NOT AN EMBELLISHMENT ═══
 *
 * `planUploadSlots` is handed `acceptedIngestTypes('inline')`, which is the
 * two still types, so a client that declares `video/mp4` is never offered a
 * slot at all — there is no key for honest clip bytes to be staged at. A clip
 * therefore arrives exactly the way an SVG does: in a slot offered for a
 * photograph. The refusal is decided on the SNIFFED type either way
 * (`@travel-diary/domain/media/ingestPolicy`), so the declaration changes
 * nothing about which answer comes back.
 * @param options - `bytes` are the clip's, so a caller picks the container;
 *   `journey` defaults to a fresh fixture journey.
 * @returns The staged upload.
 * @example
 * const staged = await aStagedClip({ bytes: await aClip() })
 */
export const aStagedClip = async (options: {
  readonly bytes: Uint8Array
  readonly journey?: JourneyId
}): Promise<StagedUpload> =>
  stage({
    bytes: options.bytes,
    filename: `harbour-${randomUUID()}.jpg`,
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
  // Indexed rather than `hash.match(/../g)`, which answers `null` for a hash
  // this helper is never given and would buy a branch nothing can take.
  Array.from({ length: Math.floor(hash.length / 2) }, (_unused, index) =>
    (Number.parseInt(hash.slice(index * 2, index * 2 + 2), 16) ^ (index < bits ? 0x01 : 0x00))
      .toString(16)
      .padStart(2, '0'),
  ).join('')

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

/**
 * The slug a journey was created under, read back from the row.
 *
 * `readGalleryDownload` addresses a journey by SLUG, so the round-trip case
 * has to ask the database what the fixture's is rather than rebuilding
 * `FIXTURE_SLUG_PREFIX` and a label here — a second spelling of a key this
 * module already mints once.
 * @param journey - The branded id {@link aFixtureJourney} returned.
 * @returns The row's slug.
 * @example
 * await readGalleryDownload(await slugOf(journey), media)
 */
export const slugOf = async (journey: JourneyId): Promise<string> => {
  const { getTestPayload } = await import('../../testPayload')
  const payload = await getTestPayload()
  const row = await payload.findByID({ collection: 'journeys', id: journey, depth: 0, select: { slug: true } })
  return row.slug
}

/** The epoch millisecond {@link ingestPhotograph}'s minted token expires at. */
const TOKEN_EXPIRES_AT = 2_000

/** The epoch millisecond {@link ingestPhotograph}'s receiver reads the clock at. */
const RECEIVED_AT = 1_000

/**
 * Plans a slot, PUTs the bytes through the receiver, and ingests them.
 *
 * THE RECEIVER IS IN THE PATH, not a bare `storage.put`: what this helper
 * hands back is a row whose bytes travelled the same three seams a browser's
 * upload does, so a case asserting about the STORED file is asserting about
 * the pipeline rather than about `sharp` alone. The clock is injected on both
 * sides — {@link TOKEN_EXPIRES_AT} against a `now` of {@link RECEIVED_AT} —
 * so the token's lifetime is a fact of the call and not of the machine.
 * @param options - `bytes` are the upload's; `journey` defaults to a fresh
 *   fixture journey, so two cases cannot collide.
 * @returns The id of the row the ingest created.
 * @throws When the receiver refuses the PUT, or when the ingest named no new
 *   row — both of which mean the fixture, not the assertion, is wrong.
 * @example
 * const media = await ingestPhotograph({ bytes: await aPhotographWithExif() })
 */
export const ingestPhotograph = async (options: {
  readonly bytes: Uint8Array
  readonly journey?: JourneyId
}): Promise<MediaId> => {
  const { storage } = await aTempStore()
  const input = plannedInput({
    bytes: options.bytes,
    filename: `tokyo-${randomUUID()}.jpg`,
    declaredType: 'image/jpeg',
    journey: options.journey ?? (await aFixtureJourney()),
  })

  const token = mintUploadToken({
    key: input.stagingKey,
    expiresAt: TOKEN_EXPIRES_AT,
    maxBytes: MAX_UPLOAD_BYTES,
    secret: SECRET,
  })
  const received = await receiveLocalUpload(aPutRequest({ token, body: options.bytes }), {
    storage,
    now: () => RECEIVED_AT,
    secret: SECRET,
  })
  /* c8 ignore next -- no organic trigger: the token is minted here, over this key, unexpired and wide enough for every fixture. The throw stays so a receiver change fails by name rather than as an empty store. */
  if (!received.ok) throw new Error(`the receiver refused a fixture upload: ${received.error}`)

  return idOf(await ingestUpload(input, await inlineDeps(storage)))
}

/** One file Payload actually wrote for a row, and which tier it is. */
export interface StoredFile {
  /** The derivative tier's name, or `original` for the row's own file. */
  readonly tier: string
  /** The bytes as the store hands them back. */
  readonly bytes: Uint8Array
}

/**
 * Every file a row owns, read back OUT of the store through the port.
 *
 * ═══ THROUGH `createLocalStorage(MEDIA_DIR)`, NEVER THROUGH `fs` ═══
 *
 * The phase's EXIF criterion is settled by reading the stored bytes, and the
 * store is the thing that holds them. Going through the port is also what
 * makes this the same read `readGalleryDownload` performs, so a key this
 * probe can fetch is a key a download can.
 *
 * A tier whose `filename` is null is one Payload did not derive — it is left
 * out rather than returned empty, so the caller's count is of files that
 * exist.
 * @param media - The row to read, as {@link ingestPhotograph} returned it.
 * @returns One entry per stored file, the row's own first.
 * @throws When the store cannot hand back a file the row names, which would
 *   mean a row pointing at bytes that are not there.
 * @example
 * for (const file of await storedFilesFor(media)) expect(metadataMarkersIn(file.bytes)).toEqual([])
 */
export const storedFilesFor = async (media: MediaId): Promise<readonly StoredFile[]> => {
  const { getTestPayload } = await import('../../testPayload')
  const { MEDIA_DIR } = await import('../../../collections/media')
  const payload = await getTestPayload()
  const row = await payload.findByID({
    collection: 'media',
    id: media,
    depth: 0,
    select: { filename: true, sizes: true },
  })

  const derivatives: Readonly<Record<string, { readonly filename?: string | null } | undefined>> =
    /* c8 ignore next -- no organic trigger: Payload writes a `sizes` object onto every row of an upload collection. The fallback stays so a row without one reads as "no derivatives" rather than throwing. */
    row.sizes ?? {}
  const named = [
    { tier: 'original', filename: row.filename },
    ...Object.entries(derivatives).map(([tier, size]) => ({
      tier,
      /* c8 ignore next -- no organic trigger: that object carries one entry per configured image size, so the optional chain's undefined arm is unreachable. It stays so a sparse `sizes` reads as "not derived" rather than throwing. */
      filename: size?.filename,
    })),
  ].filter((file): file is { tier: string; filename: string } => typeof file.filename === 'string')

  const storage = createLocalStorage(MEDIA_DIR)
  const files: StoredFile[] = []
  for (const file of named) {
    const fetched = await storage.get(file.filename)
    /* c8 ignore next -- no organic trigger: every name here came off the row Payload had just written the file for. The throw stays so a row pointing at absent bytes fails by name instead of as a short loop. */
    if (!fetched.ok) throw new Error(`the store has no file for ${file.tier}: ${fetched.error}`)
    files.push({ tier: file.tier, bytes: fetched.value })
  }
  return files
}

/**
 * A photograph size whose STORED form is wide enough for every configured
 * tier.
 *
 * ═══ THE SOURCE IS PORTRAIT, AND THE QUARTER TURN IS WHY ═══
 *
 * `aPhotographWithExif` writes EXIF orientation 6 — a photograph on its side —
 * and `runStillPipeline` calls sharp's `.rotate()`, so the bytes Payload
 * derives from are the SOURCE TRANSPOSED. A 4000x3000 source is stored
 * 3000x4000, and `hero2x`, a width-only 4000, is then never derived: measured,
 * the row carried a `sizes.hero2x` key whose every field was null. So the
 * width the widest tier needs is asked of the source's HEIGHT.
 *
 * ONE SPELLING, HERE, BECAUSE IT WAS BRIEFLY TWO. Both
 * `../ingestUpload.integration.test.ts` and `../roundTrip.integration.test.ts`
 * need it, and each had derived it separately — two copies of one piece of
 * reasoning, one of which would be updated when the auto-orientation argument
 * changes and one of which would not (review F6).
 * @returns A portrait size whose stored, auto-oriented form is the widest
 *   configured width by a 4:3 height.
 * @throws When the collection configures no image sizes, by way of
 *   {@link configuredImageSizes}.
 * @example
 * await aStagedPhotograph({ withExif: true, ...(await wideEnoughForEveryTier()) })
 */
export const wideEnoughForEveryTier = async (): Promise<{ readonly width: number; readonly height: number }> => {
  /* c8 ignore next -- no organic trigger: every size the collection configures states a width, so the `?? 0` arm is unreachable. It stays because Payload's `ImageSize` permits a height-only size, and one of those constrains no width — contributing 0 to the maximum is the right answer for it. */
  const storedWidth = Math.max(...(await configuredImageSizes()).map((size) => size.width ?? 0))
  return { width: Math.round((storedWidth * 3) / 4), height: storedWidth }
}

/**
 * The image sizes `apps/web/collections/media.ts` configures.
 * @returns One entry per configured tier.
 * @throws When the collection configures no image sizes, which would mean it
 *   had stopped deriving tiers at all.
 */
export const configuredImageSizes = async (): Promise<readonly ImageSize[]> => {
  const { Media } = await import('../../../collections/media')
  const upload = Media.upload
  /* c8 ignore next -- no organic trigger: the collection is an upload collection that configures image sizes, and a change that removed them would fail every derivative case before this one. The throw stays so the absence is named rather than read as an empty tier list. */
  if (typeof upload !== 'object' || upload.imageSizes === undefined) throw new Error('no image sizes are configured')
  return upload.imageSizes
}

/**
 * The derivative tiers `apps/web/collections/media.ts` configures, sorted.
 *
 * READ OFF THE COLLECTION rather than listed here, so that a case counting
 * stored files counts what the schema asks for on the day it runs. Task 10's
 * `grid` widens this by itself; `../ingestUpload.integration.test.ts` holds
 * the separate, deliberately hard-coded list that FAILS when that tier is
 * added, which is the notification. The two are not duplicates: one asks what
 * is configured, the other asserts what should be.
 * @returns The configured tier names.
 * @throws When the collection configures no image sizes at all.
 * @example
 * expect(stored.map((file) => file.tier).sort()).toEqual(['original', ...(await configuredTierNames())].sort())
 */
export const configuredTierNames = async (): Promise<readonly string[]> =>
  (await configuredImageSizes()).map((size) => size.name).sort()

/** EXIF's `LONG` type is four bytes wide, and a rational is two of them. */
const BYTES_PER_EXIF_LONG = 4

/**
 * The bytes an EXIF rational triple occupies in a file, big-endian.
 *
 * ═══ WHY THE COORDINATE ITSELF, AND WHY BIG-ENDIAN ═══
 *
 * `metadataMarkersIn` finds SEGMENT HEADERS, and `EXIF_CANARY` is ASCII the
 * fixture hides in Copyright. Neither would notice a stripper that removed
 * the header and left the payload where it was, which is why the absence
 * assertion needs the coordinate's own bytes as a third, independent needle.
 *
 * MEASURED, NOT ASSUMED. `aPhotographWithExif()`'s output was searched on
 * this machine: the twenty-four big-endian bytes of `FIXTURE_GPS_LATITUDE`
 * appear at offset 325, and a plain `aPhotograph()` contains them nowhere —
 * so the needle distinguishes the two fixtures rather than matching image
 * data by chance. Big-endian because `sharp` writes an `MM` TIFF header.
 *
 * WHAT THE MEASUREMENT DOES **NOT** SAY, because the first version of this
 * paragraph claimed it did: a LITTLE-endian spelling of the same six numbers
 * also matches, and was watched passing. It matches because the longitude
 * rational follows immediately and opens `00 00 00 00`, which supplies the
 * padding a reversed reading needs. So this needle is not evidence about
 * byte order — it is evidence about the COORDINATE. What guards it is the
 * pair of controls the case itself carries: present in the EXIF fixture,
 * absent from a photograph that never carried one. The positive one was
 * watched failing under a needle shifted one off the real value; the negative
 * one cannot fail that way, and does not claim to.
 * @param rational - A rational triple as EXIF spells it, numerators over
 *   denominators separated by spaces.
 * @returns Four bytes per number, in the order they are written.
 * @example
 * asExifRationals('51/1 30/1 26/1').byteLength // 24
 */
export const asExifRationals = (rational: string): Uint8Array => {
  const numbers = rational.split(/[\s/]+/).map(Number)
  const written = new DataView(new ArrayBuffer(numbers.length * BYTES_PER_EXIF_LONG))
  numbers.forEach((value, index) => {
    written.setUint32(index * BYTES_PER_EXIF_LONG, value)
  })
  return new Uint8Array(written.buffer)
}
