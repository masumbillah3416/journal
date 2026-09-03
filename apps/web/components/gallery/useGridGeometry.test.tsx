/**
 * useGridGeometry.test.tsx — behaviour of the gallery grid's measurement
 * binding.
 *
 * `tileWindow` itself (`packages/domain/src/gallery.ts`) is unit-tested to
 * 100%, including the threshold and the overscan; nothing here re-tests that
 * arithmetic. What is tested here is only what the binding adds: that the
 * grid is measured on mount, re-measured on scroll and through a
 * `ResizeObserver`, that a burst of scroll events collapses into a single
 * animation frame rather than one layout read each (CLAUDE.md §6), that both
 * subscriptions are released on unmount, and - the case that actually matters
 * for the budget - that a gallery below the windowing threshold subscribes to
 * NOTHING.
 *
 * jsdom reports every element as 0x0 and ships no `ResizeObserver`, so boxes
 * are declared per test and the observer is stood in. Both are browser APIs,
 * not our own modules, so standing them in is not the mocking CLAUDE.md §2.3
 * forbids - the same treatment, for the same reason, that
 * `useBookScale.test.tsx` gives them.
 * Depends on: react, react-dom/client, vitest (jsdom environment).
 */
import { act, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { UNMEASURED, useGridGeometry, type GridGeometry } from './useGridGeometry'

/** The geometry from the most recent render of {@link Probe}. */
let latest: GridGeometry = UNMEASURED

/** jsdom lays nothing out, so an element's reported box has to be declared. */
const boxOf = (element: Element, box: { x: number; y: number; width: number; height: number }): void => {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ ...box, top: box.y, left: box.x, right: box.x + box.width, bottom: box.y + box.height }),
  })
}

/** Renders a grid of a declared size holding one tile of a declared size. */
const Probe = ({
  enabled,
  gridBox,
  tileBox,
}: {
  readonly enabled: boolean
  readonly gridBox: { x: number; y: number; width: number; height: number }
  readonly tileBox: { x: number; y: number; width: number; height: number } | null
}): React.JSX.Element => {
  const grid = useRef<HTMLDivElement | null>(null)
  latest = useGridGeometry(grid, enabled)
  return (
    <div
      ref={(element) => {
        if (element !== null) boxOf(element, gridBox)
        grid.current = element
      }}
    >
      {tileBox !== null && (
        <span
          data-tile="one"
          ref={(element) => {
            if (element !== null) boxOf(element, tileBox)
          }}
        />
      )}
    </div>
  )
}

const roots: Root[] = []

/** The stand-in observer's instances, so a case can drive a resize. */
let observers: { callback: () => void; observed: number; disconnected: number }[] = []

/** Installs a stand-in `ResizeObserver`, since jsdom ships none. */
const standInResizeObserver = (): void => {
  observers = []
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    writable: true,
    value: class {
      constructor(callback: () => void) {
        observers.push({ callback, observed: 0, disconnected: 0 })
      }
      observe(): void {
        const entry = observers.at(-1)
        if (entry !== undefined) entry.observed += 1
      }
      disconnect(): void {
        const entry = observers.at(-1)
        if (entry !== undefined) entry.disconnected += 1
      }
    },
  })
}

/**
 * Mounts a probe and hands back its root.
 * @param element - The probe to render.
 * @returns The React root, so a case can unmount it.
 */
const mount = (element: React.JSX.Element): Root => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(element)
  })
  return root
}

/** A four-across grid of 200px tiles, scrolled to the top. */
const AT_REST = {
  gridBox: { x: 0, y: 0, width: 848, height: 4000 },
  tileBox: { x: 0, y: 0, width: 200, height: 200 },
}

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount()
  })
  document.body.replaceChildren()
  latest = UNMEASURED
  Reflect.deleteProperty(globalThis, 'ResizeObserver')
  vi.restoreAllMocks()
})

describe('useGridGeometry', () => {
  it('measures nothing at all for a gallery below the windowing threshold', () => {
    const listen = vi.spyOn(window, 'addEventListener')

    mount(<Probe enabled={false} {...AT_REST} />)

    expect(latest).toEqual(UNMEASURED)
    expect(listen.mock.calls.filter(([type]) => type === 'scroll')).toEqual([])
  })

  it('counts how many tiles the browser actually fitted across', () => {
    // 848px of grid, 200px tiles, 16px gaps: four across.
    mount(<Probe enabled {...AT_REST} />)

    expect(latest.columns).toBe(4)
  })

  it('measures a row as a tile plus the row gap beneath it', () => {
    mount(<Probe enabled {...AT_REST} />)

    expect(latest.rowHeight).toBe(218)
  })

  it('reads how far the reader has scrolled into the grid from the grid’s own box', () => {
    mount(<Probe enabled gridBox={{ x: 0, y: -900, width: 848, height: 4000 }} tileBox={AT_REST.tileBox} />)

    expect(latest.scrollTop).toBe(900)
  })

  it('reports a grid scrolled back above the fold as scrolled to nothing, never a negative', () => {
    mount(<Probe enabled gridBox={{ x: 0, y: 120, width: 848, height: 4000 }} tileBox={AT_REST.tileBox} />)

    expect(latest.scrollTop).toBe(0)
  })

  it('reports no grid at all before there is a tile to measure one from', () => {
    // Zero columns and zero row height are what `tileWindow` reads as "render
    // everything" - the correct answer to an unmeasured grid, and the reason
    // a gallery does not paint empty on its first frame.
    mount(<Probe enabled gridBox={AT_REST.gridBox} tileBox={null} />)

    expect(latest).toMatchObject({ columns: 0, rowHeight: 0 })
  })

  it('reports no grid for a tile the browser has given no width', () => {
    mount(<Probe enabled gridBox={AT_REST.gridBox} tileBox={{ x: 0, y: 0, width: 0, height: 0 }} />)

    expect(latest).toMatchObject({ columns: 0, rowHeight: 0 })
  })

  it('reads the layout inside an animation frame rather than once per scroll event', () => {
    // CLAUDE.md §6 forbids a layout read per event. The measurement is
    // deferred into a frame and the previous one is cancelled, so a burst of
    // five events leaves one measurement pending, not five.
    const measurements: FrameRequestCallback[] = []
    let cancelled = 0
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      measurements.push(callback)
      return measurements.length
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {
      cancelled += 1
    })
    mount(<Probe enabled {...AT_REST} />)

    act(() => {
      for (let scroll = 0; scroll < 5; scroll += 1) window.dispatchEvent(new Event('scroll'))
    })

    expect(measurements).toHaveLength(5)
    expect(cancelled).toBe(5)
  })

  it('re-measures through a ResizeObserver on the grid itself', () => {
    standInResizeObserver()
    mount(<Probe enabled {...AT_REST} />)

    expect(observers[0]?.observed).toBe(1)
  })

  it('releases the observer and the listener on unmount', () => {
    standInResizeObserver()
    const unlisten = vi.spyOn(window, 'removeEventListener')
    const root = mount(<Probe enabled {...AT_REST} />)

    act(() => {
      root.unmount()
    })
    roots.splice(roots.indexOf(root), 1)

    expect(observers[0]?.disconnected).toBe(1)
    expect(unlisten.mock.calls.filter(([type]) => type === 'scroll')).toHaveLength(1)
  })

  it('still measures on a browser with no ResizeObserver at all', () => {
    // The observer is a progressive enhancement over the scroll and resize
    // listeners, not a requirement - its absence must degrade, not throw.
    expect(() => mount(<Probe enabled {...AT_REST} />)).not.toThrow()
    expect(latest.columns).toBe(4)
  })

  it('measures nothing from a ref that was never attached', () => {
    const Detached = (): null => {
      const grid = useRef<HTMLDivElement | null>(null)
      latest = useGridGeometry(grid, true)
      return null
    }
    mount(<Detached />)

    expect(latest).toEqual(UNMEASURED)
  })
})
