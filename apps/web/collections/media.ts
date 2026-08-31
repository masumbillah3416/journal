/**
 * media — the upload collection. Everything else references it.
 *
 * Transcribed verbatim from DATA_MODEL.md's `media` section. The `beforeChange`/
 * `afterChange` pipeline it documents (magic-byte sniffing, SVG rejection, EXIF
 * strip, re-encode, duplicate detection, clip transcode) depends on the storage
 * port and transcode queue built in later tasks and lands with them — this task
 * is schema only, per its own interface ("collections registered ... migrated").
 * Depends on: `payload`.
 */
import type { CollectionConfig } from 'payload'

/** The upload collection backing every still and clip in the diary. */
export const Media: CollectionConfig = {
  slug: 'media',
  upload: {
    staticDir: 'media',
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
