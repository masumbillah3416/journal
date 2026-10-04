/**
 * site — site-wide settings: identity, sharing and access policy.
 *
 * Transcribed from DATA_MODEL.md's globals section: `name, domain,
 * description, replyTo, analyticsId, allowDownloads, allowShare,
 * indexGalleries, passwordProtect, touchPageTurn`. Boolean-by-naming fields
 * (`allow*`, `index*`, `passwordProtect`, `touchPageTurn`) are checkboxes;
 * `replyTo` is `email`, matching `about.replyTo`'s role.
 * Depends on: `payload`.
 */
import type { GlobalConfig } from 'payload'

/** Site identity, sharing defaults and access policy. */
export const Site: GlobalConfig = {
  slug: 'site',
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
    { name: 'name', type: 'text' },
    { name: 'domain', type: 'text' },
    { name: 'description', type: 'textarea' },
    { name: 'replyTo', type: 'email' },
    { name: 'analyticsId', type: 'text' },
    { name: 'allowDownloads', type: 'checkbox', defaultValue: true },
    { name: 'allowShare', type: 'checkbox', defaultValue: true },
    { name: 'indexGalleries', type: 'checkbox', defaultValue: true },
    { name: 'passwordProtect', type: 'checkbox', defaultValue: false },
    {
      name: 'readerPasswordHash',
      type: 'text',
      // NEVER RENDERED AND NEVER READ BACK INTO A FORM. The admin shows
      // WHETHER a password is set, not what it is. `setReaderPassword` in
      // `apps/web/lib/admin/siteMutations.ts` is the only writer, and
      // `apps/web/lib/readerPassword.ts` is the only thing that reads it for
      // a comparison.
      admin: { hidden: true },
    },
    { name: 'touchPageTurn', type: 'checkbox', defaultValue: true },
  ],
}
