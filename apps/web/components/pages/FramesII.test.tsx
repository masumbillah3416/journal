/**
 * FramesII.test.tsx — what a journey's second frames page prints, and where
 * it puts it.
 *
 * jsdom performs no layout, so nothing here asserts a measurement — the
 * page's absolute geometry, its four authored rotations and the focal point's
 * effect on the rendered crop are guarded in a real browser by
 * `e2e/frames.spec.ts`, and its appearance by the visual baselines in
 * `e2e/visual.spec.ts`.
 *
 * IT DELIBERATELY DOES NOT REPEAT `FramesI.test.tsx`. The two pages share
 * `PhotoMount`, `WashiTape`, the header pattern and the slot-by-position
 * rule, and every one of those is exercised there; asserting them twice would
 * make this file a copy that has to be edited whenever that one is. What is
 * here is what is DIFFERENT about this page: a fourth cell, a washi strip on
 * the third mount rather than the first, and the footer Frames I does not
 * have — the gallery link, the derived count and the closing line.
 *
 * The copy is asserted verbatim, not by regex. SCREENS.md's copy is final
 * (CLAUDE.md §9, Pass 3).
 * Depends on: react, react-dom/client, @travel-diary/domain, vitest (jsdom).
 */
import type { Journey, JourneyPage, Slot } from '@travel-diary/domain/bookBundle'
import { derivePages } from '@travel-diary/domain/bookBundle'
import { aJourney } from '@travel-diary/domain/testing/factories'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFERRED_PHOTOGRAPH_SRC } from './deferredPhotograph'
import { FramesII } from './FramesII'
import { ImageWindow } from './Photograph'

const roots: Root[] = []

/**
 * A frame slot fixture, overridable per field.
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
 * Builds the frames-ii page a journey derives, so the fixture goes through
 * the same `derivePages` the diary does.
 * @param slots - The page's resolved slots, or `undefined` for a page with none.
 * @param journey - Fields to override on the default journey.
 * @returns The journey's second frames page.
 */
const aFramesIIPage = (slots?: readonly Slot[], journey: Partial<Journey> = {}): JourneyPage => {
  const page = derivePages([aJourney(journey)]).find((candidate) => candidate.kind === 'frames-ii')
  if (page === undefined || page.kind !== 'frames-ii') throw new Error('derivePages produced no frames-ii page')
  return slots === undefined ? page : { ...page, slots }
}

/** The four slots the seeded book gives every Frames II page. */
const fourSlots = (): readonly Slot[] => [aFrameSlot('b1'), aFrameSlot('b2'), aFrameSlot('b3'), aFrameSlot('b4')]

/**
 * Renders the page on leaf 0 and hands back the host element, with the image
 * window published the way `Book.tsx` publishes it.
 * @param page - The journey's frames page.
 * @param showDecorations - The book global's decorations flag.
 * @param loadsImages - Whether the window admits the leaf this page is on.
 * @returns The host element the page was rendered into.
 */
const renderFramesII = (page: JourneyPage, showDecorations = true, loadsImages = true): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(
      <ImageWindow value={[loadsImages]}>
        <FramesII page={page} showDecorations={showDecorations} leafIndex={0} />
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

describe('FramesII — the header', () => {
  it('prints the frame range this page covers, which is the second half of the journey’s seven', () => {
    const host = renderFramesII(aFramesIIPage(fourSlots()))

    expect(host.textContent).toContain('Frames 04 – 07')
  })

  it('prints the journey’s place on the right, where Frames I prints its dates', () => {
    const host = renderFramesII(aFramesIIPage(fourSlots(), { place: 'Portugal', dates: '3 – 14 September 2025' }))

    expect(host.querySelector('header')?.textContent).toContain('Portugal')
    expect(host.querySelector('header')?.textContent).not.toContain('3 – 14 September 2025')
  })

  it('omits the place line rather than printing an empty one when an editor has cleared it', () => {
    const host = renderFramesII(aFramesIIPage(fourSlots(), { place: '' }))

    expect(host.querySelectorAll('header p')).toHaveLength(1)
  })
})

describe('FramesII — the four cells', () => {
  it('puts the page’s slots in the design’s cells, in the order the editor arranged them', () => {
    const host = renderFramesII(aFramesIIPage(fourSlots()))

    expect([sourceIn(host, 'p1'), sourceIn(host, 'p2'), sourceIn(host, 'p3'), sourceIn(host, 'p4')]).toEqual([
      aFrameSlot('b1').src,
      aFrameSlot('b2').src,
      aFrameSlot('b3').src,
      aFrameSlot('b4').src,
    ])
  })

  it('leaves the fourth cell empty rather than promoting a neighbour when a journey has three frames', () => {
    const host = renderFramesII(aFramesIIPage([aFrameSlot('b1'), aFrameSlot('b2'), aFrameSlot('b3')]))

    expect(sourceIn(host, 'p4')).toBe('no mount')
  })

  it('drops a fifth slot, which SCREENS.md §1.5 designs no cell for', () => {
    const host = renderFramesII(aFramesIIPage([...fourSlots(), aFrameSlot('b5')]))

    expect(host.querySelectorAll('[data-mount]')).toHaveLength(4)
  })

  it('withholds every photograph’s bytes while its leaf is outside the image window', () => {
    const host = renderFramesII(aFramesIIPage(fourSlots()), true, false)

    expect([...host.querySelectorAll('img')].map((image) => image.getAttribute('src'))).toEqual([
      DEFERRED_PHOTOGRAPH_SRC,
      DEFERRED_PHOTOGRAPH_SRC,
      DEFERRED_PHOTOGRAPH_SRC,
      DEFERRED_PHOTOGRAPH_SRC,
    ])
  })

  it('applies each slot’s own focal point rather than one page-wide value', () => {
    const host = renderFramesII(
      aFramesIIPage([
        aFrameSlot('b1'),
        aFrameSlot('b2'),
        aFrameSlot('b3', { focalX: 80, focalY: 24 }),
        aFrameSlot('b4'),
      ]),
    )

    expect([...host.querySelectorAll<HTMLElement>('img')].map((image) => image.style.objectPosition)).toEqual([
      '50% 50%',
      '50% 50%',
      '80% 24%',
      '50% 50%',
    ])
  })
})

describe('FramesII — the decorations flag', () => {
  it('tapes its one washi strip to the THIRD mount, not the first', () => {
    // SCREENS.md §1.5 puts the strip on P3; §1.4 puts Frames I's on P1. A
    // shared component that hard-coded the position would put both on the
    // same mount and look almost right.
    const host = renderFramesII(aFramesIIPage(fourSlots()))

    const strips = [...host.querySelectorAll('[data-decoration="washi"]')]
    expect(strips).toHaveLength(1)
    expect(host.querySelector('[data-mount="p3"]')?.contains(strips[0] ?? host)).toBe(true)
  })

  it('draws no washi strip at all when the book global switches decorations off', () => {
    const host = renderFramesII(aFramesIIPage(fourSlots()), false)

    expect(host.querySelectorAll('[data-decoration="washi"]')).toHaveLength(0)
  })
})

describe('FramesII — the footer', () => {
  it('links the gallery button to the journey’s own gallery path', () => {
    const host = renderFramesII(aFramesIIPage(fourSlots(), { slug: 'lisbon' }))

    // As `Notes.test.tsx`: the page's own number rides along.
    expect(host.querySelector('footer a')?.getAttribute('href')).toBe('/gallery/lisbon?from=1')
  })

  it('prints the journey’s derived gallery census, not a stored total', () => {
    const host = renderFramesII(aFramesIIPage(fourSlots(), { gallery: { photographs: 61, clips: 4 } }))

    expect(host.querySelector('footer')?.textContent).toContain('61 photographs and 4 clips in the gallery')
  })

  it('prints the closing line verbatim', () => {
    const host = renderFramesII(aFramesIIPage(fourSlots()))

    expect(host.querySelector('footer')?.textContent).toContain('Only a few frames live in the book')
  })

  it('keeps the footer’s arrow glyph out of the accessibility tree, since the link already reads', () => {
    const host = renderFramesII(aFramesIIPage(fourSlots()))

    expect(host.querySelector('footer a span')?.getAttribute('aria-hidden')).toBe('true')
  })
})
