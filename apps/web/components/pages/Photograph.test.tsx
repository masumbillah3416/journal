/**
 * Photograph.test.tsx — the one element the image window actually acts on.
 *
 * The window's ARITHMETIC is `leafPresentation.loadsImages`, proved in
 * `packages/domain/src/pageStack.test.ts`; the window's WIRING from the book
 * to the leaves is proved in `../book/Book.test.tsx`. What is asserted here
 * is the last link in that chain: given a window, which `src` this element
 * carries — and, just as important, everything it keeps carrying when the
 * window is shut.
 *
 * The no-provider case is the one that would otherwise be discovered in
 * production. `Photograph` is rendered by SERVER components, so its window
 * cannot arrive as a prop; it arrives through a context a client ancestor
 * publishes. A photograph rendered with no such ancestor is a photograph
 * outside a book, and it loads — stated as a test rather than left as an
 * implementation detail, because the opposite default (deferring by
 * omission) would make a forgotten provider look like a blank book instead of
 * a loud failure.
 * Depends on: react, react-dom/client, vitest (jsdom).
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFERRED_PHOTOGRAPH_SRC } from './deferredPhotograph'
import { ImageWindow, Photograph, type PhotographProps } from './Photograph'

const REAL_SRC = '/api/media/file/tokyo-hero-11-800x800.png'

const roots: Root[] = []

/** The props every case starts from; each test overrides only what it is about. */
const aPhotograph = (overrides: Partial<PhotographProps> = {}): PhotographProps => ({
  leafIndex: 2,
  role: 'hero',
  src: REAL_SRC,
  alt: 'TOKYO HERO',
  focalX: 40,
  focalY: 70,
  className: 'heroPhoto',
  ...overrides,
})

/**
 * Renders one photograph, optionally inside a window.
 * @param props - The photograph's props.
 * @param window - The leaves the window admits, or `undefined` for no window at all.
 * @returns The host element the photograph was rendered into.
 */
const renderPhotograph = (props: PhotographProps, window?: readonly boolean[]): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(
      window === undefined ? (
        <Photograph {...props} />
      ) : (
        <ImageWindow value={window}>
          <Photograph {...props} />
        </ImageWindow>
      ),
    )
  })
  return host
}

/** The rendered `<img>`, asserted present so no test needs a non-null assertion (CLAUDE.md §3.1). */
const image = (host: HTMLElement): HTMLImageElement => {
  const found = host.querySelector('img')
  if (found === null) throw new Error('the photograph rendered no <img>')
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

describe('Photograph', () => {
  it('loads when no window is in force, because a photograph outside a book is just a photograph', () => {
    const host = renderPhotograph(aPhotograph())

    expect(image(host).getAttribute('src')).toBe(REAL_SRC)
  })

  it('loads when the window admits its leaf', () => {
    const host = renderPhotograph(aPhotograph({ leafIndex: 1 }), [false, true, false])

    expect(image(host).getAttribute('src')).toBe(REAL_SRC)
  })

  it('stands its source in when the window shuts its leaf out', () => {
    const host = renderPhotograph(aPhotograph({ leafIndex: 0 }), [false, true, false])

    expect(image(host).getAttribute('src')).toBe(DEFERRED_PHOTOGRAPH_SRC)
  })

  it('treats a leaf the window says nothing about as outside it', () => {
    // A rail, a reading sequence and a window all cross the same boundary; a
    // leaf past the end of the window is a disagreement, and the safe reading
    // of a disagreement is "do not fetch".
    const host = renderPhotograph(aPhotograph({ leafIndex: 9 }), [true, true])

    expect(image(host).getAttribute('src')).toBe(DEFERRED_PHOTOGRAPH_SRC)
  })

  it('keeps its alt, its focal point and its class while its bytes are withheld', () => {
    // The design spec's §8 wants every page's content in the served HTML. It
    // is the BYTES the window withholds, never the markup — so a deferred
    // photograph is the same element, one attribute different.
    const host = renderPhotograph(aPhotograph({ leafIndex: 0 }), [false])

    const img = image(host)
    expect(img.getAttribute('alt')).toBe('TOKYO HERO')
    expect(img.style.objectPosition).toBe('40% 70%')
    expect(img.className).toBe('heroPhoto')
  })

  it('publishes the hero handle that the browser suites and the visual gates select on', () => {
    const host = renderPhotograph(aPhotograph({ role: 'hero' }))

    expect(image(host).hasAttribute('data-hero')).toBe(true)
  })

  it('leaves the hero handle off a photograph that is not the hero', () => {
    // `[data-hero]` addresses the one photograph on a Notes page that has a
    // subject; the ephemera scrap is a texture behind tape, and a second
    // element answering that selector would make every hero assertion
    // ambiguous.
    const host = renderPhotograph(aPhotograph({ role: 'ephemera', alt: '' }))

    expect(image(host).hasAttribute('data-hero')).toBe(false)
  })

  it('never competes with the page the reader is actually on', () => {
    // Every leaf of the book is in the document at once, so a photograph is
    // usually one the reader is not looking at. `loading="lazy"` is
    // deliberately absent — measured on `/p/1`, it deferred nothing, because
    // every leaf sits at `inset: 0`.
    const img = image(renderPhotograph(aPhotograph()))

    expect([img.getAttribute('fetchpriority'), img.getAttribute('decoding'), img.hasAttribute('loading')]).toEqual([
      'low',
      'async',
      false,
    ])
  })
})
