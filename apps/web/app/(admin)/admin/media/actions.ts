'use server'

/**
 * actions — the admin's media mutations. Every export is built from
 * `guardedAction`, which is what a Server Action needs rather than a check it
 * could forget: an action is a POST endpoint of its own, dispatched before the
 * page around it renders, so the page's own guard has not run (SECURITY.md:
 * nothing inherits trust from the page it was reached from).
 *
 * NOTHING IS BUILT AT THE TOP LEVEL. `mediaProcessor()`, the store and the
 * nonce source are all constructed INSIDE the action —
 * `eslint-rules/guarded-server-actions.js`'s rule 4 refuses a module that
 * evaluates anything at load, and it refuses it because an attachment made at
 * load is an export no `export` keyword spells. The decisions themselves live
 * in `offerUploadSlots` and `finaliseStagedUpload`, both of which are
 * executable; this file is the guard and the wiring.
 *
 * ═══ PHASE 4 TASK 8 ADDED THE THREE BULK WRITES §2.4'S BAR DISPATCHES ═══
 *
 * The same shape: the guard and the wiring here, every decision in
 * `../../../../lib/admin/mediaMutations.ts`, which an integration test
 * executes against a real Payload. They take arrays rather than `FormData`
 * because §2.4's bulk bar is a client island holding a
 * `ReadonlySet<MediaId>`, not a form — see that module's header.
 * Depends on: guardedAction (../../../../lib/auth/guard), offerUploadSlots
 * (../../../../lib/media/uploadSlots), finaliseStagedUpload
 * (../../../../lib/media/ingestUpload), mediaProcessor
 * (../../../../lib/media/services), createLocalStorage and MEDIA_DIR,
 * createPostgresQueue, getPayload, env, the contract types
 * (../../../../lib/media/uploadContract), adminScope and the three bulk
 * writes (../../../../lib/admin/…).
 */
/* c8 ignore start -- Framework passthrough with no authored logic: this file
 * names the guard factory and the services it wraps. Every decision is
 * `guardedAction`'s (executed by `guard.integration.test.ts`),
 * `offerUploadSlots`'s (executed by `uploadSlots.integration.test.ts`) or
 * `finaliseStagedUpload`'s (executed by `ingestUpload.integration.test.ts`) -
 * the last two gated by vitest.integration.config.ts. Neither Vitest project
 * can execute this file: a Server Action is dispatched by Next.js under an
 * opaque action id and needs a request context no test process has. The `c8 ignore` is the
 * treatment CLAUDE.md §2.1 asks for and the one every comparable file here
 * already carries; what can be OBSERVED of it is that this file reports
 * `0 | 0 | 0 | 0` like every other file under `apps/web/app/`, that no gate
 * moves, and that no exclusion in `vitest.config.ts` was needed. That the hint
 * was READ is not observable from any of those, so it is not claimed. Wraps
 * the imports too: an unimported file's imports are themselves uncovered
 * lines. */
import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { MEDIA_DIR } from '../../../../collections/media'
import { adminScope } from '../../../../lib/admin/adminScope'
import { addMediaToBook, captionMediaRows, moveMediaRows } from '../../../../lib/admin/mediaMutations'
import { createLocalStorage } from '../../../../lib/adapters/local-storage'
import { createPostgresQueue } from '../../../../lib/adapters/postgres-queue'
import { guardedAction } from '../../../../lib/auth/guard'
import { env } from '../../../../lib/env'
import { finaliseStagedUpload } from '../../../../lib/media/ingestUpload'
import { mediaProcessor } from '../../../../lib/media/services'
import type {
  FinaliseRequest,
  FinaliseResponse,
  UploadSlotRequest,
  UploadSlotResponse,
} from '../../../../lib/media/uploadContract'
import { offerUploadSlots } from '../../../../lib/media/uploadSlots'
import { getPayload } from '../../../../lib/payload'

/**
 * The address the three bulk writes invalidate.
 *
 * `revalidatePath` AFTER EVERY ONE, which is what
 * `app/(admin)/admin/journeys/actions.ts` does and for the same reason: the
 * screen is a Server Component reading the library, and without this the grid
 * redraws from the cached render and the author's change is invisible until a
 * hard reload. `requestUploadSlots` and `finaliseUpload` do NOT call it —
 * they are Phase 3's actions, called here and not rewritten, and the dropzone
 * asks for the page itself once its batch has finished.
 */
const MEDIA_PATH = '/admin/media'

/**
 * Offers the admin somewhere to PUT each file it is about to upload.
 *
 * @param _session - The account the guard admitted. Not read: a slot is keyed
 *   by journey, and there is one author.
 * @param request - The journey to stage under, and what the picker selected.
 * @returns One slot per file, or one refusal for the whole request.
 */
export const requestUploadSlots = guardedAction(
  async (_session, request: UploadSlotRequest): Promise<UploadSlotResponse> =>
    offerUploadSlots(request, {
      processor: mediaProcessor(),
      storage: createLocalStorage(MEDIA_DIR),
      nonce: () => randomUUID(),
    }),
)

/**
 * Turns one staged upload into a media row, or says why it became none.
 *
 * @param _session - The account the guard admitted. Not read: a row is keyed
 *   by journey, and there is one author.
 * @param request - The staged object's key and the client's claims about it.
 * @returns What became of the upload, or the refusal. Never a storage key.
 */
export const finaliseUpload = guardedAction(async (_session, request: FinaliseRequest): Promise<FinaliseResponse> =>
  finaliseStagedUpload(request, {
    payload: await getPayload(),
    storage: createLocalStorage(MEDIA_DIR),
    // The processor and the mode are built side by side because both come
    // off `env.MEDIA_PIPELINE`: `mediaProcessor()` reads it to choose the
    // adapter and `mode` carries the same value, so `IngestDeps`'s one
    // invariant - that the two name the same mode - holds by construction
    // rather than by a caller remembering.
    processor: mediaProcessor(),
    queue: createPostgresQueue(),
    mode: env.MEDIA_PIPELINE,
  }),
)

/**
 * Marks every selected photograph as being in the book.
 *
 * @param session - The account the guard admitted, resolved to a scope.
 * @param ids - The selection, as the grid sent it.
 * @returns Nothing. The grid asks for the page again rather than being told.
 */
export const addToBook = guardedAction(async (session, ids: readonly string[]): Promise<void> => {
  await addMediaToBook(await getPayload(), await adminScope(session), ids)
  revalidatePath(MEDIA_PATH)
})

/**
 * Writes one caption to every selected photograph.
 *
 * @param session - The account the guard admitted, resolved to a scope.
 * @param ids - The selection, as the grid sent it.
 * @param caption - What to write. The empty string clears it.
 * @returns Nothing.
 */
export const captionMedia = guardedAction(async (session, ids: readonly string[], caption: string): Promise<void> => {
  await captionMediaRows(await getPayload(), await adminScope(session), ids, caption)
  revalidatePath(MEDIA_PATH)
})

/**
 * Re-points every selected photograph at another journey.
 *
 * @param session - The account the guard admitted, resolved to a scope.
 * @param ids - The selection, as the grid sent it.
 * @param journey - The destination journey's row id.
 * @returns Nothing.
 */
export const moveMedia = guardedAction(async (session, ids: readonly string[], journey: string): Promise<void> => {
  await moveMediaRows(await getPayload(), await adminScope(session), ids, journey)
  // BOTH GALLERIES CHANGED, and only this screen is revalidated. The public
  // diary is rendered per request from `readGalleryBundle` and carries no
  // route cache of its own, so there is nothing else here to invalidate;
  // `app/(admin)/admin/journeys/[id]/actions.ts` revalidates two addresses
  // because both of ITS readers are cached admin routes.
  revalidatePath(MEDIA_PATH)
})
/* c8 ignore stop */
