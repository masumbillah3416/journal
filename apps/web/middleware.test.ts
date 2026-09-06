/**
 * middleware.test.ts — the two things this file's middleware does: routing a
 * `/p/<n>` request to the surface it is served, and putting every `/admin`
 * request through the admin's own policy.
 *
 * Unit test (CLAUDE.md §2): `middleware.ts` is gated at 100% lines, branches
 * and functions, and every outcome it can produce is reachable from a plain
 * `NextRequest` with no server at all.
 *
 * THE ADMIN BLOCK'S MOST IMPORTANT CASES ARE THE NEGATIVE ONES. A middleware
 * that added the admin's headers to every response would pass every assertion
 * about the admin and silently change the diary's own headers — which is a
 * behaviour change to thirty-three pages this task does not own — so the
 * diary's paths are asserted to carry NONE of them, one case per header.
 *
 * Depends on: vitest, next/server, ./lib/auth/adminAccess, ./middleware.
 */
import { adminSecurityHeaders } from './lib/auth/adminAccess'
import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware } from './middleware'

/** The origin every request in this file is made to. */
const ORIGIN = 'http://localhost:3000'

/**
 * The headers the middleware is expected to set, for the environment these
 * tests run in.
 *
 * `development: false`, because Vitest sets `NODE_ENV` to `test` and the
 * middleware reads exactly that — so what these cases compare against is the
 * SHIPPED policy, which is the one worth pinning here. Whether the development
 * policy differs by the one keyword it should is `adminAccess.test.ts`'s.
 */
const EXPECTED_HEADERS = adminSecurityHeaders({ development: false })

/** A phone's user agent, as `next/server`'s own parser recognises one. */
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

/** A desktop browser's user agent, which names no device kind at all. */
const DESKTOP =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

/** Builds a request for `path` carrying the headers a reader's browser would send. */
const requestFor = (path: string, headers: Record<string, string> = {}, method = 'GET'): NextRequest =>
  new NextRequest(`${ORIGIN}${path}`, { headers, method })

/** The path the middleware sent this request to, whether by rewrite or by redirect. */
const destination = (path: string, headers: Record<string, string> = {}): string | null => {
  const response = middleware(requestFor(path, headers))
  const sent = response.headers.get('x-middleware-rewrite') ?? response.headers.get('location')
  if (sent === null) return null
  const url = new URL(sent)
  return url.pathname + url.search
}

describe('middleware', () => {
  describe('the reading surface a `/p/<n>` request is served', () => {
    it('serves the book route itself to a desktop browser', () => {
      expect(destination('/p/3', { 'user-agent': DESKTOP })).toBeNull()
    })

    it('serves the book route itself when there is no user agent to go on at all', () => {
      expect(destination('/p/3')).toBeNull()
    })

    it('sends a phone to the mobile route without changing the address it asked for', () => {
      expect(destination('/p/3', { 'user-agent': IPHONE })).toBe('/m/3')
    })

    it('sends a reader whose browser measured a narrow window to the mobile route', () => {
      expect(destination('/p/3', { 'user-agent': DESKTOP, cookie: 'td-reading-surface=mobile' })).toBe('/m/3')
    })

    it('keeps a phone on the book route when that reader’s browser measured a wide one', () => {
      expect(destination('/p/3', { 'user-agent': IPHONE, cookie: 'td-reading-surface=book' })).toBeNull()
    })

    it('carries the query across the rewrite, since the book asks for itself with one', () => {
      expect(destination('/p/3?pages=all', { 'user-agent': IPHONE })).toBe('/m/3?pages=all')
    })

    it('rewrites rather than redirects, so the reader’s address stays the one they can share', () => {
      const response = middleware(requestFor('/p/3', { 'user-agent': IPHONE }))

      expect(response.headers.get('location')).toBeNull()
      expect(response.headers.get('x-middleware-rewrite')).not.toBeNull()
    })
  })

  describe('the mobile route’s own path, which is not an address', () => {
    it('redirects a direct request for it onto the page’s one public address', () => {
      expect(destination('/m/3', { 'user-agent': IPHONE })).toBe('/p/3')
    })

    it('redirects permanently, so no crawler keeps the internal path as a second address', () => {
      expect(middleware(requestFor('/m/3', { 'user-agent': IPHONE })).status).toBe(308)
    })

    it('redirects a desktop browser too, since the path is internal to the rewrite either way', () => {
      expect(destination('/m/3', { 'user-agent': DESKTOP })).toBe('/p/3')
    })
  })

  describe('the headers every admin response carries, and no diary response does', () => {
    it('puts the admin’s content security policy on an admin response', () => {
      const response = middleware(requestFor('/admin/sign-in'))

      expect(response.headers.get('Content-Security-Policy')).toBe(
        EXPECTED_HEADERS['Content-Security-Policy'],
      )
    })

    it('puts the admin’s referrer policy on it too, so a reset token never leaves in a Referer', () => {
      // `same-origin`, not `no-referrer`: the token still never leaves in a
      // cross-origin `Referer`, and a form-navigation POST keeps an `Origin`
      // the cross-site check can read. Under `no-referrer` it sends
      // `Origin: null` and every form on this surface answered 403.
      expect(middleware(requestFor('/admin/reset/deadbeef')).headers.get('Referrer-Policy')).toBe('same-origin')
    })

    it('puts every one of them on, not merely the policy', () => {
      // Asserted as a set rather than one by one: a header added to
      // `adminSecurityHeaders` and not applied here would otherwise be a
      // header nothing notices is missing.
      const response = middleware(requestFor('/admin/sign-in'))

      for (const [name, value] of Object.entries(EXPECTED_HEADERS)) {
        expect(response.headers.get(name)).toBe(value)
      }
    })

    it('leaves the book’s own response carrying none of them', () => {
      // The diary is thirty-three pages this task does not own. A CSP added to
      // them would be a behaviour change nothing in this task asked for.
      const response = middleware(requestFor('/p/3', { 'user-agent': DESKTOP }))

      for (const name of Object.keys(EXPECTED_HEADERS)) {
        expect(response.headers.get(name)).toBeNull()
      }
    })

    it('leaves the mobile surface’s rewrite carrying none of them either', () => {
      const response = middleware(requestFor('/p/3', { 'user-agent': IPHONE }))

      for (const name of Object.keys(EXPECTED_HEADERS)) {
        expect(response.headers.get(name)).toBeNull()
      }
    })

    it('leaves the redirect off the internal mobile path carrying none of them', () => {
      const response = middleware(requestFor('/m/3', { 'user-agent': IPHONE }))

      for (const name of Object.keys(EXPECTED_HEADERS)) {
        expect(response.headers.get(name)).toBeNull()
      }
    })
  })

  describe('the cross-site mutations it refuses', () => {
    it('admits a post carrying our own origin', () => {
      const response = middleware(
        requestFor('/admin/sign-in/password', { origin: ORIGIN }, 'POST'),
      )

      expect(response.status).toBe(200)
    })

    it('refuses a post carrying somebody else’s origin', () => {
      const response = middleware(
        requestFor('/admin/sign-in/password', { origin: 'https://attacker.example' }, 'POST'),
      )

      expect(response.status).toBe(403)
    })

    it('refuses a post carrying no origin at all', () => {
      // The case that makes the check real rather than decorative — see
      // `adminAccess.ts`. Every browser sends `Origin` on a form POST.
      expect(middleware(requestFor('/admin/sign-in/password', {}, 'POST')).status).toBe(403)
    })

    it('refuses a forged post to the endpoint that authorises by a cookie', () => {
      // `SameSite=Lax` already withholds the session cookie from a cross-site
      // POST, so this is the second layer — and the one that also covers a
      // sibling host under the same registrable domain, which `Lax` treats as
      // same-site.
      const response = middleware(
        requestFor('/admin/sign-out', { origin: 'https://evil.localhost', cookie: 'td-session=stolen' }, 'POST'),
      )

      expect(response.status).toBe(403)
    })

    it('still carries the admin’s headers on what it refuses', () => {
      const response = middleware(requestFor('/admin/sign-out', {}, 'POST'))

      expect(response.headers.get('Content-Security-Policy')).toBe(
        EXPECTED_HEADERS['Content-Security-Policy'],
      )
    })

    it('refuses nothing on the diary, which sets no cookie a forgery could spend', () => {
      // The matcher reaches `/p/<n>` too. A cross-origin `POST` there is not
      // this policy's business, and refusing one would be a behaviour change
      // to a surface that authenticates nobody.
      expect(middleware(requestFor('/p/3', { 'user-agent': DESKTOP }, 'POST')).status).toBe(200)
    })
  })

  describe('the identifier it mints for a browser that has none', () => {
    /** The `Set-Cookie` values a response carries. */
    const cookiesOf = (response: ReturnType<typeof middleware>): string =>
      response.headers.getSetCookie().join('\n')

    it('gives a browser arriving at the sign-in screen something to bind a code to', () => {
      // `signIn.ts` requires a non-null `browserSession`, and
      // `otpService.issueChallenge` binds the code to it. A browser that has
      // never been here has none.
      expect(cookiesOf(middleware(requestFor('/admin/sign-in')))).toContain('td-session=')
    })

    it('scopes and withholds it exactly as a signed-in session’s cookie is', () => {
      const cookies = cookiesOf(middleware(requestFor('/admin/sign-in')))

      expect(cookies).toContain('Path=/admin')
      expect(cookies).toContain('HttpOnly')
      expect(cookies).toContain('Secure')
      expect(cookies).toContain('SameSite=Lax')
    })

    it('gives a browser arriving at the reset screen one as well', () => {
      expect(cookiesOf(middleware(requestFor('/admin/reset')))).toContain('td-session=')
    })

    it('leaves a browser that already carries one alone', () => {
      // THE CASE THAT KEEPS THIS FROM BEING A SESSION-DESTROYER. Overwriting
      // the cookie on every GET would replace a signed-in reader’s session
      // with a pre-auth identifier the moment they loaded any admin page.
      const response = middleware(requestFor('/admin/sign-in', { cookie: 'td-session=already-holding-one' }))

      expect(cookiesOf(response)).not.toContain('td-session=')
    })

    it('mints nothing on a guarded address, where an identifier would answer nothing', () => {
      expect(cookiesOf(middleware(requestFor('/admin/sign-in/done')))).not.toContain('td-session=')
    })

    it('mints nothing on a POST, which is answered by a handler that mints its own', () => {
      // The handler has to set the cookie on its response anyway, so a second
      // one here would be a second identifier and the challenge would be bound
      // to whichever won.
      const response = middleware(requestFor('/admin/sign-in/password', { origin: ORIGIN }, 'POST'))

      expect(cookiesOf(response)).not.toContain('td-session=')
    })

    it('mints nothing for the diary, which is served to readers who never sign in', () => {
      expect(cookiesOf(middleware(requestFor('/p/3', { 'user-agent': DESKTOP })))).not.toContain('td-session=')
    })

    it('mints a different identifier for every browser that asks', () => {
      const first = cookiesOf(middleware(requestFor('/admin/sign-in')))
      const second = cookiesOf(middleware(requestFor('/admin/sign-in')))

      expect(first).not.toBe(second)
    })
  })

  describe('what it does not do to the admin', () => {
    it('leaves an admin request on its own route rather than rewriting it', () => {
      const response = middleware(requestFor('/admin/sign-in'))

      expect(response.headers.get('x-middleware-rewrite')).toBeNull()
      expect(response.headers.get('location')).toBeNull()
    })

    it('admits an unauthenticated request for a guarded screen, which the guard refuses instead', () => {
      // NOT a hole, and it is stated so nobody adds a second, weaker check
      // here: whether an identifier names a LIVE row needs Postgres, which the
      // Edge runtime cannot reach. `lib/auth/guard.ts` is the authority, and a
      // cookie-presence test here would admit every revoked session and every
      // pre-auth identifier anyway.
      expect(middleware(requestFor('/admin/sign-in/done')).status).toBe(200)
    })
  })
})
