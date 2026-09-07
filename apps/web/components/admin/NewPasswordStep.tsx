'use client'

/**
 * NewPasswordStep — the screen the mailed reset link lands on: one password
 * field, the button that spends the link, and the two states where the link or
 * the password has already been refused.
 *
 * State machine at its smallest (CLAUDE.md §3.3), exactly as `ResetStep.tsx`
 * and `PasswordStep.tsx` are: WHICH of the three states the pane is in is the
 * server's, arriving as a `NewPasswordView` that
 * `@travel-diary/domain/auth/resetScreen` decided, and the only transitions
 * this module owns are the two a reader can make without a round trip -
 * revealing the password, and being told the field is empty.
 *
 * ═══ THIS SCREEN IS NOT IN THE HANDOFF, AND THAT IS THE POINT OF IT ═══
 *
 * `SCREENS.md` §3.3 draws the reset REQUEST in two states and stops there; the
 * handoff's own login prototype does the same, because a prototype can pretend
 * the link worked. Nothing in the plan owned the screen it actually opens, so
 * the phase was on course to ship a reset email whose link answered 404 with
 * every mechanism behind it green - the token minted, mailed, and provably
 * consumable. Phase ruling F47 gave that screen to Task 9. It is therefore
 * assembled from §3.3's own surface rather than invented: the same back link,
 * the same "Forgotten" eyebrow, the same Caveat 50px title, the same rule, the
 * same field and error box as §3.1's password, and the same primary button.
 * Every string on it is new, because there was none to take. Recorded in
 * docs/deviations.md.
 *
 * ═══ THE TOKEN TRAVELS IN THE BODY, NOT IN THE ACTION ═══
 *
 * The form posts to one fixed address ({@link SET_PASSWORD_ENDPOINT}) with the
 * token in a hidden field, rather than to `/admin/reset/<token>/set`. The
 * token is the whole authorisation for this screen, and a URL is the most
 * copied, logged and forwarded part of a request - it reaches access logs and
 * `Referer` headers that a body does not. It is already in the address the
 * reader arrived at, which cannot be helped (it is what a mailed link IS), but
 * there is no reason to put it in a second one. It also keeps the handler off
 * a bracketed route, where this repository's coverage tooling is documented
 * not to honour an ignore hint (CLAUDE.md §2.1).
 *
 * THE TOKEN IS NEVER RENDERED AS TEXT. It is a hidden input's value and
 * nothing else - not in the heading, not in a message, and not in the expired
 * state, which prints no token at all (CLAUDE.md §7). `NewPasswordStep.test.tsx`
 * asserts that in every state.
 *
 * ═══ NO PASSWORD POLICY IS INVENTED HERE ═══
 *
 * The only thing refused in the browser is an EMPTY field, which is the same
 * call `PasswordStep.tsx` makes and for the same reason: a minimum length made
 * up in a client component would refuse a password the account could otherwise
 * have had, with no way around it. Payload's own rule is the policy, and when
 * it refuses, the server says so and this pane draws the `'rejected'` state.
 *
 * WHAT THIS PANE DOES NOT DO. It does not look the token up, spend it, hash a
 * password or decide which state to draw. The first three are
 * `apps/web/lib/auth/setNewPassword.ts`'s, behind the endpoint below; the
 * fourth is `@travel-diary/domain/auth/resetScreen`'s `newPasswordView`, read
 * on the server, so this pane prints a state rather than inferring one.
 * Depends on: react, `NewPasswordView` (@travel-diary/domain/auth/resetScreen),
 * `RESET_PATH` (../../lib/auth/resetPath), ./signIn.module.css.
 */
import type { NewPasswordView } from '@travel-diary/domain/auth/resetScreen'
import { useState } from 'react'
import type React from 'react'
import { SET_PASSWORD_ENDPOINT as SET_ENDPOINT, SIGN_IN_PATH } from '../../lib/auth/adminPaths'
import { RESET_PATH } from '../../lib/auth/resetPath'
import styles from './signIn.module.css'

/**
 * Where the new password posts.
 *
 * A sibling of the reset screen rather than a child of the token's own
 * address, so the token stays out of a second URL - see this module's header.
 * A static segment, which Next.js resolves before the `[token]` dynamic one,
 * and no token can collide with it: Payload mints them as hexadecimal. It is
 * named in `lib/auth/resetPath.ts`'s `RESERVED_RESET_SEGMENTS` as well, so the
 * reservation does not depend on that framework precedence rule holding for a
 * handler that later moves (ruling F56).
 */
export const SET_PASSWORD_ENDPOINT = SET_ENDPOINT

/** Where the way back leads. */
/** The eyebrow every state carries, shared with SCREENS.md §3.3's own pane. */
const EYEBROW = 'Forgotten'

/** Ties the error box to the field it is about, for `aria-describedby`. */
const ERROR_ID = 'new-password-error'

/** What the reader is told when the field is empty. §3.1's voice, one word changed. */
const EMPTY_PASSWORD_MESSAGE = 'Choose a new password to carry on.'

/**
 * What they are told when the server refused what they chose.
 *
 * Deliberately does not quote a minimum length: the rule is Payload's, not
 * this repository's, and a sentence naming three characters would be wrong the
 * day that setting changes without anybody noticing this file.
 */
const REJECTED_PASSWORD_MESSAGE = 'That password was not accepted. Try a longer one.'

/** The sentence the reset email and SCREENS.md §3.3 both make, reused verbatim. */
const LINK_PROMISE = 'The link works once and lasts an hour.'

/** What the new-password pane needs to print itself. */
export interface NewPasswordStepProps {
  /**
   * The token out of the link's last path segment, carried through to the
   * endpoint. Rendered only as a hidden field's value.
   */
  readonly token: string
  /**
   * Which state to draw, as `newPasswordView` read it off the address. The
   * browser is never asked.
   */
  readonly view: NewPasswordView
}

/**
 * The form, in the state the server left it in.
 *
 * @param props - The token to carry, and whether the server has already
 *   refused a password against this link.
 * @returns The fields, the message if there is one, and the button.
 */
const NewPasswordForm = ({
  token,
  refused,
}: {
  readonly token: string
  readonly refused: boolean
}): React.JSX.Element => {
  const [revealed, setRevealed] = useState(false)
  // Seeded from the server's own refusal, so a reader who posted a password
  // Payload would not take sees why without the pane having to ask again.
  const [problem, setProblem] = useState<string | null>(refused ? REJECTED_PASSWORD_MESSAGE : null)

  const checkBeforeSending = (event: React.SyntheticEvent<HTMLFormElement>): void => {
    const typed = new FormData(event.currentTarget).get('password')
    // `FormData.get` answers `string | File | null`; anything that is not a
    // string is treated as nothing typed rather than stringified.
    if (typeof typed === 'string' && typed !== '') return

    setProblem(EMPTY_PASSWORD_MESSAGE)
    event.preventDefault()
  }

  const clearProblem = (): void => {
    if (problem !== null) setProblem(null)
  }

  return (
    <>
      <h1 className={[styles.title, styles.titleCompact].join(' ')}>Choose a new password</h1>
      <p className={styles.lede}>
        {LINK_PROMISE} Type what you would like to sign in with and it takes effect straight away.
      </p>

      <hr className={[styles.rule, styles.ruleAboveFields].join(' ')} />

      <form className={styles.paneForm} method="post" action={SET_PASSWORD_ENDPOINT} onSubmit={checkBeforeSending}>
        <input type="hidden" name="token" value={token} readOnly />

        {/* One field, its message flush under it and the button 18px below -
         * §3.3's own arrangement rather than §3.1's `.fields` column, since
         * this pane is assembled from that one. */}
        <div>
          <label className={styles.label} htmlFor="new-password">
            New password
          </label>
          <div className={styles.passwordWrap}>
            <input
              id="new-password"
              className={[styles.field, styles.passwordField].join(' ')}
              type={revealed ? 'text' : 'password'}
              name="password"
              autoComplete="new-password"
              placeholder="your new password"
              aria-invalid={problem !== null}
              aria-describedby={problem === null ? undefined : ERROR_ID}
              onInput={clearProblem}
            />
            <button
              className={styles.reveal}
              type="button"
              aria-label={revealed ? 'Hide the password' : 'Show the password'}
              onClick={() => {
                setRevealed(!revealed)
              }}
            >
              {revealed ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        {problem !== null && (
          <div className={styles.error} id={ERROR_ID} role="alert">
            <span aria-hidden="true" className={styles.errorMark} />
            <p className={styles.errorText}>{problem}</p>
          </div>
        )}

        <button className={[styles.submit, styles.submitSpaced].join(' ')} type="submit">
          Set the new password
        </button>
      </form>
    </>
  )
}

/**
 * The state a spent, unknown or hour-old link lands in.
 *
 * @returns The refusal, and the one way on from it.
 */
const ExpiredLink = (): React.JSX.Element => (
  <>
    <h1 className={[styles.title, styles.titleCompact].join(' ')}>That link has expired</h1>
    <p className={styles.lede}>
      {LINK_PROMISE} This one has been used already, or its hour is up. Nothing about the diary has changed.
    </p>

    <hr className={[styles.rule, styles.ruleAboveFields].join(' ')} />

    <a className={[styles.submit, styles.submitSpaced, styles.buttonLink].join(' ')} href={RESET_PATH}>
      Send yourself another
    </a>
  </>
)

/**
 * Renders the screen the mailed link lands on.
 *
 * @param props - See {@link NewPasswordStepProps}.
 * @returns The pane, in the state the route put it in.
 * @example
 * <NewPasswordStep token={token} view={newPasswordView(state)} />
 */
export const NewPasswordStep = ({ token, view }: NewPasswordStepProps): React.JSX.Element => (
  <div data-new-password-step data-new-password-view={view}>
    <a className={styles.backLink} href={SIGN_IN_PATH}>
      ← Back to sign in
    </a>

    <p className={styles.eyebrow}>{EYEBROW}</p>

    {view === 'expired' ? <ExpiredLink /> : <NewPasswordForm token={token} refused={view === 'rejected'} />}
  </div>
)
