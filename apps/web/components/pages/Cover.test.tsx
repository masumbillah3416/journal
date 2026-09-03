/**
 * Cover.test.tsx — what the front cover prints, and what it omits.
 *
 * jsdom performs no layout, so nothing here asserts a measurement — the
 * cover's absolute geometry is guarded by the visual-regression baselines in
 * `e2e/visual.spec.ts` and its contrast by `e2e/a11y.spec.ts`. What IS
 * testable without layout is every decision the component makes: the title's
 * computed font size, which lines it omits when an editor has cleared them,
 * whether the decorations are drawn at all, and that nothing decorative is
 * exposed to the accessibility tree.
 *
 * The copy is asserted verbatim, not by regex. SCREENS.md §1.1's "Travel
 * Diary" eyebrow and "Kept by {owner}" line are final copy, and a test that
 * matched them loosely would let a paraphrase through.
 * Depends on: react, react-dom/client, @travel-diary/domain, vitest (jsdom).
 */
import { COVER_TITLE_AVAILABLE_PX, fitTitleSize } from '@travel-diary/domain/coverTitle'
import { aBookChrome } from '@travel-diary/domain/testing/factories'
import type { BookChrome } from '@travel-diary/domain/bookBundle'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { Cover } from './Cover'

const roots: Root[] = []

/** Renders the cover with the given chrome and hands back the host element. */
const renderCover = (overrides: Partial<BookChrome> = {}): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(<Cover chrome={aBookChrome(overrides)} />)
  })
  return host
}

afterEach(() => {
  for (const root of roots) {
    act(() => {
      root.unmount()
    })
  }
  roots.length = 0
  document.body.innerHTML = ''
})

describe('Cover', () => {
  it('prints the title from the book global as the page’s level-one heading', () => {
    const host = renderCover({ title: 'Wanderings' })

    expect(host.querySelector('h1')?.textContent).toBe('Wanderings')
  })

  it('sizes the title to fit, at the size the domain computes for it', () => {
    const host = renderCover({ title: 'Wanderings' })

    expect(host.querySelector('h1')?.style.fontSize).toBe(
      `${String(fitTitleSize('Wanderings', COVER_TITLE_AVAILABLE_PX))}px`,
    )
  })

  it('shrinks a long title instead of leaving it at the designed 124px', () => {
    const host = renderCover({ title: 'A Year of Small Detours and Longer Ones' })

    // 39 characters: floor(0.9 x 1106 / (39 x 0.4)) = 63.
    expect(host.querySelector('h1')?.style.fontSize).toBe('63px')
  })

  it('omits the heading entirely when an editor has cleared the title', () => {
    // An empty <h1> is an axe violation (`empty-heading`), and the Contents
    // page's own static heading keeps the book's level-one heading present.
    const host = renderCover({ title: '' })

    expect(host.querySelector('h1')).toBeNull()
  })

  it('prints the eyebrow exactly as the handoff words it', () => {
    const host = renderCover()

    expect(host.textContent).toContain('Travel Diary')
  })

  it('prints the owner after "Kept by", as one line', () => {
    const host = renderCover({ owner: 'M. Alvarez' })

    expect(host.textContent).toContain('Kept by M. Alvarez')
  })

  it('omits the "Kept by" line rather than printing a label with no name', () => {
    const host = renderCover({ owner: '' })

    expect(host.textContent).not.toContain('Kept by')
  })

  it('prints the subtitle from the book global', () => {
    const host = renderCover({ subtitle: 'field notes, photographs and other scraps' })

    expect(host.textContent).toContain('field notes, photographs and other scraps')
  })

  it('omits the subtitle when an editor has cleared it', () => {
    const host = renderCover({ subtitle: '' })

    expect(host.querySelectorAll('p')).toHaveLength(3)
  })

  it('prints the years line from the book global', () => {
    const host = renderCover({ yearsShown: '2025 — 2026' })

    expect(host.textContent).toContain('2025 — 2026')
  })

  it('paints the cloth colour the editor chose, not a hardcoded one', () => {
    const host = renderCover({ coverCloth: '#7a3b32' })

    expect(host.querySelector('[data-page="cover"]')?.getAttribute('style')).toContain('--cover-cloth: #7a3b32')
  })

  it('draws the washi strip and the airmail stamp when decorations are on', () => {
    const host = renderCover({ showDecorations: true })

    expect([...host.querySelectorAll('[data-decoration]')].map((node) => node.getAttribute('data-decoration'))).toEqual(
      ['washi', 'stamp'],
    )
  })

  it('draws no decoration at all when the book global turns them off', () => {
    const host = renderCover({ showDecorations: false })

    expect(host.querySelectorAll('[data-decoration]')).toHaveLength(0)
  })

  it('hides every decorative element from the accessibility tree', () => {
    // The two inset rules, the two hairlines, the washi strip and the stamp
    // carry no information; "POSTA AEREA" is printed furniture on a fictional
    // stamp, not content a screen reader should read between the title and
    // the owner's name.
    // `closest`, not the element's own attribute: `aria-hidden` is inherited
    // by a subtree, so the stamp's inner face is already hidden by its mount
    // and asserting per-element would demand a redundant second attribute.
    const host = renderCover({ showDecorations: true })
    const exposed = [...host.querySelectorAll('div')].filter((node) => node.closest('[aria-hidden="true"]') === null)

    expect(exposed.map((node) => node.className)).toEqual(['column'])
  })
})
