/**
 * uploadProbes — the fixtures and probes the upload suites share.
 *
 * Factories with overridable defaults and no shared mutable state
 * (CLAUDE.md §2.3): every helper here builds a fresh thing per call and takes
 * what it needs as a parameter. It implements none of §3.3's seven named
 * patterns beyond Factory; naming another for four helpers would be cargo
 * cult.
 *
 * IT IS A MODULE RATHER THAN LOCALS IN ONE TEST FILE because the upload suites
 * that follow need the same helpers, and a helper that has to be "moved later"
 * is a helper that gets duplicated.
 *
 * ═══ IT IS DELIBERATELY FREE OF PAYLOAD AND OF `sharp` ═══
 *
 * `uploadToken.test.ts` is a UNIT test — HMAC over `node:crypto` is pure
 * computation — and it imports {@link SECRET} from here so the unit and
 * integration suites sign with one value rather than two. So this module's
 * import graph must stay to `node:` builtins and our own light modules: a
 * `getTestPayload` imported at the top of it would pull `payload.config.ts`,
 * `pg` and `sharp` into the Docker-free pre-commit gate, which is the one
 * thing `vitest.config.ts`'s split exists to prevent.
 *
 * Depends on: node:fs/promises, node:os, node:path; the StoragePort and its
 * local adapter; `EXPECTED_UPLOAD_REQUEST` (../uploadContract).
 */
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createLocalStorage } from '../../adapters/local-storage'
import type { StoragePort } from '../../ports/storage'
import { EXPECTED_UPLOAD_REQUEST } from '../uploadContract'

/**
 * A throwaway signing secret for the upload-token suites.
 *
 * NEVER `env.PAYLOAD_SECRET`. A test that signed with the real secret would
 * depend on a value the Docker-free pass has no honest source for, and would
 * put a production key in reach of a fixture. Thirty-two characters, matching
 * the length `apps/web/lib/env.ts` validates, so the suites exercise a secret
 * of the shape production actually has.
 */
export const SECRET = 'upload-probe-secret-not-real-key'

/** A temporary object store and the directory it is rooted at. */
export interface TempStore {
  /** The port under test, backed by {@link TempStore.root}. */
  readonly storage: StoragePort
  /** The directory objects land in, so a test can read the disk directly. */
  readonly root: string
}

/**
 * Builds a StoragePort over a fresh temporary directory.
 *
 * The same shape `apps/web/lib/adapters/local-storage.test.ts` uses to run the
 * contract suite — a new `mkdtemp` per call, so no test ever sees another
 * test's objects. That file builds its root inline rather than exporting a
 * helper, which is why this is written here rather than imported from it.
 * @returns The port and the absolute directory it writes under. The caller
 *   owns the directory's lifecycle; the operating system reclaims `tmpdir()`.
 * @example
 * const { storage } = await aTempStore()
 */
export const aTempStore = async (): Promise<TempStore> => {
  const root = await mkdtemp(path.join(tmpdir(), 'travel-diary-upload-'))
  return { storage: createLocalStorage(root), root }
}

/**
 * Builds the PUT a browser makes when it uploads one file.
 *
 * THE METHOD AND CONTENT TYPE COME FROM `EXPECTED_UPLOAD_REQUEST`, never from
 * a literal typed here — that constant is measured against a real Chromium
 * (see `../uploadContract.ts`'s header) and asserted against one again by
 * `e2e/upload.spec.ts`. A fixture that spelled its own method and type would
 * be a fixture agreeing with itself, which is the exact species of defect that
 * let two Phase 2 blockers through sixteen hundred passing tests.
 *
 * The body and its length are the caller's, deliberately: a browser sets
 * `Content-Length` from the body it is given and a page cannot make it lie, so
 * a fixture that let a caller state a length independently of the bytes would
 * be modelling a client no browser is. The one test that needs a lying header
 * builds its own `Request` and says so.
 * @param input - The minted token to present, and the bytes to send.
 * @returns A `Request` of the shape the measurement recorded.
 * @example
 * aPutRequest({ token, body: new Uint8Array([1, 2, 3]) })
 */
export const aPutRequest = (input: { readonly token: string; readonly body: Uint8Array }): Request =>
  new Request(`http://localhost/admin/media/upload?token=${encodeURIComponent(input.token)}`, {
    method: EXPECTED_UPLOAD_REQUEST.method,
    headers: { 'Content-Type': EXPECTED_UPLOAD_REQUEST.contentType },
    // Copied into a fresh `Uint8Array` for the reason
    // `app/(diary)/gallery/[slug]/download/[id]/route.ts` does the same: a
    // `Uint8Array` over an unspecified buffer is not a `BodyInit` to
    // TypeScript, and a copy is how that is said without a cast (§3.1).
    // Nothing here states a `Content-Length` - see this module's header.
    body: new Uint8Array(input.body),
  })
