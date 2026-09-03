'use client'
/**
 * useRestOfBook — asks the server, once, for the pages this document left out.
 *
 * `/p/<n>` renders only a window of pages' content (see
 * `packages/domain/src/contentWindow.ts` and
 * `docs/adr/0009-server-rendered-page-window.md`). That is right for the
 * document — it is what a crawler needs and all a first paint needs — and
 * wrong for a reader, who can turn all the way to page 33. This hook closes
 * the gap with exactly one request.
 *
 * IT KEEPS THE SAME PATH AND ADDS A QUERY, and that is measured rather than
 * preferred. Next keys each route segment's subtree by that segment's value
 * (`layout-router`'s `createRouterCacheKey`), so the obvious move — navigate
 * to a different `/p/<n>` — UNMOUNTS the book: measured on a production
 * build, `router.replace('/p/5')` took the mount count from 1 to 2 and threw
 * the flip state away, exactly as `Book.tsx`'s header says a navigation
 * would. A SEARCH PARAM is excluded from that key. The same navigation with
 * only the query changed left the mount count at 1, kept the flip index, and
 * still re-rendered the route on the server — which is the whole of what this
 * hook needs. `router.refresh()` keeps state too, but there is no way to tell
 * the server that a refresh is what happened: Next 16 strips its own `RSC`
 * header before `headers()` can read it (measured; see
 * `servedContentWindow` in `@travel-diary/domain/contentWindow`).
 *
 * IT TAKES THE PATH IT IS ON RATHER THAN DERIVING ONE. `usePathname()` is the
 * address this document was actually served at, and that is the only path
 * that leaves the segment's value unchanged. `pagePath(initialIndex)` agrees
 * with it on every address this route now renders — Task 13 replaced the old
 * clamp with `addressedPageIndex`, so `/p/999` is a 404 and never reaches
 * this hook at all — but it derives an address instead of reading the one in
 * hand, and any future disagreement between the two would cost a remount at
 * exactly the moment it is least recoverable.
 *
 * THE QUERY IS NEVER LEFT IN THE ADDRESS BAR. `Book` writes `/p/<n>` over it
 * as soon as the answer lands, from the same effect that keeps the address
 * shareable on every turn — see that file's URL note.
 *
 * IT IS NOT FIRED ON MOUNT, AND THAT IS A MEASUREMENT. Asked for on mount,
 * the request lands inside the page's own load: 28,998 bytes transferred
 * (131,041 raw) on a 1,638Kbps simulated link, plus the re-render and layout
 * of the twenty-nine faces it brings — and Lighthouse's `simulate` preset
 * folds every CPU node that performed layout into its LCP graph whenever it
 * happens (`docs/adr/0008-lcp-budget-and-the-framework-floor.md`). Measured
 * over five runs, windowing the document moved LCP 3,083.95ms → 3,009.68ms
 * with the request on mount, and 3,083.95ms → the figure in
 * `docs/adr/0009-server-rendered-page-window.md` with it returned here. Most
 * of the win was being spent putting back what the window had just removed.
 *
 * SO IT IS RETURNED, AND `Book` CALLS IT ON THE READER'S FIRST TURN OR JUMP.
 * That is demand-loading rather than a deferral: a reader who arrives on a
 * deep link from a search result and reads the page they came for never
 * fetches the other twenty-nine, on their data plan or ours. It is also
 * unstallable, because the window is three leaves deep either side: the same
 * gesture that asks for the rest of the book is served out of the document
 * already in hand, and so are the two after it. Only a reduced-motion
 * reader — whose turns commit instantly — can reach the edge before the
 * answer, and `Book` holds that turn rather than dropping it or showing a
 * blank leaf.
 *
 * This is NOT the preload lever `docs/adr/0008` rejected as gaming the gate.
 * That one traded 693ms of modelled first paint for 78ms of modelled largest
 * paint while making the real page worse. This removes bytes and work from
 * the reader's load, not just from where the gate looks: the document is
 * 65,014 raw bytes instead of 274,459 whether anyone measures it or not, and
 * the request that completes the book is one a reader who never turns a page
 * never makes.
 *
 * The `asked` ref, not a dependency list, is what makes it once: `complete`
 * flips false → true when the answer arrives, and the reader goes on turning
 * pages long after.
 * Depends on: react, next/navigation.
 */
import { WHOLE_BOOK_QUERY } from '@travel-diary/domain/contentWindow'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useRef } from 'react'

/**
 * Hands back the one call that asks the server to re-render this route with
 * every page's content.
 *
 * Calling it more than once, or at all on a document that already holds the
 * whole book, does nothing — so the caller never has to remember whether it
 * has asked.
 *
 * @param complete - Whether the served document already holds the whole book
 *   (`isWholeBook` in `@travel-diary/domain/contentWindow`). A book short
 *   enough to fit inside the window is already complete, and must not send
 *   the reader off to fetch a remainder that does not exist.
 * @returns The request, safe to call on every turn.
 * @example
 * const askForTheRestOfTheBook = useRestOfBook(isWholeBook(content, totalPages))
 */
export const useRestOfBook = (complete: boolean): (() => void) => {
  const router = useRouter()
  const pathname = usePathname()
  const asked = useRef(false)

  return useCallback((): void => {
    if (complete || asked.current) return

    asked.current = true
    router.replace(`${pathname}?${WHOLE_BOOK_QUERY}`, { scroll: false })
  }, [complete, pathname, router])
}
