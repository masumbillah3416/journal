/**
 * AdminShell — the frame SCREENS.md §2's preamble puts every admin screen in:
 * the rail on the left, the header above, the screen's own content below it.
 *
 * A SERVER COMPONENT, AND SO IS EVERYTHING IT DRAWS. Nothing here changes
 * without a round trip, so `/admin` and the eleven screens after it ship no
 * JavaScript for the chrome at all — which is the headroom every later task
 * inherits against CLAUDE.md §6's 320KB admin ceiling. The two things a client
 * would normally supply are props instead: the current address comes from the
 * {@link NavEntry} the screen says it is, and the viewport's width is nobody's
 * — `shell.module.css` does the hiding SCREENS.md §2 specifies.
 *
 * THE SCREEN KEEPS ITS OWN GUARD. This is a component, not a layout, and it
 * authenticates nothing: every screen calls `requireAdminSession()` in its own
 * file, because `lib/auth/adminGuardRegistration.test.ts` credits no file for
 * what another one contains.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. It is composition — a frame
 * with a `children` hole in it.
 * Depends on: react, `NavEntry` (@travel-diary/domain/admin/navigation),
 * `NavCounts` (../../../lib/admin/readNavCounts), ./NavRail, ./ScreenHeader,
 * ./shell.module.css.
 */
import type { NavEntry } from '@travel-diary/domain/admin/navigation'
import type React from 'react'
import type { NavCounts } from '../../../lib/admin/readNavCounts'
import { NavRail } from './NavRail'
import { ScreenHeader } from './ScreenHeader'
import styles from './shell.module.css'

/** What a screen tells the shell about itself. */
export interface AdminShellProps {
  /** The rail entry this screen is — which button lights, and what the title says. */
  readonly screen: NavEntry
  /** The line above the title. */
  readonly crumb: string
  /**
   * The four numbers `readNavCounts` reads; the rail prints three of them.
   *
   * `unpublished` is NOT printed beside a button — see `navCountFor` — and
   * reaches the screen through `ScreenHeader`'s chip instead, where it can say
   * in words what it counts.
   */
  readonly counts: NavCounts
  /** When the book last went out, already formatted, or `null` for never. */
  readonly lastPublished: string | null
  /** The site's own name, for the rail's masthead. */
  readonly siteName: string
  /** Who is signed in, for the rail's footer. */
  readonly accountName: string
  /** The screen itself. */
  readonly children: React.ReactNode
}

/**
 * Renders the shell around one screen.
 *
 * @param props - See {@link AdminShellProps}.
 * @returns The rail, the header and the screen's content.
 * @example
 * <AdminShell screen={entry} crumb="The back room" counts={counts} lastPublished={null}
 *   siteName={name} accountName={email}><PanelHome /></AdminShell>
 */
export const AdminShell = ({
  screen,
  crumb,
  counts,
  lastPublished,
  siteName,
  accountName,
  children,
}: AdminShellProps): React.JSX.Element => (
  <div className={styles.shell}>
    <NavRail
      pathname={screen.href}
      counts={counts}
      siteName={siteName}
      accountName={accountName}
      lastPublished={lastPublished}
    />

    <main className={styles.main}>
      {/* The shell has nothing to save and no draft of its own, so it hands
          the header `null` for both rather than inventing a control. */}
      <ScreenHeader screen={screen} crumb={crumb} unpublished={counts.unpublished} savedAt={null} previewHref={null} />

      <div className={styles.content}>{children}</div>
    </main>
  </div>
)
