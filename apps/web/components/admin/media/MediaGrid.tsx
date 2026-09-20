'use client'

/**
 * MediaGrid — SCREENS.md §2.4's controls row, its bulk bar and the tile grid
 * beneath them.
 *
 * ═══ THE SECOND OF THIS SCREEN'S TWO CLIENT ISLANDS, AND WHY THE CONTROLS ARE
 *     INSIDE IT ═══
 *
 * §2.4 draws the search, the five chips and the bulk bar as ONE row, and the
 * bulk bar exists only while there is a selection — which is state this
 * component owns. Rendering the row on the server and the bar here would put
 * them on two lines, so the row is drawn here. **What it draws is unchanged by
 * that**: the search is still a `GET` form and each chip is still an `<a>` to
 * an address, so both survive a reload, can be sent to somebody and work with
 * no JavaScript of ours. `Dropzone.tsx` is the other island, and both are
 * named in `shellShipsNoClientJs.test.ts`'s `ISLANDS` allowlist so a THIRD in
 * this directory fails by name.
 *
 * ═══ SELECTION IS A SET OF MEDIA IDS, NEVER A POSITION ═══
 *
 * CLAUDE.md §0.9. The grid is re-sorted by the library's own `order`, which an
 * author can change from elsewhere, and it is re-rendered whenever the chip or
 * the search changes — a selection kept by index would move to whichever
 * photograph had taken that place. `MediaGrid.test.tsx` re-sorts the rows
 * between two renders and asserts the same tile stays selected.
 *
 * ═══ THE GRID WINDOWS PAST A HUNDRED TILES ═══
 *
 * CLAUDE.md §6 and design spec §12. The property is that the number of tile
 * ELEMENTS does not grow with the number of rows, and the arithmetic is
 * `virtualWindow` in `@travel-diary/domain/admin/gridColumns` — pure, because
 * jsdom has no layout and a decision taken inline here could only ever be
 * tested in its unmeasured arm. This component MEASURES (the grid's offset
 * from the viewport top, one cell's height, the number of tracks the browser
 * actually laid out) and asks; the rows the window skips become two spacers,
 * so the scrollbar still describes the whole grid.
 *
 * ═══ THE `In book` CHIP IS `inBook`'s FIRST PER-TILE DISPLAY ANYWHERE ═══
 *
 * `docs/deviations.md` §63: the journey editor's pool spent its one piece of
 * per-tile state on "this page holds it", so the column had an eyebrow
 * counting it and no tile showing it. This grid's chip and its `In the book`
 * filter are that display, and the bulk bar's "Add to book" is the column's
 * first writer in this repository.
 *
 * ═══ WHAT A FAILED BULK WRITE DOES ═══
 *
 * Nothing visible. The three actions are dispatched inside `startTransition`,
 * so a rejection surfaces as an unhandled promise rejection in the browser
 * rather than as Next.js's error boundary — quieter even than the editor's
 * (`docs/deviations.md` §60, which this screen inherits unchanged). §2.4 draws
 * no error surface and inventing one is the abstraction CLAUDE.md §4 refuses.
 * The refusals themselves are unreachable by clicking: the ids come from these
 * rows, the destination from this select, and the caption is any string.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. A list, a set and three forms
 * that are not forms.
 * ═══ THE GRID IS NOT REFRESHED FROM HERE ═══
 *
 * Each of the three actions calls `revalidatePath('/admin/media')` on the
 * server, which is what every other admin action in this repository does
 * (`app/(admin)/admin/journeys/actions.ts`). So the new rows arrive as a
 * re-render of the Server Component above this one rather than as something
 * this component asked for — which is why there is no `useRouter` here, and
 * why the selection is cleared locally in the same transition.
 *
 * Depends on: react, `MediaFilter`/`MEDIA_FILTERS`
 * (@travel-diary/domain/admin/mediaFilters), `gridMinimum`/`virtualWindow`
 * (@travel-diary/domain/admin/gridColumns), `MediaId`
 * (@travel-diary/domain/ids), `JourneyChoice`/`MediaRow`
 * (../../../lib/admin/readMediaScreen), ./media.module.css.
 */
import { DEFAULT_GRID_COLUMNS, GRID_GAP_PX, gridMinimum, virtualWindow } from '@travel-diary/domain/admin/gridColumns'
import type { MediaFilter } from '@travel-diary/domain/admin/mediaFilters'
import { MEDIA_FILTERS } from '@travel-diary/domain/admin/mediaFilters'
import type { MediaId } from '@travel-diary/domain/ids'
import type React from 'react'
import { useEffect, useRef, useState, useTransition } from 'react'
import type { JourneyChoice, MediaRow } from '../../../lib/admin/readMediaScreen'
import styles from './media.module.css'

/** What the chips print, which is SCREENS.md §2.4's own five words. */
const CHIP_LABEL: Readonly<Record<MediaFilter, string>> = {
  everything: 'Everything',
  stills: 'Stills',
  clips: 'Clips',
  'in-the-book': 'In the book',
  unused: 'Unused',
}

/** Which extra field the bulk bar is showing, if any. */
type BulkEntry = 'none' | 'caption' | 'move'

/** What this component has measured off the laid-out grid, or zeroes. */
interface GridMeasurements {
  /** How many pixels of the grid are above the top of the viewport. */
  readonly scrolledPast: number
  /** One row of cells including the gap below it. */
  readonly rowHeight: number
  /** How many tracks the browser actually laid out. */
  readonly columns: number
}

/** Nothing measured: every render before layout, and every render in jsdom. */
const UNMEASURED: GridMeasurements = { scrolledPast: 0, rowHeight: 0, columns: 0 }

/** What the grid needs. */
export interface MediaGridProps {
  /** The tiles the search and the chip admitted, in the library's own order. */
  readonly rows: readonly MediaRow[]
  /** How many rows the search admitted, before the chip narrowed them. */
  readonly total: number
  /** What the search box holds — an address, not state. */
  readonly search: string
  /** Which chip is pressed — an address, not state. */
  readonly filter: MediaFilter
  /** Where "Move" can send a selection. The dropzone's own list. */
  readonly journeys: readonly JourneyChoice[]
  /**
   * Whether this deployment draws clip affordances.
   *
   * `showsClipAffordances`, read on the SERVER from `MEDIA_PIPELINE` and
   * passed down — never `process.env` in a component (design spec §9.3).
   * `JourneyPool.tsx` carries the same prop for the same reason.
   */
  readonly showsClips: boolean
  /** Sets `inBook` on every selected row. */
  readonly addToBook: (ids: readonly string[]) => Promise<void>
  /** Writes one caption to every selected row. */
  readonly captionMedia: (ids: readonly string[], caption: string) => Promise<void>
  /** Re-points every selected row at another journey. */
  readonly moveMedia: (ids: readonly string[], journey: string) => Promise<void>
}

/**
 * One chip's address.
 *
 * The chip is a LINK, so the browser does the navigation and the search
 * survives the press — a chip that dropped `q` would read as the chip clearing
 * the search box. `JourneyControls.tsx` builds its own the same way.
 * @param chip - The chip being drawn.
 * @param search - What the search box currently holds.
 * @returns The address that chip goes to.
 */
const chipHref = (chip: MediaFilter, search: string): string => {
  const params = new URLSearchParams()
  if (chip !== 'everything') params.set('filter', chip)
  if (search !== '') params.set('q', search)
  const query = params.toString()
  return query === '' ? '/admin/media' : `/admin/media?${query}`
}

/**
 * Renders SCREENS.md §2.4's controls row and grid.
 *
 * @param props - See {@link MediaGridProps}.
 * @returns The controls, the bulk bar when something is selected, and the grid.
 * @example
 * <MediaGrid rows={view.rows} total={view.total} search={query.search} filter={query.filter} … />
 */
export const MediaGrid = ({
  rows,
  total,
  search,
  filter,
  journeys,
  showsClips,
  addToBook,
  captionMedia,
  moveMedia,
}: MediaGridProps): React.JSX.Element => {
  const grid = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState<ReadonlySet<MediaId>>(new Set())
  const [entry, setEntry] = useState<BulkEntry>('none')
  const [caption, setCaption] = useState('')
  const [destination, setDestination] = useState(journeys[0]?.id ?? '')
  const [, startTransition] = useTransition()
  const [measured, setMeasured] = useState<GridMeasurements>(UNMEASURED)

  useEffect(() => {
    const read = (): void => {
      const element = grid.current
      /* c8 ignore next -- no organic trigger: the effect runs after the ref is attached, and the listener is removed before it is detached. */
      if (element === null) return

      const cell = element.querySelector('[data-media-cell]')
      const tracks = globalThis.getComputedStyle(element).gridTemplateColumns
      setMeasured({
        // NEGATIVE `top` IS HOW FAR THE GRID HAS GONE PAST, which is the one
        // number `virtualWindow` needs and the only one a scroll listener has
        // to recompute.
        scrolledPast: Math.max(0, -element.getBoundingClientRect().top),
        rowHeight: cell === null ? 0 : cell.getBoundingClientRect().height + GRID_GAP_PX,
        // The tracks the BROWSER laid out, not the ones this file asked for:
        // `auto-fill` decides the count from the container's real width.
        columns: tracks.split(' ').filter((track) => track !== '').length,
      })
    }

    read()
    globalThis.addEventListener('scroll', read, { passive: true })
    globalThis.addEventListener('resize', read)
    return (): void => {
      globalThis.removeEventListener('scroll', read)
      globalThis.removeEventListener('resize', read)
    }
  }, [rows.length])

  const window = virtualWindow({ total: rows.length, ...measured })
  const drawn = rows.slice(window.start, window.end)
  const above = measured.columns === 0 ? 0 : Math.floor(window.start / measured.columns) * measured.rowHeight
  const below =
    measured.columns === 0 ? 0 : Math.ceil((rows.length - window.end) / measured.columns) * measured.rowHeight

  /**
   * Adds or removes one row from the selection.
   * @param id - The row pressed.
   */
  const toggle = (id: MediaId): void => {
    setSelected((current) => {
      const next = new Set(current)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }

  /** Every selected row's id, as the actions take them. */
  const ids = (): readonly string[] => rows.filter((row) => selected.has(row.id)).map((row) => row.id)

  /**
   * Dispatches one bulk write and clears what it was about.
   * @param write - The action, already bound to its arguments.
   */
  const dispatch = (write: () => Promise<void>): void => {
    startTransition(async () => {
      await write()
      setSelected(new Set())
      setEntry('none')
      setCaption('')
    })
  }

  return (
    <>
      <div data-media-controls className={styles.controls}>
        <form method="get" action="/admin/media" className={styles.searchForm}>
          {filter === 'everything' ? null : <input type="hidden" name="filter" value={filter} />}
          <input
            type="search"
            name="q"
            defaultValue={search}
            placeholder="Search file names"
            aria-label="Search file names"
            className={styles.search}
          />
          <button type="submit" className={styles.searchSubmit}>
            Search
          </button>
        </form>

        <div className={styles.chips}>
          {MEDIA_FILTERS.map((chip) => (
            <a
              key={chip}
              data-chip={chip}
              href={chipHref(chip, search)}
              aria-current={chip === filter ? 'page' : undefined}
              className={[styles.chip, chip === filter ? styles.chipOn : ''].join(' ')}
            >
              {CHIP_LABEL[chip]}
            </a>
          ))}
        </div>

        <span className={styles.controlsSpacer} />

        {selected.size === 0 ? null : (
          <div data-bulk-bar className={styles.bulkBar}>
            <p data-bulk-count className={styles.bulkCount}>
              {selected.size} selected
            </p>
            <button
              type="button"
              data-bulk="add-to-book"
              className={styles.bulkAction}
              onClick={() => {
                dispatch(() => addToBook(ids()))
              }}
            >
              Add to book
            </button>
            <button
              type="button"
              data-bulk="caption"
              className={styles.bulkAction}
              onClick={() => {
                setEntry((current) => (current === 'caption' ? 'none' : 'caption'))
              }}
            >
              Caption
            </button>
            <button
              type="button"
              data-bulk="move"
              className={styles.bulkAction}
              onClick={() => {
                setEntry((current) => (current === 'move' ? 'none' : 'move'))
              }}
            >
              Move
            </button>
            <button
              type="button"
              data-bulk="clear"
              className={[styles.bulkAction, styles.bulkClear].join(' ')}
              onClick={() => {
                setSelected(new Set())
                setEntry('none')
              }}
            >
              Clear
            </button>

            {entry === 'caption' ? (
              <div data-bulk-entry="caption" className={styles.bulkEntry}>
                <input
                  type="text"
                  aria-label="Caption for the selected media"
                  className={styles.bulkInput}
                  value={caption}
                  onChange={(event) => {
                    setCaption(event.target.value)
                  }}
                />
                <button
                  type="button"
                  data-bulk="apply-caption"
                  className={styles.bulkAction}
                  onClick={() => {
                    dispatch(() => captionMedia(ids(), caption))
                  }}
                >
                  Apply caption
                </button>
              </div>
            ) : null}

            {entry === 'move' ? (
              <div data-bulk-entry="move" className={styles.bulkEntry}>
                <select
                  aria-label="Move the selected media to"
                  className={styles.bulkSelect}
                  value={destination}
                  onChange={(event) => {
                    setDestination(event.target.value)
                  }}
                >
                  {journeys.map((choice) => (
                    <option key={choice.id} value={choice.id}>
                      {choice.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  data-bulk="apply-move"
                  className={styles.bulkAction}
                  onClick={() => {
                    dispatch(() => moveMedia(ids(), destination))
                  }}
                >
                  Move here
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <p data-media-empty className={styles.empty}>
          Nothing here — {total} in the library.
        </p>
      ) : (
        <div
          ref={grid}
          data-media-grid
          className={styles.grid}
          // THE TRACK MINIMUM IS THE DOMAIN'S ARITHMETIC, handed to CSS as a
          // custom property. A second spelling in the stylesheet is the drift
          // `gridColumns.ts`'s header is about.
          style={{ ['--td-media-track' as string]: `${String(gridMinimum(DEFAULT_GRID_COLUMNS))}px` }}
        >
          {above === 0 ? null : (
            <div aria-hidden="true" className={styles.spacer} style={{ height: `${String(above)}px` }} />
          )}

          {drawn.map((row) => (
            // KEYED BY ID, NEVER BY POSITION (CLAUDE.md §0.9): the window
            // slides as the grid scrolls, so a positional key would re-use one
            // photograph's element for another's.
            <div key={row.id} data-media-cell className={styles.cell}>
              <button
                type="button"
                data-media-tile={row.id}
                aria-pressed={selected.has(row.id)}
                className={[styles.tile, selected.has(row.id) ? styles.tileOn : ''].join(' ')}
                onClick={() => {
                  toggle(row.id)
                }}
              >
                {row.thumbSrc === null ? (
                  <span aria-hidden="true" className={styles.thumb} />
                ) : (
                  // A plain `<img>` on a Payload derivative already sized for
                  // this tile, as `JourneyPool.tsx` serves its own: `thumb` is
                  // 400px square against a 187px track, so a second optimiser
                  // in front of it would buy nothing.
                  // LAZY, AND EAGER WAS TRIED AND MEASURED WORSE. Fetching the
                  // first twelve tiles eagerly cut the LCP element's Load Delay
                  // from 2,553ms to 1,405ms and made the LCP itself WORSE —
                  // 4,580ms to 5,312ms — because under the gate's simulated
                  // connection the constraint is bandwidth rather than
                  // discovery, and twelve high-priority photographs take it
                  // from the fonts and the document. Both runs are in
                  // `docs/testing.md`; the shortfall they belong to is
                  // `docs/deviations.md` §73.
                  <img src={row.thumbSrc} alt={row.alt} loading="lazy" decoding="async" className={styles.thumb} />
                )}
                <span
                  data-media-tick
                  aria-hidden="true"
                  className={[styles.tick, selected.has(row.id) ? styles.tickOn : ''].join(' ')}
                >
                  ✓
                </span>
                {row.inBook ? (
                  <span data-media-in-book className={styles.inBook}>
                    In book
                  </span>
                ) : null}
                {!showsClips || row.duration === null ? null : (
                  <span data-media-duration className={styles.duration}>
                    {row.duration}
                  </span>
                )}
              </button>
              <p className={styles.tileName}>{row.filename}</p>
            </div>
          ))}

          {below === 0 ? null : (
            <div aria-hidden="true" className={styles.spacer} style={{ height: `${String(below)}px` }} />
          )}
        </div>
      )}
    </>
  )
}
