/**
 * route.ts — where the unlock form posts, and the only write a stranger may
 * make.
 *
 * Pattern: none; one `POST` handler over `apps/web/lib/readerPassword.ts`.
 *
 * A ROUTE HANDLER RATHER THAN A SERVER ACTION, AND A GUARD IS WHAT DECIDED
 * IT. Every Server Action in this repository must be built from
 * `guardedAction`, and `eslint-rules/guarded-server-actions.js` enforces that
 * over every file ESLint visits with no exemption list, deliberately — its
 * header records ten rounds of a text matcher being evaded before the check
 * was rewritten against the AST. This endpoint has to be reachable by
 * somebody with NO session, which is the one thing that rule exists to
 * forbid, so writing it as an action would have meant widening a security
 * guard to admit the first exception it had ever been asked for. A route
 * handler is a different shape with its own precedent in this tree — see
 * `(diary)/gallery/[slug]/download/[id]/route.ts`, also public, also
 * unguarded by that rule because it is not an action.
 *
 * IT IS A PLAIN HTML FORM POST, so the page needs no client JavaScript
 * (`CLAUDE.md` §6) and the flow works with scripting off entirely.
 *
 * IT IS AT `/unlock/enter`, NOT `/unlock`. Next.js refuses a `page.tsx` and a
 * `route.ts` in one segment; the page is the door and this is the latch.
 *
 * IT HOLDS NO DECISION OF ITS OWN. What a submission MEANS is decided by
 * `lib/unlockAttempt.ts`, which every test pass measures; this file turns the
 * three outcomes into a redirect and a cookie. `e2e/tsconfig.json` lists
 * `apps/web/lib/**` and deliberately not `apps/web/app/**`, so logic that
 * wants a test belongs there rather than here.
 *
 * WHAT THIS DOES NOT DO: rate-limit. `scrypt` is deliberately expensive and
 * this endpoint is reachable by anybody, so a flood of submissions is CPU a
 * stranger can spend. `docs/deviations.md` records it with its cost; the
 * repository's existing limiter is shaped around sign-in attempts per
 * account, and a reader password has no account to count against.
 */
import { pagePath } from '@travel-diary/domain/pageAddress'
import { NextResponse } from 'next/server'

import { readPublicAccess } from '../../../../lib/bookAccess'
import { READER_COOKIE, UNLOCK_PATH } from '../../../../lib/readerSession'
import { attemptUnlock } from '../../../../lib/unlockAttempt'

/** A year. The author evicts readers by saving a password, not by waiting. */
const A_YEAR_IN_SECONDS = 60 * 60 * 24 * 365

/** `303` turns the POST into a GET, so a refresh does not re-submit. */
const SEE_OTHER = 303

/**
 * Where an admitted reader lands.
 *
 * NOT `/`. This application has no root route — the diary opens at `/p/1`
 * and `/` is a 404 — so a redirect to `/` would hand a reader who just typed
 * the right password a not-found page. Found by running the app; the e2e
 * cases navigated to the book themselves after unlocking and so never looked
 * at where the button put them.
 */
const THE_BOOK = pagePath(0)

/**
 * Checks the typed password and, if it is right, remembers this browser.
 *
 * @param request - The posted form; only `password` is read.
 * @returns A `303` to the book on success, or back to the door on refusal.
 * @example
 * <form method="post" action="/unlock/enter">…</form>
 */
export const POST = async (request: Request): Promise<NextResponse> => {
  const door = new URL(UNLOCK_PATH, request.url)

  const form = await request.formData()
  const submitted = form.get('password')
  const plain = typeof submitted === 'string' ? submitted : ''

  const outcome = await attemptUnlock(plain, (await readPublicAccess()).readerPasswordHash)
  if (outcome.kind === 'empty') return NextResponse.redirect(door, SEE_OTHER)
  if (outcome.kind === 'wrong') {
    door.searchParams.set('wrong', '1')
    return NextResponse.redirect(door, SEE_OTHER)
  }

  const admitted = NextResponse.redirect(new URL(THE_BOOK, request.url), SEE_OTHER)
  admitted.cookies.set(READER_COOKIE, outcome.cookieValue, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: A_YEAR_IN_SECONDS,
  })

  return admitted
}
