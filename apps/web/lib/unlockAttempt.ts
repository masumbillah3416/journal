/**
 * unlockAttempt.ts — what one submission of the book's password means.
 *
 * Pattern: a Result-shaped outcome (CLAUDE.md §3.3), narrow enough that the
 * route entry behind it holds no decision of its own.
 *
 * IT LIVES HERE AND NOT IN THE ROUTE BECAUSE OF WHERE TESTS CAN REACH.
 * `e2e/tsconfig.json` deliberately lists `apps/web/lib/**` and NOT
 * `apps/web/app/**` — "nothing under app/ is imported from a spec, and
 * pulling it in would typecheck React routes under a config with no JSX
 * settings". A test that imported the route to cover it would break that
 * boundary; a route that holds no logic does not need one. So the three
 * outcomes are decided here, in a module every pass already measures, and
 * `(diary)/unlock/enter/route.ts` maps them to responses.
 *
 * AN EMPTY SUBMISSION IS ITS OWN OUTCOME, not a wrong password. It is a
 * missed keystroke, it costs no `scrypt`, and telling a reader they typed the
 * wrong password when they typed nothing is a small lie the screen does not
 * need to tell.
 */
import { readerPasswordProblem } from '@travel-diary/domain/readerPassword'

import { cookieValueFor, readerPasswordMatches } from './readerPassword'

/** What one submission turned out to be. */
export type UnlockOutcome =
  /** Nothing was typed. Back to the door, with no accusation. */
  | { readonly kind: 'empty' }
  /** Something was typed and it was not the password. */
  | { readonly kind: 'wrong' }
  /** It was the password; this is what the cookie must carry. */
  | { readonly kind: 'admitted'; readonly cookieValue: string }

/**
 * Judges one submission of the reader password.
 *
 * @param plain - Exactly what was typed, untrimmed.
 * @param stored - `site.readerPasswordHash`, or `null` when none is set.
 * @returns The outcome, with the cookie's value when it is `admitted`.
 * @throws From `node:crypto`, when the platform cannot derive a key.
 * @example
 * const outcome = await attemptUnlock(typed, access.readerPasswordHash)
 */
export const attemptUnlock = async (plain: string, stored: string | null): Promise<UnlockOutcome> => {
  if (readerPasswordProblem(plain) !== null) return { kind: 'empty' }

  // `null` ONLY, AND THE EMPTY STRING DELIBERATELY NOT. A book with no
  // password stored admits nobody, but an empty column needs no branch here:
  // `readerPasswordMatches` already refuses any value that is not
  // `scrypt$salt$key`, and a mutation proved the extra `stored === ''` arm
  // could be deleted without a single test noticing. A guard no test can
  // distinguish from its absence is a line claiming to do something it does
  // not. The case `refuses everyone when the column is an empty string` still
  // pins the behaviour - one layer down, where it is real.
  if (stored === null) return { kind: 'wrong' }

  if (!(await readerPasswordMatches(plain, stored))) return { kind: 'wrong' }

  return { kind: 'admitted', cookieValue: cookieValueFor(stored) }
}
