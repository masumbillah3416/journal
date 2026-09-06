# Deviations from the handoff

Every departure from `handoff/design_handoff_travel_diary/` — and every deliberate,
documented exception to `CLAUDE.md` itself — is recorded here, per `CLAUDE.md` §1.1
(`// HANDOFF-DEVIATION: <reason>` in code) and §1.2. Entries 1–4 come from design spec
§15, which cross-references §2.1–2.3 and §7.1 for the detail; 5 onward were added as
later tasks found them. §5 and §16 are correction records rather than active
deviations, and §11 is a withdrawn one. The later entries include departures from
`CLAUDE.md` and from this project's own task plan rather than from the handoff, which is
what the second clause of the sentence above is for.

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

## 11 · WITHDRAWN — all three font families are self-hosted

**This is no longer a deviation.** Courier Prime 400/700 and EB Garamond's italic face
were deferred through Phase 1 on a measured LCP constraint; they are now wired in
`apps/web/app/(diary)/fonts.ts` and all three `--td-font-*` tokens are redefined in
`apps/web/app/(diary)/diary.css`. Every diary page renders the handoff's own
typography. Nothing here departs from `handoff/design_handoff_travel_diary/README.md`'s
Type section any more, so the entry's substance has been deleted rather than amended.

The number is retained rather than renumbered because §12 and §13 are cross-referenced
by name from `cover.module.css`, `notes.module.css`, `e2e/a11y.spec.ts`,
`e2e/visual.spec.ts` and `docs/testing.md`, and silently shifting them would be a worse
outcome than an explicit tombstone.

**Two things a future reader still needs, both of which moved rather than vanished:**

1. **The LCP cost was real and still reproduces.** Four faces measure 2,637.4ms and
   five measure 2,933.8ms on `/p/1`, against 2,488.2ms for two, on CLAUDE.md §6's
   2,500ms gate. The faces were wired in anyway, because a minimal fontless route in
   this same app already measures 2,023.2ms of that budget and the observed paint is
   ~130ms in every configuration. The full working, the options, and the fact that the
   gate is left **red and unraised**, are in
   `docs/adr/0008-lcp-budget-and-the-framework-floor.md`;
   `docs/adr/0005-font-hosting.md` carries the amended decision record.
2. **What is still not loaded, and why it is not a deviation.** EB Garamond 500/600 and
   Caveat 500-700 do not load and no `.woff2` for them is committed. No rule anywhere
   under `apps/web/components` sets those weights, so nothing renders in a fallback for
   want of them — this is CLAUDE.md §4's YAGNI, not a reduction in fidelity. The moment
   a component sets one, `fonts.ts`'s header names the variable file to swap in.

## 12 · The cover's cloth stays opaque across its gradient, and the years line's alpha is `.78`

**What changed:** two values from `SCREENS.md` §1.1's cover specification, and only these
two.

1. The full-bleed cloth's gradient end stop, `rgba(0,0,0,.28)`, is now **opaque**:
   `linear-gradient(160deg, {cloth} 0%, color-mix(in srgb, {cloth} 72%, #000) 130%)`. That
   end colour is what the handoff's own 28%-opaque black *resolves to* on the cloth — the
   same tone, no longer letting anything through it.
2. The years line's colour is `rgba(238,220,180,.78)`, not §1.1's `rgba(238,220,180,.5)`.
   `.78` is the alpha the subtitle already carries, so no new value enters the palette.

Everything else on the cover — every other colour, size, letter-spacing, margin, inset and
piece of copy — is §1.1's, unchanged.

**Rationale:** four of the cover's five lines failed WCAG 2.1 AA using the handoff's
literal values. Measured from the rendered pixels in a real browser at all three viewport
projects, not estimated (`e2e/support/coverContrast.ts`); the `desktop` figures below are
the tightest of the three:

| Cover line | Size | Before | After | Required |
|---|---|---|---|---|
| "Travel Diary" eyebrow | 12px | **2.86:1** | 4.52:1 | 4.5:1 |
| "Wanderings" title | 124px | 3.81:1 | 8.13:1 | 3:1 |
| Subtitle | 22px italic | **2.72:1** | 5.33:1 | 4.5:1 |
| "Kept by {owner}" | 12.5px | **2.37:1** | 4.73:1 | 4.5:1 |
| Years | 12.5px | **1.87:1** | 5.26:1 | 4.5:1 |

Only the 124px title is large text under SC 1.4.3, which needs 24px or 18.66px bold — the
22px italic subtitle does **not** qualify for the 3:1 exemption and is held to 4.5:1 like
the three Courier lines.

The cause was in the specified gradient rather than in the transcription; the handoff's
own prototype renders the same way. `linear-gradient(160deg, {cloth} 0%,
rgba(0,0,0,.28) 130%)` interpolates from an *opaque* colour to a 28%-opaque black, so the
cloth's own alpha falls to about `.72` by mid-page and the light paper face beneath the
cover shows through, lifting the background from `#2f4a47` to roughly `#5e6d67` exactly
where the small Courier lines sit. Making the end stop opaque removes that wash and clears
four of the five lines on its own. The years line is the one it does not rescue: at `.5` it
reaches only about 3.2:1 even against the corrected background — no alpha fixed it at the
old lightness, and `.78` is what clears it at the new one.

**Who decided, and why it is recorded rather than taken quietly:** raising a handoff colour
is a design decision, not a transcription one. Task 9 measured the failure, declined to fix
it unilaterally and reported it to the design owner (`docs/testing.md` §6, finding 2; Task
9's report §7.1). **The user approved this departure from the handoff's literal cover
values in order to meet AA**, choosing to darken the cloth and keep the handoff's text
colours rather than lighten the text.

**Consequence a future task needs:** the eyebrow clears its floor at **4.52:1** on the
`desktop` project — the narrowest margin on the page, because it is the topmost line and
so sits on the lightest end of the cloth. Any change to the cloth gradient, to the 45°
texture overlay above it, or to that line's own alpha must be **re-measured** rather than
reasoned about. `e2e/a11y.spec.ts`'s cover case is what catches it, and it asserts a floor
(`ratio >= minimumRatio`) rather than a pinned number, so it fails only when a line
actually drops below AA rather than on anti-aliasing noise. The end stop uses CSS
`color-mix()` (Chromium 111, Safari 16.2, Firefox 113), written that way rather than as a
literal so the darkened tone still follows whichever cloth an editor picks in the `book`
global.

**Recorded as:** `apps/web/components/pages/cover.module.css`'s header table and its two
`HANDOFF-DEVIATION` notes (at `.cover` and at `.years`); `e2e/a11y.spec.ts`'s cover
contrast case; `e2e/support/coverContrast.ts`'s header (the measurement method);
`docs/testing.md` §6, finding 2.

## 13 · The Notes page follows `SCREENS.md` §1.3 where the prototype's own markup differs

**What changed:** three places where `SCREENS.md` §1.3 and
`handoff/design_handoff_travel_diary/Travel Diary.dc.html` do not agree, plus one
accessibility decision the prototype could not express. `SCREENS.md` is the design
source of record for this task, so it wins each disagreement; each is recorded here
because the prototype is part of the same handoff directory.

1. **The left column's order is the spec's, not the prototype's.** `SCREENS.md` §1.3
   numbers the left column's five children explicitly — eyebrow, highlight list, rule
   and note, **tally ticket**, then **ephemera slot**. The prototype's DOM puts the
   ephemera scrap *above* the tally ticket. The spec's order is used. Both orders behave
   identically under the flex rules the same paragraph gives (the scrap is the only
   `flex: 1` child either way), so this is a visual ordering choice, not a layout one.

2. **The tally ticket's dotted rule sits between cells, not before each one.**
   `SCREENS.md` §1.3 says "four equal cells **divided by** `1px dotted`"; the prototype
   puts `border-left` on every cell including the first, which draws an opening rule
   with nothing to its left. The divider is `.tallyCell + .tallyCell` here, so four
   cells carry three rules. `e2e/notes.spec.ts` asserts the first cell has none.

3. **"See full gallery" is an anchor, not a button with a handler.** The prototype uses
   `<button onClick>`; `README.md`'s own routing note requires real paths ("In
   production use real paths (`/p/12`, `/gallery/tokyo`) rather than hashes"), and the
   handoff's defect log records gallery buttons that "appeared dead while their handlers
   were fine". It links to `/gallery/<slug>`, which is the route Task 14 builds — a
   real, inspectable, indexable target rather than a click that goes nowhere, and it
   costs the diary route no client JavaScript.

4. **The ephemera scrap has an empty `alt`, not the prototype's `role="img"
   aria-label="Pasted ephemera"`.** `ephemera` is a fixed role in the schema, and the
   thing in the slot is a texture behind tape rather than a photograph with a subject —
   the seed says as much where it creates one. An empty `alt` takes it out of the
   accessibility tree, which is what a decorative image should do; announcing "Pasted
   ephemera" between the tally ticket and the page's footer would be noise. The hero
   photograph keeps the slot's own alt text, because that one is content.

**Rationale:** `SCREENS.md` is named as the source of record and is the more precise of
the two documents in each case above. Nothing here changes a measurement, a colour or a
line of copy — every one of those is transcribed from §1.3 exactly.

## 14 · A long mood or weather label shrinks to fit its 98px badge, rather than overflowing it

**What changed:** `SCREENS.md` §1.3 gives the Notes page's mood and weather badges as
"two 98px circles" with a "Courier 11px `.08em`, centred, `0 9px`" label, and states no
exception. With all three font families self-hosted
(`docs/adr/0008-lcp-budget-and-the-framework-floor.md`), a label of ten or more
characters overflows that circle — measured in the pinned
`mcr.microsoft.com/playwright:v1.62.1-noble` container, the seeded mood "OVERWHELMED"
(Marrakech, 11 characters) rendered its label at 105px against a 96px inner circle, 9px
over, with its first and last letters sitting on the dashed ring. This is now handled:
`badgeLabelFontSize` (`packages/domain/src/badgeLabelFit.ts`) shrinks a label's
`font-size` — nothing else — once it would overflow at the handoff's 11px, set inline by
`MoodBadge.tsx` and `WeatherBadge.tsx` the same way `Cover.tsx` sets the cover title's
size from `fitTitleSize`. Every label at or under the fitting threshold (nine of the ten
seeded moods, and all ten seeded weather lines) still renders at exactly 11px/`.08em`,
untouched.

**What did NOT change:** the 98px circle, its border, its rotation and its background
are exactly `SCREENS.md` §1.3's. Both badges stay the same size as each other and as
every other journey's. The label's padding (`0 9px`) is untouched — only its font size
steps down, and `letter-spacing` is left at the handoff's `.08em` because it is an em
unit and already shrinks in lockstep with the font size; a second lever on top of that
would only fight the first.

**Rationale:** three ways out were on the table — shorten the seeded mood word, widen
the badge past 98px, or shrink the label past a length threshold — and none is free of
a real tradeoff, which is why `notes.module.css`'s header left the question open rather
than settling it unilaterally. The circle's size is load-bearing in a way its label's
size is not: the weather and mood badges sit side by side in a fixed-width header row,
so growing one to fit its own worst-case label changes the row's balance and can push
the journey name — a change nobody asked for, to fix a problem confined to one editor's
word choice. Shrinking the label instead costs nothing structural: it is presentational,
it is deterministic (a pure function of the label's length,
`packages/domain/src/badgeLabelFit.ts`, with its own 100%-covered suite), and it is
provably contained to the labels that actually need it.

**Who decided, and why it is recorded rather than taken quietly:** stepping a stated
type size down for some inputs and not others is a design decision, not a transcription
one — the same category `docs/deviations.md` §12 records for the cover's contrast fix.
**The owner approved this departure from SCREENS.md §1.3's unconditional 11px label,**
choosing to shrink long labels rather than widen the badge or edit the seed data.

**Consequence a future task needs:** any journey whose mood or weather line is edited
past nine characters (Courier Prime's measured 7.9px/character makes ten the first
length that overflows at 11px) will render its badge label smaller than 11px, by design
— this is not a bug to "fix" by reverting the label to a fixed size. `e2e/notes.spec.ts`
measures the rendered label against the rendered circle's own inner diameter (not a
fixed pixel width) for every seeded journey's mood and weather line, so a future label
long enough to defeat even the floored minimum (`BADGE_LABEL_SIZE.min`, 8px) would fail
there rather than silently overflow.

**Recorded as:** `packages/domain/src/badgeLabelFit.ts` and its test suite;
`apps/web/components/pages/MoodBadge.tsx` and `WeatherBadge.tsx`'s headers;
`apps/web/components/pages/notes.module.css`'s `.badgeLabel` comment;
`e2e/notes.spec.ts`'s "a long badge label shrinks to fit" cases.

---

## 15 · The bookmark tab's sub-line is `--td-ink-body` at `.78`, not the tab's ink at `.62`

**What changed:** one value pair on one element — the second line of a bookmark rail tab
(`SCREENS.md` §1.7: "sub in Courier 8.5px `.14em` uppercase at `opacity .62`"). It now
carries an explicit `color: var(--td-ink-body)` and `opacity: .78`, instead of inheriting
the tab's own ink at `.62`.

Everything else in §1.7 is unchanged and literal: the 158px rail, the `padding-top: 4px`,
the Courier 9.5px `.22em` eyebrow, the 6px gap, `border-radius: 0 6px 6px 0`, padding
`9px 10px 9px 0`, the 6px tint bar at `opacity 1`/`.5`, the name in Caveat 24px, the
active tab's `#fbf6e9` fill, `translateX(-6px)`, `0 3px 12px -5px rgba(60,44,20,.5)` and
1px inset ring, the inactive `rgba(120,98,60,.07)`, and `transform 180ms, background
180ms`. The bar's 58px and the ribbon's every value are also unchanged — see below for
why the 58px one is called out.

**Rationale:** the handoff's literal value fails WCAG 2.1 AA, and it fails it on every
diary route at every viewport. Measured by axe-core in the pinned Playwright container
(`mcr.microsoft.com/playwright:v1.62.1-noble`), not estimated — the run failed 18 of 24
cases in `e2e/a11y.spec.ts` with two distinct findings, one per tab state:

| Tab state | Composite foreground | Background | Measured | Required |
|---|---|---|---|---|
| Inactive (`--td-ink-diary-muted` at `.62`) | `#a99f8d` | `#f6f4f1` | **2.38:1** | 4.5:1 |
| Active (`--td-ink` at `.62`) | `#7f857e` | `#fbf6e9` | **3.50:1** | 4.5:1 |

8.5px is not large text under SC 1.4.3 by any reading, so 4.5:1 is the floor. Raising the
opacity alone cannot reach it: the inherited inactive ink (`#7a6b50`) measures 4.43:1
*solid*, so no opacity at all clears 4.5 over paper. The colour therefore had to move too.
`--td-ink-body` at `.78` measures ~5.0:1 in both states, and `.78` is the same lever and
the same number §12 above used for the cover's years line, so no new value enters the
palette.

**What was rejected:** (1) leaving the handoff's value and adding `color-contrast` to
`expectNoAxeViolations`' `allow` list — that list is scoped to Payload's own generated
markup and `e2e/a11y.spec.ts` says in three places that a diary route must never inherit
it; silencing a rule on our own markup is the opposite of what it is for. (2) Dropping the
opacity entirely and using a solid `--td-ink-body`, which measures 9.05:1 — accessible,
but it makes the sub as loud as the name and loses the hierarchy §1.7 is describing. `.78`
keeps the line quieter than the name while clearing the floor.

**Who decided:** this one has NOT been put to the owner, unlike §12 and §14. It is
recorded as a measurement-forced change rather than a design choice: `CLAUDE.md` §2
requires the handoff's contrast ratios to be asserted rather than assumed and
`e2e/a11y.spec.ts` to be green with no exclusions on any diary route, and there is no
value of `opacity` that satisfies both those rules and §1.7's literal colour. If the owner
prefers a different resolution — a darker base ink for the whole rail, or a larger sub —
this entry is the place to change.

**Consequence a future task needs:** the mobile reading mode's drawer (`SCREENS.md` §1.10)
renders the same tab list on `#3b332a` at 26px Caveat with 13px rows. That is a different
background and a different size, so it needs its own measurement rather than this value
copied across.

**Recorded as:** `apps/web/components/chrome/chrome.module.css`'s `HANDOFF-DEVIATION`
comment at `.tabSub`; `e2e/a11y.spec.ts`'s six diary cases, which are what failed.

---

## 16 · NOT a deviation — the bottom bar is `SCREENS.md` §1.7's literal 58px again

Recorded here because the departure it closes was carried for two tasks with only a code
comment behind it, and a reviewer was right to say that is how drift accumulates.

**What happened:** Task 8 gave the bar `flex-wrap: wrap` and `min-height: 58px` in place
of §1.7's `58px`, so at the `mobile` project's 390px it could grow past the stated height.
That was a real fix for a real defect: the 158px rail leaves the bar 232px, its contents
need 338px (44 + 20 + the handoff's 210px readout + 20 + 44), and unwrapped the next arrow
spilled out of the centred row and **under the rail**, which then intercepted every click
on it. It was caught by `e2e/flip.spec.ts`'s bottom-arrow case on the `mobile` project,
not by eye.

**What Task 12 changed:** the height is back to a literal `height: 58px`, and the control
stays reachable because the READOUT shrinks instead of the row wrapping —
`flex: 0 1 210px` with `min-width: 0`, so the handoff's 210px is a basis rather than a
floor, and the counter and page label ellipsis inside whatever is left. At 390px that
leaves the readout roughly 104px between two 44px arrows that are both fully in the bar.

The prototype's `padding: 0 20px` on the bar went with it — `SCREENS.md` §1.7 states no
padding for this bar, and 40px of inline padding on a centred row changes nothing at any
width with room to spare. At 390px it was 40px of the 232px the bar has, and the
difference between a counter reading `01 / 33` and one reading `01 / …`; the first
regenerated `mobile` baseline is what showed it.

**Why this is the right resolution rather than a deviation entry:** §1.7's chrome is the
layout for the desktop book, and below 860px the specified layout is not this bar at all
but `SCREENS.md` §1.10's mobile reading mode ("No book, no flip, no scaling"), which has
its own bar. A squeezed readout at 390px is therefore a transitional state on a screen
whose real design has not been built yet, and it costs no control and no stated
measurement. Wrapping cost a stated measurement; shrinking does not.

**Proof, at all three viewport projects:**
`e2e/chrome.spec.ts`'s "keeps the bottom bar at the handoff's 58px, and both arrows
reachable inside it" asserts the measured row height and a hit test on each arrow's own
centre **in one assertion**, because a 58px bar with an arrow under the rail and a
reachable arrow in a bar that grew are the two failures it exists to tell apart. Verified
red before green: with Task 8's `flex-wrap` and `min-width: min(210px, 100%)` restored,
that case fails on `mobile` and passes on `desktop` and `mid`, which is exactly the shape
of the original defect.


---

## 17 · NOT a deviation — the lightbox's Download goes through our own handler, because `SECURITY.md` says it must

**Handoff, `SCREENS.md` §1.9:** "Download (an `<a download>` — must serve a derivative,
never a bucket URL)."

**Handoff, the prototype (`Travel Diary.dc.html`, the `showLb` block):**

```html
<a href="{{ lbSrc }}" download="{{ lbFile }}" ...>Download</a>
```

`lbSrc` is the image itself. The two halves of the handoff disagree: `SCREENS.md` and
`SECURITY.md` both require a handler of ours, and the prototype links straight at the
file. **`SECURITY.md` wins**, and this entry exists so that reading the prototype later
does not look like finding a regression:

> the gallery's download action must serve a derivative **through your own handler**,
> not a bucket URL. Direct URLs invite enumeration of everything in the bucket,
> including anything marked hidden.

**What was built:** `GET /gallery/<slug>/download/<id>`
(`apps/web/app/(diary)/gallery/[slug]/download/[id]/route.ts`), documented in full in
`docs/api.md` and `docs/security.md`. The lightbox's `href` is
`galleryDownloadPath(slug, id)` — root-relative, both segments percent-encoded, so it
carries no scheme and no authority and cannot resolve to `MEDIA_ORIGIN`.

**One thing `docs/api.md` used to promise that this route does not do: a short-lived
signed URL.** The planned entry said "a short-lived signed URL with
`Content-Disposition: attachment` and a strict `Content-Type`". The route serves the
bytes directly instead, and that is a deliberate simplification rather than an omission.
A signed URL is what you reach for when the *store* is the thing answering the request
and your app is only issuing permission — the signature is the permission travelling
without you. Here the app is already in the request path: it has just done four database
checks (published journey, right journey, not hidden, downloads allowed) and it holds
the bytes. Redirecting to a signed URL after all that adds an expiry window to reason
about and a second origin to configure, and removes no hop. When the store becomes
Cloudflare R2 in Phase 3 the trade may change — `StoragePort.signedUrl` already exists
for exactly that — and this entry is where to start when it does.

---

## 18 · The lightbox's clip transport is not built, and lands with video

**Handoff, `SCREENS.md` §1.9:** "Clip transport (clips only): 44px play/pause (two 4×15px
bars, or a 13px triangle), a 3px scrub track with a `#c9b48a` fill, elapsed/total in
Courier 11.5px."

**What was built:** nothing. `Lightbox.tsx` renders an `<img>` and no transport.

**Why.** Video is deferred behind one flag (`docs/adr/0004-media-pipeline-mode.md`,
`MEDIA_PIPELINE=inline`): there is no transcode worker, no poster extraction and no
`durationSec` written by anything, so no `media` row can carry `kind: 'clip'`. A play
button, a scrub track and an elapsed readout over a photograph would be three controls
that do nothing, wired to a `<video>` element with no source — untestable in a browser,
and exactly the "dead control" class of defect the handoff's own log is full of. It is
not a smaller version of the feature; it is furniture.

**What WAS built, so the seam is real rather than notional.** The two decorations
`SCREENS.md` §1.8 gives a clip in the GRID — the 46px play badge and the duration chip —
are implemented in `Tile.tsx` behind `frame.kind === 'clip'`, and the format they print
is `clipDuration` in `packages/domain/src/gallery.ts`. Both are covered by
`Tile.test.tsx` and `gallery.test.ts` against clip-shaped fixtures. Neither can be
reached in a browser today, and no clip was faked in the database to pretend otherwise:
`apps/web/scripts/seed.ts` seeds every gallery frame as `kind: 'still'`, even though the
prototype marks every seventh as a video (`vid: i % 7 === 5`).

**When it lands:** with the transcode worker, when `MEDIA_PIPELINE=worker` is switched
on. `Lightbox.tsx`'s header names this deferral at the point a future reader would look
for the transport.

---

## 19 · The gallery tile's caption element is rendered even when the caption is empty

**Handoff, `SCREENS.md` §1.8:** "caption below truncated to one line."

**The project's own standing policy**, applied by `Cover.tsx`, `Notes.tsx`,
`PhotoMount.tsx` and `About.tsx`: an empty optional line prints *nothing* — not an empty
element — because none of those fields is `required: true` and an editor who has not
filled one in is an ordinary state, not a corrupted row.

**The gallery tile is the one place that policy is not applied**, and the reason is
geometry rather than content. The tiles sit in a `repeat(auto-fill, minmax(...))` grid
whose rows size to their tallest item. Dropping the caption element from one tile makes
that tile shorter than its neighbours, and the whole ROW of tiles then sits in a track
sized by the captioned ones, with the uncaptioned tile's square floating in it. One
uncaptioned photograph would therefore change the layout of four or five others.

`gallery.module.css`'s `.tileCaption` carries `min-height: 1.35em`, so the element
reserves its single line whether or not there is anything in it, and the element itself
is always rendered. It contains no filler text — it is empty, not padded — so nothing is
printed that an editor did not write.

**What this entry does NOT say**, added when PH1-002 was triaged because the sentence
above was being read more widely than it was written. "Nothing is printed that an editor
did not write" is about the caption ELEMENT's geometry, and it assumes the tile is a
photograph an editor put in the gallery. It is not a sanction for an empty caption
wherever one appears: an empty caption on a row that no editor placed and that is not a
photograph at all was a real defect, and the empty caption was the symptom that showed
it (`docs/qa/2026-09-03-phase-1-closing-sweep.md` PH1-002, fixed by excluding the row
rather than by captioning it). This entry stands unchanged for the case it examined — an
editor who has not captioned a photograph.

---

## 20 · One journey's gallery is seeded in full, not all ten

**Handoff, the prototype (`Travel Diary.dc.html`):** every journey carries a gallery
`count` — Tokyo 52, Lisbon 46, Patagonia 61, Marrakech 38, and a value per row in its
`MORE` table — and `gallery(j)` generates that many frames, cycling an eight-caption
list.

**What was seeded:** Patagonia's 61, verbatim (its own eight captions, cycled exactly as
`caps[i % caps.length]`). The other nine journeys keep the nine frames their book pages
print, so their galleries hold nine.

**Why.** `SCREENS.md` §1.8 records one number as verified — "Verified with 61 tiles;
must stay square and unsqueezed at 40+" — and §1.9 prints `003 / 061`. Patagonia is the
prototype journey whose count is that number, so seeding it in full is what gives
`e2e/gallery.spec.ts` the grid the design was actually verified against. Seeding the
other nine would add roughly four hundred more placeholder renders to every `npm run
db:seed` and every CI browser job, and would gate nothing that Patagonia's sixty-one
does not already gate. `apps/web/scripts/seed-data.ts`'s `gallery` field is per-journey,
so adding another is one object literal if a future task needs one.

**Sixty of Patagonia's sixty-one rows are photographs, and the gallery shows sixty.**
The sixty-first is the Notes page's decorative ephemera scrap. It is seeded as an
ordinary `media` row carrying the journey (it has to be — it is an upload the page
prints), and `IN_BOOK_SLOTS` counts it among the nine the book itself uses, so the
prototype's count of 61 was reached with it included. It is not a photograph
(§13.4), so it is not a gallery frame: `apps/web/lib/galleryFrames.ts` excludes it from
the grid, from the lightbox, from the download handler and from the census the Notes
page footer prints, and Patagonia's gallery is therefore sixty tiles. §1.8's verified
bar — "must stay square and unsqueezed at 40+" — is still cleared, and §1.9's
`003 / 061` was always the counter's three-digit FORMAT rather than a required total.
The other nine journeys show eight, not nine, for the same reason. Recorded here rather
than left to be rediscovered: the number in this entry's own heading changed meaning,
not the seed. See `docs/qa/2026-09-03-phase-1-closing-sweep.md` PH1-002.

**No clips, in any of them** — see §18.


---

## 21 · The lightbox's metadata line is cream at 58%, not 45%

**Handoff, `SCREENS.md` §1.9:** "then metadata in Courier 10px `.24em` uppercase at 45%
— `{Journey} · {Place} · frame 007`."

**What was built:** the same line at **58%**.

**Why.** At 45%, `--td-cream` (`#f6ecd6`) over the lightbox's own
`rgba(26,22,17,.95)` scrim — itself over the gallery's white `--td-outer` — computes to
`#837d70` on `#25221d`. axe measures that at **3.87:1**, against the 4.5:1 WCAG 2.1 AA
minimum for 10px text (the large-text exemption needs 24px, or 18.66px bold, so a 10px
line does not qualify for 3:1). It is a real violation, found by
`e2e/a11y.spec.ts`'s "has no axe violations with the lightbox open over that gallery"
case at the `desktop` and `mid` projects, and CLAUDE.md §2 requires the handoff's
contrast to be **asserted, not assumed**.

58% reaches **5.47:1** over the same stack. The intermediate values were computed rather
than guessed: 50% is 4.44:1 (still short), 52% is 4.68:1 (clears, with no margin at all),
55% is 5.07:1. 58% was chosen for margin against a future change to the scrim's own
opacity, while staying at the "dimmed, secondary" weight the design is asking for — it is
still visibly quieter than the counter above it (cream at 70%) and the caption beside it
(cream at 100%).

**Precedent, and the reason this is a deviation entry rather than a silent edit:** §12
did the same for two of the cover's own values and §15 for the bookmark tab's sub-line.
The handoff's colour choices are design decisions and are followed everywhere they clear
AA; where a stated value measurably does not, the value moves and the change is written
down here with the measurement that forced it.

**Not changed:** the counter (cream at 70%, 12px), the Download and Share controls (cream
at 100% with a 40% border) and the caption (cream at 100%, Caveat 28px) all clear AA at
the handoff's own values, and axe flagged none of them.

---

## 22 · The bookmark drawer's tab list is painted for a dark panel, not reused from the paper rail

**Where:** `apps/web/components/mobile/mobile.module.css` — `.drawerTab`,
`.drawerTabActive`, `.drawerTabName`, `.drawerTabSub`, `.drawerTabTint`.

**What the handoff says.** `SCREENS.md` §1.10 gives the drawer as "an 82%-wide panel
capped at 320px (`z-index: 810`) on `#3b332a`: header with 'Bookmarks' and a 34px close,
then the tab list at 26px Caveat with 13px rows." It states the panel's background, the
list's size and its row height, **and nothing at all about the tabs' colour.** The
prototype fills that silence by reusing the desktop bookmark rail's own tab styles inside
the drawer (`Travel Diary.dc.html`: the drawer's `<button>` takes `t.style`/`t.name`
straight from the shared `tabDef`).

**What is built.** The sizes and the row height are §1.10's, verbatim. The colours are
§2's — the admin nav rail, which is the handoff's own treatment for a tab list on this
exact `#3b332a`: cream label, `--td-cream-dim` sub-label, and an active tab filled with
`#fbf6e9` and inked dark, lifted `translateX(-6px)` with the rail's own shadow.

**Why.** The rail's palette is designed for paper and the drawer is a dark panel, so
reusing it puts `#7a6b50` ink on `rgba(120,98,60,.07)` over `#3b332a`. Measured with this
repository's own `contrastRatio`/`composite` (`packages/domain/src/contrast.ts`):

| Line | Prototype's colours | Built | WCAG 2.1 AA floor |
|---|---|---|---|
| tab name (Caveat 26px) | **2.28:1** | 10.57:1 | 4.5:1 (Caveat is not a large-text face at this size in the sense SC 1.4.3 means) |
| tab sub-line (Courier 9px) | **1.68:1** | 6.10:1 | 4.5:1 |
| active tab name | — | 10.03:1 | 4.5:1 |
| active tab sub-line | — | 4.98:1 | 4.5:1 |

Both prototype figures are well under the floor, and `e2e/a11y.spec.ts`'s
drawer-open case runs axe with **no exclusions**, so the literal transcription would have
been a failing build rather than a debatable choice. The handoff supplies the right
colours for this background itself, one section away, which is why they were taken rather
than invented.

**The active tab's sub-line** takes the same treatment `docs/deviations.md` §15 records
for the rail's: pinned to `--td-ink-body` at `.78`, which is what brings a 9px tracked
Courier line on paper to AA. §15's reasoning applies unchanged; only the surface differs.

**What would reverse this.** A `SCREENS.md` revision that states the drawer's tab colours
explicitly, or a redesign of the panel's background. Neither exists today.

---

## 23 · The LCP budget was raised from 2,500ms to 3,000ms, which the task brief forbade

**Where:** `CLAUDE.md` §6's LCP row; `lighthouserc.json` and `lighthouserc.book.json`'s
`largest-contentful-paint` assertions; `docs/adr/0008-lcp-budget-and-the-framework-floor.md`.

**What the plan said.** Task 13's brief, Step 5, in full: *"Confirm Lighthouse now passes
against `/p/1`. If LCP exceeds 2500ms, report the measurement — do NOT raise the
budget."* That is as explicit as an instruction gets, and it is recorded here because
this file's preamble covers deliberate exceptions to *this project's own* standards, and
a departure from the project's own plan is one of them. Nothing in `SCREENS.md`,
`README.md`, `DATA_MODEL.md` or `SECURITY.md` names an LCP number; the 2,500ms figure was
this repository's, written into `CLAUDE.md` §6 in Phase 0 before any route existed.

**What was done.** The budget is **3,000ms** — in `CLAUDE.md` §6 and in both lhci
configs' `largest-contentful-paint` assertions.

**Why.** The instruction was obeyed first, and for several rounds. The gate was reported
**red and unraised** through Task 13, through the font work (`docs/adr/0005`, which
records the five-face build at 2,933.8ms and says in terms that the gate is "left red and
unraised"), and through two separate attempts to buy the milliseconds back — ADR 0006
removed 1.83MB of images and ADR 0007 removed 11,465 bytes of page components from the
client chunk, moving LCP by 0.3ms. What ended the deferral was a measurement nobody had
taken: `docs/adr/0008` measured what the route costs with **no application code at
all** — one server component rendering one styled heading, no font, no stylesheet, no
client component, in this same app — and found **2,023.2ms** of modelled LCP and
**137,986 bytes** of React and Next App Router runtime. That is 81% of the old budget
before this repository writes a line, so the budget was not describing this repository's
work; it was describing a floor this repository does not own. The reported figure is a
projection rather than a paint besides: `simulate` reports Lantern's model, and the
OBSERVED paint on `/p/1` is 122-174ms in every configuration measured.

**Why 3,000 rather than "the floor plus something".** ADR 0008's "Why 3,000 and not some
other number past the floor" is the argument, and its test is that the new number still
catches a regression this project has actually shipped: ADR 0006's image-window defect
measured `/p/1` at 3,170-3,247ms before its fix, so a 3,000ms gate would have failed that
build exactly as the 2,500ms gate did. A budget that launders a known past regression
would not be a budget.

**Whose decision it was.** ADR 0008 is marked `Status: DECIDED` by the repository owner,
who was given the measured floor and four options with no recommendation taken. Amending
`CLAUDE.md` §6 is the owner's call, not a task's — which is precisely why Task 13's brief
was right to forbid a task from making it, and why this entry records that the exception
was escalated rather than taken.

**What was deliberately NOT relaxed with it.** `resource-summary:script:size` stays at
184,320 bytes, `cumulative-layout-shift` at 0.1, `numberOfRuns` at 5 and
`aggregationMethod` at `median` — the last of those specifically because lhci's default
(`optimistic`) takes the best of five runs and would have loosened the gate a second
time, silently. `docs/adr/0014-the-viewport-the-diary-lcp-gate-is-measured-at.md` later
made the gate *stricter* in the dimension that mattered, by pinning the two viewports the
two reading surfaces are actually measured at, and `docs/testing.md` §7.0 is the
current-state table for every number involved.

**What would reverse this.** A framework floor that falls — a Next/React release whose
App Router runtime models under ~1.5s on this preset would put 2,500ms back within
reach, and ADR 0008's minimal-route probe is the measurement that would say so. Re-run
it before arguing the number either way.

---

## 24 · Two chrome elements transition `background` as well as `transform`

**Where:** `apps/web/components/chrome/chrome.module.css` — `.tab`;
`apps/web/components/mobile/mobile.module.css` — `.drawerTab`.

**What `CLAUDE.md` says.** §6's first budget row reads: "Page flip | Sustained 60fps.
**Only `transform` and `opacity` animated** — never layout properties." Read as a
whole-codebase rule, a `transition-property: transform, background` is an exception to
it, so it is written down here rather than left to be re-litigated by the next reader who
greps for `transition-property`.

**What the handoff says.** `SCREENS.md` §1.7 specifies the bookmark rail's tab
verbatim — "Transition `transform 180ms, background 180ms`" — naming both properties and
both durations. §1.10 says nothing at all about the drawer tab's transition; the drawer
reuses the rail's tab treatment, repainted for a dark panel, for the reasons in §22 of
this file, and the transition came across with it.

**Why the rule does not bind these two, and why the exception was kept rather than
narrowed.** Three reasons, in order of weight:

1. **The rule's subject is the flip.** The budget row is titled "Page flip", and its
   concern is the sixty frames of a turning leaf. `book.module.css`'s rule 3 is where
   that is enforced in code, scoped to the design box, and `e2e/book.spec.ts` audits it
   there. Neither of these elements is inside the design box: the rail's tab is chrome
   beside the book, and below 860px there is no design box, no leaf and no flip at all
   (`SCREENS.md` §1.10: "No book, no flip, no scaling") — `e2e/mobile.spec.ts` asserts
   that a phone's document carries zero `[data-design-box]` and zero `[data-leaf]` nodes.
2. **`background` is not a layout property.** The clause the row actually forbids is
   "never layout properties"; a background-colour transition on a 158px-wide tab repaints
   one small box and triggers no reflow. Neither element animates during a flip in any
   case — the rail tab's transition fires on a bookmark press, the drawer tab's on a
   drawer press.
3. **Narrowing both to `transform` would contradict the handoff.** §1.7 names
   `background 180ms` explicitly. Dropping it would remove a stated design behaviour to
   satisfy a rule aimed at a different surface, and would make the active tab's fill snap
   rather than settle. Where the handoff and a general rule disagree on a point the rule
   does not actually govern, the handoff wins.

**Why this entry exists at all.** The exception was reasoned through once, in a four-line
comment on `chrome.module.css`'s `.tab` (Task 12), and then the declaration was copied to
`mobile.module.css`'s `.drawerTab` (Task 15) **without the comment** — a convention
travelling without its reasoning, which is how a deliberate exception decays into an
unexplained one. The Phase 1 final review caught it. Both rules now carry the
justification, both point here, and this entry is the single place the reasoning lives.

**What would reverse this.** Either element moving inside the design box, or a
`SCREENS.md` revision dropping `background` from §1.7's transition. Neither exists today.

## 25 · `otpChallenges` gains a `sessionHash` column the handoff never lists

**What changed:** `DATA_MODEL.md` specifies the `otpChallenges` collection as `user`,
`codeHash`, `expiresAt`, `attempts`, `consumedAt`, `ip` — six fields, none of them a
session. This project adds a seventh: `sessionHash`, an indexed, required text column
holding SHA-256 of the pre-auth session identifier
(`apps/web/collections/otpChallenges.ts`, migration
`apps/web/migrations/20260905_202028_add_otp_session_hash.ts`).

**Rationale:** the handoff contradicts itself here, and the contradiction is load-bearing.
`SECURITY.md`'s first prototype hole requires, in its own words, "Bind the challenge to
the session that started it, so a code issued for one browser can't be redeemed in
another" — and `DATA_MODEL.md`'s field list for the very collection that binding lives in
has nowhere to put a session. Phase 0 implemented the field list faithfully, so the gap is
inherited rather than introduced. Building `issueChallenge(user, session, ip)` against
that schema would leave the `session` parameter accepted, ignored and untested: the
binding requirement failing while appearing to hold, which is the exact failure mode the
phase's Ruling F1 was written to prevent one task earlier. Between a field list and a
hardening requirement, the hardening requirement wins — the same precedence
`docs/adr/0002-auth-mechanism.md` already applied when the three handoff documents
disagreed about auth.

**Why hashed, and why not a relationship to `sessions`:** the column sits in the same row
as `ip`, and a table that already hashes one secret should not keep the other in
cleartext — `SECURITY.md` rotates the pre-auth session id away on login precisely because
it is untrusted. It is SHA-256 rather than the slow, salted hash used for `codeHash`
because this column is the *lookup key* and must be deterministic and indexable; the
input is a high-entropy identifier, so unlike a six-digit code there is no dictionary to
run against it. It is not a relationship to `sessions` because at issue time the visitor
is unauthenticated: minting `sessions` rows for pre-auth visitors would bloat that table
and would put unauthenticated entries into the Account screen's "Where you are signed in"
list, which is backed by real `sessions` rows. The full reasoning, including the options
rejected, is `docs/adr/0015-otp-challenge-hashing.md`.

**What would reverse this:** a `DATA_MODEL.md` revision that either adds the field or
drops `SECURITY.md`'s session-binding requirement. Neither exists today, and the
migration is reversible in both directions if one ever does — asserted by
`apps/web/collections/collections.integration.test.ts`, which rolls every migration back
to zero and re-applies it.

**Recorded as:** `docs/adr/0015-otp-challenge-hashing.md`; the phase ledger's rulings
F11 and F12; `// HANDOFF-DEVIATION` on the field itself in
`apps/web/collections/otpChallenges.ts`.

## 26 · The sign-in email's subject and body are ours, not the handoff's

**What changed:** `apps/web/lib/auth/otpService.ts` sends a message with the subject
`Your travel diary sign-in code` and a body reading, in full:

```
<the six digits>

That code signs you in to the travel diary. It expires in five minutes.
If you did not ask for it, nothing has happened and you can ignore this.
```

None of that copy comes from the handoff.

**Rationale:** `SCREENS.md` §3.2 specifies the one-time-code *screen* verbatim, down to
the ring widths on the six cells and the wording of "A six-digit code went to {masked}.
It expires in {m:ss}." — and says nothing whatsoever about the email that carries the
code. The message has to say something, so this is invented text written to echo the
screen's own language rather than to introduce a second voice. It is recorded here
because `CLAUDE.md` §9 Pass 3 asks every copy string to be diffed against the handoff,
and a later reader diffing this one would otherwise waste time looking for a source that
does not exist — or, worse, "correct" it to match something.

**One invariant travels with it, and it is not stylistic.** The body carries **exactly
one run of digits, the code**. `otpService.integration.test.ts` reads the issued code
back out of the outbox the way a reader reads it out of an inbox, then asserts those
digits appear in no response and no log line. Adding "expires in 5 minutes" to this body
gives the outbox reader a second number to pick up and turns those leak assertions into
tests of the fixture rather than of the service. "five minutes" is spelled out for that
reason. The invariant is stated at the string itself, in `otpService.ts`.

**What would reverse this:** the repository owner supplying their own copy, which is
theirs to write — this entry exists so they know it is theirs to write. Whatever replaces
it keeps the one-run-of-digits invariant, or updates the tests that depend on it in the
same commit.

**Recorded as:** the comment on the `text` field in `apps/web/lib/auth/otpService.ts`.

## 27 · A `signInAttempts` collection the data model does not describe

**What changed:** this repository adds a collection `DATA_MODEL.md` does not list —
`signInAttempts`, one row per sign-in attempt, with `dimension` (`ip` | `account`),
`endpoint` (`password` | `code`), `subject` and `attemptedAt`
(`apps/web/collections/signInAttempts.ts`, migration
`apps/web/migrations/20260905_230601_add_sign_in_attempts.ts`). It is written and read
only by `apps/web/lib/auth/rateLimit.ts`, and its access rules are `() => false` on every
operation — `delete` included, which the handoff omits from all three server-only access
blocks and which §28 records — matching `otpChallenges` and `jobs`. Not `sessions`, which
declared no access rule at all when this was written; Phase 2 Task 6 gave it a per-user
ownership rule instead of a flat refusal, since the Account screen legitimately reads and
revokes those rows (§29).

**Rationale:** `SECURITY.md`'s third prototype hole requires "Rate limit per account **and**
per IP — a sliding window on both the password and code endpoints", and a sliding window
has to count something that outlives the request. `DATA_MODEL.md` provides nowhere to
count it: `otpChallenges` records codes being *issued* rather than attempts being *made*,
exists only for the code endpoint, and carries no per-address index. As with
`sessionHash` (§25), the handoff's two documents disagree — one asks for a behaviour, the
other omits the state it needs — and the hardening requirement wins, the same precedence
`docs/adr/0002-auth-mechanism.md` applied when the three handoff documents disagreed
about auth.

**Why a table and not memory:** the obvious implementation, a `Map` of key to timestamps
inside the process, is correct on a machine that runs one process and wrong on the host
this project deploys to. `docs/adr/0001-hosting-and-cost.md` puts the app on Vercel, where
each serverless invocation has its own memory, so an attacker cycling instances would
never meet a refusal — while every local test passed, because locally there is one
process. A limiter green in CI and absent in production is worse than none, because
nobody looks at it again. A shared cache would also work and was rejected on cost and
operational surface for a single-author diary, not on the merits; the full options list is
`docs/adr/0016-rate-limit-window-storage.md`.

**Why one row per attempt rather than a counter:** a counter row is a *fixed* window,
which an attacker straddles at the boundary to get twice the limit in a moment;
`SECURITY.md` asks for a sliding window by name. One row per attempt also makes the
counting race-free without a lock, which is the other half of the decision: each request
inserts its own row and is then ranked among the rows at or before it, so there is no
interval between a check and a write for a racer to occupy. That is the direct correction
of the defect `docs/adr/0015-otp-challenge-hashing.md` records, where twelve parallel
guesses were evaluated against a three-attempt budget.

**What would reverse this:** a `DATA_MODEL.md` revision that either adds the collection or
drops `SECURITY.md`'s rate-limiting requirement. Neither exists today, and the migration
is reversible in both directions if one ever does — asserted on all five schema artefacts
it creates by `apps/web/collections/collections.integration.test.ts`.

**Recorded as:** `docs/adr/0016-rate-limit-window-storage.md`; the phase ledger's rulings
F26 (storage), F27 (the limits) and F28 (rank, not read-then-count); a
`// HANDOFF-DEVIATION` in the module header of `apps/web/collections/signInAttempts.ts`.

## 28 · `delete` is refused on the three server-only collections, which the handoff's own schema does not do

**What changed:** `jobs`, `otpChallenges` and `signInAttempts` each declare
`delete: () => false` alongside their `read`, `create` and `update` predicates
(`apps/web/collections/jobs.ts`, `otpChallenges.ts`, `signInAttempts.ts`).

**Rationale:** `DATA_MODEL.md:174` writes the access block for `otpChallenges` as
`access: { read: () => false, create: () => false, update: () => false }` and comments it
`// server only`. **It is not server-only.** Payload applies its `defaultAccess` —
`({ req: { user } }) => Boolean(user)`, "signed in, or refused" — to any operation an
access block omits, so `delete` fell through to *any authenticated caller*. Verified
against a real Payload rather than reasoned about: with the predicate absent, a signed-out
delete is refused and a **signed-in delete succeeds**.

The consequence differs per collection and is worst for the newest one. A caller who can
delete `signInAttempts` rows can clear their own sliding window, which is not a rate limit
at all; a caller who can delete an `otpChallenges` row can throw away the attempt counter
bounding guesses against their own challenge. The collections were transcribed faithfully
from the handoff in Phase 0, so the gap is inherited rather than introduced — this is the
second time a handoff document has specified something its own schema cannot deliver,
after the missing session column (§25). As there, the stated intent wins over the printed
field list.

**What this cost, recorded because the cost is the lesson:** four documents — the module
headers, `docs/deviations.md` §27, `docs/security.md`'s rate-limit row and
`docs/adr/0016-rate-limit-window-storage.md` — each asserted `() => false` on *every*
operation, and a guard test sat beside them named "so nobody can clear or forge their own
window" while asserting read, create and update for a **signed-out** caller only. The
signed-out half could never have caught this: `defaultAccess` refuses a signed-out caller
regardless. Those cases now assert all four operations for a signed-in caller as well, on
**real rows** — an `update` or `delete` aimed at a non-existent id is refused for being
absent rather than forbidden, so a guard written against `id: '1'` passes with or without
the rule.

**What would reverse this:** a `DATA_MODEL.md` revision that either adds `delete` to that
access block or states that deletion by a signed-in user is intended. Neither exists, and
the second would contradict the `// server only` comment beside it.

**Recorded as:** a `// HANDOFF-DEVIATION` at the predicate in each of the three
collections; three cases in `apps/web/collections/collections.integration.test.ts`, each
verified to fail when the predicate is removed.

## 29 · `sessions` gets a per-user ownership rule, where the handoff states no rule at all

**What changed:** `apps/web/collections/sessions.ts` declares an `access` block:
`read`, `update` and `delete` each return `{ user: { equals: req.user.id } }` — narrowing
the operation to rows the caller owns and refusing outright when there is no caller —
and `create` is `() => false`. On top of that, **every field refuses `update`**, and
`tokenHash` refuses `read` as well.

**Rationale:** `DATA_MODEL.md`'s `sessions` section prints a field list and **no access
block at all**. Payload applies its `defaultAccess` — `({ req: { user } }) =>
Boolean(user)`, "signed in, or refused" — to every operation an access block omits, so
with no block at all **any signed-in user could read, update and delete every other
user's session rows.** On the very collection that backs the Account screen's "Where you
are signed in" list and its Revoke button, that is one account holder enumerating
another's devices and signing them out.

Verified against a real Payload rather than reasoned about, and verified *across two
accounts*, which is the only way this class of defect is visible: with the block removed,
Alice's `find` returns Bob's session row, her `update` sets `revokedAt` on it, and her
`delete` removes it — five cases in
`apps/web/collections/sessions.access.integration.test.ts` fail, and every one of them
would have passed had the suite used a single account, because everything the broken
configuration granted was granted to "signed in".

The rule is per-user ownership rather than the flat `() => false` that §28 gave `jobs`,
`otpChallenges` and `signInAttempts`, and the difference is deliberate: those three are
reached only through their own server-side adapters, while the Account screen
(`SCREENS.md` §4, Phase 4) legitimately lists a reader's own sessions and revokes them
one at a time. A blanket refusal here would have been "secure" and would also have made
Revoke impossible, which is the outcome `SECURITY.md` explicitly names as the thing to
avoid — "Back the account screen's session list with real `sessions` rows, or Revoke and
'Sign out everywhere' do nothing".

`create` is refused for everybody including the account itself, because a session is
minted server-side against an identifier the client never learns
(`apps/web/lib/auth/sessions.ts`), so a row created through the API could only ever be a
forgery. The two field-level restrictions close the two ways an owner could otherwise
undo the rule from inside it: reading `tokenHash` would hand every listed device's
credential digest to whatever renders the list, and writing `expiresAt` would let a
reader grant themselves a session that never expires, since the column is the only thing
that ends a session nobody revokes.

### The second round: collection-level ownership was necessary and not sufficient

The block above shipped with per-field restrictions on `tokenHash` and `expiresAt` only,
and review round 1 found two more holes — both **fields inside an operation that is
correctly permitted**, which is a category the first round's tests could not see because
they enumerated operations rather than fields.

- **`user` was writable by the row's owner.** It is the field `ownSessionsOnly` itself
  reads to decide ownership. Reproduced: Alice updated her own row's `user` from 104 to
  Bob's 105 under her own access, and her **unchanged** identifier then authenticated as
  `{ user: '105' }`. That is privilege escalation through the field that decides
  privilege — strictly worse than the original leak, which at least required touching
  somebody else's row.
- **`revokedAt` could be written back to `null`.** Reproduced: a session answering
  `{ ok: false, error: 'revoked' }` answered `{ ok: true, value: { user: '106' } }` again
  after one `PATCH`. "Only the owner can write it" is not a restriction here: the account
  holder and whoever holds a stolen session are the same principal as far as this
  collection can tell, so Revoke was decorative against exactly the person it exists to
  stop.

**A third was then found by the fix's own test, and it is the reason that test exists.**
Round 1 also added a sweep that attempts an update on **every field the collection
declares**, enumerated from the config rather than from a hand-written list. On its first
run it failed on a field neither the reviewer nor the author had named: **`createdAt`**.
Payload injects `createdAt`/`updatedAt` into a collection's field list when it sanitises
it, an injected field carries no access rule, and so a session's owner could rewrite when
it had been created. Nothing authenticates on that column, so it is not escalation; what
it falsifies is the "Where you are signed in" list, whose only job is to be true.

**The fix is total rather than enumerated**, for the reason the third hole demonstrates:
every field refuses `update`, including the three that look harmless (`device`,
`location`, `lastSeenAt`) and the two timestamps, which are now declared explicitly — with
`index: true`, since that is what Payload's injected versions carry and omitting it
silently drops two indexes (confirmed with `payload migrate:create` before the line was
written). Revocation moved server-side to `revokeSession`/`revokeAllSessions`, matching
how every other write in this phase reaches these tables.

A monotonic rule for `revokedAt` — allow `null` to a timestamp, refuse the reverse — was
considered and rejected: that is a validation somebody has to remember to keep correct,
whereas a field nobody can write cannot be written wrong.

The collection-level `update` stays owner-scoped rather than `() => false`, deliberately.
Payload refuses at the collection level **before** it evaluates field access, so a flat
refusal there would make all nine field predicates unreachable — uncoverable against this
directory's 100% gate, and unprovable by any test.

Eight of the nine refusals fail a named case when removed. `updatedAt`'s is the exception
and is recorded as such at the line itself: Payload stamps that column after access runs,
so the write never survives either way, and no test can distinguish. It is kept so the
rule stated is total, not because it was proven.

**What this cost, recorded because the cost is the lesson:** three documents in this
repository — `apps/web/collections/signInAttempts.ts`'s header, `docs/deviations.md` §27
and `docs/data-model.md`'s `jobs` section — described `sessions` as a server-only peer of
the three collections that do refuse everybody, before anybody had read its configuration.
It has never had one. That is the same species of unverified claim §28 records, in the
same phase, about a neighbouring collection; all three statements are corrected in the
commit that adds this entry.

**What would reverse this:** a `DATA_MODEL.md` revision that states an access rule for
`sessions`. None exists.

**Recorded as:** `docs/adr/0017-session-store-and-rotation.md`; a `// HANDOFF-DEVIATION` at
the access block and at the `user`, `revokedAt` and `expiresAt` fields in
`apps/web/collections/sessions.ts`; twelve cases in
`apps/web/collections/sessions.access.integration.test.ts` — including the per-field sweep
— and the two cross-account escalation cases in
`apps/web/lib/auth/sessions.integration.test.ts`. Verified to fail when the block and each
field-level predicate are removed: see the Task 6 report for the full matrix, round 1 and
round 2.

## 30 · `sessions` gains an `expiresAt` column the handoff never lists

**What changed:** `sessions` carries `expiresAt` (`timestamp(3) with time zone NOT NULL`),
added by migration `20260906_004937_add_session_expiry` alongside a btree index on
`token_hash`. `DATA_MODEL.md`'s field list is `{ user, tokenHash, device, location,
createdAt, lastSeenAt, revokedAt }` — no lifetime of any kind.

**Rationale:** `SECURITY.md` requires that "'Keep me signed in' is a longer-lived,
**revocable** session row — not a longer JWT". A row with no recorded lifetime cannot be
longer-lived than anything: it ends only when somebody revokes it, so "keep me signed in"
would have nothing to lengthen and an unticked box would grant a session that lasts
forever. The alternative the requirement explicitly forbids — carrying the lifetime in a
longer signed token — is exactly what a schema with no expiry column pushes an
implementer towards, since the token is then the only place a lifetime can live.

This is the second time this handoff has required of a collection something its own field
list cannot hold, after `otpChallenges.sessionHash` (§25). As there, the stated
requirement wins over the printed list.

Unlike `otpChallenges.expiresAt`, this column **is** the authorization input rather than a
purge index. There is no second derivation of the same fact to disagree with it:
`sessionState` (`packages/domain/src/auth/session.ts`) reads this column and nothing else
decides a session's lifetime, and the identifier in the cookie is opaque, so it carries no
expiry of its own. The distinction is drawn deliberately — §25's column exists *because*
two sources of truth for one fact would make the domain constant decorative, and here
there is only one.

**What would reverse this:** a `DATA_MODEL.md` revision adding a lifetime field to
`sessions`, at which point this column would be the handoff's rather than ours. A revision
dropping the "keep me signed in" requirement would also do it, and would take the feature
with it.

**Recorded as:** `docs/adr/0017-session-store-and-rotation.md`; a `// HANDOFF-DEVIATION` at the field in
`apps/web/collections/sessions.ts`; the migration's own reversibility case in
`apps/web/collections/collections.integration.test.ts`; and the three lifetime cases in
`apps/web/lib/auth/sessions.integration.test.ts` that assert the lifetime is the row's and
not the token's.

## 31 · The reset email's subject and body are ours, and so is the link's path

**What changed:** `apps/web/lib/auth/passwordReset.ts` sends a message with the subject
`A way back in to your travel diary` and a body reading, in full:

```
<origin>/admin/reset/<token>

Open that link to choose a new password for the travel diary. The link works once and lasts an hour.
If you did not ask for it, nothing has happened and you can ignore this.
```

Neither the copy nor the path `/admin/reset/<token>` comes from the handoff.

**Rationale:** the same as §26's, one screen further on. `SCREENS.md` §3.3 specifies the
reset *screen* — "Send yourself a way back in", the email field, "Send the link", and the
sent state's "The link works once and lasts an hour" — and says nothing about the email
that carries the link, which nonetheless has to say something. The one sentence of copy
that *is* the handoff's, "The link works once and lasts an hour", is reused verbatim
rather than paraphrased, so the screen and the message make the same promise about the
same link; the rest echoes §26's voice rather than introducing a third one.

The path is `/admin/reset/<token>` because phase ruling F41 settled that the bespoke
sign-in surface mounts under `/admin` (Payload's own admin having moved to `/cms`), and
because the session cookie is scoped `Path=/admin` — a reset screen outside it could not
read the session it is about to establish. The hour is not ours: it is Payload's own
`forgotPassword` expiry default, which happens to be exactly what §3.3 asks for.

**One thing this deviation does NOT cover, and it is worth being plain about:** the
screen that consumes the link does not exist yet. Task 5 mints a real token that
Payload's `resetPassword` really consumes — `passwordReset.integration.test.ts` completes
a reset with it and then signs in with the new password — but at the time Task 5 shipped, Task 9's
brief covered §3.3's two *request* states and not the set-a-new-password screen the link
lands on. **That gap is now closed by a controller ruling: Task 9 owns the screen** — the
`[token]` route at this path, the form, the `payload.resetPassword` call, the
invalid/expired state, and an e2e case that follows the mailed link. Until it lands the
link resolves to a 404. Recorded here rather than left to be discovered.

**What would reverse this:** the repository owner supplying their own copy, which is
theirs to write; or a later phase moving the reset screen, at which point `RESET_PATH`
and this entry move with it.

**Recorded as:** the comment on the `text` field and the `RESET_PATH` constant in
`apps/web/lib/auth/passwordReset.ts`, and the case in
`apps/web/lib/auth/passwordReset.integration.test.ts` that follows the link's token
through a completed reset.

## 32 · The sign-in cloth's eyebrow alpha is `.78`, and its gradient follows §1.1 rather than the login prototype

**What changed, and what only looks changed.** Three values on the sign-in screen's two
cloth blocks are worth writing down; exactly one of them is a departure from the
handoff's specification.

1. **A deviation.** `.clothEyebrow`/`.clothBackRoom`'s colour is `rgba(238,220,180,.78)`,
   where the handoff's login prototype has `.72`. `.78` is the alpha `.clothSubtitle`
   already uses, so no new colour is introduced.
2. **Not a deviation from `SCREENS.md`, but a departure from the login prototype, and the
   first implementation of this file failed to say so.** The gradient's end stop is built
   from `72%` — `SCREENS.md` §1.1's `rgba(0,0,0,.28)` — not from the login prototype's
   `rgba(0,0,0,.3)`. §3 describes this panel as "the cover treatment", and §1.1 is where
   that treatment is specified, so the binding value arrives by cross-reference from the
   spec; the prototype's `.3` is an inconsistency between two of the handoff's own
   artefacts, and following the spec is what the standing rule asks for. It also makes the
   two cloth surfaces in this product literally one treatment rather than two that look
   alike: `cover.module.css` uses the same `72%` for the same colour. **This entry
   originally recorded the opacity change and not this base value at all, while the
   stylesheet used `70%`** (review round 1, finding 1). Measured, the difference between
   the two bases is worth about 0.06 of a contrast ratio and changes no line's verdict —
   which is exactly why it could have sat there unnoticed.
3. **`docs/deviations.md` §12's deviation, inherited rather than made again.** That end
   stop is written as the OPAQUE form of §1.1's `rgba(0,0,0,.28)` —
   `color-mix(in srgb, var(--sign-in-cloth) 72%, #000)`, the colour that overlay resolves
   to on the cloth — rather than as the translucent value itself, so the desk behind the
   shell no longer shows through the middle of the gradient. §12 is where that decision
   and its measurements live; this screen applies it to the same treatment.

**Rationale for (1).** A gradient interpolating from an opaque colour to a 28%-opaque
black falls to about 72% opacity by mid-block, and the light desk under it lifts the
background exactly where the small Courier lines sit. Even with §12's opaque end stop
applied, the eyebrow measured **4.429:1** at the prototype's `.72`, against WCAG 2.1 AA's
4.5:1 for text that size. Raising that one alpha brings both Courier lines clear:

| Cloth panel line | Size | Before | After | Needs |
|---|---|---|---|---|
| Travel Diary | 10.5px | 4.429 | **4.865** | 4.5 |
| Wanderings | 75px (fitted) | 7.877 | 7.877 | 3 (large text) |
| subtitle | 17px italic | 5.269 | 5.269 | 4.5 |
| The back room | 10.5px | 4.640 | **5.102** | 4.5 |

"Before" is the fully undeviated screen — §1.1's `.28` end stop left translucent, with the
prototype's `.72` alpha — measured, not reasoned about. The title and subtitle do not move,
because neither change touches them; "The back room" moves because it shares the eyebrow's
rule. Figures are the `desktop` project's; `mid` measures the same lines within 0.003.

The narrow **masthead** is a separate block over the same gradient at a different inset
shadow and needed no change at all — its three lines measure 4.785, 7.877 and **4.562**,
all clear, the last of them by the narrowest margin on this screen, which its own rule
records with an instruction to re-measure rather than reason about any future change.

**Why axe cannot settle it:** axe-core reports `color-contrast` as INCOMPLETE over a
gradient rather than as a pass or a violation, so a green axe run on `/admin/sign-in` means
axe declined to judge. `CLAUDE.md` §2 requires these ratios to be asserted rather than
assumed, so they are measured directly, from the rendered pixels, by
`e2e/a11y.spec.ts`'s two sign-in contrast cases — reusing `e2e/support/coverContrast.ts`,
which hides each line with `visibility: hidden` so its box still shows the cloth it sat
on, takes the LIGHTEST pixel under it as the background (the worst case, since the 45deg
texture makes the background a range rather than a value), and flattens the line's
translucent cream onto it with `packages/domain/src/contrast.ts`.

**What would reverse this:** a change to the cloth gradient, to the texture overlay, to
the alpha, or to either block's inset shadow — any of which has to be re-measured rather
than reasoned about. If a future design makes the desk behind the shell dark, §12's opaque
end stop stops being necessary on this screen too, and the specified translucent value can
come back. If the handoff ever reconciles its own two artefacts on `.3` versus `.28`,
point (2) above is what records which one this repository followed and why.

**Recorded as:** the `HANDOFF-DEVIATION` comment in
`apps/web/components/admin/signIn.module.css`'s header and at the
`.clothEyebrow`/`.clothBackRoom` rule, the note at the `.cloth, .masthead` rule that
distinguishes (2) and (3) from (1), the note on `.mastheadBackRoom`, and the two contrast
cases at the foot of `e2e/a11y.spec.ts`.

## 33 · The one-time-code screen is mounted before the challenge behind it is

**What changed:** `/admin/sign-in/code` draws `SCREENS.md` §3.2's pane against no real
challenge. The masked address it prints is `PENDING_ADDRESS_MASK`, exported from
`apps/web/components/admin/CodeStep.tsx` and equal to `maskEmail('')` — three bullets,
`•••` — and the two countdowns are measured from `Date.now()` at the instant the document
was drawn rather than from the instant a code was issued. The two forms on the pane post
to `/admin/sign-in/code/verify` and `/admin/sign-in/code/resend`, neither of which is
mounted, so both currently resolve to a `404`.

**What that means today, plainly, rather than by implication:** `GET
/admin/sign-in/code` **returns 200 to anyone who asks for it** and draws a complete
second-factor screen — nobody has to have signed in, or typed a password, or been issued
a code. Reloading it restarts the displayed expiry. It is not "unmounted"; it is mounted
and unguarded. What it discloses is nothing: no address (the mask is a fixed bullet run),
no code, no account, no session, and both of its forms post to paths that do not exist.
The guard belongs with the cookie, and **Phase 2 Task 10's review is where it has to be
confirmed landing** — this entry is the record that it is owed.

**Rationale:** the same shape of gap `/admin/sign-in`'s own form already carries, and for
the same reason. Everything this screen would need to say for real — which address the
code went to, when it was issued, how many guesses the server has spent — lives in the
`otpChallenges` row `otpService.issueChallenge` writes, keyed by the PRE-AUTH SESSION the
browser carries in a cookie. Reading that back means the cookie policy, and **Phase 2 Task
10 owns the cookie policy**, along with the `Set-Cookie`, the CSRF check and the admin's
CSP. Task 8's brief is the screen.

Building the screen behind a cookie that does not exist yet would have made it
unreachable in a browser, and three of its mechanisms can only be settled in one: the cell
widths at 390px (`SCREENS.md` §3 records the collapse this guards), the paste path past
`maxLength="1"`, and the shake under `prefers-reduced-motion`. A screen nothing can drive
is a screen nothing can check.

**What it costs, stated rather than hidden.** A reader who reloads the screen sees the
countdown start again. Nothing about the code's real life moves with it: what decides
whether a code still works is `challengeState`, read from the stored row against the
server's own clock, and the screen's countdown is a courtesy either way — `CodeStep.tsx`
says so at the refusal it makes. The masked address echoes nothing at all, because
`maskEmail`'s fallback for input it cannot mask is a fixed bullet run rather than a
partial echo. Nothing is fabricated: no invented address, no invented issue time that
claims to be a challenge's.

**What would reverse this:** Task 10 mounting the two handlers and supplying the pending
challenge, at which point `maskedAddress` and `issuedAt` come from the row,
`attemptsSpent` comes from the refusal that sent the reader back, and
`PENDING_ADDRESS_MASK` has no caller left and goes. The three visual baselines
(`admin-sign-in-code-*.png`) move in that commit, which is expected and is what a
baseline is for.

**Recorded as:** the header of `apps/web/app/(admin)/admin/sign-in/code/page.tsx`, the
TSDoc on `PENDING_ADDRESS_MASK` in `apps/web/components/admin/CodeStep.tsx`, the row for
`GET /admin/sign-in/code` in `docs/api.md`, and the case in
`apps/web/components/admin/CodeStep.test.tsx` that pins the fallback to `'•••'`.

## 34 · The last wrong code is told "1 attempt left", not the prototype's "1 attempts left"

**What changed:** the handoff's login prototype builds the wrong-code message as
`'That code is not right. ' + (3 - n) + ' attempts left.'`, which at the reader's last
remaining guess reads "That code is not right. 1 attempts left."
`apps/web/components/admin/CodeStep.tsx` pluralises it, so that one case reads "1 attempt
left." and every other case is the prototype's string unchanged.

**Rationale:** `SCREENS.md` §3.2 does not specify this message at all — it names the
attempts counter and leaves the wording to the prototype — and the prototype's own copy
is deliberate everywhere else on this screen ("nineteen tarts, no regrets" is the house
rule). This is not a deliberate voice, it is a concatenation that never had its singular
case looked at, and it appears at the most anxious moment the screen has: one guess left
before the challenge is spent. Correcting agreement is not rewriting the copy; every
other word of the sentence is the prototype's.

**What would reverse this:** the repository owner preferring the prototype's string
verbatim, which is theirs to decide.

**Recorded as:** the `HANDOFF-DEVIATION` comment at `wrongCodeMessage` in
`apps/web/components/admin/CodeStep.tsx`, and the two cases in
`apps/web/components/admin/CodeStep.test.tsx` that assert the plural and the singular
form separately.

## 35 · The prototype's trailing rule and "Turn this step off…" line are not on the code screen

**What changed:** the handoff's login prototype ends its one-time-code pane with a
hairline rule (`margin: 20px 0 14px`) and an italic Garamond 15px line: "Turn this step
off under Account → Getting in, if you would rather sign in with a password alone."
Neither is rendered by `apps/web/components/admin/CodeStep.tsx`.

**Rationale:** `SCREENS.md` §3.2 ends the pane at "a resend button … opposite an attempts
counter", and it ends §3.1 with "then a rule and a footer line with a 9px mark stating
whether the code step is on" — so the specification asks for a footer line on the
PASSWORD step and asks for none on this one. §3.1's line is implemented, mark and all.
Following the specification here rather than the prototype is the ordinary reading of
which artefact binds (the same call the cloth gradient made, §32 point 2).

There is a second reason not to reach for the prototype's line in particular, and it is
the one that settles it: that sentence tells a reader to turn the second factor off. It
is `SECURITY.md`'s second prototype hole in prose — the prototype could honour it
instantly because the flag was a `localStorage` key anyone could set to `0`, and here it
is `users.otpRequired`, read on the server, changeable only from an Account screen that
Phase 4 builds. Printing an instruction to a screen that cannot be reached from it, in the
middle of a challenge, is worse than printing nothing.

**Recorded here because an unrecorded difference from the prototype is indistinguishable
from an oversight**, which is the whole reason this file exists. It is not a deviation
from `SCREENS.md` — nothing in §3.2 is missing — and the spec sweep for this screen found
64 of 64 values matching.

**What would reverse this:** Phase 4 shipping the Account → Getting in screen, after
which the line names a place a reader can actually go; or the repository owner asking for
the prototype's tail verbatim.

**Recorded as:** this entry, and the note at the foot of `CodeStep.tsx`'s render, which
names what the prototype has there and why it is not drawn.
