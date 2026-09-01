/**
 * MoodBadge — the Notes page's 98px mood circle, SCREENS.md §1.3.
 *
 * Presentational component (CLAUDE.md §3.3) with no hooks, no handlers and no
 * state. It is a separate file from {@link WeatherBadge} rather than one
 * badge component with a variant flag: the two differ in their ring (solid
 * against dashed), their rotation, their ink, their gap and — the reason a
 * flag would have been wrong — in what they draw inside. The weather badge
 * chooses between three glyphs from the journey's data; the mood badge always
 * draws the same rotated square, and has nothing to choose. A shared
 * component would have carried a boolean parameter into its public API,
 * which CLAUDE.md §3.2 bans outright, to save four lines of markup.
 *
 * The square is `aria-hidden` for the same reason the weather glyph is: the
 * label beside it already says "WIDE EYED" in words.
 * Depends on: react, ./notes.module.css.
 */
import type React from 'react'
import styles from './notes.module.css'

/** What the mood badge needs to draw itself. */
export interface MoodBadgeProps {
  /** The journey's free-text mood line, e.g. `'WIDE EYED'`. */
  readonly label: string
}

/**
 * Renders the mood badge: its rotated square over the journey's mood line.
 *
 * @param props - The mood line.
 * @returns The 98px mood circle.
 * @example
 * <MoodBadge label="WIDE EYED" />
 */
export const MoodBadge = ({ label }: MoodBadgeProps): React.JSX.Element => (
  <div data-badge="mood" className={styles.moodBadge}>
    <span aria-hidden="true" className={styles.moodGlyph} />
    <span className={styles.badgeLabel}>{label}</span>
  </div>
)
