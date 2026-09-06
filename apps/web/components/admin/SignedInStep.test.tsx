/**
 * SignedInStep.test.tsx — what SCREENS.md §3.4 prints, and where its three
 * controls go.
 *
 * THE MARK IS ASSERTED TO EXIST BEFORE ANYTHING IS SAID ABOUT IT. §3.4's "62px
 * ringed circle holding a 20px `#2f6b68` square" is decoration and carries no
 * text, so nothing else in this file would notice if it stopped being
 * rendered - and its SIZE is a stylesheet fact no jsdom test can read, since
 * jsdom performs no layout. What is asserted here is that both halves are in
 * the document and hidden from the accessibility tree; the pixels are
 * `e2e/reset.spec.ts`'s, measured in a real engine.
 * Depends on: react, react-dom/client, vitest (jsdom), ./SignedInStep.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { ADMIN_PANEL_PATH, DIARY_PATH, SIGNED_IN_STATUS, SIGN_OUT_ENDPOINT, SignedInStep } from './SignedInStep'

const roots: Root[] = []

/**
 * Renders the pane and hands back the host element.
 * @returns The host element the pane was rendered into.
 */
const renderStep = (): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(<SignedInStep />)
  })
  return host
}

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount()
  })
  document.body.replaceChildren()
})

describe('SignedInStep', () => {
  it('titles the screen as its only level-one heading', () => {
    const host = renderStep()

    expect(host.querySelectorAll('h1')).toHaveLength(1)
    expect(host.querySelector('h1')?.textContent).toBe('The back room is open')
  })

  it('prints the "Signed in" eyebrow above it', () => {
    const host = renderStep()

    expect(host.textContent).toContain('Signed in')
  })

  it('prints the status line', () => {
    const host = renderStep()

    expect(SIGNED_IN_STATUS).not.toBe('')
    expect(host.textContent).toContain(SIGNED_IN_STATUS)
  })

  it('draws the ringed circle and the square inside it, out of the accessibility tree', () => {
    const host = renderStep()

    const ring = host.querySelector('[data-signed-in-mark]')
    expect(ring).not.toBeNull()
    expect(ring?.getAttribute('aria-hidden')).toBe('true')
    expect(ring?.childElementCount).toBe(1)
  })

  it('leads to the admin panel with the primary action', () => {
    const host = renderStep()

    const enter = [...host.querySelectorAll('a')].find((link) => link.textContent === 'Open the admin panel')
    expect(enter?.getAttribute('href')).toBe(ADMIN_PANEL_PATH)
  })

  it('leads to the diary with the secondary action', () => {
    const host = renderStep()

    const diary = [...host.querySelectorAll('a')].find((link) => link.textContent === 'View the diary instead')
    expect(diary?.getAttribute('href')).toBe(DIARY_PATH)
  })

  it('opens the diary at its first page rather than at a root that is not a route', () => {
    // `/` is not mounted - the diary's own entry is `/p/1` - so a link to it
    // would be the 404 this screen is drawn to avoid.
    expect(DIARY_PATH).toBe('/p/1')
  })

  it('signs out with a real POST rather than a link', () => {
    // A link would sign a reader out on any prefetch or crawl of this page,
    // and could be triggered by anything that can make them follow a URL.
    const host = renderStep()

    const signOut = host.querySelector('button[type="submit"]')
    expect(signOut?.textContent).toBe('Sign out and start again')
    expect(signOut?.closest('form')?.getAttribute('method')).toBe('post')
    expect(signOut?.closest('form')?.getAttribute('action')).toBe(SIGN_OUT_ENDPOINT)
  })

  it('offers exactly the three controls §3.4 names, and nothing to fill in', () => {
    const host = renderStep()

    expect(host.querySelectorAll('a')).toHaveLength(2)
    expect(host.querySelectorAll('button')).toHaveLength(1)
    expect(host.querySelectorAll('input')).toHaveLength(0)
  })
})
