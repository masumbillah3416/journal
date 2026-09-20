/**
 * sweepStagedUploads — removes the staged originals nothing else removes.
 *
 * ═══ THE RESIDUAL THIS CLOSES, IN ADR 0020'S OWN WORDS ═══
 *
 * "A slot that is uploaded to and never finalised leaves its staged bytes
 * behind forever, and nothing in Phase 3 sweeps them… **Those objects are the
 * PRE-STRIP ORIGINALS**: the copy that still carries the GPS coordinates,
 * which is the exact data `SECURITY.md`'s read-EXIF-then-strip requirement
 * exists to remove… **The sweep is owed by Phase 4**, not 'eventually': it
 * needs a scheduler, which no task in the Phase 3 plan builds."
 *
 * `../media/ingestUpload.ts` deletes the staged copy on every FINALISE path,
 * in a `finally`, refusals included. What it cannot reach is an upload that
 * never finalises — the author closed the tab, the request failed, the page
 * was reloaded. This is what reaches those.
 *
 * ═══ IT IS A LIBRARY FUNCTION, AND THE SCHEDULER IS A SCRIPT ═══
 *
 * `apps/web/scripts/sweep-staged.ts` is the command's body and
 * `run-sweep-staged.ts` its entry point, the same two-file shape
 * `media:rederive` has. Three shapes were available and
 * `docs/adr/0024-the-staged-upload-sweep.md` records why this one: sweeping
 * inside the upload path is the speculative extension ADR 0020 already
 * refuses, and a `jobs` row needs the worker ADR 0004 defers.
 *
 * ═══ PATTERN (CLAUDE.md §3.3) ═══
 *
 * Result type, and Ports & Adapters on the store side: the decision is
 * `@travel-diary/domain/media/stagedObjects`'s, the enumeration and the
 * deletion are the {@link StoragePort}'s, and this module is the composition.
 * It names no adapter, so the same sweep runs against R2 the day that adapter
 * exists.
 *
 * ═══ INVARIANTS A FUTURE EDIT COULD BREAK ═══
 *
 *   - **NOTHING IS DELETED THAT `staleStagedObjects` DID NOT RETURN.** The
 *     production store is rooted at `MEDIA_DIR`, which is also where Payload
 *     keeps every published photograph and every derivative, so the listing
 *     this walks contains the book. The domain module's default-deny on the
 *     key shape is what stands between this function and that, and
 *     `sweepStagedUploads.integration.test.ts` puts a real Payload-written
 *     filename into the same store and requires it to survive.
 *   - **`now` IS INJECTED** (CLAUDE.md §2.3). A `Date.now()` in here would
 *     make the window unassertable.
 *   - **THE WINDOW IS THE DOMAIN'S.** `STAGED_UPLOAD_TTL_MS` is read here and
 *     nowhere else in `apps/web`; the runbook quotes the same module.
 *   - **A DELETE THAT FAILS DOES NOT STOP THE SWEEP.** Every stale key is
 *     attempted before anything is reported, because stopping at the first
 *     failure leaves the remaining un-stripped originals in the store — which
 *     is the thing this function exists to prevent.
 *
 * Depends on: `STAGING_PREFIX` (@travel-diary/domain/media/uploadSlot),
 * `STAGED_UPLOAD_TTL_MS` and `staleStagedObjects`
 * (@travel-diary/domain/media/stagedObjects), `Result`/`err`/`ok`
 * (@travel-diary/domain/result), `StoragePort` (../ports/storage).
 */
import { STAGED_UPLOAD_TTL_MS, staleStagedObjects } from '@travel-diary/domain/media/stagedObjects'
import { STAGING_PREFIX } from '@travel-diary/domain/media/uploadSlot'
import type { Result } from '@travel-diary/domain/result'
import { err, ok } from '@travel-diary/domain/result'
import type { StoragePort } from '../ports/storage'

/**
 * What the sweep needs.
 *
 * ONE FIELD, AND THE TASK BRIEF SPECIFIED TWO. A `payload` was to supply "the
 * staging keys a media row still points at" — see
 * `@travel-diary/domain/media/stagedObjects`'s header for the measurement that
 * no column anywhere records one. A dependency nothing reads is a dependency
 * the next author wires up and wonders about.
 */
export interface SweepDeps {
  /** The store the staged objects live in, and the one they are removed from. */
  readonly storage: StoragePort
}

/**
 * Removes every abandoned staged original the store still holds.
 *
 * @param deps - See {@link SweepDeps}.
 * @param now - The sweep's clock reading, injected.
 * @returns `ok` with the keys removed, in the order they were listed — empty
 *   on an ordinary run — or `err` naming why the store could not be walked, or
 *   which keys it refused to give up.
 * @example
 * const swept = await sweepStagedUploads({ storage: createLocalStorage(MEDIA_DIR) }, Date.now())
 */
export const sweepStagedUploads = async (deps: SweepDeps, now: number): Promise<Result<readonly string[], string>> => {
  const listed = await deps.storage.list(STAGING_PREFIX)
  if (!listed.ok) return err(`the staging namespace could not be listed: ${listed.error}`)

  const stale = staleStagedObjects(listed.value, now, STAGED_UPLOAD_TTL_MS)

  // Sequential rather than `Promise.all`: a sweep is a background job with no
  // deadline, and a store handed every delete of a large abandoned batch at
  // once is a store answering a burst nobody is waiting for.
  const refused: string[] = []
  for (const key of stale) {
    const removed = await deps.storage.delete(key)
    /* c8 ignore next 2 -- no organic trigger: every key here came out of `staleStagedObjects`, which returns only keys of the shape `planUploadSlots` mints, and the local adapter's `delete` refuses only a key `validateStorageKey` rejects and swallows every filesystem error. The arm stays because an R2 adapter's `delete` CAN refuse - a credential, a bucket policy - and a sweep that reported those keys as removed would be a report the runbook trusts. */
    if (!removed.ok) refused.push(key)
  }

  /* c8 ignore next -- as above: unreachable while the local adapter is the only one. */
  if (refused.length > 0) return err(`the store refused to remove ${String(refused.length)} staged object(s)`)

  return ok(stale)
}
