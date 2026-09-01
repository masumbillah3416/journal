import { describe, expect, it } from 'vitest'
import { ARM_MS, SETTLE_MS, flipReducer, initialFlipState, type FlipState } from './flip'

const config = { durationMs: 900, reducedMotion: false }
const start = (state: FlipState, to: number, now = 0): FlipState =>
  flipReducer(state, { type: 'start', to, now }, config)
const tick = (state: FlipState, now: number): FlipState =>
  flipReducer(state, { type: 'tick', now }, config)

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
    const reduced = flipReducer(initialFlipState(3), { type: 'start', to: 4, now: 0 }, {
      durationMs: 900,
      reducedMotion: true,
    })

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
})
