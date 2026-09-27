/**
 * storageBar.test.ts — SCREENS.md §2.9's 7px segmented bar and the line above
 * it, both of which are percentages of the QUOTA rather than of the used
 * total.
 * Depends on: vitest, ./storageBar.
 */
import { describe, expect, it } from 'vitest'
import { GIGABYTE, STORAGE_QUOTA_BYTES, storageLine, storageSegments } from './storageBar'

describe('storageSegments', () => {
  it('turns bytes into percentages of the quota, not of the used total', () => {
    // 29% and 12.2% of ONE HUNDRED, which is what SCREENS.md's example bar
    // shows. A version dividing by the used total draws a full bar at 1GB.
    const segments = storageSegments({ stills: 29, clips: 12.2 }, 100)

    expect(segments.find((segment) => segment.kind === 'stills')?.percent).toBeCloseTo(29)
    expect(segments.find((segment) => segment.kind === 'free')?.percent).toBeCloseTo(58.8)
  })

  it('never reports more than the whole bar when the quota is exceeded', () => {
    const segments = storageSegments({ stills: 90, clips: 40 }, 100)

    expect(segments.reduce((total, segment) => total + segment.percent, 0)).toBeCloseTo(100)
    expect(segments.find((segment) => segment.kind === 'free')?.percent).toBe(0)
  })

  it('scales an over-quota bar proportionally rather than filling stills first', () => {
    // THE CASE ABOVE DOES NOT PIN THIS, and the two answers are visibly
    // different bars. Summing to 100 with `free: 0` is satisfied by
    // fill-order truncation — stills 90, clips 10 — as well as by scaling,
    // and SCREENS.md §2.9 chooses neither. Scaling is chosen because the
    // legend beneath the bar claims the two swatches are the two kinds IN
    // PROPORTION; truncation would draw 40GB of clips as a tenth of the bar
    // while 90GB of stills took nine tenths, which is a lie about the smaller
    // one at exactly the moment the author is deciding what to delete.
    const segments = storageSegments({ stills: 90, clips: 40 }, 100)

    expect(segments.find((segment) => segment.kind === 'stills')?.percent).toBeCloseTo((90 / 130) * 100)
    expect(segments.find((segment) => segment.kind === 'clips')?.percent).toBeCloseTo((40 / 130) * 100)
  })

  it('leaves no free room at exactly the quota, which is the last value that is not over it', () => {
    // THE PERMITTED SIDE OF THE BOUNDARY. Everything fits, so nothing is
    // scaled: a version that scaled here as well would shrink a full bar.
    const segments = storageSegments({ stills: 60, clips: 40 }, 100)

    expect(segments.map((segment) => segment.percent)).toEqual([60, 40, 0])
  })

  it('still leaves free room one byte under the quota, so the boundary is off by nothing', () => {
    const segments = storageSegments({ stills: 60, clips: 39 }, 100)

    expect(segments.find((segment) => segment.kind === 'free')?.percent).toBeCloseTo(1)
  })

  it('moves the boundary with the quota it is given, so the number is not hard-coded past its own argument', () => {
    // The same library against two quotas. A module holding a literal
    // hundred passes every case above and fails this one.
    const half = storageSegments({ stills: 30, clips: 20 }, 100)
    const whole = storageSegments({ stills: 30, clips: 20 }, 50)

    expect(half.find((segment) => segment.kind === 'free')?.percent).toBeCloseTo(50)
    expect(whole.find((segment) => segment.kind === 'free')?.percent).toBe(0)
  })

  it('draws an empty library as an empty bar rather than dividing by nothing', () => {
    expect(storageSegments({ stills: 0, clips: 0 }, 100)).toEqual([
      { kind: 'stills', percent: 0 },
      { kind: 'clips', percent: 0 },
      { kind: 'free', percent: 100 },
    ])
  })

  it('draws an empty bar for an empty library against a quota of nothing, which is the only sum that works', () => {
    // The Task 13 review's F10. `used <= 0` answers before the quota is
    // consulted, so this is 100% free of nothing — and it is the only answer
    // that keeps the invariant: three widths summing to 0 is a gap the length
    // of the track. Unreachable while the quota is a constant; pinned so it is
    // a decision rather than a consequence of statement order.
    expect(storageSegments({ stills: 0, clips: 0 }, 0)).toEqual([
      { kind: 'stills', percent: 0 },
      { kind: 'clips', percent: 0 },
      { kind: 'free', percent: 100 },
    ])
  })

  it('still fills the bar for a library against a quota of nothing, which is every byte over it', () => {
    // The other side of the same corner: something against nothing is over
    // quota, so the two kinds scale against each other and nothing is free.
    expect(storageSegments({ stills: 3, clips: 1 }, 0)).toEqual([
      { kind: 'stills', percent: 75 },
      { kind: 'clips', percent: 25 },
      { kind: 'free', percent: 0 },
    ])
  })

  it('gives the three segments in the order the bar prints them', () => {
    expect(storageSegments({ stills: 1, clips: 2 }, 100).map((segment) => segment.kind)).toEqual([
      'stills',
      'clips',
      'free',
    ])
  })
})

describe('storageLine', () => {
  it('writes SCREENS.md §2.9’s own line, one decimal place of gigabytes against the quota', () => {
    expect(storageLine(41.2 * GIGABYTE, 100 * GIGABYTE)).toBe('41.2 GB of 100 GB')
  })

  it('writes a whole number of gigabytes without a trailing decimal', () => {
    expect(storageLine(2 * GIGABYTE, 100 * GIGABYTE)).toBe('2 GB of 100 GB')
  })

  it('rounds a library smaller than a tenth of a gigabyte to zero rather than printing bytes', () => {
    expect(storageLine(1_000_000, 100 * GIGABYTE)).toBe('0 GB of 100 GB')
  })
})

describe('STORAGE_QUOTA_BYTES', () => {
  it('is the hundred gigabytes SCREENS.md §2.9’s line names', () => {
    expect(STORAGE_QUOTA_BYTES).toBe(100 * GIGABYTE)
  })
})
