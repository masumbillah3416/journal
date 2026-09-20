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
 * `<select>` over it plus the submit that applies the choice — the smallest
 * control that actually replaces a portrait and ships no JavaScript. Its first
 * option is valued `''`, which `coverMutations.ts` reads as "leave the portrait
 * alone", so a save about the paragraphs cannot empty the mount. See
 * `docs/deviations.md` §83.
 *
 * ═══ THE KIT DRAWS ONE INPUT MORE THAN IT HOLDS ═══
 *
 * The trailing empty input is how a line is ADDED with no JavaScript: type in
 * it and save. It works because `readAbout` drops blank kit lines, so the empty
 * one costs nothing when it is left empty — and that is why the kit and the
 * paragraphs are treated differently, which `coverMutations.ts`'s header sets
 * out in full.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. Fields in a form.
 *
 * INVARIANT — the card always renders exactly `ABOUT_PARAGRAPHS` paragraph
 * boxes, because the parse refuses a body with any other count. The padding is
 * `readCoverScreen.ts`'s, so a global holding one paragraph still posts two.
 * Depends on: react, `ABOUT_PARAGRAPHS` (../../../lib/admin/coverMutations),
 * `AboutCardContent` (../../../lib/admin/readCoverScreen), ./book.module.css.
 */
import type React from 'react'
import { ABOUT_PARAGRAPHS } from '../../../lib/admin/coverMutations'
import type { AboutCardContent } from '../../../lib/admin/readCoverScreen'
import styles from './book.module.css'

/** What SCREENS.md §2.7's About card needs to draw itself. */
export interface AboutCardProps {
  /** The content the global holds now. */
  readonly about: AboutCardContent
  /** Writes it. Handed the card's whole form body. */
  readonly save: (form: FormData) => Promise<void>
}

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
 * <AboutCard about={view.about} save={saveAbout} />
 */
export const AboutCard = ({ about, save }: AboutCardProps): React.JSX.Element => (
  <form data-about-card action={save} className={styles.card}>
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
              defaultValue={about.paragraphs[index] ?? ''}
              className={styles.paragraph}
            />
          </label>
        ))}

        <div>
          <p className={styles.eyebrow}>Kit</p>
          <div className={styles.kit}>
            {/* ONE INPUT MORE THAN THERE ARE LINES — see this module's header. */}
            {[...about.kit, ''].map((line, index) => (
              <span key={`kit-${String(index)}`} className={styles.kitRow}>
                <span aria-hidden="true" className={styles.grip}>
                  ::
                </span>
                <input
                  type="text"
                  name="kit"
                  data-kit-line={index}
                  defaultValue={line}
                  aria-label={index === about.kit.length ? 'Add a kit line' : `Kit line ${String(index + 1)}`}
                  className={styles.kitInput}
                />
              </span>
            ))}
          </div>
        </div>

        <label className={styles.field}>
          <span className={styles.eyebrow}>Reply-to address</span>
          <input type="text" name="replyTo" data-reply-to defaultValue={about.replyTo} className={styles.replyTo} />
        </label>
      </div>
    </div>

    <button type="submit" data-save-about className={styles.save}>
      Save about
    </button>
  </form>
)
