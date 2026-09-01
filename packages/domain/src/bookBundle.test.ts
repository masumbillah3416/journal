import { describe, expect, it } from 'vitest'
import { deriveBookmarks, deriveContents, derivePages, pageCounter, pageLabel } from './bookBundle'
import { aJourney } from './testing/factories'

/**
 * Narrows a possibly-absent test lookup to its value, or fails loudly.
 * Exists so `noUncheckedIndexedAccess`/`.find()` results are narrowed
 * without a banned non-null assertion (CLAUDE.md §3.1).
 */
const must = <T>(value: T | undefined): T => {
  if (value === undefined) throw new Error('expected a defined value in test setup')
  return value
}

describe('derivePages', () => {
  it('assembles the reading sequence as Cover, Contents, journey pages, About', () => {
    const journeys = [aJourney({ slug: 'tokyo' }), aJourney({ slug: 'lisbon' })]

    const pages = derivePages(journeys)

    expect(pages.map((p) => p.kind)).toEqual([
      'cover',
      'contents',
      'notes',
      'frames-i',
      'frames-ii',
      'notes',
      'frames-i',
      'frames-ii',
      'about',
    ])
  })

  it('produces thirty-three pages for the seeded ten journeys', () => {
    // Cover + Contents + (10 x 3) + About. This is the handoff's "33 pages",
    // and it is derived here rather than stored — the database holds 30 rows.
    const journeys = Array.from({ length: 10 }, (_, i) => aJourney({ slug: `j${String(i)}` }))

    expect(derivePages(journeys)).toHaveLength(33)
  })
})

describe('deriveContents', () => {
  it('numbers each journey with the page its notes page occupies', () => {
    const journeys = [aJourney({ slug: 'tokyo' }), aJourney({ slug: 'lisbon' })]

    const entries = deriveContents(derivePages(journeys))

    // Cover is 1, Contents is 2, so the first journey's notes page is 3.
    expect(entries.map((e) => e.pageNumber)).toEqual([3, 6])
  })
})

describe('deriveBookmarks', () => {
  it('spans a journey tab across all three of its pages', () => {
    const journeys = [aJourney({ slug: 'tokyo' })]
    const tabs = deriveBookmarks(derivePages(journeys))
    const tokyo = tabs.find((t) => t.slug === 'tokyo')

    expect(tokyo).toMatchObject({ startIndex: 2, span: 3 })
  })

  it('gives Cover, Contents and About a span of one', () => {
    const tabs = deriveBookmarks(derivePages([aJourney({ slug: 'tokyo' })]))

    expect(tabs.filter((t) => t.span === 1).map((t) => t.kind)).toEqual(['cover', 'contents', 'about'])
  })

  it('omits a journey flagged hiddenFromBookmarks but keeps its pages', () => {
    const journeys = [aJourney({ slug: 'tokyo', hiddenFromBookmarks: true })]

    expect(deriveBookmarks(derivePages(journeys)).some((t) => t.slug === 'tokyo')).toBe(false)
    // 6, not 5: Cover + Contents + this journey's 3 pages + About, per the
    // same 2 + 3xN + 1 formula the "thirty-three pages" test above uses for
    // N=10. "Keeps its pages" (this test's own title) means all three of
    // them stay in the reading sequence - hiddenFromBookmarks removes only
    // the bookmark tab, asserted on the line above.
    expect(derivePages(journeys)).toHaveLength(6)
  })
})

describe('pageCounter', () => {
  it('zero-pads both halves to the width of the total', () => {
    expect(pageCounter(3, 33)).toBe('03 / 33')
    expect(pageCounter(7, 120)).toBe('007 / 120')
  })
})

describe('pageLabel', () => {
  // One test per BookPage kind: pageLabel switches on all six, and each
  // branch is a real, distinct reader-facing label under the page counter.
  it('labels the cover page "Cover"', () => {
    const pages = derivePages([])
    expect(pageLabel(must(pages[0]))).toBe('Cover')
  })

  it('labels the contents page "Contents"', () => {
    const pages = derivePages([])
    expect(pageLabel(must(pages[1]))).toBe('Contents')
  })

  it('labels the about page "About"', () => {
    const pages = derivePages([])
    expect(pageLabel(must(pages.at(-1)))).toBe('About')
  })

  it('labels a notes page with the journey name', () => {
    const pages = derivePages([aJourney({ name: 'Tokyo' })])
    expect(pageLabel(must(pages.find((p) => p.kind === 'notes')))).toBe('Tokyo — Notes')
  })

  it('labels the first frames page with the journey name', () => {
    const pages = derivePages([aJourney({ name: 'Tokyo' })])
    expect(pageLabel(must(pages.find((p) => p.kind === 'frames-i')))).toBe('Tokyo — Frames I')
  })

  it('labels the second frames page with the journey name', () => {
    const pages = derivePages([aJourney({ name: 'Tokyo' })])
    expect(pageLabel(must(pages.find((p) => p.kind === 'frames-ii')))).toBe('Tokyo — Frames II')
  })
})
