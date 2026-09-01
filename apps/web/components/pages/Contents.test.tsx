/**
 * Contents.test.tsx — what the index prints, and what the column count
 * changes about it.
 *
 * jsdom performs no layout, so nothing here asserts a measurement — the
 * index's absolute geometry is guarded by `e2e/visual.spec.ts`'s baselines and
 * its overflow behaviour by `e2e/pages.spec.ts` in a real browser. What IS
 * testable without layout is every decision the component makes: the track
 * lists it writes from `contentsLayout`, the anchors it builds, and the two
 * things multi-column mode changes about a row's CONTENT — the compact name
 * class, and the meta line disappearing outright.
 *
 * The multi-column cases build their entries by hand rather than by seeding
 * twelve journeys: this file is about what the component does with a given
 * entry count, and `deriveContents`'s own suite already covers turning
 * journeys into entries.
 * Depends on: react, react-dom/client, @travel-diary/domain, vitest (jsdom).
 */
import type { ContentsEntry } from '@travel-diary/domain/bookBundle'
import { journeyId, type JourneyId } from '@travel-diary/domain/ids'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { Contents } from './Contents'

/** Brands a test journey id, so no two entries in one index are the same journey (CLAUDE.md §7). */
const anId = (raw: string): JourneyId => {
  const branded = journeyId(raw)
  if (!branded.ok) throw new Error(branded.error)
  return branded.value
}

/** One index entry, numbered as `deriveContents` would number it. */
const anEntry = (position: number): ContentsEntry => ({
  journeyId: anId(`journey-${String(position)}`),
  slug: `journey-${String(position)}`,
  name: `Journey ${String(position)}`,
  place: 'Somewhere',
  dates: '3–9 Mar 2025',
  pageNumber: 3 + position * 3,
})

/** An index of `count` entries. */
const anIndex = (count: number): readonly ContentsEntry[] => Array.from({ length: count }, (_, i) => anEntry(i))

const NOTE = 'Each journey runs three pages — notes, then two spreads of frames.'

const roots: Root[] = []

/** Renders the index and hands back the host element. */
const renderContents = (
  entries: readonly ContentsEntry[],
  { note = NOTE, totalPages = 33 }: { note?: string; totalPages?: number } = {},
): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(<Contents entries={entries} note={note} totalPages={totalPages} />)
  })
  return host
}

/** The index body, asserted present so no test needs a non-null assertion. */
const bodyOf = (host: HTMLElement): HTMLElement => {
  const body = host.querySelector<HTMLElement>('[data-contents-body]')
  if (body === null) throw new Error('the contents page rendered no body')
  return body
}

afterEach(() => {
  for (const root of roots) {
    act(() => {
      root.unmount()
    })
  }
  roots.length = 0
  document.body.innerHTML = ''
})

describe('Contents', () => {
  it('prints "Contents" as the page’s level-one heading', () => {
    const host = renderContents(anIndex(3))

    expect(host.querySelector('h1')?.textContent).toBe('Contents')
  })

  it('prints the "Index" eyebrow the handoff words', () => {
    const host = renderContents(anIndex(3))

    expect(host.textContent).toContain('Index')
  })

  it('prints the header note from the book global', () => {
    const host = renderContents(anIndex(3), { note: NOTE })

    expect(host.textContent).toContain(NOTE)
  })

  it('omits the header note rather than printing an empty line when an editor clears it', () => {
    const host = renderContents(anIndex(3), { note: '' })

    expect(host.querySelector('header')?.querySelectorAll('p')).toHaveLength(1)
  })

  it('tallies the book’s pages in the footer, not the index’s entries', () => {
    const host = renderContents(anIndex(3), { totalPages: 33 })

    expect(host.querySelector('footer')?.textContent).toContain('33 pages so far')
  })

  it('prints the footer hint exactly as the handoff words it', () => {
    const host = renderContents(anIndex(3))

    expect(host.textContent).toContain('Tabs on the right jump anywhere · arrows or the page edge turn a leaf')
  })

  it('links every row to the page its journey starts on', () => {
    const entries = anIndex(3)
    const host = renderContents(entries)

    expect([...host.querySelectorAll('a')].map((link) => link.getAttribute('href'))).toEqual(
      entries.map((entry) => `/p/${String(entry.pageNumber)}`),
    )
  })

  it('numbers the rows from one, zero-padded, in reading order', () => {
    const host = renderContents(anIndex(11))

    expect([...host.querySelectorAll('a')].map((link) => link.firstElementChild?.textContent)).toEqual([
      '01',
      '02',
      '03',
      '04',
      '05',
      '06',
      '07',
      '08',
      '09',
      '10',
      '11',
    ])
  })

  it('writes the single-column track lists the domain derives for eleven entries', () => {
    const body = bodyOf(renderContents(anIndex(11)))

    expect([body.style.gridTemplateColumns, body.style.gridTemplateRows]).toEqual(['repeat(1, 1fr)', 'repeat(11, 1fr)'])
  })

  it('writes the two-column track lists the domain derives for twelve entries', () => {
    const body = bodyOf(renderContents(anIndex(12)))

    expect([body.style.gridTemplateColumns, body.style.gridTemplateRows]).toEqual(['repeat(2, 1fr)', 'repeat(6, 1fr)'])
  })

  it('publishes the column count to the DOM, so a browser test can assert the mode', () => {
    const body = bodyOf(renderContents(anIndex(12)))

    expect(body.getAttribute('data-columns')).toBe('2')
  })

  it('is not compact while the index still fits one column', () => {
    const body = bodyOf(renderContents(anIndex(11)))

    expect(body.getAttribute('data-compact')).toBe('false')
  })

  it('is compact as soon as the index needs a second column', () => {
    const body = bodyOf(renderContents(anIndex(12)))

    expect(body.getAttribute('data-compact')).toBe('true')
  })

  it('shows each entry’s place and dates while the index is single-column', () => {
    const host = renderContents(anIndex(11))

    expect(host.textContent).toContain('Somewhere · 3–9 Mar 2025')
  })

  it('hides the meta line in multi-column mode by not rendering it at all', () => {
    // SCREENS.md §1.2 hides it; not rendering it means there is no element for
    // a screen reader to find either, which `display: none` would not achieve
    // as clearly.
    const host = renderContents(anIndex(12))

    expect(host.textContent).not.toContain('Somewhere · 3–9 Mar 2025')
  })

  it('uses the full-size name class while the index is single-column', () => {
    const host = renderContents(anIndex(11))

    expect(host.querySelector('a')?.children[1]?.className).toBe('name')
  })

  it('uses the compact name class once the index needs a second column', () => {
    const host = renderContents(anIndex(12))

    expect(host.querySelector('a')?.children[1]?.className).toBe('nameCompact')
  })

  it('hides the dotted leader from the accessibility tree', () => {
    // A leader is a printing convention; read aloud between a journey's name
    // and its page number it is noise.
    const host = renderContents(anIndex(3))

    expect(host.querySelector('a')?.querySelector('[aria-hidden="true"]')?.className).toBe('leader')
  })

  it('renders a valid grid for an index with no entries at all', () => {
    const body = bodyOf(renderContents([]))

    expect([body.style.gridTemplateColumns, body.style.gridTemplateRows]).toEqual(['repeat(1, 1fr)', 'repeat(1, 1fr)'])
  })
})
