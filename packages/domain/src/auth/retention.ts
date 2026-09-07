/**
 * retention — how the three sign-in tables stay bounded without a scheduler.
 *
 * `otp_challenges`, `sessions` and `sign_in_attempts` all grow with traffic
 * and none of them is ever read once its rows are dead. Something has to
 * remove them, and this module holds the one number that says how much each
 * write removes.
 *
 * ═══ WHY A SWEEP AND NOT A SCHEDULED JOB ═══
 *
 * Phase 0's queue exists, so a nightly `DELETE` was the other option. It was
 * not taken, for the reason ADR 0016 records for `sign_in_attempts` and which
 * applies identically to the other two: a table whose growth is bounded only
 * while a scheduler is up has an availability dependency it does not need, and
 * the failure is silent — nothing is broken until the disk is full. A sweep
 * that rides along with each write cannot be "not running".
 *
 * ═══ WHY THE SWEEP IS CROSS-KEY, WHICH IS THE HALF THAT WAS MISSED ═══
 *
 * Pruning only the rows belonging to the key being written bounds a table by
 * the number of DISTINCT KEYS ever seen, not by the retention window: a key
 * seen once and never again leaves its rows behind for good. `rateLimit.ts`
 * shipped exactly that and claimed to be bounded; ruling F33 required the
 * claim to become true rather than be reworded, and this is the shape it
 * became. `otp_challenges` and `sessions` were left with no cleanup at all in
 * the same phase, under a comment asserting a purge query that was never
 * written (ruling F14, corrected by Phase 2's final review as blocker B4).
 *
 * PATTERNS (CLAUDE.md §3.3). None of the seven. It is one number and the
 * reasoning that fixes it; naming a pattern here would be decoration.
 *
 * Depends on: nothing.
 */

/**
 * How many aged rows belonging to OTHER keys each write also clears.
 *
 * ONE NUMBER FOR THREE TABLES, deliberately: it is a single policy — "each
 * write pays for a bounded batch of somebody else's rubbish" — and three
 * copies of it under three names is how a policy drifts into three policies
 * nobody decided on.
 *
 * Fifty, and the two bounds it sits between are what make it a choice rather
 * than a round number:
 *
 *   - **Above** the number of rows one burst of traffic can add before any of
 *     them age out. Every per-request budget in this surface is smaller than
 *     this — `retentionSweepDrainsFasterThanItFills` is the case that holds
 *     that true as those budgets change — so the sweep drains faster than
 *     ordinary traffic fills, which is what "eventually complete" means here.
 *   - **Below** the size at which the extra `DELETE` stops being a few
 *     indexed rows and becomes a scan a reader waits on. The sweep runs on the
 *     request path, so its cost is a reader's cost.
 */
export const PRUNE_SWEEP_ROWS = 50

/**
 * Whether one write's sweep clears more than that write's own traffic can add.
 *
 * The property {@link PRUNE_SWEEP_ROWS} has to have, stated as a function so a
 * test can assert it against the real per-request budgets rather than against
 * a number copied into an expectation. If a limit is ever raised past the
 * sweep, this returns `false` and the table stops being bounded — quietly,
 * which is why it is checked rather than reasoned about.
 *
 * @param budgets - Every per-request row budget in the sign-in surface: the
 *   most rows a single key can add to any of the three tables before its
 *   oldest ones age out.
 * @returns `true` while the sweep is strictly larger than the largest of them.
 * @example
 * retentionSweepDrainsFasterThanItFills([5, 10, 20]) // true
 */
export const retentionSweepDrainsFasterThanItFills = (budgets: readonly number[]): boolean =>
  budgets.every((budget) => budget < PRUNE_SWEEP_ROWS)
