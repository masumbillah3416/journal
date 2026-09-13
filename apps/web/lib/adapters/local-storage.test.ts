/**
 * local-storage.test.ts — runs the shared StoragePort contract against the
 * local disk adapter. Each call to `makeAdapter` gets a fresh temporary
 * directory, so tests never see another test's files.
 *
 * IT ALSO SUPPLIES THIS ADAPTER'S {@link UploadUrlRedeemer}, which is why the
 * contract suite can state a lifetime it has no way to read off a URL. The
 * redemption lives HERE rather than in the shared suite because it is
 * local-only — `receiveLocalUpload` is this repository's stand-in for a bucket,
 * and R2 has no such receiver. An R2 redeemer PUTs to the bucket instead, and
 * the three TTL cases run against it unchanged (docs/adr/0020).
 * Depends on: node:fs/promises, node:os, node:path; `env` (../env) for the
 * signing secret the adapter minted with; `EXPECTED_UPLOAD_REQUEST`
 * (../media/uploadContract); `receiveLocalUpload` (../media/receiveLocalUpload).
 */
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { env } from '../env'
import { EXPECTED_UPLOAD_REQUEST } from '../media/uploadContract'
import { receiveLocalUpload } from '../media/receiveLocalUpload'
import { createLocalStorage } from './local-storage'
import type { UploadUrlRedeemer } from './contract/storage-contract'
import { storageContract } from './contract/storage-contract'

/** A fresh temporary root, so no run of the suite sees another's objects. */
const aRoot = (): Promise<string> => mkdtemp(path.join(tmpdir(), 'travel-diary-storage-'))

/**
 * Redeems an offered URL by making the PUT it describes, at a chosen instant.
 *
 * The URL is used WHOLE rather than having its token picked out of it: the
 * capability is the URL, and rebuilding a request around an extracted token
 * would test a path no client takes. The clock is injected — the receiver's
 * `now` is the only thing standing in for "it is later than it was" (§2.3).
 * The bytes go to a throwaway store, because what is under test is whether the
 * upload was ACCEPTED, not where it landed.
 */
const localRedeemer: UploadUrlRedeemer = {
  async redeem(url, at) {
    const received = await receiveLocalUpload(
      new Request(url, {
        method: EXPECTED_UPLOAD_REQUEST.method,
        headers: { 'Content-Type': EXPECTED_UPLOAD_REQUEST.contentType },
        body: new Uint8Array([1]),
      }),
      { storage: createLocalStorage(await aRoot()), now: () => at.getTime(), secret: env.PAYLOAD_SECRET },
    )
    return received.ok
  },
}

storageContract('local disk', async () => createLocalStorage(await aRoot()), localRedeemer)
