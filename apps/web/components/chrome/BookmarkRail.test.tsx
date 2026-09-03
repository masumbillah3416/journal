/**
 * BookmarkRail.test.tsx — which tab the rail marks as the reader's, and what
 * it prints on each one.
 *
 * The rail's geometry (158px, the 6px tint bar, the `translateX(-6px)` lift,
 * the hidden scrollbar) is CSS and belongs to a real layout engine —
 * `e2e/chrome.spec.ts` measures it there, because jsdom performs no layout
 * and would happily report a tab drawn nowhere as correct. What is asserted
 * here is what jsdom CAN see and what a browser test would be a slow way to
 * check: that the active tab is the one whose span holds the reader's page
 * (SCREENS.md §1.7's `[start, start+3)` rule, seen from the component that
 * draws it), that the two printed lines are the ones `deriveRail` derived,
 * that the landmark is named by its own visible eyebrow, and that a click
 * asks for the page the tab opens.
 *
 * The rail is built from `deriveRail` rather than from hand-written tabs, so
 * these cases exercise the seam the route actually ships — a rail whose spans
 * came from anywhere other than `deriveBookmarks` is the defect this task
 * exists to close (docs/qa/2026-09-01-diary-sweep.md, DIARY-005).
 * Depends on: react, react-dom/client, @travel-diary/domain, vitest (jsdom).
 */
import { deriveBookmarks, derivePages, deriveRail, type RailTab } from '@travel-diary/domain/bookBundle'
import { aJourney } from '@travel-diary/domain/testing/factories'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { BookmarkRail } from './BookmarkRail'

const roots: Root[] = []

/** A two-journey rail: Cover 0, Contents 1, Tokyo 2-4, Lisbon 5-7, About 8. */
const aRail = (): readonly RailTab[] => {
  const pages = derivePages([
    aJourney({ slug: 'tokyo', name: 'Tokyo', dates: '12 – 24 March 2025' }),
    aJourney({ slug: 'lisbon', name: 'Lisbon', dates: '3 – 14 September 2025' }),
  ])
  return deriveRail(pages, deriveBookmarks(pages))
}

/** Renders the rail on a given page, and hands back the host plus the jumps it asked for. */
const renderRail = (
  pageIndex: number,
  tabs: readonly RailTab[] = aRail(),
): { readonly host: HTMLElement; readonly jumps: () => number[] } => {
  const jumps: number[] = []
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(
      <BookmarkRail
        tabs={tabs}
        pageIndex={pageIndex}
        onJump={(startIndex) => {
          jumps.push(startIndex)
        }}
      />,
    )
  })
  return { host, jumps: () => jumps }
}

/** One element, asserted present so no test needs a non-null assertion (CLAUDE.md §3.1). */
const one = (host: HTMLElement, selector: string): HTMLElement => {
  const found = host.querySelector<HTMLElement>(selector)
  if (found === null) throw new Error(`the rail rendered no ${selector}`)
  return found
}

/** The `data-bookmark` value of whichever tab the rail marks as the reader's, or `'none'`. */
const activeTab = (host: HTMLElement): string =>
  host.querySelector('[data-bookmark][aria-current="page"]')?.getAttribute('data-bookmark') ?? 'none'

afterEach(() => {
  for (const root of roots) {
    act(() => {
      root.unmount()
    })
  }
  roots.length = 0
  document.body.innerHTML = ''
})

describe('BookmarkRail', () => {
  it('renders one tab for every tab in the rail it was handed', () => {
    const { host } = renderRail(0)

    expect(host.querySelectorAll('[data-bookmark]')).toHaveLength(aRail().length)
  })

  it('prints the eyebrow the handoff puts above the column', () => {
    const { host } = renderRail(0)

    expect(one(host, '[data-rail-eyebrow]').textContent).toBe('Bookmarks')
  })

  it('names the navigation landmark with that same visible eyebrow', () => {
    // Rather than an `aria-label` repeating the word: the eyebrow is already
    // on the screen, so it is the name a screen reader should read.
    const { host } = renderRail(0)

    expect(one(host, 'nav').getAttribute('aria-labelledby')).toBe(one(host, '[data-rail-eyebrow]').id)
  })

  it('prints each tab’s name and its sub, rather than one combined label', () => {
    const { host } = renderRail(2)

    const tokyo = one(host, '[data-bookmark="2"]')
    expect([one(tokyo, '[data-tab-name]').textContent, one(tokyo, '[data-tab-sub]').textContent]).toEqual([
      'Tokyo',
      'March 2025',
    ])
  })

  // SCREENS.md §1.7's spanning rule, from the reader's side: one journey tab
  // stays lit across all three of its pages and hands over on the fourth. The
  // sweep found no tab marked active on any page at all (DIARY-005).

  it('marks a journey’s tab as the reader’s on its notes page', () => {
    expect(activeTab(renderRail(2).host)).toBe('2')
  })

  it('keeps the same tab marked on the journey’s first frames page', () => {
    expect(activeTab(renderRail(3).host)).toBe('2')
  })

  it('keeps the same tab marked on the journey’s second frames page', () => {
    expect(activeTab(renderRail(4).host)).toBe('2')
  })

  it('hands the mark to the next journey’s tab on the page after the span ends', () => {
    expect(activeTab(renderRail(5).host)).toBe('5')
  })

  it('marks the cover’s own tab while the reader is on the cover', () => {
    expect(activeTab(renderRail(0).host)).toBe('0')
  })

  it('marks exactly one tab, never two', () => {
    const { host } = renderRail(3)

    expect(host.querySelectorAll('[aria-current="page"]')).toHaveLength(1)
  })

  it('marks no tab at all on a page no tab covers', () => {
    // A journey flagged `hiddenFromBookmarks` keeps its pages and loses its
    // tab, so the reader can be on a page the rail does not cover.
    const pages = derivePages([aJourney({ slug: 'tokyo', name: 'Tokyo', hiddenFromBookmarks: true })])

    expect(activeTab(renderRail(3, deriveRail(pages, deriveBookmarks(pages))).host)).toBe('none')
  })

  it('asks the book for the page a tab opens when the reader clicks it', () => {
    const { host, jumps } = renderRail(0)

    act(() => {
      one(host, '[data-bookmark="5"]').click()
    })

    expect(jumps()).toEqual([5])
  })

  it('tints a journey’s bar with that journey’s own accent', () => {
    const { host } = renderRail(0)

    expect(one(host, '[data-bookmark="2"] [data-tab-tint]').style.background).toBe('rgb(61, 129, 126)')
  })

  it('leaves a book-wide tab’s bar untinted, so the rail paints its own default', () => {
    const { host } = renderRail(0)

    expect(one(host, '[data-bookmark="0"] [data-tab-tint]').style.background).toBe('')
  })

  it('draws every tab as a real button, so a keyboard reader reaches the whole rail', () => {
    const { host } = renderRail(0)

    expect([...host.querySelectorAll('[data-bookmark]')].map((tab) => tab.tagName)).toEqual(aRail().map(() => 'BUTTON'))
  })

  it('draws the column as a list, so a screen reader announces how many bookmarks there are', () => {
    const { host } = renderRail(0)

    expect(host.querySelectorAll('ul > li > [data-bookmark]')).toHaveLength(aRail().length)
  })
})
