/**
 * bookScale — resolution-independent sizing for the book.
 *
 * Pure function. The book is authored at exactly 1300x860 and scaled to fit
 * its container, so every page measurement in SCREENS.md is absolute and the
 * layout never reflows — it behaves like a printed page. Depends on tokens.
 */
import { DESIGN_BOX, MAX_SCALE } from '@travel-diary/tokens/geometry'

/** Smallest scale we will ever apply, so a zero-sized area cannot hide the book. */
const MIN_SCALE = 0.05

/**
 * The scale factor that fits the design box inside the given area.
 * @param area - Available space in CSS pixels.
 * @returns A factor between MIN_SCALE and MAX_SCALE.
 */
export const bookScale = (area: { width: number; height: number }): number => {
  const fit = Math.min(area.width / DESIGN_BOX.width, area.height / DESIGN_BOX.height)
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, fit))
}
