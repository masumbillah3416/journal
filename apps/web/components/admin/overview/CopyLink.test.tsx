/**
 * CopyLink.test.tsx — SCREENS.md §2.1's "Copy link", and the three things it
 * can say.
 *
 * ALL THREE LABELS ARE EXERCISED, because a control that only ever reports
 * success is indistinguishable from one that never checks — the silent-failure
 * species `docs/deviations.md` §43 names, and the arm a fixture with one
 * outcome cannot see.
 *
 * THE ABSOLUTE ADDRESS IS ASSERTED AGAINST jsdom's OWN ORIGIN rather than
 * against a literal, so the case says "it resolved against the page" rather
 * than "it produced this string".
 * Depends on: react, react-dom/client, vitest (jsdom), ./CopyLink.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { COPY_DONE, COPY_FEEDBACK_MS, COPY_IDLE, COPY_REFUSED, CopyLink } from './CopyLink'

const roots: Root[] = []

/**
 * Renders the control and hands back its button.
 * @param href - The address it copies.
 * @returns The button.
 */
const renderControl = (href = '/p/1'): HTMLButtonElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(<CopyLink href={href} />)
  })
  const button = host.querySelector<HTMLButtonElement>('[data-copy-link]')
  if (button === null) throw new Error('the control drew no button')
  return button
}

/**
 * Installs a clipboard that answers however the case needs.
 * @param writeText - What `navigator.clipboard.writeText` does.
 */
const withClipboard = (writeText: (text: string) => Promise<void>): void => {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
}

/** Takes the clipboard away entirely, as a page with no secure context has. */
const withoutClipboard = (): void => {
  Reflect.deleteProperty(navigator, 'clipboard')
}

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount()
  })
  document.body.replaceChildren()
  withoutClipboard()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('CopyLink', () => {
  it('offers the control before anything has been pressed', () => {
    expect(renderControl().textContent).toBe(COPY_IDLE)
  })

  it('puts the address on the clipboard, resolved against the page the reader is on', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue()
    withClipboard(writeText)
    const button = renderControl('/p/1')

    await act(() => {
      button.click()
      // The clipboard promise settles on a microtask, so the act's own flush
      // has to include it — a resolved promise is what `act` drains.
      return Promise.resolve()
    })

    // `window.location.origin` rather than a literal: what is asserted is that
    // the control RESOLVED the relative path, not that it produced one string.
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/p/1`)
  })

  it('says it copied, so a copy that worked is distinguishable from one that did not', async () => {
    withClipboard(vi.fn<(text: string) => Promise<void>>().mockResolvedValue())
    const button = renderControl()

    await act(() => {
      button.click()
      // The clipboard promise settles on a microtask, so the act's own flush
      // has to include it — a resolved promise is what `act` drains.
      return Promise.resolve()
    })

    expect(button.textContent).toBe(COPY_DONE)
  })

  it('offers the control again once the confirmation has been read', async () => {
    vi.useFakeTimers()
    withClipboard(vi.fn<(text: string) => Promise<void>>().mockResolvedValue())
    const button = renderControl()

    await act(() => {
      button.click()
      // The clipboard promise settles on a microtask, so the act's own flush
      // has to include it — a resolved promise is what `act` drains.
      return Promise.resolve()
    })
    act(() => {
      vi.advanceTimersByTime(COPY_FEEDBACK_MS)
    })

    expect(button.textContent).toBe(COPY_IDLE)
  })

  it('says so when the browser refuses the write, rather than reporting a copy that never happened', async () => {
    withClipboard(vi.fn<(text: string) => Promise<void>>().mockRejectedValue(new Error('denied')))
    const button = renderControl()

    await act(() => {
      button.click()
      // The clipboard promise settles on a microtask, so the act's own flush
      // has to include it — a resolved promise is what `act` drains.
      return Promise.resolve()
    })

    expect(button.textContent).toBe(COPY_REFUSED)
  })

  it('says so when the page has no clipboard at all, rather than throwing on the press', async () => {
    // A page served without a secure context has no `clipboard` property —
    // which the DOM types say cannot happen, so this is the arm a type-led
    // implementation leaves out.
    withoutClipboard()
    const button = renderControl()

    await act(() => {
      button.click()
      // The clipboard promise settles on a microtask, so the act's own flush
      // has to include it — a resolved promise is what `act` drains.
      return Promise.resolve()
    })

    expect(button.textContent).toBe(COPY_REFUSED)
  })
})
