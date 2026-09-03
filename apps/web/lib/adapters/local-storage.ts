/**
 * local-storage — filesystem-backed StoragePort adapter (Ports & Adapters).
 *
 * Development stand-in for the Cloudflare R2 adapter that arrives in Phase 3.
 * Stores each object as a file under a configured root directory. Every
 * method resolves its key through the port's own `validateStorageKey` before
 * touching disk, so a traversal attempt is rejected the same way it will be
 * once the R2 adapter (which has no filesystem to protect) is in place.
 * Depends on: node:fs/promises, node:path, the StoragePort contract.
 */
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Result } from '@travel-diary/domain/result'
import { ok } from '@travel-diary/domain/result'
import type { StoragePort } from '../ports/storage'
import { validateStorageKey } from '../ports/storage'

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
  }
}
