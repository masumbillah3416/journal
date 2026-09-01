/**
 * flip — the page-turn state machine.
 *
 * State machine pattern: a pure reducer over an injected clock, so the timing,
 * the face swap and the busy latch are unit-tested with no browser and no
 * timers. The handoff specifies four explicit timers and "a `_busy` latch that
 * always releases"; expressing that as phases derived from elapsed time makes a
 * seized book unrepresentable rather than a bug to hunt. Depends on nothing.
 */

/** Delay before `go` flips true, so the browser has a frame to attach the transition to. */
export const ARM_MS = 30
/** Grace after the transition ends, before the index commits. */
export const SETTLE_MS = 40

/** Where a turn currently is in its lifecycle. */
export type FlipPhase = 'idle' | 'arming' | 'turning' | 'swapped' | 'committing'
/** Which way the leaf is travelling. */
export type FlipDirection = 'forward' | 'backward'

/** The complete state of the page stack at one instant. */
export interface FlipState {
  readonly phase: FlipPhase
  readonly index: number
  readonly from: number | null
  readonly to: number | null
  readonly dir: FlipDirection | null
  /** Drives the CSS transform; false during `arming` so the transition animates. */
  readonly go: boolean
  /** True past the midpoint: front and back faces swap opacity here. */
  readonly half: boolean
  /** The latch. True from `start` until the turn commits. */
  readonly busy: boolean
  readonly startedAt: number | null
}

/** What can happen to the machine. */
export type FlipEvent =
  | { readonly type: 'start'; readonly to: number; readonly now: number }
  | { readonly type: 'tick'; readonly now: number }

/** Reader-configurable behaviour. */
export interface FlipConfig {
  /** 400-1600, default 900, from the `book` global. */
  readonly durationMs: number
  /** When true, the page changes instantly with no rotation and no shade. */
  readonly reducedMotion: boolean
}

/** A settled machine resting on `index`. */
export const initialFlipState = (index: number): FlipState => ({
  phase: 'idle',
  index,
  from: null,
  to: null,
  dir: null,
  go: false,
  half: false,
  busy: false,
  startedAt: null,
})

const settled = (index: number): FlipState => initialFlipState(index)

/**
 * Advances the machine.
 * @param state - Current state.
 * @param event - A `start` request or a clock tick.
 * @param config - Duration and reduced-motion preference.
 * @returns The next state, or the same object when nothing changes.
 */
export const flipReducer = (state: FlipState, event: FlipEvent, config: FlipConfig): FlipState => {
  if (event.type === 'start') {
    // The latch. A turn in flight swallows further requests, which is what
    // stops a fast reader double-turning past a page.
    if (state.busy || event.to === state.index) return state
    if (config.reducedMotion) return settled(event.to)

    return {
      phase: 'arming',
      index: state.index,
      from: state.index,
      to: event.to,
      dir: event.to > state.index ? 'forward' : 'backward',
      go: false,
      half: false,
      busy: true,
      startedAt: event.now,
    }
  }

  if (state.startedAt === null || state.to === null) return state

  const elapsed = event.now - state.startedAt
  const halfAt = ARM_MS + config.durationMs / 2
  const commitAt = ARM_MS + config.durationMs + SETTLE_MS

  // Ordered latest-first so an overshooting tick — a backgrounded tab, a
  // dropped frame — still commits rather than stranding the latch.
  if (elapsed >= commitAt) return settled(state.to)
  if (elapsed >= halfAt) return state.half ? state : { ...state, phase: 'swapped', half: true }
  if (elapsed >= ARM_MS) return state.go ? state : { ...state, phase: 'turning', go: true }
  return state
}
