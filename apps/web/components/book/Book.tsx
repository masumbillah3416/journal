'use client'
/**
 * Book — the diary's book: frame, scaled design box and page stack.
 *
 * Composition root for the reading surface, and the single `'use client'`
 * boundary of the diary. It owns two pieces of browser state and nothing
 * else: where the flip machine is (`useFlip`) and how big the book should be
 * drawn (`useBookScale`). Everything it renders from is derived elsewhere -
 * the reading sequence by `readBookBundle`/`derivePages` on the server, the
 * per-leaf geometry by `leafPresentation`, the scale by `bookScale` - so this
 * file contains no arithmetic of its own to get wrong.
 *
 * The book is authored at exactly 1300x860 and drawn with
 * `transform: scale(k)`, never resized. That is what makes every measurement
 * in SCREENS.md absolute and the page behave like a printed one; it also
 * keeps the CLS budget safe by construction, since a transform takes no part
 * in layout (CLAUDE.md §6).
 *
 * SCOPE. This task binds the machine to the DOM. The triggers that drive it -
 * the page-edge strips, the bottom prev/next arrows, the keyboard and the
 * bookmark rail - are Task 8, and are the reason `turnTo`/`canGoBack`/
 * `canGoForward` exist on the controller `useFlip` returns but are not
 * consumed here yet. The bookmark rail, bottom bar and page counter that sit
 * OUTSIDE the scaled box are Task 12's chrome.
 * Depends on: react, `BookBundle` (@travel-diary/domain/bookBundle),
 * `leafPresentation` (@travel-diary/domain/pageStack), ./useFlip, ./useBookScale,
 * ./Leaf, ./PageFace, ./book.module.css.
 */
import type { BookBundle } from '@travel-diary/domain/bookBundle'
import { leafPresentation } from '@travel-diary/domain/pageStack'
import type React from 'react'
import { useRef } from 'react'
import styles from './book.module.css'
import { Leaf } from './Leaf'
import { PageFace } from './PageFace'
import { useBookScale } from './useBookScale'
import { DEFAULT_FLIP_DURATION_MS, useFlip, usePrefersReducedMotion } from './useFlip'

/** What the book needs to render itself. */
export interface BookProps {
  /** The reading sequence, Contents index and bookmark rail, assembled on the server. */
  readonly bundle: BookBundle
  /** The 0-based page the reader opens on, from the `/p/<n>` URL. */
  readonly initialIndex: number
}

/**
 * Renders the whole book: the board, spine, fore-edge and page stack, scaled
 * as one to fit whatever area it is given.
 *
 * @param props - The book's content bundle and the page to open on.
 * @returns The diary's reading surface.
 * @example
 * <Book bundle={await readBookBundle()} initialIndex={2} />
 */
export const Book = ({ bundle, initialIndex }: BookProps): React.JSX.Element => {
  const stage = useRef<HTMLDivElement | null>(null)
  const scale = useBookScale(stage)
  const reducedMotion = usePrefersReducedMotion()
  const { state } = useFlip(initialIndex, {
    durationMs: DEFAULT_FLIP_DURATION_MS,
    reducedMotion,
    totalPages: bundle.pages.length,
  })

  return (
    <main ref={stage} className={styles.stage}>
      <div data-design-box="" className={styles.designBox} style={{ transform: `scale(${String(scale)})` }}>
        <div className={styles.board} />
        <div data-spine="" className={styles.spine} />
        <div data-fore-edge="" className={styles.foreEdge} />

        <div data-stack="" className={styles.stack}>
          {bundle.pages.map((page, index) => (
            <Leaf
              // Index is the leaf's identity here, not a stand-in for one: the
              // reading sequence is a fixed, ordered stack of leaves rather
              // than a sortable list of rows, and leaf 3 is the third leaf of
              // the book whatever page happens to be printed on it.
              key={index}
              index={index}
              presentation={leafPresentation(index, state, bundle.pages.length)}
              durationMs={DEFAULT_FLIP_DURATION_MS}
            >
              <PageFace page={page} contents={bundle.contents} />
            </Leaf>
          ))}
        </div>
      </div>
    </main>
  )
}
