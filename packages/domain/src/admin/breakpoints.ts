/**
 * breakpoints — the five widths the admin surface changes shape at, and the
 * two answers every screen asks of them.
 *
 * Pure and in the domain because the header, the rail and every screen from
 * Task 4 onwards ask the same question, and a `@media` rule cannot answer it
 * for a Server Component that has to decide what to RENDER rather than what to
 * paint.
 *
 * EVERY CONSTANT IS A LOWER BOUND, INCLUSIVE — `≥`, never `>`. SCREENS.md §2
 * writes "hidden below 1040px", so 1040 keeps the chip; the design spec writes
 * "≥ 1180 wide", so 1180 is wide. One pixel is the whole difference between a
 * transcription and a guess, which is why `breakpoints.test.ts` pins the last
 * accepted and the first refused width of each of the five.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. Five constants and two lookups.
 * Depends on: nothing.
 */

/** Design spec §8.2: the surface is wide at this width and above. */
const WIDE_FROM = 1180

/** Design spec §8.2: mid from here up to {@link WIDE_FROM}; narrow below. */
const MID_FROM = 860

/** SCREENS.md §2: the "Saved just now" chip is hidden below 1040px. */
const SAVED_CHIP_FROM = 1040

/** SCREENS.md §2: the "n unpublished" chip is hidden below 900px. */
const UNPUBLISHED_CHIP_FROM = 900

/** SCREENS.md §2: "Preview draft" is hidden below 780px. */
const PREVIEW_DRAFT_FROM = 780

/** How much room the admin surface has, in the design spec's own three names. */
export type AdminWidthMode = 'wide' | 'mid' | 'narrow'

/**
 * Which of the three shapes the surface takes at a width.
 *
 * @param width - The surface's width in CSS pixels.
 * @returns The mode design spec §8.2 gives that width.
 * @example
 * adminWidthMode(1180) // 'wide'
 */
export const adminWidthMode = (width: number): AdminWidthMode => {
  if (width >= WIDE_FROM) return 'wide'
  if (width >= MID_FROM) return 'mid'
  return 'narrow'
}

/** Which of the header's three optional controls are drawn (SCREENS.md §2). */
export interface HeaderControls {
  /** The "Saved just now" chip. */
  readonly savedChip: boolean
  /** The "n unpublished" chip, with its 7px rotated square. */
  readonly unpublishedChip: boolean
  /** The "Preview draft" action. `Publish` is never dropped. */
  readonly previewDraft: boolean
}

/**
 * Which header controls survive at a width.
 *
 * @param width - The surface's width in CSS pixels.
 * @returns One flag per droppable control. `Publish` is not among them: it is
 *   the screen's primary action and SCREENS.md §2 gives it no hiding width.
 * @example
 * headerControls(1040).savedChip // true
 */
export const headerControls = (width: number): HeaderControls => ({
  savedChip: width >= SAVED_CHIP_FROM,
  unpublishedChip: width >= UNPUBLISHED_CHIP_FROM,
  previewDraft: width >= PREVIEW_DRAFT_FROM,
})
