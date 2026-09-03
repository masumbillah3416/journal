/**
 * pageAddress — the two ways a page of the book is addressed.
 *
 * Value-object translation (CLAUDE.md §3.3), between the two numbering
 * systems the diary genuinely has and must not confuse: the 1-based page
 * number a reader sees on the bottom bar and shares in a `/p/<n>` URL
 * (handoff README, "Triggers"; SCREENS.md's `03 / 33` counter), and the
 * 0-based leaf index the page stack and the flip machine work in. Keeping the
 * conversion here, rather than inline in a route component, is what lets it
 * be tested at all: a Next.js page component cannot be run without a request
 * context, so arithmetic living inside one is arithmetic nothing can check.
 *
 * THE CONVERSION REJECTS RATHER THAN CLAMPS, and that is Task 13's routing
 * decision arriving (this module previously clamped, and said here that Task
 * 13 would decide). `/p/999` is not page 33 with a typo in it - it is an
 * address the book has no page for, and the reader who followed it needs to
 * be told so rather than shown a page they did not ask for. A clamp also
 * silently mints thirty-three synonyms for the last page, every one of them a
 * separate crawlable URL serving identical content, which is exactly the
 * duplicate-content problem `alternates.canonical` exists to prevent
 * (`docs/adr/0010-static-generation-and-the-content-window.md`).
 *
 * It is a DIFFERENT decision from `pageStack.ts`'s, which still clamps a
 * stale `state.index`, and the two are not in tension: a stale index is the
 * book's own state briefly disagreeing with itself, where landing on a real
 * page is a recovery; an address is the reader's input, where landing on a
 * page they did not name is a lie about what they asked for.
 *
 * `null` rather than a thrown error, because "there is no such page" is an
 * ordinary outcome of an ordinary URL, not an exceptional one - CLAUDE.md
 * §3.3's Result-type rule read at its cheapest useful size, since the caller
 * needs no reason string to call `notFound()`. See
 * `apps/web/app/(diary)/p/[n]/page.tsx`.
 * Depends on nothing.
 */

/**
 * A page number is what a reader types: digits only, no sign, no decimal
 * point, and no leading zero - `/p/03` is a different URL from `/p/3`, and
 * accepting both would mint a second address for every page of the book.
 */
const PAGE_NUMBER = /^[1-9]\d*$/

/**
 * Converts the `n` of a `/p/<n>` URL into the 0-based leaf index the page
 * stack uses, or reports that the book has no such page.
 *
 * @param param - The raw route parameter, exactly as the URL carried it.
 * @param totalPages - How many pages the book currently has.
 * @returns The leaf index the address names, or `null` when nothing in the
 *   book answers to it - a page number outside `1..totalPages`, a value that
 *   is not a whole page number at all (including one padded with a leading
 *   zero), or any address in an empty book.
 * @example
 * addressedPageIndex('3', 33) // 2 - the third page a reader sees
 * addressedPageIndex('999', 33) // null - the caller renders a 404
 */
export const addressedPageIndex = (param: string, totalPages: number): number | null => {
  if (!PAGE_NUMBER.test(param)) return null

  // The regex has already excluded `0`, so the only bound left to check is
  // the book's own length - which is also what refuses every address in an
  // empty book, since nothing is `<= 0`.
  const pageNumber = Number.parseInt(param, 10)
  if (pageNumber > totalPages) return null

  return pageNumber - 1
}

/**
 * Turns a 0-based leaf index back into the `/p/<n>` path that addresses it -
 * the inverse of {@link addressedPageIndex}, and the string the diary writes
 * into the address bar every time a turn commits (handoff README's flip
 * sequence table: "commit index = to, clear flip, release latch, write URL").
 *
 * It lives here, beside its inverse, so the `+ 1` that separates the two
 * numbering systems appears exactly once in each direction and can be
 * round-tripped in a test. Written inline in a component, the same arithmetic
 * would be untestable and free to drift by one from the conversion that reads
 * it back.
 *
 * @param leafIndex - The 0-based leaf index the page stack is resting on.
 * @returns The path a reader can copy, share and reload onto the same page.
 * @example
 * pagePath(2) // '/p/3' - the third page a reader sees
 */
export const pagePath = (leafIndex: number): string => `/p/${String(leafIndex + 1)}`

/**
 * The path of a journey's full gallery, carrying the page the reader is
 * leaving from.
 *
 * THE PAGE NUMBER IS IN THE LINK, and that is the whole of how "returning
 * from a gallery restores `/p/<n>`, not `/`" (design spec §8) is satisfied
 * for the gallery's own back control. Two alternatives were built and
 * rejected:
 *
 *   - **The `Referer` header, read on the server.** SECURITY.md's Public site
 *     section requires the diary to be "static content ... served from a
 *     CDN", and a document whose HTML varied by `Referer` cannot be: the
 *     first reader's page number would be cached and handed to the second.
 *   - **`document.referrer`, read on the client after mount.** Built, and it
 *     failed in a real browser: the anchor renders with the `/p/1` fallback
 *     and is corrected in an effect, so a reader who clicks before hydration
 *     lands on the cover. `e2e/gallery.spec.ts`'s back-control case caught it
 *     at two of three viewport projects. A control that goes somewhere else
 *     depending on timing is worse than one that is visibly spent.
 *
 * A query parameter is rendered by the server, correct at first paint, and
 * needs no script at all - and it puts the page the reader was on into the
 * URL they copy, which is the other half of what the spec asks for.
 *
 * @param slug - The journey's slug.
 * @param fromLeafIndex - The 0-based leaf the reader is on, as the page components know it.
 * @returns e.g. `'/gallery/patagonia?from=9'`.
 * @example
 * galleryPath('patagonia', 8) // '/gallery/patagonia?from=9'
 */
export const galleryPath = (slug: string, fromLeafIndex: number): string =>
  `/gallery/${slug}?from=${String(fromLeafIndex + 1)}`

/**
 * The `/p/<n>` a gallery's back control points at.
 *
 * @param from - The gallery route's `from` query parameter, exactly as the URL
 *   carried it, or `undefined` when there is none (a shared or bookmarked
 *   gallery link).
 * @returns The `/p/<n>` the reader left, or `/p/1` when `from` names no page.
 *   Deliberately never `/`: the spec's point is that the reader lands on a
 *   page of the book, and page one is the only page every book has.
 * @example
 * returningPagePath('9') // '/p/9'
 * returningPagePath(undefined) // '/p/1'
 */
export const returningPagePath = (from: string | null | undefined): string => {
  if (from === null || from === undefined) return pagePath(0)

  // Reusing the address rules rather than a second regex: `/p/03` is not an
  // address this book serves, so `?from=03` is not one a back link may point
  // at either. `Number.MAX_SAFE_INTEGER` stands in for "however long the book
  // is" - this function has no bundle to count, and an out-of-range page is
  // the route's own 404 to answer, not this link's.
  const index = addressedPageIndex(from, Number.MAX_SAFE_INTEGER)
  return index === null ? pagePath(0) : pagePath(index)
}
