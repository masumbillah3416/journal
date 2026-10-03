/**
 * RefusalNotice.test.tsx — what a screen prints when the post it just made was
 * refused (docs/deviations.md §104).
 *
 * THE CASE THAT MATTERS MOST IS THE ONE THAT DRAWS NOTHING. Eleven committed
 * visual baselines are pictures of screens that were not refused, so a notice
 * that rendered an empty box would move every one of them — and a baseline
 * moving by less than `maxDiffPixelRatio` is something the suite defends
 * (standing orders §21).
 * Depends on: react, react-dom/client, vitest (jsdom),
 * ../../../lib/admin/formRefusal, ./RefusalNotice.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import type { FormRefusal } from '../../../lib/admin/formRefusal'
import { RefusalNotice } from './RefusalNotice'

const roots: Root[] = []

/**
 * Renders the notice and hands back the host element.
 * @param refusal - What to draw.
 * @returns The host element.
 */
const renderNotice = (refusal: FormRefusal | null): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(<RefusalNotice refusal={refusal} />)
  })
  return host
}

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount()
  })
  document.body.replaceChildren()
})

describe('RefusalNotice', () => {
  it('draws nothing when there was no refusal', () => {
    expect(renderNotice(null).innerHTML).toBe('')
  })

  it('draws nothing for a refusal that names nothing', () => {
    // A body-level parse that threw with no issues is not a thing Zod does,
    // and an empty box on every screen is what believing otherwise costs.
    expect(renderNotice({ refused: [], kept: { name: ['typed'] } }).innerHTML).toBe('')
  })

  it('prints one line per refusal, each keyed to the field it is about', () => {
    const host = renderNotice({
      refused: [
        { field: 'name', message: 'where it went cannot be blank' },
        { field: 'dates', message: 'the dates cannot be blank' },
      ],
      kept: {},
    })

    expect(
      [...host.querySelectorAll('[data-refused-field]')].map((line) => line.getAttribute('data-refused-field')),
    ).toEqual(['name', 'dates'])
    expect(host.querySelector('[data-refused-field="name"]')?.textContent).toContain('where it went cannot be blank')
  })

  it('announces itself, because the author pressed Save and the page did not move', () => {
    // Without a live region the only evidence of a refusal is a box that
    // appeared somewhere a screen reader was not looking.
    expect(
      renderNotice({ refused: [{ field: 'name', message: 'blank' }], kept: {} })
        .querySelector('[data-form-refusal]')
        ?.getAttribute('role'),
    ).toBe('alert')
  })

  it('calls a refusal of the whole body "the form" rather than printing nothing', () => {
    const host = renderNotice({
      refused: [{ field: '', message: 'the highlight rows do not line up' }],
      kept: {},
    })

    expect(host.querySelector('[data-refused-field=""]')?.textContent).toBe(
      'the form — the highlight rows do not line up',
    )
  })
})
