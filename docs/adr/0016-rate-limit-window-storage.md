# 0016 — The sign-in rate window lives in Postgres, and counts by rank

## Context

`SECURITY.md`'s third prototype hole requires, among the server-side replacements for a
cosmetic client-side counter, "Rate limit per account **and** per IP — a sliding window on
both the password and code endpoints." It names neither the limits nor where the window's
state lives, and both of those turn out to decide whether the limiter exists at all.

Two facts about this repository frame the decision.

**Where this deploys.** `docs/adr/0001-hosting-and-cost.md` puts the Next.js/Payload app
on Vercel. Vercel runs serverless invocations: several may be alive at once, each with its
own memory, and an idle one is discarded. Nothing in an application process outlives a
request in any way an attacker cannot step around.

**What was measured one task ago.** `docs/adr/0015-otp-challenge-hashing.md` records a
concurrency defect found in the OTP service and fixed there: a limiter that read a count,
decided, and then wrote the attempt let **twelve parallel guesses through a three-attempt
budget**. The stored counter finished at two and the correct code still worked afterwards.
That is not a theoretical race — it was reproduced with `Promise.all` and it is the exact
shape any rate limiter naturally takes if nobody thinks about it.

## Options considered

1. **An in-memory `Map` of key to timestamps, pruned on read.** Rejected, and it is the
   option this ADR mostly exists to reject. It is the shortest correct-looking
   implementation, it passes every test that can be written for it on a developer's
   machine — locally there is exactly one process — and on Vercel it gives every
   invocation a window of its own. An attacker who simply keeps making requests reaches
   fresh instances and never meets a refusal. A limiter that is green in CI and absent in
   production is worse than no limiter, because nobody looks at it again.
2. **A shared cache (Redis/Upstash) with a sorted set per key.** Rejected for this
   project, not on the merits of the mechanism. It is the standard answer at scale and it
   would work; it also adds a third stateful provider, a second connection pool, a second
   failure mode ("what happens to sign-in when the cache is down?") and a monthly bill, to
   a single-author diary whose design spec §13 asks for cost proportional to that scale.
   Postgres is already provisioned, already pooled, already backed up, and already the
   thing every other limit in this application is enforced by.
3. **Reuse the `otpChallenges` table as the count.** Rejected. It counts the wrong thing
   in both dimensions: an `otpChallenges` row records a code being _issued_, not a code
   being _guessed_, and it exists only for the code endpoint — nothing writes one for a
   password attempt, and nothing could write one for an address that names no account. It also has no per-IP index, and overloading a table whose rows
   are five-minute ephemera with a fifteen-minute window would tie two unrelated
   retention rules together.
4. **A per-key counter row with `INSERT … ON CONFLICT DO UPDATE SET count = count + 1`.**
   Rejected. It is atomic and exact, and it is a _fixed_ window, not a sliding one: the
   count resets on a boundary, so an attacker who straddles two buckets gets twice the
   limit in a moment. `SECURITY.md` asks for a sliding window by name.
5. **Its own table in Postgres, one row per attempt, ranked** — chosen.

## Decision

**A `signInAttempts` collection, one row per attempt**, written and read only by
`apps/web/lib/auth/rateLimit.ts`. `DATA_MODEL.md` describes no such collection, so it is a
recorded deviation (`docs/deviations.md` §27), exactly as `otpChallenges.sessionHash` was
one task earlier. Access is `() => false` on **every** operation, matching `otpChallenges`
and `jobs` — `delete` included, which the handoff's own access block omits for all three
and which Payload therefore left open to any signed-in caller until this task closed it
(`docs/deviations.md` §28).

**Each request records its own attempt first and is ranked second.** The insert happens
before anything is counted; the limiter then asks how many rows for that key stand at or
before its own, and admits the attempt while that rank is at or below the limit. There is
no interval between a check and a write for a racer to occupy, no lock is taken, and a
burst is refused **in arrival order** — the first N of an arriving burst are admitted and
the rest refused — rather than all or none. This is the direct correction of the defect
ADR 0015 records, applied one layer up before it could be repeated.

**The row is stamped with `clock_timestamp()`, never `now()`.** `now()` is the transaction
start time, identical for every statement in one transaction, so a burst inside a single
transaction would tie on the very column the window is measured over. Nothing in this
module opens an explicit transaction today, which is precisely why the choice is written
down: it is what keeps the mechanism correct if some later caller wraps it in one.

**The rank bound has a deterministic test as well as the bursts.** The bursts exercise
`id <= mine` only when a racer's row happens to exist at the moment another request ranks,
which is a matter of scheduling: removing the bound was caught in three runs out of four.
`rateLimit.integration.test.ts` therefore also seeds a key with rows written at explicit
ids above the sequence — inside the window, stamped earlier, but ranking _after_ the
attempt that follows them, which is what a racer's row looks like made deterministic — and
asserts that attempt is still admitted. A guard caught three times in four is a guard that
passes CI the fourth time.

**Rank is ordered by the row's `id`, not by its timestamp.** Payload maps a `date` field
to `timestamp(3)`, so two attempts a hundred microseconds apart can land on the same
millisecond, and two attempts sharing a rank would let a limit of N admit N+1. `id` comes
from a sequence: unique, and handed out in insert order. The timestamp then decides only
one thing — whether an attempt is still inside the window.

**The window arithmetic lives in the domain, not in SQL.** `admitsAttempt`
(`packages/domain/src/auth/rateWindow.ts`, gated at 100%) applies the window floor and
compares the rank with the limit; the SQL only supplies the newest `limit + 1` attempts at
or before this one, because nothing older than those can change the answer. The floor is
deliberately **not** applied a second time in SQL: two copies of one rule would mean
neither could be broken on its own, which is a pair of tests that can no longer fail.

**The limits, since `SECURITY.md` gives none** (recorded as phase ruling F27):

| Key                                    | Limit                                             | Window     |
| -------------------------------------- | ------------------------------------------------- | ---------- |
| One address, password endpoint         | 20                                                | 15 minutes |
| One address, code endpoint             | 20                                                | 15 minutes |
| One account, code endpoint             | 10                                                | 15 minutes |
| One CLAIMED ADDRESS, password endpoint | 10                                                | 15 minutes |
| One account, password endpoint         | Payload's `maxLoginAttempts: 5` / `lockTime: 15m` | —          |

Twenty per address because an office or a household behind one NAT is a single address to
us: several people signing in, with the mistyped passwords and resent codes that go with
it, must not trip a limit meant for an attacker. Twenty in a quarter of an hour is far
past what that traffic needs and far below what brute force is worth — twenty guesses out
of a million against a six-digit code. The two endpoints are counted separately because
they are different secrets, and a reader who has fumbled their password is not thereby
out of code attempts.

Ten per account on the code endpoint because it is a **backstop, not a limit a reader can
reach**: three guesses per challenge and five resends an hour already hold an honest
reader near eighteen code attempts an hour by the only route available to them, and the
thirty-second resend cooldown keeps them well clear of ten in fifteen minutes. What it
bounds is an attacker requesting fresh challenges from many addresses — the spray a
per-address limit alone cannot see.

**The password endpoint's second key is the CLAIMED ADDRESS, hashed — not the account**
(phase ruling F43, added by Task 5 when the limiter acquired its first caller). Task 4
left that dimension out entirely, on the reasoning that `SECURITY.md` §3 assigns the
per-account password limit to Payload's own `maxLoginAttempts`/`lockTime` and a second
limiter beside it would be two sources of truth for one rule (CLAUDE.md §7). Wiring
`signIn` up showed the reasoning to be right about the _account_ and wrong about the
_endpoint_, for two reasons:

- **Payload can only lock a row that exists.** For an address that names no account there
  is no counter, no lock and no cooling-off period — so the per-IP window was the only
  thing between an attacker and an unbounded supply of guesses at addresses of their
  choosing, and an attacker with more than one address had nothing at all.
- **A missing dimension is itself an enumeration oracle.** Keying it on an account row id
  would mean the miss path did strictly less work than the hit path — one fewer insert
  and one fewer rank query — on exactly the branch `SECURITY.md` requires to be
  indistinguishable. Hashing the normalised address makes the two identical by
  construction, and keeps a cleartext address out of a table that already holds raw IPs.

**Ten rather than five**, so the two rules do not collide: for an address that names an
account, Payload's lockout always binds first and stays the single source of truth for
it; and a window that refused at the same count would refuse the unknown address one
attempt _earlier_ than the known one, which is the oracle again in a different place.
Payload's configuration is exercised by
`apps/web/collections/users.lockout.integration.test.ts` — see the consequences below for
what writing that test found — and the window by
`apps/web/lib/auth/rateLimit.integration.test.ts` and
`apps/web/lib/auth/signIn.integration.test.ts`.

**Everything fails closed.** A non-finite instant, a negative or infinite window, a
non-integer limit, a corrupt timestamp among the recorded attempts, or an attempt that
cannot find its own record all read as the limit having been reached. The precedent is
`canResend` in `packages/domain/src/auth/otpChallenge.ts`, and the reason is the same:
every comparison against `NaN` is false, so a limiter that merely evaluated its arithmetic
would switch itself off silently, on the one path that never appears in a log.

**Rows are pruned on write, in the same statement that records the new attempt, and the
prune is not only this key's.** Each write clears every aged row for the key being touched
AND a bounded batch of aged rows belonging to any other key, oldest first (fifty). The
second half is what makes the bound real, and the first version of this decision did not
have it: pruning only the key being written bounds growth by the number of DISTINCT KEYS
ever seen, not by the window, and a spray from many addresses — the traffic this limiter
exists for — is exactly what manufactures keys. Measured before the fix: three aged rows
for one address survived a write against a different address. With the sweep, cleanup is
eventually complete and per-request work stays constant.

A scheduled job would also have worked and was not taken. Phase 0's queue exists, but a
limiter whose table grows without bound whenever the scheduler is down has an availability
dependency it does not need, and the sweep costs one extra indexed `DELETE` inside a
statement that was already being issued.

## Consequences

- **The limiter survives a deploy target that discards process memory**, which was the
  whole point. It also survives a restart, a scale-out and a second region, none of which
  an in-memory window does.
- **Two round trips per key per attempt** (a combined prune-and-insert, then a bounded
  rank query). Both endpoints touch two keys, so both cost four. That is a fixed, small number, not an N+1, and it is
  paid only on the sign-in path.
- **One residual race is accepted and named rather than hidden.** Postgres READ COMMITTED
  cannot see another transaction's uncommitted row, so an attempt whose INSERT is still in
  flight is invisible to a racer's rank query. Each statement here is its own autocommit
  statement, so a row is committed the moment its INSERT returns — a full round trip
  before the ranking query is even sent — which makes the window shorter than one round
  trip. Its worst case is admitting an attempt or two past the limit under a burst; it can
  never refuse one below it. Closing it entirely would need a per-key lock, which buys
  exactness with a database connection held per attempt: the same denial-of-service lever
  ADR 0015 rejects for the OTP comparison path.

  **The bound is not the measurement, and this ADR said it was.** The
  twenty-eight-deep and eighteen-deep bursts in
  `apps/web/lib/auth/rateLimit.integration.test.ts` admitted exactly twenty and exactly
  ten on ten consecutive runs, and an independent sixty-deep burst over-admitted zero
  times in twenty-five rounds — but that is what was observed, not what is possible. The
  true worst case is the number of inserts that can be in flight carrying a lower id than
  yours at the moment you rank, minus one: `pool max - 1` for a single process (nine, with
  `pg`'s default pool of ten) and `invocations x pool max - 1` on the serverless target,
  limited only by the server's `max_connections`. The acceptance is unchanged — the
  three-guess challenge budget and the five-attempt account lockout bind long before that
  matters — but "one or two", which is what this ADR and the module header first said,
  is a measurement written as a bound, and the next reader sizing a limit against it
  would be wrong by an order of magnitude.

- **`clock_timestamp()` cannot be distinguished from `now()` by any test this suite can
  write**, and that is stated rather than papered over. Under autocommit the two are the
  same instant to the millisecond, and rank is ordered by `id` in any case, so a mutation
  from one to the other fails nothing. It is a guard against a future caller opening a
  transaction around these statements, held in place by the comment at the SQL and by this
  ADR rather than by a red test.
- **Writing the lockout test found a real defect that had been in the tree since Phase 0.**
  `users` declared `lockTime: 15 * 60`, which reads as fifteen minutes and is not: Payload
  takes `lockTime` in **milliseconds** (its own default is `600000`, ten minutes) while
  taking `tokenExpiration`, on the same object, in **seconds**. The cooling-off period was
  therefore 900 milliseconds. Nothing behavioural distinguished it — the account still
  locked, wrong passwords were still refused — and the lock lifted before a reader could
  finish reading the message about it. Corrected to `15 * 60_000`, with the unit trap
  written at the line, and pinned by a case that asserts the DURATION rather than the
  fact of a lock. This is what "configuration that has never been observed working is a
  hypothesis" costs when nobody checks it for a phase and a half.
- **Removing Payload's `auth` lockout options entirely fails only the fifteen-minute
  case**, because Payload's defaults are themselves `maxLoginAttempts: 5` and a ten-minute
  `lockTime`. The explicit configuration is only observably different from the default in
  its duration. Recorded so a later reader does not mistake the other cases' passing for
  proof that this collection's own settings are the ones in force.
- **A new collection means a new migration**, `20260905_230601_add_sign_in_attempts`,
  reversible in both directions and asserted so by its own case in
  `collections.integration.test.ts` — on all five artefacts it creates (the table, its
  compound index, its two enum types, and the column Payload adds to
  `payload_locked_documents_rels`), not on the table alone.
- **The window is fifteen minutes on both endpoints and in both dimensions, matching
  `lockTime`.** A reader who has waited out a lockout has waited out their address's
  window too, so there is only one number they ever have to be told.
- **Nothing here logs.** An address and an account never appear in the same row and never
  appear together in any value the module returns; a refusal is one word.
- **Recorded as deviation 27 in `docs/deviations.md`** (the added collection) and
  discharged against `SECURITY.md`'s rate-limit and lockout rows in `docs/security.md`.
