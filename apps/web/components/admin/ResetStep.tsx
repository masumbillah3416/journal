'use client'

/**
 * ResetStep — the sign-in screen's third pane, in both of the states
 * SCREENS.md §3.3 draws it in: *pending* (the way back, the "Forgotten"
 * eyebrow, "Send yourself a way back in", an email field, "Send the link" and
 * the promise under it) and *sent* (the green confirmation block with its
 * 14px rotated mark and the masked address, "Sign in with the new password"
 * and "Send it again").
 *
 * State machine at its smallest (CLAUDE.md §3.3), and only one of the two
 * states has any: WHICH state the pane is in is the server's, arriving as a
 * `ResetRequestView`, and the only thing this module decides for itself is
 * whether the reader has typed something that is worth posting.
 *
 * ═══ THE ANTI-ENUMERATION PROPERTY IS NOT THIS PANE'S TO BREAK, AND THAT IS
 * WHY THE SENT STATE HAS NO BRANCH IN IT ═══
 *
 * `SECURITY.md` §3: "The reset endpoint must respond identically whether or
 * not the address exists", and `apps/web/lib/auth/passwordReset.ts` discharges
 * it by deriving the masked address from what was SUBMITTED rather than from a
 * row. This pane prints that value and nothing else. There is deliberately no
 * "we could not find that address" state to draw, no different button, and no
 * different sentence - the screen a reader is shown for an address that names
 * an account and one that names nobody is the same screen, drawn by the same
 * code path, because there is only one.
 *
 * ═══ WHAT THE PROTOTYPE DOES THAT THIS CANNOT, AND WHAT IT DOES INSTEAD ═══
 *
 * "Send it again" is a LINK BACK TO THE FORM, not a second submission. The
 * handoff's prototype keeps the reader's address in component state, so its
 * own "Send it again" re-runs the request with an address it still holds.
 * This screen is a real page and the address is gone by the time the
 * confirmation is drawn: the only thing that reaches it is the MASKED value,
 * which cannot be posted anywhere. The alternatives were both worse - putting
 * the whole address in the redirect would write it into a URL, and therefore
 * into every access log the response passes through (CLAUDE.md §7), and
 * putting it in a hidden field would mean the sent state had to be told it.
 * A reader who wants another link types the address again, which is one
 * keystroke run against a mailbox they are already looking at. Recorded in
 * docs/deviations.md.
 *
 * THE FIELD IS UNCONTROLLED AND THE FORM IS A REAL `POST`, for the reasons
 * `PasswordStep.tsx`'s header gives at length: a reader with no JavaScript can
 * still ask for a link, and no keystroke costs a re-render. The check below
 * runs on submit and is a courtesy, never a gate - the server decides.
 *
 * WHAT THIS PANE DOES NOT DO. It does not send anything, mint a token, mask an
 * address or count against a rate limit. All four are
 * `apps/web/lib/auth/passwordReset.ts`'s, behind the endpoint
 * {@link RESET_REQUEST_ENDPOINT} names - which Task 10 mounts along with the
 * rest of the sign-in surface's handlers, the same split `PasswordStep.tsx`
 * and `CodeStep.tsx` make (docs/deviations.md).
 * Depends on: react, `ResetRequestView`
 * (@travel-diary/domain/auth/resetScreen), `RESET_PATH`
 * (../../lib/auth/resetPath), ./signIn.module.css.
 */
import type { ResetRequestView } from '@travel-diary/domain/auth/resetScreen'
import { useState } from 'react'
import type React from 'react'
import { RESET_PATH } from '../../lib/auth/resetPath'
import styles from './signIn.module.css'

/**
 * Where the reset request posts.
 *
 * A child path of the screen's own address rather than the address itself:
 * `/admin/reset` is a `page.tsx` and a Next.js page cannot answer a `POST`.
 * Exported so the handler mounts at the path this form actually targets
 * rather than at a second spelling of it, exactly as
 * `PASSWORD_STEP_ENDPOINT` is.
 */
export const RESET_REQUEST_ENDPOINT = '/admin/reset/request'

/** Where the way back, and "Sign in with the new password", both lead. */
export const SIGN_IN_PATH = '/admin/sign-in'

/** The eyebrow both states carry. The prototype's, verbatim. */
const EYEBROW = 'Forgotten'

/** What the reader is told when the address is not one. `PasswordStep`'s, verbatim. */
const EMAIL_ERROR = 'That does not look like an email address.'

/** Ties the error box to the field it is about, for `aria-describedby`. */
const ERROR_ID = 'reset-error'

/**
 * The rest of the confirmation sentence, after the masked address.
 *
 * Exported so a test can assert the whole sentence without spelling the
 * prototype's copy a second time - two copies of a string that must match is
 * the shape this phase keeps finding defects in.
 */
export const SENT_CONFIRMATION_TAIL = ' — including the spam folder, where it usually is.'

/** What the reset request pane needs to print itself. */
export interface ResetStepProps {
  /**
   * Which of §3.3's two states to draw, and - in the sent state - the masked
   * address the link went to. Decided on the server by
   * `@travel-diary/domain/auth/resetScreen`'s `resetRequestView`, which is
   * also what guarantees the address arrives masked.
   */
  readonly request: ResetRequestView
}

/**
 * Whether what the reader typed is worth posting.
 *
 * Deliberately not an email-shaped regular expression, for the reason
 * `PasswordStep.tsx` gives: the address is validated for real on the server,
 * and a browser-side pattern that refused a valid address would be a defect
 * nobody could work around. The `@` test is the prototype's own.
 *
 * @param typed - The address as the reader left it.
 * @returns `true` when there is nothing to say about it.
 */
const worthSending = (typed: string): boolean => typed.trim() !== '' && typed.includes('@')

/**
 * The pending state: the form, and the promise under it.
 *
 * @returns The pane's first state.
 */
const PendingReset = (): React.JSX.Element => {
  const [problem, setProblem] = useState<string | null>(null)

  const checkBeforeSending = (event: React.SyntheticEvent<HTMLFormElement>): void => {
    const entered = new FormData(event.currentTarget).get('email')
    // `FormData.get` answers `string | File | null` because a form can carry
    // an upload; this one cannot, so anything that is not a string is treated
    // as nothing typed rather than stringified into `[object File]`.
    if (worthSending(typeof entered === 'string' ? entered : '')) return

    setProblem(EMAIL_ERROR)
    event.preventDefault()
  }

  // Typing is how a reader answers the message, so the message goes as soon
  // as they do. Guarded on there being one, so an ordinary keystroke on a
  // clean form costs no state update and no re-render.
  const clearProblem = (): void => {
    if (problem !== null) setProblem(null)
  }

  return (
    <>
      <h1 className={[styles.title, styles.titleCompact].join(' ')}>Send yourself a way back in</h1>
      <p className={styles.lede}>
        Tell me the address you sign in with and I will send a link that lets you set a new password.
      </p>

      <hr className={[styles.rule, styles.ruleAboveFields].join(' ')} />

      <form className={styles.paneForm} method="post" action={RESET_REQUEST_ENDPOINT} onSubmit={checkBeforeSending}>
        {/* NO `.fields` WRAPPER, and that is the prototype's own difference
         * between this pane and §3.1's. The password step nests its two fields
         * and its error box in a `display: flex; gap: 15px` column; this pane
         * has one field, and the prototype puts the field, the error box and
         * the button in ordinary flow, so the message sits flush under the box
         * it is about rather than 15px below it. */}
        <div>
          <label className={styles.label} htmlFor="reset-email">
            Email
          </label>
          <input
            id="reset-email"
            className={styles.field}
            type="text"
            name="email"
            autoComplete="username"
            placeholder="hello@wanderings.travel"
            aria-invalid={problem !== null}
            aria-describedby={problem === null ? undefined : ERROR_ID}
            onInput={clearProblem}
          />
        </div>

        {problem !== null && (
          <div className={styles.error} id={ERROR_ID} role="alert">
            <span aria-hidden="true" className={styles.errorMark} />
            <p className={styles.errorText}>{problem}</p>
          </div>
        )}

        <button className={[styles.submit, styles.submitSpaced].join(' ')} type="submit">
          Send the link
        </button>
      </form>

      <p className={styles.resetNote}>
        The link works once and lasts an hour. Nothing about the diary changes until you use it.
      </p>
    </>
  )
}

/**
 * The sent state: the green confirmation block and the two ways on.
 *
 * @param props - The masked address the link went to.
 * @returns The pane's second state.
 */
const SentReset = ({ maskedTo }: { readonly maskedTo: string }): React.JSX.Element => (
  <>
    <h1 className={[styles.title, styles.titleCompact].join(' ')}>Check your email</h1>
    <p className={styles.lede}>A one-time link is on its way. Follow it and you can set a new password.</p>

    <hr className={[styles.rule, styles.ruleAboveFields].join(' ')} />

    <div data-reset-sent className={styles.confirmation}>
      <span aria-hidden="true" className={styles.confirmationMark} />
      <p className={styles.confirmationText}>
        Sent. Check <span data-reset-sent-address>{maskedTo}</span>
        {SENT_CONFIRMATION_TAIL}
      </p>
    </div>

    <a className={[styles.submit, styles.submitSpaced, styles.buttonLink].join(' ')} href={SIGN_IN_PATH}>
      Sign in with the new password
    </a>
    <a className={[styles.secondary, styles.buttonLink].join(' ')} href={RESET_PATH}>
      Send it again
    </a>
  </>
)

/**
 * Renders the reset request step in the state the server put it in.
 *
 * @param props - See {@link ResetStepProps}.
 * @returns The pane, in one of SCREENS.md §3.3's two states.
 * @example
 * <ResetStep request={resetRequestView(sent)} />
 */
export const ResetStep = ({ request }: ResetStepProps): React.JSX.Element => (
  <div data-reset-step data-reset-state={request.kind}>
    <a className={styles.backLink} href={SIGN_IN_PATH}>
      ← Back to sign in
    </a>

    <p className={styles.eyebrow}>{EYEBROW}</p>

    {request.kind === 'pending' ? <PendingReset /> : <SentReset maskedTo={request.maskedTo} />}
  </div>
)
