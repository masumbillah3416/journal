/**
 * postgres-queue — Postgres-backed QueuePort adapter (Ports & Adapters).
 *
 * Backs the `jobs` collection (apps/web/collections/jobs.ts). `claim()` runs
 * `SELECT ... FOR UPDATE SKIP LOCKED` inside its own transaction, taken from
 * the Payload Postgres adapter's own connection pool: Postgres locks the
 * selected row at the moment of the `SELECT`, before either transaction
 * commits, so two concurrent claims can never select the same queued row -
 * the second one's `SKIP LOCKED` makes it see zero rows instead of waiting
 * or double-claiming. That single clause is why a Postgres table is
 * sufficient here instead of a managed queue (CLAUDE.md §4, YAGNI).
 *
 * `enqueue`/`complete`/`fail` go through the ordinary Payload Local API,
 * since they touch exactly one row and have no claim race to protect
 * against; only `claim` needs raw SQL for the locking clause Payload's Local
 * API has no equivalent for.
 * Depends on: Result from `@travel-diary/domain/result`, the QueuePort
 * contract, `./payload` for the shared Payload/pg-pool instance.
 *
 * Exercised only by `postgres-queue.integration.test.ts` against the real
 * Docker Postgres - claim()'s locking clause has no meaning against a mock.
 * This module is never imported by the unit project (see vitest.config.ts),
 * so it is gated by the dedicated `test:integration:coverage` pass
 * (vitest.integration.config.ts) instead of the unit project's coverage run
 * - see docs/testing.md.
 */
import type { Result } from '@travel-diary/domain/result'
import { err, ok } from '@travel-diary/domain/result'
import type { MediaId } from '@travel-diary/domain/ids'
import { getPayload } from '../payload'
import type { ClaimedJob, QueuePort } from '../ports/queue'

/** Turns a caught value into a Result-friendly message without an `any`. */
const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error))

/** Creates a QueuePort backed by the `jobs` Postgres table. */
export const createPostgresQueue = (): QueuePort => ({
  async enqueue(job) {
    try {
      const payload = await getPayload()
      const created = await payload.create({
        collection: 'jobs',
        data: { kind: job.kind, mediaId: job.mediaId, status: 'queued' },
      })
      return ok(String(created.id))
    } catch (error) {
      return err(`failed to enqueue job: ${messageOf(error)}`)
    }
  },

  async claim(): Promise<Result<ClaimedJob | null, string>> {
    const payload = await getPayload()
    const client = await payload.db.pool.connect()

    try {
      await client.query('BEGIN')

      const selected = await client.query<{ id: number; kind: string; media_id: string }>(
        `SELECT id, kind, media_id FROM jobs WHERE status = 'queued' ORDER BY id ASC FOR UPDATE SKIP LOCKED LIMIT 1`,
      )
      const row = selected.rows[0]

      if (row === undefined) {
        await client.query('COMMIT')
        return ok(null)
      }

      await client.query(`UPDATE jobs SET status = 'claimed', claimed_at = now() WHERE id = $1`, [row.id])
      await client.query('COMMIT')

      // The column only ever holds strings this adapter itself wrote after a
      // caller had already branded them via `mediaId()`, so re-branding on
      // read reflects a real invariant rather than an unchecked assumption.
      const claimed: ClaimedJob = { id: String(row.id), kind: 'transcode', mediaId: row.media_id as MediaId }
      return ok(claimed)
    } catch (error) {
      await client.query('ROLLBACK')
      return err(`failed to claim job: ${messageOf(error)}`)
    } finally {
      client.release()
    }
  },

  async complete(jobId) {
    try {
      const payload = await getPayload()
      await payload.update({ collection: 'jobs', id: jobId, data: { status: 'completed' } })
      return ok(undefined)
    } catch (error) {
      return err(`failed to complete job: ${messageOf(error)}`)
    }
  },

  async fail(jobId, reason) {
    try {
      const payload = await getPayload()
      await payload.update({ collection: 'jobs', id: jobId, data: { status: 'failed', reason } })
      return ok(undefined)
    } catch (error) {
      return err(`failed to fail job: ${messageOf(error)}`)
    }
  },
})
