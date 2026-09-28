/**
 * GettingInCard.test.tsx — SCREENS.md §2.11's "Getting in": the address, the
 * two password boxes, the code-step toggle and the two hints it switches
 * between.
 *
 * THE HINTS ARE COMPARED AGAINST THE CARD'S OWN EXPORTED CONSTANTS, which are
 * `SCREENS.md`'s words. Writing the sentences out here as well would make the
 * case a copy of a copy, and the thing that must not drift is the handoff's
 * phrasing rather than this file's.
 * Depends on: react, react-dom/client, vitest (jsdom),
 * ../../../lib/admin/readAccountScreen, ./GettingInCard.
 */
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import type { PasswordNotice } from '../../../lib/admin/accountMutations'
import type { AccountGettingIn } from '../../../lib/admin/readAccountScreen'
import { GettingInCard, OTP_HINTS } from './GettingInCard'

const roots: Root[] = []

/** A write that records nothing: the card is forms, and jsdom submits none. */
const noWrite = (): Promise<void> => Promise.resolve()

/**
 * Renders the card and hands back the host element.
 * @param gettingIn - The address and the code step's state.
 * @param notice - What the last password attempt did, if anything.
 * @returns The host element.
 */
const renderCard = (gettingIn: AccountGettingIn, notice: PasswordNotice | null = null): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(
      <GettingInCard gettingIn={gettingIn} notice={notice} changePassword={noWrite} setOtpRequired={noWrite} />,
    )
  })
  return host
}

/** The account as the fixture holds it, with the code step on. */
const GUARDED: AccountGettingIn = { email: 'keeper@example.test', otpRequired: true }

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount()
  })
  document.body.replaceChildren()
})

describe('GettingInCard', () => {
  it('prints the address the reader signs in with', () => {
    expect(renderCard(GUARDED).querySelector('[data-account-email]')?.textContent).toBe('keeper@example.test')
  })

  it('draws the address as text rather than a box, because nothing here changes it', () => {
    // A box that looked editable and was not is the defect docs/deviations.md
    // §103 records four of.
    const host = renderCard(GUARDED)

    expect([...host.querySelectorAll('input')].map((input) => input.getAttribute('name'))).toEqual([
      'current',
      'next',
      'on',
    ])
  })

  it('draws §2.11’s two password boxes, named for what the action reads', () => {
    const host = renderCard(GUARDED)

    expect([...host.querySelectorAll('input[type="password"]')].map((input) => input.getAttribute('name'))).toEqual([
      'current',
      'next',
    ])
  })

  it('prefills neither box, and tells a password manager which is which', () => {
    const host = renderCard(GUARDED)
    const boxes = [...host.querySelectorAll<HTMLInputElement>('input[type="password"]')]

    expect(boxes.map((box) => box.value)).toEqual(['', ''])
    expect(boxes.map((box) => box.getAttribute('autocomplete'))).toEqual(['current-password', 'new-password'])
  })

  it('switches the toggle’s hint between §2.11’s two sentences', () => {
    // BOTH SIDES, and against the handoff's own words. A card that printed one
    // sentence always would be right on the screen anybody would check first —
    // every account has the code step on by default.
    const on = renderCard(GUARDED).querySelector('[data-otp-hint]')?.textContent
    const off = renderCard({ ...GUARDED, otpRequired: false }).querySelector('[data-otp-hint]')?.textContent

    expect([on, off]).toEqual([OTP_HINTS.on, OTP_HINTS.off])
  })

  it('posts the value the toggle is switching TO, in both directions', () => {
    const postedBy = (gettingIn: AccountGettingIn): string | undefined =>
      renderCard(gettingIn).querySelector<HTMLInputElement>('input[name="on"]')?.value

    expect([postedBy(GUARDED), postedBy({ ...GUARDED, otpRequired: false })]).toEqual(['false', 'true'])
  })

  it('draws the toggle in the state the column is in', () => {
    const pressedOn = renderCard(GUARDED).querySelector('[data-setting="otpRequired"]')?.getAttribute('aria-pressed')
    const pressedOff = renderCard({ ...GUARDED, otpRequired: false })
      .querySelector('[data-setting="otpRequired"]')
      ?.getAttribute('aria-pressed')

    expect([pressedOn, pressedOff]).toEqual(['true', 'false'])
  })

  it('gives the toggle its own form, so the hint can be drawn by the server', () => {
    // Inside the password form the hint would have to follow a click, which is
    // a client island; as a form of its own a press IS the write and the next
    // render draws the other sentence.
    const host = renderCard(GUARDED)
    const toggleForm = host.querySelector('[data-setting="otpRequired"]')?.closest('form')

    expect(toggleForm?.querySelector('input[type="password"]')).toBeNull()
  })

  it('draws §2.11’s controls in §2.11’s order: the passwords, then the toggle, then Save changes', () => {
    // THE HANDOFF'S ORDER IS DELIBERATE and this card had it wrong until review
    // round 1 (F2): it drew passwords → Save changes → toggle, so an author
    // reading top to bottom met a Save that sat above the control it does not
    // write. §2.11: "Current / New password in two columns above 900px; the
    // 'One-time code at sign-in' toggle with its two hints; then Save changes."
    const host = renderCard(GUARDED)

    expect(
      [
        ...host.querySelectorAll('[data-account-field="current"], [data-setting="otpRequired"], [data-save-password]'),
      ].map((node) => node.getAttribute('data-account-field') ?? node.getAttribute('data-setting') ?? 'save'),
    ).toEqual(['current', 'otpRequired', 'save'])
  })

  it('still submits the password form from below the toggle, without nesting one form in another', () => {
    // The Save button is OUTSIDE the form it submits — `<button form="…">` is
    // how the order above is reached with no client JavaScript and no nested
    // `<form>`, which HTML does not allow and which is the only other way to
    // put a submit below a sibling form.
    const host = renderCard(GUARDED)
    const save = host.querySelector<HTMLButtonElement>('[data-save-password]')
    const passwords = host.querySelector<HTMLInputElement>('input[name="current"]')?.closest('form')

    expect(save?.closest('form')).toBeNull()
    expect(save?.form).toBe(passwords)
  })

  it('prints nothing about a password until one has been attempted', () => {
    expect(renderCard(GUARDED).querySelector('[data-password-notice]')).toBeNull()
  })

  it('says what a refusal was, and announces it', () => {
    const host = renderCard(GUARDED, 'wrong-password')
    const said = host.querySelector('[data-password-notice]')

    expect(said?.getAttribute('role')).toBe('alert')
    expect(said?.textContent).toContain('not the current password')
    // The lockout is on the card rather than only in a header, because an
    // author who is guessing deserves to know before the fifth guess.
    expect(said?.textContent).toContain('fifteen minutes')
  })

  it('says an empty box changed nothing, which is the one thing Payload does silently', () => {
    expect(renderCard(GUARDED, 'empty-password').querySelector('[data-password-notice]')?.textContent).toContain(
      'An empty box changes nothing',
    )
  })

  it('confirms a change that worked, without interrupting a screen reader to do it', () => {
    const said = renderCard(GUARDED, 'changed').querySelector('[data-password-notice]')

    expect(said?.textContent).toContain('your password from now on')
    expect(said?.getAttribute('role')).toBeNull()
  })

  it('draws a refusal and a confirmation differently, so the two are not one line in two colours of prose', () => {
    const refused = renderCard(GUARDED, 'wrong-password').querySelector('[data-password-notice]')?.className
    const done = renderCard(GUARDED, 'changed').querySelector('[data-password-notice]')?.className

    expect(refused).not.toBe(done)
  })
})
