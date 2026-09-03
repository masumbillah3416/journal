import { describe, expect, it } from 'vitest'
import { ARM_MS, flipReducer, initialFlipState } from './flip'
import { leafPresentation } from './pageStack'

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

  // The three tests below close the branch-coverage gate the way
  // flip.test.ts's own trailing block does (CLAUDE.md §2.1: 100% branches on
  // packages/domain/**), and each pins a real, previously-broken behaviour
  // (fix round 1: rotation was keyed off `half` instead of `go`, the
  // turning-leaf identity was `state.from` for both directions instead of
  // direction-dependent, and a stale index hid the whole book instead of
  // clamping) - not just a branch to execute.

  it('starts rotating the moment `go` fires, not at the midpoint', () => {
    // `go` - not `half` - drives the CSS transform (flip.ts's own field doc:
    // "drives the CSS transform; false during arming so the transition
    // animates"). Keying rotation off `half` instead left the transform
    // starting at t = ARM_MS + duration/2 and finishing after the machine
    // had already committed at t = ARM_MS + duration + SETTLE_MS.
    let state = flipReducer(initialFlipState(3), { type: 'start', to: 4, now: 0 }, config)
    expect(state.go).toBe(false)
    expect(leafPresentation(3, state, TOTAL).rotateDeg).toBe(0) // still resting, before `go`

    state = flipReducer(state, { type: 'tick', now: ARM_MS }, config)
    expect(state.go).toBe(true)
    expect(state.half).toBe(false)
    expect(leafPresentation(3, state, TOTAL).rotateDeg).toBe(-180) // flips the instant `go` fires
  })

  it("clamps a stale index to the book's last page instead of leaving it blank", () => {
    // If a journey is deleted after a reader's tab already holds a
    // FlipState pointing past the book's new, shorter page count, that
    // reader must land on the last real page - not a book where every leaf
    // is hidden because nothing matches the stale index any more.
    const stale = initialFlipState(40)

    expect(leafPresentation(TOTAL - 1, stale, TOTAL).visible).toBe(true)
    expect(leafPresentation(TOTAL - 1, stale, TOTAL).interactive).toBe(true)
    // The stale index itself is still outside the book's real range, so a
    // leaf AT that index is never rendered.
    expect(leafPresentation(40, stale, TOTAL).visible).toBe(false)
    expect(leafPresentation(40, stale, TOTAL).interactive).toBe(false)
  })

  it('names the leaf that is actively turning, rather than leaving the DOM to read it back off a z-index', () => {
    // This module's own header promises its fields "map one-to-one into
    // rotateY(), zIndex, opacity, visibility and pointer-events, so the DOM
    // layer never has to re-derive flip geometry". Before this field existed,
    // `Leaf.tsx` identified the turning leaf by comparing `zIndex` against a
    // literal 2000 - a re-derivation of exactly the kind that promise forbids,
    // and one that would break silently the day the stacking table changed.
    const turning = flipReducer(initialFlipState(3), { type: 'start', to: 4, now: 0 }, config)

    expect(leafPresentation(3, turning, TOTAL).isTurning).toBe(true)
    expect(leafPresentation(4, turning, TOTAL).isTurning).toBe(false)
  })

  it('animates the destination leaf on a backward turn, not the leaf already at rest', () => {
    // Turned leaves lie at -180 on the left; going 5 -> 4 must un-turn leaf 4
    // (state.to). Leaf 5 (state.from) is already resting at 0 and never
    // moves - it was the currently open page, not the one being revealed.
    let state = flipReducer(initialFlipState(5), { type: 'start', to: 4, now: 0 }, config)
    expect(state.dir).toBe('backward')
    expect(leafPresentation(4, state, TOTAL).rotateDeg).toBe(-180) // still resting, before `go`

    state = flipReducer(state, { type: 'tick', now: ARM_MS }, config)
    expect(state.go).toBe(true)

    const destination = leafPresentation(4, state, TOTAL)
    const departure = leafPresentation(5, state, TOTAL)

    expect(destination.rotateDeg).toBe(0) // target flips to `to` the instant `go` fires
    expect(destination.zIndex).toBe(2000)
    expect(destination).toMatchObject({ frontOpacity: 0, backOpacity: 1 }) // starts showing its back

    expect(departure.rotateDeg).toBe(0) // never moves
    expect(departure.zIndex).toBe(1000 - 5)
    expect(departure).toMatchObject({ frontOpacity: 1, backOpacity: 0 }) // inert

    state = flipReducer(state, { type: 'tick', now: ARM_MS + config.durationMs / 2 }, config)
    expect(state.half).toBe(true)

    // Backward crossfades the other way round from forward - handoff
    // README's flip sequence table specifies both pairings on adjacent lines.
    expect(leafPresentation(4, state, TOTAL)).toMatchObject({ frontOpacity: 1, backOpacity: 0 })
  })

  // The image window (Task 10's LCP defect). Every leaf of the book is in the
  // document at once, and every leaf sits at `inset: 0`, so the browser
  // considers all of them in the viewport and `loading="lazy"` defers
  // nothing - measured, not assumed: `/p/1` fetched all 20 of the seeded
  // book's photographs, 1,820,504 bytes, with the reader on the Cover.
  // `loadsImages` is the field that stops that, and it lives here rather than
  // as an inference in `Leaf.tsx`/`Book.tsx` for the reason this module's
  // header gives: the DOM layer never re-derives flip geometry.

  it('loads images for the open page and its two neighbours', () => {
    const state = initialFlipState(10)

    expect(leafPresentation(9, state, TOTAL).loadsImages).toBe(true)
    expect(leafPresentation(10, state, TOTAL).loadsImages).toBe(true)
    expect(leafPresentation(11, state, TOTAL).loadsImages).toBe(true)
  })

  it('leaves the rest of the book to render its markup without fetching a byte', () => {
    const state = initialFlipState(10)

    expect(leafPresentation(8, state, TOTAL).loadsImages).toBe(false)
    expect(leafPresentation(12, state, TOTAL).loadsImages).toBe(false)
    expect(leafPresentation(0, state, TOTAL).loadsImages).toBe(false)
    expect(leafPresentation(TOTAL - 1, state, TOTAL).loadsImages).toBe(false)
  })

  it('never renders a leaf the reader can see whose images were not asked for', () => {
    // The invariant that makes the window safe: `visible` is a subset of
    // `loadsImages`, at rest and at every phase of a turn. If it ever were
    // not, a reader would watch an empty frame swing into place.
    const traced = [initialFlipState(3)]
    let state = flipReducer(initialFlipState(3), { type: 'start', to: 4, now: 0 }, config)
    for (const now of [ARM_MS, ARM_MS + config.durationMs / 2, ARM_MS + config.durationMs]) {
      traced.push(state)
      state = flipReducer(state, { type: 'tick', now }, config)
    }
    traced.push(state)

    for (const traceState of traced) {
      for (let leaf = 0; leaf < TOTAL; leaf += 1) {
        const { visible, loadsImages } = leafPresentation(leaf, traceState, TOTAL)
        expect(visible && !loadsImages).toBe(false)
      }
    }
  })

  it('has the destination page already loading before the turn starts to move', () => {
    // The neighbour is inside the window while the book is at rest, so the
    // photograph is fetched long before `go` fires rather than at the moment
    // the leaf begins to swing.
    const atRest = initialFlipState(3)
    expect(leafPresentation(4, atRest, TOTAL).loadsImages).toBe(true)

    const arming = flipReducer(atRest, { type: 'start', to: 4, now: 0 }, config)
    expect(arming.go).toBe(false)
    expect(leafPresentation(4, arming, TOTAL).loadsImages).toBe(true)
  })

  it('widens to the leaves a turn departs from and arrives at, however far apart they are', () => {
    // `visible` names `from` and `to` outright rather than trusting them to
    // be within a page of `index`; the window mirrors that, so the invariant
    // above holds by construction and not by coincidence.
    const distant = {
      ...initialFlipState(3),
      from: 3,
      to: 20,
      dir: 'forward' as const,
      busy: true,
      startedAt: 0,
      phase: 'arming' as const,
    }

    expect(leafPresentation(20, distant, TOTAL).loadsImages).toBe(true)
    expect(leafPresentation(19, distant, TOTAL).loadsImages).toBe(false)
  })

  it("opens the window around a bookmark jump's anchor, not around the page the reader is still on", () => {
    // A jump lays the stack out one leaf from its target and turns the single
    // leaf between them, so the window follows the ANCHOR - even though the
    // reader's own `index` is still twenty-seven pages away and stays there
    // until the jump commits (flip.ts's two position fields). A jump from
    // page 31 to page 4 must fetch the destination's photographs and drop the
    // ones behind it.
    const jumped = flipReducer(initialFlipState(30), { type: 'jump', to: 3, now: 0 }, config)

    expect(leafPresentation(3, jumped, TOTAL).loadsImages).toBe(true)
    expect(leafPresentation(4, jumped, TOTAL).loadsImages).toBe(true)
    expect(leafPresentation(30, jumped, TOTAL).loadsImages).toBe(false)
  })

  it('asks for no images from a leaf that is not in the book at all', () => {
    const stale = initialFlipState(40)

    expect(leafPresentation(40, stale, TOTAL).loadsImages).toBe(false)
    expect(leafPresentation(TOTAL - 1, stale, TOTAL).loadsImages).toBe(true)
  })
})
