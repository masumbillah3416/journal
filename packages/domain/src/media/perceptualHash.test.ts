/**
 * perceptualHash.test.ts — the cases that hold the difference hash and the
 * duplicate threshold in place.
 *
 * ═══ WHY EVERY FIXTURE HERE HAS STRUCTURE, AND NONE IS A FLAT COLOUR ═══
 *
 * A flat image dHashes to all zeroes, because no sample in it is brighter
 * than the one to its right. So do a monotonically rising gradient and a
 * monotonically falling one, for the same reason in one direction and its
 * mirror in the other. The plan this task came from caught itself building
 * its photograph fixtures out of flat `sharp` `create` calls, which would
 * have made every duplicate case a comparison between two copies of
 * `'0000000000000000'` — passing against any implementation whatsoever,
 * including one that ignored its argument. Mutation testing cannot find that
 * class of defect, because mutation perturbs the code and never the fixture.
 *
 * Every grid below is therefore built from a function of its coordinates that
 * alternates or steps, and the hash each one produces is HAND-DERIVED in the
 * comment beside it and pinned as a literal. Two of those literals — `aa` per
 * row and `08` per row — are also asserted to be neither all zeroes nor all
 * ones, in a case of their own, so a future edit cannot quietly turn the
 * fixtures degenerate and leave the duplicate cases comparing constants.
 *
 * ═══ WHY THE THRESHOLD IS PINNED AS A LITERAL, ON BOTH SIDES ═══
 *
 * Comparing a measured distance to {@link DUPLICATE_MAX_DISTANCE} cannot
 * fail: the assertion moves with the constant it is supposed to hold still.
 * The two boundary cases below name `5` and `6` as literals instead, and they
 * are two cases rather than one, because "the last distance that still counts
 * as a duplicate" and "the first that does not" are two behaviours and this
 * repository has three times shipped the first of them untested.
 *
 * PATTERNS (CLAUDE.md §3.3): the Factory pattern for the grids — each is a
 * function returning a fresh array, with the coordinate function passed in.
 *
 * Depends on: vitest and ./perceptualHash.
 */
import { describe, expect, it } from 'vitest'
import {
  DHASH_HEIGHT,
  DHASH_WIDTH,
  DUPLICATE_MAX_DISTANCE,
  dHash,
  hammingDistance,
  isPerceptualDuplicate,
} from './perceptualHash'

/**
 * A 9x8 grid, row-major, built from a function of its coordinates.
 * @param sample - The brightness at a column and row, 0-255.
 * @returns A fresh grid of `DHASH_WIDTH * DHASH_HEIGHT` samples.
 */
const aGrid = (sample: (x: number, y: number) => number): readonly number[] =>
  Array.from({ length: DHASH_WIDTH * DHASH_HEIGHT }, (_unused, index) =>
    sample(index % DHASH_WIDTH, Math.floor(index / DHASH_WIDTH)),
  )

/** Bright, dark, bright, dark across every row: `200 100 200 100 …`. */
const alternatingColumns = (x: number): number => (x % 2 === 0 ? 200 : 100)

/**
 * The alternating grid's hash, derived by hand.
 *
 * Each row reads `200 100 200 100 200 100 200 100 200`, so its eight
 * comparisons are `1 0 1 0 1 0 1 0` — `0xaa` — and all eight rows are alike.
 */
const ALTERNATING = 'aaaaaaaaaaaaaaaa'

/** The same grid shifted one column: `100 200 100 …`, so every bit inverts. */
const ALTERNATING_MIRRORED = '5555555555555555'

/**
 * The alternating grid with the very first sample darkened to 50, which
 * inverts exactly one comparison.
 *
 * Row 0 becomes `50 100 200 100 200 100 200 100 200`: its first comparison
 * turns from `200 > 100` into `50 > 100`, a 1 to a 0, and nothing else moves
 * because no comparison reads a sample to the left of column 0. So row 0 is
 * `0 0 1 0 1 0 1 0` — `0x2a` — and rows 1 to 7 stay `0xaa`.
 */
const ALTERNATING_ONE_SAMPLE_DARKER = '2aaaaaaaaaaaaaaa'

/**
 * A grid bright in its first five columns and dark in the last four, and the
 * hash that follows.
 *
 * Each row reads `200 200 200 200 200 100 100 100 100`, so only the fifth
 * comparison finds a sample brighter than its right neighbour: the row is
 * `0 0 0 0 1 0 0 0` — `0x08`.
 */
const twoBandColumns = (x: number): number => (x < 5 ? 200 : 100)
const TWO_BAND = '0808080808080808'

/** A hash of all zeroes, which is what a flat image produces. */
const ALL_ZEROES = '0'.repeat(16)

/** A hash of all ones, the complement of that. */
const ALL_ONES = 'f'.repeat(16)

describe('the dHash geometry', () => {
  it('samples nine columns a row, because eight comparisons need nine samples', () => {
    expect(DHASH_WIDTH).toBe(9)
  })

  it('samples eight rows, one byte of the hash each', () => {
    expect(DHASH_HEIGHT).toBe(8)
  })

  it('treats up to five differing bits of sixty-four as the same photograph', () => {
    expect(DUPLICATE_MAX_DISTANCE).toBe(5)
  })
})

describe('dHash', () => {
  it('returns sixteen hex characters, which is sixty-four bits', () => {
    const hashed = dHash(aGrid(alternatingColumns))

    // Two assertions for one behaviour, deliberately: a shape assertion that
    // did not first insist the hash EXISTS would read as green against a
    // refusal, which is the shape seventeen tests in this repository were
    // found passing with.
    expect(hashed.ok).toBe(true)
    expect(hashed.ok ? hashed.value : '').toMatch(/^[0-9a-f]{16}$/)
  })

  it('sets a bit wherever a sample is brighter than the neighbour on its right', () => {
    expect(dHash(aGrid(alternatingColumns))).toEqual({ ok: true, value: ALTERNATING })
  })

  it('places that bit at the column the comparison was made in', () => {
    expect(dHash(aGrid(twoBandColumns))).toEqual({ ok: true, value: TWO_BAND })
  })

  it('gives a flat image a hash of all zeroes, because no pixel is brighter than its neighbour', () => {
    expect(dHash(aGrid(() => 128))).toEqual({ ok: true, value: ALL_ZEROES })
  })

  it('gives a rising gradient that same hash, because each sample is darker than its right neighbour', () => {
    // Recorded rather than treated as a defect: dHash keys on the sign of the
    // horizontal difference and nothing else, so a row that only ever
    // brightens rightward carries no information at all. It is why no fixture
    // here is a gradient, and why the two structured grids above exist.
    expect(dHash(aGrid((x) => x * 20))).toEqual({ ok: true, value: ALL_ZEROES })
  })

  it('gives the structured fixtures a hash that is neither all zeroes nor all ones', () => {
    const structured = [dHash(aGrid(alternatingColumns)), dHash(aGrid(twoBandColumns))]

    expect(structured).toEqual([
      { ok: true, value: ALTERNATING },
      { ok: true, value: TWO_BAND },
    ])
    expect(structured.map((hashed) => hashed.ok && (hashed.value === ALL_ZEROES || hashed.value === ALL_ONES))).toEqual(
      [false, false],
    )
  })

  it('gives the same grid the same hash twice, so a re-upload is detectable', () => {
    const grid = aGrid(alternatingColumns)

    expect(dHash(grid)).toEqual(dHash(grid))
  })

  it('gives a mirrored image a different hash, because every comparison reverses', () => {
    expect(dHash(aGrid((x) => alternatingColumns(x + 1)))).toEqual({ ok: true, value: ALTERNATING_MIRRORED })
  })

  it('gives two visibly different images two different hashes', () => {
    expect(dHash(aGrid(alternatingColumns))).not.toEqual(dHash(aGrid(twoBandColumns)))
  })

  it('moves only the first byte when only the first row changes', () => {
    const darkened = aGrid((x, y) => (x === 0 && y === 0 ? 50 : alternatingColumns(x)))

    expect(dHash(darkened)).toEqual({ ok: true, value: ALTERNATING_ONE_SAMPLE_DARKER })
  })

  it('refuses a grid of the wrong size rather than hashing part of it', () => {
    expect(dHash([1, 2, 3]).ok).toBe(false)
  })

  it('refuses a grid one sample short of a full row, which would hash to fewer bits', () => {
    expect(dHash(aGrid(alternatingColumns).slice(0, DHASH_WIDTH * DHASH_HEIGHT - 1)).ok).toBe(false)
  })

  it('refuses a grid one sample longer than the grid, rather than hashing its first seventy-two', () => {
    // The mutation that found this case absent turned the size check from
    // `!==` into `<`, and every other case here still passed: an over-long
    // grid would have been hashed on its first seventy-two samples and
    // answered a hash of the right shape about the wrong geometry.
    expect(dHash([...aGrid(alternatingColumns), 200]).ok).toBe(false)
  })

  it('refuses an empty grid', () => {
    expect(dHash([]).ok).toBe(false)
  })

  it('says how many samples it wanted when it refuses one', () => {
    const refused = dHash([])

    expect(refused.ok).toBe(false)
    expect(refused.ok ? '' : refused.error).toContain('72')
  })
})

describe('hammingDistance', () => {
  it('is zero between a hash and itself', () => {
    expect(hammingDistance('0f0f0f0f0f0f0f0f', '0f0f0f0f0f0f0f0f')).toEqual({ ok: true, value: 0 })
  })

  it('counts every differing bit, not every differing character', () => {
    // 0x0 against 0xf is four bits, in one character.
    expect(hammingDistance(ALL_ZEROES, '000000000000000f')).toEqual({ ok: true, value: 4 })
  })

  it('counts sixty-four bits between a hash and its complement', () => {
    expect(hammingDistance(ALTERNATING, ALTERNATING_MIRRORED)).toEqual({ ok: true, value: 64 })
  })

  it('counts five bits, the last distance that still counts as a duplicate', () => {
    expect(hammingDistance(ALL_ZEROES, '000000000000001f')).toEqual({ ok: true, value: 5 })
  })

  it('counts six bits, the first distance that does not', () => {
    expect(hammingDistance(ALL_ZEROES, '000000000000003f')).toEqual({ ok: true, value: 6 })
  })

  it('counts one bit between a photograph and the same photograph with one sample darkened', () => {
    expect(hammingDistance(ALTERNATING, ALTERNATING_ONE_SAMPLE_DARKER)).toEqual({ ok: true, value: 1 })
  })

  it('counts twenty-four bits between two visibly different photographs', () => {
    expect(hammingDistance(ALTERNATING, TWO_BAND)).toEqual({ ok: true, value: 24 })
  })

  it('refuses a hash that is not sixteen characters, rather than comparing a prefix', () => {
    expect(hammingDistance('0f0f', '0f0f0f0f0f0f0f0f').ok).toBe(false)
  })

  it('refuses a hash that is too long as readily as one that is too short', () => {
    expect(hammingDistance('0f0f0f0f0f0f0f0f0', '0f0f0f0f0f0f0f0f').ok).toBe(false)
  })

  it('refuses a hash carrying anything but hex', () => {
    expect(hammingDistance('zzzzzzzzzzzzzzzz', ALL_ZEROES).ok).toBe(false)
  })

  it('refuses an uppercase hash, because a dHash is written in lowercase', () => {
    expect(hammingDistance('AAAAAAAAAAAAAAAA', ALL_ZEROES).ok).toBe(false)
  })

  it('checks the hash on its right as well as the one on its left', () => {
    expect(hammingDistance(ALL_ZEROES, 'nope').ok).toBe(false)
  })
})

describe('isPerceptualDuplicate', () => {
  it('calls a hash a duplicate of itself', () => {
    expect(isPerceptualDuplicate('0f0f0f0f0f0f0f0f', '0f0f0f0f0f0f0f0f')).toBe(true)
  })

  it('accepts a difference of five bits, so a re-encode still matches', () => {
    expect(isPerceptualDuplicate(ALL_ZEROES, '000000000000001f')).toBe(true)
  })

  it('refuses a difference of six bits, one past the last that counts', () => {
    expect(isPerceptualDuplicate(ALL_ZEROES, '000000000000003f')).toBe(false)
  })

  it('calls a photograph with one sample darkened a duplicate of the original', () => {
    expect(isPerceptualDuplicate(ALTERNATING, ALTERNATING_ONE_SAMPLE_DARKER)).toBe(true)
  })

  it('refuses two visibly different photographs', () => {
    expect(isPerceptualDuplicate(ALTERNATING, TWO_BAND)).toBe(false)
  })

  it('is false rather than throwing when the left hash is malformed', () => {
    expect(isPerceptualDuplicate('nope', ALL_ZEROES)).toBe(false)
  })

  it('is false rather than throwing when the RIGHT hash is malformed, which is the mirror of the case above', () => {
    // BOTH SIDES, because a predicate that guarded one and not the other
    // would pass the case above and throw in production on the argument that
    // came from the database rather than from the pipeline. The older name
    // said "either hash" over an assertion that malformed only the left.
    expect(isPerceptualDuplicate(ALL_ZEROES, 'nope')).toBe(false)
  })
})
