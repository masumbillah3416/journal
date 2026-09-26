/**
 * LatelyCard — SCREENS.md §2.1's "Lately": two columns of rows, each an 82px
 * timestamp beside a description.
 *
 * ═══ IT LISTS WHAT CHANGED, NOT WHAT HAPPENED ═══
 *
 * The prototype's rows are events — "Rewrote the Tokyo note", "Published
 * edition 14". `DATA_MODEL.md` records no event log, so a row claiming WHAT
 * was done would be a sentence this repository invented. What IS recorded is
 * every row's `updatedAt`, which is what `readOverview` sorts and this draws.
 * `docs/deviations.md` records the difference and what it costs the card.
 *
 * THE TIMESTAMP IS A DATE, not "2h ago", for `readJourneysScreen.ts`'s reason
 * (`docs/deviations.md` §54): a relative string is a function of the current
 * instant, and this screen is rendered once on the server.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. A card and a list.
 * Depends on: react, `LatelyRow` (../../../lib/admin/readOverview),
 * ./overview.module.css.
 */
import type React from 'react'
import type { LatelyRow } from '../../../lib/admin/readOverview'
import styles from './overview.module.css'

/** What the card draws. */
export interface LatelyCardProps {
  /** What changed most recently, newest first. */
  readonly rows: readonly LatelyRow[]
}

/**
 * Renders SCREENS.md §2.1's "Lately" card.
 *
 * @param props - See {@link LatelyCardProps}.
 * @returns The heading and one row per entry, or one line for a diary with no
 *   history yet.
 * @example
 * <LatelyCard rows={view.lately} />
 */
export const LatelyCard = ({ rows }: LatelyCardProps): React.JSX.Element => (
  <section data-overview-lately className={[styles.card, styles.latelyCard].join(' ')}>
    <div className={styles.cardHead}>
      <h2 className={styles.cardTitle}>Lately</h2>
    </div>

    {rows.length === 0 ? (
      <p data-lately-empty className={styles.empty}>
        Nothing has been written yet.
      </p>
    ) : (
      <ul className={styles.lately}>
        {rows.map((row) => (
          // KEYED BY COLLECTION AND ROW ID, never by position (CLAUDE.md §0.9).
          <li key={row.id} data-lately-row={row.id} className={styles.latelyRow}>
            <span data-lately-when className={styles.latelyWhen}>
              {row.at}
            </span>
            <span data-lately-what className={styles.latelyWhat}>
              {row.what}
            </span>
          </li>
        ))}
      </ul>
    )}
  </section>
)
