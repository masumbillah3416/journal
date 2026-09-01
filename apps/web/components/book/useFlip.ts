/**
 * useFlip — the React binding around the page-turn state machine.
 *
 * Adapter (CLAUDE.md §3.3, Ports & Adapters applied to time): the machine in
 * `@travel-diary/domain/flip` is a pure reducer over an injected clock, and
 * this hook is the one place a real clock is injected into it. Everything the
 * flip actually decides — when the transition starts, when the faces swap,
 * when the index commits, when the latch releases — lives in that reducer and
 * is unit-tested to 100% with no browser. This file only supplies time and
 * React state.
 *
 * Time arrives from a SINGLE `requestAnimationFrame` loop feeding
 * `{ type: 'tick', now }`, never from chained `setTimeout`s. Because the
 * machine derives every phase boundary from elapsed time rather than from
 * having been woken at exactly the right moment, one loop covers all four of
 * the handoff's timers and a dropped frame — or a backgrounded tab, where
 * frames stop entirely — costs nothing: the next tick, however late, still
 * lands past the commit boundary and commits. Chained timers would have to be
 * cancelled and re-armed on every interruption to get the same property.
 *
 * The loop starts when the machine goes busy and STOPS when it settles. A rAF
 * loop that keeps running on an idle book is a battery cost with no
 * behaviour, which is why `useFlip.test.tsx` asserts the frame count stops
 * growing rather than merely that the page changed.
 *
 * `jumpTo` is the one place this file composes the machine rather than merely
 * driving it, and the composition is the handoff's own rule (README,
 * "Triggers"): "Bookmark jumps set an anchor page one step from the target,
 * then flip, so the animation always plays in the right direction." See its
 * own doc comment for what goes wrong without it, and for why the latch is
 * still the only thing deciding whether a jump happens at all.
 *
 * Depends on: react, and `flipReducer`/`initialFlipState`/`FlipState` from
 * `@travel-diary/domain/flip`.
 */
import { flipReducer, initialFlipState, type FlipState } from '@travel-diary/domain/flip'
import { useCallback, useEffect, useState } from 'react'

/**
 * The handoff's default page-turn duration ("Duration default 900ms, range
 * 400–1600"). The reader-configurable value lives on the `book` global and
 * reaches the diary in a later task; until then every book turns at the
 * handoff's own default.
 */
export const DEFAULT_FLIP_DURATION_MS = 900

/** What the book needs to know to run a turn. */
export interface FlipConfiguration {
  /** How long one page takes to turn, in milliseconds. 400–1600, default {@link DEFAULT_FLIP_DURATION_MS}. */
  readonly durationMs: number
  /** True when the reader has asked for reduced motion; the page then changes with no rotation and no shade. */
  readonly reducedMotion: boolean
  /** How many pages the book has, so a turn to a page that does not exist can be refused. */
  readonly totalPages: number
}

/** The book's current position, and the only four things a trigger needs to know about it. */
export interface FlipController {
  /** The machine's current state, ready to be handed to `leafPresentation` for each leaf. */
  readonly state: FlipState
  /** Asks the book to turn to a 0-based page index. Refused while a turn is in flight, or for a page outside the book. */
  readonly turnTo: (index: number) => void
  /** Asks the book to jump to a 0-based page index the way a bookmark tab does: anchored, then turned. Same refusals as {@link turnTo}. */
  readonly jumpTo: (index: number) => void
  /** Whether a page exists before the current one. */
  readonly canGoBack: boolean
  /** Whether a page exists after the current one. */
  readonly canGoForward: boolean
}

/**
 * Drives the page-turn machine from a single animation-frame loop.
 *
 * @param initialIndex - The 0-based page the book opens on.
 * @param config - Turn duration, the reader's reduced-motion preference, and the book's length.
 * @returns The machine's state plus the four things a trigger needs (see {@link FlipController}).
 * @example
 * const { state, turnTo, jumpTo, canGoForward } = useFlip(0, { durationMs: 900, reducedMotion: false, totalPages: 33 })
 */
export const useFlip = (initialIndex: number, config: FlipConfiguration): FlipController => {
  const { durationMs, reducedMotion, totalPages } = config
  const [state, setState] = useState<FlipState>(() => initialFlipState(initialIndex))

  const turnTo = useCallback(
    (index: number): void => {
      // The machine has no concept of how long the book is, so a request for
      // a page that does not exist would commit to an index no leaf occupies.
      // Refusing here keeps that state unrepresentable rather than leaving
      // `leafPresentation` to clamp its way out of it afterwards.
      if (index < 0 || index >= totalPages) return

      setState((previous) =>
        flipReducer(previous, { type: 'start', to: index, now: performance.now() }, { durationMs, reducedMotion }),
      )
    },
    [durationMs, reducedMotion, totalPages],
  )

  /**
   * A bookmark jump: land on an anchor one page from the target, then turn
   * the single leaf between them.
   *
   * Without the anchor, a jump from page 30 to page 3 hands the machine
   * `from: 29, to: 2` — one turn spanning twenty-seven leaves. `leafPresentation`
   * then re-lays the whole stack against the new target in a single frame
   * while animating a leaf across a distance no page turn ever covers, and the
   * reader sees the book unravel rather than a page turn backwards. Anchoring
   * makes every jump, however far, the same one-leaf turn the rest of the book
   * already performs, played in the direction of travel — which is exactly
   * what the handoff asks for.
   *
   * The latch stays the only authority on whether a jump happens. The request
   * is put to the reducer FIRST against the state the book is actually in, and
   * only re-issued from the anchor if the reducer accepted it; a jump arriving
   * mid-turn, or aimed at the page already open, comes back as the same state
   * object and is dropped here too. Anchoring first and asking afterwards
   * would have let a bookmark tab walk straight through a turn in flight.
   */
  const jumpTo = useCallback(
    (index: number): void => {
      if (index < 0 || index >= totalPages) return

      setState((previous) => {
        const request = { type: 'start', to: index, now: performance.now() } as const
        const machine = { durationMs, reducedMotion }

        const asked = flipReducer(previous, request, machine)
        if (asked === previous) return previous

        // One step from the target, on the side the reader is arriving from,
        // so `dir` comes out the same as it would for a neighbouring page.
        const anchor = index > previous.index ? index - 1 : index + 1
        return flipReducer(initialFlipState(anchor), request, machine)
      })
    },
    [durationMs, reducedMotion, totalPages],
  )

  useEffect(() => {
    if (!state.busy) return undefined

    // Deliberately `performance.now()` rather than the timestamp
    // `requestAnimationFrame` hands the callback. The two share a time origin
    // in a real browser, but not everywhere - jsdom's frame timestamps run on
    // their own origin, hundreds of milliseconds adrift of its
    // `performance.now()` (measured: 79ms against 728ms in the same tick).
    // The reducer measures elapsed time against a `startedAt` set from
    // `performance.now()` in `turnTo`, so mixing the two would make every
    // `elapsed` negative and park the machine in `arming` forever. One clock,
    // read in both places, is the only version that is correct by
    // construction rather than by coincidence.
    let frame = requestAnimationFrame(function tick(): void {
      setState((previous) =>
        flipReducer(previous, { type: 'tick', now: performance.now() }, { durationMs, reducedMotion }),
      )
      frame = requestAnimationFrame(tick)
    })

    return () => {
      cancelAnimationFrame(frame)
    }
    // `state.busy`, not `state`: the loop must survive every phase change
    // within one turn (arming, turning, swapped) and be torn down only when
    // the book settles. Depending on the whole state would cancel and
    // re-request a frame on every tick.
  }, [state.busy, durationMs, reducedMotion])

  return {
    state,
    turnTo,
    jumpTo,
    canGoBack: state.index > 0,
    canGoForward: state.index < totalPages - 1,
  }
}

/**
 * Reads the reader's `prefers-reduced-motion` setting, and follows it if they
 * change it while the book is open.
 *
 * Starts at `false` so the server's render and the client's first render
 * agree — reading the media query during render would hydrate a page the
 * server could not have produced. The real preference lands on the first
 * effect, before any turn can be requested.
 *
 * @returns True when the reader has asked for reduced motion.
 */
export const usePrefersReducedMotion = (): boolean => {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    // Guarded because `matchMedia` is not universal: jsdom ships none, and a
    // hook that assumed it would throw during any component test rather than
    // simply reporting no preference.
    if (typeof window.matchMedia !== 'function') return undefined

    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(query.matches)

    const follow = (event: MediaQueryListEvent): void => {
      setReduced(event.matches)
    }
    query.addEventListener('change', follow)
    return () => {
      query.removeEventListener('change', follow)
    }
  }, [])

  return reduced
}
