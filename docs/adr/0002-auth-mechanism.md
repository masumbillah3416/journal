# 0002 — Auth mechanism: Payload auth + custom OTP, not Auth.js

## Context

Three handoff documents disagree with each other on this point:

- `handoff/design_handoff_travel_diary/README.md` recommends **Auth.js** with
  credentials plus email OTP via a transactional mail provider.
- `handoff/design_handoff_travel_diary/DATA_MODEL.md` specifies the `users` collection
  with Payload's own auth configuration already wired in:
  `auth: { tokenExpiration: 60 * 60 * 24 * 7, maxLoginAttempts: 5, lockTime: 15 * 60 }`.
- `handoff/design_handoff_travel_diary/SECURITY.md` credits **Payload's**
  `maxLoginAttempts` / `lockTime` for satisfying the account-lockout requirement on the
  password step: *"Account lockout with a cooling-off period (Payload's
  `maxLoginAttempts` / `lockTime` covers the password step)."*

Auth.js and Payload's built-in `users` auth are both complete session systems — cookie
issuance, login attempt tracking, token expiry. Adopting the README's recommendation
literally means building a second one alongside the auth config `DATA_MODEL.md` already
puts on the `users` collection, which `SECURITY.md` is already relying on.

## Options considered

1. **Auth.js**, per the handoff README, with a custom email-OTP provider layered on it.
   Rejected: `DATA_MODEL.md`'s `users` collection already declares Payload's own
   credential and lockout configuration, and `SECURITY.md`'s password-step protection is
   explicitly attributed to that configuration. Introducing Auth.js on top means either
   duplicating `maxLoginAttempts`/`lockTime` behaviour in Auth.js (redundant with
   Payload's, and now two places to keep in sync) or leaving Payload's auth config
   present but unused (dead configuration contradicting the schema that ships it).
   Either way: two session systems, one app, for no gain.
2. **Payload's own `users` auth as the credential store and lockout mechanism, with a
   custom one-time-code layer built on top** — chosen. Resolves the conflict in favour of
   `DATA_MODEL.md` and `SECURITY.md`, which are the more specific and more binding of the
   three sources (data model schema and hardening requirements outrank a stack
   suggestion).

## Decision

- **Payload's `users` collection auth** is the credential store: password hashing,
  session cookie issuance for the base session, and the password-step lockout
  (`maxLoginAttempts: 5`, `lockTime: 15 * 60` from `DATA_MODEL.md`) — built into Payload,
  configured once, no bespoke code.
- **A custom OTP layer sits on top**, entirely server-side per `SECURITY.md`'s three
  fixes to the prototype's client-side demo:
  - `otpChallenges` collection: CSPRNG-generated code, only its hash stored, 5-minute
    expiry, 3-attempt limit, single-use (`consumedAt`), bound to the pre-auth session
    that started it.
  - `users.otpRequired` read server-side during the login handler — the only source of
    truth for whether the second factor runs. The prototype's `localStorage` flag and
    its `storage`/`focus` listeners are deleted, not moved.
  - Application-level rate limiting (per account **and** per IP, sliding window in
    Postgres) on both the password and code endpoints, resend cooldown and hourly
    ceiling, and anti-enumeration (identical response and timing for "no such account"
    and "wrong password").
  - `sessions` collection backing real, revocable sessions listed on the Account screen
    — Payload's default session is not designed to be listed and individually revoked
    per device, so this is bespoke.
- **Auth.js is not used.** No second session/cookie system exists in the app.

## Consequences

- **One session system, not two.** Every cookie the app issues, and every place a
  request's identity is checked, traces to Payload's auth plus the code built in this
  decision — there is no second library's session model to reason about or keep in sync.
- All OTP-specific security work (CSPRNG generation, hashing, constant-time comparison,
  single-use consumption, anti-enumeration, rate limiting, resend cooldown, session
  rotation on login, cookie policy, CSRF protection) is bespoke application code, since
  neither Payload nor Auth.js provides a one-time-code second factor out of the box. It
  is built and tested to the same rigor as any other domain logic — the design spec
  marks Phase 2's exit criterion as "the security test suite passes, including the
  negative cases" for exactly this reason.
- Logged as deviation 1 in `docs/deviations.md` and in the design spec §2.1/§15.
