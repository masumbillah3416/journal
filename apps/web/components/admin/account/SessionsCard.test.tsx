/**
 * SessionsCard.test.tsx — SCREENS.md §2.11's "Where you are signed in": a row
 * per live session, the current one marked, and two sign-out controls.
 *
 * EVERY FIXTURE HERE HOLDS TWO SESSIONS, and one case holds two where the
 * current one is not the first. Standing orders §14: a fixture holding ONE of
 * the thing a comparison distinguishes measures the renderer rather than the
 * datum, and "the current row" against "the first row" is exactly such a
 * comparison.
 * Depends on: react, react-dom/client, vitest (jsdom),
 * ../../../lib/admin/readAccountScreen, ./SessionsCard.
 */
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import type { AccountSession } from '../../../lib/admin/readAccountScreen'
import { SessionsCard } from './SessionsCard'

const roots: Root[] = []

/** A write that records nothing: the card is forms, and jsdom submits none. */
const noWrite = (): Promise<void> => Promise.resolve()

/** Two live sessions, the newest first, with the OLDER one current. */
const SESSIONS: readonly AccountSession[] = [
  { row: 412, device: 'Chrome on Windows', where: 'Reykjavik, Iceland · 3 Sep 2026', isCurrent: false },
  { row: 398, device: 'Safari on iPhone', where: 'Tokyo, Japan · 1 Sep 2026', isCurrent: true },
]

/**
 * Renders the card and hands back the host element.
 * @param sessions - The rows to draw.
 * @returns The host element.
 */
const renderCard = (sessions: readonly AccountSession[] = SESSIONS): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(<SessionsCard sessions={sessions} revokeOne={noWrite} signOutEverywhere={noWrite} />)
  })
  return host
}

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount()
  })
  document.body.replaceChildren()
})

describe('SessionsCard', () => {
  it('draws one row per session, keyed by the row id Revoke posts', () => {
    expect(
      [...renderCard().querySelectorAll('[data-session-row]')].map((row) => row.getAttribute('data-session-row')),
    ).toEqual(['412', '398'])
  })

  it('marks the row the view says is current, and not the first one', () => {
    // THE CASE THAT NEEDS TWO ROWS. With one, "the current row" and "the first
    // row" are the same element and every reading agrees.
    const host = renderCard()

    expect([...host.querySelectorAll('[data-current]')].map((mark) => mark.getAttribute('data-current'))).toEqual([
      'false',
      'true',
    ])
  })

  it('draws the current mark differently from the others, rather than only labelling it', () => {
    // §2.11: "a 9px mark (filled for the current session)". A class applied to
    // every mark would satisfy a case that only counted them.
    const marks = [...renderCard().querySelectorAll('[data-current]')].map((mark) => mark.className)

    expect(marks[0]).not.toBe(marks[1])
  })

  it('prints the word Current beside exactly the marked row', () => {
    const host = renderCard()
    const rows = [...host.querySelectorAll('[data-session-row]')]

    expect(rows.map((row) => row.querySelector('[data-session-current]') !== null)).toEqual([false, true])
  })

  it('prints the device over the place and the date, which is §2.11’s row', () => {
    const host = renderCard()
    const first = host.querySelector('[data-session-row="412"]')

    expect(first?.textContent).toContain('Chrome on Windows')
    expect(first?.textContent).toContain('Reykjavik, Iceland · 3 Sep 2026')
  })

  it('names the line that carries the date, so a screenshot can mask the one thing that moves daily', () => {
    // `e2e/visual.spec.ts`'s `admin-account` case masks this line. The date is
    // `lastSeenAt`, which the guard stamps on the request that draws this
    // screen — so it is ALWAYS today, and a baseline carrying it would be red
    // tomorrow. Masking the whole row instead would take §2.11's mark, device
    // and Revoke out of the picture with it, which is most of the row.
    const first = renderCard().querySelector('[data-session-row="412"]')

    expect(first?.querySelector('[data-session-where]')?.textContent).toBe('Reykjavik, Iceland · 3 Sep 2026')
  })

  it('gives every row a Revoke that posts that row’s own id', () => {
    const host = renderCard()

    expect(
      [...host.querySelectorAll('[data-revoke-session]')].map((button) => {
        const form = button.closest('form')
        return form?.querySelector<HTMLInputElement>('input[name="row"]')?.value
      }),
    ).toEqual(['412', '398'])
  })

  it('says on the current row that revoking it signs you out, because it does', () => {
    const host = renderCard()

    expect(host.querySelector('[data-revoke-session="398"]')?.textContent).toBe('Revoke and sign out')
    expect(host.querySelector('[data-revoke-session="412"]')?.textContent).toBe('Revoke')
  })

  it('offers Sign out everywhere and Sign out, as §2.11 lists them', () => {
    const host = renderCard()

    expect(host.querySelector('[data-sign-out-everywhere]')).not.toBeNull()
    expect(host.querySelector('[data-sign-out]')).not.toBeNull()
  })

  it('signs out by POST to the endpoint that also clears the cookie, never by a link', () => {
    // One definition of signing out: `SIGN_OUT_ENDPOINT` revokes the row AND
    // clears `td-session`, which an action's redirect cannot do from inside a
    // render.
    const form = renderCard().querySelector('[data-sign-out]')?.closest('form')

    expect(form?.getAttribute('method')).toBe('post')
    expect(form?.getAttribute('action')).toBe('/admin/sign-out')
  })

  it('says something rather than drawing an empty list, on a state a browser cannot reach', () => {
    const host = renderCard([])

    expect(host.querySelector('[data-sessions-empty]')).not.toBeNull()
    expect(host.querySelectorAll('[data-session-row]')).toHaveLength(0)
  })
})
