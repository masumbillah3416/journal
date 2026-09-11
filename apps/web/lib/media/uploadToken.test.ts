/**
 * uploadToken.test.ts — an upload token is a capability, so every way of
 * forging one is a case here.
 *
 * A UNIT test, not an integration one: HMAC over `node:crypto` is pure
 * computation with no I/O, so it belongs in the pre-commit gate rather than in
 * the pass that needs Docker. `SECRET` comes from `testing/uploadProbes.ts`
 * rather than from `env.PAYLOAD_SECRET`, so the Docker-free project needs no
 * real environment and the unit and integration suites sign with one value.
 *
 * Every field the signature covers has a case that edits it after signing —
 * the key, the cap and the secret — because a signature that covers only some
 * of its payload is a signature that authorises the rest.
 * Depends on: vitest, `SECRET` (./testing/uploadProbes), the module under test.
 */
import { describe, expect, it } from 'vitest'
import { SECRET } from './testing/uploadProbes'
import { mintUploadToken, verifyUploadToken } from './uploadToken'

/** One minted token, with overridable claims. */
const aToken = (
  overrides: Partial<{ key: string; expiresAt: number; maxBytes: number; secret: string }> = {},
): string => mintUploadToken({ key: 'staging/j/1-a.jpg', expiresAt: 1_000, maxBytes: 99, secret: SECRET, ...overrides })

describe('verifyUploadToken', () => {
  it('returns the key and the cap a minted token carries', () => {
    const token = aToken()

    expect(verifyUploadToken({ token, now: 500, secret: SECRET })).toEqual({
      ok: true,
      value: { key: 'staging/j/1-a.jpg', maxBytes: 99 },
    })
  })

  it('accepts a token at the exact instant it expires', () => {
    // The mirror of the case below. A boundary pinned on one side only is how
    // this repository has produced five off-by-one defects.
    const token = aToken()

    expect(verifyUploadToken({ token, now: 1_000, secret: SECRET }).ok).toBe(true)
  })

  it('refuses a token past its expiry, so a leaked URL stops working', () => {
    const token = aToken()

    expect(verifyUploadToken({ token, now: 1_001, secret: SECRET })).toEqual({ ok: false, error: 'expired' })
  })

  it('refuses a token whose key was edited after signing', () => {
    // Without the signature covering the key, the receiver would write
    // wherever the URL said - the traversal `validateStorageKey` exists for,
    // arrived at from the other side.
    const token = aToken()

    expect(verifyUploadToken({ token: token.replace('1-a.jpg', '1-b.jpg'), now: 500, secret: SECRET }).ok).toBe(false)
  })

  it('refuses a token whose byte cap was raised after signing', () => {
    const token = aToken()

    expect(verifyUploadToken({ token: token.replace('99', '99999999'), now: 500, secret: SECRET }).ok).toBe(false)
  })

  it('refuses a token whose expiry was pushed out after signing', () => {
    const token = aToken()

    expect(verifyUploadToken({ token: token.replace('1000', '9999999999'), now: 500, secret: SECRET }).ok).toBe(false)
  })

  it('refuses a token signed with a different secret', () => {
    const token = aToken()

    expect(verifyUploadToken({ token, now: 500, secret: `${SECRET}x` })).toEqual({ ok: false, error: 'bad-signature' })
  })

  it('refuses a malformed token rather than throwing', () => {
    expect(verifyUploadToken({ token: 'nonsense', now: 500, secret: SECRET })).toEqual({
      ok: false,
      error: 'malformed',
    })
  })

  it('refuses a token whose expiry is not a number, rather than reading NaN as a time', () => {
    expect(verifyUploadToken({ token: 'staging/j/1-a.jpg:soon:99:abc', now: 500, secret: SECRET })).toEqual({
      ok: false,
      error: 'malformed',
    })
  })

  it('refuses a token whose cap is not a number, rather than capping at NaN', () => {
    expect(verifyUploadToken({ token: 'staging/j/1-a.jpg:1000:lots:abc', now: 500, secret: SECRET })).toEqual({
      ok: false,
      error: 'malformed',
    })
  })

  it('refuses an empty token, which is what a URL with `?token=` alone carries', () => {
    expect(verifyUploadToken({ token: '', now: 500, secret: SECRET })).toEqual({ ok: false, error: 'malformed' })
  })

  it('refuses a token with three fields and no key at all', () => {
    // The three trailing fields are present and there is nothing in front of
    // them. A token naming no key is not a capability over anything.
    expect(verifyUploadToken({ token: '1000:99:abc', now: 500, secret: SECRET })).toEqual({
      ok: false,
      error: 'malformed',
    })
  })

  it('refuses a token whose key is empty but whose separator is there', () => {
    expect(verifyUploadToken({ token: ':1000:99:abc', now: 500, secret: SECRET })).toEqual({
      ok: false,
      error: 'malformed',
    })
  })

  it('refuses a signature of the right shape but the wrong length, rather than throwing', () => {
    // `timingSafeEqual` throws on buffers of different lengths, so the length
    // is compared first. A throw here would be a 500 where a 403 belongs.
    const token = aToken()

    expect(verifyUploadToken({ token: `${token}ff`, now: 500, secret: SECRET })).toEqual({
      ok: false,
      error: 'bad-signature',
    })
  })

  it('keeps a key containing the separator whole, so a nested key is not truncated', () => {
    const token = aToken({ key: 'staging/j/1:odd.jpg' })

    expect(verifyUploadToken({ token, now: 500, secret: SECRET })).toEqual({
      ok: true,
      value: { key: 'staging/j/1:odd.jpg', maxBytes: 99 },
    })
  })
})

describe('mintUploadToken', () => {
  it('never puts the signing secret in the token it hands out', () => {
    expect(aToken()).not.toContain(SECRET)
  })

  it('signs two different keys differently, so one token cannot stand for another slot', () => {
    expect(aToken({ key: 'staging/j/1-a.jpg' })).not.toBe(aToken({ key: 'staging/j/1-b.jpg' }))
  })
})
