/**
 * Furniture — SCREENS.md §2.3's Page furniture block: "the marks that make it
 * look kept, not typed". Sign-off, weather glyph, postage stamp, accent and
 * gallery address.
 *
 * A SERVER COMPONENT, AND IT OWNS NO FORM. Every control here is an input in
 * the Notes pane's single `<form action={saveNotes}>` — see `NotesPane.tsx`'s
 * header for why the pane is one form — so this file renders fields and the
 * pane renders the button that posts them. The editor ships no client
 * JavaScript (`lib/admin/shellShipsNoClientJs.test.ts` judges this directory),
 * which is why the two exclusive choices below are RADIO INPUTS with their
 * selected state drawn by `:checked`, and not buttons with an `onClick`.
 *
 * ═══ THE THREE WEATHER CARDS DRAW MARKS, NOT WORDS ═══
 *
 * The same defect species as Task 5's four layout glyphs, which shipped as four
 * identical rectangles and was found in a browser rather than by any case
 * (`docs/qa/2026-09-19-journey-editor-sweep.md`, EDITOR-002): three cards that
 * all draw NOTHING look like three cards with different labels, and a
 * screenshot of them is exactly what it is supposed to be. §2.3 asks for each
 * card to draw "its actual mark", so {@link GLYPH_MARKS} is an SVG per glyph
 * and `Furniture.test.tsx` asserts the three are distinct and none is empty.
 *
 * ═══ THE ACCENT LIST CAN GROW A SIXTH ENTRY, AND THAT IS NOT A FEATURE ═══
 *
 * {@link ACCENTS} is §2.3's five swatches. A journey whose stored accent is
 * none of them — a row edited outside this screen — would leave no radio
 * checked, so the form would post no `accent` at all and the save would be
 * refused on a field the author never touched. {@link swatchesFor} adds the
 * stored colour as a sixth swatch instead, so the value survives a save the
 * author made about something else. `lib/admin/notesMutations.ts`'s parse takes
 * any six-digit hex colour for the same reason, stated from the other end.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. Fields and two lookups.
 *
 * INVARIANT — exactly one `weatherGlyph` radio and exactly one `accent` radio
 * are checked, always, because a form that posts neither is a save the parse
 * refuses.
 * Depends on: react, `WEATHER_GLYPHS`/`WeatherGlyph`
 * (@travel-diary/domain/bookBundle), ./editor.module.css.
 */
import { WEATHER_GLYPHS, type WeatherGlyph } from '@travel-diary/domain/bookBundle'
import type React from 'react'
import styles from './editor.module.css'

/** What SCREENS.md §2.3's Page furniture block needs to draw itself. */
export interface FurnitureProps {
  /** The sign-off line, bottom right, in the author's hand. */
  readonly signoff: string
  /** Which of the three cards is pressed. */
  readonly weatherGlyph: WeatherGlyph
  /** The postage stamp's country line. */
  readonly stampCountry: string
  /** The postage stamp's face value. */
  readonly stampValue: string
  /** The journey accent, as a `#rrggbb` string. */
  readonly accent: string
  /** The gallery address's last segment. */
  readonly slug: string
}

/**
 * What each card calls its glyph.
 *
 * `Travel Diary Admin.dc.html`'s own three labels — "Clear", not "Sun": the
 * value is `'sun'` because that is the MARK, and the word under it is the
 * weather.
 */
const GLYPH_LABELS: Readonly<Record<WeatherGlyph, string>> = {
  sun: 'Clear',
  haze: 'Haze',
  wind: 'Wind',
}

/**
 * The mark each card draws.
 *
 * DRAWN, NOT DESCRIBED. See this module's header: a card whose mark is an empty
 * element is indistinguishable in a screenshot from one that is right. Each is a
 * different SHAPE rather than the same shape at a different opacity, so the
 * three are told apart by somebody who cannot read the label.
 */
const GLYPH_MARKS: Readonly<Record<WeatherGlyph, React.JSX.Element>> = {
  sun: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="4.6" fill="currentColor" />
      <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <line x1="12" y1="1.6" x2="12" y2="4.6" />
        <line x1="12" y1="19.4" x2="12" y2="22.4" />
        <line x1="1.6" y1="12" x2="4.6" y2="12" />
        <line x1="19.4" y1="12" x2="22.4" y2="12" />
        <line x1="4.7" y1="4.7" x2="6.8" y2="6.8" />
        <line x1="17.2" y1="17.2" x2="19.3" y2="19.3" />
        <line x1="4.7" y1="19.3" x2="6.8" y2="17.2" />
        <line x1="17.2" y1="6.8" x2="19.3" y2="4.7" />
      </g>
    </svg>
  ),
  haze: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      <circle cx="12" cy="9" r="4.2" fill="currentColor" opacity="0.4" />
      <g stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
        <line x1="3" y1="15.5" x2="21" y2="15.5" />
        <line x1="5.5" y1="19" x2="18.5" y2="19" />
      </g>
    </svg>
  ),
  wind: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      <g stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" fill="none">
        <path d="M2 8h11a3 3 0 1 0-3-3" />
        <path d="M2 13h16" />
        <path d="M2 18h8a2.6 2.6 0 1 1 2.6 2.6" />
      </g>
    </svg>
  ),
}

/**
 * SCREENS.md §2.3's five accent swatches, each with the prototype's own name.
 *
 * The names are the `title` and the accessible label: five squares that differ
 * only by colour are five unlabelled buttons to a screen reader.
 */
const ACCENTS: readonly (readonly [string, string])[] = [
  ['#3d817e', 'Pine'],
  ['#a06b3e', 'Tobacco'],
  ['#5a72a8', 'Slate blue'],
  ['#a15a4e', 'Terracotta'],
  ['#736247', 'Bark'],
]

/**
 * The swatches to draw for a journey whose accent is what it is.
 *
 * See this module's header: a stored colour outside the five gets a swatch of
 * its own rather than leaving the radio group unchecked, which would have the
 * save refused on a field the author never touched.
 * @param accent - The journey's stored accent.
 * @returns The five offered swatches, plus the stored one when it is not among them.
 */
const swatchesFor = (accent: string): readonly (readonly [string, string])[] =>
  ACCENTS.some(([colour]) => colour === accent) ? ACCENTS : [...ACCENTS, [accent, 'This journey’s own']]

/**
 * Renders SCREENS.md §2.3's Page furniture block.
 *
 * @param props - See {@link FurnitureProps}.
 * @returns The sign-off, the three weather cards, the stamp, the swatches and
 *   the gallery address.
 * @example
 * <Furniture signoff="…" weatherGlyph="sun" stampCountry="NIPPON" stampValue="120" accent="#3d817e" slug="tokyo" />
 */
export const Furniture = ({
  signoff,
  weatherGlyph,
  stampCountry,
  stampValue,
  accent,
  slug,
}: FurnitureProps): React.JSX.Element => (
  <section data-furniture className={styles.furniture}>
    <div className={styles.sectionHead}>
      <p className={styles.eyebrow}>Page furniture</p>
      <p className={styles.instruction}>the marks that make it look kept, not typed</p>
    </div>

    <label className={styles.field}>
      <span className={styles.eyebrow}>Sign-off — bottom right, in your hand</span>
      <input type="text" name="signoff" defaultValue={signoff} className={styles.signoffInput} />
    </label>

    <div className={styles.furnitureGrid}>
      <div>
        <p className={styles.eyebrow}>Weather glyph</p>
        <div className={styles.glyphCards}>
          {WEATHER_GLYPHS.map((glyph) => (
            <label key={glyph} data-glyph={glyph} title={GLYPH_LABELS[glyph]} className={styles.glyphCard}>
              <input
                type="radio"
                name="weatherGlyph"
                value={glyph}
                defaultChecked={glyph === weatherGlyph}
                className={styles.choice}
              />
              <span className={styles.glyphMark}>{GLYPH_MARKS[glyph]}</span>
              <span className={styles.glyphCardLabel}>{GLYPH_LABELS[glyph]}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <p className={styles.eyebrow}>Postage stamp</p>
        <div className={styles.stamp}>
          {/* A LIVE FACE, which is §2.3's own word: it is painted in the journey
           * accent as it stands, so the two inputs beside it are read against
           * the thing they describe rather than against a grey box. */}
          <span
            data-stamp-face
            className={styles.stampFace}
            style={{ background: `linear-gradient(170deg, ${accent}, rgba(0,0,0,.25))` }}
          >
            <span className={styles.stampCountry}>{stampCountry}</span>
            <span className={styles.stampValue}>{stampValue}</span>
          </span>
          <span className={styles.stampFields}>
            <input
              type="text"
              name="stampCountry"
              defaultValue={stampCountry}
              placeholder="NIPPON"
              aria-label="Postage stamp country"
              className={styles.stampCountryInput}
            />
            <input
              type="text"
              name="stampValue"
              defaultValue={stampValue}
              placeholder="120"
              aria-label="Postage stamp value"
              className={styles.stampValueInput}
            />
          </span>
        </div>
      </div>
    </div>

    <div className={styles.furnitureGrid}>
      <div>
        <p className={styles.eyebrow}>Accent — bookmark tab and stamp</p>
        <div className={styles.swatches}>
          {swatchesFor(accent).map(([colour, name]) => (
            <label
              key={colour}
              data-accent={colour}
              title={name}
              className={styles.swatch}
              style={{ background: `linear-gradient(160deg, ${colour}, rgba(0,0,0,.22))` }}
            >
              <input
                type="radio"
                name="accent"
                value={colour}
                defaultChecked={colour === accent}
                className={styles.choice}
              />
              <span className={styles.swatchName}>{name}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <p className={styles.eyebrow}>Gallery address</p>
        <div className={styles.address}>
          <span className={styles.addressPrefix}>/gallery/</span>
          <input
            type="text"
            name="slug"
            defaultValue={slug}
            aria-label="Gallery address"
            className={styles.addressInput}
          />
        </div>
      </div>
    </div>
  </section>
)
