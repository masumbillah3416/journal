/**
 * adminSession — gives a browser test a real account, a real session and, when
 * it needs one, a readable one-time code.
 *
 * ═══ WHY A BROWSER TEST NEEDS HELP AT ALL ═══
 *
 * Two things about this surface a browser genuinely cannot reach on its own:
 *
 *   - `/admin/sign-in/done` is guarded, so a case that measures it needs a
 *     session before the screen will draw anything; and
 *   - the one-time code is delivered by `console-mailer`, whose outbox is a
 *     variable inside the SERVER process. A browser cannot read it, and the
 *     stored `codeHash` is scrypt, so the database cannot be read for it
 *     either.
 *
 * Everything else the specs do themselves, by filling in the real forms and
 * pressing the real buttons. Nothing here sets a request header.
 *
 * ═══ IT USES PAYLOAD AND THIS REPOSITORY'S OWN SERVICES, NOT RAW SQL ═══
 *
 * An earlier version wrote the `users` and `sessions` rows with `INSERT`s and
 * hashed the session identifier itself. That duplicated a security-critical
 * format — how a session token is stored — in a test helper, where a change to
 * `sessions.ts` would have made three suites fail at the guard for a reason
 * nobody would recognise. This version calls `createSessionService` and
 * `createOtpService`, so there is one definition of every stored shape and this
 * file holds none of them.
 *
 * ═══ WHAT THIS MODULE ACTUALLY MOVES, WHICH IS MORE THAN A TSCONFIG ═══
 *
 * The first write-up of this called the change "six directories added to
 * `e2e/tsconfig.json`". That understates it, and the honest version matters for
 * reading what the journey spec proves.
 *
 * The tsconfig widening is typecheck-only. The real change is that this file
 * BOOTS PAYLOAD AND THE OTP SERVICE INSIDE THE PLAYWRIGHT PROCESS. So when
 * `aCodeFor` issues a challenge, the code is minted, hashed and stored by the
 * TEST process — not by the server under test. The server's own
 * `issueChallenge`, which ran a moment earlier when the reader submitted the
 * password form, produced a code nobody can read.
 *
 * WHY THE JOURNEY IS STILL END TO END. The row lands in the same database the
 * server reads, and everything either side of that one step is the server's:
 * the password step that created the first challenge, the guard, the rotation,
 * the verify that consumes the row, the session the cookie carries, the
 * sign-out that revokes it. What is borrowed is the DELIVERY, and only because
 * the only mailer prints to a console. The verify half — the half the second
 * factor is actually about — is entirely the server's.
 *
 * WHAT WOULD REMOVE THE BORROWING: a mailer adapter a test can read, or a
 * development-only outbox endpoint. Both are out of Phase 2's scope, and this
 * is the disclosure rather than the workaround being hidden.
 *
 * EVERY FIXTURE ACCOUNT LEAVES `otpRequired` AT ITS DEFAULT, `true`.
 * `readSignInScreen` prints the LOWEST-ID account's flag in the sign-in
 * screen's footer line, so an account with the second factor OFF would change
 * what `/admin/sign-in` says and move every `admin-sign-in-*` baseline. Every
 * account this module creates therefore has the code step on — which is also
 * the state the journey spec wants to exercise.
 *
 * NOTHING HERE LOGS AN IDENTIFIER, A PASSWORD OR A CODE (CLAUDE.md §7). The
 * code is returned to the caller and nowhere else.
 *
 * SINCE PHASE 3 TASK 9 IT ALSO OFFERS AN UPLOAD SLOT. {@link anUploadUrlFor}
 * is here for the same reason everything else is: the URL a browser PUTs to
 * is minted server-side, by `offerUploadSlots` over the live store, and a
 * page cannot ask for one until the admin's picker exists. It mints the real
 * thing rather than assembling a URL, so `e2e/upload.spec.ts` measures a
 * browser against what the application actually hands out.
 *
 * Depends on: node:crypto; `getPayload` (apps/web/lib/payload), `createSessionService`,
 * `createOtpService`, `createConsoleMailer`, `readCodeFromOutbox`,
 * `offerUploadSlots`, `mediaProcessor`, `createLocalStorage` and `MEDIA_DIR`.
 */
import { randomUUID } from 'node:crypto'
import type { SessionId, UserId } from '../../packages/domain/src/ids'
import { MEDIA_DIR } from '../../apps/web/collections/media'
import { createConsoleMailer } from '../../apps/web/lib/adapters/console-mailer'
import { createLocalStorage } from '../../apps/web/lib/adapters/local-storage'
import { createOtpService } from '../../apps/web/lib/auth/otpService'
import { createSessionService } from '../../apps/web/lib/auth/sessions'
import { readCodeFromOutbox } from '../../apps/web/lib/auth/testing/otpProbes'
import { mediaProcessor } from '../../apps/web/lib/media/services'
import { offerUploadSlots } from '../../apps/web/lib/media/uploadSlots'
import { getPayload } from '../../apps/web/lib/payload'

/**
 * The domain the guarded-screen suites' accounts live under.
 *
 * ═══ ONE ACCOUNT PER CALLER, NOT ONE SHARED ONE ═══
 *
 * The first version used a single fixed address for every suite and viewport.
 * Playwright runs the three viewport projects in parallel, each with its own
 * `afterAll` — so one project deleted the account another project's session
 * belonged to, mid-run, and the signed-in screen redirected to `/admin/sign-in`
 * while a screenshot was being taken. It showed up as ONE flaky visual case in
 * the container, which is exactly how a shared-fixture race presents.
 *
 * Every caller now names its own account and deletes only that one — see
 * {@link fixtureLabel} for why "its own" has to mean per WORKER rather than per
 * project, which took two rounds to get right.
 */
export const SESSION_FIXTURE_DOMAIN = 'session.task-ten-fixture.example'

/**
 * What distinguishes one caller's fixture account from every other one's.
 *
 * ═══ PER WORKER, NOT PER PROJECT — AND THE FIRST FIX GOT THAT WRONG ═══
 *
 * The very first version used ONE address for every suite and viewport, and a
 * container run went flaky: the signed-in screen redirected while a screenshot
 * was being taken, because another project's `afterAll` had deleted the account
 * its session belonged to.
 *
 * The fix keyed the account on the PROJECT, and the flake survived — two of
 * three container runs, masked by CI's single retry. `test.afterAll` runs once
 * per WORKER, not once per project, and `playwright.config.ts` sets
 * `fullyParallel: true`, so one project's tests are split across workers and
 * each worker's `afterAll` deleted the row the other workers of the same
 * project were still using. The symptoms were a `NotFound` thrown by
 * `payload.delete` (two workers deleting one row) and, again, the guarded
 * screen redirecting mid-screenshot.
 *
 * So the key is the worker. `workerIndex` is unique for the life of a run and
 * is exactly the scope `afterAll` fires at, which makes the account's lifetime
 * and its deleter the same thing by construction rather than by argument.
 *
 * WHY THE SELF-CHECK IN {@link aSignedInSession} DID NOT SAVE IT, which is
 * worth stating because it reads stronger than it is: that check proves the
 * session was live AT MINT TIME. It cannot prove the row still exists when the
 * browser presents it a second later, because nothing about a fixture can. Only
 * making the row nobody else's fixes that.
 *
 * @param testInfo - Playwright's own `TestInfo`, from a hook or a test.
 * @returns A label unique to this project AND this worker.
 * @example
 * const session = await aSignedInSession(`visual.${fixtureLabel(testInfo)}`)
 */
export const fixtureLabel = (testInfo: {
  readonly project: { readonly name: string }
  readonly workerIndex: number
}): string => `${testInfo.project.name}.w${String(testInfo.workerIndex)}`

/** The domain the sign-in journey's own accounts live under. */
export const JOURNEY_FIXTURE_DOMAIN = 'journey.task-ten-fixture.example'

/** The password every fixture account is created with. */
export const FIXTURE_ADMIN_PASSWORD = 'the-one-the-browser-suite-types'

/** The requesting address these fixtures are attributed to (RFC 3849). */
const FIXTURE_IP = '2001:db8:e2e::1'

/**
 * The fixture account's id, creating it if this is the first call.
 *
 * @param email - The address to find or create.
 * @returns The account's branded id.
 */
const anAccount = async (email: string): Promise<UserId> => {
  const payload = await getPayload()
  const found = await payload.find({ collection: 'users', where: { email: { equals: email } }, limit: 1, depth: 0 })
  const existing = found.docs[0]
  if (existing !== undefined) return String(existing.id) as UserId

  const created = await payload.create({
    collection: 'users',
    // `otpRequired` is left at its schema default, `true` — see the module
    // header for what an account with it off would do to the sign-in screen.
    data: { email, password: FIXTURE_ADMIN_PASSWORD },
  })
  return String(created.id) as UserId
}

/**
 * Mints a live session for this caller's own fixture account.
 *
 * @param label - What distinguishes this caller's account from every other
 *   one's: the spec's name plus {@link fixtureLabel}, so no two workers share a
 *   row. See that function for the flake that came of sharing.
 * @returns The opaque identifier a browser presents in `td-session`.
 * @throws If the session could not be issued, which no caller expects.
 * @example
 * const session = await aSignedInSession(testInfo.project.name)
 */
export const aSignedInSession = async (label: string): Promise<string> => {
  const payload = await getPayload()
  const user = await anAccount(`${label}@${SESSION_FIXTURE_DOMAIN}`)
  const sessions = createSessionService({ payload, now: Date.now })

  const started = await sessions.startSession({
    user,
    previous: null,
    keepSignedIn: false,
    device: 'the browser suite',
    location: null,
  })
  if (!started.ok) throw new Error('the fixture session was not issued')

  // THE HELPER CHECKS ITS OWN WORK, and it is not belt and braces. What a
  // failure here looks like from a spec is a guarded screen quietly redirecting
  // to `/admin/sign-in` and an assertion failing on a missing element - which
  // says nothing about the session. Asking the same `authenticate` the guard
  // asks turns that into a message that names the cause.
  const authenticated = await sessions.authenticate(started.value.session)
  if (!authenticated.ok) throw new Error(`the fixture session does not authenticate: ${authenticated.error}`)

  return started.value.session
}

/**
 * An account the browser can sign in as, with the second factor on.
 *
 * @param email - The address to use. Per-spec, so one suite's account cannot be
 *   another's.
 * @returns The address and the password to type into `SCREENS.md` §3.1's form.
 * @example
 * const account = await anAccountWithACodeStep('journey@task-ten-fixture.example')
 */
export const anAccountWithACodeStep = async (
  email: string,
): Promise<{ readonly email: string; readonly password: string }> => {
  await anAccount(email)
  return { email, password: FIXTURE_ADMIN_PASSWORD }
}

/**
 * A one-time code the browser can actually type, bound to the identifier it is
 * carrying.
 *
 * ═══ WHY THIS IS THE ONE THING THE SPEC CANNOT DO ITSELF ═══
 *
 * The server has already mailed a code by the time a reader reaches the code
 * screen, and that code is unreadable from here: `console-mailer` keeps it in
 * the server process, and the stored `codeHash` is scrypt. So this issues
 * ANOTHER challenge for the same browser, through this repository's own
 * `otpService`, and reads it out of an outbox this process owns — which is
 * exactly what "Send a new code" does, so the reader's next step is a real one
 * rather than a fabricated state.
 *
 * The account's earlier challenge is aged past the thirty-second resend
 * cooldown first, for the same reason a reader would have to wait it out.
 *
 * @param email - The account signing in.
 * @param session - The identifier the browser is carrying, read off its cookie.
 * @returns The six digits, and the masked address the code went to.
 * @throws If the challenge could not be issued.
 * @example
 * const { code } = await aCodeFor(account.email, carried.value)
 */
export const aCodeFor = async (
  email: string,
  session: string,
): Promise<{ readonly code: string; readonly maskedTo: string }> => {
  const payload = await getPayload()
  const user = await anAccount(email)

  await payload.db.pool.query(
    "UPDATE otp_challenges SET created_at = created_at - interval '2 minutes' WHERE user_id = $1",
    [Number(user)],
  )

  const mailer = createConsoleMailer({ isDevelopment: false })
  const otp = createOtpService({ payload, mailer, now: Date.now })
  const issued = await otp.issueChallenge(user, session as SessionId, FIXTURE_IP)
  if (!issued.ok) throw new Error(`the fixture code was not issued: ${issued.error}`)

  return { code: readCodeFromOutbox(mailer), maskedTo: issued.value.maskedTo }
}

/**
 * Deletes the fixture accounts matching `domainOrEmail`, and everything they own.
 *
 * NARROWED RATHER THAN SWEEPING, for the reason {@link SESSION_FIXTURE_DOMAIN}
 * gives: a cleanup that deletes every fixture account deletes another parallel
 * project's, mid-run.
 *
 * @param domainOrEmail - The address, or the domain, to delete.
 * @returns Once they are gone.
 * @example
 * test.afterAll(async () => { await removeSignedInFixture(`${testInfo.project.name}@${SESSION_FIXTURE_DOMAIN}`) })
 */
export const removeSignedInFixture = async (domainOrEmail: string): Promise<void> => {
  const payload = await getPayload()
  const accounts = await payload.find({
    collection: 'users',
    where: { email: { like: domainOrEmail } },
    limit: 500,
    depth: 0,
  })

  await payload.db.pool.query(`DELETE FROM sign_in_attempts WHERE subject = $1`, [FIXTURE_IP])
  for (const account of accounts.docs) {
    await payload.db.pool.query(`DELETE FROM sessions WHERE user_id = $1`, [account.id])
    await payload.db.pool.query(`DELETE FROM otp_challenges WHERE user_id = $1`, [account.id])
  }

  // BULK, BY THE SAME PREDICATE, rather than one `delete({ id })` per row. A
  // find-then-delete-by-id is not atomic, so a row that disappeared between the
  // two arrived as a thrown `NotFound` from deep inside Payload - which is what
  // the flaky container runs actually reported before the fixtures were made
  // per-worker. Deleting by `where` asks the database the question once, and a
  // predicate that now matches nothing is not an error.
  await payload.delete({ collection: 'users', where: { email: { like: domainOrEmail } } })
}

/**
 * How many bytes {@link anUploadUrlFor}'s slot is offered for.
 *
 * Two kilobytes, matching the body `apps/web/lib/media/uploadContract.ts`'s
 * measurement sent through a real Chromium — small enough that the PUT is
 * instant and large enough that a `Content-Length` of it is not a rounding
 * error. It is a CLAIM the page then has to live up to: the spec asserts the
 * `File` the browser built is this size, and then asserts the store holds
 * that many bytes, rather than trusting the number.
 */
const UPLOAD_FIXTURE_BYTES = 2_048

/** A presigned upload slot, and what the browser is expected to send to it. */
export interface OfferedUpload {
  /** The URL to PUT to, carrying its own capability token. */
  readonly url: string
  /** The key the bytes will land at, so a test can read the store back. */
  readonly stagingKey: string
  /** The type the slot was offered for — the `File`'s own `type`. */
  readonly contentType: string
  /** How many bytes the slot was offered for. */
  readonly byteLength: number
}

/**
 * A genuine presigned upload URL, minted the way the admin's own screen mints
 * one.
 *
 * ═══ THROUGH `offerUploadSlots`, NOT THROUGH A HAND-BUILT URL ═══
 *
 * A helper that assembled `/admin/media/upload?token=…` itself would be the
 * fixture-agreeing-with-itself shape `apps/web/lib/media/uploadContract.ts`'s
 * header records two Phase 2 blockers for. This calls the same function
 * `requestUploadSlots` calls, with the same live store
 * (`createLocalStorage(MEDIA_DIR)`) and the same bound processor, so the
 * browser is handed the URL the application would have handed it — signed
 * with the real `PAYLOAD_SECRET`, capped at the real `MAX_UPLOAD_BYTES`, and
 * pointed at the real `ADMIN_ORIGIN`.
 *
 * ═══ IT CREATES NO JOURNEY, AND THAT IS DELIBERATE ═══
 *
 * A slot is keyed by the journey it is staged under (CLAUDE.md §0.9), so one
 * is needed — but a fixture journey of its own would be a published row in the
 * same database `e2e/visual.spec.ts` photographs, which is how a fixture
 * becomes a baseline change. The SEEDED journeys are already there, already
 * published, and a slot offered in one is exactly what an admin working in
 * that journey would get. Nothing is written to it: this spec stops at the
 * PUT, and the staged object is removed by {@link removeOfferedUpload}.
 *
 * @param testInfo - Playwright's own `TestInfo`, so the staged file is named
 *   after this worker and a failure says which one left it. The key's nonce is
 *   a fresh UUID rather than that label, so two calls in one worker cannot be
 *   handed the same key — the signed-out case needs a key nothing has written
 *   to.
 * @returns The URL, the key it writes to, and the shape the page should send.
 * @throws When the database holds no journey to key a slot by, or when the
 *   slot request is refused — both of which are a broken environment rather
 *   than a defect a case should report.
 * @example
 * const upload = await anUploadUrlFor(testInfo)
 */
export const anUploadUrlFor = async (testInfo: {
  readonly project: { readonly name: string }
  readonly workerIndex: number
}): Promise<OfferedUpload> => {
  const payload = await getPayload()
  const journeys = await payload.find({ collection: 'journeys', limit: 1, depth: 0, select: { slug: true } })
  const journey = journeys.docs[0]
  if (journey === undefined) throw new Error('the database holds no journey to offer an upload slot in')

  // THE TYPE COMES OFF THE BOUND PIPELINE, NEVER OFF
  // `EXPECTED_UPLOAD_REQUEST`. The page types its `File` with whatever this
  // returns, and the spec then compares the browser's request against that
  // constant - so a helper that took the type FROM the constant would make
  // the two agree by construction, which is the exact defect the spec exists
  // to catch. `acceptedTypes` is the domain's own still-type list, reached
  // through the adapter `requestUploadSlots` binds.
  const processor = mediaProcessor()
  const declaredType = processor.acceptedTypes[0]
  if (declaredType === undefined) throw new Error('the bound pipeline accepts no type to offer a slot for')

  const offered = await offerUploadSlots(
    {
      journey: String(journey.id),
      files: [
        {
          filename: `tokyo-${fixtureLabel(testInfo)}.jpg`,
          declaredType,
          byteLength: UPLOAD_FIXTURE_BYTES,
        },
      ],
    },
    {
      processor,
      storage: createLocalStorage(MEDIA_DIR),
      nonce: () => randomUUID(),
    },
  )
  if (!offered.ok) throw new Error(`the slot request was refused: ${offered.error}`)

  const slot = offered.value[0]
  if (slot === undefined) throw new Error('no slot was offered for a single file')
  return {
    url: slot.uploadUrl,
    stagingKey: slot.stagingKey,
    contentType: slot.declaredType,
    byteLength: UPLOAD_FIXTURE_BYTES,
  }
}

/**
 * How many bytes are sitting at a staging key, or `null` when nothing is.
 *
 * READ THROUGH THE PORT the receiver writes through, so "the bytes landed"
 * is answered by the store rather than by the status code the browser saw.
 * @param stagingKey - The key {@link anUploadUrlFor} offered.
 * @returns The stored length, or `null` if the key names no object.
 * @example
 * expect(await storedUploadLength(upload.stagingKey)).toBe(upload.byteLength)
 */
export const storedUploadLength = async (stagingKey: string): Promise<number | null> => {
  const stored = await createLocalStorage(MEDIA_DIR).get(stagingKey)
  return stored.ok ? stored.value.byteLength : null
}

/**
 * Deletes whatever a case left at a staging key.
 *
 * The store is rooted at `MEDIA_DIR`, which is the directory Payload keeps
 * every stored file in. A suite that left two kilobytes there per worker per
 * run would grow that directory every time it ran.
 * @param stagingKey - The key {@link anUploadUrlFor} offered.
 * @example
 * test.afterEach(async () => { await removeOfferedUpload(upload.stagingKey) })
 */
export const removeOfferedUpload = async (stagingKey: string): Promise<void> => {
  await createLocalStorage(MEDIA_DIR).delete(stagingKey)
}
