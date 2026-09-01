import { describe, expect, it } from 'vitest'
import { flipReducer, initialFlipState } from './flip.js'
import { leafPresentation } from './pageStack.js'

const config = { durationMs: 900, reducedMotion: false }
const TOTAL = 33

describe('leafPresentation', () => {
  it('rests turned pages at -180deg and untouched pages at 0deg', () => {
    const state = initialFlipState(3)

    expect(leafPresentation(2, state, TOTAL).rotateDeg).toBe(-180)
    expect(leafPresentation(5, state, TOTAL).rotateDeg).toBe(0)
  })

  it('stacks turned pages ascending and untouched pages descending', () => {
    const state = initialFlipState(3)

    expect(leafPresentation(0, state, TOTAL).zIndex).toBeLessThan(leafPresentation(1, state, TOTAL).zIndex)
    expect(leafPresentation(5, state, TOTAL).zIndex).toBeGreaterThan(leafPresentation(6, state, TOTAL).zIndex)
  })

  it('lifts the actively turning leaf above every other', () => {
    const turning = flipReducer(initialFlipState(3), { type: 'start', to: 4, now: 0 }, config)

    const others = [0, 1, 2, 5, 6].map((i) => leafPresentation(i, turning, TOTAL).zIndex)
    expect(leafPresentation(3, turning, TOTAL).zIndex).toBeGreaterThan(Math.max(...others))
  })

  it('hides every page that is not current, turning, or being revealed', () => {
    // Without this the reader sees stranded mirrored content from pages that
    // are neither here nor gone.
    const state = initialFlipState(3)

    expect(leafPresentation(3, state, TOTAL).visible).toBe(true)
    expect(leafPresentation(9, state, TOTAL).visible).toBe(false)
  })

  it('reveals the destination page while a turn is in flight', () => {
    const turning = flipReducer(initialFlipState(3), { type: 'start', to: 4, now: 0 }, config)

    expect(leafPresentation(4, turning, TOTAL).visible).toBe(true)
  })

  it('makes only the current page interactive, and never mid-flip', () => {
    // The handoff records a back face silently swallowing every click on page
    // content: Contents links and gallery buttons looked dead while their
    // handlers were fine.
    const idle = initialFlipState(3)
    const turning = flipReducer(idle, { type: 'start', to: 4, now: 0 }, config)

    expect(leafPresentation(3, idle, TOTAL).interactive).toBe(true)
    expect(leafPresentation(4, idle, TOTAL).interactive).toBe(false)
    expect(leafPresentation(3, turning, TOTAL).interactive).toBe(false)
  })

  it('swaps face opacity at the midpoint rather than using backface-visibility', () => {
    let state = flipReducer(initialFlipState(3), { type: 'start', to: 4, now: 0 }, config)
    expect(leafPresentation(3, state, TOTAL)).toMatchObject({ frontOpacity: 1, backOpacity: 0 })

    state = flipReducer(state, { type: 'tick', now: 30 + 450 }, config)
    expect(leafPresentation(3, state, TOTAL)).toMatchObject({ frontOpacity: 0, backOpacity: 1 })
  })

  // The two tests below close the branch-coverage gate the way flip.test.ts's
  // own trailing block does (CLAUDE.md §2.1: 100% branches on
  // packages/domain/**): the seven tests transcribed from the brief never
  // exercise the `totalPages` bound or a backward-direction turn, so without
  // these, coverage tooling could report 100% purely because the compound
  // conditions those paths sit in happen to also be reached from other
  // angles - each test below pins a real, otherwise-unproven behaviour, not
  // just a branch.

  it('treats a leaf index at or past a shrunk book as never visible or interactive', () => {
    // If a journey is deleted after a reader's tab already holds a FlipState
    // pointing past the book's new, shorter page count, that stale index
    // must not render as a real, clickable leaf - the same "never render
    // what the reader shouldn't see" reasoning the `visible` rule states
    // above, extended to indices the book no longer has at all.
    const stale = initialFlipState(40)

    expect(leafPresentation(40, stale, TOTAL).visible).toBe(false)
    expect(leafPresentation(40, stale, TOTAL).interactive).toBe(false)
  })

  it('does not rotate the departing leaf on a backward turn, since only a forward turn crosses the midpoint', () => {
    // Turning leaf identity is always `state.from` (see pageStack.ts's module
    // header): a forward turn's departing leaf swings to -180 past the
    // midpoint, but a backward turn's departing leaf only fades via opacity -
    // it still gets the zIndex lift, but its rotation stays flat because
    // `state.dir` is 'backward', not 'forward'.
    let state = flipReducer(initialFlipState(4), { type: 'start', to: 3, now: 0 }, config)
    expect(state.dir).toBe('backward')

    state = flipReducer(state, { type: 'tick', now: 30 + 450 }, config)
    expect(state.half).toBe(true)

    const departing = leafPresentation(4, state, TOTAL)
    expect(departing.rotateDeg).toBe(0)
    expect(departing.zIndex).toBe(2000)
    expect(departing).toMatchObject({ frontOpacity: 0, backOpacity: 1 })
  })
})
