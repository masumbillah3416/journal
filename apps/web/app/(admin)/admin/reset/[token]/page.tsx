/**
 * page.tsx — the `/admin/reset/<token>` route: the screen the mailed reset
 * link lands on, drawn in the same shell every other sign-in state is.
 *
 * ═══ THIS IS THE ADDRESS THE RESET EMAIL HAS BEEN NAMING SINCE TASK 5 ═══
 *
 * `apps/web/lib/auth/passwordReset.ts` builds its link from `RESET_PATH`, and
 * until phase ruling F47 nothing was mounted here: the token was minted,
 * mailed and provably consumable, and the address it named answered 404 with
 * every mechanism behind it green. `apps/web/lib/auth/resetPath.test.ts` now
 * asserts a route file exists at both halves of that address, so the gap
 * cannot reopen quietly.
 *
 * It holds no logic of its own, for the reason `sign-in/page.tsx` gives, and
 * for a second reason that applies to this file in particular: its path
 * contains a Next.js dynamic-route bracket segment, where
 * `@vitest/coverage-v8`'s ignore-hint scanner is documented not to take effect
 * (CLAUDE.md §2.1, and `vitest.config.ts`'s own exclude list, which names this
 * file). A branch left here would be a branch nothing can measure, so there is
 * none: which state to draw is `lib/auth/newPasswordScreen.ts`'s
 * `readNewPasswordScreen` (integration-tested against a real Payload), the
 * rule inside it is `@travel-diary/domain/auth/resetScreen`'s
 * `newPasswordView` (gated at 100%), and how the pane is drawn is
 * `components/admin/NewPasswordStep.tsx`'s (jsdom, plus `e2e/reset.spec.ts` in
 * a real browser).
 *
 * THE TOKEN IS READ, PASSED THROUGH, AND NEVER PRINTED. It reaches the pane as
 * a prop, is rendered only as a hidden field's value, and appears in no
 * heading, message or log (CLAUDE.md §7). The screen it draws for a token that
 * cannot be spent says so without echoing it.
 *
 * WHAT THIS ROUTE DOES NOT DO. It answers `GET` only. The `POST` the form
 * makes goes to `/admin/reset/set`, a sibling route whose whole body is
 * `handleSetNewPassword` — a static segment rather than a child of this one,
 * so the token travels in the body rather than in a second URL
 * (`components/admin/NewPasswordStep.tsx`'s header).
 * Depends on: `readNewPasswordScreen` (../../../../../lib/auth/newPasswordScreen),
 * `readSignInScreen` (../../../../../lib/auth/readSignInScreen),
 * `NewPasswordStep`/`SignInShell` (../../../../../components/admin/).
 */
/* c8 ignore start -- Framework passthrough with no authored logic: await the
 * route's params and query, read which state the link is in, draw the shell,
 * draw the pane. Every decision belongs to a module with its own suite -
 * `readNewPasswordScreen` (integration, against a real Payload),
 * `newPasswordView` (@travel-diary/domain, gated at 100%) and
 * `NewPasswordStep` (jsdom). It cannot be measured by either Vitest config,
 * and this file's path contains a Next.js dynamic-route bracket segment, where
 * `@vitest/coverage-v8`'s ignore-hint scanner is documented not to take effect
 * (CLAUDE.md §2.1) - so it is ALSO named by exact path in vitest.config.ts's
 * coverage exclude, which is the treatment that actually holds here. Its
 * runtime behaviour is covered in the browser by e2e/reset.spec.ts,
 * e2e/a11y.spec.ts and e2e/visual.spec.ts. */
import type { Metadata } from 'next'
import type React from 'react'
import { NewPasswordStep } from '../../../../../components/admin/NewPasswordStep'
import { SignInShell } from '../../../../../components/admin/SignInShell'
import { readNewPasswordScreen } from '../../../../../lib/auth/newPasswordScreen'
import { readSignInScreen } from '../../../../../lib/auth/readSignInScreen'

/**
 * The screen's title, and the one instruction it gives a crawler.
 *
 * `index: false` matters more here than on any other admin screen: this
 * address carries a live credential in its path, and a crawler that indexed
 * one would publish it. `public/robots.txt` already disallows `/admin`; this
 * is the half that asks an index not to keep an address it reached some other
 * way.
 */
export const metadata: Metadata = {
  title: 'A new password — The back room',
  robots: { index: false, follow: false },
}

/** What this route reads off the address. */
interface NewPasswordPageProps {
  /** The token, as the mailed link's last path segment. */
  readonly params: Promise<{ readonly token: string }>
  /** The endpoint's own report of a refused password, when there is one. */
  readonly searchParams: Promise<{ readonly state?: string }>
}

/** Renders the screen the mailed reset link lands on. */
const NewPasswordPage = async ({ params, searchParams }: NewPasswordPageProps): Promise<React.JSX.Element> => {
  const [content, { token }, { state }] = await Promise.all([readSignInScreen(), params, searchParams])

  return (
    <SignInShell book={content}>
      <NewPasswordStep token={token} view={await readNewPasswordScreen({ token, state })} />
    </SignInShell>
  )
}

export default NewPasswordPage
/* c8 ignore stop */
