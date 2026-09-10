# Runbook

Local setup, migrations, seeding, deploy, rollback, secret rotation, and — because
`SECURITY.md` is explicit that an untested backup is a hypothesis — a restore drill.
Every command in this document exists and runs today. Read it mid-incident and trust it:
nothing here is aspirational.

## Local setup

```bash
git clone <repo-url>
cd travel-diary
npm install
cp .env.example .env   # then fill in local values
npm run verify
```

`npm install` also installs the Husky pre-commit hook (`npm run prepare`), which runs
`npm run verify` before every commit — see `.husky/`.

Prerequisites: Node.js 22+, npm 10+, Docker (for local Postgres, used by the integration
and end-to-end suites).

## Migrations

`npm run db:migrate` applies every pending migration; `npm run db:migrate:down` rolls
the most recent batch back. Both run from the repository root and pass through to
`apps/web`, where the Payload CLI and `apps/web/migrations/` live.

- Every migration is reversible and tested in both directions (`CLAUDE.md` §7,
  `docs/testing.md` §9 — the migration test suite), by a test that rolls the schema back
  to zero and re-applies it, then asserts a journey's own field values round-trip
  through it.
- Soft delete (`deletedAt` on journeys, `versions: { drafts: true }`) shipped in the
  first migration, not retrofitted — both are painful to add after journeys already have
  rows (`DATA_MODEL.md`, "Four notes worth heeding").
- Run locally against the Docker Postgres instance before it is ever run against Neon.

## Seeding

`npm run db:seed` seeds the prototype's ten journeys and their thirty pages
(three per journey) with placeholder imagery — a real `media` upload per photo slot,
rasterised from the same striped-SVG placeholder the handoff prototypes use, not real
photographs, so seeding never depends on the media pipeline (Phase 3) being built yet.
It also writes the `book` and `about` globals' verbatim prototype content. It is
idempotent (upserts by slug/title/label), so it is safe to run again after an admin edit
— re-running restores the seeded fields on the ten known journeys without creating
duplicates, and leaves anything else (new journeys, new pages) untouched. It writes to
whatever `DATABASE_URL` names — the real dev/production database, never the isolated
`diary_test` database the integration test suite uses (see `docs/testing.md`).

## Deploy

Per `docs/adr/0001-hosting-and-cost.md`:

- **App:** Vercel, from the `main` branch. Next.js static + ISR for the diary, server
  actions for the admin.
- **Database:** Neon (Postgres), one production branch.
- **Media:** Cloudflare R2, on its own custom domain — never proxied through a Vercel
  route or `next/image` (the cost trap and the security requirement are the same
  architecture; see the ADR).
- **Transcoder worker:** Fly.io, auto-stopping between jobs — **deferred**, not
  provisioned. No video clips at launch (`docs/adr/0004-media-pipeline-mode.md`).
  **The pipeline exists but nothing calls it yet.** Phase 3 Task 6 built the
  `MediaProcessor` port, both adapters, the shared still pipeline and the one contract
  suite they both pass (`apps/web/lib/ports/mediaProcessor.ts`,
  `apps/web/lib/adapters/inline-media-processor.ts`,
  `apps/web/lib/adapters/worker-media-processor.ts`,
  `apps/web/lib/media/stillPipeline.ts`), and `apps/web/lib/media/services.ts` is the one
  place `MEDIA_PIPELINE` chooses between them. **No route and no Payload hook calls
  `mediaProcessor()`**, so setting the flag today changes which adapter a caller WOULD be
  handed and nothing more: an uploaded still gets whatever Payload's own `sharp` handling
  gives it and no derivative tier of ours. The receiver is Phase 3 Tasks 7-9.
  **When `MEDIA_PIPELINE=worker` is eventually switched on, the worker's container must
  have `ffmpeg` and `ffprobe` on its `PATH`** - `apps/web/lib/media/services.ts` passes
  those two names to `createFfmpegToolchain`, and a container without them turns every
  clip upload into an `'unreadable'` refusal rather than an error naming the cause.
  This bullet described the `inline` mode as the thing running today, in a document whose
  own opening promises that nothing in it is aspirational (Phase 2's final review,
  finding 30).
- **Mail:** Resend, for OTP only.
- **Offsite backup:** Backblaze B2 — a provider independent of both Neon and R2, so a
  single provider's outage or account compromise cannot take out the primary data and
  its backup together.

All provider credentials live in each platform's own secret store, never in the repo —
`.env`, `.env.*` are gitignored (`.env.example` is the only tracked exception).

## Rollback

- **App:** redeploy the previous Vercel deployment (Vercel keeps prior deployments
  addressable; promote the last-known-good one).
- **Database:** migrations are required to run reversibly (`CLAUDE.md` §7) specifically
  so a bad migration can be rolled back with `npm run db:migrate:down` rather than
  restored from backup — restore is the last resort, not the first response. Note what
  that command does: Payload rolls back the whole **most recent batch**, which is every
  migration the last `npm run db:migrate` applied together, not one file.
- **Content:** Payload's `versions: { drafts: true }` on `journeys` and `pages` backs the
  admin's Publish screen restore feature (design spec §4, Phase 4) — an author-facing
  rollback for content mistakes that never needs an engineer.

## The sign-in surface, and the one thing that stops it working for a real reader

Phase 2 Task 10 mounted the four `POST` endpoints the sign-in screens post to, so the
whole flow works end to end **on the server**. Two operational facts follow, and neither is
visible from the code that was added:

- **`ADMIN_ORIGIN` is now a required environment variable** and the process refuses to boot
  without it (`apps/web/lib/env.ts`). It is the origin every emailed password-reset link is
  built against, and it is deliberately not derived from the request's `Host` header — a
  link built from one is a link an attacker points at their own machine by setting that
  header while asking for somebody else's address. Set it to the origin the admin is
  actually served at, per environment. It is **not** `MEDIA_ORIGIN`: in production that is
  the media bucket's public origin, which serves no admin. `.env.example` carries it.
- **The only mailer adapter prints to the terminal.** `apps/web/lib/adapters/console-mailer.ts`
  is the sole implementation of `MailerPort`, so every one-time sign-in code and every reset
  link this surface issues goes to the server's own console and nowhere else. Nothing is
  delivered to the wrong person, but nothing is delivered to the right one either: **a
  reader cannot complete a sign-in on an account with the second factor on, and cannot
  complete a password reset at all, until a sending adapter lands.** Until then, an operator
  reading the process log is the delivery mechanism. `docs/security.md` records it beside
  the other things Task 10 did not close.
- **Payload's own admin at `/cms` can no longer be signed into, on purpose.** Its login
  form posts to `POST /api/users/login`, which Phase 2's final round sealed along with
  every other `users` endpoint that takes a credential or mints one — that endpoint minted
  a session on a password alone, with no code step and none of this phase's rate limiting
  (`docs/deviations.md` §42). **The failure is SILENT, and that is the part to know
  before you meet it:** `/cms` still loads and still renders its login screen, and
  submitting a correct password produces no message on the page at all — Payload's admin
  reports the sealed endpoint's `404` to the browser console and leaves the form as it
  was. A dead login with no explanation is the worst version of this trade, and it is not
  narrowed by making the seal production-only: the sealing tests would then exercise the
  UNSEALED path, which is the shape that hid the `lockTime` units bug for two phases.
  Payload's admin is also not ours to add a message to. So the answer is this paragraph,
  and the note in `docs/api.md`'s `/cms` row.

  **There is one way into the admin and it is `/admin/sign-in`.** Content is loaded with
  `npm run db:seed` until Phase 4's panel lands. If you find yourself wanting `/cms` back,
  the fix is to put the second factor in front of it, not to unseal the endpoint.

## The local media store grows without bound, and it fails a test rather than the disk

`apps/web/media` is where Payload writes uploads and their five derivative tiers:
`apps/web/collections/media.ts` sets `staticDir: MEDIA_DIR` and declares the five
`imageSizes`, and Payload's own upload handling does the writing. Nothing of ours does —
`apps/web/lib/adapters/local-storage.ts`'s `StoragePort` is a **read** path here, its
only non-test construction being `apps/web/lib/readGalleryDownload.ts`'s `mediaStore`,
which streams one file back for a gallery download. The directory is gitignored, so it
never appears in `git status`, and **nothing deletes a file from it**: `payload.delete`
removes the row, and the bytes stay. Every `npm run db:seed`, and every run of
`apps/web/scripts/seed.integration.test.ts`, writes a fresh set.

**The first symptom is not a full disk. It is a test that has always passed timing out,
with no commit in between** — the same confusing shape as the wall-clock guard suite
Phase 2 Task 11 found, and for the same reason: nothing in `git log` can explain it.
Measured on this machine at the close of Phase 2, same commit, same database:

| `apps/web/media`        | `seed > creates the ten journeys` | Result        |
| ----------------------- | --------------------------------- | ------------- |
| 102,503 files, 4.5 GB   | > 60,000ms                        | **timed out** |
| 0 files                 | 34,321ms                          | passed        |
| 1,314 files, 62 MB      | ~35,000ms                         | passed        |
| 2,487 files             | (seven cases, 51.3s)              | passed        |
| **2,919 files, 135 MB** | **29,193ms (seven cases, 45.8s)** | passed        |

Directory operations on a hundred thousand files are what costs the time, not the images.

**The last two rows are the point of this table working.** They were measured after the
row above them, by the third and fourth whole-branch reviews, and the store has grown from
1,314 to 2,919 files in the course of one review round — because every browser run, every
`npm run db:seed` and every integration run writes a fresh set. The first case's budget is
`SEED_TEST_TIMEOUT_MS`, 60,000ms, and 29,193ms of it is now spent; the whole seven-case
file takes 45.8s (measured on its own: `npx vitest run --config vitest.integration.config.ts
apps/web/scripts/seed.integration.test.ts`). The 2,487-file row is the third review's
measurement, quoted; the row below it is this round's, taken the same way. **Cleaning up is due now, not later.** It has not been done in this round
deliberately: doing it changes the numbers every gate in the final report was measured
against, and a housekeeping step taken in the middle of a verification pass is a variable
nobody asked for. It is the first thing to do after the merge, and the fix that makes it
unnecessary is Phase 3's, named below.

**To clean it up**, keep the files the databases actually reference and drop the rest.
Every referenced name is in `media`'s `filename` column and its five `sizes_*_filename`
columns, in **both** `diary` and `diary_test`:

```sh
for db in diary diary_test; do
  docker exec journal-postgres-1 psql -U diary -d $db -t -A -c \
    "SELECT filename FROM media WHERE filename IS NOT NULL
     UNION SELECT sizes_thumb_filename FROM media WHERE sizes_thumb_filename IS NOT NULL
     UNION SELECT sizes_tile_filename FROM media WHERE sizes_tile_filename IS NOT NULL
     UNION SELECT sizes_frame_filename FROM media WHERE sizes_frame_filename IS NOT NULL
     UNION SELECT sizes_hero_filename FROM media WHERE sizes_hero_filename IS NOT NULL
     UNION SELECT sizes_hero2x_filename FROM media WHERE sizes_hero2x_filename IS NOT NULL"
done | sort -u > referenced.txt
```

Move `apps/web/media` aside, recreate it, and copy back only the names in that list. Both
databases must be included: `diary` is what the browser suites read and `diary_test` is
what the integration suite reads, and they share one directory. Do **not** simply delete
the directory — the browser suites would then render a book of missing images and the
visual baselines would fail for a reason that has nothing to do with any change.

**The real fix is Phase 3's**, and it is named rather than implied: deletion has to be
attached where the writing happens, which today is the `media` collection — an
`afterDelete` hook that unlinks the file and its five tiers under `staticDir`. When
storage moves to R2 the same deletion moves into the adapter, which is what R2 will need
in order not to bill for orphans forever. Until then this is housekeeping, and the table above is what
tells you when it is due.

## Rotate secrets

1. Generate the new credential at the provider (Neon connection string, R2 access key,
   Resend API key, Backblaze application key).
2. Set it in the platform's secret store — Vercel project settings, which is the only
   secret store this application has. The transcoder worker is **deferred and not
   provisioned** (see **Deploy** above), so there is no `fly secrets set` to run and no
   second store to keep in step; when Phase 3 provisions it, it joins this step and the
   next.
3. Redeploy the app so the new value is picked up — it reads secrets from the process
   environment at start, never at request time.
4. Revoke the old credential at the provider once that redeploy is confirmed healthy.
   Nothing else has to be redeployed first, so this step is not blocked on a target that
   does not exist.
5. For the media bucket specifically: use a credential scoped to that bucket alone and,
   where the provider supports it, write-only from the upload path — a compromised
   upload credential should not be able to read or delete existing media
   (`SECURITY.md`, "Dependencies and secrets").

## Restore drill

`SECURITY.md` is explicit that this is the section of the whole security posture most
likely to matter: _"Not an attacker — losing 40GB of photographs... Test a restore. An
untested backup is a hypothesis."_ This section exists so that claim is never true here.

**Phase:** the procedure below is written now, in Phase 0, so it exists before there is
anything real to lose. A _demonstrated_ drill — actually running it and recording a
pass — is a **Phase 3 exit criterion**, per `docs/security.md`'s offsite-backup row:
Phase 3 (the media pipeline) is the first phase where both Postgres and the media bucket
hold real content, so it is the earliest point where running this drill proves anything
rather than restoring an empty database and an empty bucket.

**Backup shape** (per `docs/adr/0001-hosting-and-cost.md` and `SECURITY.md`):

- A scheduled Postgres dump, offsite, to Backblaze B2 — a provider independent of Neon.
- The R2 media bucket mirrored or versioned to Backblaze B2, independent of R2 itself.
- Versioned or write-once storage on the backup side, so a compromised key or a bad
  script against the primary bucket cannot also delete the history of it.

**The drill** (to be run on a schedule once backups exist, and after any change to the
backup mechanism itself):

1. Provision a scratch Postgres instance and a scratch bucket — never restore over the
   production database or bucket during a drill.
2. Restore the most recent Postgres dump into the scratch instance. Confirm: the
   `journeys`, `pages`, `media`, `users`, `otp_challenges`, `sign_in_attempts` and
   `sessions` tables are present — Payload snake-cases a collection slug into its table
   name, so the two multi-word collections are not spelled the way their slugs are — row
   counts are plausible against the last known-good count, and a spot-check query against
   a specific journey returns the expected pages and ordering.
3. Restore the most recent bucket backup into the scratch bucket. Confirm: file count
   and total size are plausible against the last known-good figures, and a spot-check of
   a handful of derivative tiers (`thumb`, `hero2x`) for the same journey checked above
   opens correctly.
4. Cross-check: every `media` row restored from Postgres that references a file should
   have that file present in the restored bucket, and vice versa — a backup that
   restores a database with dangling media references, or a bucket with orphaned files,
   is not a working restore even though each half "succeeded."
5. Record the drill's date, duration, and result (pass/fail with specifics) — this
   record is itself part of what makes the backup a demonstrated fact rather than a
   hypothesis.
6. Tear down the scratch instance and bucket.

**Also required, per `SECURITY.md`:** the Settings screen's "Export everything" feature
(design spec §4, Phase 4) is a genuine feature the author can run without engineering
involvement — it is not a nicety, and it is the fastest path to a personal copy of
everything if every other backup mechanism has somehow failed at once.
