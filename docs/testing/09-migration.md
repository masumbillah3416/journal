# 9 · Migration — the detail

The detail for `docs/testing.md` §9. That document states the suite's tool, its scope
and how to run it, and points here; everything else about the suite is below. The section
numbers are `docs/testing.md`'s and do not change.

- **Tool:** Vitest.
- **Scope:** every migration runs up, down, and up again against a seeded database.
- **Status:** implemented. `apps/web/migrations/` holds, at least:
  `20260831_154311_initial` (every collection and global's schema),
  `20260831_161951_add_jobs` (the `jobs` table backing the `queue` port, Task 9),
  `20260905_202028_add_otp_session_hash` (the OTP challenge's session binding, Phase 2
  Task 3 — `docs/deviations.md` §25), `20260905_230601_add_sign_in_attempts` (the
  sliding window's own table, Phase 2 Task 4 — `docs/deviations.md` §27) and
  `20260906_004937_add_session_expiry` (the session row's lifetime and the index an
  authentication reads by, Phase 2 Task 6 — `docs/deviations.md` §30) and
  `20260910_171154_add_media_state` (the media row's processing state and failure reason,
  Phase 3 Task 5 — `docs/deviations.md` §48) and `20260913_201520_add_media_grid_tier`
  (the six `media.sizes_grid_*` columns and their index for ADR 0013's deferred ~700px
  rung, Phase 3 Task 10). **Every migration after the initial one has its own case** in
  `collections.integration.test.ts` rather than sharing one — the count that used to open
  this bullet went stale within one task of being written, so it is a floor and a list
  now rather than a number (`caseCounts.test.ts`'s doctrine).

  The `session_expiry` case asserts on the column **and** the index, and on the
  `sessions` table surviving — this migration adds to a table it did not create, so a
  `down()` that took the table with it would be a different and much worse kind of
  reversible. Verified by making `down()` a no-op and watching it fail. That migration's
  `up()` is also the first here to be hand-split rather than hand-reordered: as generated
  it was a single `ADD COLUMN ... NOT NULL` with no default, which succeeds only against
  a table with no rows, so `down()`-then-`up()` — the very thing this suite exists to
  assert — would have failed the moment one session existed. Split into add-nullable,
  backfill, `SET NOT NULL`, it holds whatever the table contains. **A generated
  migration passing a reversibility test against an empty table is not the same as a
  reversible migration**; check the `up()` against a populated one before believing it.

  The `sign_in_attempts` case asserts on **all five** artefacts its migration creates —
  the table, its compound index, its two enum types, and the column Payload adds to
  `payload_locked_documents_rels` — rather than on the table alone. A `down()` that
  dropped the table and left the enum types behind would satisfy a table-only assertion
  and then fail its own re-apply with "type already exists", which is exactly the class
  of bug the hand-fixed statement order in that file's `down()` exists to prevent.
  Verified by making `down()` a no-op and watching it fail.

  The `media_state` case asserts on **four** artefacts — the `state` column, the
  `failure_reason` column, the `enum_media_state` type its `select` field creates, and
  the `media` table still being there — and on the row written before the rollback still
  reading back afterwards. The table and the row are in the assertion because this
  migration adds columns to a table it did not create: a `down()` that took `media` with
  it would be a much worse kind of reversible, and it would cost every photograph in the
  diary. Verified by replacing `down()` with a comment and watching it fail.

  The `grid_tier` case asserts on **eight** artefacts — the six `media.sizes_grid_*`
  columns, the `media_sizes_grid_sizes_grid_filename_idx` index Payload derives with them,
  and the `media` table — and on a row written before the rollback still reading back
  after it. Eight rather than one for the reason the `sign_in_attempts` case gives: a
  `down()` that dropped `sizes_grid_url` and left the other five behind would satisfy a
  single-column assertion and then fail its own re-apply. Verified by replacing `down()`
  with a no-op, which reports

  ```
  AssertionError: expected [ Array(8) ] to deeply equal [ 'media-table' ]
  +   "grid-filename-index",
      "media-table",
  +   "sizes_grid_filename",
  ```

  — the schema, not a collision, because this case goes through
  `acrossItsOwnRollback` like the four before it.

  **What a deliberate `down()` mutation reports here, and the claim that had to be
  withdrawn.** With `down()` a no-op the case fails either way, which is what matters —
  but WHAT it said was wrong, and Task 5's report recorded the reason as intrinsic. The
  older shape asserted inside a `try` whose `finally` re-applied the migration; an
  incomplete `down()` makes that re-apply collide (`type "enum_media_state" already
exists`), a `finally` that throws replaces the error from the `try`, and so the pasted
  failure named the collision instead of the schema. The review reproduced a five-line
  reordering that falsifies "intrinsic": capture the probe, re-apply TOLERANTLY, assert
  afterwards. The same mutation now reports `expected [ Array(4) ] to deeply equal
[ 'media-table' ]`.

  `acrossItsOwnRollback` in `collections.integration.test.ts` is that shape, and every case that
  reverses one migration alone goes through it. Its tolerance is narrow rather than a swallow
  (CLAUDE.md §3.1): the re-apply's failure is accepted only when the schema is back in its
  applied state anyway — which is the one thing a collision means — and re-thrown
  otherwise, because a repair that did not repair must not be quiet. The hand repair after
  a deliberate mutation is unchanged and is the `sign_in_attempts` recipe with this
  migration's artefacts: `DROP TYPE "public"."enum_media_state"` (plus the two columns, if
  the mutation left them), then let the next run apply `up()` again — measured again in
  the Tasks 4–6 fix round, and that is still all it takes.

  **Every reversibility case puts the migration back before the test can end** — the
  per-migration ones through `acrossItsOwnRollback`, and the roll-to-zero one in a
  `finally`, which it did not until a review pointed out that documenting its blast radius
  was not the same as closing it. Between `runMigrateDownToZero()` and `runMigrateUp()` the
  database has no schema at all, and an assertion failing in that gap used to leave it
  that way: measured, one failing assertion there turned into four failed cases and a
  `diary_test` with no `payload_migrations` table, so every later file in the project ran
  against nothing. With the re-apply, the same failing assertion leaves every
  migration applied and the schema intact — measured too. What a re-apply cannot fully
  cover is a `down()` that leaves artefacts behind, because it then legitimately fails on
  the collision; the tolerant form keeps the ASSERTION's diff readable, but **that** case
  still needs hand repair (drop `sign_in_attempts`, both `enum_sign_in_attempts_*` types
  and the `payload_locked_documents_rels` column, then let the next run apply `up()`
  again), and it is the one to expect when mutating a `down()` on purpose.

  The `session_hash` case is also the one worth reading before writing another migration
  test, because its first version was worthless and looked fine. It rolled every
  migration back to zero and asserted the _table_ came back — which the INITIAL
  migration's `down()`/`up()` does on its own, so the case passed with this migration's
  `down()` replaced by a no-op. It now rolls back **that migration alone** (through the
  same `up`/`down` functions Payload itself loads, via `readMigrationFiles` — a static
  import would register a second copy of the file and wreck its coverage report, measured
  at 60% branches purely from adding one) and asserts on the **column and its index**,
  which are the only two facts this migration is responsible for. Verified by making
  `down()` a no-op and watching it fail.

  The general rule: assert on what the migration under test actually changes, and
  reverse only that migration. A reversibility test that leans on a wider rollback is
  measuring the wider rollback.
  `apps/web/lib/migrate.ts` wraps Payload's migration runner as `runMigrateUp`,
  `runMigrateDown`, `appliedMigrationCount` and `runMigrateDownToZero`.
  `apps/web/lib/testPayload.ts`'s `getTestPayload()` calls `runMigrateUp` once, on
  self-bootstrap, to bring a fresh `diary_test` database up to date before any test runs
  against it. `postgresAdapter` is configured with `push: false`
  (`apps/web/payload.config.ts`), so these migrations — never Payload's dev-mode schema
  "push" — are the only sanctioned way the schema changes (`docs/data-model.md`); an
  earlier version of this task found `push` silently building the schema ahead of the
  first real migration, which would have made the migration decorative rather than the
  thing that actually built the tables.

- **What the reversibility test actually does.** `collections.integration.test.ts`'s
  last case — _"rebuilds every table a journey, its highlights and its tally need, after
  rolling all migrations back to zero and re-applying them"_ — writes a journey whose
  values span all three shapes the initial migration creates (plain columns on
  `journeys`, a group's `furniture_*` column prefix, and the two ordered array tables
  `journeys_highlights` and `journeys_tally`), captures those values, rolls every
  migration back to **zero**, asserts against Postgres directly that those three tables
  are gone and that no migration remains applied, re-applies every migration, writes the
  same journey again, and asserts every captured value round-trips.

  It replaced a case named _"runs down and up again without loss"_ that seeded nothing
  and compared nothing: it asserted only that `runMigrateDown()` and `runMigrateUp()`
  did not throw, and that a subsequent `find()` was defined. Both halves of that name
  were unearned.

  **To zero, not one batch, and that is the point.** Payload's `migrateDown()` rolls
  back only the most recent _batch_ — every migration the last `migrate()` applied
  together. On a database brought up in one go that is all of them; on one brought up
  incrementally it is only the newest. A reversibility test built on a single
  `migrateDown()` therefore proves whatever the local batch history happens to make it
  prove, and the initial migration's `down()` — the one that drops every table, and the
  one whose sibling carries a hand-fixed statement order — may never execute at all.
  `runMigrateDownToZero()` loops until `appliedMigrationCount()` reaches zero, which
  removes that dependence. `appliedMigrationCount()` asks Postgres with `to_regclass`
  rather than asking Payload, because the state it has to be able to describe includes
  "there is no schema left": the initial migration's `down()` drops `payload_migrations`
  itself, so a Payload query for that collection would throw at exactly the moment the
  answer is zero.

  **Data is not expected to survive, and the test does not pretend otherwise.**
  `DROP TABLE` destroys rows. What reversibility means here is that the schema comes
  back able to hold exactly what it held before — which is why the test re-writes the
  journey rather than looking for the old one.

  **It has failed.** Per `CLAUDE.md` §2.3, it was verified against two deliberately
  broken migrations. Deleting `DROP TABLE "journeys" CASCADE` from the initial
  migration's `down()` fails it with `cannot drop type enum_journeys_weather_glyph
because other objects depend on it` — the surviving `journeys` table still uses that
  type. Restoring the generator's original statement order in
  `20260831_161951_add_jobs`'s `down()` — the CASCADE-ordering bug that file's hand-fix
  exists to prevent — fails it with `constraint
"payload_locked_documents_rels_jobs_fk" of relation
"payload_locked_documents_rels" does not exist`. Both hand-fixes are therefore covered
  by a test that demonstrably catches their removal.

  **One thing to know when reading a failure.** Payload's own `migrate()` and
  `migrateDown()` call `process.exit(1)` on a failed migration rather than throwing, so
  a broken migration surfaces in Vitest as `Error: process.exit unexpectedly called with
"1"`, with the Postgres error above it in the log, not as an assertion diff. That is
  why the test asserts the rollback's outcome _mid-test_, before re-applying: without
  those two assertions, a rollback that quietly left a table behind would kill the
  worker on the re-apply, before anything could name the problem.

- **Coverage:** `migrate.ts` is reachable only from the integration-only callers above,
  so `vitest.config.ts`'s Docker-free unit pass excludes it from coverage rather than
  count it as 0%. It is gated instead by `vitest.integration.config.ts` at
  **100% lines / 100% branches / 100% functions** — the real, measured number.
  `runMigrateUp` and `runMigrateDown` are two-line wrappers with no branches of their
  own; `appliedMigrationCount` is called both while `payload_migrations` exists and
  after it has been dropped, so both of its branches run; and
  `runMigrateDownToZero`'s loop both runs and exits. Its one no-progress guard carries a
  `c8 ignore` with its reason (`CLAUDE.md` §2.1): it cannot fire while Payload deletes
  the migration row it just rolled back, and it exists so that if it ever does, the
  failure is a named error rather than a hung suite. See the Contract section above for
  the same exclude-and-regate treatment applied to the other integration-only files.
- **Run:** `npm run db:migrate` applies pending migrations; `npm run db:migrate:down`
  rolls back the most recent batch; `npm run db:migrate:create -w apps/web -- <name>`
  generates a new migration from schema changes (`README.md`'s Commands section). The
  reversibility test itself runs under `npm run test:integration`, or
  `npm run verify:full`, which additionally gates `migrate.ts`'s coverage via
  `npm run test:integration:coverage`.
- **Add one:** for every new migration file, extend the reversibility case with values
  that exercise whatever tables that migration adds — follow the existing one: write
  distinctive values, roll back to zero, assert the new tables are gone, re-apply, write
  again, assert the values round-trip. Then break one statement in the new migration's
  `down()` and confirm the case fails, and paste that failure. A reversibility test that
  has never failed is not evidence (`CLAUDE.md` §2.3).
