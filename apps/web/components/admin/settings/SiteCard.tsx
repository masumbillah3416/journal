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
 * IT REDRAWS WHAT WAS TYPED WHEN THE SAVE WAS REFUSED (docs/deviations.md
 * §104). `type="email"` is not the whole guard it was recorded as being —
 * `a@b` is an address every browser calls valid and `z.email()` does not, and
 * a browser measured this card answering 500 for it. The four names are posted
 * in {@link KEPT_FIELDS_NAME} so the refused render can put them back.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. Fields in a form.
 * Depends on: react, `FormRefusal`/`KEPT_FIELDS_NAME`/`keptValue`
 * (../../../lib/admin/formRefusal), `SiteIdentity`
 * (../../../lib/admin/readSettingsScreen), ./settings.module.css.
 */
import type React from 'react'
import { KEPT_FIELDS_NAME, keptValue, type FormRefusal } from '../../../lib/admin/formRefusal'
import type { SiteIdentity } from '../../../lib/admin/readSettingsScreen'
import styles from './settings.module.css'

/** What SCREENS.md §2.9's "The site" card needs to draw itself. */
export interface SiteCardProps {
  /** The four values the global holds now. */
  readonly site: SiteIdentity
  /** Writes them. Handed the card's whole form body. */
  readonly save: (form: FormData) => Promise<void>
  /** This render's refusal, so a refused save redraws what was typed. */
  readonly refusal: FormRefusal | null
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
  /**
   * The input's own type, where it is not text.
   *
   * `email` ON REPLY-TO IS A FIX, NOT A FLOURISH (SET-002's neighbour,
   * SET-003). `readSiteForm` refuses an address that is not one, which is
   * CLAUDE.md §3.1's rule and stays the real guard — but a Server Action that
   * throws answers 500 and loses the four typed values, and §2.9 draws no
   * error state to put a message in. Every browser enforces `type="email"`
   * natively, with no JavaScript, so the obvious refusals happen in the field.
   *
   * IT IS NOT THE WHOLE GUARD, which §104 recorded it as being: HTML's own
   * email grammar admits `a@b`, `z.email()` requires a dotted domain, and a
   * browser measured the gap answering 500. The refusal now reaches the
   * screen — see this module's header.
   */
  readonly type?: 'email'
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
  {
    name: 'replyTo',
    label: 'Reply-to',
    hint: 'the address the About page offers a reader; leave it empty for none',
    type: 'email',
  },
]

/**
 * Renders SCREENS.md §2.9's "The site" card.
 *
 * @param props - See {@link SiteCardProps}.
 * @returns The card, as one form.
 * @example
 * <SiteCard site={view.site} save={saveSiteFields} refusal={refusal} />
 */
export const SiteCard = ({ site, save, refusal }: SiteCardProps): React.JSX.Element => (
  <form data-settings-site action={save} className={styles.card}>
    {/* The allowlist of values a refusal may hand back — see
        `lib/admin/formRefusal.ts`. One hidden field per name, written off the
        same table the boxes are, so the two cannot drift. */}
    {FIELDS.map((field) => (
      <input key={`keep-${field.name}`} type="hidden" name={KEPT_FIELDS_NAME} value={field.name} />
    ))}

    <div className={styles.cardHead}>
      <h2 className={styles.cardTitle}>The site</h2>
    </div>

    <div className={styles.fields}>
      {FIELDS.map((field) => (
        <label key={field.name} data-site-field={field.name} className={styles.field}>
          <span className={styles.eyebrow}>{field.label}</span>
          {field.long === true ? (
            <textarea
              name={field.name}
              rows={3}
              defaultValue={keptValue(refusal, field.name, site[field.name])}
              className={styles.textarea}
            />
          ) : (
            <input
              type={field.type ?? 'text'}
              name={field.name}
              defaultValue={keptValue(refusal, field.name, site[field.name])}
              className={styles.input}
            />
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
