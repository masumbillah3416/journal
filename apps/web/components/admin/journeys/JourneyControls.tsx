/**
 * JourneyControls — SCREENS.md §2.2's search box and its five status chips.
 *
 * ═══ A FORM AND FIVE LINKS, AND THAT IS THE WHOLE DESIGN ═══
 *
 * Both are ADDRESSES rather than state. A `GET` form and five `<a>`s mean the
 * search and the chip survive a reload, can be sent to somebody, and are back
 * where they were after the browser's Back button — and they cost nothing
 * against CLAUDE.md §6's 320KB admin ceiling, which the shell's own
 * no-JavaScript claim exists to protect. The two client islands this screen
 * does buy are the create panel's open state and the `⋯` disclosure, neither of
 * which is a selection.
 *
 * THE SEARCH FORM CARRIES THE CURRENT FILTER as a hidden field. A `GET` form
 * submits only its own controls, so without it typing a search would drop the
 * chip — which reads as the chip resetting itself, and is the kind of thing
 * nobody reports as a bug.
 *
 * THE FIVE CHIPS ARE THE DOMAIN'S. `JOURNEY_STATUS_FILTERS` is what
 * `readJourneysScreen` filters by, so a chip that is not in that list would
 * select nothing and a status not in it would be unreachable.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. A form and a table of links.
 * Depends on: react, `JOURNEY_STATUS_FILTERS`/`JourneyStatus`
 * (@travel-diary/domain/admin/journeyStatus), ./journeys.module.css.
 */
import { JOURNEY_STATUS_FILTERS, type JourneyStatus } from '@travel-diary/domain/admin/journeyStatus'
import type React from 'react'
import styles from './journeys.module.css'

/**
 * The screen's own address.
 *
 * Exported so `JourneyControls.test.tsx` asserts against the same string the
 * component builds every chip from, rather than against a second spelling of
 * it — and so the `page.tsx` that serves this address has one place to read it.
 */
export const JOURNEYS_PATH = '/admin/journeys'

/** What the chips print, which is SCREENS.md §2.2's own five words. */
const CHIP_LABEL: Readonly<Record<'all' | JourneyStatus, string>> = {
  all: 'All',
  published: 'Published',
  edited: 'Edited',
  draft: 'Draft',
  archived: 'Archived',
}

/** What the controls need: the two things the address already says. */
export interface JourneyControlsProps {
  /** What the author typed, so the box still holds it after the round trip. */
  readonly search: string
  /** Which chip is pressed. */
  readonly filter: 'all' | JourneyStatus
}

/**
 * One chip's address.
 *
 * `all` gets the BARE address rather than `?filter=all`: a filter of everything
 * is not a filter, and two addresses for one view is two entries in somebody's
 * history for the same screen.
 * @param filter - The chip.
 * @param search - What is in the box, carried along.
 * @returns The address, with only the parameters that say something.
 */
const chipHref = (filter: 'all' | JourneyStatus, search: string): string => {
  const params = new URLSearchParams()
  if (search !== '') params.set('q', search)
  if (filter !== 'all') params.set('filter', filter)
  const query = params.toString()
  return query === '' ? JOURNEYS_PATH : `${JOURNEYS_PATH}?${query}`
}

/**
 * Renders the search box and the five chips.
 *
 * @param props - See {@link JourneyControlsProps}.
 * @returns The form and the chip list, for `CreatePanel` to put in the row.
 * @example
 * <JourneyControls search="bergen" filter="all" />
 */
export const JourneyControls = ({ search, filter }: JourneyControlsProps): React.JSX.Element => (
  <>
    <form className={styles.searchForm} method="get" action={JOURNEYS_PATH}>
      <input
        type="search"
        name="q"
        defaultValue={search}
        placeholder="Search journeys, places, dates"
        aria-label="Search journeys, places and dates"
        className={styles.search}
      />
      {filter === 'all' ? null : <input type="hidden" name="filter" value={filter} />}
      <button type="submit" className={styles.searchSubmit}>
        Search
      </button>
    </form>

    <div className={styles.chips}>
      {JOURNEY_STATUS_FILTERS.map((chip) => (
        <a
          key={chip}
          data-chip={chip}
          href={chipHref(chip, search)}
          aria-current={chip === filter ? 'page' : undefined}
          className={chip === filter ? [styles.chip, styles.chipCurrent].join(' ') : styles.chip}
        >
          {CHIP_LABEL[chip]}
        </a>
      ))}
    </div>
  </>
)
