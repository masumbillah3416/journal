/**
 * Tile — one square of the gallery grid: the photograph, its number, its
 * caption and, for a clip, the two decorations that mark it as one.
 *
 * Presentational component (CLAUDE.md §3.3) with no state and one callback.
 * It is a `<button>` rather than a link because picking a tile opens a modal
 * over the same document rather than navigating anywhere - the opposite call
 * from `Notes.tsx`'s gallery control, which IS a link precisely because it
 * goes to another route.
 *
 * IT REPORTS AN ID, NEVER ITS POSITION. `onOpen` is handed `frame.id`, and
 * `index` reaches this component only to be printed. That is the whole of the
 * defect the handoff records twice ("`picked` was a positional index into the
 * gallery; once 'sort by date' reordered the list, the selected-frame panel
 * showed a different photo than the grid highlighted") seen from the one
 * place it would be introduced.
 *
 * `loading="lazy"` IS RIGHT HERE AND WRONG IN THE BOOK, and the difference is
 * geometry rather than preference. Every leaf of the diary sits at `inset: 0`,
 * so the browser counts all thirty-three as in the viewport and the attribute
 * does nothing at all - `Photograph.tsx`'s header records the measurement, and
 * that is why the diary uses an explicit window instead. A gallery is an
 * ordinary long scroll: tiles below the fold really are below the fold, so the
 * browser's own deferral is both correct and free, and SCREENS.md §1.8 asks
 * for it by name.
 *
 * THE FOCAL POINT COMES FROM THE MEDIA ITEM, not from a slot, and this is the
 * second placement in the product where that is right (the About portrait is
 * the first). DATA_MODEL.md's rule is "`media.focalPoint` is the default; the
 * slot overrides it" - a gallery tile is a media item shown on its own, with
 * no slot to override anything, so the media item's own value is the only one
 * there is. Applied inline for the same reason `Photograph.tsx` applies it
 * inline: it is an editor's choice for this photograph, which no stylesheet
 * can see.
 *
 * A CLIP GETS A PLAY BADGE AND A DURATION CHIP; A PHOTOGRAPH GETS NEITHER.
 * SCREENS.md §1.8 against §1.4: on a diary page the photographs are
 * arrangement, and a badge would be furniture on furniture; here the reader is
 * CHOOSING what to open, so the two kinds have to be distinguishable before
 * one is opened. Nothing in this book can take that branch yet - video is
 * deferred (`docs/adr/0004-media-pipeline-mode.md`, `MEDIA_PIPELINE=inline`),
 * so no `media` row carries `kind: 'clip'` and no browser test can reach it.
 * It is covered in `Tile.test.tsx` against a clip-shaped fixture, and this
 * comment is the seam's marker.
 * Depends on: react, `GalleryFrame`/`clipDuration`/`frameOrdinal`
 * (@travel-diary/domain/gallery), `MediaId` (@travel-diary/domain/ids),
 * ./gallery.module.css.
 */
import type { GalleryFrame } from '@travel-diary/domain/gallery'
import { clipDuration, frameOrdinal } from '@travel-diary/domain/gallery'
import type { MediaId } from '@travel-diary/domain/ids'
import type React from 'react'
import styles from './gallery.module.css'

/** What one tile needs to print itself. */
export interface TileProps {
  /** The frame this tile shows. */
  readonly frame: GalleryFrame
  /** Its 0-based position in the gallery's CURRENT order, printed and nothing else. */
  readonly index: number
  /** How many frames the gallery holds, which sets the badge's padding. */
  readonly total: number
  /** Called with the frame's id - never its index - when the reader picks it. */
  readonly onOpen: (id: MediaId) => void
  /**
   * The button element, published to `Grid.tsx` so it can put focus back on
   * this tile when the lightbox closes. A plain prop rather than
   * `forwardRef`: React 19 passes `ref` through as one for a function
   * component, and the wrapper bought nothing but a layer.
   */
  readonly ref?: React.Ref<HTMLButtonElement>
}

/**
 * Renders one square of the gallery grid.
 *
 * @param props - The frame, where it currently sits, how large the gallery is, and what to do when it is picked.
 * @returns The tile, as a button carrying the frame's id.
 * @example
 * <Tile frame={frame} index={6} total={61} onOpen={setOpenId} />
 */
export const Tile = ({ frame, index, total, onOpen, ref }: TileProps): React.JSX.Element => {
  const ordinal = frameOrdinal(index, total)
  const duration = frame.kind === 'clip' ? clipDuration(frame.durationSec) : null

  return (
    <button
      type="button"
      className={styles.tile}
      data-tile={frame.id}
      ref={ref}
      // The number and the caption, not the alt text: the image inside
      // already carries its own alt, and repeating it here would have a
      // screen reader read the photograph's description twice.
      aria-label={frame.caption === '' ? `Open frame ${ordinal}` : `Open frame ${ordinal}, ${frame.caption}`}
      onClick={() => {
        onOpen(frame.id)
      }}
    >
      <span className={styles.tileSquare}>
        <img
          className={styles.tileImage}
          src={frame.tileSrc}
          alt={frame.alt}
          loading="lazy"
          decoding="async"
          style={{ objectPosition: `${String(frame.focalX)}% ${String(frame.focalY)}%` }}
        />

        {/* Decorative: the button's own `aria-label` already announces the
         * number, so announcing the badge as well would read it twice. */}
        <span className={styles.indexBadge} data-index-badge aria-hidden="true">
          {ordinal}
        </span>

        {frame.kind === 'clip' && (
          <span className={styles.playBadge} data-play-badge aria-hidden="true">
            <span className={styles.playBadgeDisc}>
              <span className={styles.playBadgeTriangle} />
            </span>
          </span>
        )}

        {duration !== null && (
          <span className={styles.durationChip} data-duration>
            {duration}
          </span>
        )}
      </span>

      {/* Rendered even when empty, unlike every other optional line in the
       * project - see `gallery.module.css`'s `.tileCaption` for why a dropped
       * element here would unlevel the whole grid row. */}
      <span className={styles.tileCaption} data-tile-caption>
        {frame.caption}
      </span>
    </button>
  )
}
