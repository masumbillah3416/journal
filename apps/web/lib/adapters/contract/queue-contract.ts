/**
 * queue-contract — the QueuePort contract suite (Ports & Adapters pattern).
 *
 * One shared `describe` block, parameterised over an adapter factory, run
 * against the Postgres adapter today and the Fly.io worker's adapter in a
 * later phase without being rewritten. The concurrency test is the one that
 * matters: it is what proves `FOR UPDATE SKIP LOCKED` really gives
 * single-claim semantics, not merely that the code happens to look right.
 * Depends on: vitest, the QueuePort contract, ./queue-fixtures.js.
 *
 * Exercised only via `postgres-queue.integration.test.ts` against the real
 * Docker Postgres - the queue has no adapter that runs without one. Never
 * imported by the unit project (see vitest.config.ts), so v8 reports it as
 * wholly unexecuted here rather than partially.
 */
/* c8 ignore start -- see module header: integration-only, real Postgres required */
import { describe, expect, it } from 'vitest'
import type { QueuePort } from '../../ports/queue.js'
import { aMediaId, jobRow } from './queue-fixtures.js'

/**
 * Registers the shared QueuePort contract as a `describe` block.
 * @param name - Identifies which adapter is under test, in the suite's title.
 * @param makeAdapter - Builds a QueuePort for one test.
 */
export const queueContract = (name: string, makeAdapter: () => Promise<QueuePort>): void => {
  describe(`QueuePort contract: ${name}`, () => {
    it('hands a job to exactly one claimant', async () => {
      const queue = await makeAdapter()
      await queue.enqueue({ kind: 'transcode', mediaId: aMediaId() })

      const [first, second] = await Promise.all([queue.claim(), queue.claim()])

      const claimed = [first, second].filter((r) => r.ok && r.value !== null)
      expect(claimed).toHaveLength(1)
    })

    it('returns null rather than blocking when nothing is queued', async () => {
      const queue = await makeAdapter()

      expect(await queue.claim()).toEqual({ ok: true, value: null })
    })

    it('records the reason a job failed, so the Media screen can show it', async () => {
      const queue = await makeAdapter()
      await queue.enqueue({ kind: 'transcode', mediaId: aMediaId() })
      const claim = await queue.claim()
      const job = claim.ok && claim.value !== null ? claim.value : null
      if (job === null) throw new Error('expected a claimable job')

      await queue.fail(job.id, 'ffprobe found no video stream')

      expect(await jobRow(job.id)).toMatchObject({ status: 'failed', reason: 'ffprobe found no video stream' })
    })
  })
}
/* c8 ignore stop */
