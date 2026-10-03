/**
 * page.tsx — the `/admin/journeys/<id>` route: SCREENS.md §2.3's journey
 * editor, the largest screen in the handoff.
 *
 * ═══ WHAT THIS SCREEN IS, AND WHAT IT STILL LEAVES A HOLE FOR ═══
 *
 * Task 5 built the FRAME: the three-column grid, the page rail with its tool
 * row, the layout picker, and the journey pool. Task 6 filled the middle column
 * for a NOTES page — `NotesPane` is that whole pane, and it is a `<form>`, so it
 * carries §2.3's "Editing" eyebrow and page name itself rather than having them
 * rendered outside the element that posts. Task 7 filled the slots: `FramesPane`
 * is a frames page's whole pane, `SlotPanel` is the Notes pane's right-hand
 * column, and the journey pool's tiles place a photograph into the cell chosen
 * below. A journey with NO pages at all still meets the placeholder — there is
 * nothing to edit, and the rail's own "+ Add page" is the way out of it.
 *
 * THE CHOSEN FRAME IS AN ADDRESS TOO. `?slot=<page>:<cell>` names the cell the
 * pool fills next, set by a slot's own Replace link, and — like `?page=` — WHICH
 * cell that resolves to is `@travel-diary/domain/admin/pageSlots`'s
 * `selectedSlot` rather than this file's: it refuses a cell the selected page
 * does not draw, and a decision taken behind this file's `c8 ignore` is a
 * decision nothing measures.
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
 * components — `EditorGrid` is the frame, and it is a component rather than two
 * elements here because the measured element and the shaped one must stay
 * different ones (see its header) — `ADMIN_NAV` (@travel-diary/domain/admin/navigation),
 * `activeLayout`/`selectedPage` (@travel-diary/domain/admin/pageRail),
 * `journeyId` (@travel-diary/domain/ids), and this screen's own actions.
 */
/* c8 ignore start -- Framework passthrough with no authored logic: guard the
 * request, read the rail's data and the editor's, draw the shell around them.
 * Every decision it appears to take belongs to a module with its own suite —
 * `requireAdminSession`, `adminScope`, `readNavCounts` and `readJourneyEditor`
 * (integration-tested against a real Payload), `selectedPage` and
 * `activeLayout` (@travel-diary/domain, gated at 100%), and `PageRail`,
 * `LayoutPicker`, `JourneyPool` and `NotesPane` (jsdom). Which pane a page gets
 * is the one branch here, and it is a comparison against the `kind` column the
 * rail already draws — `readJourneyEditor.integration.test.ts` is what says that
 * column arrives. It cannot be measured by either
 * Vitest config, and it sits under a Next.js bracketed directory where
 * `@vitest/coverage-v8` does not read this hint at all — so `vitest.config.ts`
 * excludes it by exact path with that defect named, exactly as it does for
 * `(diary)/p/[n]/page.tsx`. The hint is written anyway so the file says what it
 * is. Its runtime behaviour is covered in the browser by e2e/admin.spec.ts. */
import { ADMIN_NAV, type NavEntry } from '@travel-diary/domain/admin/navigation'
import { activeLayout, selectedPage } from '@travel-diary/domain/admin/pageRail'
import { heldMedia, selectedSlot } from '@travel-diary/domain/admin/pageSlots'
import { showsClipAffordances } from '@travel-diary/domain/media/ingestPolicy'
import { journeyId } from '@travel-diary/domain/ids'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type React from 'react'
import { EditorGrid } from '../../../../../components/admin/editor/EditorGrid'
import { FramesPane } from '../../../../../components/admin/editor/FramesPane'
import { JourneyPool } from '../../../../../components/admin/editor/JourneyPool'
import { LayoutPicker } from '../../../../../components/admin/editor/LayoutPicker'
import { NotesPane } from '../../../../../components/admin/editor/NotesPane'
import { PageRail } from '../../../../../components/admin/editor/PageRail'
import styles from '../../../../../components/admin/editor/editor.module.css'
import { AdminShell } from '../../../../../components/admin/shell/AdminShell'
import { adminScope } from '../../../../../lib/admin/adminScope'
import { refusalForThisRender } from '../../../../../lib/admin/formRefusalFlash'
import { env } from '../../../../../lib/env'
import { readJourneyEditor } from '../../../../../lib/admin/readJourneyEditor'
import { readNavCounts } from '../../../../../lib/admin/readNavCounts'
import { requireAdminSession } from '../../../../../lib/auth/guard'
import { getPayload } from '../../../../../lib/payload'
import {
  addPage,
  clearSlot,
  copyPage,
  deletePage,
  reorderPages,
  saveNotes,
  setPageLayout,
  setSlotFocalPoint,
  setSlotMedia,
  setSlotText,
} from './actions'

/**
 * The screen's title, and the one instruction it gives a crawler.
 *
 * `index: false` for the reason every other admin screen gives:
 * `app/robots.ts` asks a crawler not to FETCH `/admin`, while a link from
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

  const query = await searchParams
  const selected = selectedPage(view.pages, query['page'])
  const page = view.pages.find((candidate) => candidate.id === selected) ?? null
  const slots = page?.slots ?? []
  const targeted = selectedSlot(slots, query['slot'])
  // The address every Replace link builds on. `?page=` is repeated rather than
  // preserved from the request because `selectedPage` may have IGNORED what the
  // request asked for — a link built from the raw query would carry an address
  // this screen already refused.
  const editorHref = `/admin/journeys/${view.id}?page=${selected ?? ''}`

  return (
    <AdminShell
      screen={{ ...JOURNEYS, label: view.name }}
      crumb={`Journeys · ${view.place} · ${String(view.pages.length)} pages`}
      counts={counts}
      lastPublished={null}
      siteName={site.name ?? ''}
      accountName={scope.user.email}
    >
      <EditorGrid>
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

        {page === null ? (
          <div data-editing-pane className={styles.pane}>
            <p className={styles.eyebrow}>Editing</p>
            <h2 className={styles.paneName}>No pages yet</h2>
            <p className={styles.paneNote}>
              This journey holds no pages. Add one with the layout picker beside this pane.
            </p>
          </div>
        ) : page.kind === 'notes' ? (
          <NotesPane
            journey={view.id}
            title={page.title}
            notes={view.notes}
            slots={page.slots}
            editorHref={editorHref}
            targeted={targeted}
            save={saveNotes}
            setFocal={setSlotFocalPoint}
            setText={setSlotText}
            clear={clearSlot}
            refusal={await refusalForThisRender()}
          />
        ) : (
          <FramesPane
            journey={view.id}
            title={page.title}
            slots={page.slots}
            editorHref={editorHref}
            targeted={targeted}
            setFocal={setSlotFocalPoint}
            setText={setSlotText}
            clear={clearSlot}
          />
        )}

        <JourneyPool
          journey={view.id}
          items={view.pool}
          inBook={view.inBook}
          ticked={heldMedia(slots)}
          target={targeted}
          place={setSlotMedia}
          // READ ON THE SERVER AND PASSED DOWN, never `process.env` in a
          // component: design spec §9.3 puts the clip affordances behind
          // `MEDIA_PIPELINE`, and `showsClipAffordances` is the one place that
          // flag becomes a yes or a no.
          showsClips={showsClipAffordances(env.MEDIA_PIPELINE)}
          browseHref="/admin/media"
        />
      </EditorGrid>
    </AdminShell>
  )
}

export default JourneyEditorPage
/* c8 ignore stop */
