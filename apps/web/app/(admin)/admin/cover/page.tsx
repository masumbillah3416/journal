/**
 * page.tsx — the `/admin/cover` route: SCREENS.md §2.7, the screen that decides
 * what the front of the book says and what the About page holds.
 *
 * ═══ IT IS GUARDED IN THIS FILE ═══
 *
 * `requireAdminSession` runs before anything is drawn, in this file rather than
 * inherited from a layout, because `lib/auth/adminGuardRegistration.test.ts`
 * credits no file for what another one contains.
 *
 * THE SCOPE IS RESOLVED ONCE AND SPREAD. Three call sites follow it:
 * `readNavCounts` (four `payload.count`s), one `findGlobal` for the masthead,
 * and `readCoverScreen` (four queries, three when no portrait is set). NINE
 * queries for the whole screen, whatever the size of the library.
 *
 * ═══ ONE ISLAND, AND IT IS THE PREVIEW ═══
 *
 * SCREENS.md §2.7 calls the 172x224px preview live, which means the typed value
 * and the drawn value in one render. The About card beside it is a server
 * component and one `<form>` — `lib/admin/shellShipsNoClientJs.test.ts` names
 * `CoverPreview.tsx` in its allowlist and judges `AboutCard.tsx` exactly as
 * before.
 * Depends on: `requireAdminSession` (../../../../lib/auth/guard), `adminScope`,
 * `readNavCounts` and `readCoverScreen` (../../../../lib/admin/…), `getPayload`
 * (../../../../lib/payload), `AdminShell`
 * (../../../../components/admin/shell/AdminShell), `CoverPreview`, `AboutCard`,
 * `ADMIN_NAV` (@travel-diary/domain/admin/navigation), and this screen's two
 * actions.
 */
/* c8 ignore start -- Framework passthrough with no authored logic: guard the
 * request, read the rail's data and the screen's two cards, draw the shell
 * around them. Every decision it appears to take belongs to a module with its
 * own suite — `requireAdminSession`, `adminScope`, `readNavCounts` and
 * `readCoverScreen` (integration-tested against a real Payload),
 * `fitPreviewTitleSize` (domain, 100%) and the two cards (jsdom). It cannot be
 * measured by either Vitest config, so a per-file c8 ignore is CLAUDE.md §2.1's
 * honest treatment. Its runtime behaviour is covered in the browser by
 * e2e/admin.spec.ts and e2e/a11y.spec.ts. IT IS NOT in e2e/visual.spec.ts: a
 * baseline for this screen is OWED and is being taken in Task 15 with the
 * others that owe one; `docs/deviations.md` §86 records it. */
import { ADMIN_NAV, type NavEntry } from '@travel-diary/domain/admin/navigation'
import type { Metadata } from 'next'
import type React from 'react'
import { AboutCard } from '../../../../components/admin/book/AboutCard'
import styles from '../../../../components/admin/book/book.module.css'
import { CoverPreview } from '../../../../components/admin/book/CoverPreview'
import { AdminShell } from '../../../../components/admin/shell/AdminShell'
import { adminScope } from '../../../../lib/admin/adminScope'
import { readCoverScreen } from '../../../../lib/admin/readCoverScreen'
import { readNavCounts } from '../../../../lib/admin/readNavCounts'
import { requireAdminSession } from '../../../../lib/auth/guard'
import { getPayload } from '../../../../lib/payload'
import { saveAbout, saveCover } from './actions'

/**
 * The screen's title, and the one instruction it gives a crawler.
 *
 * `index: false` for the same two complementary reasons every other admin
 * screen gives.
 */
export const metadata: Metadata = {
  title: 'Cover & About',
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
const COVER: NavEntry = ADMIN_NAV.find((entry) => entry.href === '/admin/cover') ?? {
  id: 'cover',
  label: 'Cover',
  subLabel: 'Cloth and about',
  href: '/admin/cover',
  section: 'book',
}

/** Renders the Cover & About screen, for a reader with a live session. */
const CoverPage = async (): Promise<React.JSX.Element> => {
  // Before anything is drawn: a refusal redirects, so no part of this screen is
  // ever assembled for a request that has no live session.
  const session = await requireAdminSession()

  const scope = await adminScope(session)
  const payload = await getPayload()
  const [counts, site, view] = await Promise.all([
    readNavCounts(payload, scope),
    payload.findGlobal({ slug: 'site', ...scope, depth: 0, select: { name: true } }),
    readCoverScreen(payload, scope),
  ])

  return (
    <AdminShell
      screen={COVER}
      crumb="front matter"
      counts={counts}
      lastPublished={null}
      siteName={site.name ?? ''}
      accountName={scope.user.email}
    >
      <section data-admin-cover className={styles.screenCover}>
        <CoverPreview cover={view.cover} save={saveCover} />
        <AboutCard about={view.about} save={saveAbout} />
      </section>
    </AdminShell>
  )
}

export default CoverPage
/* c8 ignore stop */
