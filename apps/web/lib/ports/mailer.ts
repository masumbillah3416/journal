/**
 * mailer — the Mailer port (Ports & Adapters pattern, CLAUDE.md §3.3).
 *
 * Fronts wherever an outgoing email (today: only the OTP sign-in code)
 * actually gets sent: the console adapter in development, the Resend
 * adapter in Phase 2.
 *
 * `validateEmailAddress` and `maskEmailAddress` live here, not in any one
 * adapter, because CLAUDE.md §7 ("never log secrets, tokens, OTP codes, or
 * full email addresses") is a requirement on every adapter this port ever
 * gets, not a quirk of the console adapter - masking written once here means
 * the Resend adapter gets the same guarantee for free.
 * Depends on: Result from `@travel-diary/domain/result`.
 */
import type { Result } from '@travel-diary/domain/result'
import { err, ok } from '@travel-diary/domain/result'

/** One outgoing email: who it's for, its subject, and its plain-text body. */
export interface SentMessage {
  readonly to: string
  readonly subject: string
  readonly text: string
}

/** Fronts whatever channel actually delivers an email. */
export interface MailerPort {
  /**
   * Sends `message`.
   * @param message - The email to send.
   * @returns `ok` once accepted for delivery, or `err` naming why it was rejected.
   */
  send(message: SentMessage): Promise<Result<void, string>>
  /** Full messages, for tests to read the code out of. Never printed. */
  readonly sent: readonly SentMessage[]
  /** Exactly what was written to the terminal — masked, and never carrying the body. */
  readonly logLines: readonly string[]
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Validates that `address` is at least superficially a well-formed email
 * address (`local@domain.tld`).
 * @param address - The candidate email address.
 * @returns `ok` with the address when it looks valid, or `err` naming why it does not.
 */
export const validateEmailAddress = (address: string): Result<string, string> =>
  EMAIL_PATTERN.test(address) ? ok(address) : err(`"${address}" is not a valid email address`)

/**
 * Masks an email address for safe logging: keeps the first character of the
 * local part and the whole domain, replaces the rest of the local part with
 * `***` (e.g. `masum@example.com` -> `m***@example.com`).
 * @param address - The address to mask. Assumed already validated.
 * @returns The masked address, or `***` if `address` has no `@`.
 */
export const maskEmailAddress = (address: string): string => {
  const [local, ...domainParts] = address.split('@')
  const domain = domainParts.join('@')
  if (local === undefined || local.length === 0 || domain.length === 0) {
    return '***'
  }
  return `${local.charAt(0)}***@${domain}`
}
