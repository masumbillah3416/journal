/**
 * page.tsx — the `/p/<n>` diary route: one page of the book, server-rendered.
 *
 * The minimum route needed to host the book. It reads the `BookBundle` through
 * the repository seam (`lib/readBookBundle.ts`), turns the URL's 1-based page
 * number into the 0-based leaf index the stack works in
 * (`addressedPageIndex`), renders every page's face, and hands them to
 * `<Book>`. It holds no logic of its own on purpose: a Next.js page component
 * cannot be run without a request context, so anything decided here would be
 * undecidable by any test - which is why the two real decisions, what `<n>`
 * means and which bookmark tabs are drawable, live in
 * `@travel-diary/domain`'s `pageAddress` and `bookBundle` with their own
 * 100%-covered suites.
 *
 * THE FACES ARE BUILT HERE, AND THAT IS THE WHOLE POINT OF THIS LOOP. `Book`
 * is the diary's `'use client'` boundary; anything it IMPORTS is compiled into
 * the route's script bundle and hydrated in the browser, so while `<PageFace>`
 * was imported there, `Cover`, `Contents`, `Notes`, the four slot components
 * and three stylesheets' class maps all shipped. Rendering them here instead
 * and passing them down as `children` means they cross into the client as an
 * already-rendered payload with no component code behind it. Measured on
 * `/p/1`: the diary's own client chunk fell from 19,930 bytes to 8,042 (6,400
 * to 3,646 transferred) and total script transfer from 144,386 to 141,632.
 * LCP did not move at all - see `docs/adr/0007-server-rendered-page-faces.md`,
 * which records both numbers, because the second one is the one a future task
 * needs.
 *
 * `key={index}` is the leaf's identity, not a stand-in for one: the reading
 * sequence is a fixed, ordered stack, and the third face is the third leaf of
 * the book whatever page happens to be printed on it.
 *
 * IT RENDERS A WINDOW OF THE PAGES, NOT ALL THIRTY-THREE, and that is this
 * file's one structural decision - taken by `servedContentWindow`
 * and `rendersContent`
 * (@travel-diary/domain/contentWindow), both of which have their own
 * 100%-covered suites, so nothing is decided here. A document request gets the addressed
 * page and three leaves either side; Next's own client render, which the
 * book asks for once, gets the whole book. Every leaf still gets a child, so
 * the stack's page count, z-order and geometry are untouched - a leaf outside
 * the window carries a contentless `data-page-deferred` marker instead of a
 * face, and that marker is also what `e2e/serverWindow.spec.ts` reads to know
 * which document it has.
 *
 * WHY THIS DOES NOT COST THE DEEP LINKS THEIR INDEXABILITY, which is the
 * reason the diary uses `/p/<n>` paths at all (design spec §8): indexability
 * is per ROUTE. `/p/12`'s document carries page 12's content, and no crawler
 * ever asked it to carry page 20's - `/p/20` does. All thirty-three routes
 * are asserted, one by one, in `e2e/serverWindow.spec.ts`. See
 * `docs/adr/0009-server-rendered-page-window.md` for the measurement that
 * prompted it and the three alternatives it beat.
 *
 * AN ADDRESS THE BOOK HAS NO PAGE FOR IS A 404. `addressedPageIndex` returns
 * `null` for `/p/999`, `/p/0`, `/p/03` and `/p/tokyo` alike, and this route
 * turns that into `notFound()` - rendering `app/(diary)/not-found.tsx` with
 * HTTP 404. The route previously clamped such an address onto page 33 and
 * answered 200, which told a crawler that thirty-three synonyms for the last
 * page were all real pages, and told a reader that a broken link had worked.
 * The decision is `addressedPageIndex`'s (its header carries the reasoning);
 * this file only spends it.
 *
 * IT DOES NOT DECLARE `generateStaticParams`, AND THAT IS A MEASUREMENT
 * RATHER THAN AN OMISSION. Statically generating all thirty-three pages and
 * reading `searchParams` are mutually exclusive on one path in Next 16, and
 * `searchParams` is the only signal that can widen the window without
 * unmounting the book (ADR 0009). The 33-route static build was BUILT and
 * MEASURED against this dynamic one - all thirty-three prerender, and they
 * answer in 1.7-2.6ms where this route takes 19-34ms - and LCP
 * moved 2,931.04ms to 2,932.92ms, which is inside a single run's spread. It
 * buys nothing the gate can see and costs the window, so it is not taken.
 * See `docs/adr/0010-static-generation-and-the-content-window.md` for the
 * runs and the three shapes that were considered for having both.
 *
 * IT SERVES ONE OF TWO READING SURFACES, AND EXACTLY ONE. Below 860px the
 * design replaces the book outright - "No book, no flip, no scaling"
 * (SCREENS.md §1.10) - so this route renders either `<Book>` with a window of
 * page faces or `<MobileDiary>` with the single addressed page, never both.
 * Serving both and hiding one would put the mobile mode's markup and script in
 * front of every desktop reader (against a 3,000ms LCP gate with ~69ms of
 * margin) and the book's thirty-three-leaf stack in front of every phone. The
 * choice is `servedReadingSurface`'s
 * (@travel-diary/domain/readingSurface, 100%-covered), from two signals this
 * route reads off the request and hands over without interpreting: the
 * `Cookie` header, parsed by `rememberedSurface`, and the user-agent's device
 * kind, parsed by Next's own `userAgent`. Nothing about the breakpoint is
 * decided here.
 *
 * THE MOBILE DOCUMENT CARRIES ONE PAGE, not `contentWindow`'s seven, and that
 * is not a second window - it is the absence of one. The window exists because
 * the book keeps thirty-three leaves in a single document and turns them
 * without navigating (ADR 0009); the mobile surface changes page by pressing a
 * link, so its document only ever needs the page the address names.
 * `servedContentWindow` is therefore not consulted on that branch at all.
 *
 * A SERVER GUESS IS CORRECTED IN THE BROWSER, by `<SurfaceCorrection>`, which
 * is rendered beside whichever surface was chosen. It measures the real
 * viewport and, where the guess was wrong - a desktop window narrowed under
 * 860px, a tablet held the other way round - remembers the measurement and
 * re-renders this route. See its own header and
 * `docs/adr/0011-two-reading-surfaces-chosen-on-the-server.md`.
 *
 * SCOPE. On-demand revalidation on publish (design spec §8) is a later task's
 * - nothing publishes yet. The gallery-return behaviour is the address this
 * route writes plus `Book.tsx`'s `replaceState`, and is asserted by
 * `e2e/routing.spec.ts` today against the real `/gallery/<slug>` link the
 * page footers already carry.
 * Depends on: `readBookBundle` (../../../../lib/readBookBundle),
 * `addressedPageIndex`/`pagePath` (@travel-diary/domain/pageAddress),
 * `pageMetadata` (@travel-diary/domain/pageMetadata),
 * `servedContentWindow`/`rendersContent`
 * (@travel-diary/domain/contentWindow),
 * `servedReadingSurface`/`rememberedSurface` (@travel-diary/domain/readingSurface),
 * `deriveRail`/`derivePageLabels`/`pageLabel`/`mobileHeading`
 * (@travel-diary/domain/bookBundle), `Book` (../../../../components/book/Book),
 * `PageFace` (../../../../components/book/PageFace),
 * `MobileDiary`/`MobilePage`/`SurfaceCorrection` (../../../../components/mobile/),
 * `headers` (next/headers), `userAgent` (next/server), `notFound` (next/navigation).
 */
/* c8 ignore start -- Framework passthrough with no authored logic: await the
 * route params, the query and the request headers, read the bundle, and render
 * whichever surface `servedReadingSurface` names - the mobile mode with the
 * one addressed page, or the book with one face per page inside the served
 * window and a contentless marker outside it. Its five real decisions - what
 * `<n>` means, whether the book has such a page at all, which surface this
 * request is served, which pages it gets the content of, and whether a given
 * leaf is one of them - are `addressedPageIndex`, `servedReadingSurface`
 * (with `rememberedSurface`), `servedContentWindow` and `rendersContent`, each
 * with its own 100%-covered suite in `@travel-diary/domain`, as is the title
 * and description `generateMetadata` returns (`pageMetadata`). The five values
 * the two surfaces' chrome needs - the labelled rail, one label per page, this
 * page's own label, its short mobile heading, and whether decorations are on -
 * are `deriveRail`, `derivePageLabels`, `pageLabel`, `mobileHeading` and a
 * field off the `book` global, so none of them is decided here either. The one
 * `if` this file adds spends a decision rather than taking one, exactly as the
 * `rendersContent` ternary beside it does, and BOTH of its arms are asserted
 * in a real browser: the book arm by every spec that opens `/p/<n>` at the
 * `desktop` and `mid` projects, and the mobile arm by `e2e/mobile.spec.ts` at
 * the `mobile` project, whose user-agent is a phone's.
 * It cannot be measured by either Vitest config (a page component needs a real
 * Next request context, and no integration test can supply one), and this
 * file's path contains a Next.js dynamic-route bracket segment, where
 * `@vitest/coverage-v8`'s ignore-hint scanner is documented not to take effect
 * (CLAUDE.md §2.1, verified in Phase 1 Task 1) - so it is ALSO named by exact
 * path in vitest.config.ts's coverage exclude, which is the treatment that
 * actually holds here. Both are present deliberately: the comment states the
 * reason at the point of exclusion, and the config entry is what enforces it.
 * Its runtime behaviour is covered in the browser by e2e/routing.spec.ts
 * (the 404, the metadata, the canonical link), e2e/book.spec.ts,
 * e2e/smoke.spec.ts, e2e/serverWindow.spec.ts, e2e/imageWindow.spec.ts and
 * e2e/mobile.spec.ts. */
import { derivePageLabels, deriveRail, mobileHeading, pageLabel } from '@travel-diary/domain/bookBundle'
import { rendersContent, servedContentWindow, type RouteQuery } from '@travel-diary/domain/contentWindow'
import { addressedPageIndex, pagePath } from '@travel-diary/domain/pageAddress'
import { pageMetadata } from '@travel-diary/domain/pageMetadata'
import { rememberedSurface, servedReadingSurface } from '@travel-diary/domain/readingSurface'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { userAgent } from 'next/server'
import type React from 'react'
import { Book } from '../../../../components/book/Book'
import { PageFace } from '../../../../components/book/PageFace'
import { MobileDiary } from '../../../../components/mobile/MobileDiary'
import { MobilePage } from '../../../../components/mobile/MobilePage'
import { SurfaceCorrection } from '../../../../components/mobile/SurfaceCorrection'
import { readBookBundle } from '../../../../lib/readBookBundle'

/** The route's own parameters. Next 15+ hands them over as promises. */
interface DiaryPageProps {
  readonly params: Promise<{ readonly n: string }>
  /** The query, read only for the one signal the book sends itself - see `servedContentWindow`. */
  readonly searchParams: Promise<RouteQuery>
}

/**
 * The title, description and canonical link one page of the book carries.
 *
 * THE CANONICAL LINK IS THE POINT OF THIS FUNCTION, not decoration on it.
 * `?pages=all` is a real, reachable URL serving the same page's content under
 * a second address - the book puts it there itself when it asks for the rest
 * of the book (`docs/adr/0009-server-rendered-page-window.md`), and that
 * ADR's own concerns list asked this task for the link by name. It is
 * declared for the plain address too, not only the widened one: a page whose
 * canonical is itself is what makes the widened one's claim meaningful.
 *
 * It is a ROOT-RELATIVE path rather than an absolute URL, deliberately. An
 * absolute one needs an origin, and this repository has no configured
 * production origin to build one from - `MEDIA_ORIGIN` is the media bucket's,
 * which is not the site's. A canonical resolved against `localhost:3000` at
 * build time would be worse than none at all, and a root-relative href
 * resolves correctly against whatever origin actually served the document.
 *
 * @param props - The route's own parameters, of which only `params` is read.
 * @returns This page's own title and description, and the canonical `/p/<n>`.
 */
export const generateMetadata = async ({ params }: DiaryPageProps): Promise<Metadata> => {
  const [{ n }, bundle] = await Promise.all([params, readBookBundle()])
  const openIndex = addressedPageIndex(n, bundle.pages.length)
  // An address with no page of its own has no metadata of its own either:
  // Next renders `not-found.tsx` for it, under the layout's own title.
  const page = openIndex === null ? undefined : bundle.pages[openIndex]
  if (openIndex === null || page === undefined) return {}

  const { title, description } = pageMetadata(page, {
    chrome: bundle.chrome,
    about: bundle.about,
    pageNumber: openIndex + 1,
    totalPages: bundle.pages.length,
  })

  return { title, description, alternates: { canonical: pagePath(openIndex) } }
}

/** Renders whichever reading surface this request is served, opened at `<n>`. */
const DiaryPage = async ({ params, searchParams }: DiaryPageProps): Promise<React.JSX.Element> => {
  const [{ n }, query, requestHeaders, bundle] = await Promise.all([params, searchParams, headers(), readBookBundle()])
  const totalPages = bundle.pages.length
  const openIndex = addressedPageIndex(n, totalPages)
  if (openIndex === null) notFound()
  const page = bundle.pages[openIndex]
  // Unreachable for an index `addressedPageIndex` returned, which is in range
  // by construction; `noUncheckedIndexedAccess` needs it said out loud.
  if (page === undefined) notFound()

  const surface = servedReadingSurface({
    remembered: rememberedSurface(requestHeaders.get('cookie') ?? undefined),
    device: userAgent({ headers: requestHeaders }).device.type,
  })

  if (surface === 'mobile') {
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
        <SurfaceCorrection served={surface} />
      </>
    )
  }

  const content = servedContentWindow(query, openIndex, totalPages)

  return (
    <>
      <Book
        bookmarks={deriveRail(bundle.pages, bundle.bookmarks)}
        labels={derivePageLabels(bundle.pages)}
        showDecorations={bundle.chrome.showDecorations}
        initialIndex={openIndex}
        content={content}
      >
        {bundle.pages.map((leafPage, index) =>
          rendersContent(content, index) ? (
            <PageFace
              key={index}
              leafIndex={index}
              page={leafPage}
              contents={bundle.contents}
              chrome={bundle.chrome}
              about={bundle.about}
              totalPages={totalPages}
            />
          ) : (
            // A leaf, but no face. The stack needs the leaf for its z-order and
            // its page count; the reader needs the face only once they can get
            // to it, which is what `useRestOfBook` sees to.
            <div key={index} data-page-deferred={index} />
          ),
        )}
      </Book>
      <SurfaceCorrection served={surface} />
    </>
  )
}

export default DiaryPage
/* c8 ignore stop */
