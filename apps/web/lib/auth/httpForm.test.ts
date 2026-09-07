/**
 * httpForm.test.ts — the four things every endpoint on the sign-in surface
 * does with a raw `Request` before any decision is taken.
 *
 * Unit test (CLAUDE.md §2): a `Request` is a standard object, so none of this
 * needs a server, a database or a Next.js context.
 *
 * THE CASES THAT MATTER ARE THE MALFORMED ONES. A body that is not a form at
 * a trust boundary answered `500` with an empty body in this repository once
 * already (Task 9's re-review, `docs/api.md`), which is why every shape a
 * hand-rolled client can send has a case here rather than one happy path.
 *
 * Depends on: vitest, ./httpForm.
 */
import { describe, expect, it } from 'vitest'
import { clientAddress, deviceLabel, seeOther, submittedFields } from './httpForm'

/** Where these requests pretend to be going. Nothing under test reads it. */
const ENDPOINT = 'http://localhost:3000/admin/sign-in/password'

/** A `POST` carrying `body`, with whatever headers are given. */
const posted = (body: BodyInit | null, headers: Record<string, string> = {}): Request =>
  new Request(ENDPOINT, { method: 'POST', body, headers })

describe('reading the fields off a submission', () => {
  it('reads what the form sent', async () => {
    const form = new FormData()
    form.set('email', 'reader@wanderings.travel')
    form.set('keepSignedIn', 'on')

    expect(await submittedFields(posted(form))).toEqual({ email: 'reader@wanderings.travel', keepSignedIn: 'on' })
  })

  it('reads a urlencoded submission, which is what a form with no file field sends', async () => {
    const request = posted('email=reader%40wanderings.travel', {
      'Content-Type': 'application/x-www-form-urlencoded',
    })

    expect(await submittedFields(request)).toEqual({ email: 'reader@wanderings.travel' })
  })

  it('reads an empty submission as no fields rather than as a failure', async () => {
    expect(await submittedFields(posted(new FormData()))).toEqual({})
  })

  it('reads a body that is not a form at all as no fields', async () => {
    // `Request.formData()` THROWS for a content type it cannot parse. Until
    // this was handled the endpoint answered 500 with an empty body — an
    // unhandled error at a trust boundary (CLAUDE.md §3.1).
    const request = posted(JSON.stringify({ email: 'x' }), { 'Content-Type': 'application/json' })

    expect(await submittedFields(request)).toEqual({})
  })

  it('reads a body with no content type at all as no fields', async () => {
    // What a hand-rolled request, a misconfigured client or a scan sends.
    expect(await submittedFields(posted('email=x'))).toEqual({})
  })
})

describe('the redirect every endpoint answers with', () => {
  it('answers 303, so the browser follows with a GET and a reload posts nothing', async () => {
    const response = seeOther('/admin/sign-in')

    expect(response.status).toBe(303)
    expect(await response.text()).toBe('')
  })

  it('points at where it was asked to point', () => {
    expect(seeOther('/admin/sign-in').headers.get('Location')).toBe('/admin/sign-in')
  })

  it('carries any extra headers it was given, so a cookie travels with the redirect', () => {
    const response = seeOther('/admin/sign-in', { 'Set-Cookie': 'td-session=x; Path=/admin' })

    expect(response.headers.get('Set-Cookie')).toBe('td-session=x; Path=/admin')
    expect(response.headers.get('Location')).toBe('/admin/sign-in')
  })
})

describe('the address a request came from', () => {
  it('reads the first hop of a forwarded chain, which is the client', () => {
    const request = new Request(ENDPOINT, { headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1, 10.0.0.2' } })

    expect(clientAddress(request)).toBe('203.0.113.7')
  })

  it('reads a single forwarded address', () => {
    expect(clientAddress(new Request(ENDPOINT, { headers: { 'x-forwarded-for': '203.0.113.7' } }))).toBe('203.0.113.7')
  })

  it('falls back to the real-ip header some proxies send instead', () => {
    expect(clientAddress(new Request(ENDPOINT, { headers: { 'x-real-ip': '203.0.113.9' } }))).toBe('203.0.113.9')
  })

  it('answers a fixed label when no proxy named an address', () => {
    // NEVER an empty string: the value keys a rate-limit window, and an empty
    // subject would put every unattributable request into one bucket silently.
    // A named label puts them in one bucket visibly.
    expect(clientAddress(new Request(ENDPOINT))).toBe('unknown-address')
  })

  it('answers the same fixed label for a header that is present and blank', () => {
    expect(clientAddress(new Request(ENDPOINT, { headers: { 'x-forwarded-for': '  ' } }))).toBe('unknown-address')
  })
})

describe('the device label the account screen will show', () => {
  it('reads the user agent the browser sent', () => {
    const request = new Request(ENDPOINT, { headers: { 'user-agent': 'Mozilla/5.0 (Macintosh)' } })

    expect(deviceLabel(request)).toBe('Mozilla/5.0 (Macintosh)')
  })

  it('answers nothing at all when there is no user agent', () => {
    expect(deviceLabel(new Request(ENDPOINT))).toBeNull()
  })

  it('clips a user agent long enough to be a payload rather than a label', () => {
    const request = new Request(ENDPOINT, { headers: { 'user-agent': 'a'.repeat(500) } })

    expect(deviceLabel(request)?.length).toBe(200)
  })
})
