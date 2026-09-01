/**
 * console-mailer.test.ts — runs the shared MailerPort contract against the
 * console adapter, plus adapter-specific tests for its dev-only terminal
 * preview of the code (a convenience the generic contract cannot assume any
 * other adapter offers, so it lives here rather than in mailer-contract.ts).
 *
 * The contract is wired with `isDevelopment: false`, explicitly, and that is
 * load-bearing rather than tidy. One of the contract's cases - "never records
 * the message body, which carries the code" - is a CLAUDE.md §7 SECURITY
 * assertion, and the console adapter deliberately DOES print the code when
 * `isDevelopment` is true. Letting that flag default from `NODE_ENV` (as this
 * wiring used to) made a security assertion depend on an ambient environment
 * variable: the suite passed on CI and on a machine with `NODE_ENV` unset, and
 * went red for any developer whose shell exported `NODE_ENV=development` -
 * reporting a leak that was not one, in the one place a false alarm is most
 * expensive. CLAUDE.md §2.3 requires time and environment to be injected for
 * exactly this reason.
 *
 * Both branches stay covered: the cases below pin `isDevelopment` true and
 * false directly, and two more cover the DEFAULT - the fail-safe property
 * docs/deviations.md §7 leans on, that an adapter nobody configures masks the
 * code in production. Those two are the only place `NODE_ENV` is touched, via
 * Vitest's `stubEnv` (the environment is a boundary, which §2.3 permits
 * stubbing; it is not one of our own modules).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createConsoleMailer } from './console-mailer.js'
import { mailerContract } from './contract/mailer-contract.js'

mailerContract('console', () => Promise.resolve(createConsoleMailer({ isDevelopment: false })))

describe('console mailer, development-only behaviour', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

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

  it('masks the recipient in the terminal line even in development, because only the code is exempt', async () => {
    const mailer = createConsoleMailer({ isDevelopment: true })

    await mailer.send({ to: 'masum@example.com', subject: 'Your code', text: '999999' })

    expect(mailer.logLines.join('\n')).not.toContain('masum@example.com')
    expect(mailer.logLines.join('\n')).toContain('m***@example.com')
  })

  it('masks the code by default in production, so nothing has to remember to opt out', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const mailer = createConsoleMailer()

    await mailer.send({ to: 'dev@example.com', subject: 'Your code', text: '999999' })

    expect(mailer.logLines.join('\n')).not.toContain('999999')
  })

  it('prints the code by default when NODE_ENV says development, which is the only way in', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const mailer = createConsoleMailer()

    await mailer.send({ to: 'dev@example.com', subject: 'Your code', text: '999999' })

    expect(mailer.logLines.join('\n')).toContain('999999')
  })
})
