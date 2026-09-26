/**
 * ReadersCard — SCREENS.md §2.9's "Readers": five toggles, one per `site`
 * checkbox, then a "Careful now" block.
 *
 * ═══ A TOGGLE IS A FORM, SO THIS CARD SHIPS NO CLIENT JAVASCRIPT ═══
 *
 * Each switch is a `<button type="submit">` inside its own `<form>`, carrying
 * two hidden fields: the column it writes and the value it is switching TO.
 * That is what lets a server-rendered card turn a setting OFF — a checkbox
 * that is off posts nothing at all, so a form built the obvious way could
 * only ever switch things on. `readReaderToggle`
 * (`lib/admin/siteMutations.ts`) is the parse on the other side, and it
 * refuses any name the `site` global does not declare as a checkbox.
 *
 * FIVE FORMS RATHER THAN ONE, deliberately. One form would need a Save, and
 * §2.9 draws toggles rather than a form with a button; five forms also mean a
 * press writes one column, so no toggle can overwrite another's value from a
 * stale page.
 *
 * ═══ THE LIST IS THE GLOBAL'S, NOT THIS FILE'S ═══
 *
 * The rows come from `readSettingsScreen`, which reads the `site` global's own
 * `checkbox` fields in their declared order. `ReadersCard.test.tsx` extracts
 * the same list from the config and compares, so the toggles a reader sees and
 * the columns that exist cannot drift.
 *
 * ═══ "TAKE THE BOOK OFFLINE" WRITES THE COLUMN THE FOURTH TOGGLE WRITES ═══
 *
 * There is exactly one column in this data model that stops a reader being
 * served, and both controls write it (`docs/deviations.md` §102). So the
 * button is the one-press version and the block says so; once the book is
 * closed the button has nothing left to do and is rendered inert, with the
 * `:disabled` rule that makes it look inert.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. Rows and forms.
 *
 * THE SWITCH'S HIT AREA IS THE BUTTON, NOT THE TRACK, and that is SET-002's
 * fix rather than a styling choice: the track is 46x24, because a 44px-tall
 * switch does not read as a switch, and `--td-min-hit-target` is 44px. Its
 * accessible name is an `aria-label`, because the control carries no text —
 * `has no axe violations on /admin/settings, with all three of §2.9's cards
 * drawn` (`e2e/a11y.spec.ts`) is what would fail if that label were dropped.
 * Depends on: react, `ReaderToggle` (../../../lib/admin/readSettingsScreen),
 * ./settings.module.css.
 */
import type React from 'react'
import type { ReaderToggle } from '../../../lib/admin/readSettingsScreen'
import styles from './settings.module.css'

/** What SCREENS.md §2.9's Readers card needs to draw itself. */
export interface ReadersCardProps {
  /** One row per `checkbox` the `site` global declares, in its own order. */
  readonly toggles: readonly ReaderToggle[]
  /** Whether the book is already closed, which decides the button's state. */
  readonly bookIsOffline: boolean
  /** Writes one setting. Handed a toggle's form body. */
  readonly setSetting: (form: FormData) => Promise<void>
  /** Closes the whole book. Takes no fields. */
  readonly takeOffline: (form: FormData) => Promise<void>
}

/**
 * Renders SCREENS.md §2.9's Readers card.
 *
 * @param props - See {@link ReadersCardProps}.
 * @returns The card: one form per toggle, and the "Careful now" block.
 * @example
 * <ReadersCard toggles={view.readers} bookIsOffline={view.bookIsOffline}
 *   setSetting={setReaderSetting} takeOffline={takeBookOffline} />
 */
export const ReadersCard = ({
  toggles,
  bookIsOffline,
  setSetting,
  takeOffline,
}: ReadersCardProps): React.JSX.Element => (
  <section data-settings-readers className={styles.card}>
    <div className={styles.cardHead}>
      <h2 className={styles.cardTitle}>Readers</h2>
    </div>

    <ul className={styles.toggles}>
      {toggles.map((toggle) => (
        // KEYED BY THE COLUMN, never by position (CLAUDE.md §0.9).
        <li key={toggle.setting} className={styles.toggleRow}>
          <form action={setSetting} className={styles.toggleForm}>
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
              // THE NAME IS ON THE BUTTON, not in a hidden span: the switch
              // has no text of its own, and this repository has no
              // visually-hidden utility to invent one with. axe's
              // `button-name` is asserted on this screen in
              // `e2e/a11y.spec.ts`.
              aria-label={toggle.on ? `Turn off: ${toggle.label}` : `Turn on: ${toggle.label}`}
              className={styles.switch}
            >
              {/* THE TRACK IS A CHILD, so the button can carry the 44px hit
               * area this repository's `--td-min-hit-target` asks for while
               * the switch still looks like a switch (SET-002). */}
              <span aria-hidden="true" className={styles.track}>
                <span className={styles.knob} />
              </span>
            </button>
          </form>
        </li>
      ))}
    </ul>

    <div className={styles.careful}>
      <p className={styles.eyebrow}>Careful now</p>
      <p className={styles.body}>
        Taking the book offline closes it to everybody at once: no page, no gallery and no photograph is served, and
        anyone who follows a link is told the diary is closed rather than shown any of it. It is the same switch as
        &ldquo;Close the whole book&rdquo; above, and that switch is how you open it again.
      </p>
      <form action={takeOffline}>
        <button
          type="submit"
          data-take-offline
          disabled={bookIsOffline}
          className={[styles.save, styles.danger].join(' ')}
        >
          {bookIsOffline ? 'The book is offline' : 'Take the book offline'}
        </button>
      </form>
    </div>
  </section>
)
