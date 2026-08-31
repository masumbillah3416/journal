/**
 * postgres-queue.integration.test.ts — wires the QueuePort contract to the
 * real Postgres-backed adapter, plus adapter-specific tests the generic
 * contract does not cover (complete(), the not-found error paths, and a
 * deterministic regression test for the SKIP LOCKED mechanism itself).
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
 * `Promise.all([queue.claim(), queue.claim()])` case is kept for that reason
 * only as a smoke test (see its own name and comment in queue-contract.ts) -
 * it is not a safety net.
 *
 * The real regression test is 'claim() skips a row a concurrent transaction
 * is holding, rather than blocking for it' below. An earlier version of this
 * test opened two raw connections and ran the exact same hand-written SQL on
 * both - which proved Postgres implements SKIP LOCKED (never in question),
 * not that claim() uses it; deleting the clause from postgres-queue.ts left
 * that test passing. The version below drives the real `queue.claim()` call
 * against a row a raw connection is already holding open and uncommitted,
 * and asserts claim() returns `ok(null)` within a short timeout raced via
 * `Promise.race` - proven to fail (not hang) when the clause is removed,
 * because claim()'s own `SELECT ... FOR UPDATE` would then block on the
 * held lock instead of skipping it.
 *
 * Uses `getTestPayload()` (`../testPayload.js`), not `getPayload()` directly:
 * every integration test file connects to an isolated `diary_test` database,
 * never the developer's own dev database (Task 10/11 review finding 2).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { getTestPayload } from '../testPayload.js'
import { createPostgresQueue } from './postgres-queue.js'
import { queueContract } from './contract/queue-contract.js'
import { aMediaId, jobRow } from './contract/queue-fixtures.js'

beforeAll(async () => {
  // The "empty queue" contract case needs a genuinely empty `jobs` table.
  // Every job the contract itself enqueues is claimed within the same test
  // (moving it out of `status = 'queued'`), so this only matters for a stale
  // `queued` row left behind by an interrupted previous run.
  const payload = await getTestPayload()
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

  it('claim() skips a row a concurrent transaction is holding, rather than blocking for it', async () => {
    const payload = await getTestPayload()
    const queue = createPostgresQueue()
    const enqueued = await queue.enqueue({ kind: 'transcode', mediaId: aMediaId() })
    if (!enqueued.ok) throw new Error('expected enqueue to succeed')
    const jobId = Number(enqueued.value)

    const holder = await payload.db.pool.connect()

    try {
      await holder.query('BEGIN')
      const held = await holder.query<{ id: number }>('SELECT id FROM jobs WHERE id = $1 FOR UPDATE', [jobId])
      // `holder` now locks the row, deliberately left open and uncommitted -
      // standing in for another worker that is mid-claim. The assertion
      // below drives the REAL `claim()`, not a hand-written copy of its SQL,
      // so it actually protects the line it claims to.
      expect(held.rows).toHaveLength(1)

      const TIMEOUT_MS = 1000
      const timedOut = Symbol('claim() did not return before the timeout')
      const raced = await Promise.race([
        queue.claim(),
        new Promise<typeof timedOut>((resolve) => {
          setTimeout(() => {
            resolve(timedOut)
          }, TIMEOUT_MS)
        }),
      ])

      // With `FOR UPDATE SKIP LOCKED`, claim() must see the row is locked and
      // return ok(null) promptly. Without that clause, claim()'s own
      // `SELECT ... FOR UPDATE` would block waiting for `holder`'s lock -
      // which `holder` never releases within TIMEOUT_MS - so `raced` would
      // still be the timeout sentinel and this assertion would fail with a
      // clear diff instead of hanging the suite.
      expect(raced).toEqual({ ok: true, value: null })
    } finally {
      await holder.query('ROLLBACK')
      holder.release()
    }
  })
})
