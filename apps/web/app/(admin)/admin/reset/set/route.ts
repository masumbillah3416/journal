/**
 * route.ts — `POST /admin/reset/set`: where the new-password form is
 * submitted, and the first `POST` endpoint the bespoke sign-in surface has.
 *
 * IT TAKES NO DECISIONS AT ALL. Its whole body is one re-export: parsing the
 * submission, spending the link, and choosing where the reader goes next are
 * `apps/web/lib/auth/newPasswordScreen.ts`'s `handleSetNewPassword`, which is
 * driven end to end by `newPasswordScreen.integration.test.ts` with a real
 * `Request` and a real Payload — a route handler is an ordinary function of a
 * `Request`, so there is no reason for any of that to live somewhere no test
 * can reach it.
 *
 * WHY A SIBLING OF THE SCREEN RATHER THAN A CHILD OF THE TOKEN. The form posts
 * here with its token in the body, not to `/admin/reset/<token>/set`. A URL is
 * the most copied, logged and forwarded part of a request, and the token is
 * the entire authorisation for the operation; it is already in the address the
 * reader arrived at, which cannot be helped, and there is no reason to put it
 * in a second one. It also keeps this handler off a bracketed route, where
 * this repository's coverage tooling is documented not to honour an ignore
 * hint (CLAUDE.md §2.1).
 *
 * THE STATIC SEGMENT CANNOT COLLIDE WITH THE DYNAMIC ONE BESIDE IT. Next.js
 * resolves `set` before `[token]`, and no token can be the string `set`:
 * Payload mints them as hexadecimal. That reasoning was written here and not
 * applied one directory up, where `/admin/reset/request` - which has no route
 * of its own yet - was swallowed by `[token]` for a whole commit. It is now a
 * list rather than a comment: `lib/auth/resetPath.ts`'s
 * `RESERVED_RESET_SEGMENTS` names `set` and `request` both, `readNewPasswordScreen`
 * answers 404 for either, and `resetPath.test.ts` fails the build if a new
 * address appears under this prefix without being added (ruling F56).
 * Depends on: `handleSetNewPassword` (../../../../../lib/auth/newPasswordScreen).
 */
/* c8 ignore start -- Framework passthrough with no authored logic whatsoever:
 * this file names the handler and nothing else. Every decision is
 * `handleSetNewPassword`'s, which `newPasswordScreen.integration.test.ts`
 * drives with a real `Request` and a real Payload, and which
 * `vitest.integration.config.ts` gates. It cannot be measured by either Vitest
 * config (a route handler is only reached through Next's own routing), and
 * this file's path contains no `[...]` segment, so the ignore hint is read and
 * no config exclusion is needed. Its runtime behaviour is covered in the
 * browser by e2e/reset.spec.ts. Wraps the import too, not just the export: an
 * unimported file's imports are themselves uncovered lines. */
import { handleSetNewPassword } from '../../../../../lib/auth/newPasswordScreen'

/**
 * Answers a submission of the new-password form.
 *
 * Exported under the name Next.js requires for a `POST` route; the function
 * itself is the library's, so nothing about the handler is only reachable
 * through the framework.
 */
export const POST = handleSetNewPassword
/* c8 ignore stop */
