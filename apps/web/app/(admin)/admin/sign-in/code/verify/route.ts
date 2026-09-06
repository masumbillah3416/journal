/**
 * route.ts — `POST /admin/sign-in/code/verify`: where SCREENS.md §3.2's six
 * cells are submitted, and where a passed second factor becomes a session.
 *
 * IT TAKES NO DECISIONS AT ALL. Its whole body is one re-export: reading the
 * identifier the challenge was bound to, comparing the code, rotating that
 * identifier away and writing the `Set-Cookie` are all
 * `apps/web/lib/auth/signInEndpoints.ts`'s `handleCodeStep`, which
 * `signInEndpoints.integration.test.ts` drives end to end with a real
 * `Request` and a real Payload. Its sibling `../../password/route.ts` says
 * more about why a route file holds one line here.
 *
 * A CHILD OF THE SCREEN RATHER THAN ITS ADDRESS, because a Next.js page cannot
 * answer a `POST` at its own path. `components/admin/CodeStep.tsx` exports
 * `CODE_STEP_ENDPOINT`, and this directory is that constant's spelling.
 *
 * ITS SIBLING `resend` IS NOT MOUNTED, and that is recorded rather than
 * silent: `CodeStep.tsx` also draws a "Send a new code" button posting to
 * `/admin/sign-in/code/resend`, and issuing a fresh code needs the ACCOUNT a
 * challenge belongs to — which `otpService` deliberately will not name for a
 * browser identifier, since doing so would say which browsers hold a live
 * challenge. `docs/deviations.md` §33 carries it with the rest of the code
 * screen's gaps.
 * Depends on: `handleCodeStep` (../../../../../../lib/auth/signInEndpoints).
 */
/* c8 ignore start -- Framework passthrough with no authored logic whatsoever:
 * this file names the handler and nothing else. Every decision is
 * `handleCodeStep`'s, which `signInEndpoints.integration.test.ts` drives with
 * a real `Request` and a real Payload, and which
 * `vitest.integration.config.ts` gates. It cannot be measured by either Vitest
 * config (a route handler is only reached through Next's own routing), and
 * this file's path contains no `[...]` segment, so the ignore hint is read and
 * no config exclusion is needed. Wraps the import too, not just the export: an
 * unimported file's imports are themselves uncovered lines. */
import { handleCodeStep } from '../../../../../../lib/auth/signInEndpoints'

/**
 * Answers a submission of the one-time-code form.
 *
 * Exported under the name Next.js requires for a `POST` route; the function
 * itself is the library's, so nothing about the handler is only reachable
 * through the framework.
 */
export const POST = handleCodeStep
/* c8 ignore stop */
