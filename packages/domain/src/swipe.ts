/**
 * swipe — whether a touch gesture on the mobile reading mode turns a page.
 *
 * Pure decision function (CLAUDE.md §3.2: prefer pure functions, push side
 * effects to the edges), and the only piece of the mobile reading mode that
 * is not React. `apps/web/components/mobile/useSwipe.ts` records where a
 * touch started and ended and asks this module what the difference means; it
 * holds no arithmetic of its own, so the rule below is stated once, in the
 * one place a test can see every branch of it.
 *
 * THE SECOND CLAUSE IS THE WHOLE POINT OF THIS MODULE. SCREENS.md §1.10:
 * "commit only when `|dx| >= 60` and `|dx| >= 1.4 x |dy|`, so vertical
 * scrolling never turns a page." The mobile reader's content is a scrolling
 * column, and the same finger does both jobs: without the ratio clause every
 * flick down the page that drifted sixty pixels sideways would also turn a
 * leaf, and the reader would lose their place while trying to read. The
 * distance clause alone cannot express that - a 300px scroll with 90px of
 * sideways drift clears sixty easily - which is why both are here and why
 * `swipe.test.ts` tests the diagonals on both sides of the ratio rather than
 * only the obvious horizontal and vertical cases.
 *
 * BOTH BOUNDARIES BELONG TO THE TURN. `>=` in both clauses is the handoff's
 * own comparison, so a gesture exactly 60px across and exactly at the 1.4
 * ratio commits. Stated here because it is the kind of thing a later edit
 * "tidies" into `>` without noticing that it has moved the design.
 *
 * DIRECTION IS THE SIGN OF `dx`, and nothing else: a leftward swipe (`dx`
 * negative) pulls the next page in from the right, which is the direction a
 * printed page turns. A gesture that commits neither way is `null` rather
 * than a third `'none'` member, so a caller that forgets to handle it fails
 * to compile instead of turning a page by accident.
 * Depends on nothing.
 */

/**
 * The minimum horizontal travel, in CSS pixels, a gesture needs before it can
 * turn a page at all (SCREENS.md §1.10). Below this it is a tap, a tremor or
 * the start of a scroll.
 */
export const SWIPE_MIN_DISTANCE_PX = 60

/**
 * How many times more horizontal than vertical a gesture must be to count as
 * a swipe rather than a scroll (SCREENS.md §1.10). See this module's header
 * for why this clause, not the distance, is the one that matters.
 */
export const SWIPE_HORIZONTAL_RATIO = 1.4

/** How far a gesture travelled, in CSS pixels, from where it started. */
export interface SwipeDelta {
  /** Rightward is positive: `endX - startX`. */
  readonly dx: number
  /** Downward is positive: `endY - startY`. */
  readonly dy: number
}

/**
 * Which way a committed swipe turns the book. `'forward'` is the next page.
 */
export type PageTurn = 'forward' | 'backward'

/**
 * Decides whether a finished touch gesture turns a page, and which way.
 *
 * @param delta - How far the gesture travelled from where it started.
 * @returns `'forward'` for a leftward swipe, `'backward'` for a rightward
 *   one, and `null` for any gesture that is too short or too vertical to be
 *   a swipe - which is every scroll.
 * @example
 * shouldTurnPage({ dx: -80, dy: 10 }) // 'forward'
 * shouldTurnPage({ dx: -80, dy: 60 }) // null - 80 < 1.4 x 60, so it is a scroll
 */
export const shouldTurnPage = ({ dx, dy }: SwipeDelta): PageTurn | null => {
  const across = Math.abs(dx)
  if (across < SWIPE_MIN_DISTANCE_PX) return null
  if (across < SWIPE_HORIZONTAL_RATIO * Math.abs(dy)) return null

  return dx < 0 ? 'forward' : 'backward'
}
