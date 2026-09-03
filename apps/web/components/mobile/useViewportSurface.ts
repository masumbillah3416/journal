/**
 * useViewportSurface — measures the viewport and reports which reading surface
 * it asks for.
 *
 * Adapter (CLAUDE.md §3.3) over `surfaceForWidth` from
 * `@travel-diary/domain/readingSurface`, and deliberately the same shape as
 * `useBookScale`: the comparison against the 860px breakpoint is the pure
 * function's, and this hook only supplies it with a measurement and
 * re-supplies one whenever the viewport changes. It holds no breakpoint of its
 * own, so the browser's answer and the server's cannot disagree about where
 * the line is.
 *
 * IT STARTS FROM WHAT THE SERVER SERVED, not from a measurement. The first
 * client render has to produce the markup the server already sent or React
 * reports a hydration mismatch, and the server had no viewport to measure
 * (`readingSurface.ts`'s header). So the served surface is the initial state
 * and the measurement replaces it on the first frame - which is the same
 * "unmeasured value, corrected on mount" contract `useBookScale`'s
 * `UNMEASURED_SCALE` has.
 *
 * BOTH A `resize` LISTENER AND A `ResizeObserver`, for the reasons
 * `useBookScale`'s header sets out: the listener catches a window change that
 * leaves the observed element's box alone, and the observer catches a box
 * change with no window event behind it. Every measurement happens inside one
 * `requestAnimationFrame`, so a resize drag that fires fifty events costs one
 * measurement rather than fifty (CLAUDE.md §6).
 *
 * IT MEASURES `window.innerWidth`, which is what the handoff prototype
 * measures for this same decision (`Travel Diary.dc.html`'s `measure()`), with
 * `documentElement.clientWidth` behind it for the case `innerWidth` reports
 * zero - a detached or not-yet-laid-out document. A zero measurement is not
 * discarded, because `surfaceForWidth` has a defined answer for it; see its
 * own doc comment.
 * Depends on: react, `surfaceForWidth`/`ReadingSurface`
 * (@travel-diary/domain/readingSurface).
 */
import { surfaceForWidth, type ReadingSurface } from '@travel-diary/domain/readingSurface'
import { useEffect, useState } from 'react'

/** No frame is queued. `requestAnimationFrame` never returns 0, so it is safe as the empty value. */
const NO_FRAME = 0

/**
 * Reports which reading surface the viewport in front of the reader asks for.
 *
 * @param served - The surface the server rendered, used as the state's initial
 *   value so the first client render agrees with the document.
 * @returns The surface the measured viewport width belongs to.
 * @example
 * const measured = useViewportSurface(served)
 * // measured !== served means the guess in `readingSurface.ts` was wrong
 */
export const useViewportSurface = (served: ReadingSurface): ReadingSurface => {
  const [surface, setSurface] = useState<ReadingSurface>(served)

  useEffect(() => {
    let frame = NO_FRAME

    const measure = (): void => {
      frame = NO_FRAME
      setSurface(surfaceForWidth(window.innerWidth || document.documentElement.clientWidth))
    }

    // The handlers below read no layout of their own; they only ensure exactly
    // one frame is queued.
    const schedule = (): void => {
      if (frame !== NO_FRAME) return
      frame = requestAnimationFrame(measure)
    }

    measure()
    window.addEventListener('resize', schedule)

    // Guarded because `ResizeObserver` is not universal: jsdom ships none, so
    // an unguarded constructor would throw in every component test rather
    // than falling back to the resize listener.
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null
    observer?.observe(document.documentElement)

    return () => {
      if (frame !== NO_FRAME) cancelAnimationFrame(frame)
      window.removeEventListener('resize', schedule)
      observer?.disconnect()
    }
  }, [])

  return surface
}
