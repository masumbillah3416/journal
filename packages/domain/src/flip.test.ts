import { describe, expect, it } from 'vitest'
import { ARM_MS, SETTLE_MS, flipReducer, initialFlipState, type FlipState } from './flip'

const config = { durationMs: 900, reducedMotion: false }
const start = (state: FlipState, to: number, now = 0): FlipState =>
  flipReducer(state, { type: 'start', to, now }, config)
const tick = (state: FlipState, now: number): FlipState => flipReducer(state, { type: 'tick', now }, config)
const jump = (state: FlipState, to: number, now = 0): FlipState => flipReducer(state, { type: 'jump', to, now }, config)

describe('flipReducer', () => {
  it('arms without moving, so the CSS transition has a frame to attach to', () => {
    const armed = start(initialFlipState(3), 4)

    expect(armed).toMatchObject({ phase: 'arming', go: false, half: false, busy: true, dir: 'forward' })
    expect(armed.index).toBe(3)
  })

  it('sets go at the arm boundary, which is what starts the transition', () => {
    const turning = tick(start(initialFlipState(3), 4), ARM_MS)

    expect(turning).toMatchObject({ phase: 'turning', go: true, half: false })
  })

  it('swaps the faces at the midpoint, because backface-visibility produced blank pages', () => {
    let state = tick(start(initialFlipState(3), 4), ARM_MS)
    state = tick(state, ARM_MS + config.durationMs / 2)

    expect(state).toMatchObject({ phase: 'swapped', half: true })
  })

  it('commits the index and RELEASES THE LATCH at the end', () => {
    let state = start(initialFlipState(3), 4)
    state = tick(state, ARM_MS + config.durationMs + SETTLE_MS)

    expect(state).toMatchObject({ phase: 'idle', index: 4, busy: false, from: null, to: null, dir: null })
  })

  it('ignores a second start while busy, so the book cannot be double-turned', () => {
    const armed = start(initialFlipState(3), 4)
    const ignored = start(armed, 9, 10)

    expect(ignored).toBe(armed)
  })

  it('accepts a new start once the latch has released', () => {
    let state = start(initialFlipState(3), 4)
    state = tick(state, ARM_MS + config.durationMs + SETTLE_MS)

    expect(start(state, 5, 2000)).toMatchObject({ phase: 'arming', from: 4, to: 5, busy: true })
  })

  it('records a backward direction when turning back', () => {
    expect(start(initialFlipState(5), 4)).toMatchObject({ dir: 'backward' })
  })

  it('releases the latch for ANY tick at or beyond the commit point', () => {
    // The handoff requires a latch that "always releases". A tick that
    // overshoots — a backgrounded tab, a slow frame — must still commit.
    for (const overshoot of [0, 1, 500, 10_000, 1_000_000]) {
      let state = start(initialFlipState(3), 4)
      state = tick(state, ARM_MS + config.durationMs + SETTLE_MS + overshoot)

      expect(state.busy, `overshoot ${String(overshoot)}ms left the book seized`).toBe(false)
      expect(state.index).toBe(4)
    }
  })

  it('is idempotent once idle, so stray ticks cannot corrupt the index', () => {
    let state = start(initialFlipState(3), 4)
    state = tick(state, ARM_MS + config.durationMs + SETTLE_MS)
    const settled = state

    expect(tick(settled, 99_999)).toBe(settled)
  })

  it('commits immediately with no rotation when reduced motion is requested', () => {
    const reduced = flipReducer(
      initialFlipState(3),
      { type: 'start', to: 4, now: 0 },
      {
        durationMs: 900,
        reducedMotion: true,
      },
    )

    expect(reduced).toMatchObject({ phase: 'idle', index: 4, busy: false, go: false, half: false })
  })

  it('honours a short duration without reordering the phases', () => {
    const fast = { durationMs: 400, reducedMotion: false }
    let state = flipReducer(initialFlipState(0), { type: 'start', to: 1, now: 0 }, fast)
    state = flipReducer(state, { type: 'tick', now: ARM_MS + 200 }, fast)

    expect(state).toMatchObject({ phase: 'swapped', half: true })
  })

  // The three tests below close the branch-coverage gate (CLAUDE.md §2.1: 100%
  // branches on packages/domain/**). Each is the other side of a ternary/guard
  // the tests above never reach: a tick still inside the arm delay, a stray
  // re-tick after `go` is already set, and a stray re-tick after `half` is
  // already set. None of the eleven tests transcribed from the brief exercise
  // them, so without these the file sits at 85.71% branches, not the 100% the
  // brief's own "expected" line claims.

  it('ignores a tick before the arm boundary, so arming has a full frame to hold', () => {
    const armed = start(initialFlipState(3), 4)
    const early = tick(armed, ARM_MS - 1)

    expect(early).toBe(armed)
  })

  it('is idempotent mid-turn, so a stray tick after go cannot re-render for nothing', () => {
    const turning = tick(start(initialFlipState(3), 4), ARM_MS)
    const restruck = tick(turning, ARM_MS + 1)

    expect(restruck).toBe(turning)
  })

  it('is idempotent after the face swap, so a stray tick past the midpoint cannot re-render for nothing', () => {
    const turning = tick(start(initialFlipState(3), 4), ARM_MS)
    const swapped = tick(turning, ARM_MS + config.durationMs / 2)
    const restruck = tick(swapped, ARM_MS + config.durationMs / 2 + 1)

    expect(restruck).toBe(swapped)
  })

  it('releases the latch immediately for a broken duration, so a bad config cannot strand it either', () => {
    // A non-finite or non-positive durationMs makes every `elapsed >=
    // threshold` comparison false forever, which would otherwise park the
    // machine in `turning` with the latch stuck open. Reachable in practice:
    // flipDurationMs crosses a server-to-client serialization boundary
    // before reaching the reducer, and an unsaved global or a mapping slip
    // yields undefined, which coerces to NaN.
    for (const durationMs of [Number.NaN, 0, -100, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const broken = { durationMs, reducedMotion: false }
      let state = flipReducer(initialFlipState(3), { type: 'start', to: 4, now: 0 }, broken)
      state = flipReducer(state, { type: 'tick', now: 1 }, broken)

      expect(state.busy, `durationMs ${String(durationMs)} left the book seized`).toBe(false)
      expect(state.index).toBe(4)
    }
  })

  it('releases the latch immediately for a broken clock, so neither input can strand it', () => {
    // The duration guard above closes one half of the same seizure; this is
    // the other. `elapsed` is `now - startedAt`, so a non-finite value on
    // EITHER side makes every `elapsed >= threshold` comparison false forever.
    // `useFlip` passes `performance.now()`, which is finite by specification -
    // but `flipReducer` is exported from this package and its header promises
    // every caller that a seized book is unrepresentable, so the promise is
    // kept against the argument, not against the one call site that exists.
    const brokenTick = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]
    for (const now of brokenTick) {
      const turning = start(initialFlipState(3), 4)
      const struck = flipReducer(turning, { type: 'tick', now }, config)

      expect(struck.busy, `a tick at ${String(now)} left the book seized`).toBe(false)
      expect(struck.index).toBe(4)
    }

    // And from the other side: the turn itself started on a broken clock, so
    // `startedAt` is the non-finite half and the tick is ordinary.
    for (const now of brokenTick) {
      const turning = flipReducer(initialFlipState(3), { type: 'start', to: 4, now }, config)
      const struck = flipReducer(turning, { type: 'tick', now: ARM_MS }, config)

      expect(struck.busy, `a turn started at ${String(now)} left the book seized`).toBe(false)
      expect(struck.index).toBe(4)
    }
  })
})

describe('flipReducer, jumping', () => {
  it('anchors the page stack one leaf from its target, so a jump of twenty-seven leaves is drawn as one turn', () => {
    // THE ANCHOR RULE (handoff README, "Triggers"): "Bookmark jumps set an
    // anchor page one step from the target, then flip, so the animation
    // always plays in the right direction."
    const jumped = jump(initialFlipState(29), 2)

    expect(jumped).toMatchObject({ anchor: 3, from: 3, to: 2, dir: 'backward', busy: true })
  })

  it('leaves the reader on the page they came from until the jump commits, so nothing can publish the anchor', () => {
    // PH1-001 (docs/qa/2026-09-03-phase-1-closing-sweep.md). The anchor is an
    // ANIMATION DEVICE. Everything that names where the READER is - the
    // counter, the page label, the active rail tab and the address bar -
    // reads `index`, so an anchor committed there is published as a page the
    // reader never asked for.
    const jumped = jump(initialFlipState(29), 2)

    expect(jumped.index).toBe(29)
  })

  it('commits a jump to the page the tab addresses, never to the anchor it turned through', () => {
    const landed = tick(jump(initialFlipState(29), 2), ARM_MS + config.durationMs + SETTLE_MS)

    expect(landed).toMatchObject({ phase: 'idle', index: 2, anchor: 2, busy: false })
  })

  it('anchors a forward jump on the near side of its target, so the turn plays forwards', () => {
    const jumped = jump(initialFlipState(2), 29)

    expect(jumped).toMatchObject({ anchor: 28, from: 28, to: 29, dir: 'forward' })
  })

  it('ignores a jump while a turn is in flight, so a bookmark tab cannot walk through the latch', () => {
    const armed = start(initialFlipState(3), 4)

    expect(jump(armed, 20, 10)).toBe(armed)
  })

  it('ignores a jump to the page already open, so a tab cannot re-turn its own page', () => {
    const idle = initialFlipState(3)

    expect(jump(idle, 3)).toBe(idle)
  })

  it('changes the page instantly under reduced motion, with no anchor to pass through at all', () => {
    const instant = flipReducer(
      initialFlipState(29),
      { type: 'jump', to: 2, now: 0 },
      { ...config, reducedMotion: true },
    )

    expect(instant).toMatchObject({ phase: 'idle', index: 2, anchor: 2, busy: false })
  })
})
