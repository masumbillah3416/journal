/**
 * run-mint-lighthouse-session — CLI entry point for `npm run lighthouse:session`.
 *
 * Thin wrapper, deliberately separate from `mint-lighthouse-session.ts` itself,
 * for the reason `run-seed.ts` already gives: this file's body is top-level
 * `await` ending in `process.exit(0)`, so any test that imported it would write
 * to a real database and then kill its own Vitest worker. The module beside it
 * takes its `payload` as a parameter and is driven directly by
 * `mint-lighthouse-session.integration.test.ts`, against `diary_test`.
 *
 * IT PRINTS THE COOKIE HEADER AND NOTHING ELSE. `scripts/run-lighthouse.mjs`
 * reads this off the pipe and passes it to lhci as a collect-settings
 * override. What it prints is a LIVE CREDENTIAL, and the one line below is the
 * only place THIS repository renders it — but not the only place it ends up.
 * **Lighthouse copies `extraHeaders` into every report it writes**, so the
 * header lands in `.lighthouseci/` and `lhci-reports/` twice per run. Both are
 * gitignored and must stay so, and neither may be uploaded as a CI artifact.
 * What makes those copies harmless is `run-revoke-lighthouse-session.ts`, which
 * `run-lighthouse.mjs` calls once the runs are done.
 *
 * Invoked via `payload run scripts/run-mint-lighthouse-session.ts` so Payload's
 * own `tsx`-based loader resolves the relative imports — a plain `node` cannot
 * (see `run-seed.ts`'s header and docs/data-model.md).
 * Depends on: `./mint-lighthouse-session`, `../lib/payload`.
 */
/* c8 ignore start -- CLI entry point: top-level await ending in process.exit(0), so no test can import it without writing to a real database and terminating its own worker. See this module's header, and `run-seed.ts`'s, for why exclude-and-regate is not available here. */
import { mintLighthouseSession } from './mint-lighthouse-session'
import { getPayload } from '../lib/payload'

const header = await mintLighthouseSession(await getPayload())
// eslint-disable-next-line no-console -- This line IS the command's output; see the module header.
console.log(header)
process.exit(0)
/* c8 ignore stop */
