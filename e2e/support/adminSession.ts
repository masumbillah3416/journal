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
 * IT RUNS IN THE PLAYWRIGHT PROCESS, against the same database the app under
 * test is using — `apps/web/lib/payload.ts` reads the same `DATABASE_URL`,
 * from the environment first and the repository's `.env` second, which is why
 * the containerised visual run reaches its own Postgres and a local run reaches
 * the developer's.
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
 * Depends on: `getPayload` (apps/web/lib/payload), `createSessionService`,
 * `createOtpService`, `createConsoleMailer`, `readCodeFromOutbox`.
 */
import type { SessionId, UserId } from '../../packages/domain/src/ids'
import { createConsoleMailer } from '../../apps/web/lib/adapters/console-mailer'
import { createOtpService } from '../../apps/web/lib/auth/otpService'
import { createSessionService } from '../../apps/web/lib/auth/sessions'
import { readCodeFromOutbox } from '../../apps/web/lib/auth/testing/otpProbes'
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
 * Every caller now names its own account and deletes only that one.
 */
export const SESSION_FIXTURE_DOMAIN = 'session.task-ten-fixture.example'

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
 *   one's. The project name, so three viewports do not share a row — see
 *   {@link SESSION_FIXTURE_DOMAIN} for the flake that came of sharing.
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
    await payload.delete({ collection: 'users', id: account.id })
  }
}
