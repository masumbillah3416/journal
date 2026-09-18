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
 * two layout breakpoints carries a `data-width-mode` marker declaration naming
 * the mode it begins, so the pin reads a name rather than guessing from a rule.
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
