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
  // HANDOFF-DEVIATION: DATA_MODEL.md prints no access block for this global,
  // so it inherited Payload's defaultAccess. Written out because Phase 4
  // Task 2 makes every admin read and write run with Payload's access control
  // ON, which turns this from an unexercised default into the rule that runs
  // on every screen — and because a dependency's default is not this
  // repository's decision. It is the SAME behaviour as the default,
  // deliberately: the diary reads this global through the Local API, which
  // bypasses access control, so nothing public depends on it being readable
  // over HTTP and widening it would be exposure nobody asked for. A global
  // has no `create` or `delete`, so the block is the two operations Payload
  // offers. See docs/deviations.md §52.
  access: {
    read: ({ req: { user } }) => Boolean(user),
    update: ({ req: { user } }) => Boolean(user),
  },
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
