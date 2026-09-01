/**
 * users — the diary's single author account, and the Payload auth collection.
 *
 * Transcribed verbatim from DATA_MODEL.md's `users` section. `auth` config
 * (not a plain field) is Payload's own credential-store mechanism; see
 * `docs/adr/0002-auth-mechanism.md` for why this is used instead of Auth.js.
 * Depends on: `payload`.
 */
import type { CollectionConfig } from 'payload'

/** The one-row author account backing sign-in and OTP-required policy. */
export const Users: CollectionConfig = {
  slug: 'users',
  auth: { tokenExpiration: 60 * 60 * 24 * 7, maxLoginAttempts: 5, lockTime: 15 * 60 },
  fields: [
    { name: 'displayName', type: 'text' }, // name printed on the cover
    { name: 'signoffDefault', type: 'text' },
    { name: 'timeZone', type: 'text' },
    // The only source of truth for whether the OTP step runs (SECURITY.md) —
    // the prototype's localStorage flag is a demo shortcut, deleted not moved.
    { name: 'otpRequired', type: 'checkbox', defaultValue: true },
    { name: 'notifyOnPublish', type: 'checkbox', defaultValue: true },
    { name: 'notifyWeekly', type: 'checkbox', defaultValue: false },
  ],
}
