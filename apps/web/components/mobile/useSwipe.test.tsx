/**
 * useSwipe.test.tsx — behaviour of the touch-to-page-turn binding.
 *
 * `shouldTurnPage` itself (`packages/domain/src/swipe.ts`) is unit-tested to
 * 100%, including every diagonal either side of the 1.4 ratio; nothing here
 * re-tests that arithmetic. What is tested here is only what the binding adds:
 * that the origin is taken from `touchstart` and the end from `changedTouches`
 * (not `touches`, which is empty by the time a finger has lifted), that a
 * gesture is judged once and never twice, and that the two malformed events a
 * real touch surface produces - a `touchend` with no start, and one carrying
 * no changed touch - turn nothing instead of reading a coordinate off
 * `undefined`.
 *
 * A REAL SCROLL IS ASSERTED HERE TOO, at the binding level rather than only in
 * the domain, because the two halves of that rule live in different files and
 * the gesture that matters to a reader is the whole one. The browser proof -
 * a genuine touch-driven scroll on a real page - is `e2e/mobile.spec.ts`'s;
 * this is the fast one that runs on every commit.
 *
 * jsdom dispatches no touches of its own, so each gesture is a pair of
 * synthetic React touch events. That is a browser API being stood in for, not
 * one of our own modules (CLAUDE.md §2.3).
 * Depends on: react, react-dom/client, vitest (jsdom environment).
 */
import type { PageTurn } from '@travel-diary/domain/swipe'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { useSwipe } from './useSwipe'

/** Every turn the hook has reported, in order. */
let turns: PageTurn[] = []

/** Renders the one element the handlers go on. */
const Probe = (): React.JSX.Element => {
  const swipe = useSwipe((turn) => {
    turns.push(turn)
  })
  return <div data-testid="content" onTouchStart={swipe.onTouchStart} onTouchEnd={swipe.onTouchEnd} />
}

const roots: Root[] = []

const mountProbe = (): HTMLElement => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => {
    root.render(<Probe />)
  })

  const content = container.querySelector('[data-testid="content"]')
  if (!(content instanceof HTMLElement)) throw new Error('the probe rendered no content element')
  return content
}

/**
 * Dispatches a touch event React will pick up. jsdom has no `TouchEvent`
 * constructor, so the coordinate list is attached to an ordinary event -
 * React reads `touches`/`changedTouches` off the native event either way.
 */
const touch = (
  element: HTMLElement,
  type: 'touchstart' | 'touchend',
  points: readonly { readonly clientX: number; readonly clientY: number }[],
): void => {
  const event = new Event(type, { bubbles: true })
  Object.defineProperty(event, type === 'touchstart' ? 'touches' : 'changedTouches', {
    configurable: true,
    value: points,
  })
  act(() => {
    element.dispatchEvent(event)
  })
}

/** A whole gesture: down at the origin, up at the offset. */
const swipeBy = (element: HTMLElement, dx: number, dy: number): void => {
  touch(element, 'touchstart', [{ clientX: 200, clientY: 400 }])
  touch(element, 'touchend', [{ clientX: 200 + dx, clientY: 400 + dy }])
}

afterEach(() => {
  for (const root of roots) {
    act(() => {
      root.unmount()
    })
  }
  roots.length = 0
  turns = []
  document.body.innerHTML = ''
})

describe('useSwipe', () => {
  it('turns the page forward when the reader swipes left across the content', () => {
    const content = mountProbe()

    swipeBy(content, -120, 10)

    expect(turns).toEqual(['forward'])
  })

  it('turns the page back when the reader swipes right', () => {
    const content = mountProbe()

    swipeBy(content, 120, -10)

    expect(turns).toEqual(['backward'])
  })

  it('turns no page when the reader scrolls the column instead of swiping it', () => {
    const content = mountProbe()

    // A real scroll: a long vertical travel with the sideways drift a thumb
    // always adds. This is the gesture the whole rule exists for.
    swipeBy(content, 70, 320)

    expect(turns).toEqual([])
  })

  it('judges a gesture once, so a second touchend on the same touch turns nothing more', () => {
    const content = mountProbe()

    touch(content, 'touchstart', [{ clientX: 200, clientY: 400 }])
    touch(content, 'touchend', [{ clientX: 80, clientY: 400 }])
    touch(content, 'touchend', [{ clientX: 80, clientY: 400 }])

    expect(turns).toEqual(['forward'])
  })

  it('turns nothing for a touch that ended without ever starting here', () => {
    const content = mountProbe()

    touch(content, 'touchend', [{ clientX: 20, clientY: 400 }])

    expect(turns).toEqual([])
  })

  it('turns nothing for a touchstart carrying no touch at all', () => {
    const content = mountProbe()

    touch(content, 'touchstart', [])
    touch(content, 'touchend', [{ clientX: 20, clientY: 400 }])

    expect(turns).toEqual([])
  })

  it('turns nothing for a touchend carrying no changed touch', () => {
    const content = mountProbe()

    touch(content, 'touchstart', [{ clientX: 200, clientY: 400 }])
    touch(content, 'touchend', [])

    expect(turns).toEqual([])
  })

  it('measures each gesture from its own origin rather than from the first one', () => {
    const content = mountProbe()

    swipeBy(content, -120, 0)
    swipeBy(content, 120, 0)

    expect(turns).toEqual(['forward', 'backward'])
  })
})
