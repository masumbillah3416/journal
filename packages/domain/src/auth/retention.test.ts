/**
 * retention.test.ts — the sweep size is large enough to be a bound.
 *
 * Unit test (CLAUDE.md §2): one constant and one predicate, no I/O.
 *
 * ═══ WHY THE CASE THAT MATTERS IS NOT `toBe(50)` ═══
 *
 * A case asserting the literal proves the number has not been edited, which is
 * what git already says. What the number has to BE is bigger than any budget a
 * single key can spend before its rows age out — otherwise a burst adds rows
 * faster than the sweep removes them and the table is unbounded again, quietly.
 * So the case below reads the REAL budgets out of the modules that define them
 * and asserts the relation, which is what fails if `HOURLY_RESEND_CAP` is ever
 * raised to sixty.
 *
 * Depends on: vitest, ./otpChallenge, ./rateWindow, ./retention.
 */
import { describe, expect, it } from 'vitest'
import { HOURLY_RESEND_CAP, MAX_ATTEMPTS } from './otpChallenge'
import { ACCOUNT_CODE_ATTEMPT_LIMIT, ADDRESS_PASSWORD_ATTEMPT_LIMIT, IP_ATTEMPT_LIMIT } from './rateWindow'
import { PRUNE_SWEEP_ROWS, retentionSweepDrainsFasterThanItFills } from './retention'

describe('the cross-key prune sweep', () => {
  it('clears more rows per write than any one key is allowed to add', () => {
    // Read from the modules that own them, never restated here: a copy would
    // keep passing after the original moved.
    const budgets = [
      HOURLY_RESEND_CAP,
      MAX_ATTEMPTS,
      IP_ATTEMPT_LIMIT,
      ACCOUNT_CODE_ATTEMPT_LIMIT,
      ADDRESS_PASSWORD_ATTEMPT_LIMIT,
    ]

    expect(retentionSweepDrainsFasterThanItFills(budgets)).toBe(true)
  })

  it('answers false for a budget that would outrun it, so the check can say no', () => {
    // A predicate that returned `true` for everything would pass the case
    // above having checked nothing.
    expect(retentionSweepDrainsFasterThanItFills([PRUNE_SWEEP_ROWS])).toBe(false)
    expect(retentionSweepDrainsFasterThanItFills([PRUNE_SWEEP_ROWS + 1])).toBe(false)
  })

  it('is a whole number of rows, because it is a SQL `LIMIT`', () => {
    expect(Number.isInteger(PRUNE_SWEEP_ROWS)).toBe(true)
    expect(PRUNE_SWEEP_ROWS).toBeGreaterThan(0)
  })
})
