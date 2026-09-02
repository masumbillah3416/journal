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
detection within a journey).

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
lockTime: 15 * 60 }` — see `docs/adr/0002-auth-mechanism.md` for why this, and not
Auth.js, is the credential store. Fields: `displayName` (printed on the cover),
`signoffDefault`, `timeZone`, `otpRequired` (checkbox, default `true` — **the only**
source of truth for whether the OTP step runs; the prototype's `localStorage` flag is
deleted, not moved, per `SECURITY.md`), `notifyOnPublish`, `notifyWeekly`.

### `otpChallenges`

`access: { read: () => false, create: () => false, update: () => false }` — server-only,
by design; nothing about the OTP flow is reachable from the Payload REST/GraphQL API a
client could call directly. Fields: `user` (relationship, indexed), `codeHash` (hashed,
never plaintext), `expiresAt` (now + 5 minutes), `attempts` (default 0), `consumedAt`,
`ip`.

### `sessions`

Backs the Account screen's "Where you are signed in" list. Without real rows here,
"Revoke" and "Sign out everywhere" are decorative. Fields: `user`, `tokenHash`, `device`,
`location`, `createdAt`, `lastSeenAt`, `revokedAt`.

### `jobs`

Backs the Postgres-backed `QueuePort` adapter (`apps/web/lib/adapters/postgres-queue.ts`,
Task 9): one row per background job, today only `kind: 'transcode'` after a clip upload.
`access: { read: () => false, create: () => false, update: () => false }` - server-only,
reached only through the adapter's Local API calls, matching `otpChallenges` and
`sessions`. `mediaId` is a plain text field, not a `relationship` to `media`: a foreign
key here would reject the branded ids the queue's own contract suite enqueues in
isolation from a real media row. Fields: `kind` (`transcode`), `mediaId` (text),
`status` (`queued` | `claimed` | `completed` | `failed`, indexed, defaults to `queued`),
`reason` (why a job failed, surfaced on the admin's Media screen in a later phase),
`claimedAt`.

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

| Migration | What it does |
|---|---|
| `20260831_154311_initial` | Creates all six collections and three globals above, with `deletedAt` (indexed) on `journeys` and `versions: { drafts: true }` on `journeys` and `pages` from the start — both are painful to retrofit onto a collection with existing rows, per the note above. `pages` deliberately has drafts but no `deleted_at`: a page is not independently trashed, it is deleted with the journey that owns it, which matches `DATA_MODEL.md`'s own schema and rule 4 above. Verified reversible by `collections.integration.test.ts`, which rolls **every** migration back to zero — so this file's own `down()` runs regardless of how the batches were applied — then re-applies them and asserts a journey's fields, highlights and tally round-trip through the rebuilt schema. Rows do not survive a `DROP TABLE`; what is restored is the schema's ability to hold them. See `docs/testing.md` §9. |
| `20260831_161951_add_jobs` | Creates the `jobs` table (Task 9) backing the Postgres `QueuePort` adapter, and the `payload_locked_documents_rels.jobs_id` column/FK Payload adds for its own admin document-locking feature. Verified reversible by the same test; see the statement-order note below. |

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
+ thirty journey pages + About), which Phase 1's `bookBundle` assembles from these thirty
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
