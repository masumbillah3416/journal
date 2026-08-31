# Data model

Source of truth for field lists: `handoff/design_handoff_travel_diary/DATA_MODEL.md`.
This document records the collections, the derived-vs-stored distinction, and the
decisions layered on top of the handoff (design spec §5); it does not restate every
field — see `DATA_MODEL.md` for the full Payload collection definitions.

Collections are not yet implemented in code as of this task (they land in a later Phase
0 task: "all collections and the first migration," design spec §4). This document
describes the target schema they must match, and will gain migration history and file
references once they exist (`CLAUDE.md` §1.2).

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

A `beforeChange` hook runs, in order: sniff the real mime type from magic bytes (never
the extension); reject SVG outright; read EXIF into `capturedAt` then strip all EXIF;
re-encode stills via `sharp`; compute `contentHash` and flag a duplicate within the same
journey; for clips, probe with `ffprobe`, transcode to H.264 MP4, extract a poster into
`posterImage`. An `afterChange` hook clears `isCover` on the journey's other media when
one item's `isCover` is set. This order is deliberate — later steps depend on earlier
ones having run (design spec §9.2).

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
- "{n} photographs and {n} clips in the gallery" — count of `media` by `kind`.
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

None yet. The first migration (collections above, plus `deletedAt` and
`versions: { drafts: true }` from the start) is a later Phase 0 task. This section will
carry an entry per migration once they exist, per `CLAUDE.md` §1.2.
