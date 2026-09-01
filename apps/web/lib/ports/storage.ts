/**
 * storage — the Storage port (Ports & Adapters pattern, CLAUDE.md §3.3).
 *
 * Fronts wherever an uploaded still or clip's bytes actually live: the local
 * disk adapter in development, the Cloudflare R2 adapter in Phase 3. Every
 * fallible operation returns a `Result` rather than throwing (CLAUDE.md §3.3's
 * Result-type pattern), so a caller must handle a missing key or a rejected
 * write to reach the value.
 *
 * `validateStorageKey` lives here, not in any one adapter, because path
 * traversal must be rejected at the port: the production R2 adapter has no
 * filesystem to protect, so a guard written only into the local disk adapter
 * would protect nothing once that adapter is swapped in. Every adapter's
 * methods call this before touching the key.
 * Depends on: Result from `@travel-diary/domain/result`.
 */
import type { Result } from '@travel-diary/domain/result'
import { err, ok } from '@travel-diary/domain/result'

/** Fronts the object store backing every still and clip's stored bytes. */
export interface StoragePort {
  /**
   * Stores `body` under `key`, overwriting any existing object there.
   * @param key - The object's key. Rejected if it escapes the storage namespace.
   * @param body - The object's raw bytes.
   * @param contentType - The MIME type to record alongside the object.
   * @returns `ok` once written, or `err` naming why the write failed.
   */
  put(key: string, body: Uint8Array, contentType: string): Promise<Result<void, string>>
  /**
   * Reads the bytes stored under `key`.
   * @param key - The object's key.
   * @returns `ok` with the object's bytes, or `err` when absent or unreadable —
   * never throws for a missing key.
   */
  get(key: string): Promise<Result<Uint8Array, string>>
  /**
   * Removes the object stored under `key`, if any.
   * @param key - The object's key.
   * @returns `ok` once removed (idempotent: absence is not an error), or `err`
   * naming why the removal failed.
   */
  delete(key: string): Promise<Result<void, string>>
  /**
   * Reports whether an object is currently stored under `key`.
   * @param key - The object's key.
   * @returns `true` when present, `false` when absent or the key is invalid.
   */
  exists(key: string): Promise<boolean>
  /**
   * Produces a URL a client can fetch the object from directly.
   * @param key - The object's key.
   * @param expiresInSeconds - How long the URL remains valid for.
   * @returns `ok` with the URL, or `err` naming why one could not be produced.
   */
  signedUrl(key: string, expiresInSeconds: number): Promise<Result<string, string>>
}

/**
 * Validates that `key` is a safe, namespace-relative storage key.
 *
 * Rejects the empty string, absolute paths (`/etc/passwd`, `C:\...`), and any
 * path segment of `..` — the traversal case that would otherwise let a write
 * escape the storage root.
 * @param key - The candidate storage key.
 * @returns `ok` with the trimmed key when safe, or `err` naming why it was rejected.
 */
export const validateStorageKey = (key: string): Result<string, string> => {
  const trimmed = key.trim()
  if (trimmed.length === 0) {
    return err('storage key must not be empty')
  }

  const isAbsolute = trimmed.startsWith('/') || trimmed.startsWith('\\') || /^[a-zA-Z]:/.test(trimmed)
  const segments = trimmed.split(/[/\\]+/)
  const escapesNamespace = segments.some((segment) => segment === '..')

  if (isAbsolute || escapesNamespace) {
    return err(`storage key "${key}" escapes the storage namespace`)
  }

  return ok(trimmed)
}
