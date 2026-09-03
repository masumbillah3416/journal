/**
 * page.tsx — the `/gallery/<slug>` route: one journey's full gallery.
 *
 * A SEPARATE ROUTE, OUTSIDE THE BOOK'S FLIP SEQUENCE, which is the whole
 * shape of SCREENS.md §1.8. There is no 1300x860 design box here, no scale
 * transform, no leaves and no chrome: a gallery is an ordinary document that
 * fills the viewport and scrolls. It shares the `(diary)` route group - and
 * therefore the diary's document, fonts and token custom properties - and
 * nothing else.
 *
 * It holds no logic of its own, on purpose, and for the same reason
 * `p/[n]/page.tsx` does not: a Next.js page component cannot be run without a
 * request context, so anything decided here would be undecidable by any test.
 * The three real decisions are elsewhere and each has its own covered suite -
 * what a journey's gallery IS (`lib/readGalleryBundle.ts`, against a real
 * Payload), how it is drawn (`components/gallery/`), and every rule the grid
 * and the lightbox follow (`@travel-diary/domain/gallery`, gated at 100%).
 *
 * A SLUG NAMING NO PUBLISHED JOURNEY IS A 404, not an empty gallery. Same
 * ruling as `/p/999`'s (`docs/adr` is silent on it; `pageAddress.ts`'s header
 * carries the reasoning): an address the site has no content for must say so,
 * or a crawler learns that every misspelling is a real page and a reader
 * learns that a broken link worked. `readGalleryBundle` returns `null` for an
 * unpublished, archived or soft-deleted journey too, so unpublishing a journey
 * closes its gallery rather than merely hiding its link.
 *
 * THE CENSUS IS TAKEN FROM THE FRAMES THIS PAGE IS RENDERING, not read from
 * anywhere (CLAUDE.md §7, "Derive, never store ... media counts"), so the
 * header's `61 photos · 0 clips` and the grid's sixty-one tiles cannot
 * disagree.
 *
 * SCOPE. `robots`/`X-Robots-Tag` against the `indexGalleries` site setting
 * (SECURITY.md, Public site) is not wired here: nothing writes that setting
 * yet, and a hard-coded `noindex` would be a policy this task invented. The
 * download handler beneath this route sets its own - see its file.
 * Depends on: `returningPagePath` (@travel-diary/domain/pageAddress),
 * `readGalleryBundle` (../../../../lib/readGalleryBundle),
 * `GalleryHeader`/`Grid` (../../../../components/gallery/), `notFound`
 * (next/navigation).
 */
/* c8 ignore start -- Framework passthrough with no authored logic: await the
 * route params, read the bundle, 404 when there is none, render the header
 * and the grid. Every decision it appears to take belongs to a module with
 * its own suite - `readGalleryBundle` (integration-tested against a real
 * Payload), `GalleryHeader` and `Grid` (jsdom), and
 * `@travel-diary/domain/gallery` (100%). The one expression here is a census
 * of an array, whose own behaviour is `GalleryHeader`'s to print.
 * It cannot be measured by either Vitest config (a page component needs a
 * real Next request context, and no integration test can supply one), and
 * this file's path contains a Next.js dynamic-route bracket segment, where
 * `@vitest/coverage-v8`'s ignore-hint scanner is documented not to take
 * effect (CLAUDE.md §2.1, verified in Phase 1 Task 1 and re-verified in Task
 * 7) - so it is ALSO named by exact path in vitest.config.ts's coverage
 * exclude, which is the treatment that actually holds here. Its runtime
 * behaviour is covered in the browser by e2e/gallery.spec.ts and
 * e2e/a11y.spec.ts. */
import { returningPagePath } from '@travel-diary/domain/pageAddress'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type React from 'react'
import { GalleryHeader } from '../../../../components/gallery/GalleryHeader'
import { Grid } from '../../../../components/gallery/Grid'
import { readGalleryBundle } from '../../../../lib/readGalleryBundle'
import styles from '../../../../components/gallery/gallery.module.css'

/** The route's own parameters. Next 15+ hands them over as promises. */
interface GalleryPageProps {
  readonly params: Promise<{ readonly slug: string }>
  /**
   * The query, read for one parameter: `from`, the page of the book the
   * reader left. The diary's own gallery links put it there (`galleryPath`)
   * so the back control's `href` is right before any script runs - see
   * `GalleryHeader`'s header for the two designs that were rejected first.
   */
  readonly searchParams: Promise<{ readonly from?: string }>
}

/**
 * The title and description one journey's gallery carries.
 *
 * A gallery is a real, shareable address - the diary's Notes and Frames pages
 * link to it by path - so it needs a title of its own for the same reason
 * every `/p/<n>` does: a result nobody can tell apart from ten others throws
 * away most of what a real path bought.
 *
 * @param props - The route's own parameters.
 * @returns The gallery's title and description, or nothing for a slug naming no journey.
 */
export const generateMetadata = async ({ params }: GalleryPageProps): Promise<Metadata> => {
  const { slug } = await params
  const bundle = await readGalleryBundle(slug)
  if (bundle === null) return {}

  const { name, place, dates } = bundle.journey
  return {
    title: `${name} — Full gallery`,
    description: `Every frame from ${name}${place === '' ? '' : `, ${place}`}, ${dates}.`,
    alternates: { canonical: `/gallery/${slug}` },
  }
}

/** Renders one journey's full gallery. */
const GalleryPage = async ({ params, searchParams }: GalleryPageProps): Promise<React.JSX.Element> => {
  const [{ slug }, { from }] = await Promise.all([params, searchParams])
  const bundle = await readGalleryBundle(slug)
  if (bundle === null) notFound()

  const clips = bundle.frames.filter((frame) => frame.kind === 'clip').length

  return (
    <main className={styles.gallery}>
      <GalleryHeader
        journey={bundle.journey}
        counts={{ photographs: bundle.frames.length - clips, clips }}
        returnTo={returningPagePath(from)}
      />
      <div className={styles.gridScroller}>
        <Grid journey={bundle.journey} frames={bundle.frames} thumbSize={bundle.thumbSize} />
      </div>
    </main>
  )
}

export default GalleryPage
/* c8 ignore stop */
