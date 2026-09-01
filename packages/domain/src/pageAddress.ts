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
 * The conversion CLAMPS rather than rejects. An unparseable or out-of-range
 * page number lands the reader on a real page instead of a blank stack, which
 * is the same choice `pageStack.ts` makes for a stale `state.index` and for
 * the same reason. That is deliberately not a 404: Task 13 owns routing, and
 * will decide there which addresses are worth a `notFound()` instead. See
 * `apps/web/app/(diary)/p/[n]/page.tsx`.
 * Depends on nothing.
 */

/** A page number is what a reader types: digits only, no sign, no decimal point. */
const PAGE_NUMBER = /^\d+$/

/**
 * Converts the `n` of a `/p/<n>` URL into the 0-based leaf index the page
 * stack uses.
 *
 * @param param - The raw route parameter, exactly as the URL carried it.
 * @param totalPages - How many pages the book currently has.
 * @returns A leaf index that is always addressable: `0` for anything that is
 *   not a whole page number, and the nearest real page for a number outside
 *   the book. A book with no pages at all yields `0` rather than `-1`.
 * @example
 * pageIndexFromParam('3', 33) // 2 - the third page a reader sees
 * pageIndexFromParam('999', 33) // 32 - clamped to the last real page
 */
export const pageIndexFromParam = (param: string, totalPages: number): number => {
  if (totalPages <= 0) return 0
  if (!PAGE_NUMBER.test(param)) return 0

  const pageNumber = Number.parseInt(param, 10)
  return Math.min(Math.max(pageNumber - 1, 0), totalPages - 1)
}

/**
 * Turns a 0-based leaf index back into the `/p/<n>` path that addresses it -
 * the inverse of {@link pageIndexFromParam}, and the string the diary writes
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
