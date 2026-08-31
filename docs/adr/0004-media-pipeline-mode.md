# 0004 — Media pipeline mode: defer the transcode worker behind one flag

## Context

The design spec (§2 stack table, §9.2) and `docs/adr/0001-hosting-and-cost.md`,
`docs/adr/0003-derivative-generation.md` all assumed a dedicated Fly.io worker running
`sharp` + `ffmpeg` from the start, because video transcoding (`ffmpeg`) does not fit a
serverless function's runtime limits.

**User decision, made after those documents were written:** no video clips for now.
The design spec's own non-goals (§1.2) already say clips are "silent ~20-second loops,"
not a streaming feature — cutting them for the initial launch drops no committed
scope, and removes the one service in the stack (Fly.io) that bills regardless of
usage (`docs/adr/0001-hosting-and-cost.md`'s revised consequences). The requirement
attached to that decision: enabling video later must be **one configuration change**,
not a re-implementation.

That requirement is cheap to satisfy because of a fact worth stating precisely, since
it is the reason this ADR is a config decision and not a schema decision:
`apps/web/collections/media.ts` already declares full clip support, transcribed
verbatim from `DATA_MODEL.md` by Task 6 before this deferral was ever decided —

- `kind`: `'still' | 'clip'`
- `posterAt` (clip poster timestamp), `posterImage` (extracted frame)
- `durationSec`
- `mimeTypes` already includes `video/mp4` and `video/quicktime`

Nothing about the collection schema assumed video would ship on day one or needs to
change to defer it. The gap this ADR closes is entirely about *where processing runs
and what's wired to it*, not the data model.

## Options considered

1. **Build the Fly.io worker now anyway**, even though no clip will be uploaded at
   launch. Rejected: infrastructure for a feature not shipping, paid for and operated
   before it does anything — the opposite of `CLAUDE.md` §4's YAGNI rule, and the exact
   cost this deferral exists to avoid.
2. **Strip video support out of the schema** until Phase 3 actually needs it, adding it
   back with a migration when clips are built. Rejected: the schema already carries
   `kind`, `posterAt`, `posterImage`, `durationSec` and the video `mimeTypes` faithfully
   from `DATA_MODEL.md` (see above) — removing them now only to re-add them later is a
   migration for no reason, and would make "enable video" a schema change again, which
   directly contradicts the one-config-change requirement this ADR exists to satisfy.
3. **A `MEDIA_PIPELINE` mode flag switching a `MediaProcessor` port between an `inline`
   and a `worker` adapter, schema untouched** — chosen. Keeps the already-correct
   schema, defers only the infrastructure and the ingest/admin behavior that depend on
   it, and reuses the Ports & Adapters pattern already proven for `storage`, `mailer`
   and `queue` (`CLAUDE.md` §3.3).

## Decision

- **`MEDIA_PIPELINE`** — a new environment variable, `'inline' | 'worker'`, validated as
  a Zod enum by the existing `parseEnv` in `apps/web/lib/env.ts` (`envSchema`), the same
  trust-boundary validation every other environment variable already gets. Defaults to
  `'inline'`.
- **A `MediaProcessor` port**, the same Ports & Adapters shape as `storage`/`mailer`/
  `queue` (design spec §6; `docs/architecture.md` §2), with two adapters:
  - `inline` — runs the still pipeline (magic-byte sniff, SVG rejection, EXIF strip,
    `sharp` re-encode, all five derivative tiers, perceptual hash) in-process on Vercel,
    as part of handling the upload request. No worker, no queue hop, for stills.
  - `worker` — enqueues onto the Postgres `jobs` table (the existing `QueuePort`,
    already built and contract-tested in Phase 0) for a Fly.io process running the same
    still pipeline plus `ffmpeg`/`ffprobe` transcoding and poster extraction for clips.
- **The flag switches three things together**, deliberately, because that's what makes
  it *one* configuration change rather than a checklist a future deploy can partially
  do:
  1. which `MediaProcessor` adapter is bound at runtime;
  2. whether `video/mp4` / `video/quicktime` are accepted at ingest (rejected with a
     clear error under `inline`, even though the schema's `mimeTypes` already lists
     them — the port enforces this, not a schema change);
  3. whether the admin shows clip-specific affordances (upload picker accepting video,
     poster-frame field, duration display) — hidden under `inline`, shown under
     `worker`.
- **Non-negotiable: both adapters run the same contract suite in CI from day one**,
  exactly like `storage`/`mailer`/`queue` today, even though only `inline` ever deploys
  before video is turned back on. A deferred code path with no test rots invisibly, and
  "flip one config" silently becomes "flip one config, then debug for three days." This
  project has already been bitten twice by that species of defect: Payload's Postgres
  adapter auto-"pushes" the schema to match the config in dev mode by default, which
  made the first migration test run pass all its assertions against a database Push had
  already altered — before the migration itself had ever run against it, which would
  have made the migration decorative rather than the thing that actually built the
  schema (fixed by setting `push: false`, dropping the push-created schema, and only
  then generating and applying the real migration — see `docs/data-model.md`'s note on
  `push: false`, and Task 5/6's own report for the incident as first found). And a
  concurrency test
  (`postgres-queue.integration.test.ts`'s `claim()` locking case, see `docs/testing.md`
  §3) kept passing after an earlier version of the same test had its guarding mechanism
  deleted from the adapter — the test asserted that Postgres implements `SKIP LOCKED`
  (never in question), not that the adapter used it. A `worker` adapter with no contract
  coverage is the same shape of risk: it would look finished right up until the day it
  is actually switched on.
- **Nothing in this ADR is built now.** The port, both adapters, the flag, and the
  contract suite are Phase 3 work (design spec §4, §9), because that is where the media
  pipeline itself is built. This ADR records the shape that work takes when it happens,
  so Phase 3 doesn't have to re-derive the decision to defer video or re-litigate
  whether the schema needs to change to do it (it does not — see Context above).

## Consequences

- **No code changes from this decision.** `apps/web/collections/media.ts`'s schema is
  unchanged and already correct for this plan. Everything else described above is
  scoped to Phase 3.
- **Enabling video later is:** provision a Fly.io app, deploy the worker container to
  it, and set `MEDIA_PIPELINE=worker`. No schema migration. No ingest-code change beyond
  what the port already handles by switching adapters. No admin-code change beyond what
  the flag already gates. This is the concrete shape of "one configuration change."
- **Cost:** removes Fly.io — the only service in the original stack that definitely
  billed regardless of usage — from the operating cost until video is enabled. Revised
  in `docs/adr/0001-hosting-and-cost.md`'s consequences: a genuine $0/month steady state
  becomes viable for the app and its supporting services (Vercel Hobby, Neon, Cloudflare
  R2, Resend), plus a domain (or $0 on `*.vercel.app`). Re-adding the worker later
  reintroduces Fly.io's cost, to be re-verified against its pricing page at that time,
  per ADR 0001's existing re-verification caveat.
- **Test infrastructure risk to resolve in Phase 3, not here:** the `worker` adapter's
  contract suite needs a way to exercise `ffmpeg`-dependent behavior in CI without an
  actual Fly.io deployment — most likely a local `ffmpeg` binary or container, the same
  shape of problem the `queue` port already solved by needing a real test Postgres
  rather than a mock (`CLAUDE.md` §2.3, "no mocking what we own"). This ADR names the
  requirement (both adapters tested from day one); it does not resolve the mechanics of
  testing `worker`, which is Phase 3's problem to solve when the port is actually built.
- Logged as a recorded decision (not a `HANDOFF-DEVIATION`, since nothing in the handoff
  is being departed from — the handoff never mandated a worker on day one, only that
  video transcoding doesn't fit serverless *when it exists*) in `docs/deviations.md` and
  in the design spec §4/§9/§13.
