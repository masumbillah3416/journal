/**
 * readerPassword.ts — hashing, verifying and cookie derivation for the one
 * shared password a closed book asks a reader for.
 *
 * Pattern: none; three functions over `node:crypto`.
 *
 * THE SHAPE STORED IS `scrypt$<salt hex>$<key hex>`. Self-describing, so a
 * value written by an older build is still readable, and a value this
 * repository did not write fails the split and answers `false` rather than
 * throwing — a malformed column must not take the diary down.
 *
 * THE COOKIE IS AN HMAC OF THE STORED HASH, NOT THE HASH. A reader holding
 * their own cookie holds no material to attack offline, and because the salt
 * is redrawn on every write, saving a password retires every cookie already
 * in the wild. That is the whole eviction mechanism: there is no session
 * table for readers and nothing to sweep.
 *
 * INVARIANT: `PAYLOAD_SECRET` is the HMAC key. Rotating it logs every reader
 * out, which is correct and worth knowing before rotating it.
 */
import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

import { MAX_READER_PASSWORD } from '@travel-diary/domain/readerPassword'

/** `scrypt` output length, matching `apps/web/lib/auth/otpService.ts`. */
const KEY_LENGTH = 64

/** Bytes of salt drawn per write. */
const SALT_LENGTH = 16

/** The prefix naming the scheme, so a future one can be told apart. */
const SCHEME = 'scrypt'

/**
 * Derives a key, capped so a stranger cannot choose how much work we do.
 *
 * `scrypt` has no promise overload in Node's typings, so this wraps the
 * callback form rather than `promisify` — the same choice
 * `apps/web/lib/auth/otpService.ts` documents at its own derivation.
 */
const deriveKey = (plain: string, salt: Buffer): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scrypt(plain.slice(0, MAX_READER_PASSWORD), salt, KEY_LENGTH, (error, key) => {
      if (error) reject(error)
      else resolve(key)
    })
  })

/**
 * Hashes a password the author chose, for `site.readerPasswordHash`.
 *
 * @param plain - The chosen password, already judged by `readerPasswordProblem`.
 * @returns `scrypt$<salt hex>$<key hex>`, with a fresh salt each call.
 * @throws From `node:crypto`, when the platform cannot derive a key.
 */
export const hashReaderPassword = async (plain: string): Promise<string> => {
  const salt = randomBytes(SALT_LENGTH)
  const key = await deriveKey(plain, salt)
  return `${SCHEME}$${salt.toString('hex')}$${key.toString('hex')}`
}

/**
 * Whether a submitted password matches what is stored.
 *
 * @param plain - Exactly what the reader typed.
 * @param stored - The column's value.
 * @returns `false` for a wrong password AND for a stored value this
 *   repository did not write. Both mean "you may not come in"; neither throws.
 */
export const readerPasswordMatches = async (plain: string, stored: string): Promise<boolean> => {
  const [scheme, saltHex, keyHex] = stored.split('$')
  if (scheme !== SCHEME || saltHex === undefined || keyHex === undefined) return false

  const expected = Buffer.from(keyHex, 'hex')
  // LENGTH IS CHECKED BEFORE THE COMPARISON, because `timingSafeEqual` throws
  // on a length mismatch and a malformed column must answer, not raise.
  if (expected.length !== KEY_LENGTH) return false

  const derived = await deriveKey(plain, Buffer.from(saltHex, 'hex'))
  return timingSafeEqual(expected, derived)
}

/**
 * The value the reader's cookie carries for a given stored hash.
 *
 * @param stored - The column's value.
 * @returns A hex HMAC. Changes whenever the password is saved, because the
 *   salt inside `stored` changes.
 */
export const cookieValueFor = (stored: string): string =>
  createHmac('sha256', process.env.PAYLOAD_SECRET ?? '')
    .update(stored)
    .digest('hex')
