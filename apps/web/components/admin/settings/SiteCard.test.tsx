/**
 * SiteCard.test.tsx — SCREENS.md §2.9's "The site": four fields, each with an
 * italic hint beneath.
 * Depends on: react, react-dom/client, vitest (jsdom),
 * ../../../lib/admin/readSettingsScreen, ./SiteCard.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import type { SiteIdentity } from '../../../lib/admin/readSettingsScreen'
import { SiteCard } from './SiteCard'

const roots: Root[] = []

/** What the global holds in the fixture. */
const SITE: SiteIdentity = {
  name: 'Wanderings',
  domain: 'wanderings.example',
  description: 'A travel diary.',
  replyTo: 'hello@example.test',
}

/** A save that records nothing: the card is a form, and jsdom submits none. */
const noSave = (): Promise<void> => Promise.resolve()

/**
 * Renders the card and hands back the host element.
 * @param site - The values to draw.
 * @returns The host element.
 */
const renderCard = (site: SiteIdentity = SITE): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(<SiteCard site={site} save={noSave} />)
  })
  return host
}

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount()
  })
  document.body.replaceChildren()
})

describe('SiteCard', () => {
  it('draws §2.9’s four fields, in the order it lists them', () => {
    expect(
      [...renderCard().querySelectorAll('[data-site-field]')].map((field) => field.getAttribute('data-site-field')),
    ).toEqual(['name', 'domain', 'description', 'replyTo'])
  })

  it('names each input after the column it writes, so the form body needs no mapping', () => {
    const host = renderCard()

    expect(
      [...host.querySelectorAll('input[type="text"], textarea')].map((input) => input.getAttribute('name')),
    ).toEqual(['name', 'domain', 'description', 'replyTo'])
  })

  it('fills each field with the value the global holds', () => {
    const host = renderCard()
    const valueOf = (name: string): string | undefined =>
      host.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`)?.value

    expect([valueOf('name'), valueOf('domain'), valueOf('description'), valueOf('replyTo')]).toEqual([
      'Wanderings',
      'wanderings.example',
      'A travel diary.',
      'hello@example.test',
    ])
  })

  it('draws an empty box for a field the global has not been given, not the word null', () => {
    const host = renderCard({ name: '', domain: '', description: '', replyTo: '' })

    expect(
      [...host.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input[type="text"], textarea')].map(
        (input) => input.value,
      ),
    ).toEqual(['', '', '', ''])
  })

  it('gives every field a hint beneath it, which is what §2.9 asks for', () => {
    const host = renderCard()

    // ONE PER FIELD, COUNTED. A card with three hints and four fields reads
    // fine and is the defect this counts.
    const hints = [...host.querySelectorAll('[data-site-field]')].map(
      (field) => field.lastElementChild?.textContent ?? '',
    )
    expect(hints.filter((hint) => hint.length > 0)).toHaveLength(4)
  })

  it('draws the description as a textarea, because it is the one field that wraps', () => {
    const host = renderCard()

    expect(host.querySelector('[data-site-field="description"] textarea')).not.toBeNull()
    expect(host.querySelector('[data-site-field="name"] textarea')).toBeNull()
  })

  it('is one form, with one submit, so the four fields are saved together', () => {
    const host = renderCard()

    expect(host.querySelectorAll('form')).toHaveLength(1)
    expect(host.querySelector('[data-save-site]')?.textContent).toBe('Save the site')
  })

  it('titles the card in §2.9’s own words', () => {
    expect(renderCard().querySelector('h2')?.textContent).toBe('The site')
  })
})
