/**
 * JourneyPool — SCREENS.md §2.3's right column: the "Journey pool" eyebrow with
 * "{n} of {total} in the book", the instruction line, and the 2-column tile grid
 * beneath them.
 *
 * ═══ WHAT IT DRAWS, AND WHAT IT DELIBERATELY DOES NOT ═══
 *
 * §2.3 gives each tile a tick box and a ringed selected state, and those act on
 * the SELECTED PAGE'S SLOTS — putting a photograph into a frame is
 * `setSlotMedia`, which is Task 7's. This task builds the editor's frame, and
 * the pool is the third of its three columns: a column left empty would collapse
 * the grid `editor.module.css` describes into a shape no later baseline would
 * match, and the data is already read (`readJourneyEditor` fetches it in the
 * same three queries). So the tiles are drawn, with their in-book ring and their
 * duration chips, and NOTHING here is clickable yet.
 *
 * The ring is the row's own `inBook` column rather than a selection: it says
 * "this photograph is in the book", which is what the eyebrow's count is over.
 *
 * A TILE WITH NO DERIVATIVE DRAWS AN EMPTY SQUARE. `readJourneyEditor` answers
 * `null` for an upload too small to have a `thumb`, rather than falling back to
 * the original — a 2-column sidebar of 4000px uploads is the whole library on
 * the wire (CLAUDE.md §6).
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. A list rendered.
 * Depends on: react, `PoolItem` (../../../lib/admin/readJourneyEditor),
 * ./editor.module.css.
 */
import type React from 'react'
import type { PoolItem } from '../../../lib/admin/readJourneyEditor'
import styles from './editor.module.css'

/** What the pool column needs to draw itself. */
export interface JourneyPoolProps {
  /** The journey's media, in the library's own order. */
  readonly items: readonly PoolItem[]
  /** How many of them are in the book. */
  readonly inBook: number
  /** Where "Drop files or browse" goes — the media screen, scoped to nothing yet. */
  readonly browseHref: string
}

/**
 * Renders SCREENS.md §2.3's journey pool.
 *
 * @param props - See {@link JourneyPoolProps}.
 * @returns The eyebrow, the tile grid and the footer.
 * @example
 * <JourneyPool items={view.pool} inBook={view.inBook} browseHref="/admin/media" />
 */
export const JourneyPool = ({ items, inBook, browseHref }: JourneyPoolProps): React.JSX.Element => (
  <section data-journey-pool aria-label="Journey pool" className={styles.pool}>
    <p className={styles.eyebrow}>
      Journey pool —{' '}
      <span data-pool-count className={styles.poolCount}>
        {inBook} of {items.length} in the book
      </span>
    </p>
    <p className={styles.poolNote}>Everything uploaded to this journey. Ticked frames are in the book.</p>

    <ul className={styles.poolGrid}>
      {items.map((item) => (
        <li
          key={item.id}
          data-pool-item={item.id}
          data-in-book={item.inBook ? '' : undefined}
          className={[styles.tile, item.inBook ? styles.tileInBook : ''].join(' ')}
        >
          {item.thumbSrc === null ? null : (
            // A plain `<img>` on a Payload derivative already sized for this
            // tile, as `components/gallery/Tile.tsx` serves its own: `thumb` is
            // 400px square and the tile is about 120px, so a second optimiser
            // in front of it would buy nothing. `loading="lazy"` because the
            // grid scrolls at `max-height: 432px` and most of it is below the
            // fold of its own scroller.
            <img src={item.thumbSrc} alt={item.alt} loading="lazy" decoding="async" className={styles.tileImage} />
          )}
          {item.duration === null ? null : (
            <span data-pool-duration className={styles.duration}>
              {item.duration}
            </span>
          )}
        </li>
      ))}
    </ul>

    <a href={browseHref} data-pool-browse className={styles.poolFooter}>
      Drop files or browse
    </a>
  </section>
)
