/**
 * browserSession.test.ts — the identifier a browser carries before it has
 * signed in: how one is minted, how it is read back off a `Cookie` header,
 * and what the two `Set-Cookie` values say.
 *
 * Unit test (CLAUDE.md §2): the module under test touches no database and no
 * Node built-in, so every case here is a string in and a string out.
 *
 * THE MINT'S CASES ASSERT UNPREDICTABILITY THE ONLY WAY A TEST CAN — that two
 * calls differ, and that the value is wide. Neither proves a CSPRNG was used;
 * what proves that is the one line of the implementation, which draws from
 * `crypto.getRandomValues`. What these cases DO catch is the change that has
 * actually happened to code of this shape: a constant, a counter, or a value
 * derived from the clock.
 *
 * THE COOKIE CASES READ THE ATTRIBUTES INDIVIDUALLY, so deleting one fails a
 * case named for it. They deliberately do NOT compare against
 * `sessionCookie(...)` called with the same arguments — an assertion pinned
 * against the very expression it is meant to hold still (CLAUDE.md §10) would
 * pass however that function changed.
 *
 * Depends on: vitest, @travel-diary/domain/auth/session, ./browserSession.
 */
import { PRE_AUTH_LIFETIME_MS, SESSION_COOKIE_NAME } from '@travel-diary/domain/auth/session'
import { describe, expect, it } from 'vitest'
import {
  browserSessionCookie,
  clearedKeepSignedInCookie,
  clearedSessionCookie,
  KEEP_SIGNED_IN_COOKIE_NAME,
  keepSignedInCookie,
  newBrowserSession,
  readBrowserSession,
  readKeepSignedIn,
} from './browserSession'

describe('minting the identifier a browser carries', () => {
  it('never mints the same identifier twice', () => {
    const minted = new Set(Array.from({ length: 64 }, () => String(newBrowserSession())))

    expect(minted.size).toBe(64)
  })

  it('mints something too wide to be guessed', () => {
    // 32 bytes in base64url is 43 characters. Asserted as a floor rather than
    // an equality, so the case is about the entropy rather than about the
    // encoding this happens to use.
    expect(String(newBrowserSession()).length).toBeGreaterThanOrEqual(43)
  })

  it('mints something a cookie can carry without escaping', () => {
    // base64url only. A `+`, `/` or `=` would have to be encoded on the way
    // into a `Set-Cookie` and decoded on the way back, and the decode is what
    // gets forgotten.
    expect(String(newBrowserSession())).toMatch(/^[A-Za-z0-9_-]+$/u)
  })
})

describe('reading the identifier back off a request', () => {
  it('finds the session cookie among the others a browser sends', () => {
    const header = `td-reading-surface=book; ${SESSION_COOKIE_NAME}=abc123; other=x`

    expect(readBrowserSession(header)).toBe('abc123')
  })

  it('finds it when it is the only cookie there is', () => {
    expect(readBrowserSession(`${SESSION_COOKIE_NAME}=abc123`)).toBe('abc123')
  })

  it('answers nothing when the browser sent no cookies at all', () => {
    expect(readBrowserSession(null)).toBeNull()
    expect(readBrowserSession('')).toBeNull()
  })

  it('answers nothing when no cookie has this name', () => {
    expect(readBrowserSession('td-reading-surface=book')).toBeNull()
  })

  it('does not mistake a cookie whose name merely ends with ours', () => {
    // `not-td-session=x` contains `td-session=x`. A scan by `indexOf` would
    // read the attacker's value as the reader's session.
    expect(readBrowserSession(`not-${SESSION_COOKIE_NAME}=stolen`)).toBeNull()
  })

  it('answers nothing for a cookie of this name with no value', () => {
    // An empty identifier can never name a row, and `sessionId` refuses it —
    // so it is treated as no cookie at all rather than passed on to be refused
    // one layer later.
    expect(readBrowserSession(`${SESSION_COOKIE_NAME}=`)).toBeNull()
  })
})

describe('the cookie a pre-auth identifier travels in', () => {
  const cookie = browserSessionCookie('minted-identifier')

  it('carries the identifier under the one session cookie name', () => {
    expect(cookie).toContain(`${SESSION_COOKIE_NAME}=minted-identifier`)
  })

  it('is scoped to the admin path, so the diary never carries it', () => {
    expect(cookie).toContain('Path=/admin')
  })

  it('is withheld from script', () => {
    expect(cookie).toContain('HttpOnly')
  })

  it('is withheld from plain HTTP', () => {
    expect(cookie).toContain('Secure')
  })

  it('is withheld from a cross-site request', () => {
    expect(cookie).toContain('SameSite=Lax')
  })

  it('lasts the pre-auth lifetime, not a signed-in one', () => {
    // The identifier this cookie carries authenticates nothing — it exists to
    // bind a one-time code to the browser that asked for it. Giving it a
    // signed-in session's lifetime would leave a browser that abandoned a
    // sign-in carrying the same value for twelve hours.
    expect(cookie).toContain(`Max-Age=${String(PRE_AUTH_LIFETIME_MS / 1_000)}`)
  })
})

describe('the cookie that takes it away again', () => {
  const cleared = clearedSessionCookie()

  it('names the same cookie, so the browser overwrites the one it holds', () => {
    expect(cleared).toContain(`${SESSION_COOKIE_NAME}=`)
  })

  it('is scoped to the same path, or the browser would keep the old one beside it', () => {
    // RFC 6265 keys a cookie by name AND path. A clear written without
    // `Path=/admin` sets a second, empty cookie at `/` and leaves the real one
    // exactly where it was.
    expect(cleared).toContain('Path=/admin')
  })

  it('expires immediately', () => {
    expect(cleared).toContain('Max-Age=0')
  })

  it('carries no identifier of its own', () => {
    expect(cleared).toContain(`${SESSION_COOKIE_NAME}=;`)
  })
})

describe('the checkbox the password step ticked, carried to the code step', () => {
  it('is remembered when the reader ticked it', () => {
    expect(readKeepSignedIn(keepSignedInCookie({ keepSignedIn: true }))).toBe(true)
  })

  it('is not remembered when they did not', () => {
    // The password step sets the cookie EITHER WAY, so a stale one from an
    // earlier sign-in cannot lengthen this one's session.
    expect(readKeepSignedIn(keepSignedInCookie({ keepSignedIn: false }))).toBe(false)
  })

  it('is not remembered when no such cookie was sent at all', () => {
    expect(readKeepSignedIn(null)).toBe(false)
    expect(readKeepSignedIn('td-reading-surface=book')).toBe(false)
  })

  it('is not remembered for any value but the one this module writes', () => {
    // The cookie is not a secret and anybody can set it; the worst it can do is
    // lengthen a session somebody has just authenticated for. It is still read
    // by exact equality rather than by truthiness, so `0`, `false` and `maybe`
    // all mean no.
    expect(readKeepSignedIn(`${KEEP_SIGNED_IN_COOKIE_NAME}=0`)).toBe(false)
    expect(readKeepSignedIn(`${KEEP_SIGNED_IN_COOKIE_NAME}=false`)).toBe(false)
    expect(readKeepSignedIn(`${KEEP_SIGNED_IN_COOKIE_NAME}=maybe`)).toBe(false)
  })

  it('is scoped and withheld exactly as the session cookie is', () => {
    const cookie = keepSignedInCookie({ keepSignedIn: true })

    expect(cookie).toContain('Path=/admin')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('Secure')
    expect(cookie).toContain('SameSite=Lax')
  })

  it('is taken away once the session it described has been issued', () => {
    const cleared = clearedKeepSignedInCookie()

    expect(cleared).toContain(`${KEEP_SIGNED_IN_COOKIE_NAME}=;`)
    expect(cleared).toContain('Path=/admin')
    expect(cleared).toContain('Max-Age=0')
  })

  it('carries no address, password or code — only a yes or a no', () => {
    // CLAUDE.md §7. The whole reason a cookie is acceptable here is that the
    // value is one bit; a cookie carrying the reader's address to bridge the
    // same gap would be a credential in a browser store.
    expect(keepSignedInCookie({ keepSignedIn: true })).toBe(
      `${KEEP_SIGNED_IN_COOKIE_NAME}=yes; Path=/admin; Max-Age=3600; HttpOnly; Secure; SameSite=Lax`,
    )
  })
})
