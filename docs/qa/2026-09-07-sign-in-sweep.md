# Sweep: sign-in — 2026-09-07

**Build:** d61ab9e **Engine:** playwright-headed (Chromium 1.62.1) **Routes walked:** 7 addresses × 3 viewport projects, plus one driven journey

**Result:** 3 defects — S1:0 S2:2 S3:1 S4:0

Viewports are `playwright.config.ts`'s three projects: `desktop` 1440×900, `mid` 1000×800,
`mobile` 390×844 (`isMobile`, `hasTouch`, DPR 3, iPhone user agent). `SCREENS.md` §3's own
breakpoint is 820px, so `desktop` and `mid` walk the wide layout and `mobile` the narrow one.

`console` (all levels), `pageerror`, `requestfailed` and every response ≥ 400 were attached
**before the first `page.goto` on each route**, per `CLAUDE.md` §10 and the skill's step 3.
axe-core ran against every one of the seven addresses at every one of the three viewports —
**21 analyses, full ruleset, no exclusions, zero violations.**

**Two builds were driven, and the distinction decides SIGNIN-002.** The walk and the driven
journey ran against `npm run dev` (Turbopack). The root cause of SIGNIN-002 was then
re-confirmed against a real `next build` + `next start` on the same seeded Postgres, because
this route has already once been a defect that existed only in a production build
(`docs/deviations.md` §33 / phase ruling F64 — the route rendered `○ (Static)` and its
countdown froze at build time). Both confirmations are quoted below.

The sweep driver was a temporary Playwright spec, deleted once this file was written — it is
a sweep engine, not a suite, and `e2e/ciRegistration.test.ts` correctly failed while it
existed. Its screenshots are committed under `docs/qa/assets/2026-09-07-sign-in/`.

Departures recorded in `docs/deviations.md` are not reported as defects. Four candidate
findings were dropped after reading it — the reset screen's "Nothing about the diary changes
until you use it." and "including the spam folder, where it usually is." (both verbatim from
the handoff's own `Travel Diary Login.dc.html`, so not drift at all), the reset-link screen's
entire existence (§36), and "Send it again" being a link rather than a second request (§37).

---

## Defects

### SIGNIN-001 · S2 · After the third wrong code the screen resets to a blank placeholder that contradicts what just happened — no message, the address replaced by `•••`, the counter back to `0 of 3`, the expiry back to `5:00`

- **Route:** `/admin/sign-in/code`, `desktop` 1440×900. The screen is server-rendered from
  the same read at every viewport, so this is viewport-independent.
  Confirmed on `next dev`; the read that causes it (`readCodeScreen.ts`) is the same module
  in both builds, and the production confirmation of its placeholder is under SIGNIN-002.
- **Steps:**
  1. Cold-load `http://localhost:3000/admin/sign-in`, sign in with an account that has
     `otpRequired` (the schema default), arriving at `/admin/sign-in/code`.
  2. Type six digits that are not the code. Press "Verify and sign in".
  3. Repeat twice more.
- **Expected:** the handoff's own prototype, `Travel Diary Login.dc.html` lines 317–321, sets
  the third refusal's error to **"Three wrong codes. Send a new one, or go back and try the
  password again."** and leaves `attempts` at 3, `left` (the expiry) running and `resendIn`
  untouched. `SCREENS.md` §3.2 gives the pane an error box and an attempts counter for
  exactly this. `SECURITY.md` §3 requires "Max 3 attempts per challenge, then invalidate it
  and force a resend" — the forcing is the part the reader has to be told about.
- **Actual:** the third refusal redirects to a screen that has forgotten the whole exchange.
  Recorded by the driver, verbatim:

  ```
  afterWrong1 = attempts "1 of 3 tried"
                error    "That code is not right. 2 attempts left."
                address  "sw•••@journey.task-ten-fixture.example"
                shaking  "true", cells cleared, focus on cell 0
  afterWrong2 = attempts "2 of 3 tried"
  afterWrong3 = attempts "0 of 3 tried"
                pane     "← Back to password Second step Check your email
                          A six-digit code went to •••. It expires in 5:00.
                          The code Verify and sign in Send again in 30s 0 of 3 tried"
  ```

  There is no error box, no shake, the masked address the reader was told to check is gone,
  the counter says they have three fresh guesses, and the countdown says the code they can
  no longer use expires in five minutes.

  **The server is correct and only the screen is wrong**, which is why this is S2 and not S1:
  the correct code offered immediately afterwards is still refused, and no session is issued —

  ```
  correctCodeAfterExhaustion = url    ".../admin/sign-in/code"
                               cookie unchanged (still the pre-auth identifier)
  ```

- **Root cause (read, not guessed):** `apps/web/lib/auth/readCodeScreen.ts:88-90`. A challenge
  that has spent `MAX_ATTEMPTS` is `'exhausted'`, so `otp.pendingChallenge` returns `null`,
  and the branch above returns the *no-challenge* placeholder —
  `{ maskedAddress: NO_PENDING_ADDRESS, issuedAt: renderedAt, attemptsSpent: 0 }`. That
  placeholder exists for a real reason the module's header states: refusing outright would
  make the screen an oracle for whether a browser holds a live challenge. But an **exhausted**
  challenge is a state the browser in front of the screen already knows it is in — it just
  typed three codes into it — so answering it honestly leaks nothing the reader did not
  supply.
- **Evidence:** `docs/qa/assets/2026-09-07-sign-in/journey-after-wrong-1.png` (the correct
  behaviour, for contrast) and `journey-after-wrong-3.png` (this defect). No console error,
  no page error and no response ≥ 400 anywhere in the journey — this is entirely silent.

### SIGNIN-002 · S2 · Every reload of the code screen without a live challenge restarts the 30-second resend cooldown and the 5:00 expiry from the render instant, so a reader who refreshes can never reach "Send a new code"

- **Route:** `/admin/sign-in/code`, all three viewports.
  **Confirmed on `next dev` AND on a production `next build` + `next start`.**
- **Steps:**
  1. Reach the exhausted state of SIGNIN-001 (or simply open `/admin/sign-in/code` in a
     browser holding no challenge — the placeholder is the same).
  2. Wait 31 seconds **without touching the page**. Read the resend button.
  3. Reload. Read it again.
- **Expected:** `SCREENS.md` §3.2's resend is "Send a new code" / "Send again in {n}s, inert
  during cooldown", and the cooldown it counts is `RESEND_COOLDOWN_MS` since the code was
  **issued** — the same thirty seconds `otpService`'s `canResend` enforces on the server. A
  reload does not un-issue a code, so it must not restart the wait. The same is true of the
  `{m:ss}` expiry: §3.2 prints when *the code* expires.
- **Actual:** the client ticker is correct and the anchor is not.

  ```
  afterCooldownWithoutReloading = resend "Send a new code"     disabled false
  afterCooldown  (same page, reloaded)  resend "Send again in 28s"  disabled true
  countdown                             beforeReload "5:00"   afterReload "5:00"
  ```

  Production build, two `GET`s of `/admin/sign-in/code` eight seconds apart on
  `next build` + `next start`:

  ```
  first fetch:   data-code-countdown="true">5:00<     Send again in 30s     0 of 3 tried
  second fetch:  data-code-countdown="true">5:00<     Send again in 30s
  ```

  A countdown that reads the same value eight seconds later is not counting down from
  anything; it is being re-anchored per render.
- **Root cause:** the same line as SIGNIN-001. `readCodeScreen.ts` returns
  `issuedAt: renderedAt` for the placeholder, and `CodeStep.tsx:260-261` derives **both**
  countdowns from `issuedAt` — `expiresIn` and `resendIn`. So for any request without a live
  challenge, "now" is the origin of both windows.
- **Why the two together are worse than either:** SIGNIN-001 hands the reader a screen that
  looks freshly loaded, which is precisely the screen a person refreshes. Every refresh puts
  the only way forward — "Send a new code" — thirty seconds away again. The escape is real
  and visible ("← Back to password"), which is why this is S2; the reader is not trapped, but
  they are told nothing true about why they are waiting.
- **Evidence:** the two transcripts above, and
  `docs/qa/assets/2026-09-07-sign-in/journey-after-wrong-3.png`.

### SIGNIN-003 · S3 · `CodeStep`'s "Three wrong codes" message cannot be reached in the delivered app, and the jsdom case that covers it passes anyway

- **Route:** not a route — `apps/web/components/admin/CodeStep.tsx:143` and `:184`.
- **Steps:** grep for `EXHAUSTED_MESSAGE`; then read `readCodeScreen.ts`'s two `return`s.
- **Expected:** a branch that exists is a branch a reader can reach. `CLAUDE.md` §3.2:
  "Delete dead code."
- **Actual:** `wrongCodeMessage` returns `EXHAUSTED_MESSAGE` when `attemptsSpent >= MAX_ATTEMPTS`,
  and `readCodeScreen` — the **only** producer of that prop in the app — can never return a
  value at or above `MAX_ATTEMPTS`, because such a challenge is `'exhausted'` and takes the
  placeholder's `attemptsSpent: 0`. The component's own suite passes it a 3 directly and the
  case is green; nothing renders that state in a browser, at either build.
- **Why it is reported rather than deleted:** it is the *right* copy, in the *right* place,
  taken verbatim from the handoff's prototype. It is unreachable because of SIGNIN-001, not
  because it is wrong — so the fix for SIGNIN-001 is what makes this branch live, and deleting
  it would be deleting the handoff's answer to the defect above.
- **Note for triage:** this is the same shape as the clamp deleted in Task 10's re-review
  (ruling F67) and the fourteen vacuous tests this phase has logged — a branch reported at
  100% coverage because the expression sits on an executed line, guarded by a test that can
  never be made to fail by anything the app does.

---

## Clean

Everything below was walked and found correct. Each line names what was checked, not merely
that a page loaded.

**Instrumentation, all 21 route × viewport walks and the driven journey**
- **0 page errors, 0 failed requests, 0 responses ≥ 400, 0 console errors or warnings.** The
  only console output on any admin route is React's own DevTools notice and Turbopack's
  `[HMR] connected`, both development-only.
- **0 axe violations, full ruleset, no exclusions**, at every one of the 21 combinations.

**`/admin/sign-in` (`SCREENS.md` §3, §3.1)**
- Shell 1020px wide at `desktop`, `min-height: 592px`, `border-radius: 4px`, two equal columns
  (`510px 510px`); 952px at `mid` (`476px 476px`) — the max-1020 and the fluid narrowing both hold.
- Cloth panel present and masthead absent above 820px; the exact opposite at 390px, where the
  shell is 342px (inside §3's 470px narrow maximum) and `min-height` is `0px`.
- Pane padding is `40px 42px 38px` wide and `26px 20px 24px` narrow — §3 calls the narrow value
  "required", and it is the value that keeps the OTP cells off 7px.
- Copy: "Welcome back", "Sign in", the remember-me checkbox, and the footer line
  "A one-time code is asked for after your password. Turn it off under Account → Getting in."
  Document title "Sign in — The back room".

**`/admin/sign-in/code` (§3.2)**
- Six cells, Courier 25px, `gap: 9px`, at **64px** (`desktop`), **58px** (`mid`) and **43px**
  (`mobile`) wide. The handoff's named defect is a collapse to 7px below 820px; the narrow
  layout is six 43px cells plus five 9px gaps inside a 302px pane, which is the padding doing
  its job.
- "← Back to password", "Check your email", "The code", "Verify and sign in", the resend button
  opposite the attempts counter.
- **The first and second wrong codes behave exactly as §3.2 specifies:** the shell shakes
  (`data-code-step-shaking="true"`), the cells clear, focus returns to cell 0, the counter
  decrements ("1 of 3 tried", then "2 of 3 tried"), and the error box reads
  "That code is not right. 2 attempts left."
- **The three-attempt limit holds server-side**, which is the whole point of prototype hole #3:
  the correct code offered after the budget is spent is refused, and the session cookie is
  unchanged.
- **No response body anywhere in the journey contains the code.** Every response the browser
  received was captured and searched: `codeInAnyResponseBody = []`.

**`/admin/reset` (§3.3)**
- Pending state: "Send yourself a way back in", an email field, "Send the link", and "The link
  works once and lasts an hour. Nothing about the diary changes until you use it."
- Sent state: `data-reset-state="sent"`, the green confirmation block, and the masked address
  `he•••@wanderings.travel`.
- **A hand-typed `?sent=hello@wanderings.travel` renders as `he•••@wanderings.travel`** — the
  screen re-masks whatever it is given rather than printing it, so the address bar cannot be
  used to put a whole address on the screen.

**`/admin/reset/<token>` (deviation §36)**
- A 40-hex token naming nothing renders `data-new-password-view="expired"`, "That link has
  expired", and "Send yourself another". No 404, no error, nothing about whether the token was
  ever real beyond what the same caller learns by posting to it.

**`/admin/sign-in/done` (§3.4)**
- Without a valid session the address redirects to `/admin/sign-in` — observed twice, both
  times because the driver's own cookie was scoped to `/` and the pre-auth identifier at
  `/admin` won the `Cookie` header, which is correct RFC 6265 ordering and not a defect. The
  status code of that redirect was not captured here; Task 10 measured it as `307`.
  With a valid session: 200, "Signed in" / "The back room is
  open", the **62×62px** ringed mark at every viewport, "Open the admin panel", "View the diary
  instead", "Sign out and start again".

**The overlapping order** — the handoff's own defect log records a shared timeout handle
leaving "Checking…" stuck forever. A reset was requested in a second tab while the code screen
sat open in the first; the reset reached its `sent` state, and the code screen's button still
read "Verify and sign in" and was still enabled. Nothing is stuck.

**The `localStorage` hole, against the built client bundle rather than the source** — a
production `next build`'s served output was searched for the prototype's key. `om-diary-otp`
appears in **no** file under `.next/static/**` (71 client chunks) and in no executable file
under `.next/server/**`; the only hits anywhere are Turbopack's own build cache and `.js.map`
source maps, which carry this repository's comments and are not code any browser runs.
`otpRequired` appears in no client chunk at all. The one client chunk that touches
`localStorage` belongs to Payload's own `/cms` admin.

---

## Not covered

- **The code screen at the moment of expiry.** Watching `{m:ss}` reach 0:00 needs a five-minute
  wait per viewport; the domain's `otpCountdown` has its own unit cases and
  `otpService.integration.test.ts` proves the server refuses an expired code. What is unproven
  here is what the pane *draws* at 0:00.
- **Firefox and WebKit.** Only Chromium is installed. **UNRESOLVED** — `npx playwright install
  firefox webkit` would settle it. This is the same limit Task 10 reported and declined to fake;
  the `Origin`-from-referrer-policy rule behind that task's blocker is Fetch-standard rather
  than Chromium behaviour, so the same result is *expected* on both, and expected is not measured.
- **The cell keyboard grammar** (typing advances, Backspace retreats, arrows move, Enter
  verifies, focus selects) and **paste**. Not re-walked here: `e2e/codeStep.spec.ts` drives all
  of it in a real browser, including the `onPaste` handler §3.2 warns `maxLength="1"` defeats.
- **`/admin/sign-in`'s refusal state** (`?state=refused`). Seen incidentally — a reused fixture
  address spent the limiter's 10-per-15-minutes address window and the form answered
  `?state=refused`, which is the limiter working — but not walked as a state of its own.
  `e2e/signIn.spec.ts` and `deviations.md` §40 cover the copy.
- **A real second factor completed at `mid` and `mobile`.** The journey was driven once, at
  `desktop`, deliberately: each run spends an account's hourly code ceiling, and the screens at
  the other two viewports are `e2e/visual.spec.ts`'s subject.
