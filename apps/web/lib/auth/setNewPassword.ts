/**
 * setNewPassword — spends a reset link: the one place `payload.resetPassword`
 * is called, behind the screen the mailed link lands on.
 *
 * `SCREENS.md` §3.3 specifies the reset REQUEST and its two states, and says
 * nothing about the screen the link itself opens — the handoff's prototype
 * has no such screen, because a prototype can pretend the link worked. A real
 * reset email is only as good as the address it names, and until phase ruling
 * F47 that address answered 404 with every mechanism behind it green. This
 * module is the second half of `passwordReset.ts`: that one mints and mails
 * the token, this one honours it — {@link NewPasswordService.linkState} to
 * decide whether a form is worth drawing, and
 * {@link NewPasswordService.setNewPassword} to spend the link.
 *
 * PATTERNS (CLAUDE.md §3.3). Repository: Payload owns the token column and
 * this module is the only place a reset is spent, so nothing above it learns
 * what a `users` row looks like. Result type: the answer is a value a caller
 * must unwrap, so a screen cannot render "done" without having handled the
 * refusals. Factory over the injected Payload instance, so nothing here holds
 * state between calls.
 *
 * ═══ TWO REFUSALS, NOT ONE, BECAUSE THE SCREEN SAYS DIFFERENT THINGS ═══
 *
 * A link that cannot be honoured leaves the reader nothing to fill in — the
 * screen replaces the form with the expired state and offers them a new link.
 * A password Payload's own rules refuse leaves the form exactly where it was,
 * with a reason above the button. Collapsing the two would tell a reader
 * holding a perfectly good link that it had expired, and send them round the
 * whole loop again for a password that was three characters too short.
 *
 * HOW THEY ARE TOLD APART, AND WHY IT IS THE STATUS RATHER THAN THE MESSAGE.
 * Payload throws `APIError('Token is either invalid or has expired.', 403)`
 * for a token it cannot match, and a `ValidationError` — an `APIError` with
 * status 400 — when `generatePasswordSaltHash` refuses the password. The
 * status is the stable half of that contract: the messages are translated
 * strings that move with a locale and with a Payload release, and matching on
 * one would be a defect that only appears in another language. Anything
 * unrecognised is reported as a refused LINK rather than as a refused
 * password, because that is the answer that cannot mislead: it never claims a
 * password was the problem when the module does not know that it was.
 *
 * NO PASSWORD POLICY IS INVENTED HERE. `SECURITY.md` states none, the handoff
 * states none, and a minimum length made up in this repository would refuse a
 * password the account could otherwise have. Payload's own rule (three
 * characters, non-empty) is the whole of it, and the refusal is reported
 * rather than pre-empted — the same call `PasswordStep.tsx` makes about the
 * sign-in field.
 *
 * SPENDING A LINK IS NOT SIGNING IN. `payload.resetPassword` also mints a
 * Payload session and returns a token for it; that value is deliberately
 * dropped here. This project's sessions are rows in `sessions`, issued by
 * `sessions.ts` and rotated on login, and adopting a session Payload created
 * as a side effect of a reset would be exactly the "never reuse a pre-auth
 * id" that `SECURITY.md` forbids. A reader who has set a new password signs
 * in with it.
 *
 * INVARIANT — NOTHING HERE LOGS OR RETURNS A TOKEN OR A PASSWORD. Both exist
 * only as parameters passed straight to Payload; the refusals are two fixed
 * strings that quote neither (CLAUDE.md §7).
 * Depends on: `payload` (the Local API instance, injected) and
 * `@travel-diary/domain`'s `Result` and `ResetLinkState`.
 */
import type { ResetLinkState } from '@travel-diary/domain/auth/resetScreen'
import { type Result, err, ok } from '@travel-diary/domain/result'
import type { Payload } from 'payload'

/** Why {@link NewPasswordService.setNewPassword} refused. */
export type NewPasswordRefusal =
  /** The link names no account, or its hour is up, or it has already been spent. */
  | 'invalid-token'
  /** The link is good; Payload's own rules refused the password offered with it. */
  | 'rejected'

/** What {@link NewPasswordService.setNewPassword} is asked. */
export interface NewPasswordRequest {
  /** The token out of the mailed link's last path segment. */
  readonly token: string
  /** The password the reader typed, exactly as they typed it. */
  readonly password: string
}

/** What {@link createNewPasswordService} needs from the world outside this module. */
export interface NewPasswordServiceDependencies {
  /** The Payload Local API instance the `users` rows live behind. */
  readonly payload: Payload
}

/** Honours a reset link. */
export interface NewPasswordService {
  /**
   * Whether the link a reader has just opened is still worth a form.
   *
   * A READ, NEVER A SPEND. It asks the same two questions
   * `payload.resetPassword` asks — is there a row with this token, and is its
   * expiry still in the future — without touching either column, so opening
   * the screen twice costs the reader nothing. Without it the only way to
   * learn a link is stale is to submit a password against it, which is a form
   * filled in for nothing and a refusal that arrives at the worst moment.
   *
   * IT IS AN ORACLE, AND A DELIBERATE ONE. An unauthenticated request can ask
   * this about any string it likes. What that buys an attacker is bounded by
   * the token itself: Payload mints 20 bytes from the CSPRNG, so the guess
   * that would make the answer interesting is not one anybody makes. Answering
   * with a screen rather than with a spent link is the trade every reset flow
   * makes, and the alternative — showing a form for a token that cannot work —
   * is worse for the reader and no better for the attacker, who can ask the
   * same question by submitting a password.
   *
   * @param token - The token out of the mailed link's last path segment.
   * @returns `'live'` when a form is worth drawing, `'spent'` otherwise.
   * @example
   * const state = await service.linkState(token)
   */
  linkState(token: string): Promise<ResetLinkState>
  /**
   * Sets the account named by `token`'s password to `password`, spending the
   * link in the same operation.
   *
   * @param request - See {@link NewPasswordRequest}.
   * @returns `ok` once the password is the account's, or `err` naming which
   *   of the two halves was refused.
   * @example
   * const set = await service.setNewPassword({ token, password })
   * if (!set.ok && set.error === 'invalid-token') redirectToTheExpiredState()
   */
  setNewPassword(request: NewPasswordRequest): Promise<Result<void, NewPasswordRefusal>>
}

/** The status Payload's `ValidationError` carries, and nothing else does here. */
const PASSWORD_REFUSED_STATUS = 400

/**
 * Which refusal a thrown value describes.
 *
 * Narrowed from `unknown` rather than typed as an error class (CLAUDE.md
 * §3.1): what a dependency throws is outside this module's control, so the
 * shape it is read for is checked rather than assumed. A thrown string, a
 * rejected connection or a future Payload that throws something else all take
 * the same branch as an unmatched token, which is the answer that cannot
 * mislead — see this module's header.
 *
 * Exported so its arms can be exercised for what they are — a translation of
 * one library's error shape into this module's two answers — rather than only
 * through the two failures a live Payload happens to produce. The others are
 * not hypothetical: a rejected connection, a thrown string from a future
 * release, or a `null` all reach it, and all three must take the answer that
 * cannot mislead.
 *
 * @param thrown - Whatever `payload.resetPassword` rejected with.
 * @returns `'rejected'` for a refusal of the password itself, otherwise
 *   `'invalid-token'`.
 * @example
 * refusalFrom(new APIError('…', 403)) // 'invalid-token'
 */
export const refusalFrom = (thrown: unknown): NewPasswordRefusal => {
  if (
    typeof thrown === 'object' &&
    thrown !== null &&
    'status' in thrown &&
    thrown.status === PASSWORD_REFUSED_STATUS
  ) {
    return 'rejected'
  }
  return 'invalid-token'
}

/**
 * Builds the service over its injected Payload instance.
 *
 * @param dependencies - See {@link NewPasswordServiceDependencies}.
 * @returns The service. A factory rather than module-level functions so
 *   nothing here holds state between calls and so the tests and the route
 *   supply their own Payload.
 * @example
 * const service = createNewPasswordService({ payload: await getPayload() })
 */
export const createNewPasswordService = ({ payload }: NewPasswordServiceDependencies): NewPasswordService => ({
  async linkState(token) {
    const holders = await payload.find({
      collection: 'users',
      depth: 0,
      limit: 1,
      pagination: false,
      // NO FIELDS AT ALL, which Payload answers with the row's id alone: this
      // asks whether a row exists, and a reset screen has no business reading
      // an account's fields before anybody has proved they own it (CLAUDE.md
      // §7). `depth: 0` so no relationship is walked either.
      select: {},
      where: {
        resetPasswordToken: { equals: token },
        // The same comparison `resetPasswordOperation` makes, against the same
        // column, so this answer and the spend agree about what "expired"
        // means rather than each deciding for itself.
        resetPasswordExpiration: { greater_than: new Date().toISOString() },
      },
    })

    return holders.docs.length === 0 ? 'spent' : 'live'
  },

  async setNewPassword({ token, password }) {
    try {
      // `overrideAccess` because the reader holding this link is by definition
      // not signed in: the token IS the authorisation, and Payload's own
      // access rules have no signed-in user to judge here.
      await payload.resetPassword({
        collection: 'users',
        data: { password, token },
        overrideAccess: true,
      })
    } catch (thrown: unknown) {
      return err(refusalFrom(thrown))
    }
    // The Payload session `resetPassword` also minted is deliberately not
    // returned — see this module's header.
    return ok(undefined)
  },
})
