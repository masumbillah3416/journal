/**
 * LayoutPicker — SCREENS.md §2.3's dashed layout box: the "Layout" eyebrow with
 * the active layout's name, a 2x2 grid of four glyph buttons, and
 * "+ Add page with this layout".
 *
 * A SERVER COMPONENT. Each glyph is a `<form action={…}>` with a hidden page
 * reference, so pressing one is a `POST` and a re-render rather than a state
 * update — this screen ships no JavaScript for its chrome, which is where the
 * admin surface's CLAUDE.md §6 headroom comes from.
 *
 * ═══ THE CELLS ARE THE DOMAIN'S, AND THAT IS THE POINT ═══
 *
 * §2.3 states the defect in its own parentheses: "Each glyph is a 30px-tall CSS
 * grid of real cells, distinct per layout (an empty grid renders four identical
 * rectangles)." A grid with no children draws nothing, and four buttons drawing
 * nothing look like four buttons drawing a rectangle — which no screenshot
 * flags, because the screenshot is what it is supposed to be. So every track
 * and every cell comes from `layoutGlyph`, through inline `style`, and
 * `LayoutPicker.test.tsx` counts the rendered cells against what that module
 * says. Neither half can pass alone on an empty grid.
 *
 * THE RULES OF THE TEXT SPREAD ARE DRAWN WHERE THE DOMAIN SAYS, and what this
 * file decides is only how tall: 3px, with the last one short, as the prototype
 * draws it. It used to decide WHICH cells too, from their shape, and that put
 * two 3px rules into the Four up button — see {@link glyphCells}.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. Four forms and a lookup.
 *
 * INVARIANT — the picker is drawn only for a page that exists. With no page
 * selected there is nothing for a glyph to apply to, so the caller renders
 * nothing instead of a box whose buttons would post an empty reference.
 * Depends on: react, `LAYOUTS`/`LAYOUT_LABELS`/`layoutGlyph`/`PageLayout`
 * (@travel-diary/domain/admin/layoutGlyphs), `JourneyId`/`PageId`
 * (@travel-diary/domain/ids), ./editor.module.css.
 */
import { LAYOUTS, LAYOUT_LABELS, layoutGlyph, type PageLayout } from '@travel-diary/domain/admin/layoutGlyphs'
import type { JourneyId, PageId } from '@travel-diary/domain/ids'
import type React from 'react'
import styles from './editor.module.css'

/** What the layout box needs to draw itself and to let a button act. */
export interface LayoutPickerProps {
  /** The journey being edited — what "+ Add page" adds a page to. */
  readonly journey: JourneyId
  /** The page a glyph applies to. */
  readonly page: PageId
  /** The layout that page is laid out with, drawn as pressed. */
  readonly active: PageLayout
  /** Writes the layout a glyph was pressed on. */
  readonly setLayout: (form: FormData) => Promise<void>
  /** Adds a page to the end of the rail with the active layout. */
  readonly addPage: (form: FormData) => Promise<void>
}

/**
 * One glyph's cells, drawn where the domain says.
 *
 * WHICH CELLS ARE RULES IS READ, NOT INFERRED. This function used to decide it
 * from a cell's geometry — one row tall, in the first column — and `four-up`'s
 * two left cells match that description, so the Four up button drew two 3px
 * rules and two blocks where SCREENS.md §2.3's table says "four equal". It
 * shipped and a browser sweep found it
 * (`docs/qa/2026-09-19-journey-editor-sweep.md`, EDITOR-002). `GlyphCell.kind`
 * is now the answer, and `LayoutPicker.test.tsx` compares the rules this
 * function DRAWS against the rules the domain DECLARES, for every layout —
 * including the three whose answer is none.
 *
 * The 3px height and the last rule's 70% width stay here, because a height is
 * not a grid line and `layoutGlyphs.ts` carries grid lines.
 * @param layout - The layout whose drawing this is.
 * @returns One element per cell, each positioned by grid line.
 */
const glyphCells = (layout: PageLayout): React.JSX.Element[] => {
  const glyph = layoutGlyph(layout)
  const rules = glyph.cells.filter((cell) => cell.kind === 'rule')

  return glyph.cells.map((cell, index) => {
    const rule = cell.kind === 'rule'
    const last = rule && cell === rules.at(-1)
    return (
      <i
        key={`${String(cell.column[0])}-${String(cell.row[0])}-${String(index)}`}
        data-glyph-cell
        className={[styles.glyphCell, rule ? styles.glyphRule : '', last ? styles.glyphRuleShort : '']
          .filter((name) => name !== '')
          .join(' ')}
        style={{
          gridColumn: `${String(cell.column[0])} / ${String(cell.column[1])}`,
          gridRow: `${String(cell.row[0])} / ${String(cell.row[1])}`,
        }}
      />
    )
  })
}

/**
 * Renders SCREENS.md §2.3's layout box.
 *
 * @param props - See {@link LayoutPickerProps}.
 * @returns The eyebrow, the four glyph buttons, and the add-page button.
 * @example
 * <LayoutPicker journey={id} page={page} active="three-up" setLayout={setPageLayout} addPage={addPage} />
 */
export const LayoutPicker = ({ journey, page, active, setLayout, addPage }: LayoutPickerProps): React.JSX.Element => (
  <section data-layout-picker className={styles.layoutBox}>
    <p className={styles.eyebrow}>
      Layout — <span className={styles.layoutName}>{LAYOUT_LABELS[active]}</span>
    </p>

    <div className={styles.glyphs}>
      {LAYOUTS.map((layout) => (
        <form key={layout} action={setLayout}>
          <input type="hidden" name="journey" value={journey} />
          <input type="hidden" name="page" value={page} />
          <input type="hidden" name="layout" value={layout} />
          <button
            type="submit"
            data-layout={layout}
            aria-pressed={layout === active}
            className={[styles.glyphButton, layout === active ? styles.glyphButtonActive : ''].join(' ')}
          >
            <span
              className={styles.glyph}
              style={{
                gridTemplateColumns: layoutGlyph(layout).columns,
                gridTemplateRows: layoutGlyph(layout).rows,
              }}
            >
              {glyphCells(layout)}
            </span>
            <span className={styles.glyphLabel}>{LAYOUT_LABELS[layout]}</span>
          </button>
        </form>
      ))}
    </div>

    <form action={addPage}>
      <input type="hidden" name="journey" value={journey} />
      <input type="hidden" name="layout" value={active} />
      <button type="submit" data-add-page className={styles.addPage}>
        + Add page with this layout
      </button>
    </form>
  </section>
)
