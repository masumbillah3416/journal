/**
 * mediaProcessor — the MediaProcessor port (Ports & Adapters pattern,
 * CLAUDE.md §3.3).
 *
 * Fronts wherever the upload pipeline actually runs: in-process on Vercel
 * under `MEDIA_PIPELINE=inline`, and on a Fly.io worker with `ffmpeg` under
 * `MEDIA_PIPELINE=worker` (`docs/adr/0004-media-pipeline-mode.md`). The same
 * shape as `storage.ts`, `mailer.ts` and `queue.ts` beside it, and for the
 * same reason: one contract suite, run against every adapter.
 *
 * ═══ WHAT THE FLAG SWITCHES, AND WHY IT IS ONE VALUE ═══
 *
 * ADR 0004 requires enabling clips to be ONE configuration change. So the two
 * things a caller could otherwise get out of step - which processor runs, and
 * which types are accepted - are one object here: {@link MediaProcessor}
 * carries its own {@link MediaProcessor.acceptedTypes}, read by ingest and by
 * the admin's upload picker, so neither can disagree with the processor that
 * will actually be handed the bytes. Under `inline` that list excludes
 * `video/mp4` and `video/quicktime` even though
 * `apps/web/collections/media.ts` still lists both: the PORT defers video,
 * with the schema untouched, which is what keeps the switch a config change
 * rather than a migration.
 *
 * ═══ INVARIANTS A FUTURE EDIT COULD BREAK ═══
 *
 *   - **`process` NEVER THROWS.** The bytes are attacker-controlled, so every
 *     way of failing is a value: `Result` with one of
 *     {@link ProcessingRefusal}'s names. A rejected promise here is a refusal
 *     path that crashes the request handler instead of answering it.
 *   - **The bytes coming back are always RE-ENCODED, never the upload.**
 *     SECURITY.md: "Re-encode stills rather than passing originals through -
 *     that removes metadata and any embedded payload in one step." That is
 *     why {@link ProcessedStill.contentType} is the literal `'image/jpeg'`
 *     rather than whatever came in: this port has no representation for
 *     "the original, passed through".
 *   - **`declaredType` and `filename` are what the CLIENT said**, and neither
 *     may be used to decide what a file IS. The declared type is used only to
 *     refuse a disagreement with the sniffed one; the filename is used only
 *     for the stored name. `sniffMediaType` is given neither.
 *
 * Depends on: Result from `@travel-diary/domain/result`; AcceptedType and
 * IngestRefusal from `@travel-diary/domain/media/ingestPolicy`.
 */
import type { AcceptedType, IngestRefusal } from '@travel-diary/domain/media/ingestPolicy'
import type { Result } from '@travel-diary/domain/result'

/** What a browser handed us, before anything has been believed about it. */
export interface UploadedBytes {
  readonly bytes: Uint8Array
  /** What the client called it. Used only to refuse a disagreement. */
  readonly declaredType: string
  /** What the client called the file. Never used to decide a type. */
  readonly filename: string
}

/** A still, re-encoded and stripped, ready for Payload to derive tiers from. */
export interface ProcessedStill {
  readonly kind: 'still'
  readonly bytes: Uint8Array
  readonly contentType: 'image/jpeg'
  readonly filename: string
  readonly capturedAt: string | undefined
  readonly contentHash: string
  readonly width: number
  readonly height: number
}

/** A clip, transcoded, with the poster frame step 7 extracted. */
export interface ProcessedClip {
  readonly kind: 'clip'
  readonly bytes: Uint8Array
  readonly contentType: 'video/mp4'
  readonly filename: string
  readonly capturedAt: string | undefined
  readonly contentHash: string
  readonly durationSec: number
  readonly poster: ProcessedStill
}

export type Processed = ProcessedStill | ProcessedClip

/** Every way processing can refuse. The policy's refusals, plus unreadable bytes. */
export type ProcessingRefusal = IngestRefusal | 'unreadable'

/** Fronts wherever the upload pipeline actually runs. */
export interface MediaProcessor {
  /**
   * The types this processor will accept, which is what the flag switches.
   * Read by ingest and by the admin's upload picker, so the three things
   * ADR 0004 says move together have one source.
   */
  readonly acceptedTypes: readonly AcceptedType[]
  /**
   * Sniffs, refuses, strips, re-encodes and hashes `upload`.
   * @param upload - The bytes a client sent, with what it called them.
   * @returns `ok` with the processed result, or `err` naming the refusal.
   *   Never throws: the bytes are attacker-controlled.
   */
  process(upload: UploadedBytes): Promise<Result<Processed, ProcessingRefusal>>
}
