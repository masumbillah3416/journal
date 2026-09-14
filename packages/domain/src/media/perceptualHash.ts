/**
 * media/perceptualHash — the difference hash of a still, and the distance at
 * which two stills are the same photograph.
 *
 * Step 6 of the ingest pipeline. A still is reduced to a 9x8 grayscale grid
 * by the encoder at the edge, and everything here is a pure function of that
 * grid: no image library, no I/O, no clock.
 *
 * ═══ WHY A DIFFERENCE HASH, AND WHY NO INDEX ═══
 *
 * The comparison this feeds (Task 8's duplicate detection) is between the
 * stills of ONE journey, keyed by journey id — CLAUDE.md §7's first rule, and
 * the reason the answer is never "is this file anywhere in the library". At
 * roughly a hundred rows a journey, a linear scan over 64-bit hashes is one
 * query's worth of work, so no index and no stored average are earned
 * (CLAUDE.md §4). Task 13 of this phase is where that choice is written up as
 * ADR 0022; until then this header is the whole of the reasoning.
 *
 * A difference hash rather than an average hash because it keys on the SIGN
 * of each horizontal step rather than on absolute brightness, so it survives
 * the re-encode, the resize and the quality change the pipeline itself
 * performs — which is exactly the "duplicate" the reader will actually hit,
 * the same photograph uploaded twice through different paths.
 *
 * ═══ INVARIANTS A FUTURE EDIT COULD BREAK ═══
 *
 *   - **{@link DHASH_WIDTH} IS NINE BECAUSE EIGHT COMPARISONS NEED NINE
 *     SAMPLES.** Each row contributes one bit per adjacent pair, so a row of
 *     8 samples yields 7 bits and the hash silently becomes 56 bits wide —
 *     a weaker comparison that still returns hex and still passes a shape
 *     assertion. The grid is not square, and that is not a typo.
 *   - **A SAMPLE IS COMPARED ONLY WITH THE ONE ON ITS RIGHT, NEVER ACROSS A
 *     ROW BOUNDARY.** The grid arrives row-major and flat; comparing
 *     `grayscale[8]` with `grayscale[9]` would compare the end of one row
 *     with the start of the next, which is not a horizontal step in the
 *     image at all.
 *   - **THE FIRST COMPARISON OF THE FIRST ROW IS THE MOST SIGNIFICANT BIT.**
 *     Two implementations that disagree about this produce hashes that
 *     compare fine against themselves and never against each other, so a
 *     stored hash outlives the code that wrote it only while this holds.
 *   - **A FLAT IMAGE, AND ANY ROW THAT ONLY EVER BRIGHTENS RIGHTWARD, HASH
 *     TO ALL ZEROES.** Not a defect — the sign of the difference is the whole
 *     signal — but it is why no test fixture here is a flat colour or a
 *     gradient, and why one that was would compare two identical constants
 *     and pass against any implementation at all.
 *
 * ═══ PATTERN (CLAUDE.md §3.3) ═══
 *
 * The Result type, for both fallible functions: a grid of the wrong size and
 * a malformed hash are values a caller must handle, not exceptions. Nothing
 * else — three pure functions over numbers and strings need no more.
 *
 * Depends on: ../result.
 */
import { type Result, err, ok } from '../result'

/**
 * Samples across each row of the grid the hash is taken from.
 *
 * NINE, NOT EIGHT: eight comparisons need nine samples. See this module's
 * invariants — an eight-wide grid yields a silently narrower hash.
 */
export const DHASH_WIDTH = 9

/** Rows in the grid, one byte of the hash each. */
export const DHASH_HEIGHT = 8

/**
 * The largest number of differing bits, out of sixty-four, at which two
 * stills are still treated as the same photograph.
 *
 * Five, and inclusive.
 *
 * WHAT WAS MEASURED, through the real `inline` processor over generated
 * fixtures (Phase 3 Task 6, reproduced in its review): every
 * same-photograph pair sat at **0** - quality 92 to 55, a re-encode of the
 * encoded file, a 92/40/20/10 chain, a downsize to 400x300 and back, a
 * JPEG/WebP/JPEG round trip, the same pixels delivered as a PNG, and one
 * copy carrying GPS and EXIF. Two DIFFERENT generated photographs sat at
 * **30**. So the distance a real re-encode produces is nowhere near five,
 * and the gap on the other side is six times it.
 *
 * WHAT WAS NOT MEASURED, and is therefore judgement rather than
 * observation: the collision direction. Every pair above is synthetic, and
 * no two genuinely similar photographs - the same scene a second apart, two
 * frames of one burst - have been put through this. "Two different
 * photographs of the same scene do not come this close" is what five rests
 * on and it is untested; raising it would start merging distinct frames of
 * a burst, which is a worse failure than storing one file twice, and that
 * is the direction to measure first if a real library ever justifies moving
 * the number.
 */
export const DUPLICATE_MAX_DISTANCE = 5

/** How many samples {@link dHash} requires: every cell of the grid. */
const SAMPLE_COUNT = DHASH_WIDTH * DHASH_HEIGHT

/** A hash as {@link dHash} renders it: sixteen lowercase hex characters. */
const HASH_SHAPE = /^[0-9a-f]{16}$/

/**
 * The grid split into its rows, so no comparison can straddle a row boundary.
 * @param grayscale - Exactly {@link SAMPLE_COUNT} samples, row-major.
 * @returns {@link DHASH_HEIGHT} rows of {@link DHASH_WIDTH} samples.
 */
const rowsOf = (grayscale: readonly number[]): readonly (readonly number[])[] =>
  Array.from({ length: DHASH_HEIGHT }, (_unused, row) =>
    grayscale.slice(row * DHASH_WIDTH, row * DHASH_WIDTH + DHASH_WIDTH),
  )

/**
 * One row's byte: a bit per adjacent pair, set where the left sample is
 * brighter, the leftmost pair most significant.
 *
 * Folded rather than indexed, so the row's own length is what bounds the
 * walk and there is no index to read past the end of.
 * @param row - {@link DHASH_WIDTH} samples from one row of the grid.
 * @returns A number in 0-255.
 */
const byteOfRow = (row: readonly number[]): number =>
  row.reduce<{ readonly bits: number; readonly previous: number | undefined }>(
    (carried, sample) => ({
      bits: carried.previous === undefined ? carried.bits : carried.bits * 2 + (carried.previous > sample ? 1 : 0),
      previous: sample,
    }),
    { bits: 0, previous: undefined },
  ).bits

/**
 * The difference hash of a grayscale grid.
 * @param grayscale - Exactly {@link SAMPLE_COUNT} brightness samples,
 *   row-major, {@link DHASH_WIDTH} to a row. Any numeric range will do: only
 *   the sign of the difference between neighbours is read.
 * @returns Sixteen lowercase hex characters, or an error naming how many
 *   samples were wanted when the grid is the wrong size.
 * @example
 * dHash(grid) // { ok: true, value: 'aaaaaaaaaaaaaaaa' }
 */
export const dHash = (grayscale: readonly number[]): Result<string, string> => {
  if (grayscale.length !== SAMPLE_COUNT) {
    return err(`a difference hash needs exactly ${String(SAMPLE_COUNT)} samples, not ${String(grayscale.length)}`)
  }

  return ok(
    rowsOf(grayscale)
      .map((row) => byteOfRow(row).toString(16).padStart(2, '0'))
      .join(''),
  )
}

/**
 * How many of the sixty-four bits two hashes disagree on.
 * @param left - A hash as {@link dHash} renders it.
 * @param right - The hash to compare it with.
 * @returns The count, 0 to 64, or an error naming which side was malformed.
 *   A hash of the wrong length or carrying anything but lowercase hex is
 *   refused rather than compared as a prefix, because a prefix comparison
 *   would answer a small distance about hashes that share nothing.
 * @example
 * hammingDistance('0000000000000000', '000000000000001f') // { ok: true, value: 5 }
 */
export const hammingDistance = (left: string, right: string): Result<number, string> => {
  if (!HASH_SHAPE.test(left)) return err('the hash on the left is not sixteen lowercase hex characters')
  if (!HASH_SHAPE.test(right)) return err('the hash on the right is not sixteen lowercase hex characters')

  let differing = BigInt(`0x${left}`) ^ BigInt(`0x${right}`)
  let count = 0
  while (differing !== 0n) {
    count += Number(differing & 1n)
    differing >>= 1n
  }

  return ok(count)
}

/**
 * Whether two hashes are close enough to be the same photograph.
 * @param left - A hash as {@link dHash} renders it.
 * @param right - The hash to compare it with.
 * @returns True at or below {@link DUPLICATE_MAX_DISTANCE} differing bits.
 *   A malformed hash is not a duplicate of anything, which is the fail-safe
 *   direction: the caller stores the upload rather than discarding it as a
 *   copy of something it cannot actually be compared with.
 * @example
 * isPerceptualDuplicate(stored, uploaded) // true
 */
export const isPerceptualDuplicate = (left: string, right: string): boolean => {
  const measured = hammingDistance(left, right)

  return measured.ok && measured.value <= DUPLICATE_MAX_DISTANCE
}
