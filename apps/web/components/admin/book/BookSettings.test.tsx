/**
 * BookSettings.test.tsx — SCREENS.md §2.6's Book settings card, and the one
 * sentence §2.6 states outright: "Both sliders are controlled and their
 * readouts follow the value."
 *
 * ═══ THE SLIDER CASES CHANGE THE INPUT AND READ THE LABEL ═══
 *
 * Which is the only way an uncontrolled slider fails. A case that rendered the
 * card and read the label would pass against a `defaultValue` input and a label
 * printed from the prop, and that is exactly the defect "controlled" excludes.
 *
 * ═══ THE RANGES ARE READ OFF THE CONSTANTS, NOT TYPED HERE ═══
 *
 * `FLIP_DURATION_MS` and `GALLERY_THUMB_SIZE` are the same constants
 * `apps/web/globals/book.schema.test.ts` compares the columns against, so a
 * track an author can drag to and a value the column refuses cannot come apart.
 * The two STEPS are typed as literals on purpose: they are SCREENS.md §2.6's
 * own numbers and nothing else in the repository holds them, so an assertion
 * that read them from the component could never fail.
 *
 * WHAT THIS FILE DOES NOT PROVE: the 44px swatches and the terracotta selected
 * ring are declared in `book.module.css`, and jsdom performs no layout.
 *
 * Depends on: react, react-dom/client, vitest (jsdom),
 * @travel-diary/domain/bookBundle, @travel-diary/domain/flip,
 * @travel-diary/domain/gallery, @travel-diary/tokens/colour, ./BookSettings.
 */
import { JOURNEY_ORDER_MODES } from '@travel-diary/domain/bookBundle'
import { FLIP_DURATION_MS } from '@travel-diary/domain/flip'
import { GALLERY_THUMB_SIZE } from '@travel-diary/domain/gallery'
import { coverCloths } from '@travel-diary/tokens/colour'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BookSettings as Settings } from '../../../lib/admin/bookMutations'
import { BookSettings } from './BookSettings'

const roots: Root[] = []

/** The settings the seeded book has, so a fixture reads like a book. */
const SEEDED: Settings = {
  contentsNote: 'Each journey runs three pages.',
  journeyOrderMode: 'manual',
  coverCloth: '#2f4a47',
  flipDurationMs: 800,
  galleryThumbPx: 200,
  showDecorations: true,
  showRibbon: true,
  showCounter: true,
}

/**
 * Renders the card and hands back the host element.
 * @param overrides - Settings to override on the fixture.
 * @param save - The write the card dispatches.
 * @returns The host element.
 */
const renderCard = (overrides: Partial<Settings> = {}, save = vi.fn()): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(<BookSettings settings={{ ...SEEDED, ...overrides }} save={save} />)
  })
  return host
}

/**
 * The one element a selector matches.
 * @param host - Where to look.
 * @param selector - What to look for.
 * @returns The element.
 */
const one = (host: HTMLElement, selector: string): HTMLElement => {
  const found = host.querySelector<HTMLElement>(selector)
  if (found === null) throw new Error(`nothing matched ${selector}`)
  return found
}

/**
 * The prototype's own `value` setter, which is what a real keystroke goes
 * through.
 *
 * `CodeStep.test.tsx`'s idiom and its reason: React keeps a value tracker on
 * every controlled input, and assigning `input.value` goes through React's own
 * setter, which updates that tracker — so React then sees no change and never
 * calls `onChange`. Writing through the PROTOTYPE's setter leaves the tracker
 * holding the previous value, which is what a keystroke does.
 */
// eslint-disable-next-line @typescript-eslint/unbound-method -- capturing the prototype's setter is the point: it is re-invoked below with `.call(...)`, which is the receiver the rule exists to protect.
const setInputValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set

// eslint-disable-next-line @typescript-eslint/unbound-method -- capturing the prototype's setter is the point: it is re-invoked below with `.call(...)`, which is the receiver the rule exists to protect.
const setTextAreaValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set

/**
 * Sets a range input's value the way a drag does, so React's state follows.
 * @param input - The slider.
 * @param value - Where it was dragged to.
 */
const drag = (input: HTMLElement, value: number): void => {
  if (setInputValue === undefined) throw new Error('this environment has no HTMLInputElement value setter')
  act(() => {
    setInputValue.call(input, String(value))
    input.dispatchEvent(new Event('input', { bubbles: true }))
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

describe('BookSettings — the two sliders', () => {
  it('offers the page turn over exactly the range the column admits', () => {
    const slider = one(renderCard(), '[data-flip-slider]')

    expect([slider.getAttribute('min'), slider.getAttribute('max'), slider.getAttribute('step')]).toEqual([
      String(FLIP_DURATION_MS.min),
      String(FLIP_DURATION_MS.max),
      '50',
    ])
  })

  it('offers the gallery thumbnail over exactly the range the public gallery clamps to', () => {
    const slider = one(renderCard(), '[data-thumb-slider]')

    expect([slider.getAttribute('min'), slider.getAttribute('max'), slider.getAttribute('step')]).toEqual([
      String(GALLERY_THUMB_SIZE.min),
      String(GALLERY_THUMB_SIZE.max),
      '10',
    ])
  })

  it('moves the page-turn readout when the slider moves, which is what "controlled" means', () => {
    const host = renderCard()

    drag(one(host, '[data-flip-slider]'), 1250)

    expect(one(host, '[data-flip-readout]').textContent).toBe('1250 ms')
  })

  it('moves the gallery-thumbnail readout when its slider moves', () => {
    const host = renderCard()

    drag(one(host, '[data-thumb-slider]'), 260)

    expect(one(host, '[data-thumb-readout]').textContent).toBe('260 px')
  })

  it('saves the value the slider was dragged to, not the value it was rendered with', () => {
    // THE OTHER HALF OF "CONTROLLED". A readout that followed the drag while the
    // save posted the prop would look right and write the wrong number.
    const save = vi.fn()
    const host = renderCard({}, save)

    drag(one(host, '[data-flip-slider]'), FLIP_DURATION_MS.max)
    act(() => {
      one(host, '[data-save-settings]').click()
    })

    expect(save.mock.calls[0]?.[0]).toMatchObject({ flipDurationMs: FLIP_DURATION_MS.max })
  })
})

describe('BookSettings — the rest of the card', () => {
  it('offers a chip per journey order the book knows, and presses the one in force', () => {
    const host = renderCard({ journeyOrderMode: 'oldest' })
    const pressed = JOURNEY_ORDER_MODES.filter(
      (mode) => host.querySelector(`[data-order-mode="${mode}"]`)?.getAttribute('aria-pressed') === 'true',
    )

    expect({ chips: host.querySelectorAll('[data-order-mode]').length, pressed }).toEqual({
      chips: JOURNEY_ORDER_MODES.length,
      pressed: ['oldest'],
    })
  })

  it('offers the four cover cloths and presses the one the book wears', () => {
    const host = renderCard({ coverCloth: '#7a3b32' })
    const pressed = coverCloths.filter(
      (cloth) => host.querySelector(`[data-cloth="${cloth}"]`)?.getAttribute('aria-pressed') === 'true',
    )

    expect({ swatches: host.querySelectorAll('[data-cloth]').length, pressed }).toEqual({
      swatches: coverCloths.length,
      pressed: ['#7a3b32'],
    })
  })

  it('saves the cloth a swatch was pressed for', () => {
    const save = vi.fn()
    const host = renderCard({}, save)

    act(() => {
      one(host, '[data-cloth="#5c4a2b"]').click()
    })
    act(() => {
      one(host, '[data-save-settings]').click()
    })

    expect(save.mock.calls[0]?.[0]).toMatchObject({ coverCloth: '#5c4a2b' })
  })

  it('saves the journey order a chip was pressed for', () => {
    const save = vi.fn()
    const host = renderCard({}, save)

    act(() => {
      one(host, '[data-order-mode="newest"]').click()
    })
    act(() => {
      one(host, '[data-save-settings]').click()
    })

    expect(save.mock.calls[0]?.[0]).toMatchObject({ journeyOrderMode: 'newest' })
  })

  it('draws the three toggles SCREENS.md §2.6 names, each at the value the book holds', () => {
    const host = renderCard({ showRibbon: false })
    const boxes = [...host.querySelectorAll<HTMLInputElement>('[data-toggle] input')]

    expect(boxes.map((box) => box.checked)).toEqual([true, false, true])
  })

  it('saves a toggle that was turned off', () => {
    const save = vi.fn()
    const host = renderCard({}, save)

    act(() => {
      one(host, '[data-toggle="showCounter"] input').click()
    })
    act(() => {
      one(host, '[data-save-settings]').click()
    })

    expect(save.mock.calls[0]?.[0]).toMatchObject({ showCounter: false })
  })

  it('saves the contents note as typed, which is the line the diary prints', () => {
    const save = vi.fn()
    const host = renderCard({}, save)
    const note = one(host, '[data-contents-note]')

    if (setTextAreaValue === undefined) throw new Error('this environment has no HTMLTextAreaElement value setter')
    act(() => {
      setTextAreaValue.call(note, 'kept in a drawer, mostly')
      note.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => {
      one(host, '[data-save-settings]').click()
    })

    expect(save.mock.calls[0]?.[0]).toMatchObject({ contentsNote: 'kept in a drawer, mostly' })
  })

  it('saves every one of the card’s own eight values, not only the one that changed', () => {
    // A save that posted a partial object would be refused by the parse, on a
    // screen that draws no error at all (docs/deviations.md §60).
    const save = vi.fn()
    const host = renderCard({}, save)

    act(() => {
      one(host, '[data-save-settings]').click()
    })

    expect(save.mock.calls[0]?.[0]).toEqual(SEEDED)
  })
})
