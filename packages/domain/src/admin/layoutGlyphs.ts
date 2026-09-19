/**
 * layoutGlyphs — the four drawings SCREENS.md §2.3's layout picker prints
 * inside its buttons: a grid shape per page layout.
 *
 * ═══ WHY A MODULE RATHER THAN FOUR RULES IN A STYLESHEET ═══
 *
 * §2.3 states the defect this exists to prevent in its own parentheses: "Each
 * glyph is a 30px-tall CSS grid of REAL CELLS, distinct per layout (an empty
 * grid renders four identical rectangles)." A grid with no children draws
 * nothing, and four buttons each drawing nothing look like four buttons each
 * drawing a rectangle — a picker where every option looks the same, which no
 * screenshot flags because the screenshot is what it is supposed to be.
 *
 * So the cells are DATA, the picker renders one element per cell, and
 * `layoutGlyphs.test.ts` asserts the set is distinct while
 * `LayoutPicker.test.tsx` asserts the DOM has as many cells as this module
 * names. Neither half can pass alone on an empty grid.
 *
 * THE CELLS ARE GRID LINES, NOT INDICES. `column: [1, 2]` is
 * `grid-column: 1 / 2`, CSS's own one-based line numbering, so a cell's span is
 * `end - start` and the values go into `style` untranslated. Writing them
 * zero-based would put the translation in the component, where nothing measures
 * it.
 *
 * EACH CELL ALSO SAYS WHETHER IT IS A BLOCK OR ONE OF THE TEXT SPREAD'S LINES,
 * for the same reason and at a cost this module paid once already: the picker
 * used to infer it from the cell's shape, and `four-up`'s two left cells have
 * the same shape as a line, so Four up shipped drawing two lines and two blocks
 * (`docs/qa/2026-09-19-journey-editor-sweep.md`, EDITOR-002). See
 * {@link GlyphCell.kind}.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. One frozen table and one
 * lookup; naming a pattern for that would be cargo cult.
 *
 * INVARIANT — no two layouts may share a drawing. That is the first case in
 * the suite, asserted over the whole set rather than pairwise, so a fifth
 * layout added as a copy of a fourth fails on the commit that adds it.
 * Depends on: nothing.
 */

/** One of SCREENS.md §2.3's four page layouts. */
export type PageLayout = 'three-up' | 'four-up' | 'full-bleed' | 'text-spread'

/** One rectangle of a glyph, in CSS grid lines. */
export interface GlyphCell {
  /** `grid-column: start / end`, one-based, as CSS numbers its lines. */
  readonly column: readonly [number, number]
  /** `grid-row: start / end`, one-based. */
  readonly row: readonly [number, number]
  /**
   * Whether the cell is drawn filled, or as one of the text spread's lines.
   *
   * IT IS DATA AND NOT A SHAPE THE PICKER RECOGNISES, and that is a correction
   * rather than a preference. `LayoutPicker` used to work it out from the cell's
   * geometry — one row tall, in the first column — which is true of the text
   * spread's three lines AND of `four-up`'s two left cells, so the Four up
   * button drew two 3px lines and two blocks instead of four equal cells. It
   * shipped, and a browser sweep is what found it
   * (`docs/qa/2026-09-19-journey-editor-sweep.md`, EDITOR-002). A property a
   * layout DECLARES cannot be true of a layout that did not declare it.
   *
   * The 3px height and the last line's 70% width stay in the stylesheet: a
   * height is not a grid line, and this module carries grid lines.
   */
  readonly kind: 'block' | 'rule'
}

/** One layout's drawing: a grid, and the real cells inside it. */
export interface LayoutGlyph {
  /** The glyph's `grid-template-columns`. */
  readonly columns: string
  /** The glyph's `grid-template-rows`. */
  readonly rows: string
  /** Every rectangle drawn in it — never empty, or the button draws nothing. */
  readonly cells: readonly GlyphCell[]
}

/**
 * The four layouts, in the order §2.3's 2x2 picker lists them.
 *
 * Exported because both the picker and the suite iterate it: a component that
 * wrote the four names again could draw three buttons, and a test that wrote
 * them again could check three drawings while the fourth drifted.
 */
export const LAYOUTS: readonly PageLayout[] = ['three-up', 'four-up', 'full-bleed', 'text-spread']

/**
 * What each layout is called on screen.
 *
 * HERE RATHER THAN IN A COMPONENT, which is where `JourneyTable.tsx`'s own
 * `PILL_LABEL` lives, because this one has two readers: the picker prints it
 * under each glyph and beside the "Layout" eyebrow, and the page rail's meta
 * line prints it under the page's name. Two components spelling four names is
 * two chances for one of them to drift.
 *
 * `Travel Diary Admin.dc.html`'s own strings, which is why they are sentence
 * case: the stylesheet upper-cases them, so what a screen reader announces
 * stays "Three up" rather than "THREE UP".
 */
export const LAYOUT_LABELS: Readonly<Record<PageLayout, string>> = {
  'three-up': 'Three up',
  'four-up': 'Four up',
  'full-bleed': 'Full bleed',
  'text-spread': 'Text spread',
}

/**
 * SCREENS.md §2.3's table, transcribed.
 *
 * Three up is "tall spanning rows 1–3, then two": the tall cell takes the wider
 * first track for both rows, and the narrow track carries one cell per row.
 * Text spread is "three 3px rules beside one block": the rules are one cell per
 * row of the first track — their 3px height is the stylesheet's, because a
 * height is not a grid line — and the block spans all three rows of the second.
 */
const GLYPHS: Readonly<Record<PageLayout, LayoutGlyph>> = {
  'three-up': {
    columns: '1.45fr 1fr',
    rows: '1fr 1fr',
    cells: [
      { column: [1, 2], row: [1, 3], kind: 'block' },
      { column: [2, 3], row: [1, 2], kind: 'block' },
      { column: [2, 3], row: [2, 3], kind: 'block' },
    ],
  },
  'four-up': {
    columns: '1fr 1fr',
    rows: '1fr 1fr',
    cells: [
      { column: [1, 2], row: [1, 2], kind: 'block' },
      { column: [2, 3], row: [1, 2], kind: 'block' },
      { column: [1, 2], row: [2, 3], kind: 'block' },
      { column: [2, 3], row: [2, 3], kind: 'block' },
    ],
  },
  'full-bleed': {
    columns: '1fr',
    rows: '1fr',
    cells: [{ column: [1, 2], row: [1, 2], kind: 'block' }],
  },
  'text-spread': {
    columns: '1fr 1fr',
    rows: '1fr 1fr 1fr',
    cells: [
      { column: [1, 2], row: [1, 2], kind: 'rule' },
      { column: [1, 2], row: [2, 3], kind: 'rule' },
      { column: [1, 2], row: [3, 4], kind: 'rule' },
      { column: [2, 3], row: [1, 4], kind: 'block' },
    ],
  },
}

/**
 * The drawing one layout's button prints.
 *
 * @param layout - Which of SCREENS.md §2.3's four layouts.
 * @returns Its grid and its cells, ready to go into `style` untranslated.
 * @example
 * layoutGlyph('full-bleed') // { columns: '1fr', rows: '1fr', cells: [{ column: [1, 2], row: [1, 2] }] }
 */
export const layoutGlyph = (layout: PageLayout): LayoutGlyph => GLYPHS[layout]
