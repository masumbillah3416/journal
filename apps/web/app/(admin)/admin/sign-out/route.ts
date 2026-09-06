/**
 * route.ts — `POST /admin/sign-out`: what SCREENS.md §3.4's "Sign out and
 * start again" posts to.
 *
 * IT TAKES NO DECISIONS AT ALL. Its whole body is one re-export: authenticating
 * the request, revoking the row and clearing the cookie are all
 * `apps/web/lib/auth/signInEndpoints.ts`'s `handleSignOut`, which
 * `signInEndpoints.integration.test.ts` drives end to end with a real
 * `Request` and a real Payload. Its sibling `sign-in/password/route.ts` says
 * more about why a route file holds one line here.
 *
 * A `POST`, NEVER A LINK, and the address is `SignedInStep.tsx`'s exported
 * `SIGN_OUT_ENDPOINT`. Signing out changes something, so it must not be
 * reachable by a `GET` that a prefetch, a crawler or an image tag can make.
 *
 * IT IS A GUARDED ADDRESS. `adminAccess.ts` does not list it in
 * `ADMIN_PUBLIC_PATHS`, so it is guarded by default, and the handler calls
 * `authenticateAdminRequest` before it revokes anything: revocation names a
 * session, and naming one you do not hold is how a session is taken away from
 * its owner rather than from a thief.
 * Depends on: `handleSignOut` (../../../../lib/auth/signInEndpoints).
 */
/* c8 ignore start -- Framework passthrough with no authored logic whatsoever:
 * this file names the handler and nothing else. Every decision is
 * `handleSignOut`'s, which `signInEndpoints.integration.test.ts` drives with a
 * real `Request` and a real Payload, and which `vitest.integration.config.ts`
 * gates. It cannot be measured by either Vitest config (a route handler is only
 * reached through Next's own routing), and this file's path contains no `[...]`
 * segment, so the ignore hint is read and no config exclusion is needed. Wraps
 * the import too, not just the export: an unimported file's imports are
 * themselves uncovered lines. */
import { handleSignOut } from '../../../../lib/auth/signInEndpoints'

/**
 * Answers "Sign out and start again".
 *
 * Exported under the name Next.js requires for a `POST` route; the function
 * itself is the library's, so nothing about the handler is only reachable
 * through the framework.
 */
export const POST = handleSignOut
/* c8 ignore stop */
