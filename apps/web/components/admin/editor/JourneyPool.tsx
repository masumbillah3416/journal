/**
 * JourneyPool — SCREENS.md §2.3's right column: the "Journey pool" eyebrow with
 * "{n} of {total} in the book", the instruction line, and the 2-column tile grid
 * beneath them.
 *
 * ═══ A TILE PLACES ITS PHOTOGRAPH IN THE FRAME THE ADDRESS NAMES ═══
 *
 * Task 5 drew these tiles inert, because putting a photograph into a frame is
 * `setSlotMedia` and that is Task 7's. It is Task 7. A tile is now a `<form>`
 * posting the media row and the cell `?slot=` names — so the pool ships no
 * JavaScript, exactly as the rail's arrows do not, and the choice of frame is an
 * ADDRESS rather than state (a Replace link in `SlotPanel.tsx` sets it).
 *
 * WITH NO FRAME CHOSEN THE TILES ARE DISABLED AND THE LINE SAYS SO. A tick that
 * had to guess which cell it meant would be the dead affordance Task 5's sweep
 * is this repository's record of — and "the first empty cell" is a rule nobody
 * asked for, which is the abstraction CLAUDE.md §4 refuses.
 *
 * ═══ TICKED IS A SET OF MEDIA IDS, NEVER A POSITION ═══
 *
 * A tile is ticked when the page being edited already holds that photograph, and
 * the question is asked of a `ReadonlySet<MediaId>` (CLAUDE.md §0.9). The pool
 * is sorted by the library's own `order`, which an author can change from the
 * Media screen while this page is open; a ticked-by-index pool would then tick
 * whichever photograph had moved into that place. `JourneyPool.test.tsx`
 * re-sorts the list between two renders and asserts the same tile stays ticked.
 *
 * // HANDOFF-DEVIATION: the prototype's tick toggles the media row's own
 * `inBook` column ("Tick a frame to place it in the book"), which is a write
 * `SCREENS.md` gives no other control and which says nothing about WHERE in the
 * book. The tick here places the photograph in a frame, which is the thing an
 * author on this screen is trying to do and the thing this task's four actions
 * do. The eyebrow's count still reads the `inBook` column, so it still answers
 * the question the prototype's label asks. See docs/deviations.md.
 *
 * A TILE WITH NO DERIVATIVE DRAWS AN EMPTY SQUARE. `readJourneyEditor` answers
 * `null` for an upload too small to have a `thumb`, rather than falling back to
 * the original — a 2-column sidebar of 4000px uploads is the whole library on
 * the wire (CLAUDE.md §6).
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. A list rendered, one form per
 * row.
 * Depends on: react, `JourneyId`/`MediaId`/`SlotKey` (@travel-diary/domain/ids),
 * `PoolItem` (../../../lib/admin/readJourneyEditor), ./editor.module.css.
 */
import type { JourneyId, MediaId, SlotKey } from '@travel-diary/domain/ids'
import type React from 'react'
import type { PoolItem } from '../../../lib/admin/readJourneyEditor'
import styles from './editor.module.css'

/** What the pool column needs to draw itself. */
export interface JourneyPoolProps {
  /** The journey being edited — the cache address every tile posts. */
  readonly journey: JourneyId
  /** The journey's media, in the library's own order. */
  readonly items: readonly PoolItem[]
  /** How many of them are in the book — the eyebrow's count. */
  readonly inBook: number
  /** Which photographs the page being edited already holds, by id. */
  readonly ticked: ReadonlySet<MediaId>
  /** The cell `?slot=` names, which a tile fills, or `null` when none is chosen. */
  readonly target: SlotKey | null
  /** Puts a photograph into that cell. */
  readonly place: (form: FormData) => Promise<void>
  /** Where "Drop files or browse" goes — the media screen. */
  readonly browseHref: string
}

/**
 * Renders SCREENS.md §2.3's journey pool.
 *
 * @param props - See {@link JourneyPoolProps}.
 * @returns The eyebrow, the tile grid and the footer.
 * @example
 * <JourneyPool journey={view.id} items={view.pool} inBook={view.inBook} ticked={held} target={slot} … />
 */
export const JourneyPool = ({
  journey,
  items,
  inBook,
  ticked,
  target,
  place,
  browseHref,
}: JourneyPoolProps): React.JSX.Element => (
  <section data-journey-pool aria-label="Journey pool" className={styles.pool}>
    <p className={styles.eyebrow}>
      Journey pool —{' '}
      <span data-pool-count className={styles.poolCount}>
        {inBook} of {items.length} in the book
      </span>
    </p>
    <p data-pool-instruction className={styles.poolNote}>
      {target === null
        ? 'Choose a frame with Replace, then tick a photograph to place it.'
        : 'Tick a photograph to place it in the frame you chose.'}
    </p>

    {/* THE SCROLLER TAKES A FOCUS STOP EXACTLY WHEN NOTHING INSIDE IT CAN.
     * §2.3 caps this grid at `max-height: 432px` and scrolls it, and WCAG
     * 2.1.1 wants a scrollable region reachable — through a focusable
     * descendant or by taking the focus itself. Task 5 gave the list
     * `tabIndex={0}` because its tiles were inert, with a comment saying the
     * stop should go "when the tiles become buttons". Task 7 made them buttons
     * and removed it, and axe reported the violation AGAIN
     * (`docs/qa/2026-09-20-journey-slots-sweep.md`, SLOT-001): with no frame
     * chosen every tile is `disabled`, and a disabled button is not focusable.
     * The real condition was never "are they buttons" but "can a keyboard
     * reach one", which is what this ternary asks. */}
    <ul
      tabIndex={target === null ? 0 : undefined}
      aria-label="Frames uploaded to this journey"
      className={styles.poolGrid}
    >
      {items.map((item) => (
        <li key={item.id} data-pool-item={item.id} data-ticked={ticked.has(item.id) ? '' : undefined}>
          <form action={place}>
            <input type="hidden" name="journey" value={journey} />
            <input type="hidden" name="slot" value={target ?? ''} />
            <input type="hidden" name="media" value={item.id} />
            <button
              type="submit"
              data-pool-place
              disabled={target === null}
              aria-label={`Place ${item.alt} in the chosen frame`}
              className={[styles.tile, ticked.has(item.id) ? styles.tileTicked : ''].join(' ')}
            >
              {item.thumbSrc === null ? null : (
                // A plain `<img>` on a Payload derivative already sized for this
                // tile, as `components/gallery/Tile.tsx` serves its own: `thumb` is
                // 400px square and the tile is about 120px, so a second optimiser
                // in front of it would buy nothing. `loading="lazy"` because the
                // grid scrolls at `max-height: 432px` and most of it is below the
                // fold of its own scroller.
                <img src={item.thumbSrc} alt="" loading="lazy" decoding="async" className={styles.tileImage} />
              )}
              <span data-pool-tick aria-hidden="true" className={styles.tick}>
                {ticked.has(item.id) ? '✓' : ''}
              </span>
              {item.duration === null ? null : (
                <span data-pool-duration className={styles.duration}>
                  {item.duration}
                </span>
              )}
            </button>
          </form>
        </li>
      ))}
    </ul>

    <a href={browseHref} data-pool-browse className={styles.poolFooter}>
      Drop files or browse
    </a>
  </section>
)
