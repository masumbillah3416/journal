/**
 * page.tsx — the `/admin/publish` route: SCREENS.md §2.8, the screen that
 * decides what the public sees.
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
 * operation would be one `users` lookup per operation — the N+1 CLAUDE.md §6
 * forbids. Four call sites follow it: `readNavCounts` (four `payload.count`s),
 * one `findGlobal` for the masthead, `readPendingChanges` (four) and
 * `readEditions` (one). TEN queries for the whole screen, whatever the size of
 * the diary.
 *
 * ═══ THIS IS THE SCREEN THAT CAN FILL THE RAIL'S "LAST PUBLISHED" LINE ═══
 *
 * SCREENS.md §2's rail footer prints "Last published …", and every screen
 * before this one handed `AdminShell` a `null` for it, because nothing knew
 * when the book last went out. The Editions card's newest row IS that date, so
 * this screen passes it. The other screens still pass `null`; filling it
 * everywhere means reading the versions table on every screen, which is a cost
 * Task 12's Overview should decide rather than this one.
 *
 * ═══ ONE ISLAND, AND IT IS THE LEFT COLUMN ═══
 *
 * SCREENS.md §2.8's button reads "Publish 2 of 4" and its rows strike through
 * as boxes are cleared, which is the tick state and the text printed from it in
 * one render. `PublishSelection.tsx` is that; the Editions card beside it is a
 * server component whose every Restore is a `<form>`, so half this screen ships
 * nothing — `lib/admin/shellShipsNoClientJs.test.ts` names the island in its
 * allowlist and judges `EditionsCard.tsx` exactly as before.
 * Depends on: `requireAdminSession` (../../../../lib/auth/guard), `adminScope`,
 * `readNavCounts`, `readPendingChanges` and `readEditions`
 * (../../../../lib/admin/…), `getPayload` (../../../../lib/payload),
 * `AdminShell` (../../../../components/admin/shell/AdminShell),
 * `PublishSelection`, `EditionsCard`, `publishHeadline`
 * (@travel-diary/domain/admin/pendingChange), `ADMIN_NAV`
 * (@travel-diary/domain/admin/navigation), and this screen's three actions.
 */
/* c8 ignore start -- Framework passthrough with no authored logic: guard the
 * request, read the rail's data, the pending changes and the editions, draw the
 * shell around them. Every decision it appears to take belongs to a module with
 * its own suite — `requireAdminSession`, `adminScope`, `readNavCounts`,
 * `readPendingChanges` and `readEditions` (integration-tested against a real
 * Payload), `publishHeadline` (domain, 100%) and the three cards (jsdom). It
 * cannot be measured by either Vitest config (a page component needs a real
 * Next request context, and no integration test can supply one), so a per-file
 * c8 ignore is CLAUDE.md §2.1's honest treatment — the same one
 * `app/(admin)/admin/book/page.tsx` carries, and for the same reason. Its
 * runtime behaviour is covered in the browser by e2e/admin.spec.ts and
 * e2e/a11y.spec.ts (axe, full ruleset). IT IS NOT in e2e/visual.spec.ts: a
 * baseline for this screen is OWED, and is being taken with the other screens
 * that owe one in Task 15 rather than alone. `docs/deviations.md` §86 records
 * it. */
import { ADMIN_NAV, type NavEntry } from '@travel-diary/domain/admin/navigation'
import { publishHeadline } from '@travel-diary/domain/admin/pendingChange'
import type { Metadata } from 'next'
import type React from 'react'
import { EditionsCard } from '../../../../components/admin/publish/EditionsCard'
import { PublishSelection } from '../../../../components/admin/publish/PublishSelection'
import styles from '../../../../components/admin/publish/publish.module.css'
import { AdminShell } from '../../../../components/admin/shell/AdminShell'
import { adminScope } from '../../../../lib/admin/adminScope'
import { readEditions, readPendingChanges } from '../../../../lib/admin/readPendingChanges'
import { readNavCounts } from '../../../../lib/admin/readNavCounts'
import { requireAdminSession } from '../../../../lib/auth/guard'
import { getPayload } from '../../../../lib/payload'
import { publishChanges, restoreOneEdition, revertOneChange } from './actions'

/**
 * The screen's title, and the one instruction it gives a crawler.
 *
 * `index: false` for the same two complementary reasons every other admin
 * screen gives: `public/robots.txt` asks a crawler not to FETCH `/admin`, while
 * a link from elsewhere could still put the address in an index.
 */
export const metadata: Metadata = {
  title: 'Publish',
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
const PUBLISH: NavEntry = ADMIN_NAV.find((entry) => entry.href === '/admin/publish') ?? {
  id: 'publish',
  label: 'Publish',
  subLabel: 'What goes out',
  href: '/admin/publish',
  section: 'overview',
}

/** Renders the Publish screen, for a reader with a live session. */
const PublishPage = async (): Promise<React.JSX.Element> => {
  // Before anything is drawn: a refusal redirects, so no part of this screen is
  // ever assembled for a request that has no live session.
  const session = await requireAdminSession()

  const scope = await adminScope(session)
  const payload = await getPayload()
  const [counts, site, changes, editions] = await Promise.all([
    readNavCounts(payload, scope),
    payload.findGlobal({ slug: 'site', ...scope, depth: 0, select: { name: true } }),
    readPendingChanges(payload, scope),
    readEditions(payload, scope),
  ])

  return (
    <AdminShell
      screen={PUBLISH}
      crumb={publishHeadline(changes.length)}
      counts={counts}
      lastPublished={editions[0]?.at ?? null}
      siteName={site.name ?? ''}
      accountName={scope.user.email}
    >
      <section data-admin-publish className={styles.screen}>
        <div data-publish-columns className={styles.columns}>
          <PublishSelection changes={changes} publish={publishChanges} revert={revertOneChange} />
          <EditionsCard editions={editions} restore={restoreOneEdition} />
        </div>
      </section>
    </AdminShell>
  )
}

export default PublishPage
/* c8 ignore stop */
