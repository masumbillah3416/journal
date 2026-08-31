# Runbook

Local setup, migrations, seeding, deploy, rollback, secret rotation, and — because
`SECURITY.md` is explicit that an untested backup is a hypothesis — a restore drill.
Commands are the target command surface from `CLAUDE.md` §11; those not yet implemented
are marked **(not yet implemented)** and the command that will exist is given so this
document does not need rewriting when it lands, per `CLAUDE.md` §1.3 (a stale document is
worse than none; the alternative here — inventing behaviour for a command that doesn't
exist — would be worse still).

## Local setup

```bash
git clone <repo-url>
cd travel-diary
npm install
cp .env.example .env   # fill in local values once it exists (not yet implemented)
npm run verify
```

`npm install` also installs the Husky pre-commit hook (`npm run prepare`), which runs
`npm run verify` before every commit — see `.husky/`.

Prerequisites: Node.js 22+, npm 10+, Docker (for local Postgres, used by integration and
end-to-end tests once they exist).

## Migrations

**(not yet implemented)** — `npm run db:migrate` is documented as target command surface
in `CLAUDE.md` §11; it lands with the first migration in a later Phase 0 task ("all
collections and the first migration," design spec §4). Once it exists:

- Every migration is reversible and tested in both directions (`CLAUDE.md` §7,
  `docs/testing.md` §9 — the migration test suite).
- Soft delete (`deletedAt` on journeys, `versions: { drafts: true }`) ships in the first
  migration, not retrofitted — both are painful to add after journeys already have rows
  (`DATA_MODEL.md`, "Four notes worth heeding").
- Run locally against the Docker Postgres instance before it is ever run against Neon.

## Seeding

**(not yet implemented)** — `npm run db:seed` is target command surface. Design spec
Phase 0 calls for seeding "the prototype's 10 journeys / 33 pages with placeholder
imagery" — the same placeholder SVG data-URIs the handoff prototypes use, not real
photographs, so seeding never depends on the media pipeline (Phase 3) being built yet.

## Deploy

Per `docs/adr/0001-hosting-and-cost.md`:

- **App:** Vercel, from the `main` branch. Next.js static + ISR for the diary, server
  actions for the admin.
- **Database:** Neon (Postgres), one production branch.
- **Media:** Cloudflare R2, on its own custom domain — never proxied through a Vercel
  route or `next/image` (the cost trap and the security requirement are the same
  architecture; see the ADR).
- **Transcoder worker:** Fly.io, auto-stopping between jobs.
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
  so a bad migration can be rolled back with `db:migrate down` **(not yet implemented)**
  rather than restored from backup — restore is the last resort, not the first response.
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
   `journeys`, `pages`, `media`, `users`, `otpChallenges` and `sessions` tables are
   present, row counts are plausible against the last known-good count, and a spot-check
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
