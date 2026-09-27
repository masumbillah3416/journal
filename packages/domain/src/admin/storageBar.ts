/**
 * storageBar — SCREENS.md §2.9's "Space used": the line "41.2 GB of 100 GB"
 * and the 7px segmented bar beneath it.
 *
 * ═══ THE FIGURES ARE DERIVED, WHICH IS A DATA-MODEL RULE ═══
 *
 * `DATA_MODEL.md` lists "Storage quota — sum `filesize` grouped by `kind`"
 * under **Derived, not stored**, so nothing in this schema holds a total.
 * `readSettingsScreen.ts` asks Postgres for the two sums; this module only
 * decides what the bar SAYS about them.
 *
 * ═══ PERCENTAGES OF THE QUOTA, NEVER OF THE USED TOTAL ═══
 *
 * §2.9's example bar is 29% photographs and 12.2% clips, of ONE HUNDRED
 * gigabytes — not of the 41.2 GB actually held. A version dividing by the
 * used total draws a full bar for a diary holding one photograph, which is
 * the opposite of what a quota bar is for.
 *
 * ═══ OVER QUOTA, THE BAR SCALES PROPORTIONALLY. §2.9 DOES NOT SAY ═══
 *
 * The design gives one bar, under quota, and no rule for a library that has
 * outgrown it. Two answers fit "the segments fill the whole bar": scale both
 * kinds by the used total, or fill in order and truncate whatever is left.
 * They are visibly different bars, so this is a decision rather than an
 * implementation detail, and it is taken here: SCALE. The legend beneath the
 * bar names the two kinds, so a reader takes the two widths as the two kinds
 * in proportion; truncation would draw 40GB of clips as a tenth of the bar
 * while 90GB of stills took nine tenths — a lie about the smaller one at
 * exactly the moment the author is deciding what to delete.
 * `storageBar.test.ts` pins the choice with a case that fails under the other
 * one. `docs/deviations.md` §99 records it.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. Two pure functions over three
 * numbers.
 *
 * INVARIANT — the three percentages always sum to 100, at every input,
 * including an empty library and one twice its quota. The bar is drawn as
 * three widths in a row, so anything else leaves a gap or overflows the
 * track.
 *
 * THAT INCLUDES A QUOTA OF ZERO, and the answer there is worth stating because
 * it reads oddly: an empty library against a zero quota draws `free: 100` —
 * 100% free of nothing. The Task 13 review noticed it. It is the only answer
 * that keeps the invariant: `free: 0` with nothing used sums to 0, and a bar
 * whose three widths sum to 0 is a gap the length of the track. Unreachable
 * today, because {@link STORAGE_QUOTA_BYTES} is a constant, and pinned by a
 * case so it is a decision rather than a consequence of statement order.
 * Depends on: nothing.
 */

/** One gigabyte, decimal — the unit SCREENS.md §2.9's line is written in. */
export const GIGABYTE = 1_000_000_000

/**
 * How much the diary is allowed to hold, in bytes.
 *
 * A CHOSEN CONSTANT, AND NOTHING DERIVES IT. §2.9 prints "of 100 GB" and
 * `DATA_MODEL.md` records no quota column, no plan and no provider, so this
 * is the design's own number written down once rather than typed into the
 * screen. Both sides of it are pinned by cases built from this constant
 * ({@link storageSegments}), so the boundary follows it wherever it moves.
 */
export const STORAGE_QUOTA_BYTES = 100 * GIGABYTE

/** Which part of the bar a segment is. */
export type StorageKind = 'stills' | 'clips' | 'free'

/** One segment of §2.9's 7px bar. */
export interface StorageSegment {
  /** Photographs, clips, or the track showing what is left. */
  readonly kind: StorageKind
  /** Its width, as a percentage of the whole bar. */
  readonly percent: number
}

/** What the library holds, by kind, in the same unit as the quota. */
export interface StorageByKind {
  /** Every photograph. */
  readonly stills: number
  /** Every clip. */
  readonly clips: number
}

/**
 * The three widths SCREENS.md §2.9's bar is drawn from.
 *
 * @param byKind - What the library holds, by kind, in the same unit as
 *   `quota` — bytes, from `readSettingsScreen`.
 * @param quota - How much it is allowed to hold. See
 *   {@link STORAGE_QUOTA_BYTES}.
 * @returns Photographs, clips and what is free, in the order the bar prints
 *   them, summing to 100 at every input.
 * @example
 * storageSegments({ stills: 29, clips: 12.2 }, 100)
 * // [{ kind: 'stills', percent: 29 }, { kind: 'clips', percent: 12.2 }, { kind: 'free', percent: 58.8 }]
 */
export const storageSegments = (byKind: StorageByKind, quota: number): readonly StorageSegment[] => {
  const used = byKind.stills + byKind.clips
  // AN EMPTY LIBRARY IS AN EMPTY BAR, not a division by nothing. `used` is
  // the divisor whenever it exceeds the quota, so it is the one value that
  // can be zero here — and a quota of zero with nothing in it is the state a
  // fresh install is in.
  if (used <= 0) {
    return [
      { kind: 'stills', percent: 0 },
      { kind: 'clips', percent: 0 },
      { kind: 'free', percent: 100 },
    ]
  }

  // OVER QUOTA, THE USED TOTAL IS THE DIVISOR, which is what scales both
  // kinds proportionally and leaves nothing free.
  if (used > quota) {
    const stills = (byKind.stills / used) * 100
    return [
      { kind: 'stills', percent: stills },
      // DERIVED BY SUBTRACTION, not divided a second time, so the widths sum
      // to exactly 100 rather than to 100 plus whatever the floating-point
      // arithmetic left over. `free` is then a literal zero rather than
      // 3.5e-15, which is a segment a browser still lays out.
      { kind: 'clips', percent: 100 - stills },
      { kind: 'free', percent: 0 },
    ]
  }

  // AT OR UNDER THE QUOTA the quota is the divisor, so a full bar at exactly
  // the quota is not shrunk and a nearly-empty one is not stretched.
  const stills = (byKind.stills / quota) * 100
  const clips = (byKind.clips / quota) * 100

  return [
    { kind: 'stills', percent: stills },
    { kind: 'clips', percent: clips },
    { kind: 'free', percent: 100 - stills - clips },
  ]
}

/**
 * One number of gigabytes, written the way §2.9's line writes it.
 *
 * At most one decimal place, and none at all when the tenth is zero — the
 * design prints "41.2 GB" and "100 GB", not "100.0 GB".
 * @param bytes - The figure.
 * @returns The gigabytes, as a string with no unit on it.
 */
const gigabytes = (bytes: number): string => String(Math.round((bytes / GIGABYTE) * 10) / 10)

/**
 * SCREENS.md §2.9's line above the bar.
 *
 * @param used - Everything the library holds, in bytes.
 * @param quota - How much it may hold, in bytes.
 * @returns The line, e.g. `41.2 GB of 100 GB`.
 * @example
 * storageLine(41.2 * GIGABYTE, STORAGE_QUOTA_BYTES) // '41.2 GB of 100 GB'
 */
export const storageLine = (used: number, quota: number): string => `${gigabytes(used)} GB of ${gigabytes(quota)} GB`
