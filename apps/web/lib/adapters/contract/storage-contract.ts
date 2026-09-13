/**
 * storage-contract — the StoragePort contract suite (Ports & Adapters pattern).
 *
 * Written once, run against every adapter: the local disk adapter today, and
 * a Cloudflare R2 adapter unchanged on the day one exists. **PHASE 3 DID NOT
 * BUILD THAT ADAPTER, and this header said it would for two phases.** There
 * are no R2 credentials on this machine and CLAUDE.md §7.1 forbids finding
 * out by sending, so an adapter written now could not be exercised at all.
 * What Phase 3 built is the seam. An adapter-specific test suite
 * would defeat the point of the port — this is the seam the whole design
 * exists to protect. The path-traversal test in particular must pass for
 * every adapter, even one (R2) with no filesystem to protect, which is why
 * the rejection lives in the port's own `validateStorageKey`, not here.
 * The `uploadUrl` cases were added by Phase 3 Task 7, and they are in the
 * SHARED suite deliberately: the R2 adapter inherits every one of them on the
 * day it exists, which is what makes it a one-file addition behind an
 * already-contract-tested method rather than the untested deferred path
 * ADR 0004 forbids. See docs/adr/0020.
 *
 * ═══ WHY REDEMPTION ARRIVES AS AN ADAPTER-SUPPLIED CAPABILITY ═══
 *
 * An offered URL's LIFETIME cannot be checked by looking at the URL: every
 * adapter encodes the expiry differently, and the only honest question is
 * whether the upload the URL offers is still accepted at a given instant. So
 * the behaviour is stated here, once, and each adapter hands in the harness
 * that exercises it — {@link UploadUrlRedeemer}. The local adapter's redeemer
 * drives `receiveLocalUpload`, which is local-only; an R2 redeemer will PUT to
 * the bucket. Writing the local redemption INTO this file would have made the
 * TTL cases unrunnable against R2, which is a shared suite in name only.
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

/** How one adapter's caller redeems an offered upload URL, for the TTL cases. */
export interface UploadUrlRedeemer {
  /** Attempts the upload the URL offers, as if at `at`. Resolves to whether it was accepted. */
  redeem(url: string, at: Date): Promise<boolean>
}

/**
 * The URL an offer produced.
 *
 * Named rather than inlined as `offered.ok ? offered.value : ''`, which would
 * hand a refusal to the redeemer as an empty string and let a TTL case pass
 * for the wrong reason — the shape this whole review round exists to remove.
 * @param offered - What {@link StoragePort.uploadUrl} answered.
 * @returns The offered URL.
 * @throws When the adapter refused a key the cases above have already proved
 *   it accepts, which is a broken adapter rather than a TTL result.
 */
const offeredUrl = (offered: Awaited<ReturnType<StoragePort['uploadUrl']>>): string => {
  /* c8 ignore next -- no organic trigger: every caller passes a key the `produces an upload URL` cases already prove is accepted, so this arm fires only for an adapter that is already failing those. It stays because returning a placeholder here would make a TTL case answer about a string no adapter offered. */
  if (!offered.ok) throw new Error(`the adapter refused to offer an upload URL: ${offered.error}`)
  return offered.value
}

/**
 * Registers the shared StoragePort contract as a `describe` block.
 * @param name - Identifies which adapter is under test, in the suite's title.
 * @param makeAdapter - Builds a fresh, empty StoragePort for one test.
 * @param redeemer - How this adapter's caller attempts the upload an offered
 *   URL describes, at an instant the case chooses. See this module's header.
 */
export const storageContract = (
  name: string,
  makeAdapter: () => Promise<StoragePort>,
  redeemer: UploadUrlRedeemer,
): void => {
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

    it('produces an upload URL for a key nothing has been written to yet', async () => {
      // The whole point of a presigned upload: the object does not exist, and
      // the URL is what brings it into being. An adapter that answered only
      // for a stored key would be a signed-download URL wearing this name.
      // NOTHING IS WRITTEN HERE, and that is what the case name claims - the
      // pair below is what makes the claim a distinction rather than a word.
      const storage = await makeAdapter()

      const url = await storage.uploadUrl('staging/j/never-written.jpg', anUploadOffer())

      expect(url.ok).toBe(true)
    })

    it('produces an upload URL for a key that already holds an object, so a replacement can be offered', async () => {
      // The other side of the pair: this key IS written first. An adapter that
      // refused to overwrite would fail here and pass above, which is the only
      // way the two cases can mean different things.
      const storage = await makeAdapter()
      await storage.put('staging/j/1-a.jpg', new Uint8Array([1]), 'image/jpeg')

      const url = await storage.uploadUrl('staging/j/1-a.jpg', anUploadOffer())

      expect(url.ok).toBe(true)
    })

    it('produces a different upload URL for a different key, so one cannot stand for another', async () => {
      const storage = await makeAdapter()

      const first = await storage.uploadUrl('staging/j/1-a.jpg', anUploadOffer())
      const second = await storage.uploadUrl('staging/j/1-b.jpg', anUploadOffer())

      // BOTH OFFERS MUST SUCCEED BEFORE THE URLS MEAN ANYTHING. This was
      // `first.ok && second.ok && first.value` compared with
      // `second.ok && second.value`, which passes vacuously when exactly one
      // is a refusal: `false` is not equal to a URL string, so the two
      // differing was all the refusal proved.
      expect(first.ok).toBe(true)
      expect(second.ok).toBe(true)
      expect(offeredUrl(first)).not.toBe(offeredUrl(second))
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

    // ═══ THE THREE LIFETIME CASES ═══
    //
    // An adapter mints its expiry from ITS OWN clock, so no case can know the
    // minting instant exactly. It is BRACKETED instead: `before <= mintedAt <=
    // after`, so `before + ttl <= expiresAt <= after + ttl`. That makes two
    // instants exact rather than approximate, with no clock to inject:
    // `before + ttl` is inside the window for every possible `mintedAt`, and
    // `after + ttl + 1` is outside it for every possible `mintedAt`.
    //
    // WHICH SIDE IS INCLUSIVE: the expiry instant itself is INSIDE the window.
    // `apps/web/lib/media/uploadToken.ts`'s `verifyUploadToken` refuses only
    // `now > expiresAt`, so a URL is live THROUGH its last millisecond and
    // dead one millisecond later. Read, not assumed.

    it('offers a URL still live at the last instant its lifetime covers', async () => {
      const storage = await makeAdapter()

      // Only the LOWER bracket is needed here: `expiresAt >= before + 900s`,
      // and the expiry instant is inclusive, so `before + 900s` is inside the
      // window however long the minting took.
      const before = Date.now()
      const url = await storage.uploadUrl('staging/j/ttl-live.jpg', anUploadOffer({ expiresInSeconds: 900 }))
      expect(await redeemer.redeem(offeredUrl(url), new Date(before + 900 * 1000))).toBe(true)
    })

    it('offers a URL that is dead one millisecond past its lifetime', async () => {
      const storage = await makeAdapter()

      // Only the UPPER bracket is needed here: `expiresAt <= after + 900s`,
      // so one millisecond past that is outside the window however long the
      // minting took.
      const url = await storage.uploadUrl('staging/j/ttl-dead.jpg', anUploadOffer({ expiresInSeconds: 900 }))
      const after = Date.now()
      expect(await redeemer.redeem(offeredUrl(url), new Date(after + 900 * 1000 + 1))).toBe(false)
    })

    it('moves the boundary with the lifetime it was offered, rather than expiring on a fixed schedule', async () => {
      // The case that kills a hard-coded 900: at sixty seconds the SAME pair
      // of instants must answer the same way, which an adapter ignoring
      // `expiresInSeconds` cannot do.
      const storage = await makeAdapter()

      const before = Date.now()
      const url = await storage.uploadUrl('staging/j/ttl-short.jpg', anUploadOffer({ expiresInSeconds: 60 }))
      const after = Date.now()

      expect(await redeemer.redeem(offeredUrl(url), new Date(before + 60 * 1000))).toBe(true)
      expect(await redeemer.redeem(offeredUrl(url), new Date(after + 60 * 1000 + 1))).toBe(false)
    })
  })
}
