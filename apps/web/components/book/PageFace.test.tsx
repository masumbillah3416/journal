/**
 * PageFace.test.tsx — the dispatch each leaf's front face performs.
 *
 * This file asserts WHICH page component each `BookPage` kind reaches, and
 * that the Contents rows are real anchors to the right pages; what each
 * designed page then prints is asserted where it lives, in
 * `../pages/Cover.test.tsx`, `Contents.test.tsx`, `Notes.test.tsx`,
 * `FramesI.test.tsx` and `FramesII.test.tsx`. The anchor case
 * stays here because it is what `e2e/book.spec.ts`'s pointer-events case
 * clicks — a link that is not actually a link, or points at the wrong page,
 * would make that proof meaningless.
 * Depends on: react, react-dom/client, @travel-diary/domain, vitest (jsdom).
 */
import {
  deriveContents,
  derivePages,
  pageLabel,
  type BookPage,
  type ContentsEntry,
  type Slot,
} from '@travel-diary/domain/bookBundle'
import { journeyId, type JourneyId } from '@travel-diary/domain/ids'
import { aBookChrome, aJourney } from '@travel-diary/domain/testing/factories'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFERRED_PHOTOGRAPH_SRC } from '../pages/deferredPhotograph'
import { ImageWindow } from '../pages/Photograph'
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

/** A hero slot fixture, so a notes page here has a photograph to withhold. */
const aHeroSlot = (): Slot => ({
  role: 'hero',
  src: '/api/media/file/tokyo-hero-800x800.png',
  alt: 'Shibuya crossing',
  caption: 'Crossing at Shibuya',
  focalX: 50,
  focalY: 50,
})

/**
 * The derived notes page with a resolved slot on it, narrowed rather than
 * cast (CLAUDE.md §3.1) so this fixture needs no `as`.
 * @param slots - The slots to resolve onto the page.
 * @returns The notes page, carrying those slots.
 */
const aNotesPageCarrying = (...slots: readonly Slot[]): BookPage => {
  const page = pages.find((candidate) => candidate.kind === 'notes')
  if (page === undefined || page.kind !== 'notes') throw new Error('the derived reading sequence has no notes page')
  return { ...page, slots }
}

const roots: Root[] = []

/**
 * Renders one page face on leaf 0 and hands back the host element, with the
 * image window published as a context the way `Book.tsx` publishes it.
 */
const renderFace = (page: BookPage, entries: readonly ContentsEntry[] = contents, loadsImages = true): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(
      <ImageWindow value={[loadsImages]}>
        <PageFace page={page} contents={entries} chrome={aBookChrome()} totalPages={pages.length} leafIndex={0} />
      </ImageWindow>,
    )
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
  it('dispatches the cover page to the designed Cover, not to a generic label', () => {
    const host = renderFace(pageOfKind('cover'))

    expect(host.querySelector('[data-page]')?.getAttribute('data-page')).toBe('cover')
  })

  it('dispatches the contents page to the designed Contents', () => {
    const host = renderFace(pageOfKind('contents'))

    expect(host.querySelector('[data-page]')?.getAttribute('data-page')).toBe('contents')
  })

  it('names the about page with the label the domain derives for it', () => {
    const host = renderFace(pageOfKind('about'))

    expect(host.querySelector('h1')?.textContent).toBe(pageLabel(pageOfKind('about')))
  })

  it('dispatches a journey’s first frames page to the designed FramesI', () => {
    const host = renderFace(pageOfKind('frames-i'))

    expect(host.querySelector('[data-page]')?.getAttribute('data-page')).toBe('frames-i')
  })

  it('dispatches a journey’s second frames page to the designed FramesII', () => {
    const host = renderFace(pageOfKind('frames-ii'))

    expect(host.querySelector('[data-page]')?.getAttribute('data-page')).toBe('frames-ii')
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
      contents.map((entry, position) => {
        const number = String(position + 1).padStart(2, '0')
        return `${number}${entry.name}${entry.place} · ${entry.dates}p. ${String(entry.pageNumber)}`
      }),
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

  it("passes the leaf's own index down to the page that owns the photographs", () => {
    // The window is decided once, in the domain, and published as a context;
    // what a face has to carry is WHICH LEAF it is printed on, so the
    // photographs inside it look the right entry up. A face that dropped that
    // on the floor would leave every photograph reading leaf 0's entry, which
    // on any other page is the wrong answer in both directions.
    const withSlots = aNotesPageCarrying(aHeroSlot())

    const deferred = renderFace(withSlots, contents, false)
    const loaded = renderFace(withSlots, contents, true)

    expect(deferred.querySelector('[data-hero]')?.getAttribute('src')).toBe(DEFERRED_PHOTOGRAPH_SRC)
    expect(loaded.querySelector('[data-hero]')?.getAttribute('src')).toBe(aHeroSlot().src)
  })
})
