/**
 * signInEndpoints — the three `POST`s the bespoke sign-in surface makes: the
 * password step, the code step, and signing out.
 *
 * ═══ WHY THE HANDLERS ARE HERE AND THE ROUTE FILES HOLD ONE LINE ═══
 *
 * A Next.js route handler is an ordinary function of a `Request`, so there is
 * no reason for a decision to live in a file no test can reach. Neither Vitest
 * project can execute a `route.ts` under `app/(admin)` — a route file is only
 * entered through Next's own routing — so anything decided there is
 * undecidable by any test. Everything those files would otherwise decide is
 * here, where
 * `signInEndpoints.integration.test.ts` drives it with a real `Request` and a
 * real Payload. `newPasswordScreen.ts` made the same split in Task 9 and this
 * module follows it exactly.
 *
 * PATTERNS (CLAUDE.md §3.3). Adapter: this module turns HTTP into the calls
 * `signIn.ts`, `otpService.ts` and `sessions.ts` actually offer, and turns
 * their `Result`s back into responses. It holds no rule of its own — whether
 * a password is right, whether a code is, whether a session is live and how
 * long one lasts are all decided elsewhere and are not decided twice.
 *
 * ═══ THIS IS WHERE THE COOKIE IS SET, WHICH IS WHY IT IS ALSO WHERE THE
 * ROTATION HAS TO BE RIGHT ═══
 *
 * `SECURITY.md`: "Rotate the session identifier on login; never reuse a
 * pre-auth id." `startSession` does the rotation — it supersedes the previous
 * identifier in the same statement that mints its replacement — and the trap
 * is HERE, not there: a handler that minted a pre-auth identifier and then set
 * that same value as the session cookie would satisfy every test asserting "a
 * session exists" while reusing exactly the value the requirement forbids. So
 * what goes into the `Set-Cookie` below is always `IssuedSession.cookie`, the
 * value `startSession` returned, and never the identifier this handler read
 * out of the request. The integration suite asserts the pre-auth identifier
 * STOPS AUTHENTICATING, which no such handler can satisfy.
 *
 * ═══ THE THREE REFUSALS STAY INDISTINGUISHABLE AT THE ROUTE TOO ═══
 *
 * Task 5 made `signIn` answer identically for an unknown address, a wrong
 * password and a locked account, in the same time. That is worth nothing if
 * the handler above it answers a different status, a different `Location` or a
 * different `Set-Cookie` for one of them. There is deliberately ONE refusal
 * branch below: every `SignInRefusal` — including `'rate-limited'` and
 * `'code-not-sent'` — takes the same `return`, so the three that must agree
 * cannot be separated by a change that only meant to distinguish the other
 * two. What that costs is that a genuinely rate-limited reader is told the
 * same thing as one who mistyped a password; `docs/security.md` records it.
 *
 * ═══ WHAT THE CODE STEP DOES NOT DO, AND WHY ═══
 *
 * It does not call `rateLimit.ts`'s `admitCodeAttempt`. That function needs
 * the account a code was issued for, and the account behind a challenge is not
 * knowable before the code has been verified: `otpService` offers no
 * session-to-account lookup, deliberately — telling an unauthenticated caller
 * which browsers hold a live challenge is the enumeration `verifyChallenge`'s
 * single `'invalid'` refusal exists to prevent. What bounds guessing instead is
 * the challenge's own budget, which is enforced by Postgres rather than by this
 * process: three attempts per challenge, claimed before the code is compared,
 * single use, five-minute life, and an hourly ceiling on how many challenges an
 * account can be issued at all. Recorded in `docs/security.md` as a named
 * residual rather than left to be discovered.
 *
 * INVARIANT — NOTHING HERE LOGS OR RETURNS A CREDENTIAL. Not the password, not
 * the code, not the address, not a session identifier. The address never
 * reaches a `Location`; the only thing any of these handlers puts in one is a
 * fixed `state` word (CLAUDE.md §7).
 *
 * THE REFUSAL'S ONE WORD IS SPELLED IN THE DOMAIN, NOT HERE.
 * `@travel-diary/domain/auth/signInScreen` owns both `PASSWORD_REFUSED_STATE`
 * and the message the screen draws for it, so the endpoint that writes the word
 * and the screen that reads it cannot disagree — and a second refusal state,
 * which is the change that would re-open the enumeration, has to be added in a
 * module gated at 100% with a case saying why there is only one.
 *
 * Depends on: `PASSWORD_REFUSED_STATE` (@travel-diary/domain/auth/signInScreen),
 * zod, ./browserSession, ./guard, ./httpForm, ./services, and the `Result`s the
 * services return.
 */
import { PASSWORD_REFUSED_STATE } from '@travel-diary/domain/auth/signInScreen'
import { z } from 'zod'
import {
  browserSessionCookie,
  clearedKeepSignedInCookie,
  clearedSessionCookie,
  keepSignedInCookie,
  newBrowserSession,
  readBrowserSession,
  readKeepSignedIn,
} from './browserSession'
import { authenticateAdminRequest } from './guard'
import { clientAddress, deviceLabel, seeOther, submittedFields } from './httpForm'
import { signInServices } from './services'

/** Where the password step is drawn, and where every refusal sends a reader. */
export const PASSWORD_STEP_PATH = '/admin/sign-in'

/** Where the one-time-code step is drawn. */
export const CODE_STEP_PATH = '/admin/sign-in/code'

/** Where a reader lands once a session is theirs. */
export const SIGNED_IN_PATH = '/admin/sign-in/done'


/**
 * What a submission to the password endpoint has to carry.
 *
 * `email` and `password` are plain strings with no further rule: an empty
 * password is a real submission `signIn` refuses on its own terms, and an
 * address that names no account is the case the whole anti-enumeration design
 * exists for. What this schema rejects is a body that is not this form's.
 *
 * `keepSignedIn` is a checkbox, so a browser sends `on` when it is ticked and
 * sends the field NOT AT ALL when it is not — which is why the field is
 * optional and its presence, rather than its value, is the answer.
 */
const passwordSubmission = z.object({
  email: z.string(),
  password: z.string(),
  keepSignedIn: z.string().optional(),
})

/** What a submission to the code endpoint has to carry. */
const codeSubmission = z.object({ code: z.string() })

/**
 * Answers a submission of the password form.
 *
 * @param request - The `POST`, carrying `email`, `password` and optionally
 *   `keepSignedIn` as form fields, and whatever identifier the browser is
 *   already holding as a cookie.
 * @returns A `303` to the code step, to the signed-in screen, or back to the
 *   password screen — never a body, and never an address carrying the
 *   credentials. The refusal is one response for every reason there is.
 * @example
 * export const POST = handlePasswordStep
 */
export const handlePasswordStep = async (request: Request): Promise<Response> => {
  const submitted = passwordSubmission.safeParse(await submittedFields(request))
  if (!submitted.success) return seeOther(PASSWORD_STEP_PATH)

  // The identifier the browser arrived with, or a fresh one for a browser that
  // has never been here. Either way it is what the challenge is bound to and
  // what `startSession` supersedes — see this module's header for the trap.
  const carried = readBrowserSession(request.headers.get('cookie'))
  const browserSession = carried ?? newBrowserSession()
  const keepSignedIn = submitted.data.keepSignedIn !== undefined

  // SET ONLY WHEN IT WAS MINTED HERE. Re-sending the cookie a browser already
  // holds would rewrite its `Max-Age` to the PRE-AUTH lifetime - so a
  // signed-in reader who mistyped a password on this screen would have their
  // thirty-day "keep me signed in" cookie shortened to an hour, while the row
  // it names kept its real expiry. The identifier would be the same and
  // nothing would look broken until the browser stopped sending it.
  const mintedCookie = carried === null ? { 'Set-Cookie': browserSessionCookie(browserSession) } : {}

  const { signIn } = await signInServices()
  const outcome = await signIn.signIn({
    email: submitted.data.email,
    password: submitted.data.password,
    browserSession,
    keepSignedIn,
    ip: clientAddress(request),
    device: deviceLabel(request),
    location: null,
  })

  // ONE BRANCH FOR EVERY REFUSAL. An unknown address, a wrong password and a
  // locked account are already one value; putting `'rate-limited'` and
  // `'code-not-sent'` through the same `return` means no later edit can
  // separate the three by meaning to separate the other two.
  if (!outcome.ok) {
    return seeOther(`${PASSWORD_STEP_PATH}?state=${PASSWORD_REFUSED_STATE}`, mintedCookie)
  }

  if (outcome.value.status === 'otp-required') {
    const carriedForward = new Headers(mintedCookie)
    // The checkbox is ticked here and the session is issued at the code step,
    // which submits six digits and nothing else. Written either way, so a
    // stale `yes` cannot lengthen this sign-in — `browserSession.ts` explains
    // why one bit in a cookie is the right size for this.
    carriedForward.append('Set-Cookie', keepSignedInCookie(keepSignedIn))
    return new Response(null, { status: 303, headers: withLocation(carriedForward, CODE_STEP_PATH) })
  }

  // `outcome.value.session.cookie` — the value `startSession` minted, never the
  // identifier read above.
  return seeOther(SIGNED_IN_PATH, { 'Set-Cookie': outcome.value.session.cookie })
}

/**
 * Answers a submission of the one-time-code form.
 *
 * @param request - The `POST`, carrying `code` as a form field and the
 *   identifier the challenge was bound to as a cookie.
 * @returns A `303` to the signed-in screen when the code is right, back to the
 *   code step when it is not, and back to the password step when the browser
 *   carries no identifier at all — there can be no challenge for a browser
 *   that has none.
 * @example
 * export const POST = handleCodeStep
 */
export const handleCodeStep = async (request: Request): Promise<Response> => {
  const cookieHeader = request.headers.get('cookie')
  const browserSession = readBrowserSession(cookieHeader)
  if (browserSession === null) return seeOther(PASSWORD_STEP_PATH)

  const submitted = codeSubmission.safeParse(await submittedFields(request))
  if (!submitted.success) return seeOther(CODE_STEP_PATH)

  const { otp, sessions } = await signInServices()
  const verified = await otp.verifyChallenge(browserSession, submitted.data.code)
  // ONE BRANCH FOR EVERY REFUSAL, for the reason `verifyChallenge` collapses a
  // wrong code and a browser with no challenge into `'invalid'`: distinguishing
  // them would say which browsers hold a live challenge.
  if (!verified.ok) return seeOther(CODE_STEP_PATH)

  const started = await sessions.startSession({
    user: verified.value.userId,
    // Superseded in the same statement that mints its replacement. Passing
    // `null` here would leave the identifier the code was mailed against
    // working alongside the session it produced.
    previous: browserSession,
    keepSignedIn: readKeepSignedIn(cookieHeader),
    device: deviceLabel(request),
    location: null,
  })
  /* c8 ignore next -- `startSession` refuses only `'unknown-account'`, and the account was named by a challenge row that references it; the arm is the fail-closed answer to the account being deleted between the two statements, and exists because the Result must be unwrapped */
  if (!started.ok) return seeOther(CODE_STEP_PATH)

  const answer = new Headers()
  answer.append('Set-Cookie', started.value.cookie)
  answer.append('Set-Cookie', clearedKeepSignedInCookie())
  return new Response(null, { status: 303, headers: withLocation(answer, SIGNED_IN_PATH) })
}

/**
 * Answers "Sign out and start again".
 *
 * BOTH HALVES, AND THE ROW IS THE ONE THAT MATTERS. Clearing the cookie stops
 * this browser sending the identifier; revoking the row stops the identifier
 * working at all, which is what a reader signing out of a shared machine — or
 * a stolen copy of the value — actually needs.
 *
 * @param request - The `POST`, carrying the session as a cookie.
 * @returns A `303` to the sign-in screen, with the session cookie cleared.
 *   The same answer whether or not there was a session to revoke: there is
 *   nothing to tell a reader who was not signed in that they need to act on.
 * @example
 * export const POST = handleSignOut
 */
export const handleSignOut = async (request: Request): Promise<Response> => {
  const cookieHeader = request.headers.get('cookie')
  const authenticated = await authenticateAdminRequest(cookieHeader)
  const presented = readBrowserSession(cookieHeader)

  if (authenticated.ok && presented !== null) {
    const { sessions } = await signInServices()
    // The owner is passed as well as the identifier, so `revokeSession` matches
    // on `user_id` too: revocation is how a stolen session is taken away from
    // the thief rather than from its owner.
    await sessions.revokeSession({ session: presented, owner: authenticated.value.user })
  }

  return seeOther(PASSWORD_STEP_PATH, { 'Set-Cookie': clearedSessionCookie() })
}

/**
 * The same headers with a `Location` on them.
 *
 * A `Headers` object rather than `seeOther`'s record for the two answers that
 * set TWO cookies: a plain object can hold one `Set-Cookie` key, and the
 * second would overwrite the first — silently, and only for the reader who
 * ticked the box.
 *
 * @param headers - The headers built so far.
 * @param location - Where the browser should go.
 * @returns The same object, for use as a `ResponseInit`'s `headers`.
 */
const withLocation = (headers: Headers, location: string): Headers => {
  headers.set('Location', location)
  return headers
}
