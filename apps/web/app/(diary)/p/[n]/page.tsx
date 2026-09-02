/**
 * page.tsx — the `/p/<n>` diary route: one page of the book, server-rendered.
 *
 * The minimum route needed to host the book. It reads the `BookBundle` through
 * the repository seam (`lib/readBookBundle.ts`), turns the URL's 1-based page
 * number into the 0-based leaf index the stack works in
 * (`pageIndexFromParam`), renders every page's face, and hands them to
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
 * SCOPE. `generateStaticParams` for all 33 pages, revalidation, the
 * out-of-range 404 and the gallery-return behaviour are Task 13, which
 * extends this file. Until then `pageIndexFromParam` clamps an out-of-range
 * page number onto a real page rather than 404ing - the same choice
 * `pageStack.ts` makes for a stale index, and for the same reason: a reader
 * with a bad address should land on a page, not a blank stack.
 * Depends on: `readBookBundle` (../../../../lib/readBookBundle),
 * `pageIndexFromParam` (@travel-diary/domain/pageAddress),
 * `servedContentWindow`/`rendersContent`
 * (@travel-diary/domain/contentWindow), `deriveRail`
 * (@travel-diary/domain/bookBundle), `Book` (../../../../components/book/Book),
 * `PageFace` (../../../../components/book/PageFace).
 */
/* c8 ignore start -- Framework passthrough with no authored logic: await the
 * route params and the query, read the bundle, render one face per
 * page inside the served window and a contentless marker outside it, render
 * the book. Its three real decisions - what `<n>` means, which pages this
 * request gets the content of, and whether a given leaf is one of them - are
 * `pageIndexFromParam`, `servedContentWindow` and `rendersContent`, each with
 * its own covered suite elsewhere.
 * It cannot be measured by either Vitest config (a page component needs a real
 * Next request context, and no integration test can supply one), and this
 * file's path contains a Next.js dynamic-route bracket segment, where
 * `@vitest/coverage-v8`'s ignore-hint scanner is documented not to take effect
 * (CLAUDE.md §2.1, verified in Phase 1 Task 1) - so it is ALSO named by exact
 * path in vitest.config.ts's coverage exclude, which is the treatment that
 * actually holds here. Both are present deliberately: the comment states the
 * reason at the point of exclusion, and the config entry is what enforces it.
 * Its runtime behaviour is covered in the browser by e2e/book.spec.ts,
 * e2e/smoke.spec.ts and e2e/imageWindow.spec.ts. */
import { deriveRail } from '@travel-diary/domain/bookBundle'
import { rendersContent, servedContentWindow, type RouteQuery } from '@travel-diary/domain/contentWindow'
import { pageIndexFromParam } from '@travel-diary/domain/pageAddress'
import type React from 'react'
import { Book } from '../../../../components/book/Book'
import { PageFace } from '../../../../components/book/PageFace'
import { readBookBundle } from '../../../../lib/readBookBundle'

/** The route's own parameters. Next 15+ hands them over as promises. */
interface DiaryPageProps {
  readonly params: Promise<{ readonly n: string }>
  /** The query, read only for the one signal the book sends itself - see `servedContentWindow`. */
  readonly searchParams: Promise<RouteQuery>
}

/** Renders the book, opened at the page `<n>` addresses. */
const DiaryPage = async ({ params, searchParams }: DiaryPageProps): Promise<React.JSX.Element> => {
  const [{ n }, query, bundle] = await Promise.all([params, searchParams, readBookBundle()])
  const totalPages = bundle.pages.length
  const openIndex = pageIndexFromParam(n, totalPages)
  const content = servedContentWindow(query, openIndex, totalPages)

  return (
    <Book bookmarks={deriveRail(bundle.pages, bundle.bookmarks)} initialIndex={openIndex} content={content}>
      {bundle.pages.map((page, index) =>
        rendersContent(content, index) ? (
          <PageFace
            key={index}
            leafIndex={index}
            page={page}
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
  )
}

export default DiaryPage
/* c8 ignore stop */
