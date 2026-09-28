/**
 * page.tsx — the `/admin/account` route: SCREENS.md §2.11, the screen that
 * decides who is keeping the diary and how they get in.
 *
 * ═══ IT IS GUARDED IN THIS FILE ═══
 *
 * `requireAdminSession` runs before anything is drawn, in this file rather than
 * inherited from a layout, because
 * `lib/auth/adminGuardRegistration.test.ts` credits no file for what another
 * one contains.
 *
 * THE SCOPE IS RESOLVED ONCE AND SPREAD, never resolved per call. `adminScope`
 * reads the account's row, so `...(await adminScope(session))` at each
 * operation would be one `users` lookup per operation — the N+1 CLAUDE.md §6
 * forbids. Three call sites follow it: `readNavCounts` (four `payload.count`s),
 * one `findGlobal` for the masthead, and `readAccountScreen` (ONE query, the
 * session list — the profile comes off the row the scope already holds).
 *
 * ═══ THE COOKIE IS READ HERE, AND ONLY HERE ═══
 *
 * `readAccountScreen` needs the identifier THIS request is carrying so the
 * session list can mark the row it came in on. `requireAdminSession` returns
 * the ACCOUNT and not the session — deliberately, since nothing else in the
 * admin needs the identifier — so this file asks `readBrowserSession` for it
 * and hands it down. Nothing below this file sees a cookie header.
 *
 * ═══ THE PASSWORD NOTICE IS IN THE ADDRESS ═══
 *
 * `changePassword` redirects here with a query rather than returning a refusal,
 * so that the whole screen re-renders on the server and this route ships no
 * client JavaScript. `passwordNotice` refuses any value this screen did not
 * write, so a hand-typed address can only ever produce one of three lines.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. A guard, a read and four cards.
 * Depends on: `requireAdminSession` (../../../../lib/auth/guard),
 * `readBrowserSession` (../../../../lib/auth/browserSession), `adminScope`,
 * `readNavCounts`, `readAccountScreen` and `passwordNotice`
 * (../../../../lib/admin/…), `getPayload` (../../../../lib/payload),
 * `AdminShell` (../../../../components/admin/shell/AdminShell), the four cards
 * (../../../../components/admin/account/), `NavEntry`
 * (@travel-diary/domain/admin/navigation), and this screen's six actions.
 */
/* c8 ignore start -- Framework passthrough with no authored logic: guard the
 * request, read the rail's data and the screen's own, draw the shell around
 * four cards. Every decision it appears to take belongs to a module with its
 * own suite — `requireAdminSession`, `readBrowserSession`, `adminScope`,
 * `readNavCounts`, `readAccountScreen` and `passwordNotice` — and it cannot be
 * measured by either Vitest config (a page component needs a real Next request
 * context, and no integration test can supply one), so a per-file c8 ignore is
 * CLAUDE.md §2.1's honest treatment, the same one every other admin screen
 * carries. Its runtime behaviour is covered in the browser by
 * e2e/admin.spec.ts and e2e/a11y.spec.ts. IT IS NOT IN e2e/visual.spec.ts: a
 * baseline for this screen is OWED and is being taken with the other screens
 * that owe one in Task 15, so the debt stays one thing
 * (docs/deviations.md §86). */
import type { NavEntry } from '@travel-diary/domain/admin/navigation'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import type React from 'react'
import { GettingInCard } from '../../../../components/admin/account/GettingInCard'
import { NotifyCard } from '../../../../components/admin/account/NotifyCard'
import { ProfileCard } from '../../../../components/admin/account/ProfileCard'
import { SessionsCard } from '../../../../components/admin/account/SessionsCard'
import styles from '../../../../components/admin/account/account.module.css'
import { AdminShell } from '../../../../components/admin/shell/AdminShell'
import { PASSWORD_NOTICE_PARAM, passwordNotice } from '../../../../lib/admin/accountMutations'
import { adminScope } from '../../../../lib/admin/adminScope'
import { readAccountScreen } from '../../../../lib/admin/readAccountScreen'
import { readNavCounts } from '../../../../lib/admin/readNavCounts'
import { readBrowserSession } from '../../../../lib/auth/browserSession'
import { requireAdminSession } from '../../../../lib/auth/guard'
import { getPayload } from '../../../../lib/payload'
import {
  changePassword,
  revokeOneSession,
  saveNotifications,
  saveProfile,
  setOtpRequired,
  signOutEverywhere,
} from './actions'

/**
 * The screen's title, and the one instruction it gives a crawler.
 *
 * `index: false` for the same two complementary reasons every other admin
 * screen gives: `app/robots.ts` asks a crawler not to FETCH `/admin`, while a
 * link from elsewhere could still put the address in an index.
 */
export const metadata: Metadata = {
  title: 'Account',
  robots: { index: false, follow: false },
}

/**
 * What this screen tells the shell it is.
 *
 * WRITTEN HERE RATHER THAN FOUND IN `ADMIN_NAV`, because Account is not in it:
 * `packages/domain/src/admin/navigation.ts`'s header says why the rail has
 * nine buttons and this is not one of them, and `NavRail.tsx`'s profile button
 * is how a reader reaches it. `AdminShell` still needs a {@link NavEntry} — it
 * is what the header's `<h1>` and the rail's `pathname` come from — and
 * `activeNavId('/admin/account')` matches nothing, so no rail button lights
 * and none carries `aria-current`. `NavRail.test.tsx` has the case.
 *
 * The `section` is `settings`, which decides nothing visible here: no bar is
 * painted for an entry that is not in the rail. It is the group Account
 * belongs to, and a value had to be chosen.
 */
const ACCOUNT: NavEntry = {
  id: 'account',
  label: 'Account',
  subLabel: 'You and your sign-in',
  href: '/admin/account',
  section: 'settings',
}

/** What Next.js hands a page whose address can carry a query. */
interface AccountPageProps {
  /** The address's query, which carries the password notice and nothing else. */
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>
}

/** Renders the Account screen, for a reader with a live session. */
const AccountPage = async ({ searchParams }: AccountPageProps): Promise<React.JSX.Element> => {
  // Before anything is drawn: a refusal redirects, so no part of this screen is
  // ever assembled for a request that has no live session.
  const session = await requireAdminSession()

  const scope = await adminScope(session)
  const payload = await getPayload()
  const carried = readBrowserSession((await headers()).get('cookie'))
  const [counts, masthead, view, query] = await Promise.all([
    readNavCounts(payload, scope),
    payload.findGlobal({ slug: 'site', ...scope, depth: 0, select: { name: true } }),
    readAccountScreen(payload, scope, carried),
    searchParams,
  ])

  return (
    <AdminShell
      screen={ACCOUNT}
      crumb="Your account"
      counts={counts}
      lastPublished={null}
      siteName={masthead.name ?? ''}
      accountName={scope.user.email}
    >
      {/* THE CONTAINER AND THE GRID ARE TWO ELEMENTS. An element cannot be its
       * own query container, so `.screen` declares the container and
       * `.columns` is what §2.11's two-column rule targets. */}
      <div data-admin-account className={styles.screen}>
        <div className={styles.columns}>
          <div className={styles.column}>
            <ProfileCard profile={view.profile} save={saveProfile} />
            <NotifyCard notifications={view.notifications} setNotification={saveNotifications} />
          </div>
          <div className={styles.column}>
            <GettingInCard
              gettingIn={view.gettingIn}
              notice={passwordNotice(query[PASSWORD_NOTICE_PARAM])}
              changePassword={changePassword}
              setOtpRequired={setOtpRequired}
            />
            <SessionsCard sessions={view.sessions} revokeOne={revokeOneSession} signOutEverywhere={signOutEverywhere} />
          </div>
        </div>
      </div>
    </AdminShell>
  )
}

export default AccountPage
/* c8 ignore stop */
