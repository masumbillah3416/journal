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
 * `/p/1`: the diary's own client chunk fell from 19,930 bytes to 8,449 (6,400
 * to 3,348 transferred) and total script transfer from 144,386 to 141,334.
 * LCP did not move at all - see `docs/adr/0007-server-rendered-page-faces.md`,
 * which records both numbers, because the second one is the one a future task
 * needs.
 *
 * `key={index}` is the leaf's identity, not a stand-in for one: the reading
 * sequence is a fixed, ordered stack, and the third face is the third leaf of
 * the book whatever page happens to be printed on it.
 *
 * SCOPE. `generateStaticParams` for all 33 pages, revalidation, the
 * out-of-range 404 and the gallery-return behaviour are Task 13, which
 * extends this file. Until then `pageIndexFromParam` clamps an out-of-range
 * page number onto a real page rather than 404ing - the same choice
 * `pageStack.ts` makes for a stale index, and for the same reason: a reader
 * with a bad address should land on a page, not a blank stack.
 * Depends on: `readBookBundle` (../../../../lib/readBookBundle),
 * `pageIndexFromParam` (@travel-diary/domain/pageAddress), `deriveRail`
 * (@travel-diary/domain/bookBundle), `Book` (../../../../components/book/Book),
 * `PageFace` (../../../../components/book/PageFace).
 */
/* c8 ignore start -- Framework passthrough with no authored logic: await the
 * route params, read the bundle, render one face per page, render the book.
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
import { pageIndexFromParam } from '@travel-diary/domain/pageAddress'
import type React from 'react'
import { Book } from '../../../../components/book/Book'
import { PageFace } from '../../../../components/book/PageFace'
import { readBookBundle } from '../../../../lib/readBookBundle'

/** The route's own parameters. Next 15+ hands them over as a promise. */
interface DiaryPageProps {
  readonly params: Promise<{ readonly n: string }>
}

/** Renders the book, opened at the page `<n>` addresses. */
const DiaryPage = async ({ params }: DiaryPageProps): Promise<React.JSX.Element> => {
  const { n } = await params
  const bundle = await readBookBundle()
  const totalPages = bundle.pages.length

  return (
    <Book bookmarks={deriveRail(bundle.pages, bundle.bookmarks)} initialIndex={pageIndexFromParam(n, totalPages)}>
      {bundle.pages.map((page, index) => (
        <PageFace
          key={index}
          leafIndex={index}
          page={page}
          contents={bundle.contents}
          chrome={bundle.chrome}
          totalPages={totalPages}
        />
      ))}
    </Book>
  )
}

export default DiaryPage
/* c8 ignore stop */
