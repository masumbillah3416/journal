/**
 * run-revoke-lighthouse-session — CLI entry point for
 * `npm run lighthouse:session:revoke`.
 *
 * Thin wrapper, deliberately separate from `mint-lighthouse-session.ts`, for
 * the reason `run-seed.ts` and `run-mint-lighthouse-session.ts` both give: this
 * file's body is top-level `await` ending in `process.exit(0)`, so any test
 * that imported it would write to a real database and kill its own worker.
 * `revokeLighthouseSessions` takes its `payload` as a parameter and is driven
 * directly by `mint-lighthouse-session.integration.test.ts`, against
 * `diary_test`.
 *
 * WHY THE PERFORMANCE RUN CALLS THIS AT ALL. Lighthouse copies its own
 * `configSettings` — `extraHeaders` among them — into every report it writes,
 * so the collector's `td-session=…` lands in `.lighthouseci/` and
 * `lhci-reports/` whatever the minting code does. Both are gitignored, but a
 * gitignore is a claim about what is committed, not about what is on disk or
 * about what somebody uploads as a CI artifact next month. Revoking the
 * sessions once the runs are done makes those copies authenticate nothing,
 * which is a property rather than a promise.
 *
 * IT PRINTS HOW MANY IT REVOKED AND NOTHING ELSE. Never an identifier: a
 * command whose output is a credential is the thing this file exists to stop
 * mattering.
 *
 * Invoked via `payload run scripts/run-revoke-lighthouse-session.ts` so
 * Payload's own `tsx`-based loader resolves the relative imports.
 * Depends on: `./mint-lighthouse-session`, `../lib/payload`.
 */
/* c8 ignore start -- CLI entry point: top-level await ending in process.exit(0), so no test can import it without writing to a real database and terminating its own worker. See this module's header, and `run-seed.ts`'s, for why exclude-and-regate is not available here. */
import { revokeLighthouseSessions } from './mint-lighthouse-session'
import { getPayload } from '../lib/payload'

const revoked = await revokeLighthouseSessions(await getPayload())
// eslint-disable-next-line no-console -- CLI feedback, and deliberately a count rather than anything that identifies a session.
console.log(`revoked ${String(revoked)} collector session(s)`)
process.exit(0)
/* c8 ignore stop */
