/**
 * page.tsx — the `/admin/reset` route: SCREENS.md §3.3's reset request, drawn
 * in the same shell `/admin/sign-in` draws the password step in.
 *
 * It holds no logic of its own, for the reason the password step's own page
 * gives: a Next.js page component cannot be run without a request context, so
 * anything decided here would be undecidable by any test. Which of §3.3's two
 * states to draw is `@travel-diary/domain/auth/resetScreen`'s
 * `resetRequestView` (gated at 100%), what the shell is told is
 * `lib/auth/readSignInScreen.ts`'s (integration-tested against a real
 * Payload), and how the pane is drawn is `components/admin/ResetStep.tsx`'s
 * (jsdom, plus `e2e/reset.spec.ts` in a real browser).
 *
 * ═══ THE ADDRESS ARRIVES ALREADY MASKED, AND IS MASKED AGAIN ANYWAY ═══
 *
 * `?sent=` is how the reset endpoint tells this screen the link went out, and
 * the value it carries is `maskEmail`'s own output — never a whole address,
 * which would put one in a URL and therefore in every access log the response
 * passes through (CLAUDE.md §7). `resetRequestView` masks whatever it is given
 * regardless, so a hand-typed address in that parameter prints as
 * `he•••@…` rather than as itself. There is no state in which this screen
 * prints an address it was not given.
 *
 * ═══ NOTHING HERE TELLS ONE ADDRESS FROM ANOTHER ═══
 *
 * `SECURITY.md` §3 requires the reset endpoint to "respond identically whether
 * or not the address exists". This route draws exactly one screen for both,
 * because it is told exactly one thing: whether a request was made. There is
 * no "no such account" state to reach, and adding one later would be the
 * enumeration oracle the whole reset path is shaped to avoid.
 *
 * WHAT THIS ROUTE DOES NOT DO. It answers `GET` only. The `POST` the pending
 * form makes goes to `RESET_REQUEST_ENDPOINT`, a sibling route Task 10 mounts
 * along with the cookie policy, the CSRF check and the admin's CSP — a Next.js
 * page cannot answer a `POST` at its own address, and until that lands this
 * screen's own form posts to a 404 exactly as the password step's does
 * (docs/deviations.md).
 * Depends on: `resetRequestView` (@travel-diary/domain/auth/resetScreen),
 * `readSignInScreen` (../../../../lib/auth/readSignInScreen),
 * `ResetStep`/`SignInShell` (../../../../components/admin/).
 */
/* c8 ignore start -- Framework passthrough with no authored logic: read the
 * screen's content, read which state the address bar asks for, draw the shell,
 * draw the pane. Every decision it appears to take belongs to a module with
 * its own suite - `resetRequestView` (@travel-diary/domain, gated at 100%),
 * `readSignInScreen` (integration-tested against a real Payload) and
 * `ResetStep` (jsdom). It cannot be measured by either Vitest config (a page
 * component needs a real Next request context, and no integration test can
 * supply one), so a per-file c8 ignore is CLAUDE.md §2.1's honest treatment:
 * like its two `sign-in` siblings and unlike the bracketed dynamic routes this
 * repository has had to name by path in `vitest.config.ts`, this file's path
 * contains no `[...]` segment, so the ignore hint is read and no config
 * exclusion is needed. Its runtime behaviour is covered in the browser by
 * e2e/reset.spec.ts, e2e/a11y.spec.ts and e2e/visual.spec.ts. */
import { resetRequestView } from '@travel-diary/domain/auth/resetScreen'
import type { Metadata } from 'next'
import type React from 'react'
import { ResetStep } from '../../../../components/admin/ResetStep'
import { SignInShell } from '../../../../components/admin/SignInShell'
import { readSignInScreen } from '../../../../lib/auth/readSignInScreen'

/**
 * The screen's title, and the one instruction it gives a crawler.
 *
 * `index: false` for the same two complementary reasons the password step
 * gives: `public/robots.txt` asks a crawler not to FETCH `/admin`, while a
 * link from elsewhere could still put the address in an index without this.
 */
export const metadata: Metadata = {
  title: 'A way back in — The back room',
  robots: { index: false, follow: false },
}

/** What this route reads off the address. */
interface ResetPageProps {
  /** The masked address the reset endpoint redirected with, when it did. */
  readonly searchParams: Promise<{ readonly sent?: string }>
}

/** Renders the reset request screen in the state the address asks for. */
const ResetPage = async ({ searchParams }: ResetPageProps): Promise<React.JSX.Element> => {
  const [content, { sent }] = await Promise.all([readSignInScreen(), searchParams])

  return (
    <SignInShell book={content}>
      <ResetStep request={resetRequestView(sent)} />
    </SignInShell>
  )
}

export default ResetPage
/* c8 ignore stop */
