/**
 * contrast — WCAG 2.1 relative luminance and contrast ratio.
 *
 * Pure functions over #rrggbb strings. Exists so the handoff's accessibility
 * claims about specific tokens are asserted by tests rather than trusted.
 * Depends on nothing.
 */

/** Splits a `#rrggbb` string into its three 0-255 channel values. */
const parseChannels = (hex: string): readonly [number, number, number] => {
  const value = hex.replace('#', '')
  const r = Number.parseInt(value.slice(0, 2), 16)
  const g = Number.parseInt(value.slice(2, 4), 16)
  const b = Number.parseInt(value.slice(4, 6), 16)
  return [r, g, b]
}

/** Converts one 0-255 sRGB channel to its linear-light value, per WCAG 2.1. */
const linearise = (channel: number): number => {
  const c = channel / 255
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

/**
 * Relative luminance of a colour, per WCAG 2.1.
 * @param hex - Colour as `#rrggbb`.
 * @returns Luminance between 0 (black) and 1 (white).
 */
export const relativeLuminance = (hex: string): number => {
  const [r, g, b] = parseChannels(hex)
  return 0.2126 * linearise(r) + 0.7152 * linearise(g) + 0.0722 * linearise(b)
}

/**
 * Contrast ratio between two colours, per WCAG 2.1. Symmetric.
 * @param foreground - One colour as `#rrggbb`.
 * @param background - The other colour as `#rrggbb`.
 * @returns A ratio from 1 (identical) to 21 (black on white).
 */
export const contrastRatio = (foreground: string, background: string): number => {
  const a = relativeLuminance(foreground)
  const b = relativeLuminance(background)
  const [lighter, darker] = a > b ? [a, b] : [b, a]
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Flattens a translucent overlay onto an opaque base, so an rgba() token can be
 * measured for contrast the same way an opaque one is.
 * @param overlay - Overlay colour as `#rrggbb`.
 * @param alpha - Overlay opacity, 0 to 1.
 * @param base - The opaque colour beneath it, as `#rrggbb`.
 * @returns The flattened colour as `#rrggbb`.
 */
export const composite = (overlay: string, alpha: number, base: string): string => {
  const front = parseChannels(overlay)
  const back = parseChannels(base)
  const blend = (i: 0 | 1 | 2): string =>
    Math.round(front[i] * alpha + back[i] * (1 - alpha))
      .toString(16)
      .padStart(2, '0')
  return `#${blend(0)}${blend(1)}${blend(2)}`
}
