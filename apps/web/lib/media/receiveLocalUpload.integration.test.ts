/**
 * receiveLocalUpload.integration.test.ts — what the local upload receiver
 * accepts, what it refuses, and what it leaves behind when it refuses.
 *
 * AN INTEGRATION TEST, because it writes real bytes through a real
 * `createLocalStorage` rooted at a temporary directory. Nothing here is
 * stubbed: the port under it is the one production uses, so "and writes
 * nothing" is read off a real filesystem rather than off a spy.
 *
 * ═══ WHAT THE FIXTURE IS, AND WHERE IT DIFFERS FROM A BROWSER ═══
 *
 * `aPutRequest` builds its method and `Content-Type` from
 * `EXPECTED_UPLOAD_REQUEST`, which was measured against a real Chromium (see
 * `uploadContract.ts`'s header). One thing it CANNOT reproduce: Node's
 * `Request` does not expose a `Content-Length` header for a byte body, while a
 * browser always sends one — measured, `content-length: 2048` for a 2048-byte
 * `File`. So the fixture exercises the post-read weighing, and the two cases
 * that set the header explicitly exercise the pre-read one. That is a
 * difference stated rather than papered over, because a fixture whose shape
 * silently diverges from a browser's is what let two Phase 2 blockers through
 * sixteen hundred passing tests.
 *
 * THREE CLIENT SHAPES, THEN, AND EACH IS A DIFFERENT REQUEST BUILDER:
 * `aPutRequest` is the browser's (a body, no declared length in Node);
 * `aPutRequestDeclaring` is a hand-rolled client that states a length, honest
 * or otherwise; and `aChunkedPutRequest` is a hand-rolled client that streams
 * and states nothing — the shape the receiver's header used to claim a
 * protection against that it does not have.
 *
 * Both sides of both limits are pinned: the largest body accepted and the
 * smallest refused, the last instant a token works and the first it does not.
 * Depends on: vitest; the probes (./testing/uploadProbes); `mintUploadToken`
 * (./uploadToken); the module under test.
 */
import { describe, expect, it } from 'vitest'
import type { StoragePort } from '../ports/storage'
import { EXPECTED_UPLOAD_REQUEST } from './uploadContract'
import { receiveLocalUpload } from './receiveLocalUpload'
import { mintUploadToken } from './uploadToken'
import { SECRET, aPutRequest, aTempStore } from './testing/uploadProbes'

/** The key every case in this file stages under. */
const KEY = 'staging/j/1-a.jpg'

/** The receiver's dependencies, with a clock frozen where the cases can read it. */
const deps = (storage: Awaited<ReturnType<typeof aTempStore>>['storage']) => ({
  storage,
  now: () => 1_000,
  secret: SECRET,
})

/** A token over {@link KEY}, with overridable claims. */
const aToken = (overrides: Partial<{ key: string; expiresAt: number; maxBytes: number }> = {}) =>
  mintUploadToken({ key: KEY, expiresAt: 2_000, maxBytes: 100, secret: SECRET, ...overrides })

/**
 * A PUT that DECLARES a length, which `aPutRequest` cannot do.
 *
 * A browser sets `Content-Length` itself from the body it was given and a page
 * cannot make it lie — so a request whose declared length disagrees with its
 * bytes is a hand-rolled client, and that is exactly the client the pre-read
 * check exists for.
 */
const aPutRequestDeclaring = (input: { readonly token: string; readonly length: number; readonly body: Uint8Array }) =>
  new Request(`http://localhost/admin/media/upload?token=${encodeURIComponent(input.token)}`, {
    method: EXPECTED_UPLOAD_REQUEST.method,
    headers: {
      'Content-Type': EXPECTED_UPLOAD_REQUEST.contentType,
      'Content-Length': String(input.length),
    },
    body: new Uint8Array(input.body),
  })

/**
 * `RequestInit` plus the field the Fetch standard requires for a streaming
 * body. Node refuses a `ReadableStream` body without it ("duplex option is
 * required when sending a body"), and the DOM library this repository compiles
 * against does not declare it.
 */
interface StreamingRequestInit extends RequestInit {
  /** The only value the standard defines, and the only one Node accepts. */
  readonly duplex: 'half'
}

/**
 * A PUT whose body is a STREAM, which is what a chunked client is.
 *
 * No browser sends one for an upload — a page's `fetch` is handed a `File` and
 * the browser sets `Content-Length` from it — so this models a hand-rolled
 * client deliberately. It is the one shape the pre-read `Content-Length` check
 * cannot see at all: there is no length to declare, `Number(null)` is `0`, and
 * the post-read weighing is the only cap the request ever meets. `duplex` is
 * required by the Fetch standard for a streaming body and is not optional.
 */
const aChunkedPutRequest = (input: { readonly token: string; readonly body: Uint8Array }): Request => {
  // Declared rather than cast (§3.1): the DOM `RequestInit` TypeScript ships
  // here predates the field, and an interface that ADDS it is checkable where
  // an `as` would only be asserted. Passing it as a variable rather than as a
  // literal is what keeps excess-property checking from rejecting it.
  const init: StreamingRequestInit = {
    method: EXPECTED_UPLOAD_REQUEST.method,
    headers: { 'Content-Type': EXPECTED_UPLOAD_REQUEST.contentType },
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(input.body))
        controller.close()
      },
    }),
    duplex: 'half',
  }
  return new Request(`http://localhost/admin/media/upload?token=${encodeURIComponent(input.token)}`, init)
}

describe('receiveLocalUpload', () => {
  it('writes the bytes to the key the token names', async () => {
    const { storage } = await aTempStore()
    const token = aToken()

    const received = await receiveLocalUpload(aPutRequest({ token, body: new Uint8Array([1, 2, 3]) }), deps(storage))

    expect(received).toEqual({ ok: true, value: { key: KEY } })
    expect(await storage.get(KEY)).toEqual({ ok: true, value: new Uint8Array([1, 2, 3]) })
  })

  it('writes to the key inside the token, not to one named in the URL', async () => {
    // The key is a signed claim, so a client that adds its own cannot redirect
    // the write. Without this the URL would be a write-anywhere primitive.
    const { storage } = await aTempStore()
    const token = aToken()
    const request = new Request(
      `http://localhost/admin/media/upload?key=staging/j/elsewhere.jpg&token=${encodeURIComponent(token)}`,
      { method: 'PUT', body: new Uint8Array([9]) },
    )

    const received = await receiveLocalUpload(request, deps(storage))

    expect(received).toEqual({ ok: true, value: { key: KEY } })
    expect(await storage.exists('staging/j/elsewhere.jpg')).toBe(false)
  })

  it('accepts a body of exactly the byte cap the token carries', async () => {
    const { storage } = await aTempStore()
    const token = aToken({ maxBytes: 3 })

    const received = await receiveLocalUpload(aPutRequest({ token, body: new Uint8Array([1, 2, 3]) }), deps(storage))

    expect(received).toEqual({ ok: true, value: { key: KEY } })
  })

  it('refuses a body larger than the token allows, and writes nothing', async () => {
    // The cap is enforced HERE and not only in the slot plan: the plan is what
    // the client was TOLD, and a client is not what enforces a cap. This
    // request declares no length at all, so only the post-read weighing can
    // catch it.
    const { storage } = await aTempStore()
    const token = aToken({ maxBytes: 2 })

    const received = await receiveLocalUpload(aPutRequest({ token, body: new Uint8Array([1, 2, 3]) }), deps(storage))

    expect(received).toEqual({ ok: false, error: 'too-large' })
    expect(await storage.exists(KEY)).toBe(false)
  })

  it('refuses a declared length over the cap before it has read a byte', async () => {
    // THE BODY IS WELL UNDER THE CAP, deliberately. A body over it would be
    // refused by the post-read weighing too, so this case would pass with the
    // header check deleted - which is a case that proves nothing. Only a
    // request whose DECLARED length is the sole thing over the cap can tell
    // the two checks apart, and the mutation that deletes the header check
    // fails here and nowhere else.
    const { storage } = await aTempStore()
    const token = aToken({ maxBytes: 100 })

    const received = await receiveLocalUpload(
      aPutRequestDeclaring({ token, length: 5_000_000, body: new Uint8Array([1, 2, 3]) }),
      deps(storage),
    )

    expect(received).toEqual({ ok: false, error: 'too-large' })
    expect(await storage.exists(KEY)).toBe(false)
  })

  it('accepts a declared length of exactly the cap', async () => {
    const { storage } = await aTempStore()
    const token = aToken({ maxBytes: 3 })

    const received = await receiveLocalUpload(
      aPutRequestDeclaring({ token, length: 3, body: new Uint8Array([1, 2, 3]) }),
      deps(storage),
    )

    expect(received).toEqual({ ok: true, value: { key: KEY } })
  })

  it('refuses a body over the cap even when the declared length is under it', async () => {
    // A `Content-Length` is a claim. Believing it would make the cap something
    // the client sets for itself, which is the whole reason both checks exist.
    const { storage } = await aTempStore()
    const token = aToken({ maxBytes: 2 })

    const received = await receiveLocalUpload(
      aPutRequestDeclaring({ token, length: 1, body: new Uint8Array([1, 2, 3]) }),
      deps(storage),
    )

    expect(received).toEqual({ ok: false, error: 'too-large' })
    expect(await storage.exists(KEY)).toBe(false)
  })

  it('refuses an oversized body from a chunked client, which declares no length for the pre-read check to read', async () => {
    // THE CLAIM THIS CASE CORRECTS: the header check was described as "the
    // check that stops a 50MB body being buffered before it is refused". A
    // chunked client sends no `Content-Length` at all, so it walks past that
    // check and the whole body is buffered before the cap applies. The cap
    // still holds - which is what is asserted here - but it is the post-read
    // weighing that holds it, alone. See this module's header.
    const { storage } = await aTempStore()
    const token = aToken({ maxBytes: 2 })
    const request = aChunkedPutRequest({ token, body: new Uint8Array([1, 2, 3]) })

    // Stated rather than assumed: without this the case would be about a
    // request whose shape nothing pins.
    expect(request.headers.get('content-length')).toBeNull()
    const received = await receiveLocalUpload(request, deps(storage))

    expect(received).toEqual({ ok: false, error: 'too-large' })
    expect(await storage.exists(KEY)).toBe(false)
  })

  it('accepts a token at the exact instant it expires', async () => {
    const { storage } = await aTempStore()
    const token = aToken({ expiresAt: 1_000 })

    const received = await receiveLocalUpload(aPutRequest({ token, body: new Uint8Array([1]) }), deps(storage))

    expect(received).toEqual({ ok: true, value: { key: KEY } })
  })

  it('refuses an expired token, and writes nothing', async () => {
    const { storage } = await aTempStore()
    const token = aToken({ expiresAt: 500 })

    const received = await receiveLocalUpload(aPutRequest({ token, body: new Uint8Array([1]) }), deps(storage))

    expect(received).toEqual({ ok: false, error: 'expired' })
    expect(await storage.exists(KEY)).toBe(false)
  })

  it('refuses a token whose signature does not check out, and writes nothing', async () => {
    const { storage } = await aTempStore()
    const token = mintUploadToken({ key: KEY, expiresAt: 2_000, maxBytes: 100, secret: `${SECRET}x` })

    const received = await receiveLocalUpload(aPutRequest({ token, body: new Uint8Array([1]) }), deps(storage))

    expect(received).toEqual({ ok: false, error: 'bad-signature' })
    expect(await storage.exists(KEY)).toBe(false)
  })

  it('refuses a request carrying no token at all', async () => {
    const { storage } = await aTempStore()

    const received = await receiveLocalUpload(
      new Request('http://localhost/admin/media/upload', { method: 'PUT' }),
      deps(storage),
    )

    expect(received).toEqual({ ok: false, error: 'malformed' })
  })

  it('refuses a token for a key that escapes the namespace, even correctly signed', async () => {
    // Signed by us, so the signature checks out - and it is refused anyway.
    // Traversal is not something a capability can grant, and this refusal is
    // `malformed` rather than a store failure so it answers with the same 403
    // every other unusable token gets, never a 500 that says a write was tried.
    const { storage } = await aTempStore()
    const token = aToken({ key: '../escape.jpg' })

    const received = await receiveLocalUpload(aPutRequest({ token, body: new Uint8Array([1]) }), deps(storage))

    expect(received).toEqual({ ok: false, error: 'malformed' })
  })

  it('reports a store that REFUSED the write, rather than answering as though it had stored them', async () => {
    // A `StoragePort` written here rather than a stub of one of our modules:
    // the port is the seam an adapter plugs into, and this is an adapter that
    // refuses. `createLocalStorage` cannot produce this - it refuses only an
    // invalid key, which is already refused above - but the R2 adapter will,
    // on any network failure, and a refused write answered 204 would be an
    // upload the admin believes landed.
    const { storage } = await aTempStore()
    const refusingStore: StoragePort = { ...storage, put: () => Promise.resolve({ ok: false, error: 'refused' }) }
    const token = aToken()

    const received = await receiveLocalUpload(aPutRequest({ token, body: new Uint8Array([1]) }), {
      ...deps(storage),
      storage: refusingStore,
    })

    expect(received).toEqual({ ok: false, error: 'unwritable' })
    expect(await storage.exists(KEY)).toBe(false)
  })

  it('reports a store that cannot take the bytes rather than throwing out of the handler', async () => {
    // A key whose parent is an existing FILE. `mkdir` fails with ENOTDIR, and
    // a rejected promise here would be a 500 from a route that had already
    // decided the request was legitimate.
    const { storage } = await aTempStore()
    await storage.put('staging/j/occupied.jpg', new Uint8Array([1]), 'image/jpeg')
    const token = aToken({ key: 'staging/j/occupied.jpg/child.jpg' })

    const received = await receiveLocalUpload(aPutRequest({ token, body: new Uint8Array([1]) }), deps(storage))

    expect(received).toEqual({ ok: false, error: 'unwritable' })
  })
})
