/**
 * ScreenHeader — the 96px header SCREENS.md §2 puts above every admin screen:
 * a crumb over the screen's title, and whatever controls the screen has.
 *
 * IT DRAWS ONLY WHAT IT IS GIVEN. A "Saved just now" chip above a screen that
 * saves nothing, or a "Preview draft" link to a draft that does not exist,
 * would be chrome that lies — the same defect `PanelHome.tsx` was written to
 * avoid one address along. Each control is a nullable prop: a screen with
 * nothing to say passes `null` and the control is not rendered.
 *
 * THE THREE HIDING WIDTHS ARE `shell.module.css`'S, NOT THIS FILE'S, and each
 * control carries the `data-control` name that stylesheet hides it by. A
 * server render has never seen a viewport (`readingSurface.ts`'s header), and
 * the alternative — measuring one in the browser — is client JavaScript on
 * every admin screen, against CLAUDE.md §6's 320KB ceiling. The two spellings
 * of those three numbers are pinned to each other by `ScreenHeader.test.tsx`.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. It is a header.
 * Depends on: react, `NavEntry` (@travel-diary/domain/admin/navigation),
 * ./shell.module.css.
 */
import type { NavEntry } from '@travel-diary/domain/admin/navigation'
import type React from 'react'
import styles from './shell.module.css'

/** What the header needs from the screen it sits above. */
export interface ScreenHeaderProps {
  /** The rail entry the screen is; its label is the title. */
  readonly screen: NavEntry
  /** The line above the title, in Courier at `.26em`. */
  readonly crumb: string
  /** How many journeys are waiting to go out; no chip at zero. */
  readonly unpublished: number
  /** What the saved chip says, or `null` on a screen that saves nothing. */
  readonly savedAt: string | null
  /** Where "Preview draft" leads, or `null` on a screen with no draft. */
  readonly previewHref: string | null
}

/**
 * Renders the header.
 *
 * @param props - See {@link ScreenHeaderProps}.
 * @returns The crumb, the title, and the controls the screen supplied.
 * @example
 * <ScreenHeader screen={entry} crumb="The back room" unpublished={0} savedAt={null} previewHref={null} />
 */
export const ScreenHeader = ({
  screen,
  crumb,
  unpublished,
  savedAt,
  previewHref,
}: ScreenHeaderProps): React.JSX.Element => (
  <header className={styles.header}>
    <div className={styles.titleBlock}>
      <p data-crumb className={styles.crumb}>
        {crumb}
      </p>
      <h1 className={styles.title}>{screen.label}</h1>
    </div>

    <div className={styles.controls}>
      {savedAt === null ? null : (
        <span data-control="saved" className={styles.chipSaved}>
          {savedAt}
        </span>
      )}

      {unpublished === 0 ? null : (
        <span data-control="unpublished" className={styles.chipUnpublished}>
          <span className={styles.chipMark} aria-hidden="true" />
          {`${String(unpublished)} unpublished`}
        </span>
      )}

      {previewHref === null ? null : (
        <a data-control="preview-draft" className={styles.previewDraft} href={previewHref}>
          Preview draft
        </a>
      )}
    </div>
  </header>
)
