/**
 * MobileHeader.test.tsx — what the dark bar over the mobile reading mode prints.
 *
 * `pageCounter` is unit-tested to 100% in `@travel-diary/domain`; what is
 * asserted here is that this bar reaches for it rather than formatting a
 * counter of its own, that the burger is a labelled control whose state a
 * screen reader can hear, and that an empty book title prints nothing rather
 * than an empty line.
 * Depends on: react, react-dom/client, vitest (jsdom environment).
 */
import { createRef, act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { MobileHeader } from './MobileHeader'

const roots: Root[] = []

const render = (overrides: Partial<React.ComponentProps<typeof MobileHeader>> = {}): HTMLElement => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => {
    root.render(
      <MobileHeader
        bookTitle="Wanderings"
        heading="Tokyo"
        pageNumber={3}
        totalPages={33}
        drawerOpen={false}
        onOpenDrawer={() => undefined}
        burgerRef={createRef<HTMLButtonElement>()}
        {...overrides}
      />,
    )
  })
  return container
}

/** The one element matching a selector, or a loud failure. */
const one = (container: HTMLElement, selector: string): HTMLElement => {
  const found = container.querySelector(selector)
  if (!(found instanceof HTMLElement)) throw new Error(`no ${selector} in the header`)
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

describe('MobileHeader', () => {
  it('prints the counter the domain derives, zero-padded to the book’s length', () => {
    const container = render()

    expect(one(container, '[data-counter]').textContent).toBe('03 / 33')
  })

  it('prints the book’s title over this page’s own short name', () => {
    const container = render()

    expect({
      eyebrow: one(container, '[data-header-eyebrow]').textContent,
      name: one(container, '[data-header-name]').textContent,
    }).toEqual({ eyebrow: 'Wanderings', name: 'Tokyo' })
  })

  it('prints no eyebrow at all for a book whose title an editor has cleared', () => {
    const container = render({ bookTitle: '' })

    expect(container.querySelector('[data-header-eyebrow]')).toBe(null)
  })

  it('names the burger for a reader who cannot see three bars', () => {
    const container = render()

    expect(one(container, '[data-burger]').getAttribute('aria-label')).toBe('Bookmarks')
  })

  it('says the drawer is shut while it is shut', () => {
    const container = render()

    expect(one(container, '[data-burger]').getAttribute('aria-expanded')).toBe('false')
  })

  it('says the drawer is open while it is open', () => {
    const container = render({ drawerOpen: true })

    expect(one(container, '[data-burger]').getAttribute('aria-expanded')).toBe('true')
  })

  it('opens the drawer when the burger is pressed', () => {
    let opened = 0
    const container = render({
      onOpenDrawer: () => {
        opened += 1
      },
    })

    act(() => {
      one(container, '[data-burger]').click()
    })

    expect(opened).toBe(1)
  })

  it('renders no heading of its own, so the page below it owns the document’s only h1', () => {
    const container = render()

    expect(container.querySelectorAll('h1, h2, h3').length).toBe(0)
  })
})
