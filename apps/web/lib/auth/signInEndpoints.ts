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
 * ═══ WHAT THE CODE STEP NOW DOES, AFTER FIX ROUND 1 ═══
 *
 * It spends `rateLimit.ts`'s per-account and per-IP code windows before the
 * guess is compared. Until this landed `admitCodeAttempt` had no caller
 * anywhere — a mechanism built in Task 4 and never reached, which phase ruling
 * F45 is explicit is not enforcement. What blocked it was that the function
 * needs the account a challenge belongs to and nothing would name one;
 * `otpService.challengeAccount` is that lookup, added in the same round, and
 * it is server-only: the account never reaches a response, and the endpoint's
 * refusal is the same word whether the window was shut, the code was wrong, or
 * the browser holds no challenge at all.
 *
 * The challenge's own budget still does the work it always did, and it is the
 * half enforced by Postgres rather than by this process: three attempts
 * claimed before the code is compared, single use, a five-minute life, and an
 * hourly ceiling on issuing challenges. The windows are what stop an attacker
 * fanning the same guessing across many browsers from one address.
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
import type { GuardedHandler } from './guard'
import { clientAddress, deviceLabel, seeOther, submittedFields, submittedForm } from './httpForm'
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

/**
 * What a submission to the code endpoint has to carry.
 *
 * `code` is the SIX CELLS JOINED, not one field. `SCREENS.md` §3.2's pane is
 * six `<input name="code" maxLength={1}>` elements, so a browser sends the name
 * six times — see {@link submittedCode} for what reading only the last of them
 * cost.
 */
const codeSubmission = z.object({ code: z.string() })

/**
 * The six digits a reader typed, in document order.
 *
 * ═══ THE SECOND DEFECT OF THE SAME SHAPE AS THE BLOCKER (FIX ROUND 1) ═══
 *
 * This endpoint read its code through `submittedFields`, which is
 * `Object.fromEntries` over the form — and that keeps ONE value per name. Six
 * cells called `code` collapsed to the last one, so the handler compared a
 * single character against a six-digit code and refused every correct one. The
 * integration suite sent a single `code` field, so it agreed with the handler;
 * `docs/api.md` had recorded the real shape since Task 8 and nothing read it.
 * It was found by typing a code into the real pane in a browser.
 *
 * A HAND-ROLLED CLIENT SENDING ONE `code` FIELD STILL WORKS, because joining
 * one value is that value. There is no branch here for the two shapes.
 *
 * @param request - The `POST` as it arrived.
 * @returns The joined digits, or `null` when the body is not a form at all.
 */
const submittedCode = async (request: Request): Promise<string | null> => {
  const form = await submittedForm(request)
  return form === null ? null : form.getAll('code').map(String).join('')
}

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
    carriedForward.append('Set-Cookie', keepSignedInCookie({ keepSignedIn }))
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

  const submitted = codeSubmission.safeParse({ code: await submittedCode(request) })
  if (!submitted.success) return seeOther(CODE_STEP_PATH)

  const { otp, sessions, limiter } = await signInServices()

  // THE PER-ACCOUNT AND PER-IP CODE WINDOWS, SPENT BEFORE THE GUESS IS
  // COMPARED. `admitCodeAttempt` had no caller at all until fix round 1
  // (phase ruling F45: a mechanism nothing calls is not enforcement), because
  // it needs the account a challenge belongs to and nothing would name one.
  // `challengeAccount` is that lookup, and it is server-only: the account
  // never reaches a response, and a browser holding no live challenge is
  // metered by nothing here because `verifyChallenge` refuses it without
  // spending a scrypt derivation anyway.
  const account = await otp.challengeAccount(browserSession)
  if (account !== null) {
    const admitted = await limiter.admitCodeAttempt({ ip: clientAddress(request), account })
    // The SAME answer a wrong code gets. Telling a reader their window is shut
    // would say that this browser holds a live challenge, which is what
    // `verifyChallenge`'s single `'invalid'` refusal exists to withhold.
    if (!admitted.ok) return seeOther(CODE_STEP_PATH)
  }

  const verified = await otp.verifyChallenge(browserSession, submitted.data.code)
  // ONE BRANCH FOR EVERY REFUSAL, for the reason `verifyChallenge` collapses a
  // wrong code and a browser with no challenge into `'invalid'`: distinguishing
  // them would say which browsers hold a live challenge.
  if (!verified.ok) return seeOther(CODE_STEP_PATH)

  const started = await sessions.startSession({
    user: verified.value.userId,
    // Superseded in the same statement that mints its replacement. Passing
    // `null` here would leave the identifier the code was mailed against
    // working alongside the session it produced - and when that identifier is
    // a LIVE session rather than a pre-auth one, the old session would keep
    // authenticating after a fresh sign-in. `SECURITY.md`'s "never reuse a
    // pre-auth id" is the same sentence; the integration suite asserts the
    // live case, because the pre-auth case is true of a handler that rotates
    // nothing (no row names a pre-auth identifier either way).
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
 * Answers "Send a new code".
 *
 * IT NAMES NO ACCOUNT, AND THAT IS THE WHOLE REASON IT CAN EXIST. The browser
 * submits nothing at all; `otpService.resendChallenge` resolves the account
 * from the challenge bound to the identifier in the cookie, so a reader cannot
 * ask for a code to be sent to somebody else's address by naming it.
 *
 * ONE ANSWER, WHATEVER HAPPENED. A fresh code, a refused resend inside the
 * thirty-second cooldown, an account past the hourly ceiling, a mailer that
 * declined, and a browser holding no challenge at all are all a `303` back to
 * the code step. `SCREENS.md` §3.2 gives the resend a cooldown label and no
 * refusal copy, and distinguishing them here would say which browsers hold a
 * live challenge.
 *
 * THAT SAME SILENCE HID A DEFECT FOR FOUR TASKS, which is worth stating beside
 * it rather than leaving for the next reader to find. `resendChallenge` used
 * to refuse outright for a challenge that was not `'valid'`, so the button a
 * reader presses AFTER spending their third guess — the only move
 * `SECURITY.md` §3 leaves them — mailed nothing and said nothing, and this
 * handler discarded the `err` that said so. The refusal is fixed in
 * `otpService.resendChallenge`; the discard stays, because the reader must not
 * be told which browsers hold a live challenge. What stops it hiding the next
 * one is that the two states this endpoint can now be in are asserted on the
 * ROW COUNT rather than on the status — `signInEndpoints.integration.test.ts`
 * has a case for the exhausted reader that fails if nothing is issued.
 *
 * @param request - The `POST`. Its body is not read; the cookie is.
 * @returns A `303` to the code step, or to the password step for a browser
 *   carrying no identifier — there can be no challenge for one that has none.
 * @example
 * export const POST = handleResendCode
 */
export const handleResendCode = async (request: Request): Promise<Response> => {
  const browserSession = readBrowserSession(request.headers.get('cookie'))
  if (browserSession === null) return seeOther(PASSWORD_STEP_PATH)

  const { otp } = await signInServices()
  await otp.resendChallenge(browserSession, clientAddress(request))

  return seeOther(CODE_STEP_PATH)
}

/**
 * Answers "Sign out and start again", for a request the guard has already
 * admitted.
 *
 * BOTH HALVES, AND THE ROW IS THE ONE THAT MATTERS. Clearing the cookie stops
 * this browser sending the identifier; revoking the row stops the identifier
 * working at all, which is what a reader signing out of a shared machine — or
 * a stolen copy of the value — actually needs.
 *
 * IT TAKES THE SESSION RATHER THAN LOOKING IT UP. `guarded` has already
 * authenticated the request, so re-reading the cookie to decide whether to act
 * would be the same question asked twice; what is read below is the
 * IDENTIFIER, which `revokeSession` needs and an `AuthenticatedSession` does
 * not carry.
 *
 * @param request - The `POST`, carrying the session as a cookie.
 * @param session - The account the guard named.
 * @returns A `303` to the sign-in screen, with the session cookie cleared.
 * @example
 * export const POST = guarded(handleSignOut)
 */
export const handleSignOut: GuardedHandler = async (request, session) => {
  const presented = readBrowserSession(request.headers.get('cookie'))

  /* c8 ignore next -- `guarded` authenticated this request from that same cookie a moment ago, so the identifier is there; the arm exists because `readBrowserSession` returns a nullable and the Result must be unwrapped */
  if (presented === null) return seeOther(PASSWORD_STEP_PATH, { 'Set-Cookie': clearedSessionCookie() })

  const { sessions } = await signInServices()
  // The owner is passed as well as the identifier, so `revokeSession` matches
  // on `user_id` too: revocation is how a stolen session is taken away from
  // the thief rather than from its owner.
  await sessions.revokeSession({ session: presented, owner: session.user })

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
