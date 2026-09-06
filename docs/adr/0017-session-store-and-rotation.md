# 0017 — Sessions are opaque identifiers over revocable rows, rotated by supersede-and-insert

## Context

`SECURITY.md`'s "Sessions and access" makes four demands of the layer every admin request
rests on:

- cookies `httpOnly`, `Secure`, `SameSite=Lax`, scoped to the admin path;
- "Rotate the session identifier on login; never reuse a pre-auth id";
- "'Keep me signed in' is a longer-lived, **revocable** session row — not a longer JWT";
- "Back the account screen's session list with real `sessions` rows, or Revoke and 'Sign
  out everywhere' do nothing".

Two of those are stated as *negatives* — not a longer JWT, not a decorative Revoke — which
is unusual for that document and worth reading as a warning rather than a preference. Both
name the implementation that would satisfy a functional test while failing the
requirement.

The schema this phase inherited could not hold the answer. `DATA_MODEL.md`'s `sessions`
field list is `{ user, tokenHash, device, location, createdAt, lastSeenAt, revokedAt }` —
no lifetime of any kind (`docs/deviations.md` §30) — and the collection declared **no
access rule at all**, so Payload's `defaultAccess` applied and any signed-in user could
read, update and delete every other user's rows (§29). Both had to be settled before
anything could issue a session, which is why this task ran before the sign-in screens that
will call it.

Two decisions from earlier in this phase carry straight in and are not revisited here:
`docs/adr/0015-otp-challenge-hashing.md` on why a high-entropy lookup key is hashed with
SHA-256 rather than scrypt, and `docs/adr/0016-rate-limit-window-storage.md` on why state
this application depends on lives in Postgres rather than in a process that Vercel may
discard between requests.

## Options considered

1. **A signed, self-contained token (a JWT), with "keep me signed in" as a longer
   expiry.** Rejected, and it is the option this ADR mostly exists to reject, because
   `SECURITY.md` names it directly. It is the cheapest thing to build — no row, no read
   per request — and its failure is precisely that: with the authority inside the token,
   there is nothing to revoke. "Revoke" and "Sign out everywhere" become a row update that
   no authentication consults, which is the second negative above, and a thirty-day
   "remember me" becomes a thirty-day bearer credential that cannot be withdrawn from a
   lost laptop. A denylist of revoked tokens is the usual patch, and it reintroduces the
   per-request read the JWT was chosen to avoid while adding a second store to keep
   consistent with the first.
2. **Payload's own `users` auth token as the admin session.** Rejected as the *session*
   layer, though it remains the credential store and the password-step lockout
   (`docs/adr/0002-auth-mechanism.md`, `docs/deviations.md` §1). It is a JWT with
   `tokenExpiration`, so it inherits option 1's problem exactly, and it has no `sessions`
   row behind it for the Account screen to list. Using it for the password check and a row
   of our own for the session is not two overlapping session systems — it is one
   credential store and one session store, each doing the job it is specified for.
3. **A random identifier stored in plaintext.** Rejected. The column would be a table of
   live credentials: anything that reads the database — a backup, a log of a slow query, a
   support dump — reads every signed-in session. The identifier is high-entropy, so
   hashing it costs one `sha256` per request and removes that entirely.
4. **Rotation as "revoke, then insert", in two statements.** Rejected in favour of one.
   Its failure mode is benign (the old identifier revoked, the new one never written,
   the reader signs in again), but it leaves a window that a later refactor can widen and
   an ordering a later reader can reverse. A single data-modifying CTE has no such window
   and no ordering to get wrong.
5. **A rotation the caller performs, alongside a plain `createSession`.** Rejected. A
   rotation somebody has to remember is a rotation a later screen forgets — and the
   symptom of forgetting it is a session that works, which no functional test notices.

## Decision

**A session is an opaque identifier naming a row, and the row holds everything.**

- The identifier is 32 bytes from `crypto.randomBytes`, `base64url`. It carries no
  account, no expiry and no signature, so nothing about it can be believed without
  reading the row it names. `sessions.tokenHash` stores SHA-256 of it, hex, indexed —
  the lookup key, and never readable through the API even by the row's owner.
- `sessions.expiresAt` (new; `docs/deviations.md` §30) is the lifetime, and the *only*
  lifetime. "Keep me signed in" chooses between `SESSION_LIFETIME_MS` (12 hours) and
  `REMEMBERED_SESSION_LIFETIME_MS` (30 days) — numbers `SECURITY.md` does not name, so
  they are this repository's, stated in `packages/domain/src/auth/session.ts`. The
  cookie's `Max-Age` mirrors the row's lifetime and is a hint to the browser carrying no
  authority.
- **There is one way to create a session and it always rotates.** `startSession` takes
  the identifier the browser arrived with and supersedes it in the same data-modifying
  CTE that inserts its replacement. A `previous` of `null` is *bound into* the statement
  rather than branched on — `token_hash = NULL` is NULL, not true — so a fresh browser
  and one already holding a session run byte-identical SQL. There is no non-rotating path
  for a later change to take by accident.
- **The domain decides state, alone.** `authenticate` reads `expires_at` and `revoked_at`
  and hands them to `sessionState`; the conditions are deliberately absent from the
  `WHERE` clause. Expressing a rule in both SQL and TypeScript is a rule neither test can
  break by itself — the reasoning `rateLimit.ts` already carries for its window floor.
- **Access is per-user ownership at the collection, and a flat refusal at every field.**
  `read`, `update` and `delete` narrow to `{ user: { equals: req.user.id } }`; `create` is
  refused for everybody, since a session is minted server-side against an identifier the
  client never sees. **No field accepts an `update`** — not `user`, which the ownership
  predicate itself reads; not `revokedAt`, which decides whether a revoked session stays
  revoked; not the timestamps Payload injects. Collection-level ownership alone was tried
  first and was necessary but not sufficient; see Consequences and `docs/deviations.md`
  §29. Revocation is therefore server-side, through `revokeSession`/`revokeAllSessions`.
- **The cookie is `Path=/admin`**, which is `SECURITY.md`'s "scoped to the admin path" and
  is a constraint on where the sign-in flow may live: see Consequences.

## Consequences

**One indexed `SELECT` per admin request.** This is the price of revocability and it is
the right price here — an index lookup on a table holding one author's handful of
sessions, against an admin surface with no traffic to speak of. The public diary pays
nothing: it is served from a CDN with no credential attached, and the cookie's `Path`
means its requests never carry one.

**The sign-in screens must live under `/admin`.** A browser does not send a `Path=/admin`
cookie to `/sign-in`, so a sign-in mounted outside it would set a session it could not
read back, and the "Signed in" state (`SCREENS.md` §3.4) would never render. Phase 2 Tasks
7–9 build those screens; they belong at `/admin/...`. This is the one consequence of this
ADR that constrains work not yet done, and it is stated in the module header, in
`docs/security.md`'s cookie table and here.

**A per-operation guard is not a guard.** The first version of this decision restricted
operations and two fields, and left the rest to collection-level ownership. Two holes came
straight through it, each a field inside an operation that is correctly permitted: an
owner could re-point `user` at another account and authenticate as them, and could write
`revokedAt` back to `null` and un-revoke themselves. A sweep over **every field the
collection declares**, enumerated from the config rather than from a list, then found a
third nobody had named — `createdAt`, which Payload injects without an access rule. The
rule that follows is the one worth carrying to Phase 4's ten screens of mutations: **the
unit of authorization on a Payload collection is the field, not the operation**, and the
test that proves it has to enumerate fields from the config, because a hand-written list
is a list that goes stale.

**Two tests in this area pass while the mechanism is gone, and both are guarded
explicitly.** A rotation test that asserts only "a new identifier exists" passes while the
old one still authenticates, so every rotation case asserts the OLD identifier is refused.
A revocation test that asserts `revokedAt` was written passes while nothing reads it, so
no case asserts on that field — each revokes and then attempts to authenticate. Both are
verified by mutation rather than by inspection (Phase 2 Task 6 report).

**"Keep me signed in" needs a three-sided assertion, not a longer number.** "The session
lasts longer" is satisfied by the rejected option 1 as readily as by this one, so the
suite asserts the stored column holds the long lifetime, that the identifier is
byte-identical in shape between a remembered and an ordinary sign-in, and that a
remembered row aged past its expiry stops authenticating while its untouched thirty-day
cookie still says thirty days.

**Signing in on one device does not sign out the others.** Rotation supersedes only the
identifier presented. That is what makes it session-fixation defence rather than "sign out
everywhere" under another name, and it has its own case.

**A revocation committing between the read and the `last_seen_at` stamp lets that one
request through.** This is not a violation of "immediately": at the instant the row was
read it was live, and the next request is refused. Nothing here increments a counter, so
the claim-then-explain shape `otpService.ts` needs against a read-check-write race is not
needed.

**The migration had to be hand-split, not merely hand-reordered.** As generated,
`20260906_004937_add_session_expiry`'s `up()` was one `ADD COLUMN ... NOT NULL` with no
default, which succeeds only against a table with no rows — true of every database today,
and false the moment one session exists, at which point the `down()`-then-`up()` cycle
CLAUDE.md §7 requires would fail on the survivors. It is add-nullable, backfill,
`SET NOT NULL`, with the backfill set to `created_at` so a row predating the column is
expired rather than granted an expiry nobody ever gave it.

**What would reverse this.** A deployment target where a per-request database read is too
expensive would push towards option 1 plus a revocation denylist — at which point the
denylist is the row this ADR already keeps, and the JWT has bought nothing. A
`DATA_MODEL.md` revision adding a lifetime field and an access rule to `sessions` would
retire two of the deviations above without changing the shape decided here.
