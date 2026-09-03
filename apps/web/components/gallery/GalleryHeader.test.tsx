/**
 * GalleryHeader.test.tsx — what the bar above the grid prints, and where its
 * back control points.
 *
 * THE BACK CONTROL IS THE CASE THAT MATTERS. The design spec is explicit that
 * "returning from a gallery restores `/p/<n>`, not `/`" - a reader who was on
 * page five and opened that journey's gallery has to get back to page five.
 * The browser's own Back button does it natively (`e2e/routing.spec.ts` has
 * asserted that since Task 13, against `Book.tsx`'s `replaceState`); this is
 * the gallery's own control, which is a link and therefore needs an `href`.
 * That `href` is SERVER-RENDERED, resolved by the route from the `from`
 * parameter the diary's own gallery links carry - not from the `Referer`
 * header (a document that varied by it could not be served from a CDN;
 * SECURITY.md, Public site) and not from `document.referrer` after mount,
 * which was built and failed in a real browser: a reader who clicked before
 * hydration landed on the cover.
 *
 * The copy is asserted verbatim against the prototype's own gallery header
 * (`handoff/design_handoff_travel_diary/Travel Diary.dc.html`, the
 * `showGallery` block): "Back to the diary", "Full gallery", the
 * `{place} · {dates}` line beside the title, and `{n} photos · {m} clips`.
 * SCREENS.md §1.8 gives the sizes; the prototype gives the words.
 * Depends on: react, react-dom/client, @travel-diary/domain, vitest (jsdom).
 */
import type { GalleryJourney } from '@travel-diary/domain/gallery'
import { aGalleryBundle } from '@travel-diary/domain/testing/factories'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { GalleryHeader } from './GalleryHeader'

const roots: Root[] = []

/**
 * Renders the header and hands back the host element.
 * @param counts - How many photographs and clips the gallery holds.
 * @param journey - Fields to override on the seeded Tokyo journey.
 * @param returnTo - Where the back control leads, as the route resolved it.
 * @returns The host element the header was rendered into.
 */
const renderHeader = (
  counts: { readonly photographs: number; readonly clips: number } = { photographs: 61, clips: 0 },
  journey: Partial<GalleryJourney> = {},
  returnTo = '/p/9',
): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(
      <GalleryHeader journey={{ ...aGalleryBundle().journey, ...journey }} counts={counts} returnTo={returnTo} />,
    )
  })
  return host
}

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount()
  })
  document.body.replaceChildren()
})

describe('GalleryHeader', () => {
  it('is a banner, so the grid below it is not the first landmark on the route', () => {
    expect(renderHeader().querySelector('header')).not.toBeNull()
  })

  it('names the view above the title', () => {
    expect(renderHeader().querySelector('[data-eyebrow]')?.textContent).toBe('Full gallery')
  })

  it('titles the gallery for its journey, as the route’s only level-one heading', () => {
    const host = renderHeader()

    expect(host.querySelectorAll('h1')).toHaveLength(1)
    expect(host.querySelector('h1')?.textContent).toContain('Tokyo')
  })

  it('prints the place and the date range beside the title', () => {
    expect(renderHeader().querySelector('[data-gallery-meta]')?.textContent).toBe('Japan · 4 - 13 Apr 2024')
  })

  it('prints the date range alone for a journey with no place recorded', () => {
    expect(renderHeader({ photographs: 61, clips: 0 }, { place: '' }).querySelector('[data-gallery-meta]')?.textContent)
      .toBe('4 - 13 Apr 2024')
  })

  it('counts the frames the gallery holds, as the prototype’s own header does', () => {
    expect(renderHeader({ photographs: 61, clips: 4 }).querySelector('[data-gallery-count]')?.textContent).toBe(
      '61 photos · 4 clips',
    )
  })

  it('counts a single photograph in the singular', () => {
    expect(renderHeader({ photographs: 1, clips: 1 }).querySelector('[data-gallery-count]')?.textContent).toBe(
      '1 photo · 1 clip',
    )
  })

  it('points the way back at the page the route resolved, not at the cover', () => {
    // Server-rendered, so it is right in the first HTML a reader or a crawler
    // receives - there is no effect to wait for. `returningPagePath`'s own
    // suite covers what happens when the route could not resolve a page.
    expect(renderHeader().querySelector('[data-back-to-book]')?.getAttribute('href')).toBe('/p/9')
  })

  it('is a real link rather than a handler, so the address is visible before it is followed', () => {
    expect(renderHeader().querySelector('[data-back-to-book]')?.tagName).toBe('A')
  })

  it('says where it goes', () => {
    expect(renderHeader().querySelector('[data-back-to-book]')?.textContent).toContain('Back to the diary')
  })
})
