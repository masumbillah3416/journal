/**
 * LatelyCard.test.tsx — SCREENS.md §2.1's "Lately": an 82px timestamp and a
 * description, in two columns.
 * Depends on: react, react-dom/client, vitest (jsdom),
 * ../../../lib/admin/readOverview, ./LatelyCard.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import type { LatelyRow } from '../../../lib/admin/readOverview'
import { LatelyCard } from './LatelyCard'

const roots: Root[] = []

/** Three rows, newest first, as `readOverview` returns them. */
const THREE: readonly LatelyRow[] = [
  { id: 'journey:7', at: '26 Aug 2026', what: 'The Tokyo journey' },
  { id: 'page:41', at: '25 Aug 2026', what: 'Frames I, in Tokyo' },
  { id: 'media:512', at: '24 Aug 2026', what: 'IMG_0412.jpg' },
]

/**
 * Renders the card and hands back the host element.
 * @param rows - The rows to draw.
 * @returns The host element.
 */
const renderCard = (rows: readonly LatelyRow[] = THREE): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(<LatelyCard rows={rows} />)
  })
  return host
}

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount()
  })
  document.body.replaceChildren()
})

describe('LatelyCard', () => {
  it('draws one row per entry, in the order it was given them', () => {
    expect(
      [...renderCard().querySelectorAll('[data-lately-row]')].map((row) => row.getAttribute('data-lately-row')),
    ).toEqual(['journey:7', 'page:41', 'media:512'])
  })

  it('prints each row’s timestamp beside its description', () => {
    const row = renderCard().querySelector('[data-lately-row="page:41"]')

    expect([
      row?.querySelector('[data-lately-when]')?.textContent,
      row?.querySelector('[data-lately-what]')?.textContent,
    ]).toEqual(['25 Aug 2026', 'Frames I, in Tokyo'])
  })

  it('titles the card in §2.1’s own words', () => {
    expect(renderCard().querySelector('h2')?.textContent).toBe('Lately')
  })

  it('says so when a diary has no history yet, rather than drawing an empty grid', () => {
    const host = renderCard([])

    expect(host.querySelectorAll('[data-lately-row]')).toHaveLength(0)
    expect(host.querySelector('[data-lately-empty]')?.textContent).toBe('Nothing has been written yet.')
  })
})
