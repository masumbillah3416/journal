/**
 * PanelHome — what `/admin` shows a signed-in reader while Phase 4's ten
 * screens are still being built.
 *
 * ═══ WHY IT EXISTS AT ALL ═══
 *
 * `SCREENS.md` §3.4 gives the signed-in pane a primary action, "Open the admin
 * panel", and `SignedInStep.tsx` points it at `/admin`. Nothing was mounted
 * there: verified against the built route manifest, `/admin` had no entry, so
 * **a reader who completed the whole sign-in journey and pressed the primary
 * button got a 404** — Phase 2's final review, blocker B2. There was no
 * `docs/api.md` row for it, no deviation entry and no e2e case walking it,
 * while `docs/deviations.md` argues in this very component's neighbour's entry
 * that "the difference between a deliberate choice and an oversight has to be
 * written down".
 *
 * ═══ WHY A SCREEN RATHER THAN A REDIRECT ═══
 *
 * Three answers were possible and two of them are defects of the class this
 * round exists to close. A 404 is the defect as found. A redirect back to
 * `/admin/sign-in/done` makes the primary action a button that visibly does
 * nothing — the same "silent failure" species as the resend that sent no code
 * and the guess that was never judged. Only a screen that SAYS what is behind
 * the door is honest, and this is the smallest one that does.
 *
 * IT IS NOT A PLACEHOLDER, and the distinction matters against `CLAUDE.md`
 * §1.3's ban on placeholder text: it states a true fact about the product a
 * reader is looking at, in the design's own voice, exactly as
 * `SignedInStep.tsx`'s status line does for the same reason (deviation §38).
 * Phase 4 replaces the whole of it, and `docs/deviations.md` §44 says so.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven, and deliberately. It prints a
 * fixed screen and decides nothing, so there is no seam and no fallible
 * operation for a pattern to earn its place on. It is a Server Component for
 * the same reason `SignedInStep` is: nothing on it changes without a round
 * trip, so the route ships no JavaScript for it (CLAUDE.md §6).
 *
 * SIGNING OUT IS A `POST`, exactly as it is on the signed-in pane, and for the
 * same reason: a sign-out reachable by `GET` is one a prefetch, a crawler or
 * an `<img>` on another site can perform for a reader who never clicked it.
 *
 * Depends on: react, `pagePath` (@travel-diary/domain/pageAddress),
 * `SIGN_OUT_ENDPOINT` (./SignedInStep), ./panel.module.css.
 */
import { pagePath } from '@travel-diary/domain/pageAddress'
import type React from 'react'
import styles from './panel.module.css'
import { SIGN_OUT_ENDPOINT } from './SignedInStep'

/**
 * Where "Read the diary" leads.
 *
 * `pagePath(0)` — the cover — rather than `/`, which is not a route: the diary
 * is served at `/p/<n>` and its root has never been mounted. Derived rather
 * than written out, so this link cannot drift from the address the book is
 * actually served at, which is the same rule `SignedInStep.tsx` follows.
 */
export const DIARY_PATH = pagePath(0)

/**
 * The line this screen exists to say.
 *
 * HANDOFF-DEVIATION (docs/deviations.md §44): `SCREENS.md` has no copy for a
 * panel that is not built yet, because it describes the panel. This is ours,
 * written in the register of §3.4's own status line.
 */
export const PANEL_STATUS =
  'The editing screens are still being built. Everything the diary shows is already published.'

/**
 * The screens `SCREENS.md` §2 specifies, named so a reader knows what is
 * coming rather than only that something is missing.
 *
 * Four groups rather than §2's ten headings: this is a sentence-length summary
 * for somebody standing at a closed door, not a table of contents, and a list
 * of ten would read as a promise with dates on it.
 */
export const PANEL_SCREENS: readonly string[] = [
  'Journeys, and the pages inside them',
  'The media library, and what each photograph carries',
  'Publishing, and what is still a draft',
  'The book’s own settings, and this account',
]

/**
 * Renders the admin panel's root.
 *
 * @returns The pane: the eyebrow, the heading, the status line, what is
 *   coming, and the two ways on.
 * @example
 * <PanelHome />
 */
export const PanelHome = (): React.JSX.Element => (
  <main data-admin-panel className={styles.panel}>
    <div className={styles.pane}>
      <p className={styles.eyebrow}>The back room</p>
      <h1 className={styles.title}>Still being furnished</h1>
      <p className={styles.lede}>{PANEL_STATUS}</p>

      <hr className={styles.rule} />

      <ul data-admin-panel-screens className={styles.screens}>
        {PANEL_SCREENS.map((screen) => (
          <li key={screen}>{screen}</li>
        ))}
      </ul>

      <a className={styles.primary} href={DIARY_PATH}>
        Read the diary
      </a>

      <form className={styles.signOutForm} method="post" action={SIGN_OUT_ENDPOINT}>
        <button className={styles.signOut} type="submit">
          Sign out and start again
        </button>
      </form>
    </div>
  </main>
)
