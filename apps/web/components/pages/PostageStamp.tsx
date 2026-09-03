/**
 * PostageStamp — one perforated mini stamp, SCREENS.md §1.6.
 *
 * Presentational component (CLAUDE.md §3.3) with no hooks, no handlers and no
 * state. Three of them sit beside the About page's reply-to address, and it
 * is those three uses that earn this file: the perforated mount, the tinted
 * face, the country line and the face value are one shape drawn three times,
 * differing only in the tint, the two strings and the angle.
 *
 * THE WHOLE STAMP IS `aria-hidden`, like every other decoration in the diary.
 * "NIPPON 120" is printed furniture on a fictional stamp, not content — the
 * journeys it alludes to are named properly in the Contents index and on
 * their own pages — so announcing it between the reader's own address and the
 * end of the book would only add noise. `Cover.tsx` hides its airmail stamp
 * for the same reason.
 *
 * WHAT THE PAGE OWNS IS THE ANGLE AND THE TINT, and it passes both in one
 * class. The angle is a `transform` and the tint is `--stamp-accent`, which
 * the face's own gradient reads — a custom property set on the mount
 * inherits, so one class per stamp carries both and `postageStamp.module.css`
 * still owns the whole gradient stack. SCREENS.md gives the three angles as
 * `-6deg`, `+4deg` and `-2deg`; they are authored values, not jitter, exactly
 * as the Frames pages' seven rotations are.
 *
 * IT IS NOT THE NOTES PAGE'S STAMP. `Notes.tsx` prints a 76x92px stamp with
 * its own padding, perforation pitch and type sizes (SCREENS.md §1.3), and
 * every one of those numbers differs from this one's 56x68px face. Folding
 * the two together would mean a component whose every measurement arrived as
 * a prop, which is a worse module than two honest ones - see CLAUDE.md §3.3
 * on abstractions that serve a single caller.
 * Depends on: react, ./postageStamp.module.css.
 */
import type React from 'react'
import styles from './postageStamp.module.css'

/** What one mini stamp needs to be drawn. */
export interface PostageStampProps {
  /** The country line across the top of the face, e.g. `'NIPPON'`. */
  readonly country: string
  /** The face value under it, e.g. `'120'`. */
  readonly value: string
  /**
   * The class carrying this stamp's own angle and `--stamp-accent` tint, from
   * the printing page's stylesheet. Admits `undefined` because a CSS Module's
   * generated type does.
   */
  readonly className: string | undefined
}

/**
 * Renders one perforated mini stamp.
 *
 * @param props - The stamp's two printed lines and the class carrying its
 *   angle and tint.
 * @returns The stamp, hidden from assistive technology.
 * @example
 * <PostageStamp country="NIPPON" value="120" className={styles.stampOne} />
 */
export const PostageStamp = ({ country, value, className }: PostageStampProps): React.JSX.Element => (
  // Joined rather than interpolated, for the reason `PhotoMount.tsx` states.
  <div data-decoration="stamp" aria-hidden="true" className={[styles.mount, className].join(' ')}>
    <div data-stamp-face="" className={styles.face}>
      <span className={styles.country}>{country}</span>
      <span className={styles.value}>{value}</span>
    </div>
  </div>
)
