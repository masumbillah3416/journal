/**
 * MediaGrid.test.tsx — SCREENS.md §2.4's controls row, its bulk bar and the
 * grid: what a tile draws, what stays selected across a re-sort, and the tile
 * count that does not grow with the library.
 *
 * WHAT PRODUCED EACH SIDE: the fixtures are the shape `readMediaScreen`
 * returns — `thumbSrc` is `null` for an upload too small to have a `thumb`,
 * `duration` is `null` for a still, `placements` is a count folded over the
 * pages — so a case about a chip or a tile is about a value that read really
 * produces.
 *
 * ═══ WHAT jsdom CANNOT SAY, SAID HERE RATHER THAN IMPLIED ═══
 *
 * jsdom lays nothing out: `getBoundingClientRect` is zeroes and
 * `getComputedStyle(...).gridTemplateColumns` is empty, so `virtualWindow` is
 * asked in its UNMEASURED arm on every render below. That is enough for the
 * property design spec §12 asks for — the element count does not grow with the
 * row count — and it is NOT enough to say the window follows the scroll. That
 * half is `gridColumns.test.ts`'s, where the measurements are parameters, and
 * it is the reason the arithmetic is not inline in the component.
 * Depends on: react, react-dom/client, vitest (jsdom), node:fs (the gap),
 * @travel-diary/domain/admin/gridColumns, @travel-diary/domain/ids,
 * `MediaRow` (../../../lib/admin/readMediaScreen), ./MediaGrid.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { GRID_GAP_PX, VIRTUAL_THRESHOLD, gridMinimum } from '@travel-diary/domain/admin/gridColumns'
import type { MediaFilter } from '@travel-diary/domain/admin/mediaFilters'
import { journeyId, mediaId, type JourneyId, type MediaId } from '@travel-diary/domain/ids'
import type React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import type { MediaRow } from '../../../lib/admin/readMediaScreen'
import { MediaGrid } from './MediaGrid'

/** Where `media.module.css` is, for the gap case. */
const STYLESHEET = path.join(path.dirname(fileURLToPath(import.meta.url)), 'media.module.css')

const roots: Root[] = []

/** What nothing in these cases does, unless a case replaces it. */
const noWrite = (): Promise<void> => Promise.resolve()

/**
 * A branded media id.
 * @param raw - The id as Postgres would spell it.
 * @returns The branded id.
 */
const anId = (raw: string): MediaId => {
  const built = mediaId(raw)
  if (!built.ok) throw new Error(built.error)
  return built.value
}

/**
 * A branded journey id.
 * @param raw - The id as Postgres would spell it.
 * @returns The branded id.
 */
const aJourneyId = (raw: string): JourneyId => {
  const built = journeyId(raw)
  if (!built.ok) throw new Error(built.error)
  return built.value
}

/**
 * One tile, with every field stated and the interesting ones overridable.
 * @param id - The media row's id.
 * @param overrides - What this case cares about.
 * @returns A complete {@link MediaRow}.
 */
const aRow = (id: string, overrides: Partial<MediaRow> = {}): MediaRow => ({
  id: anId(id),
  filename: `tokyo-${id}.jpg`,
  thumbSrc: `/api/media/file/tokyo-${id}-400x400.jpg`,
  alt: `Tokyo ${id}`,
  kind: 'still',
  duration: null,
  inBook: false,
  placements: 0,
  ...overrides,
})

/**
 * `count` tiles, which is what a library of that size looks like.
 * @param count - How many rows.
 * @returns The rows, numbered from one.
 */
const manyRows = (count: number): readonly MediaRow[] =>
  Array.from({ length: count }, (_unused, index) => aRow(String(index + 1)))

/** What the grid is handed, with the parts a case cares about overridable. */
interface GridOptions {
  readonly rows: readonly MediaRow[]
  readonly total?: number
  readonly search?: string
  readonly filter?: MediaFilter
  readonly showsClips?: boolean
  readonly addToBook?: (ids: readonly string[]) => Promise<void>
  readonly captionMedia?: (ids: readonly string[], caption: string) => Promise<void>
  readonly moveMedia?: (ids: readonly string[], journey: string) => Promise<void>
}

/**
 * The grid as an element, so one root can be handed two different orders.
 * @param options - See {@link GridOptions}.
 * @returns The element to render.
 */
const gridOf = (options: GridOptions): React.JSX.Element => (
  <MediaGrid
    rows={options.rows}
    total={options.total ?? options.rows.length}
    search={options.search ?? ''}
    filter={options.filter ?? 'everything'}
    journeys={[
      { id: aJourneyId('7'), name: 'Kyoto' },
      { id: aJourneyId('9'), name: 'Reykjavik' },
    ]}
    showsClips={options.showsClips ?? true}
    addToBook={options.addToBook ?? noWrite}
    captionMedia={options.captionMedia ?? noWrite}
    moveMedia={options.moveMedia ?? noWrite}
  />
)

/**
 * Renders the grid once and hands back the host element.
 * @param options - See {@link GridOptions}.
 * @returns The host element.
 */
const renderGrid = (options: GridOptions): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(gridOf(options))
  })
  return host
}

/**
 * Presses one element inside the host.
 * @param host - The rendered host.
 * @param selector - What to press.
 */
const press = (host: HTMLElement, selector: string): void => {
  const target = host.querySelector(selector)
  if (!(target instanceof HTMLElement)) throw new Error(`nothing matched ${selector}`)
  act(() => {
    target.click()
  })
}

/** The ids of every tile currently drawn, in the order they are drawn. */
const drawnIds = (host: HTMLElement): readonly (string | null)[] =>
  [...host.querySelectorAll('[data-media-tile]')].map((tile) => tile.getAttribute('data-media-tile'))

/** The ids of every tile currently selected. */
const selectedIds = (host: HTMLElement): readonly (string | null)[] =>
  [...host.querySelectorAll('[data-media-tile][aria-pressed="true"]')].map((tile) =>
    tile.getAttribute('data-media-tile'),
  )

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount()
    })
  }
  document.body.replaceChildren()
})

describe('the tiles', () => {
  it('draws one tile per row, with the filename beneath it', () => {
    const host = renderGrid({ rows: [aRow('1'), aRow('2')] })

    expect(drawnIds(host)).toEqual(['1', '2'])
    expect([...host.querySelectorAll('[data-media-cell] p')].map((name) => name.textContent)).toEqual([
      'tokyo-1.jpg',
      'tokyo-2.jpg',
    ])
  })

  it('draws the In book chip only on a row the column marks', () => {
    // `docs/deviations.md` §63: this is `inBook`'s first per-tile display in
    // the repository. Both sides, so the chip means something.
    const host = renderGrid({ rows: [aRow('1', { inBook: true }), aRow('2')] })

    expect(
      [...host.querySelectorAll('[data-media-tile]')].map(
        (tile) => tile.querySelector('[data-media-in-book]') !== null,
      ),
    ).toEqual([true, false])
  })

  it('draws a duration chip on a clip and none on a still', () => {
    const host = renderGrid({ rows: [aRow('1', { kind: 'clip', duration: '0:24' }), aRow('2')] })

    expect([...host.querySelectorAll('[data-media-duration]')].map((chip) => chip.textContent)).toEqual(['0:24'])
  })

  it('draws no duration chip at all where the deployment shows no clip affordances', () => {
    // Design spec §9.3: a chip on a deployment that cannot accept a video is a
    // promise nothing can keep. The tile is still drawn, because a clip
    // ingested before the flag moved is content. `JourneyPool` does the same.
    const host = renderGrid({ rows: [aRow('1', { kind: 'clip', duration: '0:24' })], showsClips: false })

    expect(host.querySelectorAll('[data-media-duration]')).toHaveLength(0)
    expect(drawnIds(host)).toEqual(['1'])
  })

  it('draws an empty square rather than the original for a row with no derivative', () => {
    // `readMediaScreen` answers `null` for an upload too small for the `thumb`
    // tier, and reaching for the original instead would put the whole library
    // on the wire at full size (CLAUDE.md §6).
    const host = renderGrid({ rows: [aRow('1', { thumbSrc: null })] })

    expect(host.querySelector('[data-media-tile] img')).toBeNull()
  })

  it('sets the track minimum from the domain’s own arithmetic', () => {
    // A number spelled in the stylesheet as well would be this repository's
    // most repeated defect. The right side is `gridMinimum`, asked here.
    const host = renderGrid({ rows: [aRow('1')] })
    const grid = host.querySelector('[data-media-grid]')

    expect(grid instanceof HTMLElement ? grid.style.getPropertyValue('--td-media-track') : '').toBe(
      `${String(gridMinimum(6))}px`,
    )
  })

  it('has the stylesheet drawing the same gap the windowing arithmetic assumes', () => {
    // The two spellings of §2.4's `gap: 14px`, pinned to each other: the
    // component converts rows to pixels with `GRID_GAP_PX`, and only the
    // stylesheet can draw one.
    const declared = new RegExp(`\\.grid\\s*\\{[^}]*gap:\\s*${String(GRID_GAP_PX)}px`).test(
      readFileSync(STYLESHEET, 'utf8'),
    )

    expect(declared).toBe(true)
  })
})

describe('the selection', () => {
  it('selects a tile when it is pressed and deselects it when it is pressed again', () => {
    const host = renderGrid({ rows: [aRow('1'), aRow('2')] })

    press(host, '[data-media-tile="1"]')
    expect(selectedIds(host)).toEqual(['1'])

    press(host, '[data-media-tile="1"]')
    expect(selectedIds(host)).toEqual([])
  })

  it('keeps the same photograph selected when the grid is re-sorted', () => {
    // CLAUDE.md §0.9. The library's own `order` can change while this screen
    // is open, and the grid re-renders whenever the chip or the search does —
    // a selection kept by index would move to whichever photograph took that
    // place. ONE ROOT, two orders, which is what a re-sort really is.
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    roots.push(root)
    const ascending = [aRow('1'), aRow('2'), aRow('3')]

    act(() => {
      root.render(gridOf({ rows: ascending }))
    })
    press(host, '[data-media-tile="3"]')
    expect(selectedIds(host)).toEqual(['3'])

    act(() => {
      root.render(gridOf({ rows: [...ascending].reverse() }))
    })

    // The left side is what the grid now marks selected; the right side is the
    // tile this case pressed, which has moved from last to first.
    expect(drawnIds(host)).toEqual(['3', '2', '1'])
    expect(selectedIds(host)).toEqual(['3'])
  })

  it('draws no bulk bar until something is selected', () => {
    const host = renderGrid({ rows: [aRow('1')] })

    expect(host.querySelector('[data-bulk-bar]')).toBeNull()

    press(host, '[data-media-tile="1"]')
    expect(host.querySelector('[data-bulk-count]')?.textContent).toBe('1 selected')
  })

  it('clears the selection, and the bar with it', () => {
    const host = renderGrid({ rows: [aRow('1'), aRow('2')] })
    press(host, '[data-media-tile="1"]')
    press(host, '[data-media-tile="2"]')
    expect(host.querySelector('[data-bulk-count]')?.textContent).toBe('2 selected')

    press(host, '[data-bulk="clear"]')

    expect(host.querySelector('[data-bulk-bar]')).toBeNull()
    expect(selectedIds(host)).toEqual([])
  })
})

describe('the bulk writes', () => {
  it('sends Add to book the ids that are selected and no others', async () => {
    let sent: readonly string[] = []
    const host = renderGrid({
      rows: [aRow('1'), aRow('2'), aRow('3')],
      addToBook: (ids): Promise<void> => {
        sent = ids
        return Promise.resolve()
      },
    })
    press(host, '[data-media-tile="1"]')
    press(host, '[data-media-tile="3"]')

    await act(async () => {
      press(host, '[data-bulk="add-to-book"]')
      await Promise.resolve()
    })

    expect(sent).toEqual(['1', '3'])
  })

  it('sends Caption the words typed into the bar, once Apply is pressed', async () => {
    const sent: { ids?: readonly string[]; caption?: string } = {}
    const host = renderGrid({
      rows: [aRow('1')],
      captionMedia: (ids, caption): Promise<void> => {
        sent.ids = ids
        sent.caption = caption
        return Promise.resolve()
      },
    })
    press(host, '[data-media-tile="1"]')
    press(host, '[data-bulk="caption"]')

    const field = host.querySelector('[data-bulk-entry="caption"] input')
    if (!(field instanceof HTMLInputElement)) throw new Error('the bar drew no caption field')
    act(() => {
      // The setter React's synthetic onChange listens for.
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(field, 'The last morning')
      field.dispatchEvent(new Event('input', { bubbles: true }))
    })

    await act(async () => {
      press(host, '[data-bulk="apply-caption"]')
      await Promise.resolve()
    })

    expect(sent).toEqual({ ids: ['1'], caption: 'The last morning' })
  })

  it('sends Move the journey chosen in the bar', async () => {
    const sent: { ids?: readonly string[]; journey?: string } = {}
    const host = renderGrid({
      rows: [aRow('1')],
      moveMedia: (ids, journey): Promise<void> => {
        sent.ids = ids
        sent.journey = journey
        return Promise.resolve()
      },
    })
    press(host, '[data-media-tile="1"]')
    press(host, '[data-bulk="move"]')

    const select = host.querySelector('[data-bulk-entry="move"] select')
    if (!(select instanceof HTMLSelectElement)) throw new Error('the bar drew no journey select')
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(select, '9')
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })

    await act(async () => {
      press(host, '[data-bulk="apply-move"]')
      await Promise.resolve()
    })

    expect(sent).toEqual({ ids: ['1'], journey: '9' })
  })

  it('clears the selection once a write has gone through', async () => {
    const host = renderGrid({ rows: [aRow('1')] })
    press(host, '[data-media-tile="1"]')

    await act(async () => {
      press(host, '[data-bulk="add-to-book"]')
      await Promise.resolve()
    })

    expect(host.querySelector('[data-bulk-bar]')).toBeNull()
  })
})

describe('the chips and the search', () => {
  it('draws §2.4’s five chips, in its own order and its own words', () => {
    const host = renderGrid({ rows: [aRow('1')] })

    expect([...host.querySelectorAll('[data-chip]')].map((chip) => chip.textContent)).toEqual([
      'Everything',
      'Stills',
      'Clips',
      'In the book',
      'Unused',
    ])
  })

  it('marks the pressed chip and addresses the others, keeping the search', () => {
    // A chip is a LINK, so pressing it is a navigation and the search survives
    // it — a chip that dropped `q` would read as clearing the search box.
    const host = renderGrid({ rows: [aRow('1')], search: 'tokyo', filter: 'clips' })

    expect(host.querySelector('[data-chip="clips"]')?.getAttribute('aria-current')).toBe('page')
    expect(host.querySelector('[data-chip="stills"]')?.getAttribute('href')).toBe('/admin/media?filter=stills&q=tokyo')
    expect(host.querySelector('[data-chip="everything"]')?.getAttribute('href')).toBe('/admin/media?q=tokyo')
  })

  it('carries the pressed chip through a search, so searching does not reset the filter', () => {
    const host = renderGrid({ rows: [aRow('1')], filter: 'unused' })
    const hidden = host.querySelector('form input[type="hidden"]')

    expect(hidden instanceof HTMLInputElement ? [hidden.name, hidden.value] : []).toEqual(['filter', 'unused'])
  })

  it('says what is left when a chip admits nothing, rather than drawing an empty grid', () => {
    const host = renderGrid({ rows: [], total: 42 })

    expect(host.querySelector('[data-media-empty]')?.textContent).toBe('Nothing here — 42 in the library.')
    expect(host.querySelector('[data-media-grid]')).toBeNull()
  })
})

describe('the windowing', () => {
  it('draws a bounded number of tiles however many rows it is given', () => {
    // THE PROPERTY design spec §12 asks for. The two sides have different
    // causes: the row count is the fixture's, the element count is the DOM's.
    const small = renderGrid({ rows: manyRows(120) })
    const large = renderGrid({ rows: manyRows(1_200) })

    expect(large.querySelectorAll('[data-media-tile]')).toHaveLength(small.querySelectorAll('[data-media-tile]').length)
  })

  it('draws a library the design’s own size whole, so nothing is hidden below the threshold', () => {
    // The sentinel for the case above: without this, a grid that drew ten
    // tiles for every library would satisfy it.
    const host = renderGrid({ rows: manyRows(VIRTUAL_THRESHOLD) })

    expect(host.querySelectorAll('[data-media-tile]')).toHaveLength(VIRTUAL_THRESHOLD)
  })

  it('draws fewer tiles than rows once the library is large', () => {
    // The other sentinel: a component that ignored the window entirely would
    // pass the threshold case and fail this one.
    const host = renderGrid({ rows: manyRows(1_200) })

    expect(host.querySelectorAll('[data-media-tile]').length).toBeLessThan(1_200)
  })
})
