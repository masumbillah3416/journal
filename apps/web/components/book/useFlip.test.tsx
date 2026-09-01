/**
 * useFlip.test.tsx — behaviour of the React binding around the flip machine.
 *
 * The machine itself (`packages/domain/src/flip.ts`) is unit-tested to 100%
 * against an injected clock, and nothing here re-tests it. What is tested
 * here is only what the binding adds: that a single `requestAnimationFrame`
 * loop drives the machine, that the loop starts on a turn and STOPS when the
 * book settles (a rAF that spins forever is a battery defect no assertion
 * about the reducer would catch), that it is cancelled on unmount, that a
 * turn to a page outside the book is refused, and that the reader's
 * reduced-motion preference is read from the browser rather than assumed.
 *
 * Durations here are deliberately tiny — 40ms rather than the handoff's 900ms
 * default — so each case waits out a real frame budget in a fraction of a
 * second. The machine is time-based, so a short duration exercises exactly
 * the same code path as a long one.
 * Depends on: react, react-dom/client, vitest (jsdom environment via the
 * `unit-dom` project, whose setup file sets IS_REACT_ACT_ENVIRONMENT).
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { type FlipConfiguration, type FlipController, useFlip, usePrefersReducedMotion } from './useFlip'

/** The controller returned by the most recent render of {@link Probe}. */
let latest: FlipController | null = null

/** A component with no markup, whose only job is to expose the hook's return value to the test. */
const Probe = ({
  initialIndex,
  config,
}: {
  readonly initialIndex: number
  readonly config: FlipConfiguration
}): null => {
  latest = useFlip(initialIndex, config)
  return null
}

/** The reduced-motion flag from the most recent render of {@link MotionProbe}. */
let latestReducedMotion: boolean | null = null

/** The equivalent probe for {@link usePrefersReducedMotion}. */
const MotionProbe = (): null => {
  latestReducedMotion = usePrefersReducedMotion()
  return null
}

const roots: Root[] = []

/** Mounts a component into a real document and records its root for teardown. */
const mount = (element: React.JSX.Element): Root => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => {
    root.render(element)
  })
  return root
}

/** Lets `ms` of real time — and the animation frames inside it — pass, flushing React's work. */
const elapse = async (ms: number): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms))
  })
}

/** The controller, asserted present so no test needs a non-null assertion (CLAUDE.md §3.1). */
const controller = (): FlipController => {
  if (latest === null) throw new Error('the probe has not rendered')
  return latest
}

/** Factory with overridable defaults (CLAUDE.md §2.3) for the hook's configuration. */
const aConfig = (overrides: Partial<FlipConfiguration> = {}): FlipConfiguration => ({
  durationMs: 40,
  reducedMotion: false,
  totalPages: 33,
  ...overrides,
})

/** A `matchMedia` stand-in for a browser API jsdom does not implement; never a mock of our own code. */
const stubMatchMedia = (options: {
  readonly matches: boolean
  readonly onAdd?: (listener: (event: MediaQueryListEvent) => void) => void
  readonly onRemove?: (type: string) => void
}): void => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({
      matches: options.matches,
      addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        options.onAdd?.(listener)
      },
      removeEventListener: (type: string) => {
        options.onRemove?.(type)
      },
    }),
  })
}

afterEach(() => {
  for (const root of roots) {
    act(() => {
      root.unmount()
    })
  }
  roots.length = 0
  latest = null
  latestReducedMotion = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  Reflect.deleteProperty(window, 'matchMedia')
})

describe('useFlip', () => {
  it('rests on the page it was given, with no turn in flight', () => {
    mount(<Probe initialIndex={4} config={aConfig()} />)

    expect(controller().state).toMatchObject({ phase: 'idle', index: 4, busy: false })
  })

  it('arms a turn the moment the reader asks for one, before any frame has run', () => {
    mount(<Probe initialIndex={4} config={aConfig()} />)

    act(() => {
      controller().turnTo(5)
    })

    expect(controller().state).toMatchObject({ phase: 'arming', index: 4, from: 4, to: 5, dir: 'forward', busy: true })
  })

  it('commits the new page once the turn has run its course', async () => {
    mount(<Probe initialIndex={4} config={aConfig()} />)

    act(() => {
      controller().turnTo(5)
    })
    await elapse(250)

    expect(controller().state).toMatchObject({ phase: 'idle', index: 5, busy: false })
  })

  it('swallows a second turn requested while the first is still in flight', async () => {
    mount(<Probe initialIndex={4} config={aConfig()} />)

    act(() => {
      controller().turnTo(5)
      controller().turnTo(6)
    })
    await elapse(250)

    expect(controller().state.index).toBe(5)
  })

  it('refuses a turn to a page past the end of the book', () => {
    mount(<Probe initialIndex={4} config={aConfig()} />)

    act(() => {
      controller().turnTo(33)
    })

    expect(controller().state).toMatchObject({ phase: 'idle', index: 4, busy: false })
  })

  it('refuses a turn to a page before the start of the book', () => {
    mount(<Probe initialIndex={4} config={aConfig()} />)

    act(() => {
      controller().turnTo(-1)
    })

    expect(controller().state).toMatchObject({ phase: 'idle', index: 4, busy: false })
  })

  it('changes the page instantly when the reader prefers reduced motion', () => {
    mount(<Probe initialIndex={4} config={aConfig({ reducedMotion: true })} />)

    act(() => {
      controller().turnTo(5)
    })

    expect(controller().state).toMatchObject({ phase: 'idle', index: 5, busy: false })
  })

  it('anchors a backward bookmark jump one page after its target, so the turn plays backwards', () => {
    // THE ANCHOR RULE (handoff README, "Triggers"): "Bookmark jumps set an
    // anchor page one step from the target, then flip, so the animation
    // always plays in the right direction." Without it, a jump from page 30
    // to page 3 hands the machine `from: 29, to: 2` - a single turn spanning
    // twenty-seven leaves, which re-lays the entire stack in one frame and
    // animates a leaf across a distance no page turn ever covers.
    mount(<Probe initialIndex={29} config={aConfig()} />)

    act(() => {
      controller().jumpTo(2)
    })

    expect(controller().state).toMatchObject({ from: 3, to: 2, dir: 'backward', busy: true })
  })

  it('anchors a forward bookmark jump one page before its target, so the turn plays forwards', () => {
    mount(<Probe initialIndex={2} config={aConfig()} />)

    act(() => {
      controller().jumpTo(29)
    })

    expect(controller().state).toMatchObject({ from: 28, to: 29, dir: 'forward', busy: true })
  })

  it('lands a bookmark jump on the page the tab addresses, not on its anchor', () => {
    // The anchor is a staging post for the animation, never a destination:
    // an implementation that flipped to the anchor and stopped would satisfy
    // the direction assertions above and still take the reader to the wrong
    // page.
    mount(<Probe initialIndex={29} config={aConfig()} />)

    act(() => {
      controller().jumpTo(2)
    })

    expect(controller().state.to).toBe(2)
  })

  it('commits a bookmark jump to its target once the turn has run its course', async () => {
    mount(<Probe initialIndex={29} config={aConfig()} />)

    act(() => {
      controller().jumpTo(2)
    })
    await elapse(250)

    expect(controller().state).toMatchObject({ phase: 'idle', index: 2, busy: false })
  })

  it('swallows a bookmark jump requested while a turn is still in flight', async () => {
    // Through the machine's own latch, not a second guard on top of it: the
    // request is put to the reducer against the state the book is actually
    // in, and only re-issued from an anchor if the reducer accepted it.
    mount(<Probe initialIndex={4} config={aConfig()} />)

    act(() => {
      controller().turnTo(5)
      controller().jumpTo(20)
    })
    await elapse(250)

    expect(controller().state.index).toBe(5)
  })

  it('refuses a bookmark jump to a page outside the book', () => {
    mount(<Probe initialIndex={4} config={aConfig()} />)

    act(() => {
      controller().jumpTo(33)
    })

    expect(controller().state).toMatchObject({ phase: 'idle', index: 4, busy: false })
  })

  it('refuses a bookmark jump to the page already open, so a tab cannot re-turn its own page', () => {
    mount(<Probe initialIndex={4} config={aConfig()} />)

    act(() => {
      controller().jumpTo(4)
    })

    expect(controller().state).toMatchObject({ phase: 'idle', index: 4, busy: false })
  })

  it('changes the page instantly on a bookmark jump when the reader prefers reduced motion', () => {
    mount(<Probe initialIndex={29} config={aConfig({ reducedMotion: true })} />)

    act(() => {
      controller().jumpTo(2)
    })

    expect(controller().state).toMatchObject({ phase: 'idle', index: 2, busy: false })
  })

  it('reports that the reader cannot go back from the first page', () => {
    mount(<Probe initialIndex={0} config={aConfig()} />)

    expect(controller()).toMatchObject({ canGoBack: false, canGoForward: true })
  })

  it('reports that the reader cannot go forward from the last page', () => {
    mount(<Probe initialIndex={32} config={aConfig()} />)

    expect(controller()).toMatchObject({ canGoBack: true, canGoForward: false })
  })

  it('asks for animation frames while a turn is in flight', async () => {
    const frames = vi.spyOn(globalThis, 'requestAnimationFrame')
    mount(<Probe initialIndex={4} config={aConfig({ durationMs: 400 })} />)
    const framesBefore = frames.mock.calls.length

    act(() => {
      controller().turnTo(5)
    })
    await elapse(80)

    expect(frames.mock.calls.length).toBeGreaterThan(framesBefore)
  })

  it('stops asking for animation frames once the book has settled', async () => {
    const frames = vi.spyOn(globalThis, 'requestAnimationFrame')
    mount(<Probe initialIndex={4} config={aConfig()} />)

    act(() => {
      controller().turnTo(5)
    })
    await elapse(250)
    const framesAtRest = frames.mock.calls.length
    await elapse(120)

    expect(frames.mock.calls.length).toBe(framesAtRest)
  })

  it('cancels its animation frame when the book unmounts mid-turn', async () => {
    const cancels = vi.spyOn(globalThis, 'cancelAnimationFrame')
    const root = mount(<Probe initialIndex={4} config={aConfig({ durationMs: 400 })} />)

    act(() => {
      controller().turnTo(5)
    })
    await elapse(50)
    act(() => {
      root.unmount()
    })
    roots.length = 0

    expect(cancels).toHaveBeenCalled()
  })
})

describe('usePrefersReducedMotion', () => {
  it('reports no preference in an environment with no media-query support at all', () => {
    mount(<MotionProbe />)

    expect(latestReducedMotion).toBe(false)
  })

  it('reports the reader prefers reduced motion when the media query already matches', () => {
    stubMatchMedia({ matches: true })

    mount(<MotionProbe />)

    expect(latestReducedMotion).toBe(true)
  })

  it('follows the preference when the reader changes it while the book is open', () => {
    const listeners: ((event: MediaQueryListEvent) => void)[] = []
    stubMatchMedia({
      matches: false,
      onAdd: (listener) => {
        listeners.push(listener)
      },
    })
    mount(<MotionProbe />)

    act(() => {
      for (const listener of listeners) listener({ matches: true } as MediaQueryListEvent)
    })

    expect(latestReducedMotion).toBe(true)
  })

  it('stops listening to the preference when the book unmounts', () => {
    const removed: string[] = []
    stubMatchMedia({
      matches: false,
      onRemove: (type) => {
        removed.push(type)
      },
    })
    const root = mount(<MotionProbe />)

    act(() => {
      root.unmount()
    })
    roots.length = 0

    expect(removed).toEqual(['change'])
  })
})
