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
