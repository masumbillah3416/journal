/**
 * LayoutPicker.test.tsx — the four glyph buttons SCREENS.md §2.3 puts in its
 * dashed box, and the property the section states in parentheses.
 *
 * ═══ THE FIRST CASE IS THE DEFECT §2.3 NAMES ═══
 *
 * "Each glyph is a 30px-tall CSS grid of real cells, distinct per layout (an
 * empty grid renders four identical rectangles)." A grid with no children draws
 * nothing, and four buttons drawing nothing look like four buttons drawing a
 * rectangle — which no screenshot flags, because the screenshot is what it is
 * supposed to be.
 *
 * WHAT PRODUCED EACH SIDE OF THAT COMPARISON: the left is the DOM React
 * actually produced, counted with `querySelectorAll`; the right is
 * `@travel-diary/domain/admin/layoutGlyphs` asked directly. Neither number is
 * written in this file, so the case cannot be satisfied by editing it.
 *
 * Depends on: react, react-dom/client, vitest (jsdom),
 * @travel-diary/domain/admin/layoutGlyphs, @travel-diary/domain/ids,
 * ./LayoutPicker.
 */
import { LAYOUTS, LAYOUT_LABELS, layoutGlyph, type PageLayout } from '@travel-diary/domain/admin/layoutGlyphs'
import { journeyId, pageId, type JourneyId, type PageId } from '@travel-diary/domain/ids'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { LayoutPicker } from './LayoutPicker'

const roots: Root[] = []

/**
 * A branded journey id.
 * @param raw - The id as Postgres would spell it.
 * @returns The branded id.
 */
const aJourney = (raw: string): JourneyId => {
  const built = journeyId(raw)
  if (!built.ok) throw new Error(built.error)
  return built.value
}

/**
 * A branded page id.
 * @param raw - The id as Postgres would spell it.
 * @returns The branded id.
 */
const aPage = (raw: string): PageId => {
  const built = pageId(raw)
  if (!built.ok) throw new Error(built.error)
  return built.value
}

/** What nothing in these cases does: no form here is ever submitted. */
const noAction = (): Promise<void> => Promise.resolve()

/**
 * Renders the picker and hands back the host element.
 * @param active - The layout to draw as pressed.
 * @returns The host element.
 */
const renderLayoutPicker = ({ active }: { readonly active: PageLayout }): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(
      <LayoutPicker
        journey={aJourney('42')}
        page={aPage('7')}
        active={active}
        setLayout={noAction}
        addPage={noAction}
      />,
    )
  })
  return host
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount()
    })
  }
  document.body.innerHTML = ''
})

describe('LayoutPicker', () => {
  it('draws a different number of cells for each layout button, so four buttons are not four rectangles', () => {
    const host = renderLayoutPicker({ active: 'three-up' })

    const counts = LAYOUTS.map((layout) => host.querySelectorAll(`[data-layout="${layout}"] [data-glyph-cell]`).length)
    expect(counts).toEqual(LAYOUTS.map((layout) => layoutGlyph(layout).cells.length))
  })

  it('positions every cell where the domain says, rather than letting the grid place them', () => {
    // The counts above would pass for four buttons that each drew the right
    // NUMBER of identical squares in auto-placed order. This is the other half:
    // each cell's `grid-column` and `grid-row` are the domain's lines.
    const host = renderLayoutPicker({ active: 'three-up' })

    const drawn = [...host.querySelectorAll<HTMLElement>('[data-layout="three-up"] [data-glyph-cell]')].map((cell) => [
      cell.style.gridColumn,
      cell.style.gridRow,
    ])
    expect(drawn).toEqual(
      layoutGlyph('three-up').cells.map((cell) => [
        `${String(cell.column[0])} / ${String(cell.column[1])}`,
        `${String(cell.row[0])} / ${String(cell.row[1])}`,
      ]),
    )
  })

  it('gives each glyph the tracks the domain gives it, so the shapes differ and not only the counts', () => {
    const host = renderLayoutPicker({ active: 'three-up' })

    const tracks = LAYOUTS.map((layout) => {
      const glyph = host.querySelector<HTMLElement>(`[data-layout="${layout}"] > span`)
      return [glyph?.style.gridTemplateColumns, glyph?.style.gridTemplateRows]
    })
    expect(tracks).toEqual(LAYOUTS.map((layout) => [layoutGlyph(layout).columns, layoutGlyph(layout).rows]))
  })

  it('presses exactly the active layout’s button, and says so to a screen reader', () => {
    const host = renderLayoutPicker({ active: 'full-bleed' })

    const pressed = [...host.querySelectorAll('[data-layout][aria-pressed="true"]')]
    expect(pressed).toHaveLength(1)
    expect(pressed[0]?.getAttribute('data-layout')).toBe('full-bleed')
  })

  it('names the active layout beside the eyebrow, in the design’s own words', () => {
    const host = renderLayoutPicker({ active: 'text-spread' })

    expect(host.textContent).toContain(LAYOUT_LABELS['text-spread'])
  })

  it('carries the page each glyph applies to, and the journey the add button adds to', () => {
    const host = renderLayoutPicker({ active: 'three-up' })

    // IDS, NEVER PLACES (CLAUDE.md §0.9). A form that posted "the current page"
    // would name a different row the moment a second tab reordered the rail.
    const layoutRefs = [...host.querySelectorAll<HTMLInputElement>('input[name="page"]')]
    expect(layoutRefs).toHaveLength(LAYOUTS.length)
    expect(layoutRefs.every((input) => input.value === '7')).toBe(true)
    const journeyRefs = [...host.querySelectorAll<HTMLInputElement>('input[name="journey"]')]
    // One per glyph, because each action revalidates this journey's editor,
    // plus the add button's own.
    expect(journeyRefs).toHaveLength(LAYOUTS.length + 1)
    expect(journeyRefs.every((input) => input.value === '42')).toBe(true)
  })

  it('adds a page with the layout that is active, not with a fixed one', () => {
    const host = renderLayoutPicker({ active: 'four-up' })

    const add = host.querySelector('[data-add-page]')?.closest('form')
    expect(add?.querySelector<HTMLInputElement>('input[name="layout"]')?.value).toBe('four-up')
  })

  it('draws a rule exactly where the domain says one, and nowhere else', () => {
    // BOTH SIDES, WHICH IS THE HALF THAT WAS MISSING. The old case asserted only
    // that `text-spread` HAS three rules, so `four-up` being drawn as two rules
    // and two blocks passed it — and that is what shipped
    // (docs/qa/2026-09-19-journey-editor-sweep.md, EDITOR-002). The left side is
    // the DOM React produced; the right is the domain's own `kind`, counted over
    // every layout including the three whose answer is zero.
    const host = renderLayoutPicker({ active: 'three-up' })

    const drawn = LAYOUTS.map(
      (layout) =>
        [...host.querySelectorAll<HTMLElement>(`[data-layout="${layout}"] [data-glyph-cell]`)].filter((cell) =>
          cell.className.includes('glyphRule'),
        ).length,
    )
    expect(drawn).toEqual(
      LAYOUTS.map((layout) => layoutGlyph(layout).cells.filter((cell) => cell.kind === 'rule').length),
    )
  })

  it('draws four up as four equal cells, which is what SCREENS.md §2.3’s table says', () => {
    // The one the sweep photographed: a thin line, a block, a shorter thin line
    // and a block. Kept beside the general case above because this layout is the
    // one an author confuses with Text spread when it is drawn wrong.
    const host = renderLayoutPicker({ active: 'three-up' })

    const cells = [...host.querySelectorAll<HTMLElement>('[data-layout="four-up"] [data-glyph-cell]')]
    expect(cells).toHaveLength(4)
    expect(cells.filter((cell) => cell.className.includes('glyphRule'))).toHaveLength(0)
  })

  it('draws the text spread’s three rules as rules and its block as a block', () => {
    // The 3px height and the short last rule are this component's, because a
    // height is not a grid line — so nothing in the domain can pin them.
    const host = renderLayoutPicker({ active: 'text-spread' })

    const cells = [...host.querySelectorAll<HTMLElement>('[data-layout="text-spread"] [data-glyph-cell]')]
    const rules = cells.filter((cell) => cell.className.includes('glyphRule'))
    expect(cells).toHaveLength(4)
    expect(rules).toHaveLength(3)
    expect(rules.filter((cell) => cell.className.includes('glyphRuleShort'))).toHaveLength(1)
  })
})
