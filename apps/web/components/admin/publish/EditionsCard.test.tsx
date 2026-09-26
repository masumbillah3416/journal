/**
 * EditionsCard.test.tsx — SCREENS.md §2.8's third card: the mark, the
 * timestamp, the description and Restore.
 *
 * THE LIVE ROW IS ASSERTED FROM BOTH SIDES. Exactly one row carries the filled
 * mark and exactly one has its control withheld, and both are counted rather
 * than looked for — a card that marked every row, or none, would pass a
 * `toContain` on either.
 * Depends on: react, react-dom/client, vitest (jsdom),
 * ../../../lib/admin/readPendingChanges, ./EditionsCard.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Edition } from '../../../lib/admin/readPendingChanges'
import { EditionsCard } from './EditionsCard'

const roots: Root[] = []

/** Three editions, newest first, as `readEditions` returns them. */
const THREE: readonly Edition[] = [
  { id: '904', at: '26 Aug 2026 · 19:04', what: 'Tokyo published', live: true },
  { id: '903', at: '19 Aug 2026 · 08:22', what: 'Lisbon published', live: false },
  { id: '902', at: '2 Aug 2026 · 21:40', what: 'Tokyo published', live: false },
]

/**
 * Renders the card and hands back the host element.
 * @param editions - The rows to draw.
 * @returns The host element.
 */
const renderCard = (editions: readonly Edition[] = THREE): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(<EditionsCard editions={editions} restore={vi.fn()} />)
  })
  return host
}

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount()
  })
  document.body.replaceChildren()
})

describe('EditionsCard', () => {
  it('titles the card as §2.8 names it', () => {
    expect(renderCard().querySelector('h2')?.textContent).toBe('Editions')
  })

  it('draws one row per edition, addressed by the version it restores', () => {
    const host = renderCard()

    expect([...host.querySelectorAll('[data-edition-row]')].map((row) => row.getAttribute('data-edition-row'))).toEqual(
      ['904', '903', '902'],
    )
  })

  it('prints each edition’s timestamp and description', () => {
    const host = renderCard(THREE.slice(1, 2))

    expect(host.textContent).toContain('19 Aug 2026 · 08:22')
    expect(host.textContent).toContain('Lisbon published')
  })

  it('fills the mark on the one edition readers are looking at, and rings the rest', () => {
    const host = renderCard()

    const marks = [...host.querySelectorAll('[data-edition-live]')].map((mark) =>
      mark.getAttribute('data-edition-live'),
    )
    expect(marks).toEqual(['true', 'false', 'false'])
    expect(marks.filter((mark) => mark === 'true')).toHaveLength(1)
  })

  it('posts the version id a Restore would put back', () => {
    const host = renderCard()

    expect([...host.querySelectorAll<HTMLInputElement>('input[name="edition"]')].map((field) => field.value)).toEqual([
      '904',
      '903',
      '902',
    ])
  })

  it('withholds Restore on the live edition and offers it on every other', () => {
    // Restoring the version a reader is already looking at writes a new
    // version identical to the live row and invalidates every path the journey
    // occupies, for no change at all.
    const host = renderCard()

    expect([...host.querySelectorAll<HTMLButtonElement>('button')].map((button) => button.disabled)).toEqual([
      true,
      false,
      false,
    ])
  })

  it('gives every row its own form, because this card is outside the publish form', () => {
    const host = renderCard()

    expect(host.querySelectorAll('form')).toHaveLength(3)
  })

  it('says so plainly when the book has never gone out', () => {
    const host = renderCard([])

    expect(host.querySelector('[data-editions-empty]')?.textContent).toContain('Nothing has gone out yet')
    expect(host.querySelectorAll('[data-edition-row]')).toHaveLength(0)
  })
})
