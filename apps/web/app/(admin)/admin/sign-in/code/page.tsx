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
 * ═══ THE PENDING CHALLENGE IS WIRED, AS OF FIX ROUND 1 ═══
 *
 * The three things §3.2 prints that only a stored challenge can answer — the
 * masked address a code went to, the instant it was issued, and how many
 * guesses have been spent — come from `lib/auth/readCodeScreen.ts`, which
 * reads the challenge bound to the identifier in the cookie. For three tasks
 * they were a fixed bullet run, `Date.now()` at render, and a hard-coded zero
 * (`docs/deviations.md` §33).
 *
 * A BROWSER HOLDING NO LIVE CHALLENGE STILL GETS THE SCREEN, drawn with a
 * placeholder that echoes nothing. Refusing instead would make this route an
 * oracle for whether a given browser holds a challenge — see
 * `readCodeScreen.ts`'s header.
 *
 * ═══ IT IS DYNAMIC, AND IT WAS SILENTLY STATIC ═══
 *
 * This route rendered `○ (Static)` in a production build, so `Date.now()` was
 * evaluated ONCE at build time and every reader's countdown read 0:00 five
 * minutes after a deploy. It is invisible in development, where every request
 * re-renders, which is why three passes over this file missed it.
 * `export const dynamic = 'force-dynamic'` below is the fix;
 * `lib/auth/codeScreenRoute.test.ts` fails if it goes, and reading `cookies()`
 * would force it in any case.
 *
 * WHAT THIS ROUTE DOES NOT DO. It answers `GET` only. The two `POST`s the
 * pane makes go to `CODE_STEP_ENDPOINT` and `RESEND_ENDPOINT`, sibling routes
 * mounted in Task 10 and its fix round — a Next.js page cannot answer a `POST`
 * at its own address.
 * Depends on: `codeStepNotice` (@travel-diary/domain/auth/codeScreen),
 * `readSignInScreen` (../../../../../lib/auth/readSignInScreen),
 * `readCodeScreen` (../../../../../lib/auth/readCodeScreen),
 * `CodeStep`/`SignInShell` (../../../../../components/admin/).
 */
/* c8 ignore start -- Framework passthrough with no authored logic: read the
 * screen's content, draw the shell, draw the pane. Every decision it appears
 * to take belongs to a module with its own suite - `readSignInScreen`
 * (integration-tested against a real Payload) and `CodeStep` (jsdom), whose
 * own tests cover every value the pane derives.
 * It cannot be measured by either Vitest config (a page component needs a real
 * Next request context, and no integration test can supply one), so a per-file
 * c8 ignore is CLAUDE.md §2.1's honest treatment: like its `sign-in/page.tsx`
 * sibling and unlike the bracketed dynamic routes this repository has had to
 * name by path in `vitest.config.ts`, this file's path contains no `[...]`
 * segment, so the ignore hint is read and no config exclusion is needed. Its
 * runtime behaviour is covered in the browser by e2e/codeStep.spec.ts,
 * e2e/a11y.spec.ts and e2e/visual.spec.ts. */
import { codeStepNotice } from '@travel-diary/domain/auth/codeScreen'
import type { Metadata } from 'next'
import type React from 'react'
import { CodeStep } from '../../../../../components/admin/CodeStep'
import { SignInShell } from '../../../../../components/admin/SignInShell'
import { cookies } from 'next/headers'
import { readCodeScreen } from '../../../../../lib/auth/readCodeScreen'
import { readSignInScreen } from '../../../../../lib/auth/readSignInScreen'

/**
 * This route is rendered per request, never at build time.
 *
 * See this module's header: without it the countdown froze at the build's own
 * clock. `readCodeScreen` reads `cookies()`, which forces the same thing, so
 * this declaration is belt and braces - and it is the half a reader of the
 * file can see.
 */
export const dynamic = 'force-dynamic'

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

/** What this route reads off the address. */
interface CodeStepPageProps {
  /** The `state` the verify or resend endpoint redirected with, when it did. */
  readonly searchParams: Promise<{ readonly state?: string }>
}

/** Renders the one-time-code step of the sign-in screen. */
const CodeStepPage = async ({ searchParams }: CodeStepPageProps): Promise<React.JSX.Element> => {
  const carried = (await cookies()).toString()
  const [content, pending, { state }] = await Promise.all([
    readSignInScreen(),
    readCodeScreen(carried, Date.now()),
    searchParams,
  ])

  return (
    <SignInShell book={content}>
      <CodeStep
        maskedAddress={pending.maskedAddress}
        issuedAt={pending.issuedAt}
        attemptsSpent={pending.attemptsSpent}
        notice={codeStepNotice(state)}
      />
    </SignInShell>
  )
}

export default CodeStepPage
/* c8 ignore stop */
