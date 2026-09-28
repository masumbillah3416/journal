/**
 * NotifyCard — SCREENS.md §2.11's "Tell me when": two toggles, writing
 * `users.notifyOnPublish` and `users.notifyWeekly`.
 *
 * A TOGGLE IS A FORM, SO THIS CARD SHIPS NO CLIENT JAVASCRIPT. Each switch is
 * a `<button type="submit">` inside its own `<form>`, carrying two hidden
 * fields: the column it writes and the value it is switching TO. That is what
 * lets a server-rendered card turn a setting OFF — a checkbox that is off
 * posts nothing at all, so a form built the obvious way could only ever switch
 * things on. `readNotificationToggle` (`lib/admin/accountMutations.ts`) is the
 * parse on the other side, and it refuses any name that is not one of these
 * two columns.
 *
 * TWO FORMS RATHER THAN ONE, deliberately, and for a reason stronger than
 * §2.9's: one form would need a Save, §2.11 draws toggles, and a single form
 * posting both columns would let a page drawn before the other toggle was
 * pressed write that toggle's old value back.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. Two rows and two forms.
 *
 * THE SWITCH'S HIT AREA IS THE BUTTON, NOT THE TRACK — `ReadersCard.tsx`'s
 * SET-002 fix, for its reason: the track is 46x24 because a 44px-tall switch
 * does not read as a switch, and `--td-min-hit-target` is 44px. Its accessible
 * name is an `aria-label`, because the control carries no text of its own.
 * Depends on: react, `AccountNotifications`
 * (../../../lib/admin/readAccountScreen), ./account.module.css.
 */
import type React from 'react'
import type { AccountNotifications } from '../../../lib/admin/readAccountScreen'
import styles from './account.module.css'

/** One row of SCREENS.md §2.11's "Tell me when". */
interface NotifyToggle {
  /** The `users` column it writes. Every row is addressed by this. */
  readonly setting: 'notifyOnPublish' | 'notifyWeekly'
  /** What the toggle is called. */
  readonly label: string
  /** The line beneath it, saying what turning it on does. */
  readonly hint: string
  /** Whether it is on now. */
  readonly on: boolean
}

/** What SCREENS.md §2.11's second card needs to draw itself. */
export interface NotifyCardProps {
  /** The two columns' current values. */
  readonly notifications: AccountNotifications
  /** Writes one toggle. Handed that toggle's form body. */
  readonly setNotification: (form: FormData) => Promise<void>
}

/**
 * The two rows, in the order §2.11 lists them.
 *
 * A FUNCTION OF THE VALUES rather than a constant with a lookup: this card has
 * exactly two toggles, both named in `SCREENS.md` §2.11 ("a note when a
 * publish finishes, weekly reader summary"), and a registry to hold two rows
 * would be an abstraction for a single caller (CLAUDE.md §4).
 * @param notifications - The two columns' current values.
 * @returns The rows to draw.
 */
const rowsFor = (notifications: AccountNotifications): readonly NotifyToggle[] => [
  {
    setting: 'notifyOnPublish',
    label: 'A note when a publish finishes',
    hint: 'one email, to the sign-in address, once the book has gone out',
    on: notifications.onPublish,
  },
  {
    setting: 'notifyWeekly',
    label: 'Weekly reader summary',
    hint: 'how many people opened the diary in the last seven days',
    on: notifications.weekly,
  },
]

/**
 * Renders SCREENS.md §2.11's "Tell me when".
 *
 * @param props - See {@link NotifyCardProps}.
 * @returns The card: one form per toggle.
 * @example
 * <NotifyCard notifications={view.notifications} setNotification={saveNotifications} />
 */
export const NotifyCard = ({ notifications, setNotification }: NotifyCardProps): React.JSX.Element => (
  <section data-account-notify className={styles.card}>
    <div className={styles.cardHead}>
      <h2 className={styles.cardTitle}>Tell me when</h2>
    </div>

    <ul className={styles.toggles}>
      {rowsFor(notifications).map((toggle) => (
        // KEYED BY THE COLUMN, never by position (CLAUDE.md §0.9).
        <li key={toggle.setting} className={styles.toggleRow}>
          <form action={setNotification} className={styles.toggleForm}>
            <input type="hidden" name="setting" value={toggle.setting} />
            {/* THE VALUE IT SWITCHES TO. See this module's header. */}
            <input type="hidden" name="on" value={toggle.on ? 'false' : 'true'} />
            <span className={styles.toggleText}>
              <span className={styles.toggleLabel}>{toggle.label}</span>
              <span className={styles.hint}>{toggle.hint}</span>
            </span>
            <button
              type="submit"
              data-setting={toggle.setting}
              data-on={String(toggle.on)}
              aria-pressed={toggle.on}
              aria-label={toggle.on ? `Turn off: ${toggle.label}` : `Turn on: ${toggle.label}`}
              className={styles.switch}
            >
              <span aria-hidden="true" className={styles.track}>
                <span className={styles.knob} />
              </span>
            </button>
          </form>
        </li>
      ))}
    </ul>
  </section>
)
