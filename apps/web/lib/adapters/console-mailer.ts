/**
 * console-mailer — MailerPort adapter that prints to the terminal (Ports & Adapters).
 *
 * Development stand-in for the Resend adapter of Phase 2. Keeps every full
 * message in an in-memory outbox (`sent`) so tests can read the OTP code out
 * of the body directly. What actually reaches the terminal (`logLines`) is
 * masked and never carries the body, because the body is where the OTP code
 * lives (CLAUDE.md §7: never log secrets, tokens, OTP codes, or full email
 * addresses).
 *
 * The one exception is a single, explicit developer convenience: with
 * `isDevelopment` true (defaulting to `NODE_ENV === 'development'`), the
 * terminal line also includes the code, because a developer signing in
 * locally has no other delivery channel to read it from and their own
 * terminal is not a log a third party can see. This is the one legitimate
 * caller of `console.log` in this codebase - `eslint.config.js` carries a
 * targeted override naming this file, not a blanket disable, so `no-console`
 * still catches an accidental `console.log` anywhere else.
 * Depends on: the Mailer port.
 */
import { ok } from '@travel-diary/domain/result'
import type { MailerPort, SentMessage } from '../ports/mailer.js'
import { maskEmailAddress, validateEmailAddress } from '../ports/mailer.js'

/** Options for {@link createConsoleMailer}. */
export interface ConsoleMailerOptions {
  /**
   * Whether to include the code in the terminal line. Defaults to
   * `process.env.NODE_ENV === 'development'`; overridable so tests can
   * exercise both branches without mutating global process state.
   */
  readonly isDevelopment?: boolean
}

/**
 * Creates a MailerPort that logs a masked line to the terminal for every
 * send and records the full message in an in-memory outbox for tests.
 * @param options - See {@link ConsoleMailerOptions}.
 */
export const createConsoleMailer = (options: ConsoleMailerOptions = {}): MailerPort => {
  const isDevelopment = options.isDevelopment ?? process.env.NODE_ENV === 'development'
  const sent: SentMessage[] = []
  const logLines: string[] = []

  return {
    sent,
    logLines,
    send(message) {
      const validated = validateEmailAddress(message.to)
      if (!validated.ok) return Promise.resolve(validated)

      sent.push(message)

      const maskedRecipient = maskEmailAddress(message.to)
      // Never interpolate `message.text` here outside the dev-only branch -
      // it is the OTP code for the one email this mailer sends today, and
      // CLAUDE.md §7 forbids logging it.
      const line = isDevelopment
        ? `mail: sent "${message.subject}" to ${maskedRecipient} (dev preview: ${message.text})`
        : `mail: sent "${message.subject}" to ${maskedRecipient}`

      logLines.push(line)
      console.log(line)

      return Promise.resolve(ok(undefined))
    },
  }
}
