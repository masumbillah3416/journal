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
 * instant reduced-motion change. THE COMMITTED INDEX IS NOT THE PAGE STACK'S
 * ANCHOR, and the distinction is this component's whole navigation contract:
 * a bookmark jump lays the stack out one leaf from its target so the turn
 * plays in the right direction, and the four things below that name where the
 * READER is - this effect, the counter, the page label and the rail's active
 * tab - all read `state.index`, which goes from the page they left to the
 * page they asked for and names nothing in between. `state.anchor` is the
 * stack's, and `leafPresentation` is its only reader
 * (`@travel-diary/domain/flip`, and
 * docs/qa/2026-09-03-phase-1-closing-sweep.md PH1-001, which is what the two
 * fields being one field cost). `history.replaceState` rather than a router
 * navigation: a navigation would re-render the route and take the book's own
 * state with it, which is the difference between writing the address and
 * throwing the reading position away. It replaces rather than pushes so that
 * reading thirty pages does not bury the page the reader arrived from under
 * thirty history entries.
 *
 * THAT EFFECT WAITS FOR THE BOOK TO BE WHOLE, and it is doing two jobs at
 * once because they are the same job. `useRestOfBook` asks for the rest of
 * the book by putting `?pages=all` on the address, so this is also what takes
 * it back off - the first write after the answer lands is a clean `/p/<n>`.
 * And writing the address BEFORE that answer would be actively harmful:
 * `history.replaceState` moves the router's own idea of which `/p/<n>` it is
 * on, so a turn committed while the request was still in flight would turn it
 * into a navigation to a different segment - which unmounts the book
 * (measured; see `useRestOfBook.ts`). Until the answer lands the address is
 * still the page the reader arrived on, which is where they still are.
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
 * THE CONTENT WINDOW IS A SECOND, DIFFERENT WINDOW, AND THE TWO MUST NOT BE
 * CONFUSED. The image window above is a function of where the flip machine
 * is; this one is a function of the ADDRESS, and it arrives as a prop because
 * the server is the only one who knows it. `/p/<n>` renders only the pages
 * near `n` (`@travel-diary/domain/contentWindow`,
 * `docs/adr/0009-server-rendered-page-window.md`) - every leaf is still in the
 * stack, but the leaves outside that span carry no face. This component does
 * three things with that fact and nothing else:
 *
 *   - it asks for the rest of the book, once, through `useRestOfBook`, on the
 *     reader's FIRST turn or jump rather than on mount - because asked for on
 *     mount the answer lands inside the page's own load and spends most of
 *     what the window saved (measured; see that hook's header). The window is
 *     three leaves deep either side, so the gesture that asks is itself
 *     served out of the document already in hand;
 *   - it HOLDS a turn or a jump whose destination the document does not carry
 *     yet, instead of letting the reader turn into a blank leaf, and performs
 *     it the moment the rest arrives. The queue holds one request, the newest,
 *     and it does not bypass the latch: what it holds is re-presented to the
 *     machine, which still refuses a turn in flight;
 *   - it publishes the span as `data-content-window` so a browser test can
 *     see which document it is looking at.
 *
 * Rendering only the current leaf server-side was rejected outright, and so
 * was rendering all thirty-three: the first is the client-only SPA the
 * handoff lists under what to avoid, and the second is what put the LCP gate
 * 84ms into the red. A window keeps both promises, because indexability is
 * per ROUTE and not per document - `/p/12` serves page 12, which is all
 * anything ever asked of it.
 *
 * THE CHROME IS THREE COMPONENTS, AND THIS FILE DRAWS NONE OF IT. SCREENS.md
 * §1.7's bookmark rail, bottom bar and spine ribbon live under
 * `../chrome/`; what this file contributes is the only thing they cannot know
 * for themselves - where the flip machine is. It hands the rail the page
 * index (the rail asks `isRailTabActive` which tab that lights, using
 * `deriveBookmarks`' own spans), the bar the 1-based page number and the
 * label the server derived for it, and the ribbon nothing at all. Two of the
 * three claim their own grid areas from `.stage` rather than being positioned
 * over the book, which is what stops a strip of chrome from lying across the
 * page-edge turn strips and swallowing their clicks (`book.module.css`'s
 * `.stage`, and docs/qa/2026-09-01-diary-sweep.md DIARY-002). The ribbon is
 * the one piece that DOES lie over the page, and is `pointer-events: none`
 * for exactly that reason.
 *
 * BELOW 860px THIS COMPONENT IS NOT RENDERED AT ALL. SCREENS.md §1.10's
 * mobile reading mode replaces the book rather than restyling it - "No book,
 * no flip, no scaling" - so `../mobile/MobileDiary.tsx` is a separate tree and
 * the `/p/<n>` route serves one or the other, chosen before either is
 * rendered (`@travel-diary/domain/readingSurface`,
 * `docs/adr/0011-two-reading-surfaces-chosen-on-the-server.md`). That is why
 * there is no breakpoint in `book.module.css` and there must not be one: a
 * media query here would produce a scaled book fighting a scrolling column in
 * one DOM. `data-reading-surface="book"` on the `<main>` below is how a
 * browser test knows which surface it is looking at.
 * Depends on: react, `RailTab` (@travel-diary/domain/bookBundle),
 * `pagePath` (@travel-diary/domain/pageAddress), `leafPresentation`
 * (@travel-diary/domain/pageStack), ../pages/Photograph, ../chrome/BookmarkRail,
 * ../chrome/BottomBar, ../chrome/Ribbon, ./useFlip, ./useTurnKeys,
 * ./useBookScale, ./EdgeStrip, ./Leaf, ./book.module.css.
 */
import type { RailTab } from '@travel-diary/domain/bookBundle'
import { isWholeBook, rendersContent, type ContentWindow } from '@travel-diary/domain/contentWindow'
import { pagePath } from '@travel-diary/domain/pageAddress'
import { leafPresentation } from '@travel-diary/domain/pageStack'
import type React from 'react'
import { Children, useCallback, useEffect, useRef, useState } from 'react'
import { BookmarkRail } from '../chrome/BookmarkRail'
import { BottomBar } from '../chrome/BottomBar'
import { Ribbon } from '../chrome/Ribbon'
import { ImageWindow } from '../pages/Photograph'
import styles from './book.module.css'
import { EdgeStrip } from './EdgeStrip'
import { Leaf } from './Leaf'
import { useBookScale } from './useBookScale'
import { DEFAULT_FLIP_DURATION_MS, useFlip, usePrefersReducedMotion } from './useFlip'
import { useRestOfBook } from './useRestOfBook'
import { useTurnKeys } from './useTurnKeys'

/**
 * A page change the reader has asked for that this document cannot show yet.
 * The kind is carried rather than inferred from the distance travelled: a
 * jump is anchored beside its target and a turn is not, and that is a
 * difference in behaviour, not in arithmetic.
 */
interface HeldMove {
  /** Which of the machine's two entry points the request came in through. */
  readonly kind: 'turn' | 'jump'
  /** The 0-based leaf the reader asked for. */
  readonly target: number
}

/** What the book needs to render itself. */
export interface BookProps {
  /** The bookmark rail, already labelled, spanned and filtered by `deriveRail` on the server. */
  readonly bookmarks: readonly RailTab[]
  /**
   * One label per page, in reading order, from `derivePageLabels` on the
   * server - the line the bottom bar prints under the counter. Handed over as
   * strings rather than as the reading sequence itself: this component is the
   * diary's `'use client'` boundary, and serializing thirty-three pages a
   * second time to relabel them in the browser is what that boundary exists
   * to avoid (docs/adr/0007-server-rendered-page-faces.md).
   */
  readonly labels: readonly string[]
  /**
   * Whether the book's decorations are on (`BookChrome.showDecorations`).
   * The spine ribbon is behind the same flag as the cover's washi strip and
   * airmail stamp in the handoff prototype, so an editor who turns
   * decorations off turns off all of them.
   */
  readonly showDecorations: boolean
  /** The 0-based page the reader opens on, from the `/p/<n>` URL. */
  readonly initialIndex: number
  /**
   * The span of leaves whose faces this document actually carries, from
   * `contentWindow` on the server. It cannot be derived here: only the render
   * that produced the faces knows which of them are real.
   */
  readonly content: ContentWindow
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
 * <Book bookmarks={rail} labels={labels} showDecorations initialIndex={2}>{faces}</Book>
 */
export const Book = ({
  bookmarks,
  labels,
  showDecorations,
  initialIndex,
  content,
  children,
}: BookProps): React.JSX.Element => {
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

  const complete = isWholeBook(content, totalPages)
  const askForTheRestOfTheBook = useRestOfBook(complete)

  // At most one held request, the newest, kept until the page it wants is in
  // the document. `null` is the ordinary state of a book whose document
  // carries everything the reader has asked for - which, after the one
  // `useRestOfBook` request lands, is every book.
  const [held, setHeld] = useState<HeldMove | null>(null)

  // A turn moves one leaf, so only the destination has to be in the document.
  // A jump can land anywhere, and is anchored one page from its target by
  // `useFlip.jumpTo`, so it waits for the whole book rather than re-deriving
  // that anchor here to ask about it (`useFlip.ts`'s own rule).
  const canReach = useCallback(
    (move: HeldMove): boolean => (move.kind === 'jump' ? complete : rendersContent(content, move.target)),
    [complete, content],
  )

  const perform = useCallback(
    (move: HeldMove): void => {
      if (move.kind === 'jump') jumpTo(move.target)
      else turnTo(move.target)
    },
    [jumpTo, turnTo],
  )

  const request = useCallback(
    (move: HeldMove): void => {
      // The reader wants to read on, so the rest of the book is worth
      // fetching now. It is a no-op after the first time, and on any book
      // whose document already holds all of it.
      askForTheRestOfTheBook()

      if (canReach(move)) perform(move)
      else setHeld(move)
    },
    [askForTheRestOfTheBook, canReach, perform],
  )

  useEffect(() => {
    if (held === null || !canReach(held)) return

    setHeld(null)
    perform(held)
  }, [held, canReach, perform])

  const turnForward = useCallback((): void => {
    request({ kind: 'turn', target: state.index + 1 })
  }, [request, state.index])

  const turnBackward = useCallback((): void => {
    request({ kind: 'turn', target: state.index - 1 })
  }, [request, state.index])

  useTurnKeys({ onForward: turnForward, onBackward: turnBackward })

  // One presentation per leaf, computed once per render and read twice: by the
  // leaf it belongs to, and - as `loadsImages` alone - by the window the
  // photographs inside the faces look themselves up in.
  const leaves = faces.map((face, index) => ({ face, presentation: leafPresentation(index, state, totalPages) }))
  const openLeaves = leaves.map(({ presentation }) => presentation.loadsImages)

  useEffect(() => {
    // See this file's header: `replaceState`, not a router navigation, keyed
    // on the committed index so it fires once per page change rather than
    // once per animation frame - and held until the book is whole, because
    // until then the address carries the request that made it whole and
    // moving it would cost a remount.
    if (!complete) return

    window.history.replaceState(null, '', pagePath(state.index))
  }, [state.index, complete])

  return (
    <main
      className={styles.stage}
      data-reading-surface="book"
      data-content-window={`${String(content.from)}-${String(content.to)}`}
    >
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

          {/* Inside the design box, so it scales with the book, and above the
              stack but below the turn strips at `z-index: 400`. It is the one
              piece of chrome that lies over the page rather than beside it,
              and is `pointer-events: none` so it never takes a click meant
              for what is under it. */}
          {showDecorations && <Ribbon />}
        </div>
      </div>

      <BottomBar
        pageNumber={state.index + 1}
        totalPages={totalPages}
        // A label the book was not handed is an empty line, not a crash: the
        // labels cross the same serialization boundary the rail does, so a
        // rail and a reading sequence that disagree is a state this surface
        // can be handed (see `deriveRail`'s own note on it).
        label={labels[state.index] ?? ''}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        onBack={turnBackward}
        onForward={turnForward}
      />

      {/* The rail decides nothing: which tab is active is `isRailTabActive`
          reading `deriveBookmarks`' spans, and the page it reads them against
          is the machine's committed index. */}
      <BookmarkRail
        tabs={bookmarks}
        pageIndex={state.index}
        onJump={(startIndex) => {
          request({ kind: 'jump', target: startIndex })
        }}
      />
    </main>
  )
}
