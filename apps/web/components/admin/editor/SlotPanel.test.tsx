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
 * Mounts the panel into ONE root and hands back a re-render, so a case can
 * give the SAME component instance the server's next answer — which is what
 * `revalidatePath` does to this island: same route, same position, new props.
 * @param slots - The cells to draw.
 * @returns The host, the spies, and a re-render.
 */
const mountPanel = (
  slots: readonly EditorSlot[],
): { readonly host: HTMLElement; readonly again: (next: readonly EditorSlot[]) => void } & Spies => {
  const spies: Spies = { setFocal: anAction(), setText: anAction(), clear: anAction() }
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  const draw = (next: readonly EditorSlot[]): void => {
    act(() => {
      root.render(
        <SlotPanel
          journey={aJourney('42')}
          slots={next}
          editorHref="/admin/journeys/42?page=7"
          targeted={null}
          shape="grid"
          setFocal={spies.setFocal}
          setText={spies.setText}
          clear={spies.clear}
        />,
      )
    })
  }
  draw(slots)
  return { host, again: draw, ...spies }
}

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
    // `detail: 1` IS PART OF THE FIXTURE, not decoration. A click from a
    // POINTER carries its click count; a click synthesised by Enter or Space
    // on a `<button>` carries `detail: 0` and no coordinates at all. Every
    // case here meant the first, and `MouseEvent`'s default for `detail` is
    // 0 — so before this was written down, every focal case in this file was
    // dispatching the keyboard's shape while describing the mouse's.
    cell.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1, ...at }))
  })
}

/**
 * Activates a cell the way a keyboard does: a click with no pointer behind it.
 *
 * WHAT A BROWSER REALLY SENDS. Enter or Space on a focused `<button>`
 * dispatches a `click` whose `clientX`/`clientY` are 0 — the element is not
 * where the pointer is, because there is no pointer — and whose `detail` is 0,
 * which is the signal that says so.
 * @param cell - The element, already given its box.
 */
const pressEnterOn = (cell: HTMLElement): void => {
  act(() => {
    cell.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }))
  })
}

/**
 * Presses a key on a cell.
 * @param cell - The element.
 * @param key - The `KeyboardEvent.key` value.
 * @param phase - Which half of the press.
 */
const pressKey = (cell: HTMLElement, key: string, phase: 'keydown' | 'keyup' = 'keydown'): void => {
  act(() => {
    cell.dispatchEvent(new KeyboardEvent(phase, { bubbles: true, cancelable: true, key }))
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

/**
 * What a spy was handed for one field of the first call it took.
 *
 * A `FormDataEntryValue` is `string | File`, and `File` has no useful
 * stringification — so the value is narrowed rather than interpolated.
 * @param spy - The action spy.
 * @param field - The field name.
 * @returns The posted value.
 */
const said = (spy: ActionSpy, field: string): string => {
  const value = (spy.mock.calls[0]?.[0] ?? new FormData()).get(field)
  return typeof value === 'string' ? value : 'not a string'
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

    expect(host.querySelector('[data-focal-pill]')?.textContent).toBe(
      `focus ${said(setFocal, 'focalX')}% ${said(setFocal, 'focalY')}%`,
    )
  })

  it('does not throw the crop to the top-left corner when the button is reached by a keyboard', () => {
    // LANDED FROM THE TASK 7 REVIEW'S PROBE (H1), wording kept. Enter or Space
    // on a `<button>` fires a click whose `clientX`/`clientY` are 0 — the
    // element is not where the pointer is, because there is no pointer.
    // `focalPointFrom` read `0 − rect.left` as a drag that left the box and
    // clamped it to `{0, 0}`, so the cell was re-cropped to its own top-left
    // corner and the write was posted. Nothing refused it: `0` is inside the
    // parse's `[0, 100]`.
    //
    // OBSERVED BEFORE THE FIX: POSTED [["journey","42"],["slot","7:0"],
    // ["focalX","0"],["focalY","0"]] CROP 0% 0%
    const { host, setFocal } = renderPanel([aSlot('7:0', { focal: { x: 22, y: 78 } })])

    pressEnterOn(cellOf(host, '7:0'))

    expect(setFocal).not.toHaveBeenCalled()
    expect(cropOf(host, '7:0')).toBe('22% 78%')
  })

  it('moves the crop by one percent per arrow press, so the control is reachable without a mouse', () => {
    // THE OTHER HALF OF H1. Ignoring the keyboard activation stops the
    // destruction and leaves the control keyboard-INERT, which is a smaller
    // defect and still one: §2.3's control has to be operable. The arrows nudge
    // through the same clamp the click uses.
    const { host } = renderPanel([aSlot('7:0', { focal: { x: 22, y: 78 } })])
    const cell = cellOf(host, '7:0')

    pressKey(cell, 'ArrowRight')
    pressKey(cell, 'ArrowUp')

    expect(cropOf(host, '7:0')).toBe('23% 77%')
    expect(host.querySelector('[data-focal-pill]')?.textContent).toBe('focus 23% 77%')
  })

  it('writes the nudged point once the key is released, not once per repeat', () => {
    // AUTO-REPEAT IS WHY THE WRITE IS ON `keyup`. A held arrow fires `keydown`
    // as fast as the platform repeats it, and every write here mints a version
    // row on a versioned collection (`pageMutations.ts`'s header). One physical
    // press is one write, whatever the repeat rate.
    const { host, setFocal } = renderPanel([aSlot('7:0', { focal: { x: 22, y: 78 } })])
    const cell = cellOf(host, '7:0')

    pressKey(cell, 'ArrowRight')
    pressKey(cell, 'ArrowRight')
    pressKey(cell, 'ArrowRight')
    expect(setFocal).not.toHaveBeenCalled()

    pressKey(cell, 'ArrowRight', 'keyup')

    expect(setFocal).toHaveBeenCalledTimes(1)
    expect(said(setFocal, 'focalX')).toBe('25')
  })

  it('ignores a key that is not an arrow, and releases nothing it never moved', () => {
    const { host, setFocal } = renderPanel([aSlot('7:0', { focal: { x: 22, y: 78 } })])
    const cell = cellOf(host, '7:0')

    pressKey(cell, 'a')
    pressKey(cell, 'ArrowRight', 'keyup')

    expect(setFocal).not.toHaveBeenCalled()
    expect(cropOf(host, '7:0')).toBe('22% 78%')
  })

  it('shows the cell the server’s own focal point after the server re-centred it', () => {
    // LANDED FROM THE TASK 7 REVIEW'S PROBE (M1), wording kept. Two of this
    // task's own writes re-centre the cell ON THE SERVER — `setSlotMediaRow`
    // ("a crop chosen for the last photograph is not kept for this one") and
    // `clearSlotRow` — and both then `revalidatePath`, which re-renders this
    // island IN PLACE. An overlay that is never invalidated keeps drawing the
    // point the author last clicked while the database, `readBookBundle` and
    // the reader all hold the centre.
    const { host, again } = mountPanel([aSlot('7:0', { focal: { x: 50, y: 50 } })])

    clickAt(cellOf(host, '7:0'), { clientX: 150, clientY: 126 })
    expect(cropOf(host, '7:0')).toBe('25% 50%')

    again([aSlot('7:0', { focal: { x: 50, y: 50 }, media: aMedia('12'), previewSrc: '/api/media/file/another.png' })])

    expect(cropOf(host, '7:0')).toBe('50% 50%')
    expect(host.querySelector('[data-focal-pill]')?.textContent).toBe('centred — click to focus')
  })

  it('keeps a pending edit across a re-render the server did not change the cell in', () => {
    // THE OTHER SIDE, and the reason the overlay exists at all: a re-render
    // that carries the SAME stored point must not throw away what the author
    // just aimed at while the write is still in flight. An overlay dropped on
    // every render would make the crop jump back under the pointer.
    const { host, again } = mountPanel([aSlot('7:0', { focal: { x: 50, y: 50 } })])

    clickAt(cellOf(host, '7:0'), { clientX: 150, clientY: 126 })
    again([aSlot('7:0', { focal: { x: 50, y: 50 }, caption: 'a caption the author saved meanwhile' })])

    expect(cropOf(host, '7:0')).toBe('25% 50%')
  })

  it('does not revive a dropped crop when the same photograph is placed again', () => {
    // LANDED FROM THE FIX-REVIEW PROBE (F1), wording kept. Crop the cell, let
    // the server answer, then press Replace and tick THE SAME photograph —
    // which the pool allows, because every tile is enabled once a cell is
    // targeted. `setSlotMediaRow` writes `{ media, focalX: 50, focalY: 50 }`
    // whatever was there, so the server's answer returns to the exact
    // `{ focal: 50/50, media: 11 }` the pending edit was made over. A rule
    // RE-EVALUATED each render lets the dropped edit become valid again.
    const { host, again } = mountPanel([aSlot('7:0', { focal: { x: 50, y: 50 } })])

    clickAt(cellOf(host, '7:0'), { clientX: 150, clientY: 126 })
    expect(cropOf(host, '7:0')).toBe('25% 50%')

    // The focal write lands: the server now holds 25/50.
    again([aSlot('7:0', { focal: { x: 25, y: 50 } })])
    expect(cropOf(host, '7:0')).toBe('25% 50%')

    // Replace, then tick the same photograph. The server re-centres it.
    again([aSlot('7:0', { focal: { x: 50, y: 50 } })])

    expect(cropOf(host, '7:0')).toBe('50% 50%')
    expect(host.querySelector('[data-focal-pill]')?.textContent).toBe('centred — click to focus')
  })

  it('does not revive a dropped crop when the original photograph is placed back', () => {
    // The A → B → A walk, all of it through the pool: crop A, replace with B
    // (which the landed M1 case already covers), then replace B with A again.
    // The dropped edit's snapshot matches once more.
    const { host, again } = mountPanel([aSlot('7:0', { focal: { x: 50, y: 50 }, media: aMedia('11') })])

    clickAt(cellOf(host, '7:0'), { clientX: 150, clientY: 126 })
    expect(cropOf(host, '7:0')).toBe('25% 50%')

    again([aSlot('7:0', { focal: { x: 50, y: 50 }, media: aMedia('12') })])
    expect(cropOf(host, '7:0')).toBe('50% 50%')

    again([aSlot('7:0', { focal: { x: 50, y: 50 }, media: aMedia('11') })])

    expect(cropOf(host, '7:0')).toBe('50% 50%')
  })

  it('drops only the cell the server moved, and leaves the other author’s edit alone', () => {
    // THE SENTINEL ON THE DELETION. An invalidation that emptied the whole
    // overlay would satisfy both cases above while throwing away a pending
    // edit on a cell nobody touched — which is the M1 fix's own failure mode
    // reversed, and exactly what an author cropping two frames in a row would
    // meet.
    const { host, again } = mountPanel([
      aSlot('7:0', { focal: { x: 50, y: 50 } }),
      aSlot('7:1', { focal: { x: 50, y: 50 }, label: 'Frame 2', cell: 1 }),
    ])

    clickAt(cellOf(host, '7:0'), { clientX: 150, clientY: 126 })
    clickAt(cellOf(host, '7:1'), { clientX: 150, clientY: 126 })
    expect([cropOf(host, '7:0'), cropOf(host, '7:1')]).toEqual(['25% 50%', '25% 50%'])

    // The server answers for the FIRST cell only: a different photograph in it.
    again([
      aSlot('7:0', { focal: { x: 50, y: 50 }, media: aMedia('12') }),
      aSlot('7:1', { focal: { x: 50, y: 50 }, label: 'Frame 2', cell: 1 }),
    ])

    expect([cropOf(host, '7:0'), cropOf(host, '7:1')]).toEqual(['50% 50%', '25% 50%'])
  })

  it('keeps every arrow press when two land in one React batch', () => {
    // LANDED FROM THE FIX-REVIEW PROBE (F2). `nudge` computed its input from
    // the value of the LAST COMMITTED RENDER rather than from the pending
    // state, so two presses dispatched inside one `act` — which is what
    // auto-repeat looks like when React batches — moved the crop one step.
    //
    // THE CASE BESIDE IT MODELLED THE ASSUMPTION. `writes the nudged point
    // once the key is released…` wraps each press in its own `act()`, i.e. in
    // its own flushed render, which is the thing the handler was built on
    // rather than a fact about it. Same species as the `detail: 0` fixture.
    const { host } = renderPanel([aSlot('7:0', { focal: { x: 22, y: 78 } })])
    const cell = cellOf(host, '7:0')

    act(() => {
      cell.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'ArrowRight' }))
      cell.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'ArrowRight' }))
    })

    expect(cropOf(host, '7:0')).toBe('24% 78%')
  })

  it('drops a half-typed caption once the server has emptied the cell under it', () => {
    // THE SAME CLASS AS THE FOCAL OVERLAY, one field along: `clearSlotRow`
    // blanks the caption and the alt text as well as re-centring, so a words
    // overlay that only ever grew would keep offering the author text the
    // database no longer holds — and "Save words" would write it back.
    const { host, again } = mountPanel([aSlot('7:0', { caption: 'Alfama, from a step' })])

    const field = host.querySelector<HTMLInputElement>('[data-slot-caption]')
    if (field === null) throw new Error('no caption field')
    type(field, 'Alfama, from a step I sat on')

    again([aSlot('7:0', { media: null, previewSrc: null, caption: '', alt: '' })])

    expect(host.querySelector<HTMLInputElement>('[data-slot-caption]')?.value).toBe('')
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
