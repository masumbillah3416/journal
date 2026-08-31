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
 * Not exercised by any test, and it carries the `c8 ignore` CLAUDE.md §2.1
 * requires rather than only this prose. Its four siblings - `seed.ts`,
 * `seed-data.ts`, `testPayload.ts` and `migrate.ts` - are each excluded from
 * the unit coverage pass and RE-GATED by `vitest.integration.config.ts`,
 * because each of them is genuinely measured there. That treatment is not
 * available to this file and pretending otherwise would be the dishonest
 * option: its body is top-level `await` ending in `process.exit(0)`, so any
 * test that imported it would seed a real database and then kill its own
 * Vitest worker. Spawning a real `npm run db:seed` child process to prove
 * this file calls the two functions it visibly calls would test npm, not us,
 * and `seed.integration.test.ts` already drives `seed()` directly and with
 * more control.
 *
 * So the honest form is an explicit ignore with its reason at the point it
 * applies, not a 0% row that reads as neglect and not an exclude-and-regate
 * that claims a measurement nothing performs.
 * Depends on: `./seed.js`, `../lib/payload.js`.
 */
/* c8 ignore start -- CLI entry point: top-level await ending in process.exit(0), so no test can import it without seeding a real database and terminating its own worker. See this module's header for why exclude-and-regate is not available here. */
import { getPayload } from '../lib/payload.js'
import { seed } from './seed.js'

const payload = await getPayload()
await seed(payload)
// eslint-disable-next-line no-console -- CLI feedback, not application logging.
console.log('Seeded 10 journeys, 30 pages, and the book/about globals.')
process.exit(0)
/* c8 ignore stop */
