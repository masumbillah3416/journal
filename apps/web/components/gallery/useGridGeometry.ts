'use client'
/**
 * useGridGeometry — measures a laid-out gallery grid, for the window that
 * keeps a very large one cheap.
 *
 * It is a separate module from `Grid.tsx` for the reason `useBookScale.ts` is
 * separate from `Book.tsx`: a measurement binding is the one part of a
 * component that CAN be tested without a browser, if it is not tangled up in
 * the markup around it. jsdom reports every element as 0x0 and ships no
 * `ResizeObserver`, so a test declares the boxes and stands the observer in -
 * both browser APIs, not our own modules, so standing them in is not the
 * mocking CLAUDE.md §2.3 forbids.
 *
 * IT MEASURES NOTHING UNLESS ASKED. `enabled` is `frames.length >
 * VIRTUALIZE_ABOVE`, and when it is false this hook attaches no listener, no
 * observer and no animation frame, and returns {@link UNMEASURED} - which
 * `tileWindow` answers with "render everything". That is what makes CLAUDE.md
 * §6's rule ("virtualize the gallery grid past 100 tiles") a threshold rather
 * than a default: the seeded sixty-one-frame gallery pays nothing at all.
 *
 * THE COLUMN COUNT IS READ, NOT RECOMPUTED. `repeat(auto-fill,
 * minmax(<thumb>, 1fr))` is the browser's arithmetic; re-deriving it here
 * from `thumbSize` would drift the moment a gap or a padding changed. The one
 * constant this hook does carry is the grid's own 16px column gap and 18px row
 * gap, which are SCREENS.md §1.8's and are stated in `gallery.module.css`
 * beside them.
 *
 * SCROLL IS READ INSIDE `requestAnimationFrame` AND RESIZE THROUGH A
 * `ResizeObserver` (CLAUDE.md §6: "Debounce or `requestAnimationFrame` every
 * resize and scroll handler. Prefer `ResizeObserver` to resize listeners"). A
 * burst of scroll events collapses into one layout read rather than one per
 * event.
 *
 * THE SCROLLER IS THE DOCUMENT, not the grid: the gallery route is an
 * ordinary page that scrolls, so how far the reader has scrolled INTO the
 * grid is the grid's own distance above the viewport top, which is what
 * `-getBoundingClientRect().top` is.
 * Depends on: react.
 */
import { useEffect, useState, type RefObject } from 'react'

/** What `tileWindow` needs measured off the laid-out grid. */
export interface GridGeometry {
  /** How many tiles the grid currently fits across. */
  readonly columns: number
  /** One row's height in pixels: a tile plus the row gap beneath it. */
  readonly rowHeight: number
  /** How far the reader has scrolled into the grid. */
  readonly scrollTop: number
  /** The viewport's height. */
  readonly viewportHeight: number
}

/**
 * A grid nothing has measured yet. `tileWindow` answers this with the whole
 * collection, which is the correct answer to "I do not know how much fits" -
 * dividing by an unmeasured zero would render an empty gallery on first paint.
 */
export const UNMEASURED: GridGeometry = { columns: 0, rowHeight: 0, scrollTop: 0, viewportHeight: 0 }

/** The grid's column gap, from SCREENS.md §1.8's `gap: 18px 16px`. */
const COLUMN_GAP = 16

/** The grid's row gap, from the same declaration. */
const ROW_GAP = 18

/**
 * Measures the grid on mount, on resize and while the reader scrolls.
 *
 * @param grid - A ref to the grid element. A ref that is never attached measures nothing.
 * @param enabled - Whether this gallery is large enough to be windowed at all.
 * @returns The grid's current geometry, or {@link UNMEASURED} while it is off or unmeasured.
 * @example
 * const geometry = useGridGeometry(gridRef, frames.length > VIRTUALIZE_ABOVE)
 */
export const useGridGeometry = (grid: RefObject<HTMLElement | null>, enabled: boolean): GridGeometry => {
  const [geometry, setGeometry] = useState<GridGeometry>(UNMEASURED)

  useEffect(() => {
    if (!enabled) return undefined

    let pending = 0
    const measure = (): void => {
      const element = grid.current
      if (element === null) return

      const tile = element.querySelector('[data-tile]')?.getBoundingClientRect()
      const box = element.getBoundingClientRect()
      const tileWidth = tile?.width ?? 0

      setGeometry({
        columns: tileWidth === 0 ? 0 : Math.max(1, Math.round((box.width + COLUMN_GAP) / (tileWidth + COLUMN_GAP))),
        rowHeight: tile === undefined || tile.height === 0 ? 0 : tile.height + ROW_GAP,
        scrollTop: Math.max(0, -box.top),
        viewportHeight: window.innerHeight,
      })
    }

    const onScroll = (): void => {
      cancelAnimationFrame(pending)
      pending = requestAnimationFrame(measure)
    }

    // A browser without `ResizeObserver` is still a browser that scrolls: the
    // window listener alone keeps the grid usable, so its absence degrades
    // rather than throwing - the same treatment `useBookScale` gives it.
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure)
    if (grid.current !== null) observer?.observe(grid.current)
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    measure()

    return () => {
      cancelAnimationFrame(pending)
      observer?.disconnect()
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [enabled, grid])

  return enabled ? geometry : UNMEASURED
}
