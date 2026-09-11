/**
 * localUploadEndpoint — the HTTP half of the local upload receiver.
 *
 * `apps/web/app/(admin)/admin/media/upload/route.ts` is one line naming
 * {@link handleLocalUpload}, so that `guarded` is applied IN THE ROUTE FILE —
 * the only version of that check `apps/web/lib/auth/adminGuardRegistration.test.ts`
 * accepts, and the reason `apps/web/lib/auth/signInEndpoints.ts` is shaped this
 * way too. Everything the endpoint decides lives here, where a test can drive
 * it with a real `Request`.
 *
 * ═══ ONE REFUSAL FOR THREE CAUSES, DELIBERATELY ═══
 *
 * `'malformed'`, `'expired'` and `'bad-signature'` all answer `403`. They are
 * three different facts about a presented token, and telling them apart is
 * exactly what an attacker forging one wants: which half of the token was
 * wrong, and whether the key it named exists. `readGalleryDownload` already
 * follows this rule for the same reason, and its header calls the alternative
 * an enumeration oracle.
 *
 * `413` for `'too-large'` is not that: the client was told the cap when it
 * asked for the slot, so the status tells it nothing it did not already know,
 * and a browser upload that fails silently at 50MB is a defect report nobody
 * can act on. `500` for `'unwritable'` is ours, not the client's — the request
 * was legitimate and the store could not take it.
 *
 * ═══ NO BODY ON ANY ANSWER ═══
 *
 * A `204` carries nothing by definition, and the refusals carry nothing on
 * purpose: a body would be a place for a key, a path or a reason to leak into
 * a response the client can read.
 *
 * PATTERN (CLAUDE.md §3.3): none of the seven — this is the mapping from one
 * `Result` to one `Response`, and naming a pattern for it would be cargo cult.
 * Depends on: `receiveLocalUpload` (./receiveLocalUpload); `GuardedHandler`
 * (../auth/guard); `createLocalStorage` (../adapters/local-storage);
 * `MEDIA_DIR` (../../collections/media); `env` (../env).
 */
import { createLocalStorage } from '../adapters/local-storage'
import type { GuardedHandler } from '../auth/guard'
import { env } from '../env'
import { MEDIA_DIR } from '../../collections/media'
import type { ReceiveRefusal } from './receiveLocalUpload'
import { receiveLocalUpload } from './receiveLocalUpload'
import type { Result } from '@travel-diary/domain/result'

/** Received and stored. No content, because there is nothing to say. */
const NO_CONTENT = 204

/** The body was bigger than the capability allowed. */
const PAYLOAD_TOO_LARGE = 413

/** The one answer every unusable token gets. See this module's header. */
const FORBIDDEN = 403

/** Ours, not the client's: the request was fine and the store was not. */
const INTERNAL_ERROR = 500

/**
 * Turns the receiver's answer into the one a browser sees.
 *
 * @param received - What `receiveLocalUpload` decided.
 * @returns An empty response carrying only the status.
 * @example
 * localUploadResponse({ ok: false, error: 'too-large' }).status // 413
 */
export const localUploadResponse = (received: Result<{ readonly key: string }, ReceiveRefusal>): Response => {
  if (received.ok) return new Response(null, { status: NO_CONTENT })
  if (received.error === 'too-large') return new Response(null, { status: PAYLOAD_TOO_LARGE })
  if (received.error === 'unwritable') return new Response(null, { status: INTERNAL_ERROR })
  return new Response(null, { status: FORBIDDEN })
}

/**
 * Answers `PUT /admin/media/upload?token=…`.
 *
 * Wires the live store, the real clock and the configured signing secret. The
 * session is not read: the guard in the route file is what requires one, and
 * the token is what says which key these bytes may occupy.
 * @param request - The PUT exactly as it arrived.
 * @returns The status the browser sees, with no body.
 */
export const handleLocalUpload: GuardedHandler = async (request) =>
  localUploadResponse(
    await receiveLocalUpload(request, {
      storage: createLocalStorage(MEDIA_DIR),
      now: Date.now,
      secret: env.PAYLOAD_SECRET,
    }),
  )
