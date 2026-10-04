/**
 * readerSession.ts — whether the browser at the door already typed the
 * password.
 *
 * Pattern: none; one predicate and two constants.
 *
 * SPLIT ON `;` AND MATCHED AT THE START, NEVER SEARCHED FOR THE NAME.
 * `apps/web/lib/auth/browserSession.ts` carries the same note, and measuring
 * it here corrected what this one first said. A matcher that merely CONTAINS
 * `td-reader=` cannot be made to ADMIT anybody — the value is read from a
 * fixed offset, so a prefixed name yields a string that is not the HMAC. What
 * it can do is find `not-td-reader=junk` FIRST and never reach the real
 * cookie behind it, which locks a legitimate reader out of a diary by setting
 * a cookie on it. The attack is denial, not entry, and the case named
 * `admits a legitimate cookie that follows one an attacker named to shadow
 * it` is what holds it.
 *
 * AN UNSET COLUMN ADMITS NOBODY. A book closed with no password stored is
 * refused here as well as in `setReaderSetting`, because two guards over one
 * property are what keep a future write path from reopening it — and this one
 * is the guard that runs on every page of the book rather than on a write.
 *
 * THERE IS NO EXPIRY AND NO SESSION ROW. A reader is evicted by the author
 * saving a password, which redraws the salt and so changes what
 * {@link cookieValueFor} derives. That is the whole mechanism; see
 * `apps/web/lib/readerPassword.ts`.
 */
import { bookIsGated } from './bookAccess'
import { cookieValueFor } from './readerPassword'

/** The cookie a reader who typed the password carries. */
export const READER_COOKIE = 'td-reader'

/** Where a stranger is sent when the book is closed. */
export const UNLOCK_PATH = '/unlock'

/**
 * Whether this request may read the closed book.
 *
 * @param cookieHeader - The request's raw `Cookie` header, or `null`.
 * @param stored - `site.readerPasswordHash`, or `null` when unset.
 * @returns `true` only when the cookie carries exactly what `stored` derives.
 * @example
 * if (!readerIsAdmitted(headers.get('cookie'), stored)) redirect(UNLOCK_PATH)
 */
export const readerIsAdmitted = (cookieHeader: string | null, stored: string | null): boolean => {
  if (stored === null || stored === '') return false

  const carried = (cookieHeader ?? '')
    .split(';')
    .map((pair) => pair.trim())
    .find((pair) => pair.startsWith(`${READER_COOKIE}=`))

  if (carried === undefined) return false

  const value = carried.slice(READER_COOKIE.length + 1)
  // AN EMPTY VALUE IS NOT A MATCH, and it would not be one anyway — an HMAC
  // is never the empty string. Said out loud because a browser sends
  // `td-reader=` for a cookie the author cleared, and "the name is present"
  // is not "the value is right".
  return value !== '' && value === cookieValueFor(stored)
}

/** What {@link readerMustUnlock} needs of `readPublicAccess`'s answer. */
export interface ReaderGate {
  /** `SCREENS.md` §2.9's "password the whole book". */
  readonly passwordProtect: boolean
  /** `site.readerPasswordHash`, or `null` when no password is set. */
  readonly readerPasswordHash: string | null
}

/**
 * Whether this request has to type the password before it may read.
 *
 * ONE PREDICATE FOR ALL FOUR DOORS. Three page entries and the gallery
 * download route each gate the closed book, and a check written at three of
 * them is the one-sided boundary this repository keeps finding. They differ
 * in what they DO about it — a page redirects, a route handler answers 401 —
 * and not in what they ask.
 *
 * @param gate - The two columns, from `readPublicAccess`.
 * @param cookieHeader - The request's raw `Cookie` header, or `null`.
 * @returns `true` when the book is closed to this request.
 * @example
 * if (readerMustUnlock(access, (await headers()).get('cookie'))) redirect(UNLOCK_PATH)
 */
export const readerMustUnlock = (gate: ReaderGate, cookieHeader: string | null): boolean =>
  // `bookIsGated` RATHER THAN READING THE COLUMN HERE, so "the book is closed"
  // has one definition and `bookAccess.ts` keeps it. Reading
  // `gate.passwordProtect` directly would leave that function with no caller
  // and two places to change the day closing means something else.
  bookIsGated(gate) && !readerIsAdmitted(cookieHeader, gate.readerPasswordHash)
