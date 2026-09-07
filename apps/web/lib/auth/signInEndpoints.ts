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
 * branch below for every refusal a caller WITHOUT the password can provoke:
 * those three and `'rate-limited'` take the same `return`, so the three that
 * must agree cannot be separated by a change that only meant to distinguish
 * the fourth. What that costs is that a genuinely rate-limited reader is told
 * the same thing as one who mistyped a password; `docs/security.md` records it.
 *
 * ═══ AND `'code-not-sent'` IS NOT ONE OF THEM (BLOCKER B1) ═══
 *
 * It used to be. Every `SignInRefusal` went through the one `return`, so a
 * reader whose password was CORRECT — and who had merely resubmitted it inside
 * the thirty-second resend cooldown — was told "Those details did not let you
 * in.", and past `HOURLY_RESEND_CAP` every correct submission for the rest of
 * the hour said it. `signIn.ts` creates that refusal specifically to avoid that
 * message and says so in its own TSDoc; this module then wrote the message
 * anyway. Two module headers stating opposite intentions about one value, and
 * neither task review could see it: Task 5's saw the union member, Task 10's
 * saw the collapse.
 *
 * THE ANTI-ENUMERATION ARGUMENT DOES NOT REACH IT, which is the reason the
 * split is safe rather than a trade. `signIn.ts` returns `'code-not-sent'`
 * only after `checkPassword` has ANSWERED `'accepted'`: an unknown address, a
 * wrong password and a locked account all return `'invalid-credentials'`
 * before that line. So this word is unreachable without the password, and a
 * reader who sees it has already proved they hold it.
 *
 * The `state` word and its message are the domain's, next to the other pair,
 * for the reason the note below this one gives.
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
 * THE REFUSAL WORDS ARE SPELLED IN THE DOMAIN, NOT HERE.
 * `@travel-diary/domain/auth/signInScreen` owns both words and both messages,
 * so the endpoint that writes a word and the screen that reads it cannot
 * disagree — and a further refusal state, which is the change that would
 * re-open the enumeration, has to be added in a module gated at 100% with a
 * case counting the states a caller without the password can reach.
 *
 * Depends on: `PASSWORD_REFUSED_STATE` and `PASSWORD_CODE_UNSENT_STATE`
 * (@travel-diary/domain/auth/signInScreen), `CODE_UNJUDGED_STATE` and
 * `CODE_UNSENT_STATE` (@travel-diary/domain/auth/codeScreen), zod,
 * ./browserSession, ./guard, ./httpForm, ./services, and the `Result`s the
 * services return.
 */
import { CODE_UNJUDGED_STATE, CODE_UNSENT_STATE } from '@travel-diary/domain/auth/codeScreen'
import { PASSWORD_CODE_UNSENT_STATE, PASSWORD_REFUSED_STATE } from '@travel-diary/domain/auth/signInScreen'
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

  // ONE BRANCH FOR EVERY REFUSAL A CALLER WITHOUT THE PASSWORD CAN PROVOKE.
  // An unknown address, a wrong password and a locked account are already one
  // value; putting `'rate-limited'` through the same `return` means no later
  // edit can separate the three by meaning to separate the fourth.
  //
  // `'code-not-sent'` is deliberately NOT one of them — see this module's
  // header. It is only reachable once the password has been accepted, and
  // sending it here told a reader with a WORKING password to go and reset it.
  // Written as an equality on the ONE value that leaves rather than as a list
  // of the four that stay: a `SignInRefusal` added later then joins the
  // indistinguishable group by default, which is the fail-closed direction.
  if (!outcome.ok) {
    const state = outcome.error === 'code-not-sent' ? PASSWORD_CODE_UNSENT_STATE : PASSWORD_REFUSED_STATE
    return seeOther(`${PASSWORD_STEP_PATH}?state=${state}`, mintedCookie)
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
    // THIS PATH SPENDS NO CHALLENGE ATTEMPT, SO THE SCREEN HAS TO SAY SO.
    // It used to answer a bare `303` under a comment claiming it was "the SAME
    // answer a wrong code gets". The HTTP answer was; the PAGE was not.
    // Everything the code screen tells a reader is derived from the spent
    // count, and this path leaves that count where it was — so a wrong code
    // produced "That code is not right. 2 attempts left." and a shake, and a
    // refused window produced nothing at all. A reader who typed the CORRECT
    // code got back the page they had just submitted from (finding 6).
    //
    // The word says the guess was not judged, and it names no address, no
    // count and no deadline. It does not re-open what `verifyChallenge`'s
    // single `'invalid'` withholds: this screen already prints the masked
    // address for a browser holding a live challenge and three bullets for one
    // that is not, so "which browsers hold a challenge" is answered by the
    // screen itself, deliberately, and not by this word.
    if (!admitted.ok) return seeOther(`${CODE_STEP_PATH}?state=${CODE_UNJUDGED_STATE}`)
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
 * ONE ANSWER FOR EVERY REASON NOTHING WAS SENT, AND IT IS NOT SILENCE. A fresh
 * code redirects to the code step with no `state`; a refused resend inside the
 * thirty-second cooldown, an account past the hourly ceiling, a spent
 * rate-limit window, a mailer that declined and a browser holding no challenge
 * at all all redirect with {@link CODE_UNSENT_STATE}, which the screen draws as
 * one sentence. One word for five reasons: a reader can act on all of them the
 * same way, and a word per reason would be five things to say where the truth
 * is one.
 *
 * THE SILENCE HID A DEFECT FOR FOUR TASKS AND THEN HID ANOTHER. First,
 * `resendChallenge` refused outright for a challenge that was not `'valid'`,
 * so the button a reader presses AFTER spending their third guess — the only
 * move `SECURITY.md` §3 leaves them — mailed nothing and said nothing, and
 * this handler discarded the `err` that said so (ruling F69). That refusal was
 * fixed and the discard was kept; the discard was the second defect. The
 * client disables this button on a cooldown measured from the challenge bound
 * to THIS browser, while the server's ceiling counts every challenge the
 * ACCOUNT has had in the hour, so past the ceiling the button renders enabled
 * and did nothing when pressed, with nothing on the screen to say why
 * (finding 14). The `Result` is now read.
 *
 * IT IS ALSO METERED NOW, and it was not. `otpService.issueChallenge` derives
 * ~30ms of scrypt BEFORE taking its advisory lock and justifies the cost on
 * the ground that "Task 4's per-account and per-IP rate limiting is what
 * bounds the number of requests" — and this handler called no limiter at all,
 * so for this endpoint that bound was enforced zero times and every request
 * past the hourly ceiling still paid a full derivation to write no row
 * (finding 7). It spends the code endpoint's own two windows, the same ones
 * `handleCodeStep` spends, because a resend and a guess are two ways of
 * spending the same screen and one budget across both is what the numbers in
 * `rateWindow.ts` were chosen against.
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

  const { otp, limiter } = await signInServices()

  // METERED BEFORE THE DERIVATION IS PAID FOR. `challengeAccount` is the only
  // way to name the account a limiter key needs without the request naming it
  // — the browser submits nothing here, which is what makes this endpoint safe
  // to exist at all — and it is server-only: the account never reaches a
  // response. A browser holding no challenge is metered by nothing, and needs
  // to be: `resendChallenge` refuses it before any key is derived.
  const account = await otp.challengeAccount(browserSession)
  if (account !== null) {
    const admitted = await limiter.admitCodeAttempt({ ip: clientAddress(request), account })
    if (!admitted.ok) return seeOther(`${CODE_STEP_PATH}?state=${CODE_UNSENT_STATE}`)
  }

  const issued = await otp.resendChallenge(browserSession, clientAddress(request))

  return seeOther(issued.ok ? CODE_STEP_PATH : `${CODE_STEP_PATH}?state=${CODE_UNSENT_STATE}`)
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
