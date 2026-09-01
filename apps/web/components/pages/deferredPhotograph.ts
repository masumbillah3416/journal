/**
 * deferredPhotograph — the placeholder source a photograph carries while its
 * leaf is outside the reader's image window.
 *
 * Null Object pattern (CLAUDE.md §3.3), applied to one attribute: a
 * photograph whose leaf is thirty pages away still renders as a real `<img>`
 * with its real `alt`, `caption` and focal point, and only its `src` is
 * stood in for. That is the shape the design spec's §8 requires — "the server
 * ... statically renders every page's content, so the deep links are
 * indexable" — while `packages/domain/src/pageStack.ts`'s `loadsImages`
 * withholds the BYTES.
 *
 * WHY A 1x1 TRANSPARENT GIF AND NOT AN ABSENT `src`. `src` is a required
 * attribute of `<img>`, and an `<img>` without one renders its alt text as
 * text rather than an image box; a `data:` URL is a complete, valid image
 * that provably costs no network request, because there is no network in it.
 * It is the same 43-byte GIF every lazy-loading library reaches for, and it
 * gzips to nothing when repeated across sixty photographs.
 *
 * Swapping this string for the slot's own `src` is what starts the fetch, and
 * React does exactly that the moment the leaf enters the window — one
 * attribute change, no remount, so the element keeps its box and its focal
 * point across the swap.
 * Depends on nothing.
 */

/**
 * A fully transparent 1x1 GIF, as a `data:` URL.
 *
 * @example
 * <img src={loadsImages ? slot.src : DEFERRED_PHOTOGRAPH_SRC} alt={slot.alt} />
 */
export const DEFERRED_PHOTOGRAPH_SRC = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
