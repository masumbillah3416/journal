/**
 * media — the upload collection. Everything else references it.
 *
 * Transcribed verbatim from DATA_MODEL.md's `media` section. The `beforeChange`/
 * `afterChange` pipeline it documents (magic-byte sniffing, SVG rejection, EXIF
 * strip, re-encode, duplicate detection, clip transcode) is design spec Phase 3
 * ("Media pipeline") work, not this task's — its exit criteria are "a still and
 * a clip both survive a full round trip; EXIF verifiably absent; SVG verifiably
 * rejected." This task is schema only, per its own interface ("collections
 * registered ... migrated"). Two of those Phase 3 steps — EXIF stripping and
 * SVG rejection — are security requirements (SECURITY.md), not just pipeline
 * steps, so this pointer is load-bearing, not decorative.
 *
 * ACCESS AND STORAGE were both added in Phase 1 Task 10, the first task whose
 * page actually displays a photograph, and both were found by that page
 * failing to show one. `read` was Payload's default ("a logged-in user"), so
 * every image in the public diary answered 403; `staticDir` was the relative
 * string `'media'`, which Payload resolves against `process.cwd()`, so the
 * seed and the dev server disagreed about where the files were and the next
 * answer was 500. Neither failure was visible in a screenshot - the page laid
 * out perfectly with empty frames - which is why both now have tests
 * (`collections.integration.test.ts` for the access rules,
 * `e2e/notes.spec.ts` for the rendered photograph).
 * Depends on: `payload`, `node:path`/`node:url` for the absolute media path.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CollectionConfig } from 'payload'

/**
 * Where uploaded originals and their derivatives live on disk, as an ABSOLUTE
 * path anchored to this file rather than the relative `'media'` it used to
 * be. Payload resolves a relative `staticDir` against `process.cwd()`, and
 * this repository has two of those: `npm run db:seed` and `npm run dev` were
 * writing and reading different directories, so every photograph the seed
 * wrote answered 500 ("File ... is missing on the disk") when the diary asked
 * for it. Anchoring the path to the module means the store is the same
 * directory whichever script opens Payload and from wherever it is run.
 */
const MEDIA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../media')

/** The upload collection backing every still and clip in the diary. */
export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    // Read only. Create, update and delete keep Payload's default ("a logged-in
    // user"), which is what the admin runs as - a public diary must be able to
    // SHOW a photograph, never to add or change one.
    read: ({ req: { user } }) =>
      // An editor sees everything, including what they have hidden, so the
      // admin's own Media screen is not lying to them about what exists.
      user
        ? true
        : // A signed-out reader is a Where constraint rather than `true`:
          // SECURITY.md's objection to direct media URLs is precisely that
          // they "invite enumeration of everything in the bucket, including
          // anything marked hidden", so `hidden` has to withhold the row from
          // the file route as well as from a listing. Payload applies this
          // constraint to `/api/media/file/<name>` too, which is the URL the
          // diary's own <img> tags resolve to.
          { hidden: { not_equals: true } },
  },
  upload: {
    staticDir: MEDIA_DIR,
    // Powers the admin's focal-point picker; `pages.slots[].focalX/focalY`
    // overrides this per placement (DATA_MODEL.md, "Focal point lives on the slot").
    focalPoint: true,
    mimeTypes: ['image/jpeg', 'image/png', 'image/heic', 'video/mp4', 'video/quicktime'],
    imageSizes: [
      { name: 'thumb', width: 400, height: 400, position: 'centre' },
      { name: 'tile', width: 800, height: 800 },
      { name: 'frame', width: 1400 },
      { name: 'hero', width: 2000 },
      { name: 'hero2x', width: 4000 }, // 4K displays scale the book up ~2.4x
    ],
  },
  fields: [
    { name: 'journey', type: 'relationship', relationTo: 'journeys' },
    // Set by the processing pipeline, not the author.
    { name: 'kind', type: 'select', options: ['still', 'clip'], admin: { readOnly: true } },
    { name: 'caption', type: 'text' }, // shown under the photo
    { name: 'alt', type: 'text' }, // screen readers
    { name: 'capturedAt', type: 'date' }, // from EXIF, before stripping
    { name: 'posterAt', type: 'number' }, // clips: poster timestamp in seconds
    { name: 'posterImage', type: 'upload', relationTo: 'media' }, // extracted frame
    { name: 'durationSec', type: 'number' }, // clips
    { name: 'inBook', type: 'checkbox', defaultValue: false },
    { name: 'hidden', type: 'checkbox', defaultValue: false },
    { name: 'isCover', type: 'checkbox', defaultValue: false },
    { name: 'allowDownload', type: 'checkbox', defaultValue: true },
    { name: 'order', type: 'number' },
    { name: 'contentHash', type: 'text', index: true }, // duplicate detection
  ],
}
