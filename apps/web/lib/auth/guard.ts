/**
 * guard — the one place an admin request is turned into an account, or
 * refused.
 *
 * `SECURITY.md`: "Check authorization on **every mutation**, not just at
 * login... nothing inherits trust from the page it was reached from." This
 * module is what that check calls. Phase 4 builds ten screens of mutations
 * behind it.
 *
 * ═══ WHY THE GUARD IS HERE AND NOT IN THE MIDDLEWARE ═══
 *
 * `apps/web/middleware.ts` runs on every admin request and would be the
 * obvious home for it. It cannot be: the middleware runs in Next.js's Edge
 * runtime, and the only way to know whether an identifier names a LIVE row is
 * to read the row — which means Postgres, `pg`, and `node:crypto` to hash the
 * lookup key, none of which exist there. A guard that could only check
 * whether a cookie was PRESENT would admit every revoked and every expired
 * session, and would admit a pre-auth identifier, which is exactly the value
 * this repository mints for browsers that have not signed in.
 *
 * So the split is by what each half can know, and it is written down here so
 * neither is mistaken for the other:
 *
 *   - `adminAccess.ts` + the middleware decide, without touching a database,
 *     which addresses are public, refuse a cross-site mutation, and set the
 *     admin's headers. That runs first and for everything.
 *   - THIS MODULE decides who a request is. It runs in the Node server, from
 *     the page or route handler that needs the answer, and it is the only
 *     authority on the question.
 *
 * WHAT MAKES IT UNFORGETTABLE IS A TEST, NOT A LAYER.
 * `adminGuardRegistration.test.ts` reads every route and page mounted under
 * `/admin` off the filesystem and requires each one either to be listed in
 * `ADMIN_PUBLIC_PATHS` or to reference this module. A screen added in Phase 4
 * that calls neither fails the pre-commit gate on its own commit.
 *
 * ═══ THE COOKIE IS `Path=/admin`, SO NOTHING UNDER `/api` CAN USE IT ═══
 *
 * `SECURITY.md` scopes the session cookie to the admin path, and RFC 6265
 * means a browser never sends it to `/api/...`, `/p/...` or anywhere else. So
 * this guard CANNOT authenticate a request to Payload's own REST or GraphQL
 * routes, and nothing in this repository pretends otherwise.
 *
 * HOW AN `/api` REQUEST IS EXPECTED TO AUTHENTICATE, then: through Payload's
 * own auth, with Payload's own `payload-token` cookie or an `Authorization:
 * JWT ...` header, judged by the collection access rules in
 * `apps/web/collections/` (`docs/api.md` documents that for all four Payload
 * routes). The two mechanisms are deliberately separate and neither is a way
 * into the other: `signIn.ts` discards the JWT `payload.login` mints, so
 * signing in to the bespoke admin issues NO `/api` credential, and holding one
 * grants nothing here. There is no route of this repository's own under
 * `/api` at all, and if one is ever added it must state which of the two it
 * authenticates with rather than inheriting this one by proximity.
 *
 * PATTERNS (CLAUDE.md §3.3). Result type: the answer is a value a caller must
 * unwrap, so no screen can reach an account id without having handled the
 * refusal. Repository at one remove: the `sessions` row is `sessions.ts`'s,
 * and this module only composes it with a clock and a cookie.
 *
 * INVARIANT — A REFUSAL NAMES NO IDENTIFIER. The four refusals below are one
 * word each; the value the browser presented never appears in a returned
 * value, and nothing here logs (CLAUDE.md §7).
 *
 * Depends on: `redirect` (next/navigation), `headers` (next/headers),
 * `getPayload` (../payload), ./browserSession, ./sessions, and
 * `@travel-diary/domain`'s `Result`.
 */
import type { Result } from '@travel-diary/domain/result'
import { err } from '@travel-diary/domain/result'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from '../payload'
import { clearedSessionCookie, readBrowserSession } from './browserSession'
import type { AuthenticatedSession, SessionRefusal } from './sessions'
import { createSessionService } from './sessions'

/** Where a refused request for a guarded screen is sent. */
export const SIGN_IN_PATH = '/admin/sign-in'

/** The status a refused mutation answers with. Never 307 - see {@link guarded}. */
const SEE_OTHER = 303

/**
 * Why the guard refused a request.
 *
 * `'no-session'` is its own answer rather than being folded into
 * `'unknown'`: the browser presented NOTHING, which is an ordinary first
 * visit, while the three {@link SessionRefusal} values mean it presented
 * something that was checked and found wanting. Nothing acts on the
 * difference today — every refusal ends at the same screen — but collapsing
 * them here would make "was a session offered at all" unanswerable by any
 * caller, and it is the question an operator asks first.
 */
export type AdminRefusal = 'no-session' | SessionRefusal

/**
 * Names the account behind a request, or refuses it.
 *
 * @param cookieHeader - The request's `Cookie` header, or `null` when it sent
 *   none. Taken as the header rather than as a `Request` so this function is
 *   callable from a page (which has `headers()`), from a route handler (which
 *   has the request) and from a test (which has neither).
 * @returns `ok` with the account a live session belongs to, or `err` naming
 *   why it was refused. A revoked or expired row is refused on the first
 *   request after it became so — the row is read on every call, never cached.
 * @example
 * const session = await authenticateAdminRequest(request.headers.get('cookie'))
 * if (!session.ok) return seeOther(SIGN_IN_PATH)
 */
export const authenticateAdminRequest = async (
  cookieHeader: string | null,
): Promise<Result<AuthenticatedSession, AdminRefusal>> => {
  const presented = readBrowserSession(cookieHeader)
  if (presented === null) return err('no-session')

  const sessions = createSessionService({ payload: await getPayload(), now: Date.now })
  return sessions.authenticate(presented)
}


/** A handler that only ever runs for a request with a live session. */
export type GuardedHandler = (request: Request, session: AuthenticatedSession) => Promise<Response>

/**
 * Wraps a mutation handler so it is only reached with a live session.
 *
 * ═══ WHY THIS EXISTS RATHER THAN A CALL INSIDE EACH HANDLER (FIX ROUND 1) ═══
 *
 * `handleSignOut` used to call {@link authenticateAdminRequest} itself, and its
 * route file was one line naming the handler. That reads fine and it defeated
 * `adminGuardRegistration.test.ts` twice over: the test had to follow the route
 * file's imports to see the guard at all, and following imports is what let a
 * route be credited for its whole handler module — so a guarded route
 * re-exporting ANY handler from `signInEndpoints.ts` passed, guard or no guard.
 *
 * With this wrapper the guard is applied AT THE ROUTE, in the route file, in
 * the one line that file contains. The registration test can therefore read
 * the route file and nothing else, which is the only version of that check
 * that cannot be satisfied by a neighbour.
 *
 * IT IS NOT A SECOND DEFINITION OF THE GUARD. It calls
 * {@link authenticateAdminRequest}, which is still the only thing that reads a
 * `sessions` row.
 *
 * A REFUSED REQUEST IS ANSWERED, NOT REDIRECTED BY `next/navigation`.
 * `redirect()` from a `POST` handler answers `307`, which re-posts the body to
 * the sign-in screen; a `303` is the status that requires the browser to follow
 * with a `GET`. The dead identifier is cleared on the way out, so the browser
 * stops presenting a value that can no longer work.
 *
 * @param handler - What to run once the request is known to be somebody's.
 * @returns A handler of the shape a Next.js route exports.
 * @example
 * export const POST = guarded(handleSignOut)
 */
export const guarded =
  (handler: GuardedHandler) =>
  async (request: Request): Promise<Response> => {
    const authenticated = await authenticateAdminRequest(request.headers.get('cookie'))
    if (!authenticated.ok) {
      return new Response(null, {
        status: SEE_OTHER,
        headers: { Location: SIGN_IN_PATH, 'Set-Cookie': clearedSessionCookie() },
      })
    }

    return handler(request, authenticated.value)
  }

/* c8 ignore start -- Framework binding with no decision of its own: read the
 * request's cookies through `next/headers`, hand them to the function above,
 * and turn its refusal into `next/navigation`'s redirect. Neither Vitest
 * project can execute it — `headers()` throws outside a request context, and
 * no integration test can supply one — so a per-file-region `c8 ignore` is
 * CLAUDE.md §2.1's honest treatment: this file's path contains no `[...]`
 * segment, so the ignore hint is read (see vitest.config.ts's own note on
 * where it is not). Everything it could get wrong is one line above it and is
 * measured; what is left is which module supplies the cookies and which
 * supplies the redirect. Its runtime behaviour is covered in the browser by
 * e2e/signIn.spec.ts. */
/**
 * The account behind the current request, or a redirect to the sign-in
 * screen.
 *
 * For a Server Component. A route handler should call
 * {@link authenticateAdminRequest} instead and answer with its own response —
 * `redirect()` from a `POST` handler would answer `307` and re-post.
 *
 * @returns The authenticated account.
 * @throws The error `next/navigation`'s `redirect()` raises, for every
 *   refusal. It is a throw rather than a returned value because there is
 *   nothing for the caller to do with it: a guarded screen has no
 *   unauthenticated state to draw.
 * @example
 * const { user } = await requireAdminSession()
 */
export const requireAdminSession = async (): Promise<AuthenticatedSession> => {
  const authenticated = await authenticateAdminRequest((await headers()).get('cookie'))
  if (!authenticated.ok) redirect(SIGN_IN_PATH)

  return authenticated.value
}
/* c8 ignore stop */
