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
  it asked for a code. It _is_ the lookup key: `verifyChallenge` receives a session and
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
   `SECURITY.md`'s letter (only the _code_ is required to be hashed) and fails its
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
  has to be. Unsalted and fast is safe _here_ and only here: the input is a
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
- **The 30ms derivation forced the concurrency design, and is the reason the attempt is
  claimed rather than checked.** A read-check-derive-write sequence leaves a ~30ms window
  in which every concurrent guess has read the same attempt count; measured, twelve
  parallel guesses were all evaluated against a three-attempt budget and the stored
  counter finished at two. The fix is to spend the attempt with one conditional `UPDATE`
  _before_ deriving anything, so the database arbitrates and the derivation happens
  outside any lock. Holding a row lock across the derivation instead would have been the
  other obvious answer and is worse: it ties up a connection per guess, which is a
  denial-of-service lever, and it makes a crash mid-verification a free guess.
  `issueChallenge` inverts the same trade — it derives _before_ taking its per-account
  advisory lock, so the lock spans only a count and an insert.
- **That advisory lock is transaction-scoped and timeout-bounded, and both halves were
  corrections.** The first version used the session-scoped
  `pg_advisory_lock`/`pg_advisory_unlock` pair with the unlock in a `finally`, which is
  correct only while that `finally` can actually reach the database. The lock is held by
  the _connection_, and the connection is pooled, so any path that cannot send the unlock
  leaves the lock held on a connection that outlives the request: every later issue for
  that account then waits on a lock owned by a request several ago, and the symptom is a
  hang with no visible cause. `pg_advisory_xact_lock` inside an explicit transaction is
  released by the server on commit, rollback _or disconnection_ — release stops depending
  on a statement of ours succeeding. `SET LOCAL lock_timeout` then bounds the wait for a
  request queued behind a holder, because an unbounded wait is not one slow request: it
  holds a connection out of `pg`'s default pool of ten — a default, not a setting:
  `apps/web/payload.config.ts` names no `max`, as ADR 0016 and `rateLimit.ts` both say —
  for as long as the holder lasts, and ten of them is the whole application stopped. Three
  seconds is three orders of magnitude above what the critical section costs, so it never fires on
  honest contention. A timeout surfaces as a thrown Postgres error rather than a fifth
  `IssueFailure`: a reader can act on `'cooldown'`, and there is nothing they can do
  about database contention — inventing a refusal for it would put a message about our
  infrastructure on the sign-in screen. Pinned by two tests (a fault injected inside the
  critical section leaves zero rows in `pg_locks` for that key; a request queued behind an
  externally-held lock is refused rather than hanging) and by three mutations.
- **The constant-time comparison cannot be verified by a timing test here, and is
  asserted structurally instead.** The comparison runs on two 32-byte buffers behind a
  ~30ms scrypt derivation and a Postgres round trip; the leak a naive `===` produces
  measured 12.8ns, against a per-arm spread of 16.7ms end to end — about a
  millionth of the noise. `otpService.integration.test.ts` therefore asserts on the
  source of `codeMatches` that `timingSafeEqual` is the comparison used, with the
  measurement and the reasoning recorded beside it. That is a real limitation, stated
  rather than papered over with a threshold loose enough never to fail.
- **`expiresAt` is read by nothing.** It IS written — `otpService.ts`'s insert binds
  `expires_at` like any other column, which the next sentence says and this bullet used to
  contradict in its own first four words (the eighth whole-branch review's finding 6; the
  correctly-worded twins are `otpService.ts`'s own invariant and `docs/security.md`'s
  discharge row). It is `createdAt + EXPIRY_MS` because
  `DATA_MODEL.md`'s field list declares the column; authorization derives expiry from
  `createdAt` and `EXPIRY_MS` instead, because two sources of truth for one fact
  (CLAUDE.md §7) would make the constant decorative and let a bad write extend a
  challenge silently. Pinned by a test that moves the stored column a year into the
  future and still expects the challenge to be expired.

  **AMENDED after Phase 2's final review (blocker B4).** This bullet said the column
  "becomes a purge index and nothing else", and phase ruling F14 kept it on that ground.
  Both were false: no purge query existed anywhere, the column carried no index, and
  `otp_challenges` grew without bound. The purge exists now — a bounded cross-key sweep
  riding along with every `issueChallenge`, the same shape `sign_in_attempts` uses (ADR 0016) and the same one number
  (`PRUNE_SWEEP_ROWS`, `packages/domain/src/auth/retention.ts`) — and it keys on
  `created_at`, not on this column. That is not a detail: a challenge is unusable after
  five minutes but is still counted by the hourly resend ceiling for an hour, so
  `DELETE WHERE expires_at < now()` — the exact query this ADR described — would delete
  rows the mailbomb cap is still counting.

- **Rotating the scrypt parameters is free**, and rotating the session-hash algorithm is
  not much dearer: both only affect rows younger than five minutes.
- Recorded as deviation 25 in `docs/deviations.md` (the added column) and discharged
  against `SECURITY.md`'s six OTP bullets in `docs/security.md`.
