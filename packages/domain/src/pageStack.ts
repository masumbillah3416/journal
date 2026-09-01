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
 * `state.from` is the sole leaf identity read below for "the leaf currently
 * turning" (the -180 past-midpoint clause, the zIndex 2000 lift, and the
 * opacity cross fade all key off it, never off `state.to`). `flipReducer`
 * always sets `from: state.index` at the moment a turn starts and leaves
 * `index` unchanged until commit, so `state.from === state.index` for the
 * whole life of a turn - `state.to` never independently identifies a leaf
 * that `state.from`/`state.index` doesn't already cover. Depends on FlipState
 * from ./flip.ts; depends on nothing else, no DOM, no framework.
 */
import type { FlipState } from './flip.js'

/**
 * What one leaf of the book should look like at this instant. Every field
 * here is meant to be assigned straight to CSS - `rotateDeg` into a
 * `rotateY()`, `zIndex` and `frontOpacity`/`backOpacity` into their
 * like-named properties, `visible` into `visibility`, `interactive` into
 * `pointer-events` - so the DOM layer never has to re-derive flip geometry.
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
  /** Opacity of the leaf's front face: `1` at rest, crossing to `0` at the turn's midpoint. */
  readonly frontOpacity: number
  /** Opacity of the leaf's back face: the inverse of `frontOpacity`, so exactly one face is visible at any instant. */
  readonly backOpacity: number
}

/**
 * Computes how one leaf should present, given the book's current flip state.
 *
 * @param leafIndex - The zero-based position of the leaf in the book.
 * @param state - The flip machine's current state (see `./flip.ts`).
 * @param totalPages - The book's current page count. Bounds `leafIndex`: a
 *   leaf at or past the book's actual edge (for example a stale `state.index`
 *   left over after a journey was deleted and the book got shorter) is never
 *   `visible` or `interactive`, even if its index would otherwise match -
 *   the same "never render what isn't really there" reasoning as the
 *   `visible` rule above, extended to indices the book no longer has.
 * @returns The leaf's rotation, stacking, visibility, interactivity and face opacities.
 */
export const leafPresentation = (leafIndex: number, state: FlipState, totalPages: number): LeafPresentation => {
  const inBounds = leafIndex < totalPages
  const turned = leafIndex < state.index
  // The leaf physically turning is always the current page's own leaf - see
  // the module header for why `state.from`, never `state.to`, is the leaf
  // identity used throughout this function.
  const isTurningLeaf = state.busy && leafIndex === state.from
  const turningForwardPastMidpoint = isTurningLeaf && state.dir === 'forward' && state.half

  return {
    rotateDeg: turned || turningForwardPastMidpoint ? -180 : 0,
    zIndex: isTurningLeaf ? 2000 : turned ? leafIndex + 1 : 1000 - leafIndex,
    visible: inBounds && (leafIndex === state.index || leafIndex === state.from || leafIndex === state.to),
    interactive: inBounds && leafIndex === state.index && !state.busy,
    frontOpacity: isTurningLeaf ? (state.half ? 0 : 1) : 1,
    backOpacity: isTurningLeaf ? (state.half ? 1 : 0) : 0,
  }
}
