/**
 * signInAttempts — one row per sign-in attempt, the store behind the sliding
 * window `SECURITY.md` §3 requires per account and per IP.
 *
 * HANDOFF-DEVIATION: `DATA_MODEL.md` describes no collection for this.
 * `SECURITY.md` §3 nonetheless requires "a sliding window on both the
 * password and code endpoints", per account and per IP, and a window has to
 * count something that survives the request. See `docs/deviations.md` §27 for
 * the full rationale and `docs/adr/0016-rate-limit-window-storage.md` for why
 * the counting lives in Postgres rather than in the process — briefly: this
 * application deploys to Vercel (`docs/adr/0001-hosting-and-cost.md`), where
 * an in-memory window gives every serverless invocation a window of its own,
 * so an attacker cycling instances never meets a refusal while every local
 * test passes.
 *
 * Access is `() => false` on **every** operation - `delete` included, which
 * the handoff's own schema omits (see the HANDOFF-DEVIATION at the predicate
 * and docs/deviations.md §28) - matching `otpChallenges` and `jobs`. This
 * collection is server-only, written and read exclusively through
 * `apps/web/lib/auth/rateLimit.ts`, never through the REST/GraphQL API a
 * client could reach. `sessions` is NOT in that list, and the reason is worth
 * keeping: it declared no access rule at all until Phase 2 Task 6, so it
 * inherited Payload's "signed in, or refused" default and any signed-in user
 * could read, update and delete every other user's rows. It now carries a
 * per-user ownership rule rather than a flat refusal, because the Account
 * screen legitimately reads and revokes those rows (docs/deviations.md §29).
 * An earlier revision of this comment named it as a server-only peer before
 * anyone had checked, which is the same species of unverified claim §28
 * records.
 *
 * THE ROWS ARE COUNTED BY RANK, NEVER READ AND THEN COUNTED, and the schema
 * is shaped for that: `attemptedAt` is stamped by Postgres's
 * `clock_timestamp()` (not `now()`, which is the transaction start time),
 * and the row's own `id` — a sequence value, so unique and monotonic in
 * insert order — is what orders one attempt against another when two share a
 * millisecond. `attemptedAt` decides only whether an attempt is still inside
 * the window. See `packages/domain/src/auth/rateWindow.ts`.
 *
 * The rows are housekeeping, not content: in the same statement that records
 * a new attempt, `rateLimit.ts` prunes this key's aged rows AND a bounded
 * batch of aged rows belonging to any other key. Both halves are load-bearing.
 * A key-scoped prune alone would bound growth by the number of distinct keys
 * ever seen rather than by the window — and a spray from many addresses is
 * exactly the traffic that manufactures keys, so the unbounded case is the
 * attack. With the cross-key sweep, cleanup is eventually complete and
 * per-request work stays constant, so the table is bounded with no scheduler
 * running. See `rateLimit.ts`'s own header for the sweep size and the reason
 * it is capped.
 * Depends on: `payload`.
 */
import type { CollectionConfig } from 'payload'

/** One recorded sign-in attempt, against one endpoint, in one dimension. */
export const SignInAttempts: CollectionConfig = {
  slug: 'signInAttempts',
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
  // The four columns every lookup filters on, in the order it filters them:
  // three equalities that pick one key, then the timestamp the window is
  // measured against. A compound index rather than four single-column ones,
  // because `subject` alone is the only selective column among them and a
  // busy address is exactly the case where selectivity has to hold.
  indexes: [{ fields: ['dimension', 'endpoint', 'subject', 'attemptedAt'] }],
  fields: [
    // Which of SECURITY.md's two dimensions this row counts towards. A
    // closed set rather than free text: an attempt is counted per account or
    // per address, and a third value would be a window nothing enforces.
    { name: 'dimension', type: 'select', options: ['ip', 'account'], required: true },
    // Which endpoint the attempt was made against. The two are counted
    // separately (see `IP_ATTEMPT_LIMIT`): a reader who has fumbled their
    // password is not thereby out of code attempts.
    { name: 'endpoint', type: 'select', options: ['password', 'code'], required: true },
    // The address, or the account's row id — never both in one row, which is
    // also why nothing here can log an address alongside an account.
    { name: 'subject', type: 'text', required: true },
    { name: 'attemptedAt', type: 'date', required: true },
  ],
}
