'use client'

/**
 * CoverPreview — SCREENS.md §2.7's Cover card: a 172x224px live preview beside
 * the four fields that fill it, and four cloth swatches under both.
 *
 * ═══ A CLIENT ISLAND, AND "LIVE" IS THE WHOLE REASON ═══
 *
 * SCREENS.md §2.7 calls it a live preview. A preview that only redrew on save
 * would tell an author what their title used to do; the point of it is that a
 * title too long for the cover visibly shrinks as they type it. That is the
 * typed value and the drawn value in one render, which no form post reaches.
 * `lib/admin/shellShipsNoClientJs.test.ts` names this file in its allowlist
 * with that reason.
 *
 * ═══ THE PREVIEW USES THE DIARY'S OWN FITTER ═══
 *
 * `fitPreviewTitleSize` lives in `packages/domain/src/coverTitle.ts`, beside
 * the page's own `fitTitleSize` and the mobile reading mode's, so SCREENS.md
 * §1.1's "Title must fit, not truncate" and this preview cannot be changed
 * apart. It is NOT `fitTitleSize` with a smaller width: that function floors at
 * 38px, which in this 144px content box is three times the room a
 * thirty-character title needs. Both of its bounds are the admin prototype's
 * own `fitTitle(144, 36, …)` — see that function's doc comment.
 *
 * WHAT THE jsdom CASE CAN AND CANNOT PROVE. It asserts that the rendered
 * `font-size` is the fitter's answer for the typed string, which catches a
 * hard-coded size and catches the preview drifting from the diary's rule. It
 * does NOT prove the title fits: jsdom performs no layout, so nothing there
 * measures text against a boundary. The fitting property itself is a property
 * of the function, asserted in `coverTitle.test.ts`.
 *
 * ═══ ONE SAVE, NOT A WRITE PER FIELD ═══
 *
 * // HANDOFF-DEVIATION: the prototype's four inputs are `defaultValue` and
 * nothing persists them. `docs/deviations.md` §85 carries the same reasoning as
 * §2.6's card one screen over.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. One `useState` over five
 * values and one pure call per render.
 *
 * INVARIANT — the preview and the fields read the same state, so the box an
 * author is looking at is the box their next save writes. A preview fed from
 * props while the inputs held state would drift apart on the first keystroke,
 * which is exactly the defect a "live preview" exists to prevent.
 * Depends on: react, `fitPreviewTitleSize` (@travel-diary/domain/coverTitle),
 * `coverCloths` (@travel-diary/tokens/colour), `CoverFields`
 * (../../../lib/admin/coverMutations), ./book.module.css.
 */
import { fitPreviewTitleSize } from '@travel-diary/domain/coverTitle'
import { coverCloths } from '@travel-diary/tokens/colour'
import type React from 'react'
import { useState } from 'react'
import type { CoverFields } from '../../../lib/admin/coverMutations'
import styles from './book.module.css'

/** What SCREENS.md §2.7's Cover card needs to draw itself. */
export interface CoverPreviewProps {
  /** The five values the book holds now. */
  readonly cover: CoverFields
  /** Writes them. */
  readonly save: (cover: CoverFields) => Promise<void>
}

/**
 * The card's four text fields, in SCREENS.md §2.7's own order, each with the
 * class its type is set in: Title is Caveat 30px, Years shown is Courier 13px,
 * the other two are the shared input.
 */
const FIELDS = [
  { key: 'title', label: 'Title', className: styles.titleInput },
  { key: 'subtitle', label: 'Subtitle', className: styles.input },
  { key: 'owner', label: 'Kept by', className: styles.input },
  { key: 'yearsShown', label: 'Years shown', className: styles.yearsInput },
  // `className` is typed `string | undefined` because that is what a CSS
  // Module's generated type gives: the compiler cannot know which keys the
  // stylesheet declares. `className={undefined}` renders no attribute, which is
  // the same failure a typo would produce — `book.module.css` is one file and
  // the four classes below are declared in it.
] as const satisfies readonly {
  readonly key: keyof CoverFields
  readonly label: string
  readonly className: string | undefined
}[]

/**
 * Renders SCREENS.md §2.7's Cover card.
 *
 * @param props - See {@link CoverPreviewProps}.
 * @returns The preview, the four fields, the four swatches and the save button.
 * @example
 * <CoverPreview cover={view.cover} save={saveCover} />
 */
export const CoverPreview = ({ cover, save }: CoverPreviewProps): React.JSX.Element => {
  const [draft, setDraft] = useState<CoverFields>(cover)

  return (
    <section data-cover-card className={styles.card}>
      <h2 className={styles.cardTitleRuled}>The cover</h2>

      <div className={styles.coverInner}>
        {/* THE CLOTH IS A CUSTOM PROPERTY, which is `Cover.tsx`'s own spelling
         * for the same value: the colour is the one background an editor
         * chooses, so it cannot live in the stylesheet, and `book.module.css`
         * still owns the whole gradient stack. It is also the only spelling a
         * jsdom case can read back — a `background` is normalised to `rgb(...)`
         * there, so a case comparing the hex it passed in could never pass. */}
        <div
          data-cover-preview
          className={styles.preview}
          style={{ '--td-preview-cloth': draft.coverCloth } as React.CSSProperties}
        >
          <span aria-hidden="true" className={styles.previewRule} />
          <span className={styles.previewEyebrow}>Travel Diary</span>
          <span
            data-preview-title
            className={styles.previewTitle}
            style={{ fontSize: `${String(fitPreviewTitleSize(draft.title))}px` }}
          >
            {draft.title}
          </span>
          <span className={styles.previewSubtitle}>{draft.subtitle}</span>
          <span className={styles.previewOwner}>Kept by {draft.owner}</span>
        </div>

        <div className={styles.coverFields}>
          {FIELDS.map((field) => (
            <label key={field.key} className={styles.field}>
              <span className={styles.eyebrow}>{field.label}</span>
              <input
                type="text"
                data-cover-field={field.key}
                value={draft[field.key]}
                onChange={(event) => {
                  setDraft({ ...draft, [field.key]: event.target.value })
                }}
                className={field.className}
              />
            </label>
          ))}
        </div>
      </div>

      <div>
        <p className={styles.eyebrow}>Cover cloth</p>
        <div className={styles.swatches}>
          {coverCloths.map((cloth) => (
            <button
              key={cloth}
              type="button"
              data-cover-cloth={cloth}
              aria-pressed={draft.coverCloth === cloth}
              aria-label={`Cover cloth ${cloth}`}
              onClick={() => {
                setDraft({ ...draft, coverCloth: cloth })
              }}
              style={{ background: `linear-gradient(160deg, ${cloth}, rgba(0,0,0,.28))` }}
              className={draft.coverCloth === cloth ? styles.swatchOn : styles.swatch}
            />
          ))}
        </div>
      </div>

      <button
        type="button"
        data-save-cover
        onClick={() => {
          void save(draft)
        }}
        className={styles.save}
      >
        Save cover
      </button>
    </section>
  )
}
