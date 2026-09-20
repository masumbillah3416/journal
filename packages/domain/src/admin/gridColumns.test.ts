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
import {
  DEFAULT_GRID_COLUMNS,
  MAX_GRID_COLUMNS,
  MIN_GRID_COLUMNS,
  OVERSCAN_ROWS,
  VIRTUAL_THRESHOLD,
  VIRTUAL_WINDOW,
  gridMinimum,
  virtualWindow,
} from './gridColumns'

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

describe('virtualWindow', () => {
  /** A measured grid: six columns of 201px rows, which is the default layout. */
  const measured = { rowHeight: 201, columns: 6 }

  it('draws a grid the design’s own size whole, rather than windowing a hundred tiles', () => {
    expect(virtualWindow({ total: VIRTUAL_THRESHOLD, scrolledPast: 0, ...measured })).toEqual({
      start: 0,
      end: VIRTUAL_THRESHOLD,
    })
  })

  it('starts windowing one tile past the threshold', () => {
    // The other side of the threshold, so the case above pins a line rather
    // than a behaviour that happens to hold.
    const drawn = virtualWindow({ total: VIRTUAL_THRESHOLD + 1, scrolledPast: 0, ...measured })

    expect(drawn.end - drawn.start).toBeLessThanOrEqual(VIRTUAL_WINDOW)
    expect(drawn).toEqual({ start: 0, end: Math.min(VIRTUAL_THRESHOLD + 1, VIRTUAL_WINDOW) })
  })

  it('draws the same number of tiles for ten times as many rows', () => {
    // The whole of the DOM budget claim: the element count does not grow with
    // the row count. The two sides have different causes — one fixture has ten
    // times the rows of the other.
    const small = virtualWindow({ total: 120, scrolledPast: 0, ...measured })
    const large = virtualWindow({ total: 1_200, scrolledPast: 0, ...measured })

    expect(large.end - large.start).toBe(small.end - small.start)
  })

  it('moves the window down as the grid scrolls past the viewport', () => {
    // Twenty rows of 201px scrolled away, less two rows of overscan, is row
    // eighteen — and at six columns that is tile 108. Computed here from the
    // case's own inputs rather than read off the module.
    const scrolled = virtualWindow({ total: 1_200, scrolledPast: 20 * 201, ...measured })

    expect(scrolled.start).toBe((20 - OVERSCAN_ROWS) * 6)
    expect(scrolled.end).toBe((20 - OVERSCAN_ROWS) * 6 + VIRTUAL_WINDOW)
  })

  it('starts the window on a row boundary, never part-way along one', () => {
    // Half a row scrolled is still the same row: a window starting mid-row
    // would shift every tile after it one place to the left.
    const half = virtualWindow({ total: 1_200, scrolledPast: 20 * 201 + 100, ...measured })

    expect(half.start % measured.columns).toBe(0)
    expect(half.start).toBe(virtualWindow({ total: 1_200, scrolledPast: 20 * 201, ...measured }).start)
  })

  it('stops the window at the last full screenful, so the end of the grid is reachable', () => {
    const atTheBottom = virtualWindow({ total: 1_200, scrolledPast: 10_000 * 201, ...measured })

    expect(atTheBottom).toEqual({ start: 1_200 - VIRTUAL_WINDOW, end: 1_200 })
  })

  it('draws the first window when nothing has been measured, which is every render before layout', () => {
    // jsdom never measures anything, and neither does the first paint in a
    // browser. Both answers must be the top of the grid rather than an empty
    // one — a division by a zero row height would be NaN tiles.
    expect(virtualWindow({ total: 1_200, scrolledPast: 0, rowHeight: 0, columns: 6 })).toEqual({
      start: 0,
      end: VIRTUAL_WINDOW,
    })
    expect(virtualWindow({ total: 1_200, scrolledPast: 4_000, rowHeight: 201, columns: 0 })).toEqual({
      start: 0,
      end: VIRTUAL_WINDOW,
    })
  })

  it('treats a negative scroll as the top, because a rubber-banding browser reports one', () => {
    expect(virtualWindow({ total: 1_200, scrolledPast: -400, ...measured })).toEqual({ start: 0, end: VIRTUAL_WINDOW })
  })
})
