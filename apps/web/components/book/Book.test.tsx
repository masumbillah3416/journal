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
 *
 * `renderBook` BUILDS THE FACES THE WAY THE ROUTE DOES, and deliberately so.
 * `Book` no longer renders the pages; the `/p/<n>` route renders them on the
 * server and passes them in as `children` (see `Book.tsx`'s header). A helper
 * that handed this component some other children would be testing a
 * composition nothing ships, so this one calls `<PageFace>` and `deriveRail`
 * exactly as `app/(diary)/p/[n]/page.tsx` does - which is also what makes the
 * image-window cases at the foot of this file meaningful: they run the real
 * seam, from `leafPresentation` through the context to a real `<Photograph>`.
 * Depends on: react, react-dom/client, @travel-diary/domain, vitest (jsdom).
 */
import {
  deriveBookmarks,
  deriveContents,
  derivePages,
  deriveRail,
  pageCounter,
  type BookBundle,
  type BookPage,
  type RailTab,
  type Slot,
} from '@travel-diary/domain/bookBundle'
import { contentWindow, rendersContent, wholeBook, type ContentWindow } from '@travel-diary/domain/contentWindow'
import { journeyId, type JourneyId } from '@travel-diary/domain/ids'
import { aBookChrome, anAboutContent, aJourney } from '@travel-diary/domain/testing/factories'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFERRED_PHOTOGRAPH_SRC } from '../pages/deferredPhotograph'
import { Book } from './Book'
import { PageFace } from './PageFace'

// The App Router itself, not one of our modules (CLAUDE.md §2.3): `Book`
// asks it for the rest of the book through `useRestOfBook`, and `useRouter`
// throws outside a mounted router rather than reporting there is none. What
// the hook DECIDES with it is asserted in `useRestOfBook.test.tsx`; here it
// only has to exist.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: (): void => undefined }),
  usePathname: () => '/p/1',
}))

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
  return {
    pages,
    contents: deriveContents(pages),
    bookmarks: deriveBookmarks(pages),
    chrome: aBookChrome(),
    about: anAboutContent(),
  }
}

/** A hero slot fixture, so the book under test has photographs to withhold. */
const aHeroSlot = (name: string): Slot => ({
  role: 'hero',
  src: `/api/media/file/${name}-hero-800x800.png`,
  alt: `${name} hero`,
  caption: `${name}, in passing`,
  focalX: 50,
  focalY: 50,
})

/**
 * The same bundle with a hero photograph resolved onto every notes page, the
 * way `readBookBundle` resolves them in the app. Narrowed rather than cast
 * (CLAUDE.md §3.1).
 * @returns A bundle whose notes pages each carry one hero slot.
 */
const aBundleWithPhotographs = (): BookBundle => {
  const bundle = aBundle()
  const pages: BookPage[] = bundle.pages.map((page) =>
    page.kind === 'notes' ? { ...page, slots: [aHeroSlot(page.slug)] } : page,
  )
  return { ...bundle, pages }
}

/** The `src` a leaf's hero photograph is carrying, or `'no hero'` when it has none. */
const heroSrcOfLeaf = (host: HTMLElement, leaf: number): string =>
  host.querySelector(`[data-leaf="${String(leaf)}"] [data-hero]`)?.getAttribute('src') ?? 'no hero'

const roots: Root[] = []

/**
 * The thirty-three (here, nine) faces the `/p/<n>` route renders on the
 * server, built here the same way - see this file's header.
 * @param bundle - The book to render faces for.
 * @returns One face per page, in reading order.
 */
const facesOf = (bundle: BookBundle): React.JSX.Element[] =>
  bundle.pages.map((page, index) => (
    <PageFace
      key={index}
      leafIndex={index}
      page={page}
      contents={bundle.contents}
      chrome={bundle.chrome}
      about={bundle.about}
      totalPages={bundle.pages.length}
    />
  ))

/**
 * The faces a WINDOWED document carries: the page's own content inside the
 * window, and the same contentless placeholder the route renders outside it.
 * The count is unchanged, because the leaf stays even when its content goes.
 * @param bundle - The book to render faces for.
 * @param window - The span of leaves whose content the document carries.
 * @returns One child per page, in reading order.
 */
const windowedFacesOf = (bundle: BookBundle, window: ContentWindow): React.JSX.Element[] =>
  bundle.pages.map((page, index) =>
    rendersContent(window, index) ? (
      <PageFace
        key={index}
        leafIndex={index}
        page={page}
        contents={bundle.contents}
        chrome={bundle.chrome}
        about={bundle.about}
        totalPages={bundle.pages.length}
      />
    ) : (
      <div key={index} data-page-deferred={index} />
    ),
  )

const renderBook = (
  initialIndex: number,
  bundle: BookBundle = aBundle(),
  bookmarks: readonly RailTab[] = deriveRail(bundle.pages, bundle.bookmarks),
): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(
      <Book bookmarks={bookmarks} initialIndex={initialIndex} content={wholeBook(bundle.pages.length)}>
        {facesOf(bundle)}
      </Book>,
    )
  })
  return host
}

/**
 * Renders the book the way a WINDOWED document does, and hands back the
 * `render` that completes it - so a test can turn past the window's edge and
 * then let the rest of the book arrive, which is the sequence a slow network
 * actually produces.
 * @param initialIndex - The page the reader opens on.
 * @param bundle - The book to render.
 * @returns The host element and a function that re-renders it whole.
 */
const renderWindowedBook = (
  initialIndex: number,
  bundle: BookBundle = aBundle(),
): { readonly host: HTMLElement; readonly completeTheBook: () => void } => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  const bookmarks = deriveRail(bundle.pages, bundle.bookmarks)
  const total = bundle.pages.length
  const render = (window: ContentWindow, faces: React.JSX.Element[]): void => {
    act(() => {
      root.render(
        <Book bookmarks={bookmarks} initialIndex={initialIndex} content={window}>
          {faces}
        </Book>,
      )
    })
  }

  const window = contentWindow(initialIndex, total)
  render(window, windowedFacesOf(bundle, window))

  return {
    host,
    completeTheBook: () => {
      render(wholeBook(total), facesOf(bundle))
    },
  }
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

/**
 * A `prefers-reduced-motion: reduce` stand-in - a browser API, never a mock
 * of our own code (CLAUDE.md §2.3). It is what makes the window's edge
 * reachable in a test at all: a reduced-motion turn commits instantly, so
 * three key presses walk the reader to the edge of a radius-3 window without
 * 2,700ms of real time - and that same reader is the only one who can outrun
 * the request for the rest of the book in a real browser.
 */
const stubReducedMotion = (): void => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({ matches: true, addEventListener: () => undefined, removeEventListener: () => undefined }),
  })
}

afterEach(() => {
  for (const root of roots) {
    act(() => {
      root.unmount()
    })
  }
  roots.length = 0
  document.body.innerHTML = ''
  Reflect.deleteProperty(window, 'matchMedia')
})

describe('Book', () => {
  it('renders one leaf for every face it was handed', () => {
    const host = renderBook(0)

    expect(host.querySelectorAll('[data-leaf]')).toHaveLength(aBundle().pages.length)
  })

  it('slots each face into the leaf of the same index, never one off', () => {
    // The faces arrive as an opaque list of children and the book never
    // learns what is printed on them, so the only thing keeping page 5 off
    // leaf 4 is the position it is slotted at. Asserted on a page whose text
    // names its own journey, at both ends of the stack.
    const host = renderBook(0)

    expect(one(host, '[data-leaf="2"]').textContent).toContain('Tokyo')
    expect(one(host, '[data-leaf="5"]').textContent).toContain('Lisbon')
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

  it('renders one bookmark tab for every tab in the rail it was handed', () => {
    const host = renderBook(0)

    expect(host.querySelectorAll('[data-bookmark]')).toHaveLength(aBundle().bookmarks.length)
  })

  it('prints the label the rail carries, rather than deriving one of its own', () => {
    // The book is handed a labelled rail and never sees the pages behind it -
    // dropping a tab that addresses a page the book does not have is
    // `deriveRail`'s job now, proved in packages/domain/src/bookBundle.test.ts.
    const host = renderBook(0, aBundle(), [{ startIndex: 2, label: 'Tokyo — Notes' }])

    expect([...host.querySelectorAll('[data-bookmark]')].map((tab) => tab.textContent)).toEqual(['Tokyo — Notes'])
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

  // The image window, end to end. `leafPresentation.loadsImages` decides it
  // and `packages/domain/src/pageStack.test.ts` proves the arithmetic; what is
  // asserted here is that the book actually WIRES that decision to the leaves,
  // which is where Task 10's 1.8MB of eager photographs came from.

  it('publishes the window the faces look themselves up in, so a face needs no flag of its own', () => {
    // The faces are rendered before this component exists and cannot be
    // handed the window as a prop; `Book` publishes it on a context instead.
    // A book that published nothing would render every photograph real, which
    // is the 1.8MB defect, and would still pass every other case in this file.
    const host = renderBook(5, aBundleWithPhotographs())

    expect([heroSrcOfLeaf(host, 5), heroSrcOfLeaf(host, 2)]).toEqual([
      '/api/media/file/lisbon-hero-800x800.png',
      DEFERRED_PHOTOGRAPH_SRC,
    ])
  })

  it('gives a real photograph only to the leaves beside the reader', () => {
    const host = renderBook(5, aBundleWithPhotographs())

    expect(heroSrcOfLeaf(host, 5)).toBe('/api/media/file/lisbon-hero-800x800.png')
    expect(heroSrcOfLeaf(host, 2)).toBe(DEFERRED_PHOTOGRAPH_SRC)
  })

  it('keeps a deferred leaf’s own text in the document, so the deep link stays indexable', () => {
    const host = renderBook(5, aBundleWithPhotographs())

    expect(one(host, '[data-leaf="2"]').textContent).toContain('Tokyo')
    expect(one(host, '[data-leaf="2"] [data-hero]').getAttribute('alt')).toBe('tokyo hero')
  })

  it('has the destination’s photograph in place before the turn reveals it', () => {
    // A turn to a neighbour finds it already loaded — the window is one page
    // wider than `visible` precisely so the reader never watches an empty
    // frame swing into place.
    const host = renderBook(4, aBundleWithPhotographs())
    expect(heroSrcOfLeaf(host, 5)).toBe('/api/media/file/lisbon-hero-800x800.png')

    click(host, '[data-nav="next"]')

    expect(visibleLeaves(host)).toContain('5')
    expect(heroSrcOfLeaf(host, 5)).toBe('/api/media/file/lisbon-hero-800x800.png')
  })

  it('opens the window on the destination the moment a bookmark jump starts', () => {
    // A jump moves the reader many pages at once, so its destination cannot
    // have been preloaded. It is inside the window from the first frame of the
    // turn instead — never only once the turn has committed.
    const host = renderBook(2, aBundleWithPhotographs())
    expect(heroSrcOfLeaf(host, 5)).toBe(DEFERRED_PHOTOGRAPH_SRC)

    click(host, '[data-bookmark="5"]')

    expect(visibleLeaves(host)).toContain('5')
    expect(heroSrcOfLeaf(host, 5)).toBe('/api/media/file/lisbon-hero-800x800.png')
  })

  it('publishes the span of leaves whose content the served document carries', () => {
    // Read by e2e/serverWindow.spec.ts, which needs to know what the document
    // it just fetched actually contains before it can assert anything about
    // what the reader can reach from it.
    const { host } = renderWindowedBook(0)

    expect(one(host, 'main').dataset['contentWindow']).toBe('0-3')
  })

  it('still renders one leaf per page when the document carries only a window of them', () => {
    // The leaf is the stack's geometry - its z-order, its resting angle, the
    // page count under it. Only its CONTENT is windowed, so a windowed
    // document must produce exactly the same number of leaves as a whole one.
    const { host } = renderWindowedBook(0)

    expect(host.querySelectorAll('[data-leaf]')).toHaveLength(aBundle().pages.length)
  })

  it('turns without waiting to a page the document already carries', () => {
    const { host } = renderWindowedBook(0)

    click(host, '[data-nav="next"]')

    expect(visibleLeaves(host)).toEqual(['0', '1'])
  })

  it('holds a turn past the window’s edge rather than revealing an empty leaf', () => {
    // The failure this guards is the one the whole design turns on: a leaf
    // whose face is blank because its page was never rendered into this
    // document. The reader is walked to the far edge of the window and then
    // asked to keep going.
    stubReducedMotion()
    const { host } = renderWindowedBook(0)

    click(host, '[data-nav="next"]')
    click(host, '[data-nav="next"]')
    click(host, '[data-nav="next"]')
    click(host, '[data-nav="next"]')

    expect(visibleLeaves(host)).toEqual(['3'])
    expect(one(host, '[data-leaf="3"]').textContent).toContain('Tokyo')
  })

  it('performs the held turn the moment the rest of the book arrives', () => {
    stubReducedMotion()
    const { host, completeTheBook } = renderWindowedBook(0)
    click(host, '[data-nav="next"]')
    click(host, '[data-nav="next"]')
    click(host, '[data-nav="next"]')
    click(host, '[data-nav="next"]')

    completeTheBook()

    expect(visibleLeaves(host)).toEqual(['4'])
  })

  it('holds a bookmark jump until the whole book has arrived, since a jump can land anywhere', () => {
    const { host } = renderWindowedBook(0)

    click(host, '[data-bookmark="5"]')

    expect(visibleLeaves(host)).toEqual(['0'])
  })

  it('performs the held jump, still anchored beside its target, once the book is whole', () => {
    const { host, completeTheBook } = renderWindowedBook(0)
    click(host, '[data-bookmark="5"]')

    completeTheBook()

    expect(visibleLeaves(host)).toEqual(['4', '5'])
  })

  it('holds nothing back once the document carries the whole book', () => {
    // The windowed path must not survive into the completed book: a jump on
    // a whole book is put to the machine at once, exactly as it was before
    // any of this existed.
    const host = renderBook(0)

    click(host, '[data-bookmark="5"]')

    expect(visibleLeaves(host)).toEqual(['4', '5'])
  })
})
