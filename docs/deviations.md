# Deviations from the handoff

Every departure from `handoff/design_handoff_travel_diary/` — and every deliberate,
documented exception to `CLAUDE.md` itself — is recorded here, per `CLAUDE.md` §1.1
(`// HANDOFF-DEVIATION: <reason>` in code) and §1.2. Entries 1–4 come from design spec
§15, which cross-references §2.1–2.3 and §7.1 for the detail; 5 onward were added as
later tasks found them. §5 and §16 are correction records rather than active
deviations, and §11 is a withdrawn one.

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
