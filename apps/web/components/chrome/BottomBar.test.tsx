/**
 * BottomBar.test.tsx — the counter, the page label under it, and the two
 * arrows either side.
 *
 * The bar's geometry (58px tall, the 44px circular buttons, the 210px column
 * between them) is CSS and is measured in a real layout engine by
 * `e2e/chrome.spec.ts` — jsdom performs no layout, and the defect this bar
 * has already produced once was a control laid out UNDER the bookmark rail,
 * which only a layout engine can see. What is asserted here is what jsdom can
 * see: that the counter is the one the domain derives for this page, that the
 * page label the sweep found missing is printed under it (DIARY-005), that
 * each arrow asks the book to turn, and that an arrow with nowhere to go is
 * dead rather than firing a turn the machine would only refuse.
 * Depends on: react, react-dom/client, @travel-diary/domain, vitest (jsdom).
 */
import { pageCounter } from '@travel-diary/domain/bookBundle'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { BottomBar } from './BottomBar'

const roots: Root[] = []

/** How many turns in each direction the bar asked for. */
interface Turns {
  readonly back: number
  readonly forward: number
}

/** Renders the bar on a given page of a 33-page book, and hands back the turns it asked for. */
const renderBar = (
  pageNumber: number,
  options: { readonly label?: string; readonly totalPages?: number } = {},
): { readonly host: HTMLElement; readonly turns: () => Turns } => {
  const turns = { back: 0, forward: 0 }
  const totalPages = options.totalPages ?? 33
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(
      <BottomBar
        pageNumber={pageNumber}
        totalPages={totalPages}
        label={options.label ?? 'Tokyo — Notes'}
        canGoBack={pageNumber > 1}
        canGoForward={pageNumber < totalPages}
        onBack={() => {
          turns.back += 1
        }}
        onForward={() => {
          turns.forward += 1
        }}
      />,
    )
  })
  return { host, turns: () => turns }
}

/** One element, asserted present so no test needs a non-null assertion (CLAUDE.md §3.1). */
const one = (host: HTMLElement, selector: string): HTMLElement => {
  const found = host.querySelector<HTMLElement>(selector)
  if (found === null) throw new Error(`the bottom bar rendered no ${selector}`)
  return found
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

describe('BottomBar', () => {
  it('prints the counter the domain derives for the page the reader is on', () => {
    const { host } = renderBar(3)

    expect(one(host, '[data-counter]').textContent).toBe(pageCounter(3, 33))
  })

  it('prints the counter for the last page of the book, not one past it', () => {
    // The off-by-one a counter invites: page 33 of 33, never 34.
    const { host } = renderBar(33)

    expect(one(host, '[data-counter]').textContent).toBe('33 / 33')
  })

  it('prints the page label under the counter, which the sweep found missing', () => {
    const { host } = renderBar(3, { label: 'Tokyo — Frames I' })

    expect(one(host, '[data-page-label]').textContent).toBe('Tokyo — Frames I')
  })

  it('asks the book to turn forward when the reader clicks the next arrow', () => {
    const { host, turns } = renderBar(3)

    act(() => {
      one(host, '[data-nav="next"]').click()
    })

    expect(turns()).toEqual({ back: 0, forward: 1 })
  })

  it('asks the book to turn back when the reader clicks the previous arrow', () => {
    const { host, turns } = renderBar(3)

    act(() => {
      one(host, '[data-nav="prev"]').click()
    })

    expect(turns()).toEqual({ back: 1, forward: 0 })
  })

  it('offers no way back from the first page of the book', () => {
    const { host } = renderBar(1)

    expect(one(host, '[data-nav="prev"]').hasAttribute('disabled')).toBe(true)
  })

  it('offers no way forward from the last page of the book', () => {
    const { host } = renderBar(33)

    expect(one(host, '[data-nav="next"]').hasAttribute('disabled')).toBe(true)
  })

  it('names both arrows, so a screen reader can tell them apart', () => {
    const { host } = renderBar(3)

    expect([
      one(host, '[data-nav="prev"]').getAttribute('aria-label'),
      one(host, '[data-nav="next"]').getAttribute('aria-label'),
    ]).toEqual(['Previous page', 'Next page'])
  })

  it('hides the arrow glyphs from a screen reader, which reads the labels instead', () => {
    // The glyphs are arrows drawn as text; announced, they would be read out
    // after the label that already says what the button does.
    const { host } = renderBar(3)

    expect([...host.querySelectorAll('[data-nav] > *')].map((glyph) => glyph.getAttribute('aria-hidden'))).toEqual([
      'true',
      'true',
    ])
  })
})
