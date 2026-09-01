/**
 * coverTitle — sizing the cover title so it always fits the cover.
 *
 * Pure function, and the whole reason the cover's type size is logic rather
 * than styling. SCREENS.md §1.1 gives the cover title as "Caveat 124px / .9"
 * and then, three lines later, states the rule that overrides it: "**Title
 * must fit, not truncate.** Size it to the box: `fontSize = clamp(min,
 * floor(0.9 x available / (titleLength x 0.4)), max)` - Caveat runs about
 * 0.40em per character. An ellipsis is a last-resort floor only." The title
 * is editor-supplied (the `book` global's `title`), so 124px is the size the
 * seeded title happens to resolve to, not a constant the page can assume.
 *
 * The 0.40em figure is an ADVANCE-WIDTH ESTIMATE, not a measurement: this
 * runs on the server, where no font metrics exist, and the alternative -
 * measuring in the browser - would mean client JS and a layout shift on every
 * cover render (CLAUDE.md §6, CLS). The 0.9 factor is the handoff's own
 * safety margin against that estimate being optimistic for a wide string, and
 * `.coverTitle`'s CSS carries the ellipsis the handoff calls a last resort for
 * the case where even the floor is too big.
 *
 * Pattern: pure function over value objects (CLAUDE.md §3.3) - no clock, no
 * DOM, no I/O, so every branch is a real behaviour and testable as one.
 * Depends on: `typeScale` (@travel-diary/tokens/type) for the designed maximum
 * and `DESIGN_BOX` (@travel-diary/tokens/geometry) for the width the title has
 * to fit inside. Never hardcodes either.
 */
import { DESIGN_BOX } from '@travel-diary/tokens/geometry'
import { typeScale } from '@travel-diary/tokens/type'

/**
 * The page area's horizontal inset inside the design box, from the handoff's
 * "page area inset `14px 18px 14px 36px`" (README, "The book - geometry and
 * flip"). Stated here as well as in `book.module.css` because this module
 * needs the arithmetic and CSS cannot hand it over; the two must stay equal.
 */
const PAGE_AREA_INLINE_INSET_PX = 36 + 18

/** The cover column's own padding, both sides. SCREENS.md §1.1: "Centred column, 70px padding". */
const COVER_COLUMN_PADDING_PX = 70 * 2

/**
 * How much horizontal room the cover title actually has: the design box less
 * the page-area inset, less the cover column's padding.
 * @example 1300 - (36 + 18) - (70 x 2) = 1106
 */
export const COVER_TITLE_AVAILABLE_PX = DESIGN_BOX.width - PAGE_AREA_INLINE_INSET_PX - COVER_COLUMN_PADDING_PX

/**
 * The clamp bounds SCREENS.md §1.1's formula names but does not give values
 * for. `max` is the handoff's designed cover-title size, straight from the
 * token table. `min` is the floor the handoff's own prototype applies to this
 * same formula for the same string (`Travel Diary.dc.html`'s mobile cover:
 * `Math.max(38, Math.min(74, Math.floor(260 / (len * 0.4))))`) - the only
 * floor value the handoff supplies anywhere for this computation, so it is
 * taken rather than invented.
 */
export const COVER_TITLE_SIZE = Object.freeze({ min: 38, max: typeScale.diary.coverTitle } as const)

/**
 * Caveat's approximate advance width per character, in em. SCREENS.md §1.1:
 * "Caveat runs about 0.40em per character."
 */
const CAVEAT_EM_PER_CHARACTER = 0.4

/** The handoff's safety margin on the available width, for a string wider than the estimate. */
const FIT_MARGIN = 0.9

/**
 * The font size, in px, at which a cover title fits the width it is given.
 *
 * Never truncates: a title too long even for {@link COVER_TITLE_SIZE}.min is
 * held at that floor and left to the stylesheet's ellipsis, which SCREENS.md
 * §1.1 calls "a last-resort floor only".
 *
 * @param text - The cover title, as the `book` global supplies it.
 * @param availablePx - The horizontal room the title has, in CSS pixels
 *   inside the 1300x860 design box. Pass {@link COVER_TITLE_AVAILABLE_PX} for
 *   the cover itself.
 * @returns A font size in px, between {@link COVER_TITLE_SIZE}.min and
 *   {@link COVER_TITLE_SIZE}.max inclusive. An empty title has no width to
 *   fit, so it returns the maximum rather than a division-by-zero result.
 * @example
 * fitTitleSize('Wanderings', COVER_TITLE_AVAILABLE_PX) // 124 - the designed size
 * fitTitleSize('a'.repeat(66), COVER_TITLE_AVAILABLE_PX) // 38 - the floor
 */
export const fitTitleSize = (text: string, availablePx: number): number => {
  const estimatedWidthPerPx = text.length * CAVEAT_EM_PER_CHARACTER
  // Zero-length text divides to Infinity, which `Math.min` below resolves to
  // the maximum - the right answer for a title with nothing in it, and the
  // reason no explicit empty-string guard is needed here.
  const fitted = Math.floor((FIT_MARGIN * availablePx) / estimatedWidthPerPx)

  return Math.max(COVER_TITLE_SIZE.min, Math.min(COVER_TITLE_SIZE.max, fitted))
}
