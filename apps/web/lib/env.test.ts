/**
 * env.test.ts — unit tests for environment validation.
 *
 * Pure function under test, no I/O: verifies parseEnv accepts a well-formed
 * environment and rejects the two ways a mis-set environment could silently
 * degrade security (missing DATABASE_URL, an under-length PAYLOAD_SECRET).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseEnv } from './env'

/**
 * Builds a complete, passing raw environment record for `parseEnv`, so each
 * test states only the field it cares about (CLAUDE.md §2.3: fixtures are
 * factories with overrides, never shared mutable objects).
 * @param overrides - Fields to replace on top of the valid defaults.
 * @returns A raw environment record accepted by {@link parseEnv}.
 */
const aValidEnv = (
  overrides: Partial<Record<string, string | undefined>> = {},
): Record<string, string | undefined> => ({
  DATABASE_URL: 'postgres://diary:diary@localhost:5432/diary',
  PAYLOAD_SECRET: 'a'.repeat(32),
  MEDIA_ORIGIN: 'http://localhost:3001',
  ADMIN_ORIGIN: 'http://localhost:3000',
  ...overrides,
})

describe('parseEnv', () => {
  it('accepts a complete environment', () => {
    const result = parseEnv({
      DATABASE_URL: 'postgres://diary:diary@localhost:5432/diary',
      PAYLOAD_SECRET: 'a'.repeat(32),
      MEDIA_ORIGIN: 'http://localhost:3001',
      ADMIN_ORIGIN: 'http://localhost:3000',
    })

    expect(result.ok).toBe(true)
  })

  it('rejects a missing database url rather than failing later at connect time', () => {
    const result = parseEnv({ PAYLOAD_SECRET: 'a'.repeat(32), MEDIA_ORIGIN: 'http://x', ADMIN_ORIGIN: 'http://x' })

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- vitest types `expect.stringContaining` as `any`; `toEqual` still type-checks the surrounding assertion.
    expect(result).toEqual({ ok: false, error: expect.stringContaining('DATABASE_URL') })
  })

  it('rejects a short secret, which would weaken every session token', () => {
    const result = parseEnv({
      DATABASE_URL: 'postgres://x',
      PAYLOAD_SECRET: 'short',
      MEDIA_ORIGIN: 'http://x',
      ADMIN_ORIGIN: 'http://x',
    })

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- vitest types `expect.stringContaining` as `any`; `toEqual` still type-checks the surrounding assertion.
    expect(result).toEqual({ ok: false, error: expect.stringContaining('PAYLOAD_SECRET') })
  })

  it('rejects a missing admin origin, rather than mailing reset links to a host nobody set', () => {
    // Phase 2 Task 10. Without it, the only place the origin could come from is
    // the request's own `Host` header — which is the link an attacker points at
    // their own machine (`apps/web/lib/auth/passwordReset.ts`). Failing at boot
    // is the alternative this schema chooses.
    const result = parseEnv({
      DATABASE_URL: 'postgres://x',
      PAYLOAD_SECRET: 'a'.repeat(32),
      MEDIA_ORIGIN: 'http://x',
    })

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- vitest types `expect.stringContaining` as `any`; `toEqual` still type-checks the surrounding assertion.
    expect(result).toEqual({ ok: false, error: expect.stringContaining('ADMIN_ORIGIN') })
  })
})

describe('MEDIA_PIPELINE', () => {
  it('defaults to inline when the variable is not set', () => {
    const parsed = parseEnv({ ...aValidEnv(), MEDIA_PIPELINE: undefined })

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- vitest types `expect.objectContaining` as `any`; `toEqual` still type-checks the surrounding assertion.
    expect(parsed).toEqual({ ok: true, value: expect.objectContaining({ MEDIA_PIPELINE: 'inline' }) })
  })

  it('accepts worker, which is the mode that turns clips on', () => {
    const parsed = parseEnv({ ...aValidEnv(), MEDIA_PIPELINE: 'worker' })

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- vitest types `expect.objectContaining` as `any`; `toEqual` still type-checks the surrounding assertion.
    expect(parsed).toEqual({ ok: true, value: expect.objectContaining({ MEDIA_PIPELINE: 'worker' }) })
  })

  it('refuses a mode nobody implements, naming the field', () => {
    // A typo here would otherwise bind the inline adapter silently and defer
    // video a second time without anybody deciding to.
    const parsed = parseEnv({ ...aValidEnv(), MEDIA_PIPELINE: 'flyio' })

    expect(parsed.ok).toBe(false)
    expect(parsed.ok ? '' : parsed.error).toContain('MEDIA_PIPELINE')
  })
})

describe('the module-level env export', () => {
  const originalSecret = process.env['PAYLOAD_SECRET']

  afterEach(() => {
    process.env['PAYLOAD_SECRET'] = originalSecret
    vi.resetModules()
  })

  it('throws at import time when the environment is invalid, so a bad secret never reaches a request', async () => {
    process.env['PAYLOAD_SECRET'] = 'too-short'
    vi.resetModules()

    await expect(import('./env.js')).rejects.toThrow(/Invalid environment/)
  })
})
