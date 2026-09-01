/**
 * pageStack — derives what each leaf of the book should render, from flip state.
 *
 * Derivation pattern (CLAUDE.md §7; mirrors bookScale.ts and bookBundle.ts):
 * a pure function of `(leafIndex, FlipState, totalPages)`, computed fresh on
 * every render rather than stored per-leaf. This is the seam between the
 * flip state machine (`./flip.ts`) and the DOM (Task 7): the machine only
 * knows "where the book is"; this module turns that into "what this one leaf
 * looks like," so the DOM layer never re-derives flip geometry itself.
 *
 * Three rules below exist because the handoff records each one having gone
 * wrong once in practice, not because they are abstractly tidy:
 *
 *   - `interactive` is true only for the current leaf, and never while a turn
 *     is in flight (`state.busy`). A back face left clickable silently
 *     swallowed every click on page content - Contents links and gallery
 *     buttons looked dead while their handlers were fine.
 *   - `visible` is false for any leaf that is not the current page or part of
 *     the turn in flight. Without it, a leaf that has already been read (or
 *     not yet reached) still renders, as stranded mirrored content the
 *     reader should never see.
 *   - `frontOpacity`/`backOpacity` cross fade at `state.half` instead of the
 *     leaf relying on `backface-visibility` to hide its reverse side.
 *     `backface-visibility` was tried in the handoff prototype and produced
 *     blank pages; two real faces whose opacity swaps is the fix.
 *
 * Two more rules were wrong in an earlier revision of this module and are
 * corrected here - see the comments at their point of use below:
 *
 *   - Rotation keys off `state.go` (the field that "drives the CSS
 *     transform"), never `state.half` (which only swaps face opacity). Keying
 *     rotation off `half` made the transform start at the midpoint, half the
 *     duration, finishing after the machine had already committed.
 *   - The leaf that physically moves is `state.from` going forward but
 *     `state.to` going backward - a turned leaf resting at -180 is what a
 *     backward turn un-turns. Keying "the turning leaf" off `state.from`
 *     alone left backward turns animating an inert leaf while the one that
 *     should move held at -180 until commit and then snapped.
 *
 * Depends on FlipState from ./flip.ts; depends on nothing else, no DOM, no
 * framework.
 */
import type { FlipState } from './flip'

/**
 * What one leaf of the book should look like at this instant. Every field
 * here is meant to be assigned straight to CSS - `rotateDeg` into a
 * `rotateY()`, `zIndex` and `frontOpacity`/`backOpacity` into their
 * like-named properties, `visible` into `visibility`, `interactive` into
 * `pointer-events`, and `isTurning` into the shade's opacity and the leaf's
 * transition duration - so the DOM layer never has to re-derive flip geometry.
 */
export interface LeafPresentation {
  /** The leaf's `rotateY()` angle in degrees: `-180` once turned, `0` at rest. */
  readonly rotateDeg: number
  /** Stacking order: ascending for turned leaves, descending for untouched ones, and above both for the leaf actively turning. */
  readonly zIndex: number
  /** Whether this leaf should render at all. False strands no mirrored content: an invisible leaf is fully hidden, not merely occluded. */
  readonly visible: boolean
  /** Whether this leaf may receive pointer/keyboard input. True only for the current page, and never while a turn is in flight. */
  readonly interactive: boolean
  /** Opacity of the leaf's front face: `1` where the front is the showing face, `0` where the back is. */
  readonly frontOpacity: number
  /** Opacity of the leaf's back face: the inverse of `frontOpacity`, so exactly one face is visible at any instant. */
  readonly backOpacity: number
  /**
   * Whether THIS leaf is the one physically turning right now. Published as a
   * field of its own so the DOM layer can drive the two things that have no
   * geometry field - the travelling shade, and which leaf gets a non-zero
   * transition duration - without re-deriving "which leaf is turning" from
   * `state.from`/`state.to`/`state.dir`, or reading it back off the `zIndex`
   * this module happens to assign it (see this interface's own doc comment).
   */
  readonly isTurning: boolean
}

/**
 * Computes how one leaf should present, given the book's current flip state.
 *
 * @param leafIndex - The zero-based position of the leaf in the book.
 * @param state - The flip machine's current state (see `./flip.ts`).
 * @param totalPages - The book's current page count. A `state.index` at or
 *   past this count (for example a stale FlipState left over after a journey
 *   was deleted and the book got shorter) is clamped to the last real page,
 *   so a reader in that situation lands on a live page rather than a book
 *   where no leaf is visible or interactive at all.
 * @returns The leaf's rotation, stacking, visibility, interactivity, face
 *   opacities, and whether it is the leaf actively turning.
 */
export const leafPresentation = (leafIndex: number, state: FlipState, totalPages: number): LeafPresentation => {
  const inBounds = leafIndex < totalPages
  const currentIndex = Math.min(state.index, totalPages - 1)

  // `go` - not `half` - is what starts the CSS transition (flip.ts's own
  // field doc: "drives the CSS transform; false during arming so the
  // transition animates"; `half` only swaps face opacity, past the
  // midpoint). Before `go`, every leaf reads its resting angle against
  // `currentIndex`; the instant `go` flips true the whole stack reads its
  // resting angle against `state.to` instead, so exactly the one leaf whose
  // resting angle differs between the two starts animating - continuously,
  // because at commit `index === to`, so this value does not change again.
  const target = state.busy && state.go && state.to !== null ? state.to : currentIndex
  const turned = leafIndex < target

  // The leaf that physically moves is `state.from` going forward (it swings
  // from 0 to -180) but `state.to` going backward (a turned leaf, already
  // resting at -180, swings back to 0). `state.from` is never the moving
  // leaf on a backward turn - it was already resting at 0 and stays there.
  const turningLeaf = state.busy ? (state.dir === 'forward' ? state.from : state.to) : null
  const isTurningLeaf = turningLeaf !== null && leafIndex === turningLeaf

  // Forward starts front-up and swaps to back-up past the midpoint; backward
  // starts back-up (it was already resting at -180) and swaps to front-up -
  // handoff README's flip sequence table specifies both pairings on adjacent
  // lines. `(dir === 'forward') !== half` is true on the "still showing the
  // start face" side of the midpoint for both directions, flipping at `half`.
  const frontOpacity = isTurningLeaf ? ((state.dir === 'forward') !== state.half ? 1 : 0) : 1
  const backOpacity = isTurningLeaf ? 1 - frontOpacity : 0

  return {
    rotateDeg: turned ? -180 : 0,
    zIndex: isTurningLeaf ? 2000 : turned ? leafIndex + 1 : 1000 - leafIndex,
    visible: inBounds && (leafIndex === currentIndex || leafIndex === state.from || leafIndex === state.to),
    interactive: inBounds && leafIndex === currentIndex && !state.busy,
    frontOpacity,
    backOpacity,
    isTurning: isTurningLeaf,
  }
}
