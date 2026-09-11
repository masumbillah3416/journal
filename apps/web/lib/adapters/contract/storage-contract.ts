/**
 * storage-contract — the StoragePort contract suite (Ports & Adapters pattern).
 *
 * Written once, run against every adapter: the local disk adapter today, the
 * Cloudflare R2 adapter in Phase 3, unchanged. An adapter-specific test suite
 * would defeat the point of the port — this is the seam the whole design
 * exists to protect. The path-traversal test in particular must pass for
 * every adapter, even one (R2) with no filesystem to protect, which is why
 * the rejection lives in the port's own `validateStorageKey`, not here.
 * The `uploadUrl` cases were added by Phase 3 Task 7, and they are in the
 * SHARED suite deliberately: the R2 adapter inherits every one of them on the
 * day it exists, which is what makes it a one-file addition behind an
 * already-contract-tested method rather than the untested deferred path
 * ADR 0004 forbids. See docs/adr/0020.
 * Depends on: vitest, the StoragePort contract from ../../ports/storage.
 */
import { describe, expect, it } from 'vitest'
import type { StoragePort, UploadUrlOptions } from '../../ports/storage'

/**
 * The offer an upload URL is asked for, with the values every adapter must
 * answer the same way to. A factory rather than a shared constant, so no case
 * can hand another a mutated object (CLAUDE.md §2.3).
 * @param overrides - What this case cares about; everything else is ordinary.
 */
const anUploadOffer = (overrides: Partial<UploadUrlOptions> = {}): UploadUrlOptions => ({
  expiresInSeconds: 900,
  contentType: 'image/jpeg',
  maxBytes: 1_000,
  ...overrides,
})

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
      expect((await storage.uploadUrl('../escape.jpg', anUploadOffer())).ok).toBe(false)
    })

    it('produces an upload URL for a valid key', async () => {
      const storage = await makeAdapter()

      const url = await storage.uploadUrl('staging/j/1-a.jpg', anUploadOffer())

      expect(url.ok).toBe(true)
    })

    it('produces an upload URL for a key nothing has been written to yet', async () => {
      // The whole point of a presigned upload: the object does not exist, and
      // the URL is what brings it into being. An adapter that answered only
      // for a stored key would be a signed-download URL wearing this name.
      const storage = await makeAdapter()

      const url = await storage.uploadUrl('staging/j/never-written.jpg', anUploadOffer())

      expect(url.ok).toBe(true)
    })

    it('produces a different upload URL for a different key, so one cannot stand for another', async () => {
      const storage = await makeAdapter()

      const first = await storage.uploadUrl('staging/j/1-a.jpg', anUploadOffer())
      const second = await storage.uploadUrl('staging/j/1-b.jpg', anUploadOffer())

      expect(first.ok && second.ok && first.value).not.toBe(second.ok && second.value)
    })

    it('refuses an upload URL for a key that escapes the namespace', async () => {
      // Traversal is refused at the PORT, so the R2 adapter - which has no
      // filesystem to protect - gets the same refusal for free.
      const storage = await makeAdapter()

      const url = await storage.uploadUrl('../escape.jpg', anUploadOffer())

      expect(url.ok).toBe(false)
    })

    it('refuses an upload URL for an empty key', async () => {
      const storage = await makeAdapter()

      const url = await storage.uploadUrl('', anUploadOffer())

      expect(url.ok).toBe(false)
    })
  })
}
