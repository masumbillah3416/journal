/**
 * otpChallenges — one-time-code challenges issued during sign-in.
 *
 * Transcribed from DATA_MODEL.md's `otpChallenges` section, plus the one
 * column that section omits (see the deviation below). Access is
 * `() => false` on every operation because this collection is server-only —
 * nothing about the OTP flow is reachable from the Payload REST/GraphQL API a
 * client could call directly. The schema landed in Phase 0; the OTP flow's
 * behaviour is `apps/web/lib/auth/otpService.ts` (Phase 2, Task 3).
 * Depends on: `payload`.
 */
import type { CollectionConfig } from 'payload'

/** A single OTP code challenge: who it's for, its hash, and its lifetime. */
export const OtpChallenges: CollectionConfig = {
  slug: 'otpChallenges',
  access: {
    read: () => false,
    create: () => false,
    update: () => false,
  },
  fields: [
    { name: 'user', type: 'relationship', relationTo: 'users', required: true, index: true },
    { name: 'codeHash', type: 'text', required: true }, // scrypt, per-row salt, never plaintext
    // HANDOFF-DEVIATION: SECURITY.md requires the challenge to be bound to the
    // session that started it, but DATA_MODEL.md's field list for this
    // collection has nowhere to put a session — the handoff contradicts
    // itself, and Phase 0 implemented the field list faithfully. This column
    // is the binding. It holds SHA-256 of the PRE-AUTH session identifier,
    // not a relationship to `sessions`: at issue time the visitor is
    // unauthenticated and SECURITY.md rotates that identifier away on login
    // precisely because it is untrusted, so minting `sessions` rows for
    // unauthenticated visitors would put pre-auth entries into the Account
    // screen's "Where you are signed in" list. See docs/deviations.md §25 and
    // docs/adr/0015-otp-challenge-hashing.md for why this column is hashed
    // differently from `codeHash` above.
    { name: 'sessionHash', type: 'text', required: true, index: true },
    // Written as `createdAt + EXPIRY_MS`, and read ONLY by the purge query.
    // Authorization derives expiry from `createdAt` and the domain's
    // `EXPIRY_MS` — see otpService.ts's header for why two sources of truth
    // for one fact would make `EXPIRY_MS` decorative.
    { name: 'expiresAt', type: 'date', required: true },
    { name: 'attempts', type: 'number', defaultValue: 0 },
    { name: 'consumedAt', type: 'date' },
    { name: 'ip', type: 'text' },
  ],
}
