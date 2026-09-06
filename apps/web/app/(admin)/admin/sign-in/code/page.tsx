/**
 * page.tsx — the `/admin/sign-in/code` route: SCREENS.md §3.2's one-time-code
 * step, drawn in the same shell `/admin/sign-in` draws the password step in.
 *
 * It holds no logic of its own, for the reason the password step's own page
 * gives: a Next.js page component cannot be run without a request context, so
 * anything decided here would be undecidable by any test. What the screen is
 * told comes from `lib/auth/readSignInScreen.ts` (integration-tested against a
 * real Payload) and how it is drawn from `components/admin/CodeStep.tsx`
 * (jsdom, plus `e2e/codeStep.spec.ts` in a real browser).
 *
 * ═══ THE PENDING CHALLENGE IS NOT WIRED YET, AND THAT IS VISIBLE ═══
 *
 * This screen belongs after a password has been accepted, and what it should
 * name — the masked address a code went to and the instant it was issued —
 * lives in the challenge `otpService.issueChallenge` writes and in the
 * pre-auth session the browser carries. Reading that back means the cookie
 * policy, and **Phase 2 Task 10 owns the cookie policy**, along with the
 * `Set-Cookie`, the CSRF check and the admin's CSP. So until it lands, this
 * route draws the step with `PENDING_ADDRESS_MASK` — `maskEmail`'s own
 * fallback, three bullets, which echoes nothing — and counts down from the
 * moment the document was drawn. It is the same shape of gap the password
 * step's form already has (it posts to a `404` that Task 10 mounts) and it is
 * recorded in `docs/deviations.md` §33, where the two live together.
 *
 * WHAT THAT COSTS AND WHAT IT DOES NOT. A reader who reloads sees the
 * countdown start again; nothing about the code's real life moves with it,
 * because the expiry that decides anything is `challengeState`'s, read from
 * the stored row against the server's own clock. The screen's countdown is a
 * courtesy either way — `CodeStep.tsx` says so at the refusal it makes.
 *
 * WHAT THIS ROUTE DOES NOT DO. It answers `GET` only. The two `POST`s the
 * pane makes go to `CODE_STEP_ENDPOINT` and `RESEND_ENDPOINT`, sibling routes
 * Task 10 mounts along with everything else above — a Next.js page cannot
 * answer a `POST` at its own address.
 * Depends on: `readSignInScreen` (../../../../../lib/auth/readSignInScreen),
 * `CodeStep`/`SignInShell` (../../../../../components/admin/).
 */
/* c8 ignore start -- Framework passthrough with no authored logic: read the
 * screen's content, draw the shell, draw the pane. Every decision it appears
 * to take belongs to a module with its own suite - `readSignInScreen`
 * (integration-tested against a real Payload) and `CodeStep` (jsdom), whose
 * own tests cover `PENDING_ADDRESS_MASK` and every value the pane derives.
 * It cannot be measured by either Vitest config (a page component needs a real
 * Next request context, and no integration test can supply one), so a per-file
 * c8 ignore is CLAUDE.md §2.1's honest treatment: like its `sign-in/page.tsx`
 * sibling and unlike the bracketed dynamic routes this repository has had to
 * name by path in `vitest.config.ts`, this file's path contains no `[...]`
 * segment, so the ignore hint is read and no config exclusion is needed. Its
 * runtime behaviour is covered in the browser by e2e/codeStep.spec.ts,
 * e2e/a11y.spec.ts and e2e/visual.spec.ts. */
import type { Metadata } from 'next'
import type React from 'react'
import { CodeStep, PENDING_ADDRESS_MASK } from '../../../../../components/admin/CodeStep'
import { SignInShell } from '../../../../../components/admin/SignInShell'
import { readSignInScreen } from '../../../../../lib/auth/readSignInScreen'

/**
 * The screen's title, and the one instruction it gives a crawler.
 *
 * `index: false` for the same two complementary reasons the password step
 * gives: `public/robots.txt` asks a crawler not to FETCH `/admin`, while a
 * link from elsewhere could still put the address in an index without this.
 */
export const metadata: Metadata = {
  title: 'Your code — The back room',
  robots: { index: false, follow: false },
}

/** Renders the one-time-code step of the sign-in screen. */
const CodeStepPage = async (): Promise<React.JSX.Element> => {
  const content = await readSignInScreen()

  return (
    <SignInShell book={content}>
      <CodeStep maskedAddress={PENDING_ADDRESS_MASK} issuedAt={Date.now()} attemptsSpent={0} />
    </SignInShell>
  )
}

export default CodeStepPage
/* c8 ignore stop */
