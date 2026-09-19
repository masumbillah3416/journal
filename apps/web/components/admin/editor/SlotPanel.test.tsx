/**
 * SlotPanel.test.tsx — SCREENS.md §2.3's photo slots: the crop each cell draws,
 * the key it is held under, the pill, the badge and what every control posts.
 *
 * ═══ THE RECT IS STUBBED, AND IT HAS TO BE ═══
 *
 * jsdom lays nothing out: `getBoundingClientRect()` answers zeros for every
 * element, and `focalPointFrom`'s zero-size guard then answers `{0, 0}` for any
 * click. So each case that clicks a cell STATES the box it is clicking in, and
 * the numbers are what a browser would report for an element of that size at
 * that position — the same shape `Element.getBoundingClientRect()` returns.
 * Without the stub every focal case would pass against `0% 0%` and prove
 * nothing, which is the species these standing orders exist to stop.
 *
 * WHAT THE ASSERTIONS READ: the `style` attribute React wrote, and the
 * `FormData` the spy was handed. Neither is a literal this file also gave the
 * component — the first is the component's own composition of two numbers into
 * `background-position`, and the second is what the action would really receive.
 *
 * Depends on: react, react-dom/client, vitest (jsdom),
 * @travel-diary/domain/ids, `EditorSlot` (../../../lib/admin/readJourneyEditor),
 * ./SlotPanel.
 */
import { journeyId, slotKey, mediaId, type JourneyId, type MediaId, type SlotKey } from '@travel-diary/domain/ids'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { EditorSlot } from '../../../lib/admin/readJourneyEditor'
import { SlotPanel } from './SlotPanel'

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
 * A branded media id.
 * @param raw - The id as Postgres would spell it.
 * @returns The branded id.
 */
const aMedia = (raw: string): MediaId => {
  const built = mediaId(raw)
  if (!built.ok) throw new Error(built.error)
  return built.value
}

/**
 * One cell, in the shape `readJourneyEditor` answers.
 * @param key - The cell's `${page}:${cell}` identity.
 * @param overrides - What this case cares about.
 * @returns A complete {@link EditorSlot}.
 */
const aSlot = (key: string, overrides: Partial<EditorSlot> = {}): EditorSlot => ({
  key: aKey(key),
  cell: 0,
  role: 'frame',
  label: 'Frame 1',
  media: aMedia('11'),
  previewSrc: '/api/media/file/frame-1400x1050.png',
  caption: 'Alfama, from a step',
  alt: 'A tiled stair',
  focal: { x: 50, y: 50 },
  loops: false,
  ...overrides,
})

/** A stand-in for one of the three server actions, typed as the action is. */
type ActionSpy = Mock<(form: FormData) => Promise<void>>

/** The actions each render is handed, so a case can read what was posted. */
interface Spies {
  /** Writes a cell's focal point. */
  readonly setFocal: ActionSpy
  /** Writes a cell's caption and alt text. */
  readonly setText: ActionSpy
  /** Empties a cell. */
  readonly clear: ActionSpy
}

/**
 * One action spy.
 * @returns A mock with the action's own signature, so what it was handed is
 *   `FormData` rather than `any`.
 */
const anAction = (): ActionSpy => vi.fn<(form: FormData) => Promise<void>>(() => Promise.resolve())

/**
 * Renders the panel and hands back the host element and the spies.
 * @param slots - The cells to draw.
 * @param targeted - The cell `?slot=` names, where a case cares.
 * @returns The host element and the three action spies.
 */
const renderPanel = (
  slots: readonly EditorSlot[],
  targeted: SlotKey | null = null,
): { readonly host: HTMLElement } & Spies => {
  const spies: Spies = { setFocal: anAction(), setText: anAction(), clear: anAction() }
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(
      <SlotPanel
        journey={aJourney('42')}
        slots={slots}
        editorHref="/admin/journeys/42?page=7"
        targeted={targeted}
        shape="grid"
        setFocal={spies.setFocal}
        setText={spies.setText}
        clear={spies.clear}
      />,
    )
  })
  return { host, ...spies }
}

/**
 * The clickable image of one cell, with the box a browser would have measured.
 *
 * SEE THIS FILE'S HEADER: jsdom lays nothing out, so the box is stated here
 * rather than measured, and the values are what `getBoundingClientRect()`
 * returns for an element of that size at that position.
 * @param host - The rendered host.
 * @param key - Which cell.
 * @param box - The rect to report.
 * @returns The element.
 */
const cellOf = (
  host: HTMLElement,
  key: string,
  box: { left: number; top: number; width: number; height: number } = {
    left: 100,
    top: 50,
    width: 200,
    height: 152,
  },
): HTMLElement => {
  const found = host.querySelector(`[data-focal-target="${key}"]`)
  if (!(found instanceof HTMLElement)) throw new Error(`no cell ${key}`)
  found.getBoundingClientRect = (): DOMRect => ({
    left: box.left,
    top: box.top,
    width: box.width,
    height: box.height,
    right: box.left + box.width,
    bottom: box.top + box.height,
    x: box.left,
    y: box.top,
    toJSON: () => ({}),
  })
  return found
}

/**
 * Clicks a cell at a point in the viewport.
 * @param cell - The element, already given its box.
 * @param at - Where the pointer was.
 */
const clickAt = (cell: HTMLElement, at: { clientX: number; clientY: number }): void => {
  act(() => {
    cell.dispatchEvent(new MouseEvent('click', { bubbles: true, ...at }))
  })
}

/**
 * The `background-position` a cell is drawn at, read off the attribute React
 * wrote rather than off the component's own state.
 * @param host - The rendered host.
 * @param key - Which cell.
 * @returns The declaration's value, trimmed.
 */
const cropOf = (host: HTMLElement, key: string): string | undefined =>
  host
    .querySelector(`[data-focal-target="${key}"]`)
    ?.getAttribute('style')
    ?.match(/background-position:\s*([^;]+)/u)?.[1]
    ?.trim()

/**
 * Types into a controlled input the way a person does.
 *
 * THROUGH THE PROTOTYPE'S OWN SETTER, which is not ceremony: React keeps a
 * value tracker on every controlled input and skips the change event when the
 * element's value already matches what it last wrote. Assigning `.value`
 * directly updates the tracker too, so the `input` event that follows is
 * discarded and `onChange` never runs — measured here: the case below passed
 * against the DATABASE's caption while asserting the author's.
 * @param field - The input.
 * @param value - What was typed.
 */
const type = (field: HTMLInputElement, value: string): void => {
  // Bound where it is taken, not later: an unbound prototype setter is a
  // method separated from its receiver, which is what `unbound-method` reports
  // and what would silently write to the prototype if it were ever called bare.
  const write = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.bind(field)
  if (write === undefined) throw new Error('HTMLInputElement has no value setter')
  act(() => {
    write(value)
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount()
    })
  }
  document.body.innerHTML = ''
})

describe('SlotPanel', () => {
  it('keeps two pages’ focal points apart, which is the defect SCREENS.md names by journey and page', () => {
    const { host } = renderPanel([
      aSlot('frames-i:0', { focal: { x: 20, y: 30 } }),
      aSlot('frames-ii:0', { focal: { x: 70, y: 80 } }),
    ])

    const positions = [...host.querySelectorAll('[data-focal-target]')].map((node) =>
      node
        .getAttribute('style')
        ?.match(/background-position:\s*([^;]+)/u)?.[1]
        ?.trim(),
    )
    expect(new Set(positions).size).toBe(2)
  })

  it('moves only the cell that was clicked, which a map keyed on the cell alone could not', () => {
    // THE CASE ABOVE PASSES AGAINST PROPS ALONE — both cells start at
    // different stored values, so a panel with no state at all satisfies it.
    // This is the half that needs the key: one click, two cells of DIFFERENT
    // pages at the SAME cell index, and the other must not move.
    const { host } = renderPanel([aSlot('7:0', { focal: { x: 20, y: 30 } }), aSlot('9:0', { focal: { x: 20, y: 30 } })])

    clickAt(cellOf(host, '7:0'), { clientX: 150, clientY: 126 })

    expect(cropOf(host, '7:0')).toBe('25% 50%')
    expect(cropOf(host, '9:0')).toBe('20% 30%')
  })

  it('turns a click into SCREENS.md’s own formula, measured against the element’s box', () => {
    const { host } = renderPanel([aSlot('7:0')])

    clickAt(cellOf(host, '7:0', { left: 100, top: 50, width: 100, height: 100 }), { clientX: 150, clientY: 100 })

    expect(cropOf(host, '7:0')).toBe('50% 50%')
  })

  it('posts the cell’s own key and the point, which is what the action parses', () => {
    const { host, setFocal } = renderPanel([aSlot('7:2')])

    clickAt(cellOf(host, '7:2', { left: 0, top: 0, width: 100, height: 100 }), { clientX: 12, clientY: 87 })

    const posted = setFocal.mock.calls[0]?.[0]
    expect(posted).toBeInstanceOf(FormData)
    expect([...(posted ?? new FormData()).entries()]).toEqual([
      ['journey', '42'],
      ['slot', '7:2'],
      ['focalX', '12'],
      ['focalY', '87'],
    ])
  })

  it('saves the number the pill printed, not the raw division behind it', () => {
    // SLOT-002 (`docs/qa/2026-09-20-journey-slots-sweep.md`). A click that
    // divides unevenly gave the column `24.836806920959496` while the pill read
    // "focus 25% 80%" — the same pixel on screen, and a number the author was
    // never shown. 199 is a width a `1fr` track really produced in that sweep.
    const { host, setFocal } = renderPanel([aSlot('7:0')])

    clickAt(cellOf(host, '7:0', { left: 0, top: 0, width: 199, height: 152 }), { clientX: 49, clientY: 121 })

    // A `FormDataEntryValue` is `string | File`, and `File` has no useful
    // stringification — so each half is narrowed rather than interpolated.
    const posted = setFocal.mock.calls[0]?.[0] ?? new FormData()
    const said = (field: string): string => {
      const value = posted.get(field)
      return typeof value === 'string' ? value : 'not a string'
    }

    expect(host.querySelector('[data-focal-pill]')?.textContent).toBe(`focus ${said('focalX')}% ${said('focalY')}%`)
  })

  it('draws the reticle where the point is, so the author can see what they aimed at', () => {
    const { host } = renderPanel([aSlot('7:0', { focal: { x: 25, y: 30 } })])

    const reticle = host.querySelector('[data-focal-reticle]')
    expect(reticle?.getAttribute('style')).toContain('left: 25%')
    expect(reticle?.getAttribute('style')).toContain('top: 30%')
  })

  it('reads the pill as centred for a cell nobody has clicked, which is the column’s own default', () => {
    const { host } = renderPanel([aSlot('7:0', { focal: { x: 50, y: 50 } })])

    expect(host.querySelector('[data-focal-pill]')?.textContent).toBe('centred — click to focus')
  })

  it('reads the pill back, rounded, once the crop has been moved', () => {
    const { host } = renderPanel([aSlot('7:0')])

    clickAt(cellOf(host, '7:0', { left: 0, top: 0, width: 1000, height: 1000 }), { clientX: 254, clientY: 296 })

    expect(host.querySelector('[data-focal-pill]')?.textContent).toBe('focus 25% 30%')
  })

  it('badges a clip as looping and a still as not, which is §2.3’s motion badge', () => {
    const { host } = renderPanel([aSlot('7:0', { loops: true }), aSlot('7:1', { loops: false })])

    expect([...host.querySelectorAll('[data-slot-motion]')].map((badge) => badge.textContent)).toEqual([
      'Loops',
      'Still',
    ])
  })

  it('draws an empty cell as a box with nothing to aim at, rather than a crosshair over nothing', () => {
    const { host } = renderPanel([aSlot('7:0', { media: null, previewSrc: null })])

    const cell = host.querySelector('[data-focal-target]')
    expect(cell?.hasAttribute('data-empty')).toBe(true)
    expect(cell?.hasAttribute('disabled')).toBe(true)
  })

  it('points Replace at this cell, which is how the pool learns which frame to fill', () => {
    const { host } = renderPanel([aSlot('7:2')])

    expect(host.querySelector('[data-slot-replace]')?.getAttribute('href')).toBe('/admin/journeys/42?page=7&slot=7:2')
  })

  it('marks the cell the address names, so an author can see which Replace they pressed', () => {
    const { host } = renderPanel([aSlot('7:0'), aSlot('7:1')], aKey('7:1'))

    const marked = [...host.querySelectorAll('[data-targeted]')].map((cell) => cell.getAttribute('data-slot'))
    expect(marked).toEqual(['7:1'])
  })

  it('posts the cell’s key when Clear is pressed, and nothing else', () => {
    const { host, clear } = renderPanel([aSlot('7:2')])

    act(() => {
      host.querySelector<HTMLButtonElement>('[data-slot-clear]')?.click()
    })

    expect([...(clear.mock.calls[0]?.[0] ?? new FormData()).entries()]).toEqual([
      ['journey', '42'],
      ['slot', '7:2'],
    ])
  })

  it('offers no Clear on a cell that is already empty', () => {
    const { host } = renderPanel([aSlot('7:0', { media: null, previewSrc: null })])

    expect(host.querySelector('[data-slot-clear]')?.hasAttribute('disabled')).toBe(true)
  })

  it('posts what the author typed into the caption and alt fields, not what the database held', () => {
    const { host, setText } = renderPanel([aSlot('7:2')])

    const caption = host.querySelector<HTMLInputElement>('[data-slot-caption]')
    if (caption === null) throw new Error('no caption field')
    type(caption, 'The bridge, from below')
    act(() => {
      host.querySelector<HTMLButtonElement>('[data-slot-save-words]')?.click()
    })

    expect([...(setText.mock.calls[0]?.[0] ?? new FormData()).entries()]).toEqual([
      ['journey', '42'],
      ['slot', '7:2'],
      ['caption', 'The bridge, from below'],
      ['alt', 'A tiled stair'],
    ])
  })

  it('carries no form element of its own, because the Notes pane draws it inside one', () => {
    // A `<form>` inside a `<form>` is invalid HTML that browsers resolve by
    // dropping the inner one, so a Clear button there would have posted the
    // whole Notes pane. Measured on the rendered DOM rather than argued for in
    // a header.
    const { host } = renderPanel([aSlot('7:0')])

    expect(host.querySelectorAll('form')).toHaveLength(0)
    expect([...host.querySelectorAll('button')].every((button) => button.getAttribute('type') === 'button')).toBe(true)
  })
})
