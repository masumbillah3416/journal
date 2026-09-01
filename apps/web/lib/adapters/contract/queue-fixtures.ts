/**
 * queue-fixtures — factories for the queue contract suite.
 *
 * Factories with overridable defaults, never shared mutable objects, per
 * CLAUDE.md §2.3. Depends on the domain ids and nothing else.
 *
 * It used to also export a `jobRow()` reader that called `getPayload()`, which
 * meant the queue contract suite - reached from here - could not run against
 * any future adapter without Payload. The storage and mailer contract suites
 * import only their port's type; this one imported a CMS. That defeats the
 * reason contract suites exist, so the job-row probe moved out: the suite now
 * takes a `readJobRow` function from whichever test wires it up, and each
 * adapter supplies the reader appropriate to its own backing store.
 *
 * Exercised only via `postgres-queue.integration.test.ts` against the real
 * Docker Postgres - the queue has no adapter that runs without one - so it is
 * gated by the dedicated `test:integration:coverage` pass
 * (vitest.integration.config.ts) rather than the unit project's coverage run.
 * See docs/testing.md.
 */
import { mediaId, type MediaId } from '@travel-diary/domain/ids'

let counter = 0

/** A distinct MediaId per call, so parallel tests never collide. */
export const aMediaId = (): MediaId => {
  counter += 1
  const built = mediaId(`test-media-${String(counter)}`)
  /* c8 ignore next -- mediaId() only rejects an empty/whitespace-only string; this factory never constructs one */
  if (!built.ok) throw new Error(built.error)
  return built.value
}
