/**
 * PageFace — the content one leaf's front face carries.
 *
 * Presentational component over the `BookBundle` DTO (CLAUDE.md §3.3): it
 * receives an already-derived {@link BookPage} and renders it, deriving
 * nothing of its own. Its label comes from `pageLabel` and its Contents rows
 * from `deriveContents`, both in `@travel-diary/domain/bookBundle`, so the
 * page numbers here are the same ones the bottom bar's counter will use.
 *
 * EVERY PAGE KIND NOW REACHES A DESIGNED PAGE, and this component is
 * therefore a pure dispatch with no fallback body of its own. Cover and
 * Contents landed in Task 9, Notes in Task 10, and Frames I/II and About in
 * Task 11; the exhaustive `switch` below is what makes a future seventh page
 * kind a compile error here rather than a blank face at runtime.
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
 * chunk went from 19,930 bytes to 8,042 (6,400 to 3,646 over the wire) when
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
 * Depends on: `BookPage`/`ContentsEntry`/`AboutContent`/`BookChrome`
 * (@travel-diary/domain/bookBundle), ../pages/Cover, ../pages/Contents,
 * ../pages/Notes, ../pages/FramesI, ../pages/FramesII, ../pages/About.
 */
import type { AboutContent, BookChrome, BookPage, ContentsEntry } from '@travel-diary/domain/bookBundle'
import type React from 'react'
import { About } from '../pages/About'
import { Contents } from '../pages/Contents'
import { Cover } from '../pages/Cover'
import { FramesI } from '../pages/FramesI'
import { FramesII } from '../pages/FramesII'
import { Notes } from '../pages/Notes'

/** What one page face needs to render itself. */
export interface PageFaceProps {
  /** The page this face shows, from the bundle's reading sequence. */
  readonly page: BookPage
  /** The book's Contents index, rendered only on the Contents page. */
  readonly contents: readonly ContentsEntry[]
  /** The `book` global's editor-supplied fields, printed by Cover and Contents. */
  readonly chrome: BookChrome
  /** The `about` global's editor-supplied content, printed by the About page. */
  readonly about: AboutContent
  /** The book's total page count, for the Contents footer's tally. */
  readonly totalPages: number
  /** Which leaf of the book this face is printed on, for the image window to look up. */
  readonly leafIndex: number
}

/**
 * Renders the content of a single page.
 *
 * @param props - The page to render, the book's Contents index, the book's
 *   chrome and About content, its total page count and the leaf it is
 *   printed on.
 * @returns The designed page for that kind. The `switch` is exhaustive over
 *   {@link BookPage}'s six kinds and returns from every arm, so a seventh
 *   kind added to the domain fails to compile here rather than rendering
 *   nothing.
 */
export const PageFace = ({
  page,
  contents,
  chrome,
  about,
  totalPages,
  leafIndex,
}: PageFaceProps): React.JSX.Element => {
  switch (page.kind) {
    case 'cover':
      return <Cover chrome={chrome} />
    case 'contents':
      return <Contents entries={contents} note={chrome.contentsNote} totalPages={totalPages} />
    case 'notes':
      return <Notes page={page} showDecorations={chrome.showDecorations} leafIndex={leafIndex} />
    case 'frames-i':
      return <FramesI page={page} showDecorations={chrome.showDecorations} leafIndex={leafIndex} />
    case 'frames-ii':
      return <FramesII page={page} showDecorations={chrome.showDecorations} leafIndex={leafIndex} />
    case 'about':
      return <About content={about} showDecorations={chrome.showDecorations} leafIndex={leafIndex} />
  }
}
