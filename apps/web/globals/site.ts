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
    { name: 'touchPageTurn', type: 'checkbox', defaultValue: true },
  ],
}
