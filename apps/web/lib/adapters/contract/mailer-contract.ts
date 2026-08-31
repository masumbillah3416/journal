/**
 * mailer-contract — the MailerPort contract suite (Ports & Adapters pattern).
 *
 * Written once, run against every adapter: the console adapter today, the
 * Resend adapter in Phase 2, unchanged. Two of these assertions are security
 * requirements, not conveniences (CLAUDE.md §7: never log secrets, tokens,
 * OTP codes, or full email addresses) - a mailer that leaks either into its
 * log output must fail this suite regardless of which adapter it is.
 * Depends on: vitest, the TestableMailer contract from ../../ports/mailer.js.
 */
import { describe, expect, it } from 'vitest'
import type { TestableMailer } from '../../ports/mailer.js'

/**
 * Registers the shared MailerPort contract as a `describe` block.
 * @param name - Identifies which adapter is under test, in the suite's title.
 * @param makeAdapter - Builds a fresh {@link TestableMailer} for one test. It
 *   is `TestableMailer`, not `MailerPort`, because these assertions read what
 *   the adapter sent and logged - an observation obligation that belongs to
 *   the adapters under test, not to the port every production adapter has to
 *   implement. See `ports/mailer.ts`.
 */
export const mailerContract = (name: string, makeAdapter: () => Promise<TestableMailer>): void => {
  describe(`MailerPort contract: ${name}`, () => {
    it('delivers the message to the outbox for tests to inspect', async () => {
      const mailer = await makeAdapter()
      const message = { to: 'reader@example.com', subject: 'Your code', text: '654321' }

      const result = await mailer.send(message)

      expect(result.ok).toBe(true)
      expect(mailer.sent).toContainEqual(message)
    })

    it('rejects a malformed address', async () => {
      const mailer = await makeAdapter()

      const result = await mailer.send({ to: 'not-an-email', subject: 'Hi', text: 'x' })

      expect(result.ok).toBe(false)
    })

    it('never records a full recipient address in its log output', async () => {
      const mailer = await makeAdapter()

      await mailer.send({ to: 'masum@example.com', subject: 'Your code', text: '123456' })

      // CLAUDE.md section 7: never log secrets, tokens, OTP codes or full addresses.
      expect(mailer.logLines.join('\n')).not.toContain('masum@example.com')
      expect(mailer.logLines.join('\n')).toContain('m***@example.com')
    })

    it('never records the message body, which carries the code', async () => {
      const mailer = await makeAdapter()

      await mailer.send({ to: 'a@b.com', subject: 'Your code', text: '123456' })

      expect(mailer.logLines.join('\n')).not.toContain('123456')
    })
  })
}
