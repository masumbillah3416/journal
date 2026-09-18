/**
 * NavRail — the 238px dark rail SCREENS.md §2 puts beside every admin screen:
 * a masthead, nine nav buttons and a footer.
 *
 * A SERVER COMPONENT, AND THE ADDRESS IS A PROP. Which button is current
 * depends on the address being drawn, which in Next.js is `usePathname()` — a
 * client hook, and therefore a `'use client'` boundary around the rail and
 * everything it imports. The rail is on every admin screen, so that boundary
 * would be paid twelve times over against CLAUDE.md §6's 320KB ceiling. It
 * takes the address from the screen instead, which already knows it: the
 * screen hands `AdminShell` its own {@link NavEntry}.
 *
 * NINE BUTTONS, FOUR NUMBERS. Only the entries with something to count carry
 * one; {@link navCountFor} is the whole of that mapping, exported so a test can
 * assert against it rather than re-spelling it.
 *
 * IT IS AN `<aside>`, NOT A `<div>`, and that was found in a real browser
 * rather than reasoned about: with a plain `div` the masthead and the footer
 * sat outside every landmark, and axe reported "Some page content is not
 * contained by landmarks" on `/admin` (e2e/a11y.spec.ts). The `<nav>` inside
 * covers only the buttons.
 *
 * THE PROFILE BLOCK IS NOT A LINK YET. SCREENS.md §2.11's Account screen is a
 * later task, and a primary control pointing at an unmounted address is the
 * defect this repository already paid for once (`PanelHome.tsx`'s header,
 * blocker B2). It prints who is signed in and waits.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. It is a table rendered.
 * Depends on: react, `ADMIN_NAV`/`activeNavId`/`sectionColour`
 * (@travel-diary/domain/admin/navigation), `NavCounts`
 * (../../../lib/admin/readNavCounts), `SIGN_OUT_ENDPOINT` (../SignedInStep),
 * ./shell.module.css.
 */
import { ADMIN_NAV, type AdminSection, activeNavId, sectionColour } from '@travel-diary/domain/admin/navigation'
import type React from 'react'
import type { NavCounts } from '../../../lib/admin/readNavCounts'
import { SIGN_OUT_ENDPOINT } from '../SignedInStep'
import styles from './shell.module.css'

/** What the rail needs from the screen that draws it. */
export interface NavRailProps {
  /** The address being drawn, so exactly one button can be current. */
  readonly pathname: string
  /** The four numbers, from `readNavCounts`. */
  readonly counts: NavCounts
  /**
   * The site's own name, for the masthead's eyebrow, or the empty string when
   * the `site` global has none — in which case no eyebrow is drawn, because an
   * empty line of 9.5px Courier at `.3em` is a gap, not a name.
   */
  readonly siteName: string
  /** Who is signed in, for the footer's profile block. */
  readonly accountName: string
  /**
   * When the book last went out, already formatted, or `null`.
   *
   * `null` PRINTS NOTHING, rather than "never published". The screen is the
   * only thing that knows, and a shell that answered for it would be stating a
   * fact about the book on behalf of a caller that said nothing.
   */
  readonly lastPublished: string | null
}

/**
 * The inline style one section bar is painted with.
 *
 * A CUSTOM PROPERTY RATHER THAN `background` DIRECTLY, for two reasons that
 * agree. The stylesheet keeps the paint (`background: var(--section-colour)`),
 * so the only thing inline is the datum; and a custom property survives into
 * the `style` attribute verbatim, where `background: #a34434` is serialised as
 * `rgb(163, 68, 52)` — so `NavRail.test.tsx` can compare what is painted
 * against `sectionColour`'s own answer rather than against a re-spelling of it.
 */
interface SectionBarStyle extends React.CSSProperties {
  /** The section's colour, as SCREENS.md §2 writes it. */
  readonly '--section-colour': string
}

/**
 * One section bar's inline style.
 *
 * A named function rather than a literal at the call site: an object literal
 * passed straight to `style` is excess-property-checked against
 * `React.CSSProperties`, which knows no custom properties and rejects it.
 * @param section - The group the entry belongs to.
 * @returns The style carrying that section's colour.
 */
const sectionBarStyle = (section: AdminSection): SectionBarStyle => ({
  '--section-colour': sectionColour(section),
})

/**
 * The number printed beside one rail button, if it has one.
 *
 * Five of the nine entries count nothing — Overview is the desk, Galleries and
 * Cover are views onto rows counted elsewhere, Book and Settings are single
 * screens — and a `0` beside them would read as an empty library rather than
 * as nothing to count.
 * @param id - The entry's id.
 * @param counts - The four numbers.
 * @returns The number to print, or `undefined` when that entry prints none.
 * @example
 * navCountFor('trash', counts) // counts.trashed
 */
export const navCountFor = (id: string, counts: NavCounts): number | undefined => {
  if (id === 'journeys') return counts.journeys
  if (id === 'media') return counts.media
  if (id === 'publish') return counts.unpublished
  if (id === 'trash') return counts.trashed
  return undefined
}

/**
 * Renders the rail.
 *
 * @param props - See {@link NavRailProps}.
 * @returns The masthead, the nine buttons and the footer.
 * @example
 * <NavRail pathname="/admin" counts={counts} siteName={name} accountName={email} lastPublished={null} />
 */
export const NavRail = ({
  pathname,
  counts,
  siteName,
  accountName,
  lastPublished,
}: NavRailProps): React.JSX.Element => {
  const current = activeNavId(pathname)

  return (
    <aside className={styles.rail} aria-label="Admin panel">
      <div className={styles.masthead}>
        {siteName === '' ? null : <p className={styles.siteName}>{siteName}</p>}
        <p className={styles.mastheadTitle}>The back room</p>
      </div>

      <nav className={styles.nav} aria-label="Admin sections">
        {ADMIN_NAV.map((entry) => {
          const count = navCountFor(entry.id, counts)

          return (
            <a
              key={entry.id}
              data-nav-id={entry.id}
              href={entry.href}
              className={[styles.navButton, entry.id === current ? styles.navButtonCurrent : ''].join(' ')}
              {...(entry.id === current ? { 'aria-current': 'page' as const } : {})}
            >
              <span data-section-bar className={styles.sectionBar} style={sectionBarStyle(entry.section)} />
              <span className={styles.navText}>
                <span className={styles.navLabel}>{entry.label}</span>
                <span className={styles.navSubLabel}>{entry.subLabel}</span>
              </span>
              {count === undefined ? null : (
                <span data-nav-count className={styles.navCount}>
                  {count}
                </span>
              )}
            </a>
          )
        })}
      </nav>

      <div className={styles.railFooter}>
        <div data-profile className={styles.profile}>
          <span className={styles.avatar} aria-hidden="true">
            {accountName.slice(0, 1).toUpperCase()}
          </span>
          <span className={styles.navText}>
            <span className={styles.profileName}>{accountName}</span>
            <span className={styles.profileRole}>Your account</span>
          </span>
        </div>

        {lastPublished === null ? null : (
          <p data-last-published className={styles.lastPublished}>
            {`Last published ${lastPublished}`}
          </p>
        )}

        <form className={styles.signOutForm} method="post" action={SIGN_OUT_ENDPOINT}>
          <button className={styles.signOut} type="submit">
            Sign out
          </button>
        </form>
      </div>
    </aside>
  )
}
