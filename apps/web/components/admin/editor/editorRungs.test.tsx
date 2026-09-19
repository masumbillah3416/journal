/**
 * editorRungs.test.tsx — the two widths SCREENS.md §2.3's editor changes shape
 * at, and the one thing about them a test can actually hold.
 *
 * ═══ WHY THIS FILE EXISTS, AND WHY IT IS A `.tsx` THAT RENDERS NOTHING ═══
 *
 * A media query is not a value this project can assert about
 * (`ScreenHeader.test.tsx` says the same one screen along), and §2.3's rungs
 * have no domain module behind them the way §2.2's column ladder has
 * `journeyColumns.ts` — inventing one to hold two layout widths for a single
 * caller would be CLAUDE.md §4. So what is left is to read the stylesheet, and
 * that is what this does. The extension is `.tsx` because `vitest.config.ts`'s
 * `unit` project collects no `.test.ts` file under `apps/web/components/` —
 * only `unit-dom`, whose glob takes `.test.tsx` under `apps/web/`, reaches this
 * directory, and a file collected by nobody is the exact failure that config's
 * header exists to prevent. (A glob written out in full here would end this
 * comment early: the star-slash inside one closes a block comment. Measured —
 * the file silently collected zero tests until the glob came out.)
 *
 * ═══ WHAT IT PINS IS A DERIVATION, NOT A LIST OF NUMBERS ═══
 *
 * The numbers in the stylesheet are NOT §2.3's. They cannot be: the prototype
 * takes its width from `document.querySelector('[data-content]').clientWidth`
 * (`Travel Diary Admin.dc.html:1469`) and `clientWidth` INCLUDES that element's
 * own horizontal padding, while a container query's `inline-size` is the
 * content box. The first version of this screen transcribed §2.3's numbers
 * straight into the container query and said the ~60px difference was "written
 * down rather than compensated for". A browser sweep then measured the
 * consequence: at the design's own 1440 reference the editor drew ONE column
 * where the prototype draws three, and §2.3's two- and three-column shapes were
 * unreachable at every viewport this project tests
 * (`docs/qa/2026-09-19-journey-editor-sweep.md`, EDITOR-003).
 *
 * So the rungs are compensated, and the case below reads BOTH sides off disk —
 * the shell's padding from `shell.module.css`, the rungs from
 * `editor.module.css` — and requires them to add back up to the numbers
 * `SCREENS.md` §2.3 states. Those two are the only literals in this file, and
 * they are the handoff's own.
 *
 * ═══ AND THE PADDING IS TWO NUMBERS, NOT ONE ═══
 *
 * The first version of this file read the FIRST `.content` rule in
 * `shell.module.css` and applied its 30px to both rungs. The shell narrows that
 * padding to 22px under `@media (max-width: 1179px)`, and the middle rung's
 * whole transition happens inside that media query — so its compensation is 44,
 * not 60, and it shipped 16px short. The case passed the entire time, asserting
 * a derivation that was false for one of the two rungs it claimed to derive.
 *
 * WHICH GUTTER IS IN FORCE WHERE, worked out rather than assumed. The container
 * is `viewport − 238 (the rail) − 2 × gutter`, so a rung at `R` fires at a
 * viewport of `R + 238 + 2 × gutter`:
 *
 *   - the WIDEST rung transitions at `1120 + 238 + 60 = 1418`, above 1179, so
 *     the base 30px is the one that applies there;
 *   - the MIDDLE rung transitions at `816 + 238 + 44 = 1098`, at or below 1179,
 *     so the override's 22px applies.
 *
 * Both land exactly on the prototype's own transitions — `1440 − 238 = 1202`
 * and `1098 − 238 = 860` — which is the arithmetic this file exists to hold.
 *
 * The sweep's measured readings confirm the 22: `mid` 1000 → 718 = 1000 − 238 −
 * 44, and `mobile` 390 → 346 = 390 − 44. Neither works with 60.
 *
 * Task 6 adds two more rungs of the same container — the Notes pane's field grid
 * at 856 and its body grid at 960 — and they do not fall on the same side: 856
 * transitions at 1138, inside the media query, and 960 at 1258, above it. So
 * WHICH gutter applies is DERIVED by `gutterAt` rather than paired by hand, from
 * the rail's width and the media query's own `max-width`, both read off the same
 * stylesheet. A hand-written pairing is what shipped 16px short the first time.
 *
 * Depends on: node:fs, node:path, node:url, vitest.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = path.dirname(fileURLToPath(import.meta.url))

/** The editor's own stylesheet, where the container rungs live. */
const EDITOR = readFileSync(path.join(HERE, 'editor.module.css'), 'utf8')

/** The shell's, where the content area's padding lives. */
const SHELL = readFileSync(path.join(HERE, '../shell/shell.module.css'), 'utf8')

/**
 * Every width SCREENS.md §2.3 names, as the PROTOTYPE measures them.
 *
 * The screen's own two: "`184px | minmax(0,1fr) | 250px` above 1180px ·
 * `168px | minmax(0,1fr)` above 860px with the pool spanning `1 / -1` · a single
 * column below."
 *
 * And Task 6's two, inside the Notes pane: the field grid's four tracks "above
 * 900px" and the body grid's two columns "above 1020px". They are rungs of the
 * SAME container, not of the pane, because the prototype keys every grid on this
 * screen on one `w` — `[data-content]`'s `clientWidth`, read once
 * (`Travel Diary Admin.dc.html:1469`).
 */
const SPEC_RUNGS: readonly number[] = [860, 900, 1020, 1180]

/** The tracks §2.3 gives each of its three shapes, narrowest first. */
const SPEC_TRACKS: readonly string[] = ['minmax(0, 1fr)', '168px minmax(0, 1fr)', '184px minmax(0, 1fr) 250px']

/**
 * The `.content` rule's side padding inside some stretch of CSS, if it has one.
 * @param css - The stylesheet, or one media block's body.
 * @returns The padding in CSS pixels, or `undefined` where that stretch sets none.
 */
const sideGutterIn = (css: string): number | undefined => {
  const found = /\.content\s*\{[^}]*?padding:\s*\d+px\s+(\d+)px/.exec(css)
  return found?.[1] === undefined ? undefined : Number(found[1])
}

/**
 * The shell's narrow surface: the widest `max-width` query that restates the
 * content area's padding, and the padding it restates.
 *
 * FOUND BY WHAT THE BLOCK CONTAINS, NOT BY ITS NUMBER. Written first as one
 * regular expression reaching from `@media (max-width: N px)` to the next
 * `.content`, it matched across a block boundary and answered with a NARROWER
 * query that sets no padding at all — 1039 rather than 1179. Each block's body
 * is bounded first now, and the one that matters is chosen by having a padding
 * in it.
 * @returns That query's `max-width` and the gutter it declares.
 * @throws When the shell no longer narrows the content area's padding at all.
 */
const narrowSurface = (): { readonly maxWidth: number; readonly gutter: number } => {
  const found = [...SHELL.matchAll(/@media \(max-width: (\d+)px\) \{([\s\S]*?)\n\}/g)]
    .flatMap((block) => {
      const gutter = sideGutterIn(block[2] ?? '')
      return gutter === undefined ? [] : [{ maxWidth: Number(block[1]), gutter }]
    })
    .sort((one, two) => two.maxWidth - one.maxWidth)[0]
  if (found === undefined) throw new Error('the shell stylesheet no longer narrows the content area’s padding')
  return found
}

/**
 * The content area's horizontal padding, on one of the shell's two surfaces.
 *
 * TWO NUMBERS, because the shell has two: `padding: 24px 30px 44px` at the top
 * and `22px 22px 40px` under `@media (max-width: 1179px)`. Reading the first
 * rule in the file and using it for both rungs is what let the middle one ship
 * 16px short — see this file's header.
 * @param narrow - Whether to read the `max-width: 1179px` override rather than
 *   the base rule.
 * @returns One side's padding in CSS pixels.
 */
const contentGutter = (narrow: boolean): number => {
  const gutter = narrow ? narrowSurface().gutter : sideGutterIn(SHELL)
  if (gutter === undefined) throw new Error('the shell stylesheet no longer states the content area’s padding')
  return gutter
}

/**
 * The shell's nav rail, which the editor's container never gets.
 *
 * Read off `shell.module.css` rather than written here, so the derivation below
 * cannot go on agreeing with a rail that has been resized.
 * @returns The rail's width in CSS pixels.
 */
const railWidth = (): number => {
  const found = /grid-template-columns:\s*(\d+)px minmax/.exec(SHELL)
  if (found?.[1] === undefined) throw new Error('the shell stylesheet no longer states the rail’s width')
  return Number(found[1])
}

/**
 * The viewport at or below which the shell tightens the content area's padding.
 * @returns The `max-width` of that media query.
 */
const narrowAtOrBelow = (): number => narrowSurface().maxWidth

/**
 * The gutter in force where one rung transitions.
 *
 * DERIVED, NOT LISTED. A rung at `R` fires at a viewport of
 * `R + rail + 2 × gutter`, and which gutter applies depends on whether that
 * viewport is inside the shell's narrow media query — so the answer is worked
 * out from the two numbers above rather than from a table this file would have
 * to keep in step with the stylesheet. A hand-written pairing is how the first
 * version of this case shipped one rung 16px short.
 * @param rung - The container rung, in container pixels.
 * @returns The gutter in force there.
 */
const gutterAt = (rung: number): number =>
  contentGutter(rung + railWidth() + 2 * contentGutter(true) <= narrowAtOrBelow())

/**
 * Every container rung the editor declares, ascending.
 * @returns The `min-width` of each `@container` block.
 */
const rungs = (): readonly number[] =>
  [...EDITOR.matchAll(/@container\s+td-journey-editor\s*\(min-width:\s*(\d+)px\)/g)]
    .map((match) => Number(match[1]))
    .sort((one, two) => one - two)

describe('the journey editor’s container rungs', () => {
  it('finds a rung per SCREENS.md width and two different gutters, so nothing below compares with itself', () => {
    // THE SENTINEL. A `contentGutter` that matched nothing would throw, but one
    // that matched the SAME rule twice would leave the case below asserting
    // `rung + 60` against every rung — which is the defect this file shipped
    // with. The rung COUNT is here too: a rung added with no `SPEC_RUNGS` entry,
    // or the other way round, fails here rather than as an off-by-one below.
    expect(rungs()).toHaveLength(SPEC_RUNGS.length)
    expect(contentGutter(false)).toBe(30)
    expect(contentGutter(true)).toBe(22)
    expect(railWidth()).toBe(238)
    expect(narrowAtOrBelow()).toBe(1179)
  })

  it('splits the rungs across BOTH gutters, so the derivation is exercised in both directions', () => {
    // Without this, four rungs that all happened to fall on one side of the
    // media query would let `gutterAt` return a constant and still pass below.
    expect(new Set(rungs().map(gutterAt))).toEqual(new Set([contentGutter(true), contentGutter(false)]))
  })

  it('puts each rung at SCREENS.md’s width once the padding in force AT THAT RUNG is added back', () => {
    // 816 + 44 = 860 and 856 + 44 = 900, both transitioning inside the shell's
    // `max-width: 1179px` override; 960 + 60 = 1020 and 1120 + 60 = 1180, both
    // above it. See this file's header for the arithmetic, and for what reading
    // one gutter for all of them cost.
    expect(rungs().map((rung) => rung + 2 * gutterAt(rung))).toEqual(SPEC_RUNGS)
  })

  it('draws the three shapes §2.3 names, in the order it names them', () => {
    // THE SHAPED DECLARATIONS ONLY, and picked out by where they are rather
    // than by what they spell. This used to filter on the substring `fr)`,
    // which worked by coincidence — `.glyphs` and `.poolGrid` write `1fr 1fr`,
    // with no closing parenthesis, and a future `repeat(2, minmax(0, 1fr))` on
    // either would have joined the comparison silently. `.grid` declares all
    // three: one at the top and one inside each rung.
    const tracks = [...EDITOR.matchAll(/\.grid\s*\{[^}]*?grid-template-columns:\s*([^;]+);/g)].map((match) =>
      match[1]?.trim(),
    )

    // Source order is narrowest first: the single column is declared on `.grid`
    // itself — `.screen` holds only the measurement — and the other two inside
    // the rungs, widest last.
    expect(tracks).toEqual(SPEC_TRACKS)
  })

  it('measures one element and shapes another, which is the cause that did all the damage', () => {
    // EDITOR-003 second cause: `container-type` was on the grid itself, and an
    // element is not matched by its own container query — so no rung ever fired
    // at any width, while the `.pool` rules inside those same rungs did, which
    // is what made the stylesheet look like it worked. The markup half of this
    // is `EditorGrid.test.tsx`; this is the stylesheet half.
    const measured = /\.(\w+)\s*\{[^}]*?container-type:\s*inline-size/.exec(EDITOR)?.[1]
    expect(measured, 'no rule declares container-type').toBeDefined()

    const rungBlocks = [...EDITOR.matchAll(/@container[^{]*\{([\s\S]*?)\n\}/g)].map((match) => match[1] ?? '')
    expect(rungBlocks).toHaveLength(rungs().length)
    // The measured selector must not be one the rungs reshape, and the shaped
    // one must not be the measured one.
    expect(rungBlocks.filter((block) => block.includes(`.${String(measured)} {`))).toEqual([])
    expect(EDITOR).toContain(`.${String(measured)} {`)
    expect(measured).not.toBe('grid')
  })

  it('spans the pool across both columns at the middle rung and gives it its own at the widest', () => {
    // §2.3: "`168px | minmax(0,1fr)` above 860px WITH THE POOL SPANNING `1 / -1`".
    // Without this the pool would take the second track and squeeze the pane.
    expect(EDITOR).toContain('grid-column: 1 / -1')
    expect(EDITOR).toContain('grid-column: auto')
  })
})
