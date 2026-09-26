/**
 * page.tsx — the `/admin` route: SCREENS.md §2.1's Overview, the screen an
 * author lands on.
 *
 * ═══ WHAT THIS ROUTE USED TO BE ═══
 *
 * A holding screen, "Still being furnished", written when Phase 2's final
 * round found that `SCREENS.md` §3.4's primary action pointed at an address
 * with nothing mounted at it (blocker B2). `docs/deviations.md` §44 recorded
 * it and named its own reversal: "Phase 4, which replaces the route's body
 * with the panel `SCREENS.md` §2 describes. Nothing here is meant to survive
 * it." This is that replacement, and §44 now records that the condition is
 * met.
 *
 * ═══ THREE OF THE FOUR CARDS ARE VIEWS OF OTHER TASKS' DATA ═══
 *
 * Which is why this screen is late in the plan rather than first: "Waiting to
 * go out" is `readPendingChanges` (Task 11) — the same module `/admin/publish`
 * reads, so the two screens cannot report different sets — the stat grid is
 * counts over the collections Tasks 4 to 9 write, and "The book, live" is the
 * `book` global Task 10's cover screen edits. `readOverview` owns all of it.
 *
 * ═══ IT IS GUARDED IN THIS FILE ═══
 *
 * `requireAdminSession` runs before anything is drawn, in this file rather
 * than inherited from a layout, because `lib/auth/adminGuardRegistration.test.ts`
 * credits no file for what another one contains — and because this route
 * group's `/admin/sign-in` neighbours must answer to a reader with no session.
 *
 * THE SCOPE IS RESOLVED ONCE AND SPREAD, never resolved per call. `adminScope`
 * reads the account's row, so `...(await adminScope(session))` at each
 * operation would be one `users` lookup per operation — the N+1 CLAUDE.md §6
 * forbids. Three call sites follow it: `readNavCounts` (four `payload.count`s),
 * one `findGlobal` for the masthead, and `readOverview`
 * (`QUERIES_PER_READ`, which includes `readPendingChanges`' four and
 * `readEditions`' one). EIGHTEEN queries for the whole screen, whatever the
 * size of the diary, and `docs/api.md` carries the same two numbers.
 *
 * ═══ THE RAIL'S "LAST PUBLISHED" LINE IS FILLED HERE ═══
 *
 * Task 11's `app/(admin)/admin/publish/page.tsx` left this decision to this
 * screen in as many words: every screen before it passed `null`, and filling
 * it everywhere means reading the versions table on every screen. This screen
 * reads it anyway — "The book, live" prints the same date — so it passes the
 * value rather than a `null` the rail would draw as "never".
 *
 * ═══ REVERT IS THE PUBLISH SCREEN'S OWN ACTION, IMPORTED ═══
 *
 * §2.1's rows carry Revert and §2.8's rows carry the same one over the same
 * list, so this imports `revertOneChange` rather than declaring a second
 * write. That module now names `/admin` among the addresses its three exports
 * invalidate, because this screen lists the rows they change;
 * `publishRevalidationRegistration.test.ts` pins the set.
 *
 * ═══ ONE CLIENT ISLAND, AND IT IS A BUTTON ═══
 *
 * `components/admin/overview/CopyLink.tsx`. Everything else this screen draws
 * is server-rendered — `lib/admin/shellShipsNoClientJs.test.ts` names the
 * island in its allowlist and judges the other five files in that directory
 * exactly as before.
 * Depends on: `requireAdminSession` (../../../lib/auth/guard), `adminScope`,
 * `readNavCounts` and `readOverview` (../../../lib/admin/…), `getPayload`
 * (../../../lib/payload), `AdminShell` (../../../components/admin/shell/…),
 * the five Overview cards, `ADMIN_NAV`
 * (@travel-diary/domain/admin/navigation), `publishHeadline`
 * (@travel-diary/domain/admin/pendingChange), and `revertOneChange`.
 */
/* c8 ignore start -- Framework passthrough with no authored logic: guard the
 * request, read the rail's data and the screen's own, draw the shell around
 * the cards. Every decision it appears to take belongs to a module with its
 * own suite — `requireAdminSession`, `adminScope`, `readNavCounts` and
 * `readOverview` (integration-tested against a real Payload), `overviewStats`,
 * `prompts` and `publishHeadline` (domain, 100%) and the five cards (jsdom).
 * It cannot be measured by either Vitest config (a page component needs a real
 * Next request context, and no integration test can supply one), so a per-file
 * c8 ignore is CLAUDE.md §2.1's honest treatment — the same one
 * `app/(admin)/admin/publish/page.tsx` carries, and for the same reason. Its
 * runtime behaviour is covered in the browser by e2e/admin.spec.ts,
 * e2e/signInJourney.spec.ts and e2e/a11y.spec.ts (axe, full ruleset). It IS in
 * e2e/visual.spec.ts, but the baseline for the screen this route now draws is
 * OWED: the three `admin-panel-*` images photographed the holding screen and
 * were deleted with it, and the new ones are being taken with the other
 * screens that owe one in Task 15, under the pinned container.
 * `docs/deviations.md` §86 records it. */
import { ADMIN_NAV, type NavEntry } from '@travel-diary/domain/admin/navigation'
import { publishHeadline } from '@travel-diary/domain/admin/pendingChange'
import type { Metadata } from 'next'
import type React from 'react'
import { LatelyCard } from '../../../components/admin/overview/LatelyCard'
import { LiveBookCard } from '../../../components/admin/overview/LiveBookCard'
import { PromptsCard } from '../../../components/admin/overview/PromptsCard'
import { StatGrid } from '../../../components/admin/overview/StatGrid'
import { WaitingCard } from '../../../components/admin/overview/WaitingCard'
import styles from '../../../components/admin/overview/overview.module.css'
import { AdminShell } from '../../../components/admin/shell/AdminShell'
import { adminScope } from '../../../lib/admin/adminScope'
import { readNavCounts } from '../../../lib/admin/readNavCounts'
import { readOverview } from '../../../lib/admin/readOverview'
import { requireAdminSession } from '../../../lib/auth/guard'
import { getPayload } from '../../../lib/payload'
import { revertOneChange } from './publish/actions'

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

/** Renders SCREENS.md §2.1's Overview, for a reader with a live session. */
const AdminPanelPage = async (): Promise<React.JSX.Element> => {
  // Before anything is drawn: a refusal redirects, so no part of this screen
  // is ever assembled for a request that has no live session.
  const session = await requireAdminSession()

  const scope = await adminScope(session)
  const payload = await getPayload()
  const [counts, site, view] = await Promise.all([
    readNavCounts(payload, scope),
    payload.findGlobal({ slug: 'site', ...scope, depth: 0, select: { name: true } }),
    readOverview(payload, scope),
  ])

  return (
    <AdminShell
      screen={OVERVIEW}
      crumb={publishHeadline(view.waiting.length)}
      counts={counts}
      lastPublished={view.book.publishedAt}
      siteName={site.name ?? ''}
      accountName={scope.user.email}
    >
      <section data-admin-overview className={styles.screen}>
        <StatGrid stats={view.stats} />

        <div data-overview-columns className={styles.columns}>
          <WaitingCard changes={view.waiting} revert={revertOneChange} />

          <div className={styles.aside}>
            <LiveBookCard book={view.book} />
            <PromptsCard prompts={view.needsALook} />
          </div>
        </div>

        <LatelyCard rows={view.lately} />
      </section>
    </AdminShell>
  )
}

export default AdminPanelPage
/* c8 ignore stop */
