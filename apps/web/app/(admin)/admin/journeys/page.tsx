/**
 * page.tsx — the `/admin/journeys` route: SCREENS.md §2.2, the list every
 * other admin screen is reached from.
 *
 * ═══ THE FIRST REAL SCREEN INSIDE THE SHELL ═══
 *
 * Phase 4 Task 3 built `components/admin/shell/AdminShell.tsx` and `/admin`
 * proved it draws; this is the first screen with data in it. The shell is the
 * children hole and nothing else, exactly as `/admin` uses it.
 *
 * ═══ IT IS GUARDED IN THIS FILE ═══
 *
 * `requireAdminSession` runs before anything is drawn, in this file rather than
 * inherited from a layout, because `lib/auth/adminGuardRegistration.test.ts`
 * credits no file for what another one contains — and because this route
 * group's `/admin/sign-in` neighbours must answer to a reader with no session.
 *
 * THE SCOPE IS RESOLVED ONCE AND SPREAD, never resolved per call. `adminScope`
 * reads the account's row, so `...(await adminScope(session))` at each
 * operation would be one `users` lookup per operation — the N+1 CLAUDE.md §7
 * forbids. Three call sites follow it here: `readNavCounts` (four
 * `payload.count`s), one `findGlobal` for the masthead, and
 * `readJourneysScreen` (four grouped queries). NINE queries for the whole
 * screen, whatever the number of journeys.
 *
 * THE SEARCH AND THE CHIP ARE `searchParams`, NOT STATE. They select something,
 * so they are addresses: they survive a reload, they can be sent to somebody,
 * and they ship no JavaScript. The two client islands this screen does buy are
 * the create panel's open state and the `⋯` disclosure — `CreatePanel.tsx` and
 * `RowActions.tsx` each say why.
 *
 * THE CRUMB DESCRIBES WHAT IS ON THE SCREEN, not the library: with a chip
 * pressed, "3 entries · 9 pages" is a true sentence about the table underneath
 * it, and it costs no query because the rows are already here.
 * Depends on: `requireAdminSession` (../../../../lib/auth/guard), `adminScope`,
 * `readNavCounts`, `readJourneysScreen` and `journeysQuery`
 * (../../../../lib/admin/…), `getPayload` (../../../../lib/payload),
 * `AdminShell` (../../../../components/admin/shell/AdminShell), the journeys
 * components, `ADMIN_NAV` (@travel-diary/domain/admin/navigation), and this
 * screen's own four actions.
 */
/* c8 ignore start -- Framework passthrough with no authored logic: guard the
 * request, read the rail's data and the screen's rows, draw the shell around
 * them. Every decision it appears to take belongs to a module with its own
 * suite — `requireAdminSession`, `adminScope`, `readNavCounts`,
 * `readJourneysScreen` and `journeysQuery` (integration-tested against a real
 * Payload), `JourneyControls`, `CreatePanel` and `JourneyTable` (jsdom). It
 * cannot be measured by either Vitest config (a page component needs a real
 * Next request context, and no integration test can supply one), so a per-file
 * c8 ignore is CLAUDE.md §2.1's honest treatment — the same one
 * `app/(admin)/admin/page.tsx` carries, and for the same reason. Its runtime
 * behaviour is covered in the browser by e2e/admin.spec.ts, e2e/a11y.spec.ts
 * and e2e/visual.spec.ts. */
import { ADMIN_NAV, type NavEntry } from '@travel-diary/domain/admin/navigation'
import type { Metadata } from 'next'
import type React from 'react'
import { CreatePanel } from '../../../../components/admin/journeys/CreatePanel'
import { JourneyControls } from '../../../../components/admin/journeys/JourneyControls'
import { JourneyTable, journeysSummary } from '../../../../components/admin/journeys/JourneyTable'
import { AdminShell } from '../../../../components/admin/shell/AdminShell'
import styles from '../../../../components/admin/journeys/journeys.module.css'
import { adminScope } from '../../../../lib/admin/adminScope'
import { journeysQuery, readJourneysScreen } from '../../../../lib/admin/readJourneysScreen'
import { readNavCounts } from '../../../../lib/admin/readNavCounts'
import { requireAdminSession } from '../../../../lib/auth/guard'
import { getPayload } from '../../../../lib/payload'
import { archiveJourney, createJourney, duplicateJourney, trashJourney } from './actions'

/**
 * The screen's title, and the one instruction it gives a crawler.
 *
 * `index: false` for the same two complementary reasons every other admin
 * screen gives: `app/robots.ts` asks a crawler not to FETCH `/admin`, while
 * a link from elsewhere could still put the address in an index.
 */
export const metadata: Metadata = {
  title: 'Journeys',
  robots: { index: false, follow: false },
}

/**
 * The entry this screen is, out of the rail's own table.
 *
 * Found rather than written out, so the button that lights and the address this
 * file is served at cannot disagree. The fallback is unreachable while
 * `navigation.test.ts` holds, and exists because `noUncheckedIndexedAccess`
 * makes a lookup fallible and CLAUDE.md §0.8 bans the `!` that would hide it.
 */
const JOURNEYS: NavEntry = ADMIN_NAV.find((entry) => entry.href === '/admin/journeys') ?? {
  id: 'journeys',
  label: 'Journeys',
  subLabel: 'Trips and pages',
  href: '/admin/journeys',
  section: 'journeys',
}

/** What Next.js hands a route segment's page component. */
interface JourneysPageProps {
  /** The address's query string, already parsed. */
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>
}

/** Renders the Journeys screen, for a reader with a live session. */
const JourneysPage = async ({ searchParams }: JourneysPageProps): Promise<React.JSX.Element> => {
  // Before anything is drawn: a refusal redirects, so no part of this screen is
  // ever assembled for a request that has no live session.
  const session = await requireAdminSession()

  const scope = await adminScope(session)
  const payload = await getPayload()
  const query = journeysQuery(await searchParams)
  const [counts, site, rows] = await Promise.all([
    readNavCounts(payload, scope),
    payload.findGlobal({ slug: 'site', ...scope, depth: 0, select: { name: true } }),
    readJourneysScreen(payload, scope, query),
  ])

  return (
    <AdminShell
      screen={JOURNEYS}
      crumb={journeysSummary(rows)}
      counts={counts}
      lastPublished={null}
      siteName={site.name ?? ''}
      accountName={scope.user.email}
    >
      <section data-admin-journeys className={styles.screen}>
        <CreatePanel create={createJourney}>
          <JourneyControls search={query.search} filter={query.filter} />
        </CreatePanel>

        <JourneyTable rows={rows} duplicate={duplicateJourney} archive={archiveJourney} trash={trashJourney} />
      </section>
    </AdminShell>
  )
}

export default JourneysPage
/* c8 ignore stop */
