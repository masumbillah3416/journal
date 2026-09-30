/**
 * AdminShell.test.tsx — the frame SCREENS.md §2 puts every admin screen in.
 *
 * Two subjects. The first is the assembly: a rail, a header and the screen's
 * own content, with the rail told which address it is beside by the ENTRY the
 * shell was given rather than by anything it reads for itself. The second is
 * the surface's three widths, pinned the same way `ScreenHeader.test.tsx` pins
 * the header's three: the stylesheet names the width, and `adminWidthMode` is
 * asked at that width and one pixel above it, so neither number is written in
 * this file.
 *
 * Depends on: node:fs, node:path, node:url, react, react-dom/client, vitest
 * (jsdom), ./AdminShell, `@travel-diary/domain/admin/breakpoints`,
 * `@travel-diary/domain/admin/navigation`.
 */
import { adminWidthMode, type AdminWidthMode } from '@travel-diary/domain/admin/breakpoints'
import { ADMIN_NAV, type NavEntry } from '@travel-diary/domain/admin/navigation'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import type { NavCounts } from '../../../lib/admin/readNavCounts'
import { AdminShell } from './AdminShell'

const roots: Root[] = []

/** The stylesheet whose media queries are the other half of the width pins. */
const STYLESHEET = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'shell.module.css'), 'utf8')

/** Counts whose four numbers are all different, so no two can be confused. */
const COUNTS: NavCounts = { journeys: 3, media: 41, unpublished: 7, trashed: 2 }

/** The entry a screen hands the shell when it is not the overview. */
const JOURNEYS: NavEntry = ADMIN_NAV.find((entry) => entry.id === 'journeys') ?? {
  id: 'journeys',
  label: 'Journeys',
  subLabel: 'Trips and pages',
  href: '/admin/journeys',
  section: 'journeys',
}

/**
 * The width at and below which the stylesheet puts the surface into one mode.
 *
 * Read off disk rather than written down — see this file's header. Each of the
 * two layout breakpoints declares `--admin-width-mode` naming the mode it
 * begins, so the pin reads a name rather than guessing from a rule.
 *
 * AND THE LAYOUT MUST MOVE ONLY WHERE A MODE IS NAMED. A marker is a value
 * nothing paints with, so a pin bound to it alone binds `adminWidthMode` to a
 * label rather than to the layout: a later task adding a second
 * `grid-template-columns` block at a different width would leave both pins
 * green while the rail stacked somewhere the domain says it does not (Task 3
 * review, finding 8). {@link unmarkedLayoutBlocks} refuses that, and it refuses
 * it by asking which `@media` blocks set `grid-template-columns` WITHOUT also
 * declaring `--admin-width-mode` — not by counting how many times each appears.
 * Counting was the first attempt and it was measured NOT to work: three markers
 * and three layout blocks satisfy a total either way, whichever blocks they sit
 * in, and the mutation passed.
 * @param mode - The mode whose upper bound is wanted.
 * @returns The largest width the stylesheet draws that mode at.
 * @throws When the stylesheet marks no breakpoint for that mode, which is the
 *   failure a deleted media query has to produce.
 */
const widestAt = (mode: AdminWidthMode): number => {
  const pattern = new RegExp(String.raw`@media \(max-width: (\d+)px\) \{[^}]*--admin-width-mode: ${mode}`)
  const found = pattern.exec(STYLESHEET)
  if (found?.[1] === undefined) throw new Error(`shell.module.css marks no breakpoint for the ${mode} surface`)
  return Number(found[1])
}

/**
 * Every `@media` block in the stylesheet, as its own text.
 *
 * Brace-counted rather than matched by regex, because each block contains rule
 * blocks of its own and `[^}]*` stops at the first one.
 * @returns One string per `@media` block, excluding the `@media` line itself.
 */
const mediaBlocks = (): readonly string[] => {
  const blocks: string[] = []

  for (let at = STYLESHEET.indexOf('@media'); at !== -1; at = STYLESHEET.indexOf('@media', at + 1)) {
    const opens = STYLESHEET.indexOf('{', at)
    let depth = 0
    for (let scan = opens; scan < STYLESHEET.length; scan += 1) {
      if (STYLESHEET[scan] === '{') depth += 1
      if (STYLESHEET[scan] === '}') depth -= 1
      if (depth === 0) {
        blocks.push(STYLESHEET.slice(opens, scan))
        break
      }
    }
  }

  return blocks
}

/** The `@media` blocks that move the frame's tracks without naming a mode. */
const unmarkedLayoutBlocks = (): readonly string[] =>
  mediaBlocks().filter((block) => block.includes('grid-template-columns:') && !block.includes('--admin-width-mode:'))

/**
 * Renders the shell around a marked child and hands back the host element.
 * @param screen - The entry the screen says it is.
 * @returns The host element the shell was rendered into.
 */
const renderShell = (screen: NavEntry): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(
      <AdminShell
        screen={screen}
        crumb="The back room"
        counts={COUNTS}
        lastPublished="12 March"
        siteName="A Travel Diary"
        accountName="keeper@example.test"
      >
        <p data-screen-content>the screen’s own content</p>
      </AdminShell>,
    )
  })
  return host
}

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount()
  })
  document.body.replaceChildren()
})

describe('AdminShell', () => {
  it('draws the screen’s own content inside the frame, not beside it', () => {
    const host = renderShell(JOURNEYS)

    const content = host.querySelector('[data-screen-content]')
    expect(content).not.toBeNull()
    expect(content?.closest('main')).not.toBeNull()
  })

  it('names the box the screen is drawn in, so a picture of the shell can leave the screen out', () => {
    // `e2e/visual.spec.ts`'s `admin-shell` case masks this box, which is what
    // makes that baseline a picture of the FRAME rather than a second copy of
    // whichever screen it was taken on. Without a name of its own the mask
    // would have to be spelled as a position (`main > div`), and a baseline
    // keyed on a position is one refactor away from photographing the header.
    const host = renderShell(JOURNEYS)

    const box = host.querySelector('[data-admin-content]')
    expect(box).not.toBeNull()
    expect(box?.querySelector('[data-screen-content]')).not.toBeNull()
    expect(box?.querySelector('h1')).toBeNull()
  })

  it('lights the rail button for the screen it was given, without being told the address twice', () => {
    const current = renderShell(JOURNEYS).querySelector('a[aria-current="page"]')

    expect(current?.getAttribute('data-nav-id')).toBe(JOURNEYS.id)
  })

  it('titles the screen with its entry’s label, and gives the page exactly one level-one heading', () => {
    const host = renderShell(JOURNEYS)

    expect(host.querySelectorAll('h1')).toHaveLength(1)
    expect(host.querySelector('h1')?.textContent).toBe(JOURNEYS.label)
  })

  it('hands the rail the counts it was given rather than a number of its own', () => {
    const host = renderShell(JOURNEYS)

    expect(host.querySelector('a[data-nav-id="media"] [data-nav-count]')?.textContent).toBe(String(COUNTS.media))
    expect(host.querySelector('a[data-nav-id="trash"] [data-nav-count]')?.textContent).toBe(String(COUNTS.trashed))
  })

  it('draws no control of its own in the header, because the shell has nothing to save or preview', () => {
    const host = renderShell(JOURNEYS)

    expect(host.querySelector('[data-control="saved"]')).toBeNull()
    expect(host.querySelector('[data-control="preview-draft"]')).toBeNull()
  })

  it('changes the frame’s layout only at the widths it marks, so the pin below binds the layout', () => {
    // The marker is a value nothing paints with, so on its own it pins a LABEL.
    // What makes the pin below bind the LAYOUT is this: no media block may move
    // the frame's tracks without also naming the mode it is moving them into.
    // A later task that stacks the rail at 900px and leaves the marker at 859
    // would otherwise leave both pins green while the rail stacked somewhere
    // the domain says it does not — and the visual baselines sit at 1440, 1000
    // and 390, so the 860-1000 band nobody photographs is exactly where it
    // would hide (Task 3 review, finding 8).
    expect(mediaBlocks().length, 'no @media blocks were parsed, so this case is vacuous').toBeGreaterThan(0)
    expect(unmarkedLayoutBlocks()).toEqual([])
  })

  it('changes the surface’s mode at exactly the widths the domain does, and not one pixel early', () => {
    // Derived on both sides: the stylesheet names each breakpoint's upper
    // bound, `adminWidthMode` is asked there and one pixel above it, and the
    // mode above is the next one up. No number in this case comes from here.
    const pinned = (['mid', 'narrow'] as const).map((mode) => {
      const boundary = widestAt(mode)
      return { mode, at: adminWidthMode(boundary), justAbove: adminWidthMode(boundary + 1) }
    })

    expect(pinned).toEqual([
      { mode: 'mid', at: 'mid', justAbove: 'wide' },
      { mode: 'narrow', at: 'narrow', justAbove: 'mid' },
    ])
  })
})
