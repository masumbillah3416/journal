/**
 * galleryFrames — the one definition of which of a journey's `media` rows are
 * frames of its gallery.
 *
 * THIS EXISTS BECAUSE THE RULE WAS WRITTEN THREE TIMES. `readGalleryBundle`
 * builds the grid and the lightbox from it. `readGalleryDownload` re-derives
 * the same list in the same order, because the number in a download's
 * filename has to be the number the reader saw in the lightbox.
 * `readBookBundle` counts it a third time for the census the Notes page
 * footer prints ("{n} photographs and {m} clips in the gallery") and the
 * gallery header repeats. Three independent copies of one rule is what let
 * PH1-002 be a defect in three different ways at once
 * (`docs/qa/2026-09-03-phase-1-closing-sweep.md`), and what would have made
 * any partial fix worse than none: a grid that dropped a row while the
 * handler kept it shifts every download onto the wrong photograph, and a
 * census that kept it has the page print "9 photographs" over a grid of
 * eight. All three now ask this module.
 *
 * A GALLERY FRAME IS A PHOTOGRAPH OF THE JOURNEY, and two things that are
 * neither are excluded here:
 *
 *   1. `hidden`, WHICH IS A SECURITY REQUIREMENT RATHER THAN A PREFERENCE.
 *      `collections/media.ts` withholds a hidden row from an unauthenticated
 *      reader, but all three callers run through Payload's Local API with no
 *      user, where access control is overridden by default - so the exclusion
 *      has to be in the query. SECURITY.md's objection to direct media URLs
 *      is precisely that they "invite enumeration of everything in the
 *      bucket, including anything marked hidden". The census was the one
 *      caller that had never applied it: nothing in the seed is hidden, so a
 *      count that included hidden rows was a defect no fixture could show.
 *
 *   2. THE NOTES PAGE'S EPHEMERA SCRAP. `docs/deviations.md` §13.4 already
 *      settles what that slot holds - "a texture behind tape rather than a
 *      photograph with a subject", carried with an empty `alt` so it is out
 *      of the accessibility tree - and `SCREENS.md` §1.8's grid is the
 *      journey's photographs, while §1.3 gives ephemera its own
 *      non-photographic slot on the page. The seed writes it as an ordinary
 *      `media` row with the journey on it, so the gallery's own filter
 *      admitted it: it was frame 004 of every journey, counted in the
 *      "n photos" census, and downloadable as `tokyo-004.png`.
 *
 * IT IS IDENTIFIED BY THE SLOT THAT PRINTS IT, NOT BY A FLAG ON THE ROW, and
 * that is forced by the schema rather than chosen: `role` is a field on
 * `pages.slots[]`, not on `media` (`collections/pages.ts`), for the same
 * reason `DATA_MODEL.md` puts the focal point there - a role is a property of
 * a placement, not of a photograph. So the question "is this row decorative?"
 * can only be answered from the journey's pages, which is why the rule comes
 * in halves: {@link ephemeraMediaIds} reads the ids out of `pages` rows the
 * caller has, {@link galleryFrameWhere} turns them into the clause, and
 * {@link journeyPagesQuery} is the query a caller holding no pages makes to
 * get them. `readBookBundle` already queries every page in the book for its
 * slots, so it pays NO extra query for this - it only had to ask for the
 * pages before the census rather than after.
 *
 * EVERY EXPORT HERE IS PURE, and that is deliberate rather than incidental:
 * this is the module that decides what a reader is shown and what a reader
 * can download, so it is the last module in the gallery's path that should
 * only be reachable through a database. Taking the `Payload` instance as a
 * parameter would have moved all of it behind the integration suite; handing
 * back a `where` and a query shape instead leaves the whole rule gated by the
 * pre-commit unit pass (CLAUDE.md §2.1), with the three readers' integration
 * suites proving it against real rows on top.
 *
 * `hidden: true` ON THE SCRAP WAS REJECTED, and the sweep's own suggestion of
 * it is why this paragraph exists. The scrap already carries the flag the
 * query respects, so marking it hidden looks like a one-word fix in the seed.
 * It is not: `collections/media.ts`'s reader rule is a Where constraint that
 * Payload applies to `/api/media/file/<name>` as well as to a listing, so a
 * hidden scrap answers 403 to every signed-out reader and the Notes page
 * loses the texture `docs/deviations.md` §13 exists to keep. `hidden` means
 * "an editor took this out of the public diary"; this row is in the diary, on
 * the page, doing its job. Excluding it where it is READ AS A GALLERY FRAME
 * leaves it exactly as readable everywhere it is drawn.
 *
 * NO N+1 (CLAUDE.md §6). The `pages` read is one query over a journey's three
 * rows - or, for the book, the one query it already made over all thirty -
 * with `depth: 0` and `slots` the only column selected. Nothing here grows
 * with the sixty-one frames it filters. The pages query matches
 * `readBookBundle`'s in shape, including the absence of a `_status` filter: a
 * slot on a drafted page still names a scrap, and a scrap that reappeared in
 * the gallery whenever an editor unpublished a page would be the same defect
 * with a harder reproduction.
 * Depends on: the `Where` type from `payload`. Nothing else - see above.
 */
import type { Where } from 'payload'

/**
 * The sort every reader of this list applies, kept here with the filter
 * because the two together are what make a frame's POSITION meaningful. Ties
 * are broken by `id` so the order is total rather than merely mostly
 * determined: `media.order` is an editor-facing integer nothing enforces the
 * uniqueness of, and a gallery whose tiles swapped places between two
 * requests would make every frame number a lie.
 */
export const GALLERY_FRAME_SORT: readonly string[] = ['order', 'id']

/**
 * The shape {@link ephemeraMediaIds} reads - structural rather than the
 * generated `Page` type, so a caller can hand it the narrow `select` it
 * already made without widening the query to satisfy a signature.
 */
export interface PageSlotSource {
  readonly slots?:
    | readonly {
        readonly role?: ('hero' | 'ephemera' | 'frame') | null
        readonly media?: (number | null) | { readonly id: number }
      }[]
    | null
}

/**
 * The `media` ids these page rows print as decorative ephemera.
 * @param pages - `pages` rows with their `slots` selected, at any depth.
 * @returns Every such id, empty when none of the rows prints a scrap.
 * @example
 * ephemeraMediaIds(pagesResult.docs) // [20]
 */
export const ephemeraMediaIds = (pages: readonly PageSlotSource[]): readonly number[] =>
  pages.flatMap((page) =>
    (page.slots ?? []).flatMap((slot): number[] => {
      if (slot.role !== 'ephemera') return []
      // `?.` covers both an absent slot media and an explicitly null one, so
      // `undefined` is the only empty case left to test for.
      const id = typeof slot.media === 'number' ? slot.media : slot.media?.id
      return id === undefined ? [] : [id]
    }),
  )

/**
 * Builds the `where` clause admitting the given journeys' gallery frames.
 *
 * @param journeyNumericIds - The owning journeys' Payload ids - one for a
 *   gallery, every journey in the book for the census.
 * @param decorativeMediaIds - The ids {@link ephemeraMediaIds} found.
 * @returns A Payload `where` admitting those journeys' visible photographs and
 *   nothing else - see this module's header for what "nothing else" excludes.
 * @example
 * galleryFrameWhere([7], [20])
 */
export const galleryFrameWhere = (
  journeyNumericIds: readonly number[],
  decorativeMediaIds: readonly number[],
): Where => ({
  and: [
    { journey: { in: [...journeyNumericIds] } },
    { hidden: { not_equals: true } },
    // Omitted rather than passed as an empty `not_in`: a book with no scrap
    // anywhere should produce the same query it always did.
    ...(decorativeMediaIds.length > 0 ? [{ id: { not_in: [...decorativeMediaIds] } }] : []),
  ],
})

/**
 * The `find('pages')` arguments a single-gallery reader needs to learn its
 * journey's scrap - the query SHAPE, kept here beside the rule it feeds so
 * the two readers cannot drift on it either. `readBookBundle` does not use
 * it: that module already reads every page in the book with `slots` selected,
 * and composes {@link ephemeraMediaIds} and {@link galleryFrameWhere} from
 * the result at no extra query.
 *
 * `depth: 0` and `slots` alone (CLAUDE.md §7). No `_status` filter, matching
 * `readBookBundle`'s own pages query: a slot on a drafted page still names a
 * scrap, and a scrap that reappeared in the gallery whenever an editor
 * unpublished a page would be the same defect with a harder reproduction.
 *
 * @param journeyNumericId - The owning journey's Payload id.
 * @returns Arguments for `payload.find`, ready to spread or pass whole.
 * @example
 * const pages = await payload.find(journeyPagesQuery(journeyDoc.id))
 * const where = galleryFrameWhere([journeyDoc.id], ephemeraMediaIds(pages.docs))
 */
export const journeyPagesQuery = (
  journeyNumericId: number,
): {
  readonly collection: 'pages'
  readonly depth: 0
  readonly pagination: false
  readonly limit: number
  readonly where: Where
  readonly select: { readonly slots: true }
} => ({
  collection: 'pages',
  depth: 0,
  pagination: false,
  limit: 5000,
  where: { journey: { equals: journeyNumericId } },
  select: { slots: true },
})
