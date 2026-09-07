'use client'

/**
 * CodeStep — the sign-in screen's second pane: the way back, the "Second
 * step" eyebrow, "Check your email", the masked address and its expiry
 * countdown, a rule, the six code cells, the error box, "Verify and sign in",
 * and the resend button opposite the attempts counter. SCREENS.md §3.2
 * transcribed.
 *
 * State machine at the cells (CLAUDE.md §3.3), and it is not this module's.
 * "Which cell is focused" is a state with one live value and
 * `@travel-diary/domain/auth/otpCells`'s `nextCell` is its transition
 * function; `distributePaste` is how a pasted string reaches the six cells.
 * Both were written for this screen, and this module calls them rather than
 * re-deriving either - the arithmetic of "typing advances, Backspace on an
 * empty cell retreats, arrows move" exists in exactly one place, where a test
 * can see every branch of it. Everything left here is the pane's own: which
 * cells hold what, what the reader is being told, whether the shell is
 * shaking, and what the clock says.
 *
 * ═══ EVERY NUMBER ON THIS SCREEN COMES FROM THE DOMAIN ═══
 *
 * The expiry countdown is `EXPIRY_MS`, the resend cooldown is
 * `RESEND_COOLDOWN_MS` and the attempts counter is `MAX_ATTEMPTS` - all three
 * from `@travel-diary/domain/auth/otpChallenge`, which is also what the server
 * enforces them with. None of the three is copied here. A screen that carried
 * its own five minutes would keep counting down for a reader whose code the
 * server had already refused, and nothing would fail.
 *
 * INVARIANT, because one of them cannot follow its constant on its own: the
 * exhausted message says "Three wrong codes" IN WORDS, and no expression
 * turns `MAX_ATTEMPTS` into that word. `CodeStep.test.tsx` pins `MAX_ATTEMPTS`
 * to `3` in its own case, so raising the budget fails there rather than
 * leaving this screen saying "Three" about a budget of five.
 *
 * ═══ WHY PASTE HAS A HANDLER OF ITS OWN ═══
 *
 * Each cell is `maxLength="1"`, and a browser truncates a pasted string to one
 * character BEFORE `change` fires. A reader who copies a six-digit code out of
 * their email and pastes it would land one digit and silently lose five. The
 * `onPaste` handler prevents the default and hands the clipboard's text to
 * `distributePaste`, which is the only path by which more than one digit can
 * arrive at once. A jsdom test cannot prove this: jsdom performs no default
 * paste for a handler to have to prevent, so the case that matters is
 * `e2e/codeStep.spec.ts`'s, which puts a code on the real clipboard and
 * presses Ctrl+V.
 *
 * ═══ THE SHAKE IS A FLAG HERE AND AN ANIMATION IN THE STYLESHEET ═══
 *
 * SCREENS.md §3.2 shakes THE SHELL, and the shell (`SignInShell.tsx`) is a
 * server component that holds no state and knows nothing about this pane. So
 * this pane raises `data-code-step-shaking`, and `signIn.module.css` animates
 * `.shell:has([data-code-step-shaking='true'])`. That keeps the frame free of
 * client JavaScript - the alternative was for this module to reach up the DOM
 * and set a class on an ancestor it does not own - and it puts the animation
 * where `prefers-reduced-motion` can switch it off, which is a property of the
 * stylesheet and not of this file.
 *
 * INVARIANT: {@link SHAKE_MS} is how long the flag stays up and the `omShake`
 * rule is how long the animation runs. They are 420ms in two places because
 * CSS cannot read a TypeScript constant; `CodeStep.test.tsx` pins this one and
 * `e2e/codeStep.spec.ts` reads `420ms` back off the computed style, so a
 * change to either without the other fails a test rather than leaving the flag
 * up after the animation or clearing it mid-shake.
 *
 * A SECOND REFUSAL INSIDE THE FIRST SHAKE DOES NOT RESTART IT. The flag is
 * already up, so the rule never stops matching and the animation runs on. That
 * is the handoff prototype's own behaviour (its `shakeAt` window works the
 * same way), and the interval it describes is 420 milliseconds of a round trip
 * to the server - restarting it would be machinery for a case no reader can
 * reach.
 *
 * ═══ WHAT THIS PANE DOES NOT DO ═══
 *
 * It does not check the code, spend an attempt, send a new one, set a cookie
 * or carry a CSRF token. All of those are the route handlers' - Phase 2 Task
 * 10's - which is why {@link CODE_STEP_ENDPOINT} and {@link RESEND_ENDPOINT}
 * are exported: the handlers mount at the paths these forms actually post to
 * rather than at a second spelling of them, the same split `PasswordStep.tsx`
 * makes. The two refusals this pane DOES make are courtesies before a round
 * trip, never gates: an incomplete code and a window that has already closed.
 * The server decides everything else, and what it decided arrives as
 * {@link CodeStepProps.attemptsSpent}.
 *
 * TWO FORMS, NOT ONE WITH TWO BUTTONS. Verifying and resending post to
 * different handlers, and a single form would mean reading `submitter` off a
 * native submit event to tell them apart - which also means the resend would
 * run this pane's "all six digits" check on a request that carries no code at
 * all. Two sibling forms are ordinary HTML, need no JavaScript, and each says
 * what it is for.
 * Depends on: react, `distributePaste`/`nextCell`
 * (@travel-diary/domain/auth/otpCells), `EXPIRY_MS`/`MAX_ATTEMPTS`/
 * `RESEND_COOLDOWN_MS` (@travel-diary/domain/auth/otpChallenge),
 * `maskEmail` (@travel-diary/domain/auth/mask), `formatCountdown`/
 * `secondsRemaining` (@travel-diary/domain/auth/otpCountdown),
 * ./signIn.module.css.
 */
import { distributePaste, nextCell } from '@travel-diary/domain/auth/otpCells'
import { EXPIRY_MS, MAX_ATTEMPTS, RESEND_COOLDOWN_MS } from '@travel-diary/domain/auth/otpChallenge'
import { formatCountdown, secondsRemaining } from '@travel-diary/domain/auth/otpCountdown'
import { useEffect, useRef, useState } from 'react'
import type React from 'react'
import { CODE_VERIFY_ENDPOINT, RESEND_ENDPOINT as RESEND_CODE_ENDPOINT, SIGN_IN_PATH } from '../../lib/auth/adminPaths'
import styles from './signIn.module.css'

/** How many cells the code has. SCREENS.md §3.2: "six cells". */
export const CELL_COUNT = 6

/**
 * Where the code step posts a code to be checked.
 *
 * A child path of the screen's own address rather than the address itself, for
 * the reason `PASSWORD_STEP_ENDPOINT` gives: `/admin/sign-in/code` is a
 * `page.tsx` and a Next.js page cannot answer a `POST`.
 */
export const CODE_STEP_ENDPOINT = CODE_VERIFY_ENDPOINT

/** Where the resend button posts. Its own handler, never the verification one. */
export const RESEND_ENDPOINT = RESEND_CODE_ENDPOINT

/** Where "← Back to password" leads: the first step of the same screen. */
export const PASSWORD_STEP_PATH = SIGN_IN_PATH

/**
 * How long the shell shakes, in milliseconds. SCREENS.md §3.2: "omShake -
 * 420ms ease". See this module's header for why the number is also in the
 * stylesheet, and what pins the two together.
 */
export const SHAKE_MS = 420

/** Ties the error box to the cells it is about, for `aria-describedby`. */
const ERROR_ID = 'code-step-error'

/** Ties the cell group to the "The code" label above it. */
const CELLS_LABEL_ID = 'code-step-label'

/** What the reader is told when they submit fewer than six digits. The prototype's, verbatim. */
const INCOMPLETE_CODE_MESSAGE = 'All six digits, then we can look.'

/** What they are told when the code's own window has closed. The prototype's, verbatim. */
const EXPIRED_CODE_MESSAGE = 'That code has expired. Send yourself a new one.'

/** What they are told once every guess is spent. The prototype's, verbatim. */
const EXHAUSTED_MESSAGE = 'Three wrong codes. Send a new one, or go back and try the password again.'

/** What the code step needs from the server to print itself. */
export interface CodeStepProps {
  /**
   * The address the code went to, ALREADY MASKED - `SCREENS.md` §3.2's
   * `he•••@wanderings.travel`. Masked on the server (`otpService.issueChallenge`
   * answers with `maskedTo`), never here: a raw address handed to a client
   * component would travel to the browser in the document, which is exactly
   * what masking exists to stop.
   */
  readonly maskedAddress: string
  /**
   * Epoch milliseconds when the code was issued. Both countdowns are measured
   * from it - the code's own five minutes and the resend's thirty seconds -
   * because a resend issues a NEW challenge, so the two windows always open
   * together.
   */
  readonly issuedAt: number
  /**
   * How many wrong guesses the server has already spent against this
   * challenge. INVARIANT: a value above zero means the last submission was
   * refused, which is why the message below is derived from it rather than
   * passed separately - a correct code consumes the challenge and signs the
   * reader in, so nobody arrives back here after one.
   */
  readonly attemptsSpent: number
  /**
   * What the endpoint that redirected here wants said, or `null` when the
   * reader arrived from the password step.
   *
   * A SEPARATE PROP FROM {@link CodeStepProps.attemptsSpent}, because the two
   * answers it carries spend no guess: a submission the rate limiter would not
   * judge, and a resend that sent nothing. Everything else on this pane is
   * derived from the spent count, which is exactly why those two used to be
   * rendered as silence — the count had not moved, so nothing changed and the
   * reader was handed back the page they had just submitted from. The words
   * and the copy are `@travel-diary/domain/auth/codeScreen`'s, so the endpoint
   * that writes a word and the screen that reads it cannot disagree.
   *
   * IT TAKES PRECEDENCE over the spent count's own message: it describes what
   * happened to the submission just made, and the count describes every guess
   * before it.
   */
  readonly notice: string | null
}

/**
 * What the reader is told about a code the server has already refused.
 *
 * @param attemptsSpent - How many guesses the server has spent.
 * @returns The message, or `null` when no guess has been spent and there is
 *   nothing to say.
 * @example
 * wrongCodeMessage(1) // 'That code is not right. 2 attempts left.'
 * wrongCodeMessage(3) // 'Three wrong codes. Send a new one, ...'
 */
const wrongCodeMessage = (attemptsSpent: number): string | null => {
  if (attemptsSpent <= 0) return null
  if (attemptsSpent >= MAX_ATTEMPTS) return EXHAUSTED_MESSAGE

  const left = MAX_ATTEMPTS - attemptsSpent
  // HANDOFF-DEVIATION (docs/deviations.md §34): the prototype writes
  // "1 attempts left." at the last guess. Pluralised here.
  return `That code is not right. ${String(left)} attempt${left === 1 ? '' : 's'} left.`
}

/**
 * The cells with one of them replaced.
 *
 * @param cells - The current six values.
 * @param index - Which cell to replace.
 * @param value - What to put in it.
 * @returns A new array; the input is never mutated.
 */
const withCell = (cells: readonly string[], index: number, value: string): readonly string[] =>
  cells.map((held, at) => (at === index ? value : held))

/**
 * Which cell the reader should be left in after a paste.
 *
 * Derived from the RESULT rather than from the paste - "the cell after the
 * last one that got a digit" needs no copy of `distributePaste`'s rule about
 * where a full code and a fragment each start from.
 *
 * @param cells - The cells as `distributePaste` returned them.
 * @returns The 0-based index of the cell to focus, never past the last one.
 */
const landingCell = (cells: readonly string[]): number => {
  const lastFilled = cells.reduce((last, value, index) => (value === '' ? last : index), -1)
  return Math.min(cells.length - 1, lastFilled + 1)
}

/**
 * Renders the one-time-code step.
 *
 * @param props - See {@link CodeStepProps}: where the code went, when it was
 *   issued, how many guesses the server has already spent, and anything the
 *   endpoint that redirected here wants said.
 * @returns The pane, as two real `POST` forms.
 * @example
 * <CodeStep maskedAddress={maskedTo} issuedAt={issuedAt} attemptsSpent={0} notice={null} />
 */
export const CodeStep = ({ maskedAddress, issuedAt, attemptsSpent, notice }: CodeStepProps): React.JSX.Element => {
  const [cells, setCells] = useState<readonly string[]>(() => Array.from({ length: CELL_COUNT }, () => ''))
  const [message, setMessage] = useState<string | null>(() => notice ?? wrongCodeMessage(attemptsSpent))
  // THE SHAKE STAYS KEYED ON THE SPENT COUNT, and that is not an oversight.
  // `SCREENS.md` §3.2 ties it to one event — "Wrong code: clear the cells,
  // refocus cell 1, decrement attempts, and shake the shell" — and neither
  // answer a {@link CodeStepProps.notice} carries decrements attempts. Shaking
  // for a resend that sent nothing would say a code had been rejected.
  const [shaking, setShaking] = useState(() => attemptsSpent > 0)
  // Both countdowns start from the instant the code was issued, so the FIRST
  // render - the server's, and the browser's matching one - is the whole
  // window, with no clock read in it at all. Reading `Date.now()` here would
  // make the server's HTML and the browser's first render disagree by however
  // long the document took to arrive, which is a hydration mismatch on a
  // screen whose whole content is above the fold. The effect below corrects it
  // on mount, before a reader can see the difference.
  const [now, setNow] = useState(issuedAt)

  useEffect(() => {
    setNow(Date.now())
    const ticker = window.setInterval(() => {
      setNow(Date.now())
    }, 1_000)
    return () => {
      window.clearInterval(ticker)
    }
  }, [])

  useEffect(() => {
    if (!shaking) return undefined
    const settle = window.setTimeout(() => {
      setShaking(false)
    }, SHAKE_MS)
    return () => {
      window.clearTimeout(settle)
    }
  }, [shaking])

  const expiresIn = secondsRemaining({ startedAt: issuedAt, now, windowMs: EXPIRY_MS })
  const resendIn = secondsRemaining({ startedAt: issuedAt, now, windowMs: RESEND_COOLDOWN_MS })

  // Held rather than looked up: a `document.querySelector` would find the
  // first pane on the page, and a test that renders two would move focus in
  // the wrong one.
  const cellRefs = useRef<(HTMLInputElement | null)[]>([])

  const focusCell = (index: number): void => {
    cellRefs.current[index]?.focus()
  }

  // Typing is how a reader answers the message, so the message goes as soon as
  // they do. Guarded on there being one, so an ordinary keystroke on a clean
  // pane costs no state update and no re-render.
  const clearMessage = (): void => {
    if (message !== null) setMessage(null)
  }

  const refuse = (said: string): void => {
    setMessage(said)
    setShaking(true)
  }

  /**
   * Puts a run of digits across the cells and leaves the reader after them.
   *
   * Shared by the paste handler and by {@link takeDigit}, because a browser
   * has TWO ways of putting a whole code into one cell and only one of them is
   * a paste: an OTP autofill sets the value and fires `input`, which arrives
   * as an ordinary change. Both end up here, so neither can drift from the
   * other.
   */
  const spreadDigits = (index: number, raw: string): void => {
    const spread = distributePaste(raw, index, CELL_COUNT)
    // Nothing usable in it at all - a stray Ctrl+V, a copied sentence.
    // `distributePaste` answers six empty cells for that, which would wipe a
    // code the reader had already typed.
    if (spread.every((value) => value === '')) return

    setCells(spread)
    clearMessage()
    focusCell(landingCell(spread))
  }

  const takeDigit = (index: number, typed: string): void => {
    const digits = typed.replace(/\D/g, '')

    // MORE THAN ONE DIGIT IN ONE CELL IS NOT TYPING. `maxLength="1"` stops a
    // reader ever producing it, so what produces it is an autofill writing the
    // whole code into the first cell and firing `input` - the path an iOS or
    // Chrome one-time-code suggestion takes, which never raises a `paste`
    // event and so never reaches the handler below. Spread it exactly as a
    // paste is spread; the prototype's own `setCell` makes the same split.
    if (digits.length > 1) {
      spreadDigits(index, typed)
      return
    }

    setCells(withCell(cells, index, digits))
    clearMessage()
    if (digits !== '') focusCell(nextCell('digit', index, CELL_COUNT, { cellIsEmpty: false }))
  }

  const pressKey = (index: number, held: string, event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Backspace') {
      // Prevented so the browser does not also clear the cell: `nextCell`'s
      // contract is that the CALLER clears a filled cell, and a native
      // backspace on top of that would clear this cell and move on.
      event.preventDefault()
      if (held !== '') setCells(withCell(cells, index, ''))
      focusCell(nextCell('backspace', index, CELL_COUNT, { cellIsEmpty: held === '' }))
      return
    }

    // Prevented so the caret does not move inside a one-character cell instead
    // of the focus moving between cells.
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      focusCell(nextCell('left', index, CELL_COUNT, { cellIsEmpty: held === '' }))
      return
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault()
      focusCell(nextCell('right', index, CELL_COUNT, { cellIsEmpty: held === '' }))
    }
    // Every other key is the browser's: Enter submits the form, Tab leaves it.
  }

  const spreadPaste = (index: number, event: React.ClipboardEvent<HTMLInputElement>): void => {
    // Prevented first and unconditionally: whatever the clipboard held, one
    // character of it landing in this cell is never what the reader meant.
    event.preventDefault()
    spreadDigits(index, event.clipboardData.getData('text'))
  }

  const checkBeforeSending = (event: React.SyntheticEvent<HTMLFormElement>): void => {
    if (cells.join('').length < CELL_COUNT) {
      refuse(INCOMPLETE_CODE_MESSAGE)
      event.preventDefault()
      return
    }
    if (expiresIn === 0) {
      refuse(EXPIRED_CODE_MESSAGE)
      event.preventDefault()
      return
    }
    // Nothing to say, so the event is left alone and the browser posts the
    // form - which is what makes this pane work with no JavaScript at all.
  }

  return (
    <div data-code-step-pane data-code-step-shaking={shaking ? 'true' : 'false'}>
      <a className={styles.backLink} href={PASSWORD_STEP_PATH}>
        ← Back to password
      </a>

      <p className={styles.eyebrow}>Second step</p>
      <h1 className={[styles.title, styles.titleCompact].join(' ')}>Check your email</h1>
      <p className={styles.lede}>
        A six-digit code went to{' '}
        <span data-code-step-address className={styles.ledeAddress}>
          {maskedAddress}
        </span>
        . It expires in <span data-code-countdown>{formatCountdown(expiresIn)}</span>.
      </p>

      <hr className={[styles.rule, styles.ruleAboveFields].join(' ')} />

      <form className={styles.paneForm} method="post" action={CODE_STEP_ENDPOINT} onSubmit={checkBeforeSending}>
        <p className={[styles.label, styles.labelAboveCells].join(' ')} id={CELLS_LABEL_ID}>
          The code
        </p>

        <div
          className={styles.cells}
          role="group"
          aria-labelledby={CELLS_LABEL_ID}
          aria-describedby={message === null ? undefined : ERROR_ID}
        >
          {cells.map((held, index) => (
            <input
              // The index IS the identity here: these six cells are a fixed
              // row of positions, not rows of data that can be sorted or
              // filtered (CLAUDE.md §7 addresses the latter).
              key={`code-cell-${String(index)}`}
              data-code-cell={index}
              ref={(element) => {
                cellRefs.current[index] = element
              }}
              className={[styles.cell, held === '' ? '' : styles.cellFilled].join(' ').trim()}
              type="text"
              // One name for all six, so a reader with no JavaScript still
              // posts the whole code: the handler reads `getAll('code')` and
              // joins it in document order.
              name="code"
              value={held}
              maxLength={1}
              inputMode="numeric"
              // Beyond SCREENS.md, which names no autofill: on iOS and in
              // Chrome this is what offers the code from the message it
              // arrived in, and it costs a reader six manual keystrokes if it
              // is absent. It takes a path `onPaste` never sees - the browser
              // writes the value and fires `input` - which is why
              // `takeDigit` spreads a multi-digit value rather than trusting
              // that only a paste can produce one. THE GAP, STATED: no
              // browser automation API can trigger a real OTP autofill, so
              // `e2e/codeStep.spec.ts` drives the value-and-`input` pair
              // autofill produces rather than the suggestion itself. What is
              // proven is the handler path; what is not is the browser's own
              // decision to offer the code.
              autoComplete={index === 0 ? 'one-time-code' : 'off'}
              // SCREENS.md §3.2: the reader arrives here to type a code and
              // there is nothing else on the pane to do first.
              autoFocus={index === 0}
              aria-label={`Digit ${String(index + 1)} of ${String(CELL_COUNT)}`}
              onChange={(event) => {
                takeDigit(index, event.target.value)
              }}
              onKeyDown={(event) => {
                pressKey(index, held, event)
              }}
              onPaste={(event) => {
                spreadPaste(index, event)
              }}
              onFocus={(event) => {
                event.currentTarget.select()
              }}
            />
          ))}
        </div>

        {message !== null && (
          <div className={styles.error} id={ERROR_ID} role="alert">
            <span aria-hidden="true" className={styles.errorMark} />
            <p className={styles.errorText}>{message}</p>
          </div>
        )}

        <button data-code-verify className={[styles.submit, styles.submitSpaced].join(' ')} type="submit">
          Verify and sign in
        </button>
      </form>

      <div className={styles.resendRow}>
        <form className={styles.resendForm} method="post" action={RESEND_ENDPOINT}>
          <button data-code-resend className={styles.resend} type="submit" disabled={resendIn > 0}>
            {resendIn > 0 ? `Send again in ${String(resendIn)}s` : 'Send a new code'}
          </button>
        </form>
        <p data-code-attempts className={styles.attempts}>
          {`${String(attemptsSpent)} of ${String(MAX_ATTEMPTS)} tried`}
        </p>
      </div>

      {/* THE PANE ENDS HERE, and the prototype's does not. It carries one more
       * rule and the line "Turn this step off under Account -> Getting in, if
       * you would rather sign in with a password alone." SCREENS.md §3.2 ends
       * at the resend and the counter, and puts a footer line on §3.1's
       * password step instead - where it is implemented, mark and all. That
       * sentence is also `SECURITY.md`'s second prototype hole in prose: the
       * prototype could honour it instantly because the flag was a
       * `localStorage` key, and here it is `users.otpRequired`, changeable
       * only from an Account screen Phase 4 builds. Recorded in
       * docs/deviations.md §35 rather than left to look like an oversight. */}
    </div>
  )
}
