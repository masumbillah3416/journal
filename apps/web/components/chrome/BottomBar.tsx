/**
 * BottomBar — the 58px bar under the book: two arrows and a readout
 * (SCREENS.md §1.7).
 *
 * Presentational component (CLAUDE.md §3.3). It holds no state and does no
 * arithmetic of its own: the `NN / NN` counter is `pageCounter`'s, from
 * `@travel-diary/domain/bookBundle`, and the line under it is one of
 * `derivePageLabels`' strings, derived on the server from the reading
 * sequence. Both are DERIVED, never stored (CLAUDE.md §7).
 *
 * THE PAGE LABEL IS WHY THIS COMPONENT EXISTS RATHER THAN JUST A COUNTER.
 * The sweep recorded it missing: "Also absent from the bottom bar: the page
 * label under the counter" (docs/qa/2026-09-01-diary-sweep.md, DIARY-005).
 * A reader eleven pages into a thirty-three page book learns "11 / 33" from
 * the counter and "Marrakech — Frames I" only from this line.
 *
 * `canGoBack`/`canGoForward` go to `disabled` rather than to a conditional
 * render, for the same reason `EdgeStrip` does it: an arrow that vanished at
 * the ends of the book would move the other one, and a control that moves
 * under the pointer is worse than one that is visibly spent.
 *
 * THE ARROW GLYPHS ARE `aria-hidden`. Each button already carries an
 * `aria-label` saying what it does; announcing the glyph as well would read
 * the arrow out after the label. They are also the prototype's own `←`/`→`
 * rather than the guillemets an earlier, behaviour-only version of this bar
 * used.
 * Depends on: react, `pageCounter` (@travel-diary/domain/bookBundle),
 * ./chrome.module.css.
 */
import { pageCounter } from '@travel-diary/domain/bookBundle'
import type React from 'react'
import styles from './chrome.module.css'

/** What the bottom bar needs to render itself. */
export interface BottomBarProps {
  /** The 1-based page the reader is on. */
  readonly pageNumber: number
  /** How many pages the book has, which sets the counter's zero padding. */
  readonly totalPages: number
  /** The label for this page, from `derivePageLabels` - e.g. `'Tokyo — Notes'`. */
  readonly label: string
  /** Whether there is a page behind this one. */
  readonly canGoBack: boolean
  /** Whether there is a page ahead of this one. */
  readonly canGoForward: boolean
  /** Called when the reader clicks the previous arrow. */
  readonly onBack: () => void
  /** Called when the reader clicks the next arrow. */
  readonly onForward: () => void
}

/**
 * Renders the bottom bar: the previous arrow, the counter over the page
 * label, and the next arrow.
 *
 * @param props - Where the reader is, how far the book runs, and what to do
 *   when either arrow is clicked.
 * @returns The bar, 58px tall, outside the scaled design box.
 * @example
 * <BottomBar pageNumber={3} totalPages={33} label="Tokyo — Notes" ... />
 */
export const BottomBar = ({
  pageNumber,
  totalPages,
  label,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
}: BottomBarProps): React.JSX.Element => (
  <div className={styles.bar}>
    <button
      type="button"
      data-nav="prev"
      className={styles.navButton}
      aria-label="Previous page"
      disabled={!canGoBack}
      onClick={onBack}
    >
      <span aria-hidden="true">&#8592;</span>
    </button>

    <div className={styles.readout}>
      <p data-counter="" className={styles.counter}>
        {pageCounter(pageNumber, totalPages)}
      </p>
      <p data-page-label="" className={styles.pageLabel}>
        {label}
      </p>
    </div>

    <button
      type="button"
      data-nav="next"
      className={styles.navButton}
      aria-label="Next page"
      disabled={!canGoForward}
      onClick={onForward}
    >
      <span aria-hidden="true">&#8594;</span>
    </button>
  </div>
)
