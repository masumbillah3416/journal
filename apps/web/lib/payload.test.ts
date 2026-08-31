/**
 * payload.test.ts — unit test for the memoisation behaviour of `getPayload`.
 *
 * Mocks the `payload` package's own `getPayload` — the network/database boundary
 * (CLAUDE.md §2.3: mock the boundary, not our own modules) — so this test never
 * opens a real Postgres connection, while still proving our wrapper's caching:
 * two calls in the same process must reuse one initialisation rather than
 * starting a second one. Collection behaviour and real connections are covered
 * by `collections/collections.integration.test.ts` against Docker Postgres.
 */
import { describe, expect, it, vi } from 'vitest'

const initPayload = vi.fn(() => Promise.resolve({ id: 'fake-payload-instance' }))

vi.mock('payload', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getPayload: initPayload,
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
