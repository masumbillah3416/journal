# Security — read before implementing auth or uploads

## Threat model

One author, no visitor accounts, no payments, no PII beyond the owner's email address. The realistic worst case is defacement or content loss, not data theft. That keeps the surface small — but three things in the prototype are **deliberately insecure** because they are client-side demonstrations, and two upload risks are specific to a photo site and easy to miss.

---

## The three prototype holes — all must move server-side

### 1 · The one-time code is generated and compared in the browser

`Travel Diary Login.dc.html` holds the expected code in component state and compares it client-side. That is a demo of the interaction, not authentication.

Required:

- Generate the code server-side with a CSPRNG
- Store only a **hash** with a 5-minute expiry (`otpChallenges`, see `DATA_MODEL.md`)
- Compare server-side with a constant-time comparison
- Never send the code to the client in any response
- Mark the challenge consumed on success; single use
- Bind the challenge to the session that started it, so a code issued for one browser can't be redeemed in another

### 2 · The OTP on/off flag lives in `localStorage`

To let the two separate prototype files demonstrate the admin toggle driving the login, the flag is kept in `localStorage['om-diary-otp']`. **Anyone can set it to `0` and skip the second factor entirely.**

Required: the code step is required or not based on `users.otpRequired`, read server-side during the login handler. The client never decides. Remove the `localStorage` read and the `storage`/`focus` listeners that sync it.

### 3 · The three-attempt limit is cosmetic

The counter is client state. Six digits is a million combinations; without server enforcement it falls in minutes.

Required, all server-side:

- Max 3 attempts per challenge, then invalidate it and force a resend
- Rate limit per account **and** per IP — a sliding window on both the password and code endpoints
- Account lockout with a cooling-off period (Payload's `maxLoginAttempts` / `lockTime` covers the password step)
- Cap resends: 30-second cooldown, and an hourly ceiling
- Return the same response and timing for "no such account" and "wrong password" — no user enumeration
- The reset endpoint must respond identically whether or not the address exists

---

## Uploads — the two that matter most for a photo site

### Strip EXIF

Travel photographs carry GPS coordinates. Shoot anything at home and you have published your home address; shoot at a hotel and you have published where you were sleeping.

- Read EXIF once to capture `capturedAt` and orientation
- Then **strip all metadata** before storing or serving
- If you offer keeping location, make it opt-in per journey and off by default
- Re-encode stills rather than passing originals through — that removes metadata and any embedded payload in one step

### Never serve uploads from the admin's origin

An SVG is an HTML document. One uploaded file becomes stored XSS with your own session attached.

- **Reject SVG.** There is no use for it here
- Sniff the real type from magic bytes; never trust the extension or the client-declared mime type
- Serve media from a separate domain or bucket origin, so a bypass can't script against the admin
- Set `Content-Disposition: attachment` and a strict `Content-Type` on downloads
- Cap file size and the per-request file count; reject archives
- Give the media origin its own restrictive CSP

Also: the gallery's download action must serve a **derivative through your own handler**, not a bucket URL. Direct URLs invite enumeration of everything in the bucket, including anything marked hidden.

---

## Sessions and access

- Cookies `httpOnly`, `Secure`, `SameSite=Lax`, scoped to the admin path
- Rotate the session identifier on login; never reuse a pre-auth id
- "Keep me signed in" is a longer-lived, **revocable** session row — not a longer JWT
- Back the account screen's session list with real `sessions` rows, or Revoke and "Sign out everywhere" do nothing
- Check authorization on **every mutation**, not just at login. Payload access-control functions per collection; nothing inherits trust from the page it was reached from
- CSRF protection on cookie-authenticated mutations (`SameSite` covers most, but not all flows)
- The public diary needs no auth. Keep the admin on its own subdomain — and for a single author, an IP allowlist or a platform-level gate in front of it is cheap and effective

## Public site

- The diary is static content; serve it from a CDN with no credentials attached
- The `password the whole book` setting must gate server-side. A client-side check leaves the content fetchable
- Respect `indexGalleries` in `robots.txt` **and** with `X-Robots-Tag`, since the pages are statically served
- Rate limit the share endpoint if it ever generates a token

## Dependencies and secrets

- Pin versions and run automated dependency scanning; a single-author site rarely gets patched attentively
- Secrets in the platform's store, never in the repo
- Separate credentials for the media bucket, scoped to that bucket, write-only from the upload path where possible

---

## The thing most likely to actually hurt you

Not an attacker — losing 40GB of photographs.

- Automated **offsite** backups of Postgres *and* the media bucket, on a schedule, to a different provider
- Versioned or write-once bucket storage, so a bad script or a compromised key can't delete history
- **Test a restore.** An untested backup is a hypothesis
- The design's "Export everything" is a genuine feature, not a nicety — wire it up

This deserves more of your attention than anything above it.
