/**
 * MobileHeader — the dark bar over the mobile reading mode, SCREENS.md §1.10.
 *
 * Presentational component (CLAUDE.md §3.3): a burger, a two-line title block
 * and the page counter. It holds no state and does no arithmetic of its own -
 * the `NN / NN` counter is `pageCounter`'s and the name line is
 * `mobileHeading`'s, both from `@travel-diary/domain/bookBundle`, so the
 * numbers here and the ones the book's own bottom bar prints come from one
 * definition (CLAUDE.md §7: derive, never store).
 *
 * THE BURGER IS THE ONLY WAY TO THE BOOKMARKS ON THIS SURFACE. §1.10 has no
 * room for the book's 158px rail, so the thirteen tabs move into a drawer and
 * this 44px button is its door. It carries an `aria-label` and
 * `aria-expanded`, because three bars are a picture of a menu rather than a
 * word for one, and a reader who cannot see them still needs to know the
 * drawer is shut.
 *
 * THE THREE BARS ARE `aria-hidden`. They are the button's icon, and the button
 * already says what it does.
 *
 * THE TWO TITLE LINES ARE NOT HEADINGS. The page under this bar renders its
 * own `<h1>` (`MobilePage.tsx`), and a bar that repeated the page's name as a
 * second level-one heading would give every mobile document two of them. The
 * eyebrow is the book's title and the line under it is the page's short name,
 * which together are a label for where the reader is - so they are paragraphs,
 * and the `<header>` element is what says they are the surface's header.
 * Depends on: react, `pageCounter` (@travel-diary/domain/bookBundle),
 * ./mobile.module.css.
 */
import { pageCounter } from '@travel-diary/domain/bookBundle'
import type React from 'react'
import styles from './mobile.module.css'

/** What the mobile header needs to render itself. */
export interface MobileHeaderProps {
  /** The book's own title, printed as the tracked Courier eyebrow. */
  readonly bookTitle: string
  /** This page's short name, from `mobileHeading` - e.g. `'Tokyo'` or `'Contents'`. */
  readonly heading: string
  /** The 1-based page the reader is on. */
  readonly pageNumber: number
  /** How many pages the book has, which sets the counter's zero padding. */
  readonly totalPages: number
  /** Whether the bookmark drawer is currently open. */
  readonly drawerOpen: boolean
  /** Called when the reader presses the burger. */
  readonly onOpenDrawer: () => void
  /** Focus is returned here when the drawer closes - see `MobileDiary.tsx`. */
  readonly burgerRef: React.RefObject<HTMLButtonElement | null>
}

/**
 * Renders the header: the burger, the book title over this page's name, and
 * the page counter.
 *
 * @param props - Where the reader is, whether the drawer is open, and what to
 *   do when the burger is pressed.
 * @returns The header bar.
 * @example
 * <MobileHeader bookTitle="Wanderings" heading="Tokyo" pageNumber={3} totalPages={33} ... />
 */
export const MobileHeader = ({
  bookTitle,
  heading,
  pageNumber,
  totalPages,
  drawerOpen,
  onOpenDrawer,
  burgerRef,
}: MobileHeaderProps): React.JSX.Element => (
  <header className={styles.header}>
    <button
      type="button"
      data-burger=""
      ref={burgerRef}
      className={styles.burger}
      aria-label="Bookmarks"
      aria-expanded={drawerOpen}
      onClick={onOpenDrawer}
    >
      <span aria-hidden="true" className={styles.burgerBar} />
      <span aria-hidden="true" className={styles.burgerBar} />
      <span aria-hidden="true" className={styles.burgerBar} />
    </button>

    <div className={styles.headerTitles}>
      {/* An empty book title prints nothing rather than an empty line - the
          same policy `Cover.tsx` applies to every field on the `book` global,
          none of which is `required` in the schema. */}
      {bookTitle !== '' && (
        <p data-header-eyebrow="" className={styles.headerEyebrow}>
          {bookTitle}
        </p>
      )}
      <p data-header-name="" className={styles.headerName}>
        {heading}
      </p>
    </div>

    <p data-counter="" className={styles.headerCounter}>
      {pageCounter(pageNumber, totalPages)}
    </p>
  </header>
)
