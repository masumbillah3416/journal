/**
 * uploadToken — the capability an upload URL carries, minted and verified.
 *
 * ═══ A TOKEN IS A CAPABILITY, SO IT GETS A CODE'S TREATMENT ═══
 *
 * Whoever holds one can write bytes to one key in the object store without
 * ever having a session, which is the whole point: spec §9.1 forces uploads
 * direct to the bucket, because Vercel caps a request body at ~4.5MB and a
 * photograph is bigger than that. So this module follows the same three rules
 * `apps/web/lib/auth/otpService.ts` follows for a one-time code:
 *
 *   - **Constant-time comparison.** The signature is compared with
 *     `timingSafeEqual` over equal-length buffers, never with `===`.
 *   - **An expiry, always.** A token names the instant it stops working, and
 *     that instant is inside the signature. {@link UPLOAD_URL_TTL_SECONDS}
 *     is what the caller sets it from.
 *   - **Never logged.** Nothing here prints, and nothing that returns a
 *     refusal names which part was wrong to a caller that could echo it —
 *     `apps/web/lib/media/localUploadEndpoint.ts` collapses all three
 *     refusals into one 403 for the same reason `readGalleryDownload` does.
 *
 * ═══ WHY THE TOKEN IS READABLE RATHER THAN OPAQUE ═══
 *
 * `key:expiresAt:maxBytes:signature`, in plain text. An encoded blob would
 * hide nothing — the key is a staging path the client just asked for, and the
 * cap is a number the client was told — while making the one thing that
 * matters, that every field is inside the signature, impossible to see in a
 * test by editing the token and watching it be refused. That is exactly what
 * `uploadToken.test.ts` does.
 *
 * ═══ INVARIANTS A FUTURE EDIT COULD BREAK ═══
 *
 *   - **Every claim is signed.** Sign fewer fields and the unsigned ones
 *     become client-settable: an unsigned key is a write-anywhere primitive,
 *     an unsigned cap is no cap at all.
 *   - **The key is parsed from the LEFT and the fixed fields from the RIGHT.**
 *     A storage key may legitimately contain the separator, so the three
 *     trailing fields are taken off the end and everything before them is the
 *     key. Splitting from the left would truncate such a key and verify a
 *     signature over a different one.
 *   - **The signature is checked before the expiry.** An expiry read off an
 *     unverified token is a number an attacker wrote.
 *
 * PATTERN (CLAUDE.md §3.3): Result type — a forged token is a value the caller
 * must unwrap, not an exception a route handler can forget to catch.
 * Depends on: node:crypto (`createHmac`, `timingSafeEqual`); Result, err and
 * ok from `@travel-diary/domain/result`.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Result } from '@travel-diary/domain/result'
import { err, ok } from '@travel-diary/domain/result'

/** Separates the token's four fields. See the parsing invariant above. */
const FIELD_SEPARATOR = ':'

/** Why a presented token was not honoured. */
export type TokenRefusal = 'malformed' | 'expired' | 'bad-signature'

/** What a verified token authorises: one key, up to this many bytes. */
export interface UploadGrant {
  /** The one storage key these bytes may be written to. */
  readonly key: string
  /** The most bytes the receiver will accept under it. */
  readonly maxBytes: number
}

/**
 * Signs the three claims a token carries.
 * @param claims - The key, the expiry and the cap, exactly as they will be
 *   written into the token.
 * @param secret - The signing secret. Production passes `env.PAYLOAD_SECRET`,
 *   which `apps/web/lib/env.ts` validates at 32 characters or more.
 * @returns The hex signature over all three claims.
 */
const signatureOver = (claims: readonly string[], secret: string): string =>
  createHmac('sha256', secret).update(claims.join('\n')).digest('hex')

/**
 * Mints the capability an upload URL carries.
 *
 * @param input - The key the bytes may be written to, the epoch-millisecond
 *   instant the capability stops working at, the most bytes it admits, and the
 *   secret to sign with.
 * @returns The token, as `key:expiresAt:maxBytes:signature`. Safe to put in a
 *   URL's query string; never safe to log.
 * @example
 * mintUploadToken({
 *   key: 'staging/12/9f2-tokyo.jpg',
 *   expiresAt: Date.now() + UPLOAD_URL_TTL_SECONDS * 1000,
 *   maxBytes: MAX_UPLOAD_BYTES,
 *   secret: env.PAYLOAD_SECRET,
 * })
 */
export const mintUploadToken = (input: {
  readonly key: string
  readonly expiresAt: number
  readonly maxBytes: number
  readonly secret: string
}): string => {
  const claims = [input.key, String(input.expiresAt), String(input.maxBytes)]
  return [...claims, signatureOver(claims, input.secret)].join(FIELD_SEPARATOR)
}

/**
 * Reads a presented token back, or refuses it.
 *
 * @param input - The token exactly as it arrived, the current epoch
 *   millisecond, and the secret it should have been signed with.
 * @returns `ok` with what the token authorises, or `err` naming why it was
 *   refused. Never throws — a token is attacker-controlled input, so every way
 *   of failing is a value.
 * @example
 * const grant = verifyUploadToken({ token, now: Date.now(), secret: env.PAYLOAD_SECRET })
 * if (!grant.ok) return new Response(null, { status: 403 })
 */
export const verifyUploadToken = (input: {
  readonly token: string
  readonly now: number
  readonly secret: string
}): Result<UploadGrant, TokenRefusal> => {
  // Found by SEPARATOR POSITION rather than by splitting, and that is not a
  // stylistic choice. Splitting yields an array whose entries the type system
  // must treat as possibly absent, which would put three refusals in this
  // function that no input can reach - and an unreachable branch is a branch
  // no test can ever prove. Three positions and one guard cover every
  // malformed shape: too few separators, and an empty key.
  const lastSeparator = input.token.lastIndexOf(FIELD_SEPARATOR)
  const middleSeparator = input.token.lastIndexOf(FIELD_SEPARATOR, lastSeparator - 1)
  const firstSeparator = input.token.lastIndexOf(FIELD_SEPARATOR, middleSeparator - 1)
  if (firstSeparator < 1) return err('malformed')

  const key = input.token.slice(0, firstSeparator)
  const expiresAtText = input.token.slice(firstSeparator + 1, middleSeparator)
  const maxBytesText = input.token.slice(middleSeparator + 1, lastSeparator)
  const presented = input.token.slice(lastSeparator + 1)

  const expiresAt = Number(expiresAtText)
  const maxBytes = Number(maxBytesText)
  if (!Number.isInteger(expiresAt) || !Number.isInteger(maxBytes)) return err('malformed')

  const expected = signatureOver([key, expiresAtText, maxBytesText], input.secret)
  // Compared as bytes of equal length, because `timingSafeEqual` throws on a
  // length mismatch - and a throw from a route handler is a 500 where a 403
  // belongs.
  const presentedBytes = Buffer.from(presented, 'utf8')
  const expectedBytes = Buffer.from(expected, 'utf8')
  if (presentedBytes.length !== expectedBytes.length) return err('bad-signature')
  if (!timingSafeEqual(presentedBytes, expectedBytes)) return err('bad-signature')

  if (input.now > expiresAt) return err('expired')

  return ok({ key, maxBytes })
}
