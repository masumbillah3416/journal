/**
 * TallyTicket — the Notes page's four-cell tally, SCREENS.md §1.3.
 *
 * Presentational component (CLAUDE.md §3.3) with no hooks, no handlers and no
 * state.
 *
 * IT IS A DESCRIPTION LIST, not four divs. Every cell is a label over the
 * value it labels ("KILOMETRES WALKED" over "147"), which is what `<dl>`
 * means; a screen reader then reads the pair as a pair rather than as two
 * unrelated strings, and the association survives the fact that the two sit
 * in different elements for layout reasons. Each cell is a `<div>` wrapping
 * its own `<dt>`/`<dd>`, which the HTML specification allows inside `<dl>`
 * and which is what lets the four cells be flex items.
 *
 * IT IS `flex: 0 0 auto`, sized to its content — see `notes.module.css`'s
 * header for why nothing in the left column except the ephemera slot may
 * grow.
 *
 * The values are TEXT, never numbers: the seeded journeys record "plenty"
 * hills and "uncounted" wrong turns alongside "19" custard tarts, and
 * SCREENS.md's copy is final. Nothing here formats, rounds or pluralises
 * them.
 *
 * Cells are keyed by their own label, not by array position (CLAUDE.md §7) —
 * a journey's four keys are distinct by construction, and the schema caps
 * the array at exactly four rows.
 * Depends on: react, `TallyCell` (@travel-diary/domain/bookBundle),
 * ./notes.module.css.
 */
import type { TallyCell } from '@travel-diary/domain/bookBundle'
import type React from 'react'
import styles from './notes.module.css'

/** What the tally ticket needs to print itself. */
export interface TallyTicketProps {
  /** The journey's tally cells, in stored order. The schema caps this at four. */
  readonly cells: readonly TallyCell[]
}

/**
 * Renders the tally ticket: one cell per key/value pair, divided by dotted
 * rules.
 *
 * @param props - The journey's tally cells.
 * @returns The tally ticket.
 * @example
 * <TallyTicket cells={[{ key: 'Days', value: '12' }]} />
 */
export const TallyTicket = ({ cells }: TallyTicketProps): React.JSX.Element => (
  <dl data-tally="" className={styles.tally}>
    {cells.map((cell) => (
      <div data-tally-cell="" key={cell.key} className={styles.tallyCell}>
        <dt className={styles.tallyKey}>{cell.key}</dt>
        <dd className={styles.tallyValue}>{cell.value}</dd>
      </div>
    ))}
  </dl>
)
