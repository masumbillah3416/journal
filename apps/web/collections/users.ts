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
  // THE TWO DURATIONS HERE ARE IN DIFFERENT UNITS, WHICH IS PAYLOAD'S API
  // AND NOT A TYPO. `tokenExpiration` is SECONDS (its default is 7200, two
  // hours); `lockTime` is MILLISECONDS (its default is 600000, ten minutes).
  // Written as `15 * 60` — the seconds spelling, correct for the field above
  // and silently wrong here — this collection asked for a cooling-off period
  // of 900 milliseconds, and had done since Phase 0 with nothing to catch it:
  // the account still locked, wrong passwords were still refused, and the
  // lock lifted before a reader could finish reading the message about it.
  // Found by `users.lockout.integration.test.ts`, whose fifteen-minute case
  // exists precisely because "the account is locked" is true either way and
  // only the DURATION distinguishes a real cooling-off from a decorative one.
  auth: { tokenExpiration: 60 * 60 * 24 * 7, maxLoginAttempts: 5, lockTime: 15 * 60_000 },
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
