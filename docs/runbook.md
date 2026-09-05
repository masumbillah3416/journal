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
  provisioned. No video clips at launch (`docs/adr/0004-media-pipeline-mode.md`); the
  media pipeline runs entirely in-process on Vercel until `MEDIA_PIPELINE=worker` is
  set and this worker is actually deployed alongside it.
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

## Rotate secrets

1. Generate the new credential at the provider (Neon connection string, R2 access key,
   Resend API key, Backblaze application key).
2. Set it in the platform's secret store (Vercel project settings for app-facing secrets;
   Fly `fly secrets set` for the worker).
3. Redeploy the app and the worker so the new value is picked up — neither reads secrets
   at request time from anywhere but process environment.
4. Revoke the old credential at the provider once the redeploy is confirmed healthy.
5. For the media bucket specifically: use a credential scoped to that bucket alone and,
   where the provider supports it, write-only from the upload path — a compromised
   upload credential should not be able to read or delete existing media
   (`SECURITY.md`, "Dependencies and secrets").

## Restore drill

`SECURITY.md` is explicit that this is the section of the whole security posture most
likely to matter: *"Not an attacker — losing 40GB of photographs... Test a restore. An
untested backup is a hypothesis."* This section exists so that claim is never true here.

**Phase:** the procedure below is written now, in Phase 0, so it exists before there is
anything real to lose. A *demonstrated* drill — actually running it and recording a
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
   `journeys`, `pages`, `media`, `users`, `otpChallenges`, `signInAttempts` and
   `sessions` tables are present, row counts are plausible against the last known-good count, and a spot-check
   query against a specific journey returns the expected pages and ordering.
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
