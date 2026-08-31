/**
 * postgres-queue.integration.test.ts — wires the QueuePort contract to the
 * real Postgres-backed adapter, plus adapter-specific tests the generic
 * contract does not cover (complete(), the not-found error paths, and a
 * deterministic proof of the SKIP LOCKED mechanism itself).
 *
 * Named `*.integration.test.ts` to match vitest.config.ts's integration
 * project glob (`apps/web/lib/**\/*.integration.test.ts`): `claim()`'s
 * `SELECT ... FOR UPDATE SKIP LOCKED` needs a real database, not a mock.
 *
 * On this local Docker Postgres a full `claim()` round trip (connect, BEGIN,
 * SELECT, UPDATE, COMMIT) was measured to complete in well under a
 * millisecond - faster than the JS scheduling jitter between two
 * `Promise.all`-fired calls reliably overlaps. Racing `queue.claim()`
 * against a broken adapter with the locking clause removed, 8/8 runs still
 * reported exactly one claimant: the two round trips ran back-to-back, not
 * genuinely concurrently, so that shape of test can pass for the wrong
 * reason on a fast enough machine. The `queueContract`'s own
 * `Promise.all([queue.claim(), queue.claim()])` case below is kept (it is
 * the brief's specified assertion, exercises the real public API end to
 * end, and would still catch a regression on a slower or more loaded
 * database), but genuine, guaranteed simultaneity is proven separately by
 * 'a second transaction genuinely overlapping the first is made to skip the
 * locked row', which opens two raw connections and holds the first
 * transaction's lock open - uncommitted - while the second's identical
 * `SELECT ... FOR UPDATE SKIP LOCKED` runs, by construction rather than by
 * hoping two independent async calls race close enough in time.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { getPayload } from '../payload.js'
import { createPostgresQueue } from './postgres-queue.js'
import { queueContract } from './contract/queue-contract.js'
import { aMediaId, jobRow } from './contract/queue-fixtures.js'

beforeAll(async () => {
  // The "empty queue" contract case needs a genuinely empty `jobs` table.
  // Every job the contract itself enqueues is claimed within the same test
  // (moving it out of `status = 'queued'`), so this only matters for a stale
  // `queued` row left behind by an interrupted previous run.
  const payload = await getPayload()
  const stale = await payload.find({ collection: 'jobs', limit: 1000, depth: 0 })
  await Promise.all(stale.docs.map((doc) => payload.delete({ collection: 'jobs', id: doc.id })))
})

queueContract('postgres', () => Promise.resolve(createPostgresQueue()))

describe('postgres queue, adapter-specific behaviour', () => {
  it('marks a claimed job completed', async () => {
    const queue = createPostgresQueue()
    await queue.enqueue({ kind: 'transcode', mediaId: aMediaId() })
    const claim = await queue.claim()
    const job = claim.ok && claim.value !== null ? claim.value : null
    if (job === null) throw new Error('expected a claimable job')

    await queue.complete(job.id)

    expect(await jobRow(job.id)).toMatchObject({ status: 'completed' })
  })

  it('returns a failed Result rather than throwing when completing an unknown job', async () => {
    const queue = createPostgresQueue()

    const result = await queue.complete('999999999')

    expect(result.ok).toBe(false)
  })

  it('returns a failed Result rather than throwing when failing an unknown job', async () => {
    const queue = createPostgresQueue()

    const result = await queue.fail('999999999', 'no such job')

    expect(result.ok).toBe(false)
  })

  it('a second transaction genuinely overlapping the first is made to skip the locked row', async () => {
    const payload = await getPayload()
    const queue = createPostgresQueue()
    const enqueued = await queue.enqueue({ kind: 'transcode', mediaId: aMediaId() })
    if (!enqueued.ok) throw new Error('expected enqueue to succeed')
    const jobId = Number(enqueued.value)

    const holder = await payload.db.pool.connect()
    const contender = await payload.db.pool.connect()

    try {
      await holder.query('BEGIN')
      const held = await holder.query<{ id: number }>(
        'SELECT id FROM jobs WHERE id = $1 FOR UPDATE SKIP LOCKED',
        [jobId],
      )
      // Transaction A now holds the row's lock, deliberately left uncommitted
      // - the overlap that follows is guaranteed by construction, not by
      // racing two independent calls and hoping they land close in time.
      expect(held.rows).toHaveLength(1)

      await contender.query('BEGIN')
      const contended = await contender.query<{ id: number }>(
        'SELECT id FROM jobs WHERE id = $1 FOR UPDATE SKIP LOCKED',
        [jobId],
      )

      // The row is locked by a still-open transaction, so SKIP LOCKED must
      // make the second transaction see nothing rather than wait for it.
      expect(contended.rows).toHaveLength(0)

      await contender.query('ROLLBACK')
      await holder.query('ROLLBACK')
    } finally {
      contender.release()
      holder.release()
    }
  })
})
