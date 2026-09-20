/**
 * SelectedFrame.test.tsx — SCREENS.md §2.5's right-hand panel: the two file
 * lines, the three toggles, and the poster block a clip gets.
 *
 * ═══ THE CLIP HALF IS COVERED BY HANDING THIS COMPONENT A CLIP ═══
 *
 * Design spec §9.3 puts clips behind `MEDIA_PIPELINE=worker`, which is refused
 * at boot on this machine because `ffmpeg` and `ffprobe` are absent — so with
 * `inline` bound the galleries SCREEN can never produce one, the poster block
 * is never rendered there and the file line's clip branch is unreachable from
 * a browser. The cases below pass a clip row directly, which is the honest way
 * to keep the 90% gate meaningful rather than excluding the branch. What stays
 * UNRESOLVED under CLAUDE.md §7.1 is whether a real clip, derived by a real
 * worker, draws the same thing: no browser here can be shown one, and that is
 * not outsourced.
 *
 * WHAT PRODUCED THE FIXTURE SHAPE: `width`, `height` and `filesize` are what
 * Payload measured off the stored original; `previewSrc` is the uncropped
 * ladder `readGalleriesScreen.ts` walks; `posterAt` is `null` until §2.5's
 * filmstrip writes it, because nothing else in this repository ever has.
 * Depends on: react, react-dom/client, vitest (jsdom), @travel-diary/domain/ids,
 * `FrameRow` (../../../lib/admin/readGalleriesScreen), ./SelectedFrame.
 */
import { mediaId, type MediaId } from '@travel-diary/domain/ids'
import type React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import type { FrameRow } from '../../../lib/admin/readGalleriesScreen'
import { fileLine, posterGrabs, SelectedFrame, type FrameDraft } from './SelectedFrame'

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
 * One still, with every field stated.
 * @param overrides - What this case cares about.
 * @returns A complete {@link FrameRow}.
 */
const aStill = (overrides: Partial<FrameRow> = {}): FrameRow => ({
  id: anId('4'),
  order: 0,
  capturedAt: null,
  filename: 'tokyo-004.jpg',
  thumbSrc: '/api/media/file/tokyo-004-400x400.jpg',
  previewSrc: '/api/media/file/tokyo-004-1400.jpg',
  alt: 'A quiet street at dawn',
  caption: 'The last morning',
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

/**
 * One clip, which this screen cannot produce on this machine.
 * @param overrides - What this case cares about.
 * @returns A complete {@link FrameRow}.
 */
const aClip = (overrides: Partial<FrameRow> = {}): FrameRow =>
  aStill({
    id: anId('9'),
    filename: 'harbour-012.mp4',
    kind: 'clip',
    width: 1920,
    height: 1080,
    durationSec: 24,
    ...overrides,
  })

/** What the panel is handed. */
interface PanelOptions {
  readonly frame: FrameRow | null
  readonly isCover?: boolean
  readonly showsClips?: boolean
  readonly onSave?: (id: MediaId, draft: FrameDraft) => void
  readonly onMakeCover?: (id: MediaId) => void
  readonly onPoster?: (id: MediaId, seconds: number) => void
}

/**
 * Renders the panel and hands back the host element.
 * @param options - See {@link PanelOptions}.
 * @returns The host element.
 */
const renderPanel = (options: PanelOptions): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  const element: React.JSX.Element = (
    <SelectedFrame
      frame={options.frame}
      isCover={options.isCover ?? false}
      showsClips={options.showsClips ?? true}
      onSave={options.onSave ?? ((): void => undefined)}
      onMakeCover={options.onMakeCover ?? ((): void => undefined)}
      onPoster={options.onPoster ?? ((): void => undefined)}
    />
  )
  act(() => {
    root.render(element)
  })
  return host
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount()
    })
  }
  document.body.replaceChildren()
})

describe('fileLine', () => {
  it('prints a still as its name, its pixels and its megabytes', () => {
    expect(fileLine(aStill())).toBe('tokyo-004.jpg · 4032 × 3024 · 6.1 MB')
  })

  it('prints a clip as its name, its pixels and the fact that it loops silently', () => {
    // §2.5's second file line. A clip's file size is not what an author is
    // deciding anything with, and its silence is.
    expect(fileLine(aClip())).toBe('harbour-012.mp4 · 1920 × 1080 · loops silently')
  })

  it('leaves out the pixels Payload never measured rather than printing a blank', () => {
    expect(fileLine(aStill({ width: null, height: null }))).toBe('tokyo-004.jpg · 6.1 MB')
  })

  it('leaves out a size Payload never measured', () => {
    expect(fileLine(aStill({ filesize: null }))).toBe('tokyo-004.jpg · 4032 × 3024')
  })
})

describe('posterGrabs', () => {
  it('offers four grabs, evenly spaced from the start of the clip', () => {
    expect(posterGrabs(24)).toEqual([0, 6, 12, 18])
  })

  it('offers the beginning four times for a clip whose length was never measured', () => {
    // A filmstrip of a clip of unknown length can only offer its beginning,
    // and saying so is better than dividing by nothing.
    expect(posterGrabs(null)).toEqual([0, 0, 0, 0])
  })
})

describe('SelectedFrame — a still', () => {
  it('names the frame it is showing by id, which is what the grid highlights', () => {
    const host = renderPanel({ frame: aStill() })

    expect(host.querySelector('[data-selected-frame]')?.getAttribute('data-frame-id')).toBe('4')
  })

  it('draws the uncropped preview, which is the photograph the author is describing', () => {
    const host = renderPanel({ frame: aStill() })
    const preview = host.querySelector('[data-frame-preview]')

    expect(preview instanceof HTMLImageElement ? preview.getAttribute('src') : null).toBe(
      '/api/media/file/tokyo-004-1400.jpg',
    )
  })

  it('draws an empty box for a frame with no derivative of any tier', () => {
    const host = renderPanel({ frame: aStill({ previewSrc: null }) })

    expect(host.querySelector('img[data-frame-preview]')).toBeNull()
  })

  it('starts the fields at the frame’s own caption, alt and toggles', () => {
    const host = renderPanel({ frame: aStill({ hidden: true, inBook: true }) })
    const caption = host.querySelector('[data-frame-caption]')
    const alt = host.querySelector('[data-frame-alt]')
    const hidden = host.querySelector('[data-frame-hidden]')
    const inBook = host.querySelector('[data-frame-in-book]')

    expect({
      caption: caption instanceof HTMLInputElement ? caption.value : null,
      alt: alt instanceof HTMLTextAreaElement ? alt.value : null,
      rows: alt instanceof HTMLTextAreaElement ? alt.rows : null,
      hidden: hidden instanceof HTMLInputElement ? hidden.checked : null,
      inBook: inBook instanceof HTMLInputElement ? inBook.checked : null,
    }).toEqual({
      caption: 'The last morning',
      alt: 'A quiet street at dawn',
      rows: 2,
      hidden: true,
      inBook: true,
    })
  })

  it('hands the draft to the caller when Save frame is pressed', () => {
    const saved: unknown[] = []
    const host = renderPanel({
      frame: aStill(),
      onSave: (id, draft) => {
        saved.push({ id, ...draft })
      },
    })

    const alt = host.querySelector('[data-frame-alt]')
    if (!(alt instanceof HTMLTextAreaElement)) throw new Error('no alt field')
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(alt, 'Rewritten')
      alt.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const book = host.querySelector('[data-frame-in-book]')
    if (!(book instanceof HTMLInputElement)) throw new Error('no in-book toggle')
    act(() => {
      book.click()
    })
    const save = host.querySelector('[data-frame-save]')
    if (!(save instanceof HTMLElement)) throw new Error('no save button')
    act(() => {
      save.click()
    })

    expect(saved).toEqual([{ id: '4', caption: 'The last morning', alt: 'Rewritten', hidden: false, inBook: true }])
  })

  it('asks for a move rather than a flag when "Use as gallery cover" is ticked', () => {
    // §2.5 also says "The first frame is the gallery cover", and the position
    // is the one the diary reads.
    const asked: MediaId[] = []
    const host = renderPanel({
      frame: aStill(),
      onMakeCover: (id) => {
        asked.push(id)
      },
    })

    const cover = host.querySelector('[data-frame-cover]')
    if (!(cover instanceof HTMLInputElement)) throw new Error('no cover toggle')
    act(() => {
      cover.click()
    })

    expect(asked).toEqual(['4'])
  })

  it('shows the cover box ticked and refuses to untick it on the frame that is the cover', () => {
    // Unticking would have no meaning: something has to be first.
    const host = renderPanel({ frame: aStill(), isCover: true })
    const cover = host.querySelector('[data-frame-cover]')

    expect({
      checked: cover instanceof HTMLInputElement ? cover.checked : null,
      disabled: cover instanceof HTMLInputElement ? cover.disabled : null,
    }).toEqual({ checked: true, disabled: true })
  })

  it('draws no poster block for a still, because a photograph has no poster', () => {
    const host = renderPanel({ frame: aStill() })

    expect(host.querySelector('[data-poster-block]')).toBeNull()
  })

  it('says so plainly when the journey has no frames at all', () => {
    const host = renderPanel({ frame: null })

    expect(host.textContent).toContain('This journey has no frames yet.')
  })
})

describe('SelectedFrame — a clip', () => {
  it('draws the poster block with an amber chip while the poster is the first frame', () => {
    const host = renderPanel({ frame: aClip() })
    const chip = host.querySelector('[data-poster-chip]')

    expect({ block: host.querySelector('[data-poster-block]') !== null, chip: chip?.textContent }).toEqual({
      block: true,
      chip: 'first frame',
    })
  })

  it('reads "set at 0:11" once a poster has been chosen', () => {
    const host = renderPanel({ frame: aClip({ posterAt: 11 }) })

    expect(host.querySelector('[data-poster-chip]')?.textContent).toBe('set at 0:11')
  })

  it('draws four timestamped grabs, which is §2.5’s own filmstrip', () => {
    const host = renderPanel({ frame: aClip() })

    expect([...host.querySelectorAll('[data-poster-grab]')].map((grab) => grab.textContent)).toEqual([
      '0:00',
      '0:06',
      '0:12',
      '0:18',
    ])
  })

  it('marks the grab the poster is currently taken from, and only that one', () => {
    const host = renderPanel({ frame: aClip({ posterAt: 12 }) })

    expect(
      [...host.querySelectorAll('[data-poster-grab][aria-pressed="true"]')].map((grab) =>
        grab.getAttribute('data-poster-grab'),
      ),
    ).toEqual(['12'])
  })

  it('writes the second a grab names', () => {
    const written: unknown[] = []
    const host = renderPanel({
      frame: aClip(),
      onPoster: (id, seconds) => {
        written.push({ id, seconds })
      },
    })

    const grab = host.querySelector('[data-poster-grab="12"]')
    if (!(grab instanceof HTMLElement)) throw new Error('no grab at 0:12')
    act(() => {
      grab.click()
    })

    expect(written).toEqual([{ id: '9', seconds: 12 }])
  })

  it('draws no poster block where this deployment shows no clip affordances at all', () => {
    // Design spec §9.3. With `MEDIA_PIPELINE=inline` there are no clips to
    // begin with, so this is the arm that holds if one ever arrives from an
    // older row.
    const host = renderPanel({ frame: aClip(), showsClips: false })

    expect(host.querySelector('[data-poster-block]')).toBeNull()
  })
})
