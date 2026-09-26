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
 * THE CHIP SAYS WHAT IT COUNTS, WHICH SCREENS.md §2's OWN WORDING DOES NOT.
 * §2 writes it "n unpublished"; here that number and §2.8's "{n} changes
 * waiting" count different things, so both wearing the same word put two
 * disagreeing numbers on one screen. `draftJourneysChipLabel` carries the
 * argument and `docs/deviations.md` §91 records it.
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
import { draftJourneysChipLabel } from '@travel-diary/domain/admin/journeyStatus'
import type { NavEntry } from '@travel-diary/domain/admin/navigation'
import type React from 'react'
import styles from './shell.module.css'

/** What the header needs from the screen it sits above. */
export interface ScreenHeaderProps {
  /** The rail entry the screen is; its label is the title. */
  readonly screen: NavEntry
  /** The line above the title, in Courier at `.26em`. */
  readonly crumb: string
  /**
   * How many live journeys have NEVER been published; no chip at zero.
   *
   * NOT "how many changes are waiting", which is §2.8's headline and a bigger
   * number: a journey edited after publishing is waiting and is not counted
   * here. The two were both labelled "n unpublished" until Task 12, and drew
   * "1 unpublished" beside "4 changes waiting" on one screen (PUB-001,
   * `docs/deviations.md` §91). `draftJourneysChipLabel` is what the chip says
   * now, and it says which of the two this is.
   */
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
          {draftJourneysChipLabel(unpublished)}
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
