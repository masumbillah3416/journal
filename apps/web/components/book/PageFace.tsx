/**
 * PageFace — the content one leaf's front face carries.
 *
 * Presentational component over the `BookBundle` DTO (CLAUDE.md §3.3): it
 * receives an already-derived {@link BookPage} and renders it, deriving
 * nothing of its own. Its label comes from `pageLabel` and its Contents rows
 * from `deriveContents`, both in `@travel-diary/domain/bookBundle`, so the
 * page numbers here are the same ones the bottom bar's counter will use.
 *
 * SCOPE. This task binds the flip machine to the DOM; the pages' own designed
 * layouts - Cover, Contents, Notes, Frames I/II and About, every measurement
 * of them absolute in SCREENS.md §1 - are Tasks 9 to 11, which replace this
 * component's per-kind bodies. What is here is real content, never a
 * placeholder string: each page is named with the label the domain derives
 * for it, and Contents renders its real entries as real anchors. The anchors
 * are the point. `e2e/book.spec.ts` clicks one to prove a back face is not
 * swallowing it, and a stub with nothing clickable on it would have made that
 * proof vacuous.
 *
 * Contents rows are plain `/p/<n>` anchors rather than in-book flips because
 * the handoff requires the deep links to be real, indexable paths; wiring
 * them (and the bookmark rail) into an animated jump is Task 8's trigger
 * work.
 * Depends on: `BookPage`/`ContentsEntry`/`pageLabel` (@travel-diary/domain/bookBundle),
 * ./book.module.css.
 */
import { pageLabel, type BookPage, type ContentsEntry } from '@travel-diary/domain/bookBundle'
import type React from 'react'
import styles from './book.module.css'

/** What one page face needs to render itself. */
export interface PageFaceProps {
  /** The page this face shows, from the bundle's reading sequence. */
  readonly page: BookPage
  /** The book's Contents index, rendered only on the Contents page. */
  readonly contents: readonly ContentsEntry[]
}

/**
 * Renders the content of a single page.
 *
 * @param props - The page to render and the book's Contents index.
 * @returns The page's heading, its meta line where it has one, and the
 *   Contents index on the Contents page.
 */
export const PageFace = ({ page, contents }: PageFaceProps): React.JSX.Element => (
  <article className={styles.page}>
    <h1 className={styles.pageTitle}>{pageLabel(page)}</h1>

    {page.kind === 'contents' && (
      <ol className={styles.contentsList}>
        {contents.map((entry) => (
          <li key={entry.journeyId}>
            <a className={styles.contentsLink} href={`/p/${String(entry.pageNumber)}`}>
              {entry.name} — {entry.place}
            </a>
          </li>
        ))}
      </ol>
    )}

    {(page.kind === 'notes' || page.kind === 'frames-i' || page.kind === 'frames-ii') && (
      <p className={styles.pageMeta}>
        {page.place} · {page.dates}
      </p>
    )}
  </article>
)
