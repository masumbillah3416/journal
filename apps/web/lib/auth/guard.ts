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
 * ═══ WHAT STANDS BETWEEN PHASE 4 AND A FORGOTTEN GUARD IS TWO MECHANISMS,
 *     AND ONLY ONE IS A CHECK ═══
 *
 * This heading said "WHAT MAKES IT UNFORGETTABLE". Nothing here makes anything
 * unforgettable — one mechanism removes the opportunity to forget for the
 * shape it covers, and the other is a check, which is a thing that can be
 * defeated and has been nine times.
 *
 * This header said "a test, not a layer" for four rounds after that stopped
 * being true, and said the test credits a file for REFERENCING this module —
 * which is the version fix round 1 deleted, and which
 * `adminGuardRegistration.test.ts`'s own case "reads a guard APPLICATION
 * rather than a mention of one" now asserts is NOT enough. Both halves were
 * wrong. What is actually here:
 *
 *   1 · THE GATE REFUSES AN UNGUARDED SERVER ACTION. Said in the indicative,
 *   because every stronger form of this sentence has been false. It said one
 *   CANNOT BE WRITTEN, and the fifth whole-branch review wrote one and
 *   committed it. Round 8 replaced that with "not a shape this repository's
 *   gate admits" and added "every shape that reaches a commit without it is
 *   enumerated", and the sixth review falsified both: it committed
 *   `const attached = Object.assign(module.exports, { deleteJourney })`
 *   (`523bd51`, since reset), and showed that deleting a row from the
 *   enumeration was something nothing noticed. An absolute about a control is
 *   a claim no mechanism keeps, so what is written here is what the mechanism
 *   DOES and what its test NAMES.
 *
 *   `guardedAction` (below) takes the action, calls `requireAdminSession()`,
 *   and calls the action with the session it got, so an action built from it
 *   has no opportunity to forget — and `guard.integration.test.ts`'s "the
 *   factory every Server Action is built from" executes that, rather than
 *   matching two substrings over this file's text, which is all that stood
 *   over it until round 9. `eslint-rules/guarded-server-actions.js` reports
 *   every value export of a `'use server'` module that is not such a call,
 *   every re-export from one, every top-level statement in one that evaluates
 *   anything at load bar a literal, a function expression or that same call,
 *   and every `'use server'` directive inside a function body — over the
 *   parsed AST, on every file `npm run lint` visits, with no `files` list of
 *   its own. What it does NOT report is enumerated, with the measurement and
 *   committability of each, by `SHAPES_THAT_GET_THROUGH` in
 *   `adminGuardRegistration.test.ts` — an array that says at itself what it
 *   cannot do: a row's absence proves nothing. Its REACH is proved rather than
 *   assumed — `adminGuardRegistration.test.ts` walks git's listing of the
 *   repository for the literal `'use server'` and asks ESLint's own API
 *   whether each file it finds is one ESLint lints with that rule at `error`,
 *   and whether any config block gives one a `processor` that could strip the
 *   directive before the rule is handed the file.
 *
 *   2 · A ROUTE FILE IS CHECKED, because a page is not built from a factory.
 *   `adminGuardRegistration.test.ts` walks the whole `app/` tree, computes each
 *   file's address the way Next.js does, and requires every route file at a
 *   guarded address either to be declared public in `ADMIN_PUBLIC_PATHS` or to
 *   APPLY a guard in its own body — `requireAdminSession()` or `guarded(...)`,
 *   a call and not a mention. It follows nothing a file imports: a check that
 *   has to look elsewhere for its subject is one a neighbour can satisfy.
 *
 * Thirty-three shapes have been written to disk and run against the real gate;
 * thirty-two fail `npm run verify`. The fourth whole-branch review then wrote
 * fourteen more and THREE got through, two of them closed in the rule by round
 * 7 — including the one that mattered, a DIFFERENT export of this file aliased
 * to `guardedAction`, which the rule admitted because it compared the imported
 * FILE and never the imported NAME. Round 7 wrote eleven more, six of them new,
 * and closed a fourth. The fifth review wrote sixteen, eleven of them its own,
 * and defeated the guard four more ways — a bare disable directive and one with
 * the rule's id on the next line, both of which COMMITTED, and four wrappers
 * around `module.exports` that walked past a rule refusing one node shape. All
 * four are closed in round 8, together with a fifth found while attacking that
 * fix.
 *
 * THE SIXTH REVIEW WROTE EIGHT, ALL ITS OWN, AND FIVE GOT THROUGH — and the
 * two that matter are why rule 4 was rewritten again. Round 8 had inverted it
 * into an allowlist of statement KINDS, which admitted the very call it
 * refused as a bare statement once the call was bound to a name; that reached
 * a real commit. It also gutted `guardedAction`'s body while keeping the two
 * substrings that were the only thing standing over it, and deleted a row
 * from the enumeration below without anything noticing. Round 9 closed all
 * three: rule 4 asks what a statement EVALUATES, `guard.integration.test.ts`
 * executes the factory, and each enumerated row now carries what the suite
 * lints to show it is still true. A `processor` block, the fifth, has a key of
 * its own in `adminGuardRegistration.test.ts`.
 *
 * WHAT THE RULE DOES NOT REPORT IS ENUMERATED WHERE IT CAN BE ASSERTED, and no
 * number is written here: `SHAPES_THAT_GET_THROUGH` in
 * `adminGuardRegistration.test.ts` holds each one with its measurement and
 * whether it can be committed, and a case there fails if this file stops
 * pointing at that array or starts restating it. Seven sites restated a count
 * of two while the fifth review measured four, and that sentence had been
 * wrong in four earlier rounds too (ruling F76).
 *
 * THIS MODULE'S EXPORT SURFACE IS LOAD-BEARING, and that is what round 7's
 * defeat means for Phase 4. The rule now requires the imported name to be
 * `guardedAction`, so adding an export here no longer opens a hole — but a
 * Phase 4 wrapper (`guardedRouteAction`, `guardedFormAction`) must COMPOSE
 * `guardedAction` rather than be added to any list of permitted names. The rule
 * deliberately has no such list: it can compare a name and resolve a file, and
 * it cannot tell whether the function behind a name authenticates.
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
import { SIGN_IN_PATH as ADMIN_SIGN_IN_PATH } from './adminPaths'
import { getPayload } from '../payload'
import { clearedSessionCookie, readBrowserSession } from './browserSession'
import type { AuthenticatedSession, SessionRefusal } from './sessions'
import { createSessionService } from './sessions'

/** Where a refused request for a guarded screen is sent. */
export const SIGN_IN_PATH = ADMIN_SIGN_IN_PATH

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

/* ROUND 9 DELETED A `c8 ignore` REGION FROM HERE, AND THAT IS THE POINT.
 * It covered `requireAdminSession` and `guardedAction`, on the stated ground
 * that "neither Vitest project can execute either" and that runtime behaviour
 * was "covered in the browser by e2e/signIn.spec.ts". The second half could
 * not be true of `guardedAction`: it had no caller anywhere, so no browser
 * path reached it, and the only thing standing over its body was two
 * `toContain` substring assertions in `adminGuardRegistration.test.ts`. The
 * sixth whole-branch review replaced the body with a `process.env`-keyed path
 * that skipped the guard, kept both substrings, and got 1,348 unit tests
 * passing. Both functions are now EXECUTED, with `next/headers` and
 * `next/navigation` stood in for, by `guard.integration.test.ts`'s "the
 * factory every Server Action is built from" — which fails when the body is
 * gutted that way. */
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

/**
 * Builds a Server Action that cannot run before the guard has admitted the
 * request.
 *
 * ═══ IT IS A FACTORY SO THAT AN ACTION HAS NOTHING TO REMEMBER ═══
 *
 * This heading said the unguarded shape CANNOT BE WRITTEN. It can — six
 * whole-branch reviews have written one, and two of them committed one. What a
 * factory buys is narrower and real: an action built from it cannot forget the
 * guard, because the guard is not something the action does.
 *
 * A Server Action is a `POST` endpoint of its own, mounted by Next.js under an
 * opaque action id and reachable by anybody who has that id. The middleware
 * does not close it: it enforces CSRF and never authentication, so a request
 * carrying a matching `Origin` reaches the action unauthenticated. And nothing
 * around it helps — an action defined beside a page component is dispatched
 * BEFORE that component renders, so the page's own `requireAdminSession()` has
 * not run (`SECURITY.md`: nothing inherits trust from the page it was reached
 * from).
 *
 * Phase 2 spent nine attempts trying to CHECK that every action remembered to
 * call the guard, and every one of them was defeated — by a comment, an import
 * line, a neighbouring module, a second route group, a file the walk never
 * opened, a directory outside its root list, and four export spellings. This is
 * the other move: the action never gets the chance to forget, because a value
 * export of a `'use server'` module that is not built from here is a lint
 * error. `eslint-rules/guarded-server-actions.js` reports it, reading the
 * parsed exports rather than the file's text — and what it does not report is
 * enumerated by `SHAPES_THAT_GET_THROUGH` in
 * `adminGuardRegistration.test.ts` rather than described in a sentence here.
 *
 * THE SESSION IS THE FIRST PARAMETER, not something the action reads for
 * itself. An action that took no session could be written to ignore the one
 * this factory holds and read its own; taking it as an argument means the value
 * the guard produced is the only one in scope.
 *
 * @param action - What to run once the request is known to be somebody's. It
 *   receives the authenticated account first, then whatever the form sent.
 * @returns A function of the shape a `'use server'` module exports.
 * @example
 * // apps/web/app/(admin)/admin/journeys/actions.ts
 * 'use server'
 * export const publishJourney = guardedAction(async (session, id: JourneyId) => {
 *   // `session.user` is the account the guard admitted.
 * })
 */
export const guardedAction =
  <Args extends readonly unknown[], Result>(
    action: (session: AuthenticatedSession, ...args: Args) => Promise<Result>,
  ) =>
  async (...args: Args): Promise<Result> => {
    const session = await requireAdminSession()
    return action(session, ...args)
  }
