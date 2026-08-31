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
| Downloads through our handler | short-lived signed URL, `Content-Disposition: attachment`, strict `Content-Type`. Never a bucket URL — direct URLs invite enumeration of everything in the bucket, including anything hidden | Phase 1 (gallery + lightbox download action) |
| `passwordProtect` gates server-side | a client-side check leaves the content fetchable | Phase 1 (diary routing) |
| `indexGalleries` respected | `robots.txt` **and** `X-Robots-Tag`, since pages are statically served | Phase 1 (gallery route) |
| Secrets in the platform store | never in the repo; `.env` is gitignored | Phase 0 for repo hygiene (`.gitignore` already excludes `.env`, `.env.*`, keeping only `.env.example`) — moving real secrets into each provider's platform store happens as each provider is actually provisioned at deploy time, which is not pinned to a single phase in §4 |
| Offsite backups of Postgres **and** the bucket, restore tested | scheduled dump to a different provider; restore drill in `docs/runbook.md` | Not assigned to a phase in design spec §4 — this is operational/deploy work, not an application feature, and the phase plan does not name a phase for it. It must exist before the app is trusted with real photographs; see the restore drill in `docs/runbook.md` |

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
worker pipeline (Phase 3): magic-byte sniffing and SVG rejection, then EXIF read-then-
strip before storage, as detailed in `docs/data-model.md` and design spec §9.2.
