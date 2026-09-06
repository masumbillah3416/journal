/**
 * newPasswordScreen — the server side of the screen the mailed reset link
 * lands on: what a `GET` of it is told, and what a `POST` to it answers.
 *
 * ═══ WHY THIS IS A MODULE AND NOT TWO ROUTE FILES ═══
 *
 * `apps/web/app/(admin)/admin/reset/[token]/page.tsx` and
 * `.../reset/set/route.ts` between them hold one call each and nothing else,
 * and that is deliberate rather than fussy. Neither can be run by either
 * Vitest project — a page component needs a Next render context, and the
 * `[token]` one sits under a bracketed directory where `@vitest/coverage-v8`'s
 * ignore hints are documented not to hold (CLAUDE.md §2.1) — so a decision
 * left in either is a decision nothing can measure. Everything either of them
 * would otherwise decide is here, where an integration test drives it with a
 * real `Request` and a real Payload and coverage counts every branch.
 *
 * PATTERNS (CLAUDE.md §3.3). This is an adapter: it turns HTTP into the two
 * calls `setNewPassword.ts`'s service actually offers, and turns that service's
 * `Result` back into a response. It holds no rule of its own — which state the
 * screen draws is `@travel-diary/domain/auth/resetScreen`'s `newPasswordView`,
 * gated at 100%, and whether the link can be spent is the service's.
 *
 * ═══ THE THREE ANSWERS A POST CAN GIVE, AND WHY EACH ONE GOES WHERE IT DOES
 * ═══
 *
 * Every one is a `303 See Other`, never a rendered body. A `POST` that answers
 * with a page leaves that page's address in the browser's history as a
 * resubmittable form, and this one SPENDS A LINK: a reader who reloads would
 * be shown a refusal for a link they successfully used a moment ago. 303 in
 * particular, not 302, because 303 is the one status that requires the browser
 * to follow with a `GET`.
 *
 *   - Set. To `/admin/sign-in`, because the next thing a reader wants is to
 *     use the password they just chose. No session is established here — see
 *     `setNewPassword.ts` on why the Payload session that operation mints is
 *     dropped.
 *   - The password was refused. Back to the same link with `?state=rejected`,
 *     which is the only thing this handler ever puts in an address. The link
 *     was not spent, so the form is still worth drawing and the reader gets
 *     their reason above the button.
 *   - The link was refused. Back to the same link CARRYING NOTHING. The
 *     screen's own read of the link is what draws the expired state, so there
 *     is deliberately no `state=expired` to disagree with it — one fact, read
 *     in one place.
 *
 * WHAT IS IN THE ADDRESS IS PERCENT-ENCODED, ALL OF IT. The token is
 * hexadecimal when Payload minted it and arbitrary text when somebody typed
 * it, and the second is the case that matters: an unencoded value would let a
 * crafted submission write its own query string, or its own path segments,
 * into the `Location` this handler chose.
 *
 * A BODY THIS SCREEN DID NOT SEND GOES TO THE RESET FORM, not to an error.
 * Zod parses the submission at the boundary (CLAUDE.md §3.1) and a request
 * carrying neither field is not a reader who mistyped a password — it is a
 * request that never came from this screen, and the useful answer is the
 * screen where a reset actually starts. THAT NOW COVERS A BODY WHICH IS NOT A
 * FORM AT ALL: `Request.formData()` throws for a content type it cannot parse,
 * so until the Task 9 re-review probed it, a `POST` with no `Content-Type`
 * answered 500 with an empty body. `submittedFields` turns that throw into the
 * same empty submission Zod already refuses.
 *
 * WHAT THIS MODULE DOES NOT DO. It does not check a CSRF token, set a cookie
 * or apply the admin's CSP: all three are Task 10's, which owns the cookie
 * policy for the whole sign-in surface. It is worth being plain about what
 * that costs here and what it does not: the authorisation for this endpoint is
 * the token in the body, which is a secret an attacker forging a cross-site
 * request does not have, so a forged post can spend no link it could not
 * already spend directly. Recorded in docs/security.md.
 *
 * ═══ A SIBLING ROUTE'S NAME IS NOT A TOKEN (RULING F56) ═══
 *
 * The `[token]` segment matches ANY single segment under `/admin/reset`,
 * including `/admin/reset/request` - the address SCREENS.md §3.3's own "Send
 * the link" button posts to, which Task 10 mounts. Until this guard existed,
 * submitting §3.3's form answered 200 with "That link has expired": a screen
 * telling the reader that a link they had never asked for was dead, on the one
 * screen whose whole subject is that link. The guard is HERE rather than in
 * the route file for the reason the whole module exists - a branch in
 * `[token]/page.tsx` is a branch no coverage pass can see.
 *
 * Depends on: `newPasswordView` (@travel-diary/domain/auth/resetScreen),
 * `notFound` (next/navigation), zod, `getPayload` (../payload),
 * ./setNewPassword, ./resetPath.
 */
import { type NewPasswordView, newPasswordView } from '@travel-diary/domain/auth/resetScreen'
import { notFound } from 'next/navigation'
import { z } from 'zod'
import { getPayload } from '../payload'
import { isReservedResetSegment, RESET_PATH } from './resetPath'
import { createNewPasswordService } from './setNewPassword'

/** Where a reader goes once the new password is theirs. */
const SIGN_IN_PATH = '/admin/sign-in'

/** The `state` value that carries a refused password back onto the form. */
const PASSWORD_REFUSED_STATE = 'rejected'

/**
 * What a submission to the endpoint has to carry.
 *
 * Both fields are `string` with no further rule: an empty password is a real
 * submission that Payload refuses on its own terms, and an empty token is a
 * real submission that matches no row. Neither is this module's to judge — see
 * `setNewPassword.ts` on why no password policy is invented in this
 * repository. What this schema rejects is a body that is not this form's at
 * all.
 */
const submission = z.object({ token: z.string(), password: z.string() })

/** What {@link readNewPasswordScreen} is asked. */
export interface NewPasswordScreenRequest {
  /** The token out of the address's last path segment. */
  readonly token: string
  /** The `state` query value, or `undefined` when there is none. */
  readonly state: string | undefined
}

/**
 * Which state the set-a-new-password screen should draw.
 *
 * @param request - See {@link NewPasswordScreenRequest}.
 * @returns The view the route hands to `NewPasswordStep`.
 * @throws The error `next/navigation`'s `notFound()` raises, when the segment
 *   names a sibling route rather than a token - see this module's header. It
 *   is a throw rather than a returned view because the answer is a status, not
 *   a screen: `/admin/reset/request` must 404 exactly as it did before the
 *   dynamic segment was mounted above it.
 * @example
 * const view = await readNewPasswordScreen({ token, state })
 */
export const readNewPasswordScreen = async ({ token, state }: NewPasswordScreenRequest): Promise<NewPasswordView> => {
  if (isReservedResetSegment(token)) notFound()

  const service = createNewPasswordService({ payload: await getPayload() })
  return newPasswordView(await service.linkState(token), state)
}

/**
 * The submission's fields, or none at all when the body is not a form.
 *
 * `Request.formData()` THROWS rather than returning empty for a body it cannot
 * parse - no `Content-Type`, or one naming anything but a form encoding. Until
 * the Task 9 re-review probed it, that throw left this endpoint answering 500
 * with an empty body: an unhandled error at a trust boundary, which is exactly
 * what CLAUDE.md §3.1 forbids.
 *
 * THE ERROR IS NOT INSPECTED, because there is nothing stable to inspect: the
 * runtime raises a plain `TypeError` whose message is its own wording, and
 * discriminating on that would be a contract this repository does not own -
 * the same reasoning `setNewPassword.ts` gives for reading Payload's status
 * rather than its messages. Every unparseable body means one thing here
 * anyway: the request did not come from this screen. So it is mapped to the
 * empty submission the schema already refuses, and there is ONE answer for
 * every request this screen did not make rather than two.
 *
 * @param request - The `POST` as it arrived.
 * @returns The form's fields, or an empty object for a body that is not a form.
 */
const submittedFields = async (request: Request): Promise<Record<string, FormDataEntryValue>> => {
  try {
    return Object.fromEntries(await request.formData())
  } catch {
    return {}
  }
}

/**
 * A `303 See Other` pointing at `location`.
 *
 * @param location - Where the browser should go, as a root-relative path.
 * @returns The response, with no body at all.
 */
const seeOther = (location: string): Response => new Response(null, { status: 303, headers: { Location: location } })

/**
 * Answers a submission of the new-password form.
 *
 * @param request - The `POST`, carrying the token and the password as form
 *   fields.
 * @returns A `303` to wherever the reader goes next. Never a body, and never
 *   an address carrying the password.
 * @example
 * export const POST = handleSetNewPassword
 */
export const handleSetNewPassword = async (request: Request): Promise<Response> => {
  const submitted = submission.safeParse(await submittedFields(request))
  if (!submitted.success) return seeOther(RESET_PATH)

  const { token, password } = submitted.data
  const service = createNewPasswordService({ payload: await getPayload() })
  const set = await service.setNewPassword({ token, password })
  if (set.ok) return seeOther(SIGN_IN_PATH)

  const link = `${RESET_PATH}/${encodeURIComponent(token)}`
  return seeOther(set.error === 'rejected' ? `${link}?state=${PASSWORD_REFUSED_STATE}` : link)
}
