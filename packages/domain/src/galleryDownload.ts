/**
 * galleryDownload — the rules the gallery's download action is bound by.
 *
 * SECURITY.md, Uploads: "the gallery's download action must serve a
 * derivative through your own handler, not a bucket URL. Direct URLs invite
 * enumeration of everything in the bucket, including anything marked hidden."
 * And, two bullets above it: "Set `Content-Disposition: attachment` and a
 * strict `Content-Type` on downloads."
 *
 * Those are two separate requirements and this module is both of them, kept
 * here rather than inside the route handler for the reason CLAUDE.md §2 keeps
 * insisting on: a Next.js route handler cannot be run without a request
 * context, so a rule written inside one is a rule no test can check. The
 * handler at `apps/web/app/(diary)/gallery/[slug]/download/[id]/route.ts`
 * spends these decisions; it does not take them.
 *
 * WHY THE PATH IS ROOT-RELATIVE AND ENCODED. A handler of ours is only ours
 * if the reader cannot steer the browser somewhere else with it. The path
 * carries no scheme and no host, so it can never resolve to `MEDIA_ORIGIN` or
 * to any other origin; and both variable segments are percent-encoded, so a
 * slug or an id carrying `/` or `..` becomes one literal segment rather than
 * a climb up the route tree. `MediaId` is branded, but branding rejects only
 * the empty string - it is not a validator, and treating it as one here would
 * be exactly the "trust the type" mistake CLAUDE.md §7 draws the boundary
 * against.
 *
 * WHY THE CONTENT TYPE IS AN ALLOWLIST RATHER THAN A PASSTHROUGH. The stored
 * `mimeType` came from an upload, and SECURITY.md's whole objection to
 * serving uploads from our own origin is that one uploaded file becomes
 * stored XSS with the reader's own session attached. Echoing a stored type
 * back out of our origin re-opens that on the download path specifically:
 * `image/svg+xml` is an HTML document, and this list is what refuses it by
 * name rather than by hoping the upload pipeline already did. Three types,
 * because three is what the still pipeline re-encodes to
 * (docs/adr/0003-derivative-generation.md); a clip's type is absent
 * deliberately, since video is deferred (docs/adr/0004-media-pipeline-mode.md)
 * and an unused entry would be an untested branch.
 * Depends on: MediaId from ./ids, Result from ./result.
 */
import type { MediaId } from './ids'
import type { Result } from './result'
import { err, ok } from './result'

/**
 * The path our own handler serves one frame's derivative from.
 *
 * @param journeySlug - The journey the frame belongs to. The handler checks the frame really is that journey's.
 * @param frameId - The media row's id.
 * @returns A root-relative path - never an absolute URL, and never the store's own.
 * @example
 * galleryDownloadPath('tokyo', frame.id) // '/gallery/tokyo/download/412'
 */
export const galleryDownloadPath = (journeySlug: string, frameId: MediaId): string =>
  `/gallery/${encodeURIComponent(journeySlug)}/download/${encodeURIComponent(frameId)}`

/**
 * The only `Content-Type` values a download may be served as - the three
 * still formats the derivative pipeline produces. Anything else, `image/svg+xml`
 * above all, is refused rather than passed through; see this module's header.
 */
export const DOWNLOADABLE_CONTENT_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp'] as const)

/** One of the three types a download may be served as. */
export type DownloadableContentType = (typeof DOWNLOADABLE_CONTENT_TYPES)[number]

/** The file extension each servable type is written with. */
const EXTENSIONS: Readonly<Record<DownloadableContentType, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

/**
 * Narrows a stored mime type to one this handler will serve.
 *
 * The comparison is exact, with no parameter stripping: a stored
 * `image/png; charset=utf-8` is not a derivative this pipeline wrote, and
 * normalising it would be guessing at the intent of a row we did not expect.
 * @param mimeType - The derivative's stored mime type, or `null`/`undefined` when it has none.
 * @returns `ok` with the type to serve, or `err` naming why it was refused.
 */
export const downloadContentType = (mimeType: string | null | undefined): Result<DownloadableContentType, string> => {
  const match = DOWNLOADABLE_CONTENT_TYPES.find((allowed) => allowed === mimeType)
  if (match === undefined) return err(`"${String(mimeType)}" is not a type this handler serves`)

  return ok(match)
}

/** Anything a filename should not carry, collapsed to a single separator. */
const UNSAFE_FILENAME_RUN = /[^a-z0-9]+/g

/** A leading or trailing separator left behind by {@link UNSAFE_FILENAME_RUN}. */
const EDGE_SEPARATORS = /^-+|-+$/g

/**
 * The filename the browser saves a frame under.
 *
 * The stem is derived from the journey's slug and the frame's number rather
 * than from the stored filename, which would leak the store's own key naming
 * back to a reader - the same enumeration surface SECURITY.md objects to,
 * shrunk to one row. The extension comes from the type we decided to serve,
 * never from the stored name.
 * @param journeySlug - The journey the frame belongs to.
 * @param index - The frame's 0-based position in the gallery's current order.
 * @param total - How many frames the gallery holds, which sets the number's padding.
 * @param contentType - The type {@link downloadContentType} approved.
 * @returns e.g. `'tokyo-007.jpg'`.
 */
export const downloadFilename = (
  journeySlug: string,
  index: number,
  total: number,
  contentType: DownloadableContentType,
): string => {
  const stem = journeySlug.toLowerCase().replace(UNSAFE_FILENAME_RUN, '-').replace(EDGE_SEPARATORS, '')
  const number = String(index + 1).padStart(Math.max(3, String(total).length), '0')

  // `'frame'` rather than an empty stem: a slug of punctuation alone reduces
  // to nothing, and a file called `-007.jpg` reads as a broken download.
  return `${stem === '' ? 'frame' : stem}-${number}.${EXTENSIONS[contentType]}`
}
