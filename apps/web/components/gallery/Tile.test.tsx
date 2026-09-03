/**
 * Tile.test.tsx — what one square of the gallery grid prints, and what it
 * hands back when a reader picks it.
 *
 * jsdom performs no layout, so nothing here asserts a measurement: that the
 * tiles stay square and unsqueezed at sixty-one of them is
 * `e2e/gallery.spec.ts`'s, in a real browser, because it is the only place a
 * `aspect-ratio: 1/1` track can be read back. What is here is the markup and
 * the contract - which id the tile reports, what the badge prints, and the
 * two decorations a CLIP gets that a diary page slot deliberately does not.
 *
 * THE CLIP CASES ARE A SEAM, NOT COVERAGE OF A SHIPPING FEATURE. Video is
 * deferred (`docs/adr/0004-media-pipeline-mode.md`: `MEDIA_PIPELINE=inline`),
 * so no `media` row can carry `kind: 'clip'` until the transcode worker
 * lands and no browser test can reach these two branches. They are asserted
 * here, against a `kind: 'clip'` fixture, because the alternative is shipping
 * a badge nothing has ever rendered - and the fixture is a frame object of
 * the shape the pipeline will produce, not a fake clip in the database.
 * Depends on: react, react-dom/client, @travel-diary/domain/testing/factories,
 * vitest (jsdom).
 */
import { aGalleryFrame } from '@travel-diary/domain/testing/factories'
import type { GalleryFrame } from '@travel-diary/domain/gallery'
import type { MediaId } from '@travel-diary/domain/ids'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Tile } from './Tile'

const roots: Root[] = []

/**
 * Renders one tile and hands back the host element.
 * @param frame - The frame the tile prints.
 * @param index - Its 0-based position in the gallery's current order.
 * @param total - How many frames the gallery holds.
 * @param onOpen - Called with the frame's id when the tile is picked.
 * @returns The host element the tile was rendered into.
 */
const renderTile = (
  frame: GalleryFrame,
  index = 6,
  total = 61,
  onOpen: (id: MediaId) => void = () => undefined,
): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(<Tile frame={frame} index={index} total={total} onOpen={onOpen} />)
  })
  return host
}

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount()
  })
  document.body.replaceChildren()
})

describe('Tile', () => {
  it('is a button, because picking a tile opens a modal rather than following a link', () => {
    const host = renderTile(aGalleryFrame('market'))

    expect(host.querySelector('button')?.getAttribute('type')).toBe('button')
  })

  it('reports the frame’s id when it is picked, never its position', () => {
    // The whole gallery's identity model in one assertion: a tile that
    // reported `index` would desync from the grid the moment a sort ran.
    const picked = vi.fn()
    const host = renderTile(aGalleryFrame('market'), 6, 61, picked)

    act(() => {
      host.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(picked).toHaveBeenCalledWith('market')
  })

  it('addresses itself by the frame’s id, so a test and a sort agree on which tile is which', () => {
    const host = renderTile(aGalleryFrame('market'))

    expect(host.querySelector('[data-tile="market"]')).not.toBeNull()
  })

  it('draws the square-tile derivative, never the full-size one', () => {
    const frame = aGalleryFrame('market')
    const host = renderTile(frame)

    expect(host.querySelector('img')?.getAttribute('src')).toBe(frame.tileSrc)
  })

  it('loads lazily, because a gallery is a long scroll of photographs', () => {
    const host = renderTile(aGalleryFrame('market'))

    expect(host.querySelector('img')?.getAttribute('loading')).toBe('lazy')
  })

  it('crops at the media item’s own focal point', () => {
    const host = renderTile(aGalleryFrame('market', { focalX: 30, focalY: 72 }))

    expect(host.querySelector('img')?.style.objectPosition).toBe('30% 72%')
  })

  it('carries the media item’s alt text', () => {
    const host = renderTile(aGalleryFrame('market', { alt: 'A fish market at dawn' }))

    expect(host.querySelector('img')?.getAttribute('alt')).toBe('A fish market at dawn')
  })

  it('numbers itself from one, zero-padded, in the badge at its corner', () => {
    const host = renderTile(aGalleryFrame('market'), 6, 61)

    expect(host.querySelector('[data-index-badge]')?.textContent).toBe('007')
  })

  it('prints the caption under the square', () => {
    const host = renderTile(aGalleryFrame('market', { caption: 'Nineteen tarts, no regrets' }))

    expect(host.querySelector('[data-tile-caption]')?.textContent).toBe('Nineteen tarts, no regrets')
  })

  it('names itself for a screen reader by its number and its caption', () => {
    const host = renderTile(aGalleryFrame('market', { caption: 'A fish market' }), 6, 61)

    expect(host.querySelector('button')?.getAttribute('aria-label')).toBe('Open frame 007, A fish market')
  })

  it('names itself by its number alone when nobody has captioned the frame', () => {
    const host = renderTile(aGalleryFrame('market', { caption: '' }), 6, 61)

    expect(host.querySelector('button')?.getAttribute('aria-label')).toBe('Open frame 007')
  })

  it('gives a photograph no play badge, since there is nothing to play', () => {
    const host = renderTile(aGalleryFrame('market'))

    expect(host.querySelector('[data-play-badge]')).toBeNull()
  })

  it('gives a photograph no duration chip', () => {
    const host = renderTile(aGalleryFrame('market'))

    expect(host.querySelector('[data-duration]')).toBeNull()
  })

  it('gives a clip a play badge, the opposite of a diary page slot', () => {
    // SCREENS.md §1.8 against §1.4: here the reader is CHOOSING what to open,
    // so a clip has to look different from a photograph before it is opened.
    const host = renderTile(aGalleryFrame('reel', { kind: 'clip', durationSec: 18 }))

    expect(host.querySelector('[data-play-badge]')).not.toBeNull()
  })

  it('prints a clip’s length in the chip at its opposite corner', () => {
    const host = renderTile(aGalleryFrame('reel', { kind: 'clip', durationSec: 65 }))

    expect(host.querySelector('[data-duration]')?.textContent).toBe('1:05')
  })

  it('gives a clip whose length the pipeline never recorded no chip rather than an empty one', () => {
    const host = renderTile(aGalleryFrame('reel', { kind: 'clip', durationSec: undefined }))

    expect(host.querySelector('[data-play-badge]')).not.toBeNull()
    expect(host.querySelector('[data-duration]')).toBeNull()
  })
})
