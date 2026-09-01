/**
 * queue-contract — the QueuePort contract suite (Ports & Adapters pattern).
 *
 * One shared `describe` block, parameterised over an adapter factory, run
 * against the Postgres adapter today and the Fly.io worker's adapter in a
 * later phase without being rewritten.
 *
 * The concurrent-claim case below is a SMOKE TEST only, not a proof of
 * single-claim semantics - do not treat it as one. On a fast local database
 * two `Promise.all`-fired `claim()` calls were measured to complete their
 * whole round trips back-to-back rather than genuinely overlapping, so this
 * case still passed 8/8 times with `FOR UPDATE SKIP LOCKED` deleted from the
 * adapter. The real regression test for that clause is
 * `postgres-queue.integration.test.ts`'s 'claim() skips a row a concurrent
 * transaction is holding, rather than blocking for it', which drives
 * `claim()` against a row a raw connection is already, verifiably, holding
 * open. This case stays because it still exercises the real public API
 * end-to-end and would catch a regression on a slower or more loaded
 * database, but its name says what it actually is.
 *
 * The suite takes a `readJobRow` probe rather than importing one. It used to
 * import `jobRow()` from ./queue-fixtures, which called `getPayload()` -
 * so this "reusable" suite could only ever run somewhere Payload was
 * available, unlike the storage and mailer suites, which import nothing but
 * their port's type. A future worker-backed adapter would have had to drag a
 * CMS in to be contract-tested. Injecting the probe puts the how-do-I-read-a
 * -job-row question where it belongs: with the adapter's own test file.
 * Depends on: vitest, the QueuePort contract, ./queue-fixtures.
 *
 * Exercised only via `postgres-queue.integration.test.ts` against the real
 * Docker Postgres - the queue has no adapter that runs without one. Covered
 * by the dedicated `test:integration:coverage` pass (vitest.integration.config.ts),
 * not the unit project's coverage run - see docs/testing.md.
 */
import { describe, expect, it } from 'vitest'
import type { QueuePort } from '../../ports/queue'
import { aMediaId } from './queue-fixtures'

/** Reads a persisted job row's observable state, however its adapter stores it. */
export interface JobRowProbe {
  (id: string): Promise<{ status: string; reason: string | null }>
}

/**
 * Registers the shared QueuePort contract as a `describe` block.
 * @param name - Identifies which adapter is under test, in the suite's title.
 * @param makeAdapter - Builds a QueuePort for one test.
 * @param readJobRow - Reads back what the adapter actually persisted for a
 *   job id. Supplied by the adapter's own test file so this suite stays
 *   independent of any one storage technology - see the module header.
 */
export const queueContract = (
  name: string,
  makeAdapter: () => Promise<QueuePort>,
  readJobRow: JobRowProbe,
): void => {
  describe(`QueuePort contract: ${name}`, () => {
    it('smoke test: two concurrent claim() calls do not error, and usually yield only one job on this run (see module header - not a proof of single-claim semantics)', async () => {
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
      /* c8 ignore next -- the job enqueued one line above is always claimable; this narrows the type for TS, its false branch is not an expected outcome */
      const job = claim.ok && claim.value !== null ? claim.value : null
      /* c8 ignore next -- see the ignore above: job is never null here in practice */
      if (job === null) throw new Error('expected a claimable job')

      await queue.fail(job.id, 'ffprobe found no video stream')

      expect(await readJobRow(job.id)).toMatchObject({ status: 'failed', reason: 'ffprobe found no video stream' })
    })
  })
}
