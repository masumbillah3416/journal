/**
 * GalleryHeader — the bar above the grid: the way back, the journey's name,
 * its place and dates, and how much the gallery holds (SCREENS.md §1.8).
 *
 * Presentational SERVER component (CLAUDE.md §3.3) with no state, no handlers
 * and no client code at all, so none of it reaches the browser - the same split the
 * diary route makes for its page faces
 * (`docs/adr/0007-server-rendered-page-faces.md`).
 *
 * THE BACK CONTROL IS A PLAIN LINK WITH A SERVER-RENDERED `href`, and getting
 * there took two rejected designs. The design spec requires that "returning
 * from a gallery restores `/p/<n>`, not `/`", so the control has to know
 * which page the reader left. Reading the `Referer` HEADER is ruled out by
 * SECURITY.md's Public site section - a document that varied by it could not
 * be served from a CDN. Reading `document.referrer` on the CLIENT was built,
 * and failed in a real browser: the anchor renders with the `/p/1` fallback
 * and is corrected in an effect, so a reader who clicked before hydration
 * landed on the cover, at two of three viewport projects. The page number
 * therefore travels in the link the book itself renders (`galleryPath`), and
 * this component is handed the answer already resolved
 * (`returningPagePath`). Both live in `packages/domain/src/pageAddress.ts`.
 *
 * THE COPY IS THE PROTOTYPE'S, VERBATIM. SCREENS.md §1.8 gives this bar its
 * sizes and its rule; the words are in the prototype's own `showGallery`
 * block (`handoff/design_handoff_travel_diary/Travel Diary.dc.html`): "Back to
 * the diary", "Full gallery", `{place} · {dates}` beside the title, and
 * `{n} photos · {m} clips`. CLAUDE.md §9's third pass treats that copy as
 * final, so the count keeps its `· 0 clips` on a journey with none, exactly as
 * `Notes.tsx`'s footer keeps "and 0 clips in the gallery".
 *
 * THE COUNT IS DERIVED, NEVER STORED (CLAUDE.md §7, DATA_MODEL.md "Derived,
 * not stored" > media counts). It is a census of the frames this very page is
 * rendering, taken by the route, so the header and the grid cannot disagree
 * about how many photographs there are - which a stored total eventually
 * would.
 *
 * THE TITLE IS THE ROUTE'S ONLY `<h1>`. A gallery is a page in its own right
 * rather than a view over the book, so it owes a level-one heading of its own
 * - `page-has-heading-one` is a requirement here, not vendor noise
 * (`e2e/a11y.spec.ts` runs axe over this route with no exclusions).
 * Depends on: react, `GalleryJourney` (@travel-diary/domain/gallery),
 * ./gallery.module.css.
 */
import type { GalleryJourney } from '@travel-diary/domain/gallery'
import type React from 'react'
import styles from './gallery.module.css'

/** How much a gallery holds, as its header prints it. */
export interface GalleryCensus {
  readonly photographs: number
  readonly clips: number
}

/** What the header needs to print itself. */
export interface GalleryHeaderProps {
  /** The journey this gallery belongs to. */
  readonly journey: GalleryJourney
  /** The census of the frames this page is rendering - see this module's header. */
  readonly counts: GalleryCensus
  /**
   * The `/p/<n>` the back control points at, already resolved by
   * `returningPagePath` from the route's own `from` query - never `/`, and
   * never computed here.
   */
  readonly returnTo: string
}

/**
 * Pluralises a count the way the prototype's own header does.
 * @param count - How many of the thing there are.
 * @param singular - The noun in its singular form.
 * @returns e.g. `'61 photos'`, `'1 photo'`.
 */
const countOf = (count: number, singular: string): string =>
  `${String(count)} ${singular}${count === 1 ? '' : 's'}`

/**
 * Renders the gallery's header bar.
 *
 * @param props - The journey, the census of its frames, and where the back control leads.
 * @returns The header, with the back control, the title and the count.
 * @example
 * <GalleryHeader journey={bundle.journey} counts={{ photographs: 61, clips: 0 }} returnTo="/p/9" />
 */
export const GalleryHeader = ({ journey, counts, returnTo }: GalleryHeaderProps): React.JSX.Element => {
  // A journey with no `place` prints the dates alone rather than a leading
  // separator: `journeys.place` is not `required: true`, so a blank one is an
  // ordinary editorial state - the same policy `Cover.tsx` applies.
  const meta = [journey.place, journey.dates].filter((part) => part !== '').join(' · ')

  return (
    <header className={styles.header}>
      <a className={styles.back} data-back-to-book href={returnTo}>
        <span className={styles.backArrow} aria-hidden="true">
          &larr;
        </span>{' '}
        Back to the diary
      </a>

      <div className={styles.headerTitles}>
        <p className={styles.eyebrow} data-eyebrow>
          Full gallery
        </p>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>{journey.name}</h1>
          <p className={styles.headerMeta} data-gallery-meta>
            {meta}
          </p>
        </div>
      </div>

      <p className={styles.count} data-gallery-count>
        {countOf(counts.photographs, 'photo')} · {countOf(counts.clips, 'clip')}
      </p>
    </header>
  )
}
