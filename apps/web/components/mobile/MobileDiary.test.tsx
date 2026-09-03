/**
 * MobileDiary.test.tsx — the mobile surface's chrome and its four triggers.
 *
 * What is asserted here is only what this composition adds: that the page it
 * is handed is the page it draws, that all four ways to change page end at the
 * same `/p/<n>`, that both arrows are spent at the ends of the book and a
 * swipe there does nothing either, and that the drawer opens, closes and hands
 * focus back to the burger it came from. What the header prints is
 * `MobileHeader.test.tsx`'s, what the drawer contains is
 * `BookmarkDrawer.test.tsx`'s, and the swipe threshold is
 * `packages/domain/src/swipe.test.ts`'s.
 *
 * `next/navigation` and `next/link` are STOOD IN FOR, not mocked-what-we-own
 * (CLAUDE.md §2.3): both read the App Router off a context no jsdom test
 * mounts, and `useRouter` throws outside one - the same treatment
 * `Book.test.tsx` records for the same import. The stand-in router records
 * where it was pushed, which is exactly what a swipe has to be judged on.
 * Depends on: react, react-dom/client, @travel-diary/domain, vitest (jsdom).
 */
import type { RailTab } from '@travel-diary/domain/bookBundle'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MobileDiary } from './MobileDiary'

/** Every path the stand-in router was pushed to, in order. */
let pushed: string[] = []

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: (path: string): void => {
      pushed.push(path)
    },
  }),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { readonly href: string; readonly children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

const bookmarks: readonly RailTab[] = [
  { startIndex: 0, span: 1, name: 'Cover', sub: 'the front', tint: undefined },
  { startIndex: 2, span: 3, name: 'Tokyo', sub: 'March 2025', tint: '#3d817e' },
]

const roots: Root[] = []

const render = (overrides: Partial<React.ComponentProps<typeof MobileDiary>> = {}): HTMLElement => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => {
    root.render(
      <MobileDiary
        bookTitle="Wanderings"
        heading="Tokyo"
        label="Tokyo — Notes"
        bookmarks={bookmarks}
        pageIndex={2}
        totalPages={33}
        {...overrides}
      >
        <p data-page-body="">the page itself</p>
      </MobileDiary>,
    )
  })
  return container
}

const one = (container: HTMLElement, selector: string): HTMLElement => {
  const found = container.querySelector(selector)
  if (!(found instanceof HTMLElement)) throw new Error(`no ${selector} on the surface`)
  return found
}

/** A whole touch gesture on the scrolling column. */
const swipeBy = (container: HTMLElement, dx: number, dy: number): void => {
  const content = one(container, '[data-mobile-content]')
  const start = new Event('touchstart', { bubbles: true })
  Object.defineProperty(start, 'touches', { value: [{ clientX: 200, clientY: 400 }] })
  const end = new Event('touchend', { bubbles: true })
  Object.defineProperty(end, 'changedTouches', { value: [{ clientX: 200 + dx, clientY: 400 + dy }] })

  act(() => {
    content.dispatchEvent(start)
    content.dispatchEvent(end)
  })
}

afterEach(() => {
  for (const root of roots) {
    act(() => {
      root.unmount()
    })
  }
  roots.length = 0
  pushed = []
  document.body.innerHTML = ''
})

describe('MobileDiary', () => {
  it('draws the page it was handed rather than rendering one of its own', () => {
    const container = render()

    expect(one(container, '[data-page-body]').textContent).toBe('the page itself')
  })

  it('makes the scrolling column a named, focusable region, so a keyboard can scroll it', () => {
    // A scrollable element with nothing focusable inside it cannot be scrolled
    // from a keyboard at all - which is the About page exactly, the one page in
    // the book with nothing clickable on it. axe found it on `/p/33`
    // (`scrollable-region-focusable`, impact serious); this is the fast test
    // that keeps it fixed.
    const container = render()
    const content = one(container, '[data-mobile-content]')

    expect({
      role: content.getAttribute('role'),
      name: content.getAttribute('aria-label'),
      tabIndex: content.tabIndex,
    }).toEqual({ role: 'region', name: 'Tokyo — Notes', tabIndex: 0 })
  })

  it('names itself as the mobile surface, so a browser test knows which one it has', () => {
    const container = render()

    expect(one(container, 'main').dataset['readingSurface']).toBe('mobile')
  })

  it('prints the page’s full label between the two arrows', () => {
    const container = render()

    expect(one(container, '[data-page-label]').textContent).toBe('Tokyo — Notes')
  })

  it('points the two arrows at the pages either side of this one', () => {
    const container = render()

    expect({
      prev: one(container, '[data-nav="prev"]').getAttribute('href'),
      next: one(container, '[data-nav="next"]').getAttribute('href'),
    }).toEqual({ prev: '/p/2', next: '/p/4' })
  })

  it('spends the previous arrow on the first page rather than removing it', () => {
    const container = render({ pageIndex: 0 })
    const previous = one(container, '[data-nav="prev"]')

    expect({ tag: previous.tagName, disabled: previous.hasAttribute('disabled') }).toEqual({
      tag: 'BUTTON',
      disabled: true,
    })
  })

  it('spends the next arrow on the last page rather than removing it', () => {
    const container = render({ pageIndex: 32 })
    const next = one(container, '[data-nav="next"]')

    expect({ tag: next.tagName, disabled: next.hasAttribute('disabled') }).toEqual({ tag: 'BUTTON', disabled: true })
  })

  it('turns forward when the reader swipes left', () => {
    const container = render()

    swipeBy(container, -120, 10)

    expect(pushed).toEqual(['/p/4'])
  })

  it('turns back when the reader swipes right', () => {
    const container = render()

    swipeBy(container, 120, 10)

    expect(pushed).toEqual(['/p/2'])
  })

  it('turns no page when the reader scrolls the column', () => {
    const container = render()

    swipeBy(container, 70, 320)

    expect(pushed).toEqual([])
  })

  it('goes nowhere when the reader swipes forward off the end of the book', () => {
    const container = render({ pageIndex: 32 })

    swipeBy(container, -120, 0)

    expect(pushed).toEqual([])
  })

  it('goes nowhere when the reader swipes back off the front of the book', () => {
    const container = render({ pageIndex: 0 })

    swipeBy(container, 120, 0)

    expect(pushed).toEqual([])
  })

  it('keeps the drawer shut until the reader asks for it', () => {
    const container = render()

    expect(container.querySelector('[data-drawer]')).toBe(null)
  })

  it('opens the drawer when the burger is pressed', () => {
    const container = render()

    act(() => {
      one(container, '[data-burger]').click()
    })

    expect(container.querySelector('[data-drawer]')).not.toBe(null)
  })

  it('gives the drawer the same rail and page the surface has', () => {
    const container = render()

    act(() => {
      one(container, '[data-burger]').click()
    })

    expect({
      tabs: [...container.querySelectorAll('[data-bookmark]')].map((tab) => tab.getAttribute('href')),
      current: one(container, '[aria-current="page"]').getAttribute('data-bookmark'),
    }).toEqual({ tabs: ['/p/1', '/p/3'], current: '2' })
  })

  it('closes the drawer and hands focus back to the burger the reader opened it from', () => {
    const container = render()
    const burger = one(container, '[data-burger]')

    act(() => {
      burger.click()
    })
    act(() => {
      one(container, '[data-drawer-close]').click()
    })

    expect({ drawer: container.querySelector('[data-drawer]'), focused: document.activeElement }).toEqual({
      drawer: null,
      focused: burger,
    })
  })

  it('closes the drawer on Escape and still restores focus', () => {
    const container = render()
    const burger = one(container, '[data-burger]')

    act(() => {
      burger.click()
    })
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })

    expect({ drawer: container.querySelector('[data-drawer]'), focused: document.activeElement }).toEqual({
      drawer: null,
      focused: burger,
    })
  })
})
