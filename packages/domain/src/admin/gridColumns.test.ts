/**
 * gridColumns.test.ts — the grid's track minimum, and both ends of the clamp.
 *
 * THE LITERALS ARE THE PROTOTYPE'S OWN ARITHMETIC, computed by hand from
 * `Math.round(1120 / cols)` — `Travel Diary Admin.dc.html` line 2187 — rather
 * than from the module's own constants, so a case cannot agree with a
 * `GRID_BASIS_PX` somebody changed. The two clamp cases that DO read the
 * constants are the ones asserting the boundary MOVES with them, which a
 * literal cannot say.
 * Depends on: vitest, ./gridColumns.
 */
import { describe, expect, it } from 'vitest'
import { DEFAULT_GRID_COLUMNS, MAX_GRID_COLUMNS, MIN_GRID_COLUMNS, gridMinimum } from './gridColumns'

describe('gridMinimum', () => {
  it('divides the basis by the column count and rounds, as the prototype does', () => {
    // 1120 / 6 = 186.666…, and the design rounds rather than floors. A floor
    // would answer 186 here, which is the one mutation this case exists for.
    expect(gridMinimum(6)).toBe(187)
  })

  it('answers the default the screen actually passes', () => {
    expect(gridMinimum(DEFAULT_GRID_COLUMNS)).toBe(187)
  })

  it('narrows the track as the columns grow', () => {
    // Two more points on the same curve, so the case above cannot be satisfied
    // by a function that returns 187 for everything inside the range.
    expect(gridMinimum(3)).toBe(373)
    expect(gridMinimum(8)).toBe(140)
  })

  // ═══ BOTH ENDS OF THE CLAMP, TWICE ═══
  //
  // Once against literals, which pin the value; once against the constants,
  // which pin that the LINE is where the constants put it. A clamp hard-coded
  // to 3 and 8 passes the first pair and fails the second the moment either
  // constant moves.

  it('clamps a column count below the range to the range floor', () => {
    expect(gridMinimum(2)).toBe(373)
    expect(gridMinimum(0)).toBe(373)
  })

  it('clamps a column count above the range to the range ceiling', () => {
    expect(gridMinimum(9)).toBe(140)
    expect(gridMinimum(99)).toBe(140)
  })

  it('puts the floor exactly where MIN_GRID_COLUMNS puts it', () => {
    expect(gridMinimum(MIN_GRID_COLUMNS - 1)).toBe(gridMinimum(MIN_GRID_COLUMNS))
    expect(gridMinimum(MIN_GRID_COLUMNS + 1)).not.toBe(gridMinimum(MIN_GRID_COLUMNS))
  })

  it('puts the ceiling exactly where MAX_GRID_COLUMNS puts it', () => {
    expect(gridMinimum(MAX_GRID_COLUMNS + 1)).toBe(gridMinimum(MAX_GRID_COLUMNS))
    expect(gridMinimum(MAX_GRID_COLUMNS - 1)).not.toBe(gridMinimum(MAX_GRID_COLUMNS))
  })
})
