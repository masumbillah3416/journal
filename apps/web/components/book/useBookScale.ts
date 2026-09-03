/**
 * useBookScale — measures the book's area and reports the scale that fits it.
 *
 * Adapter (CLAUDE.md §3.3) over `bookScale` from `@travel-diary/domain`: the
 * arithmetic, including the 1.7x cap the handoff asks for at 4K, is the pure
 * function's; this hook only supplies it with a measurement and re-supplies
 * one whenever the area changes. The book is authored at exactly 1300x860 and
 * scaled, never reflowed, so every measurement in SCREENS.md stays absolute
 * and the page behaves like a printed one.
 *
 * Scaling by `transform` rather than by resizing the box is also what keeps
 * the CLS budget (CLAUDE.md §6, <= 0.1) safe by construction: a transform
 * takes no part in layout, so the correction from the initial scale to the
 * measured one moves nothing on the page.
 *
 * Every measurement happens inside a `requestAnimationFrame`, and a burst of
 * events collapses into one frame (CLAUDE.md §6: "debounce or
 * requestAnimationFrame every resize handler"; "no synchronous layout reads
 * inside animation frames"). Both a `ResizeObserver` on the container and a
 * window `resize` listener feed it: the observer is the one that fires for a
 * container that changes without the window doing so, and the listener is the
 * one that fires for a window change that leaves the container's own box
 * unchanged. Neither of the two handlers reads layout itself - they only
 * queue the frame that does.
 * Depends on: react, `bookScale` (@travel-diary/domain/bookScale).
 */
import { bookScale } from '@travel-diary/domain/bookScale'
import { useEffect, useState, type RefObject } from 'react'

/**
 * The scale used before the first measurement, and whenever there is no
 * container to measure. 1 means "authored size", which is what the server
 * renders and what the client's first render must agree with; the measured
 * value replaces it on the first frame.
 */
const UNMEASURED_SCALE = 1

/** No frame is queued. `requestAnimationFrame` never returns 0, so it is safe as the empty value. */
const NO_FRAME = 0

/**
 * Reports the factor the 1300x860 design box should be scaled by to fit its
 * container.
 *
 * @param container - A ref to the element the book is centred in. May hold
 *   `null` before mount or after unmount, in which case the scale rests at
 *   its unmeasured value rather than throwing.
 * @returns The scale factor, between `bookScale`'s own floor and its 1.7x cap.
 * @example
 * const stage = useRef<HTMLDivElement | null>(null)
 * const scale = useBookScale(stage)
 * // <div ref={stage}><div style={{ transform: `scale(${scale})` }} /></div>
 */
export const useBookScale = (container: RefObject<HTMLElement | null>): number => {
  const [scale, setScale] = useState(UNMEASURED_SCALE)

  useEffect(() => {
    const element = container.current
    if (element === null) return undefined

    let frame = NO_FRAME

    const measure = (): void => {
      frame = NO_FRAME
      setScale(bookScale({ width: element.clientWidth, height: element.clientHeight }))
    }

    // The handlers below do no layout reading of their own; they only ensure
    // exactly one frame is queued, so a resize drag that fires fifty events
    // costs one measurement, not fifty.
    const schedule = (): void => {
      if (frame !== NO_FRAME) return
      frame = requestAnimationFrame(measure)
    }

    measure()
    window.addEventListener('resize', schedule)

    // Guarded because `ResizeObserver` is not universal: jsdom ships none, so
    // an unguarded `new ResizeObserver(...)` would throw in every component
    // test rather than simply falling back to the resize listener.
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null
    observer?.observe(element)

    return () => {
      if (frame !== NO_FRAME) cancelAnimationFrame(frame)
      window.removeEventListener('resize', schedule)
      observer?.disconnect()
    }
  }, [container])

  return scale
}
