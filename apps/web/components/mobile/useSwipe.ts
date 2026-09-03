/**
 * useSwipe — turns a touch gesture on the mobile reading mode into a page turn.
 *
 * Adapter (CLAUDE.md §3.3) over `shouldTurnPage` from
 * `@travel-diary/domain/swipe`, and the same shape `useBookScale` has over
 * `bookScale`: the decision is the pure function's, and this hook only
 * supplies it with the two numbers a browser can measure. It holds no
 * threshold, no ratio and no comparison of its own, so the rule that stops a
 * vertical scroll turning a page is stated once, in the one place a unit test
 * can see every branch of it.
 *
 * WHAT IT REMEMBERS IS A REF, NOT STATE. Where a touch started is read only
 * when that touch ends; putting it in state would re-render the whole reading
 * surface on every `touchstart`, which is a re-render per tap for a value
 * nothing draws.
 *
 * TWO GESTURES ARE DELIBERATELY IGNORED. A `touchend` with no recorded start
 * is a gesture that began somewhere else - a drawer that closed under the
 * reader's finger, or a touch that started before this element was mounted -
 * and a `touchend` carrying no changed touch is not a gesture at all. Both
 * return without turning anything, rather than reading a coordinate off
 * `undefined`.
 *
 * IT DOES NOT LISTEN FOR `touchmove` AND MUST NOT. SCREENS.md §1.10 asks for
 * `touchstart`/`touchend` only, and the reason is the scrolling column this
 * lives on: a `touchmove` handler that called `preventDefault` to decide
 * mid-gesture whether it was a swipe would be a handler that can cancel the
 * reader's scroll, and one that did not would only be measuring the same
 * delta earlier. The gesture is judged once, when it is finished and its
 * shape is known.
 * Depends on: react, `shouldTurnPage`/`PageTurn` (@travel-diary/domain/swipe).
 */
import { shouldTurnPage, type PageTurn } from '@travel-diary/domain/swipe'
import { useCallback, useRef, type TouchEvent } from 'react'

/** Where a gesture began, in client coordinates. */
interface TouchOrigin {
  readonly x: number
  readonly y: number
}

/** The two handlers the scrolling content spreads onto itself. */
export interface SwipeHandlers {
  readonly onTouchStart: (event: TouchEvent<HTMLElement>) => void
  readonly onTouchEnd: (event: TouchEvent<HTMLElement>) => void
}

/**
 * Reports a committed swipe as a page turn.
 *
 * @param onTurn - Called with `'forward'` or `'backward'` when a finished
 *   gesture clears both of `shouldTurnPage`'s clauses. Never called for a
 *   scroll, a tap, or a gesture too short to be either.
 * @returns The `onTouchStart`/`onTouchEnd` pair to put on the scrolling
 *   element.
 * @example
 * const swipe = useSwipe((turn) => { router.push(pagePath(turn === 'forward' ? n + 1 : n - 1)) })
 * // <div className={styles.content} {...swipe}>{children}</div>
 */
export const useSwipe = (onTurn: (turn: PageTurn) => void): SwipeHandlers => {
  const origin = useRef<TouchOrigin | null>(null)

  const onTouchStart = useCallback((event: TouchEvent<HTMLElement>): void => {
    const touch = event.touches[0]
    origin.current = touch === undefined ? null : { x: touch.clientX, y: touch.clientY }
  }, [])

  const onTouchEnd = useCallback(
    (event: TouchEvent<HTMLElement>): void => {
      const start = origin.current
      const touch = event.changedTouches[0]
      // Cleared whatever happens, so a gesture is never judged twice and a
      // stale origin cannot pair with a later, unrelated `touchend`.
      origin.current = null
      if (start === null || touch === undefined) return

      const turn = shouldTurnPage({ dx: touch.clientX - start.x, dy: touch.clientY - start.y })
      if (turn !== null) onTurn(turn)
    },
    [onTurn],
  )

  return { onTouchStart, onTouchEnd }
}
