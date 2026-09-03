/**
 * readGalleryBundle — the serialization boundary between Payload and one
 * journey's gallery.
 *
 * Repository pattern (CLAUDE.md §3.3), and the gallery's counterpart to
 * `readBookBundle.ts`: the only place a Payload `media` row becomes a
 * {@link GalleryFrame}. The `/gallery/<slug>` route and the components under
 * `components/gallery/` never learn what a Payload collection looks like -
 * they read a typed `GalleryBundle` (`@travel-diary/domain/gallery`) and
 * nothing else.
 *
 * Three Payload queries, always, whatever the gallery's size (CLAUDE.md §6,
 * no N+1):
 *   1. `find('journeys')` - the one journey the slug names, if it is
 *      published, not soft-deleted and not archived. Same three-part filter
 *      `readBookBundle` applies to the whole book, because a gallery is
 *      reachable by URL whether or not the book links to it: a journey an
 *      editor unpublished must 404 here too, not merely disappear from the
 *      bookmark rail.
 *   2. `findGlobal('book')` - `galleryThumbPx` alone, the grid's minimum tile
 *      track (SCREENS.md §1.8).
 *   3. `find('media')` - every one of that journey's visible frames, in one
 *      query, sorted by the media order the seed writes.
 * All three set `depth: 0` explicitly and select only the fields this module
 * reads (CLAUDE.md §7).
 *
 * `hidden` IS FILTERED IN THE QUERY, NOT LEFT TO ACCESS CONTROL, and that is
 * a security requirement rather than a style choice. `collections/media.ts`
 * withholds a hidden row from an unauthenticated READER, but this module runs
 * through Payload's Local API with no user, where access control is
 * overridden by default - so without this `where` clause a hidden photograph
 * would appear in the public gallery. SECURITY.md's objection to direct media
 * URLs is precisely that they "invite enumeration of everything in the
 * bucket, including anything marked hidden"; a gallery that listed them would
 * be that enumeration, published.
 *
 * THE FOCAL POINT COMES FROM THE MEDIA ITEM. DATA_MODEL.md's rule is
 * "`media.focalPoint` is the default; the slot overrides it", and a gallery
 * frame has no slot - it is a media item shown on its own. This is the second
 * of the two placements in the product where the media item's own value is
 * the only one there is (the About portrait is the first, and
 * `readBookBundle.ts`'s header says so).
 *
 * A FRAME WITH NO DERIVATIVE IS SKIPPED, NOT THROWN, which is the opposite of
 * `readBookBundle`'s policy for a page slot and deliberately so. A slot with
 * no derivative is a page with a hole in it, and the book is a fixed
 * composition; a gallery is a list, and one unprocessed upload among sixty is
 * not a reason to answer 500 for the other fifty-nine. It is logged through
 * `payload.logger` so the gap is diagnosable rather than silent - never the
 * document itself.
 *
 * `null` FOR AN UNKNOWN SLUG, so the route can call `notFound()`. Same
 * reasoning as `addressedPageIndex`'s: an address naming no journey is an
 * ordinary outcome of an ordinary URL, not an exceptional one.
 *
 * Wrapped in React's `cache` for the reason `readBookBundle`'s header sets
 * out at length: the route reads the bundle in `generateMetadata` and again
 * in the page component, and without deduplication that is six queries for
 * one document instead of three.
 * Depends on: cache (react); getPayload (./payload); GalleryBundle,
 * GalleryFrame, galleryThumbSize (@travel-diary/domain/gallery);
 * galleryDownloadPath (@travel-diary/domain/galleryDownload); journeyId,
 * mediaId (@travel-diary/domain/ids); the generated Payload types.
 */
import { cache } from 'react'
import type { GalleryBundle, GalleryFrame } from '@travel-diary/domain/gallery'
import { galleryThumbSize } from '@travel-diary/domain/gallery'
import { galleryDownloadPath } from '@travel-diary/domain/galleryDownload'
import { journeyId, mediaId } from '@travel-diary/domain/ids'
import type { Media as PayloadMedia } from '../payload-types'
import { getPayload } from './payload'

/** The exact shape the media query's own `select` returns. */
type SelectedMediaDoc = Pick<
  PayloadMedia,
  'id' | 'sizes' | 'alt' | 'caption' | 'kind' | 'durationSec' | 'focalX' | 'focalY' | 'allowDownload'
>

/** Every derivative tier a media row can carry, as `media.sizes`' own keys. */
type DerivativeTier = keyof NonNullable<SelectedMediaDoc['sizes']>

/**
 * The tiers a GRID tile prefers, smallest first. A tile is at most 300 CSS
 * pixels wide (`GALLERY_THUMB_SIZE.max`), so the 400px `thumb` already covers
 * it at better than 1x and comfortably at 2x on the smallest tile - anything
 * larger is bytes a reader scrolling past sixty of them never sees.
 */
const TILE_TIERS: readonly DerivativeTier[] = ['thumb', 'tile', 'frame', 'hero']

/**
 * The tiers the LIGHTBOX prefers, largest first - it draws one photograph
 * full screen at `object-fit: contain`. `hero2x` is deliberately not first:
 * it is the 4000px tier the book uses for 2x displays, and a lightbox is one
 * image a reader chose rather than a page's LCP element, so `hero`'s 2000px
 * is the better default and `hero2x` is not offered at all.
 */
const FULL_TIERS: readonly DerivativeTier[] = ['hero', 'frame', 'tile', 'thumb']

/** The slice of Payload's own logger this module writes to. */
interface StructuredLogger {
  warn: (mergingObject: Record<string, unknown>, message: string) => void
}

/**
 * The first available derivative URL in `tiers`' order.
 * @param media - The media row (only `sizes` is read).
 * @param tiers - The tiers to try, in preference order.
 * @returns The URL, or `undefined` when the row has none of them - never the original.
 */
const derivativeUrl = (media: SelectedMediaDoc, tiers: readonly DerivativeTier[]): string | undefined => {
  for (const tier of tiers) {
    const url = media.sizes?.[tier]?.url
    if (url !== null && url !== undefined) return url
  }
  return undefined
}

/**
 * Converts one `media` row into a {@link GalleryFrame}.
 * @param doc - The media row, `depth: 0`.
 * @param journeySlug - The journey the frame belongs to, for its download path.
 * @param logger - Where a skipped frame's warning is written.
 * @returns The frame, or `undefined` when the row cannot be rendered - an id
 *   that will not brand, or no derivative of any tier.
 */
const toGalleryFrame = (
  doc: SelectedMediaDoc,
  journeySlug: string,
  logger: StructuredLogger,
): GalleryFrame | undefined => {
  const brandedId = mediaId(String(doc.id))
  const tileSrc = derivativeUrl(doc, TILE_TIERS)
  const fullSrc = derivativeUrl(doc, FULL_TIERS)

  if (!brandedId.ok || tileSrc === undefined || fullSrc === undefined) {
    logger.warn(
      { mediaId: doc.id, journeySlug },
      'gallery frame has no derivative of any tier; omitting it rather than failing the whole gallery',
    )
    return undefined
  }

  return {
    id: brandedId.value,
    tileSrc,
    fullSrc,
    downloadHref: galleryDownloadPath(journeySlug, brandedId.value),
    alt: doc.alt ?? '',
    caption: doc.caption ?? '',
    // `kind` is set by the media pipeline rather than by an author and is
    // nullable until it runs, so anything not explicitly a clip is a
    // photograph - the same reading `readBookBundle`'s census applies.
    kind: doc.kind === 'clip' ? 'clip' : 'still',
    durationSec: doc.durationSec ?? undefined,
    focalX: doc.focalX ?? 50,
    focalY: doc.focalY ?? 50,
    // Schema default `true`, so only an explicit `false` withholds a
    // download - a row predating the field is downloadable, not withheld.
    downloadable: doc.allowDownload !== false,
  }
}

/**
 * Reads one journey's full gallery.
 *
 * @param slug - The journey's slug, exactly as the URL carried it.
 * @returns The {@link GalleryBundle}, or `null` when no published journey answers to `slug`.
 * @example
 * const bundle = await readGalleryBundle('patagonia')
 */
export const readGalleryBundle = cache(async (slug: string): Promise<GalleryBundle | null> => {
  const payload = await getPayload()

  const journeysResult = await payload.find({
    collection: 'journeys',
    depth: 0,
    limit: 1,
    // The same three-part filter `readBookBundle` applies to the book - see
    // this module's header for why a gallery has to repeat it rather than
    // inherit it.
    where: {
      and: [
        { slug: { equals: slug } },
        { _status: { equals: 'published' } },
        { deletedAt: { equals: null } },
        { archived: { not_equals: true } },
      ],
    },
    select: { slug: true, name: true, place: true, dates: true },
  })
  const journeyDoc = journeysResult.docs[0]
  if (journeyDoc === undefined) return null

  const brandedJourneyId = journeyId(String(journeyDoc.id))
  /* c8 ignore next -- an invariant guard, not a reachable state: branding
   * rejects only the empty string, and this id came from Payload itself. */
  if (!brandedJourneyId.ok) return null

  const book = await payload.findGlobal({ slug: 'book', depth: 0, select: { galleryThumbPx: true } })

  const mediaResult = await payload.find({
    collection: 'media',
    depth: 0,
    pagination: false,
    limit: 20_000,
    // Ties broken by `id` so the order is total rather than merely mostly
    // determined: `media.order` is an editor-facing integer nothing enforces
    // the uniqueness of, and a gallery whose tiles swapped places between two
    // requests would make every frame number a lie.
    sort: ['order', 'id'],
    where: { and: [{ journey: { equals: journeyDoc.id } }, { hidden: { not_equals: true } }] },
    select: {
      sizes: true,
      alt: true,
      caption: true,
      kind: true,
      durationSec: true,
      focalX: true,
      focalY: true,
      allowDownload: true,
    },
  })

  return {
    journey: {
      id: brandedJourneyId.value,
      slug: journeyDoc.slug,
      name: journeyDoc.name,
      place: journeyDoc.place,
      dates: journeyDoc.dates,
    },
    frames: mediaResult.docs.flatMap((doc) => {
      const frame = toGalleryFrame(doc, journeyDoc.slug, payload.logger)
      return frame === undefined ? [] : [frame]
    }),
    thumbSize: galleryThumbSize(book.galleryThumbPx),
  }
})
