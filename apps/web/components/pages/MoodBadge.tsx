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
 *
 * THE LABEL'S SIZE IS COMPUTED, like {@link Cover}'s title: `badgeLabelFontSize`
 * (`packages/domain/src/badgeLabelFit.ts`) shrinks a mood past a length
 * threshold so it fits the 98px circle SCREENS.md §1.3 specifies, rather than
 * overflowing it the way the self-hosted Courier Prime measurement found
 * "OVERWHELMED" doing (`docs/deviations.md` §14). The size arrives as an
 * inline `font-size` because it depends on the editor's mood text, which no
 * stylesheet can see; `notes.module.css` still owns the family, tracking and
 * padding for every label that does not need to shrink.
 * Depends on: react, `badgeLabelFontSize` (@travel-diary/domain/badgeLabelFit),
 * ./notes.module.css.
 */
import { badgeLabelFontSize } from '@travel-diary/domain/badgeLabelFit'
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
    <span className={styles.badgeLabel} style={{ fontSize: `${String(badgeLabelFontSize(label))}px` }}>
      {label}
    </span>
  </div>
)
