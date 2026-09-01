/**
 * payload.test.ts — unit test for the memoisation behaviour of `getPayload`.
 *
 * Mocks BOTH boundaries `payload.ts` touches at module scope, not just the
 * network/database one (CLAUDE.md §2.3: mock the boundary, not our own
 * modules):
 *   - `payload`'s own `getPayload`, WITHOUT `importOriginal()`. The real
 *     `payload` package is never loaded — `payload.ts` only calls the
 *     `getPayload` value at runtime; the `Payload` it also imports is a
 *     type-only import, erased before this file ever runs, so it needs no
 *     mock value.
 *   - `../payload.config.js`, so the real config — and with it
 *     `@payloadcms/db-postgres`, `@payloadcms/richtext-lexical`, `sharp` and
 *     every collection and global it wires up — is never loaded either.
 * Without both mocks this "unit" test transitively loaded the entire app
 * config and a native image library, making its pass/fail depend on
 * module-load time against a fixed timeout rather than on the behaviour it
 * guards (§2.3) — see the commit that introduced these two mocks for the
 * timeout this replaced. With both mocks the only thing left to prove is
 * exactly the memoisation: two calls, one initialisation, the same instance
 * back. Collection behaviour and real connections are covered by
 * `collections/collections.integration.test.ts` against Docker Postgres.
 */
import { describe, expect, it, vi } from 'vitest'

const initPayload = vi.fn(() => Promise.resolve({ id: 'fake-payload-instance' }))

vi.mock('payload', () => ({
  getPayload: initPayload,
}))

vi.mock('../payload.config.js', () => ({
  default: {},
}))

describe('getPayload', () => {
  it('memoises so repeated calls reuse one connection', async () => {
    const { getPayload } = await import('./payload.js')

    const first = await getPayload()
    const second = await getPayload()

    expect(second).toBe(first)
    expect(initPayload).toHaveBeenCalledTimes(1)
  })
})
