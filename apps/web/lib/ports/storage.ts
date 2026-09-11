/**
 * storage — the Storage port (Ports & Adapters pattern, CLAUDE.md §3.3).
 *
 * Fronts wherever an uploaded still or clip's bytes actually live: the local
 * disk adapter in development, and a Cloudflare R2 adapter at deploy. Every
 * fallible operation returns a `Result` rather than throwing (CLAUDE.md §3.3's
 * Result-type pattern), so a caller must handle a missing key or a rejected
 * write to reach the value.
 *
 * `validateStorageKey` lives here, not in any one adapter, because path
 * traversal must be rejected at the port: the production R2 adapter has no
 * filesystem to protect, so a guard written only into the local disk adapter
 * would protect nothing once that adapter is swapped in. Every adapter's
 * methods call this before touching the key.
 *
 * ═══ THE R2 ADAPTER IS NOT BUILT, AND PHASE 3 DOES NOT BUILD IT ═══
 *
 * This header said it "arrives in Phase 3" for two phases. It does not. R2
 * needs an account and credentials that do not exist on this machine, and
 * CLAUDE.md §7.1 forbids sending a byte of this repository to a service to
 * find out whether an adapter works — so an adapter written now would be
 * exactly the untested deferred path ADR 0004 forbids, with none of the
 * contract-suite coverage that makes the local one legitimate.
 *
 * What Phase 3 built is the SEAM. {@link StoragePort.uploadUrl} is the method
 * a presigned upload needs, the local adapter implements it as an HTTP
 * receiver of ours, and every one of its cases lives in the shared contract
 * suite — so the R2 adapter is a one-file addition behind an already-tested
 * method. Recorded as `docs/adr/0020-the-presign-seam-and-the-local-upload-receiver.md`.
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
  /**
   * Produces a URL a browser can PUT the object's bytes straight to, so an
   * upload never passes through the app (spec §9.1: Vercel caps a request
   * body at ~4.5MB, and a photograph is larger than that).
   * @param key - The object's key. Rejected if it escapes the namespace.
   * @param options - How long the URL lives, what type it accepts, and the
   *   most bytes it will take.
   * @returns `ok` with the URL, or `err` naming why one could not be produced.
   */
  uploadUrl(key: string, options: UploadUrlOptions): Promise<Result<string, string>>
}

/** The terms an upload URL is offered on. Every one of them is enforced. */
export interface UploadUrlOptions {
  /**
   * How long the URL stays usable. The caller passes
   * `UPLOAD_URL_TTL_SECONDS` from `@travel-diary/domain/media/uploadSlot`.
   */
  readonly expiresInSeconds: number
  /**
   * The type the client says it will send. A claim, never a fact — what the
   * bytes actually are is decided by `sniffMediaType` at ingest.
   */
  readonly contentType: string
  /**
   * The most bytes the URL will take. Enforced by whoever receives them, not
   * by the client that was told the number.
   */
  readonly maxBytes: number
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
