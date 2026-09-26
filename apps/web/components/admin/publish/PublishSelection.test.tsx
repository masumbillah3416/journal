/**
 * PublishSelection.test.tsx — the one thing this island exists for: the button
 * and the rows follow the ticks, within one render.
 *
 * THE NUMBER THE DEFECT MOVES IS THE BUTTON'S OWN TEXT AFTER A CLICK. A case
 * that rendered the island and read the label would pass for a component that
 * never re-read its boxes at all — which is exactly what a `<form>` without
 * this island does. So every case below TICKS something first and then reads,
 * and the inert case ticks everything off.
 *
 * THE STRIKE-THROUGH AND THE LABEL ARE READ FROM THE SAME RENDER, because §2.8
 * makes them two readings of one set and a component holding two would be free
 * to disagree with itself for one frame.
 * Depends on: react, react-dom/client, vitest (jsdom),
 * @travel-diary/domain/testing/factories, ./PublishSelection.
 */
import type { PendingChange } from '@travel-diary/domain/admin/pendingChange'
import { aPendingChange } from '@travel-diary/domain/testing/factories'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PublishSelection } from './PublishSelection'

const roots: Root[] = []

/** Four rows, which is the count SCREENS.md §2.8 writes its labels with. */
const FOUR: readonly PendingChange[] = [
  aPendingChange('journey:11'),
  aPendingChange('journey:12'),
  aPendingChange('page:41', { kind: 'page' }),
  aPendingChange('page:42', { kind: 'page' }),
]

/**
 * Renders the island and hands back the host element.
 * @param changes - The rows to draw.
 * @returns The host element.
 */
const render = (changes: readonly PendingChange[] = FOUR): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(<PublishSelection changes={changes} publish={vi.fn()} revert={vi.fn()} />)
  })
  return host
}

/**
 * Clicks one row's checkbox, the way an author does.
 * @param host - Where the island is.
 * @param index - Which row, from the top.
 */
const tick = (host: HTMLElement, index: number): void => {
  act(() => {
    host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[index]?.click()
  })
}

/**
 * What the primary button currently reads.
 * @param host - Where the island is.
 * @returns The label.
 */
const label = (host: HTMLElement): string => host.querySelector('[data-publish-now]')?.textContent ?? ''

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount()
  })
  document.body.replaceChildren()
})

describe('PublishSelection', () => {
  it('starts with everything ticked, because everything waiting is meant to go out', () => {
    const host = render()

    expect(label(host)).toBe('Publish all 4')
    expect([...host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].every((box) => box.checked)).toBe(
      true,
    )
  })

  it('counts the headline from the rows it was handed', () => {
    expect(render(FOUR.slice(0, 1)).querySelector('[data-publish-count]')?.textContent).toBe('1 change waiting')
  })

  it('re-reads the button’s label the moment a box is cleared', () => {
    const host = render()

    tick(host, 2)

    expect(label(host)).toBe('Publish 3 of 4')
  })

  it('goes back to "all" when the box is ticked again', () => {
    // THE OTHER DIRECTION, which is what catches a toggle that only ever adds
    // to the excluded set.
    const host = render()

    tick(host, 2)
    tick(host, 2)

    expect(label(host)).toBe('Publish all 4')
  })

  it('goes inert and reads "0 of 4" once every box is cleared', () => {
    const host = render()

    for (const index of [0, 1, 2, 3]) tick(host, index)

    expect(label(host)).toBe('Publish 0 of 4')
    expect(host.querySelector<HTMLButtonElement>('[data-publish-now]')?.disabled).toBe(true)
  })

  it('strikes the row it just cleared through, and only that row', () => {
    const host = render()

    tick(host, 1)

    const struck = [...host.querySelectorAll('[data-change-text]')].map((text) =>
      text.className.includes('whatExcluded'),
    )
    expect(struck).toEqual([false, true, false, false])
  })

  it('keeps the cleared row’s box out of the body the publish would post', () => {
    // THE SELECTION IS THE BOXES, so an unticked row must not be submitted —
    // which in a real form is exactly "not checked".
    const host = render()

    tick(host, 0)

    const posted = [...host.querySelectorAll<HTMLInputElement>('input[name="change"]')]
      .filter((box) => box.checked)
      .map((box) => box.value)
    expect(posted).toEqual(['journey:12', 'page:41', 'page:42'])
  })

  it('draws both cards inside one form, because a Revert cannot be a form of its own', () => {
    const host = render()

    expect(host.querySelectorAll('form')).toHaveLength(1)
    expect(host.querySelector('form')?.querySelector('[data-publish-headline]')).not.toBeNull()
    expect(host.querySelector('form')?.querySelector('[data-publish-changes]')).not.toBeNull()
  })

  it('is inert from the first render when nothing is waiting at all', () => {
    const host = render([])

    expect(label(host)).toBe('Publish 0 of 0')
    expect(host.querySelector<HTMLButtonElement>('[data-publish-now]')?.disabled).toBe(true)
  })
})
