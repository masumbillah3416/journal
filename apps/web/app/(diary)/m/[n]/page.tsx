/**
 * page.tsx — the mobile reading surface's route entry: one page, in a column.
 *
 * The second of the diary's two reading surfaces (SCREENS.md §1.10, "No book,
 * no flip, no scaling"). It renders the same page of the same book as
 * `app/(diary)/p/[n]/page.tsx`, with the same title, description and canonical
 * link, and shares neither component tree nor stylesheet with it.
 *
 * `/m/<n>` IS NOT AN ADDRESS, AND NOTHING LINKS TO IT. This entry exists so
 * the bundler has two route entries to split; the reader's address is always
 * `/p/<n>`, and `apps/web/middleware.ts` is what puts a request served the
 * mobile surface onto this entry, by rewrite, without moving that address.
 * A direct request for `/m/<n>` is sent back to `/p/<n>` with a 308 by the
 * same middleware, so the diary never answers to two addresses for one page.
 *
 * WHY A SECOND ENTRY RATHER THAN A SECOND BRANCH. Both surfaces were once
 * chosen by an `if` inside the `/p/[n]` route, which kept both trees out of
 * every reader's MARKUP (a phone's document is 22,481 bytes against the book's
 * 89,589) but not out of their SCRIPT: Turbopack's client split is per route
 * entry, not per import, so one entry importing both compiled both into one
 * chunk group. Every desktop reader downloaded this surface's client half and
 * its 23,923-byte stylesheet, and LCP went 2,936.12ms to 3,011.36ms against a
 * 3,000ms gate. `next/dynamic` does not change that - measured twice. Two
 * entries do. See `docs/adr/0012-two-route-entries-for-two-reading-surfaces.md`.
 *
 * ITS METADATA IS THE SAME FUNCTION THE BOOK'S ENTRY CALLS, and that is not
 * duplication for its own sake: a crawler with a phone's user agent - which is
 * what Googlebot's smartphone crawler sends - is served THIS entry for
 * `/p/<n>`, so metadata written only into the book's entry would be metadata
 * half the crawlers never saw. Both entries call `addressedPageMetadata`
 * (@travel-diary/domain/pageMetadata, 100%-covered) and do nothing to its
 * result but shape it into Next's `Metadata`, so the two cannot say different
 * things about the same page.
 *
 * THE DOCUMENT CARRIES ONE PAGE, not `contentWindow`'s seven, and that is not
 * a second window - it is the absence of one. The window exists because the
 * book keeps thirty-three leaves in a single document and turns them without
 * navigating (`docs/adr/0009-server-rendered-page-window.md`); this surface
 * changes page by pressing a link, so its document only ever needs the page
 * the address names. `servedContentWindow` is therefore not consulted here at
 * all, and `searchParams` is not read.
 *
 * AN ADDRESS THE BOOK HAS NO PAGE FOR IS A 404, decided by
 * `addressedPageIndex` exactly as it is on the book's entry, so `/p/999`
 * answers 404 on both surfaces rather than on one.
 *
 * A SERVER GUESS IS CORRECTED IN THE BROWSER, by `<SurfaceCorrection>`. This
 * entry always passes it `"mobile"`, because this entry is only ever reached
 * by a reader the middleware decided was served the mobile surface. See its
 * own header and `docs/adr/0011-two-reading-surfaces-chosen-on-the-server.md`.
 * Depends on: `readBookBundle` (../../../../lib/readBookBundle),
 * `addressedPageIndex` (@travel-diary/domain/pageAddress),
 * `addressedPageMetadata` (@travel-diary/domain/pageMetadata),
 * `deriveRail`/`mobileHeading`/`pageLabel` (@travel-diary/domain/bookBundle),
 * `MobileDiary`/`MobilePage`/`SurfaceCorrection`
 * (../../../../components/mobile/), `notFound` (next/navigation).
 */
/* c8 ignore start -- Framework passthrough with no authored logic: await the
 * route params, read the bundle, and render the mobile surface with the one
 * addressed page. Its two real decisions - what `<n>` means and whether the
 * book has such a page at all - are `addressedPageIndex`'s, with its own
 * 100%-covered suite in `@travel-diary/domain`, as are the title, description
 * and canonical link `generateMetadata` returns (`addressedPageMetadata`) and
 * the three values this surface's chrome needs (`deriveRail`,
 * `mobileHeading`, `pageLabel`). WHICH READERS REACH THIS FILE AT ALL is
 * `servedReadingSurface`'s, spent by `apps/web/middleware.ts`, which this
 * coverage pass does run.
 * It cannot be measured by either Vitest config (a page component needs a real
 * Next request context, and no integration test can supply one), and this
 * file's path contains a Next.js dynamic-route bracket segment, where
 * `@vitest/coverage-v8`'s ignore-hint scanner is documented not to take effect
 * (CLAUDE.md §2.1, verified in Phase 1 Task 1) - so it is ALSO named by exact
 * path in vitest.config.ts's coverage exclude, which is the treatment that
 * actually holds here. Its runtime behaviour is covered in a real browser by
 * e2e/mobile.spec.ts (every gesture, the drawer and the surface correction),
 * e2e/routing.spec.ts (the metadata and the canonical link this entry serves
 * under `/p/<n>`, and the 308 off `/m/<n>`), e2e/layout.spec.ts and
 * e2e/a11y.spec.ts. */
import { deriveRail, mobileHeading, pageLabel } from '@travel-diary/domain/bookBundle'
import { addressedPageIndex } from '@travel-diary/domain/pageAddress'
import { addressedPageMetadata } from '@travel-diary/domain/pageMetadata'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type React from 'react'
import { MobileDiary } from '../../../../components/mobile/MobileDiary'
import { MobilePage } from '../../../../components/mobile/MobilePage'
import { SurfaceCorrection } from '../../../../components/mobile/SurfaceCorrection'
import { readBookBundle } from '../../../../lib/readBookBundle'

/** The route's own parameters. Next 15+ hands them over as promises. */
interface MobilePageProps {
  readonly params: Promise<{ readonly n: string }>
}

/**
 * The title, description and canonical link one page of the book carries -
 * the same three, from the same function, that the book's entry declares.
 *
 * The canonical is `/p/<n>`, never `/m/<n>`: this entry is served AT `/p/<n>`
 * through a rewrite, and the page's one public address is the one a reader can
 * copy. See this module's header, and the book entry's `generateMetadata` for
 * why the link is root-relative rather than absolute.
 *
 * @param props - The route's own parameters, of which only `params` is read.
 * @returns This page's own title and description, and the canonical `/p/<n>`.
 */
export const generateMetadata = async ({ params }: MobilePageProps): Promise<Metadata> => {
  const [{ n }, bundle] = await Promise.all([params, readBookBundle()])
  const addressed = addressedPageMetadata(bundle, n)
  // An address with no page of its own has no metadata of its own either:
  // Next renders `not-found.tsx` for it, under the layout's own title.
  if (addressed === null) return {}

  return {
    title: addressed.title,
    description: addressed.description,
    alternates: { canonical: addressed.canonical },
  }
}

/** Renders the mobile reading surface, showing the one page `<n>` addresses. */
const MobileDiaryPage = async ({ params }: MobilePageProps): Promise<React.JSX.Element> => {
  const [{ n }, bundle] = await Promise.all([params, readBookBundle()])
  const totalPages = bundle.pages.length
  const openIndex = addressedPageIndex(n, totalPages)
  if (openIndex === null) notFound()
  const page = bundle.pages[openIndex]
  // Unreachable for an index `addressedPageIndex` returned, which is in range
  // by construction; `noUncheckedIndexedAccess` needs it said out loud.
  if (page === undefined) notFound()

  return (
    <>
      <MobileDiary
        bookTitle={bundle.chrome.title}
        heading={mobileHeading(page)}
        label={pageLabel(page)}
        bookmarks={deriveRail(bundle.pages, bundle.bookmarks)}
        pageIndex={openIndex}
        totalPages={totalPages}
      >
        <MobilePage
          page={page}
          contents={bundle.contents}
          chrome={bundle.chrome}
          about={bundle.about}
          leafIndex={openIndex}
          totalPages={totalPages}
        />
      </MobileDiary>
      <SurfaceCorrection served="mobile" />
    </>
  )
}

export default MobileDiaryPage
/* c8 ignore stop */
