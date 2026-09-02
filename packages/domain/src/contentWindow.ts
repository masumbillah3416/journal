/**
 * contentWindow — which leaves of the book a `/p/<n>` document carries the
 * content of.
 *
 * Derivation pattern (CLAUDE.md §7; mirrors `pageStack.ts`, `bookScale.ts`
 * and `bookBundle.ts`): a pure function of `(addressedIndex, totalPages)`,
 * computed fresh wherever it is needed rather than stored. It is the SERVER's
 * window, and it is a different thing from `pageStack.ts`'s `loadsImages` -
 * that one is a function of where the flip machine is, which only a browser
 * knows; this one is a function of the ADDRESS, which is the only thing a
 * server render has.
 *
 * WHY A WINDOW AT ALL. `/p/1`'s document carried all thirty-three pages'
 * markup. After the Frames and About pages landed it grew to 23,445 bytes
 * transferred (274,459 raw) and put ninety more server-rendered photograph
 * subtrees into a document whose reader is looking at the Cover; the LCP gate
 * went red at 3,084ms against 3,000ms, and the largest single item this
 * repository owns in that number is Style & Layout - laying out thirty-three
 * page faces (`docs/adr/0008-lcp-budget-and-the-framework-floor.md`).
 *
 * WHY IT DOES NOT COST THE DEEP LINKS THEIR INDEXABILITY, which is the whole
 * reason the diary uses real `/p/<n>` paths rather than hashes (design spec
 * §8, and the handoff's warning against "a client-only SPA"). Indexability is
 * PER ROUTE, not per document: `/p/12` must serve page 12's content, and it
 * does. Nothing requires `/p/1` to also serve page 20's text, because `/p/20`
 * serves that. Every one of the thirty-three routes is independently
 * indexable with a window in place, and `e2e/serverWindow.spec.ts` asserts
 * exactly that, route by route.
 *
 * THE RADIUS IS THE READER'S RUNWAY, and that is the whole of its
 * justification. The client completes the book with one request once it is
 * live (see `apps/web/components/book/Book.tsx`), so the window only has to
 * hold the reader until that lands. Three leaves either side is three turns -
 * 2,700ms at the handoff's 900ms default and 1,200ms at the 400ms floor it
 * allows - against a single same-origin round trip. It is also what makes an
 * incomplete book unremarkable rather than fragile: the one case that can
 * outrun it (reduced motion, where turns are instant) is handled by queueing
 * the turn, not by widening this number. A radius of 1 would be the smallest
 * that can serve a turn at all and would save four more faces; the four faces
 * are not worth trading the runway for.
 *
 * IT CLAMPS RATHER THAN SLIDING at either end of the book. `/p/1` is both the
 * route the LCP gate measures and the one route a reader can only travel
 * forward from, so sliding the window forward to keep a constant seven pages
 * would put three pages of markup into that document that no reader reaches
 * without first passing through the three that follow.
 *
 * THE SIGNAL THAT ASKS FOR THE WHOLE BOOK LIVES HERE TOO, at the foot of this
 * file, because it is the same decision seen from the other side: one search
 * parameter, written by `useRestOfBook` and read by the route, with a single
 * definition so a client half and a server half cannot drift apart. Why a
 * search parameter rather than a header or a different path is a measurement,
 * and it is recorded on {@link servedContentWindow} and in ADR 0009.
 * Depends on nothing.
 */

/**
 * How many leaves either side of the addressed page carry their content in
 * the served document. See this module's header for why it is 3 and why it is
 * not configurable (CLAUDE.md §4: there is no second caller to serve).
 */
export const CONTENT_WINDOW_RADIUS = 3

/**
 * An inclusive span of leaves. `to < from` is the empty span, which is what a
 * book with no pages yields.
 */
export interface ContentWindow {
  /** The first leaf whose content is in the document. */
  readonly from: number
  /** The last leaf whose content is in the document, inclusive. */
  readonly to: number
}

/**
 * The window a `/p/<n>` document carries: the addressed page and
 * {@link CONTENT_WINDOW_RADIUS} leaves either side of it, clamped to the book.
 *
 * @param addressedIndex - The 0-based leaf the URL addresses, from `pageIndexFromParam`.
 * @param totalPages - How many pages the book currently has.
 * @returns The inclusive span of leaves whose content belongs in that document.
 * @example
 * contentWindow(0, 33) // { from: 0, to: 3 } - the Cover and the three pages after it
 */
export const contentWindow = (addressedIndex: number, totalPages: number): ContentWindow => ({
  from: Math.max(addressedIndex - CONTENT_WINDOW_RADIUS, 0),
  to: Math.min(addressedIndex + CONTENT_WINDOW_RADIUS, totalPages - 1),
})

/**
 * The window that holds the entire book — what the client is served once it
 * asks for the rest.
 *
 * @param totalPages - How many pages the book currently has.
 * @returns The span covering every leaf, or the empty span for an empty book.
 * @example
 * wholeBook(33) // { from: 0, to: 32 }
 */
export const wholeBook = (totalPages: number): ContentWindow => ({ from: 0, to: totalPages - 1 })

/**
 * Whether a leaf's content is inside a window.
 *
 * @param window - The span the document carries.
 * @param leafIndex - The 0-based leaf being asked about.
 * @returns True when that leaf's page was rendered into the document.
 * @example
 * rendersContent(contentWindow(0, 33), 4) // false - one leaf past the window
 */
export const rendersContent = (window: ContentWindow, leafIndex: number): boolean =>
  leafIndex >= window.from && leafIndex <= window.to

/**
 * Whether a window leaves nothing for the client to ask for.
 *
 * True for a book short enough to fit inside the window already, which is the
 * case that matters: a book of five pages must not send the client off to
 * fetch a remainder that does not exist.
 *
 * @param window - The span the document carries.
 * @param totalPages - How many pages the book currently has.
 * @returns True when every leaf of the book is inside the window.
 * @example
 * isWholeBook(contentWindow(2, 5), 5) // true - a five-page book fits
 */
export const isWholeBook = (window: ContentWindow, totalPages: number): boolean =>
  window.from <= 0 && window.to >= totalPages - 1

/** The search parameter that asks for every page's content rather than a window. */
const WHOLE_BOOK_PARAM = 'pages'

/** The one value of {@link WHOLE_BOOK_PARAM} that means it. */
const WHOLE_BOOK_VALUE = 'all'

/**
 * The query string the book appends when it asks for the rest of itself.
 * There is one definition of the signal, not a client one and a server one
 * free to disagree.
 */
export const WHOLE_BOOK_QUERY = `${WHOLE_BOOK_PARAM}=${WHOLE_BOOK_VALUE}`

/** A route's search parameters, exactly as a Next.js page component receives them. */
export type RouteQuery = Record<string, string | readonly string[] | undefined>

/**
 * Decides which pages' content belongs in one render of the `/p/<n>` route.
 *
 * The route is rendered for two consumers and owes them different things:
 *
 *   - **A document request** - a reader's first load, and every crawl of the
 *     deep link - gets a window around the addressed page. That is everything
 *     the route owes a crawler, because indexability is per ROUTE: `/p/12`
 *     serves page 12's content, and nothing ever asked `/p/1` to serve it too.
 *   - **The book's own request for the rest of itself**, made once when the
 *     reader first turns a page, gets every page - so they can read to the end.
 *
 * WHY THE SIGNAL IS A SEARCH PARAMETER, measured against two alternatives on
 * a production build rather than chosen:
 *
 *   - **The `RSC` request header**, which Next sets on every client-side
 *     render and never on the initial document, reaches the server - it is on
 *     the wire, and Next's own response carries `Vary: rsc` because of it -
 *     but it does NOT reach `headers()`. Next 16 strips its own routing
 *     headers first: printing `[...headers().keys()]` on that very request
 *     returns `host`, `user-agent`, `accept`, `referer` and four
 *     `x-forwarded-*`, and nothing else. The signal exists and is unreadable.
 *   - **A different `/p/<n>` path** is the obvious way to widen the window and
 *     the wrong one: Next keys each route segment's subtree by that segment's
 *     value, so navigating between two `/p/<n>` unmounts the book - measured,
 *     mount count 1 to 2 with the flip state discarded. A search parameter is
 *     deliberately excluded from that key, and measured to be: the same
 *     navigation with only the query changed re-rendered the route on the
 *     server and left the book mounted, mid-position and all.
 *
 * @param query - The request's search parameters, from the route.
 * @param addressedIndex - The 0-based leaf the URL addresses.
 * @param totalPages - How many pages the book currently has.
 * @returns The whole book when the book asked for it, a window around the
 *   addressed page for every other request - which is every document request,
 *   and so every crawl.
 * @example
 * servedContentWindow({}, 0, 33) // { from: 0, to: 3 }
 */
export const servedContentWindow = (
  query: RouteQuery,
  addressedIndex: number,
  totalPages: number,
): ContentWindow =>
  query[WHOLE_BOOK_PARAM] === WHOLE_BOOK_VALUE ? wholeBook(totalPages) : contentWindow(addressedIndex, totalPages)
