/**
 * Cover — the diary's front cover, SCREENS.md §1.1 transcribed.
 *
 * Presentational component (CLAUDE.md §3.3) over the `book` global's own
 * fields: it prints what {@link BookChrome} hands it and decides nothing
 * except which lines an editor has actually filled in. It holds no hooks, no
 * handlers and no state, so it costs the diary route no interactivity — the
 * whole page is one static subtree.
 *
 * EVERY MEASUREMENT HERE IS ABSOLUTE, not responsive. The cover lives inside
 * the 1300x860 design box that `Book.tsx` scales as a whole, so `70px` means
 * seventy CSS pixels of that box at every viewport and nothing on this page
 * ever reflows (see `cover.module.css`'s header).
 *
 * THE ONE COMPUTED VALUE is the title's font size, and it is computed in the
 * domain, not here: `fitTitleSize` (`packages/domain/src/coverTitle.ts`)
 * implements SCREENS.md §1.1's "Title must fit, not truncate" clamp, with its
 * own 100%-covered suite. The size arrives as an inline `font-size` because it
 * depends on the editor's title, which no stylesheet can see; the stylesheet
 * still owns the family, the line height, the colour and the ellipsis that
 * SCREENS.md calls "a last-resort floor only".
 *
 * EMPTY FIELDS PRINT NOTHING, not an empty label. None of the `book` global's
 * text fields is `required: true`, so a cleared subtitle, owner or years line
 * is an ordinary editorial state. Each is omitted outright rather than
 * rendered as "Kept by " with nothing after it — and the title's `<h1>` is
 * omitted too when there is no title, because an empty heading is an axe
 * violation (`empty-heading`) and the Contents page's own static `<h1>` keeps
 * the book's level-one heading present either way.
 *
 * THE DECORATIONS ARE `aria-hidden`. The washi strip, the airmail stamp and
 * the two rules carry no information a reader of the page needs; "POSTA
 * AEREA" and "VOL · I" are printed furniture on a fictional stamp, not
 * content, so exposing them to a screen reader would only add noise between
 * the title and the owner's name. They are drawn only behind the `book`
 * global's `showDecorations` flag.
 * Depends on: react, `BookChrome` (@travel-diary/domain/bookBundle),
 * `fitTitleSize`/`COVER_TITLE_AVAILABLE_PX` (@travel-diary/domain/coverTitle),
 * ./cover.module.css.
 */
import type { BookChrome } from '@travel-diary/domain/bookBundle'
import { COVER_TITLE_AVAILABLE_PX, fitTitleSize } from '@travel-diary/domain/coverTitle'
import type React from 'react'
import styles from './cover.module.css'

/** What the cover needs to print itself. */
export interface CoverProps {
  /** The `book` global's editor-supplied fields, from the bundle. */
  readonly chrome: BookChrome
}

/**
 * Renders the diary's front cover: the cloth, its two nested rules, the
 * centred title column and — behind `chrome.showDecorations` — the washi
 * strip and airmail stamp.
 *
 * @param props - The book's chrome.
 * @returns The cover page.
 * @example
 * <Cover chrome={bundle.chrome} />
 */
export const Cover = ({ chrome }: CoverProps): React.JSX.Element => (
  <section
    data-page="cover"
    className={styles.cover}
    // The cloth colour is the one background an editor chooses, so it cannot
    // live in the stylesheet. Passed as a custom property rather than as
    // `background`, so `cover.module.css` still owns the whole gradient stack
    // the handoff specifies and this file names only the colour.
    style={{ '--cover-cloth': chrome.coverCloth } as React.CSSProperties}
  >
    <div aria-hidden="true" className={styles.ruleOuter} />
    <div aria-hidden="true" className={styles.ruleInner} />

    <div className={styles.column}>
      <p className={styles.eyebrow}>Travel Diary</p>
      <div aria-hidden="true" className={styles.hairlineAboveTitle} />

      {chrome.title !== '' && (
        <h1
          className={styles.title}
          style={{ fontSize: `${String(fitTitleSize(chrome.title, COVER_TITLE_AVAILABLE_PX))}px` }}
        >
          {chrome.title}
        </h1>
      )}

      {chrome.subtitle !== '' && <p className={styles.subtitle}>{chrome.subtitle}</p>}

      <div aria-hidden="true" className={styles.hairlineBelowTitle} />

      {chrome.owner !== '' && <p className={styles.keptBy}>Kept by {chrome.owner}</p>}
      {chrome.yearsShown !== '' && <p className={styles.years}>{chrome.yearsShown}</p>}
    </div>

    {chrome.showDecorations && (
      <>
        <div data-decoration="washi" aria-hidden="true" className={styles.washi} />

        <div data-decoration="stamp" aria-hidden="true" className={styles.stampMount}>
          <div className={styles.stampFace}>
            <span className={styles.stampTop}>POSTA AEREA</span>
            <span className={styles.stampHatch} />
            <span className={styles.stampValue}>VOL · I</span>
          </div>
        </div>
      </>
    )}
  </section>
)
