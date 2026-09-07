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
 * one contains.
 *
 * WHAT THIS ROUTE DOES NOT DO. It answers `GET` only. The `POST` that
 * "Sign out and start again" makes goes to `/admin/sign-out`, which the same
 * pane's sibling on the signed-in screen posts to.
 * Depends on: `requireAdminSession` (../../../lib/auth/guard),
 * `PanelHome` (../../../components/admin/PanelHome).
 */
/* c8 ignore start -- Framework passthrough with no authored logic: guard the
 * request, draw the pane. Every decision it appears to take belongs to a
 * module with its own suite - `requireAdminSession` (integration-tested
 * against a real Payload) and `PanelHome` (jsdom). It cannot be measured by
 * either Vitest config (a page component needs a real Next request context,
 * and no integration test can supply one), so a per-file c8 ignore is
 * CLAUDE.md §2.1's honest treatment: like its `sign-in` siblings and unlike
 * the bracketed dynamic routes this repository has had to name by path in
 * `vitest.config.ts`, this file's path contains no `[...]` segment, so the
 * ignore hint is read and no config exclusion is needed. Its runtime behaviour
 * is covered in the browser by e2e/signInJourney.spec.ts, e2e/a11y.spec.ts and
 * e2e/visual.spec.ts. */
import type { Metadata } from 'next'
import type React from 'react'
import { PanelHome } from '../../../components/admin/PanelHome'
import { requireAdminSession } from '../../../lib/auth/guard'

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

/** Renders the admin panel's root, for a reader with a live session. */
const AdminPanelPage = async (): Promise<React.JSX.Element> => {
  // Before anything is drawn: a refusal redirects, so no part of this screen
  // is ever assembled for a request that has no live session.
  await requireAdminSession()

  return <PanelHome />
}

export default AdminPanelPage
/* c8 ignore stop */
