/**
 * Leaf — one page of the stack, rendered from its LeafPresentation.
 *
 * Translation layer, and deliberately nothing more. `leafPresentation`
 * (`packages/domain/src/pageStack.ts`) states in its own module header that
 * its fields map one-to-one into `rotateY()`, `zIndex`, `opacity`,
 * `visibility` and `pointer-events` "so the DOM layer never has to re-derive
 * flip geometry". This component honours that literally: every value below is
 * assigned straight across, and there is no `FlipState` in scope here to
 * re-derive anything from even by accident.
 *
 * ONE FIELD OF THE PRESENTATION IS DELIBERATELY NOT READ HERE: `loadsImages`,
 * which governs whether the page on the front face may fetch its photographs.
 * It is content, not geometry, so `Book.tsx` publishes it on the `ImageWindow`
 * context that the photographs themselves read, rather than routing it through
 * a component whose whole job is to translate geometry into style. Nothing
 * about a leaf's box changes with it, and this component never learns what is
 * printed on the face it is given - `children` arrives already rendered, on
 * the server (see `Book.tsx`'s header).
 *
 * Which leaf is turning drives the two things no CSS property maps to
 * directly - the travelling shade's opacity, and the transition duration -
 * and it arrives as `presentation.isTurning`, a field of its own. It used to
 * be read back by comparing `presentation.zIndex` against a literal 2000:
 * still the domain's own output, but a re-derivation of flip geometry all the
 * same, and one that would have started silently marking the wrong leaf the
 * day the handoff's stacking table changed. Task 8 closed that seam by
 * publishing the fact instead of inferring it.
 *
 * Three faces, in painting order: the front (which carries the page content),
 * the back (mirrored, contentless, and ALWAYS `pointer-events: none` - see
 * `book.module.css`'s header for the defect that guards), and the travelling
 * shade. There is no `backface-visibility` anywhere: it was tried in the
 * handoff prototype and produced blank pages.
 *
 * STANDING CONDITION: THE BACK FACE MUST STAY CONTENTLESS. It is hidden by
 * opacity alone, with no `visibility` guard - deliberately, because an
 * opacity-0 element is still a hit-test target in every browser, so
 * `pointer-events: none` was always the only load-bearing protection and a
 * redundant second guard would make it impossible to prove (see
 * `e2e/book.spec.ts`'s first case, which clicks a real Contents link). That
 * omission is only safe while the face carries nothing: put content on it and
 * the screen-reader, find-in-page and print arguments for hiding it properly
 * all come back, and this becomes the wrong design rather than a tested one.
 * A future task adding content here is changing an assumption, not adding a
 * feature.
 * Depends on: react, `LeafPresentation` (@travel-diary/domain/pageStack),
 * ./book.module.css.
 */
import type { LeafPresentation } from '@travel-diary/domain/pageStack'
import type React from 'react'
import styles from './book.module.css'

/** What one leaf needs to render itself. */
export interface LeafProps {
  /** The leaf's 0-based position in the book, published as `data-leaf`. */
  readonly index: number
  /** Everything about how this leaf looks right now, from `leafPresentation`. */
  readonly presentation: LeafPresentation
  /** How long a turn takes, applied only to the leaf that is actually turning. */
  readonly durationMs: number
  /** The page content, rendered on the front face. */
  readonly children: React.ReactNode
}

/**
 * Renders one leaf of the page stack.
 *
 * @param props - The leaf's index, its presentation, the flip duration and its page content.
 * @returns The leaf, its two faces and its travelling shade.
 */
export const Leaf = ({ index, presentation, durationMs, children }: LeafProps): React.JSX.Element => {
  const { isTurning } = presentation

  // A leaf that is not turning gets 0ms, not a missing transition: the
  // property stays declared in CSS so the performance budget is assertable at
  // rest (e2e/book.spec.ts), while a 0ms duration still means an instant
  // change - which is what stops a bookmark jump, where several leaves change
  // resting angle at once, from fanning the whole stack open.
  const transitionDuration = `${String(isTurning ? durationMs : 0)}ms`

  return (
    <div
      data-leaf={index}
      className={styles.leaf}
      style={{
        transform: `rotateY(${String(presentation.rotateDeg)}deg)`,
        zIndex: presentation.zIndex,
        visibility: presentation.visible ? 'visible' : 'hidden',
        pointerEvents: presentation.interactive ? 'auto' : 'none',
        transitionDuration,
        // Promoted to its own compositor layer only while it is actually
        // moving. A blanket `will-change: transform` in the stylesheet would
        // hold 33 standing layers for a book where at most one leaf turns.
        willChange: isTurning ? 'transform' : 'auto',
      }}
    >
      <div data-face="front" className={styles.front} style={{ opacity: presentation.frontOpacity }}>
        {children}
      </div>

      <div data-face="back" aria-hidden="true" className={styles.back} style={{ opacity: presentation.backOpacity }} />

      <div
        data-shade=""
        aria-hidden="true"
        className={styles.shade}
        style={{ opacity: isTurning ? 1 : 0, transitionDuration }}
      />
    </div>
  )
}
