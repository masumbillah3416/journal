/**
 * coverContrast.ts — measures the real contrast ratio of text drawn over the
 * cover's gradient cloth, by sampling the rendered pixels.
 *
 * Exists because axe cannot settle this page. `color-contrast` comes back
 * INCOMPLETE on `/p/1` (7 nodes): axe reads a computed `background-color`,
 * and the cover's background is a `linear-gradient` over a
 * `repeating-linear-gradient` over the paper face below, so it declines to
 * judge rather than passing or failing. A green axe run on this route is
 * therefore not a contrast result, and CLAUDE.md §2 requires the ratios to be
 * asserted rather than assumed — which is what this helper makes possible.
 *
 * THE METHOD, and why each step is the way it is:
 *
 *   1. The five lines are hidden with `visibility: hidden`, not removed and
 *      not `display: none`. Layout is preserved exactly, so every line's box
 *      still occupies the pixels it occupied with the text in it — and those
 *      pixels now show only the background the text was sitting on.
 *   2. The COVER ELEMENT is screenshotted, not the viewport. At 390px the
 *      book is drawn at roughly a third scale and can sit partly outside the
 *      viewport; an element screenshot scrolls it into view and clips to it,
 *      so the same code samples the same region at all three breakpoints.
 *   3. A line's sampling region is its own border box VERTICALLY and its
 *      text's range box HORIZONTALLY. The vertical extent must come from the
 *      element, because a `line-height: 0.9` title's range box is taller than
 *      its border box and would bleed into the cream hairlines above and
 *      below it — sampling a neighbour's paint, not this line's background.
 *      The horizontal extent must come from the range, because these are
 *      centred block elements whose border boxes span the whole column and
 *      would sample cloth the glyphs never touch.
 *   4. The reported background is the LIGHTEST pixel in that region, not the
 *      mean. The cloth carries a 2px `repeating-linear-gradient` texture, so
 *      the background under one line is a range rather than a value; the
 *      lightest pixel is the worst case for the cream text drawn on it, and a
 *      worst case is the only honest thing to hold a contrast floor against.
 *   5. The foreground is the line's own computed `color`, flattened onto that
 *      background with `composite` — every cover line but the title is a
 *      translucent cream, and an rgba colour has no contrast ratio until it
 *      is composited onto what is behind it.
 *
 * Depends on: @playwright/test, sharp (decodes the PNG screenshot to raw RGB
 * — already a dependency of `apps/web` for the derivative pipeline),
 * `composite`/`contrastRatio` (@travel-diary/domain/contrast, the WCAG 2.1
 * maths, unit-tested to 100% there rather than re-derived here).
 */
import { composite, contrastRatio } from '@travel-diary/domain/contrast'
import type { Page } from '@playwright/test'
import sharp from 'sharp'

/** One line of text whose contrast against the cloth is to be measured. */
export interface ContrastTarget {
  /** How the line is named in the assertion's output. */
  readonly name: string
  /** A selector resolving to exactly one element, inside the cover. */
  readonly selector: string
  /** The WCAG 2.1 AA floor for this line's own size and weight. */
  readonly minimumRatio: number
}

/** What one measured line came out at. */
export interface MeasuredContrast {
  /** The target's `name`, echoed so a failing assertion names the line. */
  readonly name: string
  /** The measured ratio, rounded to three decimals. */
  readonly ratio: number
  /** The floor this line had to clear. */
  readonly minimumRatio: number
  /** The lightest background pixel found under the line, as `#rrggbb`. */
  readonly background: string
  /** The line's own colour flattened onto that background, as `#rrggbb`. */
  readonly foreground: string
}

/** A line's sampling region and colour, as read out of the live document. */
interface SampledBox {
  readonly color: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/** Formats one 0-255 RGB triple as `#rrggbb`. */
const toHex = (channels: readonly [number, number, number]): string =>
  `#${channels.map((value) => Math.round(value).toString(16).padStart(2, '0')).join('')}`

/**
 * Splits a computed `rgb()`/`rgba()` colour into a hex triple and an alpha.
 *
 * @param colour - A computed colour, as Chromium serializes it.
 * @returns The opaque colour and its alpha.
 * @throws if the string is not an `rgb()`/`rgba()` colour — every computed
 *   `color` in this codebase is one, and a silent default would report a
 *   contrast ratio for a colour nothing on the page is drawn in.
 */
const parseComputedColour = (colour: string): { readonly hex: string; readonly alpha: number } => {
  const match = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(colour)
  if (match === null) throw new Error(`not an rgb()/rgba() colour: ${colour}`)
  const channel = (index: 1 | 2 | 3): number => Number(match[index])
  return {
    hex: toHex([channel(1), channel(2), channel(3)]),
    alpha: match[4] === undefined ? 1 : Number(match[4]),
  }
}

/** WCAG 2.1 relative luminance, on raw 0-255 channels, for ranking pixels. */
const luminanceOf = (channels: readonly [number, number, number]): number =>
  0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]

/**
 * Measures each named line's contrast against the cloth actually rendered
 * behind it.
 *
 * @param page - A Playwright page already showing the cover.
 * @param coverSelector - The cover element the lines live in.
 * @param targets - The lines to measure.
 * @returns One {@link MeasuredContrast} per target, in the order given.
 * @throws if a target's selector matches nothing, or if a line's box falls
 *   outside the captured cover — either means the measurement did not happen,
 *   which must fail loudly rather than report a ratio for the wrong pixels.
 * @example
 * const measured = await measureContrastOverGradient(page, '[data-page="cover"]', [
 *   { name: 'eyebrow', selector: '[data-page="cover"] p:nth-of-type(1)', minimumRatio: 4.5 },
 * ])
 */
export const measureContrastOverGradient = async (
  page: Page,
  coverSelector: string,
  targets: readonly ContrastTarget[],
): Promise<readonly MeasuredContrast[]> => {
  const selectors = targets.map((target) => target.selector)

  await page.evaluate(() => document.fonts.ready)

  const sampled = await page.evaluate(
    ([cover, lines]: readonly [string, readonly string[]]) => {
      const coverNode = document.querySelector(cover)
      if (coverNode === null) throw new Error(`no element matched ${cover}`)
      const origin = coverNode.getBoundingClientRect()

      return {
        devicePixelRatio: window.devicePixelRatio,
        boxes: lines.map((selector) => {
          const node = document.querySelector(selector)
          if (node === null) throw new Error(`no element matched ${selector}`)
          const range = document.createRange()
          range.selectNodeContents(node)
          const text = range.getBoundingClientRect()
          const box = node.getBoundingClientRect()
          return {
            color: getComputedStyle(node).color,
            x: text.x - origin.x,
            y: box.y - origin.y,
            width: text.width,
            height: box.height,
          }
        }),
      }
    },
    [coverSelector, selectors] as const,
  )

  // Hidden, not removed: see this file's header, step 1.
  await page.evaluate((lines: readonly string[]) => {
    for (const selector of lines) {
      const node = document.querySelector<HTMLElement>(selector)
      if (node === null) throw new Error(`no element matched ${selector}`)
      node.style.visibility = 'hidden'
    }
  }, selectors)

  const shot = await page.locator(coverSelector).screenshot()

  await page.evaluate((lines: readonly string[]) => {
    for (const selector of lines) {
      const node = document.querySelector<HTMLElement>(selector)
      if (node !== null) node.style.removeProperty('visibility')
    }
  }, selectors)

  const { data, info } = await sharp(shot).raw().toBuffer({ resolveWithObject: true })

  const pixelAt = (x: number, y: number): readonly [number, number, number] => {
    const offset = (y * info.width + x) * info.channels
    const channel = (index: number): number => data[offset + index] ?? 0
    return [channel(0), channel(1), channel(2)]
  }

  const lightestUnder = (box: SampledBox, scale: number): readonly [number, number, number] => {
    const left = Math.max(0, Math.round(box.x * scale))
    const top = Math.max(0, Math.round(box.y * scale))
    const right = Math.min(info.width, Math.round((box.x + box.width) * scale))
    const bottom = Math.min(info.height, Math.round((box.y + box.height) * scale))
    if (right <= left || bottom <= top) {
      throw new Error(`a line's box fell outside the captured cover: ${JSON.stringify(box)}`)
    }

    let lightest: readonly [number, number, number] = [0, 0, 0]
    for (let y = top; y < bottom; y++) {
      for (let x = left; x < right; x++) {
        const pixel = pixelAt(x, y)
        if (luminanceOf(pixel) > luminanceOf(lightest)) lightest = pixel
      }
    }
    return lightest
  }

  return targets.map((target, index) => {
    const box = sampled.boxes[index]
    if (box === undefined) throw new Error(`no box was sampled for ${target.name}`)

    const background = toHex(lightestUnder(box, sampled.devicePixelRatio))
    const { hex, alpha } = parseComputedColour(box.color)
    const foreground = composite(hex, alpha, background)

    return {
      name: target.name,
      ratio: Math.round(contrastRatio(foreground, background) * 1000) / 1000,
      minimumRatio: target.minimumRatio,
      background,
      foreground,
    }
  })
}
