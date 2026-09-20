/**
 * CaptionAll.test.tsx — SCREENS.md §2.5's bulk caption panel: the suggestion
 * that is only ever a hint, the drafts kept by frame id, and what one press of
 * "Apply captions" hands over.
 *
 * WHAT PRODUCED THE FIXTURE SHAPE: the rows are what `readGalleriesScreen`
 * returns for frames whose `caption` column is empty — `thumbSrc` is `null` for
 * an upload too small for the tier, and the filename is the stored file's own.
 * Depends on: react, react-dom/client, vitest (jsdom), @travel-diary/domain/ids,
 * `BulkCaption` (../../../lib/admin/galleryMutations), `FrameRow`
 * (../../../lib/admin/readGalleriesScreen), ./CaptionAll.
 */
import { mediaId, type MediaId } from '@travel-diary/domain/ids'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import type { BulkCaption } from '../../../lib/admin/galleryMutations'
import type { FrameRow } from '../../../lib/admin/readGalleriesScreen'
import { CaptionAll, captionSuggestion } from './CaptionAll'

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
 * One uncaptioned frame, with every field stated.
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
  alt: '',
  caption: '',
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
 * Renders the panel and hands back the host element.
 * @param frames - The uncaptioned frames.
 * @param onApply - What the press hands over to.
 * @returns The host element.
 */
const renderPanel = (
  frames: readonly FrameRow[],
  onApply: (rows: readonly BulkCaption[]) => void = (): void => undefined,
): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(<CaptionAll frames={frames} onApply={onApply} />)
  })
  return host
}

/**
 * Types into one row's caption field.
 * @param host - The rendered host.
 * @param id - The frame whose row is typed into.
 * @param written - What is typed.
 */
const type = (host: HTMLElement, id: string, written: string): void => {
  const field = host.querySelector(`[data-bulk-row="${id}"] input`)
  if (!(field instanceof HTMLInputElement)) throw new Error(`no field for ${id}`)
  act(() => {
    // The setter React's synthetic onChange listens for — assigning `.value`
    // updates React's own tracker first, so the event that follows reads as no
    // change at all.
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(field, written)
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount()
    })
  }
  document.body.replaceChildren()
})

describe('captionSuggestion', () => {
  it('turns a file name into something an author can read', () => {
    expect(captionSuggestion('tokyo-004.jpg')).toBe('Tokyo 004')
  })

  it('reads an underscored name the same way', () => {
    expect(captionSuggestion('harbour_dawn_012.png')).toBe('Harbour dawn 012')
  })

  it('suggests nothing for a name with nothing in it', () => {
    // A row Payload stored always has a filename; this is the arm that keeps
    // `''.toUpperCase()` from being the suggestion drawn.
    expect(captionSuggestion('.jpg')).toBe('')
  })
})

describe('CaptionAll', () => {
  it('counts the frames it is offering', () => {
    const host = renderPanel([aFrame('a'), aFrame('b')])

    expect(host.querySelector('[data-bulk-count]')?.textContent).toBe('2 frames have no caption')
  })

  it('hints each input with a suggestion rather than filling it in', () => {
    // §2.5's own wording — "placeholder-hinted with a suggestion" — and the
    // reason it matters: a pre-filled field would let one press write the
    // suggestion to every frame, which is the opposite of the panel's own
    // closing line.
    const host = renderPanel([aFrame('a')])
    const field = host.querySelector('[data-bulk-row="a"] input')

    expect({
      placeholder: field instanceof HTMLInputElement ? field.placeholder : null,
      value: field instanceof HTMLInputElement ? field.value : null,
    }).toEqual({ placeholder: 'Tokyo a', value: '' })
  })

  it('prints §2.5’s closing line', () => {
    const host = renderPanel([aFrame('a')])

    expect(host.textContent).toContain('Anything left empty keeps its file name for now.')
  })

  it('draws an empty square for an upload too small for the thumbnail tier', () => {
    const host = renderPanel([aFrame('a', { thumbSrc: null })])

    expect(host.querySelector('[data-bulk-row="a"] img')).toBeNull()
  })

  it('hands over every row it drew, keyed by frame id, blanks included', () => {
    // Which of them is WRITTEN is `galleryMutations.ts`'s rule, and it is
    // written down once — in the module whose integration test executes it.
    const applied: BulkCaption[][] = []
    const host = renderPanel([aFrame('a'), aFrame('b')], (rows) => {
      applied.push([...rows])
    })

    type(host, 'b', 'Dawn over the lake')
    const apply = host.querySelector('[data-bulk-apply]')
    if (!(apply instanceof HTMLElement)) throw new Error('no apply button')
    act(() => {
      apply.click()
    })

    expect(applied).toEqual([
      [
        { id: 'a', caption: '' },
        { id: 'b', caption: 'Dawn over the lake' },
      ],
    ])
  })

  it('forgets its drafts once they are applied, so a second press does not rewrite them', () => {
    const applied: BulkCaption[][] = []
    const host = renderPanel([aFrame('a')], (rows) => {
      applied.push([...rows])
    })
    type(host, 'a', 'Written once')
    const apply = host.querySelector('[data-bulk-apply]')
    if (!(apply instanceof HTMLElement)) throw new Error('no apply button')

    act(() => {
      apply.click()
    })
    act(() => {
      apply.click()
    })

    expect(applied).toEqual([[{ id: 'a', caption: 'Written once' }], [{ id: 'a', caption: '' }]])
  })

  it('refuses to submit a panel with nothing to caption, which the write would reject anyway', () => {
    const host = renderPanel([])
    const apply = host.querySelector('[data-bulk-apply]')

    expect(apply instanceof HTMLButtonElement ? apply.disabled : null).toBe(true)
  })
})
