# 3 · Contract — the detail

The detail for `docs/testing.md` §3. That document states the suite's tool, its scope
and how to run it, and points here; everything else about the suite is below. The section
numbers are `docs/testing.md`'s and do not change.

- **Tool:** Vitest — one shared suite run against both the local and the production
  implementation of each adapter.
- **Scope:** `storage`, `mailer`, `queue` (design spec §6) — every port that crosses into
  an external service.
- **Status: THE SUITES EXIST AND THE ROW IS NOT DISCHARGED, because each runs against
  ONE implementation.** `CLAUDE.md` §2 asks for "one shared suite run against **both** the
  local and the production implementation"; `storage` has only `local-storage.ts`, `mailer`
  only `console-mailer.ts`, and `queue` only `postgres-queue.ts`. A suite run against one
  adapter proves that adapter, not the interchangeability the row is about — which is the
  whole reason the row exists, since the defect it guards against is a production adapter
  that differs from the stand-in in some way nobody noticed.

  It is a **named residual, not a gap this document is quiet about** (Phase 2's final
  review, finding 24: it was missing from the residual list entirely). It is inherited
  from Phase 0 and is Phase 3's to close, because Phase 3 is what brings the second
  implementations — R2 for `storage`, a sending adapter for `mailer`, the Fly.io worker for
  `queue`. What this phase can say for the suites is the thing that makes closing it cheap:
  every one is already parameterised over an adapter factory rather than written against
  the adapter it happens to have, so the second implementation is a second call, not a
  second suite. That property is asserted below rather than assumed.

- **What IS implemented for all three ports (Tasks 7-9).** Each port lives in
  `apps/web/lib/ports/<name>.ts`; each contract suite is a
  `apps/web/lib/adapters/contract/<name>-contract.ts` module exporting a
  `<name>Contract(name, makeAdapter, ...)` function that registers one parameterised
  `describe` block — written once, run unchanged against every adapter.

  **An adapter-specific harness arrives as a PARAMETER, never as an import.**
  `storage-contract.ts` states that an offered upload URL stops working when its lifetime
  runs out — a behaviour no case can check by reading the URL, since every adapter encodes
  its expiry differently. So the suite takes an `UploadUrlRedeemer`: "attempt the upload
  this URL offers, as if it were now `at`". The local adapter's redeemer lives in
  `apps/web/lib/adapters/local-storage.test.ts` and drives `receiveLocalUpload`, which is
  local-only; an R2 redeemer will PUT to the bucket, and the three lifetime cases run
  against it unchanged. Writing the local redemption into the shared suite instead would
  have made those cases unrunnable against R2 — a shared suite in name only.

  **The contract pins the adapter; the CALLER's own choice is pinned where the caller is
  tested.** These cases say an adapter honours whatever lifetime and cap it is handed — they
  cannot say which values `offerUploadSlots` chose. That is
  `apps/web/lib/media/uploadSlots.integration.test.ts`'s, which redeems an offered URL
  through `receiveLocalUpload` at `UPLOAD_URL_TTL_SECONDS` and one millisecond past it, and
  with a declared `Content-Length` of exactly `MAX_UPLOAD_BYTES` and one byte over. Both
  read the imported constant, never a literal — a literal would re-pin the number in a
  second place and the two would drift. The declared-length route is what exercises both
  sides of a fifty-megabyte cap without moving fifty megabytes. Four mutations at the call
  site were watched failing (`86_400`, `60`, `1`, `MAX_UPLOAD_BYTES * 2`), **each failing
  exactly one case**; before these cases all four left the directory's 58 tests green. The
  redemption body is ONE byte deliberately: at three it was over a mutated cap of `1`, so
  that mutation also failed the two cases named about lifetime, and a reader chasing the
  lifetime failure would have inspected arithmetic that was correct.

  **The lifetime is BRACKETED rather than injected**, because the adapter mints its expiry
  from its own clock and no case can know the minting instant. `before = Date.now()` around
  the offer gives `before + ttl <= expiresAt <= after + ttl`, which makes two instants
  exact: `before + ttl` is inside the window and `after + ttl + 1` is outside it, whatever
  the minting cost. Which side is inclusive is read off `verifyUploadToken` (it refuses only
  `now > expiresAt`) and said at the assertion. Three mutations were watched failing:
  a ten-year constant, a zero lifetime, and a hard-coded `900 * 1000` that ignores the
  option — the last is why a second pair of instants is asserted at `expiresInSeconds: 60`.

  **A contract suite imports its port's type and nothing else.** That is the property
  that makes it reusable, and it is easy to lose: `queue-contract.ts` briefly imported a
  `jobRow()` helper that called `getPayload()`, so the "reusable" queue suite could only
  run somewhere Payload was available — a future worker-backed adapter would have had to
  drag a CMS in to be contract-tested. It now takes a `readJobRow` probe from whichever
  test wires it up, and the Payload-backed reader lives in
  `postgres-queue.integration.test.ts` where the adapter it belongs to lives. Anything a
  suite needs that is adapter-specific arrives as a parameter.

  Today's adapters:
  - `storage` → `apps/web/lib/adapters/local-storage.ts` (filesystem). Path traversal is
    rejected by `validateStorageKey`, exported from the port itself, not the adapter — the
    Cloudflare R2 adapter arriving in Phase 3 has no filesystem to protect, so the guard
    has to live somewhere every adapter shares.
  - `mailer` → `apps/web/lib/adapters/console-mailer.ts` (prints to the terminal). The
    contract asserts the security requirement from `CLAUDE.md` §7 directly: `logLines`
    (what actually reached the terminal) never contains a full email address (masked to
    `m***@example.com`) or the message body, which carries the OTP code. Full messages
    stay available to tests via a separate in-memory outbox, `sent`.

    `sent` and `logLines` are declared on `TestableMailer`, which extends `MailerPort`;
    the port itself is `send()` alone. They were briefly on the port, which would have
    obliged Phase 2's Resend adapter to retain every OTP message body in process memory,
    unbounded, purely to satisfy a type that exists for tests. `StoragePort` and
    `QueuePort` never had an equivalent; the split is what brings the three back into
    line.

    The contract is wired with `isDevelopment: false` **explicitly**. The console adapter
    deliberately prints the code when `isDevelopment` is true, and letting that flag
    default from `NODE_ENV` (as the wiring first did) made the §7 security assertion
    depend on an ambient environment variable: green on CI, red for any developer whose
    shell exported `NODE_ENV=development`, reporting a leak that was not one. Confirmed
    by running the old wiring under `NODE_ENV=development`:
    `× never records the message body, which carries the code → expected 'mail: sent
"Your code" to a***@b.com …' not to contain '123456'`. `CLAUDE.md` §2.3 requires
    time and environment to be injected for exactly this reason.

  - `queue` → `apps/web/lib/adapters/postgres-queue.ts` (the `jobs` table, Task 9). The
    concurrency case — two concurrent `claim()` calls must yield the job to exactly one
    caller — is why this suite is an _integration_ test
    (`postgres-queue.integration.test.ts`, needing real Postgres): `claim()`'s
    `SELECT ... FOR UPDATE SKIP LOCKED` has no meaning against a mock.

    The contract's own `Promise.all([queue.claim(), queue.claim()])` case is a **smoke
    test only**, named as one — on a fast local database two full `claim()` round trips
    were measured to complete back-to-back rather than genuinely overlapping, so it still
    passed 8/8 times with the locking clause deleted from the adapter. The real
    regression test is `postgres-queue.integration.test.ts`'s 'claim() skips a row a
    concurrent transaction is holding, rather than blocking for it': it opens a raw
    connection, has it `SELECT ... FOR UPDATE` (no `SKIP LOCKED`) the job's row and leave
    that transaction open and uncommitted, then calls the real `queue.claim()` and races
    it against a short timeout via `Promise.race`. With the clause present, `claim()`
    returns `ok(null)` promptly; without it, `claim()`'s own `SELECT` blocks on the held
    lock and the assertion fails with a clear diff instead of hanging. An earlier version
    of this test issued the same hand-written SQL on two raw connections without calling
    `claim()` at all — which proved Postgres implements `SKIP LOCKED` (never in question),
    not that the adapter uses it; that version was replaced after review because deleting
    the clause from the adapter left it passing.

- **Run:** unit-reachable contracts (`storage`, `mailer`) run under `npm run verify` like
  any other unit test; the `queue` and `MediaProcessor` contracts, being
  integration-only, run under `npm run verify:full` / `npm run test:integration`.
- **The `MediaProcessor` contract (Phase 3 Task 6) is the one ADR 0004 calls
  non-negotiable**, so it is worth saying exactly what it does and does not prove.
  `apps/web/lib/adapters/contract/media-processor-contract.ts` is registered twice, by
  one line each in `inline-media-processor.integration.test.ts` and
  `worker-media-processor.integration.test.ts`, with an `expectation.mode` that says
  which side of the video switch the adapter under test is on — so the mode case
  asserts BOTH sides of the flag (`inline` refuses `video/mp4` as `'video-deferred'`;
  `worker` returns a clip with a poster) rather than two suites drifting apart.
  - **A suite can only prove the two BEHAVE the same. What makes them the same is that
    there is one pipeline:** `apps/web/lib/media/stillPipeline.ts` holds steps 1 to 6
    and both adapters compose it. `worker` adds step 7 and nothing else. That is the
    answer to “are the two still pipelines the same?” — checkable in one file rather
    than by diffing two that will drift.
  - **Every absence assertion carries its positive control IN THE SAME TEST.** “The
    stored bytes carry no EXIF marker” is trivially true of zero bytes and of a file
    that failed to encode, so the metadata case asserts the INPUT carries `exif` and
    the ASCII canary, and that the OUTPUT is a real non-empty artefact, before it
    asserts the absence. `media-fixtures.integration.test.ts` does the same for the
    fixtures themselves, one layer down.
  - **The port's loudest invariant is now one of the shared cases.** “`process` NEVER
    THROWS” is stated at the top of `apps/web/lib/ports/mediaProcessor.ts`, and until
    Task 6's review nothing asserted it: `inline` could not throw, `worker` could — its
    clip arm had no `try`/`catch`, so a toolchain that RAISED rather than returning (a
    temp file that cannot be written, an output file absent after a zero exit, the named
    throw `MEDIA_REQUIRE_CLIP_TOOLCHAIN=1` raises where the binaries are missing) escaped
    as a rejected promise, which is a 500 on an upload rather than a refusal. “resolves
    rather than throwing, whatever the bytes are” drives four hostile shapes — no bytes,
    a JPEG magic number and nothing else, a container header with no container, and one
    declared as a photograph — through `Promise.allSettled` and asserts every outcome
    `fulfilled`, for BOTH adapters. It is not vacuous: removing `stillPipeline`'s
    `catch` fails it in both suites, and the worker's own file drives a toolchain that
    throws at each of the three steps, in three different shapes (a synchronous throw, a
    rejected promise, a throw from inside an `async` function).
  - **The mode the `worker` adapter hands the shared pipeline is inert, and the REASON is
    what is asserted.** Changing that call to `{ mode: 'inline' }` left every media test
    green, because the only mode-dependent behaviour in `runStillPipeline` is
    `'video-deferred'` and that needs a sniffed clip type — which the worker routes to
    the toolchain before the pipeline sees it. A direct assertion on the argument would
    mean standing in for `runStillPipeline`, which is ours (CLAUDE.md §2.3), so “cannot
    matter, because the toolchain takes exactly the types inline defers” asserts the
    routing agreement instead, over a `Record` keyed by `AcceptedType` so that widening
    the policy fails the typecheck until the new type is given bytes.
  - **`ffmpeg`/`ffprobe` are UNRESOLVED on the authoring machine, and that is reported
    rather than worked around (CLAUDE.md §7.1).** They are not installed here, so the
    clip toolchain's subprocess SUCCESS arms have never run locally, and no bytes were
    sent to an online transcoder to obtain a green tick. `clipToolchainForTests()`
    resolves one of three cases and never silently: the real toolchain where both
    binaries answer `-version`; a THROW naming the binary where they do not and
    `MEDIA_REQUIRE_CLIP_TOOLCHAIN=1` is set (which CI sets, alongside an explicit
    `apt-get install -y ffmpeg` step — so a runner without them fails the build rather
    than testing less); and otherwise a recorded stand-in, which PRINTS a notice saying
    it is being used and that the real path is unresolved. **The still cases need none
    of it** — they are `stillPipeline`, which both adapters compose — so the exit
    criterion is unaffected. `clipToolchain.integration.test.ts` covers every FAILURE
    arm with no `ffmpeg` at all, by pointing the toolchain at a binary that does not
    exist, which is the same code path a real `ffmpeg` failure in production takes.
  - **One mutation is knowingly unkilled locally, and the assertion that kills it
    exists:** returning the recorded stand-in unconditionally cannot be distinguished
    on a machine that would get the stand-in anyway. “is the real one wherever the
    binaries exist, and the stand-in only where they do not” is the case that catches
    it, and it can only discriminate where the binaries are installed — CI.
- **Coverage for integration-only code:** `npm run verify`'s coverage pass runs without
  a database, so `postgres-queue.ts`, `queue-contract.ts`, `queue-fixtures.ts`,
  `seed.ts`, `seed-data.ts`, `testPayload.ts`, `migrate.ts` and — from Phase 2 Task 3 —
  `auth/otpService.ts` and `auth/testing/otpProbes.ts` — reachable exclusively
  from an `*.integration.test.ts` — are excluded from `vitest.config.ts`'s coverage
  `include` rather than counted as 0%-covered there. They are gated instead by a second,
  dedicated pass, `vitest.integration.config.ts`, run via
  `npm run test:integration:coverage` (chained into `npm run verify:full`) — it runs the
  same integration test files with `--coverage` scoped to those nine, plus
  `apps/web/collections/**`, `apps/web/globals/**`, `apps/web/payload.config.ts` and
  `apps/web/migrations/**` (all four at 100%; see Coverage gates above).
  Thresholds are set per-file to what is genuinely achieved, not aspirational:
  `queue-contract.ts`, `queue-fixtures.ts`, `seed-data.ts` (a pure data literal) and
  `migrate.ts` are 100% lines/branches/functions — see the Migration section below for
  what `migrate.ts` reaches that number with, so it is fully achieved rather than left
  unknown behind the whole-module `c8 ignore` it previously carried (see `migrate.ts`'s
  own header). `postgres-queue.ts` and `testPayload.ts` are both 93% lines, 75% branches,
  100% functions — the former's two
  uncovered branches are `enqueue()`'s and `claim()`'s error-`catch` paths for an
  unexpected database failure, which have no organic trigger without mocking the module
  under test (CLAUDE.md §2.3: "no mocking what we own") or deliberately corrupting the
  test database; the latter's are `ensureDatabaseExists()`'s `CREATE DATABASE` branch,
  which only runs the very first time any integration test ever executes against a given
  Postgres volume (every run after that finds `diary_test` already exists). `claim()`'s
  safety-critical `SELECT ... FOR UPDATE SKIP LOCKED` line itself executes on every call
  regardless of outcome, so it is fully exercised by both the smoke test and the blocking
  regression test above. `seed.ts` is 100% lines/functions, 83% branches — the uncovered
  branches are defensive guards with no organic trigger from the ten real journeys' own
  data (an unrecognised `dates` format, an id branding failure that can't happen for an id
  Payload itself just generated, an out-of-bounds accent-tint index that can't happen for
  a fixed 5-element tuple); see `seed.ts`'s own `c8 ignore` comments and
  `vitest.integration.config.ts`'s threshold comment for the full list.
  `auth/otpService.ts` (Phase 2 Task 3) is **100% on every axis**, and it is worth
  recording that it took two corrections to get there honestly. Its first threshold was
  93% branches with a comment claiming both missing arms were unreachable; the review
  reached one of them (`attempts ?? 0`) with a plain
  `payload.update({ data: { attempts: null } })` and no mocking at all. A threshold
  lowered on a reason that is not true is worse than one lowered honestly, because the
  comment is what stops the next reader from checking. Both arms are gone rather than
  excused: the attempt count is `COALESCE`d in SQL, with a test that writes a NULL count
  and expects the challenge to still verify, and the single-row `count(*)` is folded over
  its rows rather than read through a `?.` whose empty arm nothing can take. One
  `c8 ignore` remains, on `deriveKey`'s error arm, and its comment records the three
  things tried before it was excused — `promisify` (no `scrypt.__promisify__` in
  `@types/node`, so the key arrives as `unknown`), reaching it from a test (`scrypt`
  errors only on cost parameters, which are module constants), and a branch-free settle.
  `auth/testing/otpProbes.ts` is 100% on every axis too, like `queue-fixtures.ts` and for
  the same reason: the probes are what make the OTP security assertions non-vacuous, so
  each of their own refusals — an empty outbox, a message with no six-digit run, an
  account with no challenge — is exercised rather than assumed.
  **Phase 3 Task 6's seven MediaProcessor files join the same treatment**, for the same
  reason as the rest: each imports `sharp`, a native module doing real I/O-shaped work,
  so every test that exercises them is an `*.integration.test.ts` the Docker-free pass
  never runs. They are excluded from `vitest.config.ts`'s coverage `include` by exact
  path and gated in `vitest.integration.config.ts` at the numbers they actually achieve.
  `apps/web/lib/ports/mediaProcessor.ts` is NOT among them: it is type-only, so it stays
  in the unit pass's measured set and prints 0% while contributing no counted lines,
  exactly like `apps/web/lib/ports/queue.ts`.
  - **`stillPipeline.ts`, both adapters and `media/services.ts` are 100% lines, branches
    and functions**, which is where they belong: they are the code a bad edit publishes
    a home address through. `stillPipeline.ts` carries exactly one `c8 ignore`, on
    `dHash`'s refusal arm — it refuses only a grid that is not 72 samples, and
    `stillPipeline.integration.test.ts` pins `sharp`'s greyscale 9x8 resize at exactly
    72, so reaching it needs `sharp` to return a different shape, which cannot be
    arranged without mocking `sharp` (CLAUDE.md §2.3). `media/services.ts` reaches 100%
    because the mode is an ARGUMENT (`mediaProcessorFor`) rather than a read of `env`
    inside the branch — `env` is parsed once at import, so the other branch would
    otherwise only be reachable by stubbing our own module.
  - **`clipToolchain.ts` is gated at 75% lines, 72% branches, 75% functions, and that is a
    FLOOR FOR TWO ENVIRONMENTS rather than either one's own number.** It has two sets
    of unreachable code, one per machine, so a threshold set from one of them is a
    threshold that cannot hold on the other. Without the binaries (here, and any
    developer's machine): `createFfmpegToolchain`'s three subprocess SUCCESS arms and
    `run`'s two stream handlers — the UNRESOLVED above; every failure arm is covered.
    With them (CI, which installs both): `recordedStandIn` and its three method closures
    are unreachable, because `chooseToolchain` cannot take the stand-in branch where
    `ffmpeg` answers `-version` — four of eighteen functions, so **`functions: 100` was a
    threshold only a machine WITHOUT `ffmpeg` could pass**, committed with a comment
    claiming CI "scores HIGHER than this". Measured here: 93.42 lines, 78.79 branches,
    100 functions. Derived for CI from the same coverage map: 80.92 lines, 81.82
    branches, 77.78 functions. The gate's first version took the lower of each pair rounded
    down (80/75/77) and CI failed on it: run 34535670203's `verify` job failed at
    `npm run verify:full` with **no test-failure annotation at all**, and Vitest pushes the
    `github-actions` reporter whenever `GITHUB_ACTIONS` is set — a failing test would have
    annotated — which leaves the threshold check. 80% of 152 statements is 121.6 against a
    derivation of 123, so that axis had no slack. The numbers are floors with margin now.
    **UNRESOLVED, tool named:** reading CI's real numbers needs `gh` or a GitHub token
    (`/actions/jobs/<id>/logs` answers 403 without one), or `ffmpeg` installed locally.
    Tighten when one of those exists; do not tighten by deriving again.
  - **`contract/media-fixtures.ts` is gated at 73% lines, 87% branches, 90% functions**,
    the same two-environment shape one axis over. `aGeneratedClip()` shells out to
    `ffmpeg`, so lines and functions are low here and near-total in CI (74.48 → 99.31
    lines, 91.67 → 100 functions). Branches go the OTHER way — with the binaries present
    nobody takes the `ftyp`-header fallback or the `generated === undefined` arm, so 24
    slots lose two instead of one: 91.67% there against 95.83% here, which is why 95 was
    the wrong number to commit — and why 91, that derivation rounded down, is one branch
    slot of slack and not enough either.
  - **`contract/media-processor-contract.ts` is 100% lines, 56% branches, 100%
    functions.** Every line runs TWICE, once per adapter, which is the exit criterion
    demonstrating itself. The branch number is low because the suite is written
    defensively — `processed.ok ? processed.value.kind : null` has a null arm only a
    FAILING pipeline takes, so a passing suite by definition never takes it. Rewriting
    those into non-null assertions would raise the number and violate CLAUDE.md §3.1,
    which is the wrong trade.
  - **Revisit every one of these when `@vitest/coverage-v8` or `sharp` changes version**,
    and re-measure rather than re-asserting: three of the numbers are what an absent
    `ffmpeg` costs, and installing it locally should RAISE them.
    **Phase 3 Task 7's presigned-upload surface gets the same treatment**, four files,
    each for a stated reason rather than by directory:
    `apps/web/lib/media/receiveLocalUpload.ts` and
    `apps/web/lib/media/localUploadEndpoint.ts` write real bytes through a real
    `StoragePort` (a filesystem, which the Docker-free `unit` project is pure of by
    design); `apps/web/lib/media/uploadSlots.ts` binds a real `MediaProcessor`, and both
    adapters import `sharp`; `apps/web/lib/media/testing/uploadProbes.ts` builds those
    temporary stores and rows in the test Payload. All four are excluded from `vitest.config.ts`'s coverage `include`
    by exact path and gated in `vitest.integration.config.ts` at **100% lines, branches
    and functions** — measured, not rounded up. 100 is the honest number rather than an
    optimistic one because none of them has a branch whose outcome depends on the machine:
    no binary lookup, no clock beyond an injected one, no environment fork. That is what
    separates them from `clipToolchain.ts` above, whose numbers needed slack for exactly
    that reason.
  - **Phase 3 Task 8's ingest gets the same treatment**, two files, each for a stated
    reason rather than by directory: `apps/web/lib/media/ingestUpload.ts` creates rows
    through a real Payload, reads staged bytes back through a real `StoragePort` and
    enqueues through the real Postgres queue — three things the Docker-free `unit`
    project has none of — and `apps/web/lib/media/testing/ingestProbes.ts` builds the
    journeys, the staged objects and the `sharp`-encoded photographs those cases run on.
    Both are excluded from `vitest.config.ts`'s coverage `include` by exact path and
    gated in `vitest.integration.config.ts` at **100% lines, branches and functions** —
    measured, not rounded up, and 100 for the same reason the four files above reach it:
    no branch in either depends on the machine. The unreachable arms — the branded-id
    refusals Payload's primary key can never trigger, the planner refusals a valid
    fixture can never provoke, and the `enqueue` failure that would need a stubbed port
    (CLAUDE.md §2.3 forbids stubbing what we own) — each carry a `c8 ignore next` with
    its own reason at the line.
  - **The ingest suite carries an explicit per-case time budget**, `INGEST_BUDGET_MS`,
    for the reason ruling F2 settled on: its widest case encodes a 4000x3000 JPEG,
    re-encodes it through `mozjpeg` and has Payload derive every configured tier from it,
    measured at 6.9s against a harness default of 5,000ms. The 4000 is read off
    `apps/web/collections/media.ts`'s own `imageSizes` rather than written into the test,
    because Payload omits a width-only image size whose source is narrower than its
    target — so a fixture narrower than the widest tier would make the case assert that a
    tier was omitted, and a tier added later would silently reduce what the case covers.
  - **`apps/web/lib/media/uploadToken.ts` and `apps/web/lib/media/uploadContract.ts` are
    NOT in that list**, and the distinction is the point: HMAC over `node:crypto` is
    pure computation, and the contract is one constant and some types, so both stay in
    the Docker-free pass — `uploadToken.test.ts` runs in the pre-commit gate, which is
    where the cases about forging a capability belong.
  - **`uploadProbes.ts` is imported by that unit test**, for `SECRET`, so the unit and
    integration suites sign with one value rather than two. Only that constant of it
    executes there, which is the partial measurement §2.1 calls worse than none — hence
    the exclusion, and hence the dynamic `import('../../testPayload')` inside
    `aPublishedFixtureJourney` rather than at the top of the file, which would pull
    `payload.config.ts`, `pg` and `sharp` into the pre-commit gate.
  - The one uncoverable branch in the set is `uploadProbes.ts`'s branded-id refusal,
    which Payload's primary key can never trigger. It carries a `c8 ignore next` with
    its reason at the line, rather than a threshold lowered to hide it.
  - **`apps/web/app/(admin)/admin/media/upload/route.ts` and
    `apps/web/app/(admin)/admin/media/actions.ts` need no config entry at all.** Both are
    `c8 ignore start`/`stop`-wrapped framework passthroughs with no authored logic —
    `actions.ts` holds two exports now (Task 8 added `finaliseUpload`), and both are one
    `guardedAction` around one executable service, with every decision made in
    `uploadSlots.ts` or `ingestUpload.ts` where a test can run it — and
    neither path contains a `[...]` segment — the upload token is a QUERY parameter
    rather than a path segment, deliberately. **What that buys is stated as what was
    observed, not as a mechanism.** Both files report `0 | 0 | 0 | 0` in the unit
    coverage table; so does every other file under `apps/web/app/`, wrapped or not,
    including the ones that predate this task. No gate moves (`All files` 99.93%, measured when a
    repository floor of 90% still existed), and neither file needed an entry in the exclusion list
    the bracketed-directory files require. Whether `@vitest/coverage-v8` actually
    consumed the hint is indistinguishable from all of that, so this document does not
    say that it did — the earlier wording, "the ignore hint is read", asserted a
    mechanism nothing here can show working.
- **Add one:** write `apps/web/lib/ports/<name>.ts` (the interface, plus any guard every
  adapter must share - see `validateStorageKey` above), then
  `apps/web/lib/adapters/contract/<name>-contract.ts` (the shared suite) before any
  adapter exists, per TDD. Name the adapter's own test file
  `<adapter>.test.ts` (or `.integration.test.ts` if it needs real infrastructure) and call
  `<name>Contract('<adapter>', makeAdapter, ...)` from it, supplying any capability the
  suite needs an adapter-specific harness for — see the `storage` port's
  `UploadUrlRedeemer` below.
