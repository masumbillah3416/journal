# Sweep: the Account screen (SCREENS.md §2.11) — 2026-09-29

**Build:** `c3d3256` **Engine:** playwright (chromium, scripted) **Routes walked:** 1 (`/admin/account`) at 7 widths
**Result:** 1 defect — S1:0 S2:1 S3:0 S4:0

Instrumented before walking: `console` (all levels), `pageerror`, and every response with a
status at or above 400. The only console output across every run was Next's own
`[HMR] connected` and React's DevTools notice; **no page errors and no failed responses at any
width or on any form submission**, including the two refused password attempts.

## Defects

### ACC-001 · S2 · Saving a new time zone leaves the select showing the OLD one, and the next Save writes that old one back

- **Route:** `http://localhost:3000/admin/account`, 1440x900 (reproduced at every width).
- **Steps:**
  1. Sign in as an account whose `users.time_zone` is unset (the select therefore reads `UTC`,
     this screen's fallback).
  2. Choose **Asia/Tokyo** in "Time zone".
  3. Press **Save changes** on the "Who is keeping this" card.
  4. Read the select.
  5. Press **Save changes** again without touching the select — which is what an author does when
     they go on to correct their name or sign-off.
- **Expected:** after step 3 the card redraws with what was stored. `SCREENS.md` §2.11 draws one
  Save for the card, and `docs/api.md`'s `GET /admin/account` says the screen's content is
  `readAccountScreen`'s `AccountView` — so the control must show the row.
- **Actual:** the row is written correctly and the screen is not. Measured in the same run:

  | measurement                                        | value        |
  | -------------------------------------------------- | ------------ |
  | `users.time_zone` after step 3                     | `Asia/Tokyo` |
  | server markup's `<option … selected>` after step 3 | `Asia/Tokyo` |
  | the select's `value` on screen after step 3        | **`UTC`**    |
  | the select's `value` after a full page reload      | `Asia/Tokyo` |
  | `users.time_zone` after step 5                     | **`UTC`**    |

  So the stored value and the delivered markup are both right, and the live control is wrong —
  it holds the value it MOUNTED with. The second Save then posts that stale value and silently
  reverts the author's choice. A reload hides it, which is why it survives casual clicking.

- **Cause:** `<select defaultValue={…}>` inside a form re-rendered by a Server Action. React
  restores an uncontrolled `<select>`'s selection during reconciliation, from the value it was
  mounted with; the sibling text inputs are not restored, which is why Name and Sign-off look
  right in the same render and hid this until the database was read.
- **Evidence:** `test-results/…/account-notice.png`; the table above, read in one run from
  Postgres (`payload.find`), from a fresh `fetch('/admin/account')` of the server markup, and
  from the live DOM.
- **Scope:** this screen's Time zone select is the only `<select>` this sweep drove. Any other
  admin `<select defaultValue>` inside a Server Action form has the same shape.
- **Class, checked rather than assumed.** `grep -rn '<select' apps/web/components apps/web/app`
  finds four in production code. Three — `FrameGrid.tsx`, `Dropzone.tsx`, `MediaGrid.tsx` — are
  `value=` + `onChange` inside declared client islands, so React owns their selection and there
  is nothing to restore. The fourth, `AboutCard.tsx`, is `defaultValue=""`: a CONSTANT sentinel
  meaning "keep the current portrait", so a restore to it is the state that card wants after a
  save. This screen's was the only instance.
- **Fixed in:** `fix(admin): keep the saved time zone on screen after a Server Action re-render`,
  by keying the `<select>` on the stored zone so the control is a new node whenever the datum
  moves. Guarded by `e2e/admin.spec.ts`'s `keeps the saved time zone on screen, so pressing Save
twice does not revert it` — a BROWSER case, because two jsdom re-render cases were written
  first and both passed against the defect.

## Clean

`/admin/account` at **1440, 1180, 1058, 900, 820, 700 and 412** CSS pixels:

- **Two equal columns / one column.** `1fr 1fr` down to a 776px container and a single column
  below it, which is §2.11's "two equal columns" at the rung `settings.module.css` converts the
  prototype's 820 into. The apparent inversion at 820 (two columns) against 900 (one) is the
  238px rail leaving the layout below its own breakpoint — 820 − 44 = a 776px container, 900 −
  238 − 44 = 618.
- **Current / New password in two columns above 900px.** Two columns at containers 656 and
  wider, one at 412. §2.11's viewport 900 converts to a 618px container and the transition is
  there.
- **The measurements §2.11 names.** Avatar 132x132; Name Caveat 26px; Sign-off Caveat 24px in
  `rgb(115, 98, 71)` = `#736247`; the session mark's own box 9x9 (its bounding rect reads 13
  because it is rotated 45°, as the Publish screen's identical mark does).
- **Hit targets.** Every switch 46x44 and every Revoke 182x44, against this repository's 44px
  `--td-min-hit-target`.
- **No horizontal page scroll and no overflowing select at any of the seven widths**
  (`scrollWidth === clientWidth` on both the document and the Time zone select).
- **Every toggle pressed TWICE** — `notifyOnPublish` true→false→true, `notifyWeekly`
  false→true→false, `otpRequired` true→false→true — with the OTP hint switching between
  §2.11's two sentences each time, and no stale state on the second press.
- **The password form's two refusals.** A wrong current password and an empty new password each
  redraw the card with the line that names them, at `?password=wrong-password` and
  `?password=empty-password`, with **no 500 and no page error** — this screen is not a sixth
  instance of `docs/deviations.md` §104.
- **A hand-typed notice.** `?password=<script>alert(1)</script>` draws no notice at all
  (`passwordNotice` refuses what it did not write).
- **Sign out everywhere.** From two browsers on one account: the pressing browser lands on
  `/admin/sign-in` and the other is redirected there on its next navigation.
- **The profile card's own write.** Name, sign-off and zone all reach `users` correctly — the
  defect above is the screen, not the write.

## Not covered

- **The sign-in screen's footer line.** `readSignInScreen` prints whether the code step is on for
  the LOWEST-ID account, and every fixture here is a fresh high-id account, so turning this
  screen's toggle off cannot be observed there. The authoritative-setting property is measured
  instead through the sign-in service itself
  (`apps/web/lib/admin/accountMutations.integration.test.ts`).
- **Revoking the CURRENT session** from its own row ("Revoke and sign out"). "Sign out
  everywhere" exercises the same revocation reaching the same browser; the single-row case would
  need a third context to be worth more than that.
- **Five wrong current passwords in a browser.** The lockout is measured against a real Payload
  in the integration suite; spending it here would leave a fixture account locked for fifteen
  minutes and flake whatever ran next.
- **A visual baseline.** Owed, with the other eight screens, under the pinned Linux container in
  Task 15 (`docs/deviations.md` §86).
- **Other admin `<select defaultValue>` controls** — see ACC-001's scope note.
