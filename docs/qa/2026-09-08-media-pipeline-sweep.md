# Sweep: media pipeline — the gallery grid and the download action — 2026-09-08

**Build:** `35640bf` (`feat/phase-3-media`) **Engine:** Playwright headed (`chromium`, `node_modules/playwright`), driven by a script rather than the `e2e/` suite so a surface could be added that no project defines — `412x823` at DPR 1.75, which is the geometry ADR 0013's `grid` rung exists for
**Routes walked:** 3 — `/gallery/patagonia`, its lightbox, `/gallery/patagonia/download/<id>` (60 of 60 frames probed)
**Surfaces:** 1440x900 at DPR 1 and DPR 2 · 1000x800 at DPR 1 · 390x844 at DPR 3 (iPhone UA, touch) · 412x823 at DPR 1.75 (iPhone UA, touch)
**Servers:** `next dev` on :3000 for the walk; **every finding below was then re-confirmed against a production `next build` + `next start` on :3100**, because a header this sweep reports is one Next.js adds and a dev-only artefact would be a defect report about the dev server
**Result:** 3 defects — S1:0 S2:1 S3:0 S4:2. **MED-001 was fixed on 2026-09-14** — see
its entry; the other two are unchanged by that round.

**Instrumentation, attached before the first navigation on every context:** `console`
(**all levels**, not errors only), `pageerror`, every `response` with a status ≥ 400, and
every `requestfailed`. `CLAUDE.md` §10: the handoff's own defect log is mostly silent
failures, and a missing derivative is one of them. Nothing was found this way — zero
`pageerror`, zero 4xx/5xx, zero failed requests across all five surfaces and all 60
download probes, and under the production build zero console lines of any level — which
is a result rather than an absence of one, and it is what makes the ADR 0013 srcset
change below reportable as clean.

**Why this area.** Phase 3 changed two things a browser can see: the gallery tile's
`srcset` gained the `grid` (700w) candidate (Task 10, ADR 0013), and the download
response's `Cache-Control` became conditional on `site.passwordProtect` (Task 11).

**Nothing here was patched.** `CLAUDE.md` §10: a fix without a test that failed first
guards nothing. Each defect below names who it belongs to; none of them is fixed in the
commit that lands this file.

---

## Defects

### MED-001 · S2 · The lightbox and the download both serve a SQUARE CROP of a photograph that is not square

- **Route:** `/gallery/patagonia`, lightbox open on any frame, at every surface swept ·
  `GET /gallery/patagonia/download/1519`
- **Steps:**
  1. Cold load `/gallery/patagonia`.
  2. Click any tile. The lightbox opens.
  3. Read the open `<img>`'s `currentSrc` and `naturalWidth`/`naturalHeight`.
  4. Separately, `GET` that frame's `Download` link and measure the returned image.
- **Expected:** `SCREENS.md` §1.9 draws the lightbox as one photograph, and
  `packages/domain/src/gallery.ts` says `fullSrc` is "the largest derivative available,
  which the lightbox draws at `object-fit: contain`" — i.e. the whole frame, letterboxed.
  The download is the reader's copy of that photograph.
- **Actual:** both serve the `tile` tier, which `apps/web/collections/media.ts` declares
  as `{ name: 'tile', width: 800, height: 800 }` — width **and** height, so Payload crops
  to `cover`. The seeded originals are **1200x900**; the served derivative is **800x800**,
  so roughly 22% of the frame's width is cut off both in the lightbox and in the
  downloaded file.

  The cause is a fallback ladder, not the fixtures. `readGalleryBundle.ts`'s
  `FULL_TIERS` is `['hero', 'frame', 'tile', 'thumb']` and `readGalleryDownload.ts`'s
  download ladder is the same idea with `grid` added. `frame` (1400w) and `hero` (2000w)
  are the only uncropped tiers, and Payload derives a width-only size **only when the
  source is at least that wide** — so **every row whose original is narrower than 1400px
  falls through to a square tier**, in both ladders. That is not a property of the seed:
  `media.ts` accepts any JPEG or PNG and `MAX_UPLOAD_BYTES` admits a 1000px photograph
  happily.

- **Evidence:** `docs/qa/assets/2026-09-08-media-pipeline/lightbox-desktop-square-crop.png`
  — the open frame is visibly square inside a 1440x900 viewport. Measured, not inferred:

  ```
  lightbox <img>  currentSrc  …/patagonia-hero-178-800x800.png
                  naturalWidth 800   clientWidth 723   srcset (none)   sizes (none)
  stored original  patagonia-hero-178.png   1200x900
  download probe   GET /gallery/patagonia/download/1519 -> 200, 80,462 bytes
                   sharp metadata of the returned bytes: 800x800
  ```

- **FIXED, 2026-09-14**, in Phase 3's owner-decisions round, on the owner's ruling that
  it be fixed now rather than carried. **Not by any of the three shapes this entry
  proposed**: `frame` keeps its 1400px width and gains `withoutEnlargement: true`, so
  Payload leaves a narrower original at its own size instead of skipping the tier and
  every raster row carries an uncropped derivative. The `fit` change on `tile` was
  rejected because the grid needs `tile` square (SCREENS.md §1.8), and letterboxing a
  `thumb` was rejected because it serves a 400px file where a 1200px one exists.
- **THE CLASS WAS WIDER THAN THIS ENTRY SAYS, and the third consumer is the one this
  sweep did not walk.** `readBookBundle.ts`'s `DERIVATIVE_PREFERENCE` resolves every
  in-book slot through the same fall-through, and its `ephemera` list read
  `['tile', 'frame', 'thumb']` — `tile` FIRST — so a 1200×560 ephemera strip was served
  as an 800×800 centre crop even where a `frame` existed, with the slot's focal point
  choosing between what was left. All three ladders now name uncropped tiers only, and
  `apps/web/lib/media/derivativeGeometry.test.ts` computes the uncropped set from the
  collection and refuses anything outside it, so a rung added later cannot be swept back
  in. Each consumer has its own failing-first case: the lightbox in
  `readGalleryBundle.integration.test.ts`, the download in
  `readGalleryDownload.integration.test.ts`, the slot in
  `readBookBundle.integration.test.ts`, and the repair of existing rows in
  `scripts/rederive-media.integration.test.ts`.
- **Not introduced by Phase 3**, and the record should say so: `FULL_TIERS` has had this
  shape since Phase 1. What Phase 3 did was walk past it — Task 10 added `grid` to
  `TILE_TIERS` and Task 11 added `grid` to the download ladder, and neither touched
  `FULL_TIERS`. `docs/qa/2026-09-03-phase-1-closing-sweep.md` examined `FULL_TIERS` for a
  DPR question and did not ask about aspect ratio.

### MED-002 · S4 · The download's deliberate `public, max-age=3600` is fragmented by a `Vary` the route never set

- **Route:** `GET /gallery/patagonia/download/<id>`, production build
- **Steps:**
  1. `npm run build -w apps/web && npm run start -w apps/web -- --port 3100`.
  2. `curl -s -D - -o /dev/null http://localhost:3100/gallery/patagonia/download/1519`.
- **Expected:** Task 11 made this response's cacheability a decision —
  `downloadCacheControl({ gated: false })` is `'public, max-age=3600'`, and
  `docs/api.md` records it. A publicly cacheable response should have one cache key.
- **Actual:** the response carries, alongside the four headers the route file sets:

  ```
  Accept-CH: Sec-CH-Prefers-Color-Scheme
  vary: Sec-CH-Prefers-Color-Scheme
  vary: rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch
  Critical-CH: Sec-CH-Prefers-Color-Scheme
  cache-control: public, max-age=3600
  ```

  The four `next-router-*`/`rsc` names cost nothing in practice — a plain `<a download>`
  GET never carries them, so every real download shares one key. **`Sec-CH-Prefers-Color-Scheme`
  is different, and that is the finding:** the same response advertises `Accept-CH` and
  `Critical-CH` for it, so a compliant browser WILL send it on the next request to this
  origin. A shared cache therefore holds at least two entries per downloadable frame —
  light and dark — for a byte stream that does not vary by colour scheme at all.

- **Evidence:** the `curl` transcript above, taken from `next start`, not `next dev`.
  The route file sets exactly four headers
  (`apps/web/app/(diary)/gallery/[slug]/download/[id]/route.ts`); every header above it
  is the framework's.
- **Owner: NOBODY, stated as an absence rather than dressed as an assignment.** This said
  "not this phase", which names who it is not and leaves a reader to assume somebody has it
  (whole-branch review F4). Nobody does: no phase in the plan owns the HTTP boundary of the
  download route, and nothing schedules this. What that means concretely is that the
  fragmentation persists until somebody adopts it, and the cost of that is bounded and
  known — a shared cache holds two entries per downloadable frame instead of one, and no
  reader sees anything wrong. **The trigger that should adopt it:** whoever next changes
  this route's cache headers, or whoever writes the first test that reads a header off a
  production build. That test is the real prerequisite, it does not exist today, and
  MED-003 needs the same one — so the two are cheapest done together.

### MED-003 · S4 · `X-Powered-By: Next.js, Payload` on every public response

- **Route:** `/gallery/patagonia`, `/p/1` and `/gallery/patagonia/download/<id>`,
  production build
- **Steps:** as MED-002, step 2, against each route.
- **Expected:** `SECURITY.md`'s hardening posture is default-deny; naming the framework
  and the CMS, with no version, is free reconnaissance for an attacker choosing which
  advisories to try.
- **Actual:** `X-Powered-By: Next.js, Payload` is present on all three. No version is
  disclosed.
- **Evidence:**

  ```
  $ curl -s -D - -o /dev/null http://localhost:3100/p/1 | grep -i x-powered-by
  X-Powered-By: Next.js, Payload
  ```

- **Owner: the repository owner**, because this is a posture decision rather than a defect —
  and it is now recorded in `docs/security.md` ("Residuals at the HTTP boundary") as an open
  decision, which is where §1.2 puts a security decision. It said "not this phase" and lived
  only here; `docs/qa/**` sits outside every documentation guard's corpus and no register
  indexes it, so a security decision parked here is parked where nothing reads (whole-branch
  review F4). Reported at its real weight otherwise: site-wide rather than the gallery's, no
  version disclosed, and one `poweredByHeader: false` away. The ruling, either way, wants
  the same header-off-a-built-response test MED-002 does.

---

## Clean

Walked, instrumented, and nothing found. Listed so a later reader knows what this sweep
actually covered.

- **`/gallery/patagonia` at all five surfaces** — zero `pageerror`, zero responses ≥ 400,
  zero failed requests, zero console output under the production build. The dev walk's
  only console lines were React DevTools and Fast Refresh.
- **ADR 0013's `grid` rung is offered AND chosen, which is the thing Phase 3 changed.**
  Every tile's `srcset` is
  `…-400x400.png 400w, …-700x700.png 700w, …-800x800.png 800w` with
  `sizes="(max-width: 451px) calc(100vw - 36px), 300px"`, and what the browser picked:

  | surface              | tile `clientWidth` | chosen candidate |
  | -------------------- | ------------------ | ---------------- |
  | 1440x900 DPR 1       | 215px              | 400w             |
  | 1440x900 DPR 2       | 215px              | 700w             |
  | 1000x800 DPR 1       | 221px              | 400w             |
  | **412x823 DPR 1.75** | **376px**          | **700w**         |
  | 390x844 DPR 3        | 354px              | 800w             |

  The 412x823 row is ADR 0013's own geometry and its own argument: 376 CSS px at DPR 1.75
  needs 658 device pixels, the 700w rung serves it, and before the rung existed that
  request took the 800w tile. A rung a row carries but no `srcset` names is a rung the
  browser cannot choose, and this is the measurement that says it can.

- **`galleryTileSizes`'s deliberate over-estimate is exactly as documented.** Its header
  says "at 1440px the tile is 215px, a `sizes` of 300px still selects the 400px `thumb`
  at 1x". Measured here: 215px, 400w selected. The over-estimate changes no candidate at
  any surface swept.
- **The download action, all 60 frames.** Every one answered `200` with
  `Cache-Control: public, max-age=3600` (`site.passwordProtect` off),
  `Content-Type: image/png`, `X-Content-Type-Options: nosniff`, `X-Robots-Tag: noindex`,
  and `Content-Disposition: attachment; filename="patagonia-001.png"` through
  `patagonia-060.png` — 60 distinct ids, 60 distinct filenames, no duplicate, no gap, and
  no filename derived from a storage key.
- **The download's refusal is one answer for every cause.** `…/download/999999` (no such
  row) and `/gallery/no-such-journey/download/1` (no such journey) both answered
  `404 Not found`, byte-identical, which is the anti-enumeration property `SECURITY.md`
  asks of this route.
- **The lightbox as an interaction.** Opens on a tile click at every surface; exactly one
  `[role="dialog"]`; focus lands on `Close`; `ArrowRight` advances the counter
  `001 / 060` → `002 / 060` and swaps the caption with it; `Escape` closes it and leaves
  the URL unchanged at `/gallery/patagonia`.
- **The return path to the book.** `/gallery/patagonia?from=4` renders
  `← BACK TO THE DIARY` with `href="/p/4"`, and following it lands on `/p/4` — the
  server-rendered path, not `document.referrer`.
- **Accessibility.** `@axe-core/playwright` over the full page: **zero violations** at
  all five surfaces, and **zero with the lightbox open** at three of them.
- **`hero2x` is not served to the gallery, and that is correct rather than missing.**
  `FULL_TIERS` omits it deliberately, with the reason at the constant: a lightbox is one
  image a reader chose, not a page's LCP element. Checked because `CLAUDE.md` §6's
  "`hero2x` for displays ≥2×" reads like a rule this route breaks; it is not one this
  route is subject to. (The aspect-ratio problem in MED-001 is a different question about
  the same ladder.)

---

## Not covered

- **Clips.** The seeded corpus is `60 photos · 0 clips`, so the gallery tile's duration
  chip and play badge, and the page slot's muted-autoplay-loop-no-controls rule, were not
  exercised at all. `MEDIA_PIPELINE=inline` refuses both video types at ingest
  (ADR 0004), so there is no way to seed one without a worker.
- **`site.passwordProtect` on.** Only the `public, max-age=3600` arm of
  `downloadCacheControl` was driven in a browser. The `private, no-store` arm is covered
  by `readGalleryDownload.integration.test.ts`, not by this sweep — toggling a site
  global mid-sweep would have left the local database in a state the next run inherits.
- **A row with `allowDownload: false`.** The seed has none, so the lightbox's
  download-link suppression was not observed in a browser.
- **A real photographic corpus.** Every tile here is a stripe-pattern placeholder at
  1200x900. That is the same understatement `docs/adr/0013-gallery-image-budget.md`
  records, and it is why MED-001 is stated in terms of the ladder rather than of these
  fixtures.
- **The upload path itself.** `requestUploadSlots` / `finaliseUpload` are behind the admin
  guard and have no screen yet — the Media screen is Phase 4 — so there is nothing to
  drive in a browser beyond what `e2e/upload.spec.ts` already drives.
- **The book surface and the admin.** Out of this sweep's area. `/p/1` was touched only
  to read one response header for MED-003.
- **Frame rate, and the flip.** Untouched by this phase; `e2e/flip.spec.ts` is Task 12's.
