/**
 * sessions — backs the account screen's "Where you are signed in" list, and
 * is the thing every admin request is authenticated against.
 *
 * Transcribed from DATA_MODEL.md's `sessions` section: `{ user, tokenHash,
 * device, location, createdAt, lastSeenAt, revokedAt }`, plus the one column
 * that section omits (see the deviation at `expiresAt`). `createdAt` is not
 * declared as a field here — Payload adds it automatically to every collection
 * (`timestamps` defaults to `true`) — so `sessions.createdAt` still exists on
 * every row, it is just not a hand-written field. Without real rows here,
 * "Revoke" and "Sign out everywhere" are decorative. The behaviour over these
 * rows is `apps/web/lib/auth/sessions.ts` (Phase 2, Task 6), and the shape of
 * the layer as a whole is `docs/adr/0017-session-store-and-rotation.md`.
 * Depends on: `payload`.
 *
 * PER-USER OWNERSHIP, NOT `() => false`. This is the one Phase 2 collection
 * that a signed-in reader legitimately reaches: the account screen lists
 * their own sessions and revokes them individually. So `read`, `update` and
 * `delete` each return a `Where` constraining the operation to rows the
 * caller owns, rather than the flat refusal `jobs`, `otpChallenges` and
 * `signInAttempts` carry. `create` is the exception and is refused outright —
 * a session is minted by `apps/web/lib/auth/sessions.ts` against a token only
 * the server ever sees, so a row created through the API could only ever be a
 * forgery.
 *
 * TWO FIELDS ARE READ-ONLY TO THE OWNER AS WELL, and both would otherwise
 * undo the point of the rule above. `tokenHash` is unreadable: it is the
 * lookup key an authentication attempt is matched by, it never needs to reach
 * a screen, and a list endpoint that returns it is a list endpoint that hands
 * every device's credential digest to whatever renders it. `expiresAt` is
 * unwritable: it is the only thing that ends a session that is never revoked,
 * so an owner who could `PATCH` it could give themselves a session that never
 * expires — "keep me signed in" would stop being a bounded choice and become
 * an unbounded one. Neither field carries a `create` predicate, deliberately:
 * `create` is already refused for everybody at the collection level, so a
 * field-level one could never be reached (and an unreachable predicate is an
 * uncoverable function against this directory's 100% gate).
 */
import type { Access, CollectionConfig } from 'payload'

/**
 * Restricts an operation to the rows belonging to the caller.
 *
 * Returns a `Where` rather than a boolean, which is what makes a `find`
 * silently *narrow* to the caller's own rows instead of refusing the whole
 * request — the behaviour the account screen's list needs — while an
 * `update` or `delete` aimed at somebody else's row matches nothing and is
 * refused.
 *
 * Tested on `user` rather than compared against `null`, which is the shape
 * Payload's own `defaultAccess` uses: the declared type is `TypedUser | null`,
 * so an explicit `=== null` is what the compiler wants, but this predicate
 * runs against whatever Payload actually passes and reading `.id` off an
 * absent caller would throw where refusing is correct.
 *
 * @param request - Payload's access argument; only `req.user` is read.
 * @returns A `Where` matching the caller's own rows, or `false` when there is
 *   no caller at all.
 * @example
 * // signed in as user 3 → { user: { equals: 3 } }
 * // signed out → false
 */
export const ownSessionsOnly: Access = ({ req: { user } }) => (user ? { user: { equals: user.id } } : false)

/** One signed-in session, so it can be listed and individually revoked. */
export const Sessions: CollectionConfig = {
  slug: 'sessions',
  // HANDOFF-DEVIATION: `DATA_MODEL.md`'s `sessions` section prints a field
  // list and no access block at all, and three documents in this repository
  // had already described this collection as server-only before anybody
  // checked. It was not: with no block, Payload applies its `defaultAccess`
  // — "signed in, or refused" — to every operation, so any signed-in user
  // could read, update and delete every OTHER user's session rows. On the
  // very collection that backs "Where you are signed in" and its Revoke
  // button, that is one account holder enumerating another's devices and
  // signing them out. Verified by a cross-account test before the block
  // existed. See docs/deviations.md §29.
  access: {
    read: ownSessionsOnly,
    // Refused for everyone, including the account itself: a session is minted
    // server-side against a token the client never learns, so a row created
    // through the API is a row nothing can ever authenticate — or a forgery
    // aimed at one that can.
    create: () => false,
    update: ownSessionsOnly,
    delete: ownSessionsOnly,
  },
  fields: [
    { name: 'user', type: 'relationship', relationTo: 'users', required: true, index: true },
    {
      name: 'tokenHash',
      type: 'text',
      required: true,
      // Indexed because it is the ONLY key an authentication reads a row by,
      // and that read happens on every admin request. Not `unique`: two rows
      // sharing a hash is a bug in whatever minted them rather than a state
      // the schema should refuse, and a constraint violation would surface
      // that bug as a raw driver error in the middle of a sign-in instead of
      // as the failing rotation assertion in
      // `apps/web/lib/auth/sessions.integration.test.ts` that names it.
      index: true,
      // SHA-256 of the session identifier. Never readable and never writable
      // through the API — see this module's header.
      access: { read: () => false, update: () => false },
    },
    // HANDOFF-DEVIATION: `SECURITY.md` requires "'Keep me signed in' is a
    // longer-lived, revocable session row — not a longer JWT", but
    // `DATA_MODEL.md`'s field list for this collection has nowhere to put a
    // lifetime: it lists `createdAt`, `lastSeenAt` and `revokedAt` and no
    // expiry at all. A row with no expiry is a session that ends only when
    // somebody revokes it, and "longer-lived" has nothing to compare against.
    // This column is that lifetime. It is the SECOND time this handoff has
    // required of a collection something its own field list cannot hold —
    // after `otpChallenges.sessionHash` (docs/deviations.md §25) — and as
    // there, the stated requirement wins over the printed list. See
    // docs/deviations.md §30.
    {
      name: 'expiresAt',
      type: 'date',
      required: true,
      // Unwritable through the API even by the row's owner: it is the only
      // thing that ends a session nobody revokes. See the module header.
      access: { update: () => false },
    },
    { name: 'device', type: 'text' },
    { name: 'location', type: 'text' },
    { name: 'lastSeenAt', type: 'date' },
    { name: 'revokedAt', type: 'date' },
  ],
}
