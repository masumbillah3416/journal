/**
 * services — the composition root of the sign-in surface: the one place the
 * five auth services are wired to a Payload instance, a mailer, an origin and
 * a clock.
 *
 * ═══ WHY THE WIRING IS A MODULE AND NOT FIVE LINES IN EACH HANDLER ═══
 *
 * Every service in `apps/web/lib/auth/` is a factory over injected
 * collaborators (Ports & Adapters, CLAUDE.md §3.3) — which is what makes each
 * of them testable against a real Postgres and a stub mailer. Somewhere,
 * something has to choose the real ones. Written into each route handler,
 * "which adapter delivers mail" and "which clock is the clock" would be five
 * separate answers, and the fifth handler would be the one that quietly used a
 * different mailer. Here they are one answer, and adding an endpoint cannot
 * change it by accident.
 *
 * THE MAILER IS THE CONSOLE STAND-IN, WHICH IS THE ONLY ADAPTER THAT EXISTS.
 * `apps/web/lib/adapters/` holds one implementation of `MailerPort`, and it
 * prints a masked line rather than sending anything (its own header says so).
 * That is a real limitation of this phase and it is stated here rather than
 * discovered when a reader's reset link never arrives: until a sending adapter
 * lands, every code and every reset link this surface issues reaches the
 * operator's terminal and nobody else. `docs/runbook.md` records it.
 *
 * THE CLOCK IS `Date.now` AND IS PASSED, NOT REACHED FOR. Every service takes
 * `now` as a dependency (CLAUDE.md §2.3) precisely so a test can move it; this
 * is the one place the real one is supplied.
 *
 * PATTERNS (CLAUDE.md §3.3). Ports & Adapters: this module names the concrete
 * adapters, and nothing above or below it does. Not a singleton — it holds no
 * state and builds a fresh set of stateless service objects per call. The
 * Payload instance behind them IS memoised, by `../payload`, which is that
 * module's documented single exception.
 *
 * Depends on: `getPayload` (../payload), `env` (../env),
 * `createConsoleMailer` (../adapters/console-mailer), and the five service
 * factories in this directory.
 */
import { createConsoleMailer } from '../adapters/console-mailer'
import { env } from '../env'
import { getPayload } from '../payload'
import type { OtpService } from './otpService'
import { createOtpService } from './otpService'
import type { PasswordResetService } from './passwordReset'
import { createPasswordResetService } from './passwordReset'
import type { SignInRateLimiter } from './rateLimit'
import { createSignInRateLimiter } from './rateLimit'
import type { SessionService } from './sessions'
import { createSessionService } from './sessions'
import type { SignInService } from './signIn'
import { createSignInService } from './signIn'

/** Every service an endpoint on the sign-in surface can need. */
export interface SignInServices {
  /** The password step: rate limit, credentials, second factor, session. */
  readonly signIn: SignInService
  /** Issues and verifies the one-time code. */
  readonly otp: OtpService
  /** Issues, authenticates and revokes the session rows. */
  readonly sessions: SessionService
  /** Sends a reader a way back in. */
  readonly reset: PasswordResetService
  /**
   * Records and judges an attempt in the sign-in endpoints' windows.
   *
   * Exposed as of fix round 1 so `POST /admin/sign-in/code/verify` can spend
   * the code windows — `signIn` has always had it injected, but the code step
   * has no `SignInService` to reach it through.
   */
  readonly limiter: SignInRateLimiter
}

/**
 * The sign-in surface's services, wired to the real Payload, mailer, origin
 * and clock.
 *
 * @returns All four services. A function rather than a module-level constant
 *   because `getPayload()` is asynchronous, and because a constant would open
 *   the database connection at import time — including in a process that only
 *   ever renders the diary.
 * @example
 * const { signIn } = await signInServices()
 * const outcome = await signIn.signIn({ email, password, browserSession, keepSignedIn, ip, device, location })
 */
export const signInServices = async (): Promise<SignInServices> => {
  const payload = await getPayload()
  const mailer = createConsoleMailer()
  const limiter = createSignInRateLimiter({ payload })
  const sessions = createSessionService({ payload, now: Date.now })
  const otp = createOtpService({ payload, mailer, now: Date.now })

  return {
    signIn: createSignInService({ payload, otp, sessions, limiter, now: Date.now }),
    otp,
    sessions,
    limiter,
    // The origin is read from the validated environment and never from the
    // request — `passwordReset.ts`'s header gives the attack a `Host`-derived
    // link is, and `../env.ts` is why a missing value fails at boot.
    reset: createPasswordResetService({ payload, mailer, limiter, adminOrigin: env.ADMIN_ORIGIN }),
  }
}
