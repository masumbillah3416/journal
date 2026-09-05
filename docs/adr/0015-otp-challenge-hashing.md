# 0015 — An OTP challenge stores two secrets, hashed two different ways

## Context

`SECURITY.md`'s first prototype hole requires the sign-in code to be generated with a
CSPRNG, stored only as a **hash**, compared with a **constant-time comparison**, and
**bound to the session that started it**. The last of those has no column in
`DATA_MODEL.md`'s field list for `otpChallenges` — the handoff contradicts itself, and
the gap and its resolution are recorded as `docs/deviations.md` §25. This ADR is about
the consequence of closing it: an `otpChallenges` row now holds **two** secrets, not one.

They are not the same kind of secret, and the properties they need are in direct
tension:

- **The code** is six decimal digits. That is 1,000,000 values — a keyspace a laptop
  exhausts in well under a second against a fast hash. It is never used to find a row;
  it is only ever compared against a row already found.
- **The session identifier** is the high-entropy, pre-auth id the browser presented when
  it asked for a code. It *is* the lookup key: `verifyChallenge` receives a session and
  has to find that session's challenge, which means the stored form must be
  deterministic and indexable.

A single choice cannot serve both. A fast hash over the code is a rainbow table waiting
for a database leak. A slow, salted hash over the session identifier cannot be looked up
at all — a per-row salt means the only way to find the matching row is to derive against
every row in the table, which is both O(n) scrypt derivations per sign-in and,
incidentally, a denial-of-service lever.

Storing the session identifier in cleartext was the third option, and it is the one this
decision exists to reject: the column sits in the same row as `ip`, and a table that
already hashes one secret has no business keeping the other in the clear.

## Options considered

1. **One algorithm for both columns — SHA-256.** Rejected. It is right for
   `sessionHash` and wrong for `codeHash`: a leaked table of unsalted SHA-256 over six
   digits is a table of codes, recoverable by anybody with a million-entry precomputed
   list.
2. **One algorithm for both columns — scrypt with a per-row salt.** Rejected for the
   opposite reason. It is right for `codeHash` and unusable for `sessionHash`: a salted
   hash is not a lookup key, so finding a challenge would mean deriving a key per stored
   row on every verification.
3. **Hash the code, store the session identifier in cleartext.** Rejected. It meets
   `SECURITY.md`'s letter (only the *code* is required to be hashed) and fails its
   intent. `SECURITY.md` rotates the session identifier away on login precisely because
   a pre-auth id is untrusted; leaving it readable next to `ip` in a table whose whole
   purpose is to hold a live sign-in in progress hands a database reader a
   ready-assembled "this browser, at this address, is signing in right now, and here is
   the id it will present".
4. **A relationship to the `sessions` collection instead of a hash of the id.**
   Rejected, and this is the ruling recorded in the phase ledger as F12. At issue time
   the visitor is unauthenticated. Minting a `sessions` row for every pre-auth visitor
   would bloat the table with rows that never become sessions, and would put pre-auth
   entries into the Account screen's "Where you are signed in" list, which is backed by
   real `sessions` rows. The binding needs to identify a browser, not to create an
   account session.
5. **Two algorithms, chosen per column for what each column is for** — chosen.

## Decision

`otpChallenges` stores its two secrets differently, on purpose:

- **`codeHash` is scrypt (`N: 16384, r: 8, p: 1`, 32-byte key) with a fresh 16-byte
  random salt per row**, stored as `saltHex || keyHex`. It is never a lookup key. A
  candidate code is compared by deriving with the row's own salt and calling
  `crypto.timingSafeEqual` on the two equal-length buffers — the constant-time
  comparison the requirement names. scrypt rather than Payload's own password hashing
  because Payload's is reached through its `users` auth machinery rather than exposed as
  a function this collection can call, and a code is not a password: it needs the same
  memory-hard property but none of the account lifecycle around it.
- **`sessionHash` is SHA-256 of the pre-auth session identifier, hex encoded, on an
  indexed `varchar` column.** Deterministic and indexable, which is what a lookup key
  has to be. Unsalted and fast is safe *here* and only here: the input is a
  high-entropy identifier, not a six-digit number, so there is no dictionary to run
  against it.
- **The stored `codeHash` carries no parameters.** They are module constants in
  `apps/web/lib/auth/otpService.ts` and can be raised without a migration, because a
  challenge lives five minutes (`EXPIRY_MS`) and no row hashed under the old parameters
  can outlive a deploy. A self-describing format would be an extension point with no
  second caller (CLAUDE.md §4).
- **The reason the two differ is written where a reader will hit it**: the module header
  of `otpService.ts`, and this ADR.

## Consequences

- **One scrypt derivation per verification**, roughly 30ms on the development machine
  (measured, task-3 report). That is deliberate cost on the attacker's side of a
  million-value keyspace, and it is bounded on the reader's side by the three-attempt
  limit. It is also why `deriveKey` uses the asynchronous `crypto.scrypt` rather than
  `scryptSync`: 30ms of blocked event loop per attempt is a denial-of-service lever on a
  shared web process.
- **A row is found by `sessionHash` and only then does anything touch the code.** A
  request carrying no valid session hash costs one indexed lookup and no derivation,
  which keeps the expensive path behind the cheap one.
- **The constant-time comparison cannot be verified by a timing test here, and is
  asserted structurally instead.** The comparison runs on two 32-byte buffers behind a
  ~30ms scrypt derivation and a Postgres round trip; the leak a naive `===` produces
  measured 12.8ns, against a per-arm spread of 16.7ms end to end — about a
  millionth of the noise. `otpService.integration.test.ts` therefore asserts on the
  source of `codeMatches` that `timingSafeEqual` is the comparison used, with the
  measurement and the reasoning recorded beside it. That is a real limitation, stated
  rather than papered over with a threshold loose enough never to fail.
- **`expiresAt` becomes a purge index and nothing else.** It is written as
  `createdAt + EXPIRY_MS` so a purge is one indexed `DELETE`; authorization derives
  expiry from `createdAt` and `EXPIRY_MS` instead, because two sources of truth for one
  fact (CLAUDE.md §7) would make the constant decorative and let a bad write extend a
  challenge silently. Pinned by a test that moves the stored column a year into the
  future and still expects the challenge to be expired.
- **Rotating the scrypt parameters is free**, and rotating the session-hash algorithm is
  not much dearer: both only affect rows younger than five minutes.
- Recorded as deviation 25 in `docs/deviations.md` (the added column) and discharged
  against `SECURITY.md`'s six OTP bullets in `docs/security.md`.
