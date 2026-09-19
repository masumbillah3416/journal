/**
 * editorGrid.test.tsx — the two widths SCREENS.md §2.3's editor changes shape
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
 * ═══ WHAT IT PINS IS A DERIVATION, NOT A PAIR OF NUMBERS ═══
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
 * The two widths SCREENS.md §2.3 names, as the PROTOTYPE measures them.
 *
 * "`184px | minmax(0,1fr) | 250px` above 1180px · `168px | minmax(0,1fr)` above
 * 860px with the pool spanning `1 / -1` · a single column below."
 */
const SPEC_RUNGS: readonly number[] = [860, 1180]

/** The tracks §2.3 gives each of its three shapes, narrowest first. */
const SPEC_TRACKS: readonly string[] = ['minmax(0, 1fr)', '168px minmax(0, 1fr)', '184px minmax(0, 1fr) 250px']

/**
 * The content area's horizontal padding, read off the shell's own rule.
 * @returns One side's padding in CSS pixels.
 */
const contentGutter = (): number => {
  const found = /\.content\s*\{[^}]*?padding:\s*\d+px\s+(\d+)px/.exec(SHELL)
  if (found?.[1] === undefined) throw new Error('the shell stylesheet no longer states the content area’s padding')
  return Number(found[1])
}

/**
 * Every container rung the editor declares, ascending.
 * @returns The `min-width` of each `@container` block.
 */
const rungs = (): readonly number[] =>
  [...EDITOR.matchAll(/@container\s+td-journey-editor\s*\(min-width:\s*(\d+)px\)/g)]
    .map((match) => Number(match[1]))
    .sort((one, two) => one - two)

describe('the journey editor’s container rungs', () => {
  it('finds a rung to judge at all, so the cases below cannot pass on an empty match', () => {
    expect(rungs()).toHaveLength(SPEC_RUNGS.length)
    expect(contentGutter()).toBeGreaterThan(0)
  })

  it('puts each rung where SCREENS.md’s own width sits once the padding a container cannot see is added back', () => {
    // The prototype reads `[data-content].clientWidth`, which includes that
    // element's `padding: 24px 30px 44px`; a container query measures the
    // content box. So the stylesheet's rung plus both gutters must BE the
    // handoff's number — and neither the rung nor the gutter is written here.
    expect(rungs().map((rung) => rung + 2 * contentGutter())).toEqual(SPEC_RUNGS)
  })

  it('draws the three shapes §2.3 names, in the order it names them', () => {
    const tracks = [...EDITOR.matchAll(/grid-template-columns:\s*([^;]+);/g)].map((match) => match[1]?.trim())

    // The single column is declared on `.screen` itself and the other two
    // inside the rungs, so reading them in source order is reading them
    // narrowest first.
    expect(tracks.filter((value) => value !== undefined && value.includes('fr)'))).toEqual(SPEC_TRACKS)
  })

  it('spans the pool across both columns at the middle rung and gives it its own at the widest', () => {
    // §2.3: "`168px | minmax(0,1fr)` above 860px WITH THE POOL SPANNING `1 / -1`".
    // Without this the pool would take the second track and squeeze the pane.
    expect(EDITOR).toContain('grid-column: 1 / -1')
    expect(EDITOR).toContain('grid-column: auto')
  })
})
