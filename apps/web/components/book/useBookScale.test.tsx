/**
 * useBookScale.test.tsx — behaviour of the measure-and-scale binding.
 *
 * `bookScale` itself (`packages/domain/src/bookScale.ts`) is unit-tested to
 * 100%, including the 1.7x cap; nothing here re-tests the arithmetic. What is
 * tested here is only what the binding adds: that the area is measured on
 * mount, re-measured on a window resize AND through a `ResizeObserver` on the
 * container, that a burst of resize events collapses into a single animation
 * frame rather than one layout read each (CLAUDE.md §6 — "debounce or
 * requestAnimationFrame every resize handler"; "no synchronous layout reads
 * inside animation frames"), and that both subscriptions are released on
 * unmount.
 *
 * jsdom reports every element as 0x0 and ships no `ResizeObserver`, so the
 * container's `clientWidth`/`clientHeight` are defined per test and the
 * observer is stood in for. Both are browser APIs, not our own modules, so
 * standing them in is not the mocking CLAUDE.md §2.3 forbids — and the
 * missing-`ResizeObserver` path is itself a real branch the hook has to
 * survive, which is why one case leaves it absent.
 * Depends on: react, react-dom/client, vitest (jsdom environment).
 */
import { act, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useBookScale } from './useBookScale'

/** The scale from the most recent render of {@link Probe}. */
let latestScale: number | null = null

/** Renders a container of a fixed reported size and exposes the scale measured from it. */
const Probe = ({ width, height }: { readonly width: number; readonly height: number }): React.JSX.Element => {
  const container = useRef<HTMLDivElement | null>(null)
  latestScale = useBookScale(container)
  return (
    <div
      ref={(element) => {
        if (element !== null) sizeOf(element, width, height)
        container.current = element
      }}
    />
  )
}

/** A probe whose container ref is never attached, so the hook has nothing to measure. */
const DetachedProbe = (): null => {
  const container = useRef<HTMLDivElement | null>(null)
  latestScale = useBookScale(container)
  return null
}

/** jsdom lays nothing out, so an element's reported box has to be declared rather than measured. */
const sizeOf = (element: Element, width: number, height: number): void => {
  Object.defineProperty(element, 'clientWidth', { configurable: true, value: width })
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: height })
}

const roots: Root[] = []

const mount = (element: React.JSX.Element): { readonly root: Root; readonly container: HTMLElement } => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => {
    root.render(element)
  })
  return { root, container }
}

/** Lets the queued animation frame run and flushes the render it causes. */
const nextFrame = async (): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50))
  })
}

/** What the most recently constructed stand-in observer was asked to do. */
interface ObserverStandIn {
  /** Every element the hook called `observe()` with. */
  readonly observed: Element[]
  /** How many times the hook called `disconnect()`. */
  disconnects: number
  /** Fires the observer's callback, as a real container resize would. */
  notify: () => void
}

/** Installs a `ResizeObserver` stand-in — jsdom ships none — and reports what it was asked to do. */
const stubResizeObserver = (): ObserverStandIn => {
  const record: ObserverStandIn = {
    observed: [],
    disconnects: 0,
    notify: () => undefined,
  }
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

afterEach(() => {
  for (const root of roots) {
    act(() => {
      root.unmount()
    })
  }
  roots.length = 0
  latestScale = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  Reflect.deleteProperty(globalThis, 'ResizeObserver')
})

describe('useBookScale', () => {
  it('measures the container on mount and scales the design box to fit it', () => {
    mount(<Probe width={1300} height={860} />)

    expect(latestScale).toBe(1)
  })

  it('caps the scale on a very large display rather than letting the book outgrow its chrome', () => {
    mount(<Probe width={3900} height={2580} />)

    expect(latestScale).toBe(1.7)
  })

  it('keeps the book on screen when the container reports no size at all', () => {
    mount(<Probe width={0} height={0} />)

    expect(latestScale).toBe(0.05)
  })

  it('leaves the scale at rest when there is no container to measure', () => {
    mount(<DetachedProbe />)

    expect(latestScale).toBe(1)
  })

  it('re-measures when the window is resized', async () => {
    const { container } = mount(<Probe width={1300} height={860} />)
    const measured = container.firstElementChild
    if (measured === null) throw new Error('the probe rendered no container')

    sizeOf(measured, 650, 430)
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })
    await nextFrame()

    expect(latestScale).toBe(0.5)
  })

  it('collapses a burst of resize events into a single animation frame', () => {
    const frames = vi.spyOn(globalThis, 'requestAnimationFrame')
    mount(<Probe width={1300} height={860} />)
    const framesBefore = frames.mock.calls.length

    act(() => {
      for (let event = 0; event < 8; event += 1) window.dispatchEvent(new Event('resize'))
    })

    expect(frames.mock.calls.length).toBe(framesBefore + 1)
  })

  it('re-measures when a ResizeObserver reports the container changed', async () => {
    const observer = stubResizeObserver()
    const { container } = mount(<Probe width={1300} height={860} />)
    const measured = container.firstElementChild
    if (measured === null) throw new Error('the probe rendered no container')

    sizeOf(measured, 650, 430)
    act(() => {
      observer.notify()
    })
    await nextFrame()

    expect(latestScale).toBe(0.5)
  })

  it('observes the container itself, not the window', () => {
    const observer = stubResizeObserver()
    const { container } = mount(<Probe width={1300} height={860} />)

    expect(observer.observed).toEqual([container.firstElementChild])
  })

  it('disconnects its observer when the book unmounts', () => {
    const observer = stubResizeObserver()
    const { root } = mount(<Probe width={1300} height={860} />)

    act(() => {
      root.unmount()
    })
    roots.length = 0

    expect(observer.disconnects).toBe(1)
  })

  it('stops listening for resizes when the book unmounts', async () => {
    const { root, container } = mount(<Probe width={1300} height={860} />)
    const measured = container.firstElementChild
    if (measured === null) throw new Error('the probe rendered no container')
    act(() => {
      root.unmount()
    })
    roots.length = 0
    const scaleAtUnmount = latestScale

    sizeOf(measured, 650, 430)
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })
    await nextFrame()

    expect(latestScale).toBe(scaleAtUnmount)
  })
})
