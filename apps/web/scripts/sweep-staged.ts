/**
 * sweep-staged — the body of `npm run media:sweep-staged`: what the scheduler
 * actually invokes, minus the two real dependencies.
 *
 * ═══ WHY THIS IS A FILE AND NOT THREE LINES IN `run-sweep-staged.ts` ═══
 *
 * The same reason `./rederive-media.ts` sits beside `./run-rederive.ts`: a CLI
 * entry point is top-level `await` ending in `process.exit`, so no test can
 * import one without sweeping a real store and killing its own Vitest worker.
 * Anything DECIDED there is decided where nothing measures it — and this
 * command has a decision worth measuring, because a scheduled job is judged by
 * its EXIT CODE. A sweep that could not list the store must exit non-zero, or
 * the platform's scheduler reports a green run while the un-stripped originals
 * accumulate (`docs/runbook.md`). That decision is here, with a case on both
 * sides; `./run-sweep-staged.ts` is the wiring.
 *
 * ═══ PATTERN (CLAUDE.md §3.3) ═══
 *
 * None of the seven. One function turning a `Result` into a line of text and a
 * status.
 *
 * INVARIANT — the message NAMES NO STORAGE KEY. A scheduler's log is not a
 * place to publish the store's own naming, which
 * `apps/web/lib/readGalleryDownload.ts` already refuses to enable; the count is
 * what an operator acts on.
 * Depends on: `SweepDeps` and `sweepStagedUploads` (../lib/media/sweepStagedUploads).
 */
import type { SweepDeps } from '../lib/media/sweepStagedUploads'
import { sweepStagedUploads } from '../lib/media/sweepStagedUploads'

/** What the command tells its scheduler. */
export interface SweepReport {
  /** The one line printed to stdout. Never a storage key; see the header. */
  readonly message: string
  /** `0` when the sweep ran, `1` when it could not — what the scheduler judges. */
  readonly exitCode: 0 | 1
}

/**
 * Runs the staged-upload sweep and says what to print and what to exit with.
 *
 * @param deps - See `SweepDeps` — the store to walk.
 * @param now - The clock reading, injected (CLAUDE.md §2.3) so the window is a
 *   fact of the call. `./run-sweep-staged.ts` passes `Date.now()`.
 * @returns The line to print and the status to exit with.
 * @example
 * const report = await sweepStaged({ storage: createLocalStorage(MEDIA_DIR) }, Date.now())
 */
export const sweepStaged = async (deps: SweepDeps, now: number): Promise<SweepReport> => {
  const swept = await sweepStagedUploads(deps, now)
  if (!swept.ok) {
    return { message: `The staged-upload sweep did not run: ${swept.error}`, exitCode: 1 }
  }

  return {
    message: `Swept ${String(swept.value.length)} abandoned staged upload(s).`,
    exitCode: 0,
  }
}
