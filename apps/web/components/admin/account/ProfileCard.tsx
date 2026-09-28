/**
 * ProfileCard — SCREENS.md §2.11's "Who is keeping this": the avatar, the name
 * on the cover, the sign-off used on pages and the time zone.
 *
 * ONE FORM AND A SAVE, SO THIS CARD SHIPS NO CLIENT JAVASCRIPT. The three
 * fields are written together because they are one card with one button, which
 * is what §2.11 draws — unlike the toggles next door, where a press IS the
 * write. `readProfileForm` (`lib/admin/accountMutations.ts`) is the parse on
 * the other side.
 *
 * ═══ THE AVATAR IS A MONOGRAM, AND THERE IS NO REPLACE ═══
 *
 * §2.11 asks for "a 132px avatar with Replace". `DATA_MODEL.md`'s `users`
 * section declares six fields and none of them is an image, so there is
 * nothing to draw and nothing for Replace to write. The circle is the design's
 * — 132px, ringed — and what is inside it is the account's initial, the same
 * monogram `NavRail.tsx`'s profile block already prints.
 * `docs/deviations.md` §106 carries the decision and what would reverse it.
 *
 * ═══ THE TIME ZONE OPTIONS CARRY AN EXAMPLE, WHICH IS §2.11's OWN PHRASE ═══
 *
 * "a Time zone select whose options state how dates are written" — so a label
 * is `Asia/Tokyo — 29 September 2026, 07:05` rather than a zone name. The
 * labels are built by `readAccountScreen.ts`, which also guarantees the
 * account's own zone is among them even when this repository does not list it.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. One form and three fields.
 * Depends on: react, `AccountProfile` (../../../lib/admin/readAccountScreen),
 * ./account.module.css.
 */
import type React from 'react'
import type { AccountProfile } from '../../../lib/admin/readAccountScreen'
import styles from './account.module.css'

/** What SCREENS.md §2.11's first card needs to draw itself. */
export interface ProfileCardProps {
  /** The three fields and the select's options. */
  readonly profile: AccountProfile
  /** Writes the card. Handed the whole form body. */
  readonly save: (form: FormData) => Promise<void>
}

/**
 * Renders SCREENS.md §2.11's "Who is keeping this".
 *
 * @param props - See {@link ProfileCardProps}.
 * @returns The card: a monogram, three fields and a Save.
 * @example
 * <ProfileCard profile={view.profile} save={saveProfile} />
 */
export const ProfileCard = ({ profile, save }: ProfileCardProps): React.JSX.Element => (
  <section data-account-profile className={styles.card}>
    <div className={styles.cardHead}>
      <h2 className={styles.cardTitle}>Who is keeping this</h2>
    </div>

    <form action={save}>
      <div className={styles.identity}>
        {/* NOT AN IMAGE, AND NOT A BUTTON. See this module's header and
         * docs/deviations.md §106: there is no stored picture and nothing to
         * replace it with, so this is decoration and is hidden from a screen
         * reader — the name is in the field beside it. */}
        <span data-account-avatar aria-hidden="true" className={styles.avatar}>
          {profile.initial}
        </span>

        <div className={styles.identityFields}>
          <label data-account-field="name" className={styles.field}>
            <span className={styles.eyebrow}>Name on the cover</span>
            <input
              name="name"
              type="text"
              defaultValue={profile.name}
              className={[styles.input, styles.nameInput].join(' ')}
            />
          </label>

          <label data-account-field="signoff" className={styles.field}>
            <span className={styles.eyebrow}>Sign-off used on pages</span>
            <input
              name="signoff"
              type="text"
              defaultValue={profile.signoff}
              className={[styles.input, styles.signoffInput].join(' ')}
            />
          </label>

          <label data-account-field="timeZone" className={styles.field}>
            <span className={styles.eyebrow}>Time zone</span>
            <select name="timeZone" defaultValue={profile.timeZone} className={styles.select}>
              {profile.timeZoneOptions.map((option) => (
                // KEYED BY THE ZONE, never by position (CLAUDE.md §0.9).
                <option key={option.zone} value={option.zone}>
                  {option.label}
                </option>
              ))}
            </select>
            <span className={styles.hint}>every date in the diary is written in this zone</span>
          </label>
        </div>
      </div>

      <button type="submit" data-save-profile className={styles.save}>
        Save changes
      </button>
    </form>
  </section>
)
