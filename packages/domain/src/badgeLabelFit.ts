/**
 * badgeLabelFit — shrinking a mood/weather badge label so it fits its circle.
 *
 * Pure function, and the owner's decision on the badge overflow question
 * `notes.module.css`'s header raised and deliberately left open: with real
 * Courier Prime self-hosted (`docs/adr/0008-lcp-budget-and-the-framework-floor.md`),
 * an eleven-character label overflows SCREENS.md §1.3's 98px badge by 9px —
 * measured, in the pinned container, for the seeded "OVERWHELMED" (Marrakech's
 * mood). Three ways out were on the table and none touched the badge's size:
 * shorten the seed word, widen the badge past 98px, or shrink the label past
 * a length threshold. The owner took the third. **The circle is load-bearing**
 * — two badges sit side by side in a fixed header row, and growing one changes
 * the row's balance and can push the journey name — and the label's exact
 * size is not.
 *
 * SCREENS.md §1.3 gives the label as "Courier 11px .08em, centred, 0 9px" and
 * states nothing about a shorter label ever needing to be smaller than that,
 * so `BADGE_LABEL_SIZE.max` (11) is what every label at or under the fitting
 * threshold renders at, unchanged from the handoff. Only a label whose text
 * would overflow the circle at 11px steps down — deterministically, from the
 * label's own length, never from a value chosen per-journey.
 *
 * `letterSpacing` is left alone on purpose: SCREENS.md's `.08em` is relative
 * to `font-size`, so lowering the font size already lowers the tracking in
 * lockstep without a second lever, and a label rendered smaller keeps the
 * exact tracking ratio the handoff specifies rather than a value invented to
 * compensate for it.
 *
 * THE ADVANCE WIDTH BELOW IS A MEASUREMENT, not an estimate, unlike
 * `coverTitle.ts`'s 0.4em/character (which is the handoff's own stated
 * figure for Caveat). Courier Prime is monospace, so every character
 * (including the space in "CLEAR 14C") advances the same width, measured in
 * the pinned `mcr.microsoft.com/playwright` container at the handoff's own
 * 11px/.08em: "OVERWHELMED" (11 characters) rendered its label span, text
 * plus the stated 9px each-side padding, at 105px against a 96px inner
 * circle — 7.9px/character. Scaled linearly with font size, because both the
 * glyph's own advance width and an em-based letter-spacing scale with it.
 * Pattern: pure function over value objects (CLAUDE.md §3.3) — no clock, no
 * DOM, no I/O. Depends on nothing.
 */

/** SCREENS.md §1.3: "two 98px circles". Never changes — see this module's header. */
export const BADGE_DIAMETER_PX = 98

/**
 * The circle's usable diameter once its own `1.5px solid`/`dashed` border is
 * subtracted — `notes.module.css`'s comment on `.badgeLabel` gives this
 * figure directly, measured against the rendered box rather than derived
 * from `98 - 1.5 * 2`, which Chromium's own rounding does not land on exactly.
 */
const BADGE_INNER_DIAMETER_PX = 96

/** SCREENS.md §1.3's label padding: "0 9px", both sides. Fixed — only the font size steps down. */
const BADGE_LABEL_PADDING_PX = 9 * 2

/** How much of the circle's inner diameter is left for the label's text once its padding is subtracted. */
export const BADGE_LABEL_AVAILABLE_TEXT_PX = BADGE_INNER_DIAMETER_PX - BADGE_LABEL_PADDING_PX

/**
 * The clamp bounds for the label's font size. `max` is SCREENS.md §1.3's own
 * "Courier 11px" — every label at or under the fitting threshold renders
 * here, unchanged. `min` is a floor past which a label is left to spill
 * rather than shrink to illegibility; no seeded label reaches it (the
 * longest, "OVERWHELMED", lands at 9.5), so it exists only to bound a future
 * one nobody has typed yet.
 */
export const BADGE_LABEL_SIZE = Object.freeze({ min: 8, max: 11 } as const)

/** Courier Prime's measured advance width per character, in px, at {@link BADGE_LABEL_SIZE}.max. See this module's header. */
const COURIER_PRIME_PX_PER_CHARACTER_AT_MAX = 7.9

/**
 * The font size, in px, at which a badge label fits inside its circle.
 *
 * A label whose text (measured at the handoff's own 11px) already fits the
 * space left over from its padding returns {@link BADGE_LABEL_SIZE}.max
 * untouched — the common case, and the one SCREENS.md §1.3 specifies. Only a
 * label that would overflow at 11px steps down, by exactly the ratio that
 * makes it fit, floored to the nearest half pixel so the result is one of a
 * small, predictable set of sizes rather than a float that moves on every
 * keystroke an editor makes to a mood or weather line.
 *
 * @param label - The mood or weather line a badge draws, e.g. `'OVERWHELMED'`.
 * @returns A font size in px, between {@link BADGE_LABEL_SIZE}.min and
 *   {@link BADGE_LABEL_SIZE}.max inclusive.
 * @example
 * badgeLabelFontSize('CLEAR 14C') // 11 - fits at the designed size, untouched
 * badgeLabelFontSize('OVERWHELMED') // 9.5 - the seeded label that overflows at 11
 */
export const badgeLabelFontSize = (label: string): number => {
  if (label.length === 0) return BADGE_LABEL_SIZE.max

  const widthAtMax = label.length * COURIER_PRIME_PX_PER_CHARACTER_AT_MAX
  if (widthAtMax <= BADGE_LABEL_AVAILABLE_TEXT_PX) return BADGE_LABEL_SIZE.max

  const fitted = (BADGE_LABEL_AVAILABLE_TEXT_PX * BADGE_LABEL_SIZE.max) / widthAtMax
  const stepped = Math.floor(fitted * 2) / 2

  return Math.max(BADGE_LABEL_SIZE.min, Math.min(BADGE_LABEL_SIZE.max, stepped))
}
