# 8 · Security — the detail

The detail for `docs/testing.md` §8. That document states the suite's tool, its scope
and how to run it, and points here; everything else about the suite is below. The section
numbers are `docs/testing.md`'s and do not change.

- **Tool:** Vitest + scripted probes.
- **Scope:** rate limits, lockout, OTP single-use, SVG rejection, EXIF stripping,
  authorization on every mutation.
- **Status:** partly implemented. The OTP half of it exists as of Phase 2 Task 3:
  `apps/web/lib/auth/otpService.integration.test.ts` runs against a real
  Payload and a real Postgres, with at least one case per `SECURITY.md` bullet under the
  first prototype hole plus the resend limits — the code is never returned, never logged and never
  stored in the clear; a code issued for one session is refused in another; a correct
  code works exactly once; a third wrong guess kills the challenge even for the correct
  code; expiry is derived from `createdAt` rather than the stored `expiresAt`; the
  comparison is `crypto.timingSafeEqual`; and the code is drawn from `crypto.randomInt`.
  Each of those was verified by **mutation** — deliberate breakages, each failing exactly
  the case that names it and no other (the runs are pasted in that task's report).

  **Three of those cases are `Promise.all` bursts, and they are the ones that found a
  real hole.** A limit that holds one request at a time can be nothing at all: the first
  version of the service read the attempt count, spent ~30ms hashing, and wrote the count
  back, so twelve parallel guesses were all evaluated against a three-attempt budget, two
  parallel correct codes both redeemed one challenge, and ten parallel requests all
  mailed a code past an hourly ceiling of five. Every sequential test passed throughout.
  The rule this leaves behind: **any limit expressed as read-check-write gets a parallel
  test, and that test is confirmed to fail before the fix.** All three failed first, and
  each is now pinned to the mechanism that fixes it — a conditional `UPDATE` for the
  attempt and for consumption, a per-account advisory lock for the count-and-insert.

  **Rate limiting and lockout land in Phase 2 Task 4, and they are two files.**
  `apps/web/lib/auth/rateLimit.integration.test.ts` is at least 15 cases over the sliding window
  `SECURITY.md` requires per account and per IP, and the two that carry it are real
  `Promise.all` bursts proving each dimension **independently**: twenty-eight concurrent
  attempts from ONE address against TWENTY-EIGHT accounts admit exactly twenty (so
  nothing but the address can be refusing them), and eighteen concurrent attempts against
  ONE account from EIGHTEEN addresses admit exactly ten (so nothing but the account can
  be). Limiting only one dimension is the common mistake and it is invisible from a
  single-dimension test — per-account alone lets a botnet spray, per-IP alone lets one
  host grind a single account behind rotating proxies. Verified by mutation: removing the
  per-address condition fails the address burst and NOT the account burst, and removing
  the per-account condition fails the account cases and NOT the address burst. Removing
  the rank ordering — so attempts standing _after_ this one are counted against it — was
  caught by the bursts in only three runs out of four, because whether a racer's row
  exists yet at the moment another request ranks is a matter of scheduling. A guard caught
  three times in four is a guard that passes CI the fourth time, so the file also carries
  a **deterministic** case for it: a key seeded with rows written at explicit ids above
  the sequence — inside the window, stamped earlier, but ranking after the attempt that
  follows them, which is what a racer's row looks like without the race — and the
  assertion that the attempt is still admitted. That case fails on every run when the
  bound is removed (five out of five, measured).

  **The session layer lands in Phase 2 Task 6, before the sign-in screens that will use
  it,** because sign-in must issue a session and cannot issue what does not exist.
  `apps/web/lib/auth/sessions.integration.test.ts` is shaped around
  the two ways a test in this area passes while the mechanism is gone:

  - **A rotation test that only asserts "a new identifier exists" passes while the old
    one still authenticates.** So every rotation case asserts the OLD identifier is
    refused, and names the refusal. Verified by mutation: returning the identifier the
    browser arrived with instead of minting one fails three cases and no others, and
    binding the supersede clause to `NULL` — so rotation revokes nothing — fails exactly
    the case named "stops the previous identifier authenticating the moment a new one is
    issued".
  - **A revocation test that checks a field was set passes while nothing reads that
    field.** So no case asserts on `revokedAt`. Each one revokes and then attempts to
    authenticate. Verified by mutation: deleting the line that acts on the domain's
    verdict fails six cases across revocation, expiry and rotation.

  "Keep me signed in" is asserted from three sides, because "the session lasts longer" is
  satisfied by the wrong implementation — a longer-lived token — as readily as by the
  right one: the stored `expires_at` column holds the long lifetime, the identifier is
  byte-identical in shape between a remembered and an ordinary sign-in, and a remembered
  row aged past its expiry stops authenticating while its untouched thirty-day cookie
  still says thirty days.

  Revocation is exercised through the Account screen's own route as well as through the
  module — a Payload `update` by the signed-in reader under their own per-user access —
  so the two paths are proven to meet on the same row rather than assumed to.

  `apps/web/collections/sessions.access.integration.test.ts` is the collection's half,
  and **every case in it is cross-account**: two accounts, each with a session, asserting
  what one can do to the other's row. That is not thoroughness, it is the only shape that
  can see the defect the file was written for - `sessions` declared no access block at
  all, so Payload's `defaultAccess` applied and every operation was granted to "signed
  in" (`docs/deviations.md` §29). A suite with one account would have passed throughout.
  Verified by mutation: removing the block fails five cases.

  **THE PER-FIELD SWEEP IS THE PART TO CARRY INTO PHASE 4**, and it exists because the
  first version of that file was still not enough. It enumerated OPERATIONS - read,
  create, update, delete - and two holes came straight through it, each a field inside an
  operation that is correctly permitted: an owner could re-point `user` at another account
  and authenticate as them, and could write `revokedAt` back to `null` and un-revoke
  themselves. **The unit of authorization on a Payload collection is the field, not the
  operation.**

  So the file now carries one case that attempts an update on **every field the collection
  declares**, with the field list read off `Sessions.fields` rather than written out, and
  the row snapshotted with `SELECT *` rather than a named column list. Both halves matter:
  a field added tomorrow is probed the day it lands, and a column a future field adds is
  compared without anybody remembering to add it. On its **first run** the sweep failed on
  a field neither the reviewer nor the author had enumerated - `createdAt`, which Payload
  injects into a collection's field list when it sanitises it, and which an injected field
  carries no access rule for. That is the argument for the shape, in one measurement.

  Verified by mutation, field by field: removing any one field's `update` refusal fails
  the sweep, and for `user`, `revokedAt`, `tokenHash` and `expiresAt` it fails the named
  case beside it as well. `updatedAt` is the one exception and is recorded as such at the
  line itself - Payload stamps that column after access runs, so no test can distinguish -
  rather than left for a later reader to assume it was proven.

  One fixture lesson came out of that matrix and is worth repeating: the file's cleanup
  used to find its rows by the `device` marker, which the sweep itself overwrites. Under
  one mutation a row survived carrying a probe value, deleting its account then hit
  `sessions.user_id`'s `NOT NULL` against an `ON DELETE set null` foreign key, and the
  **whole file was skipped** on the next run with a not-null violation several cases away
  from the cause. Cleanup now matches by owner. See `docs/data-model.md` for the
  constraint itself.

  A second case covers what bounds the table: a write against one key must sweep aged rows
  belonging to **other** keys. Pruning only the key being written bounds growth by the
  number of distinct keys ever seen rather than by the window, and a spray from many
  addresses is exactly what manufactures keys — three aged rows for one address were
  measured surviving a write against another before the sweep was added.

  `apps/web/collections/users.lockout.integration.test.ts` is the other file, and it
  exercises Payload's `maxLoginAttempts`/`lockTime` for the first time since Phase 0
  declared them. Its load-bearing case is **the correct password being refused**: a case
  that only checked wrong passwords still failing would pass with the lockout entirely
  absent. Writing it found a real defect — Payload takes `lockTime` in milliseconds while
  taking `tokenExpiration`, on the same object, in seconds, so `15 * 60` had been asking
  for a 900-millisecond cooling-off period since Phase 0. Nothing behavioural
  distinguished it, which is why only a case asserting the lock's DURATION could catch
  it (`docs/adr/0016-rate-limit-window-storage.md`).

  **Phase 2 Task 9 adds the journey that ties the reset path together**, in
  `apps/web/lib/auth/setNewPassword.integration.test.ts` and
  `newPasswordScreen.integration.test.ts`. The first case of the first file is the
  one that matters: it requests a reset through the real service, **takes the link out of
  the console mailer's outbox rather than out of the database** — exactly as
  `lib/auth/testing/otpProbes.ts`'s `readCodeFromOutbox` takes a code out of one — spends
  it, and then signs in with the password it set. Reading the column instead would pass
  with a link built from the wrong origin, a link built from the wrong path, or no link in
  the body at all; reading the URL a reader would click is what makes it a test of the
  journey rather than of the column.

  Three of its cases exist because the obvious ones are not enough. "The new password
  signs in" would pass for a reset that ADDED a password, so a second case requires the
  old one to stop working. "The second use of a link is refused" would pass for an
  implementation that cleared the account's password on the way to refusing, so a third
  requires the first use's password to still sign in afterwards. And `refusalFrom` is
  exported and exercised directly, because a live Payload reaches only two of its arms — a
  403 for a token it cannot match and a 400 for a password it refuses — while a thrown
  string, a `null` and an object with no status are what a dropped connection or a future
  release would take, and all three must give the answer that cannot mislead.

  `newPasswordScreen.integration.test.ts` drives the route layer with a real `Request` and
  a real `Response`, which is why both of its route files hold nothing but one call each.
  Every redirect is asserted by **status and `Location` together**: a case checking only
  the location passes on a `200` carrying a header nothing follows, and one checking only
  the status passes on a redirect to the wrong screen.

  **Anti-enumeration and the wiring land in Phase 2 Task 5, and it is the task where
  three mechanisms stop being mechanisms.** `apps/web/lib/auth/signIn.integration.test.ts`
  and `apps/web/lib/auth/passwordReset.integration.test.ts` are shaped around four traps,
  each one this repository has already been caught by:

  - **An anti-enumeration test that compares two error strings passes while the two paths
    differ in timing.** So the identical-response case compares the WHOLE returned value,
    and a second case MEASURES both branches — twenty-five interleaved samples per arm,
    medians compared, asserted inside a deliberately wide 0.6–1.6 band. The timing path
    was taken here rather than the structural one Task 3 fell back to for
    `timingSafeEqual`, and the reason is the size of the signal: there the leak was ~13ns
    behind a ~30ms derivation and could not be measured; here the whole ~40ms derivation
    is what is missing from the miss path, which is an order of magnitude, not a
    fraction. **Measured: 0.90 with the dummy derivation, 0.14 without it.**
  - **A timing case where either arm can drift into a shortcut measures nothing.** Both
    arms would look identical if both were refused by the rate limiter before reaching a
    hash, or if the wrong-password arm had locked its own account and stopped hashing —
    at which point the case passes with the mechanism deleted. So every sample uses a
    fresh requesting address, a fresh sign-in address and a fresh account: no budget and
    no lockout counter is spent twice.
  - **An `otpRequired` test that stubs the flag proves nothing about where it is read.**
    So every case sets it on the ROW and hands `signIn` a request carrying the OPPOSITE
    value as an extra property — what a client trying to force it would look like. A
    `SignInRequest` with no such field is the only thing that makes them pass. Reading it
    from the request instead fails three cases.
  - **A rotation test that asserts "a new session exists" passes while the pre-auth
    identifier still authenticates.** So the rotation case authenticates the OLD
    identifier and expects `'revoked'`. Passing `null` as `previous` fails it and nothing
    else.

  Twelve mutations were run against this task's code and each is recorded in the task
  report with what failed: removing the dummy derivation (the timing case, 0.14), passing
  `null` instead of the browser's identifier (the rotation case), reading `otpRequired`
  from the request (three cases), giving the unknown address its own refusal (two cases),
  giving the LOCKED account its own refusal (one case), removing the limiter call (four),
  treating a NULL `otp_required` as not-required (one), removing normalisation (one), and
  removing the claimed-address dimension from `admitPasswordAttempt` (four in `signIn`'s
  suite and three in `rateLimit`'s), plus three against the reset module.

  Two test-quality lessons came out of that matrix and are worth repeating, because both
  are the same shape — an assertion that is **vacuously true of the mechanism's absence**:

  - The case asserting that an unknown address spends the same windows as a known one
    originally compared the two counts to each other, and **passed under the mutation that
    removed the limiter entirely** — two zeroes are equal. It now asserts both counts are
    ONE.
  - The case asserting that the operator's log line names no address originally checked
    only that the recorded calls contained no address, and **passed while nothing was
    logged at all**. It now asserts the call count first.

  **Review round 1 added a fifth trap, and it is the one with operational teeth.** A bare
  `catch` around Payload's login turned every throw into "wrong password" — so a database
  outage would tell the owner their correct password was wrong and send them to reset it,
  during an incident, with nothing recorded. `checkPassword` now returns three answers
  rather than two, and the suite asserts the distinction in **both** directions: the
  operator is told (and told nothing about who), the reader is told exactly what a wrong
  password tells them, and an ordinary wrong password reports nothing at all. Three more
  mutations, all pasted in the task report: collapsing the classification back to a bare
  catch fails two cases, reporting every refusal fails two others, and letting the outage
  reach the reader as its own refusal fails the case named for it.

  That suite carries the phase's one deliberate test double for a third-party boundary: a
  `Proxy` over the real `Payload` whose `login` rejects. "The credential store cannot
  answer" has no honest inducement — the only real cause is the database being unreachable,
  and taking `diary_test` down mid-run would take every other file with it — so the
  boundary is substituted at the boundary, exactly as `passwordReset.integration.test.ts`
  substitutes a refusing `MailerPort`, and never the module under test (CLAUDE.md §2.3). A
  proxy rather than a spread: spreading a class instance drops its prototype methods, which
  ESLint refuses and TypeScript catches.

  **Fixture addresses: one documentation block per suite, and a counter that cannot leave
  it.** The three sign-in suites clean up by IP prefix, so two sharing a block delete each
  other's rows — harmless only because `fileParallelism` is off. They now hold TEST-NET-1
  (`signIn`), TEST-NET-2 (`rateLimit`) and TEST-NET-3 (`passwordReset`). Each also counts
  IPs on a counter of its own that throws past 254 rather than wrapping: `rateLimit`'s
  addresses and accounts shared one counter that reaches about 260 over a full run, so its
  last fixtures were `198.51.100.255` and beyond — unique strings that are not addresses.
  Nothing failed, because `subject` is text; the fixtures had simply stopped being what
  they claimed to be.

  What is still outstanding is the upload worker's SVG and EXIF probes (Phase 3). The
  PURE half of the SVG refusal landed in Phase 3 Task 2 and is not one of them:
  `packages/domain/src/media/sniff.test.ts` and
  `packages/domain/src/media/ingestPolicy.test.ts` decide the type from the bytes and
  refuse it, at the domain's 100% bar, and the case that carries the requirement feeds
  SVG bytes under the `Content-Type` a browser derives from a `.jpg` name rather than a
  correctly-named `.svg`. `sniff.test.ts`'s second block, `on documents that are markup`,
  holds a class rather than a case: legal markup that carries a container signature's bytes
  at a container signature's offset (`<!--ftypisom…`, `<?x ftypisom?>`, `<br>ftypisom…`,
  a namespace-prefixed root). The Task 2 review defeated a fix that closed one shape of it
  five ways, so the shapes are cases and the fix is structural. What no unit test can do is
  drive a real multipart request
  through a real boundary, which is what the outstanding probe is for - and there is no
  upload boundary to drive yet.

  The PURE half of the EXIF probe landed in Phase 3 Task 3, and it is the half that
  decides whether the phase criterion "EXIF verifiably absent" means anything.
  `packages/domain/src/media/exif.test.ts` holds two things that must not be confused:
  `readExifFacts`, which reads `capturedAt` and orientation out of a photograph, and
  `metadataMarkersIn`, which is the INSTRUMENT the absence is measured with. The probe
  searches the whole buffer for three ASCII signatures and shares no code and no
  structural assumption with the reader, so an absence assertion is a statement about
  the stored bytes rather than about what `sharp` reports having done. Its cases are
  therefore mostly POSITIVE - a scanner that can only ever answer "no" would pass every
  absence assertion ever written against it - including one marker sitting 4,000 bytes
  into a file, which is what fails when the search is bounded to the head. The fixture
  it all rests on, `anExifJpeg`, asserts its OWN content first, in a case named
  `really contains the canary, which is what every absence assertion downstream rests on`,
  because "contains no EXIF marker" is trivially true of zero bytes and of a file that
  failed to encode. What no unit test in `packages/domain` can do is prove the
  fixture agrees with a real encoder: that comparison needs `sharp`, which this package
  must not depend on. It lives in `apps/web` instead, as
  `apps/web/lib/media/exifFixtureCertification.test.ts` (Phase 3 Task 4) - a Docker-free
  unit test, so it runs in the pre-commit gate. It splices the hand-built APP1 segment
  into a JPEG libvips just encoded and then puts the result THROUGH libvips: `keepExif()`
  makes exiv2 re-emit every tag it managed to PARSE, in a layout of its own choosing, and
  the canary and the capture time both survive it. That is the point of the shape - a byte
  search over `metadata().exif` proves only that libvips found the segment, because that
  buffer comes back at full length even when the block's byte-order mark and TIFF magic
  are corrupted. ORIENTATION and the CAPTURE TIME both
  certify in both directions, and this paragraph said otherwise for two commits after
  the measurement that closed it. `sharp`'s `withExif` writes a tag into the numbered
  TIFF directory it is given, and the number for the Exif sub-IFD where
  `DateTimeOriginal` belongs is **`IFD2`** — libvips' own `ExifIfd` ordinal — so the
  round trip succeeds and `media-fixtures.integration.test.ts` reads the capture time
  back off a `sharp`-written file. Naming `IFD0` is what leaves `readExifFacts` with no
  `capturedAt`, and `exifFixtureCertification.test.ts` pins that `undefined` for the
  wrong directory rather than for the encoder. The tool that
  would settle the layout against a third party, `exiftool`, is not installed on this
  machine, so that check remains UNRESOLVED rather than routed through anything online.

- **Run (once added):** included in `npm run test:integration` (these probes need a real
  database and, for the upload cases, the worker), so they run under `verify:full`.
- **Add one (once added):** each row of `docs/security.md` that names a behaviour (not
  just a schema field) gets a negative-case test: e.g. a 4th OTP attempt is rejected, an
  SVG upload is rejected by magic bytes even with a `.jpg` extension, an EXIF-bearing
  upload has no EXIF after processing, enumeration timing is equal for a real and a fake
  account.

#### The HTTP boundary (Phase 2 Task 10), which is where the guard, the CSRF refusal and the CSP are proved

Four new suites, and what decides where each case lives is whether its claim is about a
database.

- **`apps/web/lib/auth/adminAccess.test.ts`, `browserSession.test.ts`, `httpForm.test.ts`
  (unit).** Pure: a path, a method, two origins, a `Cookie` header, a `Request`. All three
  are gated at **100/100/100 by name** in `vitest.config.ts` rather than left under
  `apps/web/lib/**`'s 95%, because each is imported by `apps/web/middleware.ts` and
  therefore runs in the Edge runtime, where a mistake is caught by nothing else.

  The cases worth knowing about are the negative ones. `isCrossSiteMutation` has a case
  named for an **absent** `Origin`, because a check written as `origin !== target` refuses
  `null` by luck rather than by decision, and a later "for robustness" guard would silently
  invert it. `isGuardedAdminPath` has a case for **an address nobody wrote down**, which is
  what makes it a policy rather than a list. `readBrowserSession` has a case for
  `not-td-session=stolen`, which a scan by `indexOf` would read as the reader's session.

- **`apps/web/lib/auth/adminGuardRegistration.test.ts` (unit).** The structural guard: it
  reads every `page.tsx` and `route.ts` under `app/(admin)/admin` off the filesystem, turns
  each into the address Next serves it at, and requires each to be declared public or to
  name the guard — directly or through the one `lib/auth` module it re-exports its handler
  from. **Its first case is a sentinel**: the walk must have found `/admin/sign-in`,
  `/admin/sign-in/done`, `/admin/sign-out` and `/admin/reset/[token]` by name, because a
  scan that walked the wrong directory would find nothing and pass with every screen
  unguarded — the decorative shape CLAUDE.md §10 names. A second sentinel requires at least
  one guarded address to exist, so the main case cannot pass vacuously in a repository
  where everything had been declared public.

- **`apps/web/lib/auth/guard.integration.test.ts`.** Whether an identifier names a live row
  is a fact about the `sessions` table. Four refusals — no cookie, an identifier naming no
  row, a revoked row, an aged-out row — and the two rotation cases the task brief names:
  the pre-auth identifier authenticates nothing before a sign-in, and **still**
  authenticates nothing after it while the new one does. That second case is the one an
  implementation which adopts the identifier it was handed cannot pass; "a session exists
  afterwards" is not.

  **It also EXECUTES `guardedAction`, which nothing did until round 9, and that was the
  sixth whole-branch review's most valuable finding.** The factory an ESLint rule, an ADR
  and four documents exist to funnel every Phase 4 mutation through had no caller anywhere;
  the only thing over its body was two `toContain` substring assertions in
  `adminGuardRegistration.test.ts`. The reviewer replaced the body with a
  `process.env`-keyed path that skipped `requireAdminSession()`, kept both substrings, and
  measured `eslint`/`tsc`/prettier clean with **1,348 unit tests passing** — and the
  `c8 ignore` region over the factory said its "runtime behaviour is covered in the browser
  by `e2e/signIn.spec.ts`", which no browser path could reach.
  `apps/web/lib/auth/guard.integration.test.ts` now stands over it in at least three
  cases: an unauthenticated call never reaches the action and redirects to the sign-in path; an
  authenticated one reaches it with the session the guard produced, as its FIRST argument;
  and a call made after that session is revoked is refused, so a factory caching the session
  it first saw fails. Re-gutting the body the reviewer's way fails all three. `next/headers`
  and `next/navigation` are stood in for — the framework's request boundary, which CLAUDE.md
  §2.3 permits — and everything below them is a real row in a real Postgres, which is why
  the cases live here rather than in a unit file. **`guard.ts` therefore carries no
  `c8 ignore` region at all any more**, and its 100/100/100 in
  `vitest.integration.config.ts` is measured over the factory rather than around it.

- **`apps/web/lib/auth/signInEndpoints.integration.test.ts` and
  `resetRequestEndpoint.integration.test.ts`.** Real `Request`s, a real Payload, and the
  handlers calling `getPayload()` themselves — the same pairing
  `newPasswordScreen.integration.test.ts` makes. Both are gated at **100/100/100** in
  `vitest.integration.config.ts`.

  **The indistinguishable-refusal cases compare the whole response.** `responseShape` reads
  the status, EVERY header and the body, and the three arms are compared with one `toEqual`
  rather than three assertions that happen to agree today — a comparison of the status and
  the `Location` alone would pass for a handler that set a `Set-Cookie` on one arm and not
  the other. The one value that legitimately differs, the freshly minted identifier, is
  replaced by a fixed word rather than dropped, so the cookie's name, its every attribute
  and its **presence** are all still compared. The timing case measures the HANDLER over 25
  interleaved samples per arm, because the handler is what an attacker can reach; the band
  is the same deliberately wide 0.6–1.6 `signIn.integration.test.ts` uses, and every sample
  is fresh in every dimension so that neither arm can be pushed onto the short path.

  **The code step's challenges are issued by the test's own OTP service**, bound to the
  same browser identifier the handler will read out of the cookie. That is not a shortcut
  around the handler — the handler's own mailer prints to a terminal, so it is the only way
  to know the six digits — and what the handler is then asked is the real question: does
  this code, for this browser, produce a rotated session.

  **The reset endpoint's identical-answer case uses two addresses that mask to the same
  string** (same first two characters, same domain), so the whole response is comparable
  rather than only its shape, and then asserts that the one thing which DID differ is
  invisible from outside: only the real address has a reset token.

- **`apps/web/middleware.test.ts`** gained at least eleven cases for the admin, and the ones that
  matter are again negative: the diary's `/p/<n>` response, its `/m/<n>` rewrite and the 308
  off the internal path are each asserted to carry **none** of the admin's headers, one
  header at a time, and to be handed no minted cookie. Adding either would be a behaviour
  change to thirty-three pages this task does not own.

#### Fix round 1: the suite was testing a request shape no browser makes

Every route case in round 0 — unit, integration and browser — SET the `origin` header
itself. `e2e/reset.spec.ts` did it under a comment calling it "what a browser form would
have sent". It was not. Under the `Referrer-Policy: no-referrer` the admin then carried, a
form-navigation `POST` sends `Origin: null`, and the cross-site check refused it: **every
form on the surface answered `403` in a real browser**, with 1,283 unit tests, 314
integration tests, twenty-one mutations and a green browser suite agreeing it worked.

**A second defect of the same shape was underneath it.** `SCREENS.md` §3.2's pane posts six
fields all named `code`. The handler read them through `Object.fromEntries`, which keeps one
value per name, so it compared a single character against a six-digit code. The integration
suite sent a single `code` field and agreed with the handler.

Neither is an untested mechanism. Both are mechanisms **tested against a fiction**, and the
rules that come out of it are:

- **No browser test sets a request header.** `e2e/signInJourney.spec.ts` fills in the real
  forms and presses the real buttons, through the second factor and out the other side; the
  only `page.request` call left in the repository is the one case that exists to assert a
  headerless post is refused with `403`. Reverting `Referrer-Policy` fails five cases across
  that file and `e2e/reset.spec.ts`.
- **A fixture builds the request the same way the product does.**
  `signInEndpoints.integration.test.ts`'s `aPost` now appends one `code` field per digit,
  because that is what the pane sends.
- **The one thing a browser genuinely cannot do is named, not worked around.** The six
  digits live in the server's own mailer outbox and the stored hash is scrypt, so
  `e2e/support/adminSession.ts` issues a second challenge through this repository's own
  `otpService` and reads it from an outbox the test process owns — which is exactly what
  "Send a new code" does. Everything either side of that step is the reader's own.

**The helper checks its own work.** `aSignedInSession` asks the same `authenticate` the
guard asks before handing a session back. Without it, a fixture that failed presented as a
guarded screen quietly redirecting and an assertion failing on a missing element — which is
how one flaky container run read before the cause (three viewport projects sharing one
fixture account, one project's `afterAll` deleting it under another) was found. Every
caller now names its own account and deletes only that one.

**`e2e/tsconfig.json` includes the app's `lib`, `collections`, `globals`, `migrations`,
`scripts` and `payload.config.ts`**, because that helper calls this repository's own
services rather than duplicating what they store. TypeScript projects must list every
transitive file; it is scoped to those directories rather than all of `apps/web` so no React
route is typechecked under a config with no JSX settings.

#### Fix round 2: three fixture defects, and a baseline that was a picture of a transient state

**"Exit 0, no flakes" was read off one run.** Three container runs after round 1 were
clean / 2 flaky / 1 flaky, green only because CI retries once. A summary with a `flaky`
count is not a green suite, and one run is not a measurement of an intermittency. Three
runs are the standing check now, and this section is what they found.

- **Fixtures are keyed per WORKER, not per project.** `test.afterAll` fires once per
  worker and `playwright.config.ts` sets `fullyParallel: true`, so one project's tests
  split across workers and each worker's cleanup deleted the account another worker of the
  same project was still signing in as. Round 1 closed cross-_project_ sharing and left
  this. `e2e/support/adminSession.ts`'s `fixtureLabel` is the fix, and the same mistake was
  in `signInJourney.spec.ts`'s own four accounts.
- **`aSignedInSession`'s self-check reads stronger than it is**, and that is now written at
  it: it proves the session was live AT MINT TIME. Nothing about a fixture can prove the
  row still exists a second later when the browser presents it. Only making the row nobody
  else's does.
- **Cleanup deletes by predicate, not by id.** A `find`-then-`delete({ id })` is not
  atomic, and a row that vanished between the two arrived as a `NotFound` thrown from
  inside Payload — which is what the flaky runs actually reported.
- **`signInEndpoints`' and `resetRequestEndpoint`'s fixture addresses are unique per RUN.**
  `rateLimit.ts` keys its second window on a HASH of the address, which no `LIKE` cleanup
  can match, so those rows outlive `afterAll` for their fifteen minutes. Addresses derived
  from a counter that restarts every run were reused, and two or three runs inside a
  quarter of an hour pushed one past the ten-attempt ceiling: a case posting a CORRECT
  password got `?state=refused`, which reads exactly like a broken handler. It was always
  there; adding cases made it reachable sooner.

**The `cms-admin*.png` baselines were regenerated, and the reason is worth reading.**
Payload's own admin shows "create first user" to an EMPTY database and a login form to one
with any account in it. Those baselines were taken against an empty one — and this suite
now creates an account for the signed-in screen's session, so `/cms` was screenshotted in
whichever state another worker had left. Measured: at 390x844 `/cms` is 1246px tall with no
account and exactly 844 with one; at 1000x800 and 1440x900 it is the viewport height either
way, which is why the failure only ever showed at `mobile`.

The fix is that the suite now GUARANTEES the precondition it baselines, in a `beforeAll`,
rather than inheriting it. The new state is also the durable one: from the moment this
diary has its author account, every deployed instance shows the login screen, so the old
baselines were a picture of a condition that only holds before anyone signs up. Both images
were opened and compared — same unstyled treatment, only the screen differs — and
`e2e/layout.spec.ts` was green in the run that produced them, per the standing rule.

#### Task 11: the log, and the browser sweep

**`apps/web/lib/auth/logSafety.integration.test.ts`** is the one security assertion that
belongs to no single module: nothing this surface hands to a log carries a secret, a code, a
token or a whole email address (`CLAUDE.md` §7). Every service already asserts its own call
site — `otpService`'s suite that the mailer's terminal line carries no code, `signIn`'s that
the credential-store report names neither address nor password. What none of them can see is
the union, and two things had no assertion at all before this file: **reset tokens** and
**session identifiers**.

It drives one whole journey — unknown address, wrong password, correct password, wrong code,
right code, session started, authenticated and revoked, reset link, credential-store outage —
with both sinks recording: all six levels of `payload.logger`, and the mailer's own
`logLines`. There is no third sink, and that is enforced rather than assumed:
`eslint.config.js` sets `no-console: 'error'` repository-wide with two path-scoped
exceptions, each naming one file: the console mailer, and `scripts/run-lighthouse.mjs`,
which is a terminal command rather than application code (finding 43 — this sentence said
one). Neither is reachable from the sign-in surface. That is also why this file does not
patch `console` — doing so would need the very kind of override whose absence over
application code is the guarantee.

**Every case reads the transcript through a guard that refuses to hand it over unless both
sinks are demonstrably in it.** Six negatives over a string are six assertions that hold
trivially when the string is empty, which is this phase's most-repeated defective test shape.
Break the drive and all six fail, rather than all six passing.

Four mutations, each watched to fail the case named for it:

```
console-mailer prints message.text on the non-development branch  -> code case, reset-token case
signIn.ts appends the address to the credential-store report      -> address case
sessions.ts logs the identifier it has just minted                -> session case
signIn.ts's credential-store report deleted entirely              -> all six, through the guard
```

**The browser sweep** is `docs/qa/2026-09-07-sign-in-sweep.md`: seven addresses at three
viewports plus one driven journey, with `console`, `pageerror`, `requestfailed` and every
response >= 400 attached before every `goto`, and 21 axe analyses with no exclusions and no
violations. It found **four** defects — three, plus a fourth its own review found in the same
family — all on `/admin/sign-in/code`, none visible to any assertion in this repository, and
all four faces of one decision: `otpService` treated a challenge that could no longer be
answered as one that had never existed. The screen therefore drew the no-challenge
placeholder, the placeholder re-anchored both countdowns on every render, the pane's own
"Three wrong codes" message became unreachable while its jsdom case stayed green, and "Send a
new code" — the only move `SECURITY.md` §3 leaves an exhausted reader — mailed nothing and
said nothing.

**Fixed as one class**, per `.claude/skills/fixing-browser-defects/SKILL.md`: six cases
written red first (five in `otpService.integration.test.ts`, one in
`signInEndpoints.integration.test.ts`), the cause fixed in two reads rather than the four
symptoms, and `readCodeScreen.integration.test.ts`'s "falls back to the placeholder once the
guesses are gone" INVERTED — that case had been ratifying the defect, and was the second time
the same case had asserted the wrong thing.

**The sweep found three of the four and stopped one click short of the fourth.** It drove the
resend button, waited out the cooldown, recorded `"Send a new code", disabled false` — and
never pressed it. A sweep that walks up to a control and stops has not tested it.

The sweep driver was a temporary spec, deleted once the report was written;
`e2e/ciRegistration.test.ts` correctly failed while it existed and passes now.

#### `apps/web/lib/auth/securityCitations.test.ts` — the citation column checks itself

`docs/security.md` quotes a test case name for every requirement it discharges — a hundred
and some, and the guard below asserts a FLOOR rather than the number, for the reason its own
comment gives. Task 11 wrote them and claimed none
was paraphrased; its review found three that were, plus nine more carrying Markdown the
source does not (backticks inside the quotation, restyled quotes), so twelve could not be
found by a reader who searched for them. Every one pointed at a real, correct, covering case
— which is what makes it dangerous rather than obvious: nothing was wrong with the discharge,
only with the citation.

Nobody can hold that many strings in their head across a rewrite. This unit test reads the document
and every `.ts`/`.tsx` file under `apps/`, `packages/` and `e2e/`, extracts the first
argument of every `it(...)` and `test(...)` it finds, and requires each citation to be one of
those names. It normalises exactly two things, both notation rather than words: the backslash
TypeScript needs before an apostrophe inside a single-quoted literal, and the curly
apostrophe. Nothing else — so a paraphrase of any kind still fails.

**Two things about it were weaker than it read, and were tightened in the same round it was
written.** It matched only curly `“…”` runs, so a citation typed with straight quotes was not
checked at all — and not checked SILENTLY, which is the failure mode it exists to end. And
its corpus was every source file's whole TEXT, so a quotation that appeared only inside a
module header comment resolved, while the case was named "are all real". It now reads both
quote characters and matches against declarations, and it separates citations from quoted
PROSE — the fragments which quote the handoff, the UI or a dependency's message rather than
a test — by an explicit list rather than by which quote character
somebody typed. Every entry of that list must still appear in the document and must not be a
declared case name, so an exemption cannot outlive the sentence it exempts or quietly excuse
a real citation.

Non-vacuous five ways: a floor on the number of citations found; a floor on the number of
declarations extracted (the corpus is an extraction now, so a pattern that stopped matching
must say so in one failure rather than 113); a sentinel string required to be ABSENT from the
declarations, so the search is proved able to say no; a case name owned by another file
required to be PRESENT, so an extraction that returned nothing fails here; and the
exemption-list checks above. It excludes its own source from the corpus, which is what keeps
the sentinel meaningful.

**It reads the whole document, not its table rows, as of the Phase 3 standards task.** The
citations lived in one wide table until that task broke the table up; a line filter on `|`
would have gone on passing over zero citations, and what caught the change was the floor.
The document is whitespace-collapsed before matching, because a quotation in wrapped prose
spans lines and a per-line regex would see two fragments rather than one name.

Proved able to fail, four ways, each failing the case named for it:

```
a curly citation reworded "not from" -> "rather than"            -> unfindable
a bogus citation typed with STRAIGHT quotes                      -> unfindable (silently ignored before)
a citation that exists only in a module header comment           -> unfindable (resolved before)
the sentence one prose exemption covers, deleted                 -> stale exemption
```
