/**
 * Book.test.tsx — the composition of frame, scaled design box and page stack.
 *
 * Leaf geometry, flip timing, key handling and scale arithmetic each have
 * their own tests (`Leaf.test.tsx`, `useFlip.test.tsx`, `useTurnKeys.test.tsx`,
 * `EdgeStrip.test.tsx`, `useBookScale.test.tsx`, and the domain's own
 * 100%-covered suites). What is asserted here is only what the composition
 * adds: one leaf per page in the bundle, the reader opening on the page they
 * asked for, the fixed design box carrying a measured scale, the handoff's
 * frame parts all present, a single `main` landmark around the whole book -
 * and, from Task 8, that every trigger is actually WIRED to the machine.
 *
 * A wiring test asserts the turn has STARTED, not that it has finished: the
 * book turns at the handoff's 900ms default, and a suite that waited a second
 * per trigger to watch a committed index would be a slow way to re-test
 * `useFlip`, which already covers commit. What a started turn shows in the
 * DOM is its destination leaf becoming visible - and, for a bookmark jump,
 * WHICH leaf that turn departs from, which is the anchor rule made observable.
 * Depends on: react, react-dom/client, @travel-diary/domain, vitest (jsdom).
 */
import {
  deriveBookmarks,
  deriveContents,
  derivePages,
  pageCounter,
  type BookBundle,
} from '@travel-diary/domain/bookBundle'
import { journeyId, type JourneyId } from '@travel-diary/domain/ids'
import { aJourney } from '@travel-diary/domain/testing/factories'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { Book } from './Book'

/** Brands a test journey id, so two fixtures in one book are never the same journey (CLAUDE.md §7). */
const anId = (raw: string): JourneyId => {
  const branded = journeyId(raw)
  if (!branded.ok) throw new Error(branded.error)
  return branded.value
}

/** A small but real bundle: two journeys, so Cover + Contents + 6 + About = 9 pages. */
const aBundle = (): BookBundle => {
  const pages = derivePages([
    aJourney({ id: anId('tokyo'), slug: 'tokyo', name: 'Tokyo', place: 'Japan' }),
    aJourney({ id: anId('lisbon'), slug: 'lisbon', name: 'Lisbon', place: 'Portugal' }),
  ])
  return { pages, contents: deriveContents(pages), bookmarks: deriveBookmarks(pages) }
}

const roots: Root[] = []

const renderBook = (initialIndex: number, bundle: BookBundle = aBundle()): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(<Book bundle={bundle} initialIndex={initialIndex} />)
  })
  return host
}

/** One element, asserted present so no test needs a non-null assertion (CLAUDE.md §3.1). */
const one = (host: HTMLElement, selector: string): HTMLElement => {
  const found = host.querySelector<HTMLElement>(selector)
  if (found === null) throw new Error(`the book rendered no ${selector}`)
  return found
}

/** Clicks one of the book's own controls, asserted present so no test needs a non-null assertion. */
const click = (host: HTMLElement, selector: string): void => {
  const control = one(host, selector)
  act(() => {
    control.click()
  })
}

/** Presses one key on the document, the way a reader with focus nowhere in particular would. */
const pressKey = (key: string): void => {
  act(() => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

/** The `data-leaf` indices of every leaf the reader can currently see. */
const visibleLeaves = (host: HTMLElement): string[] =>
  [...host.querySelectorAll<HTMLElement>('[data-leaf]')]
    .filter((leaf) => leaf.style.visibility === 'visible')
    .map((leaf) => leaf.dataset['leaf'] ?? 'unnumbered')
    .sort()

/** Whether each of the named controls refuses input, in the order they were asked for. */
const disabledStates = (host: HTMLElement, selectors: readonly string[]): boolean[] =>
  selectors.map((selector) => one(host, selector).hasAttribute('disabled'))

afterEach(() => {
  for (const root of roots) {
    act(() => {
      root.unmount()
    })
  }
  roots.length = 0
  document.body.innerHTML = ''
})

describe('Book', () => {
  it('renders one leaf for every page in the reading sequence', () => {
    const host = renderBook(0)

    expect(host.querySelectorAll('[data-leaf]')).toHaveLength(aBundle().pages.length)
  })

  it('opens on the page the reader asked for', () => {
    const host = renderBook(3)

    expect(one(host, '[data-leaf="3"]').style.visibility).toBe('visible')
  })

  it('leaves every other leaf hidden, so no mirrored content is stranded on screen', () => {
    const host = renderBook(3)

    const visible = [...host.querySelectorAll<HTMLElement>('[data-leaf]')].filter(
      (leaf) => leaf.style.visibility === 'visible',
    )
    expect(visible).toHaveLength(1)
  })

  it('scales the design box rather than reflowing it', () => {
    const host = renderBook(0)

    expect(one(host, '[data-design-box]').style.transform).toMatch(/^scale\(/)
  })

  it('wraps the whole book in a single main landmark, not one per leaf', () => {
    const host = renderBook(0)

    expect(host.querySelectorAll('main')).toHaveLength(1)
  })

  it('renders the spine strip the handoff puts down the left of the board', () => {
    const host = renderBook(0)

    expect(one(host, '[data-spine]')).toBeTruthy()
  })

  it('renders the fore-edge page-stack strip the handoff puts down the right of the board', () => {
    const host = renderBook(0)

    expect(one(host, '[data-fore-edge]')).toBeTruthy()
  })

  it('renders the page content of the page it opened on', () => {
    const host = renderBook(2)

    expect(one(host, '[data-leaf="2"]').textContent).toContain('Tokyo')
  })

  it('renders a page-edge turn strip down each side of the book', () => {
    const host = renderBook(2)

    expect(disabledStates(host, ['[data-edge="left"]', '[data-edge="right"]'])).toEqual([false, false])
  })

  it('turns forward when the reader clicks the right page-edge strip', () => {
    const host = renderBook(2)

    click(host, '[data-edge="right"]')

    // A turn that has armed reveals its destination leaf; see this file's header.
    expect(visibleLeaves(host)).toContain('3')
  })

  it('turns back when the reader clicks the left page-edge strip', () => {
    const host = renderBook(2)

    click(host, '[data-edge="left"]')

    expect(visibleLeaves(host)).toContain('1')
  })

  it('turns forward when the reader clicks the next arrow', () => {
    const host = renderBook(2)

    click(host, '[data-nav="next"]')

    expect(visibleLeaves(host)).toContain('3')
  })

  it('turns back when the reader clicks the previous arrow', () => {
    const host = renderBook(2)

    click(host, '[data-nav="prev"]')

    expect(visibleLeaves(host)).toContain('1')
  })

  it('offers no way back from the first page of the book', () => {
    const host = renderBook(0)

    expect(disabledStates(host, ['[data-nav="prev"]', '[data-edge="left"]'])).toEqual([true, true])
  })

  it('offers no way forward from the last page of the book', () => {
    const host = renderBook(aBundle().pages.length - 1)

    expect(disabledStates(host, ['[data-nav="next"]', '[data-edge="right"]'])).toEqual([true, true])
  })

  it('turns forward when the reader presses the forward key anywhere on the page', () => {
    const host = renderBook(2)

    pressKey('ArrowRight')

    expect(visibleLeaves(host)).toContain('3')
  })

  it('turns back when the reader presses the backward key anywhere on the page', () => {
    const host = renderBook(2)

    pressKey('PageUp')

    expect(visibleLeaves(host)).toContain('1')
  })

  it('renders one bookmark tab for every tab the rail derives', () => {
    const host = renderBook(0)

    expect(host.querySelectorAll('[data-bookmark]')).toHaveLength(aBundle().bookmarks.length)
  })

  it('renders no tab for a bookmark that addresses a page the book does not have', () => {
    // `BookBundle` crosses a serialization boundary, so a rail and a reading
    // sequence that disagree is a state this client can be handed. Such a tab
    // renders nothing, rather than taking the whole rail down with it.
    const bundle = aBundle()
    const host = renderBook(0, {
      ...bundle,
      bookmarks: [...bundle.bookmarks, { kind: 'about', startIndex: bundle.pages.length + 4, span: 1 }],
    })

    expect(host.querySelectorAll('[data-bookmark]')).toHaveLength(bundle.bookmarks.length)
  })

  it('anchors a bookmark jump one page from its target, so the turn plays in the direction of travel', () => {
    // From the last page of the book to Tokyo's notes page (leaf 2). The
    // anchor rule (handoff README, "Triggers") says the turn must depart from
    // leaf 3, one step from the target - never from leaf 8, which would sweep
    // the whole book in a single turn and animate a transform no page turn
    // ever produces.
    const host = renderBook(aBundle().pages.length - 1)

    click(host, '[data-bookmark="2"]')

    expect(visibleLeaves(host)).toEqual(['2', '3'])
  })

  it('shows the page counter the handoff puts under the book', () => {
    const host = renderBook(2)

    expect(one(host, '[data-counter]').textContent).toBe(pageCounter(3, aBundle().pages.length))
  })

  it('writes the page it is showing into the URL, so the address bar stays shareable', () => {
    renderBook(3)

    expect(window.location.pathname).toBe('/p/4')
  })
})
