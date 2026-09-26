/**
 * SiteCard — SCREENS.md §2.9's "The site": Site name, Address, Description and
 * Reply-to, each with an italic hint beneath.
 *
 * A SERVER COMPONENT, AND THE WHOLE CARD IS ONE `<form>`. `AboutCard.tsx`'s
 * shape one screen over, for its reason: every control here is an ordinary
 * field and the card posts them together, so nothing on this side of the
 * screen reaches the browser. `lib/admin/shellShipsNoClientJs.test.ts` judges
 * this directory and admits no island in it.
 *
 * THE HINTS ARE OURS. §2.9 asks for "an italic hint beneath" each field and
 * gives no words for three of the four, so they say what the field actually
 * does in this repository — the address is where the diary is served, the
 * description is what a search result prints, the reply-to is the one the
 * About page carries. `docs/deviations.md` §103 records the copy.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. Fields in a form.
 * Depends on: react, `SiteIdentity` (../../../lib/admin/readSettingsScreen),
 * ./settings.module.css.
 */
import type React from 'react'
import type { SiteIdentity } from '../../../lib/admin/readSettingsScreen'
import styles from './settings.module.css'

/** What SCREENS.md §2.9's "The site" card needs to draw itself. */
export interface SiteCardProps {
  /** The four values the global holds now. */
  readonly site: SiteIdentity
  /** Writes them. Handed the card's whole form body. */
  readonly save: (form: FormData) => Promise<void>
}

/** One field of the card: its column, its label and the hint beneath it. */
interface SiteField {
  /** The `site` column it writes, which is also its form field name. */
  readonly name: keyof SiteIdentity
  /** The label above the box. */
  readonly label: string
  /** The italic line beneath it. */
  readonly hint: string
  /** Whether it is the multi-line one. */
  readonly long?: true
}

/**
 * The four fields, in §2.9's own order.
 *
 * A TABLE RATHER THAN FOUR BLOCKS OF MARKUP, so the card cannot draw three
 * fields while claiming four — `SiteCard.test.tsx` counts them off this.
 */
const FIELDS: readonly SiteField[] = [
  { name: 'name', label: 'Site name', hint: 'what the rail says above the buttons, and what a shared link is titled' },
  { name: 'domain', label: 'Address', hint: 'the domain this diary is served at, without the https://' },
  {
    name: 'description',
    label: 'Description',
    hint: 'the sentence a search result prints under the title',
    long: true,
  },
  { name: 'replyTo', label: 'Reply-to', hint: 'the address the About page offers a reader; leave it empty for none' },
]

/**
 * Renders SCREENS.md §2.9's "The site" card.
 *
 * @param props - See {@link SiteCardProps}.
 * @returns The card, as one form.
 * @example
 * <SiteCard site={view.site} save={saveSiteFields} />
 */
export const SiteCard = ({ site, save }: SiteCardProps): React.JSX.Element => (
  <form data-settings-site action={save} className={styles.card}>
    <div className={styles.cardHead}>
      <h2 className={styles.cardTitle}>The site</h2>
    </div>

    <div className={styles.fields}>
      {FIELDS.map((field) => (
        <label key={field.name} data-site-field={field.name} className={styles.field}>
          <span className={styles.eyebrow}>{field.label}</span>
          {field.long === true ? (
            <textarea name={field.name} rows={3} defaultValue={site[field.name]} className={styles.textarea} />
          ) : (
            <input type="text" name={field.name} defaultValue={site[field.name]} className={styles.input} />
          )}
          <span className={styles.hint}>{field.hint}</span>
        </label>
      ))}
    </div>

    <button type="submit" data-save-site className={styles.save}>
      Save the site
    </button>
  </form>
)
