/**
 * LiveBookCard.test.tsx — SCREENS.md §2.1's "The book, live": the 78x104px
 * cloth chip, the summary, the publish date and the two controls.
 *
 * WHAT THIS FILE CANNOT SAY, written here so nobody reads it as saying it:
 * whether the fitted title FITS. jsdom performs no layout, so every box is zero
 * and `scrollWidth` always equals `clientWidth`. The fitting property is a
 * property of `fitChipTitleSize` (`coverTitle.test.ts`) and a measurement in a
 * real engine (`e2e/admin.spec.ts`); what this file pins is that the card
 * spends the size it is HANDED rather than one of its own — which is the half
 * that would otherwise let §2.7's preview fitter draw this chip.
 * Depends on: react, react-dom/client, vitest (jsdom),
 * ../../../lib/admin/readOverview, ./LiveBookCard.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import type { LiveBook } from '../../../lib/admin/readOverview'
import { LiveBookCard } from './LiveBookCard'

const roots: Root[] = []

/** The book as `readOverview` hands it over. */
const BOOK: LiveBook = {
  title: 'Wanderings',
  years: '2025 — 2026',
  cloth: '#2f4a47',
  titleSizePx: 13,
  summary: '33 pages · 13 bookmarks · 4 galleries open',
  publishedAt: '26 Aug 2026 · 19:04',
}

/**
 * Renders the card and hands back the host element.
 * @param book - The book to draw.
 * @returns The host element.
 */
const renderCard = (book: LiveBook = BOOK): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(<LiveBookCard book={book} />)
  })
  return host
}

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount()
  })
  document.body.replaceChildren()
})

describe('LiveBookCard', () => {
  it('draws the title and the years inside the chip', () => {
    const chip = renderCard().querySelector('[data-book-chip]')

    expect([
      chip?.querySelector('[data-book-chip-title]')?.textContent,
      chip?.querySelector('[data-book-chip-years]')?.textContent,
    ]).toEqual(['Wanderings', '2025 — 2026'])
  })

  it('spends the fitted size it was handed, rather than a size of its own', () => {
    const title = renderCard().querySelector<HTMLElement>('[data-book-chip-title]')

    expect(title?.style.getPropertyValue('--td-overview-chip-title')).toBe('13px')
  })

  it('draws the chip in the cloth the cover screen chose', () => {
    expect(
      renderCard().querySelector<HTMLElement>('[data-book-chip]')?.style.getPropertyValue('--td-overview-cloth'),
    ).toBe('#2f4a47')
  })

  it('prints the summary and the publish date', () => {
    const host = renderCard()

    expect([
      host.querySelector('[data-book-summary]')?.textContent,
      host.querySelector('[data-book-published]')?.textContent,
    ]).toEqual(['33 pages · 13 bookmarks · 4 galleries open', 'Published 26 Aug 2026 · 19:04'])
  })

  it('says the book has never gone out rather than printing "Published null"', () => {
    expect(renderCard({ ...BOOK, publishedAt: null }).querySelector('[data-book-published]')?.textContent).toBe(
      'Never published',
    )
  })

  it('opens the live book at the diary’s own first page', () => {
    expect(renderCard().querySelector('[data-book-open]')?.getAttribute('href')).toBe('/p/1')
  })

  it('offers a copy control beside it, pointed at the same address', () => {
    expect(renderCard().querySelector('[data-copy-link]')?.getAttribute('data-copy-href')).toBe('/p/1')
  })
})
