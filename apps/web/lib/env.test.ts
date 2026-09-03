/**
 * env.test.ts — unit tests for environment validation.
 *
 * Pure function under test, no I/O: verifies parseEnv accepts a well-formed
 * environment and rejects the two ways a mis-set environment could silently
 * degrade security (missing DATABASE_URL, an under-length PAYLOAD_SECRET).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseEnv } from './env'

describe('parseEnv', () => {
  it('accepts a complete environment', () => {
    const result = parseEnv({
      DATABASE_URL: 'postgres://diary:diary@localhost:5432/diary',
      PAYLOAD_SECRET: 'a'.repeat(32),
      MEDIA_ORIGIN: 'http://localhost:3001',
    })

    expect(result.ok).toBe(true)
  })

  it('rejects a missing database url rather than failing later at connect time', () => {
    const result = parseEnv({ PAYLOAD_SECRET: 'a'.repeat(32), MEDIA_ORIGIN: 'http://x' })

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- vitest types `expect.stringContaining` as `any`; `toEqual` still type-checks the surrounding assertion.
    expect(result).toEqual({ ok: false, error: expect.stringContaining('DATABASE_URL') })
  })

  it('rejects a short secret, which would weaken every session token', () => {
    const result = parseEnv({
      DATABASE_URL: 'postgres://x',
      PAYLOAD_SECRET: 'short',
      MEDIA_ORIGIN: 'http://x',
    })

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- vitest types `expect.stringContaining` as `any`; `toEqual` still type-checks the surrounding assertion.
    expect(result).toEqual({ ok: false, error: expect.stringContaining('PAYLOAD_SECRET') })
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
