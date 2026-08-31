/**
 * otpChallenges — one-time-code challenges issued during sign-in.
 *
 * Transcribed verbatim from DATA_MODEL.md's `otpChallenges` section. Access is
 * `() => false` on every operation because this collection is server-only —
 * nothing about the OTP flow is reachable from the Payload REST/GraphQL API a
 * client could call directly. The schema lands now; the OTP flow's behaviour
 * lands in Phase 2 (docs/data-model.md ruling, `progress.md` Task 2).
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
    { name: 'codeHash', type: 'text', required: true }, // hashed, never plaintext
    { name: 'expiresAt', type: 'date', required: true }, // now + 5 minutes
    { name: 'attempts', type: 'number', defaultValue: 0 },
    { name: 'consumedAt', type: 'date' },
    { name: 'ip', type: 'text' },
  ],
}
