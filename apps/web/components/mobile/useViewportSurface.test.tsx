/**
 * useViewportSurface.test.tsx — behaviour of the measure-and-choose binding.
 *
 * `surfaceForWidth` itself (`packages/domain/src/readingSurface.ts`) is
 * unit-tested to 100%, including the pixel either side of the breakpoint;
 * nothing here re-tests that comparison. What is tested here is only what the
 * binding adds: that it starts from what the server served rather than from a
 * measurement it has not taken yet, that it measures on mount, that it
 * re-measures on a window resize AND through a `ResizeObserver`, that a burst
 * of resize events collapses into a single animation frame (CLAUDE.md §6), and
 * that both subscriptions are released on unmount.
 *
 * jsdom ships no `ResizeObserver`, so it is stood in for - a browser API, not
 * one of our own modules (CLAUDE.md §2.3) - and its absence is itself a real
 * branch the hook has to survive, which is why one case leaves it out.
 * Depends on: react, react-dom/client, vitest (jsdom environment).
 */
import type { ReadingSurface } from '@travel-diary/domain/readingSurface'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { useViewportSurface } from './useViewportSurface'

/** The surface reported by the most recent render of {@link Probe}. */
let latestSurface: ReadingSurface | null = null

const Probe = ({ served }: { readonly served: ReadingSurface }): null => {
  latestSurface = useViewportSurface(served)
  return null
}

const roots: Root[] = []

const mountProbe = (served: ReadingSurface): Root => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => {
    root.render(<Probe served={served} />)
  })
  return root
}

/** jsdom's window reports 1024px; each case declares the width it is testing. */
const widthIs = (width: number): void => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
}

/** What the most recently constructed stand-in observer was asked to do. */
interface ObserverStandIn {
  readonly observed: Element[]
  disconnects: number
  notify: () => void
}

const stubResizeObserver = (): ObserverStandIn => {
  const record: ObserverStandIn = { observed: [], disconnects: 0, notify: () => undefined }
  class StandIn {
    constructor(callback: () => void) {
      record.notify = callback
    }
    observe(element: Element): void {
      record.observed.push(element)
    }
    disconnect(): void {
      record.disconnects += 1
    }
    unobserve(): void {
      // Never called by the hook; present so the stand-in matches the real
      // interface rather than a convenient subset of it.
    }
  }
  Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, value: StandIn })
  return record
}

/** Lets the queued animation frame run and flushes the render it causes. */
const nextFrame = async (): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50))
  })
}

afterEach(() => {
  for (const root of roots) {
    act(() => {
      root.unmount()
    })
  }
  roots.length = 0
  latestSurface = null
  widthIs(1024)
  document.body.innerHTML = ''
  Reflect.deleteProperty(globalThis, 'ResizeObserver')
})

describe('useViewportSurface', () => {
  it('measures a phone-width viewport as the mobile reading mode', () => {
    widthIs(390)

    mountProbe('mobile')

    expect(latestSurface).toBe('mobile')
  })

  it('measures a desktop-width viewport as the book', () => {
    widthIs(1440)

    mountProbe('book')

    expect(latestSurface).toBe('book')
  })

  it('corrects a served surface the viewport disagrees with, on mount', () => {
    // A desktop browser at a narrowed window: the server guessed the book from
    // the user-agent, and this is the measurement that says otherwise.
    widthIs(700)

    mountProbe('book')

    expect(latestSurface).toBe('mobile')
  })

  it('falls back to the document element when the window reports no width', () => {
    widthIs(0)
    Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 1440 })

    mountProbe('mobile')

    expect(latestSurface).toBe('book')
    Reflect.deleteProperty(document.documentElement, 'clientWidth')
  })

  it('re-measures when the reader drags the window across the breakpoint', async () => {
    widthIs(1440)
    mountProbe('book')

    widthIs(700)
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })
    await nextFrame()

    expect(latestSurface).toBe('mobile')
  })

  it('re-measures when a ResizeObserver reports the document element changed', async () => {
    const observer = stubResizeObserver()
    widthIs(1440)
    mountProbe('book')

    widthIs(700)
    act(() => {
      observer.notify()
    })
    await nextFrame()

    expect({ observed: observer.observed, surface: latestSurface }).toEqual({
      observed: [document.documentElement],
      surface: 'mobile',
    })
  })

  it('collapses a burst of resize events into one measurement', async () => {
    stubResizeObserver()
    widthIs(1440)
    mountProbe('book')

    let frames = 0
    const queue = requestAnimationFrame
    Object.defineProperty(globalThis, 'requestAnimationFrame', {
      configurable: true,
      value: (callback: FrameRequestCallback) => {
        frames += 1
        return queue(callback)
      },
    })

    act(() => {
      for (let index = 0; index < 20; index += 1) window.dispatchEvent(new Event('resize'))
    })
    await nextFrame()
    Object.defineProperty(globalThis, 'requestAnimationFrame', { configurable: true, value: queue })

    expect(frames).toBe(1)
  })

  it('measures without a ResizeObserver rather than throwing where the browser has none', () => {
    widthIs(390)

    mountProbe('book')

    expect(latestSurface).toBe('mobile')
  })

  it('releases both subscriptions when the surface unmounts', async () => {
    const observer = stubResizeObserver()
    widthIs(1440)
    const root = mountProbe('book')

    act(() => {
      root.unmount()
    })
    roots.length = 0
    widthIs(390)
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })
    await nextFrame()

    expect({ disconnects: observer.disconnects, surface: latestSurface }).toEqual({
      disconnects: 1,
      surface: 'book',
    })
  })
})
