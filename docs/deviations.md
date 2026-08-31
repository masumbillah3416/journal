# Deviations from the handoff

Every departure from `handoff/design_handoff_travel_diary/` is recorded here, per
`CLAUDE.md` §1.1 (`// HANDOFF-DEVIATION: <reason>` in code) and §1.2. Source: design spec
§15, which lists these same four and cross-references §2.1–2.3 and §7.1 for the detail.

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

---

Everything else follows the handoff as written, including all copy. The voice is
deliberate — "nineteen tarts, no regrets" is content, not a placeholder, and is not to be
replaced or "improved" during implementation.
