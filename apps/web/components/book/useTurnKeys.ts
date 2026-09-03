/**
 * useTurnKeys — binds the handoff's four page-turn keys to the book.
 *
 * Adapter (CLAUDE.md §3.3, the same shape as `useFlip`): the browser's
 * keyboard is an edge, and this hook is the one place it is translated into a
 * request the flip machine understands. It decides nothing about the book —
 * it only says "forward" or "backward" — so nothing here needs to know how
 * long the book is, where it is, or whether a turn is already running; the
 * machine's own latch and bounds check answer all three.
 *
 * THE LISTENER IS ON `window`, NOT ON THE BOOK. A key press has to turn the
 * page whether the reader last clicked a leaf, a bookmark tab, or nothing at
 * all, and there is no element that reliably holds focus in all three cases —
 * a listener bound to the stack would work until the first click on the
 * bookmark rail and then quietly stop. A document-level listener buys that at
 * the cost of hearing every key in the page, so it gives two guarantees back:
 *
 *   1. It never takes a key from a text field. A reader typing in an `input`,
 *      a `textarea`, a `select` or a `contenteditable` region owns their arrow
 *      keys, and a book that turned pages while someone edited a caption would
 *      be a defect nobody would think to test for.
 *   2. It never fights the browser. `preventDefault` is called ONLY on the
 *      four keys this hook acts on — PageUp/PageDown scroll by default, and
 *      claiming them silently is the point — and a key carrying Ctrl, Meta,
 *      Alt or Shift is left alone entirely, because a shortcut, a
 *      history-navigation gesture and a selection are never a page turn.
 *
 * Depends on: react.
 */
import { useEffect } from 'react'

/** Which way each bound key turns the book. The handoff's own list (README, "Triggers"). */
const TURN_BY_KEY: Readonly<Record<string, 'forward' | 'backward'>> = {
  ArrowRight: 'forward',
  PageDown: 'forward',
  ArrowLeft: 'backward',
  PageUp: 'backward',
}

/** Elements whose own key handling always outranks the book's. */
const TYPING_TAG_NAMES: ReadonlySet<string> = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

/**
 * A rich-text region, or anything nested inside one. Asked of the DOM rather
 * than through `HTMLElement.isContentEditable`, which reports the same fact
 * but is not implemented in jsdom (it is hard-wired to `false` there), so a
 * hook that relied on it would have its most easily-broken guard testable
 * only in a browser. Matching the attribute walks the same ancestor chain the
 * property would, and `contenteditable="false"` is excluded because it means
 * the opposite.
 */
const EDITABLE_REGION = '[contenteditable]:not([contenteditable="false"])'

/**
 * Whether this key press belongs to something the reader is typing into.
 *
 * @param target - The event's target, which may be any node or none at all.
 * @returns True when the book must keep its hands off the key.
 */
const isTypingTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && (TYPING_TAG_NAMES.has(target.tagName) || target.closest(EDITABLE_REGION) !== null)

/** What the book asks to happen when a turn key is pressed. */
export interface TurnKeyHandlers {
  /** Called for ArrowRight and PageDown. */
  readonly onForward: () => void
  /** Called for ArrowLeft and PageUp. */
  readonly onBackward: () => void
}

/**
 * Listens for the four page-turn keys for as long as the book is mounted.
 *
 * @param handlers - What to do for a forward and a backward key. Both should
 *   be stable between renders (a `useCallback`), since the listener is
 *   re-registered whenever either identity changes.
 * @example
 * useTurnKeys({ onForward: turnForward, onBackward: turnBackward })
 */
export const useTurnKeys = ({ onForward, onBackward }: TurnKeyHandlers): void => {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isTypingTarget(event.target)) return
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return

      const turn = TURN_BY_KEY[event.key]
      if (turn === undefined) return

      // Only ever for a key we are about to act on: see guarantee 2 above.
      event.preventDefault()

      if (turn === 'forward') {
        onForward()
        return
      }
      onBackward()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onForward, onBackward])
}
