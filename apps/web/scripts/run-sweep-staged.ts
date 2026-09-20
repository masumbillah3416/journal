/**
 * run-sweep-staged — CLI entry point for `npm run media:sweep-staged`.
 *
 * Thin wrapper, deliberately separate from `./sweep-staged.ts`, for the same
 * reason `./run-rederive.ts` is separate from `./rederive-media.ts`: this
 * file's only job is to build the one real dependency — the local Storage
 * adapter pointed at the `media` collection's own `MEDIA_DIR`, which is where
 * `staging/` lives — and to read the clock, so `sweep-staged.ts` stays
 * import-safe for `sweep-staged.integration.test.ts`, which supplies both.
 * Invoked via `payload run scripts/run-sweep-staged.ts` (see
 * `apps/web/package.json`) so Payload's own `tsx`-based loader resolves this
 * file's relative imports.
 *
 * IT EXITS WITH THE COMMAND'S OWN STATUS, and that is the point of the split:
 * a sweep that could not list the store must not report a green run to whatever
 * eventually invokes it. What decides the status is `sweepStaged`, which has a
 * case on each side.
 *
 * NOTHING SCHEDULES THIS, so an operator reading it knows: there is no
 * `vercel.json` and no cron definition in this repository, and this command runs
 * when somebody runs it. The objects are NOT served — a staged object has no
 * `media` row, and Payload's own file-access check requires one — so an unrun
 * sweep is growth rather than exposure. It is still an un-stripped original
 * sitting in the store, which is why it is worth running by hand rather than
 * waiting (`docs/runbook.md`, `docs/security.md`'s EXIF row, ADR 0024 for the
 * route a scheduler would actually have to call).
 *
 * Not exercised by any test, and it carries the `c8 ignore` CLAUDE.md §2.1
 * requires rather than only this prose — the same treatment, for the same
 * reason, as `./run-rederive.ts`: its body is top-level `await` ending in
 * `process.exit`, so any test that imported it would sweep a real store and
 * then kill its own Vitest worker. `sweep-staged.ts` beside it IS measured, by
 * `vitest.integration.config.ts`, which is where the decision lives.
 * Depends on: `./sweep-staged`, `../lib/adapters/local-storage`,
 * `../collections/media` for `MEDIA_DIR`.
 */
/* c8 ignore start -- CLI entry point: top-level await ending in process.exit, so no test can import it without sweeping a real store and terminating its own worker. See this module's header, and run-rederive.ts's, for why exclude-and-regate is not available here. */
import { MEDIA_DIR } from '../collections/media'
import { createLocalStorage } from '../lib/adapters/local-storage'
import { sweepStaged } from './sweep-staged'

const report = await sweepStaged({ storage: createLocalStorage(MEDIA_DIR) }, Date.now())
// eslint-disable-next-line no-console -- CLI feedback, not application logging.
console.log(report.message)
process.exit(report.exitCode)
/* c8 ignore stop */
