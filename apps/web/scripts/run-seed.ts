/**
 * run-seed — CLI entry point for `npm run db:seed`.
 *
 * Thin wrapper, deliberately separate from `seed.ts` itself: this file's
 * only job is to get a real Payload instance and call `seed` with it, so
 * `seed.ts` stays import-safe for `seed.integration.test.ts` (which imports
 * `seed` directly and passes its own `payload`, and must never trigger a
 * `process.exit`). Invoked via `payload run scripts/run-seed.ts` (see
 * `apps/web/package.json`'s `db:seed` script) so Payload's own `tsx`-based
 * loader resolves this file's `.js`-suffixed relative imports to their real
 * `.ts` sources — a plain `node run-seed.ts` cannot do that (see
 * docs/data-model.md's note on Payload's CLI and Node's native TS stripping).
 *
 * Not exercised by any test: running it means spawning a real `npm run
 * db:seed` child process against a real Postgres purely to prove this file
 * calls the two functions it visibly calls, which `seed.integration.test.ts`
 * already exercises directly and with more control (`migrate.ts` documents
 * the same reasoning for a CLI-only wrapper - see its own header).
 * Depends on: `./seed.js`, `../lib/payload.js`.
 */
import { getPayload } from '../lib/payload.js'
import { seed } from './seed.js'

const payload = await getPayload()
await seed(payload)
// eslint-disable-next-line no-console -- CLI feedback, not application logging.
console.log('Seeded 10 journeys, 30 pages, and the book/about globals.')
process.exit(0)
