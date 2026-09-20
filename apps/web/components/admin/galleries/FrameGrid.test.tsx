/**
 * FrameGrid.test.tsx — SCREENS.md §2.5's controls, grid and panel: what a tile
 * draws, what stays selected across a re-sort, and what each control writes.
 *
 * ═══ THE CASE THIS FILE EXISTS FOR ═══
 *
 * §2.5 states its own defect in bold: "Select frames by id, not index —
 * sorting reorders the grid and a positional index desyncs the panel from the
 * highlight." `frameOrder.test.ts` cannot hold that defect, because those
 * functions take ids as PARAMETERS; it lives in the component that REMEMBERS a
 * selection across a re-sort, which is this one. The case below renders three
 * frames, selects the last, re-renders them in a different order, and asks the
 * panel and the highlight which frame they are on.
 *
 * WHAT PRODUCED EACH SIDE: the fixtures are the shape `readGalleriesScreen`
 * returns — `thumbSrc` is `null` for an upload too small for the tier,
 * `previewSrc` walks the uncropped ladder, `capturedAt` is `null` for a
 * photograph whose EXIF was stripped, `order` is `media.order` — so a case
 * about a tile or a chip is about a value that read really produces.
 *
 * ═══ WHAT jsdom CANNOT SAY, SAID HERE RATHER THAN IMPLIED ═══
 *
 * jsdom has no drag: `DataTransfer` is not implemented, so the drop cases below
 * hand the handler a stub with the same two methods the component calls. That
 * is enough to say what the component DOES with a dropped id and not enough to
 * say the browser will deliver one — `e2e/admin.spec.ts` drags a real tile for
 * that half. The keyboard path needs no stub at all, which is part of why it
 * exists.
 * Depends on: react, react-dom/client, vitest (jsdom), @travel-diary/domain/ids,
 * `FrameRow`/`GalleryChoice` (../../../lib/admin/readGalleriesScreen),
 * ./FrameGrid.
 */
import { journeyId, mediaId, type JourneyId, type MediaId } from '@travel-diary/domain/ids'
import type React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BulkCaption, FrameFlags } from '../../../lib/admin/galleryMutations'
import type { FrameRow, GalleryChoice } from '../../../lib/admin/readGalleriesScreen'
import { FrameGrid } from './FrameGrid'

// The App Router's `useRouter` throws outside a mounted router, and the
// journey select is the one control that navigates. `Dropzone.test.tsx` mocks
// the same module for the same reason.
const pushed: string[] = []
vi.mock('next/navigation', () => ({
  useRouter: (): { push: (href: string) => void } => ({
    push: (href: string): void => {
      pushed.push(href)
    },
  }),
}))

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
 * One frame, with every field stated and the interesting ones overridable.
 * @param id - The media row's id.
 * @param overrides - What this case cares about.
 * @returns A complete {@link FrameRow}.
 */
const aFrame = (id: string, overrides: Partial<FrameRow> = {}): FrameRow => ({
  id: anId(id),
  order: 0,
  capturedAt: null,
  filename: `tokyo-${id}.jpg`,
  thumbSrc: `/api/media/file/tokyo-${id}-400x400.jpg`,
  previewSrc: `/api/media/file/tokyo-${id}-1400.jpg`,
  alt: `Tokyo ${id}`,
  caption: `Caption ${id}`,
  kind: 'still',
  width: 4032,
  height: 3024,
  filesize: 6_100_000,
  durationSec: null,
  posterAt: null,
  hidden: false,
  inBook: false,
  ...overrides,
})

/** The select's options, which every case shares. */
const JOURNEYS: readonly GalleryChoice[] = [
  { id: aJourneyId('7'), name: 'Kyoto', frames: 3 },
  { id: aJourneyId('9'), name: 'Reykjavik', frames: 0 },
]

/** What the grid is handed, with the parts a case cares about overridable. */
interface GridOptions {
  readonly frames: readonly FrameRow[]
  /** Which frame the case wants on the panel. The harness presses its tile. */
  readonly selected?: MediaId
  readonly showsClips?: boolean
  readonly setFrameOrder?: (journey: string, order: readonly string[]) => Promise<void>
  readonly setFrameText?: (id: string, caption: string, alt: string) => Promise<void>
  readonly setFrameFlags?: (id: string, flags: FrameFlags) => Promise<void>
  readonly setPosterAt?: (id: string, seconds: number | null) => Promise<void>
  readonly applyBulkCaptions?: (rows: readonly BulkCaption[]) => Promise<void>
}

/**
 * The grid as an element, so one root can be handed two different orders.
 * @param options - See {@link GridOptions}.
 * @returns The element to render.
 */
const gridOf = (options: GridOptions): React.JSX.Element => (
  <FrameGrid
    journey={aJourneyId('7')}
    journeys={JOURNEYS}
    frames={options.frames}
    showsClips={options.showsClips ?? true}
    setFrameOrder={options.setFrameOrder ?? noWrite}
    setFrameText={options.setFrameText ?? noWrite}
    setFrameFlags={options.setFrameFlags ?? noWrite}
    setPosterAt={options.setPosterAt ?? noWrite}
    applyBulkCaptions={options.applyBulkCaptions ?? noWrite}
  />
)

/** The roots this file has mounted, by host, so a case can re-render one. */
const mounted = new Map<HTMLElement, Root>()

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

/**
 * Renders the grid once and hands back the host element.
 * @param options - See {@link GridOptions}. `selected` is pressed after the
 *   render, because the selection is the component's own state and there is no
 *   test-only way in — which is the property the re-sort case is about.
 * @returns The host element.
 */
const renderGalleries = (options: GridOptions): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  mounted.set(host, root)
  act(() => {
    root.render(gridOf(options))
  })
  if (options.selected !== undefined) press(host, `[data-frame-id="${options.selected}"]`)
  return host
}

/**
 * Renders the same root again with a different arrangement.
 * @param host - The host {@link renderGalleries} returned.
 * @param options - The new props. `selected` is NOT pressed again: the point is
 *   that the component kept it.
 */
const rerenderGalleries = (host: HTMLElement, options: GridOptions): void => {
  const root = mounted.get(host)
  if (root === undefined) throw new Error('that host was never rendered')
  act(() => {
    root.render(gridOf(options))
  })
}

/** A `DataTransfer` with the two methods the component calls, and nothing else. */
const aDragPayload = (id: string): DataTransfer =>
  ({
    getData: (): string => id,
    setData: (): void => undefined,
  }) as unknown as DataTransfer

/**
 * Drops one frame onto another, the way a browser would.
 * @param host - The rendered host.
 * @param moved - The frame being dragged.
 * @param onto - The frame it is dropped on.
 */
const drop = (host: HTMLElement, moved: string, onto: string): void => {
  const target = host.querySelector(`[data-frame-cell="${onto}"]`)
  if (!(target instanceof HTMLElement)) throw new Error(`no cell for ${onto}`)
  const event = new Event('drop', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'dataTransfer', { value: aDragPayload(moved) })
  act(() => {
    target.dispatchEvent(event)
  })
}

/**
 * Presses a key on one frame's grip.
 * @param host - The rendered host.
 * @param id - The frame whose grip is focused.
 * @param key - The key pressed.
 */
const pressKey = (host: HTMLElement, id: string, key: string): void => {
  const grip = host.querySelector(`[data-frame-grip="${id}"]`)
  if (!(grip instanceof HTMLElement)) throw new Error(`no grip for ${id}`)
  act(() => {
    grip.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
  })
}

/** The ids of every tile currently drawn, in the order they are drawn. */
const drawnIds = (host: HTMLElement): readonly (string | null)[] =>
  [...host.querySelectorAll('[data-frame-id]')]
    .filter((element) => element.hasAttribute('data-highlighted'))
    .map((tile) => tile.getAttribute('data-frame-id'))

afterEach(() => {
  pushed.length = 0
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount()
    })
  }
  mounted.clear()
  document.body.replaceChildren()
})

describe('FrameGrid — the selection', () => {
  it('keeps the selected frame selected after a re-sort, because it is tracked by id', () => {
    const host = renderGalleries({
      frames: [aFrame('a'), aFrame('b'), aFrame('c')],
      selected: anId('c'),
    })
    expect(host.querySelector('[data-selected-frame]')?.getAttribute('data-frame-id')).toBe('c')

    rerenderGalleries(host, { frames: [aFrame('c'), aFrame('a'), aFrame('b')] })

    // The expected value is the id the first render was given. A component
    // holding the POSITION would have kept index 2, which after the re-sort is
    // `b` — so this assertion fails either way round, and the highlight below
    // is what says the panel and the grid agree about which frame that is.
    expect(host.querySelector('[data-selected-frame]')?.getAttribute('data-frame-id')).toBe('c')
    expect(host.querySelector('[data-frame-id="c"][data-highlighted="true"]')).not.toBeNull()
  })

  it('moves the panel to the new journey’s first frame when the journey changes, rather than emptying it', () => {
    // GAL-001 (`docs/qa/2026-09-20-galleries-screen-sweep.md`). The journey
    // select pushes an ADDRESS, so Next.js re-renders the Server Component in
    // place and this component keeps its state — and the selected id belongs to
    // a journey that is no longer on screen. Per-journey state surviving a
    // journey switch is the handoff's most-repeated defect, five separate times
    // (README, "State" > "Admin").
    const host = renderGalleries({ frames: [aFrame('a'), aFrame('b'), aFrame('c')], selected: anId('c') })

    rerenderGalleries(host, { frames: [aFrame('x')] })

    expect({
      panel: host.querySelector('[data-selected-frame]')?.getAttribute('data-frame-id'),
      highlighted: [...host.querySelectorAll('[data-highlighted="true"]')].map((tile) =>
        tile.getAttribute('data-frame-id'),
      ),
    }).toEqual({ panel: 'x', highlighted: ['x'] })
  })

  it('selects the first frame before anything is pressed, so the panel is never empty', () => {
    const host = renderGalleries({ frames: [aFrame('a'), aFrame('b')] })

    expect(host.querySelector('[data-selected-frame]')?.getAttribute('data-frame-id')).toBe('a')
  })

  it('highlights exactly one tile', () => {
    const host = renderGalleries({ frames: [aFrame('a'), aFrame('b'), aFrame('c')], selected: anId('b') })

    expect(
      [...host.querySelectorAll('[data-highlighted="true"]')].map((tile) => tile.getAttribute('data-frame-id')),
    ).toEqual(['b'])
  })
})

describe('FrameGrid — the tiles', () => {
  it('numbers the tiles from one, in the order they are drawn', () => {
    const host = renderGalleries({ frames: [aFrame('a'), aFrame('b'), aFrame('c')] })

    expect([...host.querySelectorAll('[data-frame-index]')].map((badge) => badge.textContent)).toEqual(['1', '2', '3'])
  })

  it('puts the "Cover" chip on the first frame and nowhere else', () => {
    const host = renderGalleries({ frames: [aFrame('a'), aFrame('b'), aFrame('c')] })
    const chips = [...host.querySelectorAll('[data-cover-chip]')]

    expect({
      count: chips.length,
      on: chips[0]?.closest('[data-frame-id]')?.getAttribute('data-frame-id'),
    }).toEqual({ count: 1, on: 'a' })
  })

  it('draws a "Hidden" chip on a frame an editor has withheld, and on no other', () => {
    const host = renderGalleries({ frames: [aFrame('a'), aFrame('b', { hidden: true })] })
    const chips = [...host.querySelectorAll('[data-hidden-chip]')]

    expect({
      count: chips.length,
      on: chips[0]?.closest('[data-frame-id]')?.getAttribute('data-frame-id'),
    }).toEqual({ count: 1, on: 'b' })
  })

  it('draws no image for an upload too small for the thumbnail tier', () => {
    const host = renderGalleries({ frames: [aFrame('a', { thumbSrc: null })] })

    expect(host.querySelector('button[data-frame-id="a"] img')).toBeNull()
  })

  it('says there is nothing here for a journey with no frames', () => {
    const host = renderGalleries({ frames: [] })

    expect(host.querySelector('[data-frames-empty]')?.textContent).toBe('Nothing in this gallery yet.')
  })
})

describe('FrameGrid — rearranging', () => {
  it('writes the arrangement a drop produces, naming every frame by id', () => {
    const written: string[][] = []
    const host = renderGalleries({
      frames: [aFrame('a'), aFrame('b'), aFrame('c')],
      setFrameOrder: (_journey, order) => {
        written.push([...order])
        return Promise.resolve()
      },
    })

    drop(host, 'c', 'a')

    expect({ drawn: drawnIds(host), written }).toEqual({ drawn: ['c', 'a', 'b'], written: [['c', 'a', 'b']] })
  })

  it('ignores a drop carrying an id this grid is not drawing', () => {
    // A drag can carry any string — from another application, from another
    // tab. The only ids this grid may rearrange are the ones it drew.
    const written: string[][] = []
    const host = renderGalleries({
      frames: [aFrame('a'), aFrame('b')],
      setFrameOrder: (_journey, order) => {
        written.push([...order])
        return Promise.resolve()
      },
    })

    drop(host, 'not-a-frame', 'a')

    expect({ drawn: drawnIds(host), written }).toEqual({ drawn: ['a', 'b'], written: [] })
  })

  it('ignores a frame dropped on itself', () => {
    const written: string[][] = []
    const host = renderGalleries({
      frames: [aFrame('a'), aFrame('b')],
      setFrameOrder: (_journey, order) => {
        written.push([...order])
        return Promise.resolve()
      },
    })

    drop(host, 'a', 'a')

    expect(written).toEqual([])
  })

  it('moves a frame one place towards the front on the grip’s left arrow', () => {
    // THE KEYBOARD'S WHOLE PATH THROUGH A DRAG. A grid that is only draggable
    // is not operable; this is the case that says it is.
    const host = renderGalleries({ frames: [aFrame('a'), aFrame('b'), aFrame('c')] })

    pressKey(host, 'c', 'ArrowLeft')

    expect(drawnIds(host)).toEqual(['a', 'c', 'b'])
  })

  it('moves a frame one place towards the back on the grip’s right arrow', () => {
    const host = renderGalleries({ frames: [aFrame('a'), aFrame('b'), aFrame('c')] })

    pressKey(host, 'a', 'ArrowRight')

    expect(drawnIds(host)).toEqual(['b', 'a', 'c'])
  })

  it('refuses to move the first frame further forward, rather than wrapping it to the end', () => {
    const written: string[][] = []
    const host = renderGalleries({
      frames: [aFrame('a'), aFrame('b')],
      setFrameOrder: (_journey, order) => {
        written.push([...order])
        return Promise.resolve()
      },
    })

    pressKey(host, 'a', 'ArrowLeft')

    expect({ drawn: drawnIds(host), written }).toEqual({ drawn: ['a', 'b'], written: [] })
  })

  it('leaves the last frame where it is on the grip’s right arrow, rather than wrapping it to the front', () => {
    const host = renderGalleries({ frames: [aFrame('a'), aFrame('b'), aFrame('c')] })

    pressKey(host, 'c', 'ArrowRight')

    expect(drawnIds(host)).toEqual(['a', 'b', 'c'])
  })

  it('sends a frame to the front on Home and to the end on End', () => {
    const host = renderGalleries({ frames: [aFrame('a'), aFrame('b'), aFrame('c')] })

    pressKey(host, 'c', 'Home')
    const afterHome = drawnIds(host)
    pressKey(host, 'c', 'End')

    expect({ afterHome, afterEnd: drawnIds(host) }).toEqual({
      afterHome: ['c', 'a', 'b'],
      afterEnd: ['a', 'b', 'c'],
    })
  })

  it('leaves a key it does not handle to the browser', () => {
    const written: string[][] = []
    const host = renderGalleries({
      frames: [aFrame('a'), aFrame('b')],
      setFrameOrder: (_journey, order) => {
        written.push([...order])
        return Promise.resolve()
      },
    })

    pressKey(host, 'a', 'Tab')

    expect(written).toEqual([])
  })

  it('hands the dragged frame’s id to the browser, which is what the drop reads back', () => {
    const carried: [string, string][] = []
    const host = renderGalleries({ frames: [aFrame('a'), aFrame('b')] })
    const cell = host.querySelector('[data-frame-cell="a"]')
    if (!(cell instanceof HTMLElement)) throw new Error('no cell for a')

    const event = new Event('dragstart', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'dataTransfer', {
      value: {
        getData: (): string => '',
        setData: (format: string, value: string): void => {
          carried.push([format, value])
        },
      },
    })
    act(() => {
      cell.dispatchEvent(event)
    })

    expect(carried).toEqual([['text/plain', 'a']])
  })

  it('accepts a drop at all, which a browser refuses unless the dragover is cancelled', () => {
    const host = renderGalleries({ frames: [aFrame('a'), aFrame('b')] })
    const grid = host.querySelector('[data-frame-grid]')
    if (!(grid instanceof HTMLElement)) throw new Error('no grid')
    const event = new Event('dragover', { bubbles: true, cancelable: true })

    act(() => {
      grid.dispatchEvent(event)
    })

    expect(event.defaultPrevented).toBe(true)
  })

  it('moves the frame to the front when the panel’s cover box is ticked', () => {
    const host = renderGalleries({ frames: [aFrame('a'), aFrame('b'), aFrame('c')], selected: anId('c') })

    press(host, '[data-frame-cover]')

    expect(drawnIds(host)).toEqual(['c', 'a', 'b'])
  })
})

describe('FrameGrid — sort by date', () => {
  it('rearranges by capture time and writes the new order', () => {
    const written: string[][] = []
    const host = renderGalleries({
      frames: [
        aFrame('a', { capturedAt: '2025-03-01T00:00:00.000Z' }),
        aFrame('b', { capturedAt: '2024-01-01T00:00:00.000Z' }),
      ],
      setFrameOrder: (_journey, order) => {
        written.push([...order])
        return Promise.resolve()
      },
    })

    press(host, '[data-sort-by-date]')

    expect({ drawn: drawnIds(host), written }).toEqual({ drawn: ['b', 'a'], written: [['b', 'a']] })
  })

  it('reads "Sort by date" while the arrangement is not the date order', () => {
    const host = renderGalleries({
      frames: [
        aFrame('a', { capturedAt: '2025-03-01T00:00:00.000Z' }),
        aFrame('b', { capturedAt: '2024-01-01T00:00:00.000Z' }),
      ],
    })

    expect({
      label: host.querySelector('[data-sort-by-date]')?.textContent,
      pressed: host.querySelector('[data-sort-by-date]')?.getAttribute('aria-pressed'),
    }).toEqual({ label: 'Sort by date', pressed: 'false' })
  })

  it('reads "By date ✓" once the arrangement already is the date order', () => {
    // A DERIVED TICK, NOT A HELD FLAG. The arrangement below arrives already
    // sorted, so the button says so without anything having been pressed —
    // which is what stops the tick from surviving a drag that breaks it.
    const host = renderGalleries({
      frames: [
        aFrame('b', { capturedAt: '2024-01-01T00:00:00.000Z' }),
        aFrame('a', { capturedAt: '2025-03-01T00:00:00.000Z' }),
      ],
    })

    expect({
      label: host.querySelector('[data-sort-by-date]')?.textContent,
      pressed: host.querySelector('[data-sort-by-date]')?.getAttribute('aria-pressed'),
    }).toEqual({ label: 'By date ✓', pressed: 'true' })
  })

  it('turns the tick off again when a drag breaks the date order', () => {
    const host = renderGalleries({
      frames: [
        aFrame('b', { capturedAt: '2024-01-01T00:00:00.000Z' }),
        aFrame('a', { capturedAt: '2025-03-01T00:00:00.000Z' }),
      ],
    })

    drop(host, 'a', 'b')

    expect(host.querySelector('[data-sort-by-date]')?.getAttribute('aria-pressed')).toBe('false')
  })

  it('does not claim a gallery with no frames is in date order', () => {
    const host = renderGalleries({ frames: [] })

    expect(host.querySelector('[data-sort-by-date]')?.getAttribute('aria-pressed')).toBe('false')
  })
})

describe('FrameGrid — the controls', () => {
  it('labels each journey with its own frame count', () => {
    const host = renderGalleries({ frames: [aFrame('a')] })

    expect([...host.querySelectorAll('[data-journey-select] option')].map((option) => option.textContent)).toEqual([
      'Kyoto — 3 frames',
      'Reykjavik — 0 frames',
    ])
  })

  it('navigates to the journey the select names, which is an address rather than state', () => {
    const host = renderGalleries({ frames: [aFrame('a')] })
    const select = host.querySelector('[data-journey-select]')
    if (!(select instanceof HTMLSelectElement)) throw new Error('no select')

    act(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(select, '9')
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect(pushed).toEqual(['/admin/galleries?journey=9'])
  })

  it('prints §2.5’s instruction line', () => {
    const host = renderGalleries({ frames: [aFrame('a')] })

    expect(host.textContent).toContain('Drag to reorder. The first frame is the gallery cover.')
  })

  it('opens and closes the bulk caption panel', () => {
    const host = renderGalleries({ frames: [aFrame('a', { caption: '' })] })

    press(host, '[data-caption-all]')
    const opened = host.querySelector('[data-bulk-panel]') !== null
    press(host, '[data-caption-all]')

    expect({ opened, closed: host.querySelector('[data-bulk-panel]') === null }).toEqual({
      opened: true,
      closed: true,
    })
  })

  it('offers only the frames that have no caption', () => {
    const host = renderGalleries({ frames: [aFrame('a', { caption: '' }), aFrame('b', { caption: 'Written' })] })

    press(host, '[data-caption-all]')

    expect([...host.querySelectorAll('[data-bulk-row]')].map((row) => row.getAttribute('data-bulk-row'))).toEqual(['a'])
  })

  it('closes the bulk panel once its captions are applied', () => {
    const applied: BulkCaption[][] = []
    const host = renderGalleries({
      frames: [aFrame('a', { caption: '' })],
      applyBulkCaptions: (rows) => {
        applied.push([...rows])
        return Promise.resolve()
      },
    })
    press(host, '[data-caption-all]')

    press(host, '[data-bulk-apply]')

    expect({ applied, open: host.querySelector('[data-bulk-panel]') !== null }).toEqual({
      applied: [[{ id: 'a', caption: '' }]],
      open: false,
    })
  })
})

describe('FrameGrid — the panel’s writes', () => {
  it('writes the caption, the alt text and both toggles on one press of Save frame', async () => {
    const text: unknown[] = []
    const flags: unknown[] = []
    const host = renderGalleries({
      frames: [aFrame('a', { caption: 'Before', alt: 'Alt before' })],
      setFrameText: (id, caption, alt) => {
        text.push({ id, caption, alt })
        return Promise.resolve()
      },
      setFrameFlags: (id, written) => {
        flags.push({ id, ...written })
        return Promise.resolve()
      },
    })

    const caption = host.querySelector('[data-frame-caption]')
    if (!(caption instanceof HTMLInputElement)) throw new Error('no caption field')
    act(() => {
      // The setter React's synthetic onChange listens for — assigning `.value`
      // updates React's own tracker first, so the event that follows reads as
      // no change at all. `MediaGrid.test.tsx` types the same way.
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(caption, 'After')
      caption.dispatchEvent(new Event('input', { bubbles: true }))
    })
    press(host, '[data-frame-hidden]')
    // TWO WRITES IN ONE TRANSITION, so the second is a microtask behind the
    // first: `MediaGrid.test.tsx` awaits the same way for the same reason.
    await act(async () => {
      press(host, '[data-frame-save]')
      await Promise.resolve()
    })

    expect({ text, flags }).toEqual({
      text: [{ id: 'a', caption: 'After', alt: 'Alt before' }],
      flags: [{ id: 'a', hidden: true, inBook: false }],
    })
  })

  it('writes the second a clip’s filmstrip names', async () => {
    // THE CLIP HALF, WHICH THIS SCREEN CANNOT PRODUCE ON THIS MACHINE:
    // `MEDIA_PIPELINE=worker` is refused at boot without `ffmpeg`/`ffprobe`,
    // so the row is handed in directly. `SelectedFrame.test.tsx` says the same
    // about the panel it is drawn by.
    const written: unknown[] = []
    const host = renderGalleries({
      frames: [aFrame('a', { kind: 'clip', durationSec: 24, filename: 'harbour-012.mp4' })],
      setPosterAt: (id, seconds) => {
        written.push({ id, seconds })
        return Promise.resolve()
      },
    })

    await act(async () => {
      press(host, '[data-poster-grab="12"]')
      await Promise.resolve()
    })

    expect(written).toEqual([{ id: 'a', seconds: 12 }])
  })

  it('starts the panel’s fields at the selected frame’s own values, by id', () => {
    const host = renderGalleries({
      frames: [aFrame('a', { caption: 'First' }), aFrame('b', { caption: 'Second' })],
      selected: anId('b'),
    })
    const caption = host.querySelector('[data-frame-caption]')

    expect(caption instanceof HTMLInputElement ? caption.value : null).toBe('Second')
  })
})
