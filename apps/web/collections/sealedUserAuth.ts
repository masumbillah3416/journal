/**
 * sealedUserAuth — the second authentication surface, and the list of the
 * endpoints on it that this repository refuses to serve.
 *
 * ═══ WHY THIS EXISTS ═══
 *
 * `apps/web/app/(payload)/api/[...slug]/route.ts` mounts Payload's whole REST
 * API, and `admin.disable` does not gate it: `/api/**` stays live in
 * production whether or not `/cms` is built. Payload adds a set of auth
 * endpoints to every collection carrying an `auth` block, and one of them —
 * `POST /api/users/login` — mints a Payload auth cookie on an email and a
 * password ALONE. No one-time code, no per-IP window, no per-address window,
 * and outside `apps/web/middleware.ts`'s matcher, so outside the CSRF check
 * and outside the admin content security policy as well.
 *
 * Every mechanism Phase 2 built guards `/admin`. This address reaches the same
 * accounts and none of them applies to it, so `SECURITY.md`'s second prototype
 * hole — "the code step is required or not based on `users.otpRequired`, read
 * server-side during the login handler" — was closed for the bespoke sign-in
 * screen and open for the system. The whole-branch review named it B5.
 *
 * ═══ SEALED RATHER THAN RATE-LIMITED, AND WHAT THAT COSTS ═══
 *
 * The alternative was to re-implement the password step's limiter, its
 * anti-enumeration timing and its code step behind Payload's own handlers.
 * That is a second copy of `apps/web/lib/auth/signIn.ts` maintained against a
 * dependency's internals, and a second copy of a security rule is the shape
 * this phase has already caught drifting four times. There is one way in, and
 * it is `POST /admin/sign-in/password`.
 *
 * THE COST IS REAL AND IS NOT HIDDEN: Payload's own admin at `/cms` signs in
 * through `POST /api/users/login`, so **`/cms` can no longer be signed into**.
 * It is already `admin.disable`d in production, its screens were never the
 * product (`payload.config.ts`'s header says so), content arrives through
 * `npm run db:seed`, and Phase 4 builds the panel that replaces it. Recorded
 * in `docs/deviations.md` and `docs/runbook.md`.
 *
 * ═══ WHY THE LIST IS CHECKED AGAINST PAYLOAD'S RATHER THAN TRUSTED ═══
 *
 * {@link SEALED_USER_AUTH_ENDPOINTS} and {@link OPEN_USER_AUTH_ENDPOINTS}
 * together have to be TOTAL over whatever Payload actually mounts. A hand
 * written list of things to seal closes what its author thought of on the day,
 * and a dependency upgrade that adds a new credential endpoint would open the
 * hole again with nothing failing.
 *
 * So `sealedUserAuth.integration.test.ts` reads the endpoints off the
 * SANITISED config — Payload's own array, after it has added its own — and
 * fails on any entry that is in neither list. A new endpoint has to be
 * classified before the suite goes green, which is the only version of this
 * check that a future Payload release cannot quietly defeat.
 *
 * PATTERNS (CLAUDE.md §3.3). None of the seven, deliberately: this is a list
 * and one handler. The nearest fit would be Ports & Adapters, and it would be
 * a lie — nothing here is substitutable.
 *
 * INVARIANT — the sealed answer is byte-identical to the answer Payload gives
 * an address it never mounted. `handleEndpoints`'s own `notFoundResponse`
 * writes `{ "message": "Route not found \"<pathname>\"" }` with a `404`, and
 * so does {@link sealedEndpointHandler}: a distinguishable refusal would say
 * that this deployment has a `users` collection with an `auth` block, which is
 * the same enumeration the sign-in screen spends a key derivation to withhold.
 *
 * Depends on: `payload` (types only).
 */
import type { Endpoint, PayloadHandler } from 'payload'

/** One REST endpoint, named by the pair `handleEndpoints` matches a request on. */
export interface EndpointAddress {
  /** The HTTP method, lower-case, as Payload spells it. */
  readonly method: Endpoint['method']
  /** The path within the collection, e.g. `/login` for `/api/users/login`. */
  readonly path: string
}

/**
 * Every `users` endpoint that accepts a credential or mints one, and is
 * therefore refused.
 *
 * Each of these either takes a password, takes a token that stands for one, or
 * returns a cookie that authenticates without either:
 *
 *   - `/login` takes the password and returns the cookie. The whole finding.
 *   - `/first-register` creates the first account and signs it in.
 *   - `/forgot-password` mails a reset token to whatever address is submitted,
 *     metered by nothing. `POST /admin/reset/request` is the metered one.
 *   - `/reset-password` exchanges that token for a password and a cookie.
 *   - `/refresh-token` extends a cookie, so it is how one that leaked outlives
 *     its expiry.
 *   - `/unlock` clears the lockout counter `SECURITY.md` §3 requires.
 *   - `/verify/:id` completes an email verification and is a token exchange of
 *     the same shape.
 */
export const SEALED_USER_AUTH_ENDPOINTS: readonly EndpointAddress[] = [
  { method: 'post', path: '/login' },
  { method: 'post', path: '/first-register' },
  { method: 'post', path: '/forgot-password' },
  { method: 'post', path: '/reset-password' },
  { method: 'post', path: '/refresh-token' },
  { method: 'post', path: '/unlock' },
  { method: 'post', path: '/verify/:id' },
]

/**
 * Every `users` endpoint deliberately left reachable, with the reason it can be.
 *
 * None of these accepts a credential or produces one, and each is named here
 * rather than left out so that the two lists are total: see this module's
 * header for why a list of things to seal is not enough on its own.
 *
 *   - `GET /me` reports whoever the request's own cookie names. With every
 *     endpoint above sealed no such cookie can be minted, so it answers `null`
 *     — and Payload's own admin shell asks for it on load, which
 *     `e2e/smoke.spec.ts`'s zero-console-errors gate on `/cms` depends on.
 *   - `GET /init` answers a boolean: whether any account exists at all. It is
 *     what stops the stock admin offering to create a first user, and it
 *     reveals nothing an unauthenticated visitor cannot infer from the
 *     sign-in screen existing.
 *   - `POST /logout` destroys, never creates.
 *
 * The collection's ordinary CRUD endpoints are not in either list, because
 * they are not auth endpoints: Payload applies "signed in, or refused" to
 * them, and after this module no request to `/api/**` can be signed in.
 */
export const OPEN_USER_AUTH_ENDPOINTS: readonly EndpointAddress[] = [
  { method: 'get', path: '/me' },
  { method: 'get', path: '/init' },
  { method: 'post', path: '/logout' },
]

/**
 * Answers a sealed endpoint exactly as Payload answers an unmounted one.
 *
 * @param request - The request Payload matched, read only for `pathname` —
 *   which `PayloadRequest` carries as a plain string, unlike `url`, so this
 *   needs no fallback arm that no test could take.
 * @returns A `404` whose body is `handleEndpoints`'s own `notFoundResponse`
 *   shape — see this module's INVARIANT for why it must not differ.
 * @example
 * // POST /api/users/login → 404 { "message": "Route not found \"/api/users/login\"" }
 */
export const sealedEndpointHandler: PayloadHandler = (request) =>
  Response.json({ message: `Route not found "${request.pathname}"` }, { status: 404 })

/**
 * The endpoint array the `users` collection declares.
 *
 * Payload's sanitisation pushes its own auth endpoints onto whatever a
 * collection declares, and `handleEndpoints` takes the FIRST match — so a
 * declared entry with the same method and path shadows the built-in one
 * rather than sitting beside it. That ordering is the mechanism, and
 * `sealedUserAuth.integration.test.ts` asserts it against a real request
 * rather than trusting it.
 */
export const sealedUserAuthEndpoints: Endpoint[] = SEALED_USER_AUTH_ENDPOINTS.map(({ method, path }) => ({
  method,
  path,
  handler: sealedEndpointHandler,
}))
