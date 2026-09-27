/**
 * page.tsx — the `/admin/trash` route: SCREENS.md §2.10, the screen that keeps
 * a thrown-away journey for thirty days and is the only way to end one.
 *
 * ═══ IT IS GUARDED IN THIS FILE ═══
 *
 * `requireAdminSession` runs before anything is drawn, in this file rather
 * than inherited from a layout, because `lib/auth/adminGuardRegistration.test.ts`
 * credits no file for what another one contains.
 *
 * THE SCOPE IS RESOLVED ONCE AND SPREAD. Three call sites follow it:
 * `readNavCounts` (four `payload.count`s), one `findGlobal` for the masthead,
 * and `readTrashScreen` (three queries). EIGHT queries for the whole screen,
 * whatever the trash holds.
 *
 * ═══ THE CLOCK IS TAKEN HERE, ONCE ═══
 *
 * `readTrashScreen` takes `now` as an argument (CLAUDE.md §2.3), and this is
 * the one place the real clock is read — so every row of one render counts
 * down from the same instant, rather than from whenever each row happened to
 * be built. It is `Date.now()` rather than a request timestamp because Next
 * offers none and a render is not a transaction.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. A guard, a read and a card.
 * Depends on: `requireAdminSession` (../../../../lib/auth/guard), `adminScope`,
 * `readNavCounts` and `readTrashScreen` (../../../../lib/admin/…),
 * `getPayload` (../../../../lib/payload), `AdminShell`
 * (../../../../components/admin/shell/AdminShell), `TrashCard`
 * (../../../../components/admin/trash/TrashCard), `ADMIN_NAV`
 * (@travel-diary/domain/admin/navigation), and this screen's two actions.
 */
/* c8 ignore start -- Framework passthrough with no authored logic: guard the
 * request, read the rail's data and the screen's rows, draw the shell around
 * one card. Every decision it appears to take belongs to a module with its own
 * suite — `requireAdminSession`, `adminScope`, `readNavCounts` and
 * `readTrashScreen` (integration-tested against a real Payload) and
 * `TrashCard` (jsdom). It cannot be measured by either Vitest config, so a
 * per-file c8 ignore is CLAUDE.md §2.1's honest treatment, and this file is
 * NOT under a bracketed directory, so the hint is read. Its runtime behaviour
 * is covered in the browser by e2e/a11y.spec.ts, whose case for this screen
 * creates its own trashed journey and removes it again. IT NAMED
 * e2e/admin.spec.ts TOO AND THAT WAS FALSE — that file never visits
 * /admin/trash, and this file's whole-file `c8 ignore` rests on the coverage
 * this sentence claims, so the citation is corrected rather than the
 * justification stretched (Task 13 review, F8). IT IS
 * NOT IN e2e/visual.spec.ts: a baseline for this screen is OWED and is being
 * taken with the other screens that owe one in Task 15 (docs/deviations.md
 * §86). */
import { ADMIN_NAV, type NavEntry } from '@travel-diary/domain/admin/navigation'
import type { Metadata } from 'next'
import type React from 'react'
import { AdminShell } from '../../../../components/admin/shell/AdminShell'
import styles from '../../../../components/admin/settings/settings.module.css'
import { TrashCard } from '../../../../components/admin/trash/TrashCard'
import { adminScope } from '../../../../lib/admin/adminScope'
import { readNavCounts } from '../../../../lib/admin/readNavCounts'
import { readTrashScreen } from '../../../../lib/admin/readTrashScreen'
import { requireAdminSession } from '../../../../lib/auth/guard'
import { getPayload } from '../../../../lib/payload'
import { deleteJourneyForGood, putJourneyBackFromTrash } from './actions'

/**
 * The screen's title, and the one instruction it gives a crawler.
 *
 * `index: false` for the same two complementary reasons every other admin
 * screen gives: `app/robots.ts` asks a crawler not to FETCH `/admin`, while a
 * link from elsewhere could still put the address in an index.
 */
export const metadata: Metadata = {
  title: 'Trash',
  robots: { index: false, follow: false },
}

/**
 * The entry this screen is, out of the rail's own table.
 *
 * Found rather than written out, so the button that lights and the address
 * this file is served at cannot disagree. The fallback is unreachable while
 * `navigation.test.ts` holds.
 */
const TRASH: NavEntry = ADMIN_NAV.find((entry) => entry.href === '/admin/trash') ?? {
  id: 'trash',
  label: 'Trash',
  subLabel: 'Kept for thirty days',
  href: '/admin/trash',
  section: 'trash',
}

/** Renders the Trash screen, for a reader with a live session. */
const TrashPage = async (): Promise<React.JSX.Element> => {
  const session = await requireAdminSession()

  const scope = await adminScope(session)
  const payload = await getPayload()
  const [counts, masthead, rows] = await Promise.all([
    readNavCounts(payload, scope),
    payload.findGlobal({ slug: 'site', ...scope, depth: 0, select: { name: true } }),
    // ONE READING OF THE CLOCK for the whole render. See this module's header.
    readTrashScreen(payload, scope, Date.now()),
  ])

  return (
    <AdminShell
      screen={TRASH}
      crumb={`${String(rows.length)} in the trash`}
      counts={counts}
      lastPublished={null}
      siteName={masthead.name ?? ''}
      accountName={scope.user.email}
    >
      <div data-admin-trash-screen className={styles.trashScreen}>
        <TrashCard rows={rows} putBack={putJourneyBackFromTrash} deleteForGood={deleteJourneyForGood} />
      </div>
    </AdminShell>
  )
}

export default TrashPage
/* c8 ignore stop */
