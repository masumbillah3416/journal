/**
 * readerPassword.ts — what a shared reader password must look like.
 *
 * Pattern: none. Two constants and a total function; there is no state to
 * model and no port to invert.
 *
 * THE CAP IS NOT A STRENGTH RULE. `scrypt` accepts a password of any length
 * and spends proportional CPU on it, and the unlock box is reachable by any
 * stranger. 200 is far past any passphrase a family will share aloud and far
 * short of a length worth spending key derivation on.
 *
 * NOTHING HERE TRIMS. A password with a trailing space is a password with a
 * trailing space; trimming would admit a submission the author never set.
 * `trim()` appears once below and only to ask whether anything was typed at
 * all — the candidate itself is measured and returned untouched.
 */

/** The shortest a reader password may be, once it is not all whitespace. */
export const MIN_READER_PASSWORD = 1

/** The longest submission this repository will hash. */
export const MAX_READER_PASSWORD = 200

/** Why a submission cannot be used, or `null` when it can. */
export type PasswordProblem = 'empty' | 'too-long'

/**
 * Judges a submitted or chosen password.
 *
 * @param candidate - Exactly what was typed, untrimmed.
 * @returns The problem, or `null` when there is none.
 * @example
 * readerPasswordProblem('   ') // 'empty'
 * readerPasswordProblem('tokyo 2019 ') // null
 */
export const readerPasswordProblem = (candidate: string): PasswordProblem | null => {
  if (candidate.trim().length < MIN_READER_PASSWORD) return 'empty'
  if (candidate.length > MAX_READER_PASSWORD) return 'too-long'
  return null
}
