/**
 * page.tsx — the `/admin/sign-in` route: SCREENS.md §3's password step.
 *
 * It holds no logic of its own, on purpose, for the same reason
 * `p/[n]/page.tsx` and `gallery/[slug]/page.tsx` do not: a Next.js page
 * component cannot be run without a request context, so anything decided here
 * would be undecidable by any test. The two real decisions are elsewhere and
 * each has its own covered suite - what the screen is told
 * (`lib/auth/readSignInScreen.ts`, against a real Payload) and how it is drawn
 * (`components/admin/`, jsdom).
 *
 * THE ADDRESS IS NOT A CHOICE. `apps/web/payload.config.ts` moves Payload's
 * stock admin to `/cms` so this panel owns `/admin`, and `sessions.ts` scopes
 * the session cookie `Path=/admin` - RFC 6265 sends such a cookie only to
 * `/admin` and its descendants, so a sign-in screen served from anywhere else
 * would set a cookie it could not read back and the signed-in state would
 * never render.
 *
 * WHAT THIS ROUTE DOES NOT DO. It answers `GET` only. The `POST` the form
 * makes goes to `PASSWORD_STEP_ENDPOINT`, a sibling route Task 10 mounts
 * along with the `Set-Cookie`, the CSRF check and the admin's CSP - a Next.js
 * page cannot answer a `POST` at its own address, and the place the cookie is
 * set is the place the guard runs.
 * Depends on: `readSignInScreen` (../../../../lib/auth/readSignInScreen),
 * `SignInShell`/`PasswordStep` (../../../../components/admin/).
 */
/* c8 ignore start -- Framework passthrough with no authored logic: read the
 * screen's content, draw the shell, draw the pane. Every decision it appears
 * to take belongs to a module with its own suite - `readSignInScreen`
 * (integration-tested against a real Payload) and the two components (jsdom).
 * It cannot be measured by either Vitest config (a page component needs a real
 * Next request context, and no integration test can supply one), so a per-file
 * c8 ignore is CLAUDE.md §2.1's honest treatment: unlike the bracketed dynamic
 * routes this repository has had to name by path in `vitest.config.ts`, this
 * file's path contains no `[...]` segment, so the ignore hint is read and no
 * config exclusion is needed. Its runtime behaviour is covered in the browser
 * by e2e/signIn.spec.ts, e2e/a11y.spec.ts and e2e/visual.spec.ts. */
import type { Metadata } from 'next'
import type React from 'react'
import { PasswordStep } from '../../../../components/admin/PasswordStep'
import { SignInShell } from '../../../../components/admin/SignInShell'
import { readSignInScreen } from '../../../../lib/auth/readSignInScreen'

/**
 * The screen's title, and the one instruction it gives a crawler.
 *
 * `index: false` rather than nothing: `public/robots.txt` already disallows
 * `/admin`, but robots.txt asks a crawler not to FETCH a path, while a link
 * to it from elsewhere can still put the address in an index without one. The
 * two are complementary and neither replaces the other. This is not the
 * `indexGalleries` setting the site global owns (`public/robots.txt`'s own
 * header): nothing about a private sign-in door is an editorial choice.
 */
export const metadata: Metadata = {
  title: 'Sign in — The back room',
  robots: { index: false, follow: false },
}

/** Renders the password step of the sign-in screen. */
const SignInPage = async (): Promise<React.JSX.Element> => {
  const content = await readSignInScreen()

  return (
    <SignInShell book={content}>
      <PasswordStep codeStepRequired={content.codeStepRequired} />
    </SignInShell>
  )
}

export default SignInPage
/* c8 ignore stop */
