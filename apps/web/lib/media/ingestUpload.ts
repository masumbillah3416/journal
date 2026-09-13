/**
 * ingestUpload — what a staged upload becomes: one `media` row, in a state
 * that says what happened to it.
 *
 * Spec §9.1 ("server action creates media row") and §9.2 step 8 ("mark
 * `ready`, or `failed` with a reason the Media screen surfaces"). Task 7 got
 * the bytes onto disk under a staging key; this is the step that reads them
 * back, decides what they are, and either stores a photograph or refuses one.
 *
 * HANDOFF-DEVIATION: `DATA_MODEL.md` specifies this pipeline as a
 * `beforeChange` hook on the `media` collection. Payload 3.88.0 calls
 * `generateFileData` — the step that hands the bytes to `sharp` — BEFORE any
 * `beforeChange` hook runs (`payload/dist/collections/operations/create.js`),
 * and this repository's `sharp` decodes SVG, so a rejection written there
 * would be a check on a file already rendered. The steps and their order are
 * exactly the handoff's; only their position relative to the write moves.
 * `docs/deviations.md` §50.
 *
 * ═══ HOW EACH STATE IS ACTUALLY REACHABLE, BECAUSE A DEAD STATE IS WORSE
 *     THAN NONE ═══
 *
 * Payload's upload collections require a file at `create`, so a row cannot
 * exist before its bytes do. That one constraint decides the whole shape:
 *
 *   - **`inline`, a still:** the staged bytes are read back, processed, and
 *     the row is created ONCE, from the SANITISED bytes, at `state: 'ready'`.
 *     A refusal creates NO ROW AT ALL and is returned to the caller — there is
 *     nothing to show a `failed` row for, because there is no photograph. The
 *     order matters and is pinned by a mutation: creating the row before
 *     `process()` would give a rejected SVG a row, and a row means a stored
 *     file.
 *   - **`worker`:** the row is created from the STAGED bytes at
 *     `state: 'processing'` and a `transcode` job is enqueued. The worker
 *     sets `'ready'`, or `'failed'` with a reason the Media screen surfaces.
 *     `docs/adr/0004-media-pipeline-mode.md`'s amendment is what settles this:
 *     the queue hop lives BETWEEN the receiver and the worker, not inside the
 *     port, so ingest does not run the pipeline under `worker` — it records
 *     the upload and hands it on. Running `process()` here would transcode a
 *     clip inside the web request, which is the single thing `worker` mode
 *     exists to avoid.
 *   - **`processing` is reachable under `inline` too**, and usefully: the
 *     field defaults to `'processing'`
 *     (`apps/web/collections/media.ts`), so a request that dies between
 *     `create` and anything after it leaves a VISIBLY processing row rather
 *     than an invisible one. That is the state the Media screen shows for a
 *     crashed upload, and the default is asserted rather than assumed.
 *
 * ═══ WHAT `worker` MODE DOES NOT DO YET, SAID HERE RATHER THAN DISCOVERED ═══
 *
 * Under `worker` nothing sniffs and nothing strips the staged bytes at
 * ingest, because the pipeline runs on the worker. **There is no worker
 * process in this repository**, so that mode would store an un-stripped
 * original — GPS EXIF intact — at `state: 'processing'` and never advance it.
 * **`MEDIA_PIPELINE=worker` therefore does not boot** (`../env.ts`), and a row
 * that is not `ready` is withheld from a signed-out reader by
 * `apps/web/collections/media.ts`'s `read` access. Two controls, deliberately
 * independent: the second holds if somebody deletes the first. This paragraph
 * called it "a deployment precondition, recorded here" and recorded it in four
 * documents; documentation was not the control, which is Task 8 review
 * finding 1.
 *
 * The `worker` BRANCH below stays exactly as it is. The mode is real — both
 * adapters run one contract suite, `mediaProcessorFor` and
 * `acceptedIngestTypes` take it as an argument, and this file's own cases
 * drive it — and ADR 0004 requires enabling clips to be a configuration
 * change rather than new code. What is refused is configuring the PROCESS into
 * it before a worker exists to finish what it starts.
 *
 * ═══ INVARIANTS A FUTURE EDIT COULD BREAK ═══
 *
 *   - **ONLY A KEY THIS JOURNEY'S SLOTS WERE MINTED UNDER IS EVER READ OR
 *     DELETED.** `isStagingKeyFor` is asked before the object is read and
 *     before the `try` whose `finally` deletes it, so the two checks cannot be
 *     separated by an edit. Dropping it fails “refuses a finalise naming a key
 *     outside the journey's staging namespace, rather than deleting a live
 *     media file”.
 *   - **THE STAGING OBJECT IS DELETED ON EVERY PATH**, in a `finally`,
 *     refusals included. It is the PRE-STRIP ORIGINAL — the copy that still
 *     carries the GPS coordinates `SECURITY.md` exists to remove — so leaving
 *     it behind undoes the strip for anybody who can enumerate the store.
 *     Moving the delete onto the success path fails “removes the staging
 *     object even when the bytes are refused”.
 *   - **THE DUPLICATE MATCH IS SCOPED TO ONE JOURNEY**, by the `where` clause
 *     and never by filtering afterwards. The handoff records five defects
 *     caused by per-journey state held in one global value (CLAUDE.md §7);
 *     a collection-wide duplicate scan would be the sixth, and it would tell
 *     an author that the photograph they just uploaded to Iceland is a copy of
 *     one in Japan. Dropping the clause fails “does not report the same
 *     photograph in a different journey as a duplicate” while leaving the
 *     same-journey case green, which is why both cases exist.
 *   - **THE MATCH IS PERCEPTUAL, NOT AN EQUALITY, and the difference is the
 *     feature.** `isPerceptualDuplicate` admits a photograph within
 *     `DUPLICATE_MAX_DISTANCE` bits — a crop, a brightness tweak, a "save for
 *     web" resize. Replacing it with `===` is a plausible edit ("the hashes
 *     are deterministic, why the helper") and every case that named a
 *     duplicate stayed green under it until three cases read the constant and
 *     moved the STORED row's hash to sit a measured distance away. See
 *     `./testing/ingestProbes.ts`'s `flipBits` for why the near-duplicate is a
 *     hash rather than a photograph.
 *   - **ONE QUERY, NOT ONE PER ROW.** The hashes come back in a single
 *     `find` with `pagination: false`, `depth: 0` and a narrow `select`
 *     (CLAUDE.md §6, no N+1; §7, select only what is needed). A per-row read
 *     would be one query per photograph already in the journey.
 *   - **THE ROW IS CREATED FROM `processed.bytes`, NEVER FROM THE STAGED
 *     BYTES, under `inline`.** The staged bytes are the original;
 *     `SECURITY.md` requires the stored file to be the re-encode.
 *
 * PATTERN (CLAUDE.md §3.3): Ports & Adapters — the store, the processor and
 * the queue are all ports, and this module names no adapter; Result type, so
 * every refusal is a value the caller has to handle; Repository, in that the
 * `media` collection is reached only through the injected Payload and nothing
 * above this module learns what a CMS row looks like.
 * Depends on: `isPerceptualDuplicate` (@travel-diary/domain/media/perceptualHash);
 * `isStagingKeyFor` (@travel-diary/domain/media/uploadSlot);
 * `mediaId` and the branded ids; `Result`, `err` and `ok`; the MediaProcessor,
 * Storage and Queue ports; `getPayload` (../payload), for the instance type
 * only.
 */
import type { JourneyId, MediaId } from '@travel-diary/domain/ids'
import { journeyId, mediaId } from '@travel-diary/domain/ids'
import type { PipelineMode } from '@travel-diary/domain/media/ingestPolicy'
import { isStagingKeyFor } from '@travel-diary/domain/media/uploadSlot'
import { isPerceptualDuplicate } from '@travel-diary/domain/media/perceptualHash'
import type { Result } from '@travel-diary/domain/result'
import { err, ok } from '@travel-diary/domain/result'
import type { getPayload } from '../payload'
import type { MediaProcessor } from '../ports/mediaProcessor'
import type { QueuePort } from '../ports/queue'
import type { StoragePort } from '../ports/storage'
import type { FinaliseFailure, FinaliseRequest, FinaliseResponse } from './uploadContract'

/** What ingest is asked to turn into a row: one staged object, and its claims. */
export interface IngestInput {
  /** Where Task 7's receiver put the bytes. Never returned to a caller. */
  readonly stagingKey: string
  /** What the client called the bytes. A claim, weighed only by the processor. */
  readonly declaredType: string
  /** What the client called the file. Used for the stored name and nothing else. */
  readonly filename: string
  /** The journey the row belongs to, and the only scope duplicates are sought in. */
  readonly journey: JourneyId
}

/** Everything ingest needs, injected so a test can move the queue and the mode. */
export interface IngestDeps {
  /** The Payload instance the row is created through. */
  readonly payload: Awaited<ReturnType<typeof getPayload>>
  /** Where the staged bytes are read from, and removed from afterwards. */
  readonly storage: StoragePort
  /** The bound pipeline. Under `worker` it is not called — see the header. */
  readonly processor: MediaProcessor
  /** Where a `worker` ingest hands the upload on. */
  readonly queue: QueuePort
  /**
   * The configured `MEDIA_PIPELINE`. Taken as a value rather than read from
   * `env` here, for the reason `./services.ts`'s header gives: a function that
   * reads `env` inline has exactly one testable answer per run.
   *
   * INVARIANT: it must name the same mode {@link IngestDeps.processor} was
   * bound for. `finaliseStagedUpload`'s caller builds both from `env`, which
   * is the one place they cannot disagree.
   */
  readonly mode: PipelineMode
}

/** What became of one staged upload. */
export type IngestOutcome =
  | { readonly kind: 'ready'; readonly media: MediaId }
  | { readonly kind: 'duplicate'; readonly of: MediaId }
  | { readonly kind: 'queued'; readonly media: MediaId; readonly job: string }

/**
 * Why a staged upload became no row.
 *
 * An alias of the contract's own {@link FinaliseFailure} rather than a second
 * spelling of the same names: two unions listing one set drift the moment one
 * of them gains a member, and the client switching on the missing name still
 * typechecks. `./uploadContract.ts` carries the list and the reasons.
 */
export type IngestRefusalReason = FinaliseFailure

/**
 * The Payload row id a branded {@link JourneyId} names.
 *
 * @param journey - The branded id. The brand only promises a non-empty
 *   string, so a caller *can* hand over something that is not a Payload id.
 * @returns The numeric row id, or `undefined` when `journey` is not one — the
 *   alternative being `Number('nonsense')` reaching the driver as `NaN` and
 *   escaping as a raw `Failed query` past the `Result` contract. The same
 *   guard, for the same reason, as `../auth/sessions.ts`'s `accountRowId`.
 */
const journeyRowId = (journey: JourneyId): number | undefined => {
  const parsed = Number(journey)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined
}

/**
 * Brands a primary key Payload itself assigned.
 *
 * THE ONE PLACE THIS FILE TURNS A ROW ID INTO A {@link MediaId}, so the
 * unreachable refusal below is written once rather than three times, and no
 * refusal name has to be invented to carry a condition nothing can produce.
 * @param id - The primary key of a row Payload has just returned.
 * @returns The branded id.
 * @throws When the branded constructor refuses the id, which would mean an
 *   empty primary key. The throw stays rather than becoming a refusal name
 *   because a caller handed a key with a hole in it is worse than a caller
 *   handed an exception, and the same argument is written at
 *   `./testing/uploadProbes.ts`'s own branding guard.
 */
const brandedRowId = (id: number | string): MediaId => {
  const branded = mediaId(String(id))
  /* c8 ignore next -- no organic trigger: Payload's primary key is never the empty string, which is the branded constructor's only refusal (see @throws). */
  if (!branded.ok) throw new Error(branded.error)
  return branded.value
}

/**
 * The id of a row in `journey` whose photograph is perceptually the one
 * `contentHash` describes.
 *
 * ONE QUERY, KEYED BY JOURNEY, SELECTING ONE COLUMN — see this module's
 * invariants for why each of those three is load-bearing.
 * @param contentHash - The hash of the bytes being ingested.
 * @param journey - The row id of the journey to look inside. Never omitted.
 * @param payload - The Payload instance to read through.
 * @returns The existing row's branded id, or `null` when the journey holds
 *   nothing like it. A row whose own hash is still pending — a `worker` row
 *   the worker has not reached yet — matches nothing, because an empty hash is
 *   not a hash and `isPerceptualDuplicate` refuses to compare one.
 */
const duplicateIn = async (
  contentHash: string,
  journey: number,
  payload: IngestDeps['payload'],
): Promise<MediaId | null> => {
  const existing = await payload.find({
    collection: 'media',
    depth: 0,
    pagination: false,
    where: { journey: { equals: journey } },
    select: { contentHash: true },
  })

  const matched = existing.docs.find((row) => isPerceptualDuplicate(row.contentHash ?? '', contentHash))
  return matched === undefined ? null : brandedRowId(matched.id)
}

/**
 * Turns one staged upload into a `media` row, or refuses it.
 *
 * @param input - The staged object's key, the client's claims about it, and
 *   the journey it belongs to.
 * @param deps - See {@link IngestDeps}.
 * @returns `ok` with what became of the upload, or `err` naming the refusal.
 *   The staging object is removed on every one of those paths.
 * @example
 * await ingestUpload(
 *   { stagingKey: 'staging/3/ab-tokyo.jpg', declaredType: 'image/jpeg', filename: 'tokyo.jpg', journey },
 *   { payload, storage, processor: mediaProcessor(), queue: createPostgresQueue(), mode: 'inline' },
 * )
 */
export const ingestUpload = async (
  input: IngestInput,
  deps: IngestDeps,
): Promise<Result<IngestOutcome, IngestRefusalReason>> => {
  // BEFORE THE OBJECT IS READ, AND BEFORE THE `try` THAT DELETES IT. This
  // function reads whatever key it is handed and then deletes it, and the
  // production store is rooted at `MEDIA_DIR` - the same directory Payload
  // writes every stored file and derivative into. Without this check, a
  // finalise naming a live photograph would destroy it and answer
  // `duplicate`, which is a success-shaped answer over a deletion.
  // `validateStorageKey` inside the store cannot help: it asks whether a key
  // is well formed, and a stored photograph's key is well formed.
  if (!isStagingKeyFor({ key: input.stagingKey, journey: input.journey })) return err('key-not-staged')

  const staged = await deps.storage.get(input.stagingKey)
  // Also before the `try`: a key that names no object has nothing to clean up,
  // and there is no row to have half-created.
  if (!staged.ok) return err('staged-bytes-missing')

  try {
    // INSIDE the `try`, equally deliberately, so this refusal removes the
    // staged original like every other one does. A client that names a journey
    // nothing can be keyed by does not get to leave a GPS-carrying copy in the
    // store on its way out; re-uploading is cheap and that residual is not.
    const journey = journeyRowId(input.journey)
    if (journey === undefined) return err('invalid-journey')

    return deps.mode === 'worker'
      ? await handOffToWorker({ input, journey, bytes: staged.value }, deps)
      : await ingestInline({ input, journey, bytes: staged.value }, deps)
  } finally {
    // EVERY path, refusals included: the staged object is the pre-strip
    // original. A store that cannot delete leaves the orphan ADR 0020 already
    // records and Phase 4 sweeps; failing an ingest that otherwise succeeded
    // would be the worse answer, and there is nowhere to report it that the
    // admin would see.
    await deps.storage.delete(input.stagingKey)
  }
}

/** One staged upload, with its journey resolved to a row id and its bytes read. */
interface StagedBytes {
  readonly input: IngestInput
  readonly journey: number
  readonly bytes: Uint8Array
}

/**
 * Processes the bytes here and now, and stores the re-encode.
 * @param staged - The staged upload, its journey row id, and its bytes.
 * @param deps - See {@link IngestDeps}.
 * @returns `ok` naming the created row, or the duplicate it copies, or `err`
 *   naming why the bytes were refused.
 */
const ingestInline = async (
  staged: StagedBytes,
  deps: IngestDeps,
): Promise<Result<IngestOutcome, IngestRefusalReason>> => {
  const processed = await deps.processor.process({
    bytes: staged.bytes,
    declaredType: staged.input.declaredType,
    filename: staged.input.filename,
  })
  if (!processed.ok) return err(processed.error)

  const copy = await duplicateIn(processed.value.contentHash, staged.journey, deps.payload)
  if (copy !== null) return ok({ kind: 'duplicate', of: copy })

  const created = await deps.payload.create({
    collection: 'media',
    data: {
      journey: staged.journey,
      kind: processed.value.kind,
      contentHash: processed.value.contentHash,
      state: 'ready',
      // Spread rather than `capturedAt: processed.value.capturedAt`: under
      // `exactOptionalPropertyTypes` an explicit `undefined` is not the same
      // as an absent field, and a photograph with no EXIF has no capture time
      // to record.
      ...(processed.value.capturedAt === undefined ? {} : { capturedAt: processed.value.capturedAt }),
    },
    file: {
      data: Buffer.from(processed.value.bytes),
      mimetype: processed.value.contentType,
      name: processed.value.filename,
      size: processed.value.bytes.byteLength,
    },
  })

  return ok({ kind: 'ready', media: brandedRowId(created.id) })
}

/**
 * Records the upload and hands it to the queue, without processing it here.
 * @param staged - The staged upload, its journey row id, and its bytes.
 * @param deps - See {@link IngestDeps}.
 * @returns `ok` naming the created row and the job that will finish it, or
 *   `err` when the job could not be queued.
 */
const handOffToWorker = async (
  staged: StagedBytes,
  deps: IngestDeps,
): Promise<Result<IngestOutcome, IngestRefusalReason>> => {
  const created = await deps.payload.create({
    collection: 'media',
    // No `kind`, no `contentHash`, no `capturedAt`: all three are answers the
    // pipeline gives, and the pipeline has not run. `state` is left to the
    // collection's own default of `processing`, which is the same value a
    // crashed `inline` upload leaves, and means the same thing.
    data: { journey: staged.journey },
    file: {
      data: Buffer.from(staged.bytes),
      mimetype: staged.input.declaredType,
      name: staged.input.filename,
      size: staged.bytes.byteLength,
    },
  })

  const media = brandedRowId(created.id)
  const enqueued = await deps.queue.enqueue({ kind: 'transcode', mediaId: media })
  /* c8 ignore next -- no organic trigger: `createPostgresQueue().enqueue` refuses only when the `jobs` insert throws, and every field it writes is either a literal or the primary key Payload has just assigned. Arranging one would mean stubbing a port this repository owns (CLAUDE.md §2.3). The row is left at `processing` rather than deleted: that is the state a crashed upload leaves, it means the same thing to the Media screen, and it keeps the photograph rather than discarding an author's upload because the queue was down. */
  if (!enqueued.ok) return err('not-queued')

  return ok({ kind: 'queued', media, job: enqueued.value })
}

/**
 * Finalises one staged upload for the admin's Server Action.
 *
 * THE JOURNEY IS BRANDED HERE, NOT IN THE ACTION, for the reason
 * `./uploadSlots.ts` gives about `offerUploadSlots`: a decision that lives in
 * a `'use server'` module is a decision no test process can execute, because a
 * Server Action needs a request context none of them has. The action is the
 * guard and the wiring; this is the part that decides something.
 * @param request - The client's own description of the staged object. Every
 *   field is a claim.
 * @param deps - See {@link IngestDeps}.
 * @returns The outcome, or the refusal, in the shape the contract publishes.
 *   Never a storage key: naming one would hand the caller the store's own
 *   naming, which is the enumeration `../readGalleryDownload.ts` refuses to
 *   enable.
 * @example
 * await finaliseStagedUpload(request, { payload, storage, processor, queue, mode })
 */
export const finaliseStagedUpload = async (request: FinaliseRequest, deps: IngestDeps): Promise<FinaliseResponse> => {
  // NOT `request.journey.trim()`, which `offerUploadSlots` does and this used
  // to copy. There the trimmed string becomes part of a staging key, so it is
  // observable; here the branded id is only ever read by `journeyRowId`, whose
  // `Number()` ignores surrounding whitespace, and `journeyId` already refuses
  // a whitespace-only id. A trim here changed nothing any case could see -
  // watched surviving its own mutation - so it is gone rather than kept as
  // something a reader would take for a guard.
  const journey = journeyId(request.journey)
  if (!journey.ok) return err('invalid-journey')

  return ingestUpload(
    {
      stagingKey: request.stagingKey,
      declaredType: request.declaredType,
      filename: request.filename,
      journey: journey.value,
    },
    deps,
  )
}
