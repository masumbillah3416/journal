'use client'
/**
 * Grid — the gallery's tiles, the one piece of state the route holds, and the
 * window that keeps a very large gallery cheap.
 *
 * THE STATE IS A MEDIA ID. `openId` is the only thing this component
 * remembers, and it is what the handoff records having got wrong twice
 * (README's State section, DATA_MODEL's notes): "`picked` was a positional
 * index into the gallery; once 'sort by date' reordered the list, the
 * selected-frame panel showed a different photo than the grid highlighted."
 * A new `frames` array arriving in a different order therefore changes what
 * the counter says and nothing about which photograph is open.
 *
 * IT IS THE CLIENT BOUNDARY OF THIS ROUTE, and deliberately the whole of it.
 * `GalleryHeader` is a server component and stays one; only the grid and the
 * lightbox need state, so only they are compiled into the route's script
 * bundle - the same split `app/(diary)/p/[n]/page.tsx` makes for the book,
 * for the reason `docs/adr/0007-server-rendered-page-faces.md` records.
 *
 * THE WINDOW IS OFF BELOW A HUNDRED TILES, and that is why the seeded
 * sixty-one-tile gallery costs no scroll handler, no `ResizeObserver` and no
 * re-render while scrolling: `useGridGeometry` subscribes to nothing when it
 * is not enabled, so `tileWindow` sees an unmeasured grid and answers "all of
 * them" (CLAUDE.md §6 asks for virtualization PAST 100, not at every size).
 * The measurement itself lives in `./useGridGeometry` rather than here, for
 * the reason `useBookScale.ts` lives outside `Book.tsx`: a measurement
 * binding is the one part of a component that can be tested without a
 * browser, if it is not tangled up in the markup around it.
 *
 * FOCUS RETURNS TO THE TILE, not to the top of the document. Restoring it is
 * this component's rather than `Lightbox`'s because the tiles are here and
 * the lightbox is unmounted by the time the restoration has to happen - and
 * it returns to the tile the reader STEPPED TO, which is where their attention
 * actually is, not the one they originally opened.
 * Depends on: react, `GalleryFrame`/`GalleryJourney`/`frameIdFromHash`/
 * `tileWindow`/`VIRTUALIZE_ABOVE` (@travel-diary/domain/gallery), `MediaId`
 * (@travel-diary/domain/ids), ./Lightbox, ./Tile, ./useGridGeometry,
 * ./gallery.module.css.
 */
import type { GalleryFrame, GalleryJourney } from '@travel-diary/domain/gallery'
import { VIRTUALIZE_ABOVE, frameIdFromHash, galleryTileSizes, tileWindow } from '@travel-diary/domain/gallery'
import type { MediaId } from '@travel-diary/domain/ids'
import type React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Lightbox } from './Lightbox'
import { Tile } from './Tile'
import { useGridGeometry } from './useGridGeometry'
import styles from './gallery.module.css'

/** What the grid needs to draw a journey's frames. */
export interface GridProps {
  /** The journey, passed through to the lightbox's metadata line. */
  readonly journey: GalleryJourney
  /** The gallery's frames, in the order they are shown. */
  readonly frames: readonly GalleryFrame[]
  /** The grid's minimum tile track, already clamped by `galleryThumbSize`. */
  readonly thumbSize: number
}

/**
 * Renders the tiles, and the lightbox over them when a frame is open.
 *
 * @param props - The journey, its frames and the configured tile size.
 * @returns The grid, and the open frame's dialog when there is one.
 * @example
 * <Grid journey={bundle.journey} frames={bundle.frames} thumbSize={bundle.thumbSize} />
 */
export const Grid = ({ journey, frames, thumbSize }: GridProps): React.JSX.Element => {
  const [openId, setOpenId] = useState<MediaId | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const tiles = useRef(new Map<string, HTMLButtonElement>())
  const framesAtMount = useRef(frames)
  const geometry = useGridGeometry(gridRef, frames.length > VIRTUALIZE_ABOVE)

  // A shared lightbox address, read once. It is never WRITTEN back: the
  // gallery must not push or replace history entries of its own, or the
  // browser's Back button would stop landing on the `/p/<n>` the reader came
  // from - the behaviour `e2e/routing.spec.ts` has asserted since Task 13.
  // Deliberately once, on mount, with an empty dependency list: re-running it
  // whenever `frames` changed would re-open the shared frame after the reader
  // had closed it. `frames` cannot have changed by the first commit anyway -
  // the server rendered it.
  useEffect(() => {
    setOpenId(frameIdFromHash(window.location.hash, framesAtMount.current))
  }, [])

  const close = useCallback(() => {
    // Focus goes back to the tile the reader was last looking at, which after
    // stepping is not the one they opened. Read from `openId` rather than from
    // inside a state updater: an updater must be pure, and React calls it
    // twice under StrictMode.
    if (openId !== null) tiles.current.get(openId)?.focus()
    setOpenId(null)
  }, [openId])

  if (frames.length === 0) {
    return <p className={styles.empty}>No frames in this gallery yet.</p>
  }

  const rendered = tileWindow({ total: frames.length, ...geometry })
  // Both are zero while the grid is unmeasured, which is also every render of
  // a gallery below the windowing threshold - so an unwindowed grid draws no
  // spacers at all.
  const columns = Math.max(1, geometry.columns)
  // Derived once per grid, not once per tile: it is a function of the track
  // this component sets, and every tile in the grid gets the same answer
  // (PH1-003, and `galleryTileSizes`'s own header for the arithmetic).
  const tileSizes = galleryTileSizes(thumbSize)
  const leading = (rendered.from / columns) * geometry.rowHeight
  const trailing = Math.ceil((frames.length - rendered.to) / columns) * geometry.rowHeight

  return (
    <>
      <div
        className={styles.grid}
        data-gallery-grid
        ref={gridRef}
        // The cast is React's own gap rather than a loosening (CLAUDE.md
        // §3.1): `CSSProperties` has no index signature for custom
        // properties, and a `--*` key is the only way to hand a measured
        // value to a `repeat(auto-fill, minmax(...))` track from TypeScript.
        style={{ '--td-gallery-thumb': `${String(thumbSize)}px` } as React.CSSProperties}
      >
        {leading > 0 && <div className={styles.spacer} style={{ height: `${String(leading)}px` }} aria-hidden="true" />}

        {frames.slice(rendered.from, rendered.to).map((frame, offset) => (
          <Tile
            key={frame.id}
            frame={frame}
            index={rendered.from + offset}
            total={frames.length}
            onOpen={setOpenId}
            sizes={tileSizes}
            ref={(element) => {
              if (element === null) tiles.current.delete(frame.id)
              else tiles.current.set(frame.id, element)
            }}
          />
        ))}

        {trailing > 0 && (
          <div className={styles.spacer} style={{ height: `${String(trailing)}px` }} aria-hidden="true" />
        )}
      </div>

      {openId !== null && (
        <Lightbox journey={journey} frames={frames} openId={openId} onOpen={setOpenId} onClose={close} />
      )}
    </>
  )
}
