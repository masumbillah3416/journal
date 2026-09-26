/**
 * page.tsx — the `/admin/sign-in/done` route: SCREENS.md §3.4's signed-in
 * state, drawn in the same shell the other three states are.
 *
 * It holds no logic of its own, for the reason the password step's own page
 * gives: a Next.js page component cannot be run without a request context, so
 * anything decided here would be undecidable by any test. What the shell is
 * told comes from `lib/auth/readSignInScreen.ts` (integration-tested against a
 * real Payload) and how the pane is drawn from
 * `components/admin/SignedInStep.tsx` (jsdom, plus `e2e/reset.spec.ts` in a
 * real browser).
 *
 * ═══ SINCE PHASE 4 TASK 11 IT READS A COUNT, AND THAT IS §38 CLOSING ═══
 *
 * SCREENS.md §3.4's status line names how many changes are waiting.
 * `docs/deviations.md` §38 held it to a sentence with no number in it because
 * nothing before Phase 4 could compute one, and named its own reversal
 * condition. `readPendingChanges` is that count, and it is the SAME read
 * SCREENS.md §2.8's Changes card is drawn from - so the two screens cannot
 * disagree about how many things are waiting, which is the property a second
 * cheaper query would have thrown away.
 *
 * IT COSTS FOUR QUERIES ON THIS SCREEN, and they are named rather than hidden:
 * the live journeys, their latest versions, their pages and those pages'
 * latest versions, under one hoisted `adminScope`. This screen is reached once
 * per sign-in.
 *
 * ═══ IT IS GUARDED, AND THAT IS THE WHOLE OF WHAT TASK 10 CHANGED HERE ═══
 *
 * §3.4 is the state a reader reaches after signing in, and until Task 10 this
 * route drew it for anybody who asked for the address: reading the session
 * cookie means the cookie policy, and Task 10 owned the cookie policy. It now
 * calls `requireAdminSession`, which reads the identifier out of the request,
 * asks `sessions.authenticate` whether it names a LIVE row, and redirects to
 * `/admin/sign-in` when it does not. A revoked session, an expired one and the
 * pre-auth identifier this surface mints for anonymous browsers are all
 * refused — the last one matters, because it is carried in the same cookie.
 *
 * THE GUARD IS CALLED HERE RATHER THAN INHERITED FROM A LAYOUT, because this
 * route's siblings under `/admin/sign-in` are the screens a reader with NO
 * session has to be able to reach. What stops a later screen forgetting the
 * call is not a layout either: `lib/auth/adminGuardRegistration.test.ts` reads
 * every page and route mounted under `/admin` off the filesystem and fails the
 * pre-commit gate for any one that neither calls the guard nor is declared
 * public in `adminAccess.ts`.
 *
 * WHAT THIS ROUTE DOES NOT DO. It answers `GET` only. The `POST` that
 * "Sign out and start again" makes goes to `/admin/sign-out`, mounted in the
 * same task — `sessions.ts`'s `revokeSession` answers it, and revoking a
 * session requires reading the cookie that names it.
 * Depends on: `requireAdminSession` (../../../../../lib/auth/guard),
 * `readSignInScreen` (../../../../../lib/auth/readSignInScreen), `adminScope`
 * and `readPendingChanges` (../../../../../lib/admin/), `getPayload`
 * (../../../../../lib/payload),
 * `SignedInStep`/`SignInShell` (../../../../../components/admin/).
 */
/* c8 ignore start -- Framework passthrough with no authored logic: read the
 * screen's content, draw the shell, draw the pane. Every decision it appears
 * to take belongs to a module with its own suite - `readSignInScreen`
 * (integration-tested against a real Payload) and `SignedInStep` (jsdom). It
 * cannot be measured by either Vitest config (a page component needs a real
 * Next request context, and no integration test can supply one), so a per-file
 * c8 ignore is CLAUDE.md §2.1's honest treatment: like its `sign-in` siblings
 * and unlike the bracketed dynamic routes this repository has had to name by
 * path in `vitest.config.ts`, this file's path contains no `[...]` segment, so
 * the ignore hint is read and no config exclusion is needed. Its runtime
 * behaviour is covered in the browser by e2e/reset.spec.ts, e2e/a11y.spec.ts
 * and e2e/visual.spec.ts. */
import type { Metadata } from 'next'
import type React from 'react'
import { SignInShell } from '../../../../../components/admin/SignInShell'
import { SignedInStep } from '../../../../../components/admin/SignedInStep'
import { adminScope } from '../../../../../lib/admin/adminScope'
import { readPendingChanges } from '../../../../../lib/admin/readPendingChanges'
import { requireAdminSession } from '../../../../../lib/auth/guard'
import { readSignInScreen } from '../../../../../lib/auth/readSignInScreen'
import { getPayload } from '../../../../../lib/payload'

/**
 * The screen's title, and the one instruction it gives a crawler.
 *
 * `index: false` for the same two complementary reasons every other admin
 * screen gives: `app/robots.ts` asks a crawler not to FETCH `/admin`,
 * while a link from elsewhere could still put the address in an index.
 */
export const metadata: Metadata = {
  title: 'Signed in — The back room',
  robots: { index: false, follow: false },
}

/** Renders the signed-in state of the sign-in screen, for a reader who is. */
const SignedInPage = async (): Promise<React.JSX.Element> => {
  // Before anything is read or drawn: a refusal redirects, so no part of this
  // screen is ever assembled for a request that has no live session.
  const session = await requireAdminSession()

  const scope = await adminScope(session)
  const [content, waiting] = await Promise.all([readSignInScreen(), readPendingChanges(await getPayload(), scope)])

  return (
    <SignInShell book={content}>
      <SignedInStep waiting={waiting.length} />
    </SignInShell>
  )
}

export default SignedInPage
/* c8 ignore stop */
