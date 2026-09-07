/**
 * route.ts — `POST /admin/sign-out`: what SCREENS.md §3.4's "Sign out and
 * start again" posts to.
 *
 * THE GUARD IS APPLIED HERE, IN THIS FILE, AND THAT IS THE POINT OF THE ONE
 * LINE BELOW. `guarded` refuses a request with no live session before
 * `handleSignOut` is entered; revoking a session means naming one, and naming
 * one you do not hold is how a session is taken away from its owner rather
 * than from a thief.
 *
 * IT USED TO CALL THE GUARD INSIDE THE HANDLER, and `adminGuardRegistration.test.ts`
 * had to follow this file's imports to see it — which is what let that test
 * credit a route for its whole handler module (fix round 1, finding 2). The
 * guard being visible in the route file is what lets the test read the route
 * file and nothing else.
 *
 * A `POST`, NEVER A LINK, and the address is `SignedInStep.tsx`'s exported
 * `SIGN_OUT_ENDPOINT`. Signing out changes something, so it must not be
 * reachable by a `GET` that a prefetch, a crawler or an image tag can make.
 * Depends on: `guarded` (../../../../lib/auth/guard), `handleSignOut`
 * (../../../../lib/auth/signInEndpoints).
 */
/* c8 ignore start -- Framework passthrough with no authored logic: this file
 * names a handler and the wrapper that guards it. Every decision is
 * `guarded`'s and `handleSignOut`'s, both driven by
 * `signInEndpoints.integration.test.ts` with a real `Request` and a real
 * Payload, and both gated by `vitest.integration.config.ts`. It cannot be
 * measured by either Vitest config (a route handler is only reached through
 * Next's own routing), and this file's path contains no `[...]` segment, so
 * the ignore hint is read and no config exclusion is needed. Wraps the imports
 * too: an unimported file's imports are themselves uncovered lines. */
import { guarded } from '../../../../lib/auth/guard'
import { handleSignOut } from '../../../../lib/auth/signInEndpoints'

/**
 * Answers "Sign out and start again", for a reader who is signed in.
 *
 * Exported under the name Next.js requires for a `POST` route.
 */
export const POST = guarded(handleSignOut)
/* c8 ignore stop */
