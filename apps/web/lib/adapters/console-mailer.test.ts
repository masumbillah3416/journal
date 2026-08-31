/**
 * console-mailer.test.ts — runs the shared MailerPort contract against the
 * console adapter, plus one adapter-specific test for its dev-only terminal
 * preview of the code (a convenience the generic contract cannot assume any
 * other adapter offers, so it lives here rather than in mailer-contract.ts).
 */
import { describe, expect, it } from 'vitest'
import { createConsoleMailer } from './console-mailer.js'
import { mailerContract } from './contract/mailer-contract.js'

mailerContract('console', () => Promise.resolve(createConsoleMailer()))

describe('console mailer, development-only behaviour', () => {
  it('prints the code to the terminal only in development, for the developer to read', async () => {
    const mailer = createConsoleMailer({ isDevelopment: true })

    await mailer.send({ to: 'dev@example.com', subject: 'Your code', text: '999999' })

    expect(mailer.logLines.join('\n')).toContain('999999')
  })

  it('omits the code outside development', async () => {
    const mailer = createConsoleMailer({ isDevelopment: false })

    await mailer.send({ to: 'dev@example.com', subject: 'Your code', text: '999999' })

    expect(mailer.logLines.join('\n')).not.toContain('999999')
  })
})
