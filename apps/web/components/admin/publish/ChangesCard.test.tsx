/**
 * ChangesCard.test.tsx — SCREENS.md §2.8's row: the checkbox, the kind chip,
 * the text over "{location} · {when}", and Revert.
 *
 * THE CHECKBOX IS THE FORM'S BODY, AND THAT IS WHAT THE FIRST CASES ASSERT.
 * The selection the publish button sends is whatever the boxes are ticked to,
 * so `name` and `value` are load-bearing rather than decoration: a row whose
 * box posted the wrong id would publish another journey, and every other
 * assertion on this screen would still pass.
 *
 * THE EXCLUDED STATE IS ASSERTED FROM BOTH SIDES. §2.8 strikes the text through
 * and greys it when a row is unticked; a case that only checked the struck-out
 * state would pass for a card that struck every row through.
 * Depends on: react, react-dom/client, vitest (jsdom),
 * @travel-diary/domain/testing/factories, ./ChangesCard.
 */
import { aPendingChange } from '@travel-diary/domain/testing/factories'
import type { PendingChange } from '@travel-diary/domain/admin/pendingChange'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChangesCard } from './ChangesCard'

const roots: Root[] = []

/** The two rows most cases here need: one edited, one never published. */
const TWO: readonly PendingChange[] = [
  aPendingChange('journey:11', { location: 'Tokyo · journey', at: '3 Mar 2025' }),
  aPendingChange('page:41', { kind: 'page', tone: 'added', text: 'Frames I has never been published' }),
]

/**
 * Renders the card and hands back the host element.
 * @param changes - The rows to draw.
 * @param excluded - The ids the author has unticked.
 * @param onToggle - What a tick calls.
 * @returns The host element.
 */
const renderCard = (
  changes: readonly PendingChange[] = TWO,
  excluded: ReadonlySet<string> = new Set(),
  onToggle = vi.fn(),
): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(<ChangesCard changes={changes} excluded={excluded} onToggle={onToggle} revert={vi.fn()} />)
  })
  return host
}

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount()
  })
  document.body.replaceChildren()
})

describe('ChangesCard', () => {
  it('prints §2.8’s header and its instruction', () => {
    const host = renderCard()

    expect(host.textContent).toContain('Changes in this draft')
    expect(host.textContent).toContain('tick what goes out')
  })

  it('draws one row per change, addressed by its id and never by its place in the list', () => {
    const host = renderCard()

    expect([...host.querySelectorAll('[data-change-row]')].map((row) => row.getAttribute('data-change-row'))).toEqual([
      'journey:11',
      'page:41',
    ])
  })

  it('posts each row’s own id as the selection, which is what the publish reads', () => {
    const host = renderCard()

    const boxes = [...host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')]
    expect(boxes.map((box) => [box.name, box.value])).toEqual([
      ['change', 'journey:11'],
      ['change', 'page:41'],
    ])
  })

  it('ticks a row that is going out and clears one that is not', () => {
    const host = renderCard(TWO, new Set(['page:41']))

    const boxes = [...host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')]
    expect(boxes.map((box) => box.checked)).toEqual([true, false])
  })

  it('tells the caller which row was toggled, by id', () => {
    const onToggle = vi.fn()
    const host = renderCard(TWO, new Set(), onToggle)

    act(() => {
      host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[1]?.click()
    })

    expect(onToggle).toHaveBeenCalledWith('page:41')
  })

  it('strikes an excluded row’s text through and leaves an included one alone', () => {
    // BOTH SIDES IN ONE RENDER: a card that struck every row through would
    // pass a case that only looked at the excluded one.
    const host = renderCard(TWO, new Set(['page:41']))

    const texts = [...host.querySelectorAll('[data-change-text]')]
    const struck = texts.map((text) => text.className.includes('whatExcluded'))
    expect(struck).toEqual([false, true])
  })

  it('prints the tone as the chip’s word, in the colour that tone is drawn in', () => {
    const host = renderCard()

    const chips = [...host.querySelectorAll<HTMLElement>('[data-change-chip]')]
    expect(chips.map((chip) => chip.textContent)).toEqual(['edited', 'added'])
    // A CUSTOM PROPERTY is the only spelling jsdom can read back — a `color`
    // is normalised to `rgb(...)` there and a `var()` is dropped entirely.
    expect(chips.map((chip) => chip.style.getPropertyValue('--td-chip-tone'))).toEqual([
      'var(--td-status-edited)',
      'var(--td-status-published)',
    ])
  })

  it('prints the location and the time on one line beneath the text', () => {
    const host = renderCard([aPendingChange('journey:11', { location: 'Tokyo · notes', at: '3 Mar 2025' })])

    expect(host.textContent).toContain('Tokyo · notes · 3 Mar 2025')
  })

  it('ties the row’s text to its own checkbox, so the whole line is a hit target', () => {
    const host = renderCard([aPendingChange('journey:11')])

    const box = host.querySelector<HTMLInputElement>('input[type="checkbox"]')
    const label = host.querySelector<HTMLLabelElement>('label')
    expect(label?.htmlFor).toBe(box?.id)
    expect(box?.id).not.toBe('')
  })

  it('offers Revert on a row that has something behind it', () => {
    // THE ROW ID IS NOT ASSERTED HERE, AND THAT IS DELIBERATE. It is bound into
    // the `formAction` rather than written into the button's `name`/`value`,
    // because React uses the submitter's own `name` and `value` to carry the
    // action id — which jsdom cannot see, since it renders the component and
    // not the action. `e2e/admin.spec.ts`'s Revert case is the instrument that
    // can, and it failed against the `name`/`value` version for exactly that
    // reason.
    const host = renderCard([aPendingChange('journey:11')])

    const revert = host.querySelector<HTMLButtonElement>('button')
    expect([revert?.textContent, revert?.type, revert?.disabled]).toEqual(['Revert', 'submit', false])
  })

  it('withholds Revert on a row nobody has ever published, because there is nothing to go back to', () => {
    // `revertChange` REFUSES this row — it has no published version — and §2.8
    // draws no error surface (`docs/deviations.md` §60), so a live control here
    // would be an unhandled Server Action error with nothing on screen. The
    // refusal stays in the write; this is the control not offering it.
    const host = renderCard([aPendingChange('journey:11', { tone: 'added' })])

    expect(host.querySelector<HTMLButtonElement>('button')?.disabled).toBe(true)
  })

  it('says so plainly when nothing is waiting, rather than drawing an empty list', () => {
    const host = renderCard([])

    expect(host.querySelector('[data-publish-empty]')?.textContent).toContain('already out')
    expect(host.querySelectorAll('[data-change-row]')).toHaveLength(0)
  })
})
