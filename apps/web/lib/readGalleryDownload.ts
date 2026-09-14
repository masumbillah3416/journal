/**
 * readGalleryDownload — resolves one gallery frame into the bytes, type and
 * filename our own download handler serves.
 *
 * SECURITY.md, Uploads: "the gallery's download action must serve a
 * derivative through your own handler, not a bucket URL. Direct URLs invite
 * enumeration of everything in the bucket, including anything marked hidden."
 * This module is the handler's whole body; the route file it backs
 * (`app/(diary)/gallery/[slug]/download/[id]/route.ts`) does nothing but
 * await the params, call this, and turn the `Result` into a `Response`. That
 * split is not tidiness: a Next.js route handler cannot be run without a
 * request context, so a rule written inside one is a rule no test can check,
 * and every one of the four checks below is a rule worth checking.
 *
 * FOUR THINGS ARE VERIFIED BEFORE ANY BYTE IS READ, and each answers the same
 * `err` so the handler answers one 404 for all of them - a handler that
 * distinguished "no such frame" from "hidden" from "downloads withheld" would
 * be the enumeration oracle the whole rule exists to close:
 *   1. The journey exists, is published, is not soft-deleted and is not
 *      archived - the same filter `readGalleryBundle` applies.
 *   2. The frame belongs to THAT journey. Without it the `<slug>` segment
 *      would be decoration and any media id would be downloadable through any
 *      journey's path.
 *   3. The frame is one of the journey's gallery frames at all - not
 *      `hidden`, and not the Notes page's decorative ephemera scrap. Both
 *      exclusions arrive as `galleryFrameWhere`'s clause rather than as a
 *      filter written here, so this module and `readGalleryBundle` cannot
 *      disagree about what a frame is; PH1-002 is what that disagreement
 *      would cost, because the filter is also what NUMBERS the frame, and a
 *      grid that dropped the scrap while this handler kept it would have
 *      named every download after it for the wrong photograph. This module
 *      runs through Payload's Local API with no user, where access control is
 *      overridden, so `hidden` has to be in the query - see
 *      `./galleryFrames`'s header for both points.
 *   4. `allowDownload` has not been turned off for it.
 *
 * IT SERVES A DERIVATIVE, NEVER THE ORIGINAL (CLAUDE.md §6, "Always a
 * derivative tier, never an original"). The original is the file the author
 * uploaded; a derivative is re-encoded, which is also what strips metadata
 * (SECURITY.md's EXIF requirement). Serving the original from a download
 * button would hand back the GPS coordinates the pipeline exists to remove.
 *
 * THE BYTES COME THROUGH THE STORAGE PORT (Ports & Adapters, CLAUDE.md §3.3),
 * not through `fs` directly, so the Cloudflare R2 adapter Phase 3 introduces
 * is a one-line substitution here rather than a rewrite. The local adapter is
 * constructed against the same absolute `MEDIA_DIR` the `media` collection
 * writes uploads to, so the two cannot disagree about where the store is -
 * the disagreement that made every seeded photograph answer 500 in Task 10.
 *
 * THE CACHE POLICY IS DECIDED HERE, NOT IN THE ROUTE, and it is the half of
 * `site.passwordProtect` this module owns. A `public` response is cacheable by
 * any proxy between us and the reader, so it would OUTLIVE a gate: the moment
 * the setting is on, a derivative served from a shared cache is one nothing
 * asked permission for. `downloadCacheControl` turns the flag into the header
 * (`@travel-diary/domain/galleryDownload`), and this module is the reader of
 * the flag that the route's own comment said for two phases did not exist.
 * **What this does NOT do is refuse the request.** Nothing here returns `err`
 * for a gated book; the request-level gate in front of the diary is still
 * ahead, and this header is what stops a cache from undoing it when it lands.
 *
 * THE FILENAME IS DERIVED, NOT STORED. `downloadFilename` builds it from the
 * journey's slug and the frame's number in the gallery, so a download never
 * leaks the store's own key naming back to the reader. That is why this
 * module pays a third query for the journey's ordered frame ids: the number in
 * the filename has to be the number the reader saw in the lightbox.
 * Depends on: getPayload (./payload), createLocalStorage (./adapters/local-storage),
 * GALLERY_FRAME_SORT/ephemeraMediaIds/galleryFrameWhere/journeyPagesQuery
 * (./galleryFrames),
 * MEDIA_DIR (../collections/media), downloadContentType/downloadFilename
 * (@travel-diary/domain/galleryDownload), Result (@travel-diary/domain/result).
 */
import type { DownloadableContentType } from '@travel-diary/domain/galleryDownload'
import { downloadCacheControl, downloadContentType, downloadFilename } from '@travel-diary/domain/galleryDownload'
import type { Result } from '@travel-diary/domain/result'
import { err, ok } from '@travel-diary/domain/result'
import { MEDIA_DIR } from '../collections/media'
import { createLocalStorage } from './adapters/local-storage'
import { GALLERY_FRAME_SORT, ephemeraMediaIds, galleryFrameWhere, journeyPagesQuery } from './galleryFrames'
import { getPayload } from './payload'

/** What the route handler needs to answer a download request. */
export interface Attachment {
  /** The derivative's raw bytes. */
  readonly bytes: Uint8Array
  /** One of the three types the allowlist admits - never a stored value passed through. */
  readonly contentType: DownloadableContentType
  /** The name the browser saves the file under, derived rather than stored. */
  readonly filename: string
  /**
   * The `Cache-Control` the route sends, decided by
   * `downloadCacheControl` from whether the book is gated.
   *
   * It is on the ATTACHMENT rather than in the route because a Next.js route
   * handler cannot be run without a request context, which is the same split
   * this module's header argues for the four checks above - and a header is
   * exactly the thing a unit test can be right about while the route is wrong,
   * so `e2e/gallery.spec.ts` asserts the one the route actually sends.
   */
  readonly cacheControl: string
}

/**
 * The derivative tiers a download prefers, largest first. `hero2x` is
 * excluded deliberately: at 4000px it is the tier the book uses to fill a 4K
 * display, and a download button is not a request for the largest file that
 * exists. The original is not in this list at all, and must never be.
 *
 * `grid` (ADR 0013's 700px rung, Phase 3 Task 10) sits between `tile` and
 * `thumb` so that a row which could derive no further than it is still
 * downloadable at the best size it has. Without the entry the walk falls past
 * a derivative the row carries and hands back the 400px `thumb` - which is
 * `ok`, and wrong, and is why that case asserts the BYTES rather than the
 * `ok`.
 *
 * KNOWN DEFECT, RECORDED RATHER THAN FIXED: every tier after `frame` in this
 * list is SQUARE (`apps/web/collections/media.ts` gives `tile`, `grid` and
 * `thumb` a width AND a height, so Payload crops them to `cover`), and Payload
 * derives a width-only tier only from a source at least that wide. So a row
 * whose original is narrower than `frame`'s 1400px is downloaded CROPPED - a
 * 1200x900 photograph arrives as 800x800, measured. Closing it needs an
 * uncropped rung or a `fit` change, which is a derivative-generation decision
 * with a re-derive and a gallery image budget behind it, and a failing test
 * first (CLAUDE.md §10). MED-001 in
 * `docs/qa/2026-09-08-media-pipeline-sweep.md`; the same defect reaches the
 * lightbox through `readGalleryBundle.ts`'s `FULL_TIERS`.
 */
const DOWNLOAD_TIERS = ['hero', 'frame', 'tile', 'grid', 'thumb'] as const

/** One 404 for every refusal - see this module's header. */
const NOT_AVAILABLE = 'no downloadable frame at that address'

/**
 * The store the derivatives live in, behind the Storage port. Built once at
 * module scope rather than per request: it holds no state, and rebuilding it
 * on every download would be an allocation per byte range for nothing.
 */
const mediaStore = createLocalStorage(MEDIA_DIR)

/**
 * Resolves a gallery download request into the bytes to serve.
 *
 * @param journeySlug - The `<slug>` segment, exactly as the URL carried it.
 * @param frameId - The `<id>` segment, exactly as the URL carried it.
 * @returns `ok` with the {@link Attachment}, or `err` - one message for every
 *   refusal, so the handler cannot accidentally become an oracle.
 * @example
 * const attachment = await readGalleryDownload('patagonia', '412')
 */
export const readGalleryDownload = async (
  journeySlug: string,
  frameId: string,
): Promise<Result<Attachment, string>> => {
  const payload = await getPayload()

  const journeys = await payload.find({
    collection: 'journeys',
    depth: 0,
    limit: 1,
    where: {
      and: [
        { slug: { equals: journeySlug } },
        { _status: { equals: 'published' } },
        { deletedAt: { equals: null } },
        { archived: { not_equals: true } },
      ],
    },
    select: { slug: true },
  })
  const journey = journeys.docs[0]
  if (journey === undefined) return err(NOT_AVAILABLE)

  // The same ordering, filter and pagination `readGalleryBundle` uses, so the
  // position this download names is the position the reader was shown - taken
  // from `./galleryFrames` rather than restated, which is what makes "the
  // same" true by construction instead of by inspection. Ids only - one
  // column for a number.
  // Which of this journey's media its own pages print as decorative ephemera -
  // see `./galleryFrames`, and `readGalleryBundle`, which asks the same thing.
  const journeyPages = await payload.find(journeyPagesQuery(journey.id))

  const frames = await payload.find({
    collection: 'media',
    depth: 0,
    pagination: false,
    limit: 20_000,
    sort: [...GALLERY_FRAME_SORT],
    where: galleryFrameWhere([journey.id], ephemeraMediaIds(journeyPages.docs)),
    select: { order: true },
  })
  const index = frames.docs.findIndex((doc) => String(doc.id) === frameId)
  const frameDoc = index === -1 ? undefined : frames.docs[index]
  if (frameDoc === undefined) return err(NOT_AVAILABLE)

  const media = await payload.findByID({
    collection: 'media',
    id: frameDoc.id,
    depth: 0,
    select: { sizes: true, allowDownload: true },
  })
  // Schema default `true`: only an explicit `false` withholds a download.
  if (media.allowDownload === false) return err(NOT_AVAILABLE)

  const derivative = DOWNLOAD_TIERS.map((tier) => media.sizes?.[tier]).find(
    (size) => size?.filename !== null && size?.filename !== undefined,
  )
  const storageKey = derivative?.filename
  if (storageKey === null || storageKey === undefined) return err(NOT_AVAILABLE)

  const contentType = downloadContentType(derivative?.mimeType)
  if (!contentType.ok) return err(NOT_AVAILABLE)

  const bytes = await mediaStore.get(storageKey)
  if (!bytes.ok) return err(NOT_AVAILABLE)

  // ONE MORE GLOBAL READ, `select`ed to the single field (CLAUDE.md §7:
  // select only what is needed, and set `depth` explicitly). It is read here
  // rather than in the route because a route handler cannot be tested without
  // a request context - the same split this module's header already argues
  // for the other four checks. LAST, after every refusal has been answered, so
  // a 404 pays nothing for a header it will never send.
  const site = await payload.findGlobal({ slug: 'site', depth: 0, select: { passwordProtect: true } })

  return ok({
    bytes: bytes.value,
    contentType: contentType.value,
    filename: downloadFilename(journey.slug, index, frames.docs.length, contentType.value),
    cacheControl: downloadCacheControl({ gated: site.passwordProtect === true }),
  })
}
