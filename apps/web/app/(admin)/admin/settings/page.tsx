/**
 * page.tsx — the `/admin/settings` route: SCREENS.md §2.9, the screen that
 * decides what the site is called and what a reader is allowed.
 *
 * ═══ IT IS GUARDED IN THIS FILE ═══
 *
 * `requireAdminSession` runs before anything is drawn, in this file rather
 * than inherited from a layout, because `lib/auth/adminGuardRegistration.test.ts`
 * credits no file for what another one contains.
 *
 * THE SCOPE IS RESOLVED ONCE AND SPREAD, never resolved per call. `adminScope`
 * reads the account's row, so `...(await adminScope(session))` at each
 * operation would be one `users` lookup per operation — the N+1 CLAUDE.md §6
 * forbids. Three call sites follow it: `readNavCounts` (four `payload.count`s),
 * one `findGlobal` for the masthead, and `readSettingsScreen` (two queries).
 * SEVEN queries for the whole screen, whatever the diary holds.
 *
 * ═══ THE MASTHEAD'S NAME IS READ TWICE, AND THAT IS NOT A DUPLICATE ═══
 *
 * `AdminShell` wants the site's name for the rail, and this screen's own card
 * wants all four site fields. They come from the same global and are read in
 * one statement each; the masthead's read is `readNavCounts`'s neighbour on
 * every admin screen, and collapsing them here would make this screen's query
 * count different from every other screen's for no gain anybody can see.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. A guard, a read and three
 * cards.
 * Depends on: `requireAdminSession` (../../../../lib/auth/guard), `adminScope`,
 * `readNavCounts` and `readSettingsScreen` (../../../../lib/admin/…),
 * `getPayload` (../../../../lib/payload), `AdminShell`
 * (../../../../components/admin/shell/AdminShell), `SiteCard`/`MaterialCard`/
 * `ReadersCard` (../../../../components/admin/settings/), `ADMIN_NAV`
 * (@travel-diary/domain/admin/navigation), and this screen's three actions.
 */
/* c8 ignore start -- Framework passthrough with no authored logic: guard the
 * request, read the rail's data and the screen's own, draw the shell around
 * three cards. Every decision it appears to take belongs to a module with its
 * own suite — `requireAdminSession`, `adminScope`, `readNavCounts` and
 * `readSettingsScreen` (integration-tested against a real Payload) and the
 * three cards (jsdom). It cannot be measured by either Vitest config (a page
 * component needs a real Next request context, and no integration test can
 * supply one), so a per-file c8 ignore is CLAUDE.md §2.1's honest treatment —
 * the same one every other admin screen carries, and this file is NOT under a
 * bracketed directory, so the hint is read. Its runtime behaviour is covered
 * in the browser by e2e/admin.spec.ts and e2e/a11y.spec.ts. IT IS NOT IN
 * e2e/visual.spec.ts: a baseline for this screen is OWED and is being taken
 * with the other screens that owe one in Task 15, so the debt stays one thing
 * (docs/deviations.md §86). */
import { ADMIN_NAV, type NavEntry } from '@travel-diary/domain/admin/navigation'
import type { Metadata } from 'next'
import type React from 'react'
import { MaterialCard } from '../../../../components/admin/settings/MaterialCard'
import { ReadersCard } from '../../../../components/admin/settings/ReadersCard'
import { SiteCard } from '../../../../components/admin/settings/SiteCard'
import styles from '../../../../components/admin/settings/settings.module.css'
import { AdminShell } from '../../../../components/admin/shell/AdminShell'
import { adminScope } from '../../../../lib/admin/adminScope'
import { refusalForThisRender } from '../../../../lib/admin/formRefusalFlash'
import { readNavCounts } from '../../../../lib/admin/readNavCounts'
import { readSettingsScreen } from '../../../../lib/admin/readSettingsScreen'
import { requireAdminSession } from '../../../../lib/auth/guard'
import { getPayload } from '../../../../lib/payload'
import { saveSite, setReaderSetting, takeBookOffline } from './actions'

/**
 * The screen's title, and the one instruction it gives a crawler.
 *
 * `index: false` for the same two complementary reasons every other admin
 * screen gives: `app/robots.ts` asks a crawler not to FETCH `/admin`, while a
 * link from elsewhere could still put the address in an index.
 */
export const metadata: Metadata = {
  title: 'Settings',
  robots: { index: false, follow: false },
}

/** Where "Export everything" points. The route, not an action — see its header. */
const EXPORT_PATH = '/admin/export'

/**
 * The entry this screen is, out of the rail's own table.
 *
 * Found rather than written out, so the button that lights and the address
 * this file is served at cannot disagree. The fallback is unreachable while
 * `navigation.test.ts` holds, and exists because `noUncheckedIndexedAccess`
 * makes a lookup fallible and CLAUDE.md §0.8 bans the `!` that would hide it.
 */
const SETTINGS: NavEntry = ADMIN_NAV.find((entry) => entry.href === '/admin/settings') ?? {
  id: 'settings',
  label: 'Settings',
  subLabel: 'Site and readers',
  href: '/admin/settings',
  section: 'settings',
}

/** Renders the Settings screen, for a reader with a live session. */
const SettingsPage = async (): Promise<React.JSX.Element> => {
  // Before anything is drawn: a refusal redirects, so no part of this screen
  // is ever assembled for a request that has no live session.
  const session = await requireAdminSession()

  const scope = await adminScope(session)
  const payload = await getPayload()
  const [counts, masthead, view] = await Promise.all([
    readNavCounts(payload, scope),
    payload.findGlobal({ slug: 'site', ...scope, depth: 0, select: { name: true } }),
    readSettingsScreen(payload, scope),
  ])

  return (
    <AdminShell
      screen={SETTINGS}
      crumb="The site and its readers"
      counts={counts}
      lastPublished={null}
      siteName={masthead.name ?? ''}
      accountName={scope.user.email}
    >
      {/* THE CONTAINER AND THE GRID ARE TWO ELEMENTS. An element cannot be
       * its own query container, so `.screen` declares the container and
       * `.columns` is what §2.9's two-column rule targets. */}
      <div data-admin-settings className={styles.screen}>
        <div className={styles.columns}>
          <div className={styles.column}>
            <SiteCard site={view.site} save={saveSite} refusal={await refusalForThisRender()} />
            <MaterialCard storage={view.storage} exportHref={EXPORT_PATH} />
          </div>
          <div className={styles.column}>
            <ReadersCard
              toggles={view.readers}
              bookIsOffline={view.bookIsOffline}
              setSetting={setReaderSetting}
              takeOffline={takeBookOffline}
            />
          </div>
        </div>
      </div>
    </AdminShell>
  )
}

export default SettingsPage
/* c8 ignore stop */
