'use client'
/**
 * Book — the diary's book: frame, scaled design box, page stack and triggers.
 *
 * Composition root for the reading surface. It owns three pieces of browser
 * state and nothing else: where the flip machine is (`useFlip`), how big the
 * book should be drawn (`useBookScale`), and whether the reader has asked for
 * reduced motion (`usePrefersReducedMotion`). Everything it renders from is
 * derived elsewhere - the reading sequence by `readBookBundle`/`derivePages`
 * on the server, the per-leaf geometry by `leafPresentation`, the scale by
 * `bookScale`, the counter by `pageCounter`, the labelled rail by
 * `deriveRail`, the URL by `pagePath` - so this file contains no arithmetic of
 * its own to get wrong.
 *
 * IT DOES NOT RENDER THE PAGES, IT IS HANDED THEM. The `/p/<n>` route renders
 * all thirty-three faces on the server and passes them in as `children`; this
 * file slots face `i` into leaf `i` and never learns what is printed on it.
 * That is why there is no `PageFace`, `Cover`, `Contents` or `Notes` import
 * below, and why `bundle` is not a prop: everything this component needs is
 * the rail (already labelled), the page the reader opens on, and the faces.
 * Handing it the whole `BookBundle` as well would serialize the book twice -
 * once as the rendered faces, once as the JSON they were rendered from - and
 * the measurement in `docs/adr/0007-server-rendered-page-faces.md` is what
 * settled that.
 *
 * THE PAGE COUNT IS THE NUMBER OF FACES IT WAS GIVEN, not a number passed
 * beside them. A book with thirty-three faces and a `totalPages` of thirty-two
 * is a state this component would otherwise have to be defended against; it
 * cannot arise if there is only one source for it.
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
 * `'use client'` HERE IS A HYDRATION BOUNDARY, NOT A RENDER BOUNDARY, and the
 * distinction is load-bearing for the design spec's §8: "the server assembles
 * one typed `BookBundle` and statically renders every page's content, so the
 * deep links are indexable". It does. Next.js server-renders a client
 * component's whole subtree into the initial HTML and ships JavaScript only to
 * make it interactive, so `<PageFace>` being imported here does NOT move the
 * pages' content into the browser. Verified rather than assumed, against a
 * production `next build` + `next start` with `curl` (no JavaScript executed):
 * `/p/1`, `/p/12` and `/p/33` each return ~64KB of HTML carrying all
 * thirty-three pages, the cover's own
 * `<h1 class="cover-module__title">Wanderings</h1>` among them. Re-run that
 * `curl` before acting on any claim that this file's `'use client'` costs the
 * deep links their SEO; it has been raised once already and did not survive
 * the measurement. What the boundary DID cost was script weight - the page
 * components used to be imported here, so their code was in the route's
 * bundle - and that is what passing the faces in as children removed. It
 * bought 3,052 bytes of script transfer and, over five Lighthouse runs each
 * side, nothing at all on LCP: 2,634ms before, 2,637ms after, render delay
 * 2,180ms both times. `docs/adr/0007-server-rendered-page-faces.md` carries
 * the numbers, and `docs/adr/0005-font-hosting.md` records that the headroom
 * this was expected to buy for a third font family did not appear.
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
 * THE IMAGE WINDOW IS WHY A BOOK OF 33 LEAVES IS AFFORDABLE. Every leaf is in
 * the document, and every leaf is absolutely positioned at `inset: 0`, so the
 * browser considers all thirty-three in the viewport and `loading="lazy"`
 * defers nothing - measured on `/p/1`, which fetched all 20 of the seeded
 * book's photographs (1,833,312 bytes) with the reader on the Cover and put
 * the LCP gate 669ms into the red. `leafPresentation.loadsImages` narrows that
 * to the open page, its two neighbours, and the leaves a turn departs from and
 * arrives at. This file PUBLISHES those thirty-three booleans on the
 * `ImageWindow` context and does nothing else with them; it cannot pass them
 * to the faces, because the faces were rendered on the server before this
 * component's flip machine existed, and a window frozen at the page the reader
 * arrived on is a broken window rather than a smaller one. `<Photograph>` -
 * the one client component under `components/pages/` - reads its own leaf's
 * entry. No component re-derives the arithmetic.
 *
 * The alternative - rendering only the current leaf server-side - was rejected
 * outright: the design spec's §8 requires every page's content in the served
 * HTML so the deep links are indexable, and the handoff lists "a client-only
 * SPA (destroys the deep links' SEO value)" under what to avoid. The markup
 * stays; the bytes go.
 *
 * SCOPE. The bookmark rail, bottom bar and page counter are rendered here
 * because Task 8's triggers are useless without something to click, but only
 * their BEHAVIOUR is finished: their designed appearance (SCREENS.md §1.7 -
 * the 158px rail with its tint bars and active-tab shift, the 44px circular
 * arrows, the counter over its page label, the spine ribbon) is Task 12, and
 * so is the mobile reading mode below 860px. Metadata,
 * `generateStaticParams` and the out-of-range 404 are Task 13.
 * Depends on: react, `pageCounter`/`RailTab` (@travel-diary/domain/bookBundle),
 * `pagePath` (@travel-diary/domain/pageAddress), `leafPresentation`
 * (@travel-diary/domain/pageStack), ../pages/Photograph, ./useFlip,
 * ./useTurnKeys, ./useBookScale, ./EdgeStrip, ./Leaf, ./book.module.css.
 */
import { pageCounter, type RailTab } from '@travel-diary/domain/bookBundle'
import { pagePath } from '@travel-diary/domain/pageAddress'
import { leafPresentation } from '@travel-diary/domain/pageStack'
import type React from 'react'
import { Children, useCallback, useEffect, useRef } from 'react'
import { ImageWindow } from '../pages/Photograph'
import styles from './book.module.css'
import { EdgeStrip } from './EdgeStrip'
import { Leaf } from './Leaf'
import { useBookScale } from './useBookScale'
import { DEFAULT_FLIP_DURATION_MS, useFlip, usePrefersReducedMotion } from './useFlip'
import { useTurnKeys } from './useTurnKeys'

/** What the book needs to render itself. */
export interface BookProps {
  /** The bookmark rail, already labelled and filtered by `deriveRail` on the server. */
  readonly bookmarks: readonly RailTab[]
  /** The 0-based page the reader opens on, from the `/p/<n>` URL. */
  readonly initialIndex: number
  /**
   * One server-rendered page face per page, in reading order. Face `i` is
   * slotted into leaf `i`, and their count is the book's page count - see
   * this file's header.
   */
  readonly children: React.ReactNode
}

/**
 * Renders the whole book: the board, spine, fore-edge and page stack, scaled
 * as one to fit whatever area it is given, plus every trigger a reader turns
 * it with.
 *
 * @param props - The labelled bookmark rail, the page to open on, and one
 *   server-rendered face per page.
 * @returns The diary's reading surface.
 * @example
 * <Book bookmarks={deriveRail(bundle.pages, bundle.bookmarks)} initialIndex={2}>{faces}</Book>
 */
export const Book = ({ bookmarks, initialIndex, children }: BookProps): React.JSX.Element => {
  const bookArea = useRef<HTMLDivElement | null>(null)
  const scale = useBookScale(bookArea)
  const reducedMotion = usePrefersReducedMotion()
  // `Children.toArray` rather than a bare cast: it flattens the fragment a
  // caller's `.map()` produces and drops the holes an empty branch leaves, so
  // `faces.length` is genuinely the number of pages there are to turn.
  const faces = Children.toArray(children)
  const totalPages = faces.length
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

  // One presentation per leaf, computed once per render and read twice: by the
  // leaf it belongs to, and - as `loadsImages` alone - by the window the
  // photographs inside the faces look themselves up in.
  const leaves = faces.map((face, index) => ({ face, presentation: leafPresentation(index, state, totalPages) }))
  const openLeaves = leaves.map(({ presentation }) => presentation.loadsImages)

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
            {/* The window reaches the photographs through here and not as a
                prop: the faces were rendered on the server, before any of this
                component's state existed. See this file's IMAGE WINDOW note
                and ../pages/Photograph.tsx's header. */}
            <ImageWindow value={openLeaves}>
              {leaves.map(({ face, presentation }, index) => (
                <Leaf
                  // Index is the leaf's identity here, not a stand-in for one: the
                  // reading sequence is a fixed, ordered stack of leaves rather
                  // than a sortable list of rows, and leaf 3 is the third leaf of
                  // the book whatever page happens to be printed on it.
                  key={index}
                  index={index}
                  presentation={presentation}
                  durationMs={DEFAULT_FLIP_DURATION_MS}
                >
                  {face}
                </Leaf>
              ))}
            </ImageWindow>
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
        {/* A tab is addressed by the page it opens, never by its position in
            the rail (CLAUDE.md §7). A rail that disagreed with the reading
            sequence used to be dropped here, in JSX; it is dropped by
            `deriveRail` now, where a test can prove it. */}
        {bookmarks.map((tab) => (
          <button
            key={tab.startIndex}
            type="button"
            data-bookmark={tab.startIndex}
            className={styles.bookmarkTab}
            onClick={() => {
              jumpTo(tab.startIndex)
            }}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </main>
  )
}
