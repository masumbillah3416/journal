/**
 * journeyColumns.test.ts — behaviour spec for SCREENS.md §2.2's column ladder:
 * which of the journeys table's eight columns survive at a width.
 *
 * Unit test (CLAUDE.md §2): a pure lookup over one number. The other half of
 * the pin — that `journeys.module.css` changes shape at these same four widths
 * — is `JourneyTable.test.tsx`'s, for the reason `ScreenHeader.test.tsx` gives:
 * a media query is not a value this project can assert about, so the widths are
 * read off the stylesheet there and asked of this module.
 *
 * Depends on: vitest, ./journeyColumns.
 */
import { describe, expect, it } from 'vitest'
import { JOURNEY_COLUMNS, visibleJourneyColumns } from './journeyColumns'

describe('visibleJourneyColumns', () => {
  it('keeps the four base columns at any width, so a narrow table is still a table', () => {
    expect(visibleJourneyColumns(320)).toEqual(['thumb', 'name', 'status', 'actions'])
  })

  it('adds each optional column at the width SCREENS.md gives it and not before', () => {
    expect(visibleJourneyColumns(719)).not.toContain('pages')
    expect(visibleJourneyColumns(720)).toContain('pages')
    expect(visibleJourneyColumns(799)).not.toContain('edited')
    expect(visibleJourneyColumns(800)).toContain('edited')
    expect(visibleJourneyColumns(879)).not.toContain('media')
    expect(visibleJourneyColumns(880)).toContain('media')
    expect(visibleJourneyColumns(999)).not.toContain('dates')
    expect(visibleJourneyColumns(1000)).toContain('dates')
  })

  it('never drops a column that a wider table shows, so the ladder only ever grows', () => {
    // Every width's set is a subset of the next one up. Written as a property
    // rather than as five more literals: a ladder with a hole in it is the
    // defect, and a hole is invisible to the case above.
    const widths = [320, 720, 800, 880, 1000, 1400]
    const sets = widths.map((width) => new Set(visibleJourneyColumns(width)))
    expect(
      sets.every((set, index) => index === 0 || [...(sets[index - 1] ?? new Set())].every((column) => set.has(column))),
    ).toBe(true)
  })

  it('draws the columns in the order the design’s own grid lists them, whatever survives', () => {
    // The row is a CSS grid whose tracks are declared once, so the ORDER is
    // load-bearing in a way the two `toContain` cases above cannot see: a set
    // with `dates` after `media` puts every data cell under the wrong heading.
    // The right side is the design's `jCols`, transcribed.
    expect(visibleJourneyColumns(1400)).toEqual([
      'thumb',
      'name',
      'dates',
      'pages',
      'media',
      'status',
      'edited',
      'actions',
    ])
  })

  it('reaches every column the table declares once the width is wide enough', () => {
    // A column in the type that no width produces would be a heading with no
    // cells under it — invisible to every case above, each of which names the
    // columns it asks about.
    expect([...visibleJourneyColumns(1400)].sort()).toEqual([...JOURNEY_COLUMNS].sort())
  })
})
