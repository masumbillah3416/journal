/**
 * localUploadEndpoint.integration.test.ts — the statuses the upload receiver
 * answers with, and the proof that its live wiring actually works.
 *
 * AN INTEGRATION TEST for one reason: {@link handleLocalUpload} writes through
 * the real `MEDIA_DIR` store with the real `env.PAYLOAD_SECRET`, and a wiring
 * that is only asserted about is a wiring nobody has run. The round-trip case
 * below mints its URL through the same `createLocalStorage(MEDIA_DIR).uploadUrl`
 * the app hands a browser, so **this file never names the production secret** —
 * it proves the minting and receiving halves agree by making them agree.
 *
 * The status cases drive `localUploadResponse` directly, which is where the
 * one-refusal-for-three-causes rule lives. Each of the three token refusals is
 * asserted to answer identically; a `403` that differed by cause would be the
 * enumeration oracle `readGalleryDownload` refuses to be.
 * Depends on: vitest, node:fs/promises, node:path; `MEDIA_DIR`
 * (../../collections/media); the local adapter; the probes; the module under
 * test.
 */
import { rm } from 'node:fs/promises'
import path from 'node:path'
import { userId } from '@travel-diary/domain/ids'
import { describe, expect, it } from 'vitest'
import { MEDIA_DIR } from '../../collections/media'
import { createLocalStorage } from '../adapters/local-storage'
import type { AuthenticatedSession } from '../auth/sessions'
import { handleLocalUpload, localUploadResponse } from './localUploadEndpoint'
import { EXPECTED_UPLOAD_REQUEST } from './uploadContract'
import { mintUploadToken } from './uploadToken'
import { SECRET, aPutRequest, aTempStore } from './testing/uploadProbes'

/** The live store the endpoint writes through, as the endpoint builds it. */
const liveStore = () => createLocalStorage(MEDIA_DIR)

/**
 * A session for the handler's second parameter.
 *
 * Built rather than cast: `handleLocalUpload` ignores it — the guard in the
 * route file is what requires one — and a cast here would be a cast §3.1 asks
 * to be justified for a value that needs no justifying.
 */
const aSession = (): AuthenticatedSession => {
  const built = userId('upload-endpoint-probe')
  if (!built.ok) throw new Error(built.error)
  return { user: built.value }
}

describe('localUploadResponse', () => {
  it('answers 204 with no body when the bytes were stored', async () => {
    const answered = localUploadResponse({ ok: true, value: { key: 'staging/j/1-a.jpg' } })

    expect(answered.status).toBe(204)
    expect(await answered.text()).toBe('')
  })

  it('answers 413 when the body was over the cap, so the client learns the size was the problem', () => {
    expect(localUploadResponse({ ok: false, error: 'too-large' }).status).toBe(413)
  })

  it('answers 403 for a malformed token', () => {
    expect(localUploadResponse({ ok: false, error: 'malformed' }).status).toBe(403)
  })

  it('answers 403 for an expired token, identically to a malformed one', () => {
    expect(localUploadResponse({ ok: false, error: 'expired' }).status).toBe(403)
  })

  it('answers 403 for a bad signature, identically to a malformed one', () => {
    expect(localUploadResponse({ ok: false, error: 'bad-signature' }).status).toBe(403)
  })

  it('tells the three token refusals apart in nothing a client can see', async () => {
    // The assertion the three cases above exist to make jointly: one response,
    // three causes, no way to tell which from outside.
    const answers = await Promise.all(
      (['malformed', 'expired', 'bad-signature'] as const).map(async (error) => {
        const response = localUploadResponse({ ok: false, error })
        return { status: response.status, body: await response.text(), headers: [...response.headers].sort() }
      }),
    )

    expect(new Set(answers.map((answer) => JSON.stringify(answer))).size).toBe(1)
  })

  it('answers 500 when the store could not take the bytes, because that is ours and not the client’s', () => {
    expect(localUploadResponse({ ok: false, error: 'unwritable' }).status).toBe(500)
  })

  it('never puts a body on a refusal, so no key or path can leak through one', async () => {
    const bodies = await Promise.all(
      (['malformed', 'expired', 'bad-signature', 'too-large', 'unwritable'] as const).map((error) =>
        localUploadResponse({ ok: false, error }).text(),
      ),
    )

    expect(bodies).toEqual(['', '', '', '', ''])
  })
})

describe('handleLocalUpload', () => {
  it('stores the bytes under the key a genuinely minted URL names', async () => {
    // The URL comes from the same adapter method the admin's picker is handed,
    // so the production secret is exercised without ever being named here.
    const key = `staging/upload-endpoint-probe/${String(Date.now())}-a.jpg`
    const minted = await liveStore().uploadUrl(key, {
      expiresInSeconds: 900,
      contentType: EXPECTED_UPLOAD_REQUEST.contentType,
      maxBytes: 1_000,
    })
    const url = minted.ok ? minted.value : ''

    const answered = await handleLocalUpload(
      new Request(url, {
        method: EXPECTED_UPLOAD_REQUEST.method,
        headers: { 'Content-Type': EXPECTED_UPLOAD_REQUEST.contentType },
        body: new Uint8Array([4, 5, 6]),
      }),
      aSession(),
    )

    expect(answered.status).toBe(204)
    expect(await liveStore().get(key)).toEqual({ ok: true, value: new Uint8Array([4, 5, 6]) })
    await rm(path.join(MEDIA_DIR, 'staging', 'upload-endpoint-probe'), { recursive: true, force: true })
  })

  it('refuses a token signed with anything but the configured secret', async () => {
    // The mirror of the case above: it proves the round trip passed because the
    // secrets matched, not because the receiver accepts whatever it is handed.
    const forged = mintUploadToken({
      key: 'staging/upload-endpoint-probe/forged.jpg',
      expiresAt: Date.now() + 60_000,
      maxBytes: 1_000,
      secret: SECRET,
    })

    const answered = await handleLocalUpload(aPutRequest({ token: forged, body: new Uint8Array([1]) }), aSession())

    expect(answered.status).toBe(403)
    expect(await liveStore().exists('staging/upload-endpoint-probe/forged.jpg')).toBe(false)
  })

  it('answers 413 for a body over the cap the token carries, without storing it', async () => {
    const { storage } = await aTempStore()
    const key = `staging/upload-endpoint-probe/${String(Date.now())}-big.jpg`
    const minted = await liveStore().uploadUrl(key, {
      expiresInSeconds: 900,
      contentType: EXPECTED_UPLOAD_REQUEST.contentType,
      maxBytes: 2,
    })
    const url = minted.ok ? minted.value : ''

    const answered = await handleLocalUpload(
      new Request(url, { method: EXPECTED_UPLOAD_REQUEST.method, body: new Uint8Array([1, 2, 3]) }),
      aSession(),
    )

    expect(answered.status).toBe(413)
    expect(await liveStore().exists(key)).toBe(false)
    // The temp store is untouched, which is the point: the endpoint writes
    // through `MEDIA_DIR` and nothing else.
    expect(await storage.exists(key)).toBe(false)
  })
})
