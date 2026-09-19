/**
 * page.tsx — the `/admin/journeys/<id>` route: SCREENS.md §2.3's journey
 * editor, the largest screen in the handoff.
 *
 * ═══ WHAT THIS TASK BUILDS, AND WHAT IT LEAVES A HOLE FOR ═══
 *
 * Task 5 is the FRAME: the three-column grid, the page rail with its tool row,
 * the layout picker, and the journey pool. The middle column's editing pane —
 * the notes fields, the highlights, the slots and the focal point — is Tasks 6
 * and 7. It prints the selected page's name here, which is §2.3's own "Editing"
 * eyebrow over the page name, so the grid it sits in is the real one rather
 * than a placeholder the next task has to unpick.
 *
 * ═══ IT IS GUARDED IN THIS FILE ═══
 *
 * `requireAdminSession` runs before anything is drawn, in this file rather than
 * inherited from a layout, because `lib/auth/adminGuardRegistration.test.ts`
 * credits no file for what another one contains.
 *
 * THE SCOPE IS RESOLVED ONCE AND SPREAD, never resolved per call: `adminScope`
 * reads the account's row, so `...(await adminScope(session))` at each
 * operation would be one `users` lookup per operation. Three call sites follow
 * it — `readNavCounts` (four `payload.count`s), one `findGlobal` for the
 * masthead, and `readJourneyEditor` (three queries). EIGHT queries for the
 * whole screen, whatever the number of pages or photographs.
 *
 * THE SELECTED PAGE IS AN ADDRESS, NOT STATE. `?page=<id>` survives a reload,
 * can be sent to somebody, and ships no JavaScript — the same argument the
 * journeys screen's chips carry. WHICH page that resolves to is
 * `@travel-diary/domain/admin/pageRail`'s `selectedPage`, not this file's: it
 * refuses an id this journey does not hold, and a decision taken behind this
 * file's `c8 ignore` is a decision nothing measures.
 *
 * A MISSING, MALFORMED OR TRASHED ADDRESS IS A 404. `readJourneyEditor`
 * answers `null` for all three, and `notFound()` is what `/admin/journeys/999`
 * should meet rather than a stack trace.
 *
 * THE TITLE IS THE JOURNEY'S NAME, which is why the shell is handed the
 * Journeys nav entry with its label replaced: the rail's Journeys button still
 * lights (the entry's `href` is what decides that), and the header prints what
 * the author is editing rather than the word "Journeys" twice.
 * Depends on: `requireAdminSession` (../../../../../lib/auth/guard),
 * `adminScope`, `readNavCounts`, `readJourneyEditor`
 * (../../../../../lib/admin/…), `getPayload` (../../../../../lib/payload),
 * `AdminShell` (../../../../../components/admin/shell/AdminShell), the editor
 * components, `ADMIN_NAV` (@travel-diary/domain/admin/navigation),
 * `activeLayout`/`selectedPage` (@travel-diary/domain/admin/pageRail),
 * `journeyId` (@travel-diary/domain/ids), and this screen's own five actions.
 */
/* c8 ignore start -- Framework passthrough with no authored logic: guard the
 * request, read the rail's data and the editor's, draw the shell around them.
 * Every decision it appears to take belongs to a module with its own suite —
 * `requireAdminSession`, `adminScope`, `readNavCounts` and `readJourneyEditor`
 * (integration-tested against a real Payload), `selectedPage` and
 * `activeLayout` (@travel-diary/domain, gated at 100%), and `PageRail`,
 * `LayoutPicker` and `JourneyPool` (jsdom). It cannot be measured by either
 * Vitest config, and it sits under a Next.js bracketed directory where
 * `@vitest/coverage-v8` does not read this hint at all — so `vitest.config.ts`
 * excludes it by exact path with that defect named, exactly as it does for
 * `(diary)/p/[n]/page.tsx`. The hint is written anyway so the file says what it
 * is. Its runtime behaviour is covered in the browser by e2e/admin.spec.ts. */
import { ADMIN_NAV, type NavEntry } from '@travel-diary/domain/admin/navigation'
import { activeLayout, selectedPage } from '@travel-diary/domain/admin/pageRail'
import { journeyId } from '@travel-diary/domain/ids'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type React from 'react'
import { JourneyPool } from '../../../../../components/admin/editor/JourneyPool'
import { LayoutPicker } from '../../../../../components/admin/editor/LayoutPicker'
import { PageRail } from '../../../../../components/admin/editor/PageRail'
import styles from '../../../../../components/admin/editor/editor.module.css'
import { AdminShell } from '../../../../../components/admin/shell/AdminShell'
import { adminScope } from '../../../../../lib/admin/adminScope'
import { readJourneyEditor } from '../../../../../lib/admin/readJourneyEditor'
import { readNavCounts } from '../../../../../lib/admin/readNavCounts'
import { requireAdminSession } from '../../../../../lib/auth/guard'
import { getPayload } from '../../../../../lib/payload'
import { addPage, copyPage, deletePage, reorderPages, setPageLayout } from './actions'

/**
 * The screen's title, and the one instruction it gives a crawler.
 *
 * `index: false` for the reason every other admin screen gives:
 * `public/robots.txt` asks a crawler not to FETCH `/admin`, while a link from
 * elsewhere could still put the address in an index.
 */
export const metadata: Metadata = {
  title: 'Journey editor',
  robots: { index: false, follow: false },
}

/**
 * The rail entry this screen belongs to.
 *
 * Found rather than written out, so the button that lights and the section
 * colour cannot disagree with the address. The fallback is unreachable while
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

/** What Next.js hands this route segment's page component. */
interface JourneyEditorPageProps {
  /** The address's `[id]` segment, already parsed. */
  readonly params: Promise<{ readonly id: string }>
  /** The address's query string, already parsed. */
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>
}

/** Renders the journey editor, for a reader with a live session. */
const JourneyEditorPage = async ({ params, searchParams }: JourneyEditorPageProps): Promise<React.JSX.Element> => {
  // Before anything is drawn: a refusal redirects, so no part of this screen is
  // ever assembled for a request that has no live session.
  const session = await requireAdminSession()

  const scope = await adminScope(session)
  const payload = await getPayload()
  const branded = journeyId((await params).id)
  if (!branded.ok) notFound()

  const [counts, site, view] = await Promise.all([
    readNavCounts(payload, scope),
    payload.findGlobal({ slug: 'site', ...scope, depth: 0, select: { name: true } }),
    readJourneyEditor(payload, scope, branded.value),
  ])
  if (view === null) notFound()

  const selected = selectedPage(view.pages, (await searchParams)['page'])
  const page = view.pages.find((candidate) => candidate.id === selected) ?? null

  return (
    <AdminShell
      screen={{ ...JOURNEYS, label: view.name }}
      crumb={`Journeys · ${view.place} · ${String(view.pages.length)} pages`}
      counts={counts}
      lastPublished={null}
      siteName={site.name ?? ''}
      accountName={scope.user.email}
    >
      <section data-journey-editor className={styles.screen}>
        {/* The grid is a CHILD of the measured element, because an element is
         * not matched by its own container query — `editor.module.css` says so
         * at length, and `docs/qa/2026-09-19-journey-editor-sweep.md`'s
         * EDITOR-003 is what a screen looks like when it is not. */}
        <div data-editor-grid className={styles.grid}>
          <div className={styles.leftColumn}>
            <PageRail
              journey={view.id}
              journeyName={view.name}
              pages={view.pages}
              selected={selected}
              reorder={reorderPages}
              copy={copyPage}
              remove={deletePage}
            />
            {page === null ? null : (
              <LayoutPicker
                journey={view.id}
                page={page.id}
                active={activeLayout(page)}
                setLayout={setPageLayout}
                addPage={addPage}
              />
            )}
          </div>

          <div data-editing-pane className={styles.pane}>
            <p className={styles.eyebrow}>Editing</p>
            <h2 className={styles.paneName}>{page?.title ?? 'No pages yet'}</h2>
            <p className={styles.paneNote}>
              The fields for this page arrive with the next task. The rail beside it adds, copies, reorders and removes
              pages now.
            </p>
          </div>

          <JourneyPool items={view.pool} inBook={view.inBook} browseHref="/admin/media" />
        </div>
      </section>
    </AdminShell>
  )
}

export default JourneyEditorPage
/* c8 ignore stop */
