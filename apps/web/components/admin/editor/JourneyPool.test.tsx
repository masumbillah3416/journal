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
import { mediaId, type MediaId } from '@travel-diary/domain/ids'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import type { PoolItem } from '../../../lib/admin/readJourneyEditor'
import { JourneyPool } from './JourneyPool'

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
  caption: `A doorway, ${id}`,
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
const renderPool = (items: readonly PoolItem[], inBook: number): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(<JourneyPool items={items} inBook={inBook} browseHref="/admin/media" />)
  })
  return host
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

  it('rings exactly the tiles that are in the book', () => {
    const host = renderPool([anItem('1', { inBook: true }), anItem('2')], 1)

    const ringed = [...host.querySelectorAll('[data-in-book]')]
    expect(ringed).toHaveLength(1)
    expect(ringed[0]?.getAttribute('data-pool-item')).toBe('1')
  })

  it('puts a duration chip on a clip and none on a still', () => {
    const host = renderPool([anItem('1', { duration: '0:24' }), anItem('2')], 0)

    const chips = [...host.querySelectorAll('[data-pool-duration]')]
    expect(chips).toHaveLength(1)
    expect(chips[0]?.textContent).toBe('0:24')
  })

  it('draws an empty square for an upload with no derivative, rather than a broken image', () => {
    const host = renderPool([anItem('1', { thumbSrc: null })], 0)

    expect(host.querySelectorAll('[data-pool-item]')).toHaveLength(1)
    expect(host.querySelectorAll('img')).toHaveLength(0)
  })

  it('gives every image the row’s own alt text, so the grid is not a wall of unnamed squares', () => {
    const host = renderPool([anItem('1'), anItem('2')], 0)

    expect([...host.querySelectorAll('img')].map((image) => image.getAttribute('alt'))).toEqual(['Frame 1', 'Frame 2'])
  })

  it('draws an empty pool rather than throwing for a journey with no media', () => {
    const host = renderPool([], 0)

    expect(host.querySelector('[data-pool-count]')?.textContent).toBe('0 of 0 in the book')
    expect(host.querySelectorAll('[data-pool-item]')).toHaveLength(0)
  })
})
