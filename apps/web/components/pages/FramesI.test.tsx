/**
 * FramesI.test.tsx — what a journey's first frames page prints, and where it
 * puts it.
 *
 * jsdom performs no layout, so nothing here asserts a measurement — the
 * page's absolute geometry, its three authored rotations and the focal
 * point's effect on the rendered crop are guarded in a real browser by
 * `e2e/frames.spec.ts`, and its appearance by the visual baselines in
 * `e2e/visual.spec.ts`. What IS testable without layout is every decision the
 * component makes: which slot lands in which cell, what happens when a
 * journey has fewer than three, whether the decorations flag is honoured, and
 * whether the focal point and the image window reach the DOM at all.
 *
 * IT COVERS `PhotoMount` AND `WashiTape` THROUGH THE PAGE rather than in two
 * further files, for the reason `Notes.test.tsx`'s header gives about its own
 * four sub-components: every branch either of them has — a captioned and an
 * uncaptioned slot, a mount with a washi strip and one without, the strip
 * drawn and switched off — is reachable from this page's own props, and
 * separate files would assert the same lines twice while letting the page and
 * its parts drift apart.
 *
 * The copy is asserted verbatim, not by regex. SCREENS.md's copy is final
 * (CLAUDE.md §9, Pass 3), and a test that matched "Frames 01 – 03" loosely
 * would let a hyphen through where the design has a spaced en dash.
 * Depends on: react, react-dom/client, @travel-diary/domain, vitest (jsdom).
 */
import type { Journey, JourneyPage, Slot } from '@travel-diary/domain/bookBundle'
import { derivePages } from '@travel-diary/domain/bookBundle'
import { aJourney } from '@travel-diary/domain/testing/factories'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFERRED_PHOTOGRAPH_SRC } from './deferredPhotograph'
import { FramesI } from './FramesI'
import { ImageWindow } from './Photograph'

const roots: Root[] = []

/**
 * A frame slot fixture, overridable per field. `role` is `'frame'` for every
 * slot on this page, which is exactly why the page finds them by position
 * rather than by role — see `FramesI.tsx`'s header.
 * @param label - Distinguishes one fixture from another in an assertion.
 * @param overrides - Fields to override on the default slot.
 * @returns A fresh frame slot.
 */
const aFrameSlot = (label: string, overrides: Partial<Slot> = {}): Slot => ({
  role: 'frame',
  src: `/api/media/file/tokyo-${label}-800x800.png`,
  alt: `TOKYO ${label.toUpperCase()}`,
  caption: `Caption for ${label}`,
  focalX: 50,
  focalY: 50,
  ...overrides,
})

/**
 * Builds the frames-i page a journey derives, so the fixture goes through the
 * same `derivePages` the diary does rather than being hand-assembled into a
 * shape the domain might never produce.
 * @param slots - The page's resolved slots, or `undefined` for a page with none.
 * @param journey - Fields to override on the default journey.
 * @returns The journey's first frames page.
 */
const aFramesIPage = (slots?: readonly Slot[], journey: Partial<Journey> = {}): JourneyPage => {
  const page = derivePages([aJourney(journey)]).find((candidate) => candidate.kind === 'frames-i')
  if (page === undefined || page.kind !== 'frames-i') throw new Error('derivePages produced no frames-i page')
  return slots === undefined ? page : { ...page, slots }
}

/** The three slots the seeded book gives every Frames I page. */
const threeSlots = (): readonly Slot[] => [aFrameSlot('a1'), aFrameSlot('a2'), aFrameSlot('a3')]

/**
 * Renders the page on leaf 0 and hands back the host element, with the image
 * window published the way `Book.tsx` publishes it.
 * @param page - The journey's frames page.
 * @param showDecorations - The book global's decorations flag.
 * @param loadsImages - Whether the window admits the leaf this page is on.
 * @returns The host element the page was rendered into.
 */
const renderFramesI = (page: JourneyPage, showDecorations = true, loadsImages = true): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(
      <ImageWindow value={[loadsImages]}>
        <FramesI page={page} showDecorations={showDecorations} leafIndex={0} />
      </ImageWindow>,
    )
  })
  return host
}

/** The `src` of the photograph in a named cell, or `'no mount'` when the cell is empty. */
const sourceIn = (host: HTMLElement, handle: string): string =>
  host.querySelector(`[data-mount="${handle}"] img`)?.getAttribute('src') ?? 'no mount'

afterEach(() => {
  for (const root of roots) {
    act(() => {
      root.unmount()
    })
  }
  roots.length = 0
  document.body.innerHTML = ''
})

describe('FramesI — the header', () => {
  it('prints the journey name as the page’s level-one heading', () => {
    const host = renderFramesI(aFramesIPage(threeSlots(), { name: 'Lisbon' }))

    expect(host.querySelector('h1')?.textContent).toBe('Lisbon')
  })

  it('prints the frame range this page covers, verbatim', () => {
    const host = renderFramesI(aFramesIPage(threeSlots()))

    expect(host.textContent).toContain('Frames 01 – 03')
  })

  it('prints the journey’s dates beside the frame range', () => {
    const host = renderFramesI(aFramesIPage(threeSlots(), { dates: '3 – 14 September 2025' }))

    expect(host.textContent).toContain('3 – 14 September 2025')
  })

  it('omits the dates line rather than printing an empty one when an editor has cleared it', () => {
    const host = renderFramesI(aFramesIPage(threeSlots(), { dates: '' }))

    // `journeys.dates` is not `required: true`, so this is an ordinary state.
    expect(host.querySelectorAll('header p')).toHaveLength(1)
  })

  it('prints the frame range even on a journey with no photographs at all', () => {
    // The eyebrow names the page, not the slots on it: this is always frames
    // one to three of the journey's seven.
    const host = renderFramesI(aFramesIPage([]))

    expect(host.textContent).toContain('Frames 01 – 03')
  })
})

describe('FramesI — the three cells', () => {
  it('puts the page’s slots in the design’s cells, in the order the editor arranged them', () => {
    const host = renderFramesI(aFramesIPage(threeSlots()))

    expect([sourceIn(host, 'p1'), sourceIn(host, 'p2'), sourceIn(host, 'p3')]).toEqual([
      aFrameSlot('a1').src,
      aFrameSlot('a2').src,
      aFrameSlot('a3').src,
    ])
  })

  it('leaves a cell empty rather than promoting its neighbour when a journey has two frames', () => {
    // `pages.slots` has no minimum length, so this is an ordinary editorial
    // state - and the grid's tracks are fixed, so the two that exist must
    // stay where the design put them.
    const host = renderFramesI(aFramesIPage([aFrameSlot('a1'), aFrameSlot('a2')]))

    expect([sourceIn(host, 'p1'), sourceIn(host, 'p2'), sourceIn(host, 'p3')]).toEqual([
      aFrameSlot('a1').src,
      aFrameSlot('a2').src,
      'no mount',
    ])
  })

  it('renders no mounts at all on a journey whose frames have not been uploaded', () => {
    const host = renderFramesI(aFramesIPage([]))

    expect(host.querySelectorAll('[data-mount]')).toHaveLength(0)
  })

  it('drops a fourth slot, which SCREENS.md §1.4 designs no cell for', () => {
    const host = renderFramesI(aFramesIPage([...threeSlots(), aFrameSlot('a4')]))

    expect(host.querySelectorAll('[data-mount]')).toHaveLength(3)
    expect(host.textContent).not.toContain('Caption for a4')
  })

  it('renders each slot’s page without slots resolved at all, rather than throwing', () => {
    // `JourneyPageInfo.slots` is optional: `derivePages` cannot populate it,
    // and `readBookBundle` leaves it absent when no `pages` row matched.
    const host = renderFramesI(aFramesIPage())

    expect(host.querySelectorAll('[data-mount]')).toHaveLength(0)
  })
})

describe('FramesI — each photograph', () => {
  it('applies the slot’s focal point as the photograph’s object-position', () => {
    // Without this the admin's focal-point picker is decorative — SCREENS.md
    // says so in those words. That the crop actually MOVES is proved in a
    // browser by `e2e/frames.spec.ts`; what is asserted here is that the
    // slot's own value reaches the DOM rather than a default.
    const host = renderFramesI(aFramesIPage([aFrameSlot('a1', { focalX: 22, focalY: 78 })]))

    expect(host.querySelector<HTMLElement>('[data-mount="p1"] img')?.style.objectPosition).toBe('22% 78%')
  })

  it('carries the slot’s own alt text, so a photograph is described rather than skipped', () => {
    const host = renderFramesI(aFramesIPage([aFrameSlot('a1', { alt: 'A vending machine at 6am' })]))

    expect(host.querySelector('[data-mount="p1"] img')?.getAttribute('alt')).toBe('A vending machine at 6am')
  })

  it('prints the slot’s caption under its photograph', () => {
    const host = renderFramesI(aFramesIPage([aFrameSlot('a1', { caption: 'The cat that runs the bookshop' })]))

    expect(host.querySelector('[data-mount="p1"] figcaption')?.textContent).toBe('The cat that runs the bookshop')
  })

  it('omits the figcaption entirely rather than printing an empty one', () => {
    const host = renderFramesI(aFramesIPage([aFrameSlot('a1', { caption: '' })]))

    expect(host.querySelectorAll('[data-mount="p1"] figcaption')).toHaveLength(0)
  })

  it('publishes no data-hero handle, since no photograph on this page is a hero', () => {
    // `[data-hero]` is the handle the browser and visual gates use for the ONE
    // photograph on a page with a subject. Seven frames answering it would
    // make every one of those assertions ambiguous.
    const host = renderFramesI(aFramesIPage(threeSlots()))

    expect(host.querySelectorAll('[data-hero]')).toHaveLength(0)
  })
})

describe('FramesI — the image window', () => {
  it('withholds every photograph’s bytes while its leaf is outside the window', () => {
    const host = renderFramesI(aFramesIPage(threeSlots()), true, false)

    expect([sourceIn(host, 'p1'), sourceIn(host, 'p2'), sourceIn(host, 'p3')]).toEqual([
      DEFERRED_PHOTOGRAPH_SRC,
      DEFERRED_PHOTOGRAPH_SRC,
      DEFERRED_PHOTOGRAPH_SRC,
    ])
  })

  it('keeps every photograph’s markup while its leaf is outside the window', () => {
    // The design spec's §8 requires the server to render every page's content
    // so the deep links are indexable. It is the BYTES that are deferred.
    const host = renderFramesI(aFramesIPage([aFrameSlot('a1', { focalX: 22, focalY: 78 })]), true, false)
    const photograph = host.querySelector<HTMLElement>('[data-mount="p1"] img')

    expect(photograph?.getAttribute('alt')).toBe('TOKYO A1')
    expect(photograph?.style.objectPosition).toBe('22% 78%')
    expect(host.querySelector('[data-mount="p1"] figcaption')?.textContent).toBe('Caption for a1')
  })
})

describe('FramesI — the decorations flag', () => {
  it('tapes one washi strip to the first mount, which is the only one the design gives one', () => {
    const host = renderFramesI(aFramesIPage(threeSlots()))

    const strips = [...host.querySelectorAll('[data-decoration="washi"]')]
    expect(strips).toHaveLength(1)
    expect(host.querySelector('[data-mount="p1"]')?.contains(strips[0] ?? host)).toBe(true)
  })

  it('draws no washi strip at all when the book global switches decorations off', () => {
    const host = renderFramesI(aFramesIPage(threeSlots()), false)

    expect(host.querySelectorAll('[data-decoration="washi"]')).toHaveLength(0)
  })

  it('hides the washi strip from assistive technology, since it is tape', () => {
    const host = renderFramesI(aFramesIPage(threeSlots()))

    expect(host.querySelector('[data-decoration="washi"]')?.getAttribute('aria-hidden')).toBe('true')
  })
})
