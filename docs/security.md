# Security

Every requirement in `handoff/design_handoff_travel_diary/SECURITY.md` has a named home.
The table below is copied verbatim from design spec §10 (which is itself the discharge
plan for `SECURITY.md`), with one column added: **Discharged in**, naming the phase (per
design spec §4's phase plan) in which the requirement becomes functionally true — not
merely when a collection field exists, but when the behaviour it describes actually runs
and can be tested. These are forward references to planned work, not placeholders: each
one names a real phase with a real, already-written scope in the design spec.

A note on the phase mapping: design spec §4 lists `otpChallenges` and `sessions` twice —
once under Phase 0 ("all collections and the first migration"), once under Phase 2
("`otpChallenges` and `sessions`" as a Phase 2 deliverable). Read together, the schema
(fields, indexes, migration) lands in Phase 0; the behaviour that makes each row's
requirement actually true — generation, comparison, rate limiting, revocation — lands in
Phase 2, which is what "Discharged in" tracks below. See the report accompanying this
task for this observation as a noted inconsistency rather than a silent assumption.

The offsite-backup row's phase (last row of the table) was not resolvable from the
design spec alone — §4's phase plan never names a phase for it — and was settled by a
controller ruling: Phase 3, because that is the first phase where both Postgres and the
media bucket hold real content worth restoring. The restore procedure itself is written
in `docs/runbook.md` starting in Phase 0; only the *demonstrated* drill is gated to
Phase 3.

| Requirement | Discharged by | Discharged in |
|---|---|---|
| OTP generated server-side with a CSPRNG | auth service, Phase 2 | Phase 2 |
| Only a hash stored, 5-minute expiry | `otpChallenges.codeHash`, `expiresAt` | Phase 2 |
| Constant-time comparison, single use | auth service; `consumedAt` set on success | Phase 2 |
| Code never sent to the client in any response | asserted by a security test | Phase 2 |
| Challenge bound to the session that started it | pre-auth session id on the challenge | Phase 2 |
| `otpRequired` decided server-side | `users.otpRequired`. The `localStorage` read and its `storage`/`focus` listeners are **deleted, not moved** | Phase 2 |
| Max 3 attempts, then invalidate and force resend | `otpChallenges.attempts` | Phase 2 |
| Rate limit per account **and** per IP | sliding window in Postgres, on both password and code endpoints | Phase 2 |
| Account lockout with cooling-off | Payload `maxLoginAttempts: 5`, `lockTime: 15m` | Phase 2 (config is declared on the `users` collection in Phase 0; it takes effect once the sign-in flow that calls Payload's login API exists) |
| Resend cooldown 30s plus an hourly ceiling | auth service | Phase 2 |
| No user enumeration | identical response **and** timing — a dummy password is hashed when the account does not exist, otherwise the timing leaks what the response hides | Phase 2 |
| Reset responds identically whether or not the address exists | same mechanism | Phase 2 |
| Sessions revocable, listed on the Account screen | real `sessions` rows checked per request | Phase 2 (revocation mechanism); Phase 4 (Account screen lists them) |
| Session id rotated on login | never reuse a pre-auth id | Phase 2 |
| Cookies `httpOnly`, `Secure`, `SameSite=Lax`, scoped to admin | cookie policy, Phase 2 | Phase 2 |
| CSRF protection on cookie-authenticated mutations | Phase 2 | Phase 2 |
| Authorization on **every** mutation | Payload access control per collection — nothing inherits trust from the page it was reached from | Phase 2 (built before the admin's ten screens exist, deliberately — see design spec §4, Phase 2) |
| Media served from a separate origin | R2 custom domain with its own restrictive CSP | Phase 1 (public diary rendering references media by URL for the first time) |
| A hidden media item stays hidden from a signed-out reader | `media`'s own `access.read` returns a `{ hidden: { not_equals: true } }` constraint rather than `true`, so the exclusion applies to `/api/media/file/<name>` as well as to a listing (`apps/web/collections/media.ts`) | **Discharged in Phase 1 Task 10**, the first task whose page displays a photograph. Asserted by `apps/web/collections/collections.integration.test.ts` — one case that a reader CAN read an ordinary item, one that they CANNOT read a hidden one, and one that a signed-in editor still can. Without a rule of its own the collection inherited Payload's default ("a logged-in user"), so every photograph in the public diary answered `403` — a failure invisible in a screenshot, since the page laid out perfectly with empty frames |
| Downloads through our handler | `GET /gallery/<slug>/download/<id>` (`apps/web/app/(diary)/gallery/[slug]/download/[id]/route.ts`), whose whole body is `apps/web/lib/readGalleryDownload.ts` and whose pure rules are `packages/domain/src/galleryDownload.ts`. Never a bucket URL: the `href` the lightbox renders is `galleryDownloadPath`'s root-relative path — no scheme, no authority, both segments percent-encoded — so it cannot resolve to `MEDIA_ORIGIN` or to any other origin. The handler serves a **derivative** (`hero`, else `frame`, else `tile`, else `thumb`; never `hero2x`, and never the uploaded original) with `Content-Disposition: attachment`, a `Content-Type` from a three-value allowlist that refuses `image/svg+xml` by name rather than by hoping the upload pipeline did, `X-Content-Type-Options: nosniff` and `X-Robots-Tag: noindex`. It verifies four things before reading a byte — the journey is published, the frame belongs to *that* journey, the frame is not `hidden`, and `allowDownload` is not `false` — and answers **one identical 404 for every refusal**, so it cannot become the enumeration oracle the requirement exists to close. A short-lived signed URL was considered and not taken (`docs/deviations.md` §17): this app already fronts the store, so signing would add an expiry to reason about without removing a hop | **Discharged in Phase 1 Task 14**, with the gallery and its lightbox. Asserted by `apps/web/lib/readGalleryDownload.integration.test.ts` (ten cases against a real Payload, a real Postgres and the real files on disk — four of them refusals, plus one that every refusal is the *same* refusal), by `packages/domain/src/galleryDownload.test.ts` (the allowlist, the derived filename, the root-relative path), and in the browser by `e2e/gallery.spec.ts`, which reads the response headers a unit test cannot see |
| `passwordProtect` gates server-side | a client-side check leaves the content fetchable | Phase 1 (diary routing) |
| `indexGalleries` respected | `robots.txt` **and** `X-Robots-Tag`, since pages are statically served | **Still Phase 1, and still open after Task 14.** The gallery route exists now, but `site.indexGalleries` is a setting nothing in this repository writes or reads yet (`apps/web/globals/site.ts`), and the Settings screen that would set it is Phase 4. Hard-coding a directive in Task 14 would have been inventing the policy rather than respecting the setting, so the gallery route sets none. The download handler beneath it does set `X-Robots-Tag: noindex` unconditionally, which is not this row: a downloaded file is never a result to index, whatever the author decides about the gallery page itself |
| Secrets in the platform store | never in the repo; `.env` is gitignored | Phase 0 for repo hygiene (`.gitignore` already excludes `.env`, `.env.*`, keeping only `.env.example`) — moving real secrets into each provider's platform store happens as each provider is actually provisioned at deploy time, which is not pinned to a single phase in §4 |
| Offsite backups of Postgres **and** the bucket, restore tested | scheduled dump to a different provider; restore drill in `docs/runbook.md` | Phase 3. The design spec's phase plan (§4) does not itself name a phase for this operational requirement; the procedure is documented now, in Phase 0 (`docs/runbook.md`), but Phase 3 is the first point at which both Postgres and the media bucket hold real content, so it is the earliest phase where a restore drill proves anything. A demonstrated (not merely written) drill is a Phase 3 exit criterion. |

The last row is the one `SECURITY.md` says deserves more attention than everything above
it: *"Not an attacker — losing 40GB of photographs. Automated offsite backups of
Postgres and the media bucket, on a schedule, to a different provider. Versioned or
write-once bucket storage, so a bad script or a compromised key can't delete history.
Test a restore. An untested backup is a hypothesis."* The realistic disaster for a
single-author personal blog is data loss, not intrusion, and the "Export everything"
feature on the Settings screen exists for the same reason — a genuine feature, not a
nicety.

## Threat model

Restated from `SECURITY.md`: one author, no visitor accounts, no payments, no PII beyond
the owner's email address. The realistic worst case is defacement or content loss, not
data theft. Three things in the prototype are deliberately insecure because they are
client-side interaction demos, not authentication (the OTP compared and generated in the
browser, the OTP on/off flag in `localStorage`, and the client-side three-attempt
counter) — all three are the rows above whose fix is "server-side" and "Phase 2." Two
upload risks are specific to a photo site: EXIF leaking the author's location, and an
uploaded SVG being an HTML document that becomes stored XSS. Both are discharged by the
media pipeline (Phase 3): magic-byte sniffing and SVG rejection, then EXIF read-then-
strip before storage, as detailed in `docs/data-model.md` and design spec §9.2. This runs
via the `MediaProcessor` port's `inline` adapter, in-process on Vercel, not a separate
Fly.io worker — the worker adapter is deferred until video is enabled
(`docs/adr/0004-media-pipeline-mode.md`), and both adapters run the same steps for
stills, so this discharge holds regardless of which one is bound.
