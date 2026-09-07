'use client'

/**
 * PasswordStep — the sign-in screen's first pane: eyebrow, title, lede, rule,
 * Email, Password with its Show/Hide, the error box, the remember-me
 * checkbox, the submit button, a rule, and the footer line that states
 * whether the code step is on. SCREENS.md §3.1 transcribed.
 *
 * State machine at its smallest (CLAUDE.md §3.3): the pane has exactly two
 * pieces of state - whether the password is revealed, and which field, if
 * any, the reader has to fix - and no other. Everything else about this
 * screen is decided on the server before it is rendered.
 *
 * ═══ THE FOOTER LINE READS THE SERVER, AND NOTHING ELSE ═══
 *
 * `SECURITY.md`'s second prototype hole is this line's source. The handoff's
 * prototype answered it from a `localStorage` key (`SECURITY.md` §2 names it),
 * kept in sync by `storage` and `focus` listeners and a 1.5-second poll,
 * "where anyone can set it to 0 and skip the second factor entirely". None of
 * that is here: `codeStepRequired` arrives as a prop, the route read it from
 * `users.otpRequired` (`apps/web/lib/auth/readSignInScreen.ts`), and this
 * module contains no browser-storage access of any kind. `e2e/signIn.spec.ts`
 * asserts that against the DELIVERED PAGE - no `Storage` call during load, no
 * script naming that key, and the line unchanged when the key is planted in
 * `localStorage` before navigation - rather than against this comment or this
 * file's text.
 *
 * THE KEY IS NOT SPELLED ANYWHERE IN THIS MODULE, not even in a comment, and
 * that is deliberate rather than coy: `e2e/signIn.spec.ts` searches every
 * script the browser received for it, and a development build ships comments
 * verbatim, so a comment quoting the key would make that case fail locally
 * and pass in CI's minified build - the worst of both. The key itself lives
 * in `SECURITY.md`, in `apps/web/lib/auth/readSignInScreen.ts` (which is
 * server-only and reaches no bundle) and in the tests that plant it.
 *
 * ═══ THE THREE PLACES THIS DEPARTS FROM THE PROTOTYPE ═══
 *
 * 1. REMEMBER-ME IS A REAL CHECKBOX. The prototype draws a `<button>` with a
 *    styled `<div>` inside it and a tick character; that has no checkbox role,
 *    no checked state and no name a screen reader can read as one, and it
 *    submits nothing without JavaScript. It is an `<input type="checkbox">`
 *    here, restyled to the same 21px box. SCREENS.md §3.1 asks for "a
 *    remember-me checkbox", so this is the specified control rather than a
 *    substitute for it.
 * 2. THE FIELDS ARE UNCONTROLLED AND THE FORM IS A REAL `POST`. The prototype
 *    keeps every keystroke in component state and calls a local `submit()`.
 *    Here the pane is a `<form method="post">`, so a reader with no
 *    JavaScript can still sign in, and no keystroke costs a re-render of the
 *    pane (CLAUDE.md §6). The validation below runs on submit and is a
 *    courtesy, never a gate: the server decides, and Task 10's handler is
 *    what {@link PASSWORD_STEP_ENDPOINT} names.
 * 3. THERE IS NO CLIENT-SIDE MINIMUM PASSWORD LENGTH. The prototype refuses
 *    anything under four characters with "Enter your password to carry on."
 *    That message describes an EMPTY field, and a length policy invented in
 *    the browser would refuse a valid short password without ever asking the
 *    server. Only an empty password is refused here; the copy is the
 *    prototype's, unchanged.
 *
 * IT NOW RENDERS A SERVER-SIDE REFUSAL, AND IT RENDERS EXACTLY ONE. Task 10
 * mounted the endpoint this form posts to, and {@link PasswordStepProps.refusal}
 * is what that endpoint's redirect carries back - decided by
 * `@travel-diary/domain/auth/signInScreen`'s `passwordStepView`, which has one
 * refusal state because `signIn.ts` has one refusal. The message goes into the
 * SAME error box the two client-side checks use, since SCREENS.md §3.1
 * specifies one error box, and it goes as soon as the reader types, for the
 * reason the client-side one does: typing is how they answer it.
 *
 * WHAT THIS PANE STILL DOES NOT DO. It does not submit by `fetch`, set a
 * cookie, or carry a CSRF token. The first is deliberate (a real `POST` works
 * with no JavaScript); the second is the endpoint's; and the third is
 * `apps/web/middleware.ts`'s, which refuses a cross-site mutation to any
 * `/admin` address before a handler is reached - so there is no token for this
 * form to carry and no per-visitor state to mint one against.
 * Depends on: react, `RESET_PATH` (../../lib/auth/resetPath),
 * ./signIn.module.css.
 */
import { useState } from 'react'
import type React from 'react'
import { PASSWORD_ENDPOINT } from '../../lib/auth/adminPaths'
import { RESET_PATH } from '../../lib/auth/resetPath'
import styles from './signIn.module.css'

/**
 * Where the password step posts.
 *
 * A sibling path of the screen's own address rather than the address itself:
 * `/admin/sign-in` is a `page.tsx` and a Next.js page cannot answer a `POST`,
 * so the handler needs a route of its own. Exported so Task 10's handler
 * mounts at the path this form actually targets rather than at a second
 * spelling of it.
 */
export const PASSWORD_STEP_ENDPOINT = PASSWORD_ENDPOINT

/** Copy for the footer line when the code step runs. The prototype's, verbatim. */
export const CODE_STEP_ON_NOTICE =
  'A one-time code is asked for after your password. Turn it off under Account → Getting in.'

/** Copy for the footer line when it does not. The prototype's, verbatim. */
export const CODE_STEP_OFF_NOTICE = 'The one-time code step is switched off, so your password alone will let you in.'

/** What the reader is told when the address is not one. The prototype's, verbatim. */
const EMAIL_ERROR = 'That does not look like an email address.'

/** What they are told when the password box is empty. The prototype's, verbatim. */
const PASSWORD_ERROR = 'Enter your password to carry on.'

/** Ties the error box to the field it is about, for `aria-describedby`. */
const ERROR_ID = 'sign-in-error'

/** Which field the reader has to fix, and what they are told about it. */
interface FieldError {
  /** The field the message is about. */
  readonly field: 'email' | 'password'
  /** The message itself. */
  readonly message: string
}

/** What the password pane needs to print itself. */
export interface PasswordStepProps {
  /**
   * Whether the one-time-code step runs after the password, as
   * `users.otpRequired` says. Read on the server by `readSignInScreen`;
   * the browser is never asked, and never consulted about it.
   */
  readonly codeStepRequired: boolean
  /**
   * What the server said about the last submission, or `null` when there was
   * none. One message for every reason a sign-in can be refused - see
   * `@travel-diary/domain/auth/signInScreen`, which is what decides it.
   */
  readonly refusal?: string | null
}

/**
 * One field's value, as text.
 *
 * `FormData.get` answers `string | File | null`, because a form can carry an
 * upload; neither field here is one, and `String()` of a `File` would be
 * `[object File]` rather than a value anybody typed. Narrowed rather than
 * stringified, so a non-string entry is treated as nothing typed at all.
 *
 * @param entered - The form's own values.
 * @param field - Which field to read.
 * @returns What the reader typed, or `''`.
 */
const typedInto = (entered: FormData, field: string): string => {
  const value = entered.get(field)
  return typeof value === 'string' ? value : ''
}

/**
 * The first thing wrong with what the reader typed, or `null` when the form
 * is worth sending.
 *
 * Deliberately not an email-shaped regular expression: the address is
 * validated for real on the server, and a browser-side pattern that refused a
 * valid address would be a defect nobody could work around. The `@` test is
 * the prototype's own, and catches the mistake this check exists for - a
 * username typed where an address belongs.
 *
 * @param values - The email and password as the reader left them.
 * @returns The first {@link FieldError}, or `null`.
 */
const firstProblem = (values: { readonly email: string; readonly password: string }): FieldError | null => {
  if (values.email.trim() === '' || !values.email.includes('@')) {
    return { field: 'email', message: EMAIL_ERROR }
  }
  if (values.password === '') return { field: 'password', message: PASSWORD_ERROR }
  return null
}

/**
 * Renders the password step.
 *
 * @param props - See {@link PasswordStepProps}: whether the code step runs, and
 *   what the server said about the last submission. Both come from the route.
 * @returns The pane, as a real `POST` form.
 * @example
 * <PasswordStep codeStepRequired={content.codeStepRequired} refusal={view.message} />
 */
export const PasswordStep = ({ codeStepRequired, refusal = null }: PasswordStepProps): React.JSX.Element => {
  const [revealed, setRevealed] = useState(false)
  const [problem, setProblem] = useState<FieldError | null>(null)
  // The server's refusal is state rather than a straight read of the prop,
  // because it has to go when the reader starts answering it - and it is
  // separate from `problem` because the two have different subjects: `problem`
  // names a field, and a refusal is about the pair.
  const [refusalStanding, setRefusalStanding] = useState(refusal !== null)

  // The field-level message wins when there is one: a reader who has just
  // emptied the password box needs to be told that before they are told again
  // that the last attempt failed.
  const message = problem?.message ?? (refusalStanding ? refusal : null)

  const checkBeforeSending = (event: React.SyntheticEvent<HTMLFormElement>): void => {
    const entered = new FormData(event.currentTarget)
    const found = firstProblem({ email: typedInto(entered, 'email'), password: typedInto(entered, 'password') })
    setProblem(found)
    // The submission is stopped only when there is something to say. With
    // nothing wrong the event is left alone and the browser posts the form,
    // which is what makes this pane work with no JavaScript at all.
    if (found !== null) event.preventDefault()
  }

  // Typing is how a reader answers the message, so the message goes as soon
  // as they do. Guarded on there being one, so an ordinary keystroke on a
  // clean form costs no state update and no re-render.
  const clearProblem = (): void => {
    if (problem !== null) setProblem(null)
    if (refusalStanding) setRefusalStanding(false)
  }

  return (
    <form
      data-password-step
      className={styles.paneForm}
      method="post"
      action={PASSWORD_STEP_ENDPOINT}
      onSubmit={checkBeforeSending}
    >
      <p className={styles.eyebrow}>Sign in</p>
      <h1 className={styles.title}>Welcome back</h1>
      <p className={styles.lede}>The diary itself is open to everyone. This door is only for editing it.</p>

      <hr className={[styles.rule, styles.ruleAboveFields].join(' ')} />

      <div className={styles.fields}>
        <div>
          <label className={styles.label} htmlFor="sign-in-email">
            Email
          </label>
          <input
            id="sign-in-email"
            className={styles.field}
            type="text"
            name="email"
            autoComplete="username"
            placeholder="hello@wanderings.travel"
            aria-invalid={problem?.field === 'email'}
            aria-describedby={problem?.field === 'email' ? ERROR_ID : undefined}
            onInput={clearProblem}
          />
        </div>

        <div>
          <div className={[styles.labelRow, styles.labelRowSpacer].join(' ')}>
            <label className={styles.label} htmlFor="sign-in-password">
              Password
            </label>
            <a className={styles.forgotten} href={RESET_PATH}>
              Forgotten
            </a>
          </div>
          <div className={styles.passwordWrap}>
            <input
              id="sign-in-password"
              className={[styles.field, styles.passwordField].join(' ')}
              type={revealed ? 'text' : 'password'}
              name="password"
              autoComplete="current-password"
              placeholder="your password"
              aria-invalid={problem?.field === 'password'}
              aria-describedby={problem?.field === 'password' ? ERROR_ID : undefined}
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

        {message !== null && (
          <div className={styles.error} id={ERROR_ID} role="alert">
            <span aria-hidden="true" className={styles.errorMark} />
            <p className={styles.errorText}>{message}</p>
          </div>
        )}

        <label className={styles.remember}>
          <input className={styles.rememberBox} type="checkbox" name="keepSignedIn" defaultChecked />
          Keep me signed in on this browser
        </label>

        <button className={styles.submit} type="submit">
          Sign in
        </button>
      </div>

      <hr className={[styles.rule, styles.ruleAboveFooter].join(' ')} />

      <p data-code-step={codeStepRequired ? 'on' : 'off'} className={styles.footer}>
        <span
          aria-hidden="true"
          className={[styles.footerMark, codeStepRequired ? styles.footerMarkOn : styles.footerMarkOff].join(' ')}
        />
        <span className={styles.footerText}>{codeStepRequired ? CODE_STEP_ON_NOTICE : CODE_STEP_OFF_NOTICE}</span>
      </p>
    </form>
  )
}
