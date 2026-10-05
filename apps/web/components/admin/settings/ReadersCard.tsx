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
 * ═══ "NO PAGE, NO GALLERY AND NO PHOTOGRAPH IS SERVED" IS A CHECKED CLAIM ═══
 *
 * The "Careful now" paragraph tells the author what pressing the most
 * destructive control on this screen does, so it is a promise rather than
 * copy. Its last third was FALSE when this card was written — a closed book
 * still served every photograph through Payload's own routes. It is closed at
 * `apps/web/collections/media.ts`'s `read` rule.
 * `apps/web/lib/bookGateRegistration.test.ts` counts the surfaces and
 * `e2e/bookGate.spec.ts` asks a running server for each; the hint under the
 * fourth toggle (`readSettingsScreen.ts`'s `READER_COPY`) makes the same
 * promise and is covered by the same cases.
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
import { OFFLINE_SETTING, type ReaderToggle } from '../../../lib/admin/readSettingsScreen'
import styles from './settings.module.css'

/** What SCREENS.md §2.9's Readers card needs to draw itself. */
export interface ReadersCardProps {
  /** One row per `checkbox` the `site` global declares, in its own order. */
  readonly toggles: readonly ReaderToggle[]
  /** Whether the book is already closed, which decides the button's state. */
  readonly bookIsOffline: boolean
  /**
   * Whether a reader password is set — never what it is.
   *
   * It decides two things on this card: what the password field says above
   * it, and whether the close toggle can be pressed at all.
   */
  readonly hasReaderPassword: boolean
  /** Saves a new reader password. Handed the password field's form body. */
  readonly savePassword: (form: FormData) => Promise<void>
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
  hasReaderPassword,
  savePassword,
  setSetting,
  takeOffline,
}: ReadersCardProps): React.JSX.Element => (
  <section data-settings-readers className={styles.card}>
    <div className={styles.cardHead}>
      <h2 className={styles.cardTitle}>Readers</h2>
    </div>

    {/*
     * THE FIELD COMES BEFORE THE TOGGLE THAT NEEDS IT. Closing the book is
     * refused without a password - by the screen here and by
     * `setReaderSetting` underneath - so the thing to do first is drawn
     * first. `docs/deviations.md` §100 is the entry about what closing the
     * book used to mean.
     */}
    <form action={savePassword} className={styles.passwordForm} data-reader-password>
      <label className={styles.toggleLabel} htmlFor="readerPassword">
        Reader password
      </label>
      <p className={styles.hint}>
        Everyone who reads the diary types this. Saving a new one signs out everyone who typed the old one.
      </p>
      <p className={styles.hint} data-reader-password-state>
        {hasReaderPassword ? 'A password is set.' : 'No password yet.'}
      </p>
      {/* NEVER `value` OR `defaultValue`: the hash is all this screen is
       * given, and a field that round-tripped a password would need one. */}
      <input
        className={styles.input}
        id="readerPassword"
        name="readerPassword"
        type="password"
        autoComplete="new-password"
        maxLength={200}
        required
      />
      <button type="submit" className={styles.save}>
        Save password
      </button>
    </form>

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
              // THE ONE TOGGLE THAT CAN BE REFUSED, AND IT SAYS SO BEFORE IT
              // IS PRESSED. `setReaderSetting` throws when the book would be
              // closed with no password stored, so a reader-password-less
              // author would see a refusal either way - but a switch that can
              // be flicked and then rejected is a worse screen than one that
              // cannot be flicked yet. Only when turning it ON.
              disabled={toggle.setting === OFFLINE_SETTING && !toggle.on && !hasReaderPassword}
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
