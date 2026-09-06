/**
 * passwordReset — the "send yourself a way back in" request (`SCREENS.md`
 * §3.3), which must answer the same way whether or not the address exists.
 *
 * `SECURITY.md` §3: "The reset endpoint must respond identically whether or
 * not the address exists." It is the sibling of `signIn.ts`'s
 * anti-enumeration, and it is the easier of the two to get wrong, because the
 * obvious implementation has an honest-looking reason to differ — there is
 * genuinely nothing to send to an address that names nobody.
 *
 * PATTERNS (CLAUDE.md §3.3). Ports & Adapters: delivery is the injected
 * {@link MailerPort}, never a concrete mailer, and the origin links are built
 * against is injected too. Result type: the answer is a value a caller must
 * unwrap. Repository: Payload owns the token column and this module is the
 * only place the reset request touches it.
 *
 * THE MASK IS TAKEN FROM WHAT WAS SUBMITTED, NEVER FROM A ROW, and that is
 * the whole trick. `{ maskedTo }` is derived from the normalised address the
 * request carried, so the value returned is identical in shape and content
 * whether or not a row was found — there is no branch in which the answer is
 * assembled differently, rather than two branches that happen to agree today.
 * `passwordReset.integration.test.ts` compares the two answers whole, using
 * two addresses that mask to the same string.
 *
 * PAYLOAD MINTS AND LATER CONSUMES THE TOKEN. `forgotPassword` writes 20
 * CSPRNG bytes to `users.resetPasswordToken` with a one-hour expiry — which is
 * exactly `SCREENS.md`'s "The link works once and lasts an hour" — and
 * `resetPassword` clears it on use. `disableEmail: true`, because delivery
 * belongs to the Mailer port this project already has rather than to Payload's
 * own email adapter, which nothing else here uses. Payload's own operation
 * already returns `null` rather than throwing for an address it cannot find,
 * for the same anti-enumeration reason.
 *
 * THE ORIGIN IS INJECTED AND IS NEVER TAKEN FROM THE REQUEST. A link built
 * from a request's `Host` header is a link an attacker can point at their own
 * machine by setting that header while asking for somebody else's address —
 * and the reader who clicks it hands over a working reset token. It is a
 * dependency here, so a request cannot reach it.
 *
 * A RESET REQUEST SPENDS THE PASSWORD ENDPOINT'S WINDOWS. `SECURITY.md` names
 * a sliding window for the password and code endpoints and not for this one,
 * but an unmetered reset endpoint is a way to put mail in the owner's inbox
 * as fast as requests can be made. It shares the password endpoint's budget
 * rather than taking one of its own: the argument for separate budgets there
 * — "different secrets, different keyspaces" — does not apply to a request
 * that offers no secret at all, and a third `endpoint` value would need a
 * migration to add an enum member for a distinction nothing acts on.
 *
 * TWO RESIDUALS ARE ACCEPTED AND NAMED RATHER THAN HIDDEN.
 *
 * THE FIRST IS THE TIMING. The hit path performs a row update and a mail
 * dispatch that the miss path does not, so the two are distinguishable by how
 * long they take, and by how long the mail provider takes in particular.
 * `SECURITY.md` asks for identical timing of the sign-in miss and mismatch
 * specifically, and of this endpoint asks only that it "respond identically",
 * which is discharged. **This is a scope boundary, not an impossibility, and
 * it has a known cost.** Closing it means dispatching the mail through the
 * queue Phase 0 already built, so the answer is composed before the provider
 * is called. What that costs: the OTP code is sent inline too, and the two
 * send paths should not diverge without a reason, so the honest version of
 * the change moves both — a change to `otpService.ts`'s tested delivery
 * behaviour and to what "the code was sent" means when `issueChallenge`
 * returns. Deliberately not folded into the task that introduced this module.
 *
 * THE SECOND IS `'delivery-failed'` — see its own declaration.
 *
 * INVARIANT — NOTHING HERE LOGS OR RETURNS AN ADDRESS OR A TOKEN. The token
 * exists only in the local binding below and in the body handed to the
 * mailer; the address is returned only masked (CLAUDE.md §7).
 *
 * Depends on: `payload` (the Local API instance, injected), the Mailer port,
 * the sign-in rate limiter, and `@travel-diary/domain`'s `maskEmail` and
 * `Result`.
 */
import { maskEmail } from '@travel-diary/domain/auth/mask'
import { type Result, err, ok } from '@travel-diary/domain/result'
import type { Payload } from 'payload'
import type { MailerPort } from '../ports/mailer'
import type { SignInRateLimiter } from './rateLimit'

/** Why {@link PasswordResetService.requestPasswordReset} refused. */
export type ResetRefusal =
  /** This requesting address, or this claimed address, is out of attempts. */
  | 'rate-limited'
  /**
   * The mail provider refused the message.
   *
   * THE ONE ANSWER THAT CAN DIFFER between an address that exists and one that
   * does not, because only the first has a message to send — so it is an
   * enumeration residual, and it is recorded as one rather than waved away.
   *
   * AND IT IS INDUCIBLE, which an earlier version of this comment denied. Mail
   * providers throttle by volume: an attacker who spends the shared password
   * window against a candidate address, waits it out and repeats can push the
   * account's own sending past the provider's rate limit, at which point a real
   * address answers `'delivery-failed'` and an invented one answers `ok`. The
   * claim "an attacker cannot cause the provider to refuse" was wrong.
   *
   * It stays a refusal because the alternative is worse in a way that is not
   * hypothetical: answering `ok` would tell the owner a link is on its way when
   * none is, which is the one message they cannot act on. What bounds the
   * residual is the shared window — a reset costs the same budget a password
   * attempt does, so the volume needed is slow to reach — and the fact that the
   * oracle only speaks while the owner's own mail is already failing.
   *
   * WHAT WOULD CLOSE IT is the same change that closes the timing residual
   * above: queue the send, answer before the provider is asked, and report a
   * failed delivery to the operator through the log rather than to the reader
   * through the response — the shape `signIn.ts` uses for a credential store
   * that cannot answer. Recorded in `docs/security.md`.
   */
  | 'delivery-failed'

/** What {@link PasswordResetService.requestPasswordReset} is asked. */
export interface PasswordResetRequest {
  /** The address as the reader typed it. Normalised here before use. */
  readonly email: string
  /** The requesting address, for the window this request spends. */
  readonly ip: string
}

/** What a reset request tells the screen. */
export interface RequestedReset {
  /**
   * The address the link went to, masked — and derived from what was
   * submitted rather than from a row, so it is the same either way
   * (`SCREENS.md` §3.3 renders it in the "sent" confirmation).
   */
  readonly maskedTo: string
}

/** What {@link createPasswordResetService} needs from the world outside this module. */
export interface PasswordResetServiceDependencies {
  /** The Payload Local API instance the `users` rows live behind. */
  readonly payload: Payload
  /** Where the link is delivered. The port, never a concrete adapter. */
  readonly mailer: MailerPort
  /** Records and judges the attempt, in the password endpoint's two windows. */
  readonly limiter: SignInRateLimiter
  /**
   * The origin reset links are built against, e.g. `https://diary.example`.
   *
   * A dependency, never a value read off the request — see this module's
   * header for what a `Host`-derived link costs.
   */
  readonly adminOrigin: string
}

/** Sends a reader a way back in. */
export interface PasswordResetService {
  /**
   * Mints a reset link for `email` if it names an account, and answers the
   * same either way.
   *
   * @param request - See {@link PasswordResetRequest}.
   * @returns `ok` with the masked address — identical whether or not the
   *   address exists — or `err` naming the refusal.
   * @example
   * const requested = await reset.requestPasswordReset({ email, ip })
   */
  requestPasswordReset(request: PasswordResetRequest): Promise<Result<RequestedReset, ResetRefusal>>
}

/**
 * The path the link lands on.
 *
 * HANDOFF-DEVIATION: the handoff names no URL for it. `/admin` because phase
 * ruling F41 settled that the bespoke sign-in surface mounts there (Payload's
 * own admin having moved to `/cms`), and because the session cookie is scoped
 * `Path=/admin` — a reset screen outside it could not read the session it is
 * about to establish. A constant rather than a literal at the call site, so
 * the one place the link is built matches the one place the screen will be
 * mounted. **That screen does not exist yet, and Phase 2 Task 9 owns it** —
 * the `[token]` route at this path, the form, the `payload.resetPassword` call,
 * the invalid/expired state, and an e2e case that follows the mailed link
 * (controller ruling, Task 5 review round 1). Until it lands this path resolves
 * to a 404. Recorded in docs/deviations.md §31 rather than left to be
 * discovered.
 */
const RESET_PATH = '/admin/reset'

/**
 * The address as Payload's own `forgotPassword` will spell it.
 *
 * `forgotPasswordOperation` does `email.toLowerCase().trim()` and looks the
 * row up by exact equality, so this is the spelling under which an account
 * can be found at all — the same reasoning, and the same two operations, as
 * `signIn.ts`'s.
 *
 * @param address - The address as the reader typed it.
 * @returns The normalised form.
 */
const normaliseAddress = (address: string): string => address.toLowerCase().trim()

/**
 * Builds the reset service over its injected collaborators.
 *
 * @param dependencies - See {@link PasswordResetServiceDependencies}.
 * @returns The service. A factory rather than module-level functions so
 *   nothing here holds state between calls (CLAUDE.md §3.3 rejects singletons
 *   that do) and so the mailer and the origin are the caller's choice.
 * @example
 * const reset = createPasswordResetService({ payload, mailer, limiter, adminOrigin })
 */
export const createPasswordResetService = ({
  payload,
  mailer,
  limiter,
  adminOrigin,
}: PasswordResetServiceDependencies): PasswordResetService => ({
  async requestPasswordReset({ email, ip }) {
    const address = normaliseAddress(email)

    const admitted = await limiter.admitPasswordAttempt({ ip, email: address })
    if (!admitted.ok) return err('rate-limited')

    // TYPED AS `string`, ACTUALLY `string | null`. Payload's own operation
    // returns `null` for an address that names no account — "we don't want to
    // indicate specifically that an email was not found", its source says, so
    // it fails silently for exactly the reason this module exists — but its
    // declared return type does not say so. Narrowing from `unknown` rather
    // than trusting the declaration is CLAUDE.md §3.1's validation at a trust
    // boundary, and it is the honest alternative to a cast or a `!`: this
    // module checks the shape it actually gets. Revisit if the declaration is
    // ever corrected upstream; the narrowing stays correct either way.
    const minted: unknown = await payload.forgotPassword({
      collection: 'users',
      data: { email: address },
      disableEmail: true,
    })

    if (typeof minted === 'string') {
      const delivery = await mailer.send({
        to: address,
        subject: 'A way back in to your travel diary',
        // HANDOFF-DEVIATION: `SCREENS.md` §3.3 specifies the reset SCREEN and
        // says nothing about the email that carries the link, which
        // nonetheless has to say something. The one sentence that IS the
        // handoff's — "The link works once and lasts an hour" — is reused
        // verbatim rather than paraphrased, so the screen and the message make
        // the same promise about the same link. See docs/deviations.md §31,
        // which also records that the screen this link lands on is not built
        // yet.
        text: `${adminOrigin}${RESET_PATH}/${minted}\n\nOpen that link to choose a new password for the travel diary. The link works once and lasts an hour.\nIf you did not ask for it, nothing has happened and you can ignore this.`,
      })
      if (!delivery.ok) return err('delivery-failed')
    }

    // FROM THE SUBMITTED ADDRESS, NOT FROM A ROW. There is deliberately no
    // branch here: the same expression produces the answer for a hit and for
    // a miss, so the two cannot drift apart in a later edit.
    return ok({ maskedTo: maskEmail(address) })
  },
})
