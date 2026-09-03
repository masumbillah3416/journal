import { describe, expect, it } from 'vitest'
import {
  deriveBookmarks,
  deriveContents,
  derivePageLabels,
  derivePages,
  deriveRail,
  isRailTabActive,
  mobileHeading,
  pageCounter,
  pageLabel,
} from './bookBundle'
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

  it('carries the journey’s notes-page content onto every one of its three pages', () => {
    // SCREENS.md §1.3 prints the weather, mood, highlights, note, tally and
    // sign-off; none of them is stored per page, so `derivePages` copies the
    // journey's own values onto the pages it derives. Asserted on all three
    // pages rather than only the notes page: `BookPage`'s journey arm is one
    // shape, and a copy that reached only `'notes'` would leave the Frames
    // pages' own footer count (SCREENS.md §1.5) with nothing to read.
    const journeys = [
      aJourney({
        weather: 'HAZY 27C',
        mood: 'UNHURRIED',
        weatherGlyph: 'haze',
        highlights: ['Tram 28 at seven', 'Custard tart count: nineteen'],
        note: 'Every street in Lisbon is either up or down.',
        tally: [{ key: 'Days', value: '11' }],
        gallery: { photographs: 41, clips: 6 },
        furniture: {
          accent: '#a06b3e',
          signoff: 'nineteen tarts, no regrets',
          stampCountry: 'PORTUGAL',
          stampValue: '85',
        },
      }),
    ]

    const journeyPages = derivePages(journeys).filter(
      (page) => page.kind !== 'cover' && page.kind !== 'contents' && page.kind !== 'about',
    )

    expect(journeyPages).toHaveLength(3)
    for (const page of journeyPages) {
      expect(page).toMatchObject({
        weather: 'HAZY 27C',
        mood: 'UNHURRIED',
        weatherGlyph: 'haze',
        highlights: ['Tram 28 at seven', 'Custard tart count: nineteen'],
        note: 'Every street in Lisbon is either up or down.',
        tally: [{ key: 'Days', value: '11' }],
        signoff: 'nineteen tarts, no regrets',
        stampCountry: 'PORTUGAL',
        stampValue: '85',
        gallery: { photographs: 41, clips: 6 },
      })
    }
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

describe('derivePageLabels', () => {
  it('labels every page in the reading sequence, in reading order', () => {
    // The bottom bar prints the label of whatever page the reader is on
    // (SCREENS.md §1.7), and the bar is inside the book's client boundary
    // while `BookPage` is not - so the labels are derived once on the server
    // and handed over as strings, rather than the whole reading sequence
    // being serialized a second time just to be relabelled in the browser.
    const pages = derivePages([aJourney({ name: 'Tokyo' })])

    expect(derivePageLabels(pages)).toEqual([
      'Cover',
      'Contents',
      'Tokyo — Notes',
      'Tokyo — Frames I',
      'Tokyo — Frames II',
      'About',
    ])
  })

  it('labels no page at all for a book with no pages', () => {
    expect(derivePageLabels([])).toEqual([])
  })
})

describe('isRailTabActive', () => {
  // SCREENS.md §1.7: "Journey tabs span 3 pages, so a tab is active when
  // `index ∈ [start, start+3)`. Cover, Contents and About span 1." The span
  // comes off the tab rather than being re-derived from its kind, so a book
  // whose journeys ever ran to a different number of pages could not
  // disagree with `deriveBookmarks` about where a tab ends.
  const railOf = (name: string) => {
    const pages = derivePages([aJourney({ name })])
    return deriveRail(pages, deriveBookmarks(pages))
  }

  it('marks a journey tab active on the first of its three pages', () => {
    expect(isRailTabActive(must(railOf('Tokyo')[2]), 2)).toBe(true)
  })

  it('marks a journey tab active on the second of its three pages', () => {
    expect(isRailTabActive(must(railOf('Tokyo')[2]), 3)).toBe(true)
  })

  it('marks a journey tab active on the third of its three pages', () => {
    expect(isRailTabActive(must(railOf('Tokyo')[2]), 4)).toBe(true)
  })

  it('leaves a journey tab inactive on the page after its span ends', () => {
    // The exclusive end of `[start, start+3)`, which is the off-by-one this
    // rule exists to pin down: page 5 is About, not the journey's.
    expect(isRailTabActive(must(railOf('Tokyo')[2]), 5)).toBe(false)
  })

  it('leaves a journey tab inactive on the page before its span begins', () => {
    expect(isRailTabActive(must(railOf('Tokyo')[2]), 1)).toBe(false)
  })

  it('marks a one-page tab active only on its own page', () => {
    const cover = must(railOf('Tokyo')[0])

    expect([isRailTabActive(cover, 0), isRailTabActive(cover, 1)]).toEqual([true, false])
  })
})

describe('deriveRail', () => {
  it('draws a journey tab with the journey’s name, its dates and its accent', () => {
    // SCREENS.md §1.7 gives each tab a name in Caveat 24px over a sub in
    // Courier 8.5px uppercase, beside a 6px tint bar. The prototype's own
    // rail (`Travel Diary.dc.html`, `tabDef`) is what says which strings
    // those are: the journey's name, the last two words of its free-text
    // dates, and its own accent as the tint.
    const pages = derivePages([
      aJourney({
        name: 'Tokyo',
        dates: '12 – 24 March 2025',
        furniture: { accent: '#3d817e', signoff: 's', stampCountry: 'NIPPON', stampValue: '120' },
      }),
    ])

    expect(deriveRail(pages, deriveBookmarks(pages))[2]).toEqual({
      startIndex: 2,
      span: 3,
      name: 'Tokyo',
      sub: 'March 2025',
      tint: '#3d817e',
    })
  })

  it('draws the three book-wide tabs with their own names and subs, and no tint of their own', () => {
    // Cover, Contents and About have no journey behind them, so they have no
    // accent either; the rail paints them in its own default tint. Their
    // subs are the prototype's copy, deliberate like every other string in
    // this design.
    const pages = derivePages([aJourney({ name: 'Tokyo' })])

    const rail = deriveRail(pages, deriveBookmarks(pages))

    expect([rail[0], rail[1], rail[3]]).toEqual([
      { startIndex: 0, span: 1, name: 'Cover', sub: 'the front', tint: undefined },
      { startIndex: 1, span: 1, name: 'Contents', sub: 'index', tint: undefined },
      { startIndex: 5, span: 1, name: 'About', sub: 'colophon', tint: undefined },
    ])
  })

  it('uses the whole of a one-word date range as the tab’s sub', () => {
    // The sub is the last two words of the dates, and a shorter line has
    // fewer than two - `slice(-2)` on a one-word range must yield that word
    // rather than an empty string.
    const pages = derivePages([aJourney({ name: 'Tokyo', dates: 'Undated' })])

    expect(must(deriveRail(pages, deriveBookmarks(pages))[2]).sub).toBe('Undated')
  })

  it('drops a tab that addresses a page the book does not have', () => {
    // A bundle crosses a serialization boundary, so a rail and a reading
    // sequence that disagree is a state the reading surface can be handed.
    // The tab is dropped here rather than in the JSX that draws it, so the
    // rule has a test.
    const pages = derivePages([aJourney({ name: 'Tokyo' })])
    const strayTab = { kind: 'about' as const, startIndex: pages.length + 4, span: 1 }

    const rail = deriveRail(pages, [...deriveBookmarks(pages), strayTab])

    expect(rail.map((tab) => tab.startIndex)).toEqual([0, 1, 2, 5])
  })

  it('draws no rail at all for a book with no bookmarks', () => {
    expect(deriveRail(derivePages([]), [])).toEqual([])
  })
})

describe('mobileHeading', () => {
  // One test per BookPage kind. The mobile header has room for one line
  // (SCREENS.md §1.10), so a journey's three pages share its name rather than
  // repeating "Frames I" over a page that already says so.
  it('heads the cover page "Cover"', () => {
    expect(mobileHeading(must(derivePages([])[0]))).toBe('Cover')
  })

  it('heads the contents page "Contents"', () => {
    expect(mobileHeading(must(derivePages([])[1]))).toBe('Contents')
  })

  it('heads the about page "About"', () => {
    expect(mobileHeading(must(derivePages([]).at(-1)))).toBe('About')
  })

  it('heads a notes page with the journey name alone', () => {
    const pages = derivePages([aJourney({ name: 'Tokyo' })])
    expect(mobileHeading(must(pages.find((p) => p.kind === 'notes')))).toBe('Tokyo')
  })

  it('heads the first frames page with the journey name alone', () => {
    const pages = derivePages([aJourney({ name: 'Tokyo' })])
    expect(mobileHeading(must(pages.find((p) => p.kind === 'frames-i')))).toBe('Tokyo')
  })

  it('heads the second frames page with the journey name alone', () => {
    const pages = derivePages([aJourney({ name: 'Tokyo' })])
    expect(mobileHeading(must(pages.find((p) => p.kind === 'frames-ii')))).toBe('Tokyo')
  })
})
