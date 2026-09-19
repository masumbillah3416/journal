/**
 * JourneyPool.test.tsx — SCREENS.md §2.3's right column: the count the eyebrow
 * prints, the in-book ring, the duration chip and the tile with no derivative.
 *
 * WHAT PRODUCED EACH SIDE: the fixtures are the shape `readJourneyEditor`
 * returns — its `thumbSrc` is `null` for an upload too small to have a `thumb`,
 * and its `duration` is `null` for a still — so the cases below are about a
 * value that read really produces rather than about a shape invented here.
 *
 * Depends on: react, react-dom/client, vitest (jsdom),
 * @travel-diary/domain/ids, `PoolItem` (../../../lib/admin/readJourneyEditor),
 * ./JourneyPool.
 */
import { journeyId, mediaId, slotKey, type JourneyId, type MediaId, type SlotKey } from '@travel-diary/domain/ids'
import type React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import type { PoolItem } from '../../../lib/admin/readJourneyEditor'
import { JourneyPool } from './JourneyPool'

/**
 * A branded journey id.
 * @param raw - The id as Postgres would spell it.
 * @returns The branded id.
 */
const aJourney = (raw: string): JourneyId => {
  const built = journeyId(raw)
  if (!built.ok) throw new Error(built.error)
  return built.value
}

/**
 * A branded cell key.
 * @param raw - The key as the pane spells it.
 * @returns The branded key.
 */
const aSlot = (raw: string): SlotKey => {
  const built = slotKey(raw)
  if (!built.ok) throw new Error(built.error)
  return built.value
}

/** What nothing in these cases does: no tile here is ever submitted. */
const noAction = (): Promise<void> => Promise.resolve()

const roots: Root[] = []

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
 * One tile, with every field stated and the interesting ones overridable.
 * @param id - The media row's id.
 * @param overrides - What this case cares about.
 * @returns A complete {@link PoolItem}.
 */
const anItem = (id: string, overrides: Partial<PoolItem> = {}): PoolItem => ({
  id: anId(id),
  thumbSrc: `/api/media/file/frame-${id}-400x400.png`,
  alt: `Frame ${id}`,
  duration: null,
  inBook: false,
  ...overrides,
})

/**
 * Renders the pool and hands back the host element.
 * @param items - The tiles.
 * @param inBook - How many are in the book.
 * @returns The host element.
 */
const poolOf = (
  items: readonly PoolItem[],
  inBook: number,
  extras: {
    readonly ticked?: ReadonlySet<MediaId>
    readonly target?: SlotKey | null
    readonly showsClips?: boolean
  } = {},
): React.JSX.Element => (
  <JourneyPool
    journey={aJourney('42')}
    items={items}
    inBook={inBook}
    ticked={extras.ticked ?? new Set()}
    target={extras.target === undefined ? aSlot('7:0') : extras.target}
    place={noAction}
    showsClips={extras.showsClips ?? true}
    browseHref="/admin/media"
  />
)

/**
 * Renders the pool once and hands back the host element.
 * @param items - The tiles.
 * @param inBook - How many are in the book.
 * @param extras - The selection and the chosen frame, where a case cares.
 * @returns The host element.
 */
const renderPool = (
  items: readonly PoolItem[],
  inBook: number,
  extras: {
    readonly ticked?: ReadonlySet<MediaId>
    readonly target?: SlotKey | null
    readonly showsClips?: boolean
  } = {},
): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(poolOf(items, inBook, extras))
  })
  return host
}

/**
 * Renders the pool twice into ONE root, which is what a re-sort really is: the
 * same component handed a different order, not a second mount.
 * @param first - The tiles as they arrive.
 * @param second - The tiles after the library was re-sorted.
 * @param ticked - The selection, unchanged across both.
 * @returns The ticked tile ids after each render.
 */
const renderTwice = (
  first: readonly PoolItem[],
  second: readonly PoolItem[],
  ticked: ReadonlySet<MediaId>,
): readonly (readonly (string | null)[])[] => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  const tickedIds = (): readonly (string | null)[] =>
    [...host.querySelectorAll('[data-ticked]')].map((tile) => tile.getAttribute('data-pool-item'))

  act(() => {
    root.render(poolOf(first, 0, { ticked }))
  })
  const before = tickedIds()
  act(() => {
    root.render(poolOf(second, 0, { ticked }))
  })
  return [before, tickedIds()]
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount()
    })
  }
  document.body.innerHTML = ''
})

describe('JourneyPool', () => {
  it('prints how many of the pool are in the book, out of how many there are', () => {
    const host = renderPool([anItem('1', { inBook: true }), anItem('2'), anItem('3')], 1)

    expect(host.querySelector('[data-pool-count]')?.textContent).toBe('1 of 3 in the book')
  })

  it('ticks exactly the photographs the page being edited holds', () => {
    const host = renderPool([anItem('1'), anItem('2')], 1, { ticked: new Set([anId('1')]) })

    const ticked = [...host.querySelectorAll('[data-ticked]')]
    expect(ticked).toHaveLength(1)
    expect(ticked[0]?.getAttribute('data-pool-item')).toBe('1')
  })

  it('keeps the same photograph ticked when the pool is re-sorted under it', () => {
    // BY ID, NEVER BY POSITION (CLAUDE.md 0.9). The pool is sorted by the
    // library's own `order`, which an author can change from the Media screen
    // while this page is open - so a tick chosen by index would follow the
    // PLACE rather than the photograph. The two renders below are the same
    // three tiles in two orders, against one selection.
    const ticked = new Set([anId('2')])

    const [before, after] = renderTwice(
      [anItem('1'), anItem('2'), anItem('3')],
      [anItem('3'), anItem('2'), anItem('1')],
      ticked,
    )

    expect(before).toEqual(['2'])
    expect(after).toEqual(['2'])
  })

  it('disables every tile while no frame is chosen, and says so', () => {
    // A tick with no frame chosen has nowhere to put the photograph, and "the
    // first empty cell" is a guess nobody asked for. The instruction line is
    // what turns a disabled control into an instruction.
    const host = renderPool([anItem('1')], 0, { target: null })

    expect([...host.querySelectorAll('[data-pool-place]')].every((tile) => tile.hasAttribute('disabled'))).toBe(true)
    expect(host.querySelector('[data-pool-instruction]')?.textContent).toContain('Replace')
  })

  it('enables the tiles once a frame is chosen, and posts that frame with the photograph', () => {
    const host = renderPool([anItem('1')], 0, { target: aSlot('7:2') })

    const tile = host.querySelector('[data-pool-place]')
    expect(tile?.hasAttribute('disabled')).toBe(false)
    expect(host.querySelector('input[name="slot"]')?.getAttribute('value')).toBe('7:2')
    expect(host.querySelector('input[name="media"]')?.getAttribute('value')).toBe('1')
  })

  it('puts a duration chip on a clip and none on a still, where this deployment takes clips', () => {
    const host = renderPool([anItem('1', { duration: '0:24' }), anItem('2')], 0, { showsClips: true })

    const chips = [...host.querySelectorAll('[data-pool-duration]')]
    expect(chips).toHaveLength(1)
    expect(chips[0]?.textContent).toBe('0:24')
  })

  it('draws no duration chip where this deployment cannot take a clip at all', () => {
    // Design spec §9.3 puts clip-specific affordances behind `MEDIA_PIPELINE`,
    // and `showsClipAffordances` is where that question is answered. The ROW is
    // still drawn — a clip ingested before the flag moved is content, and
    // hiding it would make the admin lie about what the library holds.
    const host = renderPool([anItem('1', { duration: '0:24' })], 0, { showsClips: false })

    expect(host.querySelectorAll('[data-pool-duration]')).toHaveLength(0)
    expect(host.querySelectorAll('[data-pool-item]')).toHaveLength(1)
  })

  it('draws an empty square for an upload with no derivative, rather than a broken image', () => {
    const host = renderPool([anItem('1', { thumbSrc: null })], 0)

    expect(host.querySelectorAll('[data-pool-item]')).toHaveLength(1)
    expect(host.querySelectorAll('img')).toHaveLength(0)
  })

  it('names every tile by the row own alt text, so the grid is not a wall of unnamed squares', () => {
    // THE NAME IS ON THE BUTTON, NOT ON THE `<img>` INSIDE IT. The tile is the
    // control now, and an image with its own alt inside a labelled button is
    // announced twice; the image is decorative and the button says what
    // pressing it does.
    const host = renderPool([anItem('1'), anItem('2')], 0)

    expect([...host.querySelectorAll('[data-pool-place]')].map((tile) => tile.getAttribute('aria-label'))).toEqual([
      'Place Frame 1 in the chosen frame',
      'Place Frame 2 in the chosen frame',
    ])
    expect([...host.querySelectorAll('img')].map((image) => image.getAttribute('alt'))).toEqual(['', ''])
  })

  it('lets a keyboard reach the scrolling grid, whether or not a frame has been chosen', () => {
    // MEASURED IN A REAL BROWSER TWICE. `e2e/a11y.spec.ts` reported
    // `scrollable-region-focusable` (serious, WCAG 2.1.1) on this list when
    // Task 5's tiles were inert, and reported it AGAIN when Task 7 removed the
    // stop on the reasoning that the tiles are buttons now
    // (`docs/qa/2026-09-20-journey-slots-sweep.md`, SLOT-001): with no frame
    // chosen every tile is `disabled`, and a disabled button is not focusable.
    //
    // THE ASSERTION IS THE WCAG CONDITION, NOT THE FIX. A scrollable region has
    // to be reachable — through a focusable descendant OR by taking the focus
    // itself — and this asks exactly that, in both states, so the next shape
    // that satisfies it stays green.
    const reachable = (host: HTMLElement): boolean => {
      const grid = host.querySelector('ul')
      const stop = Number(grid?.getAttribute('tabindex') ?? '-1') >= 0
      const inside = [...host.querySelectorAll('button')].some((tile) => !tile.hasAttribute('disabled'))
      return stop || inside
    }

    expect(reachable(renderPool([anItem('1'), anItem('2')], 0, { target: null }))).toBe(true)
    expect(reachable(renderPool([anItem('1'), anItem('2')], 0, { target: aSlot('7:0') }))).toBe(true)
  })

  it('does not stop the focus on the list once its own tiles can take it', () => {
    // The other half, and the reason the stop is conditional rather than
    // permanent: a focus stop that lands on a list whose children are all
    // focusable is a stop nobody wants, and it is what Task 5's own comment
    // said should go.
    const host = renderPool([anItem('1'), anItem('2')], 0, { target: aSlot('7:0') })

    expect(host.querySelector('ul')?.getAttribute('tabindex')).toBeNull()
  })

  it('draws an empty pool rather than throwing for a journey with no media', () => {
    const host = renderPool([], 0)

    expect(host.querySelector('[data-pool-count]')?.textContent).toBe('0 of 0 in the book')
    expect(host.querySelectorAll('[data-pool-item]')).toHaveLength(0)
  })
})
