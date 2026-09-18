/**
 * journeyStatus.test.ts — behaviour spec for the status SCREENS.md §2.2's five
 * chips filter on, and the list of the chips themselves.
 *
 * Unit test (CLAUDE.md §2): the subject is a pure function over three booleans
 * and a version state, so there is nothing here a database could answer better.
 *
 * WHAT PRODUCED EACH SIDE OF THE FILTER CASE, because a list compared against
 * a list is the shape that passes while guarding nothing: the right side is
 * SCREENS.md §2.2's own five chips, transcribed, and the left side is what the
 * module publishes. The third case then closes the loop the transcription
 * leaves open — every non-`'all'` chip must be a value {@link journeyStatus}
 * can actually return, which is asked of the function rather than of a second
 * list.
 *
 * Depends on: vitest, ./journeyStatus.
 */
import { describe, expect, it } from 'vitest'
import { JOURNEY_STATUS_FILTERS, journeyStatus } from './journeyStatus'

describe('journeyStatus', () => {
  it('is draft while a journey has never been published', () => {
    expect(journeyStatus({ status: 'draft', hasNewerDraft: false, archived: false })).toBe('draft')
  })

  it('is published when the live version is the newest one', () => {
    expect(journeyStatus({ status: 'published', hasNewerDraft: false, archived: false })).toBe('published')
  })

  it('is edited when something is published AND something newer is not', () => {
    // This is the only status that needs two facts. A version of this that
    // reads `_status` alone reports "published" for a journey with unpublished
    // edits, which is the exact state SCREENS.md §2.8's "n changes waiting"
    // counts — two screens, one truth.
    expect(journeyStatus({ status: 'published', hasNewerDraft: true, archived: false })).toBe('edited')
  })

  it('is archived whatever the version state, because archived is a shelf and not a stage', () => {
    expect(journeyStatus({ status: 'published', hasNewerDraft: true, archived: true })).toBe('archived')
    expect(journeyStatus({ status: 'draft', hasNewerDraft: false, archived: true })).toBe('archived')
  })

  it('never calls an unpublished journey edited, however many drafts sit on top of it', () => {
    // The other half of the `edited` boundary. A journey that has never gone
    // out has nothing to be newer THAN, so `hasNewerDraft` must not promote it
    // — an implementation keyed on `hasNewerDraft` alone answers 'edited' here
    // and passes every case above.
    expect(journeyStatus({ status: 'draft', hasNewerDraft: true, archived: false })).toBe('draft')
  })
})

describe('JOURNEY_STATUS_FILTERS', () => {
  it('is SCREENS.md §2.2’s five chips, in the order the screen prints them', () => {
    expect(JOURNEY_STATUS_FILTERS).toEqual(['all', 'published', 'edited', 'draft', 'archived'])
  })

  it('offers no chip the status function cannot produce, so no chip can select nothing', () => {
    // Asked of the FUNCTION, not of a second list: every chip but `all` is
    // reached by some row, so a chip that was renamed without renaming the
    // status it filters on would leave the screen with a dead button.
    const reachable = new Set(
      [
        journeyStatus({ status: 'draft', hasNewerDraft: false, archived: false }),
        journeyStatus({ status: 'published', hasNewerDraft: false, archived: false }),
        journeyStatus({ status: 'published', hasNewerDraft: true, archived: false }),
        journeyStatus({ status: 'draft', hasNewerDraft: false, archived: true }),
      ].map(String),
    )

    expect(JOURNEY_STATUS_FILTERS.filter((filter) => filter !== 'all').every((filter) => reachable.has(filter))).toBe(
      true,
    )
  })
})
