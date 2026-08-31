/**
 * journeys — one row per trip; holds its own pages and media.
 *
 * Transcribed verbatim from DATA_MODEL.md's `journeys` section. `versions:
 * { drafts: true }` and the indexed `deletedAt` soft-delete column are in this,
 * the first migration, deliberately — the design's 30-day trash with restore
 * and restorable editions makes both painful to retrofit onto a collection
 * with existing rows (DATA_MODEL.md, "Two notes worth heeding" / CLAUDE.md §7).
 * Depends on: `payload`.
 */
import type { CollectionConfig } from 'payload'

/** A trip: its own pages, media, notes-page furniture and tally. */
export const Journeys: CollectionConfig = {
  slug: 'journeys',
  versions: { drafts: true }, // the Publish screen's editions + restore
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'place', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
    { name: 'dates', type: 'text', required: true }, // free text: "12 – 24 March 2025"
    { name: 'startsOn', type: 'date' }, // sortable counterpart to `dates`
    { name: 'order', type: 'number', index: true },
    { name: 'hiddenFromBookmarks', type: 'checkbox', defaultValue: false },
    { name: 'archived', type: 'checkbox', defaultValue: false },
    { name: 'deletedAt', type: 'date', index: true }, // 30-day trash

    { name: 'weather', type: 'text' }, // "CLEAR 14C"
    { name: 'mood', type: 'text' }, // "WIDE EYED"
    { name: 'weatherGlyph', type: 'select', options: ['sun', 'haze', 'wind'], defaultValue: 'sun' },

    {
      name: 'furniture',
      type: 'group',
      fields: [
        { name: 'signoff', type: 'text' },
        { name: 'stampCountry', type: 'text' },
        { name: 'stampValue', type: 'text' },
        { name: 'accent', type: 'text', defaultValue: '#3d817e' },
      ],
    },

    {
      name: 'highlights',
      type: 'array',
      // Capped in the schema, not just the UI — the notes page layout is
      // tuned for 3-4 and a fifth breaks its rhythm.
      maxRows: 4,
      fields: [{ name: 'text', type: 'text', required: true }],
    },
    { name: 'note', type: 'textarea' },
    {
      name: 'tally',
      type: 'array',
      minRows: 4,
      maxRows: 4,
      fields: [
        { name: 'key', type: 'text' },
        { name: 'value', type: 'text' }, // text, not number — "plenty", "uncounted"
      ],
    },
  ],
}
