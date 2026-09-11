/**
 * local-storage — filesystem-backed StoragePort adapter (Ports & Adapters).
 *
 * Development stand-in for a Cloudflare R2 adapter that does not exist yet and
 * is not Phase 3's to build (see `../ports/storage.ts`'s header). Stores each
 * object as a file under a configured root directory. Every method resolves
 * its key through the port's own `validateStorageKey` before touching disk, so
 * a traversal attempt is rejected the same way it will be once an adapter with
 * no filesystem to protect is in place.
 *
 * ═══ WHY `uploadUrl` POINTS AT A RECEIVER OF OURS ═══
 *
 * R2 would answer this with a genuine presigned bucket URL. A filesystem has
 * no HTTP surface at all, and {@link StoragePort.signedUrl} above returns a
 * `file://` URL for that reason — which NO BROWSER CAN PUT TO. So without
 * somewhere real to send the bytes, "direct to bucket" would be unexercisable
 * locally: no test, no browser sweep and no developer could drive the upload
 * path at all until the day credentials appeared, which is precisely the
 * untested deferred path ADR 0004 forbids. `uploadUrl` therefore names
 * `PUT /admin/media/upload?token=…`, a receiver this repository serves and
 * `apps/web/lib/media/receiveLocalUpload.ts` implements.
 *
 * THE ORIGIN IS `ADMIN_ORIGIN`, NEVER A REQUEST'S `Host`, for the reason
 * `apps/web/lib/auth/passwordReset.ts` gives at length: a URL built from a
 * header is a URL an attacker points at their own machine. This adapter is
 * handed no request and must not be.
 * Depends on: node:fs/promises, node:path, the StoragePort contract, `env`
 * (../env) for the admin origin and the signing secret, and `mintUploadToken`
 * (../media/uploadToken).
 */
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Result } from '@travel-diary/domain/result'
import { ok } from '@travel-diary/domain/result'
import { env } from '../env'
import { mintUploadToken } from '../media/uploadToken'
import type { StoragePort } from '../ports/storage'
import { validateStorageKey } from '../ports/storage'

/** Where this adapter's `uploadUrl` sends a browser. See the module header. */
export const LOCAL_UPLOAD_PATH = '/admin/media/upload'

/**
 * Creates a StoragePort backed by the local filesystem.
 * @param root - Absolute directory objects are stored under. Created lazily
 * on first write; the caller owns its lifecycle (tests use a temp directory).
 */
export const createLocalStorage = (root: string): StoragePort => {
  /** Validates `key` and resolves it to an absolute path under `root`. */
  const resolvePath = (key: string): Result<string, string> => {
    const validated = validateStorageKey(key)
    if (!validated.ok) return validated
    return ok(path.join(root, validated.value))
  }

  return {
    async put(key, body, _contentType) {
      // Content type is not persisted by this adapter - there is nowhere to
      // put it on a plain filesystem. The R2 adapter will pass it through to
      // the object's own metadata; recording it is that adapter's concern.
      const resolved = resolvePath(key)
      if (!resolved.ok) return resolved

      await mkdir(path.dirname(resolved.value), { recursive: true })
      await writeFile(resolved.value, body)
      return ok(undefined)
    },

    async get(key) {
      const resolved = resolvePath(key)
      if (!resolved.ok) return resolved

      try {
        const data = await readFile(resolved.value)
        return ok(new Uint8Array(data))
      } catch {
        return { ok: false, error: `storage key "${key}" was not found` }
      }
    },

    async delete(key) {
      const resolved = resolvePath(key)
      if (!resolved.ok) return resolved

      try {
        await rm(resolved.value)
      } catch {
        // Deleting an absent key is not a failure - delete is idempotent.
      }
      return ok(undefined)
    },

    async exists(key) {
      const resolved = resolvePath(key)
      if (!resolved.ok) return false

      try {
        await stat(resolved.value)
        return true
      } catch {
        return false
      }
    },

    signedUrl(key, expiresInSeconds) {
      const resolved = resolvePath(key)
      if (!resolved.ok) return Promise.resolve(resolved)

      // A real signature is meaningless for a filesystem with no public HTTP
      // surface of its own; the expiry is still encoded so callers exercise
      // the same shape they will get from the R2 adapter's real signed URL.
      const expiresAt = Date.now() + expiresInSeconds * 1000
      return Promise.resolve(ok(`file://${resolved.value}?expiresAt=${String(expiresAt)}`))
    },

    uploadUrl(key, options) {
      // Validated through the port BEFORE anything is signed: a token minted
      // over a traversal key would be a signed capability to escape the
      // namespace, and a refusal after minting is a refusal that has already
      // handed out the thing it refused.
      const validated = validateStorageKey(key)
      if (!validated.ok) return Promise.resolve(validated)

      const token = mintUploadToken({
        key: validated.value,
        expiresAt: Date.now() + options.expiresInSeconds * 1000,
        maxBytes: options.maxBytes,
        secret: env.PAYLOAD_SECRET,
      })
      // The declared content type is not carried in the URL. The receiver
      // never believes it (see `../ports/storage.ts`'s `UploadUrlOptions`),
      // and a value in a URL that nothing enforces reads as a promise this
      // adapter does not keep.
      return Promise.resolve(ok(`${env.ADMIN_ORIGIN}${LOCAL_UPLOAD_PATH}?token=${encodeURIComponent(token)}`))
    },
  }
}
