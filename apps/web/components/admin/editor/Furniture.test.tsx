/**
 * Furniture.test.tsx — SCREENS.md §2.3's Page furniture block, and the one
 * property a screenshot of it cannot check.
 *
 * ═══ THE FIRST CASE IS TASK 5'S DEFECT, ONE SECTION LOWER ═══
 *
 * Four layout glyphs shipped as four identical rectangles because an empty CSS
 * grid draws nothing, and a browser sweep found it rather than any case
 * (`docs/qa/2026-09-19-journey-editor-sweep.md`, EDITOR-002). Three weather
 * cards that all draw nothing are the same defect with three elements: they look
 * like three cards with different words under them, and a screenshot of that is
 * exactly what it is supposed to be. So the marks are compared with each other
 * and each is required to be non-empty.
 *
 * WHAT PRODUCED EACH SIDE: the marks are read out of the DOM React actually
 * produced, and compared against each other rather than against anything this
 * file writes down — so no edit to this file can satisfy it.
 *
 * Depends on: react, react-dom/client, vitest (jsdom),
 * @travel-diary/domain/bookBundle, ./Furniture.
 */
import { WEATHER_GLYPHS, type WeatherGlyph } from '@travel-diary/domain/bookBundle'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { Furniture } from './Furniture'

const roots: Root[] = []

/** The seeded Tokyo journey's own furniture, so a fixture reads like a journey. */
const TOKYO = {
  signoff: 'twelve days, one corner of it',
  weatherGlyph: 'sun' as WeatherGlyph,
  stampCountry: 'NIPPON',
  stampValue: '120',
  accent: '#3d817e',
  slug: 'tokyo',
}

/**
 * Renders the furniture block and hands back the host element.
 * @param overrides - Fields to override on the Tokyo fixture.
 * @returns The host element.
 */
const renderFurniture = (overrides: Partial<typeof TOKYO> = {}): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(<Furniture {...TOKYO} {...overrides} />)
  })
  return host
}

/**
 * The one element a selector matches.
 * @param host - Where to look.
 * @param selector - What to look for.
 * @returns The element.
 */
const one = (host: HTMLElement, selector: string): Element => {
  const found = host.querySelector(selector)
  if (found === null) throw new Error(`nothing matched ${selector}`)
  return found
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount()
    })
  }
  document.body.innerHTML = ''
})

describe('Furniture', () => {
  it('draws a distinct mark for each weather glyph, not three identical cards with different words', () => {
    const host = renderFurniture({ weatherGlyph: 'sun' })

    const marks = WEATHER_GLYPHS.map((glyph) => host.querySelector(`[data-glyph="${glyph}"] svg`)?.innerHTML ?? '')

    expect(new Set(marks).size).toBe(WEATHER_GLYPHS.length)
    expect(marks.every((mark) => mark.length > 0)).toBe(true)
  })

  it('checks the card for the glyph the journey stored, and only that one', () => {
    const host = renderFurniture({ weatherGlyph: 'haze' })

    const checked = WEATHER_GLYPHS.filter(
      (glyph) => (one(host, `[data-glyph="${glyph}"] input`) as HTMLInputElement).checked,
    )

    expect(checked).toEqual(['haze'])
  })

  it('gives each card a word as well as a mark, so the choice is readable either way', () => {
    const host = renderFurniture()

    expect(one(host, '[data-glyph="wind"]').textContent).toContain('Wind')
  })

  it('paints the stamp face in the journey’s own accent, which is what makes it a preview', () => {
    const host = renderFurniture({ accent: '#a06b3e' })

    // THE PARSED DECLARATION, NOT THE ATTRIBUTE TEXT. jsdom normalises the hex
    // to `rgb(...)` while parsing, so reading it back this way also says the
    // declaration is valid CSS — a value shaped to break out of the gradient
    // would be dropped and this would read as empty. `BookmarkRail.test.tsx`
    // asserts the book's own tint the same way.
    expect((one(host, '[data-stamp-face]') as HTMLElement).style.background).toContain('rgb(160, 107, 62)')
  })

  it('prints the stamp’s two lines on the face as well as in the fields', () => {
    const host = renderFurniture({ stampCountry: 'HELVETIA', stampValue: '90' })

    expect(one(host, '[data-stamp-face]').textContent).toBe('HELVETIA90')
  })

  it('checks the swatch the journey is painted with', () => {
    const host = renderFurniture({ accent: '#5a72a8' })

    const checked = [...host.querySelectorAll('[data-accent] input')].filter(
      (input) => input instanceof HTMLInputElement && input.checked,
    )

    expect(checked).toHaveLength(1)
    expect(one(host, '[data-accent="#5a72a8"] input')).toBe(checked[0])
  })

  it('offers the five swatches §2.3 names when the journey is painted with one of them', () => {
    const host = renderFurniture({ accent: '#3d817e' })

    expect(host.querySelectorAll('[data-accent]')).toHaveLength(5)
  })

  it('adds a swatch for an accent the five do not offer, so a save does not quietly drop it', () => {
    // Without this the radio group would have nothing checked, the form would
    // post no `accent` at all, and the save would be refused over a field the
    // author never touched.
    const host = renderFurniture({ accent: '#123456' })

    expect(host.querySelectorAll('[data-accent]')).toHaveLength(6)
    expect((one(host, '[data-accent="#123456"] input') as HTMLInputElement).checked).toBe(true)
  })

  it('names every swatch, because five squares that differ only in colour name nothing on their own', () => {
    const host = renderFurniture()

    const named = [...host.querySelectorAll('[data-accent]')].map((swatch) => swatch.textContent)

    expect(named.every((name) => name.trim().length > 0)).toBe(true)
  })

  it('prints the gallery address’s prefix beside the slug rather than inside it', () => {
    const host = renderFurniture({ slug: 'tokyo' })

    expect(one(host, '[data-furniture]').textContent).toContain('/gallery/')
    expect((one(host, 'input[name="slug"]') as HTMLInputElement).value).toBe('tokyo')
  })
})
