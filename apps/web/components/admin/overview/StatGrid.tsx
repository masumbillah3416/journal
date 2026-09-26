/**
 * StatGrid — SCREENS.md §2.1's four stat cards: a label, a figure, a note and
 * a 3px full-height coloured tick at the left edge.
 *
 * A SERVER COMPONENT, and so is every card on this screen but the copy
 * control. Nothing here changes without a round trip, so `/admin` ships
 * essentially no JavaScript for its own content — which matters on the one
 * admin screen `lighthouserc.admin.json` gates by its bare address.
 *
 * IT DECIDES NOTHING. Every label, figure, note and colour is
 * `overviewStats`', which is a pure domain function at 100%; this file is the
 * markup and the class names. That split is why the singular/plural arms are
 * testable at all — see that module's header.
 *
 * THE TICK'S COLOUR IS A CUSTOM PROPERTY rather than a `background` written
 * inline, the shape `ChangesCard.tsx` already uses: it is the card's own datum,
 * and it is the only spelling a jsdom case can read back, since a `background`
 * is normalised there.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. It is a list.
 * Depends on: react, `OverviewStat` (@travel-diary/domain/admin/overviewStats),
 * ./overview.module.css.
 */
import type { OverviewStat } from '@travel-diary/domain/admin/overviewStats'
import type React from 'react'
import styles from './overview.module.css'

/** What the grid draws. */
export interface StatGridProps {
  /** The four cards, from `overviewStats`. */
  readonly stats: readonly OverviewStat[]
}

/**
 * Renders SCREENS.md §2.1's stat grid.
 *
 * @param props - See {@link StatGridProps}.
 * @returns One card per stat.
 * @example
 * <StatGrid stats={view.stats} />
 */
export const StatGrid = ({ stats }: StatGridProps): React.JSX.Element => (
  <ul data-overview-stats className={styles.stats}>
    {stats.map((stat) => (
      // KEYED BY WHAT THE CARD IS ABOUT, never by position (CLAUDE.md §0.9).
      <li key={stat.id} data-stat-id={stat.id} className={styles.stat}>
        <span
          data-stat-tick
          aria-hidden="true"
          className={styles.tick}
          style={{ '--td-stat-tone': stat.tone } as React.CSSProperties}
        />
        <p data-stat-label className={styles.statLabel}>
          {stat.label}
        </p>
        <span data-stat-value className={styles.statValue}>
          {stat.value}
        </span>
        <p data-stat-note className={styles.statNote}>
          {stat.note}
        </p>
      </li>
    ))}
  </ul>
)
