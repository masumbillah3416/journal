/**
 * BookmarkDrawer.test.tsx — the drawer's modal contract and its tab list.
 *
 * `isRailTabActive` and `deriveRail` are unit-tested to 100% in
 * `@travel-diary/domain`; nothing here re-tests which pages a tab spans. What
 * is asserted here is the part a reader meets: that every tab is a real
 * `/p/<n>` link, that the tab covering the reader's page is marked
 * `aria-current`, and the four clauses of "it is a real modal" - a named
 * dialog, focus moved in on open, Tab trapped while open, and Escape closing
 * it. Focus RESTORATION is `MobileDiary.tsx`'s and is asserted there, because
 * this component is unmounted by the time it has to happen.
 *
 * `next/link` is STOOD IN FOR as a plain anchor, not mocked-what-we-own
 * (CLAUDE.md §2.3): it is the App Router's link, which reads a router off a
 * context no jsdom test mounts. What this file asserts about it - the `href`
 * it carries - is the part the stand-in keeps.
 * Depends on: react, react-dom/client, vitest (jsdom environment).
 */
import type { RailTab } from '@travel-diary/domain/bookBundle'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BookmarkDrawer } from './BookmarkDrawer'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { readonly href: string; readonly children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

const tabs: readonly RailTab[] = [
  { startIndex: 0, span: 1, name: 'Cover', sub: 'the front', tint: undefined },
  { startIndex: 1, span: 1, name: 'Contents', sub: 'index', tint: undefined },
  { startIndex: 2, span: 3, name: 'Tokyo', sub: 'March 2025', tint: '#3d817e' },
  { startIndex: 5, span: 3, name: 'Lisbon', sub: 'May 2025', tint: '#a06b3e' },
]

const roots: Root[] = []

const render = (
  overrides: Partial<React.ComponentProps<typeof BookmarkDrawer>> = {},
): { readonly container: HTMLElement; readonly root: Root } => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => {
    root.render(<BookmarkDrawer tabs={tabs} pageIndex={3} onClose={() => undefined} {...overrides} />)
  })
  return { container, root }
}

const one = (container: HTMLElement, selector: string): HTMLElement => {
  const found = container.querySelector(selector)
  if (!(found instanceof HTMLElement)) throw new Error(`no ${selector} in the drawer`)
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

describe('BookmarkDrawer', () => {
  it('draws one tab per bookmark, in rail order', () => {
    const { container } = render()

    expect([...container.querySelectorAll('[data-tab-name]')].map((name) => name.textContent)).toEqual([
      'Cover',
      'Contents',
      'Tokyo',
      'Lisbon',
    ])
  })

  it('points every tab at the real /p/<n> path it opens', () => {
    const { container } = render()

    expect([...container.querySelectorAll('[data-bookmark]')].map((tab) => tab.getAttribute('href'))).toEqual([
      '/p/1',
      '/p/2',
      '/p/3',
      '/p/6',
    ])
  })

  it('marks the tab covering the reader’s page as the current one', () => {
    // Page index 3 is Tokyo's second page, inside its three-page span.
    const { container } = render()

    expect(one(container, '[aria-current="page"]').getAttribute('data-bookmark')).toBe('2')
  })

  it('paints a journey tab with the journey’s own accent', () => {
    const { container } = render()
    const tokyo = one(container, '[data-bookmark="2"]')

    expect(one(tokyo, '[data-tab-tint]').style.background).toBe('rgb(61, 129, 126)')
  })

  it('leaves the three book-wide tabs to the stylesheet’s default tint', () => {
    const { container } = render()
    const cover = one(container, '[data-bookmark="0"]')

    expect(one(cover, '[data-tab-tint]').style.background).toBe('')
  })

  it('is a dialog named by its own visible heading', () => {
    const { container } = render()
    const drawer = one(container, '[data-drawer]')
    const named = drawer.getAttribute('aria-labelledby')

    expect({
      role: drawer.getAttribute('role'),
      modal: drawer.getAttribute('aria-modal'),
      name: named === null ? null : document.getElementById(named)?.textContent,
    }).toEqual({ role: 'dialog', modal: 'true', name: 'Bookmarks' })
  })

  it('moves focus onto the way out when it opens', () => {
    const { container } = render()

    expect(document.activeElement).toBe(one(container, '[data-drawer-close]'))
  })

  it('closes when the reader presses the close button', () => {
    let closed = 0
    const { container } = render({
      onClose: () => {
        closed += 1
      },
    })

    act(() => {
      one(container, '[data-drawer-close]').click()
    })

    expect(closed).toBe(1)
  })

  it('closes when the reader taps the scrim', () => {
    let closed = 0
    const { container } = render({
      onClose: () => {
        closed += 1
      },
    })

    act(() => {
      one(container, '[data-drawer-scrim]').click()
    })

    expect(closed).toBe(1)
  })

  it('closes when the reader presses Escape', () => {
    let closed = 0
    render({
      onClose: () => {
        closed += 1
      },
    })

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })

    expect(closed).toBe(1)
  })

  it('ignores a key that is not Escape', () => {
    let closed = 0
    render({
      onClose: () => {
        closed += 1
      },
    })

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))
    })

    expect(closed).toBe(0)
  })

  it('stops listening for Escape once it is gone', () => {
    let closed = 0
    const { root } = render({
      onClose: () => {
        closed += 1
      },
    })

    act(() => {
      root.unmount()
    })
    roots.length = 0
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })

    expect(closed).toBe(0)
  })

  it('wraps Tab from the last tab back onto the close button', () => {
    const { container } = render()
    const controls = [...container.querySelectorAll<HTMLElement>('a[href], button')]
    const last = controls.at(-1)
    last?.focus()

    act(() => {
      one(container, '[data-drawer]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    })

    expect(document.activeElement).toBe(one(container, '[data-drawer-close]'))
  })

  it('wraps Shift+Tab from the close button onto the last tab', () => {
    const { container } = render()
    one(container, '[data-drawer-close]').focus()

    act(() => {
      one(container, '[data-drawer]').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }),
      )
    })

    expect(document.activeElement).toBe(one(container, '[data-bookmark="5"]'))
  })

  it('leaves Tab alone in the middle of the list, so the reader walks the tabs', () => {
    const { container } = render()
    const middle = one(container, '[data-bookmark="1"]')
    middle.focus()

    act(() => {
      one(container, '[data-drawer]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    })

    expect(document.activeElement).toBe(middle)
  })

  it('ignores a key that is not Tab, so typing does not move focus', () => {
    const { container } = render()
    const last = [...container.querySelectorAll<HTMLElement>('a[href], button')].at(-1)
    last?.focus()

    act(() => {
      one(container, '[data-drawer]').dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }))
    })

    expect(document.activeElement).toBe(last)
  })

  it('closes when a tab is tapped, so a tap on the page the reader is already on is not a dead end', () => {
    let closed = 0
    const { container } = render({
      onClose: () => {
        closed += 1
      },
    })

    // The default action is suppressed: jsdom cannot navigate, and the
    // navigation itself is Next's - what this case is about is the drawer.
    container.addEventListener('click', (event) => {
      event.preventDefault()
    })
    act(() => {
      one(container, '[data-bookmark="2"]').click()
    })

    expect(closed).toBe(1)
  })

  it('draws an empty list rather than throwing for a book with no bookmarks', () => {
    const { container } = render({ tabs: [] })

    expect(one(container, '[data-drawer-tabs]').childElementCount).toBe(0)
  })
})
