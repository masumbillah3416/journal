/**
 * mediaFilters.test.ts — each of SCREENS.md §2.4's five chips shows what it
 * names and hides what it does not.
 *
 * EVERY CHIP GETS A PAIR. A case that only shows what a chip admits passes for
 * a predicate that returns `true` for everything, which is what the default
 * chip already does — so each chip below is asserted against a row it must
 * refuse as well as one it must admit.
 * Depends on: vitest, ./mediaFilters.
 */
import { describe, expect, it } from 'vitest'
import type { MediaTile } from './mediaFilters'
import { MEDIA_FILTERS, matchesMediaFilter } from './mediaFilters'

/**
 * A row, with only the facts a case cares about named.
 * @param overrides - What this case is about; everything else is an ordinary
 *   still that nothing points at.
 * @returns A fresh row (CLAUDE.md §2.3 — never a shared mutable constant).
 */
const aTile = (overrides: Partial<MediaTile> = {}): MediaTile => ({
  kind: 'still',
  inBook: false,
  placements: 0,
  ...overrides,
})

describe('matchesMediaFilter', () => {
  it('shows every row under Everything, including one the other chips refuse', () => {
    // The default chip. A row that fell out of it is a row the author cannot
    // reach at all, so the row here is the one `unused` and `in-the-book`
    // disagree about.
    expect(matchesMediaFilter(aTile({ inBook: true, placements: 3 }), 'everything')).toBe(true)
  })

  it('shows a still under Stills and hides a clip', () => {
    expect(matchesMediaFilter(aTile({ kind: 'still' }), 'stills')).toBe(true)
    expect(matchesMediaFilter(aTile({ kind: 'clip' }), 'stills')).toBe(false)
  })

  it('shows a clip under Clips and hides a still', () => {
    expect(matchesMediaFilter(aTile({ kind: 'clip' }), 'clips')).toBe(true)
    expect(matchesMediaFilter(aTile({ kind: 'still' }), 'clips')).toBe(false)
  })

  it('shows a row marked for the book under In the book, whatever holds it', () => {
    // THE COLUMN, NOT THE PLACEMENT. A photograph on a page but not marked is
    // not in the book, and a photograph marked but on no page is — which is
    // the distinction `docs/deviations.md` §63 says the editor's pool lost.
    expect(matchesMediaFilter(aTile({ inBook: true, placements: 0 }), 'in-the-book')).toBe(true)
    expect(matchesMediaFilter(aTile({ inBook: false, placements: 3 }), 'in-the-book')).toBe(false)
  })

  it('shows a row nothing in the diary points at under Unused', () => {
    expect(matchesMediaFilter(aTile({ inBook: false, placements: 0 }), 'unused')).toBe(true)
  })

  it('hides a row a page holds from Unused, even though it is not in the book', () => {
    // The half of `unused` that "not in the book" alone would get wrong: this
    // photograph is printed on a Frames page.
    expect(matchesMediaFilter(aTile({ inBook: false, placements: 1 }), 'unused')).toBe(false)
  })

  it('hides a row marked for the book from Unused, even though no page holds it', () => {
    expect(matchesMediaFilter(aTile({ inBook: true, placements: 0 }), 'unused')).toBe(false)
  })
})

describe('MEDIA_FILTERS', () => {
  it('lists every chip the predicate answers, in the order §2.4 draws them', () => {
    expect(MEDIA_FILTERS).toEqual(['everything', 'stills', 'clips', 'in-the-book', 'unused'])
  })

  it('admits the same row under Everything as under no chip at all', () => {
    // Keeps the list and the predicate from drifting: a chip added to the list
    // and not to the predicate fails `tsc`, and one added to the predicate and
    // not to the list is one the control row never draws — this walks the list
    // and asks the predicate about each, so every listed chip is answerable.
    const row = aTile()

    expect(MEDIA_FILTERS.map((filter) => matchesMediaFilter(row, filter))).toEqual([true, true, false, false, true])
  })
})
