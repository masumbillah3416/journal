/**
 * flip — the page-turn state machine.
 *
 * State machine pattern: a pure reducer over an injected clock, so the timing,
 * the face swap and the busy latch are unit-tested with no browser and no
 * timers. The handoff specifies four explicit timers and "a `_busy` latch that
 * always releases"; expressing that as phases derived from elapsed time makes a
 * seized book unrepresentable rather than a bug to hunt, for any tick at or
 * past the commit boundary, for any non-finite or non-positive
 * `config.durationMs`, AND for a non-finite `elapsed` however it arose (a
 * `NaN` on either side of the subtraction makes every `elapsed >= threshold`
 * comparison false, which would otherwise park the machine in `turning`
 * forever) — see the two guards in the `tick` branch below.
 *
 * TWO POSITIONS, DELIBERATELY, AND THEY ARE NOT THE SAME POSITION. `index`
 * is where the READER is; `anchor` is where the page STACK is laid out from.
 * They agree on every ordinary turn and part company for exactly one event —
 * a bookmark jump, which the handoff requires to be anchored one leaf from
 * its target so the animation plays as a single turn (README, "Triggers").
 * Folding the two into one field is what made the counter, the page label,
 * the active rail tab and the address bar publish a page the reader never
 * asked for, for the whole length of a jump
 * (docs/qa/2026-09-03-phase-1-closing-sweep.md, PH1-001). Depends on
 * nothing.
 */

/** Delay before `go` flips true, so the browser has a frame to attach the transition to. */
export const ARM_MS = 30
/** Grace after the transition ends, before the index commits. */
export const SETTLE_MS = 40

/** Where a turn currently is in its lifecycle. */
export type FlipPhase = 'idle' | 'arming' | 'turning' | 'swapped'
/** Which way the leaf is travelling. */
export type FlipDirection = 'forward' | 'backward'

/** The complete state of the page stack at one instant. */
export interface FlipState {
  readonly phase: FlipPhase
  /**
   * WHERE THE READER IS. The committed page, and the only field anything
   * that names the reader's location may read - the counter, the page label,
   * the active bookmark tab and the address bar all derive from it. It goes
   * from the page the reader left to the page they asked for and takes no
   * value in between, however far apart the two are: a jump's anchor is a
   * leaf the STACK passes through, never a page the reader visits, and is
   * carried by {@link FlipState.anchor} for exactly that reason
   * (docs/qa/2026-09-03-phase-1-closing-sweep.md, PH1-001).
   */
  readonly index: number
  /**
   * WHERE THE PAGE STACK IS LAID OUT FROM, which is the same leaf as
   * {@link FlipState.index} for every turn except a bookmark jump.
   *
   * A jump is anchored one leaf from its target so that however far it
   * travels it is drawn as the single page turn the rest of the book already
   * performs (handoff README, "Triggers"). `leafPresentation` reads THIS
   * field to decide each leaf's resting angle, visibility and image window;
   * nothing that names the reader's location may read it.
   */
  readonly anchor: number
  /** The page the current turn left, or `null` when idle. */
  readonly from: number | null
  /** The page the current turn is headed to, or `null` when idle. */
  readonly to: number | null
  /** The current turn's direction, or `null` when idle. */
  readonly dir: FlipDirection | null
  /** Drives the CSS transform; false during `arming` so the transition animates. */
  readonly go: boolean
  /** True past the midpoint: front and back faces swap opacity here. */
  readonly half: boolean
  /** The latch. True from `start` until the turn commits. */
  readonly busy: boolean
  /** The clock reading `start` fired at, or `null` when idle. Elapsed time for every phase boundary is measured from here. */
  readonly startedAt: number | null
}

/** What can happen to the machine. */
export type FlipEvent =
  | { readonly type: 'start'; readonly to: number; readonly now: number }
  | { readonly type: 'jump'; readonly to: number; readonly now: number }
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
  anchor: index,
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
 * @param event - A `start` request (an ordinary one-leaf turn), a `jump`
 *   request (a bookmark tab's anchored turn), or a clock tick.
 * @param config - Duration and reduced-motion preference.
 * @returns The next state, or the same object when nothing changes.
 */
export const flipReducer = (state: FlipState, event: FlipEvent, config: FlipConfig): FlipState => {
  if (event.type === 'start' || event.type === 'jump') {
    // The latch. A turn in flight swallows further requests, which is what
    // stops a fast reader double-turning past a page. It is the ONLY
    // authority on whether a turn or a jump happens, and it is asked against
    // the state the book is actually in - which is why a jump's anchor is
    // computed below rather than before this guard.
    if (state.busy || event.to === state.index) return state
    if (config.reducedMotion) return settled(event.to)

    const dir = event.to > state.index ? 'forward' : 'backward'
    // A jump lays the stack out one leaf from its target, on the side the
    // reader is arriving from, so the turn between them is the same one-leaf
    // turn the rest of the book performs - played in the direction of
    // travel. An ordinary turn is already one leaf, so its anchor is simply
    // where the reader is. `to` is never `state.index` here (the latch above
    // returned), so a forward jump's anchor cannot fall before the start of
    // the book nor a backward jump's past its end.
    const anchor = event.type === 'jump' ? (dir === 'forward' ? event.to - 1 : event.to + 1) : state.index

    return {
      phase: 'arming',
      // NOT the anchor. See `index`'s own field doc: this is where the reader
      // is, and a reader in the middle of a jump is still on the page they
      // left until it commits.
      index: state.index,
      anchor,
      from: anchor,
      to: event.to,
      dir,
      go: false,
      half: false,
      busy: true,
      startedAt: event.now,
    }
  }

  if (state.startedAt === null || state.to === null) return state

  // A non-finite or non-positive duration would make every `elapsed >=
  // threshold` comparison below false forever, parking the machine in
  // `turning` with the latch stuck open — the exact seizure this module
  // exists to make unrepresentable. Commit immediately instead: an instant
  // page change is the right failure mode for a broken config, not a dead
  // book. Mirrors the reducedMotion escape hatch in the `start` branch.
  if (!Number.isFinite(config.durationMs) || config.durationMs <= 0) return settled(state.to)

  const elapsed = event.now - state.startedAt

  // The same seizure as the duration guard above, arriving through the other
  // input. `now` has exactly one source today - `performance.now()` in
  // `useFlip`, finite by specification - but `flipReducer` is this package's
  // PUBLIC API, and the promise in this module's header that a seized book is
  // unrepresentable is made to every caller, not only to the one that exists.
  // A non-finite `now` here, or a `startedAt` that was non-finite when the
  // turn started, makes `elapsed` NaN and every comparison below false
  // forever. Commit immediately, exactly as a broken duration does.
  if (!Number.isFinite(elapsed)) return settled(state.to)

  const halfAt = ARM_MS + config.durationMs / 2
  const commitAt = ARM_MS + config.durationMs + SETTLE_MS

  // Ordered latest-first so an overshooting tick — a backgrounded tab, a
  // dropped frame — still commits rather than stranding the latch.
  if (elapsed >= commitAt) return settled(state.to)
  if (elapsed >= halfAt) return state.half ? state : { ...state, phase: 'swapped', half: true }
  if (elapsed >= ARM_MS) return state.go ? state : { ...state, phase: 'turning', go: true }
  return state
}
