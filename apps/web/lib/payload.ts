/**
 * payload — memoised access to the Payload Local API instance.
 *
 * Singleton-via-module-scope pattern (a deliberate, single-instance exception
 * to CLAUDE.md §3.3's anti-pattern list, which forbids singletons holding
 * *mutable* state — this cache holds one immutable connection, and Payload's
 * Local API is itself designed to be shared this way): repeatedly calling
 * `payload.init()` would open a new database pool per call, so the first call
 * initialises and every subsequent call reuses the same in-flight/resolved
 * promise. Depends on: `payload`, the sanitised config from `payload.config.js`.
 */
import { getPayload as initPayload, type Payload } from 'payload'
import config from '../payload.config.js'

let cached: Promise<Payload> | undefined

/**
 * Returns the shared Payload instance, initialising it on first call and
 * reusing that same connection on every subsequent call in this process.
 * @returns The initialised {@link Payload} instance.
 */
export const getPayload = async (): Promise<Payload> => {
  cached ??= initPayload({ config })
  return cached
}
