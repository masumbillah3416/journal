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
 * in `offerUploadSlots`, which is executable; this file is the guard and the
 * wiring.
 * Depends on: guardedAction (../../../../lib/auth/guard), offerUploadSlots
 * (../../../../lib/media/uploadSlots), mediaProcessor
 * (../../../../lib/media/services), createLocalStorage and MEDIA_DIR, and the
 * contract types (../../../../lib/media/uploadContract).
 */
/* c8 ignore start -- Framework passthrough with no authored logic: this file
 * names the guard factory and the service it wraps. Every decision is
 * `guardedAction`'s (executed by `guard.integration.test.ts`) and
 * `offerUploadSlots`'s (executed by `uploadSlots.integration.test.ts`, gated
 * at 100% by vitest.integration.config.ts). Neither Vitest project can execute
 * it: a Server Action is dispatched by Next.js under an opaque action id and
 * needs a request context no test process has. This file's path contains no
 * `[...]` segment, so the ignore hint is read and no config exclusion is
 * needed. Wraps the imports too: an unimported file's imports are themselves
 * uncovered lines. */
import { randomUUID } from 'node:crypto'
import { MEDIA_DIR } from '../../../../collections/media'
import { createLocalStorage } from '../../../../lib/adapters/local-storage'
import { guardedAction } from '../../../../lib/auth/guard'
import { mediaProcessor } from '../../../../lib/media/services'
import type { UploadSlotRequest, UploadSlotResponse } from '../../../../lib/media/uploadContract'
import { offerUploadSlots } from '../../../../lib/media/uploadSlots'

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
/* c8 ignore stop */
