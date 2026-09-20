/**
 * CoverPreview.test.tsx — SCREENS.md §2.7's Cover card, and what a jsdom case
 * can honestly say about a "live preview".
 *
 * ═══ WHAT THE FONT-SIZE CASE PROVES, AND WHAT IT DOES NOT ═══
 *
 * It proves the component DEFERS TO THE FITTER: the rendered size is
 * `fitPreviewTitleSize`'s answer for the string that is actually in the input,
 * so a hard-coded size fails and a second, divergent formula fails. It does NOT
 * prove the title fits. jsdom performs no layout, so nothing in this file
 * measures text against a boundary, and a component handed the WRONG box would
 * pass here because this file would compare it against the same wrong box. The
 * fitting property itself is a property of the function and is asserted in
 * `packages/domain/src/coverTitle.test.ts`.
 *
 * ═══ "LIVE" IS ASSERTED BY TYPING, NOT BY RENDERING ═══
 *
 * A preview fed from props while the inputs held their own state would render
 * identically and drift apart on the first keystroke. So the cases that matter
 * change the input and read the preview back.
 *
 * Depends on: react, react-dom/client, vitest (jsdom),
 * @travel-diary/domain/coverTitle, @travel-diary/tokens/colour, ./CoverPreview.
 */
import { fitPreviewTitleSize } from '@travel-diary/domain/coverTitle'
import { coverCloths } from '@travel-diary/tokens/colour'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CoverFields } from '../../../lib/admin/coverMutations'
import { CoverPreview } from './CoverPreview'

const roots: Root[] = []

/** The cover the seeded book has, so a fixture reads like a book. */
const SEEDED: CoverFields = {
  title: 'Wanderings',
  subtitle: 'field notes and other scraps',
  owner: 'M. Alvarez',
  yearsShown: '2025 — 2026',
  coverCloth: '#2f4a47',
}

/** A title long enough that the fitter has to shrink it below its own maximum. */
const A_LONG_TITLE = 'Every Doorway I Have Ever Photographed'

/**
 * Renders the card and hands back the host element.
 * @param overrides - Fields to override on the fixture.
 * @param save - The write the card dispatches.
 * @returns The host element.
 */
const renderCard = (overrides: Partial<CoverFields> = {}, save = vi.fn()): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(<CoverPreview cover={{ ...SEEDED, ...overrides }} save={save} />)
  })
  return host
}

/**
 * The one element a selector matches.
 * @param host - Where to look.
 * @param selector - What to look for.
 * @returns The element.
 */
const one = (host: HTMLElement, selector: string): HTMLElement => {
  const found = host.querySelector<HTMLElement>(selector)
  if (found === null) throw new Error(`nothing matched ${selector}`)
  return found
}

/**
 * The prototype's own `value` setter — `CodeStep.test.tsx`'s idiom, for its
 * reason: assigning `input.value` goes through React's own setter and updates
 * its value tracker, so React sees no change and never calls `onChange`.
 */
// eslint-disable-next-line @typescript-eslint/unbound-method -- capturing the prototype's setter is the point: it is re-invoked below with `.call(...)`, which is the receiver the rule exists to protect.
const setInputValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set

/**
 * Types into a text input the way a keyboard does, so React's state follows.
 * @param input - The field.
 * @param value - What was typed.
 */
const type = (input: HTMLElement, value: string): void => {
  if (setInputValue === undefined) throw new Error('this environment has no HTMLInputElement value setter')
  act(() => {
    setInputValue.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount()
    })
  }
  document.body.innerHTML = ''
})

describe('CoverPreview — the preview', () => {
  it('prints the four lines SCREENS.md §2.7 names on it', () => {
    const host = renderCard()
    const preview = one(host, '[data-cover-preview]')

    expect(preview.textContent).toBe(`Travel Diary${SEEDED.title}${SEEDED.subtitle}Kept by ${SEEDED.owner}`)
  })

  it('sizes the title with the diary’s own fitter rather than at a size of its own', () => {
    // A CONSISTENCY CASE, and it is named for what it proves: the component
    // defers to `fitPreviewTitleSize`. It cannot prove the title fits — see
    // this file's header.
    const host = renderCard({ title: A_LONG_TITLE })

    expect(one(host, '[data-preview-title]').style.fontSize).toBe(`${String(fitPreviewTitleSize(A_LONG_TITLE))}px`)
  })

  it('shrinks the title as it is typed, which is the whole of "live"', () => {
    // A RELATIVE COMPARISON, so it fails against a component that called the
    // fitter once with the PROP and then printed the typed string at that size.
    const host = renderCard({ title: 'Rio' })
    const before = one(host, '[data-preview-title]').style.fontSize

    type(one(host, '[data-cover-field="title"]'), A_LONG_TITLE)
    const after = one(host, '[data-preview-title]').style.fontSize

    expect({
      shrank: Number.parseFloat(after) < Number.parseFloat(before),
      matchesTheFitter: after === `${String(fitPreviewTitleSize(A_LONG_TITLE))}px`,
    }).toEqual({ shrank: true, matchesTheFitter: true })
  })

  it('repaints the cloth as a swatch is pressed, before anything is saved', () => {
    const host = renderCard()

    act(() => {
      one(host, '[data-cover-cloth="#3d4257"]').click()
    })

    expect(one(host, '[data-cover-preview]').getAttribute('style')).toBe('--td-preview-cloth: #3d4257;')
  })

  it('follows the owner line as it is typed', () => {
    const host = renderCard()

    type(one(host, '[data-cover-field="owner"]'), 'Somebody Else')

    expect(one(host, '[data-cover-preview]').textContent).toContain('Kept by Somebody Else')
  })
})

describe('CoverPreview — the fields', () => {
  it('draws the four fields SCREENS.md §2.7 names, each at the value the book holds', () => {
    const host = renderCard()
    const fields = [...host.querySelectorAll<HTMLInputElement>('[data-cover-field]')]

    expect(fields.map((field) => [field.getAttribute('data-cover-field'), field.value])).toEqual([
      ['title', SEEDED.title],
      ['subtitle', SEEDED.subtitle],
      ['owner', SEEDED.owner],
      ['yearsShown', SEEDED.yearsShown],
    ])
  })

  it('offers the four cover cloths and presses the one the book wears', () => {
    const host = renderCard({ coverCloth: '#5c4a2b' })
    const pressed = coverCloths.filter(
      (cloth) => host.querySelector(`[data-cover-cloth="${cloth}"]`)?.getAttribute('aria-pressed') === 'true',
    )

    expect({ swatches: host.querySelectorAll('[data-cover-cloth]').length, pressed }).toEqual({
      swatches: coverCloths.length,
      pressed: ['#5c4a2b'],
    })
  })

  it('gives every swatch an accessible name, because four coloured squares are four unlabelled buttons', () => {
    const host = renderCard()
    const names = [...host.querySelectorAll('[data-cover-cloth]')].map((button) => button.getAttribute('aria-label'))

    expect(names).toEqual(coverCloths.map((cloth) => `Cover cloth ${cloth}`))
  })

  it('saves what is in the fields, not what was rendered into them', () => {
    const save = vi.fn()
    const host = renderCard({}, save)

    type(one(host, '[data-cover-field="title"]'), 'Long Way Round the Houses')
    act(() => {
      one(host, '[data-cover-cloth="#7a3b32"]').click()
    })
    act(() => {
      one(host, '[data-save-cover]').click()
    })

    expect(save.mock.calls[0]?.[0]).toEqual({
      ...SEEDED,
      title: 'Long Way Round the Houses',
      coverCloth: '#7a3b32',
    })
  })
})
