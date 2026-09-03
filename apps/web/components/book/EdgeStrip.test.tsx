/**
 * EdgeStrip.test.tsx — the page-edge turn strips, as controls rather than as
 * decoration.
 *
 * The strips are the handoff's primary pointer trigger (README, "Triggers":
 * "clicking the 44px right page-edge strip (`z-index: 900`), the 30px left
 * strip"). Their widths, position and stacking are geometry, and belong to
 * `book.module.css` and to `e2e/flip.spec.ts`, which clicks a real strip in a
 * real layout engine — jsdom performs no layout and could not tell a covered
 * strip from a clickable one. What is asserted here is what jsdom CAN see and
 * what a browser test would be a slow way to check: which edge each strip
 * publishes itself as, that it asks the book to turn, that it names itself for
 * a screen reader, and that it goes dead at the ends of the book instead of
 * firing a turn the machine would only refuse.
 * Depends on: react, react-dom/client, vitest (jsdom).
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { EdgeStrip, type BookEdge } from './EdgeStrip'

const roots: Root[] = []

/** Renders one strip and hands back its button, plus a count of the turns it asked for. */
const renderStrip = (
  edge: BookEdge,
  canTurn: boolean,
): { readonly strip: HTMLButtonElement; readonly turns: () => number } => {
  let turns = 0
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(
      <EdgeStrip
        edge={edge}
        canTurn={canTurn}
        onTurn={() => {
          turns += 1
        }}
      />,
    )
  })

  const strip = host.querySelector<HTMLButtonElement>(`[data-edge="${edge}"]`)
  if (strip === null) throw new Error(`the ${edge} strip rendered no element carrying data-edge`)
  return { strip, turns: () => turns }
}

afterEach(() => {
  for (const root of roots) {
    act(() => {
      root.unmount()
    })
  }
  roots.length = 0
  document.body.innerHTML = ''
})

describe('EdgeStrip', () => {
  it('publishes which edge of the book it is', () => {
    const { strip } = renderStrip('right', true)

    expect(strip.dataset['edge']).toBe('right')
  })

  it('asks the book to turn when the reader clicks it', () => {
    const { strip, turns } = renderStrip('right', true)

    act(() => {
      strip.click()
    })

    expect(turns()).toBe(1)
  })

  it('is a real button, so a keyboard reader reaches it too', () => {
    const { strip } = renderStrip('left', true)

    expect(strip.tagName).toBe('BUTTON')
  })

  it('names the forward strip with the handoff’s own wording', () => {
    const { strip } = renderStrip('right', true)

    expect(strip.getAttribute('aria-label')).toBe('Turn the page')
  })

  it('names the backward strip with the handoff’s own wording', () => {
    const { strip } = renderStrip('left', true)

    expect(strip.getAttribute('aria-label')).toBe('Turn back')
  })

  it('goes dead at the end of the book, rather than firing a turn the machine would refuse', () => {
    const { strip } = renderStrip('right', false)

    expect(strip.disabled).toBe(true)
  })

  it('asks for no turn at all while it is dead', () => {
    const { strip, turns } = renderStrip('left', false)

    act(() => {
      strip.click()
    })

    expect(turns()).toBe(0)
  })
})
