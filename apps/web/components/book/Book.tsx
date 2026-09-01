'use client'
/**
 * Book — the diary's book: frame, scaled design box, page stack and triggers.
 *
 * Composition root for the reading surface, and the single `'use client'`
 * boundary of the diary. It owns three pieces of browser state and nothing
 * else: where the flip machine is (`useFlip`), how big the book should be
 * drawn (`useBookScale`), and whether the reader has asked for reduced motion
 * (`usePrefersReducedMotion`). Everything it renders from is derived elsewhere
 * - the reading sequence by `readBookBundle`/`derivePages` on the server, the
 * per-leaf geometry by `leafPresentation`, the scale by `bookScale`, the
 * counter by `pageCounter`, the URL by `pagePath` - so this file contains no
 * arithmetic of its own to get wrong.
 *
 * The book is authored at exactly 1300x860 and drawn with
 * `transform: scale(k)`, never resized. That is what makes every measurement
 * in SCREENS.md absolute and the page behave like a printed one; it also
 * keeps the CLS budget safe by construction, since a transform takes no part
 * in layout (CLAUDE.md §6).
 *
 * FIVE TRIGGERS, ONE MACHINE. The handoff (README, "Triggers") lists the
 * 44px right page-edge strip, the 30px left strip, the bottom prev/next
 * arrows, ArrowLeft/ArrowRight and PageUp/PageDown, and the bookmark tabs.
 * Every one of them ends at `turnTo` or `jumpTo` and nowhere else. None of
 * them guards itself against a turn already in flight, because the machine's
 * own latch already swallows a mid-flip request (`packages/domain/src/flip.ts`)
 * - a second guard here would be duplicated logic that could disagree with
 * it, and the handoff's defect log records a seized book as the failure that
 * matters. The tabs go to `jumpTo` rather than `turnTo` because a jump has to
 * be anchored one page from its target first; see `useFlip.ts` for why.
 *
 * THE URL IS WRITTEN ON EVERY PAGE CHANGE, from one effect keyed on the
 * machine's committed index - which is the only moment the reader's page
 * actually changes, whether that came from a turn, a bookmark jump or an
 * instant reduced-motion change. `history.replaceState` rather than a router
 * navigation: a navigation would re-render the route and take the book's own
 * state with it, which is the difference between writing the address and
 * throwing the reading position away. It replaces rather than pushes so that
 * reading thirty pages does not bury the page the reader arrived from under
 * thirty history entries.
 *
 * SCOPE. The bookmark rail, bottom bar and page counter are rendered here
 * because Task 8's triggers are useless without something to click, but only
 * their BEHAVIOUR is finished: their designed appearance (SCREENS.md §1.7 -
 * the 158px rail with its tint bars and active-tab shift, the 44px circular
 * arrows, the counter over its page label, the spine ribbon) is Task 12, and
 * so is the mobile reading mode below 860px. Metadata,
 * `generateStaticParams` and the out-of-range 404 are Task 13.
 * Depends on: react, `BookBundle`/`pageCounter`/`pageLabel`
 * (@travel-diary/domain/bookBundle), `pagePath` (@travel-diary/domain/pageAddress),
 * `leafPresentation` (@travel-diary/domain/pageStack), ./useFlip, ./useTurnKeys,
 * ./useBookScale, ./EdgeStrip, ./Leaf, ./PageFace, ./book.module.css.
 */
import { pageCounter, pageLabel, type BookBundle } from '@travel-diary/domain/bookBundle'
import { pagePath } from '@travel-diary/domain/pageAddress'
import { leafPresentation } from '@travel-diary/domain/pageStack'
import type React from 'react'
import { useCallback, useEffect, useRef } from 'react'
import styles from './book.module.css'
import { EdgeStrip } from './EdgeStrip'
import { Leaf } from './Leaf'
import { PageFace } from './PageFace'
import { useBookScale } from './useBookScale'
import { DEFAULT_FLIP_DURATION_MS, useFlip, usePrefersReducedMotion } from './useFlip'
import { useTurnKeys } from './useTurnKeys'

/** What the book needs to render itself. */
export interface BookProps {
  /** The reading sequence, Contents index and bookmark rail, assembled on the server. */
  readonly bundle: BookBundle
  /** The 0-based page the reader opens on, from the `/p/<n>` URL. */
  readonly initialIndex: number
}

/**
 * Renders the whole book: the board, spine, fore-edge and page stack, scaled
 * as one to fit whatever area it is given, plus every trigger a reader turns
 * it with.
 *
 * @param props - The book's content bundle and the page to open on.
 * @returns The diary's reading surface.
 * @example
 * <Book bundle={await readBookBundle()} initialIndex={2} />
 */
export const Book = ({ bundle, initialIndex }: BookProps): React.JSX.Element => {
  const bookArea = useRef<HTMLDivElement | null>(null)
  const scale = useBookScale(bookArea)
  const reducedMotion = usePrefersReducedMotion()
  const totalPages = bundle.pages.length
  const { state, turnTo, jumpTo, canGoBack, canGoForward } = useFlip(initialIndex, {
    durationMs: DEFAULT_FLIP_DURATION_MS,
    reducedMotion,
    totalPages,
  })

  const turnForward = useCallback((): void => {
    turnTo(state.index + 1)
  }, [turnTo, state.index])

  const turnBackward = useCallback((): void => {
    turnTo(state.index - 1)
  }, [turnTo, state.index])

  useTurnKeys({ onForward: turnForward, onBackward: turnBackward })

  useEffect(() => {
    // See this file's header: `replaceState`, not a router navigation, and
    // keyed on the committed index so it fires once per page change rather
    // than once per animation frame.
    window.history.replaceState(null, '', pagePath(state.index))
  }, [state.index])

  return (
    <main className={styles.stage}>
      <div ref={bookArea} className={styles.bookArea}>
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
                presentation={leafPresentation(index, state, totalPages)}
                durationMs={DEFAULT_FLIP_DURATION_MS}
              >
                <PageFace page={page} contents={bundle.contents} />
              </Leaf>
            ))}
          </div>

          {/* Siblings of the stack, not of the leaves - see
              `book.module.css`'s HANDOFF-DEVIATION at `.edgeLeft`, and
              docs/deviations.md §8. */}
          <EdgeStrip edge="left" canTurn={canGoBack} onTurn={turnBackward} />
          <EdgeStrip edge="right" canTurn={canGoForward} onTurn={turnForward} />
        </div>
      </div>

      <div className={styles.bottomBar}>
        <button
          type="button"
          data-nav="prev"
          className={styles.navButton}
          aria-label="Previous page"
          disabled={!canGoBack}
          onClick={turnBackward}
        >
          &#8249;
        </button>

        <p data-counter="" className={styles.counter}>
          {pageCounter(state.index + 1, totalPages)}
        </p>

        <button
          type="button"
          data-nav="next"
          className={styles.navButton}
          aria-label="Next page"
          disabled={!canGoForward}
          onClick={turnForward}
        >
          &#8250;
        </button>
      </div>

      <nav className={styles.rail} aria-label="Bookmarks">
        {bundle.bookmarks.map((tab) => {
          // A tab is addressed by the page it opens, never by its position in
          // the rail (CLAUDE.md §7). `bundle` crosses a serialization
          // boundary, so a rail that disagrees with the reading sequence is a
          // state this client can be handed; such a tab renders nothing rather
          // than taking the whole rail down with it.
          const page = bundle.pages[tab.startIndex]
          if (page === undefined) return null

          return (
            <button
              key={tab.startIndex}
              type="button"
              data-bookmark={tab.startIndex}
              className={styles.bookmarkTab}
              onClick={() => {
                jumpTo(tab.startIndex)
              }}
            >
              {pageLabel(page)}
            </button>
          )
        })}
      </nav>
    </main>
  )
}
