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
 * component's per-kind bodies. Cover and Contents landed in Task 9 and Notes
 * in Task 10; Frames I/II and About are the two kinds the fallback below
 * still renders. What is there is real content, never a placeholder string:
 * each page is named with the label the domain derives for it. The anchors
 * are the point. `e2e/book.spec.ts` clicks one to prove a back face is not
 * swallowing it, and a stub with nothing clickable on it would have made that
 * proof vacuous.
 *
 * Contents rows are plain `/p/<n>` anchors rather than in-book flips because
 * the handoff requires the deep links to be real, indexable paths; wiring
 * them (and the bookmark rail) into an animated jump is Task 8's trigger
 * work.
 *
 * IT IS A SERVER COMPONENT, AND THAT IS THE POINT OF IT. The `/p/<n>` route
 * calls this once per page, on the server, and passes the thirty-three faces
 * into the client `<Book>` as children — so this file, `Cover`, `Contents`,
 * `Notes`, the four slot components and their three stylesheets' class maps
 * are all absent from the route's script bundle. Measured: the diary's client
 * chunk went from 19,930 bytes to 8,449 (6,400 to 3,348 over the wire) when
 * they left it. Do not add a hook, a handler or a `'use client'` to anything
 * this file reaches without re-reading `docs/adr/0007-server-rendered-page-faces.md`
 * — one of them is enough to pull the whole subtree back into the browser.
 *
 * IT CARRIES `leafIndex`, NOT THE IMAGE WINDOW. The window is a function of
 * where the flip machine is, which no server render can know; a face that
 * took it as a prop would freeze it at the page the reader arrived on. What a
 * photograph needs from this dispatch is only WHICH LEAF it is printed on —
 * `<Photograph>` looks the rest up in the context `Book.tsx` publishes. See
 * `../pages/Photograph.tsx`'s header.
 * Depends on: `BookPage`/`ContentsEntry`/`pageLabel` (@travel-diary/domain/bookBundle),
 * ../pages/Cover, ../pages/Contents, ../pages/Notes, ./book.module.css.
 */
import { pageLabel, type BookChrome, type BookPage, type ContentsEntry } from '@travel-diary/domain/bookBundle'
import type React from 'react'
import { Contents } from '../pages/Contents'
import { Cover } from '../pages/Cover'
import { Notes } from '../pages/Notes'
import styles from './book.module.css'

/** What one page face needs to render itself. */
export interface PageFaceProps {
  /** The page this face shows, from the bundle's reading sequence. */
  readonly page: BookPage
  /** The book's Contents index, rendered only on the Contents page. */
  readonly contents: readonly ContentsEntry[]
  /** The `book` global's editor-supplied fields, printed by Cover and Contents. */
  readonly chrome: BookChrome
  /** The book's total page count, for the Contents footer's tally. */
  readonly totalPages: number
  /** Which leaf of the book this face is printed on, for the image window to look up. */
  readonly leafIndex: number
}

/**
 * Renders the content of a single page.
 *
 * @param props - The page to render, the book's Contents index, the book's
 *   chrome, its total page count and the leaf it is printed on.
 * @returns The designed Cover or Contents page, or - for a page whose design
 *   is still a later task - the page's heading and its meta line.
 */
export const PageFace = ({ page, contents, chrome, totalPages, leafIndex }: PageFaceProps): React.JSX.Element => {
  if (page.kind === 'cover') return <Cover chrome={chrome} />

  if (page.kind === 'contents') {
    return <Contents entries={contents} note={chrome.contentsNote} totalPages={totalPages} />
  }

  if (page.kind === 'notes') {
    return <Notes page={page} showDecorations={chrome.showDecorations} leafIndex={leafIndex} />
  }

  return (
    <article className={styles.page}>
      <h1 className={styles.pageTitle}>{pageLabel(page)}</h1>

      {page.kind !== 'about' && (
        <p className={styles.pageMeta}>
          {page.place} · {page.dates}
        </p>
      )}
    </article>
  )
}
