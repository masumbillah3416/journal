/**
 * Grid.test.tsx — the grid of tiles, and the one piece of state the gallery
 * holds.
 *
 * That state is a MEDIA ID, and the reordering case below is the whole reason
 * this file names it in nearly every assertion. The handoff records the
 * alternative twice, in README's State section and DATA_MODEL's notes:
 * "`picked` was a positional index into the gallery; once 'sort by date'
 * reordered the list, the selected-frame panel showed a different photo than
 * the grid highlighted."
 *
 * jsdom performs no layout, so the two things only a browser can answer are
 * not here: that sixty-one tiles stay square and unsqueezed
 * (`e2e/gallery.spec.ts`), and that the windowed grid past a hundred tiles
 * actually renders fewer elements while scrolling (also there - jsdom reports
 * every rect as zero, so the measured branch of `tileWindow` can never be
 * taken here). What IS here is that a gallery at the design's own size
 * renders every tile, which is the case a virtualization bug would break
 * first.
 * Depends on: react, react-dom/client, @travel-diary/domain, vitest (jsdom).
 */
import type { GalleryFrame } from '@travel-diary/domain/gallery'
import { aGalleryBundle, aGalleryFrame, galleryFrames } from '@travel-diary/domain/testing/factories'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { Grid } from './Grid'

const roots: Root[] = []

/**
 * Renders the grid and hands back the host element.
 * @param frames - The gallery's frames, in the order the grid shows them.
 * @param thumbSize - The grid's minimum tile track.
 * @returns The host element and a `rerender` that keeps the same React root.
 */
const renderGrid = (
  frames: readonly GalleryFrame[],
  thumbSize = 200,
): { readonly host: HTMLElement; readonly rerender: (next: readonly GalleryFrame[]) => void } => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)

  const draw = (current: readonly GalleryFrame[]): void => {
    act(() => {
      root.render(<Grid journey={aGalleryBundle().journey} frames={current} thumbSize={thumbSize} />)
    })
  }

  draw(frames)
  return { host, rerender: draw }
}

/** Clicks the tile addressed by a media id. */
const openTile = (host: HTMLElement, id: string): void => {
  act(() => {
    host.querySelector(`[data-tile="${id}"]`)?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount()
  })
  document.body.replaceChildren()
  window.location.hash = ''
})

describe('Grid', () => {
  it('renders every one of the sixty-one tiles the handoff verified', () => {
    const { host } = renderGrid(galleryFrames(61))

    expect(host.querySelectorAll('[data-tile]')).toHaveLength(61)
  })

  it('tracks the grid at the tile size the book global asked for', () => {
    const { host } = renderGrid(galleryFrames(8), 260)
    const grid = host.querySelector<HTMLElement>('[data-gallery-grid]')

    expect(grid?.style.getPropertyValue('--td-gallery-thumb')).toBe('260px')
  })

  it('numbers the tiles from one, in the order they are shown', () => {
    const { host } = renderGrid(galleryFrames(3))
    const badges = [...host.querySelectorAll('[data-index-badge]')].map((badge) => badge.textContent)

    expect(badges).toEqual(['001', '002', '003'])
  })

  it('says so rather than showing an empty grid when a journey has no frames yet', () => {
    const { host } = renderGrid([])

    expect(host.textContent).toContain('No frames in this gallery yet')
  })

  it('opens no lightbox until a reader picks a tile', () => {
    const { host } = renderGrid(galleryFrames(8))

    expect(host.querySelector('[data-lightbox]')).toBeNull()
  })

  it('opens the lightbox on the tile the reader picked', () => {
    const { host } = renderGrid([aGalleryFrame('doorway'), aGalleryFrame('market'), aGalleryFrame('ferry')])

    openTile(host, 'market')

    expect(host.querySelector('[data-counter]')?.textContent).toBe('002 / 003')
  })

  it('keeps the same photograph open when the collection is reordered under it', () => {
    // The defect the handoff records, at the level the grid owns it: the id
    // the grid is holding must survive a new `frames` array arriving.
    const asShot = [aGalleryFrame('doorway'), aGalleryFrame('market'), aGalleryFrame('ferry')]
    const { host, rerender } = renderGrid(asShot)
    openTile(host, 'market')
    const before = host.querySelector('[data-lightbox-image]')?.getAttribute('src')

    rerender([...asShot].reverse())

    expect(host.querySelector('[data-lightbox-image]')?.getAttribute('src')).toBe(before)
    expect(host.querySelector('[data-counter]')?.textContent).toBe('002 / 003')
  })

  it('closes the lightbox when the reader presses Escape', () => {
    const { host } = renderGrid(galleryFrames(8))
    openTile(host, 'frame-3')

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })

    expect(host.querySelector('[data-lightbox]')).toBeNull()
  })

  it('steps the open frame with the arrow keys', () => {
    const { host } = renderGrid(galleryFrames(8))
    openTile(host, 'frame-3')

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    })

    expect(host.querySelector('[data-counter]')?.textContent).toBe('004 / 008')
  })

  it('returns focus to the tile the reader opened, so the keyboard does not start over', () => {
    const { host } = renderGrid(galleryFrames(8))
    openTile(host, 'frame-3')

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })

    expect(document.activeElement).toBe(host.querySelector('[data-tile="frame-3"]'))
  })

  it('returns focus to the frame the reader stepped to, not the one they opened', () => {
    const { host } = renderGrid(galleryFrames(8))
    openTile(host, 'frame-3')

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    })
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })

    expect(document.activeElement).toBe(host.querySelector('[data-tile="frame-4"]'))
  })

  it('opens the frame a shared address names, so a Share link lands on the photograph', () => {
    window.location.hash = '#frame-frame-5'

    const { host } = renderGrid(galleryFrames(8))

    expect(host.querySelector('[data-counter]')?.textContent).toBe('005 / 008')
  })

  it('opens nothing for a shared address naming a frame this gallery no longer holds', () => {
    window.location.hash = '#frame-deleted'

    const { host } = renderGrid(galleryFrames(8))

    expect(host.querySelector('[data-lightbox]')).toBeNull()
  })
})
