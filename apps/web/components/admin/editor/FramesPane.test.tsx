/**
 * FramesPane.test.tsx — SCREENS.md §2.3's editing pane for a Frames page: the
 * eyebrow over the page's name, and the cells it hands to `SlotPanel`.
 *
 * WHAT THIS FILE IS FOR, given `SlotPanel.test.tsx` next door: the pane's own
 * job is the header and the SHAPE the cells are drawn in. `SlotPanel` is
 * tested on what a cell does; this is tested on what the pane is, including
 * the two things it deliberately does NOT draw.
 *
 * Depends on: react, react-dom/client, vitest (jsdom),
 * @travel-diary/domain/ids, `EditorSlot` (../../../lib/admin/readJourneyEditor),
 * ./FramesPane.
 */
import { journeyId, mediaId, slotKey, type JourneyId, type SlotKey } from '@travel-diary/domain/ids'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import type { EditorSlot } from '../../../lib/admin/readJourneyEditor'
import { FramesPane } from './FramesPane'

const roots: Root[] = []

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
 * @param raw - The key as `slotKeyFor` composes it.
 * @returns The branded key.
 */
const aKey = (raw: string): SlotKey => {
  const built = slotKey(raw)
  if (!built.ok) throw new Error(built.error)
  return built.value
}

/**
 * One cell of a frames page, in the shape `readJourneyEditor` answers.
 * @param cell - Which cell of page 7.
 * @returns A complete {@link EditorSlot}.
 */
const aFrame = (cell: number): EditorSlot => {
  const media = mediaId(String(cell + 11))
  if (!media.ok) throw new Error(media.error)
  return {
    key: aKey(`7:${String(cell)}`),
    cell,
    role: 'frame',
    label: `Frame ${String(cell + 1)}`,
    media: media.value,
    previewSrc: `/api/media/file/frame-${String(cell)}-1400x1050.png`,
    caption: '',
    alt: '',
    focal: { x: 50, y: 50 },
    loops: false,
  }
}

/** What nothing in these cases does: no control here is ever pressed. */
const noAction = (): Promise<void> => Promise.resolve()

/**
 * Renders the pane and hands back the host element.
 * @param slots - The page's cells.
 * @returns The host element.
 */
const renderPane = (slots: readonly EditorSlot[]): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(
      <FramesPane
        journey={aJourney('42')}
        title="Frames I"
        slots={slots}
        editorHref="/admin/journeys/42?page=7"
        targeted={null}
        setFocal={noAction}
        setText={noAction}
        clear={noAction}
      />,
    )
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

describe('FramesPane', () => {
  it('prints the page’s name under §2.3’s Editing eyebrow', () => {
    const host = renderPane([aFrame(0)])

    expect(host.querySelector('[data-editing-pane] h2')?.textContent).toBe('Frames I')
  })

  it('draws one cell per slot it is given, in cell order', () => {
    const host = renderPane([aFrame(0), aFrame(1), aFrame(2), aFrame(3)])

    expect([...host.querySelectorAll('[data-slot]')].map((cell) => cell.getAttribute('data-slot'))).toEqual([
      '7:0',
      '7:1',
      '7:2',
      '7:3',
    ])
  })

  it('draws the cells in §2.3’s frames shape, not the Notes column’s', () => {
    // The two panes hand `SlotPanel` different shapes — `repeat(auto-fit,
    // minmax(196px, 1fr))` here, a stacked column in the Notes pane — and the
    // shape is the pane's own decision rather than the panel's.
    const host = renderPane([aFrame(0)])

    expect(host.querySelector('[data-slot-panel]')?.getAttribute('data-slot-panel')).toBe('grid')
  })

  it('draws no Save draft, because a frames page has no journey-level field to save', () => {
    // // HANDOFF-DEVIATION, asserted rather than only written down: §2.3's pane
    // header lists it, the Notes pane draws it because that whole pane is one
    // form, and here it would be a button with nothing behind it. Each cell's
    // controls write on their own.
    const host = renderPane([aFrame(0)])

    expect(host.querySelector('[data-save-notes]')).toBeNull()
  })

  it('is not itself a form, so nothing inside it can submit a page of fields', () => {
    const host = renderPane([aFrame(0)])

    expect(host.querySelectorAll('form')).toHaveLength(0)
  })

  it('draws a pane with no cells rather than throwing, which a page with no slots really is', () => {
    const host = renderPane([])

    expect(host.querySelector('[data-editing-pane]')).not.toBeNull()
    expect(host.querySelectorAll('[data-slot]')).toHaveLength(0)
  })
})
