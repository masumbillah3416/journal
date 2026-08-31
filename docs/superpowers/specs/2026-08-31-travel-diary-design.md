# Travel Diary — Design Specification

**Date:** 2026-08-31
**Status:** Approved for planning
**Source of truth for requirements:** `handoff/design_handoff_travel_diary/`
**Source of truth for engineering standards:** `CLAUDE.md`

---

## 1 · Overview

A personal travel blog presented as a physical diary. Three surfaces:

- **Public diary** — a book turned page by page with a CSS-3D page flip. Each journey occupies a Notes page and two Frames spreads, plus global Cover, Contents and About pages. Every journey has a separate gallery outside the flip sequence holding up to ~100 assets.
- **Admin panel** — a bespoke ten-screen authoring environment. Not Payload's stock admin.
- **Sign-in** — password, an optional one-time-code step, and password reset.

Scale: verified in the design at 30 journeys / 93 pages / 33 bookmarks; seeded at 10 journeys / 33 pages. One author. ~40GB of media expected.

### 1.1 Goals

1. Recreate the handoff at high fidelity — final colours, typography, spacing, layout, interactions and copy.
2. Make the book genuinely resolution-independent and hold 60fps on the flip.
3. Give the author a complete authoring loop: upload, arrange, caption, draft, publish, restore.
4. Discharge every requirement in `SECURITY.md`, including the ones the prototype deliberately fakes.
5. Keep the running cost proportional to a personal blog.

### 1.2 Non-goals

- Multiple authors, visitor accounts, comments, payments.
- Duplicate-image detection beyond the notice, or storage enforcement beyond the quota bar.
- A streaming service for video. Clips are silent ~20-second loops.
- Porting the prototype's `<x-dc>` / `<sc-for>` / `{{ }}` template runtime. The prototypes are specifications, not code.

---

## 2 · Stack

| Layer | Choice | Rationale |
|---|---|---|
| App | Next.js 15 (App Router) with Payload CMS 3 in-process | Drafts, version history with restore, focal point and image-size generation each have dedicated screens in this design. Payload supplies all four. |
| Database | Postgres — Docker locally, Neon in production | Content is relational: the Contents page and bookmark ordering want joins. |
| Object storage | Cloudflare R2 — local disk adapter in development | Zero egress. 40GB of photography served from a metered origin is the single largest cost risk. |
| Media processing | Dedicated worker container (Fly.io), `sharp` + `ffmpeg` | Transcoding does not fit serverless. |
| Queue | Postgres job table | One author, bursty uploads. A managed queue is unearned complexity. |
| Mail | Resend — console adapter in development | OTP only; a handful of messages per month. |
| Auth | Payload's own `users` auth + a custom OTP layer | See §2.1. |

### 2.1 Deviation: Payload auth, not Auth.js

`README.md` recommends Auth.js. `DATA_MODEL.md` specifies `auth: { tokenExpiration, maxLoginAttempts, lockTime }` on the `users` collection, and `SECURITY.md` credits Payload's `maxLoginAttempts` / `lockTime` for the password step. These conflict.

**Decision:** Payload auth is the credential store and lockout mechanism; the OTP second factor, `sessions` and rate limiting are ours. Adding Auth.js would mean two session systems in one app for no gain.

Logged in `docs/deviations.md`. To be recorded as `docs/adr/0002-auth-mechanism.md`.

### 2.2 Deviation: no image transform vendor

`README.md` suggests Cloudflare Images or imgproxy for derivatives. The media worker already exists for `ffmpeg`; adding `sharp` generates all five derivative tiers at upload for the cost of ~10GB of extra R2 storage (≈$0.15/month) and removes a vendor.

Logged in `docs/deviations.md`. To be recorded as `docs/adr/0003-derivative-generation.md`.

### 2.3 Deviation: reduced-motion support

The handoff does not mention `prefers-reduced-motion`. The flip is decorative and the content must stay reachable, so reduced motion produces an instant page change with no rotation and no travelling shade.

Logged in `docs/deviations.md`.

---

## 3 · Repository structure

```
apps/
  web/                    Next 15 App Router + Payload 3 in-process
    app/(diary)/          public book, galleries          → static + ISR
    app/(admin)/admin/    the bespoke ten-screen panel    → authenticated
    app/(auth)/signin/    password, OTP, reset
    app/(payload)/cms/    Payload's stock admin — dev only, disabled in production
    lib/                  repositories, server actions, adapters
  transcoder/             Node + sharp + ffmpeg worker, queue consumer
packages/
  domain/                 pure logic — no I/O, no framework. 100% coverage.
  tokens/                 handoff colour/type/geometry as CSS variables + typed TS
  ui/                     shared primitives: pill, washi tape, postage stamp, hairline
docs/                     architecture, ADRs, data model, API, runbook, security, testing, QA sweeps
handoff/                  the specification of record
```

`packages/domain` holds everything testable without a browser or a database: the flip machine, book scaling, page numbering, contents pagination, bookmark spans, OTP challenge lifecycle, and the `BookBundle` mappers. It is the only package with a 100% coverage gate, and it must never import from `apps/`.

---

## 4 · Phase plan

Five phases. Each ends with a green suite, updated documentation, and a committed browser sweep where UI is involved.

### Phase 0 — Foundation

Monorepo and npm workspaces · Next 15 + Payload 3 + Postgres in Docker · design tokens from the handoff table · all collections and the first migration (including `deletedAt` and drafts) · storage / mailer / queue adapters with their shared contract suite · seed of the prototype's 10 journeys / 33 pages with placeholder imagery · the full test harness for all nine test types · `npm run verify` · pre-commit hooks · CI.

*Exit:* `npm run verify` passes, the seed loads, every documentation file in `CLAUDE.md` §1.2 exists with real content.

### Phase 1 — Public diary

`BookBundle` and the repositories behind it · the flip machine and its DOM binding · book scaling with the 1.7× cap · Cover, Contents, Notes, Frames I, Frames II, About · bookmark rail, bottom bar, ribbon · gallery route and lightbox · mobile reading mode with swipe · routing on real paths.

*Exit:* every page type renders from seeded data; flip verified at 60fps; browser sweep committed.

### Phase 2 — Auth

Sign-in, OTP, reset and the "signed in" state · `otpChallenges` and `sessions` · server-side rate limiting per account and per IP · lockout · anti-enumeration · cookie policy and session rotation · CSP.

*Before* the admin, deliberately: `SECURITY.md` requires authorization checks on every mutation. Building ten screens of mutations first and adding access control afterwards is the retrofit that gets missed on three of them.

*Exit:* the security test suite passes, including the negative cases; browser sweep committed.

### Phase 3 — Media pipeline

Presigned direct-to-bucket upload · the worker: magic-byte sniff, SVG rejection, EXIF read then strip, re-encode, five derivative tiers, perceptual hash and duplicate detection, `ffprobe`, H.264 transcode, poster extraction · `processing` / `ready` / `failed` states · download handler.

*Exit:* a still and a clip both survive a full round trip; EXIF verifiably absent; SVG verifiably rejected.

### Phase 4 — Admin

Overview · Journeys · Journey editor · Media · Galleries · Book & bookmarks · Cover & About · Publish · Settings · Trash · Account.

*Exit:* every screen matches `SCREENS.md`; focal points set in the admin visibly move the crop in the diary; browser sweep committed per screen group.

---

## 5 · Data model

Collections follow `DATA_MODEL.md` exactly: `media`, `journeys`, `pages`, `users`, `otpChallenges`, `sessions`, plus the `book`, `about` and `site` globals. That document is authoritative for field lists; this section records only the decisions layered on top.

### 5.1 Structural rules — carried into the type system

1. **Everything is keyed by journey id.** The handoff records five separate defects caused by per-journey state held in one global value. Client caches are `Record<JourneyId, T>`, never a bare value.
2. **Rows are addressed by id, never by array position.** Sorting a gallery by capture time reorders it; a positional index desyncs the selected-frame panel from the highlighted tile.
3. **Derived values are computed, never stored:** page numbers, the `03 / 33` counter, contents entries and their page numbers, bookmark tab spans, media counts, storage totals.
4. **Soft delete exists from the first migration.** `deletedAt` on journeys and `versions: { drafts: true }` are painful to retrofit.
5. **Free-text `dates` always travels with sortable `startsOn`.** Gallery sort derives from `media.capturedAt`.

### 5.2 Focal point

Focal point lives on the **slot**, not the media item — the same photograph in a tall frame and a wide frame wants different focus. `media.focalPoint` is the default; `pages.slots[].focalX/focalY` overrides it. It is applied as `object-position` / `background-position` when the diary renders.

If this is not wired through to rendering, the admin control is decorative. It is a Phase 4 exit criterion for exactly that reason.

### 5.3 Branded identifiers

`JourneyId`, `PageId`, `MediaId`, `SlotKey` are branded string types. A `JourneyId` cannot be passed where a `PageId` belongs.

---

## 6 · Module seams

Four boundaries carry the design's stated failure modes. Each is a small module, independently testable, named in its own header.

| Module | Package | Contract |
|---|---|---|
| `flipMachine` | domain | Pure reducer over `{dir, from, to, go, half, busy}` with an injected clock |
| `bookScale` | domain | `(area) → number`, `min(w/1300, h/860)` capped at 1.7 |
| `bookBundle` | domain + web/lib | Payload rows in, one typed `BookBundle` out. The diary client reads nothing else. |
| `storage` / `mailer` / `transcodeQueue` | web/lib | Ports with local and production adapters, one shared contract suite run against both |

`BookBundle` is the only serialization boundary between server and diary client. The diary never learns what a Payload row looks like.

---

## 7 · The book

### 7.1 Geometry

Authored at exactly **1300×860**, scaled by `min(areaWidth/1300, areaHeight/860)` applied as `transform: scale(k)` with `transform-origin: center` on an element with explicit pixel dimensions. Measured on mount, on resize, via `ResizeObserver`, and after returning from a gallery.

**Capped at 1.7×.** The handoff lists uncapped 4K scaling under *Known gaps*: the book grows ~2.4× at 3840 CSS px while the bookmark rail and bottom bar sit outside the transform at fixed size. Capping and centring closes it. The `hero2x` derivative tier serves the same problem for image sharpness.

Frame: dark board full-bleed, 36px spine strip with dashed stitch lines at x=9 and x=27, an 11px fore-edge stack strip on the right, page area inset `14px 18px 14px 36px`.

### 7.2 The flip

Container: `perspective: 2800px`, `perspective-origin: 35% 50%`. Each leaf: `transform-origin: left center`, `rotateY(Ndeg)`, `transform-style: preserve-3d`. Turned pages rest at `-180deg`, untouched at `0deg`. Z-index: turned `i + 1` ascending, untouched `1000 - i` descending, the actively turning leaf `2000`.

**`backface-visibility` is not used.** The handoff records that it produced blank pages. Each leaf has a front face and a back face whose opacity swaps at the animation midpoint.

**Back faces are always `pointer-events: none`.** When they were not, they silently swallowed every click on page content — Contents links and gallery buttons appeared dead while their handlers were fine. This is asserted in a Playwright test, not left to review.

Any page that is not current, turning, or being revealed is `visibility: hidden`, preventing stranded mirrored content.

The state machine:

```
idle → arming (30ms) → turning → swapped (duration/2) → committing (duration + 40ms) → idle
```

`busy` releases on the terminal transition of every path, including aborted ones, so a seized book is unrepresentable rather than a bug to hunt. Transition: `transform {duration}ms cubic-bezier(.55,.06,.28,1)`; duration defaults to 900ms, range 400–1600. A travelling shade fades in over the turning leaf.

Because the machine is pure with an injected clock, latch behaviour, direction, z-order and face-swap timing are unit-tested with no browser. Playwright's role narrows to proving the DOM reflects the machine.

Triggers: the 44px right page-edge strip, the 30px left strip, the bottom arrows, ArrowLeft/ArrowRight, PageUp/PageDown, and bookmark tabs. Bookmark jumps set an anchor page one step from the target so the animation always plays in the correct direction.

**Only `transform` and `opacity` animate**, which satisfies the 60fps budget by construction rather than by profiling afterwards.

### 7.3 Reduced motion

`prefers-reduced-motion: reduce` produces an instant page change: no rotation, no shade, no timers. The machine skips directly from `arming` to `committing`.

---

## 8 · Rendering and routing

The server builds `BookBundle` and statically renders every page's content; the client takes over for scaling and flipping. Publishing triggers on-demand revalidation of affected paths only.

| Path | View |
|---|---|
| `/p/<n>` | diary page, 1-indexed |
| `/gallery/<slug>` | that journey's gallery |

Real paths, not hashes — the deep links must be indexable. The URL is written on every turn: flip commit, mobile step, bookmark jump.

**Returning from a gallery restores `/p/<n>`, not `/`.** A reader who browses a gallery and copies the URL should still be sharing the page they were reading.

Scrollbars are hidden throughout the diary (`scrollbar-width: none` plus the WebKit pseudo-element) — a visible scrollbar breaks the paper illusion. Content still scrolls. The admin shows a thin muted scrollbar.

### 8.1 Motion clips

In diary page slots: the still is the `poster`; the video plays over it with `autoplay muted loop playsinline preload="none"`, **no controls and no play badge**. Playback starts on `canplay`, re-asserting `muted` first and swallowing the rejected promise — the one permitted swallowed rejection in this codebase, and it carries a comment saying so.

Gallery tiles are the opposite: clips show a play badge and duration, because there the reader is choosing what to open.

### 8.2 Responsive

One pattern in all three surfaces: measure the real viewport or content width into state on mount, on resize, and via `ResizeObserver`; derive a mode; drive layout from it.

| Surface | Breakpoints |
|---|---|
| Diary | `< 860px` → mobile reading mode |
| Admin | `≥ 1180` wide · `≥ 860` mid · below narrow |
| Login | `< 820` → single column |

**Mobile reading mode is a separate component tree**, not media queries over the book. The handoff says it replaces the book entirely — no flip, no scaling. Sharing DOM produces a scaled book fighting a scrolling column. It has a dark header with a bookmarks drawer, a scrolling single column, full-width 4:3 photos, 52px nav buttons, and swipe (≥60px horizontal **and** 1.4× the vertical delta).

Below 820px the login hides the cloth panel, becomes a single 470px column and shows a compact cloth masthead. Without this the OTP cells collapse to 7px.

---

## 9 · Media pipeline

### 9.1 Upload

Direct to bucket, and this is forced rather than preferred: Vercel's serverless functions cap request bodies at ~4.5MB, so a 25MB photograph cannot pass through the app at all.

```
server action issues a presigned URL   (validates declared type, size cap, per-request file count)
browser uploads straight to R2         (never touches Vercel)
server action creates media row        status: processing
job row written to Postgres
worker claims the job
```

### 9.2 Worker, in this order

Order matters — several steps only work if they come first.

1. Sniff the real type from magic bytes. Never the extension, never the client-declared mime type.
2. **Reject SVG outright.** An SVG is an HTML document; one upload becomes stored XSS with the author's own session attached.
3. Read EXIF → capture `capturedAt` and orientation.
4. **Strip all metadata and re-encode via `sharp`.** Travel photographs carry GPS coordinates; re-encoding removes metadata and any embedded payload in one step.
5. Generate the five derivative tiers: `thumb` 400², `tile` 800², `frame` 1400w, `hero` 2000w, `hero2x` 4000w.
6. Compute a perceptual hash; if it matches an existing row **in the same journey**, skip and report as a duplicate.
7. Clips: `ffprobe` for `durationSec`, transcode to H.264 at modest bitrate, extract a poster at `posterAt ?? 0` into `posterImage`.
8. Mark `ready`, or `failed` with a reason the Media screen surfaces.

`processing` is a first-class UI state, not a missing image: the Media screen shows progress and the Galleries poster filmstrip needs a processed clip.

`afterChange`: setting `isCover` clears it on the journey's other media.

---

## 10 · Security

Every requirement in `SECURITY.md` has a named home. This table becomes `docs/security.md`, with file references filled in as each is built.

| Requirement | Discharged by |
|---|---|
| OTP generated server-side with a CSPRNG | auth service, Phase 2 |
| Only a hash stored, 5-minute expiry | `otpChallenges.codeHash`, `expiresAt` |
| Constant-time comparison, single use | auth service; `consumedAt` set on success |
| Code never sent to the client in any response | asserted by a security test |
| Challenge bound to the session that started it | pre-auth session id on the challenge |
| `otpRequired` decided server-side | `users.otpRequired`. The `localStorage` read and its `storage`/`focus` listeners are **deleted, not moved** |
| Max 3 attempts, then invalidate and force resend | `otpChallenges.attempts` |
| Rate limit per account **and** per IP | sliding window in Postgres, on both password and code endpoints |
| Account lockout with cooling-off | Payload `maxLoginAttempts: 5`, `lockTime: 15m` |
| Resend cooldown 30s plus an hourly ceiling | auth service |
| No user enumeration | identical response **and** timing — a dummy password is hashed when the account does not exist, otherwise the timing leaks what the response hides |
| Reset responds identically whether or not the address exists | same mechanism |
| Sessions revocable, listed on the Account screen | real `sessions` rows checked per request |
| Session id rotated on login | never reuse a pre-auth id |
| Cookies `httpOnly`, `Secure`, `SameSite=Lax`, scoped to admin | cookie policy, Phase 2 |
| CSRF protection on cookie-authenticated mutations | Phase 2 |
| Authorization on **every** mutation | Payload access control per collection — nothing inherits trust from the page it was reached from |
| Media served from a separate origin | R2 custom domain with its own restrictive CSP |
| Downloads through our handler | short-lived signed URL, `Content-Disposition: attachment`, strict `Content-Type`. Never a bucket URL — direct URLs invite enumeration of everything in the bucket, including anything hidden |
| `passwordProtect` gates server-side | a client-side check leaves the content fetchable |
| `indexGalleries` respected | `robots.txt` **and** `X-Robots-Tag`, since pages are statically served |
| Secrets in the platform store | never in the repo; `.env` is gitignored |
| Offsite backups of Postgres **and** the bucket, restore tested | scheduled dump to a different provider; restore drill in `docs/runbook.md` |

The last row is the one `SECURITY.md` says deserves more attention than everything above it. The realistic disaster is losing 40GB of photographs, not an attacker. "Export everything" on the Settings screen is a genuine feature, not a nicety.

---

## 11 · Testing

All nine types from `CLAUDE.md` §2 are required. Coverage gates: 100% on `packages/domain/**`, 95% on server actions, 90% repository-wide, enforced in config so CI fails below.

Notable cases, chosen because they encode defects the handoff records as already having happened:

| Test | Guards |
|---|---|
| Back-face click-through (Playwright) | Contents links and gallery buttons appearing dead |
| Latch release across every path (unit) | The book seizing mid-flip |
| Visibility of non-current pages (Playwright) | Stranded mirrored content |
| Gallery selection after re-sort (unit + Playwright) | Positional index desyncing from the highlighted tile |
| Per-journey isolation (integration) | The five defects from globally held per-journey state |
| Independent timeout handles (unit, injected clock) | The login button stranded on "Checking…" |
| Gallery return preserves `/p/<n>` (Playwright) | Readers sharing the wrong URL |
| OTP cells at 819px (visual) | Cells collapsing to 7px |
| EXIF absent after upload (integration) | Publishing the author's home address |
| SVG rejected by magic bytes (integration) | Stored XSS |
| Enumeration timing equality (security) | Leaking which addresses exist |

Browser sweeps per `CLAUDE.md` §10 are required before any UI phase is called complete, and their reports are committed.

---

## 12 · Performance

Budgets are hard gates, per `CLAUDE.md` §6: 60fps flip with only `transform` and `opacity` animated; diary route JS ≤180KB gzipped; admin ≤320KB; LCP ≤2.5s; CLS ≤0.1; INP ≤200ms; no N+1 queries; always a derivative tier, never an original.

The gallery grid virtualizes past 100 tiles — the design tops out at ~100 assets per journey, which is exactly the threshold where a naive grid starts to hurt.

---

## 13 · Deployment and cost

Vercel for the app, Neon for Postgres, R2 for media on its own domain, a Fly.io worker that auto-stops, Resend for OTP, Backblaze B2 for offsite backups.

Expected steady state: **≈$2–3/month** on free tiers, ≈$45/month on paid plans, plus ~$12/year for a domain. Storage is the only variable that scales meaningfully — roughly $0.60/month per additional 40GB. Traffic barely moves the bill because the diary is statically rendered and R2 egress is free.

**The one cost trap:** serving media through Next.js routes or `next/image` puts 40GB of photography through Vercel's metered bandwidth. Media must come from the R2 custom domain — which `SECURITY.md` independently requires. Security and cost want the same architecture.

To be recorded as `docs/adr/0001-hosting-and-cost.md`. Figures are list prices as understood in August 2026 and should be re-verified before committing to providers.

---

## 14 · Risks

| Risk | Mitigation |
|---|---|
| The flip is the hardest part and hardest to test | Extracted as a pure machine with an injected clock; browser tests only prove the DOM reflects it |
| Ten admin screens is the largest surface and the easiest place to drift from spec | Visual regression per screen at each breakpoint; browser sweep before any completion claim |
| Per-journey state leaking globally — five recorded defects | Structural: `Record<JourneyId, T>` in the type system, integration tests for isolation |
| Placeholder imagery hides real-photograph problems (aspect ratios, focal points, file sizes) | Focal point wired to rendering is a Phase 4 exit criterion; derivative tiers exercised with realistic file sizes in Phase 3 |
| Cloud pricing changes | Adapters keep providers swappable; ADR records the decision and its date |
| Losing the media | Offsite versioned backups with a **tested** restore, per `SECURITY.md` |

---

## 15 · Deviations from the handoff

Recorded here and in `docs/deviations.md`:

1. **Payload auth instead of Auth.js** (§2.1) — resolves a conflict between `README.md` and `DATA_MODEL.md` in favour of the latter, which `SECURITY.md` also assumes.
2. **`sharp` in the worker instead of an image transform vendor** (§2.2) — removes a dependency the worker makes redundant.
3. **`prefers-reduced-motion` support** (§2.3) — an accessibility addition the handoff does not mention.
4. **Book scale capped at 1.7×** (§7.1) — closes a gap the handoff lists as known and unimplemented.

Everything else follows the handoff as written, including all copy. The voice is deliberate: "nineteen tarts, no regrets" is content, not a placeholder.
