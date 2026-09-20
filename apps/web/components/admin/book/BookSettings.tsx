'use client'

/**
 * BookSettings — SCREENS.md §2.6's Book settings card: the contents note, the
 * journey order, the cover cloth, the two sliders and the three toggles.
 *
 * ═══ A CLIENT ISLAND, AND THE SLIDERS ARE THE WHOLE REASON ═══
 *
 * SCREENS.md §2.6 states it outright: "Both sliders are controlled and their
 * readouts follow the value." A `<input type="range">` whose label follows it
 * is a value the browser holds and a number the page prints from that value —
 * there is no form post between the two, and no server render can be inserted
 * into a drag. `lib/admin/shellShipsNoClientJs.test.ts` names this file in its
 * allowlist with that reason, and judges every other module in this directory
 * exactly as before.
 *
 * ═══ ONE SAVE, NOT A WRITE PER CONTROL ═══
 *
 * // HANDOFF-DEVIATION: `Travel Diary Admin.dc.html` has no Save button on this
 * screen — every control mutates the prototype's own state and nothing is
 * persisted. A slider that wrote on `onChange` would be one `POST` per pixel of
 * the drag (React's `onChange` on a range is the `input` event), and a chip
 * that wrote on click while the sliders did not would be two different saving
 * models on one card. So the card holds its eight values and "Save settings"
 * commits them, which is the shape §2.3's "Save draft" and §2.5's "Save frame"
 * already use. See `docs/deviations.md` §85.
 *
 * ═══ THE RANGES ARE THE COLUMNS' OWN ═══
 *
 * `FLIP_DURATION_MS` and `GALLERY_THUMB_SIZE` are the domain constants
 * `apps/web/globals/book.schema.test.ts` compares the `book` global's own
 * `min`/`max` against, so a track an author can drag to and a value the column
 * refuses cannot come apart. The two STEPS are SCREENS.md §2.6's own and live
 * here: a step is what the control offers, not what the write accepts, and the
 * parse deliberately takes any whole number in range.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. One `useState` over the card's
 * own eight values.
 *
 * INVARIANT — every control on this card is bound to `settings`, so the card
 * posts exactly what it draws. A control added with a `defaultValue` instead
 * would be saved as whatever the last render had, silently.
 * Depends on: react, `JOURNEY_ORDER_MODES` (@travel-diary/domain/bookBundle),
 * `FLIP_DURATION_MS` (@travel-diary/domain/flip), `GALLERY_THUMB_SIZE`
 * (@travel-diary/domain/gallery), `coverCloths` (@travel-diary/tokens/colour),
 * `BookSettings` (../../../lib/admin/bookMutations), ./book.module.css.
 */
import { JOURNEY_ORDER_MODES, type JourneyOrderMode } from '@travel-diary/domain/bookBundle'
import { FLIP_DURATION_MS } from '@travel-diary/domain/flip'
import { GALLERY_THUMB_SIZE } from '@travel-diary/domain/gallery'
import { coverCloths } from '@travel-diary/tokens/colour'
import type React from 'react'
import { useState } from 'react'
import type { BookSettings as Settings } from '../../../lib/admin/bookMutations'
import styles from './book.module.css'

/** What SCREENS.md §2.6's Book settings card needs to draw itself. */
export interface BookSettingsProps {
  /** The eight values the book holds now. */
  readonly settings: Settings
  /** Writes them. */
  readonly save: (settings: Settings) => Promise<void>
}

/** The page-turn slider's step. SCREENS.md §2.6: "range 400–1600 step 50". */
const FLIP_STEP_MS = 50

/** The gallery-thumbnail slider's step. SCREENS.md §2.6: "140–300 step 10". */
const THUMB_STEP_PX = 10

/** What each journey order chip says, in `JOURNEY_ORDER_MODES`' own order. */
const ORDER_LABELS: Readonly<Record<JourneyOrderMode, string>> = {
  manual: 'As arranged',
  newest: 'Newest first',
  oldest: 'Oldest first',
}

/** The three toggles, each with SCREENS.md §2.6's own label and the prototype's hint. */
const TOGGLES = [
  { key: 'showDecorations', label: 'Tape, stamps and stickers', hint: 'drawn on the cover and the pages' },
  { key: 'showRibbon', label: 'Ribbon bookmark', hint: 'down the spine of the book' },
  { key: 'showCounter', label: 'Page counter', hint: 'shown under the book' },
] as const satisfies readonly { readonly key: keyof Settings; readonly label: string; readonly hint: string }[]

/**
 * Renders SCREENS.md §2.6's Book settings card.
 *
 * @param props - See {@link BookSettingsProps}.
 * @returns The card, its six groups and its save button.
 * @example
 * <BookSettings settings={view.settings} save={saveBookSettings} />
 */
export const BookSettings = ({ settings, save }: BookSettingsProps): React.JSX.Element => {
  const [draft, setDraft] = useState<Settings>(settings)

  return (
    <section data-book-settings className={styles.card}>
      <h2 className={styles.cardTitleRuled}>Book settings</h2>

      <label className={styles.field}>
        <span className={styles.eyebrow}>Contents page note</span>
        <textarea
          rows={2}
          data-contents-note
          value={draft.contentsNote}
          onChange={(event) => {
            setDraft({ ...draft, contentsNote: event.target.value })
          }}
          className={styles.note}
        />
      </label>

      <div>
        <p className={styles.eyebrow}>Journey order</p>
        <div className={styles.chips}>
          {JOURNEY_ORDER_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              data-order-mode={mode}
              aria-pressed={draft.journeyOrderMode === mode}
              onClick={() => {
                setDraft({ ...draft, journeyOrderMode: mode })
              }}
              className={draft.journeyOrderMode === mode ? styles.chipOn : styles.chip}
            >
              {ORDER_LABELS[mode]}
            </button>
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
              data-cloth={cloth}
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

      <div>
        <p className={styles.eyebrow}>Page turn</p>
        <input
          type="range"
          data-flip-slider
          aria-label="Page turn"
          min={FLIP_DURATION_MS.min}
          max={FLIP_DURATION_MS.max}
          step={FLIP_STEP_MS}
          value={draft.flipDurationMs}
          onChange={(event) => {
            setDraft({ ...draft, flipDurationMs: Number(event.target.value) })
          }}
          className={styles.range}
        />
        <p className={styles.rangeLabels}>
          <span>brisk</span>
          <span data-flip-readout>{draft.flipDurationMs} ms</span>
          <span>languid</span>
        </p>
      </div>

      <div>
        <p className={styles.eyebrow}>Gallery thumbnail</p>
        <input
          type="range"
          data-thumb-slider
          aria-label="Gallery thumbnail"
          min={GALLERY_THUMB_SIZE.min}
          max={GALLERY_THUMB_SIZE.max}
          step={THUMB_STEP_PX}
          value={draft.galleryThumbPx}
          onChange={(event) => {
            setDraft({ ...draft, galleryThumbPx: Number(event.target.value) })
          }}
          className={styles.range}
        />
        <p className={styles.rangeLabels}>
          <span>dense</span>
          <span data-thumb-readout>{draft.galleryThumbPx} px</span>
          <span>generous</span>
        </p>
      </div>

      <div className={styles.toggles}>
        {TOGGLES.map((toggle) => (
          <label key={toggle.key} data-toggle={toggle.key} className={styles.toggle}>
            <input
              type="checkbox"
              checked={draft[toggle.key]}
              onChange={(event) => {
                setDraft({ ...draft, [toggle.key]: event.target.checked })
              }}
              className={styles.toggleBox}
            />
            <span>
              <span className={styles.toggleLabel}>{toggle.label}</span>
              <span className={styles.toggleHint}>{toggle.hint}</span>
            </span>
          </label>
        ))}
      </div>

      <button
        type="button"
        data-save-settings
        onClick={() => {
          void save(draft)
        }}
        className={styles.save}
      >
        Save settings
      </button>
    </section>
  )
}
