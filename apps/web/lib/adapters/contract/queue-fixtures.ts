/**
 * queue-fixtures — factories for the queue contract suite.
 *
 * Factories with overridable defaults, never shared mutable objects, per
 * CLAUDE.md §2.3. Depends on the domain ids and the Payload instance.
 *
 * Exercised only via `postgres-queue.integration.test.ts` against the real
 * Docker Postgres. Never imported by the unit project (see
 * vitest.config.ts), so v8 reports it as wholly unexecuted here rather than
 * partially.
 */
/* c8 ignore start -- see module header: integration-only, real Postgres required */
import { mediaId, type MediaId } from '@travel-diary/domain/ids'
import { getPayload } from '../../payload.js'

let counter = 0

/** A distinct MediaId per call, so parallel tests never collide. */
export const aMediaId = (): MediaId => {
  counter += 1
  const built = mediaId(`test-media-${String(counter)}`)
  if (!built.ok) throw new Error(built.error)
  return built.value
}

/** Reads a job row directly, to assert what the adapter persisted. */
export const jobRow = async (id: string): Promise<{ status: string; reason: string | null }> => {
  const payload = await getPayload()
  const row = await payload.findByID({ collection: 'jobs', id })
  return { status: row.status, reason: row.reason ?? null }
}
/* c8 ignore stop */
