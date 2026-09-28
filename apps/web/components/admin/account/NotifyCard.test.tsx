/**
 * NotifyCard.test.tsx — SCREENS.md §2.11's "Tell me when": two toggles, each a
 * form of its own posting the value it is switching TO.
 * Depends on: react, react-dom/client, vitest (jsdom),
 * ../../../lib/admin/readAccountScreen, ./NotifyCard.
 */
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import type { AccountNotifications } from '../../../lib/admin/readAccountScreen'
import { NotifyCard } from './NotifyCard'

const roots: Root[] = []

/** A write that records nothing: the card is forms, and jsdom submits none. */
const noWrite = (): Promise<void> => Promise.resolve()

/**
 * Renders the card and hands back the host element.
 * @param notifications - The two columns' values.
 * @returns The host element.
 */
const renderCard = (notifications: AccountNotifications): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(<NotifyCard notifications={notifications} setNotification={noWrite} />)
  })
  return host
}

/**
 * The hidden fields one toggle's form would post.
 * @param host - The rendered card.
 * @param setting - Which toggle.
 * @returns The posted pair.
 */
const postedBy = (host: HTMLElement, setting: string): Record<string, string> => {
  const form = host.querySelector(`[data-setting="${setting}"]`)?.closest('form')
  return Object.fromEntries(
    [...(form?.querySelectorAll<HTMLInputElement>('input[type="hidden"]') ?? [])].map((input) => [
      input.name,
      input.value,
    ]),
  )
}

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount()
  })
  document.body.replaceChildren()
})

describe('NotifyCard', () => {
  it('draws §2.11’s two toggles, and the columns they write', () => {
    const host = renderCard({ onPublish: true, weekly: false })

    expect([...host.querySelectorAll('[data-setting]')].map((button) => button.getAttribute('data-setting'))).toEqual([
      'notifyOnPublish',
      'notifyWeekly',
    ])
  })

  it('draws each toggle in the state its column is in', () => {
    const host = renderCard({ onPublish: true, weekly: false })

    expect([...host.querySelectorAll('[data-setting]')].map((button) => button.getAttribute('aria-pressed'))).toEqual([
      'true',
      'false',
    ])
  })

  it('moves both toggles when both columns move, so neither is drawing a constant', () => {
    const host = renderCard({ onPublish: false, weekly: true })

    expect([...host.querySelectorAll('[data-setting]')].map((button) => button.getAttribute('aria-pressed'))).toEqual([
      'false',
      'true',
    ])
  })

  it('posts the value each toggle is switching TO, which is what lets a form turn a setting off', () => {
    // A checkbox that is off posts nothing at all, so a form built the obvious
    // way could only ever switch a setting ON. Both directions are asserted in
    // one case, because a card that posted the CURRENT value would be right
    // about one of them.
    const host = renderCard({ onPublish: true, weekly: false })

    expect([postedBy(host, 'notifyOnPublish'), postedBy(host, 'notifyWeekly')]).toEqual([
      { setting: 'notifyOnPublish', on: 'false' },
      { setting: 'notifyWeekly', on: 'true' },
    ])
  })

  it('gives each toggle a form of its own, so one press writes one column', () => {
    const host = renderCard({ onPublish: true, weekly: false })

    expect(host.querySelectorAll('form')).toHaveLength(2)
  })

  it('names each switch for a screen reader, since the control carries no text', () => {
    const host = renderCard({ onPublish: true, weekly: false })

    expect([...host.querySelectorAll('[data-setting]')].map((button) => button.getAttribute('aria-label'))).toEqual([
      'Turn off: A note when a publish finishes',
      'Turn on: Weekly reader summary',
    ])
  })

  it('gives every toggle a hint beneath it, which is what §2.11’s cards do', () => {
    const host = renderCard({ onPublish: true, weekly: false })

    expect([...host.querySelectorAll('[data-setting]')]).toHaveLength(2)
    expect(host.textContent).toContain('one email, to the sign-in address')
    expect(host.textContent).toContain('how many people opened the diary')
  })
})
