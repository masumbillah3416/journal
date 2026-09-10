# Data model

Source of truth for field lists: `handoff/design_handoff_travel_diary/DATA_MODEL.md`.
This document records the collections, the derived-vs-stored distinction, and the
decisions layered on top of the handoff (design spec §5); it does not restate every
field — see `DATA_MODEL.md` for the full Payload collection definitions.

Collections are implemented in `apps/web/collections/*.ts` and `apps/web/globals/*.ts`,
registered in `apps/web/payload.config.ts`, and migrated by the migrations in
`apps/web/migrations/` — reversibility (down, then up again) of the latest batch is
verified by `apps/web/collections/collections.integration.test.ts` against a real Docker
Postgres.

## Collections

### `media`

The upload collection; everything else references it. Payload's `upload` config
generates five derivative image sizes at upload (`thumb` 400², `tile` 800², `frame`
1400w, `hero` 2000w, `hero2x` 4000w — see `docs/adr/0003-derivative-generation.md`) and
Payload's built-in focal-point picker powers the admin control. Fields include `journey`
(relationship), `kind` (`still` | `clip`, read-only — set by the pipeline, not the
author), `caption`, `alt`, `capturedAt` (from EXIF, retained after the EXIF strip),
`posterAt`/`posterImage`/`durationSec` (clips only), `inBook`, `hidden`, `isCover`,
`allowDownload`, `order`, `contentHash` (perceptual hash, indexed, for duplicate
detection within a journey), and — added in Phase 3 Task 5, and not in the handoff's own
field list (`docs/deviations.md` §48) — `state` (`processing` | `ready` | `failed`,
read-only, defaulting to `processing`) with `failureReason` (read-only text, the words the
Media screen shows). `processing` is a first-class UI state rather than a missing image
(design spec §9.2): without it a half-ingested row is indistinguishable from a finished
one, and every step of the `beforeChange` pipeline below can fail on a row that already
exists.

A `beforeChange` hook will run, in order: sniff the real mime type from magic bytes (never
the extension); reject SVG outright; read EXIF into `capturedAt` then strip all EXIF;
re-encode stills via `sharp`; compute `contentHash` and flag a duplicate within the same
journey; for clips, probe with `ffprobe`, transcode to H.264 MP4, extract a poster into
`posterImage`. An `afterChange` hook will clear `isCover` on the journey's other media when
one item's `isCover` is set. This order is deliberate — later steps depend on earlier ones
having run (design spec §9.2). **Schema only lands in Phase 0** (this task); the hooks
depend on the storage port (Task 7) and transcode queue (Task 9) and land with them.

### `journeys`

`versions: { drafts: true }` backs the Publish screen's editions and restore. Fields:
`name`, `place`, `slug` (unique, indexed), `dates` (free text — "12 – 24 March 2025") with
its sortable partner `startsOn`, `order` (indexed), `hiddenFromBookmarks`, `archived`,
`deletedAt` (indexed — the 30-day trash), `weather`, `mood`, `weatherGlyph`, a
`furniture` group (`signoff`, `stampCountry`, `stampValue`, `accent`), `highlights`
(array, **capped at 4 in the schema**, not just the UI — the Notes page layout is tuned
for 3–4), `note`, and `tally` (array, exactly 4 rows, `value` deliberately typed as
**text** — journeys use values like "plenty" and "uncounted", not just numbers).

### `pages`

Pages are rows, not a fixed triple of Cover/Notes/Frames — the admin can add, duplicate,
reorder and delete them. `versions: { drafts: true }`. Fields: `journey` (relationship,
indexed), `kind` (`notes` | `frames`), `title`, `order` (indexed), `layout`
(`three-up` | `four-up` | `full-bleed` | `text-spread`), and `slots` (array of `role`,
`media`, `caption`, `alt`, `focalX`, `focalY`).

**Focal point lives on the slot, not the media item.** The same photograph in a tall
frame and a wide frame wants different focus; `media.focalPoint` is the default that
`pages.slots[].focalX/focalY` overrides. It is applied as `object-position` /
`background-position` when the diary renders — design spec §5.2 makes wiring this
through to actual rendering a Phase 4 exit criterion precisely because an admin control
that doesn't affect rendering is decorative.

**Wired through, and proved rather than asserted (Phase 1 Tasks 10 and 11).** Every
photograph the diary draws — the Notes hero, the ephemera scrap, Frames I's three,
Frames II's four and the About portrait — reaches `object-position` through one
component, `apps/web/components/pages/Photograph.tsx`, which sets it inline from the
slot's own value. `apps/web/scripts/seed-data.ts` deliberately gives four of those
slots a NON-DEFAULT focal point (Tokyo's hero, its first Frames I slot, its third
Frames II slot, and the About portrait's media item), because a seed in which every
slot were centred would leave the control unprovable in a browser: every rendered crop
would look identical whether the value arrived or not. `e2e/notes.spec.ts`,
`e2e/frames.spec.ts` and `e2e/about.spec.ts` each screenshot the same element twice —
once at its focal point, once forced back to `50% 50%` — and require the two buffers
to differ.

**The About portrait is the one exception to "on the slot", and the rule's own wording
is why.** The `about` global holds a bare `upload` with no slot on it, so there is
nothing for a slot to override: `media.focalPoint` IS the portrait's focal point, and
`readBookBundle` reads `media.focalX/focalY` for that one photograph. The seed writes
it onto the media row rather than onto a `pages` slot for the same reason.

### `users`

One row in practice. `auth: { tokenExpiration: 60 * 60 * 24 * 7, maxLoginAttempts: 5,
lockTime: 15 * 60_000 }` — see `docs/adr/0002-auth-mechanism.md` for why this, and not
Auth.js, is the credential store. **The two durations are in different units**, which is
Payload's API rather than a typo: `tokenExpiration` is seconds (its default is `7200`,
two hours) and `lockTime` is milliseconds (its default is `600000`, ten minutes). This
line read `lockTime: 15 * 60` from Phase 0 until Phase 2 Task 4, which asked for a
cooling-off period of 900 milliseconds and got one; nothing behavioural distinguished it,
since the account still locked and wrong passwords were still refused. Found and fixed
when `apps/web/collections/users.lockout.integration.test.ts` first asserted the lock's
DURATION rather than its existence (`docs/adr/0016-rate-limit-window-storage.md`). Fields: `displayName` (printed on the cover),
`signoffDefault`, `timeZone`, `otpRequired` (checkbox, default `true` — **the only**
source of truth for whether the OTP step runs; the prototype's `localStorage` flag is
deleted, not moved, per `SECURITY.md`), `notifyOnPublish`, `notifyWeekly`.

### `otpChallenges`

`access: { read: () => false, create: () => false, update: () => false, delete: () => false }`
— server-only by design; nothing about the OTP flow is reachable from the Payload
REST/GraphQL API a client could call directly. **The `delete` predicate is this
repository's addition and it is printed here deliberately:** `DATA_MODEL.md` omits it,
Payload applies its signed-in-or-refused default to whatever an access block leaves out,
and deletion therefore fell through to any authenticated caller. This file describes that
correction in full below, under the paragraph beginning "The `delete` predicate" — and
then printed the three-predicate form here anyway, for the rest of the phase (Phase 2's
final review, finding 29). Fields: `user` (relationship, indexed), `codeHash` (scrypt
with a per-row salt, never plaintext), `sessionHash` (indexed — SHA-256 of the pre-auth
session identifier), `expiresAt` (now + 5 minutes), `attempts` (default 0), `consumedAt`,
`ip`.

`sessionHash` is **not** in `DATA_MODEL.md`'s field list. It is the deviation recorded as
`docs/deviations.md` §25: `SECURITY.md` requires the challenge to be bound to the session
that started it and the handoff's own field list has nowhere to put one, so the column was
added by migration `20260905_202028_add_otp_session_hash`. Why the two hashed columns use
two different algorithms — a slow salted hash for the code, a fast indexable one for the
lookup key — is `docs/adr/0015-otp-challenge-hashing.md`.

`expiresAt` is **written, and read by nothing.** (This sentence said "written and read by
nothing", which its own next clause contradicts — the column IS written, on every
challenge.) It is `createdAt + EXPIRY_MS` because the handoff's field list declares the
column; whether a challenge is still usable is derived
from `createdAt` and the domain's `EXPIRY_MS` (`packages/domain/src/auth/otpChallenge.ts`),
never read back off this column. Two sources of truth for one fact would make `EXPIRY_MS`
decorative and would let a bad write to `expiresAt` silently extend a challenge's life.
The behaviour lives in `apps/web/lib/auth/otpService.ts`.

This paragraph used to call the column "a purge index, not an authorization input", and
described the purge as one indexed `DELETE WHERE expires_at < now()`. **No such query
existed** and the column carries no index — blocker B4 of Phase 2's final review,
correcting ruling F14. The purge exists now and keys on `created_at`: a bounded cross-key
sweep in `issueChallenge`, because a challenge is unusable after five minutes but is still
counted by the hourly resend ceiling for an hour, so a purge on `expires_at` would delete
rows that ceiling still needs. The retention policy and its one number are
`packages/domain/src/auth/retention.ts`; `sessions` is swept the same way, on the two
columns `sessionState` refuses by.

### `sessions`

Backs the Account screen's "Where you are signed in" list, and is what every admin
request is authenticated against. Without real rows here, "Revoke" and "Sign out
everywhere" are decorative. Fields: `user`, `tokenHash`, `expiresAt`, `device`,
`location`, `createdAt`, `lastSeenAt`, `revokedAt`. The behaviour over them is
`apps/web/lib/auth/sessions.ts` (Phase 2 Task 6); the lifecycle arithmetic and the
cookie's attributes are `packages/domain/src/auth/session.ts`.

`expiresAt` is **not** in `DATA_MODEL.md`'s field list, and is a recorded deviation
(`docs/deviations.md` §30, migration `20260906_004937_add_session_expiry`).
`SECURITY.md` requires "'Keep me signed in' is a longer-lived, **revocable** session row
— not a longer JWT", and a row with no lifetime has nothing for "longer" to describe.
Unlike `otpChallenges.expiresAt` above, this column **is** the authorization input
(`docs/adr/0017-session-store-and-rotation.md`):
`sessionState` reads it, there is no second derivation of the same fact anywhere, and the
identifier in the cookie carries no expiry of its own to disagree with it.

Access is **per-user ownership**, not the flat `() => false` the three server-only
collections carry, because the Account screen legitimately reads these rows: `read`,
`update` and `delete` each return `{ user: { equals: req.user.id } }`, so an operation is
narrowed to the caller's own rows and refused outright when there is no caller; `create`
is `() => false` for everybody, since a session is minted server-side against a token the
client never sees. The collection previously declared **no access block at all**, which
left Payload's `defaultAccess` applying — see `docs/deviations.md` §29 for what that meant
and how it was found.

**No field is writable through the API, including `createdAt` and `updatedAt`.**
Collection-level ownership was necessary and not sufficient, and this is the correction
review round 1 forced: two fields inside an operation that is correctly permitted escaped
it. `user` is the field the ownership predicate itself reads, so leaving it writable let
an account holder move their own row onto another account and authenticate as them;
`revokedAt` decides whether a revoked session stays revoked, so leaving it writable let a
revoked session be un-revoked with one `PATCH`. A per-field sweep added in the same round
then found a third, which nobody had enumerated: Payload injects `createdAt`/`updatedAt`
when it sanitises a collection, an injected field carries no access rule, and `createdAt`
was writable — a session could claim it had been signed in at any time it liked, on the
one list whose only job is to be true. All three are closed by refusing `update` on every
field, and the timestamps are now declared explicitly (with `index: true`, which is what
Payload's injected versions carry) so that a rule can reach them. Revocation is therefore
**server-side only**: `revokeSession`/`revokeAllSessions` in
`apps/web/lib/auth/sessions.ts` are what the Account screen calls. The collection-level
`update` stays owner-scoped rather than `() => false` because Payload refuses at the
collection level before it evaluates field access, so a flat refusal would make all nine
field predicates unreachable — and unreachable rules are rules no test can prove.

**Deleting a `users` row that still has `sessions` rows fails the foreign key.**
`sessions.user_id` is `NOT NULL`, while `20260831_154311_initial.ts:397` declares its
foreign key `ON DELETE set null` — so Payload's delete hook nulls the relationship rather
than cascading, and Postgres refuses the null. The same shape applies to
`otp_challenges.user_id`. It has no product consequence while there is one author and no
account-deletion screen, but it is reachable now that sessions rows actually exist: it was
hit for real by a test fixture that deleted an account before its session (the
`sessions.access.integration.test.ts` cleanup, which now removes sessions by owner for
this reason). **Delete sessions and challenges before the account that owns them**, in the
seed, in any fixture, and in whatever account-deletion flow a later phase builds.

### `jobs`

Backs the Postgres-backed `QueuePort` adapter (`apps/web/lib/adapters/postgres-queue.ts`,
Task 9): one row per background job, today only `kind: 'transcode'` after a clip upload.
`access: { read: () => false, create: () => false, update: () => false, delete: () => false }`

- server-only, reached only through the adapter's Local API calls, matching
  `otpChallenges` and `signInAttempts` — the fourth predicate included, for the reason the
  `otpChallenges` section above gives. Not `sessions`, which carries a per-user ownership rule instead — see
  its own section above. `mediaId` is a plain text field, not a `relationship` to `media`: a foreign
  key here would reject the branded ids the queue's own contract suite enqueues in
  isolation from a real media row. Fields: `kind` (`transcode`), `mediaId` (text),
  `status` (`queued` | `claimed` | `completed` | `failed`, indexed, defaults to `queued`),
  `reason` (why a job failed, surfaced on the admin's Media screen in a later phase),
  `claimedAt`.

### `signInAttempts`

Backs the sliding window `SECURITY.md` requires per account and per IP
(`apps/web/lib/auth/rateLimit.ts`, Phase 2 Task 4): one row per sign-in attempt, admitted
or refused. `access: { read, create, update, delete }`, every one `() => false` —
server-only, like `otpChallenges` and `jobs`. The `delete` predicate is this
repository's addition: `DATA_MODEL.md` omits it from all three access blocks
and Payload applies its "signed in, or refused" default to whatever an access
block leaves out, so deletion fell through to any authenticated caller
(`docs/deviations.md` §28). Fields: `dimension`
(`ip` | `account`), `endpoint` (`password` | `code`), `subject`, `attemptedAt`. One
compound index over all four, in the order a lookup filters them.

**What `subject` holds depends on the dimension and the endpoint**, and one of the three
is not what its `dimension` value suggests:

| `dimension` | `endpoint` | `subject`                                                                    |
| ----------- | ---------- | ---------------------------------------------------------------------------- |
| `ip`        | either     | the requesting IP address, in cleartext                                      |
| `account`   | `code`     | the account's row id — known by then, since a code is issued _to_ an account |
| `account`   | `password` | **SHA-256 of the normalised sign-in address the request claimed**            |

The third row is phase ruling F43, added in Task 5 when the limiter acquired its first
caller. At the password step the account is not yet known and half the requests name no
account at all, so a key that needed a row id would simply be absent on the miss path —
which is not merely a gap in coverage but an enumeration oracle, since the miss would then
do strictly less work than the hit on the exact branch `SECURITY.md` requires to be
indistinguishable. The code endpoint has no such problem and so keeps the row id: by the
time a code is being guessed, the account is settled.

It is hashed rather than written in cleartext because this table already holds raw IPs, and
an address beside one would put both halves of an identity in a single table (CLAUDE.md
§7). The hash is **not** a defence against someone holding the table who wants to know
whether one particular address was tried — an address is guessable, so hashing it does not
hide it. What it stops is the table being a _list of addresses_.

Never two of those values in one row: a row carries one subject. Two rows written by the
same request are still correlatable by their timestamps, which is why the claim made here
is about what a row contains rather than about unlinkability.

**Not in `DATA_MODEL.md`**, and recorded as the deviation `docs/deviations.md` §27: the
handoff requires the window and provides nowhere to keep it. Why it is a table rather than
a process-local `Map` — the app deploys to serverless invocations that do not share
memory — and why it is one row per attempt rather than a counter is
`docs/adr/0016-rate-limit-window-storage.md`.

`attemptedAt` is stamped with Postgres's `clock_timestamp()`, and decides **only** whether
an attempt is still inside the window. What orders one attempt against another is the
row's own `id`: a `date` field is `timestamp(3)`, so two attempts can share a millisecond,
and two attempts sharing a rank would let a limit of N admit N+1. Rows older than the
window are pruned for the key being touched, in the same statement that records the new
attempt, so the table stays bounded without a scheduler.

## Globals

- **`book`** — `title`, `subtitle`, `owner`, `coverCloth`, `yearsShown`, `contentsNote`,
  `flipDurationMs` (400–1600), `galleryThumbPx` (140–300), `showDecorations`,
  `showRibbon`, `showCounter`, `journeyOrderMode` (`manual` | `newest` | `oldest`).
- **`about`** — `portrait` (upload), `portraitCaption`, `paragraphs` (array of textarea),
  `kit` (array of text), `replyTo`.
- **`site`** — `name`, `domain`, `description`, `replyTo`, `analyticsId`,
  `allowDownloads`, `allowShare`, `indexGalleries`, `passwordProtect`, `touchPageTurn`.

## Branded identifiers

`JourneyId`, `PageId`, `MediaId`, `SlotKey` are branded string types (design spec §5.3) —
a `JourneyId` cannot be passed where a `PageId` belongs. This is enforced in the type
system, in `packages/domain`, not just by convention.

## Derived, never stored

Per design spec §5.1 and `DATA_MODEL.md`'s "Derived, not stored" section — these are
computed on read, never persisted as columns, because a stored derived value can drift
from the data it was derived from:

- Page index and the `03 / 33` counter — from the ordered page list.
- Contents entries and their page numbers — `2 + journeyIndex × pageCount + 1`.
- Bookmark tab spans — a journey's tab is active across all of its pages.
- "{n} photographs and {n} clips in the gallery" — count of `media` by `kind`. Computed
  in `apps/web/lib/readBookBundle.ts` (`galleryCountsByJourney`) from one two-column
  census query covering the whole book, and carried onto every page of a journey as
  `BookPage.gallery`; the Notes page's footer (`SCREENS.md` §1.3) is its first reader.
  A media row whose `kind` the pipeline has not set yet counts as a photograph — the
  line names two categories, and an unclassified still is not a third.
- "{n} of {n} in the book" — count of `media` where `inBook`.
- Storage quota — sum of `filesize` grouped by `kind`.

## Structural rules carried into the type system

From design spec §5.1:

1. **Everything is keyed by journey id.** Five separate defects in the prototype came
   from per-journey state held in one global value. Client caches are `Record<JourneyId,
T>`, never a bare value.
2. **Rows are addressed by id, never by array position.** Sorting a gallery by capture
   time reorders it; a positional index desyncs the selected-frame panel from the
   highlighted tile.
3. **Derived values are computed, never stored** (see above).
4. **Soft delete exists from the first migration.** `deletedAt` on journeys and
   `versions: { drafts: true }` are painful to retrofit onto a collection with existing
   rows.
5. **Free-text `dates` always travels with sortable `startsOn`.** Gallery sort derives
   from `media.capturedAt`, not from the free-text field.

## Migration history

| Migration                              | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20260831_154311_initial`              | Creates all six collections and three globals above, with `deletedAt` (indexed) on `journeys` and `versions: { drafts: true }` on `journeys` and `pages` from the start — both are painful to retrofit onto a collection with existing rows, per the note above. `pages` deliberately has drafts but no `deleted_at`: a page is not independently trashed, it is deleted with the journey that owns it, which matches `DATA_MODEL.md`'s own schema and rule 4 above. Verified reversible by `collections.integration.test.ts`, which rolls **every** migration back to zero — so this file's own `down()` runs regardless of how the batches were applied — then re-applies them and asserts a journey's fields, highlights and tally round-trip through the rebuilt schema. Rows do not survive a `DROP TABLE`; what is restored is the schema's ability to hold them. See `docs/testing.md` §9.                                                                                                                                                                                                                 |
| `20260831_161951_add_jobs`             | Creates the `jobs` table (Task 9) backing the Postgres `QueuePort` adapter, and the `payload_locked_documents_rels.jobs_id` column/FK Payload adds for its own admin document-locking feature. Verified reversible by the same test; see the statement-order note below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `20260905_202028_add_otp_session_hash` | Adds `otp_challenges.session_hash` (`varchar NOT NULL`) and its btree index — the session binding `SECURITY.md` requires and `DATA_MODEL.md` omits (`docs/deviations.md` §25, `docs/adr/0015-otp-challenge-hashing.md`). Its `up()` carries one hand-added statement, `DELETE FROM "otp_challenges"`, before the `ALTER`: a `NOT NULL` column with no default cannot be added to a table that has rows, and every pre-existing challenge is one the new rule can never honour anyway — it has no session binding, so it could not be redeemed. Challenges are five-minute ephemera, so nothing of value is discarded and no default has to be invented. Verified reversible by its own case in `collections.integration.test.ts`, separate from the journey case above because the two fail differently: the journey case proves tables come back and would still pass with this column silently missing. The `down()` drops the index before the column, so a re-apply's `CREATE INDEX` cannot collide with a leftover.                                                                                          |
| `20260905_230601_add_sign_in_attempts` | Creates the `sign_in_attempts` table and its two enum types (Phase 2 Task 4) backing the sliding window `SECURITY.md` requires per account and per IP (`docs/deviations.md` §27, `docs/adr/0016-rate-limit-window-storage.md`), plus the compound index over `(dimension, endpoint, subject, attempted_at)` and the `payload_locked_documents_rels.sign_in_attempts_id` column/FK Payload adds for its own document-locking feature. Its `down()` carries the same hand-fixed statement order as `20260831_161951_add_jobs`, for the same reason — see the note beneath this table. Verified reversible by its own case in `collections.integration.test.ts`, which asserts on **all five** artefacts the migration creates rather than on the table alone — a `down()` that dropped the table and left the enum types behind would satisfy a table-only assertion and then fail its own re-apply with "type already exists".                                                                                                                                                                                     |
| `20260906_004937_add_session_expiry`   | Adds `sessions.expires_at` (`timestamp(3) with time zone NOT NULL`) and the btree index on `sessions.token_hash` an authentication reads every admin request by (Phase 2 Task 6, `docs/deviations.md` §30). Its `up()` is hand-split into add-nullable, backfill, `SET NOT NULL`: as generated it was a single `ADD COLUMN ... NOT NULL` with no default, which succeeds only against a table with no rows — true of every database today, and false the moment one session exists, at which point `down()`-then-`up()` would fail on the survivors. The backfill is `created_at`, so a row that predates the column is expired the instant the column exists: a session whose lifetime was never recorded is a session whose lifetime is unknown, and inventing a generous one would grant an expiry nobody ever did. Verified reversible by its own case in `collections.integration.test.ts`, which asserts on the column **and** the index and on the `sessions` table surviving — this migration adds to a table it did not create, so "the table is gone" would say nothing about whether its `down()` ran. |
| `20260910_171154_add_media_state`      | Adds `media.state` (`enum_media_state`, nullable, defaulting to `'processing'`) and `media.failure_reason` (`varchar`) — the pipeline state design spec §9.2 requires and `DATA_MODEL.md` omits (`docs/deviations.md` §48). Needed neither of the two SQL hand-fixes below, checked rather than assumed: the generator emitted no `NOT NULL`, so there is nothing to split into add-nullable/backfill/`SET NOT NULL`, and its `down()` already drops the two columns before `enum_media_state` — the order the re-apply needs, since a `down()` that dropped the columns and left the type behind would fail its own `up()` with "type already exists". Deliberately no backfill: a row that predates the column reads `state` NULL rather than being asserted into a state nothing measured. Verified reversible by its own case in `collections.integration.test.ts`, which asserts on the two columns, the enum type and the survival of `media` and its rows — this migration adds to a table it did not create.                                                                                              |

Generated with `npm run db:migrate:create -w apps/web -- <name>`, applied with
`npm run db:migrate -w apps/web`. Payload's generator emits a plain (non-type-only) import
of `MigrateUpArgs`/`MigrateDownArgs`, which are interfaces with no runtime export; Node's
built-in TypeScript type-stripping does not elide this on its own (unlike esbuild/tsx), so
the generated file fails to load until hand-split into a `import type { ... }` line. This
is a one-line, mechanical fix to the generated file's import statement — the generated SQL
itself is untouched, and it is expected to recur for every future migration generated
against this Payload/Node combination until upstream fixes the generator template.

`20260831_161951_add_jobs`'s generated `down()` needed a second, different hand-fix: as
generated, it ran `DROP TABLE "jobs" CASCADE` before an explicit
`ALTER TABLE ... DROP CONSTRAINT "payload_locked_documents_rels_jobs_fk"` — but the
`CASCADE` had already dropped that same foreign key as a side effect, so the explicit
drop then failed with "constraint ... does not exist". Reordered to drop the constraint
(and its dependent index and column) before dropping the table it references, so the fix
does not depend on `CASCADE`'s side-effect ordering. The generated SQL statements
themselves are otherwise untouched. That fix is covered: restoring the generator's
original order makes the reversibility test fail with the same
"constraint ... does not exist" error it was written to prevent (`docs/testing.md` §9).

`postgresAdapter` is configured with `push: false`, so this migration — not Payload's
dev-mode schema "push" — is the only thing that ever changes the schema. `migrationDir` is
resolved from `payload.config.ts`'s own file location rather than `process.cwd()`, since
the Payload CLI runs from `apps/web` while Vitest's integration project runs from the
repository root.

## Seed data

`npm run db:seed -w apps/web` (`apps/web/scripts/run-seed.ts`, calling `seed()` from
`apps/web/scripts/seed.ts`) creates the ten journeys the prototype ships with and their
thirty pages (Notes, Frames I, Frames II per journey), against this schema, without a
migration. It upserts by a natural key (a journey's `slug`; a page's `journey` +
`title`; a media item's `journey` + the placeholder label stashed in `alt`), so running
it twice leaves the same ten journeys and thirty pages. Every journey's name, place,
dates, weather, mood, sign-off, highlights, note and tally are transcribed verbatim from
`handoff/design_handoff_travel_diary/Travel Diary.dc.html`'s `journeys`/`MORE` arrays
(`apps/web/scripts/seed-data.ts`); every photo slot's placeholder is a real `media`
upload rasterised from `stripedPlaceholder`'s SVG (Task 10).

Cover, Contents and About are **not** `pages` rows. Cover's fields live on the `book`
global and About's on the `about` global — both are seeded with verbatim prototype
content (`bookGlobalSeed`/`aboutGlobalSeed` in `seed-data.ts`) via `updateGlobal`, the
same way the journeys are seeded via `create`/`update`. Contents needs no storage at
all — `DATA_MODEL.md` lists it under "Derived, not stored", generated from the ordered
journey list. The handoff's "33 pages" names the full reading sequence (Cover + Contents

- thirty journey pages + About), which Phase 1's `bookBundle` assembles from these thirty
  rows and the two globals; it was never a `pages` row count. An earlier version of the
  seed got this wrong (three rows attached to the first journey as a workaround) — see
  `docs/deviations.md` §5, now a correction record rather than an active deviation.

**Both globals reach the diary beside the reading sequence, not inside it.**
`BookBundle` carries `chrome` (the `book` global, Phase 1 Task 9) and `about` (the
`about` global, Task 11) as their own fields. Neither hangs off the `{ kind: 'cover' }`
or `{ kind: 'about' }` page, because both are read once per request from a global
rather than derived from a row — a bundle whose consumers had to find them by walking
the reading sequence would make every page component's props depend on where in the
book it happened to be printed.
