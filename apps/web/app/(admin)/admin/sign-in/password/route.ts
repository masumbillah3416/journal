/**
 * route.ts — `POST /admin/sign-in/password`: where SCREENS.md §3.1's form is
 * submitted, and where the session cookie is first set.
 *
 * IT TAKES NO DECISIONS AT ALL. Its whole body is one re-export: parsing the
 * submission, rotating the browser's identifier, choosing between the code
 * step and the signed-in screen, and writing the `Set-Cookie` are all
 * `apps/web/lib/auth/signInEndpoints.ts`'s `handlePasswordStep`, which
 * `signInEndpoints.integration.test.ts` drives end to end with a real
 * `Request` and a real Payload — a route handler is an ordinary function of a
 * `Request`, so there is no reason for any of that to live somewhere no test
 * can reach it. `../../reset/set/route.ts` is the same shape for the same
 * reason.
 *
 * A SIBLING OF THE SCREEN RATHER THAN THE SCREEN'S OWN ADDRESS, because a
 * Next.js page cannot answer a `POST` at its own path.
 * `components/admin/PasswordStep.tsx` exports `PASSWORD_STEP_ENDPOINT`, and
 * this directory is that constant's spelling — `adminAccess.ts`'s
 * `ADMIN_PUBLIC_PATHS` names it too, since a reader signing in has no session
 * to be guarded by.
 *
 * THE CROSS-SITE REFUSAL AND THE ADMIN'S HEADERS ARE NOT HERE. Both are
 * `apps/web/middleware.ts`'s, applied to every `/admin` request before this
 * file is reached, so a forged post never arrives and nothing this route
 * answers can be framed.
 * Depends on: `handlePasswordStep` (../../../../../lib/auth/signInEndpoints).
 */
/* c8 ignore start -- Framework passthrough with no authored logic whatsoever:
 * this file names the handler and nothing else. Every decision is
 * `handlePasswordStep`'s, which `signInEndpoints.integration.test.ts` drives
 * with a real `Request` and a real Payload, and which
 * `vitest.integration.config.ts` gates. It cannot be measured by either Vitest
 * config (a route handler is only reached through Next's own routing), and
 * this file's path contains no `[...]` segment, so the ignore hint is read and
 * no config exclusion is needed. Wraps the import too, not just the export: an
 * unimported file's imports are themselves uncovered lines. */
import { handlePasswordStep } from '../../../../../lib/auth/signInEndpoints'

/**
 * Answers a submission of the password form.
 *
 * Exported under the name Next.js requires for a `POST` route; the function
 * itself is the library's, so nothing about the handler is only reachable
 * through the framework.
 */
export const POST = handlePasswordStep
/* c8 ignore stop */
