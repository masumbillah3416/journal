/**
 * media — the upload collection. Everything else references it.
 *
 * Transcribed verbatim from DATA_MODEL.md's `media` section, plus the `state`
 * and `failureReason` fields the pipeline records its progress in
 * (docs/deviations.md §48). The `beforeChange` pipeline DATA_MODEL.md
 * documents (magic-byte sniffing, SVG rejection, EXIF strip, re-encode,
 * duplicate detection, clip transcode) is still ahead of this file - design
 * spec Phase 3, whose exit criteria are "a still and a clip both survive a
 * full round trip; EXIF verifiably absent; SVG verifiably rejected". Two of
 * those steps — EXIF stripping and SVG rejection — are security requirements
 * (SECURITY.md), not just pipeline steps, so this pointer is load-bearing,
 * not decorative.
 *
 * The `afterChange` rule from the same section IS built here, and it is the
 * only hook this collection has: setting `isCover` clears it on the journey's
 * OTHER media. No §3.3 pattern is implemented - a collection is a
 * configuration object Payload reads, and the one function below is a
 * narrowing of a value Payload hands it, not a seam of ours.
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
import type { CollectionConfig, PayloadRequest } from 'payload'
import type { Media as PayloadMedia } from '../payload-types'

/**
 * Where uploaded originals and their derivatives live on disk, as an ABSOLUTE
 * path anchored to this file rather than the relative `'media'` it used to
 * be. Payload resolves a relative `staticDir` against `process.cwd()`, and
 * this repository has two of those: `npm run db:seed` and `npm run dev` were
 * writing and reading different directories, so every photograph the seed
 * wrote answered 500 ("File ... is missing on the disk") when the diary asked
 * for it. Anchoring the path to the module means the store is the same
 * directory whichever script opens Payload and from wherever it is run.
 *
 * EXPORTED for one caller: `apps/web/lib/readGalleryDownload.ts`, which reads
 * a derivative's bytes back out of this same store through the Storage port
 * to serve the gallery's download action (SECURITY.md - the download must go
 * through a handler of ours, never a bucket URL). It is exported rather than
 * duplicated there precisely because the two disagreeing about where the
 * store is, is the defect this constant was written to fix.
 */
export const MEDIA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../media')

/**
 * The id of the journey a media row belongs to, or `null` when it belongs to
 * none.
 *
 * INVARIANT, relied on by the `afterChange` hook below: `doc.journey` arrives
 * in one of TWO shapes and the hook does not get to choose which. Payload
 * populates a relationship to the depth of the operation that fired the hook,
 * so an update at `depth: 0` hands it a bare id and an update above 0 hands it
 * the whole journey. Both are narrowed rather than cast, because a cast that
 * guessed wrong would not fail loudly - it would clear the wrong journey's
 * cover, which is exactly the class of defect CLAUDE.md §7 exists to prevent.
 * @param journey - The relationship value, as the hook received it.
 * @returns The journey's id, or `null` when the row belongs to no journey.
 * @example
 * journeyIdOf(4) // 4
 * journeyIdOf({ id: 4, name: 'Reykjavik', ... }) // 4
 * journeyIdOf(null) // null
 */
const journeyIdOf = (journey: PayloadMedia['journey']): number | null =>
  typeof journey === 'object' && journey !== null ? journey.id : (journey ?? null)

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
    // Set by the MediaProcessor pipeline, never by the author. `processing` is
    // a first-class UI state, not a missing image (spec §9.2): the Media
    // screen shows progress against it, and the Galleries poster filmstrip
    // needs a processed clip.
    // HANDOFF-DEVIATION: DATA_MODEL.md's `media` field list has no state of
    // any kind, yet its own `beforeChange` pipeline has six steps that can
    // each fail on a row that already exists. Without a state, a half-ingested
    // row is indistinguishable from a finished one. docs/deviations.md §48.
    {
      name: 'state',
      type: 'select',
      options: ['processing', 'ready', 'failed'],
      defaultValue: 'processing',
      admin: { readOnly: true },
    },
    // Why a `failed` row failed, in words the Media screen shows. Never a
    // stack trace and never a storage key.
    { name: 'failureReason', type: 'text', admin: { readOnly: true } },
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
  hooks: {
    // DATA_MODEL.md, `media`: "if `isCover` was set, clear it on the journey's
    // other media." A cover is per journey, so the clearing is per journey -
    // CLAUDE.md §7's first rule, and the reason the `journey` clause below is
    // correctness rather than an optimisation. The handoff records five
    // defects caused by per-journey state kept in one global value; a hook
    // that cleared every `isCover` in the collection would be the sixth.
    afterChange: [
      async ({ doc, req }: { doc: PayloadMedia; req: PayloadRequest }) => {
        if (doc.isCover !== true) return doc
        const journey = journeyIdOf(doc.journey)
        // A cover on a row that belongs to no journey clears nothing. "The
        // other media in no journey" must never become "the other media".
        if (journey === null) return doc

        // WHAT THIS DISCARDED RESULT CONTAINS, stated here because it is an
        // assumption a future edit could break (CLAUDE.md §1.1). A
        // `where`-scoped update in Payload 3.88.0 does NOT reject when a
        // document fails: it catches each one and pushes `{ id, message }`
        // onto the `errors` array of the `BulkOperationResult` it resolves
        // with (`payload/dist/collections/operations/update.js`, and the type
        // in `collections/config/types.d.ts`). Nor does it abort the
        // surrounding transaction - `killTransaction` runs only under
        // `bulkOperationsSingleTransaction`, which no `@payloadcms/*` package
        // sets - so with the Postgres adapter a per-document failure here is
        // genuinely silent.
        //
        // No guard is written for it, and that is deliberate rather than
        // overlooked: nothing in today's `media` can make `{ isCover: false }`
        // fail validation, so a guard's true arm would be unreachable and
        // would have to be bought with a `c8 ignore` for a hypothetical.
        // UNREACHABLE HERE MEANS "given today's field list", and that list is
        // growing - Phase 3 Task 5 added two fields, Tasks 7-9 add more, and
        // `DATA_MODEL.md`'s `beforeChange` validation pipeline is still ahead.
        // The first field that can refuse a write makes this the one place in
        // this collection where a refusal is swallowed; read `errors` then.
        await req.payload.update({
          collection: 'media',
          // Threaded through so this runs inside the transaction of the update
          // that fired the hook: the new cover and the cleared one commit
          // together, or neither does.
          req,
          depth: 0, // nothing here reads a populated relationship
          where: {
            and: [
              { journey: { equals: journey } },
              { id: { not_equals: doc.id } },
              // Keeps the write to the rows that need changing: without this
              // clause, setting a cover rewrites EVERY row in the journey
              // (CLAUDE.md §6 - no needless writes, no N+1). What bounds the
              // recursion is the guard above, not this clause, and that was
              // measured rather than assumed: removing this clause leaves
              // every case green except the one that reads `updatedAt` on a
              // bystander, which is how a needless write shows.
              { isCover: { equals: true } },
            ],
          },
          data: { isCover: false },
        })

        return doc
      },
    ],
  },
}
