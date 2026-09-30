/**
 * SessionsCard — SCREENS.md §2.11's "Where you are signed in": one row per
 * live session, then "Sign out everywhere" and "Sign out".
 *
 * ═══ THE MARK AND THE WORD "CURRENT" READ THE SAME FACT, AND IT IS A HASH ═══
 *
 * `readAccountScreen.ts` asks the session service which row's stored hash
 * matches the cookie THIS request carried. Nothing here decides it, and
 * nothing here may be tempted to: "the newest row" agrees on every account
 * holding one session and disagrees the moment one holds two, and the cost of
 * the wrong answer is an author pressing Revoke on the session they are
 * sitting in while believing they are revoking a lost device.
 *
 * REVOKE IS A FORM PER ROW, keyed by the row's own id (CLAUDE.md §0.9). There
 * is no identifier to post — only its hash is stored — so
 * `revokeSessionRow` (`lib/auth/sessions.ts`) is what the action calls, with
 * the account in the `WHERE` clause so a typed integer cannot reach somebody
 * else's row.
 *
 * ═══ THE CURRENT ROW IS STILL REVOCABLE, DELIBERATELY ═══
 *
 * Its button says "Revoke and sign out", because that is what pressing it
 * does. Hiding it would leave an author who has just noticed something wrong
 * with only the all-or-nothing control beside it; saying "Revoke" and then
 * signing them out would be the surprise this card exists to avoid.
 *
 * "SIGN OUT EVERYWHERE" INCLUDES THIS SESSION, which is `revokeAllSessions`'s
 * own documented choice: a reader who presses it because a device was lost
 * means every device. The button says so.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. A list and three forms.
 * Depends on: react, `AccountSession` (../../../lib/admin/readAccountScreen),
 * `SIGN_OUT_ENDPOINT` (../SignedInStep), ./account.module.css.
 */
import type React from 'react'
import type { AccountSession } from '../../../lib/admin/readAccountScreen'
import { SIGN_OUT_ENDPOINT } from '../SignedInStep'
import styles from './account.module.css'

/** What SCREENS.md §2.11's fourth card needs to draw itself. */
export interface SessionsCardProps {
  /** One row per live session, newest first, with one of them current. */
  readonly sessions: readonly AccountSession[]
  /** Revokes one row. Handed that row's id. */
  readonly revokeOne: (form: FormData) => Promise<void>
  /** Revokes every one of them, this session included. Takes no fields. */
  readonly signOutEverywhere: (form: FormData) => Promise<void>
}

/**
 * Renders SCREENS.md §2.11's "Where you are signed in".
 *
 * @param props - See {@link SessionsCardProps}.
 * @returns The card: the rows and the two sign-out controls.
 * @example
 * <SessionsCard sessions={view.sessions} revokeOne={revokeOneSession}
 *   signOutEverywhere={signOutEverywhere} />
 */
export const SessionsCard = ({ sessions, revokeOne, signOutEverywhere }: SessionsCardProps): React.JSX.Element => (
  <section data-account-sessions className={styles.card}>
    <div className={styles.cardHead}>
      <h2 className={styles.cardTitle}>Where you are signed in</h2>
    </div>

    {sessions.length === 0 ? (
      // UNREACHABLE FROM A BROWSER AND DRAWN ANYWAY: the request that renders
      // this card arrived on a live session, so there is always at least one
      // row. It is here because a card whose only state is "at least one" has
      // no defined appearance the day that stops being true — a revoke racing
      // this render, or a sweep — and an empty `<ul>` under a heading reads as
      // a broken screen.
      <p data-sessions-empty className={styles.sessionsEmpty}>
        Nothing is signed in — which cannot be true while you are reading this, so try the page again.
      </p>
    ) : (
      <ul className={styles.sessions}>
        {sessions.map((session) => (
          // KEYED BY THE ROW'S ID, never by position (CLAUDE.md §0.9).
          <li key={session.row} data-session-row={session.row} className={styles.sessionRow}>
            <span
              aria-hidden="true"
              data-current={String(session.isCurrent)}
              className={[styles.mark, session.isCurrent ? styles.markCurrent : ''].join(' ')}
            />
            <span className={styles.sessionText}>
              <span className={styles.sessionDevice}>{session.device}</span>
              {/* NAMED SO A SCREENSHOT CAN MASK IT: this line ends in
                  `lastSeenAt`, which the guard stamps on the very request that
                  draws this screen, so it is always today's date and would put
                  a daily expiry on `admin-account`'s baseline. */}
              <span data-session-where className={styles.sessionWhere}>
                {session.where}
              </span>
            </span>
            {session.isCurrent ? (
              <span data-session-current className={styles.sessionCurrent}>
                Current
              </span>
            ) : null}
            <form action={revokeOne}>
              <input type="hidden" name="row" value={session.row} />
              <button
                type="submit"
                data-revoke-session={session.row}
                className={[styles.rowAction, styles.danger].join(' ')}
              >
                {session.isCurrent ? 'Revoke and sign out' : 'Revoke'}
              </button>
            </form>
          </li>
        ))}
      </ul>
    )}

    <div className={styles.sessionActions}>
      <form action={signOutEverywhere}>
        <button type="submit" data-sign-out-everywhere className={[styles.rowAction, styles.danger].join(' ')}>
          Sign out everywhere
        </button>
      </form>
      {/* THE RAIL'S OWN ENDPOINT, not an action: `SIGN_OUT_ENDPOINT` revokes
       * this session AND clears the cookie, which a Server Action's redirect
       * cannot do from inside a render. One definition of signing out. */}
      <form method="post" action={SIGN_OUT_ENDPOINT}>
        <button type="submit" data-sign-out className={styles.rowAction}>
          Sign out
        </button>
      </form>
    </div>
  </section>
)
