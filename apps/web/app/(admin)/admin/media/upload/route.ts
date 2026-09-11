/**
 * route.ts — `PUT /admin/media/upload?token=…`: where a browser sends an
 * upload's bytes.
 *
 * THE GUARD IS APPLIED HERE, IN THIS FILE, AND THAT IS THE POINT OF THE ONE
 * LINE BELOW. An upload is a mutation by the author, and the token in the
 * query string is a capability over ONE KEY — not authentication. Without the
 * guard, anybody holding a leaked URL could write into the store; with it,
 * they must also be signed in. The address is deliberately NOT in
 * `ADMIN_PUBLIC_PATHS`, and the session cookie is `Path=/admin`, so the
 * browser sends it here.
 *
 * THE ADDRESS CARRIES NO BRACKET SEGMENT, deliberately: the token is a query
 * parameter rather than a path segment, so this file avoids the
 * `@vitest/coverage-v8` ignore-hint defect CLAUDE.md §2.1 documents for
 * Next.js dynamic-route directories, and needs no config carve-out.
 *
 * WHY IT EXISTS AT ALL, since a presigned upload is supposed to go straight to
 * the bucket: there is no bucket here, and the local disk adapter's
 * `signedUrl` returns a `file://` URL no browser can PUT to. See
 * `docs/adr/0020-the-presign-seam-and-the-local-upload-receiver.md`, which
 * also records the residual — this route must be deleted or gated in the same
 * change that adds the R2 adapter.
 * Depends on: `guarded` (../../../../../lib/auth/guard), `handleLocalUpload`
 * (../../../../../lib/media/localUploadEndpoint).
 */
/* c8 ignore start -- Framework passthrough with no authored logic: this file
 * names a handler and the wrapper that guards it. Every decision is
 * `guarded`'s and `handleLocalUpload`'s, both driven by
 * `localUploadEndpoint.integration.test.ts` and `guard.integration.test.ts`
 * with real `Request`s, and both gated by `vitest.integration.config.ts`. It
 * cannot be measured by either Vitest config (a route handler is only reached
 * through Next's own routing), and this file's path contains no `[...]`
 * segment, so the ignore hint is read and no config exclusion is needed. Wraps
 * the imports too: an unimported file's imports are themselves uncovered
 * lines. */
import { guarded } from '../../../../../lib/auth/guard'
import { handleLocalUpload } from '../../../../../lib/media/localUploadEndpoint'

/**
 * Receives one presigned upload's bytes, for a reader who is signed in.
 *
 * Exported under the name Next.js requires for a `PUT` route.
 */
export const PUT = guarded(handleLocalUpload)
/* c8 ignore stop */
