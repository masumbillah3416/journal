import { describe, expect, it } from 'vitest'
import {
  CONTENT_WINDOW_RADIUS,
  contentWindow,
  isWholeBook,
  rendersContent,
  servedContentWindow,
  wholeBook,
  WHOLE_BOOK_QUERY,
  type RouteQuery,
} from './contentWindow'

const TOTAL = 33

describe('contentWindow', () => {
  it('centres the window on the page the address asks for', () => {
    expect(contentWindow(16, TOTAL)).toEqual({ from: 13, to: 19 })
  })

  it('is the radius wide on each side, so a reader has that many turns of runway', () => {
    const { from, to } = contentWindow(16, TOTAL)

    expect(16 - from).toBe(CONTENT_WINDOW_RADIUS)
    expect(to - 16).toBe(CONTENT_WINDOW_RADIUS)
  })

  it('clamps at the front of the book rather than sliding forward to keep its width', () => {
    // `/p/1` is the route the LCP gate measures, and it is also the route a
    // reader can only travel forward from. Sliding the window to keep seven
    // pages would put three pages of markup into that document that no
    // reader can reach without first passing through the three that follow.
    expect(contentWindow(0, TOTAL)).toEqual({ from: 0, to: 3 })
  })

  it('clamps at the end of the book the same way', () => {
    expect(contentWindow(32, TOTAL)).toEqual({ from: 29, to: 32 })
  })

  it('never runs off either end of a book shorter than the window', () => {
    expect(contentWindow(1, 3)).toEqual({ from: 0, to: 2 })
  })

  it('is an empty span for a book with no pages at all', () => {
    expect(contentWindow(0, 0)).toEqual({ from: 0, to: -1 })
  })
})

describe('wholeBook', () => {
  it('spans every leaf there is', () => {
    expect(wholeBook(TOTAL)).toEqual({ from: 0, to: 32 })
  })

  it('is an empty span for a book with no pages at all', () => {
    expect(wholeBook(0)).toEqual({ from: 0, to: -1 })
  })
})

describe('rendersContent', () => {
  it('admits every leaf inside the window and none outside it', () => {
    const window = contentWindow(16, TOTAL)

    expect([12, 13, 16, 19, 20].map((leaf) => rendersContent(window, leaf))).toEqual([false, true, true, true, false])
  })

  it('admits every leaf of a whole-book window', () => {
    const window = wholeBook(TOTAL)

    expect([0, 16, 32].every((leaf) => rendersContent(window, leaf))).toBe(true)
  })

  it('admits nothing at all from an empty span', () => {
    expect(rendersContent(wholeBook(0), 0)).toBe(false)
  })
})

describe('isWholeBook', () => {
  it('is true only when the window covers every leaf', () => {
    expect(isWholeBook(wholeBook(TOTAL), TOTAL)).toBe(true)
    expect(isWholeBook(contentWindow(16, TOTAL), TOTAL)).toBe(false)
  })

  it('is true for a book short enough that the window already covers it', () => {
    // A five-page book is entirely inside a radius-3 window, so there is
    // nothing left for the client to ask for and it must not ask.
    expect(isWholeBook(contentWindow(2, 5), 5)).toBe(true)
  })

  it('is false when only one end of the book is missing', () => {
    expect(isWholeBook(contentWindow(0, TOTAL), TOTAL)).toBe(false)
    expect(isWholeBook(contentWindow(32, TOTAL), TOTAL)).toBe(false)
  })
})

describe('servedContentWindow', () => {
  /** The search parameters a route receives, parsed the way Next parses a query string. */
  const query = (search: string): RouteQuery => Object.fromEntries(new URLSearchParams(search))

  it('serves a window around the addressed page to a request carrying no query at all', () => {
    // What a reader's first load and a crawler's only request both get.
    expect(servedContentWindow(query(''), 16, TOTAL)).toEqual(contentWindow(16, TOTAL))
  })

  it('serves the whole book to the query the book itself asks with', () => {
    expect(servedContentWindow(query(WHOLE_BOOK_QUERY), 16, TOTAL)).toEqual(wholeBook(TOTAL))
  })

  it('serves a window to a request carrying some other value in that parameter', () => {
    expect(servedContentWindow(query('pages=some'), 16, TOTAL)).toEqual(contentWindow(16, TOTAL))
  })

  it('serves a window to a request carrying some other parameter entirely', () => {
    expect(servedContentWindow(query('utm_source=newsletter'), 16, TOTAL)).toEqual(contentWindow(16, TOTAL))
  })

  it('serves a window when the parameter arrives repeated, and so as a list rather than a value', () => {
    // A hand-edited or mangled URL must not be a second, quieter way into the
    // whole-book render; only the exact signal the book sends counts.
    expect(servedContentWindow({ pages: ['all', 'all'] }, 16, TOTAL)).toEqual(contentWindow(16, TOTAL))
  })
})
