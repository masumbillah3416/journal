/**
 * SignedInStep — the sign-in screen's last pane: SCREENS.md §3.4's 62px ringed
 * circle, the "Signed in" eyebrow, "The back room is open", a status line, and
 * the three ways on - "Open the admin panel", "View the diary instead" and a
 * borderless "Sign out and start again".
 *
 * This module implements none of CLAUDE.md §3.3's seven named patterns, and
 * that is the deliberate case rather than an oversight (§0 rule 5): it prints
 * a fixed screen and decides nothing at all, so there is no seam, no fallible
 * operation and no second caller-shape for a pattern to earn its place on. It
 * is expressly NOT the state machine its three siblings are - there is no
 * state to be in, which is what makes it the only server component among them.
 * ("Presentational component", which this header and `SignInShell.tsx` both
 * used to cite as a §3.3 pattern, is not one of the table's seven.)
 *
 * A SERVER COMPONENT, and the only one of the four panes that is. It holds no
 * state, no hooks and no handlers: the two ways on are anchors and signing out
 * is a real `POST` form, so nothing on this screen needs the browser to have
 * run any JavaScript at all, and the route ships none for it (CLAUDE.md §6).
 * The other three panes each have something a reader can change without a
 * round trip - a revealed password, six cells, a message answered by typing -
 * and this one has nothing.
 *
 * ═══ THE STATUS LINE NAMES A REAL NUMBER, AS OF PHASE 4 TASK 11 ═══
 *
 * The handoff's prototype prints "Four changes are still unpublished from your
 * last session." That number is a count of draft versions across journeys - a
 * fact the Publish screen owns (`SCREENS.md` §2.8) - and for three phases
 * nothing here could compute it, so this pane printed a sentence of its own
 * with no count in it and `docs/deviations.md` §38 recorded why, naming its
 * own reversal condition: "Phase 4's Publish screen, which brings a real count
 * with it."
 *
 * It has. `readPendingChanges` is the same read the Publish screen's Changes
 * card is drawn from, so this line and that card cannot disagree about how
 * many things are waiting - which is the whole reason the count is handed IN
 * rather than fetched here. The prototype's trailing "from your last session"
 * is still not printed: nothing attributes a draft version to the session that
 * wrote it, and §89 records that beside the two other pieces of copy that are
 * ours.
 *
 * ═══ SIGNING OUT IS A POST, AND THE OTHER TWO ARE LINKS ═══
 *
 * The prototype draws all three as controls in a single-page mock-up, where
 * the distinction cannot arise. Here it matters: a sign-out reachable by `GET`
 * is a sign-out that a prefetch, a crawler or an `<img>` on another site can
 * perform for a reader who never clicked it. It is a `<form method="post">`,
 * which is also what lets it work with no JavaScript. The two navigations are
 * anchors, because they go somewhere.
 *
 * ═══ WHAT THIS PANE DOES NOT DO ═══
 *
 * It does not read a session, decide that anybody is signed in, or revoke
 * anything. Authenticating the reader is `apps/web/lib/auth/sessions.ts`'s and
 * the revocation behind {@link SIGN_OUT_ENDPOINT} is `revokeSession`'s, mounted
 * with the rest of the sign-in surface's handlers by Task 10 along with the
 * cookie policy this screen would have to be gated by - the same split
 * `PasswordStep.tsx` and `CodeStep.tsx` make, recorded in docs/deviations.md.
 * Depends on: react, `unpublishedStatusLine`
 * (@travel-diary/domain/admin/pendingChange), `pagePath`
 * (@travel-diary/domain/pageAddress), ./signIn.module.css.
 */
import { unpublishedStatusLine } from '@travel-diary/domain/admin/pendingChange'
import { pagePath } from '@travel-diary/domain/pageAddress'
import type React from 'react'
import { ADMIN_PANEL_PATH as PANEL_PATH, SIGN_OUT_ENDPOINT as SIGN_OUT } from '../../lib/auth/adminPaths'
import styles from './signIn.module.css'

/**
 * Where "Open the admin panel" leads: the bespoke admin's own root, which
 * Phase 4 builds the eleven screens of. Phase ruling F41 settled the address.
 *
 * IT WAS A 404 FOR THE WHOLE OF PHASE 2, and this is the note that stops that
 * happening again to the next address a pane points at. Nothing was mounted at
 * `/admin` — verified against the built route manifest — so the primary action
 * on the last screen of the entire sign-in journey answered a 404, with no
 * `docs/api.md` row, no deviation entry and no e2e case walking it. Blocker
 * B2. `app/(admin)/admin/page.tsx` mounts it now, `docs/deviations.md` §44
 * records what that screen is, and `e2e/signInJourney.spec.ts` presses this
 * button and follows it.
 */
export const ADMIN_PANEL_PATH = PANEL_PATH

/**
 * Where "View the diary instead" leads.
 *
 * `pagePath(0)` - the cover - rather than `/`, which is not a route: the diary
 * is served at `/p/<n>` and its root has never been mounted
 * (`app/(diary)/not-found.tsx` links to the same place for the same reason).
 * Derived rather than written out, so this link cannot drift from the address
 * the book is actually served at.
 */
export const DIARY_PATH = pagePath(0)

/**
 * Where "Sign out and start again" posts.
 *
 * A `POST`, never a link - see this module's header. Exported so the handler
 * mounts at the path this form actually targets rather than at a second
 * spelling of it.
 */
export const SIGN_OUT_ENDPOINT = SIGN_OUT

/** What SCREENS.md §3.4's pane needs, which is one number. */
export interface SignedInStepProps {
  /**
   * How many changes are waiting to go out, from `readPendingChanges` - the
   * same read SCREENS.md §2.8's Changes card is drawn from.
   */
  readonly waiting: number
}

/**
 * Renders the signed-in state.
 *
 * @param props - See {@link SignedInStepProps}.
 * @returns The pane: the mark, the heading, the status line and the three
 *   ways on.
 * @example
 * <SignInShell book={content}>
 *   <SignedInStep waiting={4} />
 * </SignInShell>
 */
export const SignedInStep = ({ waiting }: SignedInStepProps): React.JSX.Element => (
  <div data-signed-in-step>
    {/* Decoration, exactly as `SignInShell.tsx`'s cloth furniture is: it says
     * nothing the heading below does not, so a screen reader is not read a
     * shape. */}
    <div aria-hidden="true" data-signed-in-mark className={styles.signedInMark}>
      <span className={styles.signedInMarkInner} />
    </div>

    <p className={styles.eyebrow}>Signed in</p>
    <h1 className={[styles.title, styles.titleCompact].join(' ')}>The back room is open</h1>
    <p data-signed-in-status className={styles.lede}>
      {unpublishedStatusLine(waiting)}
    </p>

    <a className={[styles.submit, styles.actionFirst, styles.buttonLink].join(' ')} href={ADMIN_PANEL_PATH}>
      Open the admin panel
    </a>
    <a className={[styles.secondary, styles.buttonLink].join(' ')} href={DIARY_PATH}>
      View the diary instead
    </a>

    <form className={styles.signOutForm} method="post" action={SIGN_OUT_ENDPOINT}>
      <button className={styles.signOut} type="submit">
        Sign out and start again
      </button>
    </form>
  </div>
)
