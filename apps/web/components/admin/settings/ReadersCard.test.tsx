/**
 * ReadersCard.test.tsx — SCREENS.md §2.9's Readers card: one toggle per `site`
 * checkbox, and the "Careful now" block beneath them.
 *
 * THE FIRST CASE READS THE CONFIG, not a list written here. §2.9 says five
 * toggles and `apps/web/globals/site.ts` declares five checkboxes; asserting
 * the card against the config is what makes a sixth checkbox appear on the
 * screen rather than becoming a setting no screen can reach — and what fails
 * if a toggle is ever drawn for a column the global does not have.
 * Depends on: react, react-dom/client, vitest (jsdom),
 * ../../../globals/site, ../../../lib/admin/readSettingsScreen, ./ReadersCard.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { Site } from '../../../globals/site'
import { readerCopyFor, type ReaderToggle } from '../../../lib/admin/readSettingsScreen'
import { ReadersCard } from './ReadersCard'

const roots: Root[] = []

/** A write that records nothing: the card is forms, and jsdom submits none. */
const noWrite = (): Promise<void> => Promise.resolve()

/**
 * Every `checkbox` the `site` global declares, extracted here rather than
 * imported from the module under test's neighbour — two extractions of one
 * config, so a card that agreed with a helper that had stopped reading the
 * config would still fail.
 * @returns The field names, in declaration order.
 */
const declaredCheckboxes = (): readonly string[] =>
  Site.fields.flatMap((field) => ('type' in field && field.type === 'checkbox' && 'name' in field ? [field.name] : []))

/**
 * One toggle per declared checkbox, all on.
 * @param overrides - Which settings to draw as off.
 * @returns The rows.
 */
const aSiteSettings = (overrides: Readonly<Record<string, boolean>> = {}): readonly ReaderToggle[] =>
  declaredCheckboxes().map((setting) => ({ setting, ...readerCopyFor(setting), on: overrides[setting] ?? true }))

/**
 * Renders the card and hands back the host element.
 * @param options - The rows and whether the book is already closed.
 * @returns The host element.
 */
const renderCard = (
  options: { readonly toggles?: readonly ReaderToggle[]; readonly bookIsOffline?: boolean } = {},
): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(
      <ReadersCard
        toggles={options.toggles ?? aSiteSettings()}
        bookIsOffline={options.bookIsOffline ?? false}
        setSetting={noWrite}
        takeOffline={noWrite}
      />,
    )
  })
  return host
}

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount()
  })
  document.body.replaceChildren()
})

describe('ReadersCard', () => {
  it('offers one toggle per reader setting the site global holds', () => {
    const host = renderCard()

    expect([...host.querySelectorAll('[data-setting]')].map((node) => node.getAttribute('data-setting'))).toEqual(
      declaredCheckboxes(),
    )
  })

  it('draws each toggle in the state it was given, both ways round', () => {
    const host = renderCard({ toggles: aSiteSettings({ passwordProtect: false, allowShare: false }) })
    const onOf = (setting: string): string | null | undefined =>
      host.querySelector(`[data-setting="${setting}"]`)?.getAttribute('data-on')

    expect([onOf('allowDownloads'), onOf('allowShare'), onOf('passwordProtect')]).toEqual(['true', 'false', 'false'])
  })

  it('posts the value each toggle is switching TO, which is what lets one be turned off', () => {
    // A checkbox that is off posts nothing at all, so a form built that way
    // could only ever switch a setting on. This is the case that says the
    // hidden field carries the inverse of the current state.
    const host = renderCard({ toggles: aSiteSettings({ allowShare: false }) })
    const nextOf = (setting: string): string | undefined =>
      host
        .querySelector(`[data-setting="${setting}"]`)
        ?.closest('form')
        ?.querySelector<HTMLInputElement>('input[name="on"]')?.value

    expect([nextOf('allowDownloads'), nextOf('allowShare')]).toEqual(['false', 'true'])
  })

  it('gives each toggle its own form, so one press writes one column', () => {
    const host = renderCard()

    // ONE FORM PER TOGGLE PLUS THE "Careful now" ONE. A single form around the
    // five would let a stale page overwrite four settings the author did not
    // touch.
    expect(host.querySelectorAll('form')).toHaveLength(declaredCheckboxes().length + 1)
  })

  it('names the column each form writes in a hidden field, so nothing is inferred from position', () => {
    const host = renderCard()
    const named = [...host.querySelectorAll<HTMLInputElement>('input[name="setting"]')].map((input) => input.value)

    expect(named).toEqual(declaredCheckboxes())
  })

  it('gives every switch a name a screen reader can say, since it carries no text', () => {
    const host = renderCard({ toggles: aSiteSettings({ allowShare: false }) })

    expect(host.querySelector('[data-setting="allowShare"]')?.getAttribute('aria-label')).toContain('Turn on')
    expect(host.querySelector('[data-setting="allowDownloads"]')?.getAttribute('aria-label')).toContain('Turn off')
  })

  it('prints each setting’s label and its hint', () => {
    const host = renderCard()
    const row = host.querySelector('[data-setting="indexGalleries"]')?.closest('form')

    expect(row?.textContent).toContain(readerCopyFor('indexGalleries').label)
    expect(row?.textContent).toContain(readerCopyFor('indexGalleries').hint)
  })

  it('offers Take the book offline while the book is open', () => {
    const host = renderCard({ bookIsOffline: false })
    const button = host.querySelector<HTMLButtonElement>('[data-take-offline]')

    expect(button?.disabled).toBe(false)
    expect(button?.textContent).toBe('Take the book offline')
  })

  it('has nothing left for that button to do once the book is closed, and says so', () => {
    // THE OTHER SIDE. A button that stayed live would post a write that
    // changed nothing, on the one control the design rings as dangerous.
    const host = renderCard({ bookIsOffline: true })
    const button = host.querySelector<HTMLButtonElement>('[data-take-offline]')

    expect(button?.disabled).toBe(true)
    expect(button?.textContent).toBe('The book is offline')
  })

  it('titles the card in §2.9’s own words, and keeps the Careful now eyebrow', () => {
    const host = renderCard()

    expect(host.querySelector('h2')?.textContent).toBe('Readers')
    expect(host.textContent).toContain('Careful now')
  })
})
