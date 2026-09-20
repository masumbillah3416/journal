/**
 * page.tsx — the `/admin/book` route: SCREENS.md §2.6, the screen that decides
 * what order the book is in and how it behaves.
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
 * forbids. Three call sites follow it: `readNavCounts` (four `payload.count`s),
 * one `findGlobal` for the masthead, and `readBookScreen` (two queries). SEVEN
 * queries for the whole screen, whatever the size of the diary.
 *
 * ═══ ONE ISLAND, AND IT IS THE SETTINGS CARD ═══
 *
 * SCREENS.md §2.6's two sliders are controlled and their readouts follow the
 * value, which no form post reaches. The bookmark list beside it is a server
 * component whose every arrow is a `<form>`, so half this screen ships nothing
 * — `lib/admin/shellShipsNoClientJs.test.ts` names `BookSettings.tsx` in its
 * allowlist and judges `BookmarkOrder.tsx` exactly as before.
 * Depends on: `requireAdminSession` (../../../../lib/auth/guard), `adminScope`,
 * `readNavCounts` and `readBookScreen` (../../../../lib/admin/…), `getPayload`
 * (../../../../lib/payload), `AdminShell`
 * (../../../../components/admin/shell/AdminShell), `BookmarkOrder`,
 * `BookSettings`, `ADMIN_NAV` (@travel-diary/domain/admin/navigation), and this
 * screen's two actions.
 */
/* c8 ignore start -- Framework passthrough with no authored logic: guard the
 * request, read the rail's data and the screen's rows, draw the shell around
 * them. Every decision it appears to take belongs to a module with its own
 * suite — `requireAdminSession`, `adminScope`, `readNavCounts` and
 * `readBookScreen` (integration-tested against a real Payload), `moveBookmark`
 * (domain, 100%) and the two cards (jsdom). It cannot be measured by either
 * Vitest config (a page component needs a real Next request context, and no
 * integration test can supply one), so a per-file c8 ignore is CLAUDE.md §2.1's
 * honest treatment — the same one `app/(admin)/admin/galleries/page.tsx`
 * carries, and for the same reason. Its runtime behaviour is covered in the
 * browser by e2e/admin.spec.ts and e2e/a11y.spec.ts (axe, full ruleset). IT IS
 * NOT in e2e/visual.spec.ts: a baseline for this screen is OWED, and is being
 * taken with the other screens that owe one in Task 15 rather than alone, so
 * that the debt stays one thing. `docs/deviations.md` §86 records it. */
import { ADMIN_NAV, type NavEntry } from '@travel-diary/domain/admin/navigation'
import type { Metadata } from 'next'
import type React from 'react'
import { BookmarkOrder } from '../../../../components/admin/book/BookmarkOrder'
import { BookSettings } from '../../../../components/admin/book/BookSettings'
import styles from '../../../../components/admin/book/book.module.css'
import { AdminShell } from '../../../../components/admin/shell/AdminShell'
import { adminScope } from '../../../../lib/admin/adminScope'
import { readBookScreen } from '../../../../lib/admin/readBookScreen'
import { readNavCounts } from '../../../../lib/admin/readNavCounts'
import { requireAdminSession } from '../../../../lib/auth/guard'
import { getPayload } from '../../../../lib/payload'
import { saveBookSettings, saveBookmarkOrder } from './actions'

/**
 * The screen's title, and the one instruction it gives a crawler.
 *
 * `index: false` for the same two complementary reasons every other admin
 * screen gives: `public/robots.txt` asks a crawler not to FETCH `/admin`, while
 * a link from elsewhere could still put the address in an index.
 */
export const metadata: Metadata = {
  title: 'Book & bookmarks',
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
const BOOK: NavEntry = ADMIN_NAV.find((entry) => entry.href === '/admin/book') ?? {
  id: 'book',
  label: 'Book',
  subLabel: 'Bookmarks and settings',
  href: '/admin/book',
  section: 'book',
}

/** Renders the Book & bookmarks screen, for a reader with a live session. */
const BookPage = async (): Promise<React.JSX.Element> => {
  // Before anything is drawn: a refusal redirects, so no part of this screen is
  // ever assembled for a request that has no live session.
  const session = await requireAdminSession()

  const scope = await adminScope(session)
  const payload = await getPayload()
  const [counts, site, view] = await Promise.all([
    readNavCounts(payload, scope),
    payload.findGlobal({ slug: 'site', ...scope, depth: 0, select: { name: true } }),
    readBookScreen(payload, scope),
  ])

  return (
    <AdminShell
      screen={BOOK}
      crumb={`${String(view.rows.length)} bookmarks`}
      counts={counts}
      lastPublished={null}
      siteName={site.name ?? ''}
      accountName={scope.user.email}
    >
      <section data-admin-book className={styles.screen}>
        <div data-book-columns className={styles.columnsBook}>
          <BookmarkOrder rows={view.rows} arrangeable={view.arrangeable} setOrder={saveBookmarkOrder} />
          <BookSettings settings={view.settings} save={saveBookSettings} />
        </div>
      </section>
    </AdminShell>
  )
}

export default BookPage
/* c8 ignore stop */
