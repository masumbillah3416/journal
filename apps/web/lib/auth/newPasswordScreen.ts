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
 * WHAT THIS MODULE DOES NOT DO, AND WHAT NOW DOES IT INSTEAD. It checks no
 * CSRF token, sets no cookie and applies no CSP. Task 10 mounted all three one
 * layer above: `apps/web/middleware.ts` refuses a cross-site mutation to any
 * `/admin` address before this handler is reached, and adds the admin's
 * security headers to what it answers. So a forged post no longer arrives at
 * all — and the bound this paragraph used to state still holds underneath it,
 * which is why the two together rather than either alone: the authorisation
 * for this endpoint is the token in the body, a secret a cross-site forgery
 * does not have. Recorded in docs/security.md.
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
 * WHERE `submittedFields` AND `seeOther` WENT. Both were written here in Task
 * 9 and both moved to `./httpForm` in Task 10, unchanged, when four more
 * endpoints needed them. A second copy of `submittedFields` would be a second
 * place for `Request.formData()`'s throw to go unhandled, which is the `500`
 * this module's own header records finding.
 *
 * Depends on: `newPasswordView` (@travel-diary/domain/auth/resetScreen),
 * `notFound` (next/navigation), zod, `getPayload` (../payload),
 * ./httpForm, ./setNewPassword, ./resetPath.
 */
import { type NewPasswordView, newPasswordView, RESET_REFUSED_STATE } from '@travel-diary/domain/auth/resetScreen'
import { notFound } from 'next/navigation'
import { z } from 'zod'
import { SIGN_IN_PATH } from './adminPaths'
import { getPayload } from '../payload'
import { seeOther, submittedFields } from './httpForm'
import { isReservedResetSegment, RESET_PATH } from './resetPath'
import { createNewPasswordService } from './setNewPassword'

/**
 * The `state` value that carries a refused password back onto the form.
 *
 * IMPORTED FROM THE DOMAIN, NOT DECLARED HERE. It was a private constant in
 * this file and a private constant again in
 * `packages/domain/src/auth/resetScreen.ts`, which reads it — producer and
 * consumer as two unlinked literals across a package boundary, either of which
 * could change and silently turn the reset refusal message off (seam S4). Both
 * were also called `PASSWORD_REFUSED_STATE`, which is the name
 * `@travel-diary/domain/auth/signInScreen` exports for a different value.
 */

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
  return seeOther(set.error === 'rejected' ? `${link}?state=${RESET_REFUSED_STATE}` : link)
}
