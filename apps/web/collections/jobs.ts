/**
 * jobs — the background job queue table backing the Postgres queue adapter.
 *
 * One row per unit of background work (today: transcoding an uploaded clip).
 * `status` moves queued -> claimed -> completed | failed; `reason` persists
 * why a job failed, so the admin's Media screen can surface it in a later
 * phase (Task 9 brief). `mediaId` is a plain text field, not a `relationship`
 * to `media`: the queue's own concern is only the id string a caller already
 * validated as a `MediaId`, and a foreign-key constraint here would reject
 * the branded test ids the contract suite enqueues in isolation from a real
 * media row. Access is `() => false` on every operation, matching
 * `otpChallenges` and `sessions` - this collection is server-only, reached
 * only through `postgres-queue.ts`'s Local API calls, never the REST/GraphQL
 * API a client could call directly.
 * Depends on: `payload`.
 */
import type { CollectionConfig } from 'payload'

/** One queued unit of background work, claimed by at most one worker. */
export const Jobs: CollectionConfig = {
  slug: 'jobs',
  access: {
    read: () => false,
    create: () => false,
    update: () => false,
  },
  fields: [
    { name: 'kind', type: 'select', options: ['transcode'], required: true },
    { name: 'mediaId', type: 'text', required: true },
    {
      name: 'status',
      type: 'select',
      options: ['queued', 'claimed', 'completed', 'failed'],
      defaultValue: 'queued',
      required: true,
      index: true,
    },
    { name: 'reason', type: 'text' }, // why a job failed
    { name: 'claimedAt', type: 'date' },
  ],
}
