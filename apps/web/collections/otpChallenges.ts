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
    // HANDOFF-DEVIATION: `DATA_MODEL.md` writes this access block as
    // `{ read, create, update }` and comments it `// server only`. It is not:
    // Payload applies its `defaultAccess` to any operation the block omits, so
    // `delete` fell through to "any signed-in user" — verified, an
    // authenticated caller could delete rows here while every other operation
    // was refused. The handoff's own comment is false of the schema printed
    // beside it, which is the second time a handoff document has specified
    // something its own schema cannot deliver (after the missing session
    // column, §25). `delete: () => false` is this repository's addition. See
    // docs/deviations.md §28.
    delete: () => false,
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
    // Written as `createdAt + EXPIRY_MS`, and READ BY NOTHING. This comment
    // said "read ONLY by the purge query" and there was no purge query —
    // blocker B4 of Phase 2's final review, and the false half of ruling F14.
    // The purge exists now (`otpService.issueChallenge` sweeps a bounded
    // batch on every write) and it keys on `created_at`, because a challenge
    // is unusable after five minutes but still counted by the hourly resend
    // ceiling for an hour. The column is kept because `DATA_MODEL.md`'s field
    // list declares it; authorization derives expiry from `createdAt` and the
    // domain's `EXPIRY_MS` — see otpService.ts's header for why two sources
    // of truth for one fact would make `EXPIRY_MS` decorative.
    { name: 'expiresAt', type: 'date', required: true },
    { name: 'attempts', type: 'number', defaultValue: 0 },
    { name: 'consumedAt', type: 'date' },
    { name: 'ip', type: 'text' },
  ],
}
