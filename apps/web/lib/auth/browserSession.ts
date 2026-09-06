/**
 * browserSession — the two cookies a browser carries through a sign-in: the
 * identifier in `td-session`, and the one bit of the reader's own choice that
 * the code step would otherwise lose.
 *
 * ═══ WHY A BROWSER NEEDS AN IDENTIFIER BEFORE IT HAS SIGNED IN ═══
 *
 * `signIn.ts` requires a NON-NULL `browserSession` on every call, and
 * `otpService.issueChallenge` binds the one-time code to it — that binding is
 * `SECURITY.md`'s "a code issued for one browser cannot be redeemed in
 * another". A browser arriving at the sign-in screen for the first time has
 * no such value, so something has to mint one, and that something is here.
 *
 * IT AUTHENTICATES NOTHING, AND THAT IS ITS WHOLE SAFETY PROPERTY. No
 * `sessions` row names a pre-auth identifier: `guard.ts` hands it to
 * `authenticate`, which finds no row and refuses it. It is a name for a
 * browser mid-sign-in, not a claim about who that browser is.
 *
 * IT SHARES THE SESSION COOKIE'S NAME, DELIBERATELY. `signIn.ts` takes ONE
 * `browserSession` — "the pre-auth identifier for a browser that has not
 * signed in, or a live session's for one that has" — and supersedes it either
 * way. Two cookies would mean two things to supersede and a case where only
 * one of them was, which is the session-fixation hole this whole layer exists
 * to close. `startSession` rotates the value in the same statement that mints
 * its replacement, so what the browser holds after signing in is never what
 * it held before.
 *
 * ═══ WHY THIS MODULE TOUCHES NO NODE BUILT-IN ═══
 *
 * `apps/web/middleware.ts` imports it, and the middleware runs in Next.js's
 * Edge runtime, where `node:crypto` does not exist. The identifier is drawn
 * from `crypto.getRandomValues` — the Web Crypto API, present in both the
 * Edge runtime and Node 18+ — rather than from `randomBytes`, which is what
 * `sessions.ts` uses on the server side for the same 32 bytes. That is two
 * spellings of one idea, and it is the cost of the split; the property that
 * matters (a CSPRNG, 32 bytes) is identical, and neither is ever compared
 * against the other.
 *
 * ═══ WHY "KEEP ME SIGNED IN" NEEDS A COOKIE OF ITS OWN ═══
 *
 * The checkbox is on the PASSWORD step (`SCREENS.md` §3.1) and the session is
 * issued at the CODE step, which submits six digits and nothing else. Between
 * the two there is nowhere for the answer to live: `otpChallenges` does not
 * store it, and adding a column would put a display preference in the table
 * whose every other field is a credential's state.
 *
 * SO IT TRAVELS IN A COOKIE, AND WHAT MAKES THAT ACCEPTABLE IS THAT IT CARRIES
 * ONE BIT. Not the address, not the password, not the code — a yes or a no
 * (CLAUDE.md §7). It is not a credential and is not trusted as one: anybody can
 * set it, and the most a forged one achieves is a thirty-day session for an
 * account whose password and one-time code the holder has just supplied
 * correctly. The alternative — defaulting to `false` at the code step — would
 * mean the checkbox does nothing at all for every account with the second
 * factor on, which is every account by default (`users.otpRequired`).
 *
 * THE PASSWORD STEP WRITES IT EITHER WAY, never only when it was ticked, so a
 * stale `yes` from an earlier sign-in cannot lengthen this one.
 *
 * PATTERNS (CLAUDE.md §3.3). Value objects: what is minted and what is read
 * back are branded `SessionId`s, so a raw cookie value cannot be passed where
 * a session belongs. Nothing else — this is a handful of small functions with
 * no state between them.
 *
 * INVARIANT — NOTHING HERE LOGS. Not the identifier, not the cookie header
 * (CLAUDE.md §7).
 *
 * Depends on: `SESSION_COOKIE_NAME`, `PRE_AUTH_LIFETIME_MS`, `ADMIN_COOKIE_PATH`
 * and `sessionCookie` (@travel-diary/domain/auth/session), `SessionId`/`sessionId`
 * (@travel-diary/domain/ids), `isOk` (@travel-diary/domain/result).
 */
import {
  ADMIN_COOKIE_PATH,
  PRE_AUTH_LIFETIME_MS,
  SESSION_COOKIE_NAME,
  sessionCookie,
} from '@travel-diary/domain/auth/session'
import { type SessionId, sessionId } from '@travel-diary/domain/ids'
import { isOk } from '@travel-diary/domain/result'

/**
 * How many random bytes a pre-auth identifier is drawn from.
 *
 * Thirty-two, the same width `sessions.ts` mints a real session identifier
 * at. A narrower pre-auth value would be the guessable half of a pair that is
 * only ever as strong as its weakest member: an attacker who can predict the
 * identifier a victim's browser is about to carry can redeem the code mailed
 * to them.
 */
const IDENTIFIER_BYTES = 32

/** How many milliseconds are in one second, for the `Max-Age` conversion. */
const MS_PER_SECOND = 1_000

/** The cookie "keep me signed in" travels from the password step in. */
export const KEEP_SIGNED_IN_COOKIE_NAME = 'td-keep-signed-in'

/** The one value that cookie can hold and mean yes. */
const KEEP_SIGNED_IN_COOKIE_VALUE = 'yes'

/**
 * One cookie of the admin's, under the admin's attributes.
 *
 * The attributes are `sessionCookie`'s (`packages/domain/src/auth/session.ts`)
 * and are written out here rather than reached for, because that function
 * refuses a `Max-Age` of zero by construction — it takes a LIFETIME, and a
 * clear is the absence of one. Every attribute below has a case named for it
 * in `browserSession.test.ts`, so this second spelling cannot drift silently.
 *
 * @param name - The cookie's name.
 * @param value - Its value; the empty string for a clear.
 * @param lifetimeMs - How long the browser should keep it, in milliseconds.
 * @returns The `Set-Cookie` header value.
 */
const adminCookie = (name: string, value: string, lifetimeMs: number): string =>
  [
    `${name}=${value}`,
    `Path=${ADMIN_COOKIE_PATH}`,
    `Max-Age=${String(Math.floor(lifetimeMs / MS_PER_SECOND))}`,
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
  ].join('; ')

/**
 * One named cookie's value out of a `Cookie` header.
 *
 * SPLIT ON `;`, NEVER SEARCHED FOR THE NAME. A scan for `td-session=` inside
 * the header matches `not-td-session=stolen` as well, and would read a cookie
 * an attacker set on a sibling host as the reader's own session.
 * `browserSession.test.ts` has a case named for exactly that.
 *
 * @param cookieHeader - The request's `Cookie` header, or `null`.
 * @param name - The cookie to find.
 * @returns Its value, or `null` when the header carries no cookie of that name.
 */
const cookieValue = (cookieHeader: string | null, name: string): string | null => {
  if (cookieHeader === null) return null

  for (const pair of cookieHeader.split(';')) {
    const separator = pair.indexOf('=')
    if (separator >= 0 && pair.slice(0, separator).trim() === name) return pair.slice(separator + 1).trim()
  }

  return null
}

/**
 * A fresh identifier for a browser that has not signed in.
 *
 * @returns 43 characters of `[A-Za-z0-9_-]` — 32 CSPRNG bytes in base64url,
 *   which needs no escaping in a cookie value and nothing stripped when it is
 *   read back.
 * @throws Never in practice; see the guard's own comment.
 * @example
 * const session = newBrowserSession()
 * response.headers.set('Set-Cookie', browserSessionCookie(session))
 */
export const newBrowserSession = (): SessionId => {
  const drawn = crypto.getRandomValues(new Uint8Array(IDENTIFIER_BYTES))

  // `btoa` over a binary string, then the two base64url substitutions and the
  // padding dropped. `Buffer` would be one call and is not available in the
  // Edge runtime, which is the whole reason this module exists in this shape.
  const base64 = btoa(String.fromCharCode(...drawn))
  const branded = sessionId(base64.replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', ''))

  /* c8 ignore start -- `sessionId` refuses only an empty or whitespace-only string, and base64url of 32 bytes is 43 characters of `[A-Za-z0-9_-]`. The guard exists because the constructor returns a Result that has to be unwrapped, not because an identifier can be empty — the same arm, for the same reason, as `sessions.ts`'s own `newIdentifier`. */
  if (!isOk(branded)) throw new Error('a generated browser session identifier is empty')
  /* c8 ignore stop */
  return branded.value
}

/**
 * The identifier a request is carrying, if it is carrying one.
 *
 * Parsed by {@link cookieValue}, which splits rather than searches — see its
 * own comment for the header a search would misread.
 *
 * @param cookieHeader - The request's `Cookie` header, or `null` when it sent
 *   none.
 * @returns The branded identifier, or `null` when the header carries no
 *   `td-session`, or carries one with an empty value — which can name no row
 *   and is treated as absent here rather than refused one layer later.
 * @example
 * const carried = readBrowserSession(request.headers.get('cookie'))
 */
export const readBrowserSession = (cookieHeader: string | null): SessionId | null => {
  const branded = sessionId(cookieValue(cookieHeader, SESSION_COOKIE_NAME) ?? '')
  return isOk(branded) ? branded.value : null
}

/**
 * Whether the reader ticked "keep me signed in" on the password step.
 *
 * READ BY EXACT EQUALITY, never for truthiness. The cookie is not a secret and
 * anybody can set one, so `0`, `false` and any other value a hand-rolled
 * request invents all mean no — there is one spelling of yes, and this module
 * writes it.
 *
 * @param cookieHeader - The request's `Cookie` header, or `null`.
 * @returns `true` only when the cookie this module set says so.
 * @example
 * const keepSignedIn = readKeepSignedIn(request.headers.get('cookie'))
 */
export const readKeepSignedIn = (cookieHeader: string | null): boolean =>
  cookieValue(cookieHeader, KEEP_SIGNED_IN_COOKIE_NAME) === KEEP_SIGNED_IN_COOKIE_VALUE

/**
 * The `Set-Cookie` value carrying the reader's answer on to the code step.
 *
 * @param keepSignedIn - What they ticked. Written either way — see this
 *   module's header for why a `false` is set rather than skipped.
 * @returns The header value, under the same attributes and the same lifetime
 *   the pre-auth identifier travels under.
 * @example
 * seeOther('/admin/sign-in/code', { 'Set-Cookie': keepSignedInCookie(true) })
 */
export const keepSignedInCookie = (keepSignedIn: boolean): string =>
  adminCookie(KEEP_SIGNED_IN_COOKIE_NAME, keepSignedIn ? KEEP_SIGNED_IN_COOKIE_VALUE : '', PRE_AUTH_LIFETIME_MS)

/**
 * The `Set-Cookie` value that takes that answer away again.
 *
 * Sent once the session it described has been issued: the choice is in the
 * `sessions` row's own expiry from that moment on, and leaving the cookie
 * behind would apply it to a sign-in the reader has not made yet.
 *
 * @returns The header value: an empty value, expired immediately.
 * @example
 * response.headers.append('Set-Cookie', clearedKeepSignedInCookie())
 */
export const clearedKeepSignedInCookie = (): string => adminCookie(KEEP_SIGNED_IN_COOKIE_NAME, '', 0)

/**
 * The `Set-Cookie` value that hands a pre-auth identifier to the browser.
 *
 * The same attributes a signed-in session's cookie carries — `sessionCookie`
 * is what writes them, so there is one definition of the admin cookie policy
 * rather than two — under {@link PRE_AUTH_LIFETIME_MS} instead of a sign-in's
 * lifetime.
 *
 * @param session - The identifier {@link newBrowserSession} minted.
 * @returns The header value.
 * @example
 * response.headers.append('Set-Cookie', browserSessionCookie(newBrowserSession()))
 */
export const browserSessionCookie = (session: string): string =>
  sessionCookie({ token: session, lifetimeMs: PRE_AUTH_LIFETIME_MS })

/**
 * The `Set-Cookie` value that takes the session cookie away again.
 *
 * SCOPED TO THE SAME PATH, WHICH IS NOT DECORATION. RFC 6265 keys a stored
 * cookie by name AND path, so a clear written without `Path=/admin` sets a
 * second, empty cookie at `/` and leaves the real one exactly where it was —
 * a sign-out that appears to work and does not.
 *
 * The row is revoked either way (`revokeSession`), so a browser that ignored
 * this header still stops authenticating on its next request. This header is
 * what stops it from continuing to SEND a value that can no longer be used.
 *
 * @returns The header value: an empty identifier, expired immediately.
 * @example
 * response.headers.set('Set-Cookie', clearedSessionCookie())
 */
export const clearedSessionCookie = (): string => adminCookie(SESSION_COOKIE_NAME, '', 0)
