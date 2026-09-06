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
 * ═══ THE STATUS LINE IS OURS, AND IT SAYS SOMETHING TRUE ═══
 *
 * The handoff's prototype prints "Four changes are still unpublished from your
 * last session." That number is a count of draft versions across journeys - a
 * fact the Publish screen owns (`SCREENS.md` §2.8), which Phase 4 builds, and
 * which nothing in this phase can compute. Printing the prototype's sentence
 * would be printing a number this repository invented, on the one screen whose
 * whole job is to tell a reader where they stand. Printing nothing would drop
 * a line §3.4 asks for. So the line stays and states something that is true of
 * every visit, on the same subject the prototype's is - unpublished work.
 * Recorded in docs/deviations.md.
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
 * Depends on: react, `pagePath` (@travel-diary/domain/pageAddress),
 * ./signIn.module.css.
 */
import { pagePath } from '@travel-diary/domain/pageAddress'
import type React from 'react'
import styles from './signIn.module.css'

/**
 * Where "Open the admin panel" leads: the bespoke admin's own root, which
 * Phase 4 builds the ten screens of. Phase ruling F41 settled the address.
 */
export const ADMIN_PANEL_PATH = '/admin'

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
export const SIGN_OUT_ENDPOINT = '/admin/sign-out'

/**
 * The line SCREENS.md §3.4 calls a status line.
 *
 * HANDOFF-DEVIATION (docs/deviations.md): the prototype's own line counts
 * unpublished changes, which no phase before 4 can compute - see this module's
 * header. This one keeps the subject and states something true of every visit.
 */
export const SIGNED_IN_STATUS = 'Everything you change in here stays a draft until you publish it.'

/**
 * Renders the signed-in state.
 *
 * @returns The pane: the mark, the heading, the status line and the three
 *   ways on.
 * @example
 * <SignInShell book={content}>
 *   <SignedInStep />
 * </SignInShell>
 */
export const SignedInStep = (): React.JSX.Element => (
  <div data-signed-in-step>
    {/* Decoration, exactly as `SignInShell.tsx`'s cloth furniture is: it says
     * nothing the heading below does not, so a screen reader is not read a
     * shape. */}
    <div aria-hidden="true" data-signed-in-mark className={styles.signedInMark}>
      <span className={styles.signedInMarkInner} />
    </div>

    <p className={styles.eyebrow}>Signed in</p>
    <h1 className={[styles.title, styles.titleCompact].join(' ')}>The back room is open</h1>
    <p className={styles.lede}>{SIGNED_IN_STATUS}</p>

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
