/**
 * users.lockout.test.ts — the two numbers on the `users` collection that other
 * modules are written against, held to those modules rather than to prose.
 *
 * ═══ WHY THIS FILE EXISTS: SEAM S6 ═══
 *
 * `packages/domain/src/auth/rateWindow.ts` states of `SIGN_IN_WINDOW_MS` that
 * "it matches `users.lockTime`, deliberately… there is only one number for
 * them to be told", and `apps/web/collections/users.ts` writes `15 * 60_000`
 * again. Nothing asserted the equality, and both test files deliberately
 * restate their values rather than importing them — which is right for a test
 * of one module and leaves the RELATION between two modules unguarded.
 *
 * This is the exact field that has already shipped a units bug: `lockTime` is
 * milliseconds and `tokenExpiration` is seconds, and written in the seconds
 * spelling this collection asked for a cooling-off period of 900 MILLISECONDS
 * — for four phases, with the account still locking, wrong passwords still
 * refused, and only the DURATION wrong. A second number that is quietly meant
 * to equal it is the same defect waiting.
 *
 * The second relation is `ADDRESS_PASSWORD_ATTEMPT_LIMIT > maxLoginAttempts`.
 * `rateWindow.ts` chose 10 against Payload's 5 deliberately: the per-address
 * window must be looser than the lockout, so that a genuine reader meets the
 * lockout — which lifts on its own after the cooling-off period and is what
 * `SECURITY.md` §3 asks for — rather than the limiter, whose refusal
 * `signIn.ts` deliberately makes indistinguishable from a wrong password.
 * Invert the two and every locked-out reader is answered by the limiter
 * instead, and the lockout is unreachable.
 *
 * A UNIT TEST, because a collection config is a plain object: `users.ts`
 * imports only types from `payload`, so it can be read in the Docker-free
 * project and therefore inside `npm run verify`, the pre-commit gate. A guard
 * over a relation somebody could break in a one-character edit belongs on the
 * commit that breaks it.
 *
 * Depends on: vitest, @travel-diary/domain/auth/rateWindow, ./users.
 */
import { ADDRESS_PASSWORD_ATTEMPT_LIMIT, SIGN_IN_WINDOW_MS } from '@travel-diary/domain/auth/rateWindow'
import { describe, expect, it } from 'vitest'
import { Users } from './users'

/**
 * The `auth` block, narrowed from the union `CollectionConfig` declares.
 *
 * @returns The block, with the two numbers this file is about.
 * @throws When the collection declares no `auth` block at all, which would
 *   make every assertion below vacuously true.
 */
const authOf = (): {
  readonly lockTime?: number
  readonly maxLoginAttempts?: number
  readonly tokenExpiration?: number
} => {
  const auth = Users.auth
  if (auth === undefined || typeof auth !== 'object') throw new Error('the users collection declares no auth block')
  return auth
}

describe('the users collection’s lockout, against the modules written round it', () => {
  it('cools off for exactly as long as the rate-limit window slides', () => {
    // Both read from the modules that own them. A copy of either number here
    // would keep passing after the original moved, which is the whole defect.
    expect(authOf().lockTime).toBe(SIGN_IN_WINDOW_MS)
  })

  it('states that duration in milliseconds, which is the units bug this field already shipped', () => {
    // `lockTime` is MILLISECONDS and `tokenExpiration` is SECONDS — Payload's
    // API, not a typo. Written in the seconds spelling, this asked for 900ms.
    // Fifteen minutes, spelled out, so the number cannot pass for the other.
    expect(authOf().lockTime).toBe(15 * 60_000)
    expect(authOf().lockTime).not.toBe(15 * 60)
  })

  it('locks the account before the per-address window shuts, so the lockout is reachable', () => {
    // Strictly greater, not merely different: at equality a reader would meet
    // both at once and which one answered would be an ordering detail.
    const maxLoginAttempts = authOf().maxLoginAttempts
    if (maxLoginAttempts === undefined) throw new Error('the users collection sets no maxLoginAttempts')

    expect(ADDRESS_PASSWORD_ATTEMPT_LIMIT).toBeGreaterThan(maxLoginAttempts)
  })

  it('keeps the session token’s own lifetime in seconds, beside a duration in milliseconds', () => {
    // The two units sit one line apart in the same object literal. Asserting
    // the token expiry is a week says the seconds spelling is still the
    // seconds one, which is what makes the millisecond case above meaningful
    // rather than a number nobody compared.
    expect(authOf().tokenExpiration).toBe(60 * 60 * 24 * 7)
  })
})
