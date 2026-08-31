/**
 * book — global settings for the physical-book chrome around the diary.
 *
 * Transcribed from DATA_MODEL.md's globals section: `title, subtitle, owner,
 * coverCloth, yearsShown, contentsNote, flipDurationMs (400-1600),
 * galleryThumbPx (140-300), showDecorations, showRibbon, showCounter,
 * journeyOrderMode ('manual' | 'newest' | 'oldest')`. Only `flipDurationMs`,
 * `galleryThumbPx` and `journeyOrderMode` carry an explicit type/range in
 * DATA_MODEL.md; the remaining fields are typed here as plain text/checkbox,
 * the simplest faithful reading of an otherwise-untyped name in that list.
 * Depends on: `payload`.
 */
import type { GlobalConfig } from 'payload'

/** Book-wide chrome: cover, contents note, flip timing, gallery sizing. */
export const Book: GlobalConfig = {
  slug: 'book',
  fields: [
    { name: 'title', type: 'text' },
    { name: 'subtitle', type: 'text' },
    { name: 'owner', type: 'text' },
    { name: 'coverCloth', type: 'text' },
    { name: 'yearsShown', type: 'text' },
    { name: 'contentsNote', type: 'text' },
    { name: 'flipDurationMs', type: 'number', min: 400, max: 1600, defaultValue: 800 },
    { name: 'galleryThumbPx', type: 'number', min: 140, max: 300, defaultValue: 200 },
    { name: 'showDecorations', type: 'checkbox', defaultValue: true },
    { name: 'showRibbon', type: 'checkbox', defaultValue: true },
    { name: 'showCounter', type: 'checkbox', defaultValue: true },
    {
      name: 'journeyOrderMode',
      type: 'select',
      options: ['manual', 'newest', 'oldest'],
      defaultValue: 'manual',
    },
  ],
}
