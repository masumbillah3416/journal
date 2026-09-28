/**
 * GettingInCard — SCREENS.md §2.11's "Getting in": the sign-in address, the
 * two password boxes, and the toggle `SECURITY.md` calls the only source of
 * truth for the code step.
 *
 * ═══ THE TOGGLE IS ITS OWN FORM, AND THAT IS WHY THE HINT CAN BE SERVER-DRAWN ═══
 *
 * §2.11 gives the toggle a hint that "switches between" two sentences. Inside
 * the password form it would need the browser to re-render on a click, which
 * is a client island; as a form of its own a press IS the write, and the next
 * render — the same round trip — draws the other sentence. So this card ships
 * no client JavaScript, and `shellShipsNoClientJs.test.ts` holds it to that.
 *
 * Both sentences are `SCREENS.md`'s own words ({@link OTP_HINTS}), because the
 * one thing an author must be able to trust on this card is what the second
 * factor is doing.
 *
 * ═══ THE PASSWORD REFUSAL IS A SERVER ROUND TRIP ═══
 *
 * `changePassword` (`lib/admin/accountMutations.ts`) returns a Result, the
 * action redirects with {@link PASSWORD_NOTICE_PARAM}, and this card prints the
 * line. That is the shape `docs/deviations.md` §104 names as the preferred one
 * for the five screens that still turn a refusal into a 500: it ships no
 * JavaScript, and it keeps the error state out of the client-island allowlist.
 * §104 is NOT closed by this card — the Zod refusals on the other five screens
 * are still its own, and so is the Zod refusal on this screen's own toggles.
 *
 * ═══ THE TWO BOXES ARE NOT PREFILLED, AND CARRY NO `autoComplete` GUESS ═══
 *
 * A password field the browser fills is a password the author did not type,
 * and the current-password box is the one thing standing between a borrowed
 * session and a changed credential. `autoComplete` is named explicitly —
 * `current-password` and `new-password` — so a manager offers the right one
 * rather than guessing from the field order.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. Two forms and a line of copy.
 * Depends on: react, `AccountGettingIn` (../../../lib/admin/readAccountScreen),
 * `PasswordNotice` (../../../lib/admin/accountMutations), ./account.module.css.
 */
import type React from 'react'
import type { PasswordNotice } from '../../../lib/admin/accountMutations'
import type { AccountGettingIn } from '../../../lib/admin/readAccountScreen'
import styles from './account.module.css'

/**
 * SCREENS.md §2.11's two hints, verbatim.
 *
 * Exported so `GettingInCard.test.tsx` compares the drawn hint against the
 * handoff's own words rather than against a second copy of them written in the
 * test.
 */
export const OTP_HINTS = {
  /** What the hint says while the code step is on. */
  on: 'six digits sent to the email above, then five minutes to use them',
  /** What it says while it is off. */
  off: 'off — your password alone signs you in',
} as const

/**
 * What the card says about a password change that has just been attempted.
 *
 * One sentence per {@link PasswordNotice}, and `done` decides whether the line
 * is drawn as a refusal or as a confirmation.
 */
const PASSWORD_NOTICES: Readonly<Record<PasswordNotice, { readonly line: string; readonly done: boolean }>> = {
  changed: { line: 'That is your password from now on. Your other devices stay signed in.', done: true },
  'wrong-password': {
    // IT SAYS WHAT THE COUNTER COSTS, because `changePassword` verifies through
    // Payload's own login and five wrong ones lock the account for fifteen
    // minutes — the same lockout the sign-in screen has. An author who is
    // guessing deserves to know that before the fifth guess.
    line: 'That is not the current password. Five wrong tries lock the account for fifteen minutes, here as at the sign-in screen.',
    done: false,
  },
  'empty-password': { line: 'Type the new password you want. An empty box changes nothing.', done: false },
}

/** What SCREENS.md §2.11's third card needs to draw itself. */
export interface GettingInCardProps {
  /** The address and the state of the code step. */
  readonly gettingIn: AccountGettingIn
  /** What the last password attempt did, or `null` when there has been none. */
  readonly notice: PasswordNotice | null
  /** Changes the password. Handed the two boxes. */
  readonly changePassword: (form: FormData) => Promise<void>
  /** Writes the code-step setting. Handed the value it is switching to. */
  readonly setOtpRequired: (form: FormData) => Promise<void>
}

/**
 * Renders SCREENS.md §2.11's "Getting in".
 *
 * @param props - See {@link GettingInCardProps}.
 * @returns The card: the address, two forms and the toggle.
 * @example
 * <GettingInCard gettingIn={view.gettingIn} notice={notice}
 *   changePassword={changePassword} setOtpRequired={setOtpRequired} />
 */
export const GettingInCard = ({
  gettingIn,
  notice,
  changePassword,
  setOtpRequired,
}: GettingInCardProps): React.JSX.Element => {
  const said = notice === null ? null : PASSWORD_NOTICES[notice]

  return (
    <section data-account-getting-in className={styles.card}>
      <div className={styles.cardHead}>
        <h2 className={styles.cardTitle}>Getting in</h2>
      </div>

      <div className={styles.fields}>
        <div data-account-field="email" className={styles.field}>
          <span className={styles.eyebrow}>Sign-in email</span>
          {/* PRINTED, NOT AN INPUT. Nothing on this screen changes the address
           * a reader signs in with: `DATA_MODEL.md` gives `users` no way to
           * re-verify one, and a box that looked editable and was not is the
           * defect docs/deviations.md §103 records four of. */}
          <p data-account-email className={styles.address}>
            {gettingIn.email}
          </p>
        </div>
      </div>

      <form action={changePassword}>
        <div className={styles.fields}>
          <div className={styles.passwords}>
            <label data-account-field="current" className={styles.field}>
              <span className={styles.eyebrow}>Current password</span>
              <input name="current" type="password" autoComplete="current-password" className={styles.input} />
            </label>

            <label data-account-field="next" className={styles.field}>
              <span className={styles.eyebrow}>New password</span>
              <input name="next" type="password" autoComplete="new-password" className={styles.input} />
            </label>
          </div>
        </div>

        {said === null ? null : (
          <p
            data-password-notice={notice}
            // A REFUSAL IS ANNOUNCED, a confirmation is not: `alert` interrupts
            // a screen reader, which is right for "that did not work" and wrong
            // for "that worked".
            role={said.done ? undefined : 'alert'}
            className={[styles.notice, said.done ? styles.noticeDone : ''].join(' ')}
          >
            <span aria-hidden="true" className={styles.noticeMark} />
            {said.line}
          </p>
        )}

        <button type="submit" data-save-password className={styles.save}>
          Save changes
        </button>
      </form>

      <ul className={styles.toggles}>
        <li className={styles.toggleRow}>
          <form action={setOtpRequired} className={styles.toggleForm}>
            {/* THE VALUE IT SWITCHES TO — `NotifyCard.tsx`'s reason: a checkbox
             * that is off posts nothing, so a form built that way could never
             * turn the second factor back on. */}
            <input type="hidden" name="on" value={gettingIn.otpRequired ? 'false' : 'true'} />
            <span className={styles.toggleText}>
              <span className={styles.toggleLabel}>One-time code at sign-in</span>
              <span data-otp-hint className={styles.hint}>
                {gettingIn.otpRequired ? OTP_HINTS.on : OTP_HINTS.off}
              </span>
            </span>
            <button
              type="submit"
              data-setting="otpRequired"
              data-on={String(gettingIn.otpRequired)}
              aria-pressed={gettingIn.otpRequired}
              aria-label={
                gettingIn.otpRequired ? 'Turn off: One-time code at sign-in' : 'Turn on: One-time code at sign-in'
              }
              className={styles.switch}
            >
              <span aria-hidden="true" className={styles.track}>
                <span className={styles.knob} />
              </span>
            </button>
          </form>
        </li>
      </ul>
    </section>
  )
}
