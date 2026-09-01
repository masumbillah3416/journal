/**
 * about — global content for the diary's About screen.
 *
 * Transcribed from DATA_MODEL.md's globals section: `portrait (upload),
 * portraitCaption, paragraphs (array of textarea), kit (array of text),
 * replyTo`. `replyTo` is typed as `email` — it is the address a reader's
 * reply is addressed to, the same role `site.replyTo` plays.
 * Depends on: `payload`.
 */
import type { GlobalConfig } from 'payload'

/** The About screen's portrait, biography paragraphs and packing-kit list. */
export const About: GlobalConfig = {
  slug: 'about',
  fields: [
    { name: 'portrait', type: 'upload', relationTo: 'media' },
    { name: 'portraitCaption', type: 'text' },
    {
      name: 'paragraphs',
      type: 'array',
      fields: [{ name: 'text', type: 'textarea' }],
    },
    {
      name: 'kit',
      type: 'array',
      fields: [{ name: 'text', type: 'text' }],
    },
    { name: 'replyTo', type: 'email' },
  ],
}
