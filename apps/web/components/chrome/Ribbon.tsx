/**
 * Ribbon — the cloth bookmark hanging off the top of the book (SCREENS.md §1.7).
 *
 * Presentational component (CLAUDE.md §3.3) with no props and no state: every
 * measurement it has — 22px wide, a third of the page tall, `top: -7px;
 * left: 42px`, the notched `clip-path` and the drop shadow — is CSS, and
 * lives in `chrome.module.css` beside the rest of §1.7. This file exists to
 * give that geometry a name, a stable selector for the browser test, and the
 * two attributes CSS cannot carry.
 *
 * IT IS `pointer-events: none`, AND THAT IS THE POINT OF IT. The ribbon is the
 * one piece of chrome that lies OVER the page rather than beside it, so
 * without that rule it swallows every click inside its own 22px column — the
 * same silent failure `book.module.css`'s rule 2 records for the back face,
 * which cost this project a debugging session. The rule is in the stylesheet;
 * `e2e/chrome.spec.ts` hit-tests the rendered element and fails if anything
 * but the page beneath it answers.
 *
 * IT IS `aria-hidden`. A strip of cloth is decoration: it carries no text, it
 * cannot be operated, and a screen reader announcing it would be announcing
 * furniture.
 *
 * IT IS DRAWN ONLY WHEN THE BOOK'S DECORATIONS ARE ON. The prototype puts it
 * behind the same `decorations` flag as the cover's washi strip and airmail
 * stamp (`handoff/design_handoff_travel_diary/Travel Diary.dc.html`), so
 * `Book.tsx` renders it conditionally from `chrome.showDecorations` rather
 * than this file deciding for itself — an editor who turns the book's
 * decorations off turns off all of them.
 * Depends on: react, ./chrome.module.css.
 */
import type React from 'react'
import styles from './chrome.module.css'

/**
 * Renders the spine ribbon over the top-left of the page area.
 *
 * @returns The ribbon, decorative and click-through.
 * @example
 * {showDecorations && <Ribbon />}
 */
export const Ribbon = (): React.JSX.Element => <div data-ribbon="" className={styles.ribbon} aria-hidden="true" />
