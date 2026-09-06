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
 * ═══ THE SESSION BEHIND THIS SCREEN IS NOT WIRED YET, AND THAT IS VISIBLE ═══
 *
 * §3.4 is the state a reader reaches after signing in, and knowing that they
 * have means reading the session cookie — which means the cookie policy, and
 * **Phase 2 Task 10 owns the cookie policy**, along with the `Set-Cookie`, the
 * CSRF check and the admin's CSP. So this route is mounted and unguarded: it
 * draws the screen for anybody who asks for the address. It shows nothing an
 * unauthenticated visitor could not already see — no account, no address, no
 * session, nothing but three links and a fixed line of copy — and the two
 * places it leads are guarded on their own terms rather than by this screen
 * having been reached. It is the same shape of gap `/admin/sign-in/code`
 * already has (docs/deviations.md §33), recorded in the same place.
 *
 * WHAT THAT COSTS AND WHAT IT DOES NOT. Nobody is signed in by arriving here,
 * and nothing about the admin becomes reachable through it: `/admin` itself is
 * Phase 4's, and Task 10's guard is what will refuse an unauthenticated
 * request for it. What it does mean is that the screen is a page rather than a
 * proof, until the session it describes is one the server can read.
 *
 * WHAT THIS ROUTE DOES NOT DO. It answers `GET` only. The `POST` that
 * "Sign out and start again" makes goes to `/admin/sign-out`, a route Task 10
 * mounts along with the rest — `sessions.ts`'s `revokeSession` is what will
 * answer it, and revoking a session requires reading the cookie that names it.
 * Depends on: `readSignInScreen` (../../../../../lib/auth/readSignInScreen),
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
import { readSignInScreen } from '../../../../../lib/auth/readSignInScreen'

/**
 * The screen's title, and the one instruction it gives a crawler.
 *
 * `index: false` for the same two complementary reasons every other admin
 * screen gives: `public/robots.txt` asks a crawler not to FETCH `/admin`,
 * while a link from elsewhere could still put the address in an index.
 */
export const metadata: Metadata = {
  title: 'Signed in — The back room',
  robots: { index: false, follow: false },
}

/** Renders the signed-in state of the sign-in screen. */
const SignedInPage = async (): Promise<React.JSX.Element> => {
  const content = await readSignInScreen()

  return (
    <SignInShell book={content}>
      <SignedInStep />
    </SignInShell>
  )
}

export default SignedInPage
/* c8 ignore stop */
