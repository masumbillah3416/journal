/**
 * page.tsx — the `/admin/galleries` route: SCREENS.md §2.5, the screen that
 * decides what order a journey's gallery is in and what each frame says.
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
 * one `findGlobal` for the masthead, and `readGalleriesScreen` (three queries).
 * EIGHT queries for the whole screen, whatever the size of the diary.
 *
 * ═══ THE JOURNEY IS AN ADDRESS, NOT STATE ═══
 *
 * `?journey=<id>` selects something, so it is an address — the same reading
 * §2.2's status chips and §2.4's filter chips get. The select that changes it
 * lives inside the island (`FrameGrid.tsx`), which changes nothing about what
 * it is: the screen survives a reload and can be sent to somebody.
 *
 * ═══ AND SO ARE `?frame=` AND `?captionAll=`, WHICH SCREENS.md §2.1 WRITES ═══
 *
 * §2.1's prompts "must deep-link to the exact screen AND selection" — "'Pick
 * posters' resolves the first clip with no poster and selects it by id;
 * 'Caption them' opens the bulk panel already expanded". A deep link is only a
 * deep link if the destination READS it, so this screen parses both with
 * `promptedSelection`, which is the INVERSE of the function that writes them.
 * One definition, round-tripped by one test, rather than two modules that each
 * look right on their own. They are INITIAL values: once an author presses a
 * tile, the address has had its say.
 *
 * ═══ THE PIPELINE IS READ HERE, ON THE SERVER ═══
 *
 * Design spec §9.3 puts "does this deployment show clip affordances" behind
 * `MEDIA_PIPELINE`, and a component that read `process.env` would be reading a
 * server value in a browser bundle. `showsClipAffordances` is asked here and
 * passed down, exactly as `app/(admin)/admin/media/page.tsx` does.
 * Depends on: `requireAdminSession` (../../../../lib/auth/guard), `adminScope`,
 * `readNavCounts` and `readGalleriesScreen` (../../../../lib/admin/…),
 * `getPayload` (../../../../lib/payload), `AdminShell`
 * (../../../../components/admin/shell/AdminShell), `FrameGrid`, `ADMIN_NAV`
 * (@travel-diary/domain/admin/navigation), the ingest policy
 * (@travel-diary/domain/media/ingestPolicy), `env`, and this screen's five
 * actions.
 */
/* c8 ignore start -- Framework passthrough with no authored logic: guard the
 * request, read the rail's data and the screen's rows, draw the shell around
 * them. Every decision it appears to take belongs to a module with its own
 * suite — `requireAdminSession`, `adminScope`, `readNavCounts` and
 * `readGalleriesScreen` (integration-tested against a real Payload),
 * `showsClipAffordances` (domain, 100%) and `FrameGrid` (jsdom). It cannot be
 * measured by either Vitest config (a page component needs a real Next request
 * context, and no integration test can supply one), so a per-file c8 ignore is
 * CLAUDE.md §2.1's honest treatment — the same one
 * `app/(admin)/admin/media/page.tsx` carries, and for the same reason. Its
 * runtime behaviour is covered in the browser by e2e/admin.spec.ts (four cases
 * — a drag, two arrow presses, the grips' boxes and §2.5's two column shapes)
 * and e2e/a11y.spec.ts (axe, full ruleset, with the bulk caption panel open).
 * IT IS NOT IN e2e/visual.spec.ts, and this sentence named it before it was
 * true: a baseline for this screen is OWED, and is being taken with the three
 * other screens that owe one in Task 15 rather than alone, so that the debt
 * stays one thing. `docs/deviations.md` §81 records it. */
import { ADMIN_NAV, type NavEntry } from '@travel-diary/domain/admin/navigation'
import { promptedSelection } from '@travel-diary/domain/admin/prompts'
import { journeyId, type JourneyId } from '@travel-diary/domain/ids'
import { showsClipAffordances } from '@travel-diary/domain/media/ingestPolicy'
import type { Metadata } from 'next'
import type React from 'react'
import { FrameGrid } from '../../../../components/admin/galleries/FrameGrid'
import styles from '../../../../components/admin/galleries/galleries.module.css'
import { AdminShell } from '../../../../components/admin/shell/AdminShell'
import { adminScope } from '../../../../lib/admin/adminScope'
import { readGalleriesScreen } from '../../../../lib/admin/readGalleriesScreen'
import { readNavCounts } from '../../../../lib/admin/readNavCounts'
import { requireAdminSession } from '../../../../lib/auth/guard'
import { env } from '../../../../lib/env'
import { getPayload } from '../../../../lib/payload'
import { applyBulkCaptions, setFrameFlags, setFrameOrder, setFrameText, setPosterAt } from './actions'

/**
 * The screen's title, and the one instruction it gives a crawler.
 *
 * `index: false` for the same two complementary reasons every other admin
 * screen gives: `public/robots.txt` asks a crawler not to FETCH `/admin`, while
 * a link from elsewhere could still put the address in an index.
 */
export const metadata: Metadata = {
  title: 'Galleries',
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
const GALLERIES: NavEntry = ADMIN_NAV.find((entry) => entry.href === '/admin/galleries') ?? {
  id: 'galleries',
  label: 'Galleries',
  subLabel: 'Order and captions',
  href: '/admin/galleries',
  section: 'media',
}

/** What Next.js hands a route segment's page component. */
interface GalleriesPageProps {
  /** The address's query string, already parsed. */
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * The journey one address names, branded, or `null`.
 *
 * Next.js hands an array when the key repeats (`?journey=a&journey=b`), which
 * is an address anybody can type. An unknown or malformed id is NOT a refusal:
 * `readGalleriesScreen` falls back to the first journey, because a 500 for a
 * typo in a query string is worse than the default gallery.
 * @param value - The entry as Next.js parsed it.
 * @returns The branded journey, or `null`.
 */
const namedJourney = (value: string | readonly string[] | undefined): JourneyId | null => {
  const first = typeof value === 'string' ? value : value?.[0]
  if (first === undefined) return null
  const built = journeyId(first)
  return built.ok ? built.value : null
}

/** Renders the Galleries screen, for a reader with a live session. */
const GalleriesPage = async ({ searchParams }: GalleriesPageProps): Promise<React.JSX.Element> => {
  // Before anything is drawn: a refusal redirects, so no part of this screen is
  // ever assembled for a request that has no live session.
  const session = await requireAdminSession()

  const scope = await adminScope(session)
  const payload = await getPayload()
  const query = await searchParams
  const asked = namedJourney(query['journey'])
  // WHAT AN OVERVIEW PROMPT ASKED THIS SCREEN TO OPEN IN. `promptedSelection`
  // is the INVERSE of the function that writes those addresses
  // (`@travel-diary/domain/admin/prompts`), so the parameter §2.1 writes and
  // the parameter this screen reads are one definition round-tripped by one
  // test — rather than two modules that each look right on their own.
  const opening = promptedSelection(query)
  const [counts, site, view] = await Promise.all([
    readNavCounts(payload, scope),
    payload.findGlobal({ slug: 'site', ...scope, depth: 0, select: { name: true } }),
    readGalleriesScreen(payload, scope, asked),
  ])

  return (
    <AdminShell
      screen={GALLERIES}
      crumb={`${String(view.frames.length)} frames`}
      counts={counts}
      lastPublished={null}
      siteName={site.name ?? ''}
      accountName={scope.user.email}
    >
      <section data-admin-galleries className={styles.screen}>
        {view.journey === null ? (
          <p className={styles.empty}>There are no journeys to arrange yet.</p>
        ) : (
          <FrameGrid
            journey={view.journey}
            journeys={view.journeys}
            frames={view.frames}
            initialFrame={opening.frame}
            initialBulkOpen={opening.captionAll}
            showsClips={showsClipAffordances(env.MEDIA_PIPELINE)}
            setFrameOrder={setFrameOrder}
            setFrameText={setFrameText}
            setFrameFlags={setFrameFlags}
            setPosterAt={setPosterAt}
            applyBulkCaptions={applyBulkCaptions}
          />
        )}
      </section>
    </AdminShell>
  )
}

export default GalleriesPage
/* c8 ignore stop */
