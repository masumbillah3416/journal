/**
 * LiveBookCard — SCREENS.md §2.1's "The book, live": a 78x104px cloth chip
 * carrying the fitted title and the years, beside a summary line, the publish
 * date and Open live / Copy link.
 *
 * ═══ THE CHIP HAS ITS OWN FITTER, AND THAT IS NOT A DETAIL ═══
 *
 * `readOverview` hands over `titleSizePx`, which is `fitChipTitleSize`'s
 * answer for a 78px box. It is NOT §2.7's `fitPreviewTitleSize`, whose box is
 * 172px: that fitter answers 32px for a ten-character title, which the width
 * model puts at 128px inside 62px of room. `.chipTitle`'s ellipsis would hide
 * every pixel of that overflow, which is exactly why `e2e/admin.spec.ts`
 * measures `scrollWidth <= clientWidth` rather than a bounding rect — a rect is
 * clamped to the chip at any font size (Task 10's cover preview, three
 * attempts).
 *
 * The size arrives as a CUSTOM PROPERTY rather than as `fontSize`, the shape
 * `CoverPreview.tsx` and `ChangesCard.tsx` both use: it is the card's own datum
 * and the only spelling a jsdom case can read back.
 *
 * ═══ "OPEN LIVE" IS `pagePath(0)`, THROUGH THE ONE MODULE THAT OWNS IT ═══
 *
 * `DIARY_PATH` comes from `SignedInStep.tsx`, which is where it is declared —
 * the diary is served at `/p/<n>` and its root has never been mounted, so the
 * address is derived rather than written out. `PanelHome.tsx` carried a SECOND
 * declaration of the same constant until this screen replaced it; a third
 * `pagePath(0)` here is the duplication `lib/auth/resetPath.test.ts` exists to
 * refuse.
 *
 * ═══ ONE CLIENT ISLAND HANGS OFF THIS CARD, AND IT IS THE COPY BUTTON ═══
 *
 * `CopyLink.tsx`. Everything else here is server-rendered; see that file for
 * why a clipboard write cannot be anything else.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. A card.
 * Depends on: react, `DIARY_PATH` (../SignedInStep), `LiveBook`
 * (../../../lib/admin/readOverview), ./CopyLink, ./overview.module.css.
 */
import type React from 'react'
import type { LiveBook } from '../../../lib/admin/readOverview'
import { DIARY_PATH } from '../SignedInStep'
import { CopyLink } from './CopyLink'
import styles from './overview.module.css'

/** What the card draws. */
export interface LiveBookCardProps {
  /** The book as `readOverview` reports it. */
  readonly book: LiveBook
}

/**
 * Renders SCREENS.md §2.1's "The book, live" card.
 *
 * @param props - See {@link LiveBookCardProps}.
 * @returns The chip, the summary, the publish date and the two controls.
 * @example
 * <LiveBookCard book={view.book} />
 */
export const LiveBookCard = ({ book }: LiveBookCardProps): React.JSX.Element => (
  <section data-overview-book className={styles.card}>
    <h2 className={styles.eyebrow}>The book, live</h2>

    <div className={styles.bookBody}>
      <div
        data-book-chip
        className={styles.chipCover}
        style={{ '--td-overview-cloth': book.cloth } as React.CSSProperties}
      >
        <span
          data-book-chip-title
          className={styles.chipTitle}
          style={{ '--td-overview-chip-title': `${String(book.titleSizePx)}px` } as React.CSSProperties}
        >
          {book.title}
        </span>
        <span data-book-chip-years className={styles.chipYears}>
          {book.years}
        </span>
      </div>

      <div className={styles.bookFacts}>
        <p data-book-summary className={styles.bookSummary}>
          {book.summary}
        </p>
        {/* "Published null" is the shape a template with no empty arm prints,
         * and a book that has never gone out is the state a new diary is in. */}
        <p data-book-published className={styles.bookPublished}>
          {book.publishedAt === null ? 'Never published' : `Published ${book.publishedAt}`}
        </p>

        <div className={styles.bookActions}>
          <a data-book-open className={styles.secondary} href={DIARY_PATH}>
            Open live
          </a>
          <CopyLink href={DIARY_PATH} />
        </div>
      </div>
    </div>
  </section>
)
