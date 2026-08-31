/**
 * queue — the Queue port (Ports & Adapters pattern, CLAUDE.md §3.3).
 *
 * Fronts the background job queue backing post-upload processing: uploading
 * a clip enqueues a `transcode` job; a worker (in-process today, a Fly.io
 * worker in a later phase) claims one at a time and reports success or
 * failure. A Postgres table with `SELECT ... FOR UPDATE SKIP LOCKED` is
 * deliberately chosen over a managed queue service (CLAUDE.md §4, YAGNI) -
 * that one clause gives single-claim semantics, which is all a single
 * author's bursty uploads need.
 * Depends on: Result from `@travel-diary/domain/result`, MediaId from
 * `@travel-diary/domain/ids`.
 */
import type { Result } from '@travel-diary/domain/result'
import type { MediaId } from '@travel-diary/domain/ids'

/** A job handed to exactly one claimant, ready to be worked on. */
export interface ClaimedJob {
  /** The job row's id, passed back to {@link QueuePort.complete} or {@link QueuePort.fail}. */
  readonly id: string
  /** The kind of work to perform. Only `'transcode'` exists today. */
  readonly kind: 'transcode'
  /** The media item the job operates on. */
  readonly mediaId: MediaId
}

/** Fronts the background job queue used for post-upload processing. */
export interface QueuePort {
  /**
   * Adds a job to the queue.
   * @param job - The work to perform.
   * @returns `ok` with the new job's id, or `err` on failure to persist it.
   */
  enqueue(job: { kind: 'transcode'; mediaId: MediaId }): Promise<Result<string, string>>
  /**
   * Claims the oldest queued job, if any, so no other caller can claim it too.
   * @returns `ok` with the claimed job, `ok(null)` when nothing is queued -
   * this never blocks waiting for work - or `err` on failure.
   */
  claim(): Promise<Result<ClaimedJob | null, string>>
  /**
   * Marks a claimed job as finished successfully.
   * @param jobId - The id returned by {@link QueuePort.claim}.
   */
  complete(jobId: string): Promise<Result<void, string>>
  /**
   * Marks a claimed job as failed, recording why.
   * @param jobId - The id returned by {@link QueuePort.claim}.
   * @param reason - Human-readable failure reason, surfaced on the admin's
   * Media screen in a later phase.
   */
  fail(jobId: string, reason: string): Promise<Result<void, string>>
}
