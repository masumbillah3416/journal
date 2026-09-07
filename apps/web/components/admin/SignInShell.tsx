/**
 * SignInShell — the sign-in screen's frame: the desk, the shell, the cloth
 * panel, the narrow masthead and the form panel every step is drawn inside.
 * SCREENS.md §3 transcribed.
 *
 * This module implements none of CLAUDE.md §3.3's seven named patterns, and
 * that is the deliberate case rather than an oversight (§0 rule 5): it prints
 * what `readSignInScreen` hands it and decides nothing except which of the
 * book's lines an editor has actually filled in. It holds no hooks, no
 * handlers and no state, so it is a server component and costs the route no
 * client JavaScript at all. This header cited "Presentational component (§3.3)"
 * until the Task 9 re-review; that is a real description but not one of the
 * table's seven, and every other pane on this surface follows this file, so
 * the citation was corrected here as well as where it was copied.
 *
 * WHY IT TAKES `children` RATHER THAN A STEP NAME. SCREENS.md §3 draws one
 * screen with four states inside the same shell - password, one-time code,
 * reset and signed-in. The frame is identical in all four; only the pane
 * changes. Handing it the pane as `children` is what keeps the cloth panel,
 * the masthead and the breakpoint written once, and it is why the three later
 * states need no change here.
 *
 * THE TWO CLOTH BLOCKS ARE ONE DESIGN AT TWO SIZES, and only ever one at a
 * time: the panel is `display: none` below 820px and the masthead above it
 * (`signIn.module.css`). Both are therefore in the document and only the
 * applicable one is rendered, announced or measured - a `display: none`
 * subtree is out of the accessibility tree, so a screen reader is never read
 * the book's name twice.
 *
 * NEITHER CLOTH BLOCK CARRIES A HEADING. The screen's one `<h1>` belongs to
 * the pane ("Welcome back"), because that is what this page is for; the
 * book's name here is the same printed furniture the cover's cloth is, and a
 * second level-one heading - or a level-two above the level-one - would be a
 * real `heading-order` finding rather than a stylistic preference. The
 * spine, stitches, rules, ribbon and stamp carry no information at all and
 * are `aria-hidden`, exactly as `Cover.tsx`'s decorations are.
 *
 * THE DESK IS THE ROUTE'S `<main>`, not a `<div>` inside one. The screen has
 * no other content - no header, no nav, nothing outside the shell - so a
 * separate landmark wrapper would be an empty element existing only to satisfy
 * a rule. axe's `region` requires all content to sit inside a landmark and
 * `landmark-one-main` requires exactly one; making the desk itself the
 * landmark satisfies both with nothing added.
 *
 * EMPTY FIELDS PRINT NOTHING. None of the `book` global's text fields is
 * `required: true`, so a cleared title or subtitle is an ordinary editorial
 * state; each is omitted outright rather than rendered as an empty line.
 * Depends on: react, `SignInScreenContent`
 * (../../lib/auth/readSignInScreen), `fitSignInTitleSize`/
 * `fitSignInMastheadTitleSize` (@travel-diary/domain/auth/signInTitle),
 * ./signIn.module.css.
 */
import { fitSignInMastheadTitleSize, fitSignInTitleSize } from '@travel-diary/domain/auth/signInTitle'
import type React from 'react'
import type { SignInScreenContent } from '../../lib/auth/readSignInScreen'
import styles from './signIn.module.css'

/** What the shell needs to draw itself. */
export interface SignInShellProps {
  /**
   * The book's own cover fields, as `readSignInScreen` read them. The
   * `codeStepRequired` half of that value belongs to the pane, not here.
   */
  readonly book: Pick<SignInScreenContent, 'title' | 'subtitle' | 'coverCloth'>
  /** The step's pane: the password form, the code cells, the reset form. */
  readonly children: React.ReactNode
}

/** The eyebrow both cloth blocks print above the book's name. */
const CLOTH_EYEBROW = 'Travel Diary'

/** The line both cloth blocks print below it. SCREENS.md §3, verbatim. */
const CLOTH_FOOTER = 'The back room'

/**
 * Renders the sign-in screen's frame around one step's pane.
 *
 * @param props - The book's cover fields, and the pane to draw inside the
 *   form panel.
 * @returns The desk, the shell and its two panels.
 * @example
 * <SignInShell book={content}>
 *   <PasswordStep codeStepRequired={content.codeStepRequired} />
 * </SignInShell>
 */
export const SignInShell = ({ book, children }: SignInShellProps): React.JSX.Element => (
  <main className={styles.stage}>
    <div
      data-sign-in-shell
      className={styles.shell}
      // The cloth colour is the one background an editor chooses, so it
      // cannot live in the stylesheet. Passed as a custom property rather
      // than as `background`, so `signIn.module.css` still owns the whole
      // gradient stack and this file names only the colour.
      style={{ '--sign-in-cloth': book.coverCloth } as React.CSSProperties}
    >
      <div data-sign-in-masthead className={styles.masthead}>
        <p data-sign-in-masthead-eyebrow className={styles.mastheadEyebrow}>
          {CLOTH_EYEBROW}
        </p>
        {book.title !== '' && (
          <p
            data-sign-in-masthead-title
            className={styles.mastheadTitle}
            style={{ fontSize: `${String(fitSignInMastheadTitleSize(book.title))}px` }}
          >
            {book.title}
          </p>
        )}
        <p data-sign-in-masthead-footer className={styles.mastheadBackRoom}>
          {CLOTH_FOOTER}
        </p>
      </div>

      <div data-sign-in-cloth className={styles.cloth}>
        <span aria-hidden="true" className={styles.spine} />
        <span aria-hidden="true" className={styles.stitchOuter} />
        <span aria-hidden="true" className={styles.stitchInner} />
        <span aria-hidden="true" className={styles.clothRuleOuter} />
        <span aria-hidden="true" className={styles.clothRuleInner} />

        <div className={styles.clothColumn}>
          <p data-sign-in-cloth-eyebrow className={styles.clothEyebrow}>
            {CLOTH_EYEBROW}
          </p>
          <span aria-hidden="true" className={styles.clothRuleAboveTitle} />
          {book.title !== '' && (
            <p
              data-sign-in-cloth-title
              className={styles.clothTitle}
              style={{ fontSize: `${String(fitSignInTitleSize(book.title))}px` }}
            >
              {book.title}
            </p>
          )}
          {book.subtitle !== '' && (
            <p data-sign-in-cloth-subtitle className={styles.clothSubtitle}>
              {book.subtitle}
            </p>
          )}
          <span aria-hidden="true" className={styles.clothRuleBelowSubtitle} />
          <p data-sign-in-cloth-footer className={styles.clothBackRoom}>
            {CLOTH_FOOTER}
          </p>
        </div>

        <span aria-hidden="true" className={styles.ribbon} />
        <div aria-hidden="true" data-sign-in-stamp className={styles.stampMount}>
          <div className={styles.stampFace}>
            <span className={styles.stampTop}>PRIVATE</span>
            <span className={styles.stampNumber}>01</span>
          </div>
        </div>
      </div>

      <div data-sign-in-form-panel className={styles.formPanel}>
        {/* Named so a browser test can measure against the box whose padding
         * SCREENS.md §3 calls REQUIRED: the pane's CONTENT box is what the
         * one-time-code cells have to fit inside, and it is not the form
         * panel's border box (`e2e/codeStep.spec.ts`). */}
        <div data-sign-in-pane className={styles.pane}>
          {children}
        </div>
      </div>
    </div>
  </main>
)
