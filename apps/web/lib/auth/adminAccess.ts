/**
 * adminAccess — the three decisions every admin request is put through before
 * anything reads a database: is this address public, is this a forged
 * cross-site mutation, and what does the response carry.
 *
 * ═══ WHY THESE THREE LIVE TOGETHER, AND WHY THEY LIVE HERE ═══
 *
 * They are the whole of what `apps/web/middleware.ts` needs, and the
 * middleware runs in Next.js's Edge runtime, where `node:crypto`, `pg` and
 * Payload cannot be imported at all. So the decisions that must be taken for
 * EVERY admin request — including one for a screen Phase 4 has not written
 * yet — have to be expressible without touching any of them. All three are:
 * a path, a method and two origins.
 *
 * The decision that DOES need a database — whether the identifier in the
 * cookie names a live session — is `./guard.ts`'s, and it runs in the Node
 * server. See that module's header for why the two are split and where the
 * authority actually sits.
 *
 * PATTERNS (CLAUDE.md §3.3). None of §3.3's named patterns: this is one list,
 * two predicates over it and a frozen record. A "policy object" or a strategy
 * per rule would be an abstraction serving a single caller (CLAUDE.md §4).
 *
 * ═══ THE PATH POLICY IS DEFAULT-DENY, AND THAT IS THE POINT OF IT ═══
 *
 * {@link ADMIN_PUBLIC_PATHS} lists the addresses a reader who cannot yet sign
 * in must be able to reach; {@link isGuardedAdminPath} guards EVERYTHING
 * ELSE under `/admin`. Written the other way round — a list of guarded paths
 * — every screen Phase 4 forgot to add would be public, and the failure would
 * be invisible: the screen works, and it works for everybody. Written this
 * way, a screen nobody declared is refused, which is a failure somebody
 * notices on the first click.
 *
 * THE MATCH IS EXACT, NEVER A PREFIX, with one deliberate exception. A prefix
 * rule on `/admin/sign-in` would make `/admin/sign-in/done` — the signed-in
 * state, which is exactly the screen that must be guarded — public by
 * accident, and `/admin/sign-in/passwordless` public by nobody's decision at
 * all. The exception is the reset link's own address, `/admin/reset/<token>`:
 * the token is 20 CSPRNG bytes minted per request, so it cannot be listed,
 * and it is matched as "one segment under `/admin/reset`" rather than as a
 * prefix — `/admin/reset/a/deeper/path` is guarded like anything else.
 *
 * ═══ THE CROSS-SITE CHECK, AND WHY `SameSite=Lax` IS NOT ENOUGH ALONE ═══
 *
 * The session cookie is `SameSite=Lax` (`packages/domain/src/auth/session.ts`),
 * which withholds it from a cross-site POST — and that is genuinely most of
 * the defence. It is not all of it, for two reasons worth writing down rather
 * than assuming:
 *
 *   1. `Lax` is scoped to the *site*, not the origin. A sibling host under the
 *      same registrable domain is same-site, so a foothold on any subdomain
 *      posts with the cookie attached. {@link isCrossSiteMutation} compares
 *      full ORIGINS — scheme, host and port — so a sibling host is refused.
 *   2. Two of the mutations here are authorised by something other than the
 *      cookie: `POST /admin/reset/set` by the token in its body and
 *      `POST /admin/sign-in/password` by the credentials in its. `SameSite`
 *      protects neither, and a cross-site post to the password endpoint is a
 *      way to spend a reader's rate-limit budget from a page they are merely
 *      visiting.
 *
 * AN ABSENT `Origin` IS REFUSED, NOT WAVED THROUGH. Every browser released
 * since 2016 sends `Origin` on a form POST, whether or not it is cross-origin,
 * so a mutation without one did not come from a form in a browser. Treating
 * absence as "probably fine" is the single change that turns this check into
 * decoration, which is why `adminAccess.test.ts` has a case named for it.
 * The cost is real and bounded: a hand-rolled client (`curl`, a script) has to
 * send `Origin` to post here. That is documented in `docs/api.md` rather than
 * discovered.
 *
 * WHY AN ORIGIN CHECK RATHER THAN A SYNCHRONISER TOKEN. A token would have to
 * be minted on every screen that carries a form, embedded in each one, and
 * stored somewhere to compare against — which for the pre-auth screens means
 * a database row for every visitor who ever loads the sign-in page. The
 * origin check needs no state at all and is enforced identically for a form
 * this repository has not written yet. `docs/adr/0018-admin-request-policy-and-the-guard-split.md`
 * records what was rejected and why.
 *
 * ═══ WHAT THE HEADERS DO AND DO NOT BUY ═══
 *
 * `form-action 'self'` is the second half of the CSRF defence and the half a
 * browser enforces before the request leaves: an injected form on an admin
 * page cannot post anywhere else. `frame-ancestors 'none'` stops the admin
 * being framed. `base-uri 'none'` stops an injected `<base>` re-pointing every
 * relative URL on the page.
 *
 * ═══ `Referrer-Policy` IS `same-origin`, AND `no-referrer` WAS A BLOCKING
 * DEFECT (FIX ROUND 1) ═══
 *
 * This header used to be `no-referrer`, for a reason that is still true:
 * `/admin/reset/<token>` carries a live reset token IN THE ADDRESS, and an
 * outbound request from that page must not put it in a `Referer`.
 *
 * WHAT THAT MISSED IS THAT `Referer` AND `Origin` ARE THE SAME SWITCH FOR A
 * FORM POST. Per the Fetch standard, a navigation request's `Origin` header is
 * derived from the referrer policy: under `no-referrer` a form-navigation
 * `POST` sends `Origin: null`, and {@link isCrossSiteMutation} compares origins
 * for strict equality — so **every form on this surface answered 403 in a real
 * browser**, measured in Chromium on the sign-in and the reset forms.
 * Relaxing only this header makes the same form succeed.
 *
 * `same-origin` is the fix, and it is the right one rather than the convenient
 * one: it keeps `Origin` populated for the same-origin posts this application
 * actually makes, and sends NOTHING on a cross-origin request — so the reset
 * token still never leaves in a `Referer`, which is the whole reason the
 * stricter value was chosen. The `Origin` check is untouched; loosening THAT
 * to admit `null` would have admitted every request that carries no origin at
 * all, which is the case it exists for.
 *
 * WHY NOTHING IN THIS REPOSITORY CAUGHT IT, WHICH IS THE PART WORTH KEEPING:
 * every route test — unit, integration and browser — SET the `origin` header
 * itself, under a comment calling it "what a browser form would have sent".
 * It was not. The suite exercised a request shape no browser produces. The
 * browser tests now submit real forms and set no request header of their own,
 * so the fiction cannot come back.
 *
 * ═══ `script-src`, AND WHAT DIFFERS BETWEEN DEVELOPMENT AND PRODUCTION ═══
 *
 * `'unsafe-inline'` is forced in both: Next.js's App Router streams its RSC
 * payload as a sequence of inline `<script>` elements, so a policy with
 * neither it nor a per-request nonce renders a blank page. The nonce version
 * is real and is what Next documents; it is not taken here because Next's own
 * example switches `'unsafe-eval'` on in development, so the strict half would
 * first execute on the day it is deployed.
 *
 * `'unsafe-eval'` IS DEVELOPMENT-ONLY, AND BOTH HALVES OF THAT WERE MEASURED.
 * Without it, every admin page under `next dev` logs `eval() is not supported
 * in this environment... React requires eval() in development mode` — four
 * errors per page, which `e2e/reset.spec.ts`'s console-error case catches. With
 * a production build (`CI=1 next build && next start`) and the same policy
 * MINUS the keyword: four admin routes, zero console errors, zero page errors,
 * hydration working. React's own message says it "will never use eval() in
 * production mode", and that is what the second measurement confirms.
 *
 * So this is one of the few places an environment switch is the honest answer
 * rather than the lazy one, and the reasoning is the opposite of
 * `sessionCookie`'s `Secure`: there, making the attribute conditional would
 * have left the STRICTER configuration unexercised. Here the stricter
 * configuration is production's, it is the one CI's browser job and the visual
 * container both run, and what development gets is a documented relaxation of
 * a keyword React needs to debug itself.
 *
 * What the policy leaves either way, stated plainly: `'unsafe-inline'` means
 * it does not stop an injected script from RUNNING, only from loading code
 * from, or sending anything to, an origin that is not ours. The admin renders
 * no visitor-supplied HTML in Phase 2.
 *
 * Depends on: `RESET_PATH` (./resetPath). Nothing else, deliberately: this
 * module is imported by `apps/web/middleware.ts`, which runs in the Edge
 * runtime.
 */
import {
  CODE_STEP_PATH,
  CODE_VERIFY_ENDPOINT,
  PASSWORD_ENDPOINT,
  RESEND_ENDPOINT,
  RESET_REQUEST_ENDPOINT,
  SET_PASSWORD_ENDPOINT,
  SIGN_IN_PATH,
} from './adminPaths'
import { RESET_PATH } from './resetPath'

/** The prefix every address of the bespoke admin panel sits under. */
const ADMIN_PATH_PREFIX = '/admin'

/**
 * The methods that ask a question rather than change something.
 *
 * `OPTIONS` is here because a preflight changes nothing by definition;
 * `TRACE` and `CONNECT` are deliberately absent, so they are treated as
 * mutations and refused without an `Origin` like everything else. The list is
 * the safe methods rather than the unsafe ones for the same default-deny
 * reason the path list is the public ones.
 */
const SAFE_METHODS: readonly string[] = ['GET', 'HEAD', 'OPTIONS']

/**
 * Every admin address that answers without a session.
 *
 * These are the steps of signing in and of getting back in — a reader on any
 * of them has no session by definition, so guarding one would lock the door
 * from the inside. Everything else under `/admin` is guarded; see this
 * module's header for why the policy is written this way round.
 *
 * NOTHING HERE COUNTS THE LIST IN PROSE. A comment below said "the four
 * endpoints in this list" while the list held five, and `docs/api.md`'s own
 * enumeration of it omitted a sixth address entirely (final review
 * finding 32). A count written out is a count that goes stale on the next
 * entry, and this is a security-surface list.
 *
 * INVARIANT — an address added here is an address that answers to anybody.
 * Each endpoint in this list carries its own authorisation instead: the
 * password endpoint the credentials in its body, the code endpoints the code
 * and the challenge bound to the browser's identifier, and the reset endpoints
 * the token. None of them inherits trust from having been reached.
 *
 * EVERY ENTRY IS THE CONSTANT THE FORM ACTUALLY POSTS TO, imported from
 * `./adminPaths.ts` rather than written out again. The list used to hold its
 * own literals beside a component's, with nothing tying the two — and because
 * this policy is default-deny, drift between them does not 404: the middleware
 * treats the drifted path as guarded and the reader is redirected to sign-in
 * with nothing anywhere saying why (seam S5).
 */
export const ADMIN_PUBLIC_PATHS: readonly string[] = [
  SIGN_IN_PATH,
  PASSWORD_ENDPOINT,
  CODE_STEP_PATH,
  CODE_VERIFY_ENDPOINT,
  RESEND_ENDPOINT,
  RESET_PATH,
  RESET_REQUEST_ENDPOINT,
  SET_PASSWORD_ENDPOINT,
]

/**
 * What {@link isCrossSiteMutation} is asked.
 *
 * An options object rather than three positional strings: two of the three
 * are origins, and `isCrossSiteMutation('POST', a, b)` says nothing at the
 * call site about which way round they go.
 */
export interface CrossSiteRequest {
  /** The request's method, exactly as it arrived. */
  readonly method: string
  /** The `Origin` header, or `null` when the request carried none. */
  readonly origin: string | null
  /** The origin this request was actually made to — scheme, host and port. */
  readonly target: string
}

/** What {@link adminSecurityHeaders} is asked. */
export interface AdminHeaderRequest {
  /**
   * Whether this process is a development server.
   *
   * The ONE thing that differs between the two policies, and the caller's to
   * decide rather than this module's: `apps/web/middleware.ts` reads
   * `process.env.NODE_ENV`, and a test can ask for either without touching the
   * process. See the module header for the two measurements behind it.
   */
  readonly development: boolean
}

/**
 * Every header an admin response carries, and no diary response does.
 *
 * @param request - See {@link AdminHeaderRequest}.
 * @returns The headers, as a record the caller sets one at a time. See this
 *   module's header for what each one buys, why `Referrer-Policy` is
 *   `same-origin` rather than `no-referrer`, and why `'unsafe-eval'` is in the
 *   development policy alone.
 * @example
 * for (const [name, value] of Object.entries(adminSecurityHeaders({ development: false }))) {
 *   response.headers.set(name, value)
 * }
 */
export const adminSecurityHeaders = ({ development }: AdminHeaderRequest): Readonly<Record<string, string>> => ({
  'Content-Security-Policy': [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "connect-src 'self'",
    "font-src 'self'",
    // `data:` for the inline SVG marks the shell draws; no remote host at all.
    "img-src 'self' data:",
    // Next.js and React both write style attributes and inline style elements
    // into the document they stream. An inline stylesheet cannot exfiltrate.
    "style-src 'self' 'unsafe-inline'",
    // `'unsafe-inline'` in both policies (the streamed RSC payload is inline
    // scripts); `'unsafe-eval'` in development ALONE, because that is the only
    // build React needs it for - both measured, see the module header.
    `script-src 'self' 'unsafe-inline'${development ? " 'unsafe-eval'" : ''}`,
  ].join('; '),
  // `same-origin`, NOT `no-referrer`: under `no-referrer` a form-navigation
  // POST sends `Origin: null` and every form on this surface answered 403.
  // The module header carries the measurement and why the fix is here rather
  // than in the origin check.
  'Referrer-Policy': 'same-origin',
  'X-Content-Type-Options': 'nosniff',
  // The complement of every admin page's own `robots: { index: false }`: that
  // reaches a crawler which parsed the HTML, this one reaches a crawler which
  // only made the request. `public/robots.txt` is the third, and asks a
  // well-behaved crawler not to fetch at all.
  'X-Robots-Tag': 'noindex, nofollow',
})

/**
 * Whether a path belongs to the bespoke admin surface.
 *
 * @param pathname - The request's path, without query or fragment.
 * @returns `true` for `/admin` and everything beneath it, and `false` for
 *   every other address — including `/administrator`, which shares the first
 *   six letters and nothing else. The diary's own paths must answer `false`:
 *   a diary response carrying the admin's CSP would be a behaviour change to
 *   pages this task does not own.
 * @example
 * isAdminPath('/admin/sign-in') // true
 * isAdminPath('/administrator') // false
 */
export const isAdminPath = (pathname: string): boolean =>
  pathname === ADMIN_PATH_PREFIX || pathname.startsWith(`${ADMIN_PATH_PREFIX}/`)

/**
 * Whether a path is the reset link's own address: exactly one segment under
 * `/admin/reset`.
 *
 * Matched by shape rather than listed, because the segment is the token —
 * 20 CSPRNG bytes Payload minted for one reader. Deliberately not a prefix
 * rule: a deeper path under `/admin/reset` is somebody's future route, and it
 * is guarded until it is declared.
 *
 * @param pathname - The request's path.
 * @returns `true` when the path is `/admin/reset/<one segment>`.
 */
const isResetLinkPath = (pathname: string): boolean => {
  if (!pathname.startsWith(`${RESET_PATH}/`)) return false

  const segment = pathname.slice(`${RESET_PATH}/`.length)
  return segment !== '' && !segment.includes('/')
}

/**
 * Whether an admin address requires a live session.
 *
 * @param pathname - The request's path, without query or fragment.
 * @returns `false` for the addresses in {@link ADMIN_PUBLIC_PATHS} and for the
 *   reset link's own address; `true` for every other path under `/admin`,
 *   including ones nobody has written yet. Call it only for a path
 *   {@link isAdminPath} accepts — it answers `true` for anything else, which
 *   is the fail-closed direction, but the question is not meaningful there.
 * @example
 * isGuardedAdminPath('/admin/sign-in') // false — a reader here has no session
 * isGuardedAdminPath('/admin/sign-in/done') // true — it claims to be signed in
 */
export const isGuardedAdminPath = (pathname: string): boolean =>
  !ADMIN_PUBLIC_PATHS.includes(pathname) && !isResetLinkPath(pathname)

/**
 * Whether a method changes something.
 *
 * @param method - The request's method, in whatever case it arrived.
 * @returns `false` for `GET`, `HEAD` and `OPTIONS`; `true` for everything
 *   else, including methods nothing here mounts.
 * @example
 * isMutation('POST') // true
 */
export const isMutation = (method: string): boolean => !SAFE_METHODS.includes(method.toUpperCase())

/**
 * Whether a request is a mutation that did not come from one of our own pages.
 *
 * @param request - See {@link CrossSiteRequest}.
 * @returns `true` when the request changes something and its `Origin` is
 *   absent or is not `target`, exactly. A safe method is never cross-site by
 *   this test, whatever it carries — it changes nothing, and refusing a
 *   cross-origin `GET` would break every link into the sign-in screen.
 * @example
 * isCrossSiteMutation({ method: 'POST', origin: null, target: 'https://d.example' }) // true
 */
export const isCrossSiteMutation = ({ method, origin, target }: CrossSiteRequest): boolean =>
  isMutation(method) && origin !== target
