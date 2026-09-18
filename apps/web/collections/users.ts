/**
 * users — the diary's single author account, and the Payload auth collection.
 *
 * Transcribed verbatim from DATA_MODEL.md's `users` section. `auth` config
 * (not a plain field) is Payload's own credential-store mechanism; see
 * `docs/adr/0002-auth-mechanism.md` for why this is used instead of Auth.js.
 *
 * ═══ THE SECOND AUTHENTICATION SURFACE IS SEALED HERE ═══
 *
 * An `auth` block makes Payload mount a set of REST endpoints — `POST
 * /api/users/login` among them — and the mounted `/api/**` route serves them
 * in production whether or not `/cms` is built. That endpoint minted a session
 * on a password alone: no code step, no rate limit, no CSRF check, none of the
 * things Phase 2 built. `endpoints` and `graphQL` below close it in both
 * protocols; `./sealedUserAuth.ts` holds the list and the reasoning, and
 * `sealedUserAuth.integration.test.ts` drives real requests through Payload's
 * own dispatcher rather than asserting the config's shape.
 * Depends on: `payload`, `./sealedUserAuth`.
 */
import type { Access, CollectionConfig } from 'payload'
import { sealedUserAuthEndpoints } from './sealedUserAuth'

/**
 * Restricts an operation to the caller's own account row.
 *
 * Returns a `Where` rather than a boolean so a `find` NARROWS to the caller's
 * own row instead of refusing the request, while an `update` aimed at anybody
 * else's row matches nothing and is refused. The same shape, for the same
 * reason, as `ownSessionsOnly` in `./sessions.ts`.
 *
 * @param request - Payload's access argument; only `req.user` is read.
 * @returns A `Where` matching the caller's own row, or `false` with no caller.
 */
export const ownAccountOnly: Access = ({ req: { user } }) => (user ? { id: { equals: user.id } } : false)

/** The one-row author account backing sign-in and OTP-required policy. */
export const Users: CollectionConfig = {
  slug: 'users',
  // HANDOFF-DEVIATION: DATA_MODEL.md's `users` section prints a field list and
  // no access block, so this collection inherited Payload's defaultAccess —
  // "signed in, or refused", where "signed in" means ANY account. That is the
  // shape docs/deviations.md §29 records as a cross-account leak on
  // `sessions`, and `sealedUserAuth.ts` does not close it: that module seals
  // the AUTH endpoints, not `PATCH /api/users/<id>`. Measured before this
  // block existed: account A turned off account B's `otpRequired`, which
  // DATA_MODEL.md calls the only source of truth for the code step.
  // `create` and `delete` are refused outright rather than narrowed — the
  // design has one author (design spec §1.2), accounts arrive through
  // `npm run db:seed`, and an account cannot meaningfully delete itself from
  // the screen it is signed in on. See docs/deviations.md §52.
  //
  // TWO FIELD-LEVEL RULES WERE CONSIDERED AND ARE DELIBERATELY ABSENT, said
  // here because their absence is a decision rather than an oversight.
  // (1) Payload's injected `loginAttempts`/`lockUntil` stay writable by the
  // row's owner, so an account can clear its own cooling-off period — but the
  // principal who can do that already holds the password or the session, so
  // it is not the escalation `sessions.user` was. (2) `createdAt`/`updatedAt`
  // are injected and therefore carry no rule, as on `sessions` — but nothing
  // on `users` authenticates or is audited against them. Both are recorded
  // rather than closed, because a rule with no threat behind it is a rule the
  // next reader deletes.
  access: {
    read: ownAccountOnly,
    create: () => false,
    update: ownAccountOnly,
    delete: () => false,
    // REVIEW ROUND 1, F4 and F5. THE THIRD REFUSAL ON EACH OF THESE TWO, and
    // it is the only one that holds if either of the first two is changed.
    //
    // `unlock` clears the lockout counter SECURITY.md §3 requires. Two
    // decisions already keep it unreachable and NEITHER is an access rule:
    // `./sealedUserAuth.ts` shadows `POST /api/users/unlock`, and
    // `graphQL: { disableMutations: true }` below keeps `unlockUser` out of
    // the schema Payload generates for any auth collection with
    // `maxLoginAttempts > 0`. Undeclared, this operation sat on Payload's
    // default - "any signed-in caller may clear any account's lockout" -
    // behind two doors, and whoever re-opens either door gets that rule back
    // without touching it. `() => false` is not a behaviour change: nothing
    // in this repository calls `payload.unlock()`, and the only other caller
    // is the sealed endpoint.
    unlock: () => false,
    // `admin` is what `canAccessAdmin` reads (`getAccessResults.js:12`), and
    // Payload does not fill it either: undeclared, it answers `isLoggedIn`.
    // docs/deviations.md §42 already decided that Payload's own admin surface
    // is not a way in - `/cms` is a development scaffold and no caller can
    // mint a Payload auth cookie at all - so this line encodes that decision
    // rather than making a new one. It is what a second, non-author account
    // would otherwise be handed by default, which §52 names as the thing that
    // would reverse `create: () => false`.
    admin: () => false,
  },
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
  // THE REST AUTH SURFACE, REFUSED. Declared entries shadow Payload's own by
  // method and path, so this is the login endpoint being replaced rather than
  // supplemented — see ./sealedUserAuth.ts.
  endpoints: sealedUserAuthEndpoints,
  // THE SAME HOLE IN THE OTHER PROTOCOL. `/api/graphql` is mounted beside
  // `/api/**` and exposes `loginUser`, `forgotPasswordUser`,
  // `resetPasswordUser`, `refreshTokenUser` and `unlockUser` as mutations —
  // sealing only the REST paths would have left the identical bypass one
  // request away. Queries stay on: the `User` type is referenced by
  // `sessions.user`, and removing the collection from the schema outright
  // would take that with it.
  graphQL: { disableMutations: true },
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
