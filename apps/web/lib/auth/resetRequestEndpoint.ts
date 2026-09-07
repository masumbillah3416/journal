/**
 * resetRequestEndpoint — `/admin/reset/request`: what a `POST` of
 * `SCREENS.md` §3.3's "Send the link" button answers, and what a `GET` of the
 * same address still does not.
 *
 * ═══ THE ADDRESS THIS MOUNTS AT WAS RESERVED FOR IT (RULING F56) ═══
 *
 * `app/(admin)/admin/reset/[token]` matches ANY single segment under
 * `/admin/reset`, so adding it made `request` a valid token spelling and §3.3's
 * own primary action answered `200` with "That link has expired" — a screen
 * telling the reader that a link they had never asked for was dead.
 * `resetPath.ts`'s `RESERVED_RESET_SEGMENTS` restored the `404` by refusing to
 * read either sibling's name as a token, and this module is what that
 * reservation was making room for.
 *
 * SO THE `404` HAS TO SURVIVE THE MOUNTING, and that is a real risk rather
 * than a theoretical one: a `route.ts` exporting only `POST` makes Next answer
 * `405 Method Not Allowed` to a `GET`, which is not what this address did the
 * day before. {@link readResetRequestRoute} is exported so the route file can
 * keep answering `404` — the address is a form's action, not a page, and there
 * is nothing at it to fetch.
 *
 * PATTERNS (CLAUDE.md §3.3). Adapter: it turns one HTTP request into the one
 * call `passwordReset.ts` offers and that service's `Result` back into a
 * response. It takes no decision of its own — whether an address is worth a
 * link, and what the masked answer says, are both the service's.
 *
 * ═══ A REFUSAL DOES NOT DRAW THE CONFIRMATION ═══
 *
 * `requestPasswordReset` refuses for two reasons: the shared password window
 * is exhausted, or the mail provider declined. Neither may answer with
 * `?sent=`, because that draws SCREENS.md §3.3's green block naming where the
 * link went — telling a reader a link is on its way when none is is the one
 * message they cannot act on. Both go back to the form.
 *
 * WHAT THAT COSTS, STATED RATHER THAN HIDDEN. The reader is returned to a form
 * they have just filled in, with nothing said about why. §3.3 specifies two
 * states for this screen — pending and sent — and no refusal copy, so there is
 * no handoff text to draw and inventing a third state here would be inventing
 * a screen. Recorded in `docs/deviations.md`.
 *
 * IT IS ALSO THE ENUMERATION RESIDUAL `passwordReset.ts` ALREADY NAMES: a
 * `'delivery-failed'` can only happen for an address that exists, so a reader
 * returned to the form learns something an invented address would not. That
 * residual is that module's, is bounded there, and is not widened here — this
 * handler cannot tell the two refusals apart either, and answers both the same
 * way.
 *
 * INVARIANT — NOTHING HERE LOGS OR RETURNS A WHOLE ADDRESS OR A TOKEN. The
 * only address that reaches a `Location` is the masked one the service
 * returned, percent-encoded (CLAUDE.md §7).
 *
 * Depends on: `notFound` (next/navigation), zod, ./httpForm, ./resetPath,
 * ./services.
 */
import { notFound } from 'next/navigation'
import { z } from 'zod'
import { clientAddress, seeOther, submittedFields } from './httpForm'
import { RESET_PATH } from './resetPath'
import { signInServices } from './services'

/**
 * What a submission to this endpoint has to carry.
 *
 * `email` is a plain string with no shape rule. An address that is not one is
 * a real submission, and it must be answered exactly as an address that is:
 * refusing it here would be a cheaper oracle than the one this whole endpoint
 * is built to avoid.
 */
const resetSubmission = z.object({ email: z.string() })

/**
 * What a `GET` of this address gets: nothing.
 *
 * @returns Never — it always throws.
 * @throws The error `next/navigation`'s `notFound()` raises. A throw rather
 *   than a returned `404` `Response` so the reader is shown the application's
 *   own not-found screen, which is what this address answered before a route
 *   was mounted here.
 * @example
 * export const GET = readResetRequestRoute
 */
export const readResetRequestRoute = (): never => notFound()

/**
 * Answers a submission of the reset request form.
 *
 * @param request - The `POST`, carrying `email` as a form field.
 * @returns A `303` to `/admin/reset?sent=<masked>` when a link was requested,
 *   and to `/admin/reset` when the submission was not this form's or the
 *   request was refused. Never a body.
 * @example
 * export const POST = handleResetRequest
 */
export const handleResetRequest = async (request: Request): Promise<Response> => {
  const submitted = resetSubmission.safeParse(await submittedFields(request))
  if (!submitted.success) return seeOther(RESET_PATH)

  const { reset } = await signInServices()
  const requested = await reset.requestPasswordReset({
    email: submitted.data.email,
    ip: clientAddress(request),
  })
  if (!requested.ok) return seeOther(RESET_PATH)

  // Percent-encoded, all of it: the mask is derived from text a reader typed,
  // so an unencoded value would let a crafted submission write its own query
  // string into the `Location` this handler chose. `resetRequestView` masks it
  // a second time on the way in, so nothing that arrives at the screen can be
  // a whole address however this one was reached.
  return seeOther(`${RESET_PATH}?sent=${encodeURIComponent(requested.value.maskedTo)}`)
}
