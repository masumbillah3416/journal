/**
 * Contents — the diary's index page, SCREENS.md §1.2 transcribed.
 *
 * Presentational component (CLAUDE.md §3.3) over the already-derived
 * {@link ContentsEntry} list. It derives nothing: the entries and their page
 * numbers come from `deriveContents`, and the column flow from
 * `contentsLayout` (`packages/domain/src/contentsLayout.ts`), which has its
 * own 100%-covered suite and its own record of where SCREENS.md §1.2
 * contradicts itself (docs/deviations.md §9). No hooks, no handlers, no
 * state — the page costs the diary route no interactivity.
 *
 * EVERY MEASUREMENT IS ABSOLUTE inside the 1300x860 design box; see
 * `contents.module.css`'s header.
 *
 * MULTI-COLUMN MODE CHANGES WHAT IS SHOWN, not just how it looks, which is
 * why the column count is domain logic rather than a media query. SCREENS.md
 * §1.2: each entry's name is "Caveat 36px single-column / 27px multi-column"
 * and its meta is "**hidden** in multi-column". The mode arrives as one
 * boolean from `isMultiColumn` and is published to the DOM as
 * `data-columns` / `data-compact`, so a browser test can assert the mode
 * rather than infer it from a measured font size.
 *
 * EVERY ROW IS A REAL ANCHOR to `/p/<n>`, not a click handler on a div — the
 * handoff requires the deep links to be real, indexable paths, and
 * `e2e/book.spec.ts`'s first case clicks one to prove no back face is
 * swallowing it. The prototype's `onClick` div would have failed both. The
 * dotted leader and the two rules are `aria-hidden`: a leader is a printing
 * convention, and read aloud between a journey's name and its page number it
 * is noise.
 * Depends on: react, `ContentsEntry` (@travel-diary/domain/bookBundle),
 * `contentsLayout`/`isMultiColumn` (@travel-diary/domain/contentsLayout),
 * ./contents.module.css.
 */
import type { ContentsEntry } from '@travel-diary/domain/bookBundle'
import { contentsLayout, isMultiColumn } from '@travel-diary/domain/contentsLayout'
import type React from 'react'
import styles from './contents.module.css'

/** What the Contents page needs to print itself. */
export interface ContentsProps {
  /** The index, already derived and numbered by `deriveContents`. */
  readonly entries: readonly ContentsEntry[]
  /** The right-aligned italic note in the header, from the `book` global. */
  readonly note: string
  /** The book's total page count, for the footer's "{n} pages so far". */
  readonly totalPages: number
}

/**
 * Renders the Contents page: its header, the column-flow index and the
 * footer's hint and page tally.
 *
 * @param props - The index entries, the header note and the book's page count.
 * @returns The Contents page.
 * @example
 * <Contents entries={bundle.contents} note={bundle.chrome.contentsNote} totalPages={bundle.pages.length} />
 */
export const Contents = ({ entries, note, totalPages }: ContentsProps): React.JSX.Element => {
  const grid = contentsLayout(entries.length)
  const compact = isMultiColumn(grid)

  return (
    <section data-page="contents" className={styles.contents}>
      <header className={styles.header}>
        <div className={styles.headerTitles}>
          <p className={styles.eyebrow}>Index</p>
          <h1 className={styles.heading}>Contents</h1>
        </div>
        {note !== '' && <p className={styles.note}>{note}</p>}
      </header>

      <ol
        data-contents-body=""
        data-columns={grid.columns}
        data-compact={compact ? 'true' : 'false'}
        className={styles.body}
        style={{
          // The track lists are the only values a stylesheet cannot hold:
          // they depend on how many journeys the book has. Both come straight
          // from `contentsLayout`, so the arithmetic is tested and this file
          // only spells it into CSS.
          gridTemplateColumns: `repeat(${String(grid.columns)}, 1fr)`,
          gridTemplateRows: `repeat(${String(grid.rows)}, 1fr)`,
        }}
      >
        {entries.map((entry, position) => (
          // Keyed by journey id, never by array position (CLAUDE.md §7).
          <li key={entry.journeyId} className={styles.row}>
            <a className={styles.link} href={`/p/${String(entry.pageNumber)}`}>
              <span className={styles.number}>{String(position + 1).padStart(2, '0')}</span>
              <span className={compact ? styles.nameCompact : styles.name}>{entry.name}</span>
              {!compact && (
                <span className={styles.meta}>
                  {entry.place} · {entry.dates}
                </span>
              )}
              <span aria-hidden="true" className={styles.leader} />
              <span className={styles.pageNumber}>p. {entry.pageNumber}</span>
            </a>
          </li>
        ))}
      </ol>

      <footer className={styles.footer}>
        <p className={styles.hint}>Tabs on the right jump anywhere · arrows or the page edge turn a leaf</p>
        <p className={styles.tally}>{totalPages} pages so far</p>
      </footer>
    </section>
  )
}
