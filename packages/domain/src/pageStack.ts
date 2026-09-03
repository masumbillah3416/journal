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
 * Four rules below exist because each one has gone wrong once in practice -
 * the first three in the handoff's own defect log, the fourth measured on this
 * branch - not because they are abstractly tidy:
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
 *   - `loadsImages` is a WINDOW, not a visibility test: the open page, its two
 *     neighbours, and the leaves a turn departs from and arrives at. Every
 *     leaf of the book is in the document at once and every leaf sits at
 *     `inset: 0`, so the browser counts all thirty-three as in the viewport
 *     and `loading="lazy"` defers nothing - measured, not assumed (`/p/1`
 *     fetched all 20 of the seeded book's photographs, 1,833,312 bytes, with
 *     the reader on the Cover, and the LCP gate went red at 3,247ms). The
 *     window is one page wider than `visible` on each side precisely so the
 *     next page's photograph is already fetched when its leaf starts to
 *     swing, rather than starting to fetch then.
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
 * IT READS `state.anchor`, NEVER `state.index`. The machine carries two
 * positions - where the reader is, and where the stack is laid out from -
 * and this module is the whole of the second one's audience. A bookmark jump
 * is the one event that separates them (flip.ts's header); every other turn
 * and every resting book has them equal, so nothing else in this file needed
 * to change when they were split apart.
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
 * `pointer-events`, `loadsImages` into whether a photograph on this leaf
 * carries a real `src`, and `isTurning` into the shade's opacity and the
 * leaf's transition duration - so the DOM layer never has to re-derive flip
 * geometry, nor re-decide which leaves are near enough to fetch.
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
   * Whether this leaf may put real `src` attributes on its photographs.
   *
   * A window around the reader, not a synonym for {@link visible}: `visible`
   * is the three leaves a reader can see this instant, and this is those
   * plus one page either side, so a neighbour's hero is fetched while the
   * book is at rest and is ready the moment a turn reveals it. Every visible
   * leaf is inside it by construction (see this module's header). A leaf
   * outside it still renders all of its markup - headings, captions, alt
   * text, the note, the highlights, the tally - because the design spec's §8
   * requires the server to render every page's content so the deep links are
   * indexable; it is the image BYTES that are withheld, never the text.
   */
  readonly loadsImages: boolean
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
 * @param state - The flip machine's current state (see `./flip.ts`). Its
 *   `anchor` is what the stack is laid out from here, never its `index`.
 * @param totalPages - The book's current page count. A `state.anchor` at or
 *   past this count (for example a stale FlipState left over after a journey
 *   was deleted and the book got shorter) is clamped to the last real page,
 *   so a reader in that situation lands on a live page rather than a book
 *   where no leaf is visible or interactive at all.
 * @returns The leaf's rotation, stacking, visibility, interactivity, face
 *   opacities, whether it may fetch its photographs, and whether it is the
 *   leaf actively turning.
 */
export const leafPresentation = (leafIndex: number, state: FlipState, totalPages: number): LeafPresentation => {
  const inBounds = leafIndex < totalPages
  // `anchor`, NOT `index`: this module lays the stack out, and a bookmark
  // jump lays it out one leaf from its target rather than at the page the
  // reader is leaving (flip.ts's own two field docs). The two are the same
  // leaf for every other turn and at rest. Reading `index` here would put a
  // twenty-seven-leaf turn back into the stack; reading `anchor` anywhere
  // that names the reader's LOCATION is PH1-001.
  const currentIndex = Math.min(state.anchor, totalPages - 1)

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
    // One page either side of the reader, plus the turn's own two leaves -
    // named outright the way `visible` names them, so "every visible leaf
    // loads its images" holds by construction rather than by the coincidence
    // that a turn's `to` is always a neighbour of its `from`.
    loadsImages:
      inBounds && (Math.abs(leafIndex - currentIndex) <= 1 || leafIndex === state.from || leafIndex === state.to),
    interactive: inBounds && leafIndex === currentIndex && !state.busy,
    frontOpacity,
    backOpacity,
    isTurning: isTurningLeaf,
  }
}
