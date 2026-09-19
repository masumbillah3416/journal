/**
 * layoutGlyphs.test.ts — behaviour spec for the four drawings SCREENS.md §2.3's
 * layout picker prints inside its buttons.
 *
 * Unit test (CLAUDE.md §2): a pure lookup over four names. The DOM half of the
 * pin — that the picker renders one element per cell this module names, rather
 * than four identical rectangles — is `LayoutPicker.test.tsx`'s, because a
 * count of rendered nodes is not something a domain test can see.
 *
 * THE FIRST CASE IS THE MODULE'S REASON FOR EXISTING, stated as a property.
 * §2.3 says the glyphs are "distinct per layout (an empty grid renders four
 * identical rectangles)", so distinctness is asserted over the whole set rather
 * than by four literal comparisons that could all be typed wrong the same way.
 *
 * Depends on: vitest, ./layoutGlyphs.
 */
import { describe, expect, it } from 'vitest'
import { LAYOUTS, LAYOUT_LABELS, layoutGlyph } from './layoutGlyphs'

describe('layoutGlyph', () => {
  it('gives no two layouts the same drawing, which is the whole reason it exists', () => {
    const drawings = LAYOUTS.map((layout) => JSON.stringify(layoutGlyph(layout)))

    expect(new Set(drawings).size).toBe(LAYOUTS.length)
  })

  it('draws three up as a tall cell beside two, spanning both rows', () => {
    const glyph = layoutGlyph('three-up')

    expect(glyph.columns).toBe('1.45fr 1fr')
    expect(glyph.rows).toBe('1fr 1fr')
    expect(glyph.cells).toHaveLength(3)
    expect(glyph.cells[0]).toEqual({ column: [1, 2], row: [1, 3], kind: 'block' })
  })

  it('draws full bleed as exactly one cell, so it cannot look like four up', () => {
    expect(layoutGlyph('full-bleed').cells).toHaveLength(1)
    expect(layoutGlyph('four-up').cells).toHaveLength(4)
  })

  it('says which cells are rules, so no other layout can be drawn as one by accident', () => {
    // THE CASE THAT WAS MISSING, and the defect it lets through was drawn on
    // screen: `LayoutPicker` used to INFER "this is a 3px rule" from a cell's
    // shape — one row tall, first column — and `four-up`'s two left cells match
    // that, so the Four up button drew two rules and two blocks instead of four
    // equal cells (docs/qa/2026-09-19-journey-editor-sweep.md, EDITOR-002).
    // The zero side is the half that was never asserted.
    const rules = Object.fromEntries(
      LAYOUTS.map((layout) => [layout, layoutGlyph(layout).cells.filter((cell) => cell.kind === 'rule').length]),
    )

    expect(rules).toEqual({ 'three-up': 0, 'four-up': 0, 'full-bleed': 0, 'text-spread': 3 })
  })

  it('draws text spread with three rules beside one block', () => {
    const glyph = layoutGlyph('text-spread')

    expect(glyph.rows).toBe('1fr 1fr 1fr')
    expect(glyph.cells.filter((cell) => cell.row[1] - cell.row[0] === 3)).toHaveLength(1)
  })
})

describe('LAYOUT_LABELS', () => {
  it('names every layout the picker offers, and names no two of them the same', () => {
    const named = LAYOUTS.map((layout) => LAYOUT_LABELS[layout])

    expect(named.filter((label) => label.trim() !== '')).toHaveLength(LAYOUTS.length)
    expect(new Set(named).size).toBe(LAYOUTS.length)
  })

  it('keeps the design’s own sentence case, so a screen reader is not shouted at', () => {
    // The stylesheet upper-cases these; upper-casing them here as well would
    // make the accessible name "THREE UP".
    expect(LAYOUT_LABELS['three-up']).toBe('Three up')
  })
})
