/**
 * CodeStep.test.tsx — what the one-time-code pane prints, how its six cells
 * answer a keyboard, and where its two countdowns and its attempts counter
 * get their numbers from.
 *
 * WHAT THIS FILE CANNOT PROVE, STATED SO NOBODY READS IT AS TOTAL. Three of
 * this screen's mechanisms are invisible to jsdom, which performs no layout,
 * loads no stylesheet and dispatches no trusted clipboard event, and all
 * three are asserted in a real browser by `e2e/codeStep.spec.ts` instead:
 *   1. THE CELL WIDTHS at 390px. `SCREENS.md` §3's narrow pane padding is
 *      REQUIRED - at `40px 42px` in a 342px shell the cells collapse - and
 *      only a browser that has laid the row out can say how wide a cell is.
 *   2. THE PASTE PATH. `maxLength="1"` truncates a pasted string to one
 *      character before `change` fires, and that truncation is the browser's,
 *      not React's. The case below dispatches a `paste` event, which proves
 *      the handler distributes the digits; it does NOT prove a reader pasting
 *      a code out of their email gets six digits, because jsdom performs no
 *      default paste action for the handler to have to prevent. The browser
 *      case, driven through the real clipboard and Ctrl+V, does.
 *   3. THE SHAKE'S `prefers-reduced-motion` HONESTY. This file asserts the
 *      flag the stylesheet keys off; a media query is a property of the
 *      stylesheet, and asserting the flag says nothing about it.
 *
 * The copy is asserted verbatim against `SCREENS.md` §3.2 and the handoff's
 * own login prototype (`Travel Diary Login.dc.html`), which is where the two
 * pre-submit refusals and the wrong-code messages come from.
 * Depends on: react, react-dom/client, vitest (jsdom),
 * @travel-diary/domain/auth/otpChallenge, ./CodeStep.
 */
import { EXPIRY_MS, MAX_ATTEMPTS, RESEND_COOLDOWN_MS } from '@travel-diary/domain/auth/otpChallenge'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CELL_COUNT, CODE_STEP_ENDPOINT, CodeStep, PASSWORD_STEP_PATH, RESEND_ENDPOINT, SHAKE_MS } from './CodeStep'

/** A fixed instant to hang every clock-dependent case off. */
const ISSUED_AT = 1_700_000_000_000

const roots: Root[] = []

/** Overridable defaults, never a shared mutable object (CLAUDE.md §2.3). */
interface RenderOverrides {
  readonly maskedAddress?: string
  readonly issuedAt?: number
  readonly attemptsSpent?: number
}

/**
 * Renders the pane and hands back the host element.
 * @param overrides - What to change about the default challenge.
 * @returns The host element the pane was rendered into.
 */
const renderStep = (overrides: RenderOverrides = {}): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(
      <CodeStep
        maskedAddress={overrides.maskedAddress ?? 'he•••@wanderings.travel'}
        issuedAt={overrides.issuedAt ?? ISSUED_AT}
        attemptsSpent={overrides.attemptsSpent ?? 0}
      />,
    )
  })
  return host
}

/** The six cells, in the order they are drawn. */
const cellsIn = (host: HTMLElement): readonly HTMLInputElement[] => [
  ...host.querySelectorAll<HTMLInputElement>('[data-code-cell]'),
]

/** One cell, by its 0-based index. */
const cellAt = (host: HTMLElement, index: number): HTMLInputElement => {
  const cell = cellsIn(host)[index]
  if (cell === undefined) throw new Error(`the pane rendered no cell ${String(index)}`)
  return cell
}

/**
 * The browser's own `value` setter, before React replaced it on the node.
 *
 * A controlled `<input>` carries React's value tracker, and assigning
 * `cell.value` goes through React's own setter, which updates that tracker -
 * so React then sees no change and never calls `onChange`. Writing through
 * the prototype's setter leaves the tracker holding the previous value, which
 * is what a real keystroke does and what makes the handler run.
 */
// eslint-disable-next-line @typescript-eslint/unbound-method -- capturing the prototype's setter is the point: it is re-invoked below with `.call(cell, ...)`, which is the receiver the rule exists to protect.
const setInputValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set

/** Types one character into a cell the way a reader would. */
const typeInto = (cell: HTMLInputElement, value: string): void => {
  if (setInputValue === undefined) throw new Error('this environment has no HTMLInputElement value setter')
  act(() => {
    cell.focus()
    setInputValue.call(cell, value)
    cell.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

/** Presses a key on a cell, and reports whether the pane left it to the browser. */
const press = (cell: HTMLInputElement, key: string): boolean => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  act(() => {
    cell.focus()
    cell.dispatchEvent(event)
  })
  return !event.defaultPrevented
}

/**
 * Pastes text onto a cell.
 *
 * jsdom implements neither `DataTransfer` nor `ClipboardEvent`, so the event
 * is a plain `paste` event carrying a `clipboardData` stand-in. That is a
 * BROWSER API standing in for itself, never one of our own modules mocked
 * (CLAUDE.md §2.3) - and it is exactly why this file cannot settle the paste
 * path on its own: a stand-in has no default action for the handler to have to
 * prevent, which is the half `e2e/codeStep.spec.ts` proves with a real
 * clipboard.
 *
 * @param cell - The cell that had focus.
 * @param text - What the clipboard held.
 * @returns `true` when the browser's own paste would still have run.
 */
const paste = (cell: HTMLInputElement, text: string): boolean => {
  const event = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', { value: { getData: (): string => text } })
  act(() => {
    cell.focus()
    cell.dispatchEvent(event)
  })
  return !event.defaultPrevented
}

/** Submits the pane and reports whether the browser would have posted it. */
const submit = (host: HTMLElement): boolean => {
  const form = host.querySelector('form')
  if (form === null) throw new Error('the pane rendered no form')
  const event = new Event('submit', { bubbles: true, cancelable: true })
  act(() => {
    form.dispatchEvent(event)
  })
  return !event.defaultPrevented
}

/** What the pane is saying, if anything. */
const alertIn = (host: HTMLElement): string => host.querySelector('[role="alert"]')?.textContent ?? ''

/** The pane's own root element, which carries the shake flag. */
const paneIn = (host: HTMLElement): Element => {
  const pane = host.querySelector('[data-code-step-pane]')
  if (pane === null) throw new Error('the pane did not render')
  return pane
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(ISSUED_AT)
})

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount()
  })
  document.body.replaceChildren()
  vi.useRealTimers()
})

describe('CodeStep', () => {
  it('titles the pane “Check your email” as its only level-one heading', () => {
    const host = renderStep()

    expect(host.querySelectorAll('h1')).toHaveLength(1)
    expect(host.querySelector('h1')?.textContent).toBe('Check your email')
  })

  it('calls itself the second step', () => {
    expect(renderStep().textContent).toContain('Second step')
  })

  it('offers the way back to the password step', () => {
    const back = renderStep().querySelector('a')

    expect(back?.getAttribute('href')).toBe(PASSWORD_STEP_PATH)
    expect(back?.textContent).toBe('← Back to password')
  })

  it('names the masked address the code went to, and nothing fuller', () => {
    const host = renderStep({ maskedAddress: 'he•••@wanderings.travel' })
    const address = host.querySelector('[data-code-step-address]')

    expect(address).not.toBeNull()
    expect(address?.textContent).toBe('he•••@wanderings.travel')
    expect(host.textContent).toContain('A six-digit code went to he•••@wanderings.travel. It expires in 5:00.')
  })

  it('prints the whole expiry window at the instant the code was issued', () => {
    const countdown = renderStep().querySelector('[data-code-countdown]')

    expect(countdown).not.toBeNull()
    // Derived from EXPIRY_MS, and pinned to the literal the design prints, so
    // a countdown that silently stopped following the constant fails here.
    expect(countdown?.textContent).toBe('5:00')
    expect(EXPIRY_MS).toBe(300_000)
  })

  it('counts the expiry down as the clock moves', () => {
    const host = renderStep()

    act(() => {
      // Advancing the fake timers moves the fake clock with them, so the
      // interval's own `Date.now()` reads 61 seconds later. Setting the system
      // time as well would move it twice.
      vi.advanceTimersByTime(61_000)
    })

    expect(host.querySelector('[data-code-countdown]')?.textContent).toBe('3:59')
  })

  it('draws six cells, which is how many digits the code has', () => {
    expect(cellsIn(renderStep())).toHaveLength(CELL_COUNT)
    expect(CELL_COUNT).toBe(6)
  })

  it('takes one character per cell, from a numeric keypad, under one repeated field name', () => {
    const cell = cellAt(renderStep(), 0)

    // One name across all six: a reader with no JavaScript still posts the
    // whole code, as `formData.getAll('code').join('')`.
    expect(cell.getAttribute('name')).toBe('code')
    expect(cell.getAttribute('maxlength')).toBe('1')
    expect(cell.getAttribute('inputmode')).toBe('numeric')
  })

  it('names each cell for a screen reader, since six bare boxes have no label between them', () => {
    const named = cellsIn(renderStep()).map((cell) => cell.getAttribute('aria-label'))

    expect(named).toEqual([
      'Digit 1 of 6',
      'Digit 2 of 6',
      'Digit 3 of 6',
      'Digit 4 of 6',
      'Digit 5 of 6',
      'Digit 6 of 6',
    ])
  })

  it('puts the reader in the first cell without being asked', () => {
    const host = renderStep()

    expect(document.activeElement).toBe(cellAt(host, 0))
  })

  it('rings a filled cell differently from an empty one', () => {
    const host = renderStep()
    typeInto(cellAt(host, 0), '4')

    expect(cellAt(host, 0).className).toContain('cellFilled')
    expect(cellAt(host, 1).className).not.toContain('cellFilled')
  })

  it('advances to the next cell when a digit is typed', () => {
    const host = renderStep()

    typeInto(cellAt(host, 0), '4')

    expect(cellAt(host, 0).value).toBe('4')
    expect(document.activeElement).toBe(cellAt(host, 1))
  })

  it('stays in the last cell when its digit is typed', () => {
    const host = renderStep()

    typeInto(cellAt(host, 5), '9')

    expect(document.activeElement).toBe(cellAt(host, 5))
  })

  it('ignores a character that is not a digit', () => {
    const host = renderStep()

    typeInto(cellAt(host, 0), 'x')

    expect(cellAt(host, 0).value).toBe('')
    expect(document.activeElement).toBe(cellAt(host, 0))
  })

  it('clears a filled cell in place on Backspace, so the reader can retype it', () => {
    const host = renderStep()
    // A cell in the MIDDLE of the row, not the first: at cell 0 "stays here"
    // and "retreats" are the same outcome, so the case would pass against an
    // implementation that always retreated.
    typeInto(cellAt(host, 2), '4')

    press(cellAt(host, 2), 'Backspace')

    expect(cellAt(host, 2).value).toBe('')
    expect(document.activeElement).toBe(cellAt(host, 2))
  })

  it('retreats on Backspace over a cell that is already empty', () => {
    const host = renderStep()

    press(cellAt(host, 3), 'Backspace')

    expect(document.activeElement).toBe(cellAt(host, 2))
  })

  it('does not retreat past the first cell', () => {
    const host = renderStep()

    press(cellAt(host, 0), 'Backspace')

    expect(document.activeElement).toBe(cellAt(host, 0))
  })

  it('moves left and right with the arrow keys', () => {
    const host = renderStep()

    press(cellAt(host, 2), 'ArrowRight')
    expect(document.activeElement).toBe(cellAt(host, 3))

    press(cellAt(host, 3), 'ArrowLeft')
    expect(document.activeElement).toBe(cellAt(host, 2))
  })

  it('does not move right past the last cell', () => {
    const host = renderStep()

    press(cellAt(host, 5), 'ArrowRight')

    expect(document.activeElement).toBe(cellAt(host, 5))
  })

  it('leaves every other key to the browser, so Tab and Enter still do their jobs', () => {
    const host = renderStep()

    expect(press(cellAt(host, 0), 'Enter')).toBe(true)
    expect(press(cellAt(host, 0), 'Tab')).toBe(true)
  })

  it('selects what a cell already holds when the reader focuses it, so typing replaces it', () => {
    const host = renderStep()
    typeInto(cellAt(host, 0), '4')

    act(() => {
      // `focusin`, not `focus`: React attaches its `onFocus` to the bubbling
      // event, so a non-bubbling `focus` never reaches the handler.
      cellAt(host, 0).dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    })

    expect(cellAt(host, 0).selectionStart).toBe(0)
    expect(cellAt(host, 0).selectionEnd).toBe(1)
  })

  it('spreads a pasted six-digit code across all six cells', () => {
    const host = renderStep()

    // The browser's own paste is prevented: at maxLength="1" it would put one
    // digit in the focused cell and drop the other five.
    expect(paste(cellAt(host, 0), '123456')).toBe(false)

    expect(cellsIn(host).map((cell) => cell.value)).toEqual(['1', '2', '3', '4', '5', '6'])
    expect(document.activeElement).toBe(cellAt(host, 5))
  })

  it('spreads a pasted code from the first cell even when a later cell had focus', () => {
    const host = renderStep()

    paste(cellAt(host, 3), '123456')

    expect(cellsIn(host).map((cell) => cell.value)).toEqual(['1', '2', '3', '4', '5', '6'])
  })

  it('spreads a pasted fragment from the cell that had focus, and lands after it', () => {
    const host = renderStep()

    paste(cellAt(host, 3), '45')

    expect(cellsIn(host).map((cell) => cell.value)).toEqual(['', '', '', '4', '5', ''])
    expect(document.activeElement).toBe(cellAt(host, 5))
  })

  it('spreads a whole code written into one cell, which is what an autofill does', () => {
    const host = renderStep()

    // An OTP autofill sets the value and fires `input`; it raises no `paste`
    // event at all, so the paste handler never sees it. Without the
    // multi-digit branch in `takeDigit` this lands one digit and drops five,
    // which is the same defect the paste handler exists to stop, reached by
    // the one door that handler does not cover.
    typeInto(cellAt(host, 0), '123456')

    expect(cellsIn(host).map((cell) => cell.value)).toEqual(['1', '2', '3', '4', '5', '6'])
    expect(document.activeElement).toBe(cellAt(host, 5))
  })

  it('leaves the cells alone when the pasted text holds no digits', () => {
    const host = renderStep()
    typeInto(cellAt(host, 0), '7')

    paste(cellAt(host, 0), 'nothing here')

    expect(cellAt(host, 0).value).toBe('7')
  })

  it('refuses to send fewer than all six digits, and says so', () => {
    const host = renderStep()
    typeInto(cellAt(host, 0), '1')

    expect(submit(host)).toBe(false)
    expect(alertIn(host)).toContain('All six digits, then we can look.')
  })

  it('sends the code once all six cells are filled', () => {
    const host = renderStep()
    paste(cellAt(host, 0), '123456')

    expect(submit(host)).toBe(true)
    expect(host.querySelector('[role="alert"]')).toBeNull()
  })

  it('refuses to send a code whose window has closed, and says so', () => {
    const host = renderStep()
    paste(cellAt(host, 0), '123456')

    act(() => {
      vi.advanceTimersByTime(EXPIRY_MS)
    })

    expect(submit(host)).toBe(false)
    expect(alertIn(host)).toContain('That code has expired. Send yourself a new one.')
  })

  it('takes the message away as soon as the reader answers it', () => {
    const host = renderStep()
    typeInto(cellAt(host, 0), '1')
    submit(host)
    expect(host.querySelector('[role="alert"]')).not.toBeNull()

    typeInto(cellAt(host, 1), '2')

    expect(host.querySelector('[role="alert"]')).toBeNull()
  })

  it('posts to the endpoint the verification handler mounts at', () => {
    const form = renderStep().querySelector('form')

    expect(form?.getAttribute('method')).toBe('post')
    expect(form?.getAttribute('action')).toBe(CODE_STEP_ENDPOINT)
  })

  it('counts no attempts spent when none have been', () => {
    const counter = renderStep({ attemptsSpent: 0 }).querySelector('[data-code-attempts]')

    expect(counter).not.toBeNull()
    expect(counter?.textContent).toBe('0 of 3 tried')
  })

  it('counts the attempts the server has spent, out of the budget the domain sets', () => {
    const counter = renderStep({ attemptsSpent: 2 }).querySelector('[data-code-attempts]')

    expect(counter?.textContent).toBe(`2 of ${String(MAX_ATTEMPTS)} tried`)
    expect(counter?.textContent).toBe('2 of 3 tried')
  })

  it('says how many guesses are left after one wrong code', () => {
    expect(alertIn(renderStep({ attemptsSpent: 1 }))).toContain('That code is not right. 2 attempts left.')
  })

  it('says “attempt”, singular, when exactly one guess is left', () => {
    expect(alertIn(renderStep({ attemptsSpent: 2 }))).toContain('That code is not right. 1 attempt left.')
  })

  it('says the challenge is finished once every guess is spent', () => {
    expect(alertIn(renderStep({ attemptsSpent: MAX_ATTEMPTS }))).toContain(
      'Three wrong codes. Send a new one, or go back and try the password again.',
    )
  })

  it('spells the budget as a word in that message, and pins the budget it spells', () => {
    // BOTH halves, because either alone is a test that cannot fail for the
    // reason its name gives. The copy names the number in WORDS, and no
    // expression turns MAX_ATTEMPTS into "Three" - so the rendered word is
    // asserted here, and the constant it is meant to agree with is asserted
    // beside it. Raise the budget and this fails, rather than the screen
    // quietly saying "Three" about a budget of five.
    expect(alertIn(renderStep({ attemptsSpent: MAX_ATTEMPTS }))).toContain('Three wrong codes.')
    expect(MAX_ATTEMPTS).toBe(3)
  })

  it('says nothing at all when no guess has been spent', () => {
    const host = renderStep({ attemptsSpent: 0 })

    // The pane really did render, and really did draw the row the message
    // would sit under - without this, "there is no message" is trivially true
    // of a component that produced nothing at all.
    expect(paneIn(host)).not.toBeNull()
    expect(cellsIn(host)).toHaveLength(CELL_COUNT)
    expect(host.querySelector('[role="alert"]')).toBeNull()
  })

  it('shakes on arrival when the server has just refused a code', () => {
    expect(paneIn(renderStep({ attemptsSpent: 1 })).getAttribute('data-code-step-shaking')).toBe('true')
  })

  it('does not shake on an arrival with nothing wrong', () => {
    expect(paneIn(renderStep({ attemptsSpent: 0 })).getAttribute('data-code-step-shaking')).toBe('false')
  })

  it('shakes when it refuses to send what the reader typed', () => {
    const host = renderStep()
    typeInto(cellAt(host, 0), '1')

    submit(host)

    expect(paneIn(host).getAttribute('data-code-step-shaking')).toBe('true')
  })

  it('stops shaking once the shake has run, so the next refusal can shake again', () => {
    const host = renderStep({ attemptsSpent: 1 })

    act(() => {
      vi.advanceTimersByTime(SHAKE_MS)
    })

    expect(paneIn(host).getAttribute('data-code-step-shaking')).toBe('false')
  })

  it('holds the resend inert while the cooldown is still running, and says how long is left', () => {
    const resend = renderStep().querySelector<HTMLButtonElement>('[data-code-resend]')

    expect(resend).not.toBeNull()
    expect(resend?.disabled).toBe(true)
    expect(resend?.textContent).toBe('Send again in 30s')
    expect(RESEND_COOLDOWN_MS).toBe(30_000)
  })

  it('offers a new code once the cooldown has run out', () => {
    const host = renderStep()

    act(() => {
      vi.advanceTimersByTime(RESEND_COOLDOWN_MS)
    })

    const resend = host.querySelector<HTMLButtonElement>('[data-code-resend]')
    expect(resend?.disabled).toBe(false)
    expect(resend?.textContent).toBe('Send a new code')
  })

  it('sends a resend to its own endpoint rather than to the verification one', () => {
    const resend = renderStep().querySelector<HTMLButtonElement>('[data-code-resend]')

    // Its own `<form>`, so a resend never carries the code fields and never
    // runs this pane's "all six digits" check.
    expect(resend?.closest('form')?.getAttribute('action')).toBe(RESEND_ENDPOINT)
    expect(resend?.closest('form')?.getAttribute('method')).toBe('post')
    expect(RESEND_ENDPOINT).not.toBe(CODE_STEP_ENDPOINT)
  })

  it('offers the mask of no address at all until a challenge has been issued', () => {
    // What the route passes while Phase 2 Task 10 has yet to wire the pending
    // challenge: `maskEmail`'s own fallback, which echoes nothing.
    // The literal rather than the constant that used to hold it: the pane is
    // handed whatever the route read, and what a route with no live challenge
    // hands it is `readCodeScreen.ts`'s `NO_PENDING_ADDRESS`. What this case is
    // about is that the PANE prints a bullet run unchanged.
    expect(renderStep({ maskedAddress: '•••' }).textContent).toContain('A six-digit code went to •••.')
  })

  it('reads no browser storage at all while it renders', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem')

    const host = renderStep()

    // The pane really did render - without this, "nothing read storage" is
    // trivially true of a component that produced nothing.
    expect(host.querySelector('[data-code-step-pane]')).not.toBeNull()
    expect(getItem).not.toHaveBeenCalled()

    getItem.mockRestore()
  })
})
