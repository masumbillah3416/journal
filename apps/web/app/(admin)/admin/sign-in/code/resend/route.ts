/**
 * route.ts — `POST /admin/sign-in/code/resend`: what SCREENS.md §3.2's "Send a
 * new code" button posts to.
 *
 * IT TAKES NO DECISIONS AT ALL. Its whole body is one re-export;
 * `apps/web/lib/auth/signInEndpoints.ts`'s `handleResendCode` is driven end to
 * end by `signInEndpoints.integration.test.ts`. Its sibling `verify/route.ts`
 * says more about why a route file holds one line here.
 *
 * IT IS A PUBLIC ADDRESS, and it names no account: the browser submits nothing
 * at all, and `otpService.resendChallenge` resolves the account from the
 * challenge bound to the identifier in the cookie. A reader therefore cannot
 * ask for a code to be sent to an address they have not authenticated as.
 *
 * IT WAS THE LAST UNMOUNTED FORM ON THIS SURFACE. `docs/deviations.md` §33
 * carried it as a gap for three tasks, because issuing a fresh code needs the
 * account behind a challenge and `otpService` offered no way to name one. Fix
 * round 1 added that read, server-side, and this is the route it exists for.
 * Depends on: `handleResendCode` (../../../../../../lib/auth/signInEndpoints).
 */
/* c8 ignore start -- Framework passthrough with no authored logic whatsoever:
 * this file names the handler and nothing else. Every decision is
 * `handleResendCode`'s, which `signInEndpoints.integration.test.ts` drives with
 * a real `Request` and a real Payload, and which
 * `vitest.integration.config.ts` gates. It cannot be measured by either Vitest
 * config (a route handler is only reached through Next's own routing), and
 * this file's path contains no `[...]` segment, so the ignore hint is read and
 * no config exclusion is needed. Wraps the import too, not just the export: an
 * unimported file's imports are themselves uncovered lines. */
import { handleResendCode } from '../../../../../../lib/auth/signInEndpoints'

/**
 * Answers a request for a fresh one-time code.
 *
 * Exported under the name Next.js requires for a `POST` route.
 */
export const POST = handleResendCode
/* c8 ignore stop */
