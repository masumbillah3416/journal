/**
 * uploadSlots — turns "here is what I am about to upload" into "here is where
 * to put each of it".
 *
 * The whole of what `requestUploadSlots` in
 * `apps/web/app/(admin)/admin/media/actions.ts` does, kept out of that module
 * so it can be executed: a Server Action needs a request context no test
 * process has, and a decision that can only be asserted about is a decision
 * nobody has run.
 *
 * ═══ WHY EVERY DEPENDENCY IS A PARAMETER ═══
 *
 * `mediaProcessor()` and the live store are built INSIDE the action, not here
 * and not at either module's top level. Two reasons, and both are rules
 * somebody wrote down after being bitten:
 * `eslint-rules/guarded-server-actions.js`'s rule 4 refuses anything that
 * evaluates at load in a `'use server'` module, and `./services.ts`'s header
 * explains why a function that reads `env` inline has exactly one testable
 * answer per run. Passing them in is what lets the same code be exercised
 * under both pipeline modes without stubbing a module this repository owns
 * (CLAUDE.md §2.3).
 *
 * ═══ INVARIANTS A FUTURE EDIT COULD BREAK ═══
 *
 *   - **`acceptedTypes` comes off the BOUND processor.** ADR 0004 requires
 *     enabling clips to be one configuration change; a second list here would
 *     be a second place for that change to be forgotten, and the picker would
 *     offer a slot the processor then refuses.
 *   - **The whole request fails when one slot cannot be offered.** Half a set
 *     of URLs is a client that uploads some files and never learns which it
 *     lost — the same argument `planUploadSlots` makes for the plan itself.
 *   - **`MAX_UPLOAD_BYTES` is what each URL is minted against**, not the
 *     client's declared length. A URL minted for exactly what the client said
 *     would let a client that understated its size get a cap of its own
 *     choosing; the receiver's cap is ours.
 *
 * PATTERN (CLAUDE.md §3.3): Ports & Adapters — this module names neither the
 * concrete store nor the concrete processor.
 * Depends on: `planUploadSlots`, `MAX_UPLOAD_BYTES` and
 * `UPLOAD_URL_TTL_SECONDS` (@travel-diary/domain/media/uploadSlot);
 * `journeyId` (@travel-diary/domain/ids); the StoragePort and MediaProcessor
 * ports; the upload contract's own shapes.
 */
import { journeyId } from '@travel-diary/domain/ids'
import { MAX_UPLOAD_BYTES, UPLOAD_URL_TTL_SECONDS, planUploadSlots } from '@travel-diary/domain/media/uploadSlot'
import { err, ok } from '@travel-diary/domain/result'
import type { MediaProcessor } from '../ports/mediaProcessor'
import type { StoragePort } from '../ports/storage'
import type { OfferedUploadSlot, UploadSlotRequest, UploadSlotResponse } from './uploadContract'

/** What offering slots needs from the world outside it. */
export interface SlotDependencies {
  /** The bound pipeline, read only for the types it will accept. */
  readonly processor: MediaProcessor
  /** Where the objects will live, and what mints each URL. */
  readonly storage: StoragePort
  /**
   * The unique part of each staging key. Injected, never reached for: a key
   * built from `randomUUID()` inside the logic is a key no test can assert
   * (CLAUDE.md §2.3). The action passes `() => randomUUID()`.
   */
  readonly nonce: (index: number) => string
}

/**
 * Offers one upload URL per file, or refuses the request.
 *
 * @param request - The journey to key by, and what the client says it is about
 *   to upload. Every field of every file is a claim; nothing is weighed here.
 * @param dependencies - See {@link SlotDependencies}.
 * @returns `ok` with one slot per file, in the order asked for, or `err`
 *   naming the refusal. Never partially succeeds.
 * @example
 * await offerUploadSlots(
 *   { journey: '12', files: [{ filename: 'tokyo.jpg', declaredType: 'image/jpeg', byteLength: 2_000_000 }] },
 *   { processor: mediaProcessor(), storage: createLocalStorage(MEDIA_DIR), nonce: () => randomUUID() },
 * )
 */
export const offerUploadSlots = async (
  request: UploadSlotRequest,
  dependencies: SlotDependencies,
): Promise<UploadSlotResponse> => {
  const journey = journeyId(request.journey.trim())
  if (!journey.ok) return err('invalid-journey')

  const planned = planUploadSlots({
    files: request.files,
    acceptedTypes: dependencies.processor.acceptedTypes,
    journey: journey.value,
    nonce: dependencies.nonce,
  })
  if (!planned.ok) return err(planned.error)

  // Sequential rather than concurrent, deliberately: the plan is capped at
  // MAX_FILES_PER_REQUEST, minting is a signature and a string, and a refusal
  // should stop the run rather than race twenty of them to completion.
  const offered: OfferedUploadSlot[] = []
  for (const slot of planned.value) {
    const url = await dependencies.storage.uploadUrl(slot.stagingKey, {
      expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
      contentType: slot.declaredType,
      maxBytes: MAX_UPLOAD_BYTES,
    })
    if (!url.ok) return err('no-upload-url')

    offered.push({ ...slot, uploadUrl: url.value })
  }

  return ok(offered)
}
