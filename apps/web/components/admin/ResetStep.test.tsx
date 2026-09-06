/**
 * ResetStep.test.tsx — what each of SCREENS.md §3.3's two states prints, and
 * what the pending one refuses to send.
 *
 * The copy is asserted verbatim against SCREENS.md §3.3 and the handoff's own
 * login prototype (`Travel Diary Login.dc.html`), which is where both titles,
 * both ledes, the confirmation sentence and the promise under the button come
 * from.
 *
 * EVERY CASE ABOUT CONTENT ALSO ASSERTS THE CONTENT EXISTS. "The pane printed
 * no address" and "the pane sent nothing" are both trivially true of a pane
 * that rendered nothing at all, which is this phase's most common defective
 * test shape - so the address, the button and the block each get an existence
 * assertion before anything is said about what is in them.
 * Depends on: react, react-dom/client, vitest (jsdom), ./ResetStep.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import type { ResetRequestView } from '@travel-diary/domain/auth/resetScreen'
import { RESET_REQUEST_ENDPOINT, ResetStep, SENT_CONFIRMATION_TAIL } from './ResetStep'

const roots: Root[] = []

/**
 * Renders the pane in one of its two states and hands back the host element.
 * @param request - Which state to draw.
 * @returns The host element the pane was rendered into.
 */
const renderStep = (request: ResetRequestView = { kind: 'pending' }): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(<ResetStep request={request} />)
  })
  return host
}

/** The pane's own form. */
const formIn = (host: HTMLElement): HTMLFormElement => {
  const form = host.querySelector('form')
  if (form === null) throw new Error('the pane rendered no form')
  return form
}

/** Types `value` into the email field the way a reader would. */
const typeAddress = (host: HTMLElement, value: string): void => {
  const field = host.querySelector<HTMLInputElement>('input[name="email"]')
  if (field === null) throw new Error('the pane rendered no email field')
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
})

describe('ResetStep, waiting to be asked', () => {
  it('titles the pending state as its only level-one heading', () => {
    const host = renderStep()

    expect(host.querySelectorAll('h1')).toHaveLength(1)
    expect(host.querySelector('h1')?.textContent).toBe('Send yourself a way back in')
  })

  it('prints the eyebrow, the lede and the promise SCREENS.md §3.3 asks for', () => {
    const host = renderStep()

    expect(host.textContent).toContain('Forgotten')
    expect(host.textContent).toContain(
      'Tell me the address you sign in with and I will send a link that lets you set a new password.',
    )
    expect(host.textContent).toContain('The link works once and lasts an hour.')
  })

  it('offers one labelled email field and nothing else to fill in', () => {
    const host = renderStep()

    const fields = host.querySelectorAll('input')
    expect(fields).toHaveLength(1)
    const field = fields[0]
    expect(field?.getAttribute('name')).toBe('email')
    expect(host.querySelector(`label[for="${field?.id ?? ''}"]`)?.textContent).toBe('Email')
  })

  it('posts to the reset endpoint rather than to the screen’s own address', () => {
    const host = renderStep()

    expect(formIn(host).getAttribute('action')).toBe(RESET_REQUEST_ENDPOINT)
    expect(formIn(host).getAttribute('method')).toBe('post')
  })

  it('labels the button "Send the link"', () => {
    const host = renderStep()

    expect(host.querySelector('button[type="submit"]')?.textContent).toBe('Send the link')
  })

  it('sends an address that looks like one', () => {
    const host = renderStep()
    typeAddress(host, 'hello@wanderings.travel')

    expect(submit(host)).toBe(true)
  })

  it('refuses a value with no @ in it, and says so where the reader is', () => {
    const host = renderStep()
    typeAddress(host, 'wanderings')

    expect(submit(host)).toBe(false)
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('That does not look like an email address.')
  })

  it('refuses an empty field rather than posting nothing', () => {
    const host = renderStep()

    expect(submit(host)).toBe(false)
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('That does not look like an email address.')
  })

  it('marks the field it is complaining about, and points the message at it', () => {
    const host = renderStep()
    typeAddress(host, 'wanderings')
    submit(host)

    const field = host.querySelector('input[name="email"]')
    const alert = host.querySelector('[role="alert"]')
    expect(alert?.id).not.toBe('')
    expect(field?.getAttribute('aria-invalid')).toBe('true')
    expect(field?.getAttribute('aria-describedby')).toBe(alert?.id)
  })

  it('takes the message away as soon as the reader answers it', () => {
    const host = renderStep()
    typeAddress(host, 'wanderings')
    submit(host)
    expect(host.querySelector('[role="alert"]')).not.toBeNull()

    typeAddress(host, 'hello@wanderings.travel')

    expect(host.querySelector('[role="alert"]')).toBeNull()
  })

  it('draws no confirmation block before anything has been sent', () => {
    const host = renderStep()

    expect(host.querySelector('[data-reset-sent]')).toBeNull()
  })
})

describe('ResetStep, once the link is on its way', () => {
  /** The state the screen is in after the endpoint has answered. */
  const sent: ResetRequestView = { kind: 'sent', maskedTo: 'he•••@wanderings.travel' }

  it('titles the sent state "Check your email"', () => {
    const host = renderStep(sent)

    expect(host.querySelectorAll('h1')).toHaveLength(1)
    expect(host.querySelector('h1')?.textContent).toBe('Check your email')
  })

  it('prints the lede the prototype gives the sent state', () => {
    const host = renderStep(sent)

    expect(host.textContent).toContain('A one-time link is on its way. Follow it and you can set a new password.')
  })

  it('names the masked address inside the confirmation block', () => {
    const host = renderStep(sent)

    const block = host.querySelector('[data-reset-sent]')
    expect(block).not.toBeNull()
    expect(block?.querySelector('[data-reset-sent-address]')?.textContent).toBe('he•••@wanderings.travel')
    expect(block?.textContent).toBe(`Sent. Check he•••@wanderings.travel${SENT_CONFIRMATION_TAIL}`)
  })

  it('prints only what it was given, never an address of its own', () => {
    const host = renderStep({ kind: 'sent', maskedTo: '•••' })

    expect(host.querySelector('[data-reset-sent-address]')?.textContent).toBe('•••')
    expect(host.textContent).not.toContain('@')
  })

  it('offers the way on and the way to try again, and no field to fill in', () => {
    const host = renderStep(sent)

    expect(host.querySelectorAll('input')).toHaveLength(0)
    const actions = [...host.querySelectorAll('a')].map((link) => link.textContent)
    expect(actions).toContain('Sign in with the new password')
    expect(actions).toContain('Send it again')
  })

  it('sends "Send it again" back to the form, which is where the address is typed', () => {
    const host = renderStep(sent)

    const again = [...host.querySelectorAll('a')].find((link) => link.textContent === 'Send it again')
    expect(again?.getAttribute('href')).toBe('/admin/reset')
  })

  it('draws no form at all, so there is nothing to submit twice by accident', () => {
    const host = renderStep(sent)

    expect(host.querySelector('form')).toBeNull()
  })
})

describe('ResetStep, in both states', () => {
  it('offers the way back to the password screen', () => {
    for (const request of [{ kind: 'pending' } as const, { kind: 'sent', maskedTo: '•••' } as const]) {
      const host = renderStep(request)

      const back = [...host.querySelectorAll('a')].find((link) => link.textContent.includes('Back to sign in'))
      expect(back?.getAttribute('href')).toBe('/admin/sign-in')
    }
  })
})
