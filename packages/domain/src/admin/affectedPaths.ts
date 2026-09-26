/**
 * affectedPaths — which addresses of the public diary a publish changes, and
 * which it deliberately leaves alone.
 *
 * Design spec §8: "Publishing triggers on-demand revalidation of affected
 * paths only." This module is the "affected paths only" half; the publish
 * itself is `apps/web/lib/admin/publishSelection.ts` and the spending of these
 * strings is `app/(admin)/admin/publish/actions.ts`.
 *
 * ═══ THE UNIT OF CHANGE IS THE JOURNEY, AND THAT IS DERIVED, NOT CHOSEN ═══
 *
 * `derivePages` copies a journey's own fields — name, place, dates, accent,
 * weather, the note, the tally, the signoff, the stamp — onto ALL THREE of the
 * pages it contributes, so a `journeys` write changes the data behind every one
 * of them. A `pages` write changes one page's slots, and this module is handed
 * no way to tell which of the three that row is: a `pages` row is addressed by
 * `kind` and `order`, and `BookPage` is addressed by leaf index, and the
 * mapping between them lives in `readBookBundle`. So a change is resolved to
 * ITS JOURNEY'S pages. That is wider than one page and far narrower than the
 * book, and it is the boundary the cases pin: publishing Tokyo does not
 * revalidate Lisbon.
 *
 * ═══ A JOURNEY THE BOOK DOES NOT HOLD RENUMBERS EVERY PAGE AFTER IT ═══
 *
 * `readBookBundle` reads PUBLISHED journeys, so a journey with no pages in the
 * bundle is one that has never been published. Publishing it does not change
 * three pages; it INSERTS three, and `/p/9` then addresses what `/p/6` used to.
 * The affected set really is every page path, and the empty-lookup arm is how
 * that is detected rather than by a flag somebody has to remember to set.
 *
 * THE CONTENTS PAGE IS ALWAYS IN THE SET, because it prints one row per
 * journey — name, place, dates and the page number its notes page sits on
 * (`deriveContents`) — so any of the three moving, and any journey arriving,
 * rewrites it.
 *
 * THE GALLERY IS ALWAYS IN THE SET, because `readGalleryBundle` selects
 * `{ slug, name, place, dates }` off the journey row and prints all four in the
 * gallery's header. Checked against that module rather than assumed.
 *
 * NOTHING ELSE IS. The cover page prints the `book` global, which is not
 * versioned and therefore never pending; `/m/<n>` is a rewrite target rather
 * than an address (`docs/api.md`), so a reader on a phone is served `/p/<n>`
 * and revalidating the rewrite's own entry would be revalidating an address
 * nobody holds.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. One pure derivation over a list
 * and a bundle; naming a pattern for it would be cargo cult.
 *
 * INVARIANT — an empty change list yields an empty path list. A publish of
 * nothing revalidates nothing, which is what stops "publish the ticked rows"
 * degrading into "sweep the whole book" the first time a selection is empty.
 * Depends on: `BookBundle` (../bookBundle), `galleryPath`/`pagePath`
 * (../pageAddress), `PendingChange` (./pendingChange).
 */
import type { BookBundle } from '../bookBundle'
import { pagePath } from '../pageAddress'
import type { PendingChange } from './pendingChange'

/**
 * The `/gallery/<slug>` a journey's frames are served at.
 *
 * `galleryPath` in `../pageAddress` is the LINK the book prints, and carries
 * the `?from=<n>` a reader is returning to; a cache address has no reader to
 * return, so it is the bare path. Spelled here rather than imported so the two
 * cannot be confused — and asserted against the literal by this module's cases.
 * @param slug - The journey's slug.
 * @returns e.g. `'/gallery/tokyo'`.
 */
const galleryOf = (slug: string): string => `/gallery/${slug}`

/**
 * Every `/p/<n>` in the book, which is the set a renumbering affects.
 * @param book - The book as it is published right now.
 * @returns One path per leaf, in reading order.
 */
const everyPagePath = (book: BookBundle): readonly string[] => book.pages.map((_page, index) => pagePath(index))

/**
 * The addresses one publish of `changes` makes stale.
 *
 * @param changes - The changes going out — the TICKED ones, never the whole
 *   pending list. A path is affected because something published touches it.
 * @param book - The book as it is published right now, which is what the leaf
 *   indices in the answer are indices into.
 * @returns Each affected path once, in reading order with the galleries after
 *   them. Empty when `changes` is empty.
 * @example
 * affectedPaths([tokyosNote], bundle) // ['/p/2', '/p/3', '/p/4', '/p/5', '/gallery/tokyo']
 */
export const affectedPaths = (changes: readonly PendingChange[], book: BookBundle): readonly string[] => {
  if (changes.length === 0) return []

  const contentsIndex = book.pages.findIndex((page) => page.kind === 'contents')
  const pages = new Set<string>()
  const galleries = new Set<string>()

  for (const change of changes) {
    galleries.add(galleryOf(change.slug))

    const occupied = book.pages.flatMap((page, index) =>
      'journeyId' in page && page.journeyId === change.journey ? [pagePath(index)] : [],
    )

    // NOTHING OCCUPIED MEANS NOTHING PUBLISHED YET, which is the insertion
    // case: the book gains pages and every leaf after them is renumbered.
    for (const path of occupied.length === 0 ? everyPagePath(book) : occupied) pages.add(path)
  }

  // The Contents lists every journey, so it is stale whenever any of them is.
  // `-1` is unreachable while `derivePages` puts a Contents in every book, and
  // it is guarded rather than asserted because CLAUDE.md §0.8 bans the `!`.
  if (contentsIndex >= 0) pages.add(pagePath(contentsIndex))

  // READING ORDER, then the galleries: a stable answer is what lets a case
  // compare two calls, and what keeps a revalidation log readable.
  return [...everyPagePath(book).filter((path) => pages.has(path)), ...galleries]
}
