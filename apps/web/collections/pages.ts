/**
 * pages — one row per page in a journey; not a fixed Cover/Notes/Frames triple.
 *
 * Transcribed verbatim from DATA_MODEL.md's `pages` section. `versions:
 * { drafts: true }` is in this, the first migration, for the same reason as
 * `journeys` (CLAUDE.md §7: soft delete and drafts are painful to retrofit).
 * `slots[].focalX/focalY` deliberately duplicates `media.focalPoint`'s shape:
 * the same photograph in a tall frame and a wide frame wants different focus,
 * so the slot's value overrides the media item's default at render time.
 * Depends on: `payload`.
 */
import type { CollectionConfig } from 'payload'

/** One page of a journey: notes or a frames spread, laid out from `slots`. */
export const Pages: CollectionConfig = {
  slug: 'pages',
  // HANDOFF-DEVIATION: DATA_MODEL.md prints no access block for this
  // collection, so it inherited Payload's defaultAccess. Written out because
  // Phase 4 Task 2 makes every admin read and write run with Payload's access
  // control ON, which turns this from an unexercised default into the rule
  // that runs on every screen — and because a dependency's default is not this
  // repository's decision. It is the SAME behaviour as the default,
  // deliberately: the diary reads these rows through the Local API, which
  // bypasses access control, so nothing public depends on them being readable
  // over HTTP and widening them would be exposure nobody asked for.
  // See docs/deviations.md §52.
  access: {
    read: ({ req: { user } }) => Boolean(user),
    create: ({ req: { user } }) => Boolean(user),
    update: ({ req: { user } }) => Boolean(user),
    delete: ({ req: { user } }) => Boolean(user),
  },
  versions: { drafts: true },
  fields: [
    { name: 'journey', type: 'relationship', relationTo: 'journeys', required: true, index: true },
    { name: 'kind', type: 'select', options: ['notes', 'frames'], required: true },
    { name: 'title', type: 'text' }, // "Frames I"
    { name: 'order', type: 'number', required: true, index: true },
    {
      name: 'layout',
      type: 'select',
      options: ['three-up', 'four-up', 'full-bleed', 'text-spread'],
    },

    {
      name: 'slots',
      type: 'array',
      fields: [
        { name: 'role', type: 'select', options: ['hero', 'ephemera', 'frame'] },
        { name: 'media', type: 'upload', relationTo: 'media' },
        { name: 'caption', type: 'text' },
        { name: 'alt', type: 'text' },
        { name: 'focalX', type: 'number', defaultValue: 50 }, // percent
        { name: 'focalY', type: 'number', defaultValue: 50 },
      ],
    },
  ],
}
