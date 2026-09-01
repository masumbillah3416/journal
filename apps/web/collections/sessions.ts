/**
 * sessions — backs the account screen's "Where you are signed in" list.
 *
 * Transcribed from DATA_MODEL.md's `sessions` section: `{ user, tokenHash,
 * device, location, createdAt, lastSeenAt, revokedAt }`. `createdAt` is not
 * declared as a field here — Payload adds it automatically to every collection
 * (`timestamps` defaults to `true`) — so `sessions.createdAt` still exists on
 * every row, it is just not a hand-written field. Without real rows here,
 * "Revoke" and "Sign out everywhere" are decorative. Depends on: `payload`.
 */
import type { CollectionConfig } from 'payload'

/** One signed-in session, so it can be listed and individually revoked. */
export const Sessions: CollectionConfig = {
  slug: 'sessions',
  fields: [
    { name: 'user', type: 'relationship', relationTo: 'users', required: true, index: true },
    { name: 'tokenHash', type: 'text', required: true },
    { name: 'device', type: 'text' },
    { name: 'location', type: 'text' },
    { name: 'lastSeenAt', type: 'date' },
    { name: 'revokedAt', type: 'date' },
  ],
}
