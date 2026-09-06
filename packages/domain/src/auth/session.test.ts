/**
 * session.test.ts — the session row's lifecycle and the admin cookie's
 * attributes, asserted before either exists.
 *
 * Every case names its own numbers in literals rather than reaching for a
 * fixture factory, the same choice `rateWindow.test.ts` makes and for the
 * same reason: the arithmetic IS the behaviour under test. Time is a
 * parameter throughout (CLAUDE.md §2.3) — nothing in this file or the module
 * it covers reads a clock.
 *
 * THE COOKIE CASES ASSERT EACH ATTRIBUTE SEPARATELY, not the whole string in
 * one comparison. `SECURITY.md` names four independent requirements —
 * `httpOnly`, `Secure`, `SameSite=Lax`, scoped to the admin path — and a
 * single `toBe` on the assembled header reports "the string differs" when any
 * one of them is dropped, which is a failure message that does not say which
 * protection was lost. One case per attribute means deleting `Secure` fails
 * the case named for `Secure`.
 */
import { describe, expect, it } from 'vitest'
import {
  ADMIN_COOKIE_PATH,
  PRE_AUTH_LIFETIME_MS,
  REMEMBERED_SESSION_LIFETIME_MS,
  SESSION_COOKIE_NAME,
  SESSION_LIFETIME_MS,
  sessionCookie,
  sessionLifetimeMs,
  sessionState,
} from './session'

describe('sessionState', () => {
  it('reports a session inside its lifetime as active', () => {
    const state = sessionState({ expiresAt: 1_000, revokedAt: null }, 999)

    expect(state).toBe('active')
  })

  it('reports a session as expired at the very instant it expires', () => {
    const state = sessionState({ expiresAt: 1_000, revokedAt: null }, 1_000)

    expect(state).toBe('expired')
  })

  it('reports a session one millisecond short of expiry as still active, so the boundary is not off by one', () => {
    // Pins the threshold from the side the case above cannot: a lifetime cut
    // one millisecond short passes every other case in this file.
    const state = sessionState({ expiresAt: 1_000, revokedAt: null }, 999)

    expect(state).toBe('active')
  })

  it('reports a revoked session as revoked, so revoking is not merely a field that was written', () => {
    const state = sessionState({ expiresAt: 1_000, revokedAt: 500 }, 600)

    expect(state).toBe('revoked')
  })

  it('reports a session revoked at this very instant as already revoked', () => {
    const state = sessionState({ expiresAt: 1_000, revokedAt: 600 }, 600)

    expect(state).toBe('revoked')
  })

  it('prefers revoked over expired, because revocation is a deliberate act and ageing out is not', () => {
    // Both conditions hold. Precedence is an invariant of the module, not an
    // incidental order of two `if`s — see its header.
    const state = sessionState({ expiresAt: 1_000, revokedAt: 500 }, 5_000)

    expect(state).toBe('revoked')
  })

  it('treats a non-finite expiry as expired, so a bad date parse cannot hand out a session', () => {
    const state = sessionState({ expiresAt: Number.NaN, revokedAt: null }, 600)

    expect(state).toBe('expired')
  })

  it('treats a non-finite clock as expired, for the same reason', () => {
    const state = sessionState({ expiresAt: 1_000, revokedAt: null }, Number.NaN)

    expect(state).toBe('expired')
  })
})

describe('sessionLifetimeMs', () => {
  it('gives an ordinary sign-in the short lifetime', () => {
    expect(sessionLifetimeMs({ keepSignedIn: false })).toBe(SESSION_LIFETIME_MS)
  })

  it('gives a remembered sign-in the long lifetime', () => {
    expect(sessionLifetimeMs({ keepSignedIn: true })).toBe(REMEMBERED_SESSION_LIFETIME_MS)
  })

  it('makes the remembered lifetime genuinely longer, so "keep me signed in" is not a relabelled default', () => {
    expect(REMEMBERED_SESSION_LIFETIME_MS).toBeGreaterThan(SESSION_LIFETIME_MS)
  })

  it('gives the pre-auth identifier a shorter life than any signed-in session', () => {
    // It authenticates nothing — no `sessions` row names it — so a browser
    // that abandoned a sign-in should stop carrying it long before a signed-in
    // session would have ended. Asserted as an ordering rather than as a
    // number, so the case is about the relationship rather than about a
    // constant restated (CLAUDE.md §10).
    expect(PRE_AUTH_LIFETIME_MS).toBeLessThan(SESSION_LIFETIME_MS)
    expect(PRE_AUTH_LIFETIME_MS).toBeGreaterThan(0)
  })

  it('is never handed to sessionLifetimeMs, which answers only for a real sign-in', () => {
    // The two are different questions and this pins that they have different
    // answers: a pre-auth lifetime that had drifted to equal the short session
    // lifetime would make the case above vacuous.
    expect(sessionLifetimeMs({ keepSignedIn: false })).not.toBe(PRE_AUTH_LIFETIME_MS)
  })
})

describe('sessionCookie', () => {
  it('carries the opaque identifier under the session cookie name', () => {
    const header = sessionCookie({ token: 'an-opaque-identifier', lifetimeMs: 60_000 })

    expect(header.startsWith(`${SESSION_COOKIE_NAME}=an-opaque-identifier;`)).toBe(true)
  })

  it('marks the cookie httpOnly, so a script that reaches the admin cannot read the session', () => {
    const header = sessionCookie({ token: 'an-opaque-identifier', lifetimeMs: 60_000 })

    expect(header.split('; ')).toContain('HttpOnly')
  })

  it('marks the cookie Secure, so the session never travels over plain HTTP', () => {
    const header = sessionCookie({ token: 'an-opaque-identifier', lifetimeMs: 60_000 })

    expect(header.split('; ')).toContain('Secure')
  })

  it('sets SameSite=Lax, so a cross-site form post arrives without the session attached', () => {
    const header = sessionCookie({ token: 'an-opaque-identifier', lifetimeMs: 60_000 })

    expect(header.split('; ')).toContain('SameSite=Lax')
  })

  it('scopes the cookie to the admin path, so the public diary never receives it', () => {
    const header = sessionCookie({ token: 'an-opaque-identifier', lifetimeMs: 60_000 })

    expect(header.split('; ')).toContain(`Path=${ADMIN_COOKIE_PATH}`)
  })

  it('scopes it to a path under the admin panel rather than the whole site', () => {
    // The one assertion that would survive `ADMIN_COOKIE_PATH` being edited
    // to `/`: the case above compares against the constant, so it passes
    // whatever the constant says.
    expect(ADMIN_COOKIE_PATH).toBe('/admin')
  })

  it('expresses the lifetime in whole seconds, which is the unit Max-Age is defined in', () => {
    const header = sessionCookie({ token: 'an-opaque-identifier', lifetimeMs: 90_500 })

    expect(header.split('; ')).toContain('Max-Age=90')
  })

  it('carries no lifetime inside the identifier itself, so the row is what expires and not the token', () => {
    const short = sessionCookie({ token: 'an-opaque-identifier', lifetimeMs: SESSION_LIFETIME_MS })
    const remembered = sessionCookie({ token: 'an-opaque-identifier', lifetimeMs: REMEMBERED_SESSION_LIFETIME_MS })

    const value = (header: string): string => header.slice(0, header.indexOf(';'))
    expect(value(remembered)).toBe(value(short))
  })
})
