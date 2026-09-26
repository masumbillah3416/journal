import { describe, expect, it } from 'vitest'
import { sectionColour } from './navigation'
import { bookSummary, overviewStats, type OverviewFigures } from './overviewStats'

/**
 * A diary with nothing in it, so every case states the figures it is about.
 * @param over - The figures this case moves.
 * @returns The figures.
 */
const figures = (over: Partial<OverviewFigures> = {}): OverviewFigures => ({
  journeys: 0,
  journeysInDraft: 0,
  pages: 0,
  pagesInDraft: 0,
  photographs: 0,
  photographsInBook: 0,
  clips: 0,
  clipsWithPoster: 0,
  ...over,
})

describe('overviewStats', () => {
  it('draws the four cards SCREENS.md §2.1’s grid has room for, in its own order', () => {
    expect(overviewStats(figures()).map((stat) => stat.label)).toEqual(['Journeys', 'Pages', 'Photographs', 'Clips'])
  })

  it('prints each figure it was given rather than a figure of its own', () => {
    const stats = overviewStats(figures({ journeys: 10, pages: 33, photographs: 512, clips: 68 }))

    expect(stats.map((stat) => stat.value)).toEqual(['10', '33', '512', '68'])
  })

  it('gives each tick the rail’s own colour for the section that card belongs to', () => {
    // The prototype's four tones — #3d817e, #5a72a8, #a06b3e, #a34434 — ARE
    // SCREENS.md §2's section colours, so the module asks `sectionColour` for
    // them rather than transcribing four hexes.
    //
    // WHAT THIS CASE CAN AND CANNOT SAY, measured rather than assumed: a
    // literal `'#a06b3e'` substituted for the `sectionColour('media')` call
    // leaves it GREEN, because the literal and the table agree today. So this
    // pins the four VALUES against the rail's, which is what a reader of the
    // screen sees; it does not pin the call. The call is what stops them
    // diverging the day §2's table moves, and the only instrument for that
    // would be a source-level read — more machinery than a colour is worth.
    expect(overviewStats(figures()).map((stat) => stat.tone)).toEqual([
      sectionColour('journeys'),
      sectionColour('book'),
      sectionColour('media'),
      sectionColour('overview'),
    ])
  })

  it('says how many journeys are still a draft', () => {
    expect(overviewStats(figures({ journeys: 10, journeysInDraft: 4 }))[0]?.note).toBe('4 still a draft')
  })

  it('writes the single draft journey in the singular', () => {
    expect(overviewStats(figures({ journeys: 10, journeysInDraft: 1 }))[0]?.note).toBe('one still a draft')
  })

  it('says so plainly when every journey is published, rather than printing a zero', () => {
    expect(overviewStats(figures({ journeys: 10, journeysInDraft: 0 }))[0]?.note).toBe('all published')
  })

  it('says how many pages are still a draft', () => {
    expect(overviewStats(figures({ pages: 33, pagesInDraft: 2 }))[1]?.note).toBe('2 still a draft')
  })

  it('writes the single draft page in the singular too', () => {
    expect(overviewStats(figures({ pages: 33, pagesInDraft: 1 }))[1]?.note).toBe('one still a draft')
  })

  it('says so plainly when every page is published', () => {
    expect(overviewStats(figures({ pages: 33 }))[1]?.note).toBe('all published')
  })

  it('says how many photographs are placed in the book', () => {
    expect(overviewStats(figures({ photographs: 512, photographsInBook: 96 }))[2]?.note).toBe('96 placed in the book')
  })

  it('writes the single placed photograph in the singular', () => {
    expect(overviewStats(figures({ photographs: 512, photographsInBook: 1 }))[2]?.note).toBe('one placed in the book')
  })

  it('says none rather than zero when no photograph is in the book', () => {
    expect(overviewStats(figures({ photographs: 512 }))[2]?.note).toBe('none placed in the book')
  })

  it('says how many clips have a poster frame chosen', () => {
    expect(overviewStats(figures({ clips: 68, clipsWithPoster: 9 }))[3]?.note).toBe('9 with a poster chosen')
  })

  it('writes the single clip with a poster in the singular', () => {
    expect(overviewStats(figures({ clips: 68, clipsWithPoster: 1 }))[3]?.note).toBe('one with a poster chosen')
  })

  it('says none rather than zero when no clip has a poster', () => {
    expect(overviewStats(figures({ clips: 68 }))[3]?.note).toBe('none with a poster chosen')
  })

  it('keys each card by what it is, so the grid never addresses one by position', () => {
    // CLAUDE.md §0.9 applied to a list a component maps over.
    expect(overviewStats(figures()).map((stat) => stat.id)).toEqual(['journeys', 'pages', 'photographs', 'clips'])
  })
})

describe('bookSummary', () => {
  it('writes the prototype’s own line for the prototype’s own figures', () => {
    expect(bookSummary({ pages: 33, bookmarks: 13, galleries: 4 })).toBe('33 pages · 13 bookmarks · 4 galleries open')
  })

  it('writes each of the three nouns in the singular when there is one of it', () => {
    // Three arms, and in a repository read each is reachable only when the
    // diary happens to hold exactly one of something — which is why the line
    // is decided here rather than beside the query.
    expect(bookSummary({ pages: 1, bookmarks: 1, galleries: 1 })).toBe('1 page · 1 bookmark · 1 gallery open')
  })

  it('writes zero in the plural, because "0 page" is a broken template', () => {
    expect(bookSummary({ pages: 0, bookmarks: 0, galleries: 0 })).toBe('0 pages · 0 bookmarks · 0 galleries open')
  })

  it('keeps the three figures in the order §2.1 prints them, so none can be read for another', () => {
    expect(bookSummary({ pages: 1, bookmarks: 2, galleries: 3 })).toBe('1 page · 2 bookmarks · 3 galleries open')
  })
})
