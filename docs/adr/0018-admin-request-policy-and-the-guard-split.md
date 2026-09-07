# 0018 — The admin's request policy runs in the middleware, its guard runs in the Node server

## Context

Phase 2 built the whole server side of signing in — the rate limiter, the one-time-code
service, the credential check, the session store, the reset flow — and all four sign-in
screens. Nothing joined them. Every form on those screens posted to a route that did not
exist, no session cookie was ever set, and `/admin/sign-in/done` rendered the signed-in
state to anybody who asked for the address. This task is the HTTP boundary.

Four requirements from `SECURITY.md` land on that boundary at once, and they do not all
want the same home:

- **"Check authorization on every mutation, not just at login... nothing inherits trust
  from the page it was reached from."** Phase 4 builds ten screens of mutations behind
  whatever this task produces.
- **CSRF protection on cookie-authenticated mutations.** `SameSite=Lax` is already set
  (`docs/adr/0017`) and is not sufficient on its own for a `POST`.
- **A CSP for the admin**, without changing the diary's own headers.
- **"Rotate the session identifier on login; never reuse a pre-auth id."** `startSession`
  already rotates; what this task adds is the place a pre-auth identifier is minted at all,
  which is a new opportunity to get it wrong.

The constraint that shapes everything below: **`apps/web/middleware.ts` runs in Next.js's
Edge runtime.** `pg`, Payload and `node:crypto` do not exist there, so the middleware
cannot read a `sessions` row — and reading the row is the entire question of whether an
identifier authenticates. It also cannot be waved away by checking the cookie's presence
instead: this repository mints a **pre-auth identifier into that same cookie** for anonymous
browsers, because `signIn` requires a non-null `browserSession` and `issueChallenge` binds
the code to it. A presence check would therefore admit every anonymous visitor who had
loaded the sign-in page once, as well as every revoked and expired session.

## Options considered

1. **Everything in the middleware, with a cookie-presence check standing in for
   authentication.** Rejected. It is the arrangement that looks most like "one place, one
   rule", and it authenticates nobody: the value it would find in the cookie is, for most
   requests that have one, the pre-auth identifier this very file mints. It would also be
   the second definition of a rule `guard.ts` owns, which this repository has ruled against
   repeatedly (`rateLimit.ts`'s header: a rule expressed twice is a rule neither test can
   break by itself).

2. **Everything in the middleware, moved to Node.** Next 16 can run middleware on the
   Node.js runtime, and renames the file convention to `proxy.ts`, which always does.
   Rejected for this task: it is a migration of the file that already routes the diary's
   two reading surfaces (`docs/adr/0012`), it changes that file's runtime for thirty-three
   pages this task does not own, and it would put a database read in front of every
   `/p/<n>` request's middleware hop. Worth revisiting when the diary's middleware is
   migrated for its own reasons.

3. **A guard inherited from a shared layout.** Rejected because the layout that would
   cover `/admin/sign-in/done` also covers `/admin/sign-in`, `/admin/sign-in/code` and
   `/admin/reset` — the screens a reader with no session must be able to reach. Splitting
   them into two route groups to get two layouts would put `sign-in` in two directories
   producing sibling addresses, which is harder to read than the thing it replaces.

4. **A synchroniser (CSRF) token in every form.** Rejected in favour of an origin check.
   A token has to be minted per screen, embedded in each form, and stored somewhere to
   compare against — which for the pre-auth screens means a row for every visitor who ever
   loads the sign-in page, on a surface whose whole design avoids writing rows for
   unauthenticated requests. The origin check needs no state at all and applies to a form
   nobody has written yet. What it costs is stated below.

5. **A nonce-based `script-src`.** Rejected for now, and it is the closest call here.
   Next.js documents it, and it is strictly stronger than `'unsafe-inline'`. Its example
   also switches `'unsafe-eval'` on in development, because `next dev` compiles with it —
   so the strict policy would be the one that never runs locally, in a repository whose
   `sessionCookie` sets `Secure` unconditionally for exactly the opposite reason
   ("making it conditional would mean the attribute that matters most is the one never
   exercised before deployment"). The e2e, accessibility and visual suites all run against
   `next dev` locally, so the policy they exercise would not be the policy deployed.

## Decision

**Split by what each half can know, and say so at both halves.**

`apps/web/lib/auth/adminAccess.ts` holds the three decisions that need nothing but a path,
a method and two origins, and `apps/web/middleware.ts` applies them to every `/admin`
request:

- **Which addresses are public.** `ADMIN_PUBLIC_PATHS` lists the steps of signing in and of
  getting back in; **everything else under `/admin` is guarded by default.** Written the
  other way round, every screen Phase 4 forgot to list would be public, and the failure
  would be invisible — the screen works, and it works for everybody.
- **Whether a mutation came from one of our own pages.** `Origin` must equal the request's
  own origin, exactly; **an absent `Origin` is refused**, because every browser since 2016
  sends one on a form `POST`, and treating absence as "probably fine" is the single change
  that makes an origin check decorative. Full origins rather than sites, so a foothold on a
  sibling subdomain — which `SameSite=Lax` treats as same-site — is refused too.
- **What every admin response carries.** `default-src 'self'`, `base-uri 'none'`,
  `object-src 'none'`, `frame-ancestors 'none'`, `form-action 'self'`, `connect-src 'self'`,
  `font-src 'self'`, `img-src 'self' data:`, `style-src 'self' 'unsafe-inline'` and
  `script-src 'self' 'unsafe-inline'`; plus `Referrer-Policy: same-origin`,
  `X-Content-Type-Options: nosniff` and `X-Robots-Tag: noindex, nofollow`. In development,
  and only there, `script-src` also carries `'unsafe-eval'`.

`apps/web/lib/auth/guard.ts` holds the one decision that needs Postgres — whether an
identifier names a live row — and runs in the Node server, called by the page or route
handler that needs the answer.

**What makes forgetting it impossible is a test, not a layer.**
`apps/web/lib/auth/adminGuardRegistration.test.ts` walks the WHOLE `app/` tree off the
filesystem, computes each file's address the way Next.js does — route groups contribute no
segment — and applies four rules to everything answering under `/admin`:

- **A route file** (`page.*`/`route.*`) at a guarded address must either be declared public
  in `adminAccess.ts` or APPLY the guard in its own body. Nothing it imports is read.
- **Every export of every `'use server'` module** in `apps/web` must apply the guard, or
  the module must be named in an empty, default-deny exemption list. A Server Action is a
  `POST` endpoint of its own; the middleware does not close it, because it enforces CSRF
  and never authentication.
- **An inline `'use server'` inside a scanned file is refused outright.** Such an action is
  dispatched BEFORE the page renders, so the page body's own `requireAdminSession()` does
  not gate it — `SECURITY.md`'s "nothing inherits trust from the page it was reached from",
  exactly. The shape is refused rather than analysed, because no text-level check can tell
  that action's guard from the page's.
- **A file under an admin address whose kind is not recognised FAILS**, by name. Route
  file, action module, or one of the Next.js conventions listed with the reason it cannot
  answer a request — anything else stops the suite rather than passing unseen.

A Phase 4 screen, route or action that does none of these fails `npm run verify` on its own
commit.

**That test credited the wrong thing five times, and the fifth is why it is no longer an
enumeration.** The first version matched the guard's NAME anywhere in the file, so deleting
`await requireAdminSession()` left the `import` line and the header comment matching and
every case green. The second stripped comments and imports and required a `(` — and still
passed, because it followed a route file's imports one level and `guard.ts`'s own body
calls `authenticateAdminRequest`. The third stopped following `guard.ts` and still credited
a route for ANY module it imported, so a guarded route re-exporting any handler from
`signInEndpoints.ts` passed. Ruling F61 removed the following entirely and moved the guard
into the route file itself. Phase 2's whole-branch review then found the fourth version
blind three ways at once: it read only `page.tsx`/`route.ts`, under a hard-coded
`app/(admin)/admin`, so a Server Action in an `actions.ts` was never read, an action
defined inside a scanned page was credited with the PAGE's guard call, and a route under a
second route group was invisible to the walk.

Patching those three would have made a sixth inevitable, because every version so far had
been an enumeration — of file names, of directories, of the shapes an author might use —
and an enumeration is wrong the moment somebody uses a shape nobody listed. The current
version discovers rather than enumerates and fails closed on what it does not recognise,
which is the only version of this check whose blind spot is a failing test rather than a
silent pass. Each of the four rules has a mutation of its own that was watched to fail.
Recorded here because the lesson is not local: a structural test written to catch a missing
call has to be shown a missing call, in every shape the call can be missing in.

**The pre-auth identifier is minted in the middleware**, on a safe method, for a public
admin address, only when the browser is carrying no session cookie at all — so a signed-in
reader's session is never overwritten by a page load, a guarded address never hands one
out, and a `POST` is left to the handler that has to set a cookie on its own response
anyway. It is drawn from `crypto.getRandomValues` (Web Crypto, present in both runtimes)
rather than `node:crypto`'s `randomBytes`, which is what the Edge constraint costs.

## Consequences

**A hand-rolled client must send `Origin` to post to any `/admin` address.** `curl`, a
script and a scan all get `403` without one. That is the intended cost of refusing an
absent origin, and it is documented in `docs/api.md` rather than left to be discovered.

**`'unsafe-inline'` and `'unsafe-eval'` in `script-src` mean this CSP does not stop an
injected script from running** — only from loading code from, or sending anything to, an
origin that is not ours. The admin renders no visitor-supplied HTML in Phase 2.

`'unsafe-eval'` was not in the first version of this policy and was added after measuring:
every admin page under `next dev` logged `eval() is not supported in this environment...
React requires eval() in development mode`, four times per page, caught by
`e2e/reset.spec.ts`'s console-error case. React's message says it "will never use eval() in
production mode", so leaving it out would have been green in CI's production build and red
on every developer's machine — the shape `next.config.ts` already argues against at the dev
indicator. It is added unconditionally rather than switched on by environment because it
**costs nothing on top of `'unsafe-inline'`**: a policy that already permits arbitrary
inline script permits arbitrary code, `eval` included. Both come out together on the day
option 5 becomes free of the objection that sank it — which is the day Turbopack's
development build stops needing `eval`.

**The middleware now runs on `/admin/:path*` as well as the two diary prefixes.** The
diary's own responses are asserted to carry none of the admin's headers and no minted
cookie, one case per header, because adding either would be a behaviour change to
thirty-three pages this task does not own.

**Nothing under `/api` can authenticate from this cookie**, and that follows from
`Path=/admin` rather than from anything decided here. Payload's own routes authenticate
with Payload's own cookie and its collection access rules; `signIn.ts` discards the JWT
`payload.login` mints, so signing in to the bespoke admin issues no `/api` credential.
`guard.ts`'s header states this, and any future route of ours under `/api` has to say
which of the two it authenticates with.

**A second cookie now exists, carrying one bit.** "Keep me signed in" is ticked on the
password step and the session is issued at the code step, which submits six digits and
nothing else; `td-keep-signed-in` bridges that gap. It is not a credential and is not
trusted as one — the most a forged value achieves is a thirty-day session for an account
whose password and one-time code the holder has just supplied correctly. The alternative,
defaulting to `false` at the code step, would make the checkbox do nothing at all for every
account with the second factor on, which is every account by default.

## Revision — fix round 1

Two decisions in this ADR were wrong, and both were found by driving a real browser rather
than by reading.

**`Referrer-Policy: no-referrer` broke every form on the surface, and this ADR never
considered the interaction.** Per the Fetch standard a navigation request's `Origin` header
is derived from the referrer policy, so under `no-referrer` a form-navigation `POST` sends
`Origin: null` — which the strict-equality origin check above refuses. Measured in
Chromium. The header is now `same-origin`: `Origin` stays populated for the same-origin
posts this application makes, and nothing is sent cross-origin, so the reason `no-referrer`
was chosen (`/admin/reset/<token>` carries a live token in its address) is still met. The
ORIGIN CHECK IS UNCHANGED — admitting `null` would have admitted every request that carries
no origin at all, which is the case it exists for.

The lasting fix is not the header. It is that no browser test sets a request header any
more: `e2e/signInJourney.spec.ts` fills in the real forms and presses the real buttons,
through the second factor, and reverting the policy fails five of its cases. Every route
test in round 0 supplied an `origin` it chose, under a comment calling it what a browser
would send.

**`'unsafe-eval'` is development-only, not unconditional.** Option 5's rejection stands,
but the consequence written under it did not: a production build was measured with
`script-src 'self' 'unsafe-inline'` and no `'unsafe-eval'` — four admin routes, zero
console errors, zero page errors, hydration working. React's own message says it "will
never use eval() in production mode". So the keyword is added for the development build
alone, which is the opposite of `sessionCookie`'s `Secure` reasoning and deliberately so:
there, a conditional would have left the STRICTER configuration unexercised; here the
stricter configuration is production's, and it is the one CI's browser job and the visual
container both run.

**`adminSecurityHeaders` is a function now, not a constant**, because it takes that one
flag. `apps/web/middleware.ts` is the only caller that reads `NODE_ENV`.

**A third correction, to the structural guard rather than to the policy.**
`adminGuardRegistration.test.ts` credited a route for whatever a module it imported
contained, so a guarded route re-exporting any handler from `signInEndpoints.ts` passed —
the third instance of that class in the one file whose purpose is to stop a screen going
unguarded. The guard is now APPLIED IN THE ROUTE FILE (`export const POST =
guarded(handleSignOut)`), so the scan reads that file and follows nothing. A check that has
to look somewhere else to find its subject can be satisfied by a neighbour.
