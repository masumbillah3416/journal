/**
 * EdgeStrip — the page-edge band a reader clicks to turn a leaf.
 *
 * Presentational component (CLAUDE.md §3.3) over one fact: which edge of the
 * book this is. Everything else about it — the 44px forward band, the 30px
 * backward band, its `z-index: 900` and the gradient that fades in under the
 * pointer — is geometry, and lives in `book.module.css` where every other
 * absolute measurement of the book lives. This file exists to give that
 * geometry a name, an accessible label and a click.
 *
 * It is a real `<button>`, not the prototype's bare `<div>` with an `onClick`.
 * The strip is a control, and rendering a control as a div costs a keyboard
 * reader the affordance entirely: it would be unreachable, unlabelled and
 * invisible to assistive technology, which `e2e/a11y.spec.ts` asserts against
 * every route. The trade is two extra tab stops ahead of the page content,
 * which is the cheaper side of that bargain. The handoff's own hover copy
 * ("Turn the page", "Turn back") becomes the label, so the two strips are
 * distinguishable from the bottom arrows in a screen reader's control list
 * rather than four identically-named buttons.
 *
 * `canTurn` goes to `disabled` rather than to a conditional render: at the
 * ends of the book the band must stop responding, but a strip that vanished
 * would move nothing and change nothing visible, so there is no reason to
 * take it out of the DOM and every reason (a stable layout, a stable
 * selector) to leave it there.
 * Depends on: react, ./book.module.css.
 */
import type React from 'react'
import styles from './book.module.css'

/** Which side of the book a strip sits on, and therefore which way it turns. */
export type BookEdge = 'left' | 'right'

/**
 * The handoff prototype's own wording for each strip, kept verbatim: the copy
 * in this design is deliberate, and these two strings are what a reader's
 * screen reader will announce.
 */
const EDGE_LABELS: Readonly<Record<BookEdge, string>> = {
  right: 'Turn the page',
  left: 'Turn back',
}

/**
 * The class each edge's geometry lives under in `book.module.css`. Typed as
 * possibly absent because a CSS Module resolves to an index signature, and
 * `className` accepts `undefined` — so a missing class degrades to an
 * unstyled strip rather than to `class="undefined"`.
 */
const EDGE_CLASSES: Readonly<Record<BookEdge, string | undefined>> = {
  right: styles.edgeRight,
  left: styles.edgeLeft,
}

/** What one edge strip needs to render itself. */
export interface EdgeStripProps {
  /** Which side of the book this strip is, published as `data-edge`. */
  readonly edge: BookEdge
  /** Whether there is a page in this direction to turn to. */
  readonly canTurn: boolean
  /** Called when the reader clicks the strip. */
  readonly onTurn: () => void
}

/**
 * Renders one page-edge turn strip.
 *
 * @param props - Which edge this is, whether it can turn, and what to do when clicked.
 * @returns The strip, as a labelled button covering one edge of the page area.
 * @example
 * <EdgeStrip edge="right" canTurn={canGoForward} onTurn={turnForward} />
 */
export const EdgeStrip = ({ edge, canTurn, onTurn }: EdgeStripProps): React.JSX.Element => (
  <button
    type="button"
    data-edge={edge}
    className={EDGE_CLASSES[edge]}
    aria-label={EDGE_LABELS[edge]}
    disabled={!canTurn}
    onClick={onTurn}
  />
)
