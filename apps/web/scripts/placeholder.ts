/**
 * placeholder — striped SVG data-URI generator for missing seed imagery.
 *
 * Factory pattern (CLAUDE.md §3.3, "Factory: test fixtures, seed data"): a
 * pure function that builds a fresh, self-contained SVG string from an
 * options object every call — no shared mutable state. The seed (Task 11)
 * uses it to stand in for every photo slot until real media is uploaded, so
 * a missing photo is identifiable on the page by the slot it stands in for
 * ("TOKYO A1"), not a blank rectangle.
 *
 * The label is escaped before interpolation into the SVG markup. Today every
 * label comes from seed data we control, but this generator must not become
 * the reason a real, user-supplied caption is unsafe to render later.
 * Depends on nothing.
 */

/** Inputs describing one placeholder image. */
export interface StripedPlaceholderOptions {
  /** Text drawn centred over the stripes, naming the slot this stands in for. */
  readonly label: string
  /** The journey's accent colour (e.g. `#3d817e`), used for the stripe fill. */
  readonly tint: string
  /** Rendered SVG width, in pixels. */
  readonly width: number
  /** Rendered SVG height, in pixels. */
  readonly height: number
}

/** Characters that would otherwise let interpolated text break out of SVG markup. */
const MARKUP_ESCAPES: ReadonlyArray<readonly [RegExp, string]> = [
  [/&/g, '&amp;'],
  [/</g, '&lt;'],
  [/>/g, '&gt;'],
  [/"/g, '&quot;'],
]

/**
 * Escapes the characters that matter inside SVG text/attribute content.
 * @param value - Raw, untrusted text.
 * @returns `value` with `&`, `<`, `>` and `"` replaced by their entity forms.
 */
const escapeMarkup = (value: string): string =>
  MARKUP_ESCAPES.reduce((escaped, [pattern, replacement]) => escaped.replace(pattern, replacement), value)

/**
 * Parses a `#rrggbb` hex colour into its channels.
 * @param hex - A 6-digit hex colour with a leading `#`, e.g. `#3d817e` — the
 *   only form a journey's accent or a `packages/tokens` journeyAccent takes.
 * @returns The red, green and blue channels as 0–255 integers, or `undefined`
 *   when `hex` is not in that form.
 */
const parseHex = (hex: string): { r: number; g: number; b: number } | undefined => {
  const isSixDigitHex = /^#[0-9a-fA-F]{6}$/.test(hex)
  /* c8 ignore next -- every real caller passes a valid `#rrggbb` accent, either
   * a journey's own or one of packages/tokens' journeyAccents; this guards a
   * malformed value defensively rather than throwing. */
  if (!isSixDigitHex) return undefined
  const digits = hex.slice(1)
  return {
    r: parseInt(digits.slice(0, 2), 16),
    g: parseInt(digits.slice(2, 4), 16),
    b: parseInt(digits.slice(4, 6), 16),
  }
}

/**
 * Lightens a hex colour by mixing it toward white.
 * @param hex - The base colour, e.g. `#3d817e`.
 * @param amount - Fraction of the mix toward white, from 0 (unchanged) to 1 (white).
 * @returns The lightened colour as `#rrggbb`, or `hex` unchanged if it cannot be parsed.
 */
const lighten = (hex: string, amount: number): string => {
  const channels = parseHex(hex)
  /* c8 ignore next -- see parseHex's own note; unreachable with any real tint. */
  if (!channels) return hex
  const mix = (channel: number): string =>
    Math.round(channel + (255 - channel) * amount)
      .toString(16)
      .padStart(2, '0')
  return `#${mix(channels.r)}${mix(channels.g)}${mix(channels.b)}`
}

/**
 * Builds an SVG data-URI of 45° stripes in `tint`, with `label` centred in a
 * monospace face — a stand-in for a photo slot with no media uploaded yet.
 * @param options - The label, tint and dimensions for the placeholder.
 * @returns A `data:image/svg+xml,...` URI a browser can render directly, e.g.
 *   in an `<img src>` or CSS `background-image`.
 * @example
 * stripedPlaceholder({ label: 'TOKYO A1', tint: '#3d817e', width: 800, height: 600 })
 */
export const stripedPlaceholder = (options: StripedPlaceholderOptions): string => {
  const { label, tint, width, height } = options
  const safeLabel = escapeMarkup(label)
  const companion = lighten(tint, 0.22)
  const w = String(width)
  const h = String(height)
  const stripeSize = String(Math.max(16, Math.round(Math.min(width, height) * 0.07)))
  const halfStripe = String(Math.max(16, Math.round(Math.min(width, height) * 0.07)) / 2)
  const fontSize = String(Math.max(11, Math.round(Math.min(width, height) * 0.05)))

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    '<defs>',
    `<pattern id="stripes" width="${stripeSize}" height="${stripeSize}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">`,
    `<rect width="${stripeSize}" height="${stripeSize}" fill="${tint}" />`,
    `<rect width="${halfStripe}" height="${stripeSize}" fill="${companion}" />`,
    '</pattern>',
    '</defs>',
    `<rect width="${w}" height="${h}" fill="url(#stripes)" />`,
    `<text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="${fontSize}" font-weight="700" fill="#fffdf6" stroke="#2c2519" stroke-width="4" paint-order="stroke" letter-spacing="1">${safeLabel}</text>`,
    '</svg>',
  ].join('')

  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}
