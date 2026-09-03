/**
 * BookmarkRail — the labelled column of tabs beside the book (SCREENS.md §1.7).
 *
 * Presentational component (CLAUDE.md §3.3) over two facts: the rail
 * `deriveRail` produced, and which page the reader is on. It decides nothing
 * else — in particular it does NOT decide which tab is active. That is
 * `isRailTabActive`, in `@travel-diary/domain/bookBundle`, reading the `span`
 * `deriveBookmarks` computed, so the drawn highlight and the reading
 * sequence's own idea of where a journey starts and ends cannot drift apart.
 * A rail that re-derived `[start, start + 3)` here would be the same
 * arithmetic written twice, in the one place a test cannot see it.
 *
 * IT RENDERS A NAVIGATION LANDMARK CONTAINING A LIST OF BUTTONS, and every
 * part of that sentence is deliberate. `<nav>` because thirteen tabs that
 * move the reader anywhere in the book are navigation; a list because a
 * screen reader should say how many bookmarks there are before reading them;
 * buttons rather than links because a tab does not navigate — it starts an
 * animated jump inside a book that then rewrites its own address (see
 * `Book.tsx`'s URL note). The active tab carries `aria-current="page"`, which
 * is what makes SCREENS.md §1.7's `#fbf6e9` lift legible to a reader who
 * cannot see it. The sweep found none of this: no active tab on any page, no
 * eyebrow (docs/qa/2026-09-01-diary-sweep.md, DIARY-005).
 *
 * THE LANDMARK IS NAMED BY ITS OWN VISIBLE EYEBROW rather than by an
 * `aria-label` repeating the same word. The eyebrow is on the screen, so it
 * is the name; `aria-labelledby` points at it and a screen reader announces
 * one "Bookmarks", not two.
 *
 * A TAB IS ADDRESSED BY THE PAGE IT OPENS, never by its position in the rail
 * (CLAUDE.md §7): `startIndex` is its `key`, its `data-bookmark` and the
 * argument it hands back. A rail whose tabs were keyed by array position
 * would re-key every tab the moment a journey were reordered or hidden.
 * Depends on: react, `RailTab`/`isRailTabActive`
 * (@travel-diary/domain/bookBundle), ./chrome.module.css.
 */
import { isRailTabActive, type RailTab } from '@travel-diary/domain/bookBundle'
import type React from 'react'
import styles from './chrome.module.css'

/**
 * The id the rail's `<nav>` borrows its accessible name from. A constant
 * rather than `useId`: one rail is drawn per document, and a fixed id is one
 * fewer hook on the diary's only client boundary.
 */
const EYEBROW_ID = 'bookmark-rail-eyebrow'

/** What the bookmark rail needs to render itself. */
export interface BookmarkRailProps {
  /** The rail, already labelled, spanned and filtered by `deriveRail` on the server. */
  readonly tabs: readonly RailTab[]
  /** The 0-based page the reader is on, which decides the one active tab. */
  readonly pageIndex: number
  /** Called with the 0-based page a tab opens when the reader clicks it. */
  readonly onJump: (startIndex: number) => void
}

/**
 * Renders the bookmark rail: the "Bookmarks" eyebrow over a scrolling column
 * of tabs, with the tab covering the reader's page lifted onto the page.
 *
 * @param props - The labelled rail, the page the reader is on, and what to do
 *   when a tab is clicked.
 * @returns The rail, as a named navigation landmark.
 * @example
 * <BookmarkRail tabs={bookmarks} pageIndex={state.index} onJump={jumpTo} />
 */
export const BookmarkRail = ({ tabs, pageIndex, onJump }: BookmarkRailProps): React.JSX.Element => (
  <nav className={styles.rail} aria-labelledby={EYEBROW_ID}>
    <p id={EYEBROW_ID} data-rail-eyebrow="" className={styles.eyebrow}>
      Bookmarks
    </p>

    <ul data-rail-tabs="" className={styles.tabs}>
      {tabs.map((tab) => {
        const active = isRailTabActive(tab, pageIndex)

        return (
          <li key={tab.startIndex}>
            <button
              type="button"
              data-bookmark={tab.startIndex}
              className={active ? `${String(styles.tab)} ${String(styles.tabActive)}` : styles.tab}
              aria-current={active ? 'page' : undefined}
              onClick={() => {
                onJump(tab.startIndex)
              }}
            >
              {/* The 6px tint bar. A journey paints it with its own accent —
                  editor data, not a design token — so that one value is
                  inline; the default for the three book-wide tabs, which have
                  no journey behind them, stays in the stylesheet. */}
              <span
                data-tab-tint=""
                className={styles.tabTint}
                style={tab.tint === undefined ? undefined : { background: tab.tint }}
              />
              <span className={styles.tabText}>
                <span data-tab-name="" className={styles.tabName}>
                  {tab.name}
                </span>
                <span data-tab-sub="" className={styles.tabSub}>
                  {tab.sub}
                </span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  </nav>
)
