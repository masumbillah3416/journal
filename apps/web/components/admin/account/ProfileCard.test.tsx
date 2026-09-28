/**
 * ProfileCard.test.tsx — SCREENS.md §2.11's "Who is keeping this": the
 * monogram this data model can draw, three fields and a Save.
 * Depends on: react, react-dom/client, vitest (jsdom),
 * ../../../lib/admin/readAccountScreen, ./ProfileCard.
 */
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { type AccountProfile, timeZoneOptions } from '../../../lib/admin/readAccountScreen'
import { ProfileCard } from './ProfileCard'

const roots: Root[] = []

/** What the account's row holds in the fixture. */
const PROFILE: AccountProfile = {
  name: 'Helena Marsh',
  signoff: 'Until the next one',
  timeZone: 'Asia/Tokyo',
  initial: 'H',
  timeZoneOptions: timeZoneOptions('Asia/Tokyo'),
}

/** A save that records nothing: the card is a form, and jsdom submits none. */
const noSave = (): Promise<void> => Promise.resolve()

/**
 * Renders the card and hands back the host element.
 * @param profile - The values to draw.
 * @returns The host element.
 */
const renderCard = (profile: AccountProfile = PROFILE): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(<ProfileCard profile={profile} save={noSave} />)
  })
  return host
}

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount()
  })
  document.body.replaceChildren()
})

describe('ProfileCard', () => {
  it('draws §2.11’s three fields, in the order it lists them', () => {
    expect(
      [...renderCard().querySelectorAll('[data-account-field]')].map((field) =>
        field.getAttribute('data-account-field'),
      ),
    ).toEqual(['name', 'signoff', 'timeZone'])
  })

  it('names each control after the field the parse reads, so the form body needs no mapping', () => {
    const host = renderCard()

    expect([...host.querySelectorAll('input, select')].map((control) => control.getAttribute('name'))).toEqual([
      'name',
      'signoff',
      'timeZone',
    ])
  })

  it('fills each field with what the row holds', () => {
    const host = renderCard()
    const valueOf = (name: string): string | undefined =>
      host.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)?.value

    expect([valueOf('name'), valueOf('signoff'), valueOf('timeZone')]).toEqual([
      'Helena Marsh',
      'Until the next one',
      'Asia/Tokyo',
    ])
  })

  it('draws an empty box for a field nobody has filled in, not the word null', () => {
    const host = renderCard({ ...PROFILE, name: '', signoff: '' })

    expect([...host.querySelectorAll<HTMLInputElement>('input')].map((input) => input.value)).toEqual(['', ''])
  })

  it('draws the account’s initial where §2.11 asks for an avatar, and offers no Replace', () => {
    // docs/deviations.md §106: DATA_MODEL.md's `users` holds no image, so there
    // is nothing to draw and nothing for Replace to write. The 132px circle is
    // the design's; what is inside it is what this repository can answer.
    const host = renderCard()

    expect(host.querySelector('[data-account-avatar]')?.textContent).toBe('H')
    expect(host.textContent).not.toContain('Replace')
  })

  it('hides the monogram from a screen reader, because the name is in the field beside it', () => {
    expect(renderCard().querySelector('[data-account-avatar]')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('offers every option readAccountScreen built, in its order', () => {
    const host = renderCard()

    expect([...host.querySelectorAll('option')].map((option) => option.getAttribute('value'))).toEqual(
      PROFILE.timeZoneOptions.map((option) => option.zone),
    )
  })

  it('prints each option’s example rather than its zone name alone, which is §2.11’s own phrase', () => {
    // "a Time zone select whose options state how dates are written". Compared
    // against the options handed in rather than against a second copy of the
    // format, and asserted to be LONGER than the bare zone, so a label that
    // printed only the name could not pass.
    const host = renderCard()
    const drawn = [...host.querySelectorAll('option')].map((option) => option.text)

    expect(drawn).toEqual(PROFILE.timeZoneOptions.map((option) => option.label))
    expect(drawn.every((label, index) => label.length > (PROFILE.timeZoneOptions[index]?.zone.length ?? 0))).toBe(true)
  })

  it('gives every field a label a screen reader can read it by', () => {
    const host = renderCard()

    expect([...host.querySelectorAll('label[data-account-field]')]).toHaveLength(3)
  })
})
