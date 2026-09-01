/**
 * page.tsx — the `/p/<n>` diary route: one page of the book, server-rendered.
 *
 * The minimum route needed to host the book. It reads the `BookBundle` through
 * the repository seam (`lib/readBookBundle.ts`), turns the URL's 1-based page
 * number into the 0-based leaf index the stack works in
 * (`pageIndexFromParam`), and hands both to `<Book>`. It holds no logic of its
 * own on purpose: a Next.js page component cannot be run without a request
 * context, so anything decided here would be undecidable by any test - which
 * is why the one real decision, what `<n>` means, lives in
 * `@travel-diary/domain/pageAddress` with its own 100%-covered suite.
 *
 * SCOPE. `generateStaticParams` for all 33 pages, revalidation, the
 * out-of-range 404 and the gallery-return behaviour are Task 13, which
 * extends this file. Until then `pageIndexFromParam` clamps an out-of-range
 * page number onto a real page rather than 404ing - the same choice
 * `pageStack.ts` makes for a stale index, and for the same reason: a reader
 * with a bad address should land on a page, not a blank stack.
 * Depends on: `readBookBundle` (../../../../lib/readBookBundle.js),
 * `pageIndexFromParam` (@travel-diary/domain/pageAddress), `Book`
 * (../../../../components/book/Book.js).
 */
/* c8 ignore start -- Framework passthrough with no authored logic: await the
 * route params, read the bundle, render the book. It cannot be measured by
 * either Vitest config (a page component needs a real Next request context,
 * and no integration test can supply one), and this file's path contains a
 * Next.js dynamic-route bracket segment, where `@vitest/coverage-v8`'s
 * ignore-hint scanner is documented not to take effect (CLAUDE.md §2.1,
 * verified in Phase 1 Task 1) - so it is ALSO named by exact path in
 * vitest.config.ts's coverage exclude, which is the treatment that actually
 * holds here. Both are present deliberately: the comment states the reason at
 * the point of exclusion, and the config entry is what enforces it. Its
 * runtime behaviour is covered in the browser by e2e/book.spec.ts and
 * e2e/smoke.spec.ts. */
import { pageIndexFromParam } from '@travel-diary/domain/pageAddress'
import type React from 'react'
import { Book } from '../../../../components/book/Book'
import { readBookBundle } from '../../../../lib/readBookBundle'

/** The route's own parameters. Next 15+ hands them over as a promise. */
interface DiaryPageProps {
  readonly params: Promise<{ readonly n: string }>
}

/** Renders the book, opened at the page `<n>` addresses. */
const DiaryPage = async ({ params }: DiaryPageProps): Promise<React.JSX.Element> => {
  const { n } = await params
  const bundle = await readBookBundle()

  return <Book bundle={bundle} initialIndex={pageIndexFromParam(n, bundle.pages.length)} />
}

export default DiaryPage
/* c8 ignore stop */
