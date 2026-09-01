/**
 * PageFace.test.tsx — the page content each leaf's front face carries.
 *
 * Only two behaviours exist here and both are asserted: every page is named
 * with the label the domain derives for it, and every Contents row is a real
 * anchor to the page its journey starts on. The second is what
 * `e2e/book.spec.ts`'s pointer-events case clicks — a link that is not
 * actually a link, or points at the wrong page, would make that proof
 * meaningless.
 * Depends on: react, react-dom/client, @travel-diary/domain, vitest (jsdom).
 */
import {
  deriveContents,
  derivePages,
  pageLabel,
  type BookPage,
  type ContentsEntry,
} from '@travel-diary/domain/bookBundle'
import { journeyId, type JourneyId } from '@travel-diary/domain/ids'
import { aJourney } from '@travel-diary/domain/testing/factories'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { PageFace } from './PageFace'

/** Brands a test journey id, so two fixtures in one book are never the same journey (CLAUDE.md §7). */
const anId = (raw: string): JourneyId => {
  const branded = journeyId(raw)
  if (!branded.ok) throw new Error(branded.error)
  return branded.value
}

const journeys = [
  aJourney({ id: anId('tokyo'), slug: 'tokyo', name: 'Tokyo', place: 'Japan' }),
  aJourney({ id: anId('lisbon'), slug: 'lisbon', name: 'Lisbon', place: 'Portugal' }),
]
const pages = derivePages(journeys)
const contents = deriveContents(pages)

const roots: Root[] = []

/** Renders one page face and hands back the host element. */
const renderFace = (page: BookPage, entries: readonly ContentsEntry[] = contents): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(<PageFace page={page} contents={entries} />)
  })
  return host
}

/** The page of a given kind, asserted present so no test needs a non-null assertion. */
const pageOfKind = (kind: BookPage['kind']): BookPage => {
  const found = pages.find((page) => page.kind === kind)
  if (found === undefined) throw new Error(`the derived reading sequence has no ${kind} page`)
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

describe('PageFace', () => {
  it('names the cover with the label the domain derives for it', () => {
    const host = renderFace(pageOfKind('cover'))

    expect(host.querySelector('h1')?.textContent).toBe(pageLabel(pageOfKind('cover')))
  })

  it('names a journey page with its journey and section', () => {
    const host = renderFace(pageOfKind('frames-ii'))

    expect(host.querySelector('h1')?.textContent).toBe('Tokyo — Frames II')
  })

  it('links every contents row to the page its journey starts on', () => {
    const host = renderFace(pageOfKind('contents'))

    expect([...host.querySelectorAll('a')].map((link) => link.getAttribute('href'))).toEqual(
      contents.map((entry) => `/p/${String(entry.pageNumber)}`),
    )
  })

  it('names each contents row after its journey, so a reader can find it by name', () => {
    const host = renderFace(pageOfKind('contents'))

    expect([...host.querySelectorAll('a')].map((link) => link.textContent)).toEqual(
      contents.map((entry) => `${entry.name} — ${entry.place}`),
    )
  })

  it('carries the journey dates on a journey page', () => {
    const host = renderFace(pageOfKind('notes'))

    expect(host.textContent).toContain(journeys[0]?.dates)
  })

  it('renders no links on a page that is not the contents', () => {
    const host = renderFace(pageOfKind('about'))

    expect(host.querySelectorAll('a')).toHaveLength(0)
  })
})
