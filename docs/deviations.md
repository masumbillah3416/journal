# Deviations from the handoff

Every departure from `handoff/design_handoff_travel_diary/` — and every deliberate,
documented exception to `CLAUDE.md` itself — is recorded here, per `CLAUDE.md` §1.1
(`// HANDOFF-DEVIATION: <reason>` in code) and §1.2. Entries 1–4 come from design spec
§15, which cross-references §2.1–2.3 and §7.1 for the detail; 5 onward were added as
later tasks found them. §5 is a correction record rather than an active deviation.

## 1 · Payload auth instead of Auth.js

**What changed:** `README.md` recommends Auth.js with credentials plus an email-OTP
provider. This project uses Payload's own `users` auth as the credential store and
password-step lockout mechanism, with a bespoke OTP layer built on top.

**Rationale:** `DATA_MODEL.md` specifies `auth: { tokenExpiration, maxLoginAttempts,
lockTime }` directly on the `users` collection, and `SECURITY.md` credits Payload's
`maxLoginAttempts`/`lockTime` for satisfying the account-lockout requirement on the
password step. Adopting Auth.js as well would mean two overlapping session systems in
one app — DATA_MODEL.md and SECURITY.md's already-specified configuration, plus a second
library doing the same job — for no gain. The conflict is resolved in favour of
DATA_MODEL.md and SECURITY.md, the more specific and more binding of the three sources.

**Recorded as:** `docs/adr/0002-auth-mechanism.md`; design spec §2.1.

## 2 · `sharp` in the worker instead of an image transform vendor

**What changed:** `README.md` suggests Cloudflare Images or imgproxy as a transform
layer for derivative image sizes. This project generates all five derivative tiers
(`thumb`, `tile`, `frame`, `hero`, `hero2x`) with `sharp`, inside the same Fly.io worker
container that already runs `ffmpeg` for video transcoding.

**Rationale:** The worker already exists for video processing; adding `sharp` to it is
additive infrastructure rather than a new service, and removes a vendor (no account,
billing relationship, or API surface to integrate and keep available). The cost of the
change is ~10GB of extra R2 storage, roughly $0.15/month, for storing five tiers instead
of transforming on the fly.

**Recorded as:** `docs/adr/0003-derivative-generation.md`; design spec §2.2.

## 3 · `prefers-reduced-motion` support

**What changed:** The handoff does not mention `prefers-reduced-motion` anywhere in
`README.md`, `SCREENS.md`, or the prototype files. This project adds it: under
`prefers-reduced-motion: reduce`, the page flip produces an instant page change — no
rotation, no travelling shade, no timers. The flip state machine skips directly from
`arming` to `committing` rather than running through `turning` and `swapped`.

**Rationale:** The flip is decorative; the content underneath it must stay reachable
regardless of a reader's motion sensitivity. This is an accessibility addition the
handoff does not call for, added because `CLAUDE.md`'s testing standard requires
accessibility checks on every route and the flip is the one interaction on the diary
most likely to trigger vestibular discomfort if forced on every reader.

**Recorded as:** design spec §2.3, §7.3.

## 4 · Book scale capped at 1.7×

**What changed:** The handoff's fixed-design-box scaling formula
(`scale = min(areaWidth/1300, areaHeight/860)`) is applied uncapped in the prototype.
This project caps the result at 1.7× and centres the book within its container above
that cap.

**Rationale:** `README.md` itself lists this under _Known gaps_: at 3840 CSS px the book
would scale up ~2.4× while the bookmark rail and bottom bar sit outside the `transform`
at fixed pixel sizes, so they look undersized next to a very large book. The handoff
suggests capping at ~1.7× and centring, or scaling the chrome with it; this project takes
the cap-and-centre option. The `hero2x` derivative tier (4000w) exists for the same
underlying problem on the image side — serving a sharp image at up to ~1.7× the design
box's native resolution.

**Recorded as:** design spec §7.1.

## 5 · Cover, Contents and About — not a deviation; a corrected model

**This entry used to record a real deviation and no longer does.** An earlier version of
`apps/web/scripts/seed.ts` seeded Cover, Contents and About as three `pages` rows
attached to the first journey (Tokyo), because `pages.kind` is `'notes' | 'frames'` and
`pages.journey` is required — there is no first-class way to store a page belonging to
the book as a whole. That was recorded here as a HANDOFF-DEVIATION.

**Why the model was wrong, not just awkward:** `DATA_MODEL.md` already gives all three a
proper home. Cover's fields (`title`, `subtitle`, `owner`, `coverCloth`, `yearsShown`) are
the `book` global. About's fields (`portrait`, `portraitCaption`, `paragraphs`, `kit`,
`replyTo`) are the `about` global. Contents is listed under "Derived, not stored" — it is
generated from the ordered journey list at render time and needs no row whatsoever. None
of the three wants a `slots` array, which is most of what a `pages` row actually is.
Attaching them to Tokyo as a workaround produced three rows whose `journey` relationship
was never meaningful, and would have made every future `pages.find({ where: { journey }
})` responsible for remembering to exclude them — a permanent foot-gun, not a temporary
one.

**The correction:** `seed()` now writes `bookGlobalSeed` and `aboutGlobalSeed` — verbatim
prototype content, transcribed to the same standard as the ten journeys — to the `book`
and `about` globals via `updateGlobal`, and creates zero `pages` rows for any of the
three. The seed produces exactly thirty `pages` rows (ten journeys × three), asserted by
`seed.integration.test.ts`. The handoff's "33 pages" describes the reading sequence —
Cover + Contents + thirty journey pages + About — which Phase 1's `bookBundle` assembles
by combining these thirty rows with the two globals and the derived Contents entries; it
was never a `pages` row count, and no schema change was needed to get there.

**Recorded as:** `apps/web/scripts/seed.ts`'s own header (the "CORRECTION" paragraph);
Task 11 of Phase 0, review round 1, finding 1.

## 6 · Media pipeline mode: the Fly.io transcode worker is deferred

**What changed:** the design spec (§2, §9, §13) and `docs/adr/0001-hosting-and-cost.md`
originally assumed a dedicated Fly.io worker running `sharp` + `ffmpeg` from the start.
A user decision made after those documents were written defers it: no video clips for
now. Stills still get all five derivative tiers via `sharp` (unchanged from
`docs/adr/0003-derivative-generation.md`), but in-process on Vercel rather than inside a
separate worker container. A `MEDIA_PIPELINE` environment variable (`'inline' |
'worker'`, Zod-validated, default `'inline'`) switches a new `MediaProcessor` port
between an `inline` adapter (the still pipeline only, no worker) and a `worker` adapter
(the still pipeline plus `ffmpeg` transcoding, on Fly.io) — the same Ports & Adapters
shape already used for `storage`/`mailer`/`queue`.

**Rationale:** this is not a departure from anything `handoff/design_handoff_travel_diary/`
mandates — the handoff's own non-goals already describe clips as silent ~20-second loops,
not a streaming feature, and never requires video to ship on day one. It is a departure
from this project's own earlier planning documents, made because deferring video removes
Fly.io — the one service in the stack that definitely bills regardless of usage — while
the requirement that enabling video later be a single configuration change, not a
rebuild, is satisfied for free: `apps/web/collections/media.ts`'s schema already carries
full clip support (`kind: 'still' | 'clip'`, `posterAt`, `posterImage`, `durationSec`,
and `video/mp4`/`video/quicktime` in `mimeTypes`), transcribed verbatim from
`DATA_MODEL.md` by Task 6 before this deferral was decided, so no migration is needed to
turn video on later. Both `MediaProcessor` adapters are required to pass the same
contract suite in CI from day one, even though only `inline` ever deploys before video
is re-enabled — a deferred path with no test rots invisibly, which this project has
already been bitten by twice (a migration that looked real because Payload's dev-mode
schema "push" had already built the schema before the migration ran, and a concurrency
test that kept passing after an earlier version had its guarding mechanism deleted from
the adapter under test).

**Recorded as:** `docs/adr/0004-media-pipeline-mode.md`; `docs/adr/0001-hosting-and-cost.md`
(revised cost consequences); `docs/adr/0003-derivative-generation.md` (revised, where the
still pipeline runs); design spec §4, §9, §13.

---

Everything else follows the handoff as written, including all copy. The voice is
deliberate — "nineteen tarts, no regrets" is content, not a placeholder, and is not to be
replaced or "improved" during implementation.

## 7 · Console mailer prints the OTP code to the developer's own terminal

**What changed:** `CLAUDE.md` §7 is unconditional — "never log secrets, tokens, OTP codes,
or full email addresses" — and `SECURITY.md`'s OTP requirements assume the code reaches
the recipient by email and nowhere else. `apps/web/lib/adapters/console-mailer.ts`, the
development stand-in for Phase 2's Resend adapter, deliberately breaks the first half of
that rule in one narrow case: when its `isDevelopment` option is true, the line it prints
to the terminal includes the message body, which for the only email this project sends is
the OTP code.

**Rationale:** in development there is no delivery channel. Nothing is wired to Resend,
no mailbox receives anything, and the code exists only inside the process that generated
it — so without this line a developer cannot complete the sign-in flow they are building
at all. The terminal it prints to is the developer's own, on their own machine, in a
process they started; it is not a log a third party reads, not shipped anywhere, and not
retained. That is a materially different exposure from the one §7 exists to prevent.

**Why it is safe to leave in:** three properties, and all three are tested.

- **It fails safe.** `isDevelopment` defaults to `process.env.NODE_ENV === 'development'`,
  so production — where `NODE_ENV` is `production` — takes the masked branch. The
  dangerous state requires an explicit opt-in, not merely the absence of a guard.
- **It is narrow.** The exemption covers the body only. The recipient address is masked
  to `m***@example.com` on *both* branches — asserted by its own test — so the one thing
  §7 says about addresses holds unconditionally, in development too.
- **It is the only one.** `eslint.config.js` carries a `no-console` override naming this
  single file rather than a blanket disable, so an accidental `console.log` anywhere else
  in the codebase is still a lint failure.

**One correction this deviation caused, worth recording.** The shared mailer contract
suite — whose "never records the message body, which carries the code" case is the §7
assertion itself — was first wired to `createConsoleMailer()` with no options, letting
`isDevelopment` default from the ambient `NODE_ENV`. That made a security assertion
environment-dependent: green on CI, red for any developer whose shell exported
`NODE_ENV=development`, reporting a leak that was not one. The wiring now passes
`isDevelopment: false` explicitly (`CLAUDE.md` §2.3: time and environment are injected),
and separate cases pin both branches. A fail-safe default is not a substitute for
injecting the value in a test.

**Recorded as:** `apps/web/lib/adapters/console-mailer.ts`'s module header;
`apps/web/lib/adapters/console-mailer.test.ts`'s header and its three
development-behaviour cases; `eslint.config.js`'s targeted `no-console` override;
`docs/testing.md` §3 (Contract).

## 8 · Page-edge turn strips are siblings of the page stack, not of the leaves

**What changed:** `README.md`'s "Triggers" gives the two page-edge strips a
`z-index: 900`, and the prototype (`Travel Diary.dc.html`, lines 300–301) renders them
as the last two children of the perspective container — siblings of the leaves
themselves. This project keeps the `z-index: 900`, both widths (44px forward, 30px
backward), the full-height span and the hover wash exactly as specified, and changes
one thing: the strips are children of the design box, siblings of the stack, aligned
to the page area by the same inset custom properties the stack uses.

**Rationale:** at `z-index: 900`, inside that container, neither strip can ever be
clicked. The handoff's own stacking table puts untouched leaves at `1000 - i`, which is
968 or higher for every page of a 33-page book, so the leaf the reader is looking at
always paints above a strip at 900 and intercepts the click. This is not a reading of
the spec — it was built the prototype's way first and measured: `e2e/flip.spec.ts`'s
first case timed out after 30s with Playwright naming the culprit,
`<article class="page">…</article> from <div data-leaf="2"> subtree intercepts pointer
events`. Moving the strips one level up puts their `z-index: 900` in the design box's
stacking context, where the stack is a `z-index: auto` element, so 900 is above the
whole stack and still below anything the chrome may later place over the book. The
alternative — keeping the prototype's parent and raising the strips above 1000 — would
have discarded the handoff's number rather than its DOM position, and would have put
the strips above the turning leaf as well.

**Consequence a future task needs:** the strips now lie over the right 44px and left
30px of the page area, so page content must stay clear of those bands. It already does
in every layout SCREENS.md §1 specifies — the tightest is About's `padding: 36px 48px
32px 54px` — but a future page that runs content to the page edge would find its clicks
swallowed there, and would need to say so rather than discover it.

**Recorded as:** `apps/web/components/book/book.module.css`'s `HANDOFF-DEVIATION` at
`.edgeLeft`/`.edgeRight`; `apps/web/components/book/Book.tsx`'s comment at the two
`<EdgeStrip>` elements; `apps/web/components/book/EdgeStrip.tsx`'s header;
`docs/testing.md` §4 (End-to-end).

## 9 · Contents column count follows SCREENS.md's formula, not its "verified" example

**What changed:** nothing about the algorithm — SCREENS.md §1.2's own formula is
implemented verbatim in `packages/domain/src/contentsLayout.ts`:

```
columns = ceil(entryCount / 11)
rows    = ceil(entryCount / columns)
```

What is *not* honoured is the sentence that closes the same section: "Verified: 31
entries render as 4 columns × 8 rows with zero overflow." For 31 entries this formula
gives **3 columns × 11 rows**.

**Rationale:** the two statements cannot both be true, for any entry count at all.
`columns = ceil(n / 11)` equals 4 only for n in 34–44; `rows = ceil(n / columns)`
equals 8 with 4 columns only for n in 29–32. Those ranges do not overlap, so
"4 columns × 8 rows" is unreachable under the stated formula — it is not a case this
implementation happens to miss, it is a case the formula cannot produce. The formula
was kept rather than the example, on three grounds: it is given as the algorithm, in a
code block, and an algorithm is the more precise of the two statements; the handoff's
own prototype runs exactly it (`Travel Diary.dc.html`:
`Math.max(1, Math.ceil(contents.length / 11))`, then
`Math.ceil(contents.length / nCols)`); and the section's *other* stated case — eleven
entries in a single column, which is what the seeded ten-journey book produces — holds
only under the formula.

**Consequence a future task needs:** the "zero overflow" half of that sentence is a
claim about geometry, and it is **unverified for 31 entries** either way. The seeded
book has ten contents entries, so the multi-column path is exercised by
`contentsLayout`'s unit tests but never rendered in a browser by any suite here. A
task that seeds more than eleven journeys must add a real overflow assertion on the
Contents body (`scrollHeight <= clientHeight`) at that count, and should re-read this
section of the handoff before assuming the row height still fits.

**Recorded as:** `packages/domain/src/contentsLayout.ts`'s `HANDOFF-DEVIATION` in its
module header; `packages/domain/src/contentsLayout.test.ts`'s thirty-one-entry case;
`docs/testing.md` §1 (Unit).

## 10 · Contents header is `align-items: flex-end`, not `baseline`

**What changed:** SCREENS.md §1.2 describes the Contents header as "flex, baseline"; the
implementation (`apps/web/components/pages/contents.module.css`, `.header`) uses
`align-items: flex-end`.

**Rationale:** the header's left-hand item is a two-line block — the "Index" eyebrow
over the 70px "Contents" heading — and CSS flex `baseline` alignment uses an item's
FIRST baseline set, which for a block container is derived from its first line box. So
`baseline` would align the right-hand italic note to the 11.5px eyebrow at the top of
the header, leaving it floating above the heading rather than sitting level with it.
Two other statements in the handoff resolve which was meant: SCREENS.md §1.3's Notes
header, which is the same arrangement one page later, spells it out as "flex,
`align-items: flex-end`"; and the prototype's own Contents header
(`Travel Diary.dc.html`) uses `align-items: flex-end` too. "Baseline" reads as loose
prose for "bottom-aligned" in a section whose every other value is exact.

**Consequence a future task needs:** none for layout. If a future design genuinely
wants the note aligned to the eyebrow, that is a different arrangement and needs the
left block's two lines split into separate flex items, not a one-word change.

**Recorded as:** `contents.module.css`'s `HANDOFF-DEVIATION` at `.header`; this entry.
