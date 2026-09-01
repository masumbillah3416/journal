/**
 * storage-contract — the StoragePort contract suite (Ports & Adapters pattern).
 *
 * Written once, run against every adapter: the local disk adapter today, the
 * Cloudflare R2 adapter in Phase 3, unchanged. An adapter-specific test suite
 * would defeat the point of the port — this is the seam the whole design
 * exists to protect. The path-traversal test in particular must pass for
 * every adapter, even one (R2) with no filesystem to protect, which is why
 * the rejection lives in the port's own `validateStorageKey`, not here.
 * Depends on: vitest, the StoragePort contract from ../../ports/storage.js.
 */
import { describe, expect, it } from 'vitest'
import type { StoragePort } from '../../ports/storage.js'

/**
 * Registers the shared StoragePort contract as a `describe` block.
 * @param name - Identifies which adapter is under test, in the suite's title.
 * @param makeAdapter - Builds a fresh, empty StoragePort for one test.
 */
export const storageContract = (name: string, makeAdapter: () => Promise<StoragePort>): void => {
  describe(`StoragePort contract: ${name}`, () => {
    it('returns what was stored', async () => {
      const storage = await makeAdapter()
      const body = new TextEncoder().encode('tokyo')

      await storage.put('a/b.jpg', body, 'image/jpeg')
      const read = await storage.get('a/b.jpg')

      expect(read).toEqual({ ok: true, value: body })
    })

    it('fails rather than throwing when the key is absent', async () => {
      const storage = await makeAdapter()

      const read = await storage.get('missing.jpg')

      expect(read.ok).toBe(false)
    })

    it('reports absence before a write and presence after it', async () => {
      const storage = await makeAdapter()

      expect(await storage.exists('c.jpg')).toBe(false)
      await storage.put('c.jpg', new Uint8Array([1]), 'image/jpeg')
      expect(await storage.exists('c.jpg')).toBe(true)
    })

    it('removes an object so it is no longer readable', async () => {
      const storage = await makeAdapter()
      await storage.put('d.jpg', new Uint8Array([1]), 'image/jpeg')

      await storage.delete('d.jpg')

      expect(await storage.exists('d.jpg')).toBe(false)
    })

    it('rejects a key that escapes the namespace', async () => {
      const storage = await makeAdapter()

      // Path traversal must fail at the port, not at whichever adapter happens
      // to be configured - the R2 adapter will not have a filesystem to protect.
      const written = await storage.put('../escape.jpg', new Uint8Array([1]), 'image/jpeg')

      expect(written.ok).toBe(false)
    })

    it('rejects an empty key', async () => {
      const storage = await makeAdapter()

      const written = await storage.put('', new Uint8Array([1]), 'image/jpeg')

      expect(written.ok).toBe(false)
    })

    it('removing an absent object still succeeds, because delete is idempotent', async () => {
      const storage = await makeAdapter()

      const deleted = await storage.delete('never-written.jpg')

      expect(deleted.ok).toBe(true)
    })

    it('returns a URL for a stored object', async () => {
      const storage = await makeAdapter()
      await storage.put('e.jpg', new Uint8Array([1]), 'image/jpeg')

      const signed = await storage.signedUrl('e.jpg', 60)

      expect(signed.ok).toBe(true)
    })

    it('rejects a traversal key on every operation, not only put', async () => {
      const storage = await makeAdapter()

      expect((await storage.get('../escape.jpg')).ok).toBe(false)
      expect((await storage.delete('../escape.jpg')).ok).toBe(false)
      expect(await storage.exists('../escape.jpg')).toBe(false)
      expect((await storage.signedUrl('../escape.jpg', 60)).ok).toBe(false)
    })
  })
}
