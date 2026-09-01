/**
 * Leaf.test.tsx — the translation from LeafPresentation into DOM attributes.
 *
 * `leafPresentation` (`packages/domain/src/pageStack.ts`) is unit-tested to
 * 100% and its module header states that its fields map one-to-one into
 * `rotateY()`, `zIndex`, `opacity`, `visibility` and `pointer-events` "so the
 * DOM layer never has to re-derive flip geometry". This file asserts exactly
 * that translation, and nothing about the geometry itself: every expected
 * value below is produced by calling `leafPresentation` with a real
 * `FlipState`, never hand-written, so a test can never drift into asserting a
 * geometry the domain does not actually produce.
 *
 * The one rule this file CANNOT prove is the back face's
 * `pointer-events: none`, because that lives in a CSS module and jsdom
 * performs no layout. It is proved in the browser instead — see
 * `e2e/book.spec.ts`, whose first case clicks a real Contents link.
 * Depends on: react, react-dom/client, @travel-diary/domain, vitest (jsdom).
 */
import { initialFlipState, type FlipState } from '@travel-diary/domain/flip'
import { leafPresentation } from '@travel-diary/domain/pageStack'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { Leaf } from './Leaf'

const TOTAL_PAGES = 33
const DURATION_MS = 900

const roots: Root[] = []

/** Renders one leaf and hands back the element carrying `data-leaf`. */
const renderLeaf = (leafIndex: number, state: FlipState): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(
      <Leaf index={leafIndex} presentation={leafPresentation(leafIndex, state, TOTAL_PAGES)} durationMs={DURATION_MS}>
        <p>Tokyo — Notes</p>
      </Leaf>,
    )
  })
  const leaf = host.querySelector<HTMLElement>('[data-leaf]')
  if (leaf === null) throw new Error('the leaf rendered no element carrying data-leaf')
  return leaf
}

/** The element for one of the leaf's three layers, asserted present. */
const layer = (leaf: HTMLElement, selector: string): HTMLElement => {
  const found = leaf.querySelector<HTMLElement>(selector)
  if (found === null) throw new Error(`the leaf rendered no ${selector}`)
  return found
}

/** A turn that has armed and begun rotating, but has not yet passed its midpoint. */
const turningForward = (from: number, to: number): FlipState => ({
  ...initialFlipState(from),
  phase: 'turning',
  from,
  to,
  dir: 'forward',
  go: true,
  half: false,
  busy: true,
  startedAt: 0,
})

/** The same turn, past the midpoint, where the faces have swapped. */
const swappedForward = (from: number, to: number): FlipState => ({
  ...turningForward(from, to),
  phase: 'swapped',
  half: true,
})

afterEach(() => {
  for (const root of roots) {
    act(() => {
      root.unmount()
    })
  }
  roots.length = 0
  document.body.innerHTML = ''
})

describe('Leaf', () => {
  it('lays an untouched leaf flat', () => {
    const leaf = renderLeaf(4, initialFlipState(4))

    expect(leaf.style.transform).toBe('rotateY(0deg)')
  })

  it('lays a leaf the reader has already turned at minus 180 degrees', () => {
    const leaf = renderLeaf(3, initialFlipState(4))

    expect(leaf.style.transform).toBe('rotateY(-180deg)')
  })

  it('stacks the leaf at the order the page stack assigned it', () => {
    const leaf = renderLeaf(4, initialFlipState(4))

    expect(leaf.style.zIndex).toBe(String(leafPresentation(4, initialFlipState(4), TOTAL_PAGES).zIndex))
  })

  it('hides a leaf that is neither the current page nor part of a turn', () => {
    const leaf = renderLeaf(9, initialFlipState(4))

    expect(leaf.style.visibility).toBe('hidden')
  })

  it('shows the leaf the reader is currently on', () => {
    const leaf = renderLeaf(4, initialFlipState(4))

    expect(leaf.style.visibility).toBe('visible')
  })

  it('lets the current page receive pointer input while the book is at rest', () => {
    const leaf = renderLeaf(4, initialFlipState(4))

    expect(leaf.style.pointerEvents).toBe('auto')
  })

  it('takes pointer input away from every leaf while a turn is in flight', () => {
    const leaf = renderLeaf(4, turningForward(4, 5))

    expect(leaf.style.pointerEvents).toBe('none')
  })

  it('renders the page content on the front face', () => {
    const leaf = renderLeaf(4, initialFlipState(4))

    expect(layer(leaf, '[data-face="front"]').textContent).toBe('Tokyo — Notes')
  })

  it('shows the front face and not the back face at rest', () => {
    const leaf = renderLeaf(4, initialFlipState(4))

    expect([layer(leaf, '[data-face="front"]').style.opacity, layer(leaf, '[data-face="back"]').style.opacity]).toEqual(
      ['1', '0'],
    )
  })

  it('swaps to the back face once a forward turn passes its midpoint', () => {
    const leaf = renderLeaf(4, swappedForward(4, 5))

    expect([layer(leaf, '[data-face="front"]').style.opacity, layer(leaf, '[data-face="back"]').style.opacity]).toEqual(
      ['0', '1'],
    )
  })

  it('hides the back face from assistive technology, since it carries no content of its own', () => {
    const leaf = renderLeaf(4, initialFlipState(4))

    expect(layer(leaf, '[data-face="back"]').getAttribute('aria-hidden')).toBe('true')
  })

  it('draws the travelling shade over the leaf that is actively turning', () => {
    const leaf = renderLeaf(4, turningForward(4, 5))

    expect(layer(leaf, '[data-shade]').style.opacity).toBe('1')
  })

  it('draws no travelling shade over a leaf that is merely being revealed', () => {
    const leaf = renderLeaf(5, turningForward(4, 5))

    expect(layer(leaf, '[data-shade]').style.opacity).toBe('0')
  })

  it('draws no travelling shade while the book is at rest', () => {
    const leaf = renderLeaf(4, initialFlipState(4))

    expect(layer(leaf, '[data-shade]').style.opacity).toBe('0')
  })

  it('runs the turning leaf for the configured flip duration', () => {
    const leaf = renderLeaf(4, turningForward(4, 5))

    expect(leaf.style.transitionDuration).toBe('900ms')
  })

  it('gives a leaf that is not turning no transition at all, so a bookmark jump cannot fan the whole stack open', () => {
    const leaf = renderLeaf(5, turningForward(4, 5))

    expect(leaf.style.transitionDuration).toBe('0ms')
  })
})
