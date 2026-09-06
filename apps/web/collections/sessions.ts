/**
 * sessions — backs the account screen's "Where you are signed in" list, and
 * is the thing every admin request is authenticated against.
 *
 * Transcribed from DATA_MODEL.md's `sessions` section: `{ user, tokenHash,
 * device, location, createdAt, lastSeenAt, revokedAt }`, plus the one column
 * that section omits (see the deviation at `expiresAt`). `createdAt` and
 * `updatedAt` ARE declared here, deliberately, though Payload would add both
 * on its own (`timestamps` defaults to `true`): a field Payload injects during
 * sanitisation carries no access rule, so while they were left implicit an
 * owner could rewrite their own row's `createdAt` and falsify the very list
 * this collection exists to back. Declaring them is what gives them a rule.
 * `index: true` is not decoration on those two — omitting it drops
 * `sessions_created_at_idx` and `sessions_updated_at_idx`. Without real rows
 * here,
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
 * NO FIELD IS WRITABLE THROUGH THE API, and that is review round 1's
 * correction rather than the original design. The first version restricted
 * `tokenHash` and `expiresAt` and left the rest to the collection-level
 * ownership rule, which was necessary and NOT SUFFICIENT: two fields inside
 * an operation that is correctly permitted escaped it, and both were
 * reproduced against a real Payload before this comment was written.
 *
 *   - `user` IS THE FIELD THE OWNERSHIP PREDICATE ITSELF READS. Leaving it
 *     writable let the holder of one account move their own row onto another
 *     account: measured, `user` was updated from 104 to 105 under the owner's
 *     own access and the UNCHANGED identifier then authenticated as 105. That
 *     is privilege escalation through the field that decides privilege.
 *   - `revokedAt` DECIDES WHETHER A REVOKED SESSION STAYS REVOKED. Leaving it
 *     writable let it be written back to `null`: measured, a session
 *     answering `revoked` answered `ok` again after one `PATCH`. "Only the
 *     owner can do it" is not a restriction here, because the account holder
 *     and whoever holds a stolen session are the same principal as far as
 *     this collection can tell.
 *
 * So every field refuses `update`, including the three that look harmless
 * (`device`, `location`, `lastSeenAt`). Nothing needs to write them: the first
 * two are recorded when the session is minted and the third is stamped by
 * `authenticate`, and a field nobody can write cannot be written wrong. The
 * alternative considered and rejected was a monotonic rule for `revokedAt` -
 * allow `null` to a timestamp, refuse the reverse - which is a validation
 * somebody has to remember to keep correct, against a refusal that cannot rot.
 *
 * `tokenHash` refuses `read` on top of that: it is the lookup key an
 * authentication is matched by, it never needs to reach a screen, and a list
 * endpoint that returns it is one that hands every device's credential digest
 * to whatever renders it.
 *
 * WHY THE COLLECTION-LEVEL `update` IS NOT SIMPLY `() => false`. Payload
 * refuses at the collection level BEFORE it evaluates field access, so a flat
 * refusal there would make all seven field predicates unreachable - and an
 * unreachable predicate is an uncoverable function against this directory's
 * 100% gate, as well as a rule no test can prove. Admitting an owner's own
 * request and then writing none of its fields keeps each refusal exercised by
 * `sessions.access.integration.test.ts`'s per-field sweep. No field carries a
 * `create` predicate for the mirror-image reason: `create` is already refused
 * for everybody at the collection level, so a field-level one could never run.
 *
 * REVOCATION IS SERVER-SIDE. `revokeSession`/`revokeAllSessions` in
 * `apps/web/lib/auth/sessions.ts` are what the Account screen calls, matching
 * how every other write in this phase reaches these tables.
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
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
      // HANDOFF-DEVIATION (review round 1): unwritable through the API. This
      // is the field `ownSessionsOnly` reads to decide ownership, so an owner
      // who could write it could re-point their own row at another account and
      // authenticate as them. See this module's header and docs/deviations.md
      // §29.
      access: { update: () => false },
    },
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
    // The three below are unwritable too, though none of them is dangerous on
    // its own. They are recorded when the session is minted (`device`,
    // `location`) or stamped by `authenticate` (`lastSeenAt`), so nothing
    // needs to write them through the API - and "no field is writable" is a
    // rule the per-field sweep can state totally, where "these four are not"
    // is a list somebody has to keep correct.
    { name: 'device', type: 'text', access: { update: () => false } },
    { name: 'location', type: 'text', access: { update: () => false } },
    { name: 'lastSeenAt', type: 'date', access: { update: () => false } },
    {
      name: 'revokedAt',
      type: 'date',
      // HANDOFF-DEVIATION (review round 1): unwritable through the API, in
      // BOTH directions. Revocation is `apps/web/lib/auth/sessions.ts`'s
      // `revokeSession`; leaving this writable let a revoked session be
      // un-revoked with one `PATCH`, which makes Revoke decorative against
      // exactly the principal it exists to stop. See docs/deviations.md §29.
      access: { update: () => false },
    },
    // DECLARED HERE RATHER THAN LEFT TO `timestamps: true`, WHICH IS WHAT
    // FOUND THE THIRD HOLE. Payload injects `createdAt`/`updatedAt` into this
    // array when it sanitises the collection, and an injected field carries no
    // access rule - so `createdAt` was writable by the row's owner, and a
    // session could be made to claim it had been signed in at any time it
    // liked. Nothing authenticates on it, so this is not the escalation `user`
    // was; what it falsifies is the "Where you are signed in" list, which is a
    // list whose only job is to be true. Neither the reviewer's two findings
    // nor this author's own enumeration named it - the per-field sweep in
    // `sessions.access.integration.test.ts` did, on its first run, which is
    // the whole argument for enumerating fields from the config instead of
    // from memory. Declaring them explicitly is how a rule reaches them:
    // Payload only injects a timestamp field the collection has not declared.
    // `index: true` on both, because that is what Payload's own injected
    // timestamp fields carry: declaring them without it silently DROPS
    // `sessions_created_at_idx` and `sessions_updated_at_idx`, which
    // `payload migrate:create` was run to confirm before this line was
    // written. Closing an access hole must not quietly change the schema.
    // `updatedAt`'s refusal is THE ONE PREDICATE ON THIS COLLECTION THAT NO
    // TEST CAN PROVE LOAD-BEARING, and saying so is better than letting the
    // next reader assume the sweep covers it. Measured: with this `access`
    // removed, all 37 cases still pass, because Payload stamps `updated_at`
    // itself AFTER field access has run - an owner's write to it never
    // survives either way. It is kept so the rule this collection states is
    // total ("no field is writable") rather than "no field except one nobody
    // has checked", and it costs a line. Every other field's refusal fails a
    // named case when removed; see the Task 6 report's round-1 matrix.
    { name: 'updatedAt', type: 'date', index: true, access: { update: () => false } },
    { name: 'createdAt', type: 'date', index: true, access: { update: () => false } },
  ],
}
