/**
 * page.tsx — the `/admin` route: the bespoke admin panel's root.
 *
 * ═══ WHY THIS ROUTE EXISTS ═══
 *
 * `SCREENS.md` §3.4's signed-in pane has a primary action, "Open the admin
 * panel", and it points here. Nothing was mounted at this address — verified
 * against the BUILT route manifest, `/admin` had no entry — so a reader who
 * completed the entire sign-in journey and pressed the primary button got a
 * 404. Phase 2's final review, blocker B2. What it draws is
 * `components/admin/PanelHome.tsx`, whose header explains why this is a screen
 * rather than a redirect, and `docs/deviations.md` §44 records that the screen
 * itself is ours: the handoff describes the panel, not a panel that is not
 * built yet.
 *
 * ═══ IT IS THE FIRST SCREEN INSIDE THE SHELL ═══
 *
 * Phase 4 Task 3 built `components/admin/shell/AdminShell.tsx` — `SCREENS.md`
 * §2's rail, header and content area — and this screen is what proves it
 * draws. `PanelHome` is its children; the eleven screens after it replace the
 * children and nothing else.
 *
 * ═══ IT IS GUARDED, AND IT IS THE FIRST ROUTE HERE THAT IS NOT PART OF
 *     SIGNING IN ═══
 *
 * `requireAdminSession` runs before anything is drawn: a revoked session, an
 * expired one, an identifier naming no row and the pre-auth identifier the
 * middleware mints for anonymous browsers are all redirected to
 * `/admin/sign-in`. The call is in this file rather than inherited from a
 * layout, because this route's neighbours under `/admin/sign-in` must answer
 * to a reader who has no session at all — and because
 * `lib/auth/adminGuardRegistration.test.ts` credits no file for what another
 * one contains. `AdminShell` is a component, not a layout, for the same
 * reason: it authenticates nothing.
 *
 * THE SCOPE IS RESOLVED ONCE AND SPREAD, never resolved per call.
 * `adminScope` reads the account's row, so `...(await adminScope(session))` at
 * each operation would be one `users` lookup per operation — the N+1
 * `CLAUDE.md` §7 forbids. Two call sites follow it here — `readNavCounts` and
 * one `findGlobal` for the masthead — which is FIVE queries, because the first
 * is four `payload.count`s. `docs/api.md`'s row for this address says the same
 * two numbers; it said "three" until the Task 3 review found the two documents
 * disagreeing about what was being counted.
 *
 * WHAT THIS ROUTE DOES NOT DO. It answers `GET` only. The `POST` that
 * "Sign out" makes goes to `/admin/sign-out`, which the rail's footer and the
 * signed-in pane both post to.
 * Depends on: `requireAdminSession` (../../../lib/auth/guard), `adminScope`
 * and `readNavCounts` (../../../lib/admin/…), `getPayload`
 * (../../../lib/payload), `AdminShell` (../../../components/admin/shell/…),
 * `PanelHome` (../../../components/admin/PanelHome), `ADMIN_NAV`
 * (@travel-diary/domain/admin/navigation).
 */
/* c8 ignore start -- Framework passthrough with no authored logic: guard the
 * request, read the rail's data, draw the shell around the pane. Every
 * decision it appears to take belongs to a module with its own suite -
 * `requireAdminSession` and `adminScope` and `readNavCounts` (integration-
 * tested against a real Payload), `AdminShell` and `PanelHome` (jsdom). It
 * cannot be measured by either Vitest config (a page component needs a real
 * Next request context, and no integration test can supply one), so a per-file
 * c8 ignore is CLAUDE.md §2.1's honest treatment: like its `sign-in` siblings
 * and unlike the bracketed dynamic routes this repository has had to name by
 * path in `vitest.config.ts`, this file's path contains no `[...]` segment, so
 * the ignore hint is read and no config exclusion is needed. Its runtime
 * behaviour is covered in the browser by e2e/admin.spec.ts,
 * e2e/signInJourney.spec.ts, e2e/a11y.spec.ts and e2e/visual.spec.ts. */
import { ADMIN_NAV, type NavEntry } from '@travel-diary/domain/admin/navigation'
import type { Metadata } from 'next'
import type React from 'react'
import { PanelHome } from '../../../components/admin/PanelHome'
import { AdminShell } from '../../../components/admin/shell/AdminShell'
import { adminScope } from '../../../lib/admin/adminScope'
import { readNavCounts } from '../../../lib/admin/readNavCounts'
import { requireAdminSession } from '../../../lib/auth/guard'
import { getPayload } from '../../../lib/payload'

/**
 * The screen's title, and the one instruction it gives a crawler.
 *
 * `index: false` for the same two complementary reasons every other admin
 * screen gives: `public/robots.txt` asks a crawler not to FETCH `/admin`,
 * while a link from elsewhere could still put the address in an index.
 */
export const metadata: Metadata = {
  title: 'The back room',
  robots: { index: false, follow: false },
}

/**
 * The entry this screen is, out of the rail's own table.
 *
 * Found rather than written out, so the button that lights and the address
 * this file is served at cannot disagree. The fallback is unreachable while
 * `navigation.test.ts` holds, and exists because `noUncheckedIndexedAccess`
 * makes a lookup fallible and CLAUDE.md §0.8 bans the `!` that would hide it.
 */
const OVERVIEW: NavEntry = ADMIN_NAV.find((entry) => entry.href === '/admin') ?? {
  id: 'overview',
  label: 'Overview',
  subLabel: 'The desk',
  href: '/admin',
  section: 'overview',
}

/** Renders the admin panel's root, for a reader with a live session. */
const AdminPanelPage = async (): Promise<React.JSX.Element> => {
  // Before anything is drawn: a refusal redirects, so no part of this screen
  // is ever assembled for a request that has no live session.
  const session = await requireAdminSession()

  const scope = await adminScope(session)
  const payload = await getPayload()
  const [counts, site] = await Promise.all([
    readNavCounts(payload, scope),
    payload.findGlobal({ slug: 'site', ...scope, depth: 0, select: { name: true } }),
  ])

  return (
    <AdminShell
      screen={OVERVIEW}
      crumb="The back room"
      counts={counts}
      lastPublished={null}
      siteName={site.name ?? ''}
      accountName={scope.user.email}
    >
      <PanelHome />
    </AdminShell>
  )
}

export default AdminPanelPage
/* c8 ignore stop */
