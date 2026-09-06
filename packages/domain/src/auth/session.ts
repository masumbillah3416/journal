/**
 * session — the lifecycle of a signed-in session, and the attributes of the
 * cookie that carries its identifier.
 *
 * This is the pure half of `SECURITY.md`'s "Sessions and access". The half
 * that touches Postgres is `apps/web/lib/auth/sessions.ts`; everything that
 * can be decided from three numbers and a string is decided here, where
 * `packages/domain/**` is gated at 100% lines, branches and functions. The
 * shape of the whole layer is `docs/adr/0017-session-store-and-rotation.md`.
 *
 * Repository pattern seam (CLAUDE.md §3.3): {@link SessionRecord} is
 * deliberately narrower than the row that is persisted. The stored row also
 * carries the token's hash, the account, the device and the location; this
 * type names only the two fields a state decision reads. A function handed
 * the token hash alongside the fields it actually needs invites a test — or a
 * log line — that prints a credential it never required.
 *
 * STATE PRECEDENCE — an invariant, not an incidental order of two `if`s.
 * {@link sessionState} checks `'revoked'` before `'expired'`, and both
 * conditions can hold at once: a session revoked last week has also, by now,
 * aged out. Revocation is a deliberate act — somebody pressed Revoke, or
 * "Sign out everywhere" — and ageing out is not, so the deliberate answer is
 * the more useful one and is the one this module gives. `session.test.ts`
 * pins it with a fixture where both hold.
 *
 * A NON-FINITE `expiresAt` OR `now` FAILS CLOSED TO `'expired'`. `NaN` or
 * `Infinity` here means a bad date parse upstream, not a clock running fast:
 * every comparison against `NaN` is false, so falling through to `'active'`
 * would let a parsing bug hand out a session that was never valid. The same
 * reasoning, and the same treatment, as `otpChallenge.ts`'s own guard.
 *
 * THE COOKIE'S `Max-Age` IS A HINT TO THE BROWSER AND CARRIES NO AUTHORITY,
 * which is the whole of `SECURITY.md`'s "'Keep me signed in' is a
 * longer-lived, **revocable** session row — not a longer JWT". The value in
 * the cookie is an opaque identifier: it encodes no claim, no expiry and no
 * account, so nothing about it can be believed without reading the row it
 * names. Lengthening the row's life is therefore the only thing "keep me
 * signed in" can do, and shortening or revoking that row takes effect on the
 * next request whatever the browser was told about `Max-Age`. This is pinned
 * from both sides: `session.test.ts` asserts the identifier is byte-identical
 * for a short and a remembered sign-in, and
 * `apps/web/lib/auth/sessions.integration.test.ts` moves a remembered row's
 * expiry into the past and watches the same long-lived cookie stop
 * authenticating.
 *
 * Depends on: nothing.
 */

/** The cookie the admin session identifier travels in. */
export const SESSION_COOKIE_NAME = 'td-session'

/**
 * The path the session cookie is scoped to (`SECURITY.md`: "scoped to the
 * admin path").
 *
 * `/admin` is the bespoke admin panel's own base path — Payload's stock admin
 * was moved aside to `/cms` for exactly this reason (`apps/web/payload.config.ts`).
 * Scoping the cookie here means the public diary's every request — the CDN-served
 * pages, the media derivatives, the gallery — carries no credential at all,
 * so a cache in front of the diary can never store a response that was varied
 * by one.
 *
 * INVARIANT — THE SIGN-IN SCREENS MUST LIVE UNDER THIS PATH. A browser does
 * not send a `Path=/admin` cookie to `/sign-in`, so a sign-in flow mounted
 * outside `/admin` would set a session it could not then read back, and its
 * "Signed in" state (`SCREENS.md` §3.4) would never render. Phase 2 Task 7
 * builds those screens; they belong at `/admin/...`.
 */
export const ADMIN_COOKIE_PATH = '/admin'

/**
 * How long an ordinary sign-in lasts.
 *
 * `SECURITY.md` requires a revocable session row and a "keep me signed in"
 * that lengthens it, and names no durations; these two constants are this
 * repository's choice. Twelve hours covers an editing session that starts in
 * the morning and is picked up after lunch without a second sign-in, and
 * ends by itself overnight on a machine somebody walked away from.
 */
export const SESSION_LIFETIME_MS = 12 * 60 * 60_000

/**
 * How long a sign-in lasts when the reader ticked "keep me signed in".
 *
 * Thirty days: long enough that the single author of a personal diary is not
 * asked again every week, and short enough that a laptop lost and never
 * reported still stops working within the month. It is a ROW's lifetime, so
 * it is revocable at any point inside that month from the Account screen —
 * see this module's header for why that is the distinction `SECURITY.md`
 * draws.
 */
export const REMEMBERED_SESSION_LIFETIME_MS = 30 * 24 * 60 * 60_000

/** How many milliseconds are in one second, for the `Max-Age` conversion. */
const MS_PER_SECOND = 1_000

/** What {@link sessionLifetimeMs} is asked. */
export interface SessionLifetimeRequest {
  /** Whether the reader ticked "keep me signed in" on the password screen. */
  readonly keepSignedIn: boolean
}

/**
 * The persisted facts a session's state is decided from — nothing more. See
 * the module header for why this is narrower than the row that is stored.
 */
export interface SessionRecord {
  /** Epoch milliseconds at which this session stops being usable. */
  readonly expiresAt: number
  /** Epoch milliseconds when this session was revoked, or `null` if it has not been. */
  readonly revokedAt: number | null
}

/** The states a session can be in at a given instant. */
export type SessionState = 'active' | 'revoked' | 'expired'

/** What {@link sessionCookie} needs to write a `Set-Cookie` value. */
export interface SessionCookieRequest {
  /** The opaque session identifier. It encodes nothing — see the module header. */
  readonly token: string
  /** How long the browser should keep sending it, in milliseconds. */
  readonly lifetimeMs: number
}

/**
 * How long a session issued now should last.
 *
 * @param request - See {@link SessionLifetimeRequest}. An options object
 *   rather than a bare boolean, because CLAUDE.md §3.1 bans boolean
 *   parameters in public APIs — `sessionLifetimeMs(true)` says nothing at
 *   the call site about what is true.
 * @returns {@link REMEMBERED_SESSION_LIFETIME_MS} when the reader asked to
 *   stay signed in, otherwise {@link SESSION_LIFETIME_MS}.
 * @example
 * sessionLifetimeMs({ keepSignedIn: true }) // 30 days, in milliseconds
 */
export const sessionLifetimeMs = ({ keepSignedIn }: SessionLifetimeRequest): number =>
  keepSignedIn ? REMEMBERED_SESSION_LIFETIME_MS : SESSION_LIFETIME_MS

/**
 * Decides which state a session is in at a given instant.
 *
 * @param session - The session's persisted facts (or any fuller row that
 *   structurally contains them — see the module header).
 * @param now - The current instant, in epoch milliseconds. Always the
 *   caller's injected clock (CLAUDE.md §2.3), never read from inside here.
 * @returns `'revoked'` if the session has been revoked, else `'expired'`
 *   once `expiresAt` has been reached — or immediately, if either number is
 *   not finite — else `'active'`.
 * @example
 * sessionState({ expiresAt: 1_000, revokedAt: null }, 999) // 'active'
 * sessionState({ expiresAt: 1_000, revokedAt: null }, 1_000) // 'expired' — the boundary itself has gone
 */
export const sessionState = (session: SessionRecord, now: number): SessionState => {
  if (session.revokedAt !== null) return 'revoked'
  if (!Number.isFinite(session.expiresAt) || !Number.isFinite(now)) return 'expired'

  return now >= session.expiresAt ? 'expired' : 'active'
}

/**
 * The `Set-Cookie` value that hands a session identifier to the browser.
 *
 * Every attribute here discharges a named line of `SECURITY.md`'s "Sessions
 * and access", and each has its own case in `session.test.ts` so that
 * deleting one fails the case named for it rather than one comparison on an
 * assembled string.
 *
 * `Secure` needs no environment switch. Browsers treat `http://localhost` as
 * a secure context, so a `Secure` cookie is set and returned in ordinary
 * local development; making it conditional would mean the attribute that
 * matters most is the one never exercised before deployment.
 *
 * @param request - See {@link SessionCookieRequest}.
 * @returns The header value, attributes separated by `'; '`.
 * @example
 * response.headers.set('Set-Cookie', sessionCookie({ token, lifetimeMs: SESSION_LIFETIME_MS }))
 */
export const sessionCookie = ({ token, lifetimeMs }: SessionCookieRequest): string =>
  [
    `${SESSION_COOKIE_NAME}=${token}`,
    `Path=${ADMIN_COOKIE_PATH}`,
    // Whole seconds, which is the only unit `Max-Age` is defined in. Rounded
    // DOWN, so the browser stops sending the identifier a fraction of a
    // second before the row it names expires rather than a fraction after.
    `Max-Age=${String(Math.floor(lifetimeMs / MS_PER_SECOND))}`,
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
  ].join('; ')
