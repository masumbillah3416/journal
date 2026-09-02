/**
 * WeatherBadge — the Notes page's 98px weather circle, SCREENS.md §1.3.
 *
 * Presentational component (CLAUDE.md §3.3) with no hooks, no handlers and no
 * state, so it costs the diary route no interactivity.
 *
 * THE THREE GLYPHS ARE DRAWN IN CSS, not shipped as images: SCREENS.md §1.3
 * specifies them as geometry — "sun 16px circle #a34434 · haze same at
 * opacity .45 · wind 20x4px bar with box-shadow: 0 7px 0 -1px, 0 -7px 0
 * -1px" — and three HTTP requests for two circles and a bar would cost more
 * than the rules that draw them. This file's only job is choosing WHICH of
 * the three, from the journey's own `weatherGlyph`; the geometry itself is
 * `notes.module.css`'s.
 *
 * The glyph is `aria-hidden`. It carries no information the label beside it
 * does not already say in words ("CLEAR 14C"), so exposing it would only put
 * an unnamed graphic between the journey's name and its weather.
 *
 * The chosen glyph is published to the DOM as `data-weather-glyph`, so a
 * browser test can assert WHICH glyph was drawn rather than infer it from a
 * measured width — `e2e/notes.spec.ts` reads it.
 *
 * THE LABEL'S SIZE IS COMPUTED, the same way {@link MoodBadge}'s is:
 * `badgeLabelFontSize` (`packages/domain/src/badgeLabelFit.ts`) shrinks a
 * weather line past a length threshold so it fits the shared 98px circle
 * (`docs/deviations.md` §14). No seeded weather line is long enough to
 * trigger it — the longest is 9 characters against a 10-character
 * threshold — but the badge shares its stylesheet class with the mood badge,
 * so it shares this behaviour rather than fitting only the case that has
 * shown up in the seed so far.
 * Depends on: react, `WeatherGlyph` (@travel-diary/domain/bookBundle),
 * `badgeLabelFontSize` (@travel-diary/domain/badgeLabelFit), ./notes.module.css.
 */
import { badgeLabelFontSize } from '@travel-diary/domain/badgeLabelFit'
import type { WeatherGlyph } from '@travel-diary/domain/bookBundle'
import type React from 'react'
import styles from './notes.module.css'

/** What the weather badge needs to draw itself. */
export interface WeatherBadgeProps {
  /** The journey's free-text weather line, e.g. `'CLEAR 14C'`. */
  readonly label: string
  /** Which of the three glyphs to draw. */
  readonly glyph: WeatherGlyph
}

/**
 * The class `notes.module.css` draws each glyph with. A lookup rather than a
 * `styles[glyph]` index, so the three names a stylesheet reader greps for
 * appear literally in this file.
 */
const GLYPH_CLASS_NAME: Readonly<Record<WeatherGlyph, string | undefined>> = {
  sun: styles.sunGlyph,
  haze: styles.hazeGlyph,
  wind: styles.windGlyph,
}

/**
 * Renders the weather badge: its glyph over the journey's weather line.
 *
 * @param props - The weather line and which glyph to draw.
 * @returns The 98px weather circle.
 * @example
 * <WeatherBadge label="CLEAR 14C" glyph="sun" />
 */
export const WeatherBadge = ({ label, glyph }: WeatherBadgeProps): React.JSX.Element => (
  <div data-badge="weather" className={styles.weatherBadge}>
    <span data-weather-glyph={glyph} aria-hidden="true" className={GLYPH_CLASS_NAME[glyph]} />
    <span className={styles.badgeLabel} style={{ fontSize: `${String(badgeLabelFontSize(label))}px` }}>
      {label}
    </span>
  </div>
)
