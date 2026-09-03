/**
 * BookmarkDrawer — the mobile reading mode's bookmark panel, SCREENS.md §1.10.
 *
 * The book's 158px bookmark rail has nowhere to go on a 390px screen, so
 * §1.10 puts the same thirteen tabs behind the header's burger: a
 * `rgba(26,22,17,.5)` scrim at `z-index: 800` and an 82%-wide panel capped at
 * 320px at `810`.
 *
 * IT IS A REAL MODAL, and every clause of that costs a line here. `role="dialog"`
 * with `aria-modal="true"`, named by its own visible "Bookmarks" heading
 * rather than by an `aria-label` repeating the word; focus moved into it when
 * it opens; Tab trapped inside it while it is open; Escape closing it. Focus
 * RESTORATION is `MobileDiary.tsx`'s, not this component's, for the same
 * reason `Grid.tsx` owns the lightbox's: by the time focus has to go back to
 * the burger this component is unmounted. The lightbox
 * (`../gallery/Lightbox.tsx`) is the other modal in this product and this one
 * deliberately keeps its shape.
 *
 * EVERY TAB IS A REAL `/p/<n>` LINK, not a button with a handler. On this
 * surface a page change IS a navigation - there is no flip machine to anchor
 * and no in-book state to preserve (`MobileDiary.tsx`'s header) - so the
 * handoff's requirement that the deep links be real, indexable paths and the
 * simplest implementation are the same thing here. It is also what makes the
 * drawer work before any script has run.
 *
 * WHICH TAB IS ACTIVE IS NOT DECIDED HERE. `isRailTabActive`, from
 * `@travel-diary/domain/bookBundle`, reads the spans `deriveBookmarks`
 * computed - exactly as the book's own rail does, so the two surfaces cannot
 * disagree about where a journey starts and ends.
 *
 * THE SCRIM IS `aria-hidden` FURNITURE. It is a way to dismiss the drawer with
 * a thumb; a reader on a keyboard has Escape and the close button, which do
 * the same job and are announced. Exposing it would put an unlabelled control
 * between the drawer and the page behind it.
 *
 * A TAB ALSO CLOSES THE DRAWER, and that is not redundant with the navigation
 * it starts: tapping the tab for the page the reader is already on navigates
 * nowhere, and a drawer that stayed open after a tap looks broken.
 * Depends on: react, next/link, `RailTab`/`isRailTabActive`
 * (@travel-diary/domain/bookBundle), `pagePath`
 * (@travel-diary/domain/pageAddress), ./mobile.module.css.
 */
import { isRailTabActive, type RailTab } from '@travel-diary/domain/bookBundle'
import { pagePath } from '@travel-diary/domain/pageAddress'
import Link from 'next/link'
import type React from 'react'
import { useEffect, useRef } from 'react'
import styles from './mobile.module.css'

/**
 * The id the panel borrows its accessible name from. A constant rather than
 * `useId`: one drawer is drawn per document, and a fixed id is one fewer hook
 * on this surface's client boundary - the same reasoning `BookmarkRail.tsx`
 * records for the rail's eyebrow.
 */
const TITLE_ID = 'mobile-bookmarks-title'

/** Everything inside the panel a reader can Tab to. */
const FOCUSABLE = 'a[href], button:not([disabled])'

/** What the drawer needs to render itself. */
export interface BookmarkDrawerProps {
  /** The rail, already labelled, spanned and filtered by `deriveRail` on the server. */
  readonly tabs: readonly RailTab[]
  /** The 0-based page the reader is on, which decides the one active tab. */
  readonly pageIndex: number
  /** Called when the reader dismisses the drawer - by the close button, the scrim or Escape. */
  readonly onClose: () => void
}

/**
 * Renders the drawer: its scrim, and a panel carrying the "Bookmarks" heading,
 * a close button and the tab list.
 *
 * @param props - The labelled rail, the page the reader is on, and what to do
 *   when the drawer is dismissed.
 * @returns The scrim and the panel, as a modal dialog.
 * @example
 * <BookmarkDrawer tabs={bookmarks} pageIndex={2} onClose={close} />
 */
export const BookmarkDrawer = ({ tabs, pageIndex, onClose }: BookmarkDrawerProps): React.JSX.Element => {
  const panel = useRef<HTMLDivElement>(null)
  const close = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  // Focus moves into the panel once, when it opens. The close button rather
  // than the first tab: a reader who opened the drawer by accident should
  // reach the way out first.
  useEffect(() => {
    close.current?.focus()
  }, [])

  /** Keeps Tab inside the panel, which is what `aria-modal` promises. */
  const trapFocus = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Tab') return

    const controls = [...(panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])]
    const edge = event.shiftKey ? controls[0] : controls.at(-1)
    if (edge === undefined || document.activeElement !== edge) return

    event.preventDefault()
    ;(event.shiftKey ? controls.at(-1) : controls[0])?.focus()
  }

  return (
    <>
      <div data-drawer-scrim="" aria-hidden="true" className={styles.scrim} onClick={onClose} />

      <div
        data-drawer=""
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        ref={panel}
        className={styles.drawer}
        onKeyDown={trapFocus}
      >
        <div className={styles.drawerHeader}>
          <h2 id={TITLE_ID} className={styles.drawerTitle}>
            Bookmarks
          </h2>

          <button
            type="button"
            data-drawer-close=""
            ref={close}
            className={styles.drawerClose}
            aria-label="Close bookmarks"
            onClick={onClose}
          >
            <span aria-hidden="true">&#215;</span>
          </button>
        </div>

        <ul data-drawer-tabs="" className={styles.drawerTabs}>
          {tabs.map((tab) => {
            const active = isRailTabActive(tab, pageIndex)

            return (
              // Keyed by the page the tab opens, never by its position in the
              // rail (CLAUDE.md §7).
              <li key={tab.startIndex}>
                <Link
                  data-bookmark={tab.startIndex}
                  className={
                    active ? `${String(styles.drawerTab)} ${String(styles.drawerTabActive)}` : styles.drawerTab
                  }
                  aria-current={active ? 'page' : undefined}
                  href={pagePath(tab.startIndex)}
                  onClick={onClose}
                >
                  {/* The 6px tint bar. A journey paints it with its own
                      accent - editor data, not a design token - so that one
                      value is inline; the default for the three book-wide
                      tabs stays in the stylesheet. */}
                  <span
                    data-tab-tint=""
                    className={styles.drawerTabTint}
                    style={tab.tint === undefined ? undefined : { background: tab.tint }}
                  />
                  <span className={styles.drawerTabText}>
                    <span data-tab-name="" className={styles.drawerTabName}>
                      {tab.name}
                    </span>
                    <span data-tab-sub="" className={styles.drawerTabSub}>
                      {tab.sub}
                    </span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    </>
  )
}
