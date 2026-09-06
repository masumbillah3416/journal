/**
 * NewPasswordStep.test.tsx — the screen the mailed link lands on: the form,
 * the password it refuses to post, and the two states where the link or the
 * password has already been refused.
 *
 * WHY THIS FILE ASSERTS THE TOKEN TRAVELS IN THE BODY. The link's token is the
 * whole authorisation for this screen, and the form posts to a single fixed
 * address that carries none of it - so a token that failed to reach the
 * request would leave every reset silently refused with a perfectly good link.
 * The field is asserted to exist, to be hidden, and to hold exactly what the
 * route was given.
 *
 * EVERY CASE ABOUT CONTENT ALSO ASSERTS THE CONTENT EXISTS, for the reason
 * `ResetStep.test.tsx` gives: a pane that rendered nothing passes any
 * assertion of the form "it does not print X".
 * Depends on: react, react-dom/client, vitest (jsdom), ./NewPasswordStep.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import type { NewPasswordView } from '@travel-diary/domain/auth/resetScreen'
import { NewPasswordStep, SET_PASSWORD_ENDPOINT } from './NewPasswordStep'

/** A token of the shape the mailed link carries. */
const TOKEN = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef'

const roots: Root[] = []

/**
 * Renders the pane and hands back the host element.
 * @param view - Which state the route put the screen in.
 * @returns The host element the pane was rendered into.
 */
const renderStep = (view: NewPasswordView = 'form'): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(<NewPasswordStep token={TOKEN} view={view} />)
  })
  return host
}

/** The pane's own form. */
const formIn = (host: HTMLElement): HTMLFormElement => {
  const form = host.querySelector('form')
  if (form === null) throw new Error('the pane rendered no form')
  return form
}

/** Types `value` into the password field the way a reader would. */
const typePassword = (host: HTMLElement, value: string): void => {
  const field = host.querySelector<HTMLInputElement>('input[name="password"]')
  if (field === null) throw new Error('the pane rendered no password field')
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

describe('NewPasswordStep, with a link that still works', () => {
  it('titles the screen as its only level-one heading', () => {
    const host = renderStep()

    expect(host.querySelectorAll('h1')).toHaveLength(1)
    expect(host.querySelector('h1')?.textContent).toBe('Choose a new password')
  })

  it('carries the token the link named, in the body rather than in the address', () => {
    const host = renderStep()

    const carried = host.querySelector<HTMLInputElement>('input[name="token"]')
    expect(carried).not.toBeNull()
    expect(carried?.type).toBe('hidden')
    expect(carried?.value).toBe(TOKEN)
    expect(formIn(host).getAttribute('action')).toBe(SET_PASSWORD_ENDPOINT)
    expect(SET_PASSWORD_ENDPOINT).not.toContain(TOKEN)
  })

  it('posts rather than gets, so the password never reaches a URL', () => {
    const host = renderStep()

    expect(formIn(host).getAttribute('method')).toBe('post')
  })

  it('offers one labelled password field, hidden until the reader asks for it', () => {
    const host = renderStep()

    const field = host.querySelector<HTMLInputElement>('input[name="password"]')
    expect(field).not.toBeNull()
    expect(field?.getAttribute('type')).toBe('password')
    expect(host.querySelector(`label[for="${field?.id ?? ''}"]`)?.textContent).toBe('New password')
  })

  it('shows the password when the reader asks, and hides it again', () => {
    const host = renderStep()
    const reveal = host.querySelector<HTMLButtonElement>('button[type="button"]')
    expect(reveal).not.toBeNull()

    act(() => {
      reveal?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(host.querySelector('input[name="password"]')?.getAttribute('type')).toBe('text')

    act(() => {
      host
        .querySelector<HTMLButtonElement>('button[type="button"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(host.querySelector('input[name="password"]')?.getAttribute('type')).toBe('password')
  })

  it('labels the button "Set the new password"', () => {
    const host = renderStep()

    expect(host.querySelector('button[type="submit"]')?.textContent).toBe('Set the new password')
  })

  it('sends a password the reader has actually typed', () => {
    const host = renderStep()
    typePassword(host, 'a-new-password-entirely')

    expect(submit(host)).toBe(true)
  })

  it('refuses an empty password rather than posting nothing', () => {
    const host = renderStep()

    expect(submit(host)).toBe(false)
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('Choose a new password to carry on.')
  })

  it('marks the field it is complaining about, and points the message at it', () => {
    const host = renderStep()
    submit(host)

    const field = host.querySelector('input[name="password"]')
    const alert = host.querySelector('[role="alert"]')
    expect(alert?.id).not.toBe('')
    expect(field?.getAttribute('aria-invalid')).toBe('true')
    expect(field?.getAttribute('aria-describedby')).toBe(alert?.id)
  })

  it('takes the message away as soon as the reader answers it', () => {
    const host = renderStep()
    submit(host)
    expect(host.querySelector('[role="alert"]')).not.toBeNull()

    typePassword(host, 'a-new-password-entirely')

    expect(host.querySelector('[role="alert"]')).toBeNull()
  })

  it('says nothing is wrong before the reader has done anything', () => {
    const host = renderStep()

    expect(host.querySelector('[role="alert"]')).toBeNull()
  })
})

describe('NewPasswordStep, when the server refused the password', () => {
  it('draws the form again, with the server’s reason above the button', () => {
    const host = renderStep('rejected')

    expect(host.querySelector('input[name="password"]')).not.toBeNull()
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('That password was not accepted. Try a longer one.')
  })

  it('keeps the token, so the second attempt spends the same link', () => {
    const host = renderStep('rejected')

    expect(host.querySelector<HTMLInputElement>('input[name="token"]')?.value).toBe(TOKEN)
  })
})

describe('NewPasswordStep, when the link is spent', () => {
  it('titles the expired state and draws no form to fill in', () => {
    const host = renderStep('expired')

    expect(host.querySelector('h1')?.textContent).toBe('That link has expired')
    expect(host.querySelector('form')).toBeNull()
    expect(host.querySelectorAll('input')).toHaveLength(0)
  })

  it('says what expired, in the words the link itself promised', () => {
    const host = renderStep('expired')

    expect(host.textContent).toContain('The link works once and lasts an hour.')
  })

  it('offers a way to ask for another one', () => {
    const host = renderStep('expired')

    const again = [...host.querySelectorAll('a')].find((link) => link.textContent === 'Send yourself another')
    expect(again?.getAttribute('href')).toBe('/admin/reset')
  })

  it('never prints the token it was given, on a screen about a spent link', () => {
    const host = renderStep('expired')

    expect(host.innerHTML).not.toContain(TOKEN)
  })
})

describe('NewPasswordStep, in every state', () => {
  it('offers the way back to the password screen', () => {
    for (const view of ['form', 'rejected', 'expired'] as const) {
      const host = renderStep(view)

      const back = [...host.querySelectorAll('a')].find((link) => link.textContent.includes('Back to sign in'))
      expect(back?.getAttribute('href')).toBe('/admin/sign-in')
    }
  })

  it('never prints the token where a reader or a screen reader would see it', () => {
    for (const view of ['form', 'rejected', 'expired'] as const) {
      const host = renderStep(view)

      expect(host.textContent).not.toContain(TOKEN)
    }
  })
})
