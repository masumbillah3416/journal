/**
 * MaterialCard.test.tsx — SCREENS.md §2.9's "Your material": the two actions,
 * the line, the 7px bar and its legend.
 * Depends on: react, react-dom/client, vitest (jsdom),
 * @travel-diary/domain/admin/storageBar,
 * ../../../lib/admin/readSettingsScreen, ./MaterialCard.
 */
import { storageSegments } from '@travel-diary/domain/admin/storageBar'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import type { StorageUsed } from '../../../lib/admin/readSettingsScreen'
import { MaterialCard } from './MaterialCard'

const roots: Root[] = []

/**
 * §2.9's own example: 29 GB of photographs and 12.2 GB of clips, of a hundred.
 *
 * BUILT BY THE DOMAIN FUNCTION the screen builds it with, not by hand: a
 * fixture that wrote the three widths out would agree with this card about a
 * shape `storageSegments` does not produce.
 */
const USED: StorageUsed = {
  line: '41.2 GB of 100 GB',
  segments: storageSegments({ stills: 29, clips: 12.2 }, 100),
}

/**
 * Renders the card and hands back the host element.
 * @param storage - The line and the bar.
 * @returns The host element.
 */
const renderCard = (storage: StorageUsed = USED): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(<MaterialCard storage={storage} exportHref="/admin/export" />)
  })
  return host
}

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount()
  })
  document.body.replaceChildren()
})

describe('MaterialCard', () => {
  it('prints the line §2.9 gives, above the bar', () => {
    expect(renderCard().querySelector('[data-space-line]')?.textContent).toBe('41.2 GB of 100 GB')
  })

  it('draws three segments, in the order the bar prints them', () => {
    expect(
      [...renderCard().querySelectorAll('[data-space-segment]')].map((segment) =>
        segment.getAttribute('data-space-segment'),
      ),
    ).toEqual(['stills', 'clips', 'free'])
  })

  it('gives each segment the width the domain answered, as a percentage', () => {
    const host = renderCard()
    const widthOf = (kind: string): string | undefined =>
      host.querySelector<HTMLElement>(`[data-space-segment="${kind}"]`)?.style.width

    // THE NUMBER THE DEFECT MOVES. A bar drawn from the used total rather than
    // the quota puts stills at 70.4% here, and every other assertion in this
    // file is blind to it.
    expect([widthOf('stills'), widthOf('clips'), widthOf('free')]).toEqual(['29%', '12.2%', '58.8%'])
  })

  it('draws the two kinds in §2.9’s two inks, and the remainder in the track’s', () => {
    const host = renderCard()
    const inkOf = (kind: string): string | undefined =>
      host.querySelector<HTMLElement>(`[data-space-segment="${kind}"]`)?.style.getPropertyValue('--td-segment-ink')

    // A CUSTOM PROPERTY, not a `background`: jsdom normalises a `background`
    // and this is the only spelling a case can read back.
    expect([inkOf('stills'), inkOf('clips')]).toEqual(['var(--td-status-published)', 'var(--td-status-edited)'])
    expect(inkOf('free')).not.toBe(inkOf('stills'))
  })

  it('gives the legend one swatch per segment, matching the bar’s inks', () => {
    const host = renderCard()

    expect(
      [...host.querySelectorAll('[data-space-legend]')].map((item) => item.getAttribute('data-space-legend')),
    ).toEqual(['stills', 'clips', 'free'])
  })

  it('points Export everything at the route that streams the bytes', () => {
    expect(renderCard().querySelector('[data-export-everything]')?.getAttribute('href')).toBe('/admin/export')
  })

  it('renders Import a backup inert, because nothing here can import one', () => {
    // BOTH HALVES: the control exists, because §2.9 draws it, and it cannot be
    // pressed, because this repository has no import. A live button that did
    // nothing would be the defect docs/deviations.md §92 names.
    const host = renderCard()
    const button = host.querySelector<HTMLButtonElement>('[data-import-backup]')

    expect(button).not.toBeNull()
    expect(button?.disabled).toBe(true)
    expect(host.querySelector('[data-import-note]')?.textContent).toContain('runbook')
  })

  it('says why there is no last backup date rather than printing one nothing records', () => {
    expect(renderCard().querySelector('[data-last-backup]')?.textContent).toContain('No backup date is recorded')
  })

  it('draws a full bar with nothing free once the library is over its quota', () => {
    const host = renderCard({ line: '130 GB of 100 GB', segments: storageSegments({ stills: 90, clips: 40 }, 100) })

    expect(host.querySelector<HTMLElement>('[data-space-segment="free"]')?.style.width).toBe('0%')
  })

  it('titles the card in §2.9’s own words', () => {
    expect(renderCard().querySelector('h2')?.textContent).toBe('Your material')
  })
})
