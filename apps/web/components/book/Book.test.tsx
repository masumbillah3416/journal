/**
 * Book.test.tsx — the composition of frame, scaled design box and page stack.
 *
 * Leaf geometry, flip timing and scale arithmetic each have their own tests
 * (`Leaf.test.tsx`, `useFlip.test.tsx`, `useBookScale.test.tsx`, and the
 * domain's own 100%-covered suites). What is asserted here is only what the
 * composition adds: one leaf per page in the bundle, the reader opening on
 * the page they asked for, the fixed design box carrying a measured scale,
 * the handoff's frame parts all present, and a single `main` landmark around
 * the whole book rather than one per leaf.
 * Depends on: react, react-dom/client, @travel-diary/domain, vitest (jsdom).
 */
import { deriveBookmarks, deriveContents, derivePages, type BookBundle } from '@travel-diary/domain/bookBundle'
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

const renderBook = (initialIndex: number): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(<Book bundle={aBundle()} initialIndex={initialIndex} />)
  })
  return host
}

/** One element, asserted present so no test needs a non-null assertion (CLAUDE.md §3.1). */
const one = (host: HTMLElement, selector: string): HTMLElement => {
  const found = host.querySelector<HTMLElement>(selector)
  if (found === null) throw new Error(`the book rendered no ${selector}`)
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
})
