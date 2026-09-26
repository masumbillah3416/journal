/**
 * page.tsx — the `/admin/media` route: SCREENS.md §2.4, the screen that drives
 * Phase 3's upload path and the library every other screen picks from.
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
 * one `findGlobal` for the masthead, and `readMediaScreen` (three grouped
 * queries). EIGHT queries for the whole screen, whatever the size of the
 * library.
 *
 * THE SEARCH AND THE CHIP ARE `searchParams`, NOT STATE, exactly as the
 * journeys screen's are: they select something, so they are addresses. They
 * are DRAWN inside `MediaGrid`, which is a client island, and that changes
 * nothing about what they are — the search is a `GET` form and each chip is an
 * `<a>`. `MediaGrid.tsx`'s header says why the row could not be split.
 *
 * ═══ THE PIPELINE IS READ HERE, ON THE SERVER ═══
 *
 * Design spec §9.3 puts "does this deployment show clip affordances" behind
 * `MEDIA_PIPELINE`, and a component that read `process.env` would be reading a
 * server value in a browser bundle. `acceptedIngestTypes` and
 * `showsClipAffordances` are both asked here and passed down, which is what
 * `JourneyPool.tsx` already does with the second of them.
 * Depends on: `requireAdminSession` (../../../../lib/auth/guard), `adminScope`,
 * `readNavCounts`, `readMediaScreen` and `mediaQuery`
 * (../../../../lib/admin/…), `getPayload` (../../../../lib/payload),
 * `AdminShell` (../../../../components/admin/shell/AdminShell), this screen's
 * three components, `ADMIN_NAV` (@travel-diary/domain/admin/navigation), the
 * ingest policy (@travel-diary/domain/media/ingestPolicy), `env`, and this
 * screen's own five actions.
 */
/* c8 ignore start -- Framework passthrough with no authored logic: guard the
 * request, read the rail's data and the screen's rows, draw the shell around
 * them. Every decision it appears to take belongs to a module with its own
 * suite — `requireAdminSession`, `adminScope`, `readNavCounts`,
 * `readMediaScreen` and `mediaQuery` (integration-tested against a real
 * Payload), `acceptedIngestTypes` and `showsClipAffordances` (domain, 100%),
 * `Dropzone`, `UploadCard` and `MediaGrid` (jsdom). It cannot be measured by
 * either Vitest config (a page component needs a real Next request context,
 * and no integration test can supply one), so a per-file c8 ignore is
 * CLAUDE.md §2.1's honest treatment — the same one
 * `app/(admin)/admin/journeys/page.tsx` carries, and for the same reason. Its
 * runtime behaviour is covered in the browser by e2e/admin.spec.ts,
 * e2e/upload.spec.ts, e2e/a11y.spec.ts and e2e/visual.spec.ts. */
import { ADMIN_NAV, type NavEntry } from '@travel-diary/domain/admin/navigation'
import { acceptedIngestTypes, showsClipAffordances } from '@travel-diary/domain/media/ingestPolicy'
import type { Metadata } from 'next'
import type React from 'react'
import { AdminShell } from '../../../../components/admin/shell/AdminShell'
import { Dropzone } from '../../../../components/admin/media/Dropzone'
import { MediaGrid } from '../../../../components/admin/media/MediaGrid'
import styles from '../../../../components/admin/media/media.module.css'
import { adminScope } from '../../../../lib/admin/adminScope'
import { mediaQuery, readMediaScreen } from '../../../../lib/admin/readMediaScreen'
import { readNavCounts } from '../../../../lib/admin/readNavCounts'
import { requireAdminSession } from '../../../../lib/auth/guard'
import { env } from '../../../../lib/env'
import { getPayload } from '../../../../lib/payload'
import { addToBook, captionMedia, finaliseUpload, moveMedia, requestUploadSlots } from './actions'

/**
 * The screen's title, and the one instruction it gives a crawler.
 *
 * `index: false` for the same two complementary reasons every other admin
 * screen gives: `app/robots.ts` asks a crawler not to FETCH `/admin`, while
 * a link from elsewhere could still put the address in an index.
 */
export const metadata: Metadata = {
  title: 'Media',
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
const MEDIA: NavEntry = ADMIN_NAV.find((entry) => entry.href === '/admin/media') ?? {
  id: 'media',
  label: 'Media',
  subLabel: 'Photographs and clips',
  href: '/admin/media',
  section: 'journeys',
}

/** What Next.js hands a route segment's page component. */
interface MediaPageProps {
  /** The address's query string, already parsed. */
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>
}

/** Renders the Media screen, for a reader with a live session. */
const MediaPage = async ({ searchParams }: MediaPageProps): Promise<React.JSX.Element> => {
  // Before anything is drawn: a refusal redirects, so no part of this screen is
  // ever assembled for a request that has no live session.
  const session = await requireAdminSession()

  const scope = await adminScope(session)
  const payload = await getPayload()
  const query = mediaQuery(await searchParams)
  const [counts, site, view] = await Promise.all([
    readNavCounts(payload, scope),
    payload.findGlobal({ slug: 'site', ...scope, depth: 0, select: { name: true } }),
    readMediaScreen(payload, scope, query),
  ])

  return (
    <AdminShell
      screen={MEDIA}
      crumb={`${String(view.rows.length)} of ${String(view.total)}`}
      counts={counts}
      lastPublished={null}
      siteName={site.name ?? ''}
      accountName={scope.user.email}
    >
      <section data-admin-media className={styles.screen}>
        <Dropzone
          journeys={view.journeys}
          accepted={acceptedIngestTypes(env.MEDIA_PIPELINE)}
          requestSlots={requestUploadSlots}
          finalise={finaliseUpload}
        />

        <MediaGrid
          rows={view.rows}
          total={view.total}
          search={query.search}
          filter={query.filter}
          journeys={view.journeys}
          showsClips={showsClipAffordances(env.MEDIA_PIPELINE)}
          addToBook={addToBook}
          captionMedia={captionMedia}
          moveMedia={moveMedia}
        />
      </section>
    </AdminShell>
  )
}

export default MediaPage
/* c8 ignore stop */
