/**
 * route.ts — `GET /gallery/<slug>/download/<id>`: the gallery's download
 * action, served by us.
 *
 * SECURITY.md, Uploads: "the gallery's download action must serve a
 * derivative through your own handler, not a bucket URL. Direct URLs invite
 * enumeration of everything in the bucket, including anything marked hidden."
 * This route is that handler. The prototype's own lightbox
 * (`Travel Diary.dc.html`, the `lbSrc` binding) is a bare `<a href="<image>"
 * download>` onto the image itself, so this is a deliberate departure from
 * it, recorded in docs/deviations.md.
 *
 * IT TAKES NO DECISIONS. Which journey, which frame, whether it is hidden,
 * whether downloads are allowed for it, which derivative tier, what type and
 * what filename are all `apps/web/lib/readGalleryDownload.ts`'s, which has
 * its own integration suite against a real Payload; the pure rules under it
 * (the type allowlist, the derived filename, the root-relative path) are
 * `@travel-diary/domain/galleryDownload`'s, gated at 100%. This file awaits
 * the params, calls that, and turns a `Result` into a `Response`.
 *
 * THREE HEADERS MATTER AND EACH IS A REQUIREMENT RATHER THAN A HABIT:
 *   - `Content-Disposition: attachment` - SECURITY.md asks for it by name.
 *     It also means a type that somehow slipped the allowlist could not be
 *     rendered as a document in our own origin.
 *   - `X-Content-Type-Options: nosniff` - without it a browser may sniff past
 *     the strict `Content-Type` the allowlist just decided on, which is most
 *     of what that allowlist was for.
 *   - `X-Robots-Tag: noindex` - SECURITY.md's Public site section requires
 *     robots directives to be served as headers as well as in `robots.txt`,
 *     "since the pages are statically served". A download is a file, never a
 *     result; indexing one would put the store's contents in a search index,
 *     which is the enumeration this route exists to prevent, arrived at from
 *     the other side.
 *
 * EVERY REFUSAL IS THE SAME 404. `readGalleryDownload` returns one `err` for
 * "no such journey", "no such frame", "not this journey's frame", "hidden"
 * and "downloads withheld" alike, so this route cannot become the oracle that
 * tells an enumerator which of those it hit.
 * Depends on: `readGalleryDownload` (../../../../../../lib/readGalleryDownload).
 */
/* c8 ignore start -- Framework passthrough with no authored logic: await the
 * route params, call `readGalleryDownload`, answer 404 or the bytes with
 * three fixed headers. Every decision is that module's or
 * `@travel-diary/domain/galleryDownload`'s, each with its own suite. It
 * cannot be measured by either Vitest config (a route handler needs a real
 * Next request context), and this file's path contains Next.js dynamic-route
 * bracket segments, where `@vitest/coverage-v8`'s ignore-hint scanner is
 * documented not to take effect (CLAUDE.md §2.1) - so it is ALSO named by
 * exact path in vitest.config.ts's coverage exclude, which is the treatment
 * that actually holds here. Its runtime behaviour is covered in the browser
 * by e2e/gallery.spec.ts. */
import { readGalleryDownload } from '../../../../../../lib/readGalleryDownload'

/** The route's own parameters. Next 15+ hands them over as a promise. */
interface DownloadRouteContext {
  readonly params: Promise<{ readonly slug: string; readonly id: string }>
}

/**
 * Serves one gallery frame's derivative as an attachment.
 *
 * @param _request - The incoming request. Nothing is read from it: the whole
 *   input is the two path segments, and a download that varied by header
 *   could not be cached.
 * @param context - The route's own parameters.
 * @returns The derivative's bytes, or 404 for any refusal at all.
 */
export const GET = async (_request: Request, context: DownloadRouteContext): Promise<Response> => {
  const { slug, id } = await context.params
  const attachment = await readGalleryDownload(slug, id)

  if (!attachment.ok) return new Response('Not found', { status: 404 })

  return new Response(new Uint8Array(attachment.value.bytes), {
    headers: {
      'Content-Type': attachment.value.contentType,
      // The filename is derived from the journey slug and the frame number,
      // so it is already restricted to `[a-z0-9-]` and a known extension -
      // there is nothing in it that could break out of the quoted form.
      'Content-Disposition': `attachment; filename="${attachment.value.filename}"`,
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex',
      // A derivative is immutable for the life of the media row it belongs
      // to: replacing a photograph creates new derivative filenames, and this
      // route is keyed by the row's id, so a stale hour is the worst a reader
      // can get and a re-upload is not one.
      //
      // `public` IS CORRECT TODAY AND BECOMES WRONG THE MOMENT A JOURNEY IS
      // GATED. Every journey this handler will serve is published and
      // unauthenticated, so there is no reader-specific response for a shared
      // cache to hand to the wrong reader. `SECURITY.md`'s `passwordProtect`
      // is Phase 1's diary routing and `site.passwordProtect` is written by
      // the Phase 4 Settings screen; the first time a gate exists in front of
      // a journey, this header must become `private` (or `no-store`) for a
      // gated one, because a `public` response is cacheable by any proxy
      // between us and the reader and would outlive the gate. It is not made
      // conditional now because there is nothing to condition it on -
      // `readGalleryDownload` has no notion of a gated journey to return, and
      // inventing the flag here would be the same "inventing the policy"
      // `docs/security.md`'s `indexGalleries` row refuses. Revisit with
      // `passwordProtect`, in the same change that adds the gate.
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
