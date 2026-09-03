import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware } from './middleware'

/** A phone's user agent, as `next/server`'s own parser recognises one. */
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

/** A desktop browser's user agent, which names no device kind at all. */
const DESKTOP =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

/** Builds a request for `path` carrying the headers a reader's browser would send. */
const requestFor = (path: string, headers: Record<string, string> = {}): NextRequest =>
  new NextRequest(`http://localhost:3000${path}`, { headers })

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
})
