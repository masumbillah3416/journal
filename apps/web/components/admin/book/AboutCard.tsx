/**
 * AboutCard — SCREENS.md §2.7's About card: a 140px portrait with Replace, two
 * paragraph textareas, a Kit list of grip-and-input rows, and a reply-to
 * address in Caveat 26px.
 *
 * A SERVER COMPONENT, AND THE WHOLE CARD IS ONE `<form>`. `NotesPane.tsx`'s
 * shape one screen over, for its reason: every control here is an ordinary
 * field and the card posts them together, so nothing on this side of the screen
 * reaches the browser. `lib/admin/shellShipsNoClientJs.test.ts` judges this
 * directory and admits only the two islands that are declared there.
 *
 * ═══ REPLACE IS A SELECT, BECAUSE THE PROTOTYPE'S BUTTON OPENS NOTHING ═══
 *
 * // HANDOFF-DEVIATION: `Travel Diary Admin.dc.html`'s Replace carries no
 * handler at all. This repository has a media library, so Replace is a
 * `<select>` over it plus a submit — the smallest control that actually replaces
 * a portrait and ships no JavaScript. THE WHOLE CARD IS ONE `<form>`, so
 * "Replace" saves the paragraphs and the Kit alongside the portrait, exactly as
 * "Save about" does; the two buttons differ in their label and in nothing else,
 * because a second form inside this one would be invalid HTML that browsers
 * resolve by dropping it. Its first option is valued `''`, which
 * `coverMutations.ts` reads as "leave the portrait alone", so a save about the
 * paragraphs cannot empty the mount. See `docs/deviations.md` §83.
 *
 * ═══ THE KIT DRAWS ONE INPUT MORE THAN IT HOLDS ═══
 *
 * The trailing empty input is how a line is ADDED with no JavaScript: type in
 * it and save. It works because `readAbout` drops blank kit lines, so the empty
 * one costs nothing when it is left empty — and that is why the kit and the
 * paragraphs are treated differently, which `coverMutations.ts`'s header sets
 * out in full.
 *
 * ═══ A REFUSED SAVE REDRAWS WHAT WAS TYPED (docs/deviations.md §104) ═══
 *
 * This is §104's first row and the one a browser measured first: the reply-to
 * is a plain text box against `z.email()`, so `not-an-address` answered HTTP
 * 500 and took the paragraphs and the kit with it. The card names its own
 * fields in {@link KEPT_FIELDS_NAME}, and the three repeated ones are read
 * back with `keptValues` rather than `keptValue` — an author who cleared every
 * kit line posted none, and `?? stored` would hand them the old list back.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. Fields in a form.
 *
 * INVARIANT — the card always renders exactly `ABOUT_PARAGRAPHS` paragraph
 * boxes, because the parse refuses a body with any other count. The padding is
 * `readCoverScreen.ts`'s, so a global holding one paragraph still posts two.
 * Depends on: react, `ABOUT_PARAGRAPHS` (../../../lib/admin/coverMutations),
 * `FormRefusal`/`KEPT_FIELDS_NAME`/`keptValue`/`keptValues`
 * (../../../lib/admin/formRefusal), `AboutCardContent`
 * (../../../lib/admin/readCoverScreen), ./book.module.css.
 */
import type React from 'react'
import { ABOUT_PARAGRAPHS } from '../../../lib/admin/coverMutations'
import { KEPT_FIELDS_NAME, keptValue, keptValues, type FormRefusal } from '../../../lib/admin/formRefusal'
import type { AboutCardContent } from '../../../lib/admin/readCoverScreen'
import styles from './book.module.css'

/** What SCREENS.md §2.7's About card needs to draw itself. */
export interface AboutCardProps {
  /** The content the global holds now. */
  readonly about: AboutCardContent
  /** Writes it. Handed the card's whole form body. */
  readonly save: (form: FormData) => Promise<void>
  /** This render's refusal, so a refused save redraws what was typed. */
  readonly refusal: FormRefusal | null
}

/** The fields a refusal may hand back — the card's own three typed names. */
const KEPT = ['paragraph', 'kit', 'replyTo'] as const

/**
 * The kit lines to draw: what was typed when the save was refused, otherwise
 * what the global holds.
 *
 * ITS OWN FUNCTION BECAUSE THE TRAILING BOX COUNTS FROM IT. The card draws one
 * input more than there are lines, and the `aria-label` that calls the last one
 * "Add a kit line" has to be keyed to the same list — a refused save that added
 * a line has one more.
 * @param refusal - This render's refusal, or `null`.
 * @param stored - The lines the global holds.
 * @returns The lines to draw, without the trailing empty one.
 */
const keptKit = (refusal: FormRefusal | null, stored: readonly string[]): readonly string[] =>
  keptValues(refusal, 'kit', stored).filter((line, index, lines) => line !== '' || index < lines.length - 1)

/** What each paragraph box is called. `Travel Diary Admin.dc.html`'s own two labels. */
const PARAGRAPH_LABELS = ['Opening paragraph', 'Second paragraph'] as const

/**
 * The label for one paragraph box.
 *
 * Falls back to a numbered label rather than an empty one: `ABOUT_PARAGRAPHS`
 * is the count the card draws and {@link PARAGRAPH_LABELS} is the prototype's
 * two words for it, so raising the count without naming the third box would
 * otherwise print an eyebrow with nothing in it.
 * @param index - The box's position.
 * @returns Its label.
 */
const paragraphLabel = (index: number): string => PARAGRAPH_LABELS[index] ?? `Paragraph ${String(index + 1)}`

/**
 * Renders SCREENS.md §2.7's About card.
 *
 * @param props - See {@link AboutCardProps}.
 * @returns The card, as one form.
 * @example
 * <AboutCard about={view.about} save={saveAbout} refusal={refusal} />
 */
export const AboutCard = ({ about, save, refusal }: AboutCardProps): React.JSX.Element => (
  <form data-about-card action={save} className={styles.card}>
    {/* The allowlist of values a refusal may hand back — see
        `lib/admin/formRefusal.ts`. The portrait is deliberately absent: it is a
        `<select>` over the library, and a refusal redraws the library. */}
    {KEPT.map((name) => (
      <input key={`keep-${name}`} type="hidden" name={KEPT_FIELDS_NAME} value={name} />
    ))}
    <h2 className={styles.cardTitleRuled}>About page</h2>

    <div className={styles.aboutInner}>
      <div className={styles.portraitColumn}>
        {/* A DERIVATIVE OR AN EMPTY MOUNT. `readCoverScreen.ts` answers `null`
         * for a global with no portrait AND for an upload too small to have a
         * `thumb`, and both draw the same empty box rather than a broken image. */}
        {about.portraitSrc === null ? (
          <span data-portrait-empty aria-hidden="true" className={styles.portraitEmpty} />
        ) : (
          // A plain `<img>` on a Payload derivative already sized for this
          // 140px mount, exactly as `JourneyPool.tsx` draws its pool tiles:
          // `next/image` would put a second optimisation pass in front of an
          // image the media pipeline has already produced.
          <img
            data-portrait
            src={about.portraitSrc}
            alt={about.portraitAlt}
            loading="lazy"
            decoding="async"
            className={styles.portrait}
          />
        )}

        <label className={styles.field}>
          <span className={styles.eyebrow}>Portrait</span>
          <select name="portrait" data-portrait-choices defaultValue="" className={styles.select}>
            <option value="">Keep the current portrait</option>
            {about.choices.map((choice) => (
              <option key={choice.id} value={choice.id}>
                {choice.filename}
              </option>
            ))}
          </select>
        </label>

        <button type="submit" data-replace-portrait className={styles.quiet}>
          Replace
        </button>
      </div>

      <div className={styles.aboutFields}>
        {Array.from({ length: ABOUT_PARAGRAPHS }, (_, index) => (
          <label key={paragraphLabel(index)} className={styles.field}>
            <span className={styles.eyebrow}>{paragraphLabel(index)}</span>
            <textarea
              rows={3}
              name="paragraph"
              data-paragraph={index}
              defaultValue={keptValues(refusal, 'paragraph', about.paragraphs)[index] ?? ''}
              className={styles.paragraph}
            />
          </label>
        ))}

        <div>
          <p className={styles.eyebrow}>Kit</p>
          <div className={styles.kit}>
            {/* ONE INPUT MORE THAN THERE ARE LINES — see this module's header. */}
            {[...keptKit(refusal, about.kit), ''].map((line, index) => (
              <span key={`kit-${String(index)}`} className={styles.kitRow}>
                <span aria-hidden="true" className={styles.grip}>
                  ::
                </span>
                <input
                  type="text"
                  name="kit"
                  data-kit-line={index}
                  defaultValue={line}
                  aria-label={
                    index === keptKit(refusal, about.kit).length ? 'Add a kit line' : `Kit line ${String(index + 1)}`
                  }
                  className={styles.kitInput}
                />
              </span>
            ))}
          </div>
        </div>

        <label className={styles.field}>
          <span className={styles.eyebrow}>Reply-to address</span>
          <input
            type="text"
            name="replyTo"
            data-reply-to
            defaultValue={keptValue(refusal, 'replyTo', about.replyTo)}
            className={styles.replyTo}
          />
        </label>
      </div>
    </div>

    <button type="submit" data-save-about className={styles.save}>
      Save about
    </button>
  </form>
)
