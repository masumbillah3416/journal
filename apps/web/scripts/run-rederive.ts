/**
 * run-rederive — CLI entry point for `npm run media:rederive`.
 *
 * Thin wrapper, deliberately separate from `rederive-media.ts` itself, for the
 * same reason `run-seed.ts` is separate from `seed.ts`: this file's only job is
 * to build the two real dependencies - a Payload instance and the local
 * Storage adapter pointed at the `media` collection's own `MEDIA_DIR` - and
 * call `rederiveMedia` with them, so `rederive-media.ts` stays import-safe for
 * `rederive-media.integration.test.ts`, which supplies its own. Invoked via
 * `payload run scripts/run-rederive.ts` (see `apps/web/package.json`) so
 * Payload's own `tsx`-based loader resolves this file's relative imports.
 *
 * Not exercised by any test, and it carries the `c8 ignore` CLAUDE.md §2.1
 * requires rather than only this prose - the same treatment, for the same
 * reason, as `./run-seed.ts`: its body is top-level `await` ending in
 * `process.exit(0)`, so any test that imported it would re-derive a real
 * library and then kill its own Vitest worker. `rederive-media.ts` beside it IS
 * measured, by `vitest.integration.config.ts`, which is where every decision
 * this command takes actually lives.
 * Depends on: `./rederive-media`, `../lib/payload`, `../lib/adapters/local-storage`,
 * `../collections/media` for `MEDIA_DIR`.
 */
/* c8 ignore start -- CLI entry point: top-level await ending in process.exit(0), so no test can import it without re-deriving a real library and terminating its own worker. See this module's header, and run-seed.ts's, for why exclude-and-regate is not available here. */
import { MEDIA_DIR } from '../collections/media'
import { createLocalStorage } from '../lib/adapters/local-storage'
import { getPayload } from '../lib/payload'
import { rederiveMedia } from './rederive-media'

const payload = await getPayload()
const summary = await rederiveMedia({ payload, storage: createLocalStorage(MEDIA_DIR) })
// eslint-disable-next-line no-console -- CLI feedback, not application logging.
console.log(
  `Re-derived ${String(summary.rederived)} media row(s).` +
    (summary.skipped.length === 0
      ? ''
      : ` Skipped ${String(summary.skipped.length)} with no original in the store: ${summary.skipped.join(', ')}.`),
)
process.exit(0)
/* c8 ignore stop */
