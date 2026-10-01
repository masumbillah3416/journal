# Sweep: Settings (§2.9) and Trash (§2.10) — 2026-09-27

**Build:** `404ebfe` **Engine:** playwright-headed (chromium, `--project=desktop`, `npm run dev`)
**Routes walked:** 3 (`/admin/settings`, `/admin/trash`, `/admin/export`) at six widths — 1440, 1180,
1000, 860, 780 and 412
**Result:** 3 defects — S1:0 S2:1 S3:2 S4:0

**The dev database is unchanged.** Dumped before and after: the `site` global is identical apart
from `updated_at`, all ten `journeys` rows are identical (id, name, slug, `deleted_at`,
`archived`, `_status`), and `media` holds 143 rows either side. Every fixture this sweep created —
two trashed journeys and one site-wide setting — was removed or restored in a `finally`. This is
the first sweep in the phase whose screen can lock the owner out of their own diary, and
`Take the book offline` WAS pressed: the restore is what makes that safe.

## Defects

### SET-001 · S3 · "Import a backup" sits 16px below "Export everything" in the same row

- **Route:** `/admin/settings` at 1440×900 and 412×823
- **Steps:** 1. Sign in. 2. Open `/admin/settings`. 3. Look at the two controls under "Your
  material"'s paragraph.
- **Expected:** `SCREENS.md` §2.9 draws them as a pair — "Export everything / Import a backup".
- **Actual:** the Import button is pushed 16px down and is shorter than the Export control beside
  it. `settings.module.css`'s `.save` carries `margin-top: 16px`, which is the Site card's own
  submit spacing, and `MaterialCard` reuses `.save` for a button that lives inside a flex row.
  At 412px the row wraps and the same margin leaves a visible gap between the two.
- **Evidence:** `docs/qa/assets/2026-09-27-settings-1440.png`,
  `docs/qa/assets/2026-09-27-settings-412.png`. Measured: the Export control's box is 60px tall,
  the Import button's 44px.

### SET-002 · S3 · The reader switch is 24px tall, against this repository's own 44px minimum

- **Route:** `/admin/settings`, every width from 1440 to 412
- **Steps:** 1. Open `/admin/settings`. 2. Measure any `[data-setting]` button's bounding box.
- **Expected:** `packages/tokens/src/tokens.css` declares `--td-min-hit-target: 44px`, and every
  other control on these two screens measures exactly 44px tall — Save the site, Export
  everything, Take the book offline, Put back, Delete for good.
- **Actual:** 46×24 at all six widths. It meets WCAG 2.2's 24×24 minimum, which is why **axe
  reports nothing** — the rule this misses is this repository's own, and only a measurement finds
  it.
- **Evidence:** `SWEEP settings@412 … "switchBox":{"w":46,"h":24}` (same at 1440, 1180, 1000, 860
  and 780).

### SET-003 · S2 · A reply-to that is not an address answers 500 and loses the form

- **Route:** `/admin/settings` at 1440×900
- **Steps:** 1. Open `/admin/settings`. 2. Type a site name. 3. Type `not-an-address` into
  Reply-to. 4. Press "Save the site".
- **Expected:** the field is refused where the author can read why, and the other three fields
  survive.
- **Actual:** HTTP **500** from the Server Action, Next's error overlay in development, and the
  four typed values gone. `readSiteForm`'s Zod refusal is correct — CLAUDE.md §3.1 asks for
  validation at the boundary — but nothing turns it into a message.
- **Evidence:** verbatim, off the sweep's own listeners —
  `failed: ["500 http://localhost:3000/admin/settings"]` and
  `pageerror: [{"code":"custom","path":["replyTo"],"message":"that is not an email address"}]`.

**This is a CLASS, not an instance.** Every guarded form in this admin parses with Zod and none
of them renders a refusal: `saveAbout` refuses a reply-to the same way (`docs/api.md`'s own row
says so), `saveCover` refuses a cloth that is not a six-digit hex, and `createJourney` refuses an
empty name. The instance here is fixed — see below — and the class is recorded as
`docs/deviations.md` §104 with the screen that owns it, because a defect recorded only in a dated
sweep file has no carrier.

## Fixed in this task

Each fix has a case that was watched failing first, and each is measured in a REAL BROWSER
rather than in jsdom, because all three defects are layout or platform behaviour that jsdom does
not have.

- **SET-001** — `MaterialCard`'s inert control gets a row class without the Site card's submit
  margin, and the `<a>` beside it gets the `box-sizing` the admin stylesheet does not set.
  Case: `draws §2.9’s two material actions on one line, with their tops aligned`
  (`e2e/admin.spec.ts`). Watched failing: `Expected: 875, Received: 891`.
- **SET-002** — the track keeps its 46×24, because a 44px-tall switch does not read as a switch,
  and the button around it carries the hit area. Case:
  `gives every reader switch this repository’s own minimum hit area` (`e2e/admin.spec.ts`),
  which reads the floor off `--td-min-hit-target` rather than writing 44 into the assertion.
  Watched failing: all five switches under the floor.
- **SET-003** — the instance: Reply-to becomes `type="email"`, which every browser enforces
  natively with no JavaScript, so the refusal happens in the field rather than as a 500. The
  server parse is unchanged and is still the real guard. Case:
  `refuses a reply-to that is not an address in the field, not with a 500`
  (`e2e/admin.spec.ts`). Watched failing: `the save reached the server and was refused there`.

**All three cases landed in one commit rather than three, and that is worth recording.** A
scripted extraction meant to hold two of them back failed silently — `ValueError: substring not
found` scrolled past inside a command whose later half succeeded — so `4fab53f` carries three
cases and one fix, and the commit after it carries the other two fixes. The reds were watched and
are pasted above; what was lost is one step of `git bisect` resolution, not the evidence.

## Clean

- **`/admin/settings`, six widths.** Two equal columns at 1440 and 1180 (`561px 561px`,
  `431px 431px`), one column at 1000 and below — §2.9's shape, transitioning at the converted
  rung. No horizontal overflow at any width.
- **Every reader toggle, pressed three times.** Measured against Postgres directly rather than
  through a second Payload instance: `t → f → t → f`, and the drawn `data-on` follows on every
  press. The handoff's most-repeated admin defect — a toggle that reads stale and appears dead —
  is not here.
- **"Take the book offline".** Pressed: `/p/1` went from 200 to **401**, the button went inert and
  read "The book is offline", and the fourth toggle drew `on`. Opening it again from that toggle
  put `/p/1` back to 200.
- **"Save the site".** The four fields persist, the rail's masthead picks up the new name on the
  same response, and the five reader settings are untouched by it.
- **`/admin/export`.** `200`, `application/json; charset=utf-8`,
  `attachment; filename="travel-diary-2026-09-26.json"`, `private, no-store`, 417,040 bytes,
  keys `takenAt, excludes, collections, globals, mediaManifest`.
- **`/admin/trash`, six widths.** The row is 88px at 1440 and wraps to 155px at 1000 and 181px at
  412, with the actions dropping below the text rather than overflowing. §2.10's 46px thumb
  measures 46×46; the name is Caveat 27px; Put back has the dark ring and Delete for good the
  terracotta one, both 44px tall.
- **Put back and Delete for good.** Both work from the screen: the restored journey's `deletedAt`
  is cleared and the card falls back to its empty state; the destroyed one is gone from
  `journeys` entirely.
- **Console and network.** No `pageerror` and no failed response on any route, at any width,
  except the deliberate 500 in SET-003. The only console output is Next's own dev-server noise
  (`[HMR] connected`, `[Fast Refresh]`, the React DevTools notice).

## Not covered

- **Visual baselines.** Neither screen has one, and this sweep did not take one: baselines must be
  generated inside the pinned Linux container and eight screens already owe one, which Task 15 is
  taking together (`docs/deviations.md` §86).
- **Lighthouse.** Neither screen is in `lighthouserc.admin.json`, which carries eight URLs and is
  not this task's to edit. Same state as the Galleries screen (`docs/deviations.md` §80), and
  recorded rather than measured.
  **SUPERSEDED BY PHASE 4 TASK 15c**, which collects both screens and twelve others — fourteen
  URLs — and measured them: `/admin/settings` 137,907 script bytes and LCP 2,925.5ms,
  `/admin/trash` 137,907 and 2,926.6ms, both inside the gate. The sentence above stays as the
  sweeper wrote it because this document records build `404ebfe`, where it was true; this line
  is here so a reader looking up the config's state does not take a dated record for the
  current one.
- **The 500 in production mode.** SET-003 was observed against `npm run dev`; a production build
  answers the same status with a generic error page rather than the overlay. The fix removes the
  route to it either way.
- **A reader with JavaScript disabled.** The `type="email"` half of SET-003's fix is the browser's
  own constraint validation, which needs no JavaScript — but a client that posts the form
  directly still reaches the 500. That is the class SET-003 records, not the instance.
- **The storage bar with real content.** The dev library's 143 rows sum to under a tenth of a
  gigabyte, so the bar drew "0 GB of 100 GB" and two segments under a pixel wide. The shape at
  real sizes is `storageBar.test.ts`'s subject and `MaterialCard.test.tsx` draws §2.9's own
  example; what this sweep could not do is look at a full one.
