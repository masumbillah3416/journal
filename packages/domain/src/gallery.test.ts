/**
 * gallery.test.ts — the gallery's reading model, asserted before it exists.
 *
 * The headline case is `keeps the open frame on the same photograph when the
 * collection is reordered`. The handoff records the defect it guards twice —
 * README's State section and DATA_MODEL's notes: "`picked` was a positional
 * index into the gallery; once 'sort by date' reordered the list, the
 * selected-frame panel showed a different photo than the grid highlighted."
 * A test that opened a frame and asserted its caption would pass against an
 * index; only reordering the collection underneath an open frame tells the
 * two apart.
 * Depends on: vitest, ./gallery, ./ids.
 */
import { describe, expect, it } from 'vitest'
import {
  GALLERY_THUMB_SIZE,
  VIRTUALIZE_ABOVE,
  frameCounter,
  frameMetadata,
  frameIdFromHash,
  frameOrdinal,
  frameShareUrl,
  clipDuration,
  galleryThumbSize,
  openFrameById,
  stepFrame,
  tileWindow,
  type GalleryFrame,
} from './gallery'
import { mediaId, type MediaId } from './ids'

/**
 * Brands a raw string as a {@link MediaId} for a fixture, throwing on the
 * empty string no test passes.
 * @param raw - The candidate id.
 * @returns The branded id.
 */
const anId = (raw: string): MediaId => {
  const branded = mediaId(raw)
  if (!branded.ok) throw new Error(branded.error)
  return branded.value
}

/**
 * A gallery frame fixture, overridable per field (Factory pattern).
 * @param id - The media id this frame is addressed by.
 * @param overrides - Fields to override on the default frame.
 * @returns A fresh frame, shared with no other call's result.
 */
const aFrame = (id: string, overrides: Partial<GalleryFrame> = {}): GalleryFrame => ({
  id: anId(id),
  tileSrc: `/api/media/file/${id}-400x400.png`,
  fullSrc: `/api/media/file/${id}.png`,
  downloadHref: `/gallery/tokyo/download/${id}`,
  alt: `alt for ${id}`,
  caption: `caption for ${id}`,
  kind: 'still',
  durationSec: undefined,
  focalX: 50,
  focalY: 50,
  downloadable: true,
  ...overrides,
})

/** Three frames, in the order the grid first showed them. */
const threeFrames = (): readonly GalleryFrame[] => [aFrame('doorway'), aFrame('market'), aFrame('ferry')]

describe('galleryThumbSize', () => {
  it('uses the handoff default when the book global has never been set', () => {
    expect(galleryThumbSize(undefined)).toBe(200)
  })

  it('uses the default when the field was cleared rather than filled in', () => {
    expect(galleryThumbSize(null)).toBe(200)
  })

  it('keeps a size the editor chose inside the allowed range', () => {
    expect(galleryThumbSize(240)).toBe(240)
  })

  it('clamps a size below the range up to the smallest tile the design allows', () => {
    expect(galleryThumbSize(40)).toBe(GALLERY_THUMB_SIZE.min)
  })

  it('clamps a size above the range down to the largest tile the design allows', () => {
    expect(galleryThumbSize(4000)).toBe(GALLERY_THUMB_SIZE.max)
  })

  it('rounds a fractional size, since it becomes a whole-pixel grid track', () => {
    expect(galleryThumbSize(220.6)).toBe(221)
  })

  it('falls back to the default for a value that is not a number at all', () => {
    expect(galleryThumbSize(Number.NaN)).toBe(200)
  })
})

describe('frameOrdinal', () => {
  it('numbers the first frame 001, so a reader counts from one', () => {
    expect(frameOrdinal(0, 61)).toBe('001')
  })

  it('pads to three digits even in a gallery of eight', () => {
    expect(frameOrdinal(6, 8)).toBe('007')
  })

  it('widens past three digits once a gallery is that large', () => {
    expect(frameOrdinal(1233, 1234)).toBe('1234')
  })
})

describe('frameCounter', () => {
  it('reads 003 / 061 for the third of sixty-one frames, as SCREENS.md §1.9 prints it', () => {
    expect(frameCounter(2, 61)).toBe('003 / 061')
  })
})

describe('frameMetadata', () => {
  it('names the journey, the place and the frame number, in that order', () => {
    expect(frameMetadata({ name: 'Tokyo', place: 'Japan' }, 6, 61)).toBe('Tokyo · Japan · frame 007')
  })

  it('omits the place when a journey has none, rather than printing a bare separator', () => {
    expect(frameMetadata({ name: 'Tokyo', place: '' }, 6, 61)).toBe('Tokyo · frame 007')
  })
})

describe('openFrameById', () => {
  it('reports no open frame when the lightbox is closed', () => {
    expect(openFrameById(threeFrames(), null)).toBeNull()
  })

  it('finds the frame a reader opened, and where it currently sits', () => {
    const opened = openFrameById(threeFrames(), anId('market'))

    expect(opened?.frame.caption).toBe('caption for market')
    expect(opened?.index).toBe(1)
  })

  it('keeps the open frame on the same photograph when the collection is reordered', () => {
    // The handoff's own defect, stated as a test: a positional `picked` shows
    // a different photograph the moment a sort runs underneath it.
    const asShot = threeFrames()
    const openId = anId('market')
    const byDate = [...asShot].reverse()

    const before = openFrameById(asShot, openId)
    const after = openFrameById(byDate, openId)

    expect(after?.frame).toEqual(before?.frame)
  })

  it('reports the reordered position of the open frame, so the counter follows the grid', () => {
    const byDate = [...threeFrames()].reverse()

    expect(openFrameById(byDate, anId('market'))?.index).toBe(1)
    expect(openFrameById(byDate, anId('doorway'))?.index).toBe(2)
  })

  it('reports no open frame for an id the gallery no longer holds', () => {
    expect(openFrameById(threeFrames(), anId('deleted'))).toBeNull()
  })
})

describe('stepFrame', () => {
  it('steps forward to the next frame’s id, never to its position', () => {
    expect(stepFrame(threeFrames(), anId('doorway'), 1)).toBe(anId('market'))
  })

  it('steps backward to the previous frame’s id', () => {
    expect(stepFrame(threeFrames(), anId('ferry'), -1)).toBe(anId('market'))
  })

  it('refuses to step past the last frame, so the arrow is spent rather than wrapping', () => {
    expect(stepFrame(threeFrames(), anId('ferry'), 1)).toBeNull()
  })

  it('refuses to step before the first frame', () => {
    expect(stepFrame(threeFrames(), anId('doorway'), -1)).toBeNull()
  })

  it('steps to the neighbour in the CURRENT order after a reorder, not the original one', () => {
    const byDate = [...threeFrames()].reverse()

    expect(stepFrame(byDate, anId('ferry'), 1)).toBe(anId('market'))
  })

  it('has nowhere to step from an id the gallery no longer holds', () => {
    expect(stepFrame(threeFrames(), anId('deleted'), 1)).toBeNull()
  })

  it('has nowhere to step when the lightbox is closed', () => {
    expect(stepFrame(threeFrames(), null, 1)).toBeNull()
  })
})

describe('tileWindow', () => {
  /** A gallery scrolled to the top, at four 218px-tall rows of tiles per screen. */
  const atRest = { columns: 4, rowHeight: 218, scrollTop: 0, viewportHeight: 900 }

  it('renders every tile of a gallery at the design’s own ceiling', () => {
    expect(tileWindow({ ...atRest, total: VIRTUALIZE_ABOVE })).toEqual({ from: 0, to: VIRTUALIZE_ABOVE })
  })

  it('renders every one of the sixty-one tiles the handoff verified', () => {
    expect(tileWindow({ ...atRest, total: 61 })).toEqual({ from: 0, to: 61 })
  })

  it('renders only a window once a gallery runs past the ceiling', () => {
    const window = tileWindow({ ...atRest, total: 400 })

    expect(window.from).toBe(0)
    expect(window.to).toBeLessThan(400)
  })

  it('keeps the tiles a reader has scrolled to inside the window', () => {
    const window = tileWindow({ ...atRest, total: 400, scrollTop: 2180 })

    // Row 10 of a four-column grid starts at tile 40.
    expect(window.from).toBeLessThanOrEqual(40)
    expect(window.to).toBeGreaterThan(40 + 4 * 4)
  })

  it('overscans above the fold, so a tile is decoded before it is scrolled into', () => {
    const window = tileWindow({ ...atRest, total: 400, scrollTop: 2180 })

    expect(window.from).toBeLessThan(40)
  })

  it('never runs the window past the end of the gallery', () => {
    const window = tileWindow({ ...atRest, total: 400, scrollTop: 100_000 })

    expect(window.to).toBe(400)
    expect(window.from).toBeLessThan(400)
  })

  it('renders everything rather than dividing by a row height nothing has measured yet', () => {
    expect(tileWindow({ ...atRest, total: 400, rowHeight: 0 })).toEqual({ from: 0, to: 400 })
  })

  it('renders everything rather than windowing against a grid with no columns yet', () => {
    expect(tileWindow({ ...atRest, total: 400, columns: 0 })).toEqual({ from: 0, to: 400 })
  })
})

describe('clipDuration', () => {
  it('reads a short clip as minutes and seconds, the way a transport bar does', () => {
    expect(clipDuration(12)).toBe('0:12')
  })

  it('zero-pads the seconds, so 1:05 never reads as 1:5', () => {
    expect(clipDuration(65)).toBe('1:05')
  })

  it('rounds a fractional duration down to the second it is still inside', () => {
    expect(clipDuration(12.9)).toBe('0:12')
  })

  it('has nothing to print for a still, which carries no duration at all', () => {
    expect(clipDuration(undefined)).toBeNull()
  })

  it('has nothing to print for a clip whose duration the pipeline never recorded', () => {
    expect(clipDuration(Number.NaN)).toBeNull()
  })

  it('has nothing to print for a negative duration, which is not a length', () => {
    expect(clipDuration(-4)).toBeNull()
  })
})

describe('frameShareUrl', () => {
  it('addresses one frame of a gallery by the frame’s own id', () => {
    expect(frameShareUrl('https://diary.example', '/gallery/tokyo', anId('412'))).toBe(
      'https://diary.example/gallery/tokyo#frame-412',
    )
  })

  it('percent-encodes an id, so a fragment cannot carry markup of its own', () => {
    expect(frameShareUrl('https://diary.example', '/gallery/tokyo', anId('a b'))).toBe(
      'https://diary.example/gallery/tokyo#frame-a%20b',
    )
  })
})

describe('frameIdFromHash', () => {
  it('opens the frame a shared address names', () => {
    expect(frameIdFromHash('#frame-market', threeFrames())).toBe(anId('market'))
  })

  it('round-trips the address it produced for an id needing encoding', () => {
    const frames = [aFrame('a b')]
    const url = frameShareUrl('https://diary.example', '/gallery/tokyo', anId('a b'))

    expect(frameIdFromHash(url.slice(url.indexOf('#')), frames)).toBe(anId('a b'))
  })

  it('opens nothing for an address naming a frame this gallery no longer holds', () => {
    expect(frameIdFromHash('#frame-deleted', threeFrames())).toBeNull()
  })

  it('opens nothing for a fragment that is not a frame address at all', () => {
    expect(frameIdFromHash('#contents', threeFrames())).toBeNull()
  })

  it('opens nothing when there is no fragment', () => {
    expect(frameIdFromHash('', threeFrames())).toBeNull()
  })
})
