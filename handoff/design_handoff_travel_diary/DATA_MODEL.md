# Data model

Payload CMS 3 collections on Postgres. If you use something else, the field lists and the four notes at the end still apply.

---

## `media`

The upload collection. Everything else references it.

```ts
{
  slug: 'media',
  upload: {
    staticDir: 'media',
    focalPoint: true,                    // powers the admin's focal-point picker
    mimeTypes: ['image/jpeg', 'image/png', 'image/heic', 'video/mp4', 'video/quicktime'],
    imageSizes: [
      { name: 'thumb',  width: 400,  height: 400, position: 'centre' },
      { name: 'tile',   width: 800,  height: 800 },
      { name: 'frame',  width: 1400 },
      { name: 'hero',   width: 2000 },
      { name: 'hero2x', width: 4000 },   // 4K displays scale the book up ~2.4x
    ],
  },
  fields: [
    { name: 'journey',      type: 'relationship', relationTo: 'journeys' },
    { name: 'kind',         type: 'select', options: ['still', 'clip'], admin: { readOnly: true } },
    { name: 'caption',      type: 'text' },      // Caveat, shown under the photo
    { name: 'alt',          type: 'text' },      // screen readers
    { name: 'capturedAt',   type: 'date' },      // from EXIF, before stripping
    { name: 'posterAt',     type: 'number' },    // clips: poster timestamp in seconds
    { name: 'posterImage',  type: 'upload', relationTo: 'media' },  // extracted frame
    { name: 'durationSec',  type: 'number' },    // clips
    { name: 'inBook',       type: 'checkbox', defaultValue: false },
    { name: 'hidden',       type: 'checkbox', defaultValue: false },
    { name: 'isCover',      type: 'checkbox', defaultValue: false },
    { name: 'allowDownload',type: 'checkbox', defaultValue: true },
    { name: 'order',        type: 'number' },
    { name: 'contentHash',  type: 'text', index: true },  // duplicate detection
  ],
}
```

`beforeChange` hook, in order:

1. Sniff the real mime type from magic bytes — never trust the extension
2. Reject SVG outright
3. Read EXIF → store `capturedAt`, then **strip all EXIF** (see `SECURITY.md`)
4. Re-encode stills rather than passing originals through
5. Compute `contentHash` (perceptual for stills); if it matches an existing row in the same journey, skip and report as a duplicate
6. Clips: probe with ffprobe for `durationSec`, transcode to H.264 MP4, extract a poster at `posterAt ?? 0` into `posterImage`

`afterChange`: if `isCover` was set, clear it on the journey's other media.

---

## `journeys`

```ts
{
  slug: 'journeys',
  versions: { drafts: true },            // the Publish screen's editions + restore
  fields: [
    { name: 'name',   type: 'text', required: true },
    { name: 'place',  type: 'text', required: true },
    { name: 'slug',   type: 'text', required: true, unique: true, index: true },
    { name: 'dates',  type: 'text', required: true },   // free text: "12 – 24 March 2025"
    { name: 'startsOn', type: 'date' },                 // sortable counterpart
    { name: 'order',  type: 'number', index: true },
    { name: 'hiddenFromBookmarks', type: 'checkbox', defaultValue: false },
    { name: 'archived', type: 'checkbox', defaultValue: false },
    { name: 'deletedAt', type: 'date', index: true },   // 30-day trash

    { name: 'weather', type: 'text' },                  // "CLEAR 14C"
    { name: 'mood',    type: 'text' },                  // "WIDE EYED"
    { name: 'weatherGlyph', type: 'select', options: ['sun', 'haze', 'wind'], defaultValue: 'sun' },

    { name: 'furniture', type: 'group', fields: [
      { name: 'signoff',      type: 'text' },
      { name: 'stampCountry', type: 'text' },
      { name: 'stampValue',   type: 'text' },
      { name: 'accent',       type: 'text', defaultValue: '#3d817e' },
    ]},

    { name: 'highlights', type: 'array', maxRows: 4, fields: [
      { name: 'text', type: 'text', required: true },
    ]},
    { name: 'note', type: 'textarea' },
    { name: 'tally', type: 'array', minRows: 4, maxRows: 4, fields: [
      { name: 'key',   type: 'text' },
      { name: 'value', type: 'text' },   // text, not number — "plenty", "uncounted"
    ]},
  ],
}
```

`highlights` is capped at 4 in the schema, not just the UI — the notes page layout is tuned for 3–4 and a fifth breaks its rhythm.

`tally.value` is deliberately text. Several journeys use "plenty" and "uncounted".

---

## `pages`

Pages are rows, not a fixed triple — the admin can add, duplicate, reorder and delete them.

```ts
{
  slug: 'pages',
  versions: { drafts: true },
  fields: [
    { name: 'journey', type: 'relationship', relationTo: 'journeys', required: true, index: true },
    { name: 'kind',    type: 'select', options: ['notes', 'frames'], required: true },
    { name: 'title',   type: 'text' },                  // "Frames I"
    { name: 'order',   type: 'number', required: true, index: true },
    { name: 'layout',  type: 'select',
      options: ['three-up', 'four-up', 'full-bleed', 'text-spread'] },

    { name: 'slots', type: 'array', fields: [
      { name: 'role',    type: 'select', options: ['hero', 'ephemera', 'frame'] },
      { name: 'media',   type: 'upload', relationTo: 'media' },
      { name: 'caption', type: 'text' },
      { name: 'alt',     type: 'text' },
      { name: 'focalX',  type: 'number', defaultValue: 50 },   // percent
      { name: 'focalY',  type: 'number', defaultValue: 50 },
    ]},
  ],
}
```

**Focal point lives on the slot, not the media item.** The same photograph in a tall frame and a wide frame wants different focus. `media.focalPoint` is the default; the slot overrides it.

---

## `globals`

**`book`** — `title, subtitle, owner, coverCloth, yearsShown, contentsNote, flipDurationMs (400–1600), galleryThumbPx (140–300), showDecorations, showRibbon, showCounter, journeyOrderMode ('manual' | 'newest' | 'oldest')`

**`about`** — `portrait (upload), portraitCaption, paragraphs (array of textarea), kit (array of text), replyTo`

**`site`** — `name, domain, description, replyTo, analyticsId, allowDownloads, allowShare, indexGalleries, passwordProtect, touchPageTurn`

---

## `users`

One row in practice.

```ts
{
  slug: 'users',
  auth: { tokenExpiration: 60 * 60 * 24 * 7, maxLoginAttempts: 5, lockTime: 15 * 60 },
  fields: [
    { name: 'displayName', type: 'text' },     // name printed on the cover
    { name: 'signoffDefault', type: 'text' },
    { name: 'timeZone', type: 'text' },
    { name: 'otpRequired', type: 'checkbox', defaultValue: true },  // authoritative
    { name: 'notifyOnPublish', type: 'checkbox', defaultValue: true },
    { name: 'notifyWeekly', type: 'checkbox', defaultValue: false },
  ],
}
```

`otpRequired` is the **only** source of truth for the code step. The prototype keeps it in `localStorage` so the two HTML files could demonstrate the link; that is a demo shortcut and a security hole.

---

## `otpChallenges`

```ts
{
  slug: 'otpChallenges',
  access: { read: () => false, create: () => false, update: () => false },  // server only
  fields: [
    { name: 'user',      type: 'relationship', relationTo: 'users', required: true, index: true },
    { name: 'codeHash',  type: 'text', required: true },   // hashed, never plaintext
    { name: 'expiresAt', type: 'date', required: true },   // now + 5 minutes
    { name: 'attempts',  type: 'number', defaultValue: 0 },
    { name: 'consumedAt',type: 'date' },
    { name: 'ip',        type: 'text' },
  ],
}
```

## `sessions`

Backs the account screen's "Where you are signed in" list. Without real rows, "Revoke" and "Sign out everywhere" are decorative.

```ts
{ user, tokenHash, device, location, createdAt, lastSeenAt, revokedAt }
```

---

## Derived, not stored

Compute these; don't persist them:

- **Page index and the `03 / 33` counter** — from the ordered page list
- **Contents entries and page numbers** — `2 + journeyIndex × pageCount + 1`
- **Bookmark tab spans** — a journey tab is active across all of its pages
- **"{n} photographs and {n} clips in the gallery"** — count `media` by `kind`
- **"{n} of {n} in the book"** — count `media` where `inBook`
- **Storage quota** — sum `filesize` grouped by `kind`

---

## Four notes worth heeding

**1 · Scope everything per journey.** Five separate defects in the prototype came from holding per-journey state in one global value — page lists, layout choices, book selections and content all leaked across journeys. In the data layer this is natural; in the client, key every cache by journey id.

**2 · Soft-delete from the first migration.** The design has a 30-day trash with restore, and restorable editions. `deletedAt` on journeys and `versions: { drafts: true }` are both painful to retrofit.

**3 · Address rows by id, never by position.** Sorting a gallery by capture time reorders the list; any positional index desyncs the selection from what's highlighted.

**4 · Free-text dates need a sortable partner.** `dates` is deliberately human ("28 Oct – 6 Nov 2025"). Keep `startsOn` alongside it for ordering, and derive gallery sort from `media.capturedAt`.
