'use client'
/**
 * MobileDiary — the diary as a phone reads it: SCREENS.md §1.10's whole surface.
 *
 * REPLACES THE BOOK, DOES NOT WRAP IT. §1.10 opens "No book, no flip, no
 * scaling", and this component is a different tree from `Book.tsx` down to the
 * stylesheet: no 1300x860 design box, no `transform: scale()`, no leaves, no
 * page stack, no `useFlip`. Sharing a DOM with the book would have produced a
 * scaled book fighting a scrolling column, which is why the choice between
 * them is made before either is rendered - on the server, from a viewport hint
 * (`@travel-diary/domain/readingSurface`, and
 * `docs/adr/0011-two-reading-surfaces-chosen-on-the-server.md`). Exactly one
 * of the two surfaces is in any document, so a phone reader never downloads
 * the book's markup and a desktop reader never downloads this.
 *
 * IT DOES NOT RENDER THE PAGE, IT IS HANDED IT. The `/p/<n>` route renders one
 * `<MobilePage>` on the server and passes it in as `children`; this file owns
 * the chrome around it and never learns what is printed on it. Same seam, same
 * measured reason as `Book.tsx`'s: this is the surface's `'use client'`
 * boundary, and a page component imported here would ship its code, its
 * captions' markup and its stylesheet's class map to the browser
 * (`docs/adr/0007-server-rendered-page-faces.md`).
 *
 * A PAGE CHANGE IS A NAVIGATION HERE, and that is the structural difference
 * from the book rather than a shortcut. The book turns pages inside one
 * document because a 900ms 3D flip cannot survive its own subtree being
 * unmounted, and everything ADR 0009 records - the served content window, the
 * request for the rest of the book, the held move at the window's edge, the
 * `history.replaceState` that keeps the address honest - exists to protect
 * that. None of it applies to a scrolling column: there is no animation in
 * flight, no measured scale and no flip machine to lose, so `/p/<n>` is
 * reached by pressing a link. THE CONSEQUENCE IS THAT THIS SURFACE'S DOCUMENT
 * CARRIES ONE PAGE, not a window of seven - it is the smallest document the
 * diary serves, and the reader who arrives on a deep link, reads it and leaves
 * fetches nothing else at all.
 *
 * FOUR TRIGGERS, ONE DESTINATION. The bottom bar's two 52px arrows, a swipe,
 * the drawer's thirteen tabs and the Cover's "Start reading" all end at a
 * `/p/<n>`. Three of the four are real `<a href>` elements and work before any
 * script has run; the swipe is the one that cannot be, and it is the only
 * reason this component needs `useRouter`.
 *
 * THE ARROWS ARE 52px, NOT THE BOOK'S 44px. §1.10 specifies them larger than
 * the handoff's own hit-target minimum, and `--td-min-nav-button` is the token
 * that carries the distinction.
 *
 * AT THE ENDS OF THE BOOK AN ARROW IS DISABLED RATHER THAN ABSENT, for the
 * reason `BottomBar.tsx` and `EdgeStrip.tsx` both record: an arrow that
 * vanished would move the other one, and a control that moves under the thumb
 * is worse than one that is visibly spent. That is why the two arrows render
 * as a `<button disabled>` at the ends and an `<a>` everywhere else - the
 * alternative, an anchor with no `href`, is not focusable, which is a worse
 * answer for the reader this distinction is for.
 *
 * A SWIPE AT EITHER END DOES NOTHING, and the same two bounds decide that as
 * decide the arrows. `previousIndex`/`nextIndex` are computed once and read by
 * both, so a swipe cannot navigate somewhere an arrow refuses to go.
 *
 * THE DRAWER IS A MODAL, AND FOCUS RESTORATION IS THIS FILE'S JOB. The drawer
 * traps Tab, names itself and closes on Escape (`BookmarkDrawer.tsx`); putting
 * focus back on the burger has to happen here, because by the time it must the
 * drawer is unmounted - the same division `Grid.tsx` and `Lightbox.tsx` use.
 * Depends on: react, next/link, next/navigation, `RailTab`
 * (@travel-diary/domain/bookBundle), `pagePath`
 * (@travel-diary/domain/pageAddress), `PageTurn` (@travel-diary/domain/swipe),
 * ./MobileHeader, ./BookmarkDrawer, ./useSwipe, ./mobile.module.css.
 */
import type { RailTab } from '@travel-diary/domain/bookBundle'
import { pagePath } from '@travel-diary/domain/pageAddress'
import type { PageTurn } from '@travel-diary/domain/swipe'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type React from 'react'
import { useCallback, useRef, useState } from 'react'
import { BookmarkDrawer } from './BookmarkDrawer'
import { MobileHeader } from './MobileHeader'
import styles from './mobile.module.css'
import { useSwipe } from './useSwipe'

/** What the mobile reading mode needs to render itself. */
export interface MobileDiaryProps {
  /** The book's own title, for the header's eyebrow. */
  readonly bookTitle: string
  /** This page's short name, from `mobileHeading` - e.g. `'Tokyo'`. */
  readonly heading: string
  /** This page's full label, from `derivePageLabels` - e.g. `'Tokyo — Frames I'`. */
  readonly label: string
  /** The rail, already labelled, spanned and filtered by `deriveRail` on the server. */
  readonly bookmarks: readonly RailTab[]
  /** The 0-based page the reader is on, from the `/p/<n>` URL. */
  readonly pageIndex: number
  /** How many pages the book has. */
  readonly totalPages: number
  /** The one server-rendered `<MobilePage>` this document carries. */
  readonly children: React.ReactNode
}

/**
 * Renders the mobile reading mode: the header, the scrolling page, the bottom
 * bar and - when the reader asks for it - the bookmark drawer.
 *
 * @param props - Where the reader is, the labelled rail, and the page to draw.
 * @returns The whole surface, as the document's `<main>`.
 * @example
 * <MobileDiary bookTitle="Wanderings" heading="Tokyo" label="Tokyo — Notes" bookmarks={rail} pageIndex={2} totalPages={33}>
 *   <MobilePage ... />
 * </MobileDiary>
 */
export const MobileDiary = ({
  bookTitle,
  heading,
  label,
  bookmarks,
  pageIndex,
  totalPages,
  children,
}: MobileDiaryProps): React.JSX.Element => {
  const router = useRouter()
  const burger = useRef<HTMLButtonElement>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  // The book's two ends, computed once and read by both the arrows and the
  // swipe - see this file's header.
  const previousIndex = pageIndex > 0 ? pageIndex - 1 : null
  const nextIndex = pageIndex + 1 < totalPages ? pageIndex + 1 : null

  const turn = useCallback(
    (direction: PageTurn): void => {
      const target = direction === 'forward' ? nextIndex : previousIndex
      if (target === null) return

      router.push(pagePath(target))
    },
    [nextIndex, previousIndex, router],
  )

  const swipe = useSwipe(turn)

  const openDrawer = useCallback((): void => {
    setDrawerOpen(true)
  }, [])

  const closeDrawer = useCallback((): void => {
    setDrawerOpen(false)
    // Focus goes back where the reader left it. See this file's header for why
    // it is restored here rather than inside the drawer.
    burger.current?.focus()
  }, [])

  return (
    <main className={styles.diary} data-reading-surface="mobile">
      <MobileHeader
        bookTitle={bookTitle}
        heading={heading}
        pageNumber={pageIndex + 1}
        totalPages={totalPages}
        drawerOpen={drawerOpen}
        onOpenDrawer={openDrawer}
        burgerRef={burger}
      />

      {/* The swipe listens here, on the scrolling column itself, because that
          is the element the reader's thumb is on. `shouldTurnPage` is what
          keeps a scroll from turning a leaf; see `useSwipe.ts`.

          IT IS A NAMED, FOCUSABLE REGION, and that is a real defect fixed
          rather than decoration: a scrollable element whose content holds
          nothing focusable cannot be scrolled from a keyboard at all. The
          About page is exactly that page - it is the one page in the book with
          nothing clickable on it (`../pages/About.tsx`) - and axe found it
          (`scrollable-region-focusable`, impact serious) on `/p/33` at the
          mobile project. `tabIndex={0}` makes the column a tab stop, and the
          `region` role plus the page's own label is what stops that tab stop
          being an unnamed one. */}
      <div
        data-mobile-content=""
        className={styles.content}
        role="region"
        aria-label={label}
        tabIndex={0}
        onTouchStart={swipe.onTouchStart}
        onTouchEnd={swipe.onTouchEnd}
      >
        {children}
      </div>

      <div className={styles.bar}>
        {previousIndex === null ? (
          <button type="button" data-nav="prev" className={styles.navButton} aria-label="Previous page" disabled>
            <span aria-hidden="true">&#8592;</span>
          </button>
        ) : (
          <Link data-nav="prev" className={styles.navButton} aria-label="Previous page" href={pagePath(previousIndex)}>
            <span aria-hidden="true">&#8592;</span>
          </Link>
        )}

        <p data-page-label="" className={styles.barLabel}>
          {label}
        </p>

        {nextIndex === null ? (
          <button type="button" data-nav="next" className={styles.navButton} aria-label="Next page" disabled>
            <span aria-hidden="true">&#8594;</span>
          </button>
        ) : (
          <Link data-nav="next" className={styles.navButton} aria-label="Next page" href={pagePath(nextIndex)}>
            <span aria-hidden="true">&#8594;</span>
          </Link>
        )}
      </div>

      {drawerOpen && <BookmarkDrawer tabs={bookmarks} pageIndex={pageIndex} onClose={closeDrawer} />}
    </main>
  )
}
