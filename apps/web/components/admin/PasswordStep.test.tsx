/**
 * PasswordStep.test.tsx — what the password pane prints, what it refuses to
 * send, and where the footer line's answer comes from.
 *
 * THE FOOTER CASES ARE THE POINT OF THIS FILE. `SECURITY.md`'s second
 * prototype hole is a `localStorage` flag anybody could set to `0`; the fix
 * is a server-read `users.otpRequired`. Three things are asserted here and
 * none of them is enough alone: that the line EXISTS and says what SCREENS.md
 * §3.1 says it should in both states (an assertion about content with no
 * assertion that content exists is this phase's most common defective test),
 * that the pane reads no browser storage even when the prototype's own key is
 * planted in `localStorage` with the OPPOSITE answer in it, and that the mark
 * beside the line tracks the same value. What no jsdom test can prove is that
 * the DELIVERED page and its scripts contain no such read either - that is
 * `e2e/signIn.spec.ts`'s, against a real browser.
 *
 * The copy is asserted verbatim against SCREENS.md §3.1 and the handoff's own
 * login prototype (`Travel Diary Login.dc.html`), which is where the two
 * validation messages and both footer sentences come from.
 * Depends on: react, react-dom/client, vitest (jsdom), ./PasswordStep.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CODE_STEP_OFF_NOTICE, CODE_STEP_ON_NOTICE, PASSWORD_STEP_ENDPOINT, PasswordStep } from './PasswordStep'

const roots: Root[] = []

/**
 * Renders the pane and hands back the host element.
 * @param codeStepRequired - What the server said about the code step.
 * @returns The host element the pane was rendered into.
 */
const renderStep = (codeStepRequired = true): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(<PasswordStep codeStepRequired={codeStepRequired} />)
  })
  return host
}

/** The pane's own form. */
const formIn = (host: HTMLElement): HTMLFormElement => {
  const form = host.querySelector('form')
  if (form === null) throw new Error('the pane rendered no form')
  return form
}

/** Types `value` into the named field the way a reader would. */
const type = (host: HTMLElement, name: string, value: string): void => {
  const field = host.querySelector<HTMLInputElement>(`input[name="${name}"]`)
  if (field === null) throw new Error(`the pane rendered no ${name} field`)
  act(() => {
    field.value = value
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

/**
 * Submits the form and reports whether the browser would have posted it.
 * @param host - The rendered pane.
 * @returns `true` when the submit event was left alone, `false` when the pane
 *   cancelled it.
 */
const submit = (host: HTMLElement): boolean => {
  const event = new Event('submit', { bubbles: true, cancelable: true })
  act(() => {
    formIn(host).dispatchEvent(event)
  })
  return !event.defaultPrevented
}

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount()
  })
  document.body.replaceChildren()
  window.localStorage.clear()
})

describe('PasswordStep', () => {
  it('titles the screen as its only level-one heading', () => {
    const host = renderStep()

    expect(host.querySelectorAll('h1')).toHaveLength(1)
    expect(host.querySelector('h1')?.textContent).toBe('Welcome back')
  })

  it('says who the door is for, in the handoff’s own words', () => {
    expect(renderStep().textContent).toContain(
      'The diary itself is open to everyone. This door is only for editing it.',
    )
  })

  it('posts to the endpoint the route handler mounts at, so a reader without JavaScript can sign in', () => {
    const form = formIn(renderStep())

    expect(form.getAttribute('method')).toBe('post')
    expect(form.getAttribute('action')).toBe(PASSWORD_STEP_ENDPOINT)
  })

  it('carries the address, the password and the remember-me answer as named fields', () => {
    const host = renderStep()

    expect(host.querySelector('input[name="email"]')).not.toBeNull()
    expect(host.querySelector('input[name="password"]')).not.toBeNull()
    expect(host.querySelector('input[name="keepSignedIn"]')?.getAttribute('type')).toBe('checkbox')
  })

  it('keeps the reader signed in by default, as the handoff’s prototype does', () => {
    expect(renderStep().querySelector<HTMLInputElement>('input[name="keepSignedIn"]')?.checked).toBe(true)
  })

  it('hides the password until the reader asks to see it', () => {
    const host = renderStep()

    expect(host.querySelector('input[name="password"]')?.getAttribute('type')).toBe('password')
  })

  it('shows the password when the reader asks, and hides it again', () => {
    const host = renderStep()
    const toggle = host.querySelector<HTMLButtonElement>('button[type="button"]')

    act(() => toggle?.click())
    expect(host.querySelector('input[name="password"]')?.getAttribute('type')).toBe('text')
    expect(toggle?.textContent).toBe('Hide')

    act(() => toggle?.click())
    expect(host.querySelector('input[name="password"]')?.getAttribute('type')).toBe('password')
    expect(toggle?.textContent).toBe('Show')
  })

  it('offers a way to the reset screen', () => {
    expect(renderStep().querySelector('a')?.getAttribute('href')).toBe('/admin/reset')
  })

  it('sends the form when the address and the password are both filled in', () => {
    const host = renderStep()
    type(host, 'email', 'hello@wanderings.travel')
    type(host, 'password', 'a password')

    expect(submit(host)).toBe(true)
    expect(host.querySelector('[role="alert"]')).toBeNull()
  })

  it('refuses to send an address that is not one, and says so', () => {
    const host = renderStep()
    type(host, 'email', 'wanderings')
    type(host, 'password', 'a password')

    expect(submit(host)).toBe(false)
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('That does not look like an email address.')
  })

  it('refuses to send an empty password, and says so', () => {
    const host = renderStep()
    type(host, 'email', 'hello@wanderings.travel')

    expect(submit(host)).toBe(false)
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Enter your password to carry on.')
  })

  it('marks the field the message is about, so the message is not left floating', () => {
    const host = renderStep()
    type(host, 'email', 'wanderings')
    submit(host)

    expect(host.querySelector('input[name="email"]')?.getAttribute('aria-invalid')).toBe('true')
    expect(host.querySelector('input[name="password"]')?.getAttribute('aria-invalid')).toBe('false')
  })

  it('takes the message away as soon as the reader answers it', () => {
    const host = renderStep()
    type(host, 'email', 'wanderings')
    submit(host)
    expect(host.querySelector('[role="alert"]')).not.toBeNull()

    type(host, 'email', 'hello@wanderings.travel')

    expect(host.querySelector('[role="alert"]')).toBeNull()
  })

  it('states that the code step is on when the server said it is', () => {
    const footer = renderStep(true).querySelector('[data-code-step]')

    expect(footer).not.toBeNull()
    expect(footer?.textContent).toBe(CODE_STEP_ON_NOTICE)
    expect(footer?.textContent).toBe(
      'A one-time code is asked for after your password. Turn it off under Account → Getting in.',
    )
  })

  it('states that the code step is off when the server said it is', () => {
    const footer = renderStep(false).querySelector('[data-code-step]')

    expect(footer).not.toBeNull()
    expect(footer?.textContent).toBe(CODE_STEP_OFF_NOTICE)
    expect(footer?.textContent).toBe(
      'The one-time code step is switched off, so your password alone will let you in.',
    )
  })

  it('fills the 9px mark when the code step is on and rings it when it is off', () => {
    // The mark is the same element either way, so the two states are told
    // apart by their classes rather than by the mark's presence.
    const on = renderStep(true).querySelector('[data-code-step="on"] span[aria-hidden="true"]')
    const off = renderStep(false).querySelector('[data-code-step="off"] span[aria-hidden="true"]')

    expect(on?.className).toContain('footerMarkOn')
    expect(off?.className).toContain('footerMarkOff')
  })

  it('ignores the prototype’s localStorage flag entirely, even when it contradicts the server', () => {
    // The exact key SECURITY.md names, planted with the OPPOSITE answer to
    // the one the server gave. A pane that still read it would print the
    // "off" copy here - which is what the prototype did, and is the hole.
    window.localStorage.setItem('om-diary-otp', '0')

    const footer = renderStep(true).querySelector('[data-code-step]')

    expect(footer?.getAttribute('data-code-step')).toBe('on')
    expect(footer?.textContent).toBe(CODE_STEP_ON_NOTICE)
  })

  it('reads no browser storage at all while it renders', () => {
    // Asserted against the Storage prototype rather than against this
    // module's source: a grep of the file proves only that the read was not
    // typed there, not that nothing it renders performs one.
    const getItem = vi.spyOn(Storage.prototype, 'getItem')

    const host = renderStep(true)

    // The pane really did render - without this, "nothing read storage" is
    // trivially true of a component that produced nothing.
    expect(host.querySelector('[data-code-step]')).not.toBeNull()
    expect(getItem).not.toHaveBeenCalled()

    getItem.mockRestore()
  })
})
