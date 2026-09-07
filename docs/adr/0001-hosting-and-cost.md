# 0001 — Hosting and cost

## Context

The application needs: a place to run the Next.js/Payload app, a Postgres database, object
storage for ~40GB of photography and video, a place to run the media-transcoding worker
(`sharp` + `ffmpeg`, which does not fit a serverless function), a transactional mail
provider for OTP codes, and an offsite backup destination independent of the primary
database and storage providers.

The handoff (`handoff/design_handoff_travel_diary/README.md`) recommends a stack and also
names alternatives it considered and rejected:

- **Recommended:** Payload CMS 3 inside Next.js on Postgres; S3 or Cloudflare R2 for
  media with a transform layer for derivatives; ffmpeg on upload; Auth.js for sign-in.
- **Alternative offered:** Supabase (Postgres, auth, storage, image transforms), hand-
  rolling drafts/versions as a `status` column plus a `revisions` table.
- **Explicitly to avoid:** a separate Express/Nest service ("doubles the deployment for
  a single-author site"), Firebase ("the content is relational — the Contents page and
  bookmark ordering want joins"), a client-only SPA ("destroys the deep links' SEO
  value").

This is a single-author personal blog. The design spec (§13) sets the goal explicitly:
keep the running cost proportional to that scale.

## Options considered

1. **Vercel (app) + Neon (Postgres) + Cloudflare R2 (media) + Fly.io (worker,
   auto-stopping) + Resend (mail) + Backblaze B2 (offsite backup)** — chosen.
2. **Supabase**, replacing Postgres, auth and storage with one platform. Rejected:
   Payload's draft/publish state, version history with restore, and focal-point/image-
   size generation are the reason Payload was chosen at all (spec §2); hand-rolling
   those as a `status` column and a `revisions` table forgoes features the design's
   Publish and Journey editor screens depend on.
3. **A separate Express/Nest API service** fronting the same providers. Rejected per the
   handoff: doubles the deployment surface for one author.
4. **Firebase** for the datastore. Rejected per the handoff: the Contents page and
   bookmark ordering are relational queries; a document store fights that.
5. **A client-only SPA** with hash routing (matching the prototype's `#/p/<n>`). Rejected:
   the design spec (§8) requires real, indexable paths (`/p/<n>`, `/gallery/<slug>`) so
   deep links keep their SEO value; a client-only SPA can't serve those statically.

## Decision

- **Vercel** hosts the Next.js app (App Router, static + ISR for the diary, server
  actions for the admin).
- **Neon** hosts Postgres — content is relational (journeys, pages, ordering, bookmarks).
- **Cloudflare R2** holds all media, on its own custom domain, never behind a Vercel
  route or `next/image`.
- **Fly.io** would run the transcode worker (`ffmpeg`, for video) in a container that
  auto-stops between jobs — transcoding does not fit a serverless function's runtime
  limits. **Deferred**, per a later user decision recorded in
  `docs/adr/0004-media-pipeline-mode.md`: no video clips for now, so nothing in this
  stack needs a worker at launch. `sharp` still generates all five still-image
  derivative tiers (`docs/adr/0003-derivative-generation.md`), but in-process on
  Vercel rather than inside a separate worker container. Enabling video later
  provisions Fly.io and flips one environment variable — see ADR 0004 for the
  mechanism and the revised consequences below for the cost this defers.
- **Resend** sends OTP mail — a handful of messages per month, no marketing-mail
  features needed.
- **Backblaze B2**, a _different_ provider from both Neon and R2, receives offsite
  backups of the database dump and the media bucket.

All of storage, mail and the transcode queue sit behind ports (spec §6), so the provider
behind each can change without touching application code — see `docs/architecture.md`.

## Consequences

- **Figures are August 2026 list prices** for these providers' published free and paid
  tiers, as understood while writing the design spec. They **must be re-verified against
  each provider's current pricing page before committing budget** — cloud pricing changes
  without notice, and a personal blog's budget has no margin to absorb a surprise.
- **The one cost trap:** serving media through Next.js API routes or `next/image` routes
  ~40GB of photography through Vercel's metered bandwidth, which is priced to punish
  exactly that pattern. The fix — serve media from the R2 custom domain, never through
  the app — is _also_ what `SECURITY.md` independently requires (media must be served
  from a separate origin so a stored-content bypass can't script against the admin, and
  so downloads go through a signed-URL handler rather than a bucket URL). Security and
  cost pull toward the same architecture; there is no tension to trade off.
- **Expected steady state, revised:** with the Fly.io worker deferred (ADR 0004), the
  app and its supporting services — Vercel Hobby, Neon, Cloudflare R2, Resend — all sit
  inside their free tiers at this project's single-author scale, for a **$0/month**
  steady state, plus ~$12/year for a domain (or $0 on a `*.vercel.app` subdomain).
  Fly.io was the one service in the original stack that definitely billed regardless of
  usage; removing it is what makes $0 viable where the original ≈$2–3/month estimate
  below it was not. That original estimate is superseded for these four providers, not
  reconciled line-by-line against it — this ADR does not have a breakdown of what made
  up the original $2–3 figure precise enough to say which part of it moved to zero
  beyond Fly.io. Backblaze B2's offsite-backup cost is **not** folded into the $0 figure
  and is unaffected by this change — see the storage-scaling note below, which still
  applies to it.
- **Original figures, for reference:** ≈$2–3/month while every provider's usage stayed
  inside its free tier; ≈$45/month once paid plans were needed (e.g. Neon's paid
  compute, Fly's always-warm worker, R2 past its free allowance). That $45 figure was a
  bundled estimate across multiple providers reaching paid tiers together, not an
  isolated Fly.io cost, so it cannot be used to state precisely what re-adding Fly.io
  alone would cost at paid-tier scale — re-verify Fly.io's current pricing when
  provisioning it, per this ADR's own re-verification caveat above.
- **Adding the worker back** (per ADR 0004) means provisioning a Fly.io app, deploying
  the transcode worker container to it, and flipping `MEDIA_PIPELINE=worker`. No schema
  migration and no other provider change is needed — see ADR 0004's consequences.
  Concretely, that adds back the _only_ service in this stack that bills by default.
  Auto-stopping (scale-to-zero) is the right shape for it regardless of price, not just
  a cost optimization: a single author's uploads are bursty, not continuous, so the
  machine is expected to spend most of its time stopped rather than idling on standby
  waiting for the next upload. What it costs at that point is deliberately not restated
  here — take the figure from Fly.io's own pricing page at the time this decision is
  revisited, not from this document, per the re-verification caveat above.
- **Storage is the only variable that scales meaningfully.** Traffic barely moves the
  bill, because the diary is statically rendered and R2 has no egress fee. Photography
  volume does: budget roughly **$0.60/month per additional 40GB** of media stored.
- Because every external service sits behind a port and adapter (storage, mailer, queue),
  a pricing change or an outage at any one provider is a swap, not a rewrite — this is
  the mitigation the design spec's risk table (§14) records for "cloud pricing changes."
  The same seam is what makes the media-pipeline mode switch (ADR 0004) a config change
  rather than a rewrite.
