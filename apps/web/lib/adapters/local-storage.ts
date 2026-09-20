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
 * ═══ THIS ADAPTER IS WHAT KEEPS THAT ROUTE ALIVE ═══
 *
 * Nothing else points at `PUT /admin/media/upload`. The day `r2-storage.ts`
 * exists and is configured, this adapter stops being the one in production and
 * the receiver behind it has no caller — so **the change that adds R2 must
 * delete `apps/web/app/(admin)/admin/media/upload/route.ts`, or gate it behind
 * the pipeline configuration, in the same commit.** Leaving it is leaving an
 * authenticated write endpoint nobody reaches through the port any more, which
 * is precisely the kind of thing that survives three phases unnoticed. ADR 0020
 * records it as a residual; it is repeated here because this is the file being
 * edited when it becomes true.
 *
 * THE ORIGIN IS `ADMIN_ORIGIN`, NEVER A REQUEST'S `Host`, for the reason
 * `apps/web/lib/auth/passwordReset.ts` gives at length: a URL built from a
 * header is a URL an attacker points at their own machine. This adapter is
 * handed no request and must not be.
 * ═══ `list` WALKS THE DIRECTORY, IT DOES NOT COMPARE STRINGS ═══
 *
 * The prefix is resolved to a directory and that directory's tree is walked,
 * so the boundary between `staging/j1` and `staging/j10` is the filesystem's
 * own rather than a `startsWith` this adapter would have to get right. Keys
 * come back POSIX-separated whatever `path.sep` is here, because they are the
 * same strings `put` and `get` take — and the sweep hands each one straight
 * back to `delete`.
 * Depends on: node:fs/promises, node:path, the StoragePort contract, `env`
 * (../env) for the admin origin and the signing secret, and `mintUploadToken`
 * (../media/uploadToken).
 */
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Result } from '@travel-diary/domain/result'
import { ok } from '@travel-diary/domain/result'
import { env } from '../env'
import { mintUploadToken } from '../media/uploadToken'
import type { StoragePort, StoredObject } from '../ports/storage'
import { validateStorageKey } from '../ports/storage'

/** The separators a caller may end a `list` prefix with. See {@link createLocalStorage}'s `list`. */
const TRAILING_SEPARATORS = /[/\\]+$/

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

    async list(prefix) {
      // A TRAILING SEPARATOR IS TRIMMED BEFORE VALIDATION, not after: the
      // port's `validateStorageKey` splits on separators and `'staging/'` ends
      // in an empty segment. A caller that writes one means the same directory
      // as a caller that does not.
      const root_ = prefix.replace(TRAILING_SEPARATORS, '')
      const resolved = resolvePath(root_)
      if (!resolved.ok) return resolved

      const found: StoredObject[] = []
      // An explicit stack rather than recursion: the depth is the store's, not
      // this module's, and a staging tree is two levels deep today.
      const pending = [{ directory: resolved.value, key: root_ }]
      while (pending.length > 0) {
        const here = pending.pop()
        /* c8 ignore next -- unreachable: the loop condition is the very length this pop reads. */
        if (here === undefined) break

        // `withFileTypes` so a subdirectory is recognised without a second
        // `stat` per entry (CLAUDE.md §6: this runs over every staged object).
        const entries = await readdir(here.directory, { withFileTypes: true }).catch(() => undefined)
        // A prefix nothing has been written under is an empty listing rather
        // than a refusal - the sweep's first run on a fresh deployment reads
        // exactly this, and an `err` there would alert every night until
        // somebody uploaded something.
        if (entries === undefined) continue

        for (const entry of entries) {
          // BUILT FROM THE KEY, NEVER FROM `path.relative`: the key a caller
          // hands back to `delete` has to be `/`-separated on Windows too.
          const key = `${here.key}/${entry.name}`
          if (entry.isDirectory()) {
            pending.push({ directory: path.join(here.directory, entry.name), key })
            continue
          }
          const stats = await stat(path.join(here.directory, entry.name))
          found.push({ key, bytes: stats.size, modifiedAt: stats.mtimeMs })
        }
      }

      return ok(found)
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
